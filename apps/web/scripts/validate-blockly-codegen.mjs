// Generates code for every palette block with the real Blockly + generators, headlessly.
// A block fails if its generator throws or emits null / undefined / NaN / [object Object]
// anywhere in its code or in the setup/global snippets it registers.
//
// Every MicroPython result is also parsed by CPython's ast module when `python` is on PATH.
//
// Usage: node scripts/validate-blockly-codegen.mjs [--list] [--show <block_type>]
//   --list  prints every result; --show prints the full code and setup snippets for one block.
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
