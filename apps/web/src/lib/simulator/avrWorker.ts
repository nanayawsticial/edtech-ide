/// <reference lib="webworker" />

import {
  CPU,
  avrInstruction,
  AVRIOPort,
  AVRADC,
  AVRTimer,
  AVRUSART,
  AVRTWI,
  AVRSPI,
  PinState,
  adcConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  spiConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  twiConfig,
  usart0Config,
} from 'avr8js';
import { assemble } from 'avr8js/dist/esm/utils/assembler';

import type { PinElectricalState, SimulationBusEvent, SimulationSerialConfig } from './simulationTypes';
import { LCD_I2C_ADDRESSES, LcdI2cDecoder } from './lcdI2cDecoder';
import { Ws2812Decoder, ws2812FrameToColors } from './ws2812Decoder';
import { PwmTracker } from './pwmTracker';

type InboundMessage =
  | { type: 'run'; hex: string }
  | { type: 'assemble'; asm: string }
  | { type: 'stop' }
  | { type: 'reset' }
  | { type: 'set-digital-input'; pin: string; high: boolean }
  | { type: 'set-analog-input'; pin: string; value: number }
  | { type: 'serial-input'; text: string };

type OutboundMessage =
  | { type: 'ready' }
  | { type: 'pin-change'; pin: string; high: boolean; cycle: number; electricalState: PinElectricalState }
  | { type: 'pin-state'; pin: string; cycle: number; electricalState: PinElectricalState }
  | { type: 'serial-line'; value: string; cycle: number }
  | { type: 'serial-byte'; value: number; direction: 'tx' | 'rx'; cycle: number }
  | { type: 'serial-config'; config: SimulationSerialConfig }
  | { type: 'bus-event'; event: SimulationBusEvent }
  | { type: 'neopixel-frame'; pin: string; colors: string[]; cycle: number }
  | { type: 'lcd-state'; address: number; lines: [string, string]; backlight: boolean; displayOn: boolean }
  | { type: 'pwm-duty'; pin: string; duty: number | null }
  | { type: 'error'; message: string };

const FLASH_SIZE = 0x8000;
const CPU_FREQUENCY = 16_000_000;
let loopId: ReturnType<typeof setInterval> | null = null;
let portB: AVRIOPort | null = null;
let portC: AVRIOPort | null = null;
let portD: AVRIOPort | null = null;
let adc: AVRADC | null = null;
let usart: AVRUSART | null = null;
let spi: AVRSPI | null = null;
let twi: AVRTWI | null = null;
let activeCpu: CPU | null = null;
const pendingDigitalInputs = new Map<string, boolean>();
const pendingAnalogInputs = new Map<string, number>();
const pendingSerialInput: number[] = [];
/** NeoPixel decoders, one per pin that has carried WS2812 pulses. */
const ws2812Decoders = new Map<string, { decoder: Ws2812Decoder; port: AVRIOPort; index: number }>();
/** Character LCD decoders, one per I2C address the sketch writes to (0x27, 0x3F). */
const lcdDecoders = new Map<number, LcdI2cDecoder>();
/** analogWrite duty cycle trackers, one per pin, with the port to report the final level from. */
const pwmTrackers = new Map<string, { tracker: PwmTracker; port: AVRIOPort; index: number }>();

function normalizePinId(pin: string) {
  return pin.trim().toUpperCase();
}

function createEventId(prefix: string, cycle: number) {
  return `${prefix}-${cycle}-${Math.random().toString(36).slice(2, 8)}`;
}

function pinStateToElectricalState(state: PinState): PinElectricalState {
  switch (state) {
    case PinState.High:
      return 'high';
    case PinState.Low:
      return 'low';
    case PinState.InputPullUp:
      return 'pullup';
    case PinState.Input:
    default:
      return 'highZ';
  }
}

function serialParity(): SimulationSerialConfig['parity'] {
  if (!usart?.parityEnabled) {
    return 'none';
  }

  return usart.parityOdd ? 'odd' : 'even';
}

function emitSerialConfig() {
  if (!usart) {
    return;
  }

  self.postMessage({
    type: 'serial-config',
    config: {
      baudRate: usart.baudRate,
      bitsPerChar: usart.bitsPerChar,
      stopBits: usart.stopBits,
      parity: serialParity(),
    },
  } as OutboundMessage);
}

function emitPinSnapshot(cpu: CPU, ioPort: AVRIOPort, pinName: string, index: number) {
  const electricalState = pinStateToElectricalState(ioPort.pinState(index));
  self.postMessage({
    type: 'pin-state',
    pin: pinName,
    cycle: cpu.cycles,
    electricalState,
  } as OutboundMessage);
}

function parseDigitalPin(pin: string) {
  const normalized = normalizePinId(pin);
  if (/^A[0-5]$/.test(normalized)) {
    return { port: 'C' as const, index: Number(normalized.slice(1)) };
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric >= 0 && numeric <= 7) {
    return { port: 'D' as const, index: numeric };
  }

  if (numeric >= 8 && numeric <= 13) {
    return { port: 'B' as const, index: numeric - 8 };
  }

  if (numeric >= 14 && numeric <= 19) {
    return { port: 'C' as const, index: numeric - 14 };
  }

  return null;
}

function parseAnalogChannel(pin: string) {
  const normalized = normalizePinId(pin);
  if (/^A[0-5]$/.test(normalized)) {
    return Number(normalized.slice(1));
  }

  const numeric = Number(normalized);
  if (numeric >= 14 && numeric <= 19) {
    return numeric - 14;
  }

  return null;
}

function parseIntelHex(hexStr: string): Uint8Array {
  const flash = new Uint8Array(FLASH_SIZE);
  let extendedAddress = 0;

  for (const rawLine of hexStr.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith(':')) continue;

    const byteCount = parseInt(line.slice(1, 3), 16);
    const address = parseInt(line.slice(3, 7), 16);
    const recordType = parseInt(line.slice(7, 9), 16);

    switch (recordType) {
      case 0x00: {
        const base = extendedAddress + address;
        for (let i = 0; i < byteCount; i++) {
          const byte = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
          if (base + i < FLASH_SIZE) {
            flash[base + i] = byte;
          }
        }
        break;
      }
      case 0x01:
        return flash;
      case 0x02:
        extendedAddress = parseInt(line.slice(9, 13), 16) << 4;
        break;
      case 0x04:
        extendedAddress = parseInt(line.slice(9, 13), 16) << 16;
        break;
      default:
        break;
    }
  }

  return flash;
}

function bytesToProgram(bytes: Uint8Array): Uint16Array {
  const words = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < words.length; i++) {
    words[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
  }
  return words;
}

function bytesToIntelHex(bytes: Uint8Array): string {
  const lines: string[] = [];
  const chunkSize = 16;

  for (let address = 0; address < bytes.length; address += chunkSize) {
    const chunk = bytes.slice(address, address + chunkSize);
    if (chunk.every((value) => value === 0)) {
      continue;
    }

    let sum = chunk.length + ((address >> 8) & 0xff) + (address & 0xff);
    const dataPart = Array.from(chunk)
      .map((value) => {
        sum += value;
        return value.toString(16).padStart(2, '0').toUpperCase();
      })
      .join('');

    const checksum = ((~sum + 1) & 0xff).toString(16).padStart(2, '0').toUpperCase();
    const addressPart = address.toString(16).padStart(4, '0').toUpperCase();
    const countPart = chunk.length.toString(16).padStart(2, '0').toUpperCase();
    lines.push(`:${countPart}${addressPart}00${dataPart}${checksum}`);
  }

  lines.push(':00000001FF');
  return lines.join('\n');
}

function stopLoop() {
  if (loopId !== null) {
    clearInterval(loopId);
    loopId = null;
  }
  pendingSerialInput.length = 0;
}

function emitPortChanges(cpu: CPU, ioPort: AVRIOPort, boardPins: string[]) {
  ioPort.addListener((value, oldValue) => {
    const changedMask = value ^ oldValue;

    boardPins.forEach((pinName, index) => {
      if ((changedMask & (1 << index)) === 0) {
        return;
      }

      const state = ioPort.pinState(index);
      const electricalState = pinStateToElectricalState(state);

      // Every edge also goes to a WS2812 decoder for this pin. While NeoPixel bits are arriving
      // (hundreds of edges per show()), the per-edge pin messages are skipped.
      if (state === PinState.High || state === PinState.Low) {
        let entry = ws2812Decoders.get(pinName);
        if (!entry) {
          entry = { decoder: new Ws2812Decoder({ cpuFrequency: CPU_FREQUENCY }), port: ioPort, index };
          ws2812Decoders.set(pinName, entry);
        }
        const wasActive = entry.decoder.active;
        const frame = entry.decoder.edge(state === PinState.High, cpu.cycles);
        if (frame) {
          self.postMessage({ type: 'neopixel-frame', pin: pinName, colors: ws2812FrameToColors(frame), cycle: cpu.cycles } as OutboundMessage);
        }
        if (wasActive || entry.decoder.active) {
          return;
        }

        // analogWrite toggles a pin hundreds of times a second: report its duty cycle instead.
        let pwm = pwmTrackers.get(pinName);
        if (!pwm) {
          pwm = { tracker: new PwmTracker({ cpuFrequency: CPU_FREQUENCY }), port: ioPort, index };
          pwmTrackers.set(pinName, pwm);
        }
        pwm.tracker.edge(state === PinState.High, cpu.cycles);
        if (pwm.tracker.active(cpu.cycles)) {
          return;
        }
      }
      if (state === PinState.High || state === PinState.Low) {
        self.postMessage({
          type: 'pin-change',
          pin: pinName,
          high: state === PinState.High,
          cycle: cpu.cycles,
          electricalState,
        } as OutboundMessage);
      }

      emitPinSnapshot(cpu, ioPort, pinName, index);
    });
  });
}

function emitInitialSnapshots(cpu: CPU) {
  if (!portB || !portC || !portD) {
    return;
  }

  ['0', '1', '2', '3', '4', '5', '6', '7'].forEach((pinName, index) => emitPinSnapshot(cpu, portD!, pinName, index));
  ['8', '9', '10', '11', '12', '13'].forEach((pinName, index) => emitPinSnapshot(cpu, portB!, pinName, index));
  ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].forEach((pinName, index) => emitPinSnapshot(cpu, portC!, pinName, index));
}

function applyDigitalInput(pin: string, high: boolean) {
  pendingDigitalInputs.set(normalizePinId(pin), high);
  const parsed = parseDigitalPin(pin);
  if (!parsed) {
    return;
  }

  const targetPort = parsed.port === 'B' ? portB : parsed.port === 'C' ? portC : portD;
  targetPort?.setPin(parsed.index, high);
}

function applyAnalogInput(pin: string, value: number) {
  pendingAnalogInputs.set(normalizePinId(pin), value);
  const channel = parseAnalogChannel(pin);
  if (channel === null || !adc) {
    return;
  }

  adc.channelValues[channel] = (Math.max(0, Math.min(1023, value)) / 1023) * adc.avcc;
}

function applyPendingInputs() {
  pendingDigitalInputs.forEach((high, pin) => applyDigitalInput(pin, high));
  pendingAnalogInputs.forEach((value, pin) => applyAnalogInput(pin, value));
}

function emitBusEvent(event: Omit<SimulationBusEvent, 'id' | 'timestamp'>) {
  self.postMessage({
    type: 'bus-event',
    event: {
      ...event,
      id: createEventId(event.bus, event.cycle),
      timestamp: Date.now(),
    },
  } as OutboundMessage);
}

class InstrumentedTWIHandler {
  private currentAddress: number | null = null;
  private currentWrite: boolean | null = null;
  private currentData: number[] = [];

  constructor(private readonly twiPeripheral: AVRTWI, private readonly cpu: CPU) {}

  start(repeated: boolean) {
    this.currentData = [];
    emitBusEvent({
      bus: 'i2c',
      action: repeated ? 'repeated-start' : 'start',
      summary: repeated ? 'Repeated start condition' : 'Start condition',
      cycle: this.cpu.cycles,
      direction: 'meta',
    });
    this.twiPeripheral.completeStart();
  }

  stop() {
    emitBusEvent({
      bus: 'i2c',
      action: 'stop',
      summary: this.currentAddress !== null
        ? `Stop 0x${this.currentAddress.toString(16).padStart(2, '0').toUpperCase()} (${this.currentData.length} byte${this.currentData.length === 1 ? '' : 's'})`
        : 'Stop condition',
      cycle: this.cpu.cycles,
      direction: 'meta',
      address: this.currentAddress,
      write: this.currentWrite,
      data: this.currentData.length > 0 ? [...this.currentData] : undefined,
    });
    this.currentAddress = null;
    this.currentWrite = null;
    this.currentData = [];
    this.twiPeripheral.completeStop();
  }

  connectToSlave(addr: number, write: boolean) {
    this.currentAddress = addr;
    this.currentWrite = write;
    emitBusEvent({
      bus: 'i2c',
      action: 'address',
      summary: `${write ? 'Write to' : 'Read from'} 0x${addr.toString(16).padStart(2, '0').toUpperCase()}`,
      cycle: this.cpu.cycles,
      direction: write ? 'tx' : 'rx',
      address: addr,
      write,
      ack: true,
    });
    this.twiPeripheral.completeConnect(true);
  }

  writeByte(value: number) {
    this.currentData.push(value);
    if (this.currentAddress !== null && (LCD_I2C_ADDRESSES as readonly number[]).includes(this.currentAddress)) {
      let lcd = lcdDecoders.get(this.currentAddress);
      if (!lcd) {
        lcd = new LcdI2cDecoder();
        lcdDecoders.set(this.currentAddress, lcd);
      }
      lcd.write(value);
    }
    emitBusEvent({
      bus: 'i2c',
      action: 'write-byte',
      summary: `I2C <= 0x${value.toString(16).padStart(2, '0').toUpperCase()}`,
      cycle: this.cpu.cycles,
      direction: 'tx',
      address: this.currentAddress,
      write: true,
      ack: true,
      data: [value],
    });
    this.twiPeripheral.completeWrite(true);
  }

  readByte(ack: boolean) {
    const value = 0xff;
    emitBusEvent({
      bus: 'i2c',
      action: 'read-byte',
      summary: `I2C => 0x${value.toString(16).padStart(2, '0').toUpperCase()}`,
      cycle: this.cpu.cycles,
      direction: 'rx',
      address: this.currentAddress,
      write: false,
      ack,
      data: [value],
    });
    this.twiPeripheral.completeRead(value);
  }
}

function drainSerialQueue(cpu: CPU) {
  if (!usart || pendingSerialInput.length === 0) {
    return;
  }

  while (pendingSerialInput.length > 0) {
    const nextByte = pendingSerialInput[0];
    const accepted = usart.writeByte(nextByte);
    if (accepted === false) {
      break;
    }

    pendingSerialInput.shift();
    self.postMessage({ type: 'serial-byte', value: nextByte, direction: 'rx', cycle: cpu.cycles } as OutboundMessage);
  }
}

/** Posts NeoPixel frames that have latched and LCD screens that changed during the last slice. */
function flushDecodedPeripherals(cpu: CPU) {
  ws2812Decoders.forEach((entry, pinName) => {
    const frame = entry.decoder.poll(cpu.cycles);
    if (frame) {
      self.postMessage({ type: 'neopixel-frame', pin: pinName, colors: ws2812FrameToColors(frame), cycle: cpu.cycles } as OutboundMessage);
      // The burst skipped per-edge messages, so report where the pin ended up.
      emitPinSnapshot(cpu, entry.port, pinName, entry.index);
    }
  });
  pwmTrackers.forEach((entry, pinName) => {
    const duty = entry.tracker.poll(cpu.cycles);
    if (duty === undefined) return;
    self.postMessage({ type: 'pwm-duty', pin: pinName, duty } as OutboundMessage);
    if (duty === null) {
      // PWM stopped: report the level the pin settled at.
      const state = entry.port.pinState(entry.index);
      if (state === PinState.High || state === PinState.Low) {
        self.postMessage({ type: 'pin-change', pin: pinName, high: state === PinState.High, cycle: cpu.cycles, electricalState: pinStateToElectricalState(state) } as OutboundMessage);
      }
    }
  });
  lcdDecoders.forEach((lcd, address) => {
    const change = lcd.takeChange();
    if (change) {
      self.postMessage({ type: 'lcd-state', address, ...change } as OutboundMessage);
    }
  });
}

function startSimulation(programBytes: Uint8Array) {
  ws2812Decoders.clear();
  lcdDecoders.clear();
  pwmTrackers.clear();
  stopLoop();

  const cpu = new CPU(bytesToProgram(programBytes));
  activeCpu = cpu;
  portB = new AVRIOPort(cpu, portBConfig);
  portC = new AVRIOPort(cpu, portCConfig);
  portD = new AVRIOPort(cpu, portDConfig);
  adc = new AVRADC(cpu, adcConfig);
  usart = new AVRUSART(cpu, usart0Config, CPU_FREQUENCY);
  spi = new AVRSPI(cpu, spiConfig, CPU_FREQUENCY);
  twi = new AVRTWI(cpu, twiConfig, CPU_FREQUENCY);

  new AVRTimer(cpu, timer0Config);
  new AVRTimer(cpu, timer1Config);
  new AVRTimer(cpu, timer2Config);

  usart.onByteTransmit = (value) => {
    self.postMessage({ type: 'serial-byte', value, direction: 'tx', cycle: cpu.cycles } as OutboundMessage);
  };
  usart.onLineTransmit = (value) => {
    self.postMessage({ type: 'serial-line', value, cycle: cpu.cycles } as OutboundMessage);
  };
  usart.onConfigurationChange = () => {
    emitSerialConfig();
  };

  spi.onByte = (value) => {
    emitBusEvent({
      bus: 'spi',
      action: 'transfer',
      summary: `SPI transfer 0x${value.toString(16).padStart(2, '0').toUpperCase()}`,
      cycle: cpu.cycles,
      direction: 'tx',
      data: [value],
    });
    spi?.completeTransfer(0xff);
  };

  twi.eventHandler = new InstrumentedTWIHandler(twi, cpu) as any;

  emitPortChanges(cpu, portD, ['0', '1', '2', '3', '4', '5', '6', '7']);
  emitPortChanges(cpu, portB, ['8', '9', '10', '11', '12', '13']);
  emitPortChanges(cpu, portC, ['A0', 'A1', 'A2', 'A3', 'A4', 'A5']);

  applyPendingInputs();
  emitInitialSnapshots(cpu);
  emitSerialConfig();

  const cyclesPerFrame = Math.round(CPU_FREQUENCY / (1000 / 16));
  loopId = setInterval(() => {
    const targetCycles = cpu.cycles + cyclesPerFrame;
    while (cpu.cycles < targetCycles) {
      avrInstruction(cpu);
      cpu.tick();
    }

    drainSerialQueue(cpu);
    flushDecodedPeripherals(cpu);
  }, 16);

  self.postMessage({ type: 'ready' } as OutboundMessage);
}

self.onmessage = (event: MessageEvent<InboundMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'run':
      try {
        startSimulation(parseIntelHex(message.hex));
      } catch (error) {
        self.postMessage({ type: 'error', message: String(error) } as OutboundMessage);
      }
      break;
    case 'assemble':
      try {
        const result = assemble(message.asm);
        if (result.errors.length > 0) {
          self.postMessage({ type: 'error', message: `Assembly error:\n${result.errors.join('\n')}` } as OutboundMessage);
          return;
        }
        const hex = bytesToIntelHex(result.bytes);
        startSimulation(parseIntelHex(hex));
      } catch (error) {
        self.postMessage({ type: 'error', message: String(error) } as OutboundMessage);
      }
      break;
    case 'stop':
    case 'reset':
      stopLoop();
      break;
    case 'set-digital-input':
      applyDigitalInput(message.pin, message.high);
      break;
    case 'set-analog-input':
      applyAnalogInput(message.pin, message.value);
      break;
    case 'serial-input': {
      const encoder = new TextEncoder();
      pendingSerialInput.push(...Array.from(encoder.encode(message.text)));
      if (activeCpu) {
        drainSerialQueue(activeCpu);
      }
      break;
    }
    default:
      break;
  }
};
