import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createTsModuleLoader } from './ts-module-loader.mjs';

const require = createRequire(import.meta.url);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const srcRoot = path.join(repoRoot, 'apps', 'web', 'src');
const loader = createTsModuleLoader(srcRoot);

// ---------------------------------------------------------------------------------------------
// Lessons: content matches the course catalog and real parts, and the step checks behave.
// ---------------------------------------------------------------------------------------------

const { LESSONS } = loader.loadModule(path.join(srcRoot, 'lib', 'lessons', 'index.ts'));
const { evaluateCheck } = loader.loadModule(path.join(srcRoot, 'lib', 'lessons', 'checks.ts'));
const { getComponentDefinition } = loader.loadModule(path.join(srcRoot, 'lib', 'wiring', 'componentDefinitions.ts'));

const catalogSource = fs.readFileSync(path.join(srcRoot, 'lib', 'courses', 'catalog.ts'), 'utf8');
const catalogSlugs = new Set([...catalogSource.matchAll(/"slug":\s*"([^"]+)"/g)].map((match) => match[1]));

function walkChecks(check, visit) {
  if (!check) return;
  visit(check);
  if (check.kind === 'all') check.checks.forEach((inner) => walkChecks(inner, visit));
}

let activityCount = 0;
let stepCount = 0;
for (const lesson of Object.values(LESSONS)) {
  assert.ok(catalogSlugs.has(lesson.slug), `Lesson "${lesson.slug}" has no course catalog entry`);
  assert.ok(lesson.activities.length > 0, `Lesson "${lesson.slug}" has no activities`);
  const activityIds = new Set();

  for (const activity of lesson.activities) {
    activityCount += 1;
    assert.ok(!activityIds.has(activity.id), `Duplicate activity id ${activity.id}`);
    activityIds.add(activity.id);
    for (const field of ['title', 'goal', 'realWorld', 'observe', 'wrapUp']) {
      assert.ok(activity[field]?.trim(), `${activity.id}: missing ${field}`);
    }
    for (const part of activity.parts) {
      assert.ok(getComponentDefinition(part.type), `${activity.id}: unknown part type ${part.type}`);
    }

    const stepIds = new Set();
    for (const step of activity.steps) {
      stepCount += 1;
      const where = `${activity.id}/${step.id}`;
      assert.ok(!stepIds.has(step.id), `Duplicate step id ${where}`);
      stepIds.add(step.id);
      assert.ok(step.title?.trim() && step.body?.trim(), `${where}: missing title or body`);

      walkChecks(step.check, (check) => {
        if (check.kind === 'code') {
          assert.doesNotThrow(() => new RegExp(check.pattern), `${where}: invalid code pattern ${check.pattern}`);
        }
        if (check.kind === 'parts' || check.kind === 'wired') {
          const definition = getComponentDefinition(check.type);
          assert.ok(definition, `${where}: unknown part type ${check.type}`);
          if (check.kind === 'wired' && check.pin) {
            assert.ok(
              definition.pins.some((pin) => pin.id === check.pin),
              `${where}: ${check.type} has no pin "${check.pin}"`
            );
          }
        }
      });
    }
  }
}

// Behaviour of the checks on small hand-made circuits.
const baseContext = {
  components: [
    { id: 'uno', type: 'ARDUINO_UNO' },
    { id: 'led1', type: 'LED' },
    { id: 'led2', type: 'LED' },
    { id: 'r1', type: 'RESISTOR' },
  ],
  connections: {
    led1: { A: { netId: 'n6', boardPins: ['6'] }, C: { netId: 'ng', boardPins: ['GND.1'] } },
    // led2's + leg goes through r1 to pin 5; its - leg is not wired.
    led2: { A: { netId: 'nmid', boardPins: [] }, C: { netId: null, boardPins: [] } },
    r1: { A: { netId: 'nmid', boardPins: [] }, B: { netId: 'n5', boardPins: ['5'] } },
  },
  code: 'void setup() {\n  pinMode(6, OUTPUT);\n}\nvoid loop() {\n  digitalWrite(6, HIGH);\n  delay(1000);\n}\n',
  simulating: false,
  observations: { toggles: { LED: 3, BUZZER: 1 }, seen: ['TRAFFIC_LIGHT:red', 'RGB_LED:yellow'], servoAngles: [88, 175] },
};
const passes = (check) => evaluateCheck(check, baseContext).every((result) => result.passed);

assert.equal(passes({ kind: 'parts', type: 'LED', count: 2 }), true, 'parts: 2 LEDs present');
assert.equal(passes({ kind: 'parts', type: 'LED', count: 3 }), false, 'parts: only 2 LEDs');
assert.equal(passes({ kind: 'wired', type: 'LED', pin: 'A', to: '6' }), true, 'wired: direct to pin 6');
assert.equal(passes({ kind: 'wired', type: 'LED', pin: 'C', to: 'GND' }), true, 'wired: GND.1 counts as GND');
assert.equal(passes({ kind: 'wired', type: 'LED', pin: 'A', to: '5' }), false, 'wired: resistor not allowed by default');
assert.equal(passes({ kind: 'wired', type: 'LED', pin: 'A', to: '5', viaResistor: true }), true, 'wired: through a resistor');
assert.equal(passes({ kind: 'wired', type: 'LED', pin: 'C', to: 'GND', count: 2 }), false, 'wired: only one LED to GND');
assert.equal(passes({ kind: 'wired', type: 'LED', to: '6' }), true, 'wired: any pin');
assert.equal(passes({ kind: 'code', pattern: String.raw`digitalWrite\(\s*6\s*,\s*HIGH\s*\)` }), true, 'code: matches');
assert.equal(passes({ kind: 'code', pattern: String.raw`digitalWrite\(\s*6\s*,\s*LOW\s*\)` }), false, 'code: missing LOW');
assert.equal(passes({ kind: 'simulating' }), false, 'simulating: stopped');
assert.equal(passes({ kind: 'blinked', times: 3 }), true, 'blinked: 3 toggles');
assert.equal(passes({ kind: 'blinked', times: 4 }), false, 'blinked: not 4 yet');
assert.equal(passes({ kind: 'blinked', times: 1, type: 'BUZZER' }), true, 'blinked: buzzer toggled once');
assert.equal(passes({ kind: 'blinked', times: 1, type: 'TRAFFIC_LIGHT' }), false, 'blinked: traffic light never switched');
assert.equal(passes({ kind: 'seen', tokens: ['TRAFFIC_LIGHT:red', 'RGB_LED:yellow'] }), true, 'seen: both shown');
assert.equal(passes({ kind: 'seen', tokens: ['TRAFFIC_LIGHT:green'] }), false, 'seen: green never shown');
{
  const { observeVisualChange } = loader.loadModule(path.join(srcRoot, 'lib', 'lessons', 'checks.ts'));
  assert.deepEqual(observeVisualChange('TRAFFIC_LIGHT', { red: true, yellow: true }, { red: true }), { toggles: 1, seen: ['TRAFFIC_LIGHT:red', 'TRAFFIC_LIGHT:yellow'] }, 'observe: traffic light lamps');
  assert.deepEqual(observeVisualChange('RGB_LED', { color: 'cyan' }, { color: 'blue' }), { toggles: 1, seen: ['RGB_LED:cyan'] }, 'observe: RGB colour change');
  assert.deepEqual(observeVisualChange('BUZZER', { sounding: false }, { sounding: true }), { toggles: 1, seen: [] }, 'observe: buzzer stops');
}
assert.equal(passes({ kind: 'servoReached', angles: [90, 180] }), true, 'servo: within 10 degrees');
assert.equal(passes({ kind: 'servoReached', angles: [0] }), false, 'servo: never at 0');
assert.deepEqual(
  evaluateCheck({ kind: 'all', checks: [{ kind: 'parts', type: 'LED', count: 1 }, { kind: 'simulating' }] }, baseContext).map((r) => r.passed),
  [true, false],
  'all: one checklist row per check'
);

// Every activity that teaches code has a reference block program, and the C++ the real generator
// makes from it passes every code check in that activity. This keeps the checks honest: they must
// match what learners' blocks actually produce.
const Blockly = require('blockly');
const { defineCustomBlocks } = loader.loadModule(path.join(srcRoot, 'lib', 'blockly', 'blocks.ts'));
const { buildSourceCodeFromBlocklyWorkspace } = loader.loadModule(path.join(srcRoot, 'lib', 'blockly', 'codegen.ts'));
defineCustomBlocks();

function generateArduino(xml) {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), workspace);
    return buildSourceCodeFromBlocklyWorkspace(workspace, 'arduino').code;
  } finally {
    workspace.dispose();
  }
}

const showSolution = process.argv.includes('--show-solutions');
let solutionCount = 0;
for (const lesson of Object.values(LESSONS)) {
  for (const activity of lesson.activities) {
    const codeChecks = [];
    activity.steps.forEach((step) => walkChecks(step.check, (check) => check.kind === 'code' && codeChecks.push({ step, check })));
    if (codeChecks.length === 0) continue;

    assert.ok(activity.solution, `${activity.id}: has code checks but no reference solution`);
    const generated = new Map();
    const codeFor = (xml) => {
      if (!generated.has(xml)) {
        generated.set(xml, generateArduino(xml));
        solutionCount += 1;
      }
      return generated.get(xml);
    };
    if (showSolution) console.log(`--- ${activity.id}\n${codeFor(activity.solution)}`);

    for (const { step, check } of codeChecks) {
      const code = codeFor(step.solution ?? activity.solution);
      const [result] = evaluateCheck(check, { ...baseContext, code });
      assert.ok(result.passed, `${activity.id}/${step.id}: "${result.label}" (${check.pattern}) fails on the reference solution:\n${code}`);
    }
  }
}

console.log(
  `Validated ${Object.keys(LESSONS).length} lessons (${activityCount} activities, ${stepCount} steps), ` +
    `the lesson step checks, and ${solutionCount} reference solutions against the real code generator.`
);
