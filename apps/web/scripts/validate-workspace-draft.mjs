import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTsModuleLoader } from './ts-module-loader.mjs';

// The recovery copy of unsaved work: when a draft counts as work, and when it comes back.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, '..', 'src');
const loader = createTsModuleLoader(srcRoot);
const { buildWorkspaceDraft, draftScope, hasWorkInProgress, shouldRestoreDraft, workspaceSignature } = loader.loadModule(
  path.join(srcRoot, 'lib', 'projects', 'workspaceDraft.ts')
);
const { DEFAULT_ARDUINO_CODE } = loader.loadModule(path.join(srcRoot, 'templates', 'codeTemplates.ts'));

const XML_NS = 'https://developers.google.com/blockly/xml';
const emptyBlocks = `<xml xmlns="${XML_NS}"><block type="arduino_setup_loop" id="root" x="20" y="20"></block></xml>`;
const blinkBlocks = `<xml xmlns="${XML_NS}"><block type="arduino_setup_loop" id="root"><statement name="LOOP"><block type="arduino_digitalWrite" id="w"><field name="PIN">13</field></block></statement></block></xml>`;

const file = (name, type, content) => ({ id: `id-${name}`, name, type, content, parentId: null });
const blockFiles = (xml) => [file('main.blockly', 'blockly', xml), file('main.cpp', 'cpp', 'void setup() {}\nvoid loop() {}\n')];
const noCircuit = { components: [], nets: [] };
const led = { components: [{ id: 'led-1', type: 'LED', x: 10, y: 20, rotation: 0, state: {} }], nets: [] };
const blockMeta = { board: 'Arduino Uno', codingMode: 'block', language: 'cpp', generator: 'arduino', environment: 'virtual' };

assert.equal(draftScope(null), 'scratch');
assert.equal(draftScope('abc'), 'project:abc');

// What counts as work worth keeping.
assert.equal(hasWorkInProgress({ files: blockFiles(emptyBlocks), circuit: noCircuit }, 'block'), false, 'an empty setup/loop block is not work');
assert.equal(hasWorkInProgress({ files: blockFiles(blinkBlocks), circuit: noCircuit }, 'block'), true, 'a block inside loop is work');
assert.equal(hasWorkInProgress({ files: blockFiles(emptyBlocks), circuit: led }, 'block'), true, 'a part on the canvas is work');
assert.equal(hasWorkInProgress({ files: [file('main.cpp', 'cpp', DEFAULT_ARDUINO_CODE)], circuit: noCircuit }, 'text'), false, 'starter code is not work');
assert.equal(
  hasWorkInProgress({ files: [file('main.cpp', 'cpp', DEFAULT_ARDUINO_CODE.replace('\n\n}', '\n  pinMode(13, OUTPUT);\n}'))], circuit: noCircuit }, 'text'),
  true,
  'edited code is work'
);

// The signature ignores circuit.json (the circuit is compared directly) and file order.
const a = { files: [...blockFiles(blinkBlocks), file('circuit.json', 'json', 'stale')], circuit: led };
const b = { files: [...blockFiles(blinkBlocks)].reverse(), circuit: led };
assert.equal(workspaceSignature(a), workspaceSignature(b));
assert.notEqual(workspaceSignature(a), workspaceSignature({ ...b, circuit: noCircuit }));

// When a draft comes back.
const draft = buildWorkspaceDraft('scratch', 'My blink', { files: blockFiles(blinkBlocks), circuit: led }, blockMeta, 1);
const emptyNow = { files: blockFiles(emptyBlocks), circuit: noCircuit };
assert.equal(shouldRestoreDraft(draft, emptyNow, blockMeta), true, 'unsaved work comes back into an empty workspace');
assert.equal(shouldRestoreDraft(null, emptyNow, blockMeta), false);
assert.equal(shouldRestoreDraft(draft, { files: blockFiles(blinkBlocks), circuit: led }, blockMeta), false, 'nothing to bring back when the workspace already matches');
assert.equal(shouldRestoreDraft(draft, emptyNow, { ...blockMeta, board: 'ESP32' }), false, 'a draft for another board stays away');
assert.equal(shouldRestoreDraft(draft, emptyNow, { ...blockMeta, codingMode: 'text' }), false, 'a block draft does not land in text mode');
const emptyDraft = buildWorkspaceDraft('scratch', 'Nothing', emptyNow, blockMeta, 1);
assert.equal(shouldRestoreDraft(emptyDraft, { files: blockFiles(blinkBlocks), circuit: noCircuit }, blockMeta), false, 'an empty draft never replaces work');
assert.equal(shouldRestoreDraft({ ...draft, version: 99 }, emptyNow, blockMeta), false, 'unknown draft versions are ignored');

console.log('Validated workspace drafts: what counts as unsaved work, and when a draft comes back.');
