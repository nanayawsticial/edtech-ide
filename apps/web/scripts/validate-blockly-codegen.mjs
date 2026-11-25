// Generates code for every palette block with the real Blockly + generators, headlessly.
// A block fails if its generator throws or emits null / undefined / NaN / [object Object]
// anywhere in its code or in the setup/global snippets it registers.
//
// Every MicroPython result is also parsed by CPython's ast module when `python` is on PATH.
//
// Usage: node scripts/validate-blockly-codegen.mjs [--list] [--show <block_type>]
//   --list  prints every result; --show prints the full code and setup snippets for one block
//   (--show code-line-map prints the sample program used to test the block <-> code line map).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '..');
const srcRoot = path.join(webRoot, 'src');
const listAll = process.argv.includes('--list');
const showIndex = process.argv.indexOf('--show');
const showType = showIndex >= 0 ? process.argv[showIndex + 1] : null;

function resolveWithExtensions(basePath) {
  const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`, path.join(basePath, 'index.ts')];
  const match = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!match) throw new Error(`Unable to resolve module ${basePath}`);
  return match;
}

const moduleCache = new Map();
function loadModule(filePath) {
  const absolutePath = resolveWithExtensions(path.resolve(filePath));
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath);

  const transpiled = ts.transpileModule(fs.readFileSync(absolutePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: absolutePath,
  });
  const moduleRecord = { exports: {} };
  moduleCache.set(absolutePath, moduleRecord.exports);
  const localRequire = (specifier) => {
    if (specifier.startsWith('@/')) return loadModule(path.join(srcRoot, specifier.slice(2)));
    if (specifier.startsWith('.')) return loadModule(path.resolve(path.dirname(absolutePath), specifier));
    return require(specifier);
  };
  new Function('require', 'module', 'exports', '__filename', '__dirname', transpiled.outputText)(
    localRequire,
    moduleRecord,
    moduleRecord.exports,
    absolutePath,
    path.dirname(absolutePath)
  );
  moduleCache.set(absolutePath, moduleRecord.exports);
  return moduleRecord.exports;
}

const Blockly = require('blockly');
const { defineCustomBlocks } = loadModule(path.join(srcRoot, 'lib/blockly/blocks.ts'));
const { arduinoGenerator, micropythonGenerator } = loadModule(path.join(srcRoot, 'lib/blockly/generator.ts'));
const { setBlockMarkers, stripBlockMarkers } = loadModule(path.join(srcRoot, 'lib/blockly/codeLineMap.ts'));
const { buildSourceCodeFromBlocklyWorkspace } = loadModule(path.join(srcRoot, 'lib/blockly/codegen.ts'));
defineCustomBlocks();

// Registry entries and the set of types the toolbox actually offers.
const registrySource = fs.readFileSync(path.join(srcRoot, 'lib/blockly/registry.ts'), 'utf8');
const entries = [...registrySource.matchAll(/\{\s*type:\s*'([^']+)'[^}]*?generators:\s*\[([^\]]*)\]/g)].map((m) => ({
  type: m[1],
  generators: [...m[2].matchAll(/'([^']+)'/g)].map((g) => g[1]),
}));
const toolboxTypes = new Set([...registrySource.matchAll(/block\('([^']+)'/g)].map((m) => m[1]));

const generators = { arduino: arduinoGenerator, micropython: micropythonGenerator };
// No letter on either side, so identifiers like np_null / servo_null are caught too.
const SUSPICIOUS = /(?<![A-Za-z])(null|undefined|NaN)(?![A-Za-z])|\[object Object\]/;

function fillInputs(workspace, block) {
  for (const input of block.inputList) {
    if (input.type !== Blockly.inputs.inputTypes.VALUE || !input.connection) continue;
    const check = input.connection.getCheck() || [];
    let filler;
    if (check.includes('Boolean')) {
      filler = workspace.newBlock('logic_boolean');
    } else if (check.includes('String') && !check.includes('Number')) {
      filler = workspace.newBlock('text');
      filler.setFieldValue('hi', 'TEXT');
    } else if (check.includes('Array')) {
      continue; // no list blocks in the palette; generators must fall back
    } else {
      filler = workspace.newBlock('math_number');
      filler.setFieldValue('1', 'NUM');
    }
    filler.setShadow(true);
    input.connection.connect(filler.outputConnection);
  }
}

function generate(generatorName, type) {
  const generator = generators[generatorName];
  const workspace = new Blockly.Workspace();
  try {
    const block = workspace.newBlock(type);
    fillInputs(workspace, block);
    generator.init(workspace);
    const result = generator.blockToCode(block);
    const code = Array.isArray(result) ? result[0] : result;
    const snippets = Object.values(generator.setups_ || {}).filter((value) => typeof value === 'string');
    const everything = [code, ...snippets].join('\n');
    const suspicious = everything.match(SUSPICIOUS);
    if (typeof code !== 'string') return { ok: false, reason: `returned ${typeof code}` };
    if (type === showType) {
      console.log(`--- ${generatorName} ${type} ---\n${snippets.join('\n\n')}\n\n${code}\n`);
    }
    if (suspicious) {
      const line = everything.split('\n').find((l) => SUSPICIOUS.test(l)) || '';
      return { ok: false, reason: `emits "${suspicious[0]}": ${line.trim().slice(0, 90)}` };
    }
    // Block <-> line markers must never change the code: generate again with them on and strip them.
    generator.init(workspace);
    setBlockMarkers(generator, true);
    let markedResult;
    try {
      markedResult = generator.blockToCode(block);
    } finally {
      setBlockMarkers(generator, false);
    }
    const markedCode = Array.isArray(markedResult) ? markedResult[0] : markedResult;
    const markedSnippets = Object.values(generator.setups_ || {}).filter((value) => typeof value === 'string');
    if (stripBlockMarkers(markedCode) !== code || stripBlockMarkers(markedSnippets.join('\n')) !== snippets.join('\n')) {
      return { ok: false, reason: 'code changes when block line markers are on' };
    }
    // A program the Python parser can check: setup snippets, then the block (values are assigned).
    const program = `${snippets.join('\n')}\n${Array.isArray(result) ? `_value = ${code}` : code}\n`;
    return { ok: true, code, program };
  } catch (error) {
    return { ok: false, reason: `throws: ${String(error.message || error).slice(0, 120)}` };
  } finally {
    workspace.dispose();
  }
}

const failures = [];
const pythonPrograms = [];
let checked = 0;
for (const entry of entries) {
  if (!toolboxTypes.has(entry.type)) continue;
  for (const generatorName of entry.generators) {
    if (!generators[generatorName]) continue;
    checked += 1;
    const result = generate(generatorName, entry.type);
    if (!result.ok) {
      failures.push(`${generatorName.padEnd(11)} ${entry.type}: ${result.reason}`);
      continue;
    }
    if (generatorName === 'micropython') pythonPrograms.push({ type: entry.type, program: result.program });
    if (listAll) console.log(`ok          ${generatorName.padEnd(11)} ${entry.type}: ${result.code.trim().split('\n')[0].slice(0, 70)}`);
  }
}

// Block <-> code line map on a whole program: nested loops, siblings, setup and loop.
const MAP_SAMPLE_XML = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="arduino_setup_loop" id="root" x="0" y="0">
    <statement name="SETUP">
      <block type="arduino_pinMode" id="mode"><field name="PIN">13</field><field name="MODE">OUTPUT</field>
        <next><block type="arduino_serialPrint" id="print"><value name="TEXT"><shadow type="text"><field name="TEXT">ready</field></shadow></value></block></next>
      </block>
    </statement>
    <statement name="LOOP">
      <block type="controls_repeat" id="repeat">
        <field name="TIMES">3</field>
        <statement name="DO">
          <block type="arduino_digitalWrite" id="on"><field name="PIN">13</field><field name="STATE">HIGH</field>
            <next><block type="time_wait_seconds" id="wait"><value name="SECONDS"><shadow type="math_number" id="secs"><field name="NUM">1</field></shadow></value></block></next>
          </block>
        </statement>
        <next><block type="arduino_digitalWrite" id="off"><field name="PIN">13</field><field name="STATE">LOW</field></block></next>
      </block>
    </statement>
  </block>
</xml>`;
// "mode" (set pin) writes its line through setups_, so it is mapped as a 'setup' range.
const MAP_EXPECTED_TEXT = {
  arduino: { mode: 'pinMode(13, OUTPUT)', print: 'Serial.print', repeat: 'for', on: 'HIGH', wait: 'delay(', off: 'LOW' },
  micropython: { mode: 'machine.Pin(13', print: 'print(', repeat: 'for', on: '(1)', wait: 'time.sleep', off: '(0)' },
};
for (const generatorName of Object.keys(generators)) {
  checked += 1;
  const workspace = new Blockly.Workspace();
  const fail = (reason) => failures.push(`${generatorName.padEnd(11)} code line map: ${reason}`);
  try {
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(MAP_SAMPLE_XML), workspace);
    const { code, blockLineRanges } = buildSourceCodeFromBlocklyWorkspace(workspace, generatorName);
    const lines = code.split('\n');
    if (/[-]/.test(code)) fail('markers leaked into the generated code');
    if (Object.values(generators).some((generator) => generator.markBlockIds_)) fail('markers were left switched on');
    if (generatorName === 'micropython') pythonPrograms.push({ type: 'code line map sample', program: code });
    for (const [id, expected] of Object.entries(MAP_EXPECTED_TEXT[generatorName])) {
      const ranges = blockLineRanges[id] || [];
      if (ranges.length === 0) {
        fail(`no lines recorded for block "${id}"`);
        continue;
      }
      for (const range of ranges) {
        if (range.start < 1 || range.end > lines.length || range.start > range.end) fail(`block "${id}" has an impossible range ${range.start}-${range.end}`);
      }
      // A block can own several ranges (e.g. print owns its line and Serial.begin()); one must match.
      const texts = ranges.map((range) => lines.slice(range.start - 1, range.end).join('\n'));
      if (!texts.some((text) => text.includes(expected))) {
        fail(`block "${id}" maps to ${ranges.map((r) => `${r.start}-${r.end}`).join(', ')} ("${texts.join(' | ').trim().slice(0, 60)}"), expected "${expected}"`);
      }
    }
    const [repeat] = blockLineRanges.repeat || [];
    for (const child of ['on', 'wait']) {
      const [range] = blockLineRanges[child] || [];
      if (repeat && range && (range.start < repeat.start || range.end > repeat.end)) fail(`block "${child}" is not inside the repeat loop's lines`);
    }
    if (blockLineRanges.secs) fail('value blocks should not get their own lines');
    if (showType === 'code-line-map') console.log(`--- ${generatorName} code line map ---\n${code}\n${JSON.stringify(blockLineRanges)}\n`);
  } catch (error) {
    fail(`throws: ${String(error.message || error).slice(0, 120)}`);
  } finally {
    workspace.dispose();
  }
}

// Whole-program order and pin setup. Part setup (Serial.begin, pinMode, pin objects) must run
// before the user's own setup blocks, and every pin a digital block uses must exist first.
function generateProgram(xml, generatorName) {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), workspace);
    return buildSourceCodeFromBlocklyWorkspace(workspace, generatorName).code;
  } finally {
    workspace.dispose();
  }
}
const rootXml = (setup, loop) => `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="arduino_setup_loop" x="0" y="0"><statement name="SETUP">${setup}</statement><statement name="LOOP">${loop}</statement></block>
</xml>`;
const writePin13 = (state, next = '') =>
  `<block type="arduino_digitalWrite"><field name="PIN">13</field><field name="STATE">${state}</field>${next ? `<next>${next}</next>` : ''}</block>`;
const ORDER_SAMPLES = {
  // The map sample: set pin + print in setup, nested loop.
  sample: MAP_SAMPLE_XML,
  // No "set pin" block: digital write must still create/configure the pin.
  writeOnly: rootXml('', writePin13('HIGH')),
  // "set pin 13 to INPUT" then digital write: the user's explicit mode must win.
  explicitInput: rootXml('<block type="arduino_pinMode"><field name="PIN">13</field><field name="MODE">INPUT</field></block>', writePin13('HIGH')),
  // Variables (Blockly's built-in category, not in the registry) and "count with" counting down.
  variables: `<xml xmlns="https://developers.google.com/blockly/xml"><variables><variable id="v">count</variable></variables>
  <block type="arduino_setup_loop" x="0" y="0"><statement name="LOOP">
    <block type="variables_set"><field name="VAR" id="v">count</field><value name="VALUE"><shadow type="math_number"><field name="NUM">5</field></shadow></value>
      <next><block type="math_change"><field name="VAR" id="v">count</field><value name="DELTA"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
        <next><block type="controls_for_loop"><field name="VAR" id="v">count</field>
          <value name="FROM"><shadow type="math_number"><field name="NUM">10</field></shadow></value>
          <value name="TO"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
          <value name="BY"><shadow type="math_number"><field name="NUM">2</field></shadow></value>
          <statement name="DO"><block type="arduino_serialPrintln"><value name="TEXT"><block type="variables_get"><field name="VAR" id="v">count</field></block></value></block></statement>
        </block></next>
      </block></next>
    </block>
  </statement></block></xml>`,
};
const lineIndex = (lines, pattern) => lines.findIndex((line) => pattern.test(line));
for (const generatorName of Object.keys(generators)) {
  checked += 1;
  const fail = (reason) => failures.push(`${generatorName.padEnd(11)} program order: ${reason}`);
  try {
    const programs = Object.fromEntries(Object.entries(ORDER_SAMPLES).map(([name, xml]) => [name, generateProgram(xml, generatorName)]));
    if (showType === 'program-order') {
      for (const [name, code] of Object.entries(programs)) console.log(`--- ${generatorName} ${name} ---\n${code}`);
    }
    if (generatorName === 'micropython') {
      for (const [name, code] of Object.entries(programs)) pythonPrograms.push({ type: `program order ${name}`, program: code });
    }

    if (generatorName === 'arduino') {
      const lines = programs.sample.split('\n');
      const begin = lineIndex(lines, /Serial\.begin\(/);
      const print = lineIndex(lines, /Serial\.print\(/);
      const mode = lineIndex(lines, /pinMode\(13, OUTPUT\)/);
      if (begin < 0 || print < 0 || begin > print) fail('Serial.begin() must come before the first Serial.print() in setup()');
      if (mode < 0 || mode > print) fail('pinMode() from "set pin" must come before the user\'s setup blocks');
      if (!/^  Serial\.print\(/m.test(programs.sample)) fail('setup() body should be indented 2 spaces');
      if (!/^  for \(/m.test(programs.sample) || !/^    digitalWrite\(13, HIGH\)/m.test(programs.sample)) fail('loop() body should be indented 2 spaces, nested blocks 4');
      if (!/pinMode\(13, OUTPUT\);/.test(programs.writeOnly)) fail('digital write without "set pin" must add pinMode(13, OUTPUT)');
      if (/pinMode\(13, OUTPUT\)/.test(programs.explicitInput) || !/pinMode\(13, INPUT\)/.test(programs.explicitInput)) fail('an explicit "set pin 13 to INPUT" must not be replaced');
      if (!/^long count = 0;/m.test(programs.variables)) fail('variables must be declared as globals (long count = 0;)');
      if (!/count = 5;/.test(programs.variables) || !/count \+= 2;/.test(programs.variables)) fail('set / change variable blocks are missing');
      if (!/for \(long count = 10; count >= 0; count -= 2\)/.test(programs.variables)) fail('"count with from 10 to 0 by 2" must count down');
    } else {
      for (const [name, code] of Object.entries(programs)) {
        const lines = code.split('\n');
        const defined = lineIndex(lines, /^pin_13 = machine\.Pin\(13/);
        const used = lineIndex(lines, /pin_13\.value\(/);
        if (used >= 0 && (defined < 0 || defined > used)) fail(`${name}: pin_13 is used before it is created`);
      }
      const lines = programs.sample.split('\n');
      const pin = lineIndex(lines, /^pin_13 = /);
      const print = lineIndex(lines, /^print\(/);
      if (pin < 0 || print < 0 || pin > print) fail('part setup (pin objects) must come before the user\'s setup blocks');
      if (!/machine\.Pin\(13, machine\.Pin\.IN\)/.test(programs.explicitInput)) fail('an explicit "set pin 13 to INPUT" must not be replaced');
      if (!/for count in range\(10, -1, -2\)/.test(programs.variables)) fail('"count with from 10 to 0 by 2" must count down');
      if (!/^count = 0$/m.test(programs.variables)) fail('variables must start at 0');
    }
  } catch (error) {
    fail(`throws: ${String(error.message || error).slice(0, 120)}`);
  }
}

// Blocks for a part placed in Circuit Lab must use the board pin id (12), never its display
// label (D12): `pinMode(D12, OUTPUT)` does not compile for an Arduino Uno.
{
  const snapshot = {
    components: [{
      componentId: 'led-1',
      primaryBoardPinId: '12',
      primaryBoardPin: 'D12',
      pinMappings: { SIG: { pinId: 'SIG', boardPinId: '12', boardPinLabel: 'D12' } },
    }],
  };
  const previousWindow = globalThis.window;
  globalThis.window = { ...(previousWindow || {}), __CIRCUIT_CODING_SNAPSHOT: snapshot };
  try {
    for (const [generatorName, generator] of Object.entries(generators)) {
      checked += 1;
      const workspace = new Blockly.Workspace();
      try {
        const block = workspace.newBlock('arduino_led_set');
        block.getFieldValue = (name) => ({ SENSOR: 'led-1', STATE: 'HIGH' })[name] ?? null;
        generator.init(workspace);
        const code = generator.blockToCode(block);
        const everything = [code, ...Object.values(generator.setups_ || {})].join('\n');
        if (showType === 'circuit-pins') console.log(`--- ${generatorName} circuit LED on D12 ---\n${everything}\n`);
        if (/D12/.test(everything)) failures.push(`${generatorName.padEnd(11)} circuit LED: uses the pin label D12 instead of 12`);
        if (!/\b12\b/.test(everything)) failures.push(`${generatorName.padEnd(11)} circuit LED: pin 12 missing from the code`);
      } catch (error) {
        failures.push(`${generatorName.padEnd(11)} circuit LED: throws ${String(error.message || error).slice(0, 120)}`);
      } finally {
        workspace.dispose();
      }
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

// Syntax-check the MicroPython output in one Python process (skipped when Python isn't installed).
const PARSE_ALL = `
import ast, json, sys
for item in json.load(sys.stdin):
    try:
        ast.parse(item["program"])
    except SyntaxError as error:
        print(f'{item["type"]}: line {error.lineno}: {error.msg}: {(error.text or "").strip()}')
`;
let python = null;
for (const command of ['python3', 'python']) {
  const run = spawnSync(command, ['-I', '-c', PARSE_ALL], { input: JSON.stringify(pythonPrograms), encoding: 'utf8' });
  if (!run.error && run.status === 0) {
    python = run;
    break;
  }
}
if (python) {
  for (const line of python.stdout.split('\n').filter(Boolean)) failures.push(`micropython ${line.replace(':', ': invalid Python:')}`);
} else {
  console.warn('Python not found; skipped the MicroPython syntax check.');
}

if (failures.length > 0) {
  console.error(`Blockly codegen validation failed: ${failures.length} of ${checked} block/generator pairs.`);
  for (const failure of failures) console.error(`- ${failure}`);
  // exitCode (not process.exit) so piped output is fully flushed before the process ends.
  process.exitCode = 1;
} else {
  console.log(`Blockly codegen validation OK. Generated ${checked} block/generator pairs without errors.`);
}
