"use client";

import { Blocks as BlocksIcon, ChevronLeft, ChevronRight, Code2, Crosshair, Move, Wand2 } from 'lucide-react';

type CanvasToolbarProps = {
  activeCategoryLabel: string;
  isCompactLayout: boolean;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  blockCount: number;
  onFit: () => void;
  onCenter: () => void;
  onArrange: () => void;
  showCodePanel: boolean;
  onToggleCodePanel: () => void;
};

const TOOLBAR_BUTTON_CLASS =
  'inline-flex h-10 items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-violet-50/90 transition-all hover:-translate-y-0.5 hover:border-violet-300/35 hover:bg-white/[0.08] hover:text-white';

/** The header row above the block canvas: current group, block count, view controls, code toggle. */
export function CanvasToolbar({
  activeCategoryLabel,
  isCompactLayout,
  isSidebarOpen,
  onToggleSidebar,
  blockCount,
  onFit,
  onCenter,
  onArrange,
  showCodePanel,
  onToggleCodePanel,
}: CanvasToolbarProps) {
  return (
    <div className="flex min-h-[68px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[color:var(--blockly-toolbar-bg)]/84 px-4 py-3 backdrop-blur">

      <div className="min-w-0 flex-1">
        {/* The canvas toolbar is dark purple in every theme, so these use fixed light colours. */}
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-200/80">Step 2: Code</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-violet-300/30 bg-violet-400/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-50">
            {activeCategoryLabel}
          </span>
          <span className="hidden text-xs text-violet-100/60 md:inline">Build, code, then run.</span>
        </div>
      </div>

      <div className="flex w-full items-center justify-end gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 lg:w-auto lg:flex-nowrap lg:overflow-visible lg:pb-0">
        {isCompactLayout ? (
          <button type="button" onClick={onToggleSidebar} className={TOOLBAR_BUTTON_CLASS}>
            <BlocksIcon size={14} />
            <span className="hidden sm:inline">{isSidebarOpen ? 'Hide Toolbox' : 'Toolbox'}</span>
            {isSidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : null}
        {/* bg-white/[0.05] matches the toolbar buttons beside it; bg-white/[0.06] is repainted opaque brown by the magma overrides. */}
        <span className="hidden rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-50/78 sm:inline-flex">
          {blockCount} blocks
        </span>
        <button type="button" onClick={onFit} className={TOOLBAR_BUTTON_CLASS}>
          <Crosshair size={14} />
          <span className="hidden sm:inline">Fit</span>
        </button>
        <button type="button" onClick={onCenter} className={TOOLBAR_BUTTON_CLASS}>
          <Move size={14} />
          <span className="hidden sm:inline">Center</span>
        </button>
        <button type="button" onClick={onArrange} className={TOOLBAR_BUTTON_CLASS}>
          <Wand2 size={14} />
          <span className="hidden sm:inline">Arrange</span>
        </button>
        <button
          type="button"
          onClick={onToggleCodePanel}
          title={showCodePanel ? 'Hide code preview' : 'Show code preview'}
          className={TOOLBAR_BUTTON_CLASS}
        >
          <Code2 size={14} />
          <span className="hidden sm:inline">{showCodePanel ? 'Hide Code' : 'Show Code'}</span>
          {showCodePanel ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>
    </div>
  );
}
