/**
 * A local recovery copy of the workspace (files + circuit) that has not been saved yet.
 *
 * Kept in the browser's own storage so a reload, a crash or a closed window does not lose a
 * learner's work. It is written while there are unsaved changes and removed when the project is
 * saved. Free of app runtime imports (types and pure helpers only) so
 * `scripts/validate-workspace-draft.mjs` can test it with Node.
 */

import type { ComponentData, NetData } from '@/contexts/CircuitContext';
import type { FileItem } from '@/stores/editorStore';
import { serializeCircuit } from '@/lib/circuit/circuitSerializer';
import { DEFAULT_ARDUINO_CODE, DEFAULT_MICROPYTHON_CODE } from '@/templates/codeTemplates';

export const WORKSPACE_DRAFT_KEY_PREFIX = 'edtech:workspace-draft:';
const DRAFT_VERSION = 1;
const CIRCUIT_FILE_NAME = 'circuit.json';
const ROOT_BLOCK_TYPES = new Set(['arduino_setup_loop', 'arduino_on_start', 'arduino_forever']);

export interface WorkspaceCircuit {
  components: ComponentData[];
  nets: NetData[];
}

export interface WorkspaceMeta {
  board: string | null;
  codingMode: string | null;
  language: string | null;
  generator: string | null;
  environment: string | null;
}

export interface WorkspaceSnapshot {
  files: FileItem[];
  circuit: WorkspaceCircuit;
}

export interface WorkspaceDraft extends WorkspaceSnapshot, WorkspaceMeta {
  version: typeof DRAFT_VERSION;
  scope: string;
  projectName: string;
  updatedAt: number;
}

/** Saved projects get a draft each; all unsaved new work shares the "scratch" one. */
export function draftScope(projectId: string | null) {
  return projectId ? `project:${projectId}` : 'scratch';
}

/** Equal when the work is the same: file names and contents (circuit.json aside) plus the circuit. */
export function workspaceSignature(snapshot: WorkspaceSnapshot) {
  const files = snapshot.files
    .filter((file) => file.type !== 'folder' && file.name !== CIRCUIT_FILE_NAME)
    .map((file) => `${file.name}\u0000${file.content ?? ''}`)
    .sort();
  return JSON.stringify({ files, circuit: serializeCircuit(snapshot.circuit) });
}

const normalizeCode = (code: string) => code.replace(/\s+/g, ' ').trim();

const STARTER_CODE = new Set(
  [
    '',
    DEFAULT_ARDUINO_CODE,
    DEFAULT_MICROPYTHON_CODE,
    // The starters the text editor seeds into an empty file (EditorOrchestrator).
    'import time\n\n# --- Setup Section ---\npass\n\n# --- Loop Section ---\nwhile True:\n    pass\n',
  ].map(normalizeCode)
);

/** True when there is something worth keeping: parts on the canvas, blocks, or code beyond the starter. */
export function hasWorkInProgress(snapshot: WorkspaceSnapshot, codingMode: string | null) {
  if (snapshot.circuit.components.length > 0) {
    return true;
  }

  if (codingMode === 'block') {
    const xml = snapshot.files.find((file) => file.name === 'main.blockly' || file.type === 'blockly')?.content ?? '';
    // An empty workspace still has its root blocks (on start and forever, or the older setup/loop).
    return [...xml.matchAll(/<block\b[^>]*\btype="([^"]+)"/g)].some((match) => !ROOT_BLOCK_TYPES.has(match[1]));
  }

  return snapshot.files.some(
    (file) => file.type !== 'folder' && file.type !== 'blockly' && file.name !== CIRCUIT_FILE_NAME && !STARTER_CODE.has(normalizeCode(file.content ?? ''))
  );
}

/** A draft comes back only into the same kind of workspace, and only when it holds work the workspace does not. */
export function shouldRestoreDraft(draft: WorkspaceDraft | null, current: WorkspaceSnapshot, meta: WorkspaceMeta) {
  if (!draft || draft.version !== DRAFT_VERSION) {
    return false;
  }
  if (draft.board !== meta.board || draft.codingMode !== meta.codingMode || draft.environment !== meta.environment) {
    return false;
  }
  return hasWorkInProgress(draft, draft.codingMode) && workspaceSignature(draft) !== workspaceSignature(current);
}

export function buildWorkspaceDraft(
  scope: string,
  projectName: string,
  snapshot: WorkspaceSnapshot,
  meta: WorkspaceMeta,
  updatedAt = Date.now()
): WorkspaceDraft {
  return { version: DRAFT_VERSION, scope, projectName, ...meta, files: snapshot.files, circuit: snapshot.circuit, updatedAt };
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readWorkspaceDraft(scope: string): WorkspaceDraft | null {
  try {
    const raw = storage()?.getItem(WORKSPACE_DRAFT_KEY_PREFIX + scope);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceDraft;
    return parsed && parsed.version === DRAFT_VERSION && Array.isArray(parsed.files) && parsed.circuit ? parsed : null;
  } catch {
    return null;
  }
}

/** Returns false when the browser would not store it (full or blocked storage). */
export function writeWorkspaceDraft(draft: WorkspaceDraft) {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(WORKSPACE_DRAFT_KEY_PREFIX + draft.scope, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearWorkspaceDraft(scope: string) {
  try {
    storage()?.removeItem(WORKSPACE_DRAFT_KEY_PREFIX + scope);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}
