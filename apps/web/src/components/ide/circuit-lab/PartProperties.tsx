"use client";

import React from 'react';

import { cn } from '@/lib/ui/cn';

/** LED colours offered in the properties strip (names the Wokwi LED understands). */
export const LED_COLOR_OPTIONS = [
  { id: 'red', name: 'Red', swatch: '#ef4444' },
  { id: 'orange', name: 'Orange', swatch: '#f97316' },
  { id: 'yellow', name: 'Yellow', swatch: '#facc15' },
  { id: 'green', name: 'Green', swatch: '#22c55e' },
  { id: 'blue', name: 'Blue', swatch: '#3b82f6' },
  { id: 'white', name: 'White', swatch: '#f8fafc' },
] as const;

/** Common resistor values in kits; the Wokwi resistor paints matching colour bands. */
export const RESISTOR_VALUE_OPTIONS = [
  { ohms: '100', label: '100 Ω' },
  { ohms: '220', label: '220 Ω' },
  { ohms: '330', label: '330 Ω' },
  { ohms: '1000', label: '1 kΩ' },
  { ohms: '4700', label: '4.7 kΩ' },
  { ohms: '10000', label: '10 kΩ' },
  { ohms: '100000', label: '100 kΩ' },
] as const;

export const PART_NAME_MAX_LENGTH = 16;

interface PartPropertiesProps {
  definitionId: string;
  state: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}

/** Settings for the selected part, shown in its floating toolbar. */
export function PartProperties({ definitionId, state, onChange }: PartPropertiesProps) {
  const [name, setName] = React.useState(String(state.name ?? ''));
  React.useEffect(() => setName(String(state.name ?? '')), [state.name]);

  const commitName = () => {
    const next = name.trim().slice(0, PART_NAME_MAX_LENGTH);
    if (next !== String(state.name ?? '')) onChange({ name: next || undefined });
  };

  return (
    <div className="flex items-center gap-2" onPointerDown={(event) => event.stopPropagation()}>
      {definitionId === 'LED' ? (
        <div className="flex items-center gap-1 px-1" role="group" aria-label="LED colour">
          {LED_COLOR_OPTIONS.map((option) => {
            const isActive = String(state.color ?? 'red') === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange({ color: option.id })}
                aria-label={`LED colour: ${option.name}`}
                aria-pressed={isActive}
                title={option.name}
                className={cn(
                  'h-5 w-5 rounded-full border transition-all duration-150',
                  isActive ? 'scale-110 border-white shadow-[0_0_0_2px_rgba(255,255,255,0.22)]' : 'border-white/25 hover:scale-110 hover:border-white/60'
                )}
                style={{ backgroundColor: option.swatch }}
              />
            );
          })}
        </div>
      ) : null}

      {definitionId === 'RESISTOR' ? (
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          Value
          <select
            value={String(state.resistance ?? '220')}
            onChange={(event) => onChange({ resistance: event.target.value })}
            className="h-8 rounded-full border border-white/10 bg-white/[0.05] px-2 text-sm font-semibold normal-case tracking-normal text-white/90 outline-none focus:border-cyan-300/60"
          >
            {RESISTOR_VALUE_OPTIONS.map((option) => (
              <option key={option.ohms} value={option.ohms}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {definitionId === 'LCD1602' ? (
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          Address
          <select
            value={String(state.address ?? 0x27)}
            onChange={(event) => onChange({ address: Number(event.target.value) })}
            title="The I2C address in your sketch, e.g. LiquidCrystal_I2C lcd(0x27, 16, 2);"
            className="h-8 rounded-full border border-white/10 bg-white/[0.05] px-2 text-sm font-semibold normal-case tracking-normal text-white/90 outline-none focus:border-cyan-300/60"
          >
            <option value={String(0x27)}>0x27</option>
            <option value={String(0x3f)}>0x3F</option>
          </select>
        </label>
      ) : null}

      {definitionId === 'SEVEN_SEGMENT' ? (
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          Common
          <select
            value={String(state.common ?? 'cathode')}
            onChange={(event) => onChange({ common: event.target.value })}
            title="Common cathode: common leg to GND, a segment lights when its pin is HIGH. Common anode: common leg to 5V, a segment lights when its pin is LOW."
            className="h-8 rounded-full border border-white/10 bg-white/[0.05] px-2 text-sm font-semibold normal-case tracking-normal text-white/90 outline-none focus:border-cyan-300/60"
          >
            <option value="cathode">Cathode (to GND)</option>
            <option value="anode">Anode (to 5V)</option>
          </select>
        </label>
      ) : null}

      <input
        value={name}
        onChange={(event) => setName(event.target.value.slice(0, PART_NAME_MAX_LENGTH))}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          event.stopPropagation();
        }}
        placeholder="Name"
        aria-label="Part name shown on the canvas"
        className="h-8 w-24 rounded-full border border-white/10 bg-white/[0.05] px-3 text-sm text-white/90 outline-none placeholder:text-white/40 focus:border-cyan-300/60"
      />
    </div>
  );
}
