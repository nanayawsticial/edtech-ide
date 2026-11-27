import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTsModuleLoader } from './ts-module-loader.mjs';

// Circuit Lab logic simulation on textbook circuits: LEDs with series resistors, buttons with
// pull-up and pull-down resistors, polarity, and shorts.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, '..', 'src');
const loader = createTsModuleLoader(srcRoot);
const { NetlistEngine } = loader.loadModule(path.join(srcRoot, 'lib', 'wiring', 'NetlistEngine.ts'));
const { simulateCircuitTick } = loader.loadModule(path.join(srcRoot, 'lib', 'simulator', 'circuitSimulation.ts'));

const part = (id, type, state = {}) => ({ id, type, x: 0, y: 0, rotation: 0, state });
const wire = (from, to) => ({ id: `${from}->${to}`, from, to, color: '#10b981' });
const uno = part('uno', 'ARDUINO_UNO');

function run(components, nets, { digital = {}, electrical = {} } = {}) {
  const netlist = NetlistEngine.generateNetlist(components, nets);
  const resolvedConnections = NetlistEngine.resolveConnections(components, nets);
  return simulateCircuitTick({ components, netlist, resolvedConnections, avrDigitalPins: digital, avrElectricalPins: electrical });
}
const ledOn = (result) => Boolean(result.componentStatePatches?.led?.outputHigh);

// --- LEDs ---
const led = part('led', 'LED');
const resistor = part('r1', 'RESISTOR', { resistance: '220' });

assert.ok(ledOn(run([uno, led], [wire('UNO_13', 'led.A'), wire('led.C', 'UNO_GND.1')], { digital: { 13: true } })), 'LED to GND lights');

const seriesCathode = [wire('UNO_13', 'led.A'), wire('led.C', 'r1.A'), wire('r1.B', 'UNO_GND.1')];
assert.ok(ledOn(run([uno, led, resistor], seriesCathode, { digital: { 13: true } })), 'LED with a resistor to GND lights');
assert.ok(!ledOn(run([uno, led, resistor], seriesCathode, { digital: { 13: false } })), 'and goes out when the pin is LOW');

const seriesAnode = [wire('UNO_13', 'r1.A'), wire('r1.B', 'led.A'), wire('led.C', 'UNO_GND.1')];
assert.ok(ledOn(run([uno, led, resistor], seriesAnode, { digital: { 13: true } })), 'resistor on the anode side lights too');

const r2 = part('r2', 'RESISTOR');
const twoResistors = [wire('UNO_13', 'r1.A'), wire('r1.B', 'r2.A'), wire('r2.B', 'led.A'), wire('led.C', 'UNO_GND.1')];
assert.ok(ledOn(run([uno, led, resistor, r2], twoResistors, { digital: { 13: true } })), 'a level passes along a chain of resistors');

assert.ok(
  !ledOn(run([uno, led], [wire('UNO_13', 'led.C'), wire('led.A', 'UNO_GND.1')], { digital: { 13: true } })),
  'an LED in backwards stays dark'
);
assert.ok(
  !ledOn(run([uno, led, resistor], [wire('UNO_13', 'led.A'), wire('led.C', 'r1.A')], { digital: { 13: true } })),
  'a resistor going nowhere does not complete the circuit'
);

// --- Buttons and pull resistors ---
const button = (pressed) => part('b1', 'BUTTON', { pressed });
const pullupButton = [wire('UNO_2', 'b1.1.l'), wire('b1.1.r', 'UNO_GND.1')];
assert.equal(run([uno, button(false)], pullupButton, { electrical: { 2: 'pullup' } }).boardInputStates[2], true, 'INPUT_PULLUP reads HIGH when released');
const pressedPullup = run([uno, button(true)], pullupButton, { electrical: { 2: 'pullup' } });
assert.equal(pressedPullup.boardInputStates[2], false, 'INPUT_PULLUP reads LOW when the button is pressed');
assert.ok(!pressedPullup.warnings.some((warning) => /conflict/i.test(warning)), 'a pressed pull-up button is not a conflict');

const pulldown = part('rpd', 'RESISTOR', { resistance: '10000' });
const pulldownCircuit = [wire('UNO_5V', 'b1.1.l'), wire('b1.1.r', 'UNO_2'), wire('UNO_2', 'rpd.A'), wire('rpd.B', 'UNO_GND.1')];
assert.equal(run([uno, button(false), pulldown], pulldownCircuit).boardInputStates[2], false, 'pull-down resistor: released reads LOW');
const pressedPulldown = run([uno, button(true), pulldown], pulldownCircuit);
assert.equal(pressedPulldown.boardInputStates[2], true, 'pull-down resistor: pressed reads HIGH');
assert.ok(!pressedPulldown.warnings.some((warning) => /conflict/i.test(warning)), 'the button beats the pull-down, no conflict');

const pullupResistor = part('rpu', 'RESISTOR', { resistance: '10000' });
const externalPullup = [wire('UNO_5V', 'rpu.A'), wire('rpu.B', 'UNO_2'), wire('UNO_2', 'b1.1.l'), wire('b1.1.r', 'UNO_GND.1')];
assert.equal(run([uno, button(false), pullupResistor], externalPullup).boardInputStates[2], true, 'external pull-up: released reads HIGH');
assert.equal(run([uno, button(true), pullupResistor], externalPullup).boardInputStates[2], false, 'external pull-up: pressed reads LOW');

// --- Slide switch ---
const slide = (value) => part('sw', 'SLIDE_SWITCH', { value });
const switchedLed = [wire('UNO_5V', 'sw.2'), wire('sw.1', 'led.A'), wire('led.C', 'UNO_GND.1')];
assert.ok(ledOn(run([uno, slide(0), led], switchedLed)), 'slide switch at 0 joins the middle pin to pin 1');
assert.ok(!ledOn(run([uno, slide(1), led], switchedLed)), 'slid to 1, the middle pin leaves pin 1');

// --- PIR motion sensor ---
const pir = (motion) => part('pir', 'PIR', { motion });
const pirWiring = [wire('UNO_5V', 'pir.VCC'), wire('pir.GND', 'UNO_GND.1'), wire('pir.OUT', 'UNO_2')];
assert.equal(run([uno, pir(true)], pirWiring).boardInputStates[2], true, 'PIR OUT reads HIGH while it sees movement');
assert.equal(run([uno, pir(false)], pirWiring).boardInputStates[2], false, 'and LOW when still');
assert.notEqual(run([uno, pir(true)], [wire('pir.OUT', 'UNO_2')]).boardInputStates[2], true, 'an unpowered PIR gives no signal');

// --- 7-segment display ---
const digit = (common) => part('seg', 'SEVEN_SEGMENT', { common });
const segValues = (result) => result.componentStatePatches?.seg?.values ?? [];
const cathodeWiring = [wire('seg.COM.1', 'UNO_GND.1'), wire('UNO_2', 'seg.A'), wire('UNO_3', 'seg.B')];
assert.deepEqual(segValues(run([uno, digit('cathode')], cathodeWiring, { digital: { 2: true, 3: false } })).slice(0, 2), [1, 0], 'common cathode: HIGH lights a segment');
const anodeWiring = [wire('seg.COM.2', 'UNO_5V'), wire('UNO_2', 'seg.A'), wire('UNO_3', 'seg.B')];
assert.deepEqual(segValues(run([uno, digit('anode')], anodeWiring, { digital: { 2: false, 3: true } })).slice(0, 2), [1, 0], 'common anode: LOW lights a segment');
assert.deepEqual(segValues(run([uno, digit('cathode')], [wire('UNO_2', 'seg.A')], { digital: { 2: true } })).slice(0, 1), [0], 'no common leg wired: dark');

// --- Relay module ---
const relay = part('rl', 'RELAY');
const relayWiring = [
  wire('UNO_7', 'rl.IN'), wire('UNO_5V', 'rl.VCC'), wire('rl.GND', 'UNO_GND.1'),
  wire('UNO_5V', 'rl.COM'), wire('rl.NO', 'led.A'), wire('led.C', 'UNO_GND.2'),
];
assert.ok(ledOn(run([uno, relay, led], relayWiring, { digital: { 7: true } })), 'relay: IN HIGH joins COM to NO');
assert.ok(!ledOn(run([uno, relay, led], relayWiring, { digital: { 7: false } })), 'relay: IN LOW leaves NO open');
const ncWiring = relayWiring.map((w) => (w.from === 'rl.NO' ? wire('rl.NC', 'led.A') : w));
assert.ok(ledOn(run([uno, relay, led], ncWiring, { digital: { 7: false } })), 'relay: IN LOW joins COM to NC');

// --- DC motor ---
const motor = part('m', 'DC_MOTOR');
const motorDirection = (result) => result.componentStatePatches?.m?.direction;
assert.equal(motorDirection(run([uno, motor], [wire('UNO_9', 'm.POS'), wire('m.NEG', 'UNO_GND.1')], { digital: { 9: true } })), 1, 'motor spins with + HIGH and - LOW');
assert.equal(motorDirection(run([uno, motor], [wire('UNO_9', 'm.NEG'), wire('m.POS', 'UNO_GND.1')], { digital: { 9: true } })), -1, 'swapped, it spins the other way');
assert.equal(motorDirection(run([uno, motor], [wire('UNO_9', 'm.POS'), wire('m.NEG', 'UNO_GND.1')], { digital: { 9: false } })), 0, 'and stops when the pin is LOW');

// --- NeoPixel ring and I2C LCD (frames and screens come decoded from the worker) ---
function runWith(components, nets, extra) {
  const netlist = NetlistEngine.generateNetlist(components, nets);
  const resolvedConnections = NetlistEngine.resolveConnections(components, nets);
  return simulateCircuitTick({ components, netlist, resolvedConnections, avrDigitalPins: {}, avrElectricalPins: {}, ...extra });
}
const ring = part('ring', 'NEOPIXEL_RING', { pixels: 12 });
const ringWiring = [wire('UNO_5V', 'ring.VCC'), wire('ring.GND', 'UNO_GND.1'), wire('UNO_6', 'ring.DIN')];
const ringColors = runWith([uno, ring], ringWiring, { neopixelFrames: { 6: ['#ff0000', '#00ff00'] } }).componentStatePatches.ring.colors;
assert.equal(ringColors.length, 12, 'one colour per pixel');
assert.deepEqual(ringColors.slice(0, 3), ['#ff0000', '#00ff00', '#000000'], 'the ring shows the frame sent on its DIN pin');
assert.deepEqual(
  runWith([uno, ring], ringWiring, { neopixelFrames: { 7: ['#ff0000'] } }).componentStatePatches.ring.colors[0],
  '#000000',
  'frames on another pin do not reach it'
);

const lcdPart = part('lcd', 'LCD1602', { address: 0x27 });
const lcdWiring = [wire('UNO_5V', 'lcd.VCC'), wire('lcd.GND', 'UNO_GND.1'), wire('UNO_A4', 'lcd.SDA'), wire('UNO_A5', 'lcd.SCL')];
const screens = { 0x27: { lines: ['Hello           ', 'World!          '], backlight: true, displayOn: true } };
assert.deepEqual(runWith([uno, lcdPart], lcdWiring, { lcdStates: screens }).componentStatePatches.lcd.lines, screens[0x27].lines, 'the LCD shows its address');
assert.deepEqual(
  runWith([uno, part('lcd', 'LCD1602', { address: 0x3f })], lcdWiring, { lcdStates: screens }).componentStatePatches.lcd.lines,
  ['', ''],
  'a different address stays blank'
);
assert.deepEqual(
  runWith([uno, lcdPart], lcdWiring.slice(0, 3), { lcdStates: screens }).componentStatePatches.lcd.lines,
  ['', ''],
  'without SCL wired the LCD stays blank'
);

// --- Shorts are still reported ---
const short = run([uno], [wire('UNO_13', 'UNO_GND.1')], { digital: { 13: true } });
assert.ok(short.warnings.some((warning) => /short circuit/i.test(warning)), 'an output HIGH wired to GND is reported as a short circuit');

console.log('Validated Circuit Lab simulation: resistors, pull-ups, polarity, shorts, switches, PIR, 7-segment, relay, motor, NeoPixel ring and LCD.');

// --- Pico 2 W board pins ---
const { parseBoardNodeId, createBoardNodeId } = loader.loadModule(path.join(srcRoot, 'lib', 'wiring', 'boardNodes.ts'));
assert.equal(createBoardNodeId('RASPBERRY_PI_PICO_2W', 'GP15'), 'PICO_2W_GP15');
assert.deepEqual(parseBoardNodeId('PICO_2W_GP15'), { prefix: 'PICO_2W', pinId: 'GP15' }, 'Pico 2 W pins are not mistaken for a Pico');
assert.deepEqual(parseBoardNodeId('PICO_GP2'), { prefix: 'PICO', pinId: 'GP2' });
const pico = part('pico', 'RASPBERRY_PI_PICO_2W');
const picoNetlist = NetlistEngine.generateNetlist([pico, led], [wire('PICO_2W_GP15', 'led.A'), wire('led.C', 'PICO_2W_GND.5')]);
assert.ok(picoNetlist.nets.some((net) => net.boardPins.includes('GP15') && net.nodes.includes('led.A')), 'a wire to GP15 joins the Pico pin net');
console.log('Validated Pico 2 W board pins.');

// --- Electrical solve: currents, brightness and warnings ---
const bright = (result) => result.componentStatePatches?.led?.brightness ?? 0;
const noResistor = run([uno, led], [wire('UNO_13', 'led.A'), wire('led.C', 'UNO_GND.1')], { digital: { 13: true } });
assert.ok(noResistor.warnings.some((warning) => /burn out/i.test(warning)), 'an LED straight on a pin warns that it would burn out');
const r220 = run([uno, led, resistor], seriesCathode, { digital: { 13: true } });
assert.ok(!r220.warnings.some((warning) => /burn out/i.test(warning)), 'with 220 Ω there is no warning');
const big = part('r1', 'RESISTOR', { resistance: '10000' });
const dim = run([uno, led, big], seriesCathode, { digital: { 13: true } });
assert.ok(bright(dim) > 0 && bright(dim) < bright(r220), 'a 10 kΩ resistor makes the LED dimmer than 220 Ω');

const motorOnPin = run([uno, motor], [wire('UNO_9', 'm.POS'), wire('m.NEG', 'UNO_GND.1')], { digital: { 9: true } });
assert.ok(motorOnPin.warnings.some((warning) => /transistor or a driver/i.test(warning)), 'a motor on a pin warns about the pin current');

const knob = (value) => part('pot', 'POTENTIOMETER', { value });
const divider = [wire('UNO_5V', 'pot.VCC'), wire('pot.GND', 'UNO_GND.1'), wire('pot.OUT', 'UNO_A0')];
const reading = (value) => run([uno, knob(value)], divider).boardAnalogStates.A0;
assert.ok(Math.abs(reading(256) - 256) <= 3, `a quarter-turned knob reads about 256 (got ${reading(256)})`);
assert.ok(Math.abs(reading(1000) - 1000) <= 3, 'near the top it reads near 1023');

const twoLeds = [part('led', 'LED'), part('led2', 'LED')];
const seriesPair = [wire('UNO_5V', 'r1.A'), wire('r1.B', 'led.A'), wire('led.C', 'led2.A'), wire('led2.C', 'UNO_GND.1')];
const pairResult = run([uno, part('r1', 'RESISTOR', { resistance: '100' }), ...twoLeds], seriesPair);
assert.ok(pairResult.componentStatePatches.led.outputHigh && pairResult.componentStatePatches.led2.outputHigh, 'two red LEDs in series from 5 V both light');
console.log('Validated the electrical solve in the simulator: burn-out and pin warnings, brightness and potentiometer dividers.');
