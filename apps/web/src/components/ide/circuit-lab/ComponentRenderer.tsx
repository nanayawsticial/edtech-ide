"use client";

import React, { useMemo } from 'react';

import { BreadboardSVG } from '@/lib/wiring/BreadboardSVG';
import { WORKSPACE_SCALE } from '@/lib/wiring/componentGeometry';

import type { WorldComponentNode } from './sceneTypes';

interface ComponentRendererProps {
  node: WorldComponentNode;
  isHovered?: boolean;
  isSelected?: boolean;
  isConnected?: boolean;
  isDragging?: boolean;
}

const FILL_STYLE: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
};

function StaticSvg({ svg }: { svg: string }) {
  const normalizedSvg = useMemo(() => {
    if (!svg.includes('<svg')) {
      return svg;
    }

    return svg.replace(
      '<svg ',
      '<svg preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block" '
    );
  }, [svg]);

  return <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: normalizedSvg }} />;
}

function NativeFrame({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        width,
        height,
        transform: `scale(${WORKSPACE_SCALE})`,
        transformOrigin: 'top left',
      }}
    >
      {children}
    </div>
  );
}

// The breadboard drawing never changes (hundreds of holes), so render it once.
const BreadboardVisual = React.memo(function BreadboardVisual() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 652.8 201.6"
      className="block h-full w-full overflow-visible"
      preserveAspectRatio="xMidYMid meet"
    >
      <BreadboardSVG />
    </svg>
  );
});

function sameVisualState(a: Record<string, unknown>, b: Record<string, unknown>) {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((value, index) => value === right[index]);
    }
    return Object.is(left, right);
  });
}

/** Re-render a part only when something it draws changed (the scene is rebuilt on every drag frame). */
function sameComponentRender(previous: ComponentRendererProps, next: ComponentRendererProps) {
  const a = previous.node;
  const b = next.node;
  return (
    previous.isHovered === next.isHovered &&
    previous.isSelected === next.isSelected &&
    previous.isConnected === next.isConnected &&
    previous.isDragging === next.isDragging &&
    a.component.id === b.component.id &&
    Boolean(a.component.mountedPlacement?.mounted) === Boolean(b.component.mountedPlacement?.mounted) &&
    a.definition === b.definition &&
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.rotation === b.rotation &&
    a.size.width === b.size.width &&
    a.size.height === b.size.height &&
    a.isPowered === b.isPowered &&
    sameVisualState(a.visualState as Record<string, unknown>, b.visualState as Record<string, unknown>)
  );
}

export default React.memo(ComponentRenderer, sameComponentRender);

function ComponentRenderer({
  node,
  isHovered = false,
  isSelected = false,
  isConnected = true,
  isDragging = false,
}: ComponentRendererProps) {
  const { component, definition, rotation, size, isPowered, visualState } = node;
  const state = visualState;
  const showFrame = isHovered || isSelected || isDragging;
  const showUnwiredBadge = !isConnected && definition.pins.length > 0;
  const usesNativeFrame = definition.id !== 'BREADBOARD';

  const content = (() => {
    switch (definition.id) {
      case 'BREADBOARD':
        return <BreadboardVisual />;
      case 'ARDUINO_UNO': {
        const Arduino = 'wokwi-arduino-uno' as React.ElementType;
        return <Arduino style={FILL_STYLE} />;
      }
      case 'LED': {
        const Led = 'wokwi-led' as React.ElementType;
        const color = String(state.color || 'red');
        const value = state.outputHigh ? 1 : 0;

        return (
          <div className="relative h-full w-full">
            <Led color={color} value={value} style={FILL_STYLE} />
            <div
              className="pointer-events-none absolute inset-[-18%] rounded-full transition-opacity duration-300"
              style={{
                background: `radial-gradient(circle, ${color} 0%, transparent 68%)`,
                filter: 'blur(16px)',
                opacity: state.outputHigh ? 0.3 : 0,
              }}
            />
            <div
              className={`absolute inset-0 rounded-full transition-opacity duration-300 ${state.outputHigh ? 'animate-led-glow opacity-100' : 'opacity-0'}`}
              style={{ '--led-color': color, filter: 'blur(8px)', pointerEvents: 'none' } as React.CSSProperties}
            />
          </div>
        );
      }
      case 'BUTTON': {
        const Button = 'wokwi-pushbutton' as React.ElementType;
        return <Button color={state.pressed ? 'red' : 'green'} style={FILL_STYLE} />;
      }
      case 'POTENTIOMETER': {
        const Potentiometer = 'wokwi-potentiometer' as React.ElementType;
        return (
          <Potentiometer
            value={Number(state.value ?? 512)}
            min={Number(state.min ?? 0)}
            max={Number(state.max ?? 1023)}
            style={FILL_STYLE}
          />
        );
      }
      case 'SERVO':
      case 'MICRO_SERVO': {
        const Servo = 'wokwi-servo' as React.ElementType;
        return <Servo angle={Number(state.angle ?? 90)} style={FILL_STYLE} />;
      }
      case 'ULTRASONIC': {
        const Ultrasonic = 'wokwi-hc-sr04' as React.ElementType;
        return <Ultrasonic distance={Number(state.distance ?? 10)} style={FILL_STYLE} />;
      }
      case 'DHT11':
      case 'DHT22':
      case 'DHT': {
        const Dht = 'wokwi-dht22' as React.ElementType;
        return (
          <Dht
            temperature={Number(state.temperature ?? 24)}
            humidity={Number(state.humidity ?? 40)}
            style={FILL_STYLE}
          />
        );
      }
      case 'OLED': {
        const Oled = 'wokwi-ssd1306' as React.ElementType;
        const displayLines = Array.isArray(state.displayLines)
          ? state.displayLines.slice(0, 5).map((line) => String(line ?? ''))
          : [String(state.label ?? 'OLED'), 'SIM OFF', '', '', ''];

        return (
          <div className="relative h-full w-full">
            <Oled style={FILL_STYLE} />
            <div className="pointer-events-none absolute inset-[22%_18%_34%_18%] overflow-hidden rounded-[4px] bg-[#04080f]/45 px-2 py-1 font-mono text-[8px] leading-[1.35] text-cyan-200">
              {displayLines.map((line, index) => (
                <div key={`oled-line-${index}`} className="truncate">
                  {line || ' '}
                </div>
              ))}
            </div>
          </div>
        );
      }
      case 'RESISTOR': {
        const Resistor = 'wokwi-resistor' as React.ElementType;
        return <Resistor value={String(state.resistance ?? '220')} style={FILL_STYLE} />;
      }
      default:
        return <StaticSvg svg={definition.svg} />;
    }
  })();

  // Position with a transform (not left/top) so moving a part only shifts its layer on the GPU
  // instead of re-laying out and repainting it on every pointer move. No transition while
  // dragging, or the part would trail behind the pointer.
  return (
    <div
      className={`absolute left-0 top-0 pointer-events-none select-none ${isDragging ? '' : 'transition-transform duration-150'}`}
      style={{
        width: size.width,
        height: size.height,
        transform: `translate(${node.position.x}px, ${node.position.y}px) rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        // The breadboard always stays underneath, so selecting or dragging it never hides the parts plugged into it.
        zIndex: definition.id === 'BREADBOARD' ? 4 : isSelected ? 30 : isDragging ? 28 : isHovered ? 24 : 12,
        filter: showFrame
          ? isSelected
            ? 'drop-shadow(0 0 18px rgba(34,211,238,0.42))'
            : isDragging
              ? 'drop-shadow(0 16px 24px rgba(15,23,42,0.42))'
              : 'drop-shadow(0 0 12px rgba(148,163,184,0.24))'
          : isPowered
            ? 'drop-shadow(0 0 12px rgba(16,185,129,0.14))'
            : undefined,
        willChange: 'transform',
      }}
      data-component-id={component.id}
      data-component-type={definition.id}
      data-mounted={String(Boolean(component.mountedPlacement?.mounted))}
      data-selected={String(isSelected)}
      aria-label={`Component ${definition.name}`}
    >
      <div
        className="relative h-full w-full overflow-visible rounded-[18px]"
        style={{
          background: isSelected ? 'linear-gradient(180deg, rgba(8,15,28,0.04), rgba(8,15,28,0))' : undefined,
          outline: showFrame
            ? isSelected
              ? '1px solid rgba(34,211,238,0.62)'
              : '1px solid rgba(148,163,184,0.28)'
            : undefined,
          outlineOffset: definition.id === 'BREADBOARD' ? 2 : 4,
          borderRadius: definition.id === 'BREADBOARD' ? 10 : 18,
        }}
      >
        {isSelected ? (
          // Pulsing halo for the selected part. Only its opacity animates, which the GPU handles
          // without repainting the part (an animated drop-shadow filter repainted it every frame).
          <div
            className="animate-component-selected-halo pointer-events-none absolute inset-[-6px] rounded-[20px] shadow-[0_0_16px_rgba(34,211,238,0.7)]"
            aria-hidden="true"
          />
        ) : null}

        {usesNativeFrame ? (
          <NativeFrame width={definition.size.width} height={definition.size.height}>{content}</NativeFrame>
        ) : (
          <div className="h-full w-full">{content}</div>
        )}

        {isPowered ? (
          <div className="pointer-events-none absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full border border-emerald-300/80 bg-emerald-400/90 shadow-[0_0_14px_rgba(16,185,129,0.55)]" />
        ) : null}

        {showUnwiredBadge ? (
          <div
            className="pointer-events-none absolute -right-2 -top-2 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-amber-500/50 bg-amber-500/20 text-[10px] font-bold text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
            title="Not wired"
          >
            !
          </div>
        ) : null}
      </div>
    </div>
  );
}
