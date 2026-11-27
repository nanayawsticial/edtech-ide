import { GRID_PITCH, type Point } from '@/lib/wiring/componentGeometry';

import type { WireHandleNode } from './sceneTypes';

type EditableWireHandle = Pick<
  WireHandleNode,
  'axis' | 'kind' | 'waypointIndex' | 'segmentIndex' | 'routeIndex' | 'endpoint'
>;

function snap(value: number) {
  return Math.round(value / GRID_PITCH) * GRID_PITCH;
}

function snapPoint(point: Point): Point {
  return {
    x: snap(point.x),
    y: snap(point.y),
  };
}

function nearlyEqual(left: number, right: number, tolerance = 0.5) {
  return Math.abs(left - right) <= tolerance;
}

function pointsEqual(a: Point, b: Point) {
  return nearlyEqual(a.x, b.x) && nearlyEqual(a.y, b.y);
}

function simplifyRoutePoints(points: Point[]) {
  if (points.length <= 2) {
    return points;
  }

  const deduped: Point[] = [];
  points.forEach((point) => {
    if (deduped.length === 0 || !pointsEqual(deduped[deduped.length - 1], point)) {
      deduped.push(point);
    }
  });

  if (deduped.length <= 2) {
    return deduped;
  }

  const simplified: Point[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];

    const sameVertical = nearlyEqual(previous.x, current.x) && nearlyEqual(current.x, next.x);
    const sameHorizontal = nearlyEqual(previous.y, current.y) && nearlyEqual(current.y, next.y);
    if (sameVertical || sameHorizontal) {
      continue;
    }

    simplified.push(current);
  }

  simplified.push(deduped[deduped.length - 1]);
  return simplified;
}

function orthogonalizeRoutePoints(points: Point[]) {
  if (points.length <= 1) {
    return points;
  }

  const orthogonal: Point[] = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const previous = orthogonal[orthogonal.length - 1];

    if (pointsEqual(previous, point)) {
      continue;
    }

    const sameVertical = nearlyEqual(previous.x, point.x);
    const sameHorizontal = nearlyEqual(previous.y, point.y);

    if (sameVertical || sameHorizontal) {
      orthogonal.push(point);
      continue;
    }

    const dx = Math.abs(point.x - previous.x);
    const dy = Math.abs(point.y - previous.y);
    const bridge = dx >= dy ? { x: point.x, y: previous.y } : { x: previous.x, y: point.y };

    if (!pointsEqual(previous, bridge)) {
      orthogonal.push(bridge);
    }

    if (!pointsEqual(orthogonal[orthogonal.length - 1], point)) {
      orthogonal.push(point);
    }
  }

  return orthogonal;
}

function normalizeRoutePoints(start: Point, end: Point, path: Point[]) {
  const snappedPath = path.map(snapPoint);
  return simplifyRoutePoints(orthogonalizeRoutePoints([start, ...snappedPath, end]));
}

function routeToWaypoints(start: Point, end: Point, route: Point[]) {
  const normalized = normalizeRoutePoints(start, end, route.slice(1, -1));
  return normalized.slice(1, -1);
}

function getSegmentAxis(start: Point, end: Point): 'x' | 'y' {
  return nearlyEqual(start.x, end.x) ? 'x' : 'y';
}

function getSegmentLength(start: Point, end: Point) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function moveSegmentHandle(start: Point, end: Point, waypoints: Point[], segmentIndex: number, nextPoint: Point) {
  const route = buildWireRoutePoints(start, end, waypoints);
  const segmentStart = route[segmentIndex];
  const segmentEnd = route[segmentIndex + 1];

  if (!segmentStart || !segmentEnd) {
    return normalizeWirePath(waypoints, start, end);
  }

  if (nearlyEqual(segmentStart.x, segmentEnd.x)) {
    const nextX = snap(nextPoint.x);
    return routeToWaypoints(start, end, [
      ...route.slice(0, segmentIndex + 1),
      { x: nextX, y: segmentStart.y },
      { x: nextX, y: segmentEnd.y },
      ...route.slice(segmentIndex + 1),
    ]);
  }

  const nextY = snap(nextPoint.y);
  return routeToWaypoints(start, end, [
    ...route.slice(0, segmentIndex + 1),
    { x: segmentStart.x, y: nextY },
    { x: segmentEnd.x, y: nextY },
    ...route.slice(segmentIndex + 1),
  ]);
}

function moveElbowHandle(start: Point, end: Point, waypoints: Point[], routeIndex: number, nextPoint: Point) {
  const route = buildWireRoutePoints(start, end, waypoints);
  if (routeIndex <= 0 || routeIndex >= route.length - 1 || !route[routeIndex]) {
    return normalizeWirePath(waypoints, start, end);
  }

  const nextRoute = route.map((point, index) => (index === routeIndex ? snapPoint(nextPoint) : point));
  return routeToWaypoints(start, end, nextRoute);
}

function isCorner(previous: Point, current: Point, next: Point) {
  const sameVertical = nearlyEqual(previous.x, current.x) && nearlyEqual(current.x, next.x);
  const sameHorizontal = nearlyEqual(previous.y, current.y) && nearlyEqual(current.y, next.y);
  return !(sameVertical || sameHorizontal);
}

export function normalizeWirePath(path: Point[], start: Point, end: Point) {
  return normalizeRoutePoints(start, end, path).slice(1, -1);
}

export function buildOrthogonalWaypoints(start: Point, end: Point, existingWaypoints: Point[] = []) {
  return normalizeWirePath(existingWaypoints, start, end);
}

export function buildWireRoutePoints(
  start: Point,
  end: Point,
  existingWaypoints: Point[] = [],
  preferredAxis: 'horizontal' | 'vertical' | 'free' = 'free'
) {
  if (existingWaypoints.length === 0 && preferredAxis !== 'free') {
    const guidedCorner =
      preferredAxis === 'horizontal'
        ? { x: end.x, y: start.y }
        : { x: start.x, y: end.y };

    return normalizeRoutePoints(start, end, [guidedCorner]);
  }

  return normalizeRoutePoints(start, end, existingWaypoints);
}

export function getWireHandles(wireId: string, start: Point, end: Point, waypoints: Point[] = []): WireHandleNode[] {
  const route = buildWireRoutePoints(start, end, waypoints);
  const handles: WireHandleNode[] = [];

  handles.push({
    id: `${wireId}-endpoint-from`,
    wireId,
    position: route[0] ?? start,
    axis: 'both',
    kind: 'endpoint',
    waypointIndex: -1,
    endpoint: 'from',
    routeIndex: 0,
  });

  for (let index = 1; index < route.length - 1; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    const next = route[index + 1];
    if (!previous || !current || !next || !isCorner(previous, current, next)) {
      continue;
    }

    handles.push({
      id: `${wireId}-elbow-${index}`,
      wireId,
      position: current,
      axis: 'both',
      kind: 'elbow',
      waypointIndex: index - 1,
      routeIndex: index,
    });
  }

  for (let index = 0; index < route.length - 1; index += 1) {
    const segmentStart = route[index];
    const segmentEnd = route[index + 1];
    if (getSegmentLength(segmentStart, segmentEnd) < GRID_PITCH * 0.75) {
      continue;
    }

    handles.push({
      id: `${wireId}-segment-${index}`,
      wireId,
      position: {
        x: (segmentStart.x + segmentEnd.x) / 2,
        y: (segmentStart.y + segmentEnd.y) / 2,
      },
      axis: getSegmentAxis(segmentStart, segmentEnd),
      kind: 'segment',
      waypointIndex: -1,
      segmentIndex: index,
    });
  }

  handles.push({
    id: `${wireId}-endpoint-to`,
    wireId,
    position: route[route.length - 1] ?? end,
    axis: 'both',
    kind: 'endpoint',
    waypointIndex: -1,
    endpoint: 'to',
    routeIndex: route.length - 1,
  });

  return handles;
}

export function moveWireHandle(
  start: Point,
  end: Point,
  waypoints: Point[],
  handle: EditableWireHandle,
  nextPoint: Point
) {
  if (handle.kind === 'segment' && typeof handle.segmentIndex === 'number') {
    return moveSegmentHandle(start, end, waypoints, handle.segmentIndex, nextPoint);
  }

  if (handle.kind === 'elbow' && typeof handle.routeIndex === 'number') {
    return moveElbowHandle(start, end, waypoints, handle.routeIndex, nextPoint);
  }

  return normalizeWirePath(waypoints, start, end);
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const segmentLengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  if (segmentLengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection =
    ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) /
    segmentLengthSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  const projectedX = start.x + clamped * (end.x - start.x);
  const projectedY = start.y + clamped * (end.y - start.y);
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

export function distanceToPolyline(point: Point, route: Point[]) {
  let closest = Number.POSITIVE_INFINITY;

  for (let index = 0; index < route.length - 1; index += 1) {
    closest = Math.min(closest, distanceToSegment(point, route[index], route[index + 1]));
  }

  return closest;
}

// ---------------------------------------------------------------------------------------------
// Free routing: straight segments through the learner's own bend points (Tinkercad style).
// Older wires stay 'orthogonal' until their bends are edited; see getWireRouting.
// ---------------------------------------------------------------------------------------------

export type WireRouting = 'free' | 'orthogonal';

export function getWireRouting(net: { routing?: WireRouting | null }): WireRouting {
  return net.routing === 'free' ? 'free' : 'orthogonal';
}

/** Bends snap to a half-pitch grid: fine enough to place freely, tidy enough to line up. */
const BEND_SNAP = GRID_PITCH / 2;

export function snapBendPoint(point: Point): Point {
  return {
    x: Math.round(point.x / BEND_SNAP) * BEND_SNAP,
    y: Math.round(point.y / BEND_SNAP) * BEND_SNAP,
  };
}

/** Holds a point level with, or straight above or below, `anchor` (whichever is nearer). */
export function constrainToAxis(anchor: Point, point: Point): Point {
  return Math.abs(point.x - anchor.x) >= Math.abs(point.y - anchor.y)
    ? { x: point.x, y: anchor.y }
    : { x: anchor.x, y: point.y };
}

/** Where a bend goes for a pointer position: snapped, or held level with `anchor` while Shift is down. */
export function placeBendPoint(point: Point, anchor: Point | null, constrain: boolean): Point {
  const snapped = snapBendPoint(point);
  return constrain && anchor ? constrainToAxis(anchor, snapped) : snapped;
}

/** The corners an orthogonal wire is drawn through, as free-route bends (keeps its shape). */
export function materializeWaypoints(start: Point, end: Point, waypoints: Point[], routing: WireRouting): Point[] {
  if (routing === 'free') {
    return waypoints.map((point) => ({ ...point }));
  }
  return buildWireRoutePoints(start, end, waypoints).slice(1, -1);
}

export function buildRoutePoints(start: Point, end: Point, waypoints: Point[], routing: WireRouting): Point[] {
  return routing === 'free' ? [start, ...waypoints, end] : buildWireRoutePoints(start, end, waypoints);
}

/**
 * Drops bends that do nothing: repeats of a neighbour and bends sitting on the straight line
 * between their neighbours. Used when an edit is committed.
 */
export function tidyFreeWaypoints(start: Point, end: Point, waypoints: Point[]): Point[] {
  let route = [start, ...waypoints, end];
  let changed = true;
  while (changed && route.length > 2) {
    changed = false;
    for (let index = 1; index < route.length - 1; index += 1) {
      const previous = route[index - 1];
      const current = route[index];
      const next = route[index + 1];
      const repeated = pointsEqual(previous, current) || pointsEqual(current, next);
      const cross = (current.x - previous.x) * (next.y - previous.y) - (current.y - previous.y) * (next.x - previous.x);
      const span = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
      const between =
        (current.x - previous.x) * (next.x - previous.x) + (current.y - previous.y) * (next.y - previous.y) >= 0 &&
        (current.x - next.x) * (previous.x - next.x) + (current.y - next.y) * (previous.y - next.y) >= 0;
      if (repeated || (Math.abs(cross) / span < 0.5 && between)) {
        route = [...route.slice(0, index), ...route.slice(index + 1)];
        changed = true;
        break;
      }
    }
  }
  return route.slice(1, -1);
}

/** Index of the route segment nearest `point` (segment i joins route[i] and route[i + 1]). */
export function nearestSegmentIndex(route: Point[], point: Point) {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < route.length - 1; index += 1) {
    const distance = distanceToSegment(point, route[index], route[index + 1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/** Adds a bend on segment `segmentIndex`; returns the new bends and the new bend's index in them. */
export function insertBend(waypoints: Point[], segmentIndex: number, point: Point) {
  const index = Math.max(0, Math.min(waypoints.length, segmentIndex));
  return {
    waypoints: [...waypoints.slice(0, index), point, ...waypoints.slice(index)],
    waypointIndex: index,
  };
}

export function removeBend(waypoints: Point[], waypointIndex: number) {
  return waypoints.filter((_, index) => index !== waypointIndex);
}

/** Moves bend `waypointIndex` to `point`; with `constrain`, keeps the segment into it level or upright. */
export function moveBend(start: Point, waypoints: Point[], waypointIndex: number, point: Point, constrain: boolean) {
  const previous = waypointIndex === 0 ? start : waypoints[waypointIndex - 1];
  const placed = placeBendPoint(point, previous ?? null, constrain);
  return waypoints.map((existing, index) => (index === waypointIndex ? placed : existing));
}

/** Handles for a free wire: both ends, every bend, and a "drag to bend" grip mid-segment. */
export function getFreeWireHandles(wireId: string, start: Point, end: Point, waypoints: Point[]): WireHandleNode[] {
  const route = [start, ...waypoints, end];
  const handles: WireHandleNode[] = [
    { id: `${wireId}-endpoint-from`, wireId, position: start, axis: 'both', kind: 'endpoint', waypointIndex: -1, endpoint: 'from', routeIndex: 0 },
  ];

  waypoints.forEach((point, index) => {
    handles.push({ id: `${wireId}-bend-${index}`, wireId, position: point, axis: 'both', kind: 'elbow', waypointIndex: index, routeIndex: index + 1 });
  });

  for (let index = 0; index < route.length - 1; index += 1) {
    if (getSegmentLength(route[index], route[index + 1]) < GRID_PITCH * 2) {
      continue;
    }
    handles.push({
      id: `${wireId}-segment-${index}`,
      wireId,
      position: { x: (route[index].x + route[index + 1].x) / 2, y: (route[index].y + route[index + 1].y) / 2 },
      axis: 'both',
      kind: 'segment',
      waypointIndex: -1,
      segmentIndex: index,
    });
  }

  handles.push({ id: `${wireId}-endpoint-to`, wireId, position: end, axis: 'both', kind: 'endpoint', waypointIndex: -1, endpoint: 'to', routeIndex: route.length - 1 });
  return handles;
}
