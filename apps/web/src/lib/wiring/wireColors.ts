// Wire colours offered in Circuit Lab, in the order the palette shows them.
// Red, green, blue, white and purple keep the hex values older projects saved, so
// those wires still show as selected in the palette.
export interface WireColorOption {
  id: string;
  name: string;
  hex: string;
}

export const WIRE_COLOR_OPTIONS: readonly WireColorOption[] = [
  { id: 'red', name: 'Red', hex: '#ef4444' },
  { id: 'orange', name: 'Orange', hex: '#f97316' },
  { id: 'yellow', name: 'Yellow', hex: '#facc15' },
  { id: 'green', name: 'Green', hex: '#10b981' },
  { id: 'turquoise', name: 'Turquoise', hex: '#06b6d4' },
  { id: 'blue', name: 'Blue', hex: '#3b82f6' },
  { id: 'purple', name: 'Purple', hex: '#8b5cf6' },
  { id: 'pink', name: 'Pink', hex: '#ec4899' },
  { id: 'brown', name: 'Brown', hex: '#9a5b2b' },
  { id: 'grey', name: 'Grey', hex: '#9ca3af' },
  { id: 'white', name: 'White', hex: '#f8fafc' },
  { id: 'black', name: 'Black', hex: '#1f2430' },
];

const OLD_PALETTE_NAMES: Record<string, string> = {
  '#f59e0b': 'Amber',
};

export const DEFAULT_SIGNAL_WIRE_COLOR = '#10b981';
export const DEFAULT_POWER_WIRE_COLOR = '#ef4444';
export const DEFAULT_GROUND_WIRE_COLOR = '#1f2430';

export function getWireColorName(hex: string | null | undefined) {
  if (!hex) return 'Wire';
  const normalized = hex.toLowerCase();
  return WIRE_COLOR_OPTIONS.find((option) => option.hex === normalized)?.name ?? OLD_PALETTE_NAMES[normalized] ?? 'Custom';
}

function luminance(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0.5;
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => {
    const v = ((value >> shift) & 0xff) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/**
 * The thin outline drawn under a wire, like real insulation. Dark wires get a light edge so
 * they show on the dark canvas; light wires get a dark edge so they show on the breadboard.
 */
export function getWireCasingColor(hex: string) {
  return luminance(hex) < 0.08 ? 'rgba(226, 232, 240, 0.55)' : 'rgba(2, 6, 23, 0.55)';
}

export type WireEndKind = 'power' | 'ground' | 'other';

/**
 * Colour for a new wire. Once the learner picks a colour, new wires use it. Until then they follow
 * the usual kit convention: black to ground, red to power, green for signals.
 */
export function chooseNewWireColor(ends: WireEndKind[], lastPickedColor: string | null) {
  if (lastPickedColor) return lastPickedColor;
  if (ends.includes('ground')) return DEFAULT_GROUND_WIRE_COLOR;
  if (ends.includes('power')) return DEFAULT_POWER_WIRE_COLOR;
  return DEFAULT_SIGNAL_WIRE_COLOR;
}
