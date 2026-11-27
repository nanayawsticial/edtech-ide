import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTsModuleLoader } from './ts-module-loader.mjs';

// Circuit Lab wire routing: free wires (straight through the learner's bends), editing bends, and
// older right-angle wires keeping their shape when they become free wires.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, '..', 'src');
const loader = createTsModuleLoader(srcRoot);
const routing = loader.loadModule(path.join(srcRoot, 'components', 'ide', 'circuit-lab', 'wireRouting.ts'));
const { GRID_PITCH } = loader.loadModule(path.join(srcRoot, 'lib', 'wiring', 'componentGeometry.ts'));
const colors = loader.loadModule(path.join(srcRoot, 'lib', 'wiring', 'wireColors.ts'));

const P = (x, y) => ({ x, y });
const half = GRID_PITCH / 2;

// --- Which wires are free ---
assert.equal(routing.getWireRouting({}), 'orthogonal', 'older wires without a routing field stay right-angled');
assert.equal(routing.getWireRouting({ routing: 'orthogonal' }), 'orthogonal');
assert.equal(routing.getWireRouting({ routing: 'free' }), 'free');

// --- Free routes go straight through the bends ---
const start = P(0, 0);
const end = P(10 * GRID_PITCH, 4 * GRID_PITCH);
const bends = [P(2 * GRID_PITCH, 6 * GRID_PITCH), P(7 * GRID_PITCH, 6 * GRID_PITCH)];
assert.deepEqual(routing.buildRoutePoints(start, end, bends, 'free'), [start, ...bends, end]);
assert.deepEqual(routing.buildRoutePoints(start, end, [], 'free'), [start, end], 'no bends: a straight wire');

// An older wire turns into a free wire without changing shape: its corners become bends.
const orthogonalRoute = routing.buildRoutePoints(start, end, [], 'orthogonal');
assert.ok(orthogonalRoute.length >= 3, 'a right-angle wire between offset pins has a corner');
const materialized = routing.materializeWaypoints(start, end, [], 'orthogonal');
assert.deepEqual(routing.buildRoutePoints(start, end, materialized, 'free'), orthogonalRoute, 'same path after conversion');
assert.deepEqual(routing.materializeWaypoints(start, end, bends, 'free'), bends, 'free wires keep their bends');

// --- Placing bends ---
assert.deepEqual(routing.snapBendPoint(P(half * 3 + 1, half * 5 - 1)), P(half * 3, half * 5), 'bends snap to a half-pitch grid');
assert.deepEqual(routing.constrainToAxis(P(0, 0), P(50, 8)), P(50, 0), 'Shift keeps a mostly-level segment level');
assert.deepEqual(routing.constrainToAxis(P(0, 0), P(8, 50)), P(0, 50), 'Shift keeps a mostly-upright segment upright');
assert.deepEqual(routing.placeBendPoint(P(50, 9), P(0, 0), true).y, 0, 'placeBendPoint with Shift lines up with the previous point');

// --- Adding, moving and removing bends ---
const inserted = routing.insertBend(bends, 1, P(4 * GRID_PITCH, 9 * GRID_PITCH));
assert.equal(inserted.waypointIndex, 1, 'a bend on segment 1 goes after the first bend');
assert.deepEqual(inserted.waypoints, [bends[0], P(4 * GRID_PITCH, 9 * GRID_PITCH), bends[1]]);
assert.deepEqual(routing.removeBend(inserted.waypoints, 1), bends, 'removing it gives the old bends back');
assert.equal(routing.insertBend([], 0, P(1, 1)).waypointIndex, 0, 'the first bend on a straight wire');

const moved = routing.moveBend(start, bends, 0, P(3 * GRID_PITCH + 1, 2 * GRID_PITCH + 1), false);
assert.deepEqual(moved[0], P(3 * GRID_PITCH, 2 * GRID_PITCH), 'a moved bend snaps');
assert.deepEqual(moved[1], bends[1], 'other bends stay put');
const level = routing.moveBend(start, bends, 1, P(9 * GRID_PITCH, 6.4 * GRID_PITCH), true);
assert.equal(level[1].y, bends[0].y, 'Shift keeps the segment from the previous bend level');

assert.equal(routing.nearestSegmentIndex([start, ...bends, end], P(4 * GRID_PITCH, 6 * GRID_PITCH + 2)), 1, 'the segment nearest the pointer');

// --- Tidying committed bends ---
assert.deepEqual(routing.tidyFreeWaypoints(start, end, bends), bends, 'real bends are kept');
assert.deepEqual(
  routing.tidyFreeWaypoints(P(0, 0), P(100, 0), [P(50, 0)]),
  [],
  'a bend on the straight line between its neighbours does nothing and is dropped'
);
assert.deepEqual(
  routing.tidyFreeWaypoints(P(0, 0), P(100, 100), [P(50, 50), P(50, 50), P(60, 20)]),
  [P(50, 50), P(60, 20)],
  'repeated bends collapse to one'
);
assert.deepEqual(routing.tidyFreeWaypoints(P(0, 0), P(100, 0), [P(0, 0)]), [], 'a bend on top of an end is dropped');

// --- Handles on a free wire ---
const handles = routing.getFreeWireHandles('w1', start, end, bends);
assert.equal(handles.filter((handle) => handle.kind === 'endpoint').length, 2, 'both ends');
assert.deepEqual(
  handles.filter((handle) => handle.kind === 'elbow').map((handle) => handle.waypointIndex),
  [0, 1],
  'one handle per bend'
);
assert.ok(handles.some((handle) => handle.kind === 'segment'), 'mid-segment grips for pulling out a new bend');
const shortHandles = routing.getFreeWireHandles('w2', P(0, 0), P(GRID_PITCH, 0), []);
assert.ok(!shortHandles.some((handle) => handle.kind === 'segment'), 'no grip on a very short wire');

// --- Wire colours ---
assert.equal(colors.WIRE_COLOR_OPTIONS.length, 12, 'twelve named colours');
assert.equal(new Set(colors.WIRE_COLOR_OPTIONS.map((option) => option.hex)).size, 12, 'all different');
for (const hex of ['#ef4444', '#f8fafc', '#3b82f6', '#10b981', '#8b5cf6']) {
  assert.ok(colors.WIRE_COLOR_OPTIONS.some((option) => option.hex === hex), `older projects' ${hex} wires still match a palette colour`);
}
assert.equal(colors.getWireColorName('#EF4444'), 'Red');
assert.equal(colors.chooseNewWireColor(['other', 'ground'], null), colors.DEFAULT_GROUND_WIRE_COLOR, 'to ground: black');
assert.equal(colors.chooseNewWireColor(['power', 'other'], null), colors.DEFAULT_POWER_WIRE_COLOR, 'to power: red');
assert.equal(colors.chooseNewWireColor(['other', 'other'], null), colors.DEFAULT_SIGNAL_WIRE_COLOR, 'signals: green');
assert.equal(colors.chooseNewWireColor(['ground'], '#f97316'), '#f97316', 'once picked, the learner\'s colour wins');
assert.notEqual(
  colors.getWireCasingColor(colors.DEFAULT_GROUND_WIRE_COLOR),
  colors.getWireCasingColor('#f8fafc'),
  'dark and light wires get opposite casings so both show'
);

console.log('Validated Circuit Lab wire routing: free bends, editing, conversion of older wires, and wire colours.');
