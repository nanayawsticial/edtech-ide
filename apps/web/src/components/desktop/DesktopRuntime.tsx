"use client";

import { installDesktopSerial } from '@/lib/desktop/desktopSerial';
import { isDesktopApp } from '@/lib/desktop/runtime';

// Runs when this module loads on the client, before any component effect, so hooks that check
// `'serial' in navigator` on mount (hooks/web-serial/useSerialTransport.ts) already see it.
if (typeof window !== 'undefined' && isDesktopApp()) {
  installDesktopSerial();
  document.documentElement.dataset.desktopApp = 'true';
}

/** Mounted once in the root layout; renders nothing. All work happens at module load above. */
export function DesktopRuntime() {
  return null;
}
