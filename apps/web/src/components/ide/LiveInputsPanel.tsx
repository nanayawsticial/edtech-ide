"use client";

import React, { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';

import { getComponentDefinition } from '@/lib/wiring/componentDefinitions';
import { useCircuitStore } from '@/stores/circuitStore';
import { useSimulationStore } from '@/stores/simulationStore';

interface SliderSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  fallback: number;
  format: (value: number) => string;
}

/** The values a learner can change on each kind of part while the simulation runs. */
const SLIDERS: Record<string, SliderSpec[]> = {
  POTENTIOMETER: [{ key: 'value', label: 'Knob', min: 0, max: 1023, fallback: 512, format: (v) => String(v) }],
  ULTRASONIC: [{ key: 'distance', label: 'Distance', min: 2, max: 400, fallback: 100, format: (v) => `${v} cm` }],
  DHT: [
    { key: 'temperature', label: 'Temperature', min: -10, max: 80, fallback: 24, format: (v) => `${v} °C` },
    { key: 'humidity', label: 'Humidity', min: 0, max: 100, fallback: 40, format: (v) => `${v}%` },
  ],
  LDR: [{ key: 'light', label: 'Light', min: 0, max: 100, fallback: 60, format: (v) => (v < 50 ? `${v} (dark)` : `${v} (bright)`) }],
  SOUND_SENSOR: [{ key: 'level', label: 'Loudness', min: 0, max: 100, fallback: 20, format: (v) => (v >= 60 ? `${v} (loud)` : `${v} (quiet)`) }],
};

/**
 * Live inputs: change what the sensors "feel" (light, sound, distance...) and press buttons while
 * the simulation runs. Shown over the workspace only while simulating and only for parts that have
 * something to change.
 */
export default function LiveInputsPanel() {
  const components = useCircuitStore((state) => state.components);
  const updateComponentState = useCircuitStore((state) => state.updateComponentState);
  const running = useSimulationStore((state) => state.simulationState.running);
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLElement | null>(null);
  const [bottom, setBottom] = useState(16);

  const inputs = components
    .map((component) => ({ component, definition: getComponentDefinition(component.type) }))
    .filter(({ definition }) => definition && (SLIDERS[definition.id] || definition.id === 'BUTTON'));
  const visible = running && inputs.length > 0;

  // Sit just above the terminal dock, so the Serial Monitor output stays readable.
  useLayoutEffect(() => {
    const container = panelRef.current?.offsetParent as HTMLElement | null;
    if (!visible || !container) {
      return;
    }
    const place = () => {
      const dock = Array.from(container.querySelectorAll<HTMLElement>('[data-ide-bottom-dock]')).find((element) => element.offsetHeight > 0);
      const containerBottom = container.getBoundingClientRect().bottom;
      setBottom(dock ? Math.max(16, Math.round(containerBottom - dock.getBoundingClientRect().top + 12)) : 16);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(container);
    container.querySelectorAll('[data-ide-bottom-dock]').forEach((dock) => observer.observe(dock));
    return () => observer.disconnect();
  }, [visible]);

  if (!visible) {
    return null;
  }

  // Number parts of the same kind ("Push Button 2") so learners can tell them apart.
  const seen: Record<string, number> = {};

  return (
    <aside
      ref={panelRef}
      style={{ bottom }}
      className="ui-always-dark pointer-events-auto absolute left-4 z-[55] w-[280px] max-w-[calc(100%-2rem)] rounded-2xl border border-white/10 bg-[#0d1322]/95 p-3 text-slate-100 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur"
      aria-label="Live inputs"
      data-testid="live-inputs-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 text-left text-slate-300 hover:text-white"
        aria-expanded={open}
      >
        <SlidersHorizontal size={15} className="text-emerald-300" />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.16em]">Live inputs</span>
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>

      {open ? (
        <div className="mt-3 max-h-[40vh] space-y-3 overflow-y-auto pr-1">
          {inputs.map(({ component, definition }) => {
            if (!definition) return null;
            seen[definition.id] = (seen[definition.id] ?? 0) + 1;
            const count = components.filter((candidate) => getComponentDefinition(candidate.type)?.id === definition.id).length;
            const name = count > 1 ? `${definition.name} ${seen[definition.id]}` : definition.name;
            const state = component.state ?? {};

            return (
              <div key={component.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                <p className="text-[13px] font-semibold text-white">{name}</p>

                {definition.id === 'BUTTON' ? (
                  <button
                    type="button"
                    onClick={() => updateComponentState(component.id, { pressed: !state.pressed })}
                    className={`mt-2 w-full rounded-lg px-3 py-1.5 transition ${state.pressed ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
                    aria-pressed={Boolean(state.pressed)}
                  >
                    <span className="text-[13px] font-semibold">{state.pressed ? 'Pressed: click to let go' : 'Click to press'}</span>
                  </button>
                ) : null}

                {(SLIDERS[definition.id] ?? []).map((slider) => {
                  const value = Number(state[slider.key] ?? definition.defaultProperties?.[slider.key] ?? slider.fallback);
                  const inputId = `${component.id}-${slider.key}`;
                  return (
                    <div key={slider.key} className="mt-2">
                      <label htmlFor={inputId} className="flex items-center justify-between text-[12px] text-slate-400">
                        <span>{slider.label}</span>
                        <span className="font-mono text-slate-100">{slider.format(value)}</span>
                      </label>
                      <input
                        id={inputId}
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        step={1}
                        value={value}
                        onChange={(event) => updateComponentState(component.id, { [slider.key]: Number(event.target.value) })}
                        className="mt-1 h-2 w-full accent-emerald-400"
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}
