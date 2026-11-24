import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTsModuleLoader } from './ts-module-loader.mjs';

// .sticial project files: export then import gives the same project, and bad files fail clearly.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, '..', 'src');
const loader = createTsModuleLoader(srcRoot);
const { buildProjectFile, parseProjectFile, projectFileName } = loader.loadModule(path.join(srcRoot, 'lib', 'projects', 'projectFile.ts'));

const meta = { board: 'Arduino Uno', mode: 'block', language: 'cpp', generator: 'arduino', environment: 'virtual' };
const files = [
  { id: 'db-1', name: 'src', type: 'folder', content: '', parentId: null },
  { id: 'db-2', name: 'main.blockly', type: 'blockly', content: '<xml><block type="arduino_setup_loop"></block></xml>', parentId: 'db-1' },
  { id: 'db-3', name: 'main.cpp', type: 'cpp', content: 'void setup() {}\nvoid loop() {}\n', parentId: null },
  { id: 'db-4', name: 'circuit.json', type: 'json', content: '{"version":1,"components":[{"id":"led-1","type":"LED"}],"nets":[]}', parentId: null },
];

const text = buildProjectFile('Blink (Ama)', meta, files, '2026-11-24T00:00:00.000Z');
const document = JSON.parse(text);
assert.equal(document.format, 'sticial-studio-project');
assert.deepEqual(document.files.map((file) => file.path), ['circuit.json', 'main.cpp', 'src', 'src/main.blockly'], 'files are stored by path');
assert.ok(!text.includes('db-1'), 'database ids are not exported');

let counter = 0;
const imported = parseProjectFile(text, () => `new-${counter++}`);
assert.equal(imported.name, 'Blink (Ama)');
assert.deepEqual(imported.meta, meta);
const byName = Object.fromEntries(imported.files.map((file) => [file.name, file]));
assert.equal(byName['main.cpp'].content, files[2].content);
assert.equal(byName['circuit.json'].content, files[3].content);
assert.equal(byName['main.blockly'].parentId, byName.src.id, 'folders are rebuilt from paths');
assert.equal(byName.src.type, 'folder');
assert.equal(new Set(imported.files.map((file) => file.id)).size, imported.files.length, 'fresh unique ids');

// Exporting the import again gives the same file (round trip).
assert.equal(buildProjectFile(imported.name, imported.meta, imported.files, '2026-11-24T00:00:00.000Z'), text);

// Bad files fail with a message a learner can act on.
const fails = (input, pattern) => assert.throws(() => parseProjectFile(input), pattern);
fails('not json at all', /not a Sticial Studio project file/);
fails(JSON.stringify({ format: 'something-else' }), /not a Sticial Studio project file/);
fails(JSON.stringify({ ...document, version: 99 }), /newer version/);
fails(JSON.stringify({ ...document, files: [] }), /empty/);
fails(JSON.stringify({ ...document, meta: null }), /board settings/);

// Paths cannot climb out of the project.
const sneaky = parseProjectFile(JSON.stringify({ ...document, files: [{ path: '../../evil.cpp', type: 'cpp', content: 'x' }] }));
assert.deepEqual(sneaky.files.map((file) => [file.name, file.parentId]), [['evil.cpp', null]]);

assert.equal(projectFileName('Traffic light: v2?'), 'Traffic light v2.sticial');
assert.equal(projectFileName('   '), 'Sticial project.sticial');

console.log('Validated .sticial project files: round trip, folders, and clear errors for bad files.');
