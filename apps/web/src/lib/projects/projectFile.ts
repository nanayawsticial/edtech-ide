/**
 * Project files (.sticial): one project in one file, to move it between computers, hand it in,
 * or keep a copy on a USB stick. Plain JSON, so a teacher can open it in any text editor.
 *
 * Files are stored by path, not by database id, so an import works on any install. Pure helpers
 * (no app runtime imports) so `scripts/validate-project-file.mjs` can test them with Node.
 */

import type { FileItem } from '@/stores/editorStore';
import { parseProjectMeta, type ProjectMeta } from '@/lib/projects/projectMeta';

export const PROJECT_FILE_EXTENSION = '.sticial';
export const PROJECT_FILE_FORMAT = 'sticial-studio-project';
const PROJECT_FILE_VERSION = 1;
/** Projects are text; anything far bigger is not a project file. */
export const MAX_PROJECT_FILE_BYTES = 5 * 1024 * 1024;

interface ProjectFileEntry {
  path: string;
  type: string;
  content: string;
}

interface ProjectFileDocument {
  format: typeof PROJECT_FILE_FORMAT;
  version: number;
  name: string;
  exportedAt: string;
  meta: Omit<ProjectMeta, 'version'>;
  files: ProjectFileEntry[];
}

export interface ImportedProject {
  name: string;
  meta: Omit<ProjectMeta, 'version'>;
  files: FileItem[];
}

function filePath(file: FileItem, filesById: Map<string, FileItem>) {
  const segments = [file.name];
  const seen = new Set([file.id]);
  let parentId = file.parentId;
  while (parentId && !seen.has(parentId)) {
    const parent = filesById.get(parentId);
    if (!parent) break;
    seen.add(parent.id);
    segments.unshift(parent.name);
    parentId = parent.parentId;
  }
  return segments.join('/');
}

/** The text of a .sticial file for this project. */
export function buildProjectFile(
  name: string,
  meta: Omit<ProjectMeta, 'version'>,
  files: FileItem[],
  exportedAt = new Date().toISOString()
): string {
  const filesById = new Map(files.map((file) => [file.id, file]));
  const document: ProjectFileDocument = {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    name: name.trim() || 'Untitled Project',
    exportedAt,
    meta: {
      board: meta.board,
      mode: meta.mode,
      language: meta.language,
      generator: meta.generator,
      environment: meta.environment,
    },
    files: files
      .map((file) => ({ path: filePath(file, filesById), type: file.type, content: file.type === 'folder' ? '' : file.content ?? '' }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** A safe file name for the download, e.g. "Traffic light (Ama).sticial". */
export function projectFileName(name: string) {
  const safe = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${safe || 'Sticial project'}${PROJECT_FILE_EXTENSION}`;
}

const isText = (value: unknown): value is string => typeof value === 'string';

/**
 * Reads a .sticial file. Throws an Error whose message can be shown to the learner as-is.
 * Files get fresh ids, with folders rebuilt from their paths.
 */
export function parseProjectFile(text: string, makeId: (index: number) => string = (index) => `import-${Date.now()}-${index}`): ImportedProject {
  if (text.length > MAX_PROJECT_FILE_BYTES) {
    throw new Error('This file is too big to be a Sticial Studio project.');
  }

  let document: Partial<ProjectFileDocument>;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error('This is not a Sticial Studio project file. Choose a file that ends in .sticial.');
  }

  if (!document || typeof document !== 'object' || document.format !== PROJECT_FILE_FORMAT) {
    throw new Error('This is not a Sticial Studio project file. Choose a file that ends in .sticial.');
  }
  if (typeof document.version !== 'number' || document.version > PROJECT_FILE_VERSION) {
    throw new Error('This project was saved by a newer version of Sticial Studio. Update the app, then import it again.');
  }
  if (!Array.isArray(document.files)) {
    throw new Error('This project file is damaged: it has no files.');
  }

  const meta = parseProjectMeta(document.meta ?? null);
  if (!meta) {
    throw new Error('This project file is damaged: its board settings are missing.');
  }

  const entries = document.files.filter(
    (entry): entry is ProjectFileEntry =>
      Boolean(entry) && isText(entry.path) && entry.path.trim().length > 0 && isText(entry.type) && (entry.type === 'folder' || isText(entry.content))
  );

  // Rebuild folders from paths: every parent path becomes (or reuses) a folder.
  const files: FileItem[] = [];
  const folderIds = new Map<string, string>();
  let nextIndex = 0;
  const ensureFolder = (folderPath: string): string | null => {
    if (!folderPath) return null;
    const existing = folderIds.get(folderPath);
    if (existing) return existing;
    const slash = folderPath.lastIndexOf('/');
    const parentId = ensureFolder(slash === -1 ? '' : folderPath.slice(0, slash));
    const id = makeId(nextIndex++);
    folderIds.set(folderPath, id);
    files.push({ id, name: folderPath.slice(slash + 1), type: 'folder', content: '', parentId });
    return id;
  };

  const seenPaths = new Set<string>();
  for (const entry of entries) {
    const path = entry.path.split('/').filter((segment) => segment && segment !== '.' && segment !== '..').join('/');
    if (!path || seenPaths.has(path)) continue;
    seenPaths.add(path);

    if (entry.type === 'folder') {
      ensureFolder(path);
      continue;
    }
    const slash = path.lastIndexOf('/');
    const parentId = ensureFolder(slash === -1 ? '' : path.slice(0, slash));
    files.push({ id: makeId(nextIndex++), name: path.slice(slash + 1), type: entry.type, content: entry.content, parentId });
  }

  if (!files.some((file) => file.type !== 'folder')) {
    throw new Error('This project file is empty.');
  }

  const name = isText(document.name) && document.name.trim() ? document.name.trim().slice(0, 120) : 'Imported project';
  const { board, mode, language, generator, environment } = meta;
  return { name, meta: { board, mode, language, generator, environment }, files };
}
