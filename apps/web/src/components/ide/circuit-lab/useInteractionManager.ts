import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCircuitStore } from '@/stores/circuitStore';
import type { PointerEvent as ReactPointerEvent, RefObject, WheelEvent as ReactWheelEvent } from 'react';

import type { Point } from './types';
import type { HitResult, SceneGraph, WorldWireNode } from './sceneTypes';
import { hitTestScene, resolveBiasedPinTarget, type WireIntentAxis, type WireTargetLockState } from './hitTesting';
import {
  buildRoutePoints,
  constrainToAxis,
  insertBend,
  materializeWaypoints,
  moveBend,
  nearestSegmentIndex,
  placeBendPoint,
  removeBend,
  tidyFreeWaypoints,
  type WireRouting,
} from './wireRouting';
import type { CanvasTransform } from './useCanvasViewport';

export type InteractionMode =
  | { type: 'IDLE' }
  | { type: 'PANNING'; startClient: Point; origin: Point }
  /** Dragging a selection box on empty canvas (in world coordinates). */
  | { type: 'SELECTING_BOX'; startClient: Point; startWorld: Point; currentWorld: Point; moved: boolean }
  | { type: 'DRAGGING_COMPONENT'; componentId: string; startClient: Point; origin: Point; moved: boolean }
  | {
      type: 'DRAWING_WIRE';
      fromPinId: string;
      fromNodeId: string;
      fromPoint: Point;
      previewPoint: Point;
      hoveredTargetNodeId: string | null;
      hoveredTargetPinId: string | null;
      targetLockState: WireTargetLockState | null;
      crowdedTargets: boolean;
      previewAxis: WireIntentAxis;
      /** Bends placed so far by clicking empty canvas. */
      bends: Point[];
    }
  | {
      type: 'REWIRING_WIRE_ENDPOINT';
      wireId: string;
      endpoint: 'from' | 'to';
      fixedPoint: Point;
      fixedNodeId: string;
      fixedPinId: string;
      previewPoint: Point;
      hoveredTargetNodeId: string | null;
      hoveredTargetPinId: string | null;
      targetLockState: WireTargetLockState | null;
      crowdedTargets: boolean;
      previewAxis: WireIntentAxis;
      routing: WireRouting;
      /** The wire's bends, kept while a free wire's end moves to another pin. */
      waypoints: Point[];
    }
  | {
      /** Moving one bend of a wire, or pulling a segment to create a new bend. */
      type: 'MOVING_WIRE_HANDLE';
      wireId: string;
      startClient: Point;
      moved: boolean;
    };

export interface WireConnectionRequest {
  fromNodeId: string;
  toNodeId: string;
  fromPinId: string;
  toPinId: string;
  /** Bends placed while drawing. */
  waypoints?: Point[];
}

/** The live part of a bend edit; kept in a ref so fast pointer moves never insert a bend twice. */
interface BendEdit {
  wireId: string;
  start: Point;
  end: Point;
  /** Bends the edit starts from (an older wire's corners, made into free bends). */
  baseWaypoints: Point[];
  /** Which bend moves; null until a pulled segment has created its bend. */
  waypointIndex: number | null;
  /** Set when the edit began on a segment: the new bend goes on this segment once the pointer moves. */
  insertSegmentIndex: number | null;
  preview: Point[] | null;
}

export interface WireEndpointReconnectRequest {
  wireId: string;
  endpoint: 'from' | 'to';
  targetNodeId: string;
  targetPinId: string;
  targetPoint: Point;
}

interface DragMoveMeta {
  client: Point;
  moved: boolean;
}

interface ActiveWireContext {
  sourceNodeId: string;
  sourcePinId: string;
  sourcePoint: Point;
  previousTargetPinId: string | null;
  /** The point the loose end is drawn from (the last bend, or the source pin); Shift keeps it level. */
  lastPoint: Point;
}

interface InteractionManagerOptions {
  containerRef?: RefObject<HTMLDivElement | null>;
  scene: SceneGraph;
  transform: CanvasTransform;
  selectedComponentId: string | null;
  selectedWireId: string | null;
  onSelectComponent: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onMoveComponent: (id: string, position: Point, meta: DragMoveMeta) => void;
  onCommitComponentMove?: (id: string, position: Point, meta: DragMoveMeta) => void;
  onTapComponent?: (id: string) => void;
  onRotateComponent: (id: string, direction?: 1 | -1) => void;
  onDeleteComponent: (id: string) => void;
  onDeleteWire: (id: string) => void;
  onAddWire: (request: WireConnectionRequest) => void;
  onRewireWireEndpoint: (request: WireEndpointReconnectRequest) => void;
  /** Shows bends while an edit is in progress (null clears). Edits always produce free wires. */
  onPreviewWireWaypoints: (id: string, waypoints: Point[] | null) => void;
  /** Saves a wire's bends; the wire becomes a free wire. */
  onCommitWireWaypoints: (id: string, waypoints: Point[]) => void;
  /** Selects what lies inside a box dragged on empty canvas (world coordinates). */
  onBoxSelect?: (box: { minX: number; minY: number; maxX: number; maxY: number }) => void;
  /** Clears a box selection; returns true if there was one. */
  onClearBoxSelection?: () => boolean;
  /** Deletes a box selection; returns true if there was one to delete. */
  onDeleteBoxSelection?: () => boolean;
  /** Ctrl/Cmd+A: select every part and wire. */
  onSelectAll?: () => void;
  /** Ctrl/Cmd+C, Ctrl/Cmd+V and Ctrl/Cmd+D (duplicate). */
  onCopySelection?: () => void;
  onPasteClipboard?: () => void;
  onDuplicateSelection?: () => void;
  beginPan: (x: number, y: number) => void;
  updatePan: (x: number, y: number) => void;
  endPan: () => void;
  zoomAt: (delta: number, x: number, y: number, bounds: DOMRect) => void;
}

const DRAG_THRESHOLD = 5;
const INITIAL_WIRE_COMMIT_DRAG_THRESHOLD = 12;
const DOUBLE_CLICK_MS = 350;
const DOUBLE_CLICK_SLOP = 8;

/** A wire's bends as free bends: free wires as they are, older wires' corners made explicit. */
function freeWaypointsOf(wire: WorldWireNode) {
  return materializeWaypoints(wire.fromPoint, wire.toPoint, wire.waypoints, wire.routing);
}

export function useInteractionManager({
  containerRef: externalContainerRef,
  scene,
  transform,
  selectedComponentId,
  selectedWireId,
  onSelectComponent,
  onSelectWire,
  onMoveComponent,
  onCommitComponentMove,
  onTapComponent,
  onRotateComponent,
  onDeleteComponent,
  onDeleteWire,
  onAddWire,
  onRewireWireEndpoint,
  onPreviewWireWaypoints,
  onCommitWireWaypoints,
  onBoxSelect,
  onClearBoxSelection,
  onDeleteBoxSelection,
  onSelectAll,
  onCopySelection,
  onPasteClipboard,
  onDuplicateSelection,
  beginPan,
  updatePan,
  endPan,
  zoomAt,
}: InteractionManagerOptions) {
  const [mode, setMode] = useState<InteractionMode>({ type: 'IDLE' });
  const [hoveredHit, setHoveredHit] = useState<HitResult>(null);
  const fallbackContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = externalContainerRef ?? fallbackContainerRef;
  const activePointerIdRef = useRef<number | null>(null);
  const wireJustStartedRef = useRef(false);
  const dragFrameRef = useRef<number | null>(null);
  const wireFrameRef = useRef<number | null>(null);
  const pendingDragRef = useRef<{ id: string; position: Point; meta: DragMoveMeta } | null>(null);
  const pendingWireRef = useRef<{
    previewPoint: Point;
    targetPinId: string | null;
    targetNodeId: string | null;
    targetLockState: WireTargetLockState | null;
    crowdedTargets: boolean;
    previewAxis: WireIntentAxis;
  } | null>(null);
  const bendEditRef = useRef<BendEdit | null>(null);
  const lastPointerDownRef = useRef<{ time: number; clientX: number; clientY: number } | null>(null);
  /** Shift held: new and moved bends keep their segment level or upright. */
  const shiftKeyRef = useRef(false);

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const bounds = containerRef.current.getBoundingClientRect();
      return {
        x: (clientX - bounds.left - transform.x) / transform.scale,
        y: (clientY - bounds.top - transform.y) / transform.scale,
      };
    },
    [transform]
  );

  const clearScheduledFrames = useCallback(() => {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    if (wireFrameRef.current !== null) {
      cancelAnimationFrame(wireFrameRef.current);
      wireFrameRef.current = null;
    }
    pendingDragRef.current = null;
    pendingWireRef.current = null;
  }, []);

  const clearHandlePreview = useCallback(
    (wireId: string) => {
      if (bendEditRef.current?.wireId === wireId) {
        bendEditRef.current = null;
      }
      onPreviewWireWaypoints(wireId, null);
    },
    [onPreviewWireWaypoints]
  );

  /** Saves the bend edit in progress, if the pointer actually moved a bend. */
  const commitHandlePreview = useCallback(
    (wireId: string) => {
      const edit = bendEditRef.current;
      bendEditRef.current = null;
      if (!edit || edit.wireId !== wireId || !edit.preview) {
        onPreviewWireWaypoints(wireId, null);
        return;
      }
      onCommitWireWaypoints(wireId, tidyFreeWaypoints(edit.start, edit.end, edit.preview));
    },
    [onCommitWireWaypoints, onPreviewWireWaypoints]
  );

  /**
   * Saves new bends for a wire straight away (double-click to add or remove a bend). A bend just
   * added sits on the line, so adding skips the tidy-up that would remove it again.
   */
  const commitWireBends = useCallback(
    (wire: WorldWireNode, waypoints: Point[], tidy: boolean) => {
      onCommitWireWaypoints(wire.id, tidy ? tidyFreeWaypoints(wire.fromPoint, wire.toPoint, waypoints) : waypoints);
    },
    [onCommitWireWaypoints]
  );

  const resetInteraction = useCallback(() => {
    endPan();
    activePointerIdRef.current = null;
    wireJustStartedRef.current = false;
    clearScheduledFrames();
    setMode({ type: 'IDLE' });
  }, [clearScheduledFrames, endPan]);

  const scheduleDragPreview = useCallback(
    (id: string, position: Point, meta: DragMoveMeta) => {
      pendingDragRef.current = { id, position, meta };
      if (dragFrameRef.current !== null) {
        return;
      }

      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const pending = pendingDragRef.current;
        if (!pending) {
          return;
        }
        onMoveComponent(pending.id, pending.position, pending.meta);
      });
    },
    [onMoveComponent]
  );

  const scheduleWirePreview = useCallback((
    previewPoint: Point,
    targetPinId: string | null,
    targetNodeId: string | null,
    targetLockState: WireTargetLockState | null,
    crowdedTargets: boolean,
    previewAxis: WireIntentAxis
  ) => {
    pendingWireRef.current = {
      previewPoint,
      targetPinId,
      targetNodeId,
      targetLockState,
      crowdedTargets,
      previewAxis,
    };
    if (wireFrameRef.current !== null) {
      return;
    }

    wireFrameRef.current = requestAnimationFrame(() => {
      wireFrameRef.current = null;
      const pending = pendingWireRef.current;
      if (!pending) {
        return;
      }

      setMode((previous) =>
        previous.type === 'DRAWING_WIRE' || previous.type === 'REWIRING_WIRE_ENDPOINT'
          ? {
              ...previous,
              previewPoint: pending.previewPoint,
              hoveredTargetPinId: pending.targetPinId,
              hoveredTargetNodeId: pending.targetNodeId,
              targetLockState: pending.targetLockState,
              crowdedTargets: pending.crowdedTargets,
              previewAxis: pending.previewAxis,
            }
          : previous
      );
      const targetPin = pending.targetPinId ? scene.pinById[pending.targetPinId] : null;
      setHoveredHit(targetPin ? { type: 'pin', pin: targetPin } : null);
    });
  }, [scene.pinById]);

  const releasePointerCapture = useCallback((target: HTMLDivElement, pointerId: number) => {
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
  }, []);

  const resolveWireTargetFromContext = useCallback((worldPoint: Point, context: ActiveWireContext) => {
    return resolveBiasedPinTarget(scene, worldPoint, transform.scale, {
      excludeNodeId: context.sourceNodeId,
      sourcePinId: context.sourcePinId,
      sourcePoint: context.sourcePoint,
      previousTargetPinId: context.previousTargetPinId,
    });
  }, [scene, transform.scale]);

  const getActiveWireContext = useCallback((currentMode: InteractionMode): ActiveWireContext | null => {
    if (currentMode.type === 'DRAWING_WIRE') {
      return {
        sourceNodeId: currentMode.fromNodeId,
        sourcePinId: currentMode.fromPinId,
        sourcePoint: currentMode.fromPoint,
        previousTargetPinId: currentMode.hoveredTargetPinId,
        lastPoint: currentMode.bends[currentMode.bends.length - 1] ?? currentMode.fromPoint,
      };
    }

    if (currentMode.type === 'REWIRING_WIRE_ENDPOINT') {
      const neighbour =
        currentMode.routing === 'free'
          ? currentMode.endpoint === 'from'
            ? currentMode.waypoints[0]
            : currentMode.waypoints[currentMode.waypoints.length - 1]
          : undefined;
      return {
        sourceNodeId: currentMode.fixedNodeId,
        sourcePinId: currentMode.fixedPinId,
        sourcePoint: currentMode.fixedPoint,
        previousTargetPinId: currentMode.hoveredTargetPinId,
        lastPoint: neighbour ?? currentMode.fixedPoint,
      };
    }

    return null;
  }, []);

  const updateWirePreviewFromClient = useCallback(
    (clientX: number, clientY: number, context: ActiveWireContext) => {
      const worldPoint = screenToWorld(clientX, clientY);
      const effectiveContext = pendingWireRef.current?.targetPinId
        ? { ...context, previousTargetPinId: pendingWireRef.current.targetPinId }
        : context;
      const target = resolveWireTargetFromContext(worldPoint, effectiveContext);
      const loosePoint = shiftKeyRef.current ? constrainToAxis(context.lastPoint, worldPoint) : worldPoint;
      scheduleWirePreview(
        target?.pin.position ?? loosePoint,
        target?.pin.id ?? null,
        target?.pin.nodeId ?? null,
        target?.lockState ?? null,
        target?.crowded ?? false,
        target?.axis ?? 'free'
      );
      return target;
    },
    [resolveWireTargetFromContext, scheduleWirePreview, screenToWorld]
  );

  const completeWire = useCallback(
    (request: WireConnectionRequest, eventTarget?: HTMLDivElement, pointerId?: number) => {
      onAddWire(request);
      setHoveredHit(null);
      if (eventTarget && typeof pointerId === 'number') {
        releasePointerCapture(eventTarget, pointerId);
      }
      resetInteraction();
    },
    [onAddWire, releasePointerCapture, resetInteraction]
  );

  useEffect(() => {
    return () => clearScheduledFrames();
  }, [clearScheduledFrames]);

  const activeWireContext = useMemo(() => getActiveWireContext(mode), [getActiveWireContext, mode]);

  const resolveInteractiveHit = useCallback((worldPoint: Point) => {
    const selectedWire = selectedWireId ? scene.wireById[selectedWireId] : null;
    const baseHit = hitTestScene(scene, worldPoint, transform.scale, selectedWire, selectedComponentId);

    if (baseHit?.type !== 'pin') {
      return baseHit;
    }

    const previousTargetPinId = hoveredHit?.type === 'pin' ? hoveredHit.pin.id : null;
    const biasedTarget = resolveBiasedPinTarget(scene, worldPoint, transform.scale, { previousTargetPinId });
    return biasedTarget ? ({ type: 'pin', pin: biasedTarget.pin } as HitResult) : baseHit;
  }, [hoveredHit, scene, selectedComponentId, selectedWireId, transform.scale]);

  useEffect(() => {
    if (!activeWireContext) {
      return;
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      shiftKeyRef.current = event.shiftKey;
      updateWirePreviewFromClient(event.clientX, event.clientY, activeWireContext);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    return () => window.removeEventListener('pointermove', handleWindowPointerMove);
  }, [activeWireContext, updateWirePreviewFromClient]);

  /** Starts moving a bend, or pulling a segment into a new bend once the pointer moves. */
  const beginBendEdit = useCallback(
    (wire: WorldWireNode, edit: { waypointIndex: number | null; insertSegmentIndex: number | null }, clientX: number, clientY: number) => {
      bendEditRef.current = {
        wireId: wire.id,
        start: wire.fromPoint,
        end: wire.toPoint,
        baseWaypoints: freeWaypointsOf(wire),
        waypointIndex: edit.waypointIndex,
        insertSegmentIndex: edit.insertSegmentIndex,
        preview: null,
      };
      setMode({ type: 'MOVING_WIRE_HANDLE', wireId: wire.id, startClient: { x: clientX, y: clientY }, moved: false });
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      activePointerIdRef.current = e.pointerId;
      shiftKeyRef.current = e.shiftKey;
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }

      const worldPoint = screenToWorld(e.clientX, e.clientY);
      const hit = resolveInteractiveHit(worldPoint);

      if (e.button === 2 && (mode.type === 'DRAWING_WIRE' || mode.type === 'REWIRING_WIRE_ENDPOINT')) {
        setHoveredHit(null);
        releasePointerCapture(e.currentTarget, e.pointerId);
        resetInteraction();
        e.preventDefault();
        return;
      }

      if (mode.type === 'DRAWING_WIRE' && e.button === 0) {
        const target = resolveWireTargetFromContext(worldPoint, {
          sourceNodeId: mode.fromNodeId,
          sourcePinId: mode.fromPinId,
          sourcePoint: mode.fromPoint,
          previousTargetPinId: mode.hoveredTargetPinId,
          lastPoint: mode.bends[mode.bends.length - 1] ?? mode.fromPoint,
        });
        if (target) {
          completeWire(
            {
              fromNodeId: mode.fromNodeId,
              toNodeId: target.pin.nodeId,
              fromPinId: mode.fromPinId,
              toPinId: target.pin.id,
              waypoints: mode.bends,
            },
            e.currentTarget,
            e.pointerId
          );
          return;
        }

        // Clicking empty canvas while drawing places a bend (Esc or right-click cancels).
        const lastPoint = mode.bends[mode.bends.length - 1] ?? mode.fromPoint;
        const bend = placeBendPoint(worldPoint, lastPoint, e.shiftKey);
        if (Math.hypot(bend.x - lastPoint.x, bend.y - lastPoint.y) > 0.5) {
          setMode((previous) =>
            previous.type === 'DRAWING_WIRE' ? { ...previous, bends: [...previous.bends, bend], previewPoint: bend } : previous
          );
        }
        return;
      }

      if (e.button === 1) {
        setMode({ type: 'PANNING', startClient: { x: e.clientX, y: e.clientY }, origin: { x: transform.x, y: transform.y } });
        beginPan(e.clientX, e.clientY);
        return;
      }

      if (e.button !== 0) {
        return;
      }

      const previousDown = lastPointerDownRef.current;
      const isDoubleClick =
        previousDown !== null &&
        e.timeStamp - previousDown.time <= DOUBLE_CLICK_MS &&
        Math.hypot(e.clientX - previousDown.clientX, e.clientY - previousDown.clientY) <= DOUBLE_CLICK_SLOP;
      lastPointerDownRef.current = isDoubleClick ? null : { time: e.timeStamp, clientX: e.clientX, clientY: e.clientY };

      if (isDoubleClick) {
        // Double-click a bend to remove it; double-click a wire to add a bend there.
        if (hit?.type === 'wire-handle' && hit.handle.kind === 'elbow') {
          const wire = scene.wireById[hit.handle.wireId];
          if (wire) {
            clearHandlePreview(wire.id);
            const waypoints = freeWaypointsOf(wire);
            const index = wire.routing === 'free' ? hit.handle.waypointIndex : (hit.handle.routeIndex ?? 1) - 1;
            commitWireBends(wire, removeBend(waypoints, index), true);
            onSelectWire(wire.id);
            resetInteraction();
            return;
          }
        }

        const wire =
          hit?.type === 'wire-segment' || hit?.type === 'wire'
            ? hit.wire
            : hit?.type === 'wire-handle' && hit.handle.kind === 'segment'
              ? scene.wireById[hit.handle.wireId]
              : null;
        if (wire) {
          clearHandlePreview(wire.id);
          const waypoints = freeWaypointsOf(wire);
          const route = buildRoutePoints(wire.fromPoint, wire.toPoint, waypoints, 'free');
          const segmentIndex = nearestSegmentIndex(route, worldPoint);
          commitWireBends(wire, insertBend(waypoints, segmentIndex, placeBendPoint(worldPoint, null, false)).waypoints, false);
          onSelectWire(wire.id);
          onSelectComponent(null);
          resetInteraction();
          return;
        }
      }

      if (hit?.type === 'wire-handle') {
        const wire = scene.wireById[hit.handle.wireId];
        if (!wire) {
          return;
        }

        onSelectWire(hit.handle.wireId);
        onSelectComponent(null);

        if (hit.handle.kind === 'endpoint' && hit.handle.endpoint) {
          const isFromEndpoint = hit.handle.endpoint === 'from';
          bendEditRef.current = null;
          setHoveredHit(hit);
          setMode({
            type: 'REWIRING_WIRE_ENDPOINT',
            wireId: hit.handle.wireId,
            endpoint: hit.handle.endpoint,
            fixedPoint: isFromEndpoint ? wire.toPoint : wire.fromPoint,
            fixedNodeId: isFromEndpoint ? wire.toNodeId : wire.fromNodeId,
            fixedPinId: isFromEndpoint ? wire.toAnchorId ?? wire.toNodeId : wire.fromAnchorId ?? wire.fromNodeId,
            previewPoint: hit.handle.position,
            hoveredTargetNodeId: null,
            hoveredTargetPinId: null,
            targetLockState: null,
            crowdedTargets: false,
            previewAxis: 'free',
            routing: wire.routing,
            waypoints: wire.waypoints,
          });
          return;
        }

        if (hit.handle.kind === 'elbow') {
          const waypointIndex = wire.routing === 'free' ? hit.handle.waypointIndex : (hit.handle.routeIndex ?? 1) - 1;
          beginBendEdit(wire, { waypointIndex, insertSegmentIndex: null }, e.clientX, e.clientY);
          return;
        }

        // Mid-segment grip: pull to make a new bend there.
        const route = buildRoutePoints(wire.fromPoint, wire.toPoint, freeWaypointsOf(wire), 'free');
        beginBendEdit(wire, { waypointIndex: null, insertSegmentIndex: nearestSegmentIndex(route, hit.handle.position) }, e.clientX, e.clientY);
        return;
      }

      if (hit?.type === 'pin') {
        onSelectComponent(hit.pin.componentId ?? null);
        onSelectWire(null);
        wireJustStartedRef.current = true;
        setHoveredHit(hit);
        setMode({
          type: 'DRAWING_WIRE',
          fromPinId: hit.pin.id,
          fromNodeId: hit.pin.nodeId,
          fromPoint: hit.pin.position,
          previewPoint: hit.pin.position,
          hoveredTargetNodeId: null,
          hoveredTargetPinId: null,
          targetLockState: null,
          crowdedTargets: false,
          previewAxis: 'free',
          bends: [],
        });
        return;
      }

      if (hit?.type === 'component') {
        onSelectComponent(hit.component.id);
        onSelectWire(null);
        setMode({
          type: 'DRAGGING_COMPONENT',
          componentId: hit.component.id,
          startClient: { x: e.clientX, y: e.clientY },
          origin: { x: hit.component.position.x, y: hit.component.position.y },
          moved: false,
        });
        return;
      }

      if (hit?.type === 'wire-segment' || hit?.type === 'wire') {
        const wire = hit.wire;
        if (selectedWireId === wire.id) {
          // Pulling the selected wire bends it where it was grabbed (a click alone changes nothing).
          const route = buildRoutePoints(wire.fromPoint, wire.toPoint, freeWaypointsOf(wire), 'free');
          beginBendEdit(wire, { waypointIndex: null, insertSegmentIndex: nearestSegmentIndex(route, worldPoint) }, e.clientX, e.clientY);
          return;
        }

        onSelectWire(wire.id);
        onSelectComponent(null);
        return;
      }

      // Empty canvas: clear the selection and start a selection box (a click alone just clears).
      onSelectComponent(null);
      onSelectWire(null);
      onClearBoxSelection?.();
      setMode({ type: 'SELECTING_BOX', startClient: { x: e.clientX, y: e.clientY }, startWorld: worldPoint, currentWorld: worldPoint, moved: false });
    },
    [
      beginBendEdit,
      beginPan,
      clearHandlePreview,
      commitWireBends,
      completeWire,
      mode,
      onClearBoxSelection,
      onSelectComponent,
      onSelectWire,
      releasePointerCapture,
      resetInteraction,
      resolveInteractiveHit,
      resolveWireTargetFromContext,
      scene,
      screenToWorld,
      selectedWireId,
      transform.x,
      transform.y,
    ]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const worldPoint = screenToWorld(e.clientX, e.clientY);
      shiftKeyRef.current = e.shiftKey;

      if (mode.type === 'IDLE') {
        setHoveredHit(resolveInteractiveHit(worldPoint));
        return;
      }

      if (mode.type === 'PANNING') {
        updatePan(e.clientX, e.clientY);
        return;
      }

      if (mode.type === 'SELECTING_BOX') {
        const moved = mode.moved || Math.hypot(e.clientX - mode.startClient.x, e.clientY - mode.startClient.y) > DRAG_THRESHOLD;
        setMode((previous) => (previous.type === 'SELECTING_BOX' ? { ...previous, currentWorld: worldPoint, moved } : previous));
        return;
      }

      if (mode.type === 'DRAGGING_COMPONENT') {
        const dragDistance = Math.hypot(e.clientX - mode.startClient.x, e.clientY - mode.startClient.y);
        if (!mode.moved && dragDistance <= DRAG_THRESHOLD) {
          return;
        }

        if (!mode.moved) {
          setMode((previous) => (previous.type === 'DRAGGING_COMPONENT' ? { ...previous, moved: true } : previous));
        }

        const dx = (e.clientX - mode.startClient.x) / transform.scale;
        const dy = (e.clientY - mode.startClient.y) / transform.scale;
        scheduleDragPreview(mode.componentId, { x: mode.origin.x + dx, y: mode.origin.y + dy }, {
          client: { x: e.clientX, y: e.clientY },
          moved: true,
        });
        return;
      }

      if (mode.type === 'DRAWING_WIRE') {
        updateWirePreviewFromClient(e.clientX, e.clientY, {
          sourceNodeId: mode.fromNodeId,
          sourcePinId: mode.fromPinId,
          sourcePoint: mode.fromPoint,
          previousTargetPinId: mode.hoveredTargetPinId,
          lastPoint: mode.bends[mode.bends.length - 1] ?? mode.fromPoint,
        });
        return;
      }

      if (mode.type === 'REWIRING_WIRE_ENDPOINT') {
        const context = getActiveWireContext(mode);
        if (context) {
          updateWirePreviewFromClient(e.clientX, e.clientY, context);
        }
        return;
      }

      if (mode.type === 'MOVING_WIRE_HANDLE') {
        const edit = bendEditRef.current;
        if (!edit || edit.wireId !== mode.wireId) return;

        if (!mode.moved) {
          if (Math.hypot(e.clientX - mode.startClient.x, e.clientY - mode.startClient.y) <= DRAG_THRESHOLD) {
            return;
          }
          setMode((previous) => (previous.type === 'MOVING_WIRE_HANDLE' ? { ...previous, moved: true } : previous));
        }

        if (edit.waypointIndex === null && edit.insertSegmentIndex !== null) {
          const inserted = insertBend(edit.baseWaypoints, edit.insertSegmentIndex, placeBendPoint(worldPoint, null, false));
          edit.baseWaypoints = inserted.waypoints;
          edit.waypointIndex = inserted.waypointIndex;
          edit.insertSegmentIndex = null;
        }
        if (edit.waypointIndex === null) return;

        const nextWaypoints = moveBend(edit.start, edit.baseWaypoints, edit.waypointIndex, worldPoint, e.shiftKey);
        edit.preview = nextWaypoints;
        onPreviewWireWaypoints(mode.wireId, nextWaypoints);
      }
    },
    [getActiveWireContext, mode, onPreviewWireWaypoints, resolveInteractiveHit, scheduleDragPreview, screenToWorld, transform.scale, updatePan, updateWirePreviewFromClient]
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (mode.type === 'DRAGGING_COMPONENT') {
        if (mode.moved) {
          const dx = (e.clientX - mode.startClient.x) / transform.scale;
          const dy = (e.clientY - mode.startClient.y) / transform.scale;
          const finalPosition = { x: mode.origin.x + dx, y: mode.origin.y + dy };
          onCommitComponentMove?.(mode.componentId, finalPosition, {
            client: { x: e.clientX, y: e.clientY },
            moved: true,
          });
        } else {
          onTapComponent?.(mode.componentId);
        }

        releasePointerCapture(e.currentTarget, e.pointerId);
        resetInteraction();
        return;
      }

      if (mode.type === 'REWIRING_WIRE_ENDPOINT') {
        const worldPoint = screenToWorld(e.clientX, e.clientY);
        const context = getActiveWireContext(mode);
        const target = context ? resolveWireTargetFromContext(worldPoint, context) : null;

        if (target) {
          onRewireWireEndpoint({
            wireId: mode.wireId,
            endpoint: mode.endpoint,
            targetNodeId: target.pin.nodeId,
            targetPinId: target.pin.id,
            targetPoint: target.pin.position,
          });
        }

        releasePointerCapture(e.currentTarget, e.pointerId);
        resetInteraction();
        return;
      }

      if (mode.type === 'DRAWING_WIRE') {
        const worldPoint = screenToWorld(e.clientX, e.clientY);
        const target = resolveWireTargetFromContext(worldPoint, {
          sourceNodeId: mode.fromNodeId,
          sourcePinId: mode.fromPinId,
          sourcePoint: mode.fromPoint,
          previousTargetPinId: mode.hoveredTargetPinId,
          lastPoint: mode.bends[mode.bends.length - 1] ?? mode.fromPoint,
        });

        if (wireJustStartedRef.current) {
          wireJustStartedRef.current = false;
          const initialDragDistance = Math.hypot(
            (worldPoint.x - mode.fromPoint.x) * transform.scale,
            (worldPoint.y - mode.fromPoint.y) * transform.scale
          );
          if (target && initialDragDistance >= INITIAL_WIRE_COMMIT_DRAG_THRESHOLD) {
            completeWire(
              {
                fromNodeId: mode.fromNodeId,
                toNodeId: target.pin.nodeId,
                fromPinId: mode.fromPinId,
                toPinId: target.pin.id,
                waypoints: mode.bends,
              },
              e.currentTarget,
              e.pointerId
            );
            return;
          }

          // Released away from a pin: keep drawing; clicks now place bends or finish on a pin.
          setMode((previous) =>
            previous.type === 'DRAWING_WIRE'
              ? {
                  ...previous,
                  previewPoint: worldPoint,
                  hoveredTargetPinId: null,
                  hoveredTargetNodeId: null,
                  targetLockState: null,
                  crowdedTargets: false,
                  previewAxis: 'free',
                }
              : previous
          );
          setHoveredHit(null);
        }

        releasePointerCapture(e.currentTarget, e.pointerId);
        return;
      }

      if (mode.type === 'SELECTING_BOX') {
        if (mode.moved) {
          const end = screenToWorld(e.clientX, e.clientY);
          onBoxSelect?.({
            minX: Math.min(mode.startWorld.x, end.x),
            minY: Math.min(mode.startWorld.y, end.y),
            maxX: Math.max(mode.startWorld.x, end.x),
            maxY: Math.max(mode.startWorld.y, end.y),
          });
        }
        releasePointerCapture(e.currentTarget, e.pointerId);
        resetInteraction();
        return;
      }

      if (mode.type === 'MOVING_WIRE_HANDLE') {
        if (mode.moved) {
          commitHandlePreview(mode.wireId);
        } else {
          clearHandlePreview(mode.wireId);
        }
        releasePointerCapture(e.currentTarget, e.pointerId);
        resetInteraction();
        return;
      }

      releasePointerCapture(e.currentTarget, e.pointerId);
      resetInteraction();
    },
    [clearHandlePreview, commitHandlePreview, completeWire, getActiveWireContext, mode, onBoxSelect, onCommitComponentMove, onRewireWireEndpoint, onTapComponent, releasePointerCapture, resetInteraction, resolveWireTargetFromContext, screenToWorld, transform.scale]
  );

  const handlePointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (mode.type === 'MOVING_WIRE_HANDLE') {
        clearHandlePreview(mode.wireId);
      }
      releasePointerCapture(e.currentTarget, e.pointerId);
      setHoveredHit(null);
      resetInteraction();
    },
    [clearHandlePreview, mode, releasePointerCapture, resetInteraction]
  );

  const handleWheel = useCallback(
    (e: ReactWheelEvent) => {
      if (!containerRef.current) return;
      zoomAt(e.deltaY, e.clientX, e.clientY, containerRef.current.getBoundingClientRect());
    },
    [zoomAt]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl+Z / Cmd+Z — circuit undo
      if (ctrlOrCmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        useCircuitStore.getState().undo();
        return;
      }
      // Ctrl+Y / Cmd+Shift+Z — circuit redo
      if ((ctrlOrCmd && e.key.toLowerCase() === 'y') || (ctrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        useCircuitStore.getState().redo();
        return;
      }

      if (ctrlOrCmd && e.key.toLowerCase() === 'a' && onSelectAll) {
        e.preventDefault();
        onSelectAll();
        return;
      }
      if (ctrlOrCmd && e.key.toLowerCase() === 'c' && onCopySelection) {
        onCopySelection();
        return;
      }
      if (ctrlOrCmd && e.key.toLowerCase() === 'v' && onPasteClipboard) {
        e.preventDefault();
        onPasteClipboard();
        return;
      }
      if (ctrlOrCmd && e.key.toLowerCase() === 'd' && onDuplicateSelection) {
        e.preventDefault();
        onDuplicateSelection();
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'escape') {
        e.preventDefault();
        if (mode.type === 'IDLE' && onClearBoxSelection?.()) {
          return;
        }
        if (mode.type === 'MOVING_WIRE_HANDLE') {
          clearHandlePreview(mode.wireId);
          setHoveredHit(null);
          resetInteraction();
          return;
        }

        if (mode.type === 'DRAWING_WIRE' || mode.type === 'REWIRING_WIRE_ENDPOINT' || mode.type === 'DRAGGING_COMPONENT' || mode.type === 'PANNING') {
          setHoveredHit(null);
          resetInteraction();
          return;
        }

        if (selectedWireId) {
          onSelectWire(null);
          setHoveredHit(null);
          return;
        }

        setHoveredHit(null);
        resetInteraction();
        return;
      }
      if (key === 'r' && selectedComponentId && !ctrlOrCmd) {
        e.preventDefault();
        // R turns clockwise, Shift+R anticlockwise.
        onRotateComponent(selectedComponentId, e.shiftKey ? -1 : 1);
      }
      if (key === 'backspace' && mode.type === 'DRAWING_WIRE') {
        // While drawing, Backspace takes back the last bend instead of deleting anything.
        e.preventDefault();
        setMode((previous) => {
          if (previous.type !== 'DRAWING_WIRE' || previous.bends.length === 0) return previous;
          return { ...previous, bends: previous.bends.slice(0, -1) };
        });
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        if (mode.type === 'IDLE' && onDeleteBoxSelection?.()) {
          e.preventDefault();
          return;
        }
        if (selectedComponentId) {
          e.preventDefault();
          onDeleteComponent(selectedComponentId);
        } else if (selectedWireId) {
          e.preventDefault();
          if (mode.type === 'MOVING_WIRE_HANDLE' && mode.wireId === selectedWireId) {
            clearHandlePreview(selectedWireId);
          }
          onDeleteWire(selectedWireId);
          onSelectWire(null);
          setHoveredHit(null);
          resetInteraction();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    clearHandlePreview,
    mode,
    onClearBoxSelection,
    onDeleteBoxSelection,
    onDeleteComponent,
    onDeleteWire,
    onRotateComponent,
    onSelectAll,
    onCopySelection,
    onPasteClipboard,
    onDuplicateSelection,
    onSelectWire,
    resetInteraction,
    selectedComponentId,
    selectedWireId,
  ]);

  const cancelWireDrawing = useCallback(() => {
    if (mode.type === 'DRAWING_WIRE' || mode.type === 'REWIRING_WIRE_ENDPOINT') {
      setHoveredHit(null);
      resetInteraction();
    }
  }, [mode.type, resetInteraction]);

  return {
    mode,
    hoveredHit,
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleWheel,
    cancelWireDrawing,
  };
}




