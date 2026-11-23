"use client";

import { Check, Sparkles } from 'lucide-react';

import { LEARNING_GUIDE_ACTION_LABELS, type CoachMilestone, type LearningGuide, type LearningGuideActionId } from './learningGuide';

type CoachCardProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  milestones: CoachMilestone[];
  guide: LearningGuide;
  onAction: (actionId: LearningGuideActionId) => void;
};

/**
 * Coach card: one goal at a time, ticked off from the workspace. The canvas is dark purple in every
 * theme, so the card uses fixed dark colours rather than the sidebar tokens. White text and tints are
 * written as arbitrary values (text-[#fff], bg-[rgba(...)]) on purpose: globals.css repaints
 * .text-white, .text-white/70, .border-white/12 and .bg-white/[0.06] for the light and magma themes,
 * which turned this card's text dark and its tip box opaque white. Both states carry
 * `data-coach-card` so the canvas click handler leaves them alone.
 */
export function CoachCard({ isOpen, onOpenChange, milestones, guide, onAction }: CoachCardProps) {
  const doneCount = milestones.filter((milestone) => milestone.done).length;
  const actionId = guide.actionId;

  if (!isOpen) {
    return (
      <button
        type="button"
        data-coach-card
        onClick={() => onOpenChange(true)}
        className="absolute right-3 top-3 z-10 inline-flex h-9 items-center gap-2 rounded-full border border-[rgba(255,255,255,0.12)] bg-[#1c1535]/95 px-3 text-xs font-semibold text-[#fff] shadow-[0_16px_32px_-20px_rgba(0,0,0,0.9)] backdrop-blur transition-colors hover:bg-[#261c48]"
      >
        <Sparkles size={13} aria-hidden="true" />
        Next step · {doneCount}/{milestones.length}
      </button>
    );
  }

  return (
    <aside
      data-coach-card
      aria-label="Next step"
      className="absolute right-3 top-3 z-10 flex w-[min(280px,calc(100%-1.5rem))] flex-col gap-2 rounded-[16px] border border-[rgba(255,255,255,0.12)] bg-[#1c1535]/95 p-3 text-[#fff] shadow-[0_24px_48px_-28px_rgba(0,0,0,0.9)] backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200">
          <Sparkles size={13} aria-hidden="true" />
          Next step
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tabular-nums text-[rgba(255,255,255,0.7)]">
            {doneCount} of {milestones.length}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-[8px] px-2 py-1 text-[11px] font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-[#fff]"
          >
            Hide
          </button>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div
          className="h-full rounded-full bg-violet-300 transition-[width] duration-300"
          style={{ width: `${(doneCount / milestones.length) * 100}%` }}
        />
      </div>
      <ul className="flex flex-col gap-1">
        {milestones.map((milestone) => (
          <li key={milestone.id} className={`flex items-center gap-2 text-[12px] leading-5 ${milestone.done ? 'text-[rgba(255,255,255,0.7)]' : 'text-[#fff]'}`}>
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${milestone.done ? 'bg-emerald-400 text-[#0b2a1c]' : 'border border-white/35'}`}
              aria-hidden="true"
            >
              {milestone.done ? <Check size={11} strokeWidth={3} /> : null}
            </span>
            <span className={milestone.done ? 'line-through decoration-white/30' : ''}>{milestone.label}</span>
            <span className="sr-only">{milestone.done ? '(done)' : '(to do)'}</span>
          </li>
        ))}
      </ul>
      <div
        className={`flex items-end gap-2 rounded-[12px] px-2.5 py-2 ${
          guide.tone === 'warning'
            ? 'border border-amber-300/30 bg-amber-400/12'
            : guide.tone === 'success'
              ? 'border border-emerald-300/30 bg-emerald-400/12'
              : 'bg-[rgba(255,255,255,0.06)]'
        }`}
      >
        <p className="min-w-0 flex-1 text-xs leading-[1.35rem] text-white/85">
          <span className="sr-only">{guide.title}: </span>
          {guide.detail}
        </p>
        {actionId ? (
          <button
            type="button"
            onClick={() => onAction(actionId)}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-[10px] bg-white px-3 text-xs font-semibold text-[#2a1a5e] transition-colors hover:bg-violet-50"
          >
            {LEARNING_GUIDE_ACTION_LABELS[actionId]}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
