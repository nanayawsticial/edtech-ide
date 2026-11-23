// Draws apps/desktop/app-icon.png (1024x1024): a violet rounded tile with two white stacked
// code blocks. `tauri icon app-icon.png` turns it into every size the installer needs.
// No dependencies: shapes are rasterised with 4x4 supersampling and written as a PNG via zlib.
//
// Usage: node apps/desktop/scripts/make-app-icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SIZE = 1024;
const SAMPLES = 4;
const outFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app-icon.png');

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

// A block: rounded body, a tab on top (cut out as a notch) and a tab below (sticking out).
function insideBlock(x, y, left, top, right, bottom) {
  const tabLeft = left + 70;
  const tabRight = tabLeft + 120;
  const notch = insideRoundedRect(x, y, tabLeft, top - 30, tabRight, top + 34, 18);
  const body = insideRoundedRect(x, y, left, top, right, bottom, 44);
  const tab = insideRoundedRect(x, y, tabLeft, bottom - 30, tabRight, bottom + 34, 18);
  return (body && !notch) || tab;
}

function sample(x, y) {
  if (!insideRoundedRect(x, y, 40, 40, SIZE - 40, SIZE - 40, 220)) return null; // transparent
  const t = (y - 40) / (SIZE - 80);
  const tile = [138 + (91 - 138) * t, 86 + (47 - 86) * t, 255 + (214 - 255) * t]; // #8a56ff -> #5b2fd6
  if (insideBlock(x, y, 250, 300, 700, 470)) return [255, 255, 255];
  if (insideBlock(x, y, 250, 520, 780, 700)) return [236, 228, 255];
  return tile;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  const row = y * (SIZE * 4 + 1);
  raw[row] = 0; // filter: none
  for (let x = 0; x < SIZE; x += 1) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SAMPLES; sy += 1) {
      for (let sx = 0; sx < SAMPLES; sx += 1) {
        const color = sample(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES);
        if (!color) continue;
        r += color[0]; g += color[1]; b += color[2]; a += 1;
      }
    }
    const offset = row + 1 + x * 4;
    if (a > 0) {
      raw[offset] = Math.round(r / a);
      raw[offset + 1] = Math.round(g / a);
      raw[offset + 2] = Math.round(b / a);
    }
    raw[offset + 3] = Math.round((a / (SAMPLES * SAMPLES)) * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(outFile, png);
console.log(`Wrote ${path.relative(process.cwd(), outFile)} (${(png.length / 1024).toFixed(0)} KB)`);
