/**
 * Desktop replacement for the API service (apps/api).
 *
 * On the desktop there is no server: apiFetch() hands every `/api/*` request to
 * handleDesktopApiRequest(), which answers with the same JSON shapes as apps/api/routes/*.
 *  - auth:      one local user, no sign-in (the app uses the dev auth bypass path on desktop)
 *  - projects:  stored in projects.json in the app's data folder (Rust: projects_load/save)
 *  - compile:   arduino-cli on this computer (Rust: ensure_arduino_core, compile_sketch)
 *  - libraries: arduino-cli lib list/search/install/uninstall (Rust: arduino_cli_json)
 */
import { desktopErrorMessage, desktopInvoke } from './runtime';

const LOCAL_USER = { id: 'desktop-local-user', email: 'you@this-computer', name: 'You' };
const LOCAL_TOKEN = 'desktop-local-session';

const ARDUINO_FQBN_MAP: Record<string, string> = {
  'Arduino Uno': 'arduino:avr:uno',
  'Arduino Nano': 'arduino:avr:nano',
  'Arduino Mega': 'arduino:avr:mega',
  'Arduino Leonardo': 'arduino:avr:leonardo',
};

// --- Responses -----------------------------------------------------------------------------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function apiError(status: number, message: string, code: string, extra: Record<string, unknown> = {}) {
  return json({ success: false, error: message, code, degraded: false, capability: null, details: null, ...extra }, status);
}

async function readJsonBody(init?: RequestInit): Promise<Record<string, unknown>> {
  if (typeof init?.body !== 'string' || !init.body) return {};
  try {
    const parsed = JSON.parse(init.body);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// --- Projects (projects.json in the app data folder) ----------------------------------------

type StoredFile = {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  type: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type StoredProject = {
  id: string;
  userId: string;
  name: string;
  description: string;
  board: string | null;
  codingMode: string | null;
  language: string | null;
  generator: string | null;
  environment: string | null;
  createdAt: string;
  updatedAt: string;
  files: StoredFile[];
};

const PROJECT_META_FIELDS = ['board', 'codingMode', 'language', 'generator', 'environment'] as const;

let projectsCache: StoredProject[] | null = null;
let saveQueue: Promise<void> = Promise.resolve();

async function loadProjects(): Promise<StoredProject[]> {
  if (projectsCache) return projectsCache;
  const raw = await desktopInvoke<string>('projects_load');
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    projectsCache = Array.isArray(parsed?.projects) ? parsed.projects : [];
  } catch {
    // A damaged file must not lose the user's work silently; Rust keeps a .bak of the last save.
    throw new Error('Your saved projects file could not be read (projects.json). A backup is kept as projects.json.bak.');
  }
  return projectsCache!;
}

/** Saves run one at a time, in order, so a slow write never overwrites a newer one. */
function saveProjects(projects: StoredProject[]) {
  projectsCache = projects;
  const data = JSON.stringify({ version: 1, projects });
  saveQueue = saveQueue.then(() => desktopInvoke<void>('projects_save', { data })).catch((error) => {
    console.error('Saving projects failed', error);
    throw error;
  });
  return saveQueue;
}

function optionalText(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function projectSummary(project: StoredProject) {
  const { files: _files, ...summary } = project;
  void _files;
  return summary;
}

function defaultProjectFiles(projectId: string, now: string): StoredFile[] {
  const srcId = newId();
  const file = (name: string, type: string, content: string, parentId: string | null): StoredFile => ({
    id: parentId === null ? srcId : newId(),
    projectId,
    parentId,
    name,
    type,
    content,
    createdAt: now,
    updatedAt: now,
  });
  return [
    file('src', 'folder', '', null),
    file('main.blockly', 'blockly', '<xml xmlns="https://developers.google.com/blockly/xml"></xml>', srcId),
    file('main.cpp', 'cpp', '', srcId),
    file('main.py', 'python', '', srcId),
  ];
}

/** Mirror of the PUT /api/projects/:id file sync: the incoming list replaces the stored files. */
function mergeIncomingFiles(project: StoredProject, rawFiles: unknown[], now: string): StoredFile[] {
  const existingById = new Map(project.files.map((file) => [file.id, file]));
  const incoming = rawFiles
    .map((raw) => raw as Record<string, unknown>)
    .filter((raw) => typeof raw?.name === 'string' && raw.name.trim().length > 0)
    .map((raw) => ({
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : null,
      name: (raw.name as string).trim(),
      type: typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : 'text',
      content: typeof raw.content === 'string' ? raw.content : '',
      parentId: typeof raw.parentId === 'string' && raw.parentId.trim() ? raw.parentId : null,
    }));

  // Files without an id keep the id of the stored file at the same path, like the server does.
  const resolvedIds = incoming.map((file) => {
    if (file.id) return file.id;
    const samePath = project.files.find((existing) => existing.parentId === file.parentId && existing.name === file.name);
    return samePath?.id ?? newId();
  });
  const knownIds = new Set(resolvedIds);

  return incoming.map((file, index) => {
    const id = resolvedIds[index];
    const previous = existingById.get(id);
    return {
      id,
      projectId: project.id,
      parentId: file.parentId && knownIds.has(file.parentId) ? file.parentId : null,
      name: file.name,
      type: file.type,
      content: file.content,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
  });
}

async function handleProjects(method: string, id: string | null, init?: RequestInit): Promise<Response> {
  const projects = await loadProjects();
  const now = new Date().toISOString();

  if (!id && method === 'GET') {
    const sorted = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return json(sorted.map(projectSummary));
  }

  if (!id && method === 'POST') {
    const body = await readJsonBody(init);
    const projectId = newId();
    const project: StoredProject = {
      id: projectId,
      userId: LOCAL_USER.id,
      name: optionalText(body.name) ?? 'Untitled Project',
      description: typeof body.description === 'string' ? body.description : '',
      board: optionalText(body.board),
      codingMode: optionalText(body.codingMode),
      language: optionalText(body.language),
      generator: optionalText(body.generator),
      environment: optionalText(body.environment),
      createdAt: now,
      updatedAt: now,
      files: defaultProjectFiles(projectId, now),
    };
    await saveProjects([...projects, project]);
    return json(project, 201);
  }

  const project = id ? projects.find((candidate) => candidate.id === id) : undefined;
  if (!project) {
    return apiError(404, 'Project not found', 'PROJECT_NOT_FOUND');
  }

  if (method === 'GET') {
    return json(project);
  }

  if (method === 'PUT') {
    const body = await readJsonBody(init);
    const next: StoredProject = { ...project, updatedAt: now };
    if (typeof body.name === 'string') next.name = body.name;
    if ('description' in body) next.description = typeof body.description === 'string' ? body.description : '';
    for (const field of PROJECT_META_FIELDS) {
      if (field in body) next[field] = optionalText(body[field]);
    }
    if (Array.isArray(body.files)) {
      next.files = mergeIncomingFiles(project, body.files, now);
    }
    await saveProjects(projects.map((candidate) => (candidate.id === project.id ? next : candidate)));
    return json({ message: 'Project saved successfully', projectId: project.id });
  }

  if (method === 'DELETE') {
    await saveProjects(projects.filter((candidate) => candidate.id !== project.id));
    return json({ message: 'Project deleted successfully' });
  }

  return apiError(405, `${method} is not supported here.`, 'METHOD_NOT_ALLOWED');
}

// --- Compile (arduino-cli on this computer) --------------------------------------------------

type CompileResult = { success: boolean; stdout: string; stderr: string; hex: string | null; sketchFile: string };

let corePromise: Promise<string> | null = null;

/** Install the Arduino AVR core the first time something is compiled (needs internet once). */
function ensureArduinoCore() {
  corePromise ??= desktopInvoke<string>('ensure_arduino_core', { core: 'arduino:avr' }).catch((error) => {
    corePromise = null;
    throw error;
  });
  return corePromise;
}

/** Same rules as apps/api/routes/compile.js: relative paths only, `src/` prefix dropped. */
function sanitizeRelativePath(rawPath: unknown) {
  if (typeof rawPath !== 'string') return null;
  const segments = rawPath.replace(/\\/g, '/').trim().split('/').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0 || rawPath.trim().startsWith('/') || /^[A-Za-z]:/.test(rawPath.trim())) return null;
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;
  const safePath = segments.join('/');
  return safePath.startsWith('src/') ? safePath.slice(4) : safePath;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function handleCompile(init?: RequestInit): Promise<Response> {
  const body = await readJsonBody(init);
  const board = typeof body.board === 'string' && body.board.trim() ? body.board.trim() : 'Arduino Uno';
  const fqbn = ARDUINO_FQBN_MAP[board];
  if (!fqbn) {
    return apiError(400, `Board "${board}" is not supported by the Arduino compiler.`, 'COMPILE_BOARD_UNSUPPORTED', { details: { board } });
  }

  const files = (Array.isArray(body.files) ? body.files : [])
    .map((raw) => raw as Record<string, unknown>)
    .map((raw) => ({ path: sanitizeRelativePath(raw?.path), content: typeof raw?.content === 'string' ? raw.content : '' }))
    .filter((file): file is { path: string; content: string } => Boolean(file.path));
  const entryPath = sanitizeRelativePath(body.entryFilePath);
  const entry = entryPath
    ? files.find((file) => file.path === entryPath) ?? null
    : files.find((file) => /(^|\/)(main\.(cpp|ino)|sketch\.(cpp|ino))$/i.test(file.path)) ?? files[0] ?? null;
  const primary = entry?.content ?? (typeof body.sourceCode === 'string' ? body.sourceCode : '');
  if (!primary.trim()) {
    return apiError(400, 'No source code provided.', 'COMPILE_SOURCE_MISSING');
  }
  const extraFiles = files.filter((file) => file !== entry);

  try {
    const coreLog = await ensureArduinoCore();
    const result = await desktopInvoke<CompileResult>('compile_sketch', { fqbn, primary, files: extraFiles });

    // Show the student's file name instead of the temporary sketch path in compiler messages.
    const displayPath = entry?.path ?? 'main.cpp';
    const rewrite = (log: string) =>
      [result.sketchFile, result.sketchFile.replace(/\\/g, '/')]
        .filter(Boolean)
        .reduce((text, candidate) => text.replace(new RegExp(escapeRegExp(candidate), 'g'), displayPath), log);
    const log = [coreLog, rewrite(result.success ? result.stdout : result.stderr || result.stdout)].filter(Boolean).join('\n');

    return json({
      success: result.success,
      board,
      fqbn,
      log,
      hex: result.hex,
      degraded: false,
      capability: 'arduino-cli',
      compiledFiles: 1 + extraFiles.length,
    });
  } catch (error) {
    return apiError(500, desktopErrorMessage(error, 'Arduino compilation failed to start.'), 'COMPILE_ARDUINO_CRASH', {
      capability: 'arduino-cli',
      details: { board, fqbn },
    });
  }
}

// --- Libraries (arduino-cli lib ...) --------------------------------------------------------

type CliResult = { code: number; stdout: string; stderr: string };

async function runArduinoCliJson(args: string[]) {
  const result = await desktopInvoke<CliResult>('arduino_cli_json', { args });
  if (result.code !== 0) {
    const combined = (result.stdout || result.stderr || 'Arduino CLI command failed.').trim();
    try {
      const parsed = JSON.parse(combined);
      throw new Error(parsed.error || combined);
    } catch (error) {
      throw error instanceof Error && error.message !== combined ? error : new Error(combined);
    }
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim() : '';
}

type LibraryEntry = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function listInstalledLibraries() {
  const data = await runArduinoCliJson(['lib', 'list', '--json']);
  const libraries = (Array.isArray(data?.installed_libraries) ? data.installed_libraries : []).map((entry: LibraryEntry) => {
    const library = entry?.library ?? {};
    const release = entry?.release ?? {};
    return {
      name: library.name || 'Unknown library',
      author: library.author || library.maintainer || 'Unknown author',
      version: library.version || release.version || 'Unknown',
      latestVersion: release.version || library.version || null,
      description: cleanText(library.sentence || library.paragraph),
      category: library.category || 'Uncategorized',
      website: library.website || null,
      includes: Array.isArray(library.provides_includes) ? library.provides_includes : [],
      availableVersions: [],
      installed: true,
      installedVersion: library.version || null,
      location: library.location || 'user',
      installDir: library.install_dir || null,
    };
  });
  return { libraries, warnings: Array.isArray(data?.warnings) ? data.warnings : [] };
}

async function handleLibraries(method: string, action: string, query: URLSearchParams, init?: RequestInit) {
  const ok = (libraries: unknown[], warnings: unknown[]) => json({ success: true, libraries, warnings, capability: 'arduino-cli' });
  try {
    if (method === 'GET' && action === 'installed') {
      const installed = await listInstalledLibraries();
      return ok(installed.libraries, installed.warnings);
    }

    if (method === 'GET' && action === 'search') {
      const searchQuery = (query.get('q') ?? '').trim();
      const limitValue = Number(query.get('limit'));
      const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.max(1, Math.min(limitValue, 24)) : 18;
      const installed = await listInstalledLibraries();
      if (!searchQuery) return ok(installed.libraries.slice(0, limit), installed.warnings);

      const installedByName = new Map(installed.libraries.map((library: { name: string }) => [library.name.toLowerCase(), library]));
      const data = await runArduinoCliJson(['lib', 'search', searchQuery, '--json']);
      const libraries = (Array.isArray(data?.libraries) ? data.libraries : []).slice(0, limit).map((entry: LibraryEntry) => {
        const latest = entry?.latest ?? {};
        const match = installedByName.get(String(entry?.name || '').toLowerCase()) as LibraryEntry | undefined;
        return {
          name: entry?.name || 'Unknown library',
          author: latest.author || latest.maintainer || 'Unknown author',
          version: latest.version || 'Unknown',
          latestVersion: latest.version || null,
          description: cleanText(latest.sentence || latest.paragraph),
          category: latest.category || 'Uncategorized',
          website: latest.website || null,
          includes: Array.isArray(latest.provides_includes) ? latest.provides_includes : [],
          availableVersions: Array.isArray(entry?.available_versions) ? entry.available_versions : [],
          installed: Boolean(match),
          installedVersion: match?.version || null,
          location: match?.location || null,
          installDir: match?.installDir || null,
        };
      });
      return ok(libraries, installed.warnings);
    }

    if (method === 'POST' && (action === 'install' || action === 'uninstall')) {
      const body = await readJsonBody(init);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return apiError(400, 'Library name is required.', 'LIBRARIES_ARDUINO_NAME_MISSING');
      const version = typeof body.version === 'string' ? body.version.trim() : '';
      const spec = action === 'install' && version ? `${name}@${version}` : name;
      await runArduinoCliJson(['lib', action, '--json', spec]);
      const installed = await listInstalledLibraries();
      return ok(installed.libraries, installed.warnings);
    }
  } catch (error) {
    return apiError(500, desktopErrorMessage(error, 'Arduino library command failed.'), 'LIBRARIES_ARDUINO_FAILED', { capability: 'arduino-cli' });
  }
  return apiError(404, 'Unknown library action.', 'NOT_FOUND');
}

// --- Router -----------------------------------------------------------------------------------

/** Answer an `/api/*` request on the desktop. `path` may include a query string. */
export async function handleDesktopApiRequest(path: string, init?: RequestInit): Promise<Response> {
  const url = new URL(path, 'http://desktop.local');
  const method = (init?.method ?? 'GET').toUpperCase();
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);

  try {
    switch (parts[0]) {
      case 'health':
        return json({ status: 'ok', mode: 'desktop' });
      case 'session':
        return json({ success: true });
      case 'auth':
        if (parts[1] === 'dev-login') return json({ token: LOCAL_TOKEN, user: LOCAL_USER });
        if (parts[1] === 'me') return json({ user: LOCAL_USER });
        return apiError(400, 'Sign-in is not needed in the desktop app.', 'AUTH_NOT_NEEDED');
      case 'projects':
        return await handleProjects(method, parts[1] ?? null, init);
      case 'compile':
        if (parts[1] === 'arduino' && method === 'POST') return await handleCompile(init);
        break;
      case 'libraries':
        if (parts[1] === 'arduino') return await handleLibraries(method, parts[2] ?? '', url.searchParams, init);
        break;
    }
  } catch (error) {
    return apiError(500, desktopErrorMessage(error, 'The desktop app could not complete this request.'), 'DESKTOP_REQUEST_FAILED');
  }

  return apiError(404, `${url.pathname} is not available in the desktop app.`, 'NOT_FOUND');
}
