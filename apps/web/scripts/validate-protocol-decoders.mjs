import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTsModuleLoader } from './ts-module-loader.mjs';

// Decoders the simulator worker runs on the simulated Arduino's output: WS2812 (NeoPixel) pulses on
// a pin, and an I2C character LCD (PCF8574 backpack + HD44780) as LiquidCrystal_I2C drives it.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, '..', 'src');
const loader = createTsModuleLoader(srcRoot);
const { Ws2812Decoder, ws2812FrameToColors } = loader.loadModule(path.join(srcRoot, 'lib', 'simulator', 'ws2812Decoder.ts'));
const { LcdI2cDecoder } = loader.loadModule(path.join(srcRoot, 'lib', 'simulator', 'lcdI2cDecoder.ts'));
const { PwmTracker } = loader.loadModule(path.join(srcRoot, 'lib', 'simulator', 'pwmTracker.ts'));

// --- WS2812 ---
const MHZ = 16;
function sendWs2812(decoder, bytes, startCycle) {
  let cycle = startCycle;
  const frames = [];
  for (const byte of bytes) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      const one = (byte >> bit) & 1;
      const highCycles = (one ? 0.8 : 0.4) * MHZ;
      const lowCycles = (one ? 0.45 : 0.85) * MHZ;
      const done = decoder.edge(true, cycle);
      if (done) frames.push(done);
      cycle += highCycles;
      decoder.edge(false, cycle);
      cycle += lowCycles;
    }
  }
  return { cycle, frames };
}

const ws = new Ws2812Decoder({ cpuFrequency: 16e6 });
// Two pixels: red (GRB 00 ff 00) and dim blue (00 00 20).
const first = sendWs2812(ws, [0x00, 0xff, 0x00, 0x00, 0x00, 0x20], 1000);
assert.deepEqual(first.frames, [], 'no frame before the latch gap');
assert.equal(ws.poll(first.cycle + 10 * MHZ), null, 'a 10 µs gap is not a latch');
const latched = ws.poll(first.cycle + 80 * MHZ);
assert.deepEqual(latched, [0x00, 0xff, 0x00, 0x00, 0x00, 0x20], 'an 80 µs gap latches the frame');
assert.deepEqual(ws2812FrameToColors(latched), ['#ff0000', '#000020'], 'GRB bytes become colours');

// A second show() after a gap: the next burst also finishes the previous frame if poll was missed.
const ws2 = new Ws2812Decoder({ cpuFrequency: 16e6 });
const a = sendWs2812(ws2, [0x10, 0x20, 0x30], 0);
const b = sendWs2812(ws2, [0x01, 0x02, 0x03], a.cycle + 100 * MHZ);
assert.deepEqual(b.frames, [[0x10, 0x20, 0x30]], 'a new burst after a gap hands over the earlier frame');

// Ordinary digitalWrite blinking never makes frames.
const blink = new Ws2812Decoder({ cpuFrequency: 16e6 });
for (let i = 0; i < 20; i += 1) {
  blink.edge(true, i * 16e6);
  blink.edge(false, i * 16e6 + 8e6);
}
assert.equal(blink.poll(400 * 16e6), null, 'slow on/off on a pin is not mistaken for NeoPixel data');

// --- I2C LCD (LiquidCrystal_I2C) ---
const BACKLIGHT = 0x08;
const EN = 0x04;
const RS = 0x01;
function lcdBytes() {
  const out = [];
  const expander = (value) => out.push(value | BACKLIGHT);
  const pulse = (data) => {
    expander(data | EN);
    expander(data & ~EN);
  };
  const write4 = (value) => {
    expander(value);
    pulse(value);
  };
  const send = (value, mode) => {
    write4((value & 0xf0) | mode);
    write4(((value << 4) & 0xf0) | mode);
  };
  const command = (value) => send(value, 0);
  const data = (value) => send(value, RS);
  // begin(): reset to 4-bit mode, then set up.
  expander(0);
  write4(0x03 << 4);
  write4(0x03 << 4);
  write4(0x03 << 4);
  write4(0x02 << 4);
  command(0x28); // 4-bit, 2 lines
  command(0x0c); // display on
  command(0x01); // clear
  command(0x06); // entry mode
  command(0x02); // home
  for (const ch of 'Hello') data(ch.charCodeAt(0));
  command(0x80 | 0x40); // second row
  for (const ch of 'World!') data(ch.charCodeAt(0));
  return out;
}

const lcd = new LcdI2cDecoder();
lcdBytes().forEach((value) => lcd.write(value));
const screen = lcd.takeChange();
assert.ok(screen, 'writing text reports a change');
assert.equal(screen.lines[0].trimEnd(), 'Hello', 'first row');
assert.equal(screen.lines[1].trimEnd(), 'World!', 'second row');
assert.equal(screen.lines[0].length, 16, 'rows are 16 characters');
assert.equal(screen.backlight, true, 'backlight bit');
assert.equal(screen.displayOn, true, 'display switched on');
assert.equal(lcd.takeChange(), null, 'no change until something new is written');

// --- PWM duty (analogWrite) ---
function pwm(tracker, dutyFraction, periodCycles, count, start = 0) {
  let cycle = start;
  for (let i = 0; i < count; i += 1) {
    tracker.edge(true, cycle);
    tracker.edge(false, cycle + periodCycles * dutyFraction);
    cycle += periodCycles;
  }
  return cycle;
}
const quarter = new PwmTracker({ cpuFrequency: 16e6 });
let end = pwm(quarter, 0.25, 16e6 / 490, 10);
assert.ok(quarter.active(end), '490 Hz toggling counts as PWM');
assert.ok(Math.abs(quarter.poll(end) - 0.25) < 0.01, 'analogWrite(64) reads as a quarter duty');
assert.equal(quarter.poll(end), undefined, 'no repeat report while it stays the same');
assert.equal(quarter.poll(end + 16e6), null, 'stopping PWM is reported once');
const servo = new PwmTracker({ cpuFrequency: 16e6 });
end = pwm(servo, 0.075, 16e6 / 50, 10);
assert.ok(!servo.active(end), 'a 50 Hz servo signal is not treated as PWM');

console.log('Validated protocol decoders: WS2812 NeoPixel frames, the I2C character LCD and PWM duty.');
