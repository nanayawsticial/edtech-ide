/**
 * Block <-> code line map.
 *
 * While code is generated for the preview, each statement block's code is wrapped in invisible
 * markers (Unicode private-use characters, which no generator emits). Once the full program is
 * assembled, extractBlockLineRanges() records which lines each block produced and strips the
 * markers, so the code that reaches the editor, the compiler, or the board never contains them.
 *
 * Two kinds of lines are recorded:
 * - 'code': what a statement block returns, e.g. `delay(1000);` in loop().
 * - 'setup': snippets a block registers in the generator's setups_ (includes, declarations,
 *   pinMode lines, helper functions), e.g. `pinMode(13, OUTPUT);` from "set pin".
 *
 * The code a value block returns (numbers, sensor reads, maths) is never marked. It sits inside its
 * parent's line, and some generators inspect value code (e.g. folding `wait 1 seconds` into
 * `delay(1000)`), so marking it could change the generated code. Selecting a value block highlights
 * its own setup snippets plus its parent's lines.
 */
import type * as Blockly from 'blockly';

const CODE_START = '';
const CODE_END = '';
const ID_END = '';
const SETUP_START = '';
const SETUP_END = '';
const MARKER_PATTERN = /([])([^]*)/g;

/** setups_ entries that hold whole setup()/loop() bodies (already marked block by block). */
const CONTAINER_SETUP_KEYS = new Set(['__setup_code__', '__loop_code__', 'manual_setup', 'manual_loop']);

/** 1-based, inclusive line numbers in the final generated program. */
export type CodeLineRange = { start: number; end: number; kind: 'code' | 'setup' };
export type BlockLineRanges = Record<string, CodeLineRange[]>;

type MarkableGenerator = {
  markBlockIds_?: boolean;
  setups_?: Record<string, unknown>;
  blockToCode: (block: Blockly.Block | null, opt_thisOnly?: boolean) => string | [string, number];
};

function wrap(start: string, end: string, id: string, text: string) {
  // The end marker goes before trailing newline(s) so it lands on the last line of the text.
  const trailing = text.match(/\n*$/)?.[0] ?? '';
  const body = text.slice(0, text.length - trailing.length);
  return `${start}${id}${ID_END}${body}${end}${id}${ID_END}${trailing}`;
}

/** Turn block markers on or off for a generator. buildSourceCodeFromBlocklyWorkspace turns them on. */
export function setBlockMarkers(generator: unknown, enabled: boolean) {
  (generator as MarkableGenerator).markBlockIds_ = enabled;
}

/**
 * Called from each generator's scrub_ with one block's own code (before its next sibling is
 * appended). Returns the code unchanged unless markers are on and this is a non-empty statement.
 */
export function markBlockCode(generator: unknown, block: Blockly.Block, code: string) {
  if (!(generator as MarkableGenerator).markBlockIds_ || block.outputConnection || !code.trim()) {
    return code;
  }
  return wrap(CODE_START, CODE_END, block.id, code);
}

/**
 * Wrap a generator's blockToCode so setup snippets a block registers are marked with that block's
 * id. Nested blocks finish first, so each snippet goes to the innermost block that wrote it; if a
 * later block rewrites a snippet with the same text, the first writer keeps it.
 */
export function markSetupSnippets(generator: unknown) {
  const target = generator as MarkableGenerator;
  const originalBlockToCode = target.blockToCode;

  target.blockToCode = function (this: MarkableGenerator, block, opt_thisOnly) {
    // Value blocks may claim snippets too (e.g. a DHT read owns `#include <DHT.h>`): only their
    // returned code must stay unmarked, and that is untouched here.
    if (!this.markBlockIds_ || !block) {
      return originalBlockToCode.call(this, block, opt_thisOnly);
    }

    const before = { ...(this.setups_ ?? {}) };
    const result = originalBlockToCode.call(this, block, opt_thisOnly);
    const setups = this.setups_ ?? {};

    for (const [key, value] of Object.entries(setups)) {
      if (CONTAINER_SETUP_KEYS.has(key) || typeof value !== 'string' || value === before[key] || !value.trim()) continue;
      if (value.startsWith(SETUP_START)) continue; // already claimed by a nested block

      const previous = before[key];
      setups[key] =
        typeof previous === 'string' && stripBlockMarkers(previous) === value
          ? previous
          : wrap(SETUP_START, SETUP_END, block.id, value);
    }
    return result;
  };
}

/** Remove every block marker without recording anything. */
export function stripBlockMarkers(code: string) {
  return code.replace(MARKER_PATTERN, '');
}

/** Read the marked program line by line: record each block's lines and return clean code. */
export function extractBlockLineRanges(markedCode: string): { code: string; ranges: BlockLineRanges } {
  const ranges: BlockLineRanges = {};
  const open: Array<{ key: string; start: number }> = [];

  const lines = markedCode.split('\n').map((line, index) => {
    const lineNumber = index + 1;
    return line.replace(MARKER_PATTERN, (_match, marker: string, id: string) => {
      const kind = marker === CODE_START || marker === CODE_END ? 'code' : 'setup';
      const key = `${kind}:${id}`;
      if (marker === CODE_START || marker === SETUP_START) {
        open.push({ key, start: lineNumber });
      } else {
        // Markers nest like brackets; match this end with the most recent start for the same block.
        const openIndex = open.map((entry) => entry.key).lastIndexOf(key);
        if (openIndex >= 0) {
          const [{ start }] = open.splice(openIndex, 1);
          (ranges[id] ??= []).push({ start, end: lineNumber, kind });
        }
      }
      return '';
    });
  });

  return { code: lines.join('\n'), ranges };
}

/** The innermost (shortest) block range that contains this line, or null. */
export function getBlockIdAtLine(ranges: BlockLineRanges, line: number): string | null {
  let best: { id: string; span: number } | null = null;
  for (const [id, blockRanges] of Object.entries(ranges)) {
    for (const range of blockRanges) {
      if (line < range.start || line > range.end) continue;
      const span = range.end - range.start;
      if (!best || span < best.span) best = { id, span };
    }
  }
  return best?.id ?? null;
}

/** A block's id followed by its parents' ids, innermost first. */
export function getBlockAncestry(block: Blockly.Block | null): string[] {
  const ids: string[] = [];
  for (let current = block; current; current = current.getParent()) {
    ids.push(current.id);
  }
  return ids;
}

/**
 * Lines to highlight for the selected block, given its ancestry: its own setup lines plus the
 * code lines of the nearest block that has some (itself, or for a value block, its parent).
 */
export function getRangesForAncestry(ranges: BlockLineRanges, ancestry: readonly string[]): CodeLineRange[] {
  if (ancestry.length === 0) return [];
  const ownSetup = (ranges[ancestry[0]] ?? []).filter((range) => range.kind === 'setup');
  for (const id of ancestry) {
    const code = (ranges[id] ?? []).filter((range) => range.kind === 'code');
    if (code.length) return [...ownSetup, ...code];
  }
  return ownSetup;
}

/** Every line that belongs to some block, i.e. the lines that can be clicked to find a block. */
export function getMappedLines(ranges: BlockLineRanges): Set<number> {
  const lines = new Set<number>();
  for (const blockRanges of Object.values(ranges)) {
    for (const { start, end } of blockRanges) {
      for (let line = start; line <= end; line += 1) lines.add(line);
    }
  }
  return lines;
}
