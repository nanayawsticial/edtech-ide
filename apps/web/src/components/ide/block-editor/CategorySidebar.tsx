"use client";

import { ChevronLeft, Lock, Search, Wand2 } from 'lucide-react';

import { TOOLBOX_LEARNING_LEVELS, type ToolboxLearningLevel } from '@/lib/blockly/guidedToolbox';

import { CUSTOMIZE_CATEGORY_ENTRY, LEARNING_LEVEL_LABELS, type ShelfCategory } from './config';
import type { DisplayStarter } from './displayStarters';

type CategorySidebarProps = {
  isCompactLayout: boolean;
  /** Only used in the compact layout, where the sidebar slides over the canvas. */
  isOpen: boolean;
  onClose: () => void;
  boardName: string;
  learningLevel: ToolboxLearningLevel;
  onLearningLevelChange: (level: ToolboxLearningLevel) => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** Starters to offer; empty hides the "Display starter" card. */
  displayStarters: DisplayStarter[];
  onInsertDisplayStarter: (starterId: string) => void;
  categories: ShelfCategory[];
  activeCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  isCategoryManagerOpen: boolean;
  onOpenCategoryManager: () => void;
};

/** The block group list on the left of the block editor: search, learning level, and the groups. */
export function CategorySidebar({
  isCompactLayout,
  isOpen,
  onClose,
  boardName,
  learningLevel,
  onLearningLevelChange,
  query,
  onQueryChange,
  displayStarters,
  onInsertDisplayStarter,
  categories,
  activeCategoryId,
  onSelectCategory,
  isCategoryManagerOpen,
  onOpenCategoryManager,
}: CategorySidebarProps) {
  return (
    <>
      {isCompactLayout && isOpen ? (
        <button
          type="button"
          aria-label="Close block toolbox"
          onClick={onClose}
          className="absolute inset-0 z-20 bg-slate-950/28 backdrop-blur-[1px]"
        />
      ) : null}

      <aside
        className={`flex shrink-0 flex-col overflow-hidden bg-[image:var(--blockly-sidebar-bg)] transition-[width,opacity,transform] duration-200 ${
          isCompactLayout
            ? isOpen
              ? 'absolute inset-y-3 left-3 z-30 w-[min(320px,calc(100%-1.5rem))] rounded-[22px] border border-[color:var(--blockly-sidebar-border)] opacity-100 shadow-[0_28px_72px_-40px_rgba(15,23,42,0.82)]'
              : 'pointer-events-none absolute inset-y-3 left-3 z-30 w-[min(320px,calc(100%-1.5rem))] -translate-x-4 rounded-[22px] border border-transparent opacity-0'
            : 'w-[252px] border-r border-[color:var(--blockly-sidebar-border)]'
        }`}
      >
        <div className="border-b border-[color:var(--blockly-sidebar-border)] px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--blockly-sidebar-kicker)]">Code with blocks</p>
              <p className="mt-1 text-base font-semibold text-[color:var(--blockly-sidebar-text)]">{boardName}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[color:var(--blockly-sidebar-border-strong)] bg-[color:var(--blockly-sidebar-chip)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--blockly-sidebar-text-soft)]">
                {LEARNING_LEVEL_LABELS[learningLevel]}
              </span>
              {isCompactLayout ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[12px] border border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-input-bg)] text-[color:var(--blockly-sidebar-text-soft)] transition-all hover:border-[color:var(--blockly-sidebar-border-strong)] hover:bg-[color:var(--blockly-sidebar-card-strong)] hover:text-[color:var(--blockly-sidebar-text)]"
                  aria-label="Close block toolbox"
                >
                  <ChevronLeft size={14} />
                </button>
              ) : null}
            </div>
          </div>

          <label className="mt-3 flex h-10 items-center gap-3 rounded-[16px] border border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-input-bg)] px-3 text-[color:var(--blockly-sidebar-text-soft)] transition-colors focus-within:border-[color:var(--blockly-sidebar-accent)] focus-within:text-[color:var(--blockly-sidebar-text)]">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search what you want to do"
              className="w-full bg-transparent text-sm text-[color:var(--blockly-sidebar-text)] outline-none placeholder:text-[color:var(--blockly-sidebar-text-soft)]/70"
            />
          </label>

          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {TOOLBOX_LEARNING_LEVELS.map((level) => {
              const isActive = learningLevel === level;
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onLearningLevelChange(level)}
                  className={`rounded-[12px] border px-2 py-1.5 text-[11px] font-semibold transition-all ${
                    isActive
                      ? 'border-violet-300/30 bg-[linear-gradient(180deg,#8a56ff_0%,#7641ea_100%)] text-white shadow-[0_20px_34px_-24px_rgba(118,65,234,0.76)]'
                      : 'border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-card)] text-[color:var(--blockly-sidebar-text-soft)] hover:border-[color:var(--blockly-sidebar-border-strong)] hover:text-[color:var(--blockly-sidebar-text)]'
                  }`}
                >
                  {LEARNING_LEVEL_LABELS[level]}
                </button>
              );
            })}
          </div>

          {displayStarters.length > 0 ? (
            <div className="mt-4 rounded-[22px] border border-[color:var(--blockly-sidebar-border-strong)] bg-[color:var(--blockly-sidebar-card)] p-3 shadow-[0_20px_36px_-28px_rgba(15,23,42,0.55)]">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--blockly-sidebar-text-soft)]">
                <Wand2 size={13} />
                Display starter
              </div>
              <div className="mt-3 space-y-2">
                {displayStarters.map((starter) => (
                  <button
                    key={starter.id}
                    type="button"
                    onClick={() => onInsertDisplayStarter(starter.id)}
                    className="w-full rounded-[16px] border border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-input-bg)] px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-[color:var(--blockly-sidebar-accent)]/70 hover:bg-[color:var(--blockly-sidebar-card-strong)]"
                  >
                    <div className="text-sm font-semibold text-[color:var(--blockly-sidebar-text)]">{starter.label}</div>
                    <div className="mt-1 text-xs leading-5 text-[color:var(--blockly-sidebar-text-soft)]">{starter.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
          <div className="space-y-1.5">
            {categories.map((category) => {
              const isActive = activeCategoryId === category.id;
              const isLocked = category.isEmpty;
              const categoryDescription = isLocked ? 'Build the matching part to unlock these blocks.' : category.description;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onSelectCategory(category.id)}
                  disabled={isLocked}
                  title={categoryDescription}
                  className={`group flex w-full items-center gap-2.5 rounded-[14px] border px-2.5 py-2 text-left transition-all ${
                    isActive
                      ? 'border-violet-300/35 bg-[linear-gradient(180deg,#8a56ff_0%,#7641ea_100%)] text-white shadow-[0_22px_38px_-26px_rgba(134,78,251,0.72)]'
                      : isLocked
                        ? 'border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-card)] text-[color:var(--blockly-sidebar-text-soft)] opacity-70'
                        : 'border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-card)] text-[color:var(--blockly-sidebar-text)] hover:border-[color:var(--blockly-sidebar-border-strong)] hover:bg-[color:var(--blockly-sidebar-card-strong)] hover:text-[color:var(--blockly-sidebar-text)]'
                  }`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white shadow-[0_18px_36px_-26px_rgba(0,0,0,0.7)]"
                    style={{ backgroundColor: category.color }}
                  >
                    {category.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-5">{category.label}</span>
                    <span
                      className={`block truncate text-[11.5px] leading-4 ${
                        isActive
                          ? 'text-white/85'
                          : 'text-[color:var(--blockly-sidebar-text-soft)] group-hover:text-[color:var(--blockly-sidebar-text)]'
                      }`}
                    >
                      {categoryDescription}
                    </span>
                  </span>
                  {isLocked ? (
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-input-bg)] text-[color:var(--blockly-sidebar-text-soft)]"
                    >
                      <Lock size={11} aria-hidden="true" />
                      <span className="sr-only">Locked</span>
                    </span>
                  ) : (
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                      isActive
                        ? 'border-white/18 bg-white/14 text-white'
                        : 'border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-input-bg)] text-[color:var(--blockly-sidebar-text-soft)]'
                    }`}>
                      {category.blockCount}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={onOpenCategoryManager}
              title={CUSTOMIZE_CATEGORY_ENTRY.description}
              className={`group flex w-full items-center gap-2.5 rounded-[14px] border px-2.5 py-2 text-left transition-all ${
                isCategoryManagerOpen
                  ? 'border-violet-300/35 bg-[linear-gradient(180deg,#1f1f22_0%,#111115_100%)] text-white shadow-[0_22px_38px_-26px_rgba(0,0,0,0.72)]'
                  : 'border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-card)] text-[color:var(--blockly-sidebar-text)] hover:border-[color:var(--blockly-sidebar-border-strong)] hover:bg-[color:var(--blockly-sidebar-card-strong)] hover:text-[color:var(--blockly-sidebar-text)]'
              }`}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white shadow-[0_18px_36px_-26px_rgba(0,0,0,0.7)]"
                style={{ backgroundColor: CUSTOMIZE_CATEGORY_ENTRY.color }}
              >
                {CUSTOMIZE_CATEGORY_ENTRY.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-5">{CUSTOMIZE_CATEGORY_ENTRY.label}</span>
                <span className="block truncate text-[11.5px] leading-4 text-[color:var(--blockly-sidebar-text-soft)] group-hover:text-[color:var(--blockly-sidebar-text)]">
                  {CUSTOMIZE_CATEGORY_ENTRY.description}
                </span>
              </span>
            </button>

            {categories.length === 0 ? (
              <div className="mt-4 rounded-[18px] border border-dashed border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-card)] px-4 py-4 text-sm text-[color:var(--blockly-sidebar-text-soft)]">
                {query.trim().length > 0
                  ? `No block groups match "${query}".`
                  : 'All block groups are hidden. Open Customize to choose what shows here.'}
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
