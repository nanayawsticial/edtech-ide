import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTsModuleLoader } from './ts-module-loader.mjs';

// Naming the connected board: from its USB IDs, and from a MicroPython board's own banner, and
// checking it against the project's board so the IDE can warn before uploading to the wrong one.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, '..', 'src');
const loader = createTsModuleLoader(srcRoot);
const { describeUsbBoard, parseMicroPythonBanner, micropythonBoardMatches } = loader.loadModule(
  path.join(srcRoot, 'lib', 'serial', 'boardIdentity.ts'),
);

// USB IDs, as Chrome reports them for boards a classroom has.
assert.deepEqual(describeUsbBoard({ usbVendorId: 0x2e8a, usbProductId: 0x0005 }), { name: 'Raspberry Pi Pico running MicroPython', family: 'raspberry' });
assert.deepEqual(describeUsbBoard({ usbVendorId: 0x2341, usbProductId: 0x0043 }), { name: 'Arduino Uno', family: 'arduino' });
assert.deepEqual(describeUsbBoard({ usbVendorId: 0x2341, usbProductId: 0x0042 }), { name: 'Arduino Mega 2560', family: 'arduino' });
assert.equal(describeUsbBoard({ usbVendorId: 0x2341, usbProductId: 0x7777 }).name, 'Arduino board');
assert.equal(describeUsbBoard({ usbVendorId: 0x1a86, usbProductId: 0x7523 }).family, null, 'a CH340 can be an Uno copy or an ESP32');
assert.match(describeUsbBoard({ usbVendorId: 0x1a86, usbProductId: 0x7523 }).name, /CH340/);
assert.equal(describeUsbBoard({ usbVendorId: 0x303a, usbProductId: 0x1001 }).family, 'esp');
assert.equal(describeUsbBoard({}).family, null);
assert.match(describeUsbBoard({}).name, /Bluetooth/);
assert.equal(describeUsbBoard({ usbVendorId: 0x1234, usbProductId: 0x5678 }).name, 'USB serial device (1234:5678)');

// The banner a real Pico 2 W printed (MicroPython 1.29), whole and still arriving.
const banner = '\r\nMicroPython v1.29.0 on 2026-08-24; Raspberry Pi Pico 2 W with RP2350\r\nType "help()" for more information.\r\n>>> ';
assert.deepEqual(parseMicroPythonBanner(banner), { version: 'v1.29.0', machine: 'Raspberry Pi Pico 2 W with RP2350' });
assert.equal(parseMicroPythonBanner('\r\nMicroPython v1.29.0 on 2026-08-24; Raspberry Pi Pi'), null, 'waits for the whole line');
assert.equal(parseMicroPythonBanner('Connecting to Wi-Fi...\r\n'), null, 'a running program is not a banner');
assert.equal(
  parseMicroPythonBanner('MicroPython v1.22.2 on 2024-02-22; Generic ESP32 module with ESP32\r\n')?.machine,
  'Generic ESP32 module with ESP32',
);

// The board against the project's board (names as in boardConfig).
const cases = [
  ['Raspberry Pi Pico 2 W with RP2350', 'Raspberry Pi Pico 2W', true],
  ['Raspberry Pi Pico W with RP2040', 'Raspberry Pi Pico W', true],
  ['Raspberry Pi Pico with RP2040', 'Raspberry Pi Pico', true],
  ['Raspberry Pi Pico W with RP2040', 'Raspberry Pi Pico 2W', false],
  ['Raspberry Pi Pico 2 with RP2350', 'Raspberry Pi Pico 2W', false],
  ['Raspberry Pi Pico with RP2040', 'Raspberry Pi Pico W', false],
  ['Generic ESP32 module with ESP32', 'ESP32', true],
  ['ESP module with ESP8266', 'ESP8266', true],
  ['Raspberry Pi Pico 2 W with RP2350', 'ESP32', false],
  ['Generic ESP32 module with ESP32', 'Raspberry Pi Pico 2W', false],
  ['Raspberry Pi Pico 2 W with RP2350', 'Arduino Uno', null],
];
for (const [machine, project, expected] of cases) {
  assert.equal(micropythonBoardMatches(machine, project), expected, `${machine} for a ${project} project`);
}

console.log(`Validated board naming (${cases.length} board checks, USB IDs and a real Pico 2 W banner).`);
