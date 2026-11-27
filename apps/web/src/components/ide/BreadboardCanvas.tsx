"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CircuitBoard, CopyPlus, Lightbulb, Monitor, Palette, RotateCcw, RotateCw, Spline, Trash2, Zap, X } from 'lucide-react';

import type { ComponentData, NetData } from '@/contexts/CircuitContext';
import { useCircuitStore } from '@/stores/circuitStore';
import { selectCircuitLabSimulationView, useSimulationStore } from '@/stores/simulationStore';
import { useShallow } from 'zustand/react/shallow';
import { useSplitViewEventBus } from './split-view/SplitViewEventBus';
import { useCircuitComponentRegistry } from '@/hooks/useCircuitComponentRegistry';
import {
  createDefaultComponentState,
  getComponentDefinition,
  getComponentMountClassifications,
  normalizeComponentType,
  type ComponentCategory,
  type ComponentDefinition,
} from '@/lib/wiring/componentDefinitions';
import type { CircuitComponentCatalogEntry } from '@/lib/wiring/circuitComponentCatalogTypes';
import { GRID_PITCH } from '@/lib/wiring/componentGeometry';
import {
  getRenderedSize,
  type Point,
} from '@/lib/wiring/componentGeometry';
import {
  createMountedPlacement,
  getBreadboardMountPreview,
} from '@/lib/wiring/breadboardMounting';

import CanvasEngine from './circuit-lab/CanvasEngine';
import ComponentPreview from './circuit-lab/ComponentPreview';
import { ComponentContextMenu } from './circuit-lab/ComponentContextMenu';
import { PartProperties } from './circuit-lab/PartProperties';
import InteractionManager from './circuit-lab/InteractionManager';
import { buildSceneGraph, type WireWaypointOverride } from './circuit-lab/sceneModel';
import type { MountPreviewState } from './circuit-lab/sceneTypes';
import { useCanvasViewport } from './circuit-lab/useCanvasViewport';
import { useInteractionManager, type WireConnectionRequest } from './circuit-lab/useInteractionManager';
import { buildOrthogonalWaypoints, buildWireRoutePoints } from './circuit-lab/wireRouting';
import { WIRE_COLOR_OPTIONS, chooseNewWireColor, getWireColorName, type WireEndKind } from '@/lib/wiring/wireColors';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

const DEFAULT_VIEWPORT = { x: -72, y: -28, scale: 0.98 };

/** Copied parts and the wires between them (shared by every canvas on the page). */
let circuitClipboard: { components: ComponentData[]; nets: NetData[]; pasteCount: number } | null = null;

/** Rewrites a node id that belongs to a copied part ("<old>.<pin>") to the pasted part. */
function remapNodeId(nodeId: string | null | undefined, idMap: Map<string, string>) {
  if (!nodeId) return nodeId;
  const dot = nodeId.indexOf('.');
  if (dot <= 0) return nodeId;
  const mapped = idMap.get(nodeId.slice(0, dot));
  return mapped ? `${mapped}${nodeId.slice(dot)}` : nodeId;
}
const COMPACT_CIRCUIT_BREAKPOINT = 1180;
const COMPACT_CIRCUIT_HEIGHT = 820;

type PaletteCategory = 'All' | ComponentCategory;
type PlacementPreviewSource = 'existing' | 'palette' | 'armed';

function getPlacementRuleText(type: string) {
  const classifications = getComponentMountClassifications(type);

  if (classifications.includes('board')) {
    return 'Place it anywhere on the canvas, then wire it up.';
  }

  if (classifications.includes('freeform-only')) {
    return 'Place it freely on the canvas, then connect it with wires.';
  }

  if (classifications.includes('trench-bridging')) {
    return 'It must bridge the center trench to mount correctly.';
  }

  if (classifications.includes('rail-allowed')) {
    return 'It can mount on the power rails or on the main strips.';
  }

  return 'It mounts on the main breadboard strips, not on the power rails.';
}

function formatPlacementReason(reason: string | undefined, type: string) {
  if (!reason) {
    return getPlacementRuleText(type);
  }

  if (reason.startsWith('Pin ') && reason.includes('not aligned')) {
    return 'Move the part until each leg lines up with a breadboard hole.';
  }

  if (reason.includes('already occupied')) {
    return 'That hole is already in use. Try a different spot.';
  }

  if (reason.includes('share hole')) {
    return 'Each leg needs its own hole here. Move the part to separate the pins.';
  }

  if (reason.includes('span at least')) {
    return 'Spread the part farther so it reaches the required holes.';
  }

  if (reason.includes('must mount across the breadboard trench')) {
    return 'Place it across the center gap instead of on the power rails.';
  }

  if (reason.includes('must bridge the top and bottom strips across the trench')) {
    return 'Move it so one side sits above the center gap and the other side sits below it.';
  }

  if (reason.includes('No valid breadboard mount candidate found') || reason.includes('No valid breadboard holes match this footprint')) {
    return `Try a different row, rotate it, or move it closer to matching holes. ${getPlacementRuleText(type)}`;
  }

  return reason;
}

function describePinTarget(label: string | null | undefined, kind: 'board' | 'breadboard' | 'component' | null | undefined) {
  if (!label) {
    return 'this target';
  }

  if (kind === 'breadboard') {
    return `${label} hole`;
  }

  if (kind === 'board') {
    return `${label} pin`;
  }

  return label;
}

const CATEGORY_META: Record<PaletteCategory, { label: string; icon: React.ReactNode }> = {
  All: { label: 'All', icon: <Palette size={14} /> },
  Boards: { label: 'Boards', icon: <CircuitBoard size={14} /> },
  Basic: { label: 'Basics', icon: <Lightbulb size={14} /> },
  Sensors: { label: 'Sensors', icon: <Activity size={14} /> },
  Actuators: { label: 'Motion', icon: <Zap size={14} /> },
  Displays: { label: 'Displays', icon: <Monitor size={14} /> },
};

type DragPreviewState = {
  source: PlacementPreviewSource;
  componentType: string;
  componentId: string | null;
  rawPosition: Point;
  displayPosition: Point;
  mountPreview: MountPreviewState | null;
  overTrash: boolean;
};

export default function BreadboardCanvas({
  showPalette = true,
}: {
  showPalette?: boolean;
}) {
  useEffect(() => {
    import('@wokwi/elements').catch(console.error);
  }, []);

  const components = useCircuitStore((state) => state.components);
  const nets = useCircuitStore((state) => state.nets);
  const netlist = useCircuitStore((state) => state.netlist);
  const resolvedConnections = useCircuitStore((state) => state.resolvedConnections);
  const selectedComponentId = useCircuitStore((state) => state.selectedComponentId);
  const addComponent = useCircuitStore((state) => state.addComponent);
  const addNet = useCircuitStore((state) => state.addNet);
  const removeComponent = useCircuitStore((state) => state.removeComponent);
  const removeNet = useCircuitStore((state) => state.removeNet);
  const removeItems = useCircuitStore((state) => state.removeItems);
  const addItems = useCircuitStore((state) => state.addItems);
  const setComponentProperties = useCircuitStore((state) => state.setComponentProperties);
  const rotateComponent = useCircuitStore((state) => state.rotateComponent);
  const selectComponent = useCircuitStore((state) => state.selectComponent);
  const updateComponentPosition = useCircuitStore((state) => state.updateComponentPosition);
  const moveComponentsTogether = useCircuitStore((state) => state.moveComponentsTogether);
  const updateComponentState = useCircuitStore((state) => state.updateComponentState);
  const updateNet = useCircuitStore((state) => state.updateNet);
  const simulationView = useSimulationStore(useShallow(selectCircuitLabSimulationView));
  const eventBus = useSplitViewEventBus();
  const componentRegistry = useCircuitComponentRegistry();
  const circuitData = useMemo(() => ({ components, nets }), [components, nets]);

  const { transform, isPanning, beginPan, updatePan, endPan, zoomAt, setTransform } = useCanvasViewport(
    DEFAULT_VIEWPORT
  );

  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [wireWaypointOverrides, setWireWaypointOverrides] = useState<Record<string, WireWaypointOverride>>({});
  /** Parts and wires picked by dragging a selection box on empty canvas. */
  const [boxSelection, setBoxSelection] = useState<{ componentIds: string[]; wireIds: string[] } | null>(null);
  /** The colour the learner last picked; new wires use it (until then they follow kit convention). */
  const [lastPickedWireColor, setLastPickedWireColor] = useState<string | null>(null);
  const [isPaletteVisible, setIsPaletteVisible] = useState(showPalette);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [activeCategory, setActiveCategory] = useState<PaletteCategory>('All');
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);
  const [recentlyCreatedWireId, setRecentlyCreatedWireId] = useState<string | null>(null);
  const [recentlyConnectedPinId, setRecentlyConnectedPinId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const trashRef = useRef<HTMLDivElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const recentWireTimeoutRef = useRef<number | null>(null);
  const recentPinTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const updateViewportMode = () => {
      if (typeof window === 'undefined') {
        return;
      }

      setIsCompactViewport(window.innerWidth < COMPACT_CIRCUIT_BREAKPOINT || window.innerHeight < COMPACT_CIRCUIT_HEIGHT);
    };

    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);
    return () => window.removeEventListener('resize', updateViewportMode);
  }, []);

  useEffect(() => {
    setIsPaletteVisible(isCompactViewport ? false : showPalette);
  }, [isCompactViewport, showPalette]);

  useEffect(() => {
    if (selectedWireId && !circuitData.nets.some((net) => net.id === selectedWireId)) {
      setSelectedWireId(null);
    }

    setWireWaypointOverrides((current) => {
      const activeIds = new Set(circuitData.nets.map((net) => net.id));
      let changed = false;
      const next = Object.fromEntries(
        Object.entries(current).filter(([wireId]) => {
          const keep = activeIds.has(wireId);
          if (!keep) {
            changed = true;
          }
          return keep;
        })
      ) as Record<string, WireWaypointOverride>;

      return changed ? next : current;
    });
  }, [circuitData.nets, selectedWireId]);

  useEffect(() => {
    return () => {
      if (recentWireTimeoutRef.current !== null) {
        window.clearTimeout(recentWireTimeoutRef.current);
      }
      if (recentPinTimeoutRef.current !== null) {
        window.clearTimeout(recentPinTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      setDragPreview((current) => {
        if (current?.source === 'armed') {
          event.preventDefault();
          return null;
        }

        return current;
      });
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, []);

  const draggedComponentId = dragPreview?.source === 'existing' ? dragPreview.componentId : null;
  // Parts plugged into the breadboard being dragged. They ride along with it; their holes are
  // stored by name (not position), so moving them by the same amount keeps them plugged in.
  const carriedComponents = useMemo(() => {
    const dragged = draggedComponentId ? components.find((component) => component.id === draggedComponentId) : null;
    if (!dragged || getComponentDefinition(dragged.type)?.id !== 'BREADBOARD') {
      return [];
    }
    return components.filter((component) => component.id !== dragged.id && component.mountedPlacement?.mounted);
  }, [components, draggedComponentId]);

  // Box-selected ids that still exist (undo or a delete elsewhere can remove them).
  const boxSelectedComponentIds = useMemo(() => {
    if (!boxSelection) return undefined;
    const existing = new Set(components.map((component) => component.id));
    return new Set(boxSelection.componentIds.filter((id) => existing.has(id)));
  }, [boxSelection, components]);
  const boxSelectedWireIds = useMemo(() => {
    if (!boxSelection) return undefined;
    const existing = new Set(nets.map((net) => net.id));
    return new Set(boxSelection.wireIds.filter((id) => existing.has(id)));
  }, [boxSelection, nets]);
  const boxSelectionCount = (boxSelectedComponentIds?.size ?? 0) + (boxSelectedWireIds?.size ?? 0);

  const sceneOptions = useMemo(() => {
    let positionOverrides: Record<string, Point> | undefined;
    if (dragPreview?.source === 'existing' && dragPreview.componentId) {
      positionOverrides = { [dragPreview.componentId]: dragPreview.displayPosition };
      const dragged = components.find((component) => component.id === dragPreview.componentId);
      if (dragged && carriedComponents.length > 0) {
        const dx = dragPreview.displayPosition.x - dragged.x;
        const dy = dragPreview.displayPosition.y - dragged.y;
        carriedComponents.forEach((component) => {
          positionOverrides![component.id] = { x: component.x + dx, y: component.y + dy };
        });
      }
    }

    return {
      selectedComponentId,
      selectedWireId,
      selectedComponentIds: boxSelectedComponentIds,
      hoveredComponentId,
      hoveredWireId,
      draggingComponentId: draggedComponentId,
      wireWaypointOverrides:
        Object.keys(wireWaypointOverrides).length > 0 ? wireWaypointOverrides : undefined,
      positionOverrides,
    };
  }, [
    carriedComponents,
    components,
    dragPreview,
    draggedComponentId,
    hoveredComponentId,
    hoveredWireId,
    boxSelectedComponentIds,
    selectedComponentId,
    selectedWireId,
    wireWaypointOverrides,
  ]);

  const scene = useMemo(
    () => buildSceneGraph(circuitData, simulationView, netlist, resolvedConnections, sceneOptions),
    [circuitData, simulationView, netlist, resolvedConnections, sceneOptions]
  );

  const isClientOverTrash = useCallback((clientPoint: Point) => {
    const bounds = trashRef.current?.getBoundingClientRect();
    if (!bounds) {
      return false;
    }

    return (
      clientPoint.x >= bounds.left &&
      clientPoint.x <= bounds.right &&
      clientPoint.y >= bounds.top &&
      clientPoint.y <= bounds.bottom
    );
  }, []);

  const resolveCanvasPlacement = useCallback(
    (type: string, clientX?: number, clientY?: number) => {
      const definition = getComponentDefinition(type);
      if (!definition) {
        return null;
      }

      const renderedSize = getRenderedSize(definition.size);
      const canvasBounds = canvasContainerRef.current?.getBoundingClientRect();
      const hasPointerPosition = typeof clientX === 'number' && typeof clientY === 'number' && canvasBounds;

      const rawPosition = hasPointerPosition
        ? {
            x: Math.round((clientX - canvasBounds.left - transform.x) / transform.scale - renderedSize.width / 2),
            y: Math.round((clientY - canvasBounds.top - transform.y) / transform.scale - renderedSize.height / 2),
          }
        : {
            x: Math.round((-(transform.x) + ((canvasBounds?.width ?? 640) * 0.56)) / transform.scale - renderedSize.width / 2),
            y: Math.round((-(transform.y) + ((canvasBounds?.height ?? 480) * 0.5)) / transform.scale - renderedSize.height / 2),
          };

      return {
        definition,
        renderedSize,
        rawPosition,
      };
    },
    [canvasContainerRef, transform.scale, transform.x, transform.y]
  );

  const buildPlacementPreview = useCallback(
    (type: string, componentId: string, rawPosition: Point, rotation = 0) => {
      const definition = getComponentDefinition(type);
      if (!definition) {
        return null;
      }

      const preview = getBreadboardMountPreview(
        { id: componentId, type },
        {
          x: rawPosition.x,
          y: rawPosition.y,
          rotation,
        },
        circuitData.components
      );

      if (!preview) {
        return null;
      }

      return {
        componentId,
        footprintClass: preview.footprintClass,
        position: preview.position,
        rawPosition,
        size: getRenderedSize(definition.size),
        rotation,
        matchedAnchors: preview.matchedAnchors,
        groupHighlights: preview.groupHighlights,
        isValid: preview.isValid,
        reason: preview.reason,
        mappedPins: preview.mappedPins,
      } satisfies MountPreviewState;
    },
    [circuitData.components]
  );

  const buildMountPreview = useCallback(
    (componentId: string, rawPosition: Point) => {
      const component = circuitData.components.find((candidate) => candidate.id === componentId);
      if (!component) {
        return null;
      }

      return buildPlacementPreview(component.type, componentId, rawPosition, component.rotation || 0);
    },
    [buildPlacementPreview, circuitData.components]
  );

  const updateDragPreview = useCallback(
    (componentId: string, rawPosition: Point, clientPoint: Point) => {
      const component = circuitData.components.find((candidate) => candidate.id === componentId);
      if (!component) {
        return;
      }

      const mountPreview = buildPlacementPreview(component.type, componentId, rawPosition, component.rotation || 0);
      setDragPreview({
        source: 'existing',
        componentType: component.type,
        componentId,
        rawPosition,
        displayPosition: mountPreview?.isValid ? mountPreview.position : rawPosition,
        mountPreview,
        overTrash: isClientOverTrash(clientPoint),
      });
    },
    [buildPlacementPreview, circuitData.components, isClientOverTrash]
  );

  const updateInsertionPreview = useCallback(
    (source: Exclude<PlacementPreviewSource, 'existing'>, componentType: string, clientX?: number, clientY?: number) => {
      const placement = resolveCanvasPlacement(componentType, clientX, clientY);
      if (!placement) {
        return;
      }

      const previewId = `${source}-preview-${componentType.toLowerCase()}`;
      const mountPreview = buildPlacementPreview(componentType, previewId, placement.rawPosition, 0);
      setDragPreview({
        source,
        componentType,
        componentId: null,
        rawPosition: placement.rawPosition,
        displayPosition: mountPreview?.isValid ? mountPreview.position : placement.rawPosition,
        mountPreview,
        overTrash: false,
      });
    },
    [buildPlacementPreview, resolveCanvasPlacement]
  );

  const updatePaletteDragPreview = useCallback(
    (componentType: string, clientX: number, clientY: number) => {
      updateInsertionPreview('palette', componentType, clientX, clientY);
    },
    [updateInsertionPreview]
  );

  const clearPaletteDragPreview = useCallback(() => {
    setDragPreview((current) => (current?.source === 'palette' ? null : current));
  }, []);

  const clearArmedInsertionPreview = useCallback(() => {
    setDragPreview((current) => (current?.source === 'armed' ? null : current));
  }, []);

  const resolveNodePoint = useCallback(
    (nodeId: string, preferredPinId?: string | null) => {
      const preferredPin = preferredPinId ? scene.pinById[preferredPinId] : null;
      if (preferredPin?.nodeId === nodeId) {
        return preferredPin.position;
      }

      const fallbackPin = scene.pinsByNodeId[nodeId]?.[0] ?? null;
      return fallbackPin?.position ?? null;
    },
    [scene.pinById, scene.pinsByNodeId]
  );

  /** Power, ground or anything else, for the default colour of a new wire. */
  const getWireEndKind = useCallback(
    (nodeId: string, pinId?: string | null): WireEndKind => {
      const pin = (pinId ? scene.pinById[pinId] : null) ?? scene.pinsByNodeId[nodeId]?.[0] ?? null;
      if (pin?.type === 'ground' || /_MINUS_/.test(nodeId)) return 'ground';
      if (pin?.type === 'power' || /_PLUS_/.test(nodeId)) return 'power';
      return 'other';
    },
    [scene.pinById, scene.pinsByNodeId]
  );

  const nextWireColorFor = useCallback(
    (fromNodeId: string, fromPinId: string | null, toNodeId?: string | null, toPinId?: string | null) => {
      const ends = [getWireEndKind(fromNodeId, fromPinId)];
      if (toNodeId) ends.push(getWireEndKind(toNodeId, toPinId));
      return chooseNewWireColor(ends, lastPickedWireColor);
    },
    [getWireEndKind, lastPickedWireColor]
  );

  const handleAddWire = useCallback(
    ({ fromNodeId, toNodeId, fromPinId, toPinId, waypoints }: WireConnectionRequest) => {
      if (fromNodeId === toNodeId) {
        return;
      }

      const fromPoint = resolveNodePoint(fromNodeId, fromPinId);
      const toPoint = resolveNodePoint(toNodeId, toPinId);
      if (!fromPoint || !toPoint) {
        return;
      }

      const wireId = `net-${Date.now()}`;
      addNet({
        id: wireId,
        from: fromNodeId,
        to: toNodeId,
        fromNodeId,
        toNodeId,
        fromAnchorId: fromPinId,
        toAnchorId: toPinId,
        color: nextWireColorFor(fromNodeId, fromPinId, toNodeId, toPinId),
        // Straight through the bends the learner clicked (none: a straight wire).
        waypoints: waypoints ?? [],
        routing: 'free',
      });
      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
      setSelectedWireId(wireId);
      setRecentlyCreatedWireId(wireId);
      setRecentlyConnectedPinId(toPinId);
      selectComponent(null);

      if (recentWireTimeoutRef.current !== null) {
        window.clearTimeout(recentWireTimeoutRef.current);
      }
      if (recentPinTimeoutRef.current !== null) {
        window.clearTimeout(recentPinTimeoutRef.current);
      }

      recentWireTimeoutRef.current = window.setTimeout(() => setRecentlyCreatedWireId(null), 650);
      recentPinTimeoutRef.current = window.setTimeout(() => setRecentlyConnectedPinId(null), 900);
    },
    [addNet, eventBus, nextWireColorFor, resolveNodePoint, selectComponent]
  );

  const deleteBoxSelection = useCallback(() => {
    if (!boxSelection || boxSelectionCount === 0) return false;
    removeItems(Array.from(boxSelectedComponentIds ?? []), Array.from(boxSelectedWireIds ?? []));
    eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
    setBoxSelection(null);
    return true;
  }, [boxSelectedComponentIds, boxSelectedWireIds, boxSelection, boxSelectionCount, eventBus, removeItems]);

  /** Copies the selected part, or the box selection, with the wires running between copied parts. */
  const copySelection = useCallback(() => {
    const ids = boxSelectedComponentIds?.size ? Array.from(boxSelectedComponentIds) : selectedComponentId ? [selectedComponentId] : [];
    // Boards and the breadboard are one-per-circuit, so they are never copied.
    const copied = components.filter(
      (component) => ids.includes(component.id) && getComponentDefinition(component.type)?.footprint?.type !== 'board'
    );
    if (copied.length === 0) return false;
    const copiedIds = new Set(copied.map((component) => component.id));
    const ownedByCopied = (nodeId: string) => copiedIds.has(nodeId.slice(0, Math.max(0, nodeId.indexOf('.'))));
    const copiedNets = nets.filter((net) => ownedByCopied(net.fromNodeId ?? net.from) && ownedByCopied(net.toNodeId ?? net.to));
    circuitClipboard = { components: copied, nets: copiedNets, pasteCount: 0 };
    return true;
  }, [boxSelectedComponentIds, components, nets, selectedComponentId]);

  /** Pastes the clipboard a little down and to the right each time, and selects what was pasted. */
  const pasteClipboard = useCallback(() => {
    const clipboard = circuitClipboard;
    if (!clipboard) return;
    clipboard.pasteCount += 1;
    const offset = GRID_PITCH * 3 * clipboard.pasteCount;
    const stamp = Date.now();
    const idMap = new Map<string, string>();
    const pastedComponents = clipboard.components.map((component, index) => {
      const id = `${normalizeComponentType(component.type).toLowerCase()}-${stamp}-${index}`;
      idMap.set(component.id, id);
      return { ...component, id, x: component.x + offset, y: component.y + offset, mountedPlacement: null, state: { ...(component.state ?? {}) } };
    });
    const pastedNets = clipboard.nets.map((net, index) => ({
      ...net,
      id: `net-${stamp}-${index}`,
      from: remapNodeId(net.from, idMap) ?? net.from,
      to: remapNodeId(net.to, idMap) ?? net.to,
      fromNodeId: remapNodeId(net.fromNodeId, idMap) ?? undefined,
      toNodeId: remapNodeId(net.toNodeId, idMap) ?? undefined,
      fromAnchorId: remapNodeId(net.fromAnchorId, idMap) ?? null,
      toAnchorId: remapNodeId(net.toAnchorId, idMap) ?? null,
      waypoints: net.waypoints?.map((point) => ({ x: point.x + offset, y: point.y + offset })),
    }));
    addItems(pastedComponents, pastedNets);
    eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
    selectComponent(null);
    setSelectedWireId(null);
    setBoxSelection({ componentIds: pastedComponents.map((component) => component.id), wireIds: pastedNets.map((net) => net.id) });
  }, [addItems, eventBus, selectComponent]);

  const duplicateSelection = useCallback(() => {
    if (copySelection()) pasteClipboard();
  }, [copySelection, pasteClipboard]);

  const interaction = useInteractionManager({
    containerRef: canvasContainerRef,
    scene,
    transform,
    selectedComponentId,
    selectedWireId,
    onSelectComponent: (id) => {
      selectComponent(id);
      setBoxSelection(null);
      if (id) {
        setSelectedWireId(null);
      }
    },
    onSelectWire: (id) => {
      setSelectedWireId(id);
      setBoxSelection(null);
      if (id) {
        selectComponent(null);
      }
    },
    onBoxSelect: (box) => {
      // Everything wholly inside the box. The breadboard only when it is boxed in completely too,
      // so boxing parts on the board does not take the board with them.
      const inside = (point: Point) => point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
      const componentIds = scene.components
        .filter((node) => inside({ x: node.bounds.minX, y: node.bounds.minY }) && inside({ x: node.bounds.maxX, y: node.bounds.maxY }))
        .map((node) => node.id);
      const wireIds = scene.wires.filter((wire) => wire.points.every(inside)).map((wire) => wire.id);
      setBoxSelection(componentIds.length + wireIds.length > 0 ? { componentIds, wireIds } : null);
    },
    onClearBoxSelection: () => {
      if (!boxSelection) return false;
      setBoxSelection(null);
      return boxSelectionCount > 0;
    },
    onDeleteBoxSelection: () => deleteBoxSelection(),
    onCopySelection: () => {
      copySelection();
    },
    onPasteClipboard: pasteClipboard,
    onDuplicateSelection: duplicateSelection,
    onSelectAll: () => {
      selectComponent(null);
      setSelectedWireId(null);
      const componentIds = scene.components.filter((node) => node.definition.id !== 'BREADBOARD').map((node) => node.id);
      const wireIds = scene.wires.map((wire) => wire.id);
      setBoxSelection(componentIds.length + wireIds.length > 0 ? { componentIds, wireIds } : null);
    },
    onMoveComponent: (id, pos, meta) => {
      updateDragPreview(id, pos, meta.client);
    },
    onCommitComponentMove: (id, pos, meta) => {
      const preview = dragPreview?.source === 'existing' && dragPreview.componentId === id ? dragPreview : null;
      if (preview?.overTrash || isClientOverTrash(meta.client)) {
        removeComponent(id);
        eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
        selectComponent(null);
        setSelectedWireId(null);
        setDragPreview(null);
        return;
      }

      const component = circuitData.components.find((candidate) => candidate.id === id);
      const definition = getComponentDefinition(component?.type || '');
      if (component && definition?.id === 'BREADBOARD' && carriedComponents.length > 0) {
        const dx = pos.x - component.x;
        const dy = pos.y - component.y;
        moveComponentsTogether([
          { id, x: pos.x, y: pos.y },
          ...carriedComponents.map((carried) => ({ id: carried.id, x: carried.x + dx, y: carried.y + dy })),
        ]);
      } else if (component && definition) {
        const mountedPreview = preview?.mountPreview ?? buildMountPreview(id, pos);
        if (mountedPreview?.isValid) {
          updateComponentPosition(
            id,
            mountedPreview.position.x,
            mountedPreview.position.y,
            createMountedPlacement(id, component.rotation || 0, mountedPreview)
          );
        } else {
          updateComponentPosition(id, pos.x, pos.y, null);
        }
      } else {
        updateComponentPosition(id, pos.x, pos.y, null);
      }

      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
      setDragPreview(null);
    },
    onTapComponent: (id) => {
      const component = circuitData.components.find((candidate) => candidate.id === id);
      const definition = getComponentDefinition(component?.type || '');
      if (!component) {
        return;
      }
      const simulating = simulationView.running || simulationView.ready;

      // A slide switch keeps its position, so a click slides it whether or not the simulation runs.
      if (definition?.simulation?.type === 'slide-switch') {
        setComponentProperties(id, { value: Number(component.state?.value ?? 0) === 1 ? 0 : 1 });
        eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
        return;
      }
      if (!simulating) {
        return;
      }
      if (definition?.simulation?.type === 'button') {
        updateComponentState(id, (previousState) => ({
          ...previousState,
          pressed: !Boolean(previousState?.pressed),
        }));
      } else if (definition?.simulation?.type === 'pir') {
        // Click the PIR sensor to wave in front of it; click again to stop.
        updateComponentState(id, (previousState) => ({
          ...previousState,
          motion: !Boolean(previousState?.motion),
        }));
      }
    },
    onRotateComponent: (id, direction) => {
      rotateComponent(id, direction);
      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
    },
    onDeleteComponent: (id) => {
      removeComponent(id);
      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
    },
    onDeleteWire: (id) => {
      removeNet(id);
      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
    },
    onAddWire: handleAddWire,
    onRewireWireEndpoint: ({ wireId, endpoint, targetNodeId, targetPinId, targetPoint }) => {
      const wire = scene.wireById[wireId];
      if (!wire) {
        return;
      }

      // A free wire keeps its bends when an end moves; an older wire is re-routed at right angles.
      const nextWaypoints =
        wire.routing === 'free'
          ? wire.waypoints
          : endpoint === 'from'
            ? buildOrthogonalWaypoints(targetPoint, wire.toPoint)
            : buildOrthogonalWaypoints(wire.fromPoint, targetPoint);

      updateNet(
        wireId,
        endpoint === 'from'
          ? {
              from: targetNodeId,
              fromNodeId: targetNodeId,
              fromAnchorId: targetPinId,
              waypoints: nextWaypoints,
            }
          : {
              to: targetNodeId,
              toNodeId: targetNodeId,
              toAnchorId: targetPinId,
              waypoints: nextWaypoints,
            }
      );
      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
    },
    onPreviewWireWaypoints: (id, waypoints) => {
      setWireWaypointOverrides((current) => {
        if (waypoints === null) {
          if (!(id in current)) {
            return current;
          }

          const next = { ...current };
          delete next[id];
          return next;
        }

        return {
          ...current,
          [id]: { waypoints, routing: 'free' },
        };
      });
    },
    onCommitWireWaypoints: (id, waypoints) => {
      setWireWaypointOverrides((current) => {
        if (!(id in current)) {
          return current;
        }

        const next = { ...current };
        delete next[id];
        return next;
      });
      // Any bend edit turns an older right-angle wire into a free wire (its corners become bends).
      updateNet(id, { waypoints, routing: 'free' });
      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
    },
    beginPan,
    updatePan,
    endPan,
    zoomAt,
  });

  useEffect(() => {
    if (interaction.mode.type !== 'DRAGGING_COMPONENT') {
      setDragPreview((current) => (current?.source === 'existing' ? null : current));
    }
  }, [interaction.mode.type]);

  useEffect(() => {
    if (interaction.hoveredHit?.type === 'pin') {
      setHoveredPinId(interaction.hoveredHit.pin.id);
      setHoveredComponentId(interaction.hoveredHit.pin.componentId ?? null);
      setHoveredWireId(null);
      return;
    }

    if (interaction.hoveredHit?.type === 'component') {
      setHoveredPinId(null);
      setHoveredComponentId(interaction.hoveredHit.component.id);
      setHoveredWireId(null);
      return;
    }

    if (interaction.hoveredHit?.type === 'wire-handle') {
      setHoveredPinId(null);
      setHoveredComponentId(null);
      setHoveredWireId(interaction.hoveredHit.handle.wireId);
      return;
    }

    if (interaction.hoveredHit?.type === 'wire-segment' || interaction.hoveredHit?.type === 'wire') {
      setHoveredPinId(null);
      setHoveredComponentId(null);
      setHoveredWireId(interaction.hoveredHit.wire.id);
      return;
    }

    setHoveredPinId(null);
    setHoveredComponentId(null);
    setHoveredWireId(null);
  }, [interaction.hoveredHit]);

  const placedSingletonTypes = useMemo(() => {
    const types = new Set<string>();
    components.forEach((component) => {
      const entry = componentRegistry.getEntry(component.type);
      if (entry?.singleton) {
        types.add(entry.id);
      }
    });
    return types;
  }, [componentRegistry, components]);

  const paletteItems = useMemo(() => {
    return componentRegistry
      .getEntries({ placeableOnly: true })
      .map((entry) => {
        const definition = getComponentDefinition(entry.previewSourceKey) ?? getComponentDefinition(entry.id);
        if (!definition) {
          return null;
        }

        return {
          entry,
          definition,
          alreadyPlaced: entry.singleton && placedSingletonTypes.has(entry.id),
        };
      })
      .filter((item): item is { entry: CircuitComponentCatalogEntry; definition: ComponentDefinition; alreadyPlaced: boolean } => Boolean(item));
  }, [componentRegistry, placedSingletonTypes]);

  const groupedPalette = useMemo<Record<ComponentCategory, typeof paletteItems>>(
    () =>
      componentRegistry.getCategories({ placeableOnly: true }).reduce((groups, category) => {
        groups[category] = paletteItems.filter((item) => item.entry.category === category);
        return groups;
      }, { Boards: [], Basic: [], Sensors: [], Actuators: [], Displays: [] } as Record<ComponentCategory, typeof paletteItems>),
    [componentRegistry, paletteItems]
  );
  const categoryTabs = useMemo(
    () => ['All', ...componentRegistry.getCategories({ placeableOnly: true }).filter((category) => groupedPalette[category]?.length > 0)] as PaletteCategory[],
    [componentRegistry, groupedPalette]
  );
  const visiblePaletteItems = useMemo(
    () => (activeCategory === 'All' ? paletteItems : groupedPalette[activeCategory] ?? []),
    [activeCategory, groupedPalette, paletteItems]
  );

  const handleResetView = useCallback(() => {
    setTransform(DEFAULT_VIEWPORT);
  }, [setTransform]);

  const handleZoomFit = useCallback(() => {
    const bounds = canvasContainerRef.current?.getBoundingClientRect();
    if (!bounds || scene.components.length === 0) {
      setTransform(DEFAULT_VIEWPORT);
      return;
    }

    const worldBounds = scene.components.reduce(
      (accumulator, component) => ({
        minX: Math.min(accumulator.minX, component.bounds.minX),
        minY: Math.min(accumulator.minY, component.bounds.minY),
        maxX: Math.max(accumulator.maxX, component.bounds.maxX),
        maxY: Math.max(accumulator.maxY, component.bounds.maxY),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      }
    );

    const padding = 72;
    const width = Math.max(worldBounds.maxX - worldBounds.minX, 120);
    const height = Math.max(worldBounds.maxY - worldBounds.minY, 120);
    const scale = Math.max(
      0.4,
      Math.min(
        1.8,
        Math.min((bounds.width - padding * 2) / width, (bounds.height - padding * 2) / height)
      )
    );

    setTransform({
      scale,
      x: bounds.width / 2 - ((worldBounds.minX + worldBounds.maxX) / 2) * scale,
      y: bounds.height / 2 - ((worldBounds.minY + worldBounds.maxY) / 2) * scale,
    });
  }, [canvasContainerRef, scene.components, setTransform]);

  const isPlacementPreviewVisible = dragPreview?.source === 'palette' || dragPreview?.source === 'armed';

  const cursor = useMemo(() => {
    if (isPanning) return 'grabbing';
    if (isPlacementPreviewVisible) return dragPreview?.mountPreview && !dragPreview.mountPreview.isValid ? 'not-allowed' : 'copy';
    if (interaction.mode.type === 'DRAWING_WIRE' || interaction.mode.type === 'REWIRING_WIRE_ENDPOINT') return 'crosshair';
    if (interaction.mode.type === 'DRAGGING_COMPONENT') return 'grabbing';
    if (interaction.hoveredHit?.type === 'pin') return 'crosshair';
    if (interaction.hoveredHit?.type === 'component') return 'grab';
    if (interaction.hoveredHit?.type === 'wire-handle') {
      if (interaction.hoveredHit.handle.kind === 'endpoint') {
        return 'crosshair';
      }
      if (interaction.hoveredHit.handle.axis === 'both') {
        return 'move';
      }
      return interaction.hoveredHit.handle.axis === 'x' ? 'ew-resize' : 'ns-resize';
    }
    return 'default';
  }, [dragPreview, interaction.hoveredHit, interaction.mode.type, isPanning, isPlacementPreviewVisible]);

  const highlightedPinIds = useMemo(() => {
    const ids = new Set<string>();
    if (hoveredPinId) {
      ids.add(hoveredPinId);
    }
    if (interaction.mode.type === 'DRAWING_WIRE') {
      ids.add(interaction.mode.fromPinId);
    }
    if (interaction.mode.type === 'REWIRING_WIRE_ENDPOINT') {
      ids.add(interaction.mode.fixedPinId);
    }
    return ids;
  }, [hoveredPinId, interaction.mode]);

  const focusSingletonComponent = useCallback(
    (type: string) => {
      const entry = componentRegistry.getEntry(type);
      if (!entry?.singleton) {
        return false;
      }

      const existing = components.find((component) => componentRegistry.getEntry(component.type)?.id === entry.id);
      if (!existing) {
        return false;
      }

      selectComponent(existing.id);
      setSelectedWireId(null);
      return true;
    },
    [componentRegistry, components, selectComponent]
  );

  const createComponentAtClient = useCallback(
    (type: string, clientX?: number, clientY?: number, snapToBreadboard = true) => {
      if (focusSingletonComponent(type)) {
        return;
      }

      const placement = resolveCanvasPlacement(type, clientX, clientY);
      if (!placement) return;

      const id = `${type.toLowerCase()}-${Date.now()}`;
      const mountPreview = snapToBreadboard
        ? buildPlacementPreview(type, id, placement.rawPosition, 0)
        : null;
      const finalPosition = mountPreview?.isValid ? mountPreview.position : placement.rawPosition;

      const component: ComponentData = {
        id,
        type,
        x: finalPosition.x,
        y: finalPosition.y,
        rotation: 0,
        state: createDefaultComponentState(type),
        mountedPlacement: createMountedPlacement(id, 0, mountPreview ?? { isValid: false, footprintClass: 'freeform' }),
      };
      addComponent(component);
      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
      selectComponent(id);
      setSelectedWireId(null);
    },
    [addComponent, buildPlacementPreview, eventBus, focusSingletonComponent, resolveCanvasPlacement, selectComponent]
  );

  const beginComponentInsertion = useCallback(
    (type: string) => {
      if (focusSingletonComponent(type)) {
        clearArmedInsertionPreview();
        if (isCompactViewport) {
          setIsPaletteVisible(false);
        }
        return;
      }

      if (dragPreview?.source === 'armed' && dragPreview.componentType === type) {
        clearArmedInsertionPreview();
        return;
      }

      updateInsertionPreview('armed', type);
      selectComponent(null);
      setSelectedWireId(null);
      if (isCompactViewport) {
        setIsPaletteVisible(false);
      }
    },
    [clearArmedInsertionPreview, dragPreview, focusSingletonComponent, isCompactViewport, selectComponent, updateInsertionPreview]
  );

  const handleCanvasPointerMoveCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragPreview?.source !== 'armed') {
        return;
      }

      updateInsertionPreview('armed', dragPreview.componentType, event.clientX, event.clientY);
    },
    [dragPreview, updateInsertionPreview]
  );

  const handleCanvasPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragPreview?.source !== 'armed' || event.button !== 0) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target?.closest('[data-canvas-root]')) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      createComponentAtClient(dragPreview.componentType, event.clientX, event.clientY, true);
      clearArmedInsertionPreview();
    },
    [clearArmedInsertionPreview, createComponentAtClient, dragPreview]
  );

  const handleDragOverCanvas = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const componentType = event.dataTransfer.getData('componentType');
      if (componentType) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        updatePaletteDragPreview(componentType, event.clientX, event.clientY);
      }
    },
    [updatePaletteDragPreview]
  );

  const handleDragLeaveCanvas = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
        return;
      }
      clearPaletteDragPreview();
    },
    [clearPaletteDragPreview]
  );

  const handleDropOnCanvas = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const componentType = event.dataTransfer.getData('componentType');
      if (!componentType) {
        return;
      }

      event.preventDefault();
      createComponentAtClient(componentType, event.clientX, event.clientY, true);
      clearPaletteDragPreview();
    },
    [clearPaletteDragPreview, createComponentAtClient]
  );

  const handlePaletteDragEnd = useCallback(() => {
    clearPaletteDragPreview();
  }, [clearPaletteDragPreview]);

  const palettePreviewDefinition = useMemo(
    () => (dragPreview?.source === 'palette' || dragPreview?.source === 'armed' ? getComponentDefinition(dragPreview.componentType) : null),
    [dragPreview]
  );

  const palettePreviewTransform = useMemo(
    () => ({
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
      transformOrigin: '0 0',
    }),
    [transform.scale, transform.x, transform.y]
  );

  const selectedComponentNode = useMemo(
    () => (selectedComponentId ? scene.componentById[selectedComponentId] ?? null : null),
    [scene.componentById, selectedComponentId]
  );

  const selectedWire = useMemo(
    () => (selectedWireId ? scene.wireById[selectedWireId] ?? null : null),
    [scene.wireById, selectedWireId]
  );

  const isCanvasEmpty = circuitData.components.length === 0;

  const visiblePinTargetIds = useMemo(() => {
    const ids = new Set<string>();

    const addPin = (pinId: string | null | undefined) => {
      if (pinId) {
        ids.add(pinId);
      }
    };

    if (interaction.mode.type === 'DRAWING_WIRE' || interaction.mode.type === 'REWIRING_WIRE_ENDPOINT') {
      scene.pins.forEach((pin) => {
        if (pin.kind !== 'breadboard') {
          ids.add(pin.id);
        }
      });
    } else if (interaction.mode.type !== 'DRAGGING_COMPONENT') {
      // While a part is being dragged its pin dots are hidden: redrawing them at a new position
      // on every pointer move was a large share of the drag's cost. They return on drop.
      scene.pins.forEach((pin) => {
        if (pin.kind === 'breadboard') {
          return;
        }

        if (pin.componentId && (pin.componentId === selectedComponentId || pin.componentId === hoveredComponentId)) {
          ids.add(pin.id);
        }
      });

      addPin(selectedWire?.fromAnchorId);
      addPin(selectedWire?.toAnchorId);
    }

    highlightedPinIds.forEach((pinId) => ids.add(pinId));
    if (hoveredPinId) {
      ids.add(hoveredPinId);
    }

    return ids;
  }, [highlightedPinIds, hoveredComponentId, hoveredPinId, interaction.mode.type, scene.pins, selectedComponentId, selectedWire?.fromAnchorId, selectedWire?.toAnchorId]);

  const interactionMode = useMemo(() => {
    if (isPlacementPreviewVisible && dragPreview) {
      const isValid = dragPreview.mountPreview ? dragPreview.mountPreview.isValid : true;
      return {
        label: 'Placing',
        detail: isValid ? 'Locked' : 'Adjust',
        tone: isValid ? 'placing' as const : 'invalid' as const,
      };
    }

    if (interaction.mode.type === 'DRAWING_WIRE' || interaction.mode.type === 'REWIRING_WIRE_ENDPOINT') {
      const isLocked = interaction.mode.targetLockState === 'locked';
      return {
        label: 'Wiring',
        detail: interaction.mode.hoveredTargetPinId ? (isLocked ? 'Locked' : 'Snap ready') : 'Choose target',
        tone: isLocked ? 'valid' as const : 'wiring' as const,
      };
    }

    if (selectedComponentNode && selectedComponentNode.definition.id !== 'BREADBOARD') {
      return {
        label: selectedComponentNode.definition.name,
        detail: 'Selected',
        tone: 'selection' as const,
      };
    }

    if (selectedWire) {
      return {
        label: 'Wire',
        detail: 'Selected',
        tone: 'selection' as const,
      };
    }

    return null;
  }, [dragPreview, interaction.mode, isPlacementPreviewVisible, selectedComponentNode, selectedWire]);

  const interactionGuide = useMemo(() => {
    if (isPlacementPreviewVisible && dragPreview?.mountPreview && !dragPreview.mountPreview.isValid) {
      return {
        title: 'Try another spot',
        status: 'Invalid placement',
        tone: 'invalid' as const,
        description: formatPlacementReason(dragPreview.mountPreview.reason, dragPreview.componentType),
        action: '',
      };
    }

    return null;
  }, [dragPreview, isPlacementPreviewVisible]);

  const selectionOverlay = useMemo(() => {
    if (isPlacementPreviewVisible || interaction.mode.type === 'DRAWING_WIRE' || interaction.mode.type === 'REWIRING_WIRE_ENDPOINT') {
      return null;
    }
    if (selectedComponentNode && selectedComponentNode.definition.id !== 'BREADBOARD') {
      const centerX = ((selectedComponentNode.bounds.minX + selectedComponentNode.bounds.maxX) / 2) * transform.scale + transform.x;
      const topY = selectedComponentNode.bounds.minY * transform.scale + transform.y;
      return {
        type: 'component' as const,
        left: centerX,
        top: topY - 16,
        label: selectedComponentNode.definition.name,
      };
    }

    if (selectedWire && interaction.mode.type !== 'MOVING_WIRE_HANDLE') {
      // Sit clear of the wire: above its highest point, or below its lowest when there is no room above.
      const xs = selectedWire.points.map((point) => point.x);
      const ys = selectedWire.points.map((point) => point.y);
      const centerX = ((Math.min(...xs) + Math.max(...xs)) / 2) * transform.scale + transform.x;
      const topY = Math.min(...ys) * transform.scale + transform.y - 18;
      const bottomY = Math.max(...ys) * transform.scale + transform.y + 18;
      const placeBelow = topY < 72;

      return {
        type: 'wire' as const,
        left: centerX,
        top: placeBelow ? bottomY : topY,
        placement: placeBelow ? ('below' as const) : ('above' as const),
        label: `${getWireColorName(selectedWire.color)} wire`,
      };
    }

    return null;
  }, [interaction.mode.type, isPlacementPreviewVisible, selectedComponentNode, selectedWire, transform.scale, transform.x, transform.y]);

  const handleApplyWireColor = useCallback(
    (color: string) => {
      setLastPickedWireColor(color);
      if (!selectedWireId) {
        return;
      }

      updateNet(selectedWireId, { color });
      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
    },
    [eventBus, selectedWireId, updateNet]
  );

  /** Removes every bend: the wire runs straight from pin to pin. */
  const handleStraightenSelectedWire = useCallback(() => {
    if (!selectedWireId) {
      return;
    }

    updateNet(selectedWireId, { waypoints: [], routing: 'free' });
    eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
  }, [eventBus, selectedWireId, updateNet]);

  const handleRotateSelected = useCallback((direction: 1 | -1 = 1) => {
    if (!selectedComponentId) {
      return;
    }

    rotateComponent(selectedComponentId, direction);
    eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
  }, [eventBus, rotateComponent, selectedComponentId]);

  const handleUpdateSelectedPart = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedComponentId) return;
      setComponentProperties(selectedComponentId, patch);
      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
    },
    [eventBus, selectedComponentId, setComponentProperties]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (selectedComponentId && !isPaletteVisible) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  }, [selectedComponentId, isPaletteVisible]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedWireId) {
      removeNet(selectedWireId);
      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
      setSelectedWireId(null);
      return;
    }

    if (selectedComponentId) {
      removeComponent(selectedComponentId);
      eventBus.emit('USER_EDITED', { source: 'circuit', timestamp: Date.now() });
      selectComponent(null);
    }
  }, [eventBus, removeComponent, removeNet, selectComponent, selectedComponentId, selectedWireId]);

  return (
    <div className="relative flex h-full w-full overflow-hidden rounded-[18px] bg-[color:var(--cl-bg)] font-sans selection:bg-cyan-400/20 sm:rounded-[24px]">
      {isCompactViewport && isPaletteVisible ? (
        <button
          type="button"
          aria-label="Close parts drawer"
          onClick={() => setIsPaletteVisible(false)}
          className="absolute inset-0 z-[220] bg-black/35 backdrop-blur-[1px]"
        />
      ) : null}
      <aside
        className={cn(
          'flex h-full shrink-0 overflow-hidden bg-[linear-gradient(180deg,var(--cl-drawer-from)_0%,var(--cl-drawer-to)_100%)] transition-[width,opacity,transform] duration-200 ease-out',
          isCompactViewport
            ? isPaletteVisible
              ? 'absolute inset-y-3 left-3 z-[230] w-[min(340px,calc(100%-1.5rem))] rounded-[20px] border border-white/10 opacity-100 shadow-[0_28px_68px_-36px_rgba(2,6,23,0.95)]'
              : 'pointer-events-none absolute inset-y-3 left-3 z-[230] w-[min(340px,calc(100%-1.5rem))] -translate-x-4 rounded-[20px] border border-white/0 opacity-0'
            : isPaletteVisible
              ? 'relative z-[200] w-[320px] border-r border-white/8 opacity-100'
              : 'pointer-events-none relative z-[200] w-0 border-r-0 opacity-0'
        )}
      >
        <div className="flex h-full min-h-0 w-full">
          <div className="flex w-[60px] shrink-0 flex-col items-center gap-2 border-r border-white/8 bg-[color:var(--cl-raised)] px-2 py-3">
            {categoryTabs.map((category) => {
              const meta = CATEGORY_META[category];
              const isActive = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  title={meta.label}
                  onClick={() => setActiveCategory(category)}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-[16px] border transition-all duration-150',
                    isActive
                      ? 'border-cyan-300/24 bg-cyan-300/10 text-cyan-100 shadow-[0_14px_28px_-22px_rgba(34,211,238,0.7)]'
                      : 'border-white/8 bg-white/[0.02] text-white/55 hover:border-white/14 hover:bg-white/[0.05] hover:text-white/82'
                  )}
                >
                  {meta.icon}
                </button>
              );
            })}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-white/8 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-white/55">Parts Drawer</div>
                  <div className="mt-1 text-[1.05rem] font-semibold text-white/90">{activeCategory === 'All' ? CATEGORY_META.All.label : componentRegistry.getCategoryLabel(activeCategory)}</div>
                  <div className="mt-2 max-w-[220px] text-[11px] leading-4 text-white/60">
                    Drag a part to place it, or click a part and then click exactly where you want it to go.
                  </div>
                  {dragPreview?.source === 'armed' && palettePreviewDefinition ? (
                    <div className="mt-3 inline-flex items-center rounded-full border border-cyan-300/24 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                      Placing {palettePreviewDefinition.name}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                  {visiblePaletteItems.length}
                </div>
              </div>
            </div>

            <div className="custom-scrollbar flex-1 overflow-x-hidden overflow-y-auto px-3 py-3">
              <div className="grid grid-cols-2 gap-2">
                {visiblePaletteItems.map((item) => {
                  const isArmed = dragPreview?.source === 'armed' && dragPreview.componentType === item.entry.id;
                  const description = item.alreadyPlaced ? 'Already on the canvas. Click to select it.' : item.entry.description;
                  return (
                  <button
                    key={item.entry.id}
                    data-testid={`palette-item-${item.entry.id}`}
                    data-palette-item={item.entry.id}
                    data-armed={String(Boolean(dragPreview?.source === 'armed' && dragPreview.componentType === item.entry.id))}
                    aria-pressed={dragPreview?.source === 'armed' && dragPreview.componentType === item.entry.id}
                    draggable={!item.alreadyPlaced}
                    onDragStart={(event) => {
                      if (item.alreadyPlaced) {
                        event.preventDefault();
                        return;
                      }

                      clearArmedInsertionPreview();
                      event.dataTransfer.setData('componentType', item.entry.id);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDragEnd={handlePaletteDragEnd}
                    onClick={() => {
                      if (item.alreadyPlaced) {
                        focusSingletonComponent(item.entry.id);
                        return;
                      }

                      beginComponentInsertion(item.entry.id);
                    }}
                    title={description}
                    className={cn(
                      'group flex min-w-0 flex-col gap-2 rounded-[14px] border bg-[linear-gradient(180deg,var(--cl-card-from)_0%,var(--cl-card-to)_100%)] p-2 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-cyan-300/18 hover:bg-[linear-gradient(180deg,var(--cl-card-hover-from)_0%,var(--cl-card-hover-to)_100%)]',
                      isArmed ? 'border-cyan-300/40' : 'border-white/[0.06]'
                    )}
                  >
                    <div className="relative flex h-[72px] w-full items-center justify-center rounded-[10px] border border-white/8 bg-[radial-gradient(circle_at_50%_35%,var(--cl-tile-glow),var(--cl-tile-bg)_74%)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <ComponentPreview definition={item.definition} className="h-full w-full" />
                      {isArmed ? (
                        <span className="absolute right-1 top-1 rounded-full border border-cyan-300/28 bg-[#0d2a33] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-100">Placing</span>
                      ) : item.alreadyPlaced ? (
                        <span className="absolute right-1 top-1 rounded-full border border-white/12 bg-[color:var(--cl-card-from)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/75">On canvas</span>
                      ) : null}
                    </div>
                    <div className="min-w-0 px-0.5 pb-0.5">
                      <div className="line-clamp-2 text-[13px] font-semibold leading-tight text-white/90">{item.entry.name}</div>
                      <div className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-white/55">{componentRegistry.getCategoryLabel(item.entry.category)}</div>
                      <span className="sr-only">
                        {description} {isArmed ? 'Click on the canvas to place it.' : item.alreadyPlaced ? 'This part is limited to one copy.' : ''}
                      </span>
                    </div>
                  </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div
        className="relative min-w-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,var(--cl-bg)_0%,var(--cl-bg-deep)_100%)]"
        onPointerMoveCapture={handleCanvasPointerMoveCapture}
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onContextMenu={handleContextMenu}
        onDragOver={handleDragOverCanvas}
        onDragLeave={handleDragLeaveCanvas}
        onDrop={handleDropOnCanvas}
      >
        <CanvasEngine
          containerRef={canvasContainerRef}
          transform={transform}
          scene={scene}
          recentlyCreatedWireId={recentlyCreatedWireId}
          recentlyConnectedPinId={recentlyConnectedPinId}
          selectedWireIds={boxSelectedWireIds}
          interactionProps={{
            pins: scene.pins,
            visiblePinTargetIds,
            highlightedPinIds,
            validTargetPinId:
              interaction.mode.type === 'DRAWING_WIRE' || interaction.mode.type === 'REWIRING_WIRE_ENDPOINT'
                ? interaction.mode.hoveredTargetPinId
                : null,
            mountPreview: dragPreview?.mountPreview ?? null,
            isDraggingComponent: interaction.mode.type === 'DRAGGING_COMPONENT',
            cursor,
            onPointerDown: interaction.handlePointerDown,
            onPointerMove: interaction.handlePointerMove,
            onPointerUp: interaction.handlePointerUp,
            onPointerCancel: interaction.handlePointerCancel,
            onWheel: interaction.handleWheel,
            wireDraft:
              interaction.mode.type === 'DRAWING_WIRE'
                ? {
                    fromNodeId: interaction.mode.fromNodeId,
                    fromPinId: interaction.mode.fromPinId,
                    fromPoint: interaction.mode.fromPoint,
                    previewPoint: interaction.mode.previewPoint,
                    hoveredTargetNodeId: interaction.mode.hoveredTargetNodeId,
                    hoveredTargetPinId: interaction.mode.hoveredTargetPinId,
                    targetLockState: interaction.mode.targetLockState,
                    crowdedTargets: interaction.mode.crowdedTargets,
                    preferredAxis: interaction.mode.previewAxis,
                    // Straight through the bends clicked so far, to the pointer (or the pin it snaps to).
                    points: [interaction.mode.fromPoint, ...interaction.mode.bends, interaction.mode.previewPoint],
                    bends: interaction.mode.bends,
                    color: nextWireColorFor(
                      interaction.mode.fromNodeId,
                      interaction.mode.fromPinId,
                      interaction.mode.hoveredTargetNodeId,
                      interaction.mode.hoveredTargetPinId
                    ),
                  }
                : interaction.mode.type === 'REWIRING_WIRE_ENDPOINT'
                  ? {
                      fromNodeId: interaction.mode.fixedNodeId,
                      fromPinId: interaction.mode.fixedPinId,
                      fromPoint: interaction.mode.fixedPoint,
                      previewPoint: interaction.mode.previewPoint,
                      hoveredTargetNodeId: interaction.mode.hoveredTargetNodeId,
                      hoveredTargetPinId: interaction.mode.hoveredTargetPinId,
                      targetLockState: interaction.mode.targetLockState,
                      crowdedTargets: interaction.mode.crowdedTargets,
                      preferredAxis: interaction.mode.previewAxis,
                      // A free wire keeps its bends while one end moves; an older wire previews at right angles.
                      points:
                        interaction.mode.routing === 'free'
                          ? interaction.mode.endpoint === 'from'
                            ? [interaction.mode.previewPoint, ...interaction.mode.waypoints, interaction.mode.fixedPoint]
                            : [interaction.mode.fixedPoint, ...interaction.mode.waypoints, interaction.mode.previewPoint]
                          : buildWireRoutePoints(
                              interaction.mode.fixedPoint,
                              interaction.mode.previewPoint,
                              [],
                              interaction.mode.previewAxis
                            ),
                      color: scene.wireById[interaction.mode.wireId]?.color,
                    }
                  : null,
          }}
        />

        {contextMenu && selectedComponentId ? (
          <ComponentContextMenu
            componentId={selectedComponentId}
            position={contextMenu}
            onRotate={() => handleRotateSelected(1)}
            onDelete={handleDeleteSelected}
            onClose={() => setContextMenu(null)}
          />
        ) : null}

        {isPlacementPreviewVisible && dragPreview && palettePreviewDefinition ? (
          <div className="pointer-events-none absolute inset-0 z-[18] overflow-hidden" aria-hidden="true" data-testid="circuit-placement-preview">
            <div style={palettePreviewTransform}>
              <div
                className="absolute opacity-85 drop-shadow-[0_18px_28px_rgba(2,6,23,0.55)]"
                style={{
                  left: dragPreview.displayPosition.x,
                  top: dragPreview.displayPosition.y,
                  width: getRenderedSize(palettePreviewDefinition.size).width,
                  height: getRenderedSize(palettePreviewDefinition.size).height,
                }}
              >
                <div
                  data-testid="circuit-placement-preview-status"
                  className={cn(
                    'absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-[0_18px_24px_-20px_rgba(2,6,23,0.95)]',
                    dragPreview.mountPreview && !dragPreview.mountPreview.isValid
                      ? 'border-rose-300/30 bg-rose-500/14 text-rose-100'
                      : 'border-cyan-300/26 bg-cyan-300/12 text-cyan-100'
                  )}
                >
                  {dragPreview.mountPreview
                    ? dragPreview.mountPreview.isValid
                      ? 'Valid placement'
                      : 'Move to a valid spot'
                    : 'Ready to place'}
                </div>
                <ComponentPreview definition={palettePreviewDefinition} className="h-full w-full" />
              </div>
            </div>
          </div>
        ) : null}

        {isCanvasEmpty && !isPlacementPreviewVisible ? (
          <div className="pointer-events-none absolute left-5 top-5 z-[120] max-w-[560px]">
            <div className="pointer-events-auto inline-flex flex-wrap items-center gap-3 rounded-[18px] border border-white/8 bg-[color:var(--cl-panel)]/72 px-4 py-3 text-white shadow-[0_18px_48px_-36px_rgba(0,0,0,0.92)] backdrop-blur-lg">
              <div className="pr-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/38">Quick Start</div>
                <div className="mt-1 text-sm font-semibold text-white/88">Place a board and a breadboard.</div>
              </div>
              <button
                type="button"
                onClick={() => beginComponentInsertion('ARDUINO_UNO')}
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/22 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition-all hover:-translate-y-0.5 hover:border-cyan-200/30 hover:bg-cyan-300/14"
              >
                <CircuitBoard size={14} />
                Add Arduino Uno
              </button>
              <button
                type="button"
                onClick={() => beginComponentInsertion('BREADBOARD')}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/84 transition-all hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.08]"
              >
                <Palette size={14} />
                Add Breadboard
              </button>
              <button
                type="button"
                onClick={() => beginComponentInsertion('LED')}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/84 transition-all hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.08]"
              >
                <Lightbulb size={14} />
                Add LED
              </button>
            </div>
          </div>
        ) : null}

        {interactionMode ? (
          <div className="pointer-events-none absolute left-1/2 top-5 z-[250] -translate-x-1/2" data-testid="circuit-mode-badge">
            <div
              className={cn(
                'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-[0_18px_34px_-24px_rgba(2,6,23,0.95)] backdrop-blur-xl',
                interactionMode.tone === 'placing'
                  ? 'border-cyan-300/26 bg-cyan-300/12 text-cyan-100'
                  : interactionMode.tone === 'invalid'
                    ? 'border-rose-300/30 bg-rose-500/14 text-rose-100'
                    : interactionMode.tone === 'valid'
                      ? 'border-emerald-300/28 bg-emerald-500/14 text-emerald-100'
                      : interactionMode.tone === 'wiring'
                        ? 'border-sky-300/24 bg-sky-300/12 text-sky-100'
                        : 'border-white/12 bg-[color:var(--cl-panel)]/88 text-white/80'
              )}
            >
              {interactionMode.label} · {interactionMode.detail}
            </div>
          </div>
        ) : null}

        <InteractionManager
          showPalette={isPaletteVisible}
          onTogglePalette={() => setIsPaletteVisible((current) => !current)}
          onZoomFit={handleZoomFit}
          onResetView={handleResetView}
        />

        {interaction.mode.type === 'DRAWING_WIRE' && (
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              interaction.cancelWireDrawing();
            }}
            className="pointer-events-auto absolute bottom-5 left-1/2 z-[300] -translate-x-1/2 flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-950/80 px-4 py-2 text-xs font-semibold text-rose-200 shadow-[0_18px_48px_-24px_rgba(225,29,72,0.6)] backdrop-blur-md"
          >
            <X size={14} /> Cancel Wire
          </button>
        )}

        {interactionGuide ? (
          <div className="pointer-events-none absolute bottom-5 left-5 z-[260] max-w-[360px]" data-testid="circuit-interaction-guide">
            <div
              className={cn(
                'rounded-[18px] border px-4 py-3 shadow-[0_22px_48px_-28px_rgba(2,6,23,0.95)] backdrop-blur-xl',
                interactionGuide.tone === 'invalid'
                  ? 'border-rose-300/28 bg-[#1a0d12]/90 text-rose-50'
                  : 'border-white/10 bg-[color:var(--cl-panel)]/90 text-slate-100'
              )}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/46">{interactionGuide.status}</div>
              <div className="mt-1 text-sm font-semibold text-white/94">{interactionGuide.title}</div>
              <div className="mt-2 text-[13px] leading-5 text-white/72">{interactionGuide.description}</div>
              {interactionGuide.action ? <div className="mt-2 text-[12px] font-medium leading-5 text-white/56">{interactionGuide.action}</div> : null}
            </div>
          </div>
        ) : null}

        {interaction.mode.type === 'SELECTING_BOX' && interaction.mode.moved ? (
          <div
            className="pointer-events-none absolute z-[310] rounded-[6px] border border-cyan-300/80 bg-cyan-300/10"
            data-testid="circuit-selection-box"
            style={{
              left: Math.min(interaction.mode.startWorld.x, interaction.mode.currentWorld.x) * transform.scale + transform.x,
              top: Math.min(interaction.mode.startWorld.y, interaction.mode.currentWorld.y) * transform.scale + transform.y,
              width: Math.abs(interaction.mode.currentWorld.x - interaction.mode.startWorld.x) * transform.scale,
              height: Math.abs(interaction.mode.currentWorld.y - interaction.mode.startWorld.y) * transform.scale,
            }}
          />
        ) : null}

        {boxSelectionCount > 0 && interaction.mode.type === 'IDLE' ? (
          <div className="absolute left-1/2 top-4 z-[320] -translate-x-1/2" data-testid="circuit-multi-selection">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[color:var(--cl-panel)]/94 px-2 py-2 shadow-[0_22px_48px_-26px_rgba(2,6,23,0.95)] backdrop-blur-xl">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                {boxSelectionCount} selected
              </div>
              <button
                type="button"
                onClick={() => deleteBoxSelection()}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/10 px-3 text-sm font-semibold text-rose-100 transition-all hover:border-rose-300/30 hover:bg-rose-400/14"
              >
                <Trash2 size={14} />
                Delete
              </button>
              <button
                type="button"
                onClick={() => setBoxSelection(null)}
                aria-label="Clear selection"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 transition-all hover:border-white/18 hover:bg-white/[0.08]"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : null}

        {selectionOverlay ? (
          <div
            className="absolute z-[320]"
            style={{
              left: `clamp(24px, ${selectionOverlay.left}px, calc(100% - 24px))`,
              top: `clamp(24px, ${selectionOverlay.top}px, calc(100% - 24px))`,
              transform: selectionOverlay.type === 'wire' && selectionOverlay.placement === 'below' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            }}
          >
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[color:var(--cl-panel)]/94 px-2 py-2 shadow-[0_22px_48px_-26px_rgba(2,6,23,0.95)] backdrop-blur-xl">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                {selectionOverlay.label}
              </div>
              {selectionOverlay.type === 'component' ? (
                <>
                  {selectedComponentNode ? (
                    <PartProperties
                      definitionId={selectedComponentNode.definition.id}
                      state={selectedComponentNode.component.state ?? {}}
                      onChange={handleUpdateSelectedPart}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleRotateSelected(-1)}
                    title="Turn anticlockwise (Shift+R)"
                    aria-label="Turn anticlockwise"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/84 transition-all hover:border-white/18 hover:bg-white/[0.08]"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRotateSelected(1)}
                    title="Turn clockwise (R)"
                    aria-label="Turn clockwise"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/84 transition-all hover:border-white/18 hover:bg-white/[0.08]"
                  >
                    <RotateCw size={14} />
                  </button>
                  {selectedComponentNode?.definition.footprint?.type !== 'board' ? (
                    <button
                      type="button"
                      onClick={duplicateSelection}
                      title="Duplicate (Ctrl+D). Ctrl+C and Ctrl+V copy and paste."
                      aria-label="Duplicate"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/84 transition-all hover:border-white/18 hover:bg-white/[0.08]"
                    >
                      <CopyPlus size={14} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/10 px-3 text-sm font-semibold text-rose-100 transition-all hover:border-rose-300/30 hover:bg-rose-400/14"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-6 gap-1 px-1" role="group" aria-label="Wire colour">
                    {WIRE_COLOR_OPTIONS.map((option) => {
                      const isActive = selectedWire?.color.toLowerCase() === option.hex;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => handleApplyWireColor(option.hex)}
                          aria-label={`Wire colour: ${option.name}`}
                          aria-pressed={isActive}
                          title={option.name}
                          className={cn(
                            'h-5 w-5 rounded-full border transition-all duration-150',
                            isActive
                              ? 'scale-110 border-white shadow-[0_0_0_2px_rgba(255,255,255,0.22)]'
                              : 'border-white/25 hover:scale-110 hover:border-white/60'
                          )}
                          style={{ backgroundColor: option.hex }}
                        />
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleStraightenSelectedWire}
                    disabled={(selectedWire?.routing === 'free' && selectedWire.waypoints.length === 0) || false}
                    title="Remove all bends so the wire runs straight. Tip: double-click the wire to add a bend, double-click a bend to remove it."
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-white/84 transition-all hover:border-white/18 hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-40"
                  >
                    <Spline size={14} />
                    Straighten
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/10 px-3 text-sm font-semibold text-rose-100 transition-all hover:border-rose-300/30 hover:bg-rose-400/14"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}

        <div
          ref={trashRef}
          className={cn(
            'pointer-events-none absolute bottom-5 right-5 z-[320] flex items-center gap-3 rounded-[18px] border px-4 py-3 text-sm font-medium transition-all duration-150',
            dragPreview?.source === 'existing'
              ? 'translate-y-0 opacity-100'
              : 'translate-y-2 opacity-0',
            dragPreview?.source === 'existing' && dragPreview?.overTrash
              ? 'border-red-400/60 bg-red-500/16 text-red-50 shadow-[0_0_26px_rgba(248,113,113,0.28)]'
              : 'border-white/10 bg-[color:var(--cl-raised)]/88 text-slate-300 shadow-[0_18px_38px_-28px_rgba(2,6,23,0.95)]'
          )}
        >
          <Trash2 className={cn('h-5 w-5', dragPreview?.source === 'existing' && dragPreview?.overTrash ? 'text-red-200' : 'text-slate-300')} />
          <span>{dragPreview?.source === 'existing' && dragPreview?.overTrash ? 'Release to delete' : 'Drag here to delete'}</span>
        </div>
      </div>
    </div>
  );
}














