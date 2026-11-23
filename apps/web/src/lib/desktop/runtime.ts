/**
 * Desktop (Tauri) runtime detection and bridge.
 *
 * The desktop app (apps/desktop) loads a static export of this web app inside WebView2 and sets
 * `app.withGlobalTauri`, which exposes `window.__TAURI__`. Everything desktop-specific checks
 * isDesktopApp() at runtime, so the same code runs unchanged on the web.
 */

type TauriGlobal = {
  core: { invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T> };
  event: {
    listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
  };
};

function getTauri(): TauriGlobal | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

export function isDesktopApp() {
  return getTauri() !== null;
}

/** Call a Rust command in apps/desktop/src-tauri/src/main.rs. Argument names are camelCase. */
export function desktopInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = getTauri();
  if (!tauri) {
    return Promise.reject(new Error(`Desktop command "${command}" is only available in the desktop app.`));
  }
  return tauri.core.invoke<T>(command, args);
}

/** Listen to an event emitted by the desktop app. Resolves to an unlisten function. */
export function desktopListen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  const tauri = getTauri();
  if (!tauri) {
    return Promise.resolve(() => undefined);
  }
  return tauri.event.listen<T>(event, (message) => handler(message.payload));
}

/** Tauri commands reject with a plain string; turn any rejection into a readable message. */
export function desktopErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
