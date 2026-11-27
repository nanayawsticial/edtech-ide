"use client";

import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { DEFAULT_THEME, THEME_STORAGE_KEY, normalizeTheme, type ThemeMode } from '@/lib/theme/themeModes';

export type { ThemeMode } from '@/lib/theme/themeModes';

interface ThemeContextValue {
  theme: ThemeMode;
  isReady: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// The theme lives on <html data-theme>. The inline script in app/layout.tsx sets it
// from localStorage before the first paint, so this store only reads and writes it.
const listeners = new Set<() => void>();

function readTheme(): ThemeMode {
  return normalizeTheme(document.documentElement.getAttribute('data-theme'));
}

function writeTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked (private mode, sandboxed frames). The attribute still applies.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  // Keep other open tabs in step when the theme changes in one of them.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const next = normalizeTheme(event.newValue);
    if (next !== readTheme()) writeTheme(next);
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const getServerTheme = () => DEFAULT_THEME;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, getServerTheme);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    writeTheme(normalizeTheme(nextTheme));
  }, []);

  const toggleTheme = useCallback(() => {
    writeTheme(readTheme() === 'dark' ? 'magma' : 'dark');
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    isReady: true,
    setTheme,
    toggleTheme
  }), [setTheme, theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
