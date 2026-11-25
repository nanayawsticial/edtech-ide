import type { Point } from '@/lib/wiring/componentGeometry';
import { shiftWire, spreadSharedLines, type WireRoute } from '@/lib/wiring/wireLayout';

/** Where each wire is drawn: wires sharing a line are spread side by side. */
export function calculateRenderedWirePoints(wires: WireRoute[]) {
  const shifts = spreadSharedLines(wires);
  const renderedPoints = new Map<string, Point[]>();

  wires.forEach((wire) => {
    renderedPoints.set(wire.id, shiftWire(wire.points, shifts.get(wire.id) ?? 0));
  });

  return renderedPoints;
}
