"use client";

import React from 'react';

import type { CanvasTransform, MountPreviewState, WireDraftState, WorldPinNode } from './sceneTypes';

interface InteractionLayerProps {
  transform: CanvasTransform;
  pins: WorldPinNode[];
  visiblePinTargetIds: Set<string>;
  highlightedPinIds: Set<string>;
  validTargetPinId: string | null;
  mountPreview: MountPreviewState | null;
  /** While a part is dragged, the pin test markers keep their last positions until the drop. */
  isDraggingComponent?: boolean;
  wireDraft: WireDraftState | null;
  cursor: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
}

function AnchorHalo({
  x,
  y,
  color,
  strong = false,
  pulse = false,
}: {
  x: number;
  y: number;
  color: string;
  strong?: boolean;
  pulse?: boolean;
}) {
  const outer = strong ? 24 : 18;
  const middle = strong ? 12 : 9;
  const inner = strong ? 7.4 : 6.8;
  return (
    <g className={pulse ? 'animate-pulse' : undefined}>
      <rect x={x - outer / 2} y={y - outer / 2} width={outer} height={outer} rx={strong ? 7 : 5} fill={color} opacity={strong ? 0.18 : 0.1} />
      <rect x={x - middle / 2} y={y - middle / 2} width={middle} height={middle} rx={strong ? 5 : 3.5} fill={color} opacity={strong ? 0.22 : 0.14} />
      <rect x={x - inner / 2} y={y - inner / 2} width={inner} height={inner} rx={2} fill={color} opacity={0.98} />
    </g>
  );
}

function PreviewNodeMarker({
  x,
  y,
  snapped,
  lockState,
}: {
  x: number;
  y: number;
  snapped: boolean;
  lockState: WireDraftState['targetLockState'];
}) {
  const color = snapped ? '#22c55e' : '#22d3ee';
  const isLocked = snapped && lockState === 'locked';
  return <AnchorHalo x={x} y={y} color={color} strong={snapped} pulse={isLocked} />;
}

function SignalIndicator({ pin }: { pin: WorldPinNode }) {
  if (!pin.signalState || pin.signalState === 'FLOAT' || pin.kind === 'breadboard') {
    return null;
  }

  const isHigh = pin.signalState === 'HIGH';
  const fill = isHigh ? '#34d399' : '#94a3b8';
  const stroke = isHigh ? '#d1fae5' : '#e2e8f0';

  return (
    <g>
      <rect
        x={pin.position.x + 6}
        y={pin.position.y - 12}
        width={8}
        height={8}
        rx={2}
        fill={fill}
        stroke={stroke}
        strokeWidth={0.9}
        opacity={0.95}
      />
      <rect
        x={pin.position.x + 3}
        y={pin.position.y - 15}
        width={14}
        height={14}
        rx={4}
        fill={fill}
        opacity={isHigh ? 0.12 : 0.08}
      />
    </g>
  );
}

function GroupHighlight({ mountPreview }: { mountPreview: MountPreviewState }) {
  const stroke = mountPreview.isValid ? 'rgba(34,211,238,0.68)' : 'rgba(248,113,113,0.82)';
  const fill = mountPreview.isValid ? 'rgba(34,211,238,0.08)' : 'rgba(248,113,113,0.1)';

  return (
    <g>
      {mountPreview.groupHighlights.map((highlight) => (
        <rect
          key={highlight.id}
          x={highlight.bounds.x}
          y={highlight.bounds.y}
          width={highlight.bounds.width}
          height={highlight.bounds.height}
          rx={highlight.kind === 'rail' ? 12 : 8}
          fill={fill}
          stroke={stroke}
          strokeWidth={highlight.kind === 'rail' ? 1.2 : 1.4}
          strokeDasharray={highlight.kind === 'rail' ? '10 10' : '7 7'}
          opacity={highlight.kind === 'rail' ? 0.82 : 0.95}
        />
      ))}
    </g>
  );
}

function ContinuityTargetHighlights({ pins, validTargetPinId, highlightedPinIds }: { pins: WorldPinNode[]; validTargetPinId: string | null; highlightedPinIds: Set<string> }) {
  const seen = new Set<string>();
  const targetPins = pins.filter(
    (pin) => pin.kind === 'breadboard' && pin.continuityBounds && (pin.id === validTargetPinId || highlightedPinIds.has(pin.id))
  );

  return (
    <g>
      {targetPins.map((pin) => {
        if (!pin.continuityGroupId || !pin.continuityBounds || seen.has(pin.continuityGroupId)) {
          return null;
        }
        seen.add(pin.continuityGroupId);
        const isTarget = pin.id === validTargetPinId;
        return (
          <rect
            key={`continuity-${pin.continuityGroupId}`}
            x={pin.continuityBounds.x}
            y={pin.continuityBounds.y}
            width={pin.continuityBounds.width}
            height={pin.continuityBounds.height}
            rx={pin.continuityKind === 'rail' ? 12 : 8}
            fill={isTarget ? 'rgba(34,197,94,0.12)' : 'rgba(34,211,238,0.08)'}
            stroke={isTarget ? 'rgba(34,197,94,0.82)' : 'rgba(34,211,238,0.5)'}
            strokeWidth={pin.continuityKind === 'rail' ? 1.2 : 1.35}
            strokeDasharray={pin.continuityKind === 'rail' ? '10 10' : '7 7'}
            opacity={isTarget ? 0.98 : 0.84}
          />
        );
      })}
    </g>
  );
}

// The per-pin layers below are drawn per part and memoised, so dragging one part re-renders only
// that part's pins instead of every breadboard hole (hundreds of pins, several elements each).
function samePinList(a: WorldPinNode[], b: WorldPinNode[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.id !== right.id ||
      left.position.x !== right.position.x ||
      left.position.y !== right.position.y ||
      left.signalState !== right.signalState ||
      left.isMounted !== right.isMounted ||
      left.nodeId !== right.nodeId ||
      left.kind !== right.kind
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Same pins, laid out the same way relative to the group's first pin. A part that only moved
 * passes this check, so its pins are re-positioned by one group transform instead of each pin.
 */
function samePinLayout(a: WorldPinNode[], b: WorldPinNode[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const originA = a[0].position;
  const originB = b[0].position;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.id !== right.id ||
      left.kind !== right.kind ||
      Math.abs(left.position.x - originA.x - (right.position.x - originB.x)) > 1e-6 ||
      Math.abs(left.position.y - originA.y - (right.position.y - originB.y)) > 1e-6
    ) {
      return false;
    }
  }
  return true;
}

function sameIdSet(a: Set<string>, b: Set<string>) {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function groupPinsByComponent(pins: WorldPinNode[]) {
  const groups = new Map<string, WorldPinNode[]>();
  for (const pin of pins) {
    // Breadboard holes carry no component id; they all move together, so they form one group.
    const key = pin.componentId ?? (pin.kind === 'breadboard' ? 'breadboard-holes' : `node:${pin.nodeId}`);
    const group = groups.get(key);
    if (group) group.push(pin);
    else groups.set(key, [pin]);
  }
  return [...groups.entries()];
}

const PinSignalGroup = React.memo(
  function PinSignalGroup({ pins }: { pins: WorldPinNode[] }) {
    return (
      <>
        {pins.map((pin) => (
          <SignalIndicator key={`${pin.id}-signal`} pin={pin} />
        ))}
      </>
    );
  },
  (previous, next) => samePinList(previous.pins, next.pins)
);

/**
 * Invisible markers that tests and tools use to find pins by id and position. They are frozen
 * during a drag: rewriting their coordinates every frame restyled one element per pin (over
 * 1,600 when the breadboard moves). They update on drop.
 */
const PinTestMarkerGroup = React.memo(
  function PinTestMarkerGroup({ pins }: { pins: WorldPinNode[]; frozen: boolean }) {
    return (
      <>
        {pins.map((pin) => (
          <g
            key={`${pin.id}-test-marker`}
            data-pin-id={pin.id}
            data-node-id={pin.nodeId}
            data-pin-kind={pin.kind}
            data-component-id={pin.componentId ?? ''}
            data-pin-mounted={String(Boolean(pin.isMounted))}
            data-pin-x={pin.position.x}
            data-pin-y={pin.position.y}
          />
        ))}
      </>
    );
  },
  (previous, next) => (previous.frozen && next.frozen) || (previous.frozen === next.frozen && samePinList(previous.pins, next.pins))
);

interface BreadboardPinAffordancesProps {
  pins: WorldPinNode[];
  highlightedPinIds: Set<string>;
  validTargetPinId: string | null;
  active: boolean;
}

const BreadboardPinAffordances = React.memo(
  BreadboardPinAffordancesImpl,
  (previous: BreadboardPinAffordancesProps, next: BreadboardPinAffordancesProps) =>
    previous.active === next.active &&
    previous.validTargetPinId === next.validTargetPinId &&
    sameIdSet(previous.highlightedPinIds, next.highlightedPinIds) &&
    samePinLayout(previous.pins, next.pins)
);

/** Drawn relative to the first pin; the caller wraps it in a translate to that pin's position. */
function BreadboardPinAffordancesImpl({
  pins,
  highlightedPinIds,
  validTargetPinId,
  active,
}: BreadboardPinAffordancesProps) {
  const origin = pins[0]?.position ?? { x: 0, y: 0 };
  return (
    <g>
      {pins
        .filter((pin) => pin.kind === 'breadboard')
        .map((pin) => {
          const x = pin.position.x - origin.x;
          const y = pin.position.y - origin.y;
          const isTarget = validTargetPinId === pin.id;
          const isHighlighted = highlightedPinIds.has(pin.id);
          const outerOpacity = isTarget ? 0.44 : isHighlighted ? 0.24 : active ? 0.1 : 0.045;
          const innerOpacity = isTarget ? 0.92 : isHighlighted ? 0.52 : active ? 0.16 : 0.08;
          const stroke = isTarget ? '#22c55e' : isHighlighted ? '#22d3ee' : 'rgba(148,163,184,0.42)';
          const fill = isTarget ? 'rgba(34,197,94,0.16)' : isHighlighted ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.02)';

          return (
            <g key={`${pin.id}-breadboard-affordance`}>
              <circle cx={x} cy={y} r={isTarget ? 6.6 : isHighlighted ? 5.2 : 4.2} fill={fill} opacity={outerOpacity} />
              <circle cx={x} cy={y} r={isTarget ? 3.9 : isHighlighted ? 3.2 : 2.6} fill="transparent" stroke={stroke} strokeWidth={isTarget ? 1.35 : 0.95} opacity={innerOpacity} />
            </g>
          );
        })}
    </g>
  );
}

function InteractionLayerImpl({
  transform,
  pins,
  visiblePinTargetIds,
  highlightedPinIds,
  validTargetPinId,
  mountPreview,
  isDraggingComponent,
  wireDraft,
  cursor,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onWheel,
}: InteractionLayerProps) {
  const pinGroups = React.useMemo(() => groupPinsByComponent(pins), [pins]);
  const affordancesActive = Boolean(mountPreview || wireDraft || highlightedPinIds.size > 0 || validTargetPinId);

  return (
    <div
      className="absolute inset-0 touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
      data-canvas-interaction="true"
      data-wire-preview={wireDraft ? 'active' : 'idle'}
      data-wire-lock-state={wireDraft?.targetLockState ?? 'none'}
      data-wire-target-pin-id={wireDraft?.hoveredTargetPinId ?? ''}
      data-wire-target-node-id={wireDraft?.hoveredTargetNodeId ?? ''}
      data-wire-target-density={wireDraft?.crowdedTargets ? 'crowded' : 'clear'}
      data-canvas-transform-x={transform.x}
      data-canvas-transform-y={transform.y}
      data-canvas-transform-scale={transform.scale}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" width="100%" height="100%" aria-hidden="true">
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {pinGroups.map(([key, groupPins]) => (
            <PinSignalGroup key={`${key}-signals`} pins={groupPins} />
          ))}

          {pinGroups.map(([key, groupPins]) => (
            <g key={`${key}-affordances`} transform={`translate(${groupPins[0].position.x} ${groupPins[0].position.y})`}>
              <BreadboardPinAffordances
                pins={groupPins}
                highlightedPinIds={highlightedPinIds}
                validTargetPinId={validTargetPinId}
                active={affordancesActive}
              />
            </g>
          ))}

          {pins
            .filter((pin) => visiblePinTargetIds.has(pin.id) && pin.kind !== 'breadboard')
            .map((pin) => {
              const isActive = validTargetPinId === pin.id || highlightedPinIds.has(pin.id);
              return (
                <g key={`${pin.id}-visible-target`}>
                  <circle cx={pin.position.x} cy={pin.position.y} r={isActive ? 9.5 : 7.25} fill={isActive ? 'rgba(34,211,238,0.2)' : 'rgba(148,163,184,0.16)'} />
                  <circle cx={pin.position.x} cy={pin.position.y} r={isActive ? 4.8 : 3.4} fill={isActive ? '#22d3ee' : '#cbd5e1'} stroke={isActive ? '#ecfeff' : 'rgba(255,255,255,0.72)'} strokeWidth={1.05} />
                </g>
              );
            })}

          {pinGroups.map(([key, groupPins]) => (
            <PinTestMarkerGroup key={`${key}-markers`} pins={groupPins} frozen={Boolean(isDraggingComponent)} />
          ))}

          <ContinuityTargetHighlights pins={pins} validTargetPinId={validTargetPinId} highlightedPinIds={highlightedPinIds} />

          {mountPreview ? (
            <g>
              {mountPreview.groupHighlights.length > 0 ? <GroupHighlight mountPreview={mountPreview} /> : null}

              <g
                transform={`translate(${mountPreview.position.x} ${mountPreview.position.y}) rotate(${mountPreview.rotation} ${mountPreview.size.width / 2} ${mountPreview.size.height / 2})`}
                opacity={0.98}
              >
                <rect
                  x={-6}
                  y={-6}
                  width={mountPreview.size.width + 12}
                  height={mountPreview.size.height + 12}
                  rx={18}
                  fill={mountPreview.isValid ? 'rgba(34,211,238,0.12)' : 'rgba(248,113,113,0.11)'}
                  stroke={mountPreview.isValid ? 'rgba(34,211,238,0.9)' : 'rgba(248,113,113,0.95)'}
                  strokeWidth={1.9}
                  strokeDasharray={mountPreview.isValid ? '12 9' : '8 8'}
                />
              </g>

              {mountPreview.matchedAnchors.map((anchor, index) => (
                <AnchorHalo
                  key={`${mountPreview.componentId}-anchor-${index}-${anchor.x}-${anchor.y}`}
                  x={anchor.x}
                  y={anchor.y}
                  color={mountPreview.isValid ? '#22d3ee' : '#f87171'}
                  strong
                  pulse={mountPreview.isValid}
                />
              ))}
            </g>
          ) : null}

          {wireDraft ? (
            <g>
              <AnchorHalo x={wireDraft.fromPoint.x} y={wireDraft.fromPoint.y} color="#22d3ee" strong pulse />
              <PreviewNodeMarker
                x={wireDraft.previewPoint.x}
                y={wireDraft.previewPoint.y}
                snapped={Boolean(wireDraft.hoveredTargetPinId)}
                lockState={wireDraft.targetLockState}
              />
            </g>
          ) : null}

          {pins
            .filter((pin) => highlightedPinIds.has(pin.id) || validTargetPinId === pin.id)
            .map((pin) => {
              const isTarget = validTargetPinId === pin.id;
              const isLockedTarget = isTarget && wireDraft?.targetLockState === 'locked';
              const color = isTarget ? '#22c55e' : '#22d3ee';
              return <AnchorHalo key={pin.id} x={pin.position.x} y={pin.position.y} color={color} strong={isTarget} pulse={isLockedTarget} />;
            })}
        </g>
      </svg>
      {/* The cursor lives on this empty overlay (pointer events still bubble to the layer above).
          On the layer itself, every cursor change (hover a part, grab, drop) restyled its
          thousands of pin elements, because cursor is inherited. */}
      <div className="absolute inset-0" style={{ cursor }} aria-hidden="true" />
    </div>
  );
}

export default React.memo(InteractionLayerImpl);
