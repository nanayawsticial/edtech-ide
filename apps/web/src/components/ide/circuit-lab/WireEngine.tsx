"use client";

import React from 'react';

import { getWireCasingColor } from '@/lib/wiring/wireColors';
import type { WireDraftState, WorldWireNode, WireHandleNode } from './sceneTypes';

interface WireEngineProps {
  wires: WorldWireNode[];
  selectedWireId: string | null;
  /** Wires picked with a selection box (drawn like the selected wire, without handles). */
  selectedWireIds?: ReadonlySet<string>;
  hoveredWireId: string | null;
  wireDraft: WireDraftState | null;
  recentlyCreatedWireId?: string | null;
}

/** Glow shown around a wire whose net is HIGH while simulating; the wire keeps its own colour. */
const HIGH_SIGNAL_GLOW = '#34d399';
const DRAFT_FALLBACK_COLOR = '#22d3ee';

function pointsToPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return '';
  }

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function renderHandle(handle: WireHandleNode, routing: WorldWireNode['routing']) {
  if (handle.kind === 'segment') {
    if (routing === 'free') {
      // Grip in the middle of a segment: drag it to add a bend there.
      return (
        <g key={handle.id} data-wire-id={handle.wireId} data-wire-handle-kind={handle.kind}>
          <circle cx={handle.position.x} cy={handle.position.y} r={7} fill="rgba(34,211,238,0.10)" />
          <circle cx={handle.position.x} cy={handle.position.y} r={3.6} fill="rgba(8,17,29,0.85)" stroke="#67e8f9" strokeWidth={1.3} />
        </g>
      );
    }

    return (
      <g key={handle.id} data-wire-id={handle.wireId} data-wire-handle-kind={handle.kind}>
        <circle cx={handle.position.x} cy={handle.position.y} r={10.5} fill="rgba(34,211,238,0.12)" />
        <circle cx={handle.position.x} cy={handle.position.y} r={5} fill="#22d3ee" stroke="#ecfeff" strokeWidth={1.2} />
      </g>
    );
  }

  if (handle.kind === 'endpoint') {
    return (
      <g key={handle.id} data-wire-id={handle.wireId} data-wire-handle-kind={handle.kind} data-wire-handle-endpoint={handle.endpoint}>
        <rect x={handle.position.x - 7.5} y={handle.position.y - 7.5} width={15} height={15} rx={3.2} fill="rgba(34,211,238,0.14)" />
        <rect x={handle.position.x - 4.3} y={handle.position.y - 4.3} width={8.6} height={8.6} rx={2.2} fill="#22d3ee" stroke="#ecfeff" strokeWidth={1.05} />
      </g>
    );
  }

  if (routing === 'free') {
    // A bend: drag to move it, double-click to remove it.
    return (
      <g key={handle.id} data-wire-id={handle.wireId} data-wire-handle-kind={handle.kind} data-wire-bend-index={handle.waypointIndex}>
        <circle cx={handle.position.x} cy={handle.position.y} r={9.5} fill="rgba(34,211,238,0.14)" />
        <circle cx={handle.position.x} cy={handle.position.y} r={4.8} fill="#ecfeff" stroke="#22d3ee" strokeWidth={2} />
      </g>
    );
  }

  return (
    <g key={handle.id} data-wire-id={handle.wireId} data-wire-handle-kind={handle.kind}>
      <rect
        x={handle.position.x - 6}
        y={handle.position.y - 6}
        width={12}
        height={12}
        rx={2.5}
        transform={`rotate(45 ${handle.position.x} ${handle.position.y})`}
        fill="rgba(34,211,238,0.12)"
      />
      <rect
        x={handle.position.x - 3.2}
        y={handle.position.y - 3.2}
        width={6.4}
        height={6.4}
        rx={1.4}
        transform={`rotate(45 ${handle.position.x} ${handle.position.y})`}
        fill="#22d3ee"
        stroke="#ecfeff"
        strokeWidth={1}
      />
    </g>
  );
}

function WireEngineImpl({
  wires,
  selectedWireId,
  selectedWireIds,
  hoveredWireId,
  wireDraft,
  recentlyCreatedWireId,
}: WireEngineProps) {
  const draftColor = wireDraft?.color ?? DRAFT_FALLBACK_COLOR;

  return (
    <>
      <defs>
        <filter id="wire-glow-overlay" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {wires.map((wire) => {
        const isPrimarySelected = selectedWireId === wire.id || wire.isSelected;
        const isSelected = isPrimarySelected || Boolean(selectedWireIds?.has(wire.id));
        const isHovered = hoveredWireId === wire.id || wire.isHovered;
        const path = pointsToPath(wire.interactionPoints);
        const isRecentlyCreated = recentlyCreatedWireId === wire.id;
        const isHigh = wire.signalState === 'HIGH';
        const strokeWidth = isSelected ? 4.2 : isHovered ? 3.6 : isHigh ? 3.2 : 2.8;

        return (
          <g key={wire.id} data-wire-color={wire.color} data-wire-routing={wire.routing}>
            {isHigh ? (
              <path
                d={path}
                stroke={HIGH_SIGNAL_GLOW}
                strokeWidth={isSelected ? 11 : 9}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.3}
                filter="url(#wire-glow-overlay)"
                className="animate-wire-pulse"
                style={{ '--wire-color': HIGH_SIGNAL_GLOW } as React.CSSProperties}
              />
            ) : null}

            {isSelected || isHovered || isRecentlyCreated ? (
              <path
                d={path}
                stroke={wire.color}
                strokeWidth={isSelected ? 8.5 : isHovered ? 7.2 : 6.2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isSelected ? 0.22 : isHovered ? 0.12 : 0.14}
                filter="url(#wire-glow-overlay)"
              />
            ) : null}

            {/* Casing: a thin edge like real insulation, so dark wires show on the dark canvas. */}
            <path
              d={path}
              stroke={getWireCasingColor(wire.color)}
              strokeWidth={strokeWidth + 2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />

            <path
              d={path}
              data-wire-id={wire.id}
              data-wire-role="main"
              data-from-anchor-id={wire.fromAnchorId ?? ''}
              data-to-anchor-id={wire.toAnchorId ?? ''}
              stroke={wire.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={isRecentlyCreated ? 'animate-wire-draw' : undefined}
            />

            {isPrimarySelected ? wire.bendHandles.map((handle) => renderHandle(handle, wire.routing)) : null}
          </g>
        );
      })}

      {wireDraft ? (
        <g data-wire-draft-color={draftColor}>
          <path d={pointsToPath(wireDraft.points)} stroke={draftColor} strokeWidth={wireDraft.targetLockState === 'locked' ? 8.5 : 8} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={wireDraft.crowdedTargets ? 0.18 : 0.16} filter="url(#wire-glow-overlay)" />
          <path d={pointsToPath(wireDraft.points)} stroke={getWireCasingColor(draftColor)} strokeWidth={wireDraft.targetLockState === 'locked' ? 5.7 : 5.4} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 6" opacity={0.9} />
          <path d={pointsToPath(wireDraft.points)} stroke={draftColor} strokeWidth={wireDraft.targetLockState === 'locked' ? 3.7 : 3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 6" opacity={0.98} className="animate-wire-preview" />
          {(wireDraft.bends ?? []).map((bend, index) => (
            <circle key={`draft-bend-${index}`} cx={bend.x} cy={bend.y} r={3.6} fill="#ecfeff" stroke={draftColor} strokeWidth={1.6} />
          ))}
          <g>
            <circle cx={wireDraft.fromPoint.x} cy={wireDraft.fromPoint.y} r={9} fill="rgba(34,211,238,0.14)" />
            <circle cx={wireDraft.fromPoint.x} cy={wireDraft.fromPoint.y} r={4.6} fill="#22d3ee" stroke="#ecfeff" strokeWidth={1.1} />
          </g>
          <g>
            {wireDraft.hoveredTargetPinId ? (
              <circle
                cx={wireDraft.previewPoint.x}
                cy={wireDraft.previewPoint.y}
                r={wireDraft.targetLockState === 'locked' ? 13 : 11}
                fill="rgba(34,197,94,0.18)"
                className={wireDraft.targetLockState === 'locked' ? 'animate-ping' : undefined}
              />
            ) : null}
            {wireDraft.hoveredTargetPinId && wireDraft.targetLockState === 'locked' ? (
              <circle cx={wireDraft.previewPoint.x} cy={wireDraft.previewPoint.y} r={8.6} fill="rgba(34,197,94,0.16)" />
            ) : null}
            <circle
              cx={wireDraft.previewPoint.x}
              cy={wireDraft.previewPoint.y}
              r={wireDraft.hoveredTargetPinId ? (wireDraft.targetLockState === 'locked' ? 6.8 : 6) : 5}
              fill={wireDraft.hoveredTargetPinId ? '#22c55e' : '#22d3ee'}
              stroke="#ecfeff"
              strokeWidth={1.1}
              opacity={0.98}
            />
          </g>
        </g>
      ) : null}
    </>
  );
}

export default React.memo(WireEngineImpl);
