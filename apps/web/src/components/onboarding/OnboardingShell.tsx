"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import ThemeToggle from "@/components/layout/ThemeToggle";
import BackHomeButtons from "@/components/layout/BackHomeButtons";
import { JourneyProgress } from "@/components/ui/JourneyProgress";

type JourneyStep = {
  label: string;
};

interface OnboardingShellProps {
  children: ReactNode;
  headerActions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  steps?: JourneyStep[];
  activeIndex?: number;
  contentClassName?: string;
  bodyClassName?: string;
}

export default function OnboardingShell({
  children,
  headerActions,
  backHref,
  steps,
  activeIndex = 0,
  contentClassName,
  bodyClassName,
}: OnboardingShellProps) {
  return (
    <section className="ui-page-shell relative flex min-h-full flex-1 flex-col overflow-auto">
      <div className="ui-page-backdrop" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[color:var(--ui-border-soft)]" />

      <div className={cn("relative z-10 mx-auto flex w-full max-w-[1560px] flex-1 flex-col px-6 py-6 sm:px-8 lg:px-10", bodyClassName)}>
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[color:var(--ui-color-primary)]/10 border border-[color:var(--ui-color-primary)]/20 shadow-lg">
              <Sparkles size={18} className="text-[color:var(--ui-color-primary)]" />
            </span>
            <span className="text-base font-bold tracking-tight text-[color:var(--ui-color-text)]">Sticial Studio</span>
          </Link>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <BackHomeButtons
              backFallbackHref={backHref ?? "/"}
              buttonClassName="min-h-11 rounded-[18px] px-4 py-2.5 text-sm font-semibold tracking-[-0.01em]"
            />
            {headerActions}
            <ThemeToggle className="ui-foundation-panel-quiet text-[color:var(--ui-color-text)] hover:border-[color:var(--ui-border-strong)]" showLabel />
          </div>
        </div>

        {steps?.length ? (
          <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-end">
            <JourneyProgress steps={steps} activeIndex={activeIndex} tone="immersive" className="justify-start lg:justify-end" />
          </div>
        ) : null}

        <div className={cn("flex flex-1 flex-col", contentClassName)}>{children}</div>
      </div>
    </section>
  );
}
