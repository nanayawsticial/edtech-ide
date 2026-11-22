"use client";

import React from "react";
import type { IdeRightContextView } from "./IdeRightContextPanel";

interface IdeRightActivityBarProps {
  views: IdeRightContextView[];
  activeView: string;
  isCollapsed: boolean;
  onChangeView: (viewId: string) => void;
  onToggleCollapsed: () => void;
}

export default function IdeRightActivityBar({
  views,
  activeView,
  isCollapsed,
  onChangeView,
  onToggleCollapsed,
}: IdeRightActivityBarProps) {
  const handleItemClick = (viewId: string) => {
    if (activeView === viewId) {
      onToggleCollapsed();
      return;
    }

    onChangeView(viewId);
    if (isCollapsed) {
      onToggleCollapsed();
    }
  };

  return (
    <div className="flex h-full w-[54px] flex-col items-center rounded-none border-l border-[color:var(--ui-border-soft)] bg-[color:var(--ui-surface-quiet)] py-4 shadow-inner backdrop-blur-xl">
      <div className="flex w-full flex-1 flex-col items-center gap-4">
        {views.map((view) => {
          const isActive = activeView === view.id && !isCollapsed;

          return (
            <button
              key={view.id}
              type="button"
              onClick={() => handleItemClick(view.id)}
              className={`group relative flex h-12 w-12 items-center justify-center rounded-[16px] transition-all duration-200 ${
                isActive
                  ? "bg-[color:var(--ui-color-primary)]/14 text-[var(--ui-color-primary)] shadow-[0_12px_24px_-22px_rgba(139,92,246,0.9)]"
                  : "text-[var(--ui-color-text-soft)] hover:bg-[color:var(--ui-surface-elevated)] hover:text-[var(--ui-color-text)]"
              }`}
              title={view.label}
            >
              {isActive ? (
                <div className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-l-md bg-[var(--ui-color-primary)]" />
              ) : null}
              {view.icon ?? <span className="text-xs font-bold uppercase">{view.label.slice(0, 2)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
