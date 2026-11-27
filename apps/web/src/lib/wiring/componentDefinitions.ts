import type { BreadboardZone, ComponentFootprint, MountFootprintClass } from '@/lib/wiring/mountingTypes';
import {
  DHT22_GEOMETRY,
  OLED_GEOMETRY,
  POTENTIOMETER_GEOMETRY,
  SERVO_GEOMETRY,
  ULTRASONIC_GEOMETRY,
  getWokwiComponentGeometry,
} from '@/lib/wiring/wokwiGeometry';

export type ComponentCategory =
  | 'Basic'
  | 'Sensors'
  | 'Actuators'
  | 'Displays'
  | 'Boards';

export type CircuitPinType = 'power' | 'ground' | 'digital' | 'analog' | 'pwm' | 'passive';

export interface ComponentDefinition {
  id: string;
  name: string;
  category: ComponentCategory;
  svg: string;
  pins: {
    id: string;
    name: string;
    type: CircuitPinType;
    position: { x: number; y: number };
  }[];
  defaultProperties?: Record<string, any>;
  simulation?: {
    type: string;
    model: string;
  };
  size: {
    width: number;
    height: number;
  };
  aliases?: string[];
  description?: string;
  placeable?: boolean;
  mountStyle?: 'free' | 'breadboard';
  footprint?: ComponentFootprint;
}

const componentRegistry = new Map<string, ComponentDefinition>();
const aliasRegistry = new Map<string, string>();

function applyCanonicalGeometry(definition: ComponentDefinition) {
  const geometry = getWokwiComponentGeometry(definition.id);
  if (!geometry) {
    return;
  }

  const geometryPins = new Map(geometry.pins.map((pin) => [pin.id, pin] as const));
  definition.size = { ...geometry.size };
  definition.pins = definition.pins.map((pin) => {
    const canonicalPin = geometryPins.get(pin.id);
    if (!canonicalPin) {
      return pin;
    }

    return {
      ...pin,
      position: { ...canonicalPin.position },
    };
  });
}

/** Plain placeholder picture for parts the canvas draws itself (used only where a static SVG is needed). */
function simpleBoxSvg(width: number, height: number, fill: string, label: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="4" fill="${fill}" stroke="#94a3b8" stroke-width="1"/><text x="${width / 2}" y="${height / 2 + 4}" font-size="11" text-anchor="middle" fill="#f8fafc" font-family="monospace">${label}</text></svg>`;
}

const ledSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57.6 86.4" width="57.6" height="86.4">
  <defs>
    <linearGradient id="ledShell" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fda4af" />
      <stop offset="58%" stop-color="#ef4444" />
      <stop offset="100%" stop-color="#b91c1c" />
    </linearGradient>
  </defs>
  <rect x="19.6" y="50" width="4" height="29.2" rx="1.5" fill="#d5dbe4" />
  <rect x="34.0" y="50" width="4" height="25" rx="1.5" fill="#d5dbe4" />
  <path d="M 12 50 C 12 10, 45.6 10, 45.6 50 L 45.6 54 L 12 54 Z" fill="url(#ledShell)" opacity="0.9" />
  <path d="M 17 25 C 20 15, 27 10, 31 9" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.55" />
  <ellipse cx="28.8" cy="40" rx="12" ry="8" fill="#fecdd3" opacity="0.32" />
  <line x1="28.8" y1="20" x2="28.8" y2="54" stroke="#be123c" stroke-width="1.5" opacity="0.38" />
</svg>
`;

const buttonSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57.6 57.6" width="57.6" height="57.6">
  <rect x="7.2" y="14.4" width="43.2" height="28.8" rx="4" fill="#24292f" stroke="#4b5563" stroke-width="1.5" />
  <rect x="18" y="7.2" width="21.6" height="18" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
  <rect x="19.6" y="43.2" width="4" height="7.2" rx="1" fill="#d5dbe4" />
  <rect x="34.0" y="43.2" width="4" height="7.2" rx="1" fill="#d5dbe4" />
  <rect x="20.6" y="49" width="2" height="5" rx="1" fill="#cbd5e1" />
  <rect x="35.0" y="49" width="2" height="5" rx="1" fill="#cbd5e1" />
  <rect x="14" y="21.6" width="29.6" height="3.6" rx="1.5" fill="#ffffff" opacity="0.35" />
</svg>
`;

const POTENTIOMETER_SIZE = POTENTIOMETER_GEOMETRY.size;
const SERVO_SIZE = SERVO_GEOMETRY.size;
const ULTRASONIC_SIZE = ULTRASONIC_GEOMETRY.size;
const DHT22_SIZE = DHT22_GEOMETRY.size;
const OLED_SIZE = OLED_GEOMETRY.size;

const potentiometerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${POTENTIOMETER_SIZE.width} ${POTENTIOMETER_SIZE.height}" width="${POTENTIOMETER_SIZE.width}" height="${POTENTIOMETER_SIZE.height}">
  <rect x="12" y="17.5" width="54" height="31.5" rx="6" fill="#2563eb" stroke="#1d4ed8" stroke-width="1.8" />
  <rect x="15.5" y="22" width="47" height="22.5" rx="4.5" fill="#1d4ed8" opacity="0.32" />
  <circle cx="37.8" cy="32.8" r="15.2" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2.2" />
  <circle cx="37.8" cy="32.8" r="10.6" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1.2" />
  <circle cx="37.8" cy="32.8" r="4.1" fill="#94a3b8" />
  <path d="M 37.8 32.8 L 46.8 24.9" fill="none" stroke="#334155" stroke-width="2.4" stroke-linecap="round" />
  <rect x="16.6" y="49.6" width="52.2" height="4.6" rx="2.3" fill="#1e293b" opacity="0.5" />
  <rect x="23.93" y="52.1" width="4.4" height="15.9" rx="1.3" fill="#d5dbe4" />
  <rect x="43.13" y="52.1" width="4.4" height="15.9" rx="1.3" fill="#d5dbe4" />
  <rect x="62.33" y="52.1" width="4.4" height="15.9" rx="1.3" fill="#d5dbe4" />
  <circle cx="37.8" cy="32.8" r="14.6" fill="none" stroke="#ffffff" stroke-width="1.4" opacity="0.18" />
</svg>
`;

const servoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SERVO_SIZE.width} ${SERVO_SIZE.height}" width="${SERVO_SIZE.width}" height="${SERVO_SIZE.height}">
  <rect x="26" y="37" width="88" height="58" rx="7" fill="#2563eb" stroke="#1d4ed8" stroke-width="2.2" />
  <rect x="15" y="57" width="110" height="14" rx="3.5" fill="#1d4ed8" opacity="0.86" />
  <circle cx="70" cy="25" r="15" fill="#2563eb" stroke="#1d4ed8" stroke-width="2.2" />
  <circle cx="70" cy="25" r="6.2" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" />
  <rect x="54" y="18.4" width="32" height="13" rx="6.5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" opacity="0.95" />
  <rect x="103" y="62" width="19" height="8" rx="3" fill="#334155" />
  <path d="M 118 66 C 127 64, 134 65, 141 71" fill="none" stroke="#475569" stroke-width="3" stroke-linecap="round" />
  <rect x="72.47" y="66.67" width="4.4" height="24" rx="1.5" fill="#111827" />
  <rect x="82.07" y="66.67" width="4.4" height="24" rx="1.5" fill="#ef4444" />
  <rect x="91.67" y="66.67" width="4.4" height="24" rx="1.5" fill="#f59e0b" />
  <text x="70" y="86" fill="#dbeafe" font-size="11" font-family="sans-serif" font-weight="700" text-anchor="middle">SG90</text>
</svg>
`;
const resistorSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 86.4 43.2" width="86.4" height="43.2">
  <line x1="7.2" y1="21.6" x2="25.2" y2="21.6" stroke="#d5dbe4" stroke-width="3" stroke-linecap="round" />
  <line x1="61.2" y1="21.6" x2="79.2" y2="21.6" stroke="#d5dbe4" stroke-width="3" stroke-linecap="round" />
  <rect x="25.2" y="10.8" width="36" height="21.6" rx="10" fill="#d7b98f" stroke="#b69263" stroke-width="1.5" />
  <rect x="32" y="10.8" width="4" height="21.6" fill="#8b5e3c" />
</svg>
`;

const ultrasonicSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ULTRASONIC_SIZE.width} ${ULTRASONIC_SIZE.height}" width="${ULTRASONIC_SIZE.width}" height="${ULTRASONIC_SIZE.height}">
  <rect x="18" y="12" width="114" height="56" rx="7" fill="#155e75" stroke="#164e63" stroke-width="2.5" />
  <circle cx="50" cy="40" r="20" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2.4" />
  <circle cx="50" cy="40" r="15.2" fill="#cbd5e1" />
  <circle cx="50" cy="40" r="4.2" fill="#334155" opacity="0.9" />
  <circle cx="100" cy="40" r="20" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2.4" />
  <circle cx="100" cy="40" r="15.2" fill="#cbd5e1" />
  <circle cx="100" cy="40" r="4.2" fill="#334155" opacity="0.9" />
  <rect x="31" y="69" width="38" height="6.6" rx="2.4" fill="#1e293b" />
  <rect x="33.53" y="73.1" width="4.4" height="16" rx="1.4" fill="#d5dbe4" />
  <rect x="43.13" y="73.1" width="4.4" height="16" rx="1.4" fill="#d5dbe4" />
  <rect x="52.73" y="73.1" width="4.4" height="16" rx="1.4" fill="#d5dbe4" />
  <rect x="62.33" y="73.1" width="4.4" height="16" rx="1.4" fill="#d5dbe4" />
  <text x="75" y="22" fill="#e0f2fe" font-size="9.5" font-family="monospace" font-weight="700" text-anchor="middle">HC-SR04</text>
</svg>
`;

const dhtSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DHT22_SIZE.width} ${DHT22_SIZE.height}" width="${DHT22_SIZE.width}" height="${DHT22_SIZE.height}">
  <rect x="7.5" y="10" width="42.2" height="79" rx="5" fill="#38bdf8" stroke="#0284c7" stroke-width="1.8" />
  <g stroke="#0ea5e9" stroke-width="2" opacity="0.6">
    <line x1="13" y1="22" x2="44" y2="22" />
    <line x1="13" y1="34" x2="44" y2="34" />
    <line x1="13" y1="46" x2="44" y2="46" />
    <line x1="13" y1="58" x2="44" y2="58" />
    <line x1="13" y1="70" x2="44" y2="70" />
  </g>
  <rect x="11.5" y="88" width="35" height="6.5" rx="2.3" fill="#1e293b" opacity="0.5" />
  <rect x="12.87" y="92.2" width="4.4" height="16.5" rx="1.2" fill="#d5dbe4" />
  <rect x="22.47" y="92.2" width="4.4" height="16.5" rx="1.2" fill="#d5dbe4" />
  <rect x="32.07" y="92.2" width="4.4" height="16.5" rx="1.2" fill="#d5dbe4" />
  <rect x="41.67" y="92.2" width="4.4" height="16.5" rx="1.2" fill="#d5dbe4" />
  <text x="28.5" y="85" fill="#e0f2fe" font-size="8" font-family="monospace" font-weight="700" text-anchor="middle">DHT22</text>
</svg>
`;

const oledSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OLED_SIZE.width} ${OLED_SIZE.height}" width="${OLED_SIZE.width}" height="${OLED_SIZE.height}">
  <rect x="18" y="10" width="108" height="96" rx="7" fill="#1e1b4b" stroke="#312e81" stroke-width="2.4" />
  <circle cx="28" cy="20" r="4" fill="#0f172a" />
  <circle cx="116" cy="20" r="4" fill="#0f172a" />
  <circle cx="28" cy="96" r="4" fill="#0f172a" />
  <circle cx="116" cy="96" r="4" fill="#0f172a" />
  <rect x="31" y="27" width="82" height="50" rx="3" fill="#020617" stroke="#334155" stroke-width="1.6" />
  <rect x="36" y="32" width="72" height="40" rx="2" fill="#0f172a" />
  <rect x="42" y="38" width="60" height="6" rx="2" fill="#4f46e5" opacity="0.28" />
  <rect x="45" y="97.8" width="48" height="6.8" rx="2.4" fill="#1e293b" />
  <rect x="52.73" y="101.3" width="4.4" height="17.2" rx="1.2" fill="#d5dbe4" />
  <rect x="62.33" y="101.3" width="4.4" height="17.2" rx="1.2" fill="#d5dbe4" />
  <rect x="71.93" y="101.3" width="4.4" height="17.2" rx="1.2" fill="#d5dbe4" />
  <rect x="81.53" y="101.3" width="4.4" height="17.2" rx="1.2" fill="#d5dbe4" />
  <text x="72" y="58" fill="#67e8f9" font-size="11" font-family="monospace" font-weight="700" text-anchor="middle">SSD1306</text>
</svg>
`;


const breadboardSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 504 204" width="504" height="204">
  {/* The virtual full breadboard geometry definition would ideally be dynamically replaced by BreadboardSVG. This is a generic wireframe placeholder just in case. */}
  <rect x="0" y="0" width="504" height="204" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" />
</svg>
`;

// Fallback drawings for the newer parts. On the canvas the Wokwi elements (and, for the traffic
// light, TrafficLightVisual) are used; these keep previews and older renderers working.
const buzzerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64.25 75.59" width="64.25" height="75.59">
  <circle cx="32" cy="32" r="30" fill="#1f2937" stroke="#111827" stroke-width="2" />
  <circle cx="32" cy="32" r="6" fill="#0b0f17" />
  <rect x="26" y="60" width="2" height="15" fill="#d5dbe4" /><rect x="36" y="60" width="2" height="15" fill="#d5dbe4" />
</svg>`;

const rgbLedSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42.13 72.58" width="42.13" height="72.58">
  <path d="M7 30 V14 a14 14 0 0 1 28 0 V30 Z" fill="#e5e7eb" stroke="#9ca3af" />
  <rect x="5" y="30" width="32" height="5" fill="#d1d5db" />
  <rect x="7.5" y="35" width="2" height="12" fill="#d5dbe4" /><rect x="17" y="35" width="2" height="22" fill="#d5dbe4" />
  <rect x="25.4" y="35" width="2" height="12" fill="#d5dbe4" /><rect x="34.7" y="35" width="2" height="12" fill="#d5dbe4" />
</svg>`;

export const TRAFFIC_LIGHT_COLORS = { red: '#ef4444', yellow: '#facc15', green: '#22c55e' } as const;

const trafficLightSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 120" width="46" height="120">
  <rect x="3" y="2" width="40" height="104" rx="8" fill="#111827" stroke="#374151" stroke-width="2" />
  <circle cx="23" cy="22" r="11" fill="#5b1a1a" /><circle cx="23" cy="53" r="11" fill="#5b4a12" /><circle cx="23" cy="84" r="11" fill="#14532d" />
  <rect x="7.6" y="106" width="2" height="12" fill="#d5dbe4" /><rect x="17.2" y="106" width="2" height="12" fill="#d5dbe4" />
  <rect x="26.8" y="106" width="2" height="12" fill="#d5dbe4" /><rect x="36.4" y="106" width="2" height="12" fill="#d5dbe4" />
</svg>`;

const ldrSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 173.67 61.48" width="173.67" height="61.48">
  <rect x="2" y="2" width="160" height="57" rx="4" fill="#1d4ed8" />
  <circle cx="30" cy="30" r="14" fill="#f59e0b" stroke="#78350f" stroke-width="2" />
</svg>`;

const soundSensorSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 133.08 50.44" width="133.08" height="50.44">
  <rect x="8" y="2" width="123" height="46" rx="4" fill="#1d4ed8" />
  <circle cx="108" cy="25" r="16" fill="#9ca3af" stroke="#4b5563" stroke-width="2" />
</svg>`;

const definitions: ComponentDefinition[] = [
  {
    id: 'BREADBOARD',
    name: 'Breadboard',
    category: 'Boards',
    svg: breadboardSvg,
    pins: [],
    size: { width: 652.8, height: 201.6 },
    aliases: ['breadboard', 'full-breadboard'],
    description: 'Solderless breadboard for manual wiring and pin snapping.',
    mountStyle: 'free',
  },
  {
    id: 'ARDUINO_UNO',
    name: 'Arduino Uno',
    category: 'Boards',
    svg: '',
    pins: [
      { id: 'SCL', name: 'SCL', type: 'digital', position: { x: 86.6, y: 9 } },
      { id: 'SDA', name: 'SDA', type: 'digital', position: { x: 96.2, y: 9 } },
      { id: 'AREF', name: 'AREF', type: 'digital', position: { x: 105.8, y: 9 } },
      { id: 'GND.1', name: 'GND', type: 'power', position: { x: 115.4, y: 9 } },
      { id: '13', name: '13', type: 'digital', position: { x: 125.0, y: 9 } },
      { id: '12', name: '12', type: 'digital', position: { x: 134.6, y: 9 } },
      { id: '11', name: '11', type: 'digital', position: { x: 144.2, y: 9 } },
      { id: '10', name: '10', type: 'digital', position: { x: 153.8, y: 9 } },
      { id: '9', name: '9', type: 'digital', position: { x: 163.4, y: 9 } },
      { id: '8', name: '8', type: 'digital', position: { x: 173.0, y: 9 } },

      { id: '7', name: '7', type: 'digital', position: { x: 188.36, y: 9 } },
      { id: '6', name: '6', type: 'digital', position: { x: 197.96, y: 9 } },
      { id: '5', name: '5', type: 'digital', position: { x: 207.56, y: 9 } },
      { id: '4', name: '4', type: 'digital', position: { x: 217.16, y: 9 } },
      { id: '3', name: '3', type: 'digital', position: { x: 226.76, y: 9 } },
      { id: '2', name: '2', type: 'digital', position: { x: 236.36, y: 9 } },
      { id: '1', name: 'TX', type: 'digital', position: { x: 245.96, y: 9 } },
      { id: '0', name: 'RX', type: 'digital', position: { x: 255.56, y: 9 } },

      { id: 'IOREF', name: 'IOREF', type: 'power', position: { x: 130.76, y: 191.5 } },
      { id: 'RESET', name: 'RESET', type: 'digital', position: { x: 140.36, y: 191.5 } },
      { id: '3.3V', name: '3.3V', type: 'power', position: { x: 149.96, y: 191.5 } },
      { id: '5V', name: '5V', type: 'power', position: { x: 159.56, y: 191.5 } },
      { id: 'GND.2', name: 'GND', type: 'power', position: { x: 169.16, y: 191.5 } },
      { id: 'GND.3', name: 'GND', type: 'power', position: { x: 178.76, y: 191.5 } },
      { id: 'VIN', name: 'VIN', type: 'power', position: { x: 188.36, y: 191.5 } },
      
      { id: 'A0', name: 'A0', type: 'analog', position: { x: 207.56, y: 191.5 } },
      { id: 'A1', name: 'A1', type: 'analog', position: { x: 217.16, y: 191.5 } },
      { id: 'A2', name: 'A2', type: 'analog', position: { x: 226.76, y: 191.5 } },
      { id: 'A3', name: 'A3', type: 'analog', position: { x: 236.36, y: 191.5 } },
      { id: 'A4', name: 'A4', type: 'analog', position: { x: 245.96, y: 191.5 } },
      { id: 'A5', name: 'A5', type: 'analog', position: { x: 255.56, y: 191.5 } },
    ],
    size: { width: 274.318, height: 201.6 },
    aliases: ['arduino', 'uno', 'arduino-uno'],
    description: 'ATmega328P microcontroller board with digital, analog, and power headers.',
    mountStyle: 'free',
  },
  {
    id: 'LED',
    name: 'LED',
    category: 'Basic',
    svg: ledSvg,
    size: { width: 38.4, height: 48 },
    pins: [
      { id: 'A', name: 'Anode', type: 'digital', position: { x: 24, y: 40.32 } },
      { id: 'C', name: 'Cathode', type: 'ground', position: { x: 14.4, y: 40.32 } },
    ],
    defaultProperties: { color: 'red', outputHigh: false },
    simulation: { type: 'led', model: 'digital-led' },
    aliases: ['led'],
    description: 'Single digital LED with a signal leg and ground leg.',
    mountStyle: 'breadboard',
  },
  {
    id: 'BUTTON',
    name: 'Push Button',
    category: 'Basic',
    svg: buttonSvg,
    size: { width: 67.28, height: 45.36 },
    pins: [
      { id: '1.l', name: '1.L', type: 'digital', position: { x: 0, y: 13 } },
      { id: '2.l', name: '2.L', type: 'digital', position: { x: 0, y: 32.2 } },
      { id: '1.r', name: '1.R', type: 'digital', position: { x: 67, y: 13 } },
      { id: '2.r', name: '2.R', type: 'digital', position: { x: 67, y: 32.2 } },
    ],
    defaultProperties: { pressed: false, activeLow: true },
    simulation: { type: 'button', model: 'digital-toggle' },
    aliases: ['button', 'push-button', 'push_button'],
    description: 'Tactile button modeled as an active-low input.',
    mountStyle: 'breadboard',
  },
  {
    id: 'RESISTOR',
    name: 'Resistor',
    category: 'Basic',
    svg: resistorSvg,
    size: { width: 115.2, height: 57.6 },
    pins: [
      { id: 'A', name: 'Side A', type: 'passive', position: { x: 9.6, y: 28.8 } },
      { id: 'B', name: 'Side B', type: 'passive', position: { x: 105.6, y: 28.8 } },
    ],
    defaultProperties: { resistance: '220' },
    simulation: { type: 'passive', model: 'resistor' },
    aliases: ['resistor'],
    description: 'Passive resistor for manual series wiring.',
    mountStyle: 'breadboard',
  },
  {
    id: 'POTENTIOMETER',
    name: 'Potentiometer',
    category: 'Sensors',
    svg: potentiometerSvg,
    size: POTENTIOMETER_SIZE,
    pins: [
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 26.13, y: 65.07 } },
      { id: 'OUT', name: 'OUT', type: 'analog', position: { x: 45.33, y: 65.07 } },
      { id: 'VCC', name: 'VCC', type: 'power', position: { x: 64.53, y: 65.07 } },
    ],
    defaultProperties: { value: 512, min: 0, max: 1023 },
    simulation: { type: 'pot', model: 'analog-slider' },
    aliases: ['pot', 'potentiometer', 'dial'],
    description: 'Adjustable rotary resistor providing voltage divider output.',
    mountStyle: 'breadboard',
  },
  {
    id: 'SERVO',
    name: 'Servo Motor',
    category: 'Actuators',
    svg: servoSvg,
    size: SERVO_SIZE,
    pins: [
      { id: 'PWM', name: 'PWM', type: 'pwm', position: { x: 74.67, y: 66.67 } },
      { id: 'VCC', name: 'VCC', type: 'power', position: { x: 84.27, y: 66.67 } },
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 93.87, y: 66.67 } },
    ],
    defaultProperties: { angle: 90 },
    simulation: { type: 'servo', model: 'sg90' },
    aliases: ['servo', 'motor', 'sg90'],
    description: 'Positional motor controlled by PWM signals.',
    mountStyle: 'free',
  },
  {
    id: 'ULTRASONIC',
    name: 'Ultrasonic Sensor',
    category: 'Sensors',
    svg: ultrasonicSvg,
    size: ULTRASONIC_SIZE,
    pins: [
      { id: 'VCC', name: 'VCC', type: 'power', position: { x: 35.73, y: 76.8 } },
      { id: 'TRIG', name: 'Trig', type: 'digital', position: { x: 45.33, y: 76.8 } },
      { id: 'ECHO', name: 'Echo', type: 'digital', position: { x: 54.93, y: 76.8 } },
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 64.53, y: 76.8 } },
    ],
    defaultProperties: { distance: 100 },
    simulation: { type: 'ultrasonic', model: 'hc-sr04' },
    aliases: ['ultrasonic', 'hcsr04', 'sonar'],
    description: 'Measures distances by emitting and timing sound pulses.',
    mountStyle: 'breadboard',
  },
  {
    id: 'DHT',
    name: 'DHT22',
    category: 'Sensors',
    svg: dhtSvg,
    size: DHT22_SIZE,
    pins: [
      { id: 'VCC', name: 'VCC', type: 'power', position: { x: 15.07, y: 97.5 } },
      { id: 'DATA', name: 'DATA', type: 'digital', position: { x: 24.67, y: 97.5 } },
      { id: 'NC', name: 'NC', type: 'passive', position: { x: 34.27, y: 97.5 } },
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 43.87, y: 97.5 } },
    ],
    defaultProperties: { temperature: 24, humidity: 40 },
    simulation: { type: 'sensor', model: 'dht22' },
    aliases: ['dht', 'dht11', 'dht22', 'temperature-sensor', 'humidity-sensor'],
    description: 'Digital temperature and humidity sensor.',
    mountStyle: 'breadboard',
  },
  {
    id: 'OLED',
    name: 'OLED Display',
    category: 'Displays',
    svg: oledSvg,
    size: OLED_SIZE,
    pins: [
      { id: 'SDA', name: 'SDA', type: 'digital', position: { x: 54.93, y: 106.67 } },
      { id: 'SCL', name: 'SCL', type: 'digital', position: { x: 64.53, y: 106.67 } },
      { id: 'VCC', name: 'VCC', type: 'power', position: { x: 74.13, y: 106.67 } },
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 83.73, y: 106.67 } },
    ],
    defaultProperties: { label: 'OLED' },
    simulation: { type: 'display', model: 'ssd1306' },
    aliases: ['oled', 'ssd1306', 'display'],
    description: '128x64 pixels I2C OLED display.',
    mountStyle: 'breadboard',
  },
  {
    id: 'BUZZER',
    name: 'Buzzer',
    category: 'Actuators',
    svg: buzzerSvg,
    size: { width: 64.25, height: 75.59 },
    pins: [
      { id: 'NEG', name: '−', type: 'ground', position: { x: 27, y: 84 } },
      { id: 'POS', name: '+', type: 'digital', position: { x: 37, y: 84 } },
    ],
    defaultProperties: { sounding: false },
    simulation: { type: 'buzzer', model: 'active-buzzer' },
    aliases: ['buzzer', 'active-buzzer', 'beeper', 'piezo'],
    description: 'Active buzzer that beeps while its + leg is HIGH.',
    mountStyle: 'breadboard',
  },
  {
    id: 'RGB_LED',
    name: 'RGB LED',
    category: 'Basic',
    svg: rgbLedSvg,
    size: { width: 42.13, height: 72.58 },
    pins: [
      { id: 'R', name: 'Red', type: 'digital', position: { x: 8.5, y: 44 } },
      { id: 'COM', name: 'Common', type: 'passive', position: { x: 18, y: 54 } },
      { id: 'G', name: 'Green', type: 'digital', position: { x: 26.4, y: 44 } },
      { id: 'B', name: 'Blue', type: 'digital', position: { x: 35.7, y: 44 } },
    ],
    defaultProperties: { red: 0, green: 0, blue: 0 },
    simulation: { type: 'rgb-led', model: 'rgb-led' },
    aliases: ['rgb', 'rgb-led', 'rgb_led', 'rgb-module'],
    description: 'Red, green and blue LEDs in one, sharing a common leg.',
    mountStyle: 'breadboard',
  },
  {
    id: 'TRAFFIC_LIGHT',
    name: 'Traffic Light',
    category: 'Basic',
    svg: trafficLightSvg,
    size: { width: 46, height: 120 },
    pins: [
      { id: 'R', name: 'R', type: 'digital', position: { x: 8.6, y: 116 } },
      { id: 'Y', name: 'Y', type: 'digital', position: { x: 18.2, y: 116 } },
      { id: 'G', name: 'G', type: 'digital', position: { x: 27.8, y: 116 } },
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 37.4, y: 116 } },
    ],
    defaultProperties: { red: false, yellow: false, green: false },
    simulation: { type: 'traffic-light', model: 'traffic-light-module' },
    aliases: ['traffic-light', 'traffic_light', 'traffic-light-module'],
    description: 'Red, yellow and green lights on one module with a shared ground.',
    mountStyle: 'breadboard',
  },
  {
    id: 'LDR',
    name: 'Light Sensor (LDR)',
    category: 'Sensors',
    svg: ldrSvg,
    size: { width: 173.67, height: 61.48 },
    pins: [
      { id: 'VCC', name: 'VCC', type: 'power', position: { x: 172, y: 16 } },
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 172, y: 26 } },
      { id: 'DO', name: 'DO', type: 'digital', position: { x: 172, y: 35.8 } },
      { id: 'AO', name: 'AO', type: 'analog', position: { x: 172, y: 45.5 } },
    ],
    defaultProperties: { light: 60 },
    simulation: { type: 'light-sensor', model: 'ldr-module' },
    aliases: ['ldr', 'photoresistor', 'light-sensor', 'photo-sensor'],
    description: 'Light sensor module: AO gives a reading, DO switches when it gets dark.',
    mountStyle: 'breadboard',
  },
  {
    id: 'SOUND_SENSOR',
    name: 'Sound Sensor',
    category: 'Sensors',
    svg: soundSensorSvg,
    size: { width: 133.08, height: 50.44 },
    pins: [
      { id: 'AO', name: 'AOUT', type: 'analog', position: { x: 0, y: 11 } },
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 0, y: 20.5 } },
      { id: 'VCC', name: 'VCC', type: 'power', position: { x: 0, y: 30.5 } },
      { id: 'DO', name: 'DOUT', type: 'digital', position: { x: 0, y: 40.5 } },
    ],
    defaultProperties: { level: 20 },
    simulation: { type: 'sound-sensor', model: 'microphone-module' },
    aliases: ['sound-sensor', 'sound_sensor', 'microphone', 'mic'],
    description: 'Microphone module: AO gives the loudness, DO switches when it is loud.',
    mountStyle: 'breadboard',
  },
  {
    id: 'SLIDE_SWITCH',
    name: 'Slide Switch',
    category: 'Basic',
    svg: simpleBoxSvg(32.13, 34.89, '#1f2937', 'SW'),
    size: { width: 32.13, height: 34.89 },
    pins: [
      { id: '1', name: '1', type: 'passive', position: { x: 6.5, y: 34 } },
      { id: '2', name: 'COM', type: 'passive', position: { x: 16, y: 34 } },
      { id: '3', name: '3', type: 'passive', position: { x: 25.5, y: 34 } },
    ],
    defaultProperties: { value: 0 },
    simulation: { type: 'slide-switch', model: 'spdt-switch' },
    aliases: ['slide-switch', 'slide_switch', 'switch', 'spdt'],
    description: 'Click it to slide: the middle pin joins pin 1 or pin 3.',
    mountStyle: 'breadboard',
  },
  {
    id: 'PIR',
    name: 'PIR Motion Sensor',
    category: 'Sensors',
    svg: simpleBoxSvg(90.72, 92.41, '#065f46', 'PIR'),
    size: { width: 90.72, height: 92.41 },
    pins: [
      { id: 'VCC', name: 'VCC', type: 'power', position: { x: 36.178, y: 92 } },
      { id: 'OUT', name: 'OUT', type: 'digital', position: { x: 45.9175, y: 92 } },
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 55.6415, y: 92 } },
    ],
    defaultProperties: { motion: false },
    simulation: { type: 'pir', model: 'hc-sr501' },
    aliases: ['pir', 'motion-sensor', 'pir-sensor', 'hc-sr501'],
    description: 'Motion sensor: OUT goes HIGH while it sees movement. Click it to wave.',
    mountStyle: 'breadboard',
  },
  {
    id: 'SEVEN_SEGMENT',
    name: '7-Segment Display',
    category: 'Displays',
    svg: simpleBoxSvg(47.44, 83.16, '#111827', '8'),
    size: { width: 47.44, height: 83.16 },
    pins: [
      { id: 'A', name: 'A', type: 'digital', position: { x: 33.32, y: 3.78 } },
      { id: 'B', name: 'B', type: 'digital', position: { x: 42.92, y: 3.78 } },
      { id: 'C', name: 'C', type: 'digital', position: { x: 33.32, y: 71.82 } },
      { id: 'D', name: 'D', type: 'digital', position: { x: 14.12, y: 71.82 } },
      { id: 'E', name: 'E', type: 'digital', position: { x: 4.52, y: 71.82 } },
      { id: 'F', name: 'F', type: 'digital', position: { x: 14.12, y: 3.78 } },
      { id: 'G', name: 'G', type: 'digital', position: { x: 4.52, y: 3.78 } },
      { id: 'DP', name: 'DP', type: 'digital', position: { x: 42.92, y: 71.82 } },
      { id: 'COM.1', name: 'COM', type: 'passive', position: { x: 23.72, y: 71.82 } },
      { id: 'COM.2', name: 'COM', type: 'passive', position: { x: 23.72, y: 3.78 } },
    ],
    defaultProperties: { common: 'cathode' },
    simulation: { type: 'seven-segment', model: 'single-digit' },
    aliases: ['7-segment', '7segment', 'seven-segment', 'seven_segment'],
    description: 'One digit of eight LEDs (A to G and the dot) sharing a common leg.',
    mountStyle: 'breadboard',
  },
  {
    id: 'RELAY',
    name: 'Relay Module',
    category: 'Actuators',
    svg: simpleBoxSvg(110, 64, '#1d4ed8', 'RELAY'),
    size: { width: 110, height: 64 },
    pins: [
      { id: 'IN', name: 'IN', type: 'digital', position: { x: 0, y: 22.4 } },
      { id: 'VCC', name: 'VCC', type: 'power', position: { x: 0, y: 32 } },
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 0, y: 41.6 } },
      { id: 'NO', name: 'NO', type: 'passive', position: { x: 110, y: 14 } },
      { id: 'COM', name: 'COM', type: 'passive', position: { x: 110, y: 32 } },
      { id: 'NC', name: 'NC', type: 'passive', position: { x: 110, y: 50 } },
    ],
    defaultProperties: { energized: false },
    simulation: { type: 'relay', model: 'relay-module' },
    aliases: ['relay', 'relay-module', 'relay_module'],
    description: 'A switch worked by a pin: IN HIGH joins COM to NO, otherwise COM to NC.',
    mountStyle: 'free',
  },
  {
    id: 'DC_MOTOR',
    name: 'DC Motor',
    category: 'Actuators',
    svg: simpleBoxSvg(80, 72, '#6b7280', 'M'),
    size: { width: 80, height: 72 },
    pins: [
      { id: 'POS', name: '+', type: 'passive', position: { x: 30.4, y: 70 } },
      { id: 'NEG', name: '-', type: 'passive', position: { x: 49.6, y: 70 } },
    ],
    defaultProperties: { direction: 0 },
    simulation: { type: 'dc-motor', model: 'dc-motor' },
    aliases: ['motor', 'dc-motor', 'dc_motor'],
    description: 'Spins while one terminal is HIGH and the other LOW; swap them to reverse.',
    mountStyle: 'free',
  },
  {
    id: 'NEOPIXEL_RING',
    name: 'NeoPixel Ring',
    category: 'Displays',
    svg: simpleBoxSvg(117.55, 128.89, '#14532d', 'RING'),
    size: { width: 117.55, height: 128.89 },
    pins: [
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 44.37, y: 128.89 } },
      { id: 'VCC', name: 'VCC', type: 'power', position: { x: 53.98, y: 128.89 } },
      { id: 'DIN', name: 'DIN', type: 'digital', position: { x: 63.58, y: 128.89 } },
      { id: 'DOUT', name: 'DOUT', type: 'digital', position: { x: 73.18, y: 128.89 } },
    ],
    defaultProperties: { pixels: 12 },
    simulation: { type: 'neopixel', model: 'ws2812-ring' },
    aliases: ['neopixel', 'neopixel-ring', 'ws2812', 'led-ring'],
    description: 'Twelve WS2812 colour LEDs in a ring, driven from one pin (Adafruit NeoPixel library).',
    mountStyle: 'free',
  },
  {
    id: 'LCD1602',
    name: 'LCD 16x2 (I2C)',
    category: 'Displays',
    svg: simpleBoxSvg(302.4, 136.08, '#14532d', 'LCD 16x2'),
    size: { width: 302.4, height: 136.08 },
    pins: [
      { id: 'GND', name: 'GND', type: 'ground', position: { x: 4, y: 32 } },
      { id: 'VCC', name: 'VCC', type: 'power', position: { x: 4, y: 41.5 } },
      { id: 'SDA', name: 'SDA', type: 'analog', position: { x: 4, y: 51 } },
      { id: 'SCL', name: 'SCL', type: 'analog', position: { x: 4, y: 60.5 } },
    ],
    defaultProperties: { address: 0x27 },
    simulation: { type: 'lcd-i2c', model: 'lcd1602-pcf8574' },
    aliases: ['lcd', 'lcd1602', 'lcd-i2c', 'lcd16x2'],
    description: 'Two rows of 16 characters over I2C (LiquidCrystal_I2C library, address 0x27 or 0x3F).',
    mountStyle: 'free',
  },
  {
    id: 'RASPBERRY_PI_PICO_2W',
    name: 'Raspberry Pi Pico 2 W',
    category: 'Boards',
    svg: simpleBoxSvg(79.4, 192.8, '#0f7a3d', 'Pico 2 W'),
    size: { width: 79.4, height: 192.8 },
    pins: [
      { id: 'GP0', name: 'GP0', type: 'digital', position: { x: 6.09, y: 5.2 } },
      { id: 'GP1', name: 'GP1', type: 'digital', position: { x: 6.09, y: 14.8 } },
      { id: 'GND.1', name: 'GND', type: 'ground', position: { x: 6.09, y: 24.4 } },
      { id: 'GP2', name: 'GP2', type: 'digital', position: { x: 6.09, y: 34.0 } },
      { id: 'GP3', name: 'GP3', type: 'digital', position: { x: 6.09, y: 43.6 } },
      { id: 'GP4', name: 'GP4', type: 'digital', position: { x: 6.09, y: 53.2 } },
      { id: 'GP5', name: 'GP5', type: 'digital', position: { x: 6.09, y: 62.8 } },
      { id: 'GND.2', name: 'GND', type: 'ground', position: { x: 6.09, y: 72.4 } },
      { id: 'GP6', name: 'GP6', type: 'digital', position: { x: 6.09, y: 82.0 } },
      { id: 'GP7', name: 'GP7', type: 'digital', position: { x: 6.09, y: 91.6 } },
      { id: 'GP8', name: 'GP8', type: 'digital', position: { x: 6.09, y: 101.2 } },
      { id: 'GP9', name: 'GP9', type: 'digital', position: { x: 6.09, y: 110.8 } },
      { id: 'GND.3', name: 'GND', type: 'ground', position: { x: 6.09, y: 120.4 } },
      { id: 'GP10', name: 'GP10', type: 'digital', position: { x: 6.09, y: 130.0 } },
      { id: 'GP11', name: 'GP11', type: 'digital', position: { x: 6.09, y: 139.6 } },
      { id: 'GP12', name: 'GP12', type: 'digital', position: { x: 6.09, y: 149.2 } },
      { id: 'GP13', name: 'GP13', type: 'digital', position: { x: 6.09, y: 158.8 } },
      { id: 'GND.4', name: 'GND', type: 'ground', position: { x: 6.09, y: 168.4 } },
      { id: 'GP14', name: 'GP14', type: 'digital', position: { x: 6.09, y: 178.0 } },
      { id: 'GP15', name: 'GP15', type: 'digital', position: { x: 6.09, y: 187.6 } },
      { id: 'VBUS', name: 'VBUS', type: 'power', position: { x: 73.3, y: 5.2 } },
      { id: 'VSYS', name: 'VSYS', type: 'power', position: { x: 73.3, y: 14.8 } },
      { id: 'GND.5', name: 'GND', type: 'ground', position: { x: 73.3, y: 24.4 } },
      { id: '3V3_EN', name: '3V3_EN', type: 'passive', position: { x: 73.3, y: 34.0 } },
      { id: '3V3', name: '3V3', type: 'power', position: { x: 73.3, y: 43.6 } },
      { id: 'ADC_VREF', name: 'ADC_VREF', type: 'passive', position: { x: 73.3, y: 53.2 } },
      { id: 'GP28', name: 'GP28', type: 'analog', position: { x: 73.3, y: 62.8 } },
      { id: 'GND.6', name: 'AGND', type: 'ground', position: { x: 73.3, y: 72.4 } },
      { id: 'GP27', name: 'GP27', type: 'analog', position: { x: 73.3, y: 82.0 } },
      { id: 'GP26', name: 'GP26', type: 'analog', position: { x: 73.3, y: 91.6 } },
      { id: 'RUN', name: 'RUN', type: 'passive', position: { x: 73.3, y: 101.2 } },
      { id: 'GP22', name: 'GP22', type: 'digital', position: { x: 73.3, y: 110.8 } },
      { id: 'GND.7', name: 'GND', type: 'ground', position: { x: 73.3, y: 120.4 } },
      { id: 'GP21', name: 'GP21', type: 'digital', position: { x: 73.3, y: 130.0 } },
      { id: 'GP20', name: 'GP20', type: 'digital', position: { x: 73.3, y: 139.6 } },
      { id: 'GP19', name: 'GP19', type: 'digital', position: { x: 73.3, y: 149.2 } },
      { id: 'GP18', name: 'GP18', type: 'digital', position: { x: 73.3, y: 158.8 } },
      { id: 'GND.8', name: 'GND', type: 'ground', position: { x: 73.3, y: 168.4 } },
      { id: 'GP17', name: 'GP17', type: 'digital', position: { x: 73.3, y: 178.0 } },
      { id: 'GP16', name: 'GP16', type: 'digital', position: { x: 73.3, y: 187.6 } },
    ],
    aliases: ['pico', 'pico-2w', 'pico2w', 'raspberry-pi-pico-2w', 'pico_2w'],
    description: 'Wi-Fi microcontroller for the MicroPython lessons. Circuit Lab shows its wiring; the code runs on the real board.',
    mountStyle: 'free',
  },
];

definitions.forEach((definition) => applyCanonicalGeometry(definition));

const ALL_BREADBOARD_ZONES: BreadboardZone[] = ['strip-top', 'strip-bottom', 'rail-top', 'rail-bottom'];
const STRIP_ONLY_ZONES: BreadboardZone[] = ['strip-top', 'strip-bottom'];

type FootprintOptions = Omit<ComponentFootprint, 'type' | 'pins'> & {
  pinAllowedZones?: Record<string, BreadboardZone[]>;
};

function createFootprint(
  type: MountFootprintClass,
  pins: ComponentDefinition['pins'],
  options: FootprintOptions = {}
): ComponentFootprint {
  const { pinAllowedZones = {}, referencePinId = pins[0]?.id, ...rest } = options;
  const referencePin = pins.find((candidate) => candidate.id === referencePinId) ?? pins[0];

  return {
    type,
    referencePinId: referencePin?.id,
    ...rest,
    pins: referencePin
      ? pins.map((pin) => ({
          id: pin.id,
          dx: pin.position.x - referencePin.position.x,
          dy: pin.position.y - referencePin.position.y,
          allowedZones: pinAllowedZones[pin.id],
        }))
      : [],
  };
}

function getDefinitionPins(id: string) {
  return definitions.find((definition) => definition.id === id)?.pins ?? [];
}

function assignFootprint(id: string, footprint: ComponentFootprint) {
  const definition = definitions.find((candidate) => candidate.id === id);
  if (definition) {
    definition.footprint = footprint;
  }
}

assignFootprint('BREADBOARD', { type: 'board', pins: [] });
assignFootprint('ARDUINO_UNO', { type: 'board', pins: [] });
assignFootprint('RASPBERRY_PI_PICO_2W', { type: 'board', pins: [] });
assignFootprint(
  'LED',
  createFootprint('breadboard-mountable', getDefinitionPins('LED'), {
    allowedZones: STRIP_ONLY_ZONES,
    supportedRotations: [0, 90, 180, 270],
    minColumnSpan: 1,
  })
);
assignFootprint(
  'BUTTON',
  createFootprint('breadboard-mountable', getDefinitionPins('BUTTON'), {
    allowedZones: STRIP_ONLY_ZONES,
    supportedRotations: [90, 270],
    requiresTrenchCrossing: true,
    minColumnSpan: 1,
  })
);
assignFootprint(
  'RESISTOR',
  createFootprint('breadboard-mountable', getDefinitionPins('RESISTOR'), {
    allowedZones: ALL_BREADBOARD_ZONES,
    supportedRotations: [0, 90, 180, 270],
    minColumnSpan: 1,
  })
);
assignFootprint(
  'POTENTIOMETER',
  createFootprint('breadboard-mountable', getDefinitionPins('POTENTIOMETER'), {
    allowedZones: STRIP_ONLY_ZONES,
    supportedRotations: [0, 180],
    minColumnSpan: 2,
  })
);
assignFootprint('SERVO', { type: 'freeform', pins: [] });
assignFootprint(
  'ULTRASONIC',
  createFootprint('module', getDefinitionPins('ULTRASONIC'), {
    allowedZones: STRIP_ONLY_ZONES,
    supportedRotations: [0, 180],
    minColumnSpan: 3,
  })
);
assignFootprint(
  'DHT',
  createFootprint('breadboard-mountable', getDefinitionPins('DHT'), {
    allowedZones: STRIP_ONLY_ZONES,
    supportedRotations: [0, 180],
    minColumnSpan: 3,
  })
);
assignFootprint(
  'OLED',
  createFootprint('module', getDefinitionPins('OLED'), {
    allowedZones: STRIP_ONLY_ZONES,
    supportedRotations: [0, 180],
    minColumnSpan: 3,
  })
);
assignFootprint(
  'BUZZER',
  createFootprint('breadboard-mountable', getDefinitionPins('BUZZER'), {
    allowedZones: STRIP_ONLY_ZONES,
    supportedRotations: [0, 90, 180, 270],
    minColumnSpan: 1,
  })
);
assignFootprint(
  'RGB_LED',
  createFootprint('breadboard-mountable', getDefinitionPins('RGB_LED'), {
    allowedZones: STRIP_ONLY_ZONES,
    supportedRotations: [0, 180],
    minColumnSpan: 3,
  })
);
assignFootprint(
  'TRAFFIC_LIGHT',
  createFootprint('module', getDefinitionPins('TRAFFIC_LIGHT'), {
    allowedZones: STRIP_ONLY_ZONES,
    supportedRotations: [0, 180],
    minColumnSpan: 3,
  })
);
// The LDR and sound modules have their pins on one short edge; on a breadboard they would sit
// with the board standing up, so they are wired with jumper wires instead (like the servo).
assignFootprint('LDR', { type: 'freeform', pins: [] });
assignFootprint('SOUND_SENSOR', { type: 'freeform', pins: [] });
assignFootprint(
  'SLIDE_SWITCH',
  createFootprint('breadboard-mountable', getDefinitionPins('SLIDE_SWITCH'), {
    allowedZones: STRIP_ONLY_ZONES,
    supportedRotations: [0, 180],
    minColumnSpan: 3,
  })
);
assignFootprint(
  'PIR',
  createFootprint('module', getDefinitionPins('PIR'), {
    allowedZones: STRIP_ONLY_ZONES,
    supportedRotations: [0, 180],
    minColumnSpan: 3,
  })
);
// The 7-segment's two pin rows sit 18 mm apart in the Wokwi drawing, which does not land on
// breadboard holes, so it is wired with jumpers like the relay module and the motor.
assignFootprint('SEVEN_SEGMENT', { type: 'freeform', pins: [] });
assignFootprint('RELAY', { type: 'freeform', pins: [] });
assignFootprint('DC_MOTOR', { type: 'freeform', pins: [] });
assignFootprint('NEOPIXEL_RING', { type: 'freeform', pins: [] });
assignFootprint('LCD1602', { type: 'freeform', pins: [] });

export function registerComponent(definition: ComponentDefinition) {
  componentRegistry.set(definition.id, definition);
  aliasRegistry.set(definition.id.toLowerCase(), definition.id);

  definition.aliases?.forEach((alias) => {
    aliasRegistry.set(alias.toLowerCase(), definition.id);
  });
}

for (const definition of definitions) {
  registerComponent(definition);
}

export function normalizeComponentType(type: string) {
  const normalized = aliasRegistry.get(type.trim().toLowerCase());
  return normalized ?? type.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function getComponentDefinition(type: string) {
  return componentRegistry.get(normalizeComponentType(type));
}

export function getComponentCatalog() {
  return Array.from(componentRegistry.values());
}

export function getPlaceableComponents() {
  return getComponentCatalog().filter((definition) => definition.placeable !== false);
}

export function createDefaultComponentState(type: string) {
  const definition = getComponentDefinition(type);
  return definition?.defaultProperties ? { ...definition.defaultProperties } : {};
}

export function isPlaceableComponent(type: string) {
  const definition = getComponentDefinition(type);
  return definition?.placeable !== false;
}



export type ComponentMountClassification =
  | 'board'
  | 'freeform-only'
  | 'strip-only'
  | 'rail-allowed'
  | 'trench-bridging';

export function getComponentMountClassifications(type: string): ComponentMountClassification[] {
  const definition = getComponentDefinition(type);
  if (!definition) {
    return [];
  }

  const footprint = definition.footprint;
  if (!footprint || footprint.type === 'freeform') {
    return ['freeform-only'];
  }

  if (footprint.type === 'board') {
    return ['board'];
  }

  const allowedZones = footprint.allowedZones ?? footprint.pins.flatMap((pin) => pin.allowedZones ?? []);
  const classifications: ComponentMountClassification[] = [];
  if (allowedZones.includes('rail-top') || allowedZones.includes('rail-bottom')) {
    classifications.push('rail-allowed');
  } else {
    classifications.push('strip-only');
  }

  if (footprint.requiresTrenchCrossing) {
    classifications.push('trench-bridging');
  }

  return classifications;
}


