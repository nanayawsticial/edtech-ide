"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, Lightbulb, X } from 'lucide-react';

import { getLesson } from '@/lib/lessons';
import { evaluateCheck, type LessonCheckContext } from '@/lib/lessons/checks';
import type { LessonActivity, LessonStep, LessonStepKind } from '@/lib/lessons/types';
import type { ToolboxLearningLevel } from '@/lib/blockly/guidedToolbox';
import { normalizeComponentType } from '@/lib/wiring/componentDefinitions';
import { useBlocklyStore } from '@/stores/blocklyStore';
import { useCircuitStore } from '@/stores/circuitStore';
import { useLessonStore } from '@/stores/lessonStore';
import { useSimulationStore } from '@/stores/simulationStore';

const KIND_LABELS: Record<LessonStepKind, string> = {
  place: 'Build',
  wire: 'Wire',
  code: 'Code',
  run: 'Run',
  observe: 'Check',
};

const LEVEL_ORDER: ToolboxLearningLevel[] = ['starter', 'builder', 'explore'];

interface Observations {
  ledToggles: number;
  servoAngles: number[];
}

/**
 * Counts what the simulation does while a step is open: LEDs switching on/off, servo angles.
 * Resets whenever `resetKey` changes (a new step).
 */
function useSimulationObservations(resetKey: string, componentTypes: Record<string, string>): Observations {
  // Tagged with the step they were seen on, so a new step starts from zero.
  const [observations, setObservations] = useState<Observations & { key: string }>({ key: resetKey, ledToggles: 0, servoAngles: [] });
  const typesRef = useRef(componentTypes);
  useEffect(() => {
    typesRef.current = componentTypes;
  }, [componentTypes]);

  useEffect(() => {
    return useSimulationStore.subscribe((state, previous) => {
      const visuals = state.simulationState.componentVisuals;
      const before = previous.simulationState.componentVisuals;
      if (!state.simulationState.running || visuals === before) {
        return;
      }

      let toggles = 0;
      const angles: number[] = [];
      for (const [componentId, visual] of Object.entries(visuals)) {
        const type = typesRef.current[componentId];
        if (type === 'LED' && Boolean(visual?.outputHigh) !== Boolean(before[componentId]?.outputHigh)) {
          toggles += 1;
        }
        if ((type === 'SERVO' || type === 'MICRO_SERVO') && typeof visual?.angle === 'number') {
          angles.push(visual.angle as number);
        }
      }

      if (toggles > 0 || angles.length > 0) {
        setObservations((current) => {
          const base = current.key === resetKey ? current : { key: resetKey, ledToggles: 0, servoAngles: [] };
          return {
            key: resetKey,
            ledToggles: base.ledToggles + toggles,
            servoAngles: angles.length > 0 ? [...base.servoAngles.slice(-200), ...angles] : base.servoAngles,
          };
        });
      }
    });
  }, [resetKey]);

  return observations.key === resetKey ? observations : { ledToggles: 0, servoAngles: [] };
}

function useLessonCheckContext(): Omit<LessonCheckContext, 'observations'> & { componentTypes: Record<string, string> } {
  const components = useCircuitStore((state) => state.components);
  const connections = useCircuitStore((state) => state.resolvedConnections);
  const code = useBlocklyStore((state) => state.generatedPreviewCode);
  const simulating = useSimulationStore((state) => state.simulationState.running);

  return useMemo(() => {
    const typed = components.map((component) => ({ id: component.id, type: normalizeComponentType(component.type) }));
    return {
      components: typed,
      componentTypes: Object.fromEntries(typed.map((component) => [component.id, component.type])),
      connections,
      code,
      simulating,
    };
  }, [code, components, connections, simulating]);
}

function StepChecklist({ step, context }: { step: LessonStep; context: LessonCheckContext }) {
  const results = evaluateCheck(step.check, context);
  if (results.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 space-y-1.5" aria-label="Checklist">
      {results.map((result) => (
        <li key={result.label} className="flex items-start gap-2 text-[13px] leading-5">
          {result.passed ? (
            <Check size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-label="Done" />
          ) : (
            <Circle size={15} className="mt-0.5 shrink-0 text-slate-500" aria-label="Not yet" />
          )}
          <span className={result.passed ? 'text-emerald-200' : 'text-slate-300'}>{result.label}</span>
        </li>
      ))}
    </ul>
  );
}

function ActivityIntro({ activity, onStart }: { activity: LessonActivity; onStart: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-[14px] leading-6 text-slate-100">{activity.goal}</p>
      <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] leading-5 text-slate-300">
        <span className="font-semibold text-slate-100">In real life: </span>
        {activity.realWorld}
      </p>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">You need</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {activity.parts.map((part) => (
            <li key={part.type} className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[12px] text-slate-200">
              {part.count > 1 ? `${part.count} × ` : ''}
              {part.label}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-white transition hover:bg-indigo-400"
      >
        <span className="text-sm font-semibold">Start</span>
      </button>
    </div>
  );
}

function StepView({ step, context }: { step: LessonStep; context: LessonCheckContext }) {
  const [showHint, setShowHint] = useState(false);
  const [showCpp, setShowCpp] = useState(true);

  return (
    <div>
      <p className="text-[14px] leading-6 text-slate-100">{step.body}</p>

      {step.blocks?.length ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Blocks</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {step.blocks.map((block, index) => (
              <li key={`${block}-${index}`} className="rounded-md bg-indigo-500/25 px-2 py-1 font-mono text-[12px] text-indigo-100">
                {block}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step.cpp ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowCpp((current) => !current)}
            className="block text-left text-slate-400 hover:text-slate-200"
            aria-expanded={showCpp}
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
              {showCpp ? 'Hide' : 'Show'} the C++ these blocks make
            </span>
          </button>
          {showCpp ? (
            <pre className="mt-1.5 overflow-x-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] leading-5 text-emerald-200">
              {step.cpp}
            </pre>
          ) : null}
        </div>
      ) : null}

      <StepChecklist step={step} context={context} />

      {step.hint ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowHint((current) => !current)}
            className="inline-flex items-center gap-1.5 text-amber-300 hover:text-amber-200"
            aria-expanded={showHint}
          >
            <Lightbulb size={14} />
            <span className="text-[12px] font-semibold">{showHint ? 'Hide hint' : 'Need a hint?'}</span>
          </button>
          {showHint ? <p className="mt-1.5 text-[13px] leading-5 text-slate-300">{step.hint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Step-by-step guide for the lesson opened from Courses. Floats over the workspace; it reads the
 * circuit, the code made from the blocks and the simulation to tick steps off as they are done.
 */
export default function LessonPanel() {
  const active = useLessonStore((state) => state.active);
  const minimized = useLessonStore((state) => state.minimized);
  const goTo = useLessonStore((state) => state.goTo);
  const endLesson = useLessonStore((state) => state.endLesson);
  const setMinimized = useLessonStore((state) => state.setMinimized);
  const completeActivity = useLessonStore((state) => state.completeActivity);
  const panelOffset = useLessonStore((state) => state.panelOffset);
  const setPanelOffset = useLessonStore((state) => state.setPanelOffset);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null);
  const learningLevel = useBlocklyStore((state) => state.toolboxLearningLevel);
  const setLearningLevel = useBlocklyStore((state) => state.setToolboxLearningLevel);

  const lesson = getLesson(active?.slug);
  const activityIndex = Math.min(active?.activityIndex ?? 0, (lesson?.activities.length ?? 1) - 1);
  const activity = lesson?.activities[activityIndex] ?? null;
  const stepIndex = active?.stepIndex ?? -1;
  const step = activity && stepIndex >= 0 ? activity.steps[stepIndex] ?? null : null;
  const isSummary = Boolean(activity && stepIndex >= activity.steps.length);

  const stepKey = `${active?.slug}:${activityIndex}:${stepIndex}`;
  const baseContext = useLessonCheckContext();
  const observations = useSimulationObservations(stepKey, baseContext.componentTypes);
  const context: LessonCheckContext = { ...baseContext, observations };

  // Open the block categories this activity needs (never hide ones the learner already has).
  useEffect(() => {
    const needed = activity?.learningLevel;
    if (needed && LEVEL_ORDER.indexOf(needed) > LEVEL_ORDER.indexOf(learningLevel)) {
      setLearningLevel(needed);
    }
  }, [activity?.learningLevel, learningLevel, setLearningLevel]);

  useEffect(() => {
    if (activity && isSummary) {
      completeActivity(activity.id);
    }
  }, [activity, completeActivity, isSummary]);

  if (!active || !lesson || !activity) {
    return null;
  }

  const stepCount = activity.steps.length;
  const results = step ? evaluateCheck(step.check, context) : [];
  const stepPassed = results.length > 0 && results.every((result) => result.passed);
  const isLastActivity = activityIndex >= lesson.activities.length - 1;

  // Drag the panel by its header so it can be moved off whatever the learner is working on.
  const onHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }
    dragRef.current = { x: event.clientX, y: event.clientY, ...panelOffset };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    const panel = panelRef.current;
    const container = panel?.offsetParent as HTMLElement | null;
    if (!start || !panel || !container) {
      return;
    }
    const maxRight = Math.max(0, container.clientWidth - panel.offsetWidth);
    const maxBottom = Math.max(0, container.clientHeight - panel.offsetHeight);
    setPanelOffset({
      right: Math.min(maxRight, Math.max(0, start.right - (event.clientX - start.x))),
      bottom: Math.min(maxBottom, Math.max(0, start.bottom - (event.clientY - start.y))),
    });
  };
  const onHeaderPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const header = (
    <div
      className="flex cursor-grab touch-none select-none items-start gap-2 active:cursor-grabbing"
      onPointerDown={onHeaderPointerDown}
      onPointerMove={onHeaderPointerMove}
      onPointerUp={onHeaderPointerUp}
      onPointerCancel={onHeaderPointerUp}
      title="Drag to move"
    >
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/25 text-indigo-200">
        <BookOpen size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {lesson.title} · {activityIndex + 1} of {lesson.activities.length}
        </p>
        <p className="truncate text-[15px] font-semibold text-white">{activity.title}</p>
      </div>
      <button
        type="button"
        onClick={() => setMinimized(!minimized)}
        className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
        aria-label={minimized ? 'Show lesson' : 'Minimise lesson'}
        title={minimized ? 'Show lesson' : 'Minimise lesson'}
      >
        {minimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Close this lesson? Your circuit and code stay as they are.')) {
            endLesson();
          }
        }}
        className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
        aria-label="Close lesson"
        title="Close lesson"
      >
        <X size={16} />
      </button>
    </div>
  );

  return (
    <aside
      ref={panelRef}
      className="ui-always-dark pointer-events-auto absolute z-[60] flex w-[360px] max-w-[calc(100%-2rem)] flex-col rounded-2xl border border-white/10 bg-[#0d1322]/95 p-4 text-slate-100 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur"
      style={{ right: panelOffset.right, bottom: panelOffset.bottom }}
      aria-label="Lesson guide"
      data-testid="lesson-panel"
    >
      {header}

      {minimized ? (
        step ? (
          <p className="mt-2 truncate text-[13px] text-slate-300">
            Step {stepIndex + 1} of {stepCount}: {step.title}
          </p>
        ) : null
      ) : (
        <div className="mt-3 max-h-[min(60vh,520px)] overflow-y-auto pr-1">
          {stepIndex < 0 ? (
            <ActivityIntro activity={activity} onStart={() => goTo(activityIndex, 0)} />
          ) : isSummary ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-300">
                <Check size={18} /> Activity complete
              </p>
              <p className="text-[14px] leading-6 text-slate-100">{activity.observe}</p>
              <p className="text-[13px] leading-5 text-slate-300">{activity.wrapUp}</p>
              <button
                type="button"
                onClick={() => goTo(activityIndex, stepCount - 1)}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-white"
              >
                <ChevronLeft size={14} /> <span className="text-[12px] font-semibold">Back to the last step</span>
              </button>
              {isLastActivity ? (
                <p className="text-[13px] leading-5 text-slate-300">You finished every activity in this lesson.</p>
              ) : (
                <button
                  type="button"
                  onClick={() => goTo(activityIndex + 1, -1)}
                  className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-white transition hover:bg-indigo-400"
                >
                  <span className="text-sm font-semibold">Next activity: {lesson.activities[activityIndex + 1].title}</span>
                </button>
              )}
            </div>
          ) : step ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-200">
                  {KIND_LABELS[step.kind]}
                </span>
                <span className="text-[12px] text-slate-400">
                  Step {stepIndex + 1} of {stepCount}
                </span>
              </div>
              <h3 className="text-[16px] font-semibold text-white">{step.title}</h3>
              <div className="mt-1.5">
                <StepView key={stepKey} step={step} context={context} />
              </div>
              {stepPassed ? (
                <p className="mt-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-[13px] font-semibold text-emerald-200">
                  Well done! Go to the next step.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      {!minimized && step ? (
        <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => goTo(activityIndex, stepIndex - 1)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft size={16} /> <span className="text-sm font-semibold">Back</span>
          </button>
          <div className="flex flex-1 justify-center gap-1" aria-hidden="true">
            {activity.steps.map((item, index) => (
              <span
                key={item.id}
                className={`h-1.5 w-1.5 rounded-full ${index === stepIndex ? 'bg-indigo-300' : index < stepIndex ? 'bg-emerald-400/70' : 'bg-white/20'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => goTo(activityIndex, stepIndex + 1)}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 transition ${
              stepPassed || !step.check ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'bg-white/10 text-slate-200 hover:bg-white/15'
            }`}
          >
            <span className="text-sm font-semibold">{step.check ? 'Next' : 'Done'}</span> <ChevronRight size={16} />
          </button>
        </div>
      ) : null}
    </aside>
  );
}
