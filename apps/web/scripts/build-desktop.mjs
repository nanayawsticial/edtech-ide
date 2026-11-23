// Static export of the web app for the desktop app (apps/desktop), written to apps/web/out.
//
// A static export cannot contain route handlers or the request proxy, and the desktop app does
// not need them (it answers /api/* itself, see src/lib/desktop/desktopApi.ts). This script moves
// those server-only files aside, runs `next build` in desktop mode, and always moves them back.
//
// Usage (from apps/web): npm run build:desktop
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stashRoot = path.join(webRoot, '.desktop-build-stash');
const SERVER_ONLY = ['src/app/api', 'src/proxy.ts'];

function move(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}

if (fs.existsSync(stashRoot)) {
  console.error(
    `A previous desktop build did not finish cleanly: ${path.relative(process.cwd(), stashRoot)} still holds\n` +
      `server files. Move its contents back into apps/web (same relative paths), delete the folder, and retry.`
  );
  process.exit(1);
}

const moved = [];
let exitCode = 1;
try {
  for (const relative of SERVER_ONLY) {
    const source = path.join(webRoot, relative);
    if (!fs.existsSync(source)) continue;
    move(source, path.join(stashRoot, relative));
    moved.push(relative);
  }

  fs.rmSync(path.join(webRoot, 'out'), { recursive: true, force: true });
  const result = spawnSync('npx', ['next', 'build'], {
    cwd: webRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, STICIAL_DESKTOP_BUILD: '1' },
  });
  exitCode = result.status ?? 1;
} finally {
  for (const relative of moved.reverse()) {
    move(path.join(stashRoot, relative), path.join(webRoot, relative));
  }
  fs.rmSync(stashRoot, { recursive: true, force: true });
}

const outDir = path.join(webRoot, 'out');

// Next 16's export writes route segment data as folders (courses/__next.courses/__PAGE__.txt)
// while its client prefetches the dotted name (courses/__next.courses.__PAGE__.txt). Copy each
// file to the dotted name too, so prefetches succeed instead of 404ing into full page loads.
function addDottedSegmentFiles(dir) {
  let copied = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('__next.')) {
      const walk = (current, prefix) => {
        for (const child of fs.readdirSync(current, { withFileTypes: true })) {
          const childPath = path.join(current, child.name);
          const dotted = `${prefix}.${child.name}`;
          if (child.isDirectory()) walk(childPath, dotted);
          else if (!fs.existsSync(path.join(dir, dotted))) {
            fs.copyFileSync(childPath, path.join(dir, dotted));
            copied += 1;
          }
        }
      };
      walk(full, entry.name);
    } else {
      copied += addDottedSegmentFiles(full);
    }
  }
  return copied;
}

if (exitCode === 0) {
  if (!fs.existsSync(path.join(outDir, 'index.html'))) {
    console.error('Desktop build finished but out/index.html is missing.');
    exitCode = 1;
  } else {
    console.log(`Desktop export ready in out/ (added ${addDottedSegmentFiles(outDir)} dotted segment files).`);
  }
}
process.exit(exitCode);
