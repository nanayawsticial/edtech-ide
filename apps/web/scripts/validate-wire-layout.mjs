import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTsModuleLoader } from './ts-module-loader.mjs';

// Circuit Lab wire layout: picking a wire under the pointer, and spreading wires that share a line.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, '..', 'src');
const loader = createTsModuleLoader(srcRoot);
const { nearestPointOnSegment, pickWireSegment, shiftWire, spreadSharedLines, SHARED_LINE_SPACING } = loader.loadModule(
  path.join(srcRoot, 'lib', 'wiring', 'wireLayout.ts')
);

const P = (x, y) => ({ x, y });

// --- Picking ---
assert.deepEqual(nearestPointOnSegment(P(5, 4), P(0, 0), P(10, 0)), P(5, 0), 'straight above the segment');
assert.deepEqual(nearestPointOnSegment(P(-3, 4), P(0, 0), P(10, 0)), P(0, 0), 'beyond an end clamps to the end');
assert.deepEqual(nearestPointOnSegment(P(1, 1), P(2, 2), P(2, 2)), P(2, 2), 'a zero-length segment is its point');

const lShape = [P(0, 0), P(10, 0), P(10, 10)];
const pick = pickWireSegment(lShape, P(12, 6), 3);
assert.equal(pick.segmentIndex, 1, 'the vertical leg is nearer');
assert.equal(pick.distance, 2);
assert.deepEqual(pick.nearest, P(10, 6));
assert.equal(pickWireSegment(lShape, P(30, 30), 3), null, 'out of reach');
assert.equal(pickWireSegment(lShape, P(5, 2), 2).segmentIndex, 0, 'within reach exactly');

// --- Spreading wires that share a line ---
const a = { id: 'a', points: [P(0, 0), P(20, 0)] };
const b = { id: 'b', points: [P(10, 0), P(30, 0)] };
const c = { id: 'c', points: [P(0, 50), P(20, 50)] };
let shifts = spreadSharedLines([a, b, c]);
assert.equal(shifts.get('a'), -SHARED_LINE_SPACING / 2, 'first of two wires on a line goes one way');
assert.equal(shifts.get('b'), SHARED_LINE_SPACING / 2, 'the second goes the other');
assert.equal(shifts.get('c'), 0, 'a wire alone stays put');

// Overlap is followed through: b touches a and c, so all three spread even though a and c do not meet.
const chainA = { id: 'a', points: [P(0, 0), P(10, 0)] };
const chainB = { id: 'b', points: [P(5, 0), P(25, 0)] };
const chainC = { id: 'c', points: [P(20, 0), P(30, 0)] };
shifts = spreadSharedLines([chainA, chainB, chainC]);
assert.deepEqual([shifts.get('a'), shifts.get('b'), shifts.get('c')], [-8, 0, 8]);

// Lines a hair apart count as the same line; different directions never share.
shifts = spreadSharedLines([{ id: 'h', points: [P(0, 0), P(10, 0)] }, { id: 'h2', points: [P(0, 0.4), P(10, 0.4)] }, { id: 'v', points: [P(5, -5), P(5, 5)] }]);
assert.deepEqual([shifts.get('h'), shifts.get('h2'), shifts.get('v')], [-4, 4, 0]);

// --- Shifting a wire: ends stay on their pins, with a jog onto the moved path ---
assert.deepEqual(shiftWire([P(0, 0), P(20, 0)], 4), [P(0, 0), P(0, 4), P(20, 4), P(20, 0)]);
assert.deepEqual(shiftWire([P(0, 0), P(0, 20), P(10, 20)], -4), [P(0, 0), P(-4, 0), P(-4, 20), P(10, 20)], 'vertical first: moves sideways, rejoins the end pin');
const shiftedL = shiftWire([P(0, 0), P(10, 0), P(10, 10)], 4);
assert.deepEqual(shiftedL[0], P(0, 0), 'starts on its pin');
assert.deepEqual(shiftedL[shiftedL.length - 1], P(10, 10), 'ends on its pin');
assert.deepEqual(shiftWire([P(3, 3), P(9, 3)], 0), [P(3, 3), P(9, 3)], 'no shift, no change');
assert.equal(shiftWire([P(5, 5), P(5, 5)], 8).length, 2, 'a zero-length wire keeps both ends');
// Every corner after shifting is a real corner (no repeats, no points in the middle of a straight run).
for (const points of [shiftedL, shiftWire([P(70, 30), P(30, 30), P(30, 30), P(70, 30), P(70, 50)], 8)]) {
  for (let i = 1; i < points.length - 1; i += 1) {
    const [before, point, after] = [points[i - 1], points[i], points[i + 1]];
    assert.ok(!(before.x === point.x && point.x === after.x) && !(before.y === point.y && point.y === after.y), 'only corners remain');
  }
}

console.log('Validated Circuit Lab wire layout: picking wires, spreading shared lines, shifting with pins kept.');
