"use client";

import type React from 'react';
import { AlertCircle, ChevronRight, Code2 } from 'lucide-react';

import { BLOCKLY_CODE_PANEL_COMPACT_MAX_WIDTH } from './config';

type CodePreviewPanelProps = {
  isCompactLayout: boolean;
  width: number;
  isResizing: boolean;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  warning: string | null;
  code: string;
  onClose: () => void;
};

/** "Generated code" panel beside the canvas, with a drag handle to resize it on wide layouts. */
export function CodePreviewPanel({ isCompactLayout, width, isResizing, onResizeStart, warning, code, onClose }: CodePreviewPanelProps) {
  return (
    <>
      {!isCompactLayout ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize generated code panel"
          onPointerDown={onResizeStart}
          className="group relative w-3 shrink-0 cursor-col-resize touch-none bg-transparent"
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/8 transition-colors group-hover:bg-violet-300/45" />
          <div
            className={`absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full transition-colors ${isResizing ? 'bg-violet-300/60' : 'bg-transparent'}`}
          />
        </div>
      ) : null}
      <div
        className={`flex flex-col ${
          isCompactLayout
            ? 'absolute inset-y-3 right-3 top-[80px] z-20 overflow-hidden rounded-[24px] border border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-flyout-fill)] shadow-[0_28px_72px_-40px_rgba(0,0,0,0.95)] backdrop-blur'
            : 'shrink-0 border-l border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-flyout-fill)]'
        }`}
        style={
          isCompactLayout
            ? {
                width: `min(${Math.min(width, BLOCKLY_CODE_PANEL_COMPACT_MAX_WIDTH)}px, calc(100% - 1.5rem))`,
                maxWidth: `${BLOCKLY_CODE_PANEL_COMPACT_MAX_WIDTH}px`,
              }
            : { width: `${width}px` }
        }
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--blockly-sidebar-kicker)]">Generated code</p>
            <p className="mt-0.5 text-xs text-[color:var(--blockly-sidebar-text-soft)]">Your blocks become this code</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-input-bg)] text-[color:var(--blockly-sidebar-text-soft)] transition-all hover:border-[color:var(--blockly-sidebar-border-strong)] hover:bg-[color:var(--blockly-sidebar-card-strong)] hover:text-[color:var(--blockly-sidebar-text)]"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        {warning ? (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-[14px] border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[11px] leading-5 text-amber-100/90">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-200/90" />
            <p>{warning}</p>
          </div>
        ) : null}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {code && code.trim().length > 0 ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-6 text-[color:var(--blockly-sidebar-text)]">{code}</pre>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[color:var(--blockly-sidebar-text-soft)]">
              <Code2 size={28} className="text-[color:var(--blockly-sidebar-kicker)]" />
              <p className="text-xs">Add blocks and the matching code will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
