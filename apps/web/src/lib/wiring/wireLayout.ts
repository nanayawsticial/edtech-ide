/**
 * Wire geometry for Circuit Lab: picking a wire under the pointer, and keeping wires that run
 * along the same line from drawing on top of each other.
 *
 * Wires are orthogonal polylines (horizontal and vertical segments) in world coordinates.
 * Pure functions with type-only imports, tested by `scripts/validate-wire-layout.mjs`.
 */

import type { Point } from '@/lib/wiring/componentGeometry';

/** Gap between wires that share a line. */
export const SHARED_LINE_SPACING = 8;
/** Segments whose lines are this close count as the same line. */
const SAME_LINE_TOLERANCE = 0.5;

// --- Picking -------------------------------------------------------------------------------------

export interface WireSegmentPick {
  /** Index of the segment, starting at the segment from points[0] to points[1]. */
  segmentIndex: number;
  /** Distance from the pointer to the wire. */
  distance: number;
  /** The point on the wire nearest the pointer. */
  nearest: Point;
}

/** The point of segment a→b nearest to p. */
export function nearestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const length2 = vx * vx + vy * vy;
  if (length2 === 0) return { x: a.x, y: a.y };
  const along = ((p.x - a.x) * vx + (p.y - a.y) * vy) / length2;
  const t = along < 0 ? 0 : along > 1 ? 1 : along;
  return { x: a.x + vx * t, y: a.y + vy * t };
}

/** The segment of a wire nearest to the pointer, if it is within `reach`; otherwise null. */
export function pickWireSegment(points: Point[], pointer: Point, reach: number): WireSegmentPick | null {
  let best: WireSegmentPick | null = null;
  for (let index = 1; index < points.length; index += 1) {
    const nearest = nearestPointOnSegment(pointer, points[index - 1], points[index]);
    const distance = Math.hypot(pointer.x - nearest.x, pointer.y - nearest.y);
    if (distance <= reach && (best === null || distance < best.distance)) {
      best = { segmentIndex: index - 1, distance, nearest };
    }
  }
  return best;
}

// --- Shared lines --------------------------------------------------------------------------------

export interface WireRoute {
  id: string;
  points: Point[];
}

interface Run {
  wireOrder: number;
  /** Position in drawing order (wire by wire, segment by segment). */
  seq: number;
  vertical: boolean;
  /** x for a vertical run, y for a horizontal one. */
  line: number;
  from: number;
  to: number;
}

function runsOf(points: Point[], wireOrder: number, firstSeq: number): Run[] {
  const runs: Run[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
    const [p, q] = vertical ? [a.y, b.y] : [a.x, b.x];
    runs.push({ wireOrder, seq: firstSeq + index - 1, vertical, line: vertical ? a.x : a.y, from: Math.min(p, q), to: Math.max(p, q) });
  }
  return runs;
}

/**
 * How far to move each wire sideways so wires sharing a line sit side by side. Wires that share
 * part of a line (same direction, same line, overlapping or touching lengths) form a group; a
 * group of n wires spreads around the line, SHARED_LINE_SPACING apart, in input order. A wire in
 * several groups keeps its largest move. Wires that share nothing get 0.
 */
export function spreadSharedLines(routes: WireRoute[]): Map<string, number> {
  const shift = new Map<string, number>(routes.map((route) => [route.id, 0]));

  let seq = 0;
  const runs = routes.flatMap((route, order) => {
    const wireRuns = runsOf(route.points, order, seq);
    seq += wireRuns.length;
    return wireRuns;
  });
  const clusters: Run[][] = [];
  // Walk the runs line by line, and along each line from start to end.
  runs.sort((left, right) =>
    left.vertical !== right.vertical ? (left.vertical ? 1 : -1) : left.line - right.line || left.from - right.from
  );

  let index = 0;
  while (index < runs.length) {
    // Runs on (nearly) the same line, chaining small differences like the tolerance allows.
    const lineEnd = (() => {
      let end = index + 1;
      while (
        end < runs.length &&
        runs[end].vertical === runs[index].vertical &&
        runs[end].line - runs[end - 1].line <= SAME_LINE_TOLERANCE
      ) {
        end += 1;
      }
      return end;
    })();

    // Along that line, sweep for clusters of runs that overlap or touch.
    const onLine = runs.slice(index, lineEnd).sort((left, right) => left.from - right.from);
    let cluster: Run[] = [];
    let reach = -Infinity;
    for (const run of onLine) {
      if (run.from > reach && cluster.length > 0) {
        clusters.push(cluster);
        cluster = [];
      }
      cluster.push(run);
      reach = Math.max(reach, run.to);
    }
    if (cluster.length > 0) clusters.push(cluster);

    index = lineEnd;
  }

  // Settle groups in drawing order, so when two equal moves compete the earlier group wins.
  const firstSeq = (cluster: Run[]) => Math.min(...cluster.map((run) => run.seq));
  clusters.sort((left, right) => firstSeq(left) - firstSeq(right));
  for (const cluster of clusters) {
    const wires = [...new Set(cluster.map((run) => run.wireOrder))].sort((left, right) => left - right);
    if (wires.length < 2) continue;
    wires.forEach((wireOrder, position) => {
      const id = routes[wireOrder].id;
      const move = (position - (wires.length - 1) / 2) * SHARED_LINE_SPACING;
      if (Math.abs(move) > Math.abs(shift.get(id) ?? 0)) shift.set(id, move);
    });
  }

  return shift;
}

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/**
 * Keeps both ends and the corners in between: drops repeated points and points in the middle of a
 * straight run, until nothing more can go. A wire always keeps at least its two ends.
 */
function tidy(points: Point[]): Point[] {
  if (points.length <= 2) return points;
  let current = points;
  for (;;) {
    const first = current[0];
    const last = current[current.length - 1];
    const kept: Point[] = [first];
    for (let index = 1; index < current.length - 1; index += 1) {
      const point = current[index];
      const before = kept[kept.length - 1];
      const after = current[index + 1];
      const repeated = samePoint(point, before);
      const midRun = (before.x === point.x && point.x === after.x) || (before.y === point.y && point.y === after.y);
      if (!repeated && !midRun) kept.push(point);
    }
    if (kept.length > 1 && samePoint(kept[kept.length - 1], last)) kept.pop();
    kept.push(last);
    if (kept.length === current.length) return kept;
    current = kept;
  }
}

/**
 * Moves a wire `shift` sideways, across the direction of its first segment. Its two ends stay on
 * their pins, with a short jog onto and off the moved path.
 */
export function shiftWire(points: Point[], shift: number): Point[] {
  if (shift === 0 || points.length < 2) return points;

  const first = points[0];
  const last = points[points.length - 1];
  const startsHorizontal = Math.abs(points[1].x - first.x) >= Math.abs(points[1].y - first.y);
  const move = (point: Point): Point => (startsHorizontal ? { x: point.x, y: point.y + shift } : { x: point.x + shift, y: point.y });

  // pin → moved copy of every point (ends included) → pin; tidy() removes what is not a corner.
  return tidy([first, ...points.map(move), last]);
}
