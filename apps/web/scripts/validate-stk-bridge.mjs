import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createTsModuleLoader } from './ts-module-loader.mjs';

// The upload bridge against a fake Uno bootloader (STK500v1, like Optiboot) that answers BEFORE the
// write is confirmed, which is what the desktop app's native serial bridge does. A full upload must
// succeed through createStkBridge, and the same board must defeat a naive bridge (the old code).

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, '..', 'src');
const loader = createTsModuleLoader(srcRoot);
const { createStkBridge } = loader.loadModule(path.join(srcRoot, 'lib', 'serial', 'stkBridge.ts'));
const { default: STK500 } = await import('stk500-esm');
const { Duplex } = require('stream-browserify');

const UNO = { name: 'Arduino Uno', baudRate: 115200, signature: new Uint8Array([0x1e, 0x95, 0x0f]), pageSize: 128, timeout: 400 };

/** A tiny Optiboot: one command per write, replies right away. */
function fakeBootloader(reply) {
  const flash = new Uint8Array(32 * 1024).fill(0xff);
  let address = 0;
  const ok = () => reply([0x14, 0x10]);
  return {
    flash,
    receive(bytes) {
      const command = bytes[0];
      if (command === 0x75) return reply([0x14, 0x1e, 0x95, 0x0f, 0x10]); // read signature
      if (command === 0x55) {
        address = (bytes[1] | (bytes[2] << 8)) * 2; // word address
        return ok();
      }
      if (command === 0x64) {
        const length = (bytes[1] << 8) | bytes[2];
        flash.set(bytes.slice(4, 4 + length), address);
        return ok();
      }
      if (command === 0x74) {
        const length = (bytes[1] << 8) | bytes[2];
        return reply([0x14, ...flash.slice(address, address + length), 0x10]);
      }
      return ok(); // sync, set options, enter/leave programming mode
    },
  };
}

function intelHex(bytes) {
  const lines = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const record = [chunk.length, (offset >> 8) & 0xff, offset & 0xff, 0, ...chunk];
    const checksum = (0x100 - (record.reduce((sum, byte) => sum + byte, 0) & 0xff)) & 0xff;
    lines.push(`:${[...record, checksum].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`);
  }
  return `${lines.join('\n')}\n:00000001FF\n`;
}

const program = Uint8Array.from({ length: 300 }, (_, index) => (index * 7 + 3) & 0xff);
const hex = intelHex(program);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The write is confirmed 5 ms after the board has already replied (desktop bridge timing).
async function uploadThrough(makeBridge) {
  let board;
  const bridge = makeBridge(async (bytes) => {
    board.receive(Uint8Array.from(bytes));
    await sleep(5);
  });
  board = fakeBootloader((reply) => setImmediate(() => bridge.deliver(Uint8Array.from(reply))));
  const stk = new STK500(bridge.stream, UNO, { quiet: true });
  await stk.bootload(hex, () => {});
  bridge.destroy();
  return board.flash;
}

const flash = await uploadThrough(createStkBridge);
assert.deepEqual(Array.from(flash.slice(0, program.length)), Array.from(program), 'the program lands in flash');

// The old bridge pushed straight into the stream, losing replies that beat the write confirmation.
function naiveBridge(write) {
  const stream = new Duplex({
    read() {},
    write(chunk, _encoding, callback) {
      write(chunk).then(() => callback(), callback);
    },
  });
  return { stream, deliver: (bytes) => stream.push(bytes), destroy: () => stream.destroy() };
}
await assert.rejects(uploadThrough(naiveBridge), /Sync failed/, 'the old bridge misses early replies (the desktop failure)');

console.log('Validated the upload bridge: a full upload works when the board answers before the write is confirmed.');
