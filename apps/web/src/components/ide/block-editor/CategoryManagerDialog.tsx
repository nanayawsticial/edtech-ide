"use client";

import type { ShelfCategory } from './config';

type CategoryManagerDialogProps = {
  categories: ShelfCategory[];
  /** Ids of the groups ticked in the dialog (applied only on Confirm). */
  visibleIds: string[];
  onToggle: (categoryId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/** "Block Groups" overlay opened from Customize: choose which groups show in the sidebar. */
export function CategoryManagerDialog({ categories, visibleIds, onToggle, onCancel, onConfirm }: CategoryManagerDialogProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[color:var(--blockly-sidebar-overlay)] px-6 backdrop-blur-sm">
      <div className="w-full max-w-[680px] overflow-hidden rounded-[30px] border border-[color:var(--blockly-sidebar-border-strong)] bg-[color:var(--blockly-flyout-fill)] shadow-[0_42px_110px_-54px_rgba(0,0,0,0.92)]">
        <div className="px-6 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[1.05rem] font-semibold text-[color:var(--blockly-sidebar-text)]">Block Groups</h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--blockly-sidebar-text-soft)]">Choose which learning groups should show in the block shelf.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-[color:var(--blockly-sidebar-input-bg)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--blockly-sidebar-text-soft)]">
              {visibleIds.length} visible
            </span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {categories.map((category) => {
              const isChecked = visibleIds.includes(category.id);
              const isLastVisible = isChecked && visibleIds.length === 1;
              return (
                <label
                  key={category.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-[18px] border px-4 py-3 transition-all ${
                    isChecked
                      ? 'border-[color:var(--blockly-sidebar-border-strong)] bg-[color:var(--blockly-sidebar-card-strong)] text-[color:var(--blockly-sidebar-text)]'
                      : 'border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-card)] text-[color:var(--blockly-sidebar-text)] hover:border-[color:var(--blockly-sidebar-border-strong)] hover:bg-[color:var(--blockly-sidebar-card-strong)]'
                  } ${isLastVisible ? 'opacity-90' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-amber-400"
                    checked={isChecked}
                    onChange={() => onToggle(category.id)}
                    disabled={isLastVisible}
                  />
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-white shadow-[0_18px_36px_-26px_rgba(0,0,0,0.7)]"
                    style={{ backgroundColor: category.color }}
                  >
                    {category.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{category.label}</span>
                    <span className="mt-0.5 block text-xs text-[color:var(--blockly-sidebar-text-soft)]">
                      {category.isEmpty ? 'Unlock by adding the matching part.' : `${category.blockCount} blocks ready`}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-input-bg)] px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[14px] border border-[color:var(--blockly-sidebar-border)] bg-[color:var(--blockly-sidebar-card)] px-4 py-2 text-sm font-medium text-[color:var(--blockly-sidebar-text)] transition-colors hover:border-[color:var(--blockly-sidebar-border-strong)] hover:bg-[color:var(--blockly-sidebar-card-strong)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={visibleIds.length === 0}
            className="rounded-[14px] border border-amber-300/20 bg-[linear-gradient(180deg,#f2a640_0%,#dc8a26_100%)] px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_32px_-24px_rgba(220,138,38,0.8)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
