// Theme modes the platform offers. Dark is the default. A saved preference for a
// theme that no longer exists (the old "light" theme) falls back to dark.
export const THEME_MODES = ['dark', 'magma'] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

export const DEFAULT_THEME: ThemeMode = 'dark';

export const THEME_STORAGE_KEY = 'edtech-theme-mode';

export function normalizeTheme(value: string | null | undefined): ThemeMode {
  return value === 'magma' ? 'magma' : DEFAULT_THEME;
}

// Runs in <head> before the first paint so the page never shows the wrong theme.
// It also rewrites a stale saved value (such as "light") to the fallback.
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement,k=${JSON.stringify(THEME_STORAGE_KEY)},t=${JSON.stringify(DEFAULT_THEME)};try{var s=localStorage.getItem(k);if(s==="magma"){t=s}if(s!==t){localStorage.setItem(k,t)}}catch(e){}d.setAttribute("data-theme",t)})();`;
