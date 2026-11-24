import type { ComponentData } from '@/contexts/CircuitContext';
import { getComponentDefinition, type ComponentDefinition } from '@/lib/wiring/componentDefinitions';
import { isGroundPinId, normalizeConnectedBoardPin, resolveMappedBoardPin } from '@/lib/wiring/componentConnectivity';
import type { ComponentPinMapping } from '@/lib/wiring/NetlistEngine';

import type { BoardAdapter } from './boardAdapters';
import type { LogicalNetState, PinElectricalState, SimulationBusEvent } from './simulationTypes';

const SUPPLY_PINS = new Set(['5V', '3.3V', '3V3', 'VIN', 'IOREF']);

export interface UltrasonicRuntimeState {
  echoTicksRemaining: number;
  lastTriggerHigh: boolean;
}

export interface ComponentRuntimeState {
  ultrasonic: Record<string, UltrasonicRuntimeState>;
}

export interface SimulationNetSummary {
  id: string;
  baseNetIds: string[];
  nodes: string[];
  boardPins: string[];
  state: LogicalNetState;
  electricalState: PinElectricalState;
  highSources: string[];
  lowSources: string[];
  weakHighSources: string[];
  weakLowSources: string[];
  analogSources: string[];
}

export interface NetContribution {
  boardPinId: string;
  electricalState: PinElectricalState;
  source: string;
  analogValue?: number;
}

export interface NetMergeContext {
  component: ComponentData;
  definition: ComponentDefinition;
  pinMapping: ComponentPinMapping | undefined;
  unionFind: { union: (left: string | null | undefined, right: string | null | undefined) => void };
}

export interface ComponentSimulationContext {
  board: BoardAdapter;
  component: ComponentData;
  definition: ComponentDefinition;
  pinMapping: ComponentPinMapping | undefined;
  boardPinStates: Record<string, boolean>;
  boardElectricalStates: Record<string, PinElectricalState>;
  boardInputStates: Record<string, boolean>;
  boardAnalogStates: Record<string, number>;
  baseNetState: Map<string, LogicalNetState>;
  simulationNets: SimulationNetSummary[];
  pulseWidths: Record<string, number>;
  runtimeState: ComponentRuntimeState;
  componentStatePatches: Record<string, Record<string, unknown>>;
  busEvents: SimulationBusEvent[];
  tick: number;
}

export interface ComponentSimulator {
  matches: (definition: ComponentDefinition) => boolean;
  mergeDynamicNets?: (ctx: NetMergeContext) => void;
  samplePins?: (ctx: ComponentSimulationContext) => NetContribution[];
  init?: (ctx: ComponentSimulationContext) => void;
  applyInputs?: (ctx: ComponentSimulationContext) => void;
  tick?: (ctx: ComponentSimulationContext) => void;
  emitVisualState?: (ctx: ComponentSimulationContext) => Record<string, unknown> | null;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function getPinNetId(pinMapping: ComponentPinMapping | undefined, pinId: string) {
  return pinMapping?.[pinId]?.netId ?? null;
}

function getBoardPinId(pinMapping: ComponentPinMapping | undefined, pinId: string) {
  const boardPins = pinMapping?.[pinId]?.boardPins ?? [];
  return normalizeConnectedBoardPin(boardPins[0]);
}

function getBoardPinLogicalState(pinId: string | null | undefined, boardPinStates: Record<string, boolean>): LogicalNetState {
  const normalized = normalizeConnectedBoardPin(pinId);
  if (!normalized) {
    return 'FLOAT';
  }

  if (SUPPLY_PINS.has(normalized)) {
    return 'HIGH';
  }

  if (isGroundPinId(normalized)) {
    return 'LOW';
  }

  if (Object.prototype.hasOwnProperty.call(boardPinStates, normalized)) {
    return boardPinStates[normalized] ? 'HIGH' : 'LOW';
  }

  return 'FLOAT';
}

function getConnectionState(pinMapping: ComponentPinMapping | undefined, pinId: string, baseNetState: Map<string, LogicalNetState>) {
  const connection = pinMapping?.[pinId];
  if (!connection?.netId) {
    return 'FLOAT';
  }

  return baseNetState.get(connection.netId) ?? 'FLOAT';
}

function isPinMappingPowered(pinMapping: ComponentPinMapping | undefined, boardPinStates: Record<string, boolean>) {
  if (!pinMapping) {
    return false;
  }

  const connectedPins = Object.values(pinMapping).flatMap((connection) =>
    (connection?.boardPins ?? []).map((pinId) => normalizeConnectedBoardPin(pinId))
  );
  const powerPins = connectedPins.filter((pinId) => SUPPLY_PINS.has(pinId));
  const groundPins = connectedPins.filter((pinId) => isGroundPinId(pinId));

  if (powerPins.length === 0 || groundPins.length === 0) {
    return false;
  }

  return powerPins.some((pinId) => getBoardPinLogicalState(pinId, boardPinStates) === 'HIGH') &&
    groundPins.some((pinId) => getBoardPinLogicalState(pinId, boardPinStates) === 'LOW');
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pulseWidthToServoAngle(pulseWidthMicros: number) {
  const normalized = (pulseWidthMicros - 544) / (2400 - 544);
  return Math.max(0, Math.min(180, normalized * 180));
}

function inferDisplayAddress(component: ComponentData) {
  const candidate = component.state?.address ?? component.metadata?.address ?? 0x3c;
  return Number(candidate);
}

function formatByte(value: number) {
  return `0x${value.toString(16).padStart(2, '0').toUpperCase()}`;
}

function buildDisplayLinesFromBus(component: ComponentData, pinMapping: ComponentPinMapping | undefined, boardPinStates: Record<string, boolean>, busEvents: SimulationBusEvent[]) {
  const address = inferDisplayAddress(component);
  const title = String(component.state?.label ?? 'OLED').toUpperCase().slice(0, 12);
  const writes = busEvents.filter((event) => event.bus === 'i2c' && event.write && event.address === address);
  const dataBytes = writes.flatMap((event) => event.data ?? []);
  const lastBurst = dataBytes.slice(-6);
  const sdaPin = getBoardPinId(pinMapping, 'SDA');
  const sclPin = getBoardPinId(pinMapping, 'SCL');

  if (writes.length === 0) {
    return [
      title,
      'WAITING FOR I2C',
      `ADDR ${formatByte(address)}`,
      `${sdaPin || 'SDA'} ${getBoardPinLogicalState(sdaPin, boardPinStates)}`,
      `${sclPin || 'SCL'} ${getBoardPinLogicalState(sclPin, boardPinStates)}`,
    ];
  }

  return [
    title,
    `${writes.length} I2C WRITES`,
    lastBurst.length > 0 ? lastBurst.map(formatByte).join(' ') : 'NO PAYLOAD',
    `${sdaPin || 'SDA'} ${getBoardPinLogicalState(sdaPin, boardPinStates)}`,
    `${sclPin || 'SCL'} ${getBoardPinLogicalState(sclPin, boardPinStates)}`,
  ];
}

const buttonSimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.type === 'button',
  mergeDynamicNets: ({ component, pinMapping, unionFind }) => {
    const leftNetIds = unique(
      ['1.l', '2.l']
        .map((pinId) => getPinNetId(pinMapping, pinId))
        .filter((netId): netId is string => Boolean(netId))
    );
    const rightNetIds = unique(
      ['1.r', '2.r']
        .map((pinId) => getPinNetId(pinMapping, pinId))
        .filter((netId): netId is string => Boolean(netId))
    );

    for (let index = 1; index < leftNetIds.length; index += 1) {
      unionFind.union(leftNetIds[0], leftNetIds[index]);
    }

    for (let index = 1; index < rightNetIds.length; index += 1) {
      unionFind.union(rightNetIds[0], rightNetIds[index]);
    }

    if (component.state?.pressed && leftNetIds[0] && rightNetIds[0]) {
      unionFind.union(leftNetIds[0], rightNetIds[0]);
    }
  },
  emitVisualState: ({ component }) => ({ pressed: Boolean(component.state?.pressed) }),
};

const ledSimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.type === 'led',
  emitVisualState: ({ pinMapping, baseNetState }) => {
    const anodeState = getConnectionState(pinMapping, 'A', baseNetState);
    const cathodeState = getConnectionState(pinMapping, 'C', baseNetState);
    return { outputHigh: anodeState === 'HIGH' && cathodeState === 'LOW' };
  },
};

const resistorSimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.model === 'resistor',
  emitVisualState: () => null,
};

const potentiometerSimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.type === 'pot',
  samplePins: ({ component, pinMapping, boardPinStates }) => {
    const signalPin = resolveMappedBoardPin(component.type, pinMapping, 'SIG');
    if (!signalPin || !isPinMappingPowered(pinMapping, boardPinStates)) {
      return [];
    }

    return [
      {
        boardPinId: signalPin,
        electricalState: 'analog',
        source: `${component.id}:analog`,
        analogValue: Number(component.state?.value ?? 512),
      },
    ];
  },
  emitVisualState: ({ component }) => ({ value: Number(component.state?.value ?? 512) }),
};

const servoSimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.type === 'servo',
  emitVisualState: ({ definition, pinMapping, boardPinStates, pulseWidths }) => {
    const signalPin = getBoardPinId(pinMapping, 'PWM');
    const pulseWidth = signalPin ? pulseWidths[signalPin] : undefined;
    const angle =
      isPinMappingPowered(pinMapping, boardPinStates) && typeof pulseWidth === 'number'
        ? pulseWidthToServoAngle(pulseWidth)
        : Number(definition.defaultProperties?.angle ?? 90);
    return { angle: Math.round(angle) };
  },
};

const ultrasonicSimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.type === 'ultrasonic',
  tick: ({ component, definition, pinMapping, boardPinStates, boardInputStates, runtimeState, componentStatePatches }) => {
    const powered = isPinMappingPowered(pinMapping, boardPinStates);
    const trigPin = getBoardPinId(pinMapping, 'TRIG');
    const echoPin = getBoardPinId(pinMapping, 'ECHO');
    const distance = Number(component.state?.distance ?? definition.defaultProperties?.distance ?? 100);
    const runtime = runtimeState.ultrasonic[component.id] ?? {
      echoTicksRemaining: 0,
      lastTriggerHigh: false,
    };
    const triggerHigh = powered && getBoardPinLogicalState(trigPin, boardPinStates) === 'HIGH';
    const nextRuntime: UltrasonicRuntimeState = { ...runtime };

    if (triggerHigh && !runtime.lastTriggerHigh) {
      nextRuntime.echoTicksRemaining = clamp(Math.round(distance / 25), 1, 12);
    }

    if (powered && echoPin && nextRuntime.echoTicksRemaining > 0) {
      boardPinStates[echoPin] = true;
      boardInputStates[echoPin] = true;
      nextRuntime.echoTicksRemaining -= 1;
      componentStatePatches[component.id] = {
        ...componentStatePatches[component.id],
        distance,
        echoActive: true,
      };
    } else {
      componentStatePatches[component.id] = {
        ...componentStatePatches[component.id],
        distance,
        echoActive: false,
      };
    }

    nextRuntime.lastTriggerHigh = triggerHigh;
    runtimeState.ultrasonic[component.id] = nextRuntime;
  },
  emitVisualState: ({ component, definition }) => ({
    distance: Number(component.state?.distance ?? definition.defaultProperties?.distance ?? 100),
    echoActive: false,
  }),
};

const dht22Simulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.model === 'dht22',
  tick: ({ component, definition, pinMapping, boardPinStates, boardInputStates, componentStatePatches, tick }) => {
    const powered = isPinMappingPowered(pinMapping, boardPinStates);
    const dataPin = getBoardPinId(pinMapping, 'DATA');
    const temperature = Number(component.state?.temperature ?? definition.defaultProperties?.temperature ?? 24);
    const humidity = Number(component.state?.humidity ?? definition.defaultProperties?.humidity ?? 40);
    const dataReady = powered && ((tick + Math.round(temperature) + Math.round(humidity)) % 8 < 4);

    if (powered && dataPin) {
      boardPinStates[dataPin] = dataReady;
      boardInputStates[dataPin] = dataReady;
    }

    componentStatePatches[component.id] = {
      ...componentStatePatches[component.id],
      temperature,
      humidity,
      dataReady,
    };
  },
  emitVisualState: ({ component, definition }) => ({
    temperature: Number(component.state?.temperature ?? definition.defaultProperties?.temperature ?? 24),
    humidity: Number(component.state?.humidity ?? definition.defaultProperties?.humidity ?? 40),
    dataReady: false,
  }),
};

const displaySimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.type === 'display',
  emitVisualState: ({ component, pinMapping, boardPinStates, busEvents }) => ({
    displayLines: buildDisplayLinesFromBus(component, pinMapping, boardPinStates, busEvents),
  }),
};

/** An LED-like output is on when its pin is HIGH and its return leg is LOW. */
function isLit(pinMapping: ComponentPinMapping | undefined, pinId: string, returnPinId: string, baseNetState: Map<string, LogicalNetState>) {
  return getConnectionState(pinMapping, pinId, baseNetState) === 'HIGH' && getConnectionState(pinMapping, returnPinId, baseNetState) === 'LOW';
}

/** Active buzzer: beeps while + is HIGH and − is LOW (a tone() on the pin also counts while it is high). */
const buzzerSimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.type === 'buzzer',
  emitVisualState: ({ pinMapping, baseNetState }) => ({ sounding: isLit(pinMapping, 'POS', 'NEG', baseNetState) }),
};

/** Traffic light module: each lamp is on while its pin is HIGH (the module's GND to ground). */
const trafficLightSimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.type === 'traffic-light',
  emitVisualState: ({ pinMapping, baseNetState }) => ({
    red: isLit(pinMapping, 'R', 'GND', baseNetState),
    yellow: isLit(pinMapping, 'Y', 'GND', baseNetState),
    green: isLit(pinMapping, 'G', 'GND', baseNetState),
  }),
};

const RGB_COLOR_NAMES: Record<string, string> = {
  '000': 'off',
  '100': 'red',
  '010': 'green',
  '001': 'blue',
  '110': 'yellow',
  '011': 'cyan',
  '101': 'magenta',
  '111': 'white',
};

/**
 * RGB LED with a common leg. Common to GND (common cathode): a colour is on while its pin is HIGH.
 * Common to 5V (common anode): a colour is on while its pin is LOW. Kits come in both kinds.
 */
const rgbLedSimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.type === 'rgb-led',
  emitVisualState: ({ pinMapping, baseNetState }) => {
    const common = getConnectionState(pinMapping, 'COM', baseNetState);
    const on = (pinId: string) => {
      const state = getConnectionState(pinMapping, pinId, baseNetState);
      if (common === 'LOW') return state === 'HIGH';
      if (common === 'HIGH') return state === 'LOW';
      return false;
    };
    const [red, green, blue] = [on('R'), on('G'), on('B')];
    return {
      red: red ? 1 : 0,
      green: green ? 1 : 0,
      blue: blue ? 1 : 0,
      color: RGB_COLOR_NAMES[`${Number(red)}${Number(green)}${Number(blue)}`],
    };
  },
};

/**
 * LDR module, as on real boards: the AO reading goes DOWN as it gets brighter, and DO goes HIGH
 * when it is dark (its on-board LED lights when it is bright). Light is 0 (dark) to 100 (bright).
 */
const LIGHT_DARK_THRESHOLD = 50;
const lightSensorSimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.type === 'light-sensor',
  samplePins: ({ component, definition, pinMapping, boardPinStates }) => {
    const aoPin = getBoardPinId(pinMapping, 'AO');
    if (!aoPin || !isPinMappingPowered(pinMapping, boardPinStates)) return [];
    const light = clamp(Number(component.state?.light ?? definition.defaultProperties?.light ?? 60), 0, 100);
    return [{ boardPinId: aoPin, electricalState: 'analog', source: `${component.id}:AO`, analogValue: Math.round(1023 * (1 - light / 100)) }];
  },
  tick: ({ component, definition, pinMapping, boardPinStates, boardInputStates }) => {
    const doPin = getBoardPinId(pinMapping, 'DO');
    if (!doPin || !isPinMappingPowered(pinMapping, boardPinStates)) return;
    const light = clamp(Number(component.state?.light ?? definition.defaultProperties?.light ?? 60), 0, 100);
    const dark = light < LIGHT_DARK_THRESHOLD;
    boardPinStates[doPin] = dark;
    boardInputStates[doPin] = dark;
  },
  emitVisualState: ({ component, definition, pinMapping, boardPinStates }) => {
    const light = clamp(Number(component.state?.light ?? definition.defaultProperties?.light ?? 60), 0, 100);
    return { light, powered: isPinMappingPowered(pinMapping, boardPinStates), bright: light >= LIGHT_DARK_THRESHOLD };
  },
};

/** Sound sensor module: AO reading rises with loudness (0-100 -> 0-1023); DO goes HIGH when loud. */
const SOUND_LOUD_THRESHOLD = 60;
const soundSensorSimulator: ComponentSimulator = {
  matches: (definition) => definition.simulation?.type === 'sound-sensor',
  samplePins: ({ component, definition, pinMapping, boardPinStates }) => {
    const aoPin = getBoardPinId(pinMapping, 'AO');
    if (!aoPin || !isPinMappingPowered(pinMapping, boardPinStates)) return [];
    const level = clamp(Number(component.state?.level ?? definition.defaultProperties?.level ?? 20), 0, 100);
    return [{ boardPinId: aoPin, electricalState: 'analog', source: `${component.id}:AO`, analogValue: Math.round((1023 * level) / 100) }];
  },
  tick: ({ component, definition, pinMapping, boardPinStates, boardInputStates }) => {
    const doPin = getBoardPinId(pinMapping, 'DO');
    if (!doPin || !isPinMappingPowered(pinMapping, boardPinStates)) return;
    const level = clamp(Number(component.state?.level ?? definition.defaultProperties?.level ?? 20), 0, 100);
    const loud = level >= SOUND_LOUD_THRESHOLD;
    boardPinStates[doPin] = loud;
    boardInputStates[doPin] = loud;
  },
  emitVisualState: ({ component, definition, pinMapping, boardPinStates }) => {
    const level = clamp(Number(component.state?.level ?? definition.defaultProperties?.level ?? 20), 0, 100);
    return { level, powered: isPinMappingPowered(pinMapping, boardPinStates), loud: level >= SOUND_LOUD_THRESHOLD };
  },
};

const simulatorRegistry: ComponentSimulator[] = [
  buttonSimulator,
  ledSimulator,
  resistorSimulator,
  potentiometerSimulator,
  servoSimulator,
  ultrasonicSimulator,
  dht22Simulator,
  displaySimulator,
  buzzerSimulator,
  trafficLightSimulator,
  rgbLedSimulator,
  lightSensorSimulator,
  soundSensorSimulator,
];

export function createComponentRuntimeState(): ComponentRuntimeState {
  return {
    ultrasonic: {},
  };
}

export function getComponentSimulator(definition: ComponentDefinition | undefined) {
  if (!definition?.simulation) {
    return null;
  }

  return simulatorRegistry.find((simulator) => simulator.matches(definition)) ?? null;
}

export function collectAnalogInputContributions(
  board: BoardAdapter,
  components: ComponentData[],
  resolvedConnections: Record<string, ComponentPinMapping>,
  boardPinStates: Record<string, boolean>,
  busEvents: SimulationBusEvent[]
) {
  const boardAnalogStates: Record<string, number> = {};
  const boardElectricalStates: Record<string, PinElectricalState> = {};

  components.forEach((component) => {
    const definition = getComponentDefinition(component.type);
    const simulator = getComponentSimulator(definition);
    if (!definition || !simulator?.samplePins) {
      return;
    }

    const contributions = simulator.samplePins({
      board,
      component,
      definition,
      pinMapping: resolvedConnections[component.id],
      boardPinStates,
      boardElectricalStates,
      boardInputStates: {},
      boardAnalogStates,
      baseNetState: new Map(),
      simulationNets: [],
      pulseWidths: {},
      runtimeState: createComponentRuntimeState(),
      componentStatePatches: {},
      busEvents,
      tick: 0,
    });

    contributions?.forEach((contribution) => {
      if (contribution.electricalState === 'analog' && typeof contribution.analogValue === 'number') {
        boardAnalogStates[contribution.boardPinId] = contribution.analogValue;
        boardElectricalStates[contribution.boardPinId] = 'analog';
      }
    });
  });

  return { boardAnalogStates, boardElectricalStates };
}
