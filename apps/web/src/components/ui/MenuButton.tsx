"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/ui/cn";

export type MenuButtonItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
};

type MenuButtonProps = {
  label: string;
  icon?: React.ReactNode;
  items: MenuButtonItem[];
  className?: string;
  menuClassName?: string;
  align?: "start" | "end";
};

/**
 * A button that opens a small action menu.
 * Keyboard: Enter/Space/ArrowDown open it and focus the first item, ArrowUp/ArrowDown/Home/End move,
 * Escape closes it and returns focus to the button. Clicking outside also closes it.
 * The menu renders in a portal with fixed positioning so overflow-hidden toolbars can't clip it.
 */
export function MenuButton({ label, icon, items, className, menuClassName, align = "end" }: MenuButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ top: number; left?: number; right?: number } | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = React.useId();

  const enabledIndexes = React.useMemo(
    () => items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0),
    [items]
  );

  const focusItem = React.useCallback((index: number) => {
    itemRefs.current[index]?.focus();
  }, []);

  const close = React.useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) {
      buttonRef.current?.focus();
    }
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition(
        align === "end"
          ? { top: rect.bottom + 6, right: window.innerWidth - rect.right }
          : { top: rect.bottom + 6, left: rect.left }
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  React.useEffect(() => {
    if (!open || !position) return;
    const firstEnabled = enabledIndexes[0];
    if (firstEnabled !== undefined) {
      focusItem(firstEnabled);
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
        setPosition(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
    // Focus the first item once, when the menu has been positioned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, Boolean(position)]);

  const moveFocus = (currentIndex: number, direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const position = enabledIndexes.indexOf(currentIndex);
    const nextPosition = (position + direction + enabledIndexes.length) % enabledIndexes.length;
    focusItem(enabledIndexes[nextPosition]);
  };

  const handleButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleItemKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(index, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(index, -1);
        break;
      case "Home":
        event.preventDefault();
        if (enabledIndexes.length) focusItem(enabledIndexes[0]);
        break;
      case "End":
        event.preventDefault();
        if (enabledIndexes.length) focusItem(enabledIndexes[enabledIndexes.length - 1]);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        // The menu lives in a portal at the end of <body>; hand focus back to the button so the
        // browser's default Tab continues from there instead of leaving the page.
        close(true);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleButtonKeyDown}
        className={className}
      >
        {icon}
        <span>{label}</span>
      </button>
      {open && position && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          style={{ position: "fixed", top: position.top, left: position.left, right: position.right }}
          className={cn(
            "z-[1000] min-w-[200px] rounded-[14px] border border-white/10 bg-[color:var(--ui-menu-bg)] p-1.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)]",
            menuClassName
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onKeyDown={(event) => handleItemKeyDown(event, index)}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:outline-none disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent"
            >
              {item.icon ? <span className="shrink-0 text-slate-400">{item.icon}</span> : null}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  );
}
