"use client";

import ConsolePanel from './ConsolePanel';
import type { useWebSerial } from '../../hooks/useWebSerial';
import { TerminalSquare } from 'lucide-react';

interface TerminalPanelProps {
  webSerial: ReturnType<typeof useWebSerial>;
  collapsed?: boolean;
  tone?: 'default' | 'arduino-focus';
}

export default function TerminalPanel({ webSerial, collapsed = false, tone = 'default' }: TerminalPanelProps) {
  const isArduinoFocus = tone === 'arduino-focus';

  if (collapsed) {
    return (
      <section className={isArduinoFocus ? "flex h-12 items-center justify-between rounded-none border border-white/8 bg-[linear-gradient(180deg,var(--ide-terminal-from)_0%,var(--ide-terminal-bg)_100%)] px-4" : "ui-foundation-panel flex h-12 items-center justify-between rounded-none px-4"}>
        <span className={isArduinoFocus ? "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-300" : "flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ui-color-text)]"}>
          <TerminalSquare size={14} className={isArduinoFocus ? "text-sky-300" : "text-[var(--ui-color-primary)]"} />
          Terminal and upload logs
        </span>
        <span className={isArduinoFocus ? "text-xs text-slate-500" : "text-xs text-[var(--ui-color-text-soft)]"}>Collapsed</span>
      </section>
    );
  }

  return (
    <section className={isArduinoFocus ? "overflow-hidden rounded-none border border-white/8 bg-[linear-gradient(180deg,var(--ide-terminal-from)_0%,var(--ide-terminal-bg)_100%)] shadow-[0_26px_70px_-46px_rgba(0,0,0,1)]" : "ui-foundation-panel h-full overflow-hidden rounded-none"}>
      <ConsolePanel webSerial={webSerial} />
    </section>
  );
}
