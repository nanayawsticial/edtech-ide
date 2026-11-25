"use client";

import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

import { installDesktopSerial } from '@/lib/desktop/desktopSerial';
import { desktopErrorMessage, desktopInvoke, isDesktopApp } from '@/lib/desktop/runtime';

// Runs when this module loads on the client, before any component effect, so hooks that check
// `'serial' in navigator` on mount (hooks/web-serial/useSerialTransport.ts) already see it.
if (typeof window !== 'undefined' && isDesktopApp()) {
  installDesktopSerial();
  document.documentElement.dataset.desktopApp = 'true';
}

interface UpdateInfo {
  currentVersion: string;
  version: string;
  notes: string | null;
}

/** Wait a little after start so checking for updates never slows the app opening. */
const CHECK_DELAY_MS = 8000;

/**
 * Mounted once in the root layout. In the desktop app it checks GitHub Releases for a newer
 * version and offers to install it; elsewhere it renders nothing.
 */
export function DesktopRuntime() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [state, setState] = useState<'idle' | 'installing' | 'failed'>('idle');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) return;
    const timer = window.setTimeout(() => {
      // No internet, or GitHub unreachable: stay quiet and try again next start.
      desktopInvoke<UpdateInfo | null>('update_check').then(setUpdate, () => undefined);
    }, CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!update) return null;

  const install = () => {
    setState('installing');
    setProblem(null);
    desktopInvoke<void>('update_install').catch((error) => {
      setState('failed');
      setProblem(desktopErrorMessage(error, 'The update could not be installed.'));
    });
  };

  return (
    <div
      role="status"
      data-testid="desktop-update-notice"
      className="ui-always-dark fixed bottom-4 right-4 z-[80] w-[min(360px,calc(100%-2rem))] rounded-2xl border border-indigo-400/30 bg-[#0d1322]/95 p-4 text-slate-100 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/25 text-indigo-200">
          <Download size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-white">Sticial Studio {update.version} is ready</p>
          <p className="mt-1 text-[13px] leading-5 text-slate-300">
            {state === 'installing'
              ? 'Downloading... The app will close, update, and open again by itself.'
              : `You have ${update.currentVersion}. Updating takes a minute; work you have not saved comes back afterwards.`}
          </p>
          {problem ? <p className="mt-2 text-[13px] leading-5 text-rose-200">{problem} Try again later.</p> : null}
          {state !== 'installing' ? (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={install} className="rounded-lg bg-indigo-500 px-3 py-1.5 text-white transition hover:bg-indigo-400">
                <span className="text-[13px] font-semibold">Update now</span>
              </button>
              <button type="button" onClick={() => setUpdate(null)} className="rounded-lg bg-white/10 px-3 py-1.5 text-slate-200 transition hover:bg-white/15">
                <span className="text-[13px] font-semibold">Later</span>
              </button>
            </div>
          ) : null}
        </div>
        {state !== 'installing' ? (
          <button type="button" onClick={() => setUpdate(null)} className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
