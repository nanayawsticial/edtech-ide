import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
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
const { MICROPYTHON_LIBRARIES: LIBRARIES } = loader.loadModule(path.join(srcRoot, 'lib', 'lessons', 'libraries', 'index.ts'));

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
      assert.ok(part.label?.trim() && part.count > 0, `${activity.id}: part ${part.type} needs a label and a count`);
      if (!activity.onRealHardware) {
        assert.ok(getComponentDefinition(part.type), `${activity.id}: unknown part type ${part.type}`);
      }
    }

    const stepIds = new Set();
    for (const step of activity.steps) {
      stepCount += 1;
      const where = `${activity.id}/${step.id}`;
      assert.ok(!stepIds.has(step.id), `Duplicate step id ${where}`);
      stepIds.add(step.id);
      assert.ok(step.title?.trim() && step.body?.trim(), `${where}: missing title or body`);

      walkChecks(step.check, (check) => {
        if (activity.onRealHardware) {
          assert.ok(['all', 'code', 'file'].includes(check.kind), `${where}: real-hardware steps can only check code and files (got ${check.kind})`);
        }
        if (check.kind === 'file') {
          assert.equal(check.name, step.library && LIBRARIES[step.library]?.fileName, `${where}: checks for ${check.name}, which this step does not add`);
        }
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
let typedSolutionCount = 0;
let pythonChecked = 0;

function fillPlaceholders(code) {
  return code.replace(/YOUR_WIFI_NAME/g, 'ClassroomWiFi').replace(/YOUR_PASSWORD/g, 'example-password');
}

// MicroPython is Python syntax: parse it with the local Python when there is one (CI has it).
const pythonCommand = ['python', 'python3', 'py'].find((command) => {
  const probe = spawnSync(command, ['-c', 'import ast'], { encoding: 'utf8' });
  return probe.status === 0;
});
function checkPythonSyntax(code, where) {
  if (!pythonCommand) return;
  const result = spawnSync(pythonCommand, ['-c', 'import ast, sys; ast.parse(sys.stdin.buffer.read().decode("utf-8"))'], { input: code, encoding: 'utf8' });
  assert.equal(result.status, 0, `${where}: the MicroPython does not parse:
${result.stderr}`);
  pythonChecked += 1;
}
for (const lesson of Object.values(LESSONS)) {
  for (const activity of lesson.activities) {
    const codeChecks = [];
    activity.steps.forEach((step) => walkChecks(step.check, (check) => check.kind === 'code' && codeChecks.push({ step, check })));
    if (codeChecks.length === 0) continue;

    if (activity.solutionCode !== undefined) {
      // Typed-code lessons: the checks run on the finished code, with the Wi-Fi placeholders
      // filled in as a learner would.
      for (const { step, check } of codeChecks) {
        const code = fillPlaceholders(step.solutionCode ?? activity.solutionCode);
        const [result] = evaluateCheck(check, { ...baseContext, code });
        assert.ok(result.passed, `${activity.id}/${step.id}: "${result.label}" (${check.pattern}) fails on the reference code`);
        // The untouched code must still fail the "fill in your Wi-Fi details" checks.
        if (/YOUR_WIFI_NAME|YOUR_PASSWORD/.test(check.pattern)) {
          const [unfilled] = evaluateCheck(check, { ...baseContext, code: step.solutionCode ?? activity.solutionCode });
          assert.ok(!unfilled.passed, `${activity.id}/${step.id}: "${unfilled.label}" passes before the learner fills anything in`);
        }
      }
      for (const code of new Set([activity.solutionCode, ...activity.steps.map((step) => step.python).filter(Boolean)])) {
        checkPythonSyntax(code, activity.id);
      }
      typedSolutionCount += 1;
      continue;
    }

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
      // A step's picture shows the blocks at the end of that step, so its checks must pass on it.
      const code = codeFor(step.picture ?? step.solution ?? activity.solution);
      const [result] = evaluateCheck(check, { ...baseContext, code });
      assert.ok(result.passed, `${activity.id}/${step.id}: "${result.label}" (${check.pattern}) fails on the reference solution:\n${code}`);
    }
  }
}

// Numbered block instructions send the learner to a sidebar group: the block must really be in
// that group's drawer, and in the step's picture of how the blocks should look.
let blockInstructionCount = 0;
{
  const { GUIDED_TOOLBOX_GROUPS, isLearningLevelUnlocked } = loader.loadModule(path.join(srcRoot, 'lib', 'blockly', 'guidedToolbox.ts'));
  const { TOOLBOX_CATEGORY_DEFINITIONS } = loader.loadModule(path.join(srcRoot, 'lib', 'blockly', 'registry.ts'));
  // Variables and Functions fill themselves in Blockly; these are the blocks they offer.
  const CUSTOM_CATEGORY_BLOCKS = {
    VARIABLE: ['variables_get', 'variables_set', 'math_change'],
    PROCEDURE: ['procedures_defnoreturn', 'procedures_defreturn', 'procedures_callnoreturn', 'procedures_callreturn'],
  };
  const blocksInGroup = new Map(
    GUIDED_TOOLBOX_GROUPS.map((group) => [
      group.id,
      new Set(
        TOOLBOX_CATEGORY_DEFINITIONS.filter((category) => group.categoryNames.includes(category.name)).flatMap((category) => [
          ...category.entries.filter((entry) => entry.kind === 'block').map((entry) => entry.type),
          ...(CUSTOM_CATEGORY_BLOCKS[category.custom] ?? []),
        ])
      ),
    ])
  );
  for (const lesson of Object.values(LESSONS)) {
    for (const activity of lesson.activities) {
      for (const step of activity.steps) {
        for (const instruction of step.build ?? []) {
          const where = `${activity.id}/${step.id}: "${instruction.block}"`;
          // No group: the block is already in the learner's program, to move or change.
          if (instruction.group) {
            assert.ok(blocksInGroup.has(instruction.group), `${where}: there is no "${instruction.group}" group`);
            // The sidebar only shows a group once the activity's learning level unlocks it.
            const groupLevel = GUIDED_TOOLBOX_GROUPS.find((group) => group.id === instruction.group).level;
            assert.ok(
              isLearningLevelUnlocked(groupLevel, activity.learningLevel ?? 'starter'),
              `${where}: the ${instruction.group} group needs learning level "${groupLevel}", but the activity is "${activity.learningLevel ?? 'starter'}"`
            );
          }
          // "Your Circuit" fills itself from the parts on the canvas, so any part block can be there.
          if (instruction.group && instruction.group !== 'your-circuit') {
            assert.ok(blocksInGroup.get(instruction.group).has(instruction.type), `${where}: ${instruction.type} is not in the ${instruction.group} drawer`);
          }
          assert.ok(step.picture?.includes(`type="${instruction.type}"`), `${where}: ${instruction.type} is not in the step's picture`);
          assert.ok(instruction.place.trim() && /[.!]$/.test(instruction.place.trim()), `${where}: say where the block goes, as a sentence`);
          blockInstructionCount += 1;
        }
      }
    }
  }
}

// The order check catches blocks in the wrong order: on, off, wait makes an LED that looks off.
{
  const { blinksInOrder } = loader.loadModule(path.join(srcRoot, 'lib', 'lessons', 'content', 'helpers.ts'));
  const loop = (body) => `void setup() {\n  pinMode(6, OUTPUT);\n}\n\nvoid loop() {\n${body}}\n`;
  const inOrder = (code) => evaluateCheck(blinksInOrder(6), { ...baseContext, code })[0].passed;
  assert.equal(inOrder(loop('  digitalWrite(6, HIGH);\n  delay(1000);\n  digitalWrite(6, LOW);\n  delay(1000);\n')), true, 'order: on, wait, off, wait');
  assert.equal(inOrder(loop('  digitalWrite(6, HIGH);\n  digitalWrite(6, LOW);\n  delay(1000);\n')), false, 'order: on, off, wait is caught');
  assert.equal(inOrder(loop('  digitalWrite(6, HIGH);\n  delay(1000);\n  digitalWrite(6, LOW);\n')), false, 'order: the second wait is needed');
  assert.equal(inOrder('void setup() {\n  digitalWrite(6, HIGH);\n  delay(1000);\n  digitalWrite(6, LOW);\n  delay(1000);\n}\n\nvoid loop() {\n}\n'), false, 'order: in on start it runs only once');
}

// Kit drivers: the "file" check, and the bundled copies are the real drivers.
{
  const hasDriver = (fileNames) => evaluateCheck({ kind: 'file', name: 'BME280.py' }, { ...baseContext, fileNames })[0].passed;
  assert.equal(hasDriver(['main.py', 'BME280.py']), true, 'file: BME280.py added');
  assert.equal(hasDriver(['main.py', 'bme280.py']), false, 'file: names are exact (MicroPython imports are case-sensitive)');
  assert.equal(hasDriver(undefined), false, 'file: no file list (block projects)');
  assert.match(LIBRARIES.BME280.content, /^class BME280:/m);
  assert.match(LIBRARIES.SH1106.content, /^class SH1106_I2C\(SH1106\):/m);
  assert.match(LIBRARIES.SH1106.content, /The MIT License/, 'sh1106.py keeps its licence');
  for (const library of Object.values(LIBRARIES)) {
    checkPythonSyntax(library.content, library.fileName);
  }
}

// Copying lesson code keeps the Wi-Fi name and password already typed into main.py.
const { carryOverWifiDetails } = loader.loadModule(path.join(srcRoot, 'lib', 'lessons', 'wifiDetails.ts'));
let wifiCarryCount = 0;
for (const lesson of Object.values(LESSONS)) {
  for (const activity of lesson.activities) {
    const credentials = activity.steps.find((step) => step.id === 'wifi-details');
    if (!credentials) continue;
    for (const lessonCode of activity.steps.map((step) => step.python).filter(Boolean)) {
      // Nothing typed yet: the copy is the lesson code as it is.
      assert.deepEqual(carryOverWifiDetails(lessonCode, lessonCode), { code: lessonCode, carried: false });
      assert.deepEqual(carryOverWifiDetails(lessonCode, ''), { code: lessonCode, carried: false });

      // "$&" would be read as a replacement pattern if the password went through String.replace.
      const typed = lessonCode.replace('YOUR_WIFI_NAME', 'School_2.4GHz').replace('YOUR_PASSWORD', () => "p$&'x");
      const carried = carryOverWifiDetails(lessonCode, typed);
      assert.ok(carried.carried, `${activity.id}: Wi-Fi details were not carried over`);
      assert.equal(carried.code, typed, `${activity.id}: carrying the details changed more than the two lines`);
      for (const result of evaluateCheck(credentials.check, { ...baseContext, code: carried.code })) {
        assert.ok(result.passed, `${activity.id}: "${result.label}" fails after copying with the details carried over`);
      }
      wifiCarryCount += 1;
    }
  }
}
assert.ok(wifiCarryCount > 0, 'No Wi-Fi lesson code to carry details into');

// Every typed-code program runs on a fake Pico 2 W (scripts/micropython-fake-pico.py): it joins
// "Wi-Fi", the page and each link on it are requested as a browser would, and sensors return
// changing readings. Crashes, bad HTTP replies and wrong pins fail here instead of in class.
const fakePico = path.join(scriptDir, 'micropython-fake-pico.py');
/** What some programs must visibly do on the fake Pico, by activity id. */
const FAKE_PICO_EXPECTATIONS = {
  // Pressing ON then OFF: the browser sends the OFF request with "Referer: .../?led=on".
  'aider-31-led': (run) => expectLevels(run, '0', { '/?led=on': 1, '/?led=off': 0 }),
  'aider-32-buzzer': (run) => expectLevels(run, '0', { '/?buzzer=on': 1, '/?buzzer=off': 0 }),
  'aider-33-relay': (run) => expectLevels(run, '0', { '/?relay=on': 0, '/?relay=off': 1 }), // active LOW
  'aider-34-temperature': (run) => assert.match(pages(run), /class="temp">\d+\.\d\dC</, 'the page should show a temperature such as 23.45C'),
  'aider-35-humidity': (run) => assert.ok(shown(run, 'class="status">(DRY|COMFORTABLE|HUMID)<').size >= 2, 'changing readings should change the status'),
  'aider-36-light': (run) => assert.match(pages(run), /<tr><td>3<\/td><td>\d+%<\/td><\/tr>/, 'the table should grow by one row per page load'),
  'aider-37-motion': (run) => assert.match(pages(run), /Total Detections: [1-9]/, 'the interrupt should count motion'),
  'aider-38-water': (run) => assert.ok(shown(run, 'Status: (LOW|MEDIUM|HIGH)<').size >= 2, 'changing readings should change the status'),
  'aider-39-soil': (run) => assert.ok(shown(run, 'class="status">(NEEDS WATER!|OK|WET)<').size >= 2, 'changing readings should change the advice'),
  'aider-40-rain': (run) => assert.match(pages(run), /Rain Events Today: <strong>1<\/strong>/, 'a change from dry to wet should count one rain event'),
  'aider-41-doorbell': (run) => {
    assert.deepEqual([...new Set(run.pins['0'])].sort(), [0, 1], 'the buzzer on GP0 should ding-dong');
    assert.match(pages(run), /Total rings: 1/, 'the ring should be counted');
    assert.doesNotMatch(pages(run), /Total rings: 2/, 'only the button rings: not the icon request that follows it');
  },
  'aider-42-dashboard': (run) => {
    for (const line of ['IoT Dashboard', '192.168.1.42', 'T:23.45C']) {
      assert.ok(run.display.includes(line), `the screen should show ${line}`);
    }
    assert.ok(run.display.some((line) => /^H:\d+\.\d\d%$/.test(line)), 'the screen should show the humidity');
  },
  'aider-43-motor': (run) => expectLevels(run, '0', { '/on': 0, '/off': 1 }), // active LOW
  'aider-44-button-log': (run) => {
    assert.match(pages(run), /Total Presses: [1-9]/, 'the interrupt should log presses');
    assert.match(pages(run), /<tr><td>1<\/td><td>09:00:\d\d<\/td><\/tr>/, 'each press should be logged with its time');
  },
  'aider-45-brightness': (run) => expectLevels(run, 'pwm0', { '/?level=50': 32767, '/?level=100': 65535, '/?level=0': 0 }),
  'aider-46-timer': (run) =>
    expectSequence(run, '0', [
      ['/?duration=30', 0], // relay ON (active LOW)
      ['/', 1], // the timer ran out before the next page load
      ['/?duration=5', 0],
      ['/stop', 1],
    ]),
  'aider-48-irrigation': (run) => expectLevels(run, '0', { '/on': 0, '/off': 1 }),
  'aider-49-env-log': (run) => assert.match(pages(run), /<tr><td>[2-9]<\/td><td>09:00:\d\d<\/td><td>\d+\.\d\dC<\/td><td>\d+\.\d\d%<\/td><\/tr>/, 'the timer should log readings with their time'),
  'aider-50-smart-light': (run) => {
    expectLevels(run, '0', { '/on': 0, '/off': 1 });
    assert.ok(shown(run, 'Light: (ON|OFF) \\(mode AUTO\\)').size === 2, 'in AUTO mode the light should follow the changing light level');
  },
  'aider-51-scheduler': (run) => {
    expectLevels(run, '0', { '/': 1, '/toggle': 0 }); // OFF until toggled: 09:00 is not in the schedule
    assert.ok(run.display.includes('IP:') && run.display.includes('Time: 09:00'), 'the screen should show the time and the IP address');
  },
  'aider-52-alarm': (run) => {
    assert.ok(run.pins['0']?.includes(1), 'the alarm should ring once set to the current time and enabled');
    assert.ok(run.pins.pwm1?.includes(65535), 'the LED should flash red');
    assert.match(run.printed, /Alarm set for 09:00/);
    assert.equal(run.printed.match(/ALARM!/g)?.length, 1, 'the alarm should ring once for its minute');
  },
  'aider-53-motion-counter': (run) => {
    const counts = shown(run, 'font-size:60px">(\\d+)<');
    assert.ok(counts.has('0') && [...counts].some((count) => Number(count) > 0), 'the count should go up with motion and back to 0 on reset');
    assert.ok(run.display.includes('Motion:'), 'the screen should show the count');
  },
  'aider-54-soil-alert': (run) => {
    assert.ok(run.pins['0']?.includes(1), 'the buzzer should beep for dry soil');
    assert.ok(run.display.includes('DRY - WATER!'), 'the screen should say DRY - WATER!');
  },
  'aider-55-color': (run) => {
    for (const [pin, duty] of [['pwm12', 65535], ['pwm13', 32896], ['pwm14', 0]]) {
      assert.equal(run.responses.find((response) => response.path === '/?r=255&g=128&b=0')?.levels[pin], duty, `${pin} should be ${duty}`);
    }
    assert.match(pages(run), /background: rgb\(255,128,0\)/, 'the box on the page should show the same colour');
  },
  'aider-56-touch': (run) => {
    assert.ok(run.pins['0']?.includes(0), 'the relay should switch');
    for (const response of run.responses.filter((candidate) => '0' in candidate.levels)) {
      assert.equal(response.levels['2'], 1 - response.levels['0'], `after ${response.path}, the LED should show the relay's state`);
    }
  },
  'aider-57-pump': (run) => {
    const started = run.responses.findIndex((response, index) => index > 5 && response.path === '/on' && response.levels['0'] === 0);
    assert.ok(started > 0, 'START should switch the pump on when the tank is not full');
    assert.ok(run.responses.slice(started + 1).some((response) => response.levels['0'] === 1), 'the pump should stop by itself when the tank is full');
    assert.match(run.printed, /Tank full: pump OFF/);
  },
  'aider-58-rain-alert': (run) => {
    assert.deepEqual([...new Set(run.pins['2'])].sort(), [0, 1], 'the LED should light while wet and go out when dry');
    assert.ok(run.pins['0']?.includes(1), 'the buzzer should beep while wet');
    assert.ok(shown(run, 'class="alert">(RAIN DETECTED!|No Rain)<').size === 2, 'the page should follow the sensor');
  },
  'aider-59-safety': (run) => {
    assert.ok(run.pins['0']?.includes(1), 'the buzzer should sound');
    assert.match(pages(run), /Alerts sent: 1/);
    assert.doesNotMatch(pages(run), /Alerts sent: 2/, 'only the button sounds the alarm: not the icon request that follows it');
  },
  'aider-60-plant': (run) => {
    assert.ok(run.display.includes('Plant Status'), 'the screen should show the title');
    assert.ok(run.display.some((line) => /^Soil: \d+% (DRY|WET)$/.test(line)), 'the screen should show the soil');
    assert.match(pages(run), /Temperature: \d+\.\d\dC/);
  },
  'aider-62-temp-alert': (run) => {
    assert.ok(shown(run, 'Status: (Normal|TOO HOT!|TOO COLD!)<').size >= 2, 'the status should follow the temperature');
    assert.deepEqual([...new Set(run.pins['0'])].sort(), [0, 1], 'the LED should light outside the range and go out inside it');
  },
};
/** Runs of a changed copy of the program, with what they must show, by activity id. */
const FAKE_PICO_VARIANTS = {
  // The fake clock says 09:00: a schedule entry for then must switch the relay on by itself.
  'aider-51-scheduler': {
    change: (program) => program.replace('(8, 0, 1)', '(9, 0, 1)'),
    expect: (run) => {
      assert.equal(run.responses[0].levels['0'], 0, 'the schedule should switch the relay ON at 09:00');
      assert.match(run.printed, /Schedule: ON at 09:00/);
    },
  },
};
/** Form submissions to make after the page and its links, by activity id. */
const FAKE_PICO_FORMS = {
  'aider-45-brightness': ['/?level=50', '/?level=100', '/?level=0'],
  'aider-46-timer': ['/?duration=30', '/', '/?duration=5', '/stop'],
  'aider-52-alarm': ['/?hour=9&minute=0', '/enable', '/', '/', '/'],
  'aider-55-color': ['/?r=255&g=128&b=0'],
  'aider-57-pump': ['/', '/on', '/', '/', '/', '/'],
};
const pages = (run) => run.responses.map((response) => response.text).join('\n');
/** These requests, in this order (others may come between), leave `pin` at these levels. */
function expectSequence(run, pin, steps) {
  let next = 0;
  for (const response of run.responses) {
    if (next < steps.length && response.path === steps[next][0]) {
      assert.equal(response.levels[pin], steps[next][1], `after ${steps[next][0]} (step ${next + 1}), GP${pin} should be ${steps[next][1]}`);
      next += 1;
    }
  }
  assert.equal(next, steps.length, `requests missing: ${steps.slice(next).map(([requestPath]) => requestPath).join(', ')}`);
}
/** After each of these requests, the output `pin` must be at this level when the page is sent. */
function expectLevels(run, pin, levelsByPath) {
  for (const [requestPath, level] of Object.entries(levelsByPath)) {
    const response = run.responses.find((candidate) => candidate.path === requestPath);
    assert.ok(response, `no request for ${requestPath}`);
    assert.equal(response.levels[pin], level, `after ${requestPath}, GP${pin.replace('pwm', '')} should be ${level}`);
  }
}
/** The different values `pattern` (one capture group) takes across the pages served. */
const shown = (run, pattern) => new Set([...pages(run).matchAll(new RegExp(pattern, 'g'))].map((match) => match[1]));
let fakePicoRuns = 0;
function runOnFakePico(code, where) {
  const links = [...code.matchAll(/href=["']?(\/[^"' >]*)/g)].map((match) => match[1]);
  // The page three times (sensor readings change between loads), every link on it, the forms,
  // and the icon request a browser makes after a page (its Referer names that page).
  const requests = ['/', '/', '/', ...new Set(links), ...(FAKE_PICO_FORMS[where] ?? []), '/favicon.ico'];
  const result = spawnSync(pythonCommand, [fakePico, JSON.stringify(requests)], { input: code, encoding: 'utf8' });
  assert.equal(result.status, 0, `${where}: the fake Pico failed to run:\n${result.stderr}`);
  const run = JSON.parse(result.stdout);
  assert.ok(['stopped', 'finished'].includes(run.outcome), `${where}: the program stopped with an error on the fake Pico: ${run.error ?? run.outcome}\nIt printed:\n${run.printed}`);
  if (/\.bind\(/.test(code)) {
    assert.equal(run.responses.length, requests.length, `${where}: answered ${run.responses.length} of ${requests.length} requests (${requests.join(', ')})`);
    for (const response of run.responses) {
      assert.ok(response.text.startsWith('HTTP/1.1 200 OK\r\n'), `${where}: ${response.path} got a bad HTTP reply: ${JSON.stringify(response.text.slice(0, 40))}`);
      assert.match(response.text, /<html/i, `${where}: ${response.path} got no web page`);
      assert.ok(response.closed, `${where}: the connection for ${response.path} was never closed`);
    }
  }
  fakePicoRuns += 1;
  return run;
}
if (pythonCommand) {
  for (const lesson of Object.values(LESSONS)) {
    for (const activity of lesson.activities) {
      if (activity.solutionCode === undefined) continue;
      const programs = new Set([activity.solutionCode, ...activity.steps.map((step) => step.python).filter(Boolean)]);
      for (const program of programs) {
        const run = runOnFakePico(fillPlaceholders(program), activity.id);
        if (program === activity.solutionCode) {
          FAKE_PICO_EXPECTATIONS[activity.id]?.(run);
          const variant = FAKE_PICO_VARIANTS[activity.id];
          if (variant) {
            const changed = variant.change(fillPlaceholders(program));
            assert.notEqual(changed, fillPlaceholders(program), `${activity.id}: the test's change no longer applies to the program`);
            variant.expect(runOnFakePico(changed, activity.id));
          }
        }
      }
    }
  }
}
{
  const lessonCode = 'SSID = "YOUR_WIFI_NAME"\nPASSWORD = "YOUR_PASSWORD"\nwlan.connect(SSID, PASSWORD)\n';
  const only = (current) => carryOverWifiDetails(lessonCode, current);
  // Single quotes, spaces and an open network with no password.
  assert.equal(only("SSID='Lab'\nPASSWORD = ''\n").code, 'SSID = \'Lab\'\nPASSWORD = \'\'\nwlan.connect(SSID, PASSWORD)\n');
  // Only the name typed so far: the password placeholder stays.
  assert.equal(only('SSID = "Lab"\nPASSWORD = "YOUR_PASSWORD"\n').code, 'SSID = "Lab"\nPASSWORD = "YOUR_PASSWORD"\nwlan.connect(SSID, PASSWORD)\n');
  // An empty name is not a name.
  assert.deepEqual(only('SSID = ""\n'), { code: lessonCode, carried: false });
  // Mentions inside other lines are not assignments.
  assert.deepEqual(only('print(SSID = "x")\nwlan.connect(SSID, PASSWORD)\n'), { code: lessonCode, carried: false });
}

console.log(
  `Validated ${Object.keys(LESSONS).length} lessons (${activityCount} activities, ${stepCount} steps), ` +
    `the lesson step checks, ${solutionCount} block solutions against the real code generator, ` +
    `${blockInstructionCount} block instructions against the sidebar groups, and ` +
    `${typedSolutionCount} typed-code solutions, Wi-Fi details carried into ${wifiCarryCount} programs` +
    (pythonCommand
      ? ` (${pythonChecked} MicroPython programs parsed, ${fakePicoRuns} run on a fake Pico).`
      : ' (Python not found: MicroPython programs not checked).')
);
