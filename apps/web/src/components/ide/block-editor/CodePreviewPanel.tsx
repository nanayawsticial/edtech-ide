"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import { AlertCircle, ChevronRight, Code2 } from 'lucide-react';

import type { CodeLineRange } from '@/lib/blockly/codeLineMap';

import { BLOCKLY_CODE_PANEL_COMPACT_MAX_WIDTH } from './config';

type CodePreviewPanelProps = {
  isCompactLayout: boolean;
  width: number;
  isResizing: boolean;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  warning: string | null;
  code: string;
  onClose: () => void;
  /** Lines produced by the selected block (1-based, inclusive). */
  highlightedRanges: CodeLineRange[];
  /** Lines that belong to a block and can be clicked to select it. */
  mappedLines: ReadonlySet<number>;
  onLineClick: (line: number) => void;
};

function describeRanges(ranges: CodeLineRange[]) {
  if (ranges.length === 0) return null;
  const parts = ranges.map(({ start, end }) => (start === end ? `${start}` : `${start}–${end}`));
  const isSingleLine = ranges.length === 1 && ranges[0].start === ranges[0].end;
  return `Selected block → ${isSingleLine ? 'line' : 'lines'} ${parts.join(', ')}`;
}

/**
 * "Generated code" panel beside the canvas, with a drag handle to resize it on wide layouts.
 * Selecting a block highlights the lines it produced; clicking a line selects its block.
 */
export function CodePreviewPanel({
  isCompactLayout,
  width,
  isResizing,
  onResizeStart,
  warning,
  code,
  onClose,
  highlightedRanges,
  mappedLines,
  onLineClick,
}: CodePreviewPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => code.replace(/\n$/, '').split('\n'), [code]);
  const highlightedLines = useMemo(() => {
    const set = new Set<number>();
    for (const { start, end } of highlightedRanges) {
      for (let line = start; line <= end; line += 1) set.add(line);
    }
    return set;
  }, [highlightedRanges]);
  const firstHighlightedLine = highlightedRanges.length > 0 ? Math.min(...highlightedRanges.map((range) => range.start)) : null;
  const rangeSummary = describeRanges(highlightedRanges);
  const hasCode = code.trim().length > 0;

  // Bring the selected block's code into view without jumping if it is already visible.
  useEffect(() => {
    if (firstHighlightedLine === null) return;
    scrollRef.current
      ?.querySelector(`[data-line="${firstHighlightedLine}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [firstHighlightedLine, code]);

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
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--blockly-sidebar-kicker)]">Generated code</p>
            <p className="mt-0.5 truncate text-xs text-[color:var(--blockly-sidebar-text-soft)]" aria-live="polite">
              {rangeSummary ?? (hasCode ? 'Select a block to find its code' : 'Your blocks become this code')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide code preview"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-input-bg)] text-[color:var(--blockly-sidebar-text-soft)] transition-all hover:border-[color:var(--blockly-sidebar-border-strong)] hover:bg-[color:var(--blockly-sidebar-card-strong)] hover:text-[color:var(--blockly-sidebar-text)]"
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
        <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {hasCode ? (
            <pre className="font-mono text-[11px] leading-6 text-[color:var(--blockly-sidebar-text)]">
              {lines.map((text, index) => {
                const line = index + 1;
                const isHighlighted = highlightedLines.has(line);
                const isMapped = mappedLines.has(line);
                return (
                  <div
                    key={line}
                    data-line={line}
                    onClick={isMapped ? () => onLineClick(line) : undefined}
                    title={isMapped ? 'Show the block that made this line' : undefined}
                    className={`flex gap-3 rounded-[6px] px-2 ${
                      isHighlighted
                        ? 'bg-[color-mix(in_srgb,var(--blockly-sidebar-accent)_32%,transparent)] shadow-[inset_3px_0_0_var(--blockly-sidebar-accent)]'
                        : isMapped
                          ? 'hover:bg-[color-mix(in_srgb,var(--blockly-sidebar-accent)_12%,transparent)]'
                          : ''
                    } ${isMapped ? 'cursor-pointer' : ''}`}
                  >
                    <span aria-hidden="true" className="w-6 shrink-0 select-none text-right tabular-nums text-[color:var(--blockly-sidebar-text-soft)] opacity-60">
                      {line}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{text || ' '}</span>
                  </div>
                );
              })}
            </pre>
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
