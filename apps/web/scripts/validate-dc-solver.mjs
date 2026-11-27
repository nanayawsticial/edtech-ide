import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTsModuleLoader } from './ts-module-loader.mjs';

// The DC solver behind Circuit Lab's electrical simulation, on circuits with known answers.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, '..', 'src');
const { solveDc } = createTsModuleLoader(srcRoot).loadModule(path.join(srcRoot, 'lib', 'simulator', 'dcSolver.ts'));

const near = (actual, expected, tolerance, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);

// Voltage divider: 5 V, 10k over 10k gives 2.5 V.
let s = solveDc(3, [
  { kind: 'source', id: 'v', node: 1, volts: 5, ohms: 0.01 },
  { kind: 'resistor', id: 'r1', a: 1, b: 2, ohms: 10000 },
  { kind: 'resistor', id: 'r2', a: 2, b: 0, ohms: 10000 },
]);
near(s.voltages[2], 2.5, 0.001, 'divider midpoint');
near(s.currents.r1, 0.00025, 1e-6, 'divider current');

// LED + 220 Ω from a 5 V pin (25 Ω output): about (5 - 1.9) / 245 ≈ 12.4 mA.
const ledCircuit = (resistor) => [
  { kind: 'source', id: 'pin', node: 1, volts: 5, ohms: 25 },
  ...(resistor ? [{ kind: 'resistor', id: 'r', a: 1, b: 2, ohms: resistor }] : []),
  { kind: 'diode', id: 'led', anode: resistor ? 2 : 1, cathode: 0, forwardVolts: 1.9, ohms: 10 },
];
s = solveDc(3, ledCircuit(220));
assert.ok(s.conducting.has('led'), 'LED with 220 Ω conducts');
near(s.currents.led, (5 - 1.9) / 255, 0.0005, 'LED current with 220 Ω');

s = solveDc(2, ledCircuit(0));
assert.ok(s.currents.led > 0.08, 'without a resistor the LED takes a damaging current');

// Reversed LED does not conduct.
s = solveDc(2, [
  { kind: 'source', id: 'pin', node: 1, volts: 5, ohms: 25 },
  { kind: 'diode', id: 'led', anode: 0, cathode: 1, forwardVolts: 1.9, ohms: 10 },
]);
assert.ok(!s.conducting.has('led'), 'a reversed LED stays off');
near(s.currents.led, 0, 1e-6, 'and passes no current');

// Two red LEDs in series from 5 V with 100 Ω both light; three blue (3 V each) cannot.
s = solveDc(4, [
  { kind: 'source', id: 'v', node: 1, volts: 5, ohms: 0.05 },
  { kind: 'resistor', id: 'r', a: 1, b: 2, ohms: 100 },
  { kind: 'diode', id: 'd1', anode: 2, cathode: 3, forwardVolts: 1.9, ohms: 10 },
  { kind: 'diode', id: 'd2', anode: 3, cathode: 0, forwardVolts: 1.9, ohms: 10 },
]);
assert.ok(s.conducting.has('d1') && s.conducting.has('d2'), 'two red LEDs in series light');
s = solveDc(4, [
  { kind: 'source', id: 'v', node: 1, volts: 5, ohms: 0.05 },
  { kind: 'diode', id: 'd1', anode: 1, cathode: 2, forwardVolts: 3, ohms: 10 },
  { kind: 'diode', id: 'd2', anode: 2, cathode: 3, forwardVolts: 3, ohms: 10 },
  { kind: 'diode', id: 'd3', anode: 3, cathode: 0, forwardVolts: 3, ohms: 10 },
]);
assert.equal(s.conducting.size, 0, '9 V of blue LEDs from 5 V stay dark');

// Pull-down with a pressed button (button = 0.1 Ω to 5 V): the input reads 5 V.
s = solveDc(2, [
  { kind: 'source', id: 'rail', node: 1, volts: 5, ohms: 0.1 },
  { kind: 'resistor', id: 'pd', a: 1, b: 0, ohms: 10000 },
]);
near(s.voltages[1], 5, 0.001, 'pressed button beats the pull-down');

// Floating nodes are reported as undriven.
s = solveDc(3, [{ kind: 'source', id: 'v', node: 1, volts: 5, ohms: 1 }]);
assert.deepEqual(s.driven, [true, true, false], 'a node nothing reaches is not driven');

// A short: HIGH pin straight to ground draws a huge current.
s = solveDc(2, [{ kind: 'source', id: 'pin', node: 1, volts: 5, ohms: 25 }, { kind: 'resistor', id: 'wire', a: 1, b: 0, ohms: 0.01 }]);
assert.ok(s.currents.pin > 0.15, 'a short shows as a large pin current');

console.log('Validated the DC solver: dividers, LED currents, polarity, series LEDs, pull-downs, floating nodes and shorts.');
