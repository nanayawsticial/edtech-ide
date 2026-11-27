"use client";

import React from 'react';

/**
 * Parts drawn by the app (Wokwi has no picture for them). Pin positions match RELAY_GEOMETRY and
 * DC_MOTOR_GEOMETRY in lib/wiring/wokwiGeometry.ts.
 */

const LABEL = { fontSize: 5.5, fontFamily: 'monospace', fill: '#e2e8f0' } as const;

/** One-channel relay module, native size 110 x 64. Input header on the left, screw terminal on the right. */
export function RelayModuleVisual({ energized = false, powered = false }: { energized?: boolean; powered?: boolean }) {
  return (
    <svg viewBox="0 0 110 64" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <rect x="4" y="2" width="100" height="60" rx="4" fill="#1d4ed8" stroke="#1e3a8a" strokeWidth="1.5" />
      {/* relay cube */}
      <rect x="30" y="8" width="42" height="40" rx="3" fill="#2563eb" stroke="#172554" strokeWidth="1.2" />
      <text x="51" y="26" textAnchor="middle" {...LABEL} fontSize={5}>SRD-05VDC</text>
      <text x="51" y="34" textAnchor="middle" {...LABEL} fontSize={4.5} fill="#bfdbfe">{energized ? 'CLICK — ON' : 'OFF'}</text>
      {/* status LED */}
      <circle cx="20" cy="52" r="3.2" fill={energized ? '#ef4444' : '#4b1d1d'} />
      {energized ? <circle cx="20" cy="52" r="6" fill="#ef4444" opacity="0.35" /> : null}
      <circle cx="20" cy="10" r="2.4" fill={powered ? '#22c55e' : '#14361f'} />
      {/* input header pins */}
      {[22.4, 32, 41.6].map((y) => (
        <rect key={y} x="0" y={y - 1.2} width="7" height="2.4" fill="#d5dbe4" />
      ))}
      <text x="10" y="24.4" {...LABEL}>IN</text>
      <text x="10" y="34" {...LABEL}>VCC</text>
      <text x="10" y="43.6" {...LABEL}>GND</text>
      {/* screw terminal */}
      <rect x="84" y="6" width="22" height="52" rx="2" fill="#0f766e" stroke="#134e4a" strokeWidth="1.2" />
      {[14, 32, 50].map((y) => (
        <g key={y}>
          <circle cx="95" cy={y} r="5" fill="#cbd5e1" stroke="#64748b" strokeWidth="1" />
          <line x1="91.5" y1={y} x2="98.5" y2={y} stroke="#475569" strokeWidth="1.2" />
          <rect x="104" y={y - 1.2} width="6" height="2.4" fill="#d5dbe4" />
        </g>
      ))}
      <text x="80" y="16" textAnchor="end" {...LABEL}>NO</text>
      <text x="80" y="34" textAnchor="end" {...LABEL}>COM</text>
      <text x="80" y="52" textAnchor="end" {...LABEL}>NC</text>
    </svg>
  );
}

/** Small DC motor, native size 80 x 72. Spins one way or the other with the current through it. */
export function DcMotorVisual({ direction = 0 }: { direction?: -1 | 0 | 1 }) {
  const spinning = direction !== 0;
  return (
    <svg viewBox="0 0 80 72" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <style>{`@keyframes dc-motor-spin { to { transform: rotate(360deg); } }`}</style>
      <rect x="10" y="6" width="60" height="44" rx="10" fill="#9ca3af" stroke="#4b5563" strokeWidth="1.5" />
      <rect x="10" y="20" width="60" height="16" fill="#6b7280" opacity="0.5" />
      <circle cx="40" cy="28" r="15" fill="#e5e7eb" stroke="#4b5563" strokeWidth="1.2" />
      <g
        style={{
          transformOrigin: '40px 28px',
          animation: spinning ? `dc-motor-spin 0.45s linear infinite ${direction < 0 ? 'reverse' : 'normal'}` : undefined,
        }}
      >
        <rect x="38.5" y="15" width="3" height="26" rx="1.5" fill="#f59e0b" />
        <rect x="27" y="26.5" width="26" height="3" rx="1.5" fill="#f59e0b" />
      </g>
      <circle cx="40" cy="28" r="3.5" fill="#374151" />
      {/* terminals */}
      <rect x="29.4" y="50" width="2" height="20" fill="#d5dbe4" />
      <rect x="48.6" y="50" width="2" height="20" fill="#d5dbe4" />
      <text x="30.4" y="60" textAnchor="end" {...LABEL} fill="#ef4444" fontSize={7} dx="-3">+</text>
      <text x="49.6" y="60" {...LABEL} fill="#93c5fd" fontSize={7} dx="3">−</text>
      {spinning ? (
        <text x="40" y="4" textAnchor="middle" {...LABEL} fill="#fbbf24">{direction > 0 ? '⟳ spinning' : '⟲ reverse'}</text>
      ) : null}
    </svg>
  );
}

function hexToRgb(hex: string) {
  const value = parseInt(hex.replace('#', ''), 16) || 0;
  return { r: ((value >> 16) & 0xff) / 255, g: ((value >> 8) & 0xff) / 255, b: (value & 0xff) / 255 };
}

/** wokwi-led-ring whose pixels show `colors` (set through the element's setPixel method). */
export function NeoPixelRing({ colors, pixels = 12 }: { colors: string[]; pixels?: number }) {
  const ref = React.useRef<HTMLElement & { setPixel?: (index: number, rgb: { r: number; g: number; b: number }) => void }>(null);
  const Ring = 'wokwi-led-ring' as React.ElementType;
  React.useEffect(() => {
    const element = ref.current as (HTMLElement & { setPixel?: (index: number, rgb: { r: number; g: number; b: number }) => void; updateComplete?: Promise<unknown> }) | null;
    if (!element) return;
    let cancelled = false;
    // The pixels exist only after the element's first render, so wait for it.
    void Promise.resolve(element.updateComplete).then(() => {
      if (cancelled || !element.setPixel) return;
      for (let index = 0; index < pixels; index += 1) {
        element.setPixel(index, hexToRgb(colors[index] ?? '#000000'));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [colors, pixels]);
  return <Ring ref={ref} pixels={pixels} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

/** wokwi-lcd1602 with the I2C backpack showing two 16-character lines. */
export function Lcd1602({ lines, backlight = true }: { lines: string[]; backlight?: boolean }) {
  const ref = React.useRef<HTMLElement & { characters?: Uint8Array; backlight?: boolean }>(null);
  const Lcd = 'wokwi-lcd1602' as React.ElementType;
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const text = [0, 1].map((row) => (lines[row] ?? '').padEnd(16).slice(0, 16)).join('');
    element.characters = new Uint8Array(Array.from(text).map((char) => char.charCodeAt(0) & 0xff));
    element.backlight = backlight;
  }, [lines, backlight]);
  return <Lcd ref={ref} pins="i2c" style={{ width: '100%', height: '100%', display: 'block' }} />;
}

/**
 * wokwi-7segment with its segment values set as a property. Passed through JSX before the element
 * is defined, React would write a "1,0,..." attribute, which the element reads as null and crashes.
 */
export function SevenSegmentDigit({ values, color = '#ff2a2a' }: { values: number[]; color?: string }) {
  const ref = React.useRef<HTMLElement & { values?: number[]; color?: string; digits?: number }>(null);
  const Digit = 'wokwi-7segment' as React.ElementType;
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.digits = 1;
    element.color = color;
    element.values = values.length >= 8 ? values.slice(0, 8) : [...values, ...Array(8 - values.length).fill(0)];
  }, [values, color]);
  return <Digit ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

const PICO_LEFT = ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND', 'GP6', 'GP7', 'GP8', 'GP9', 'GND', 'GP10', 'GP11', 'GP12', 'GP13', 'GND', 'GP14', 'GP15'];
const PICO_RIGHT = ['VBUS', 'VSYS', 'GND', '3V3_EN', '3V3', 'VREF', 'GP28', 'AGND', 'GP27', 'GP26', 'RUN', 'GP22', 'GND', 'GP21', 'GP20', 'GP19', 'GP18', 'GND', 'GP17', 'GP16'];

/** Raspberry Pi Pico 2 W, top view with USB at the top. Native size 79.4 x 192.8 (21 x 51 mm). */
export function PicoBoardVisual() {
  return (
    <svg viewBox="0 0 79.4 192.8" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <rect x="0.5" y="0.5" width="78.4" height="191.8" rx="3" fill="#0f7a3d" stroke="#0b5a2d" strokeWidth="1" />
      {/* USB connector */}
      <rect x="29" y="-3" width="21.4" height="14" rx="2" fill="#c7cdd6" stroke="#8a94a3" strokeWidth="0.8" />
      {/* wireless module and antenna */}
      <rect x="22" y="148" width="35.4" height="30" rx="2" fill="#b8c0cc" stroke="#7b8594" strokeWidth="0.8" />
      <text x="39.7" y="166" textAnchor="middle" fontSize="4.5" fontFamily="monospace" fill="#334155">CYW43439</text>
      <rect x="25" y="181" width="29.4" height="7" rx="1" fill="#e5e7eb" opacity="0.6" />
      {/* RP2350 */}
      <rect x="25.7" y="78" width="28" height="28" rx="2" fill="#1f2937" />
      <text x="39.7" y="93.5" textAnchor="middle" fontSize="4.5" fontFamily="monospace" fill="#e5e7eb">RP2350</text>
      {/* BOOTSEL and LED */}
      <rect x="44" y="30" width="9" height="7" rx="1.5" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.6" />
      <rect x="27" y="22" width="4" height="3" rx="0.6" fill="#a3e635" opacity="0.8" />
      <text x="39.7" y="62" textAnchor="middle" fontSize="6" fontWeight="bold" fontFamily="sans-serif" fill="#ecfdf5">Pico 2 W</text>
      {PICO_LEFT.map((label, index) => (
        <g key={`l${index}`}>
          <circle cx="6.09" cy={5.2 + index * 9.6} r="2.6" fill="#facc15" stroke="#a16207" strokeWidth="0.6" />
          <circle cx="6.09" cy={5.2 + index * 9.6} r="1.1" fill="#0b3d20" />
          <text x="10.5" y={6.8 + index * 9.6} fontSize="3.6" fontFamily="monospace" fill={label === 'GND' ? '#cbd5e1' : '#ecfdf5'}>{label}</text>
        </g>
      ))}
      {PICO_RIGHT.map((label, index) => (
        <g key={`r${index}`}>
          <circle cx="73.3" cy={5.2 + index * 9.6} r="2.6" fill="#facc15" stroke="#a16207" strokeWidth="0.6" />
          <circle cx="73.3" cy={5.2 + index * 9.6} r="1.1" fill="#0b3d20" />
          <text x="68.9" y={6.8 + index * 9.6} textAnchor="end" fontSize="3.6" fontFamily="monospace" fill={label === 'GND' || label === 'AGND' ? '#cbd5e1' : '#ecfdf5'}>{label}</text>
        </g>
      ))}
    </svg>
  );
}
