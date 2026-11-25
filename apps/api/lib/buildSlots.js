const fs = require('fs').promises;
const os = require('os');
const path = require('path');

/**
 * Reusable compile folders. arduino-cli reuses what it built last time (the Arduino core,
 * libraries, unchanged files) when a sketch is compiled again in the same folder with the same
 * build path, which roughly halves compile time. Each slot is one sketch folder plus its build
 * folder, used by one compile at a time; a board gets a few slots so several learners can
 * compile at once, and further compiles wait for a free slot.
 */

const SLOTS_PER_BOARD = 3;
const SKETCH_NAME = 'sketch';
const ROOT = path.join(os.tmpdir(), 'sticial-compile');

/** board key -> [{ busy }] */
const slotsByBoard = new Map();
/** board key -> [resolve] */
const waitersByBoard = new Map();

function boardKey(fqbn) {
  return fqbn.replace(/[^a-zA-Z0-9]+/g, '-');
}

function slotPaths(key, index) {
  const slotDir = path.join(ROOT, `${key}-${index}`);
  const sketchDir = path.join(slotDir, SKETCH_NAME);
  return {
    sketchDir,
    buildPath: path.join(slotDir, 'build'),
    sketchName: SKETCH_NAME,
    primarySketchPath: `${SKETCH_NAME}.ino`,
  };
}

/** Empties the sketch folder (not the build folder) so files from the last compile cannot leak in. */
async function resetSketchDir(sketchDir) {
  await fs.rm(sketchDir, { recursive: true, force: true });
  await fs.mkdir(sketchDir, { recursive: true });
}

/**
 * Waits for a free slot for this board. Resolves to its folders and a release() that must be
 * called once the compile is finished (success or not).
 */
async function acquireBuildSlot(fqbn) {
  const key = boardKey(fqbn);
  if (!slotsByBoard.has(key)) {
    slotsByBoard.set(key, Array.from({ length: SLOTS_PER_BOARD }, () => ({ busy: false })));
    waitersByBoard.set(key, []);
  }
  const slots = slotsByBoard.get(key);

  let index = slots.findIndex((slot) => !slot.busy);
  while (index === -1) {
    await new Promise((resolve) => waitersByBoard.get(key).push(resolve));
    index = slots.findIndex((slot) => !slot.busy);
  }
  slots[index].busy = true;

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    slots[index].busy = false;
    const next = waitersByBoard.get(key).shift();
    if (next) next();
  };

  const paths = slotPaths(key, index);
  try {
    await resetSketchDir(paths.sketchDir);
  } catch (error) {
    release();
    throw error;
  }
  return { ...paths, release };
}

module.exports = { acquireBuildSlot, SLOTS_PER_BOARD };
