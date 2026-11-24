"use client";

import React from 'react';

import { TRAFFIC_LIGHT_COLORS } from '@/lib/wiring/componentDefinitions';

interface TrafficLightVisualProps {
  red?: boolean;
  yellow?: boolean;
  green?: boolean;
}

const LAMPS = [
  { key: 'red', cy: 22, off: '#5b1a1a' },
  { key: 'yellow', cy: 53, off: '#5b4a12' },
  { key: 'green', cy: 84, off: '#14532d' },
] as const;

/** Traffic light module: three lamps that glow when their pin is HIGH. Native size 46 x 120. */
export default function TrafficLightVisual({ red = false, yellow = false, green = false }: TrafficLightVisualProps) {
  const lit = { red, yellow, green };

  return (
    <svg viewBox="0 0 46 120" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <rect x="3" y="2" width="40" height="104" rx="8" fill="#111827" stroke="#374151" strokeWidth="2" />
      {LAMPS.map((lamp) => {
        const on = lit[lamp.key];
        const color = TRAFFIC_LIGHT_COLORS[lamp.key];
        return (
          <g key={lamp.key}>
            {on ? <circle cx="23" cy={lamp.cy} r="17" fill={color} opacity="0.35" /> : null}
            <circle cx="23" cy={lamp.cy} r="11" fill={on ? color : lamp.off} stroke="#0b0f17" strokeWidth="1.5" />
          </g>
        );
      })}
      {[7.6, 17.2, 26.8, 36.4].map((x) => (
        <rect key={x} x={x} y="106" width="2" height="12" fill="#d5dbe4" />
      ))}
      {['R', 'Y', 'G', '−'].map((label, index) => (
        <text key={label} x={8.6 + index * 9.6} y="103" fontSize="5" textAnchor="middle" fill="#cbd5e1" fontFamily="monospace">
          {label}
        </text>
      ))}
    </svg>
  );
}
