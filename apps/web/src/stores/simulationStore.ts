"use client";

import { create } from "zustand";
import type {
  LogicalNetState,
  PinElectricalState,
  SimulationBusEvent,
  SimulationCapabilities,
  SimulationPinSnapshot,
  SimulationTraceEvent,
} from "@/lib/simulator/simulationTypes";
import type { CompileFeedback } from "@/lib/simulator/compileFeedback";

export interface CircuitSimulationState {
  running: boolean;
  ready: boolean;
  error: string | null;
  digitalPins: Record<string, boolean>;
  pulseWidths: Record<string, number>;
  analogPins: Record<string, number>;
  netStates: Record<string, LogicalNetState>;
  electricalPins: Record<string, PinElectricalState>;
  pinDetails: Record<string, SimulationPinSnapshot>;
  componentVisuals: Record<string, Record<string, unknown>>;
  busEvents: SimulationBusEvent[];
  traceEvents: SimulationTraceEvent[];
  warnings: string[];
  capabilities: SimulationCapabilities | null;
}

export interface SimulationCanvasControls {
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export interface SimulationCanvasStatus {
  isCompiling: boolean;
  isRunning: boolean;
  isReady: boolean;
  canStart: boolean;
  isLoaded: boolean;
  errorText: string | null;
  compileFeedback: CompileFeedback | null;
}

export type CircuitLabSimulationView = Pick<
  CircuitSimulationState,
  'running' | 'ready' | 'digitalPins' | 'netStates' | 'componentVisuals'
>;

interface SimulationStoreState {
  simulationState: CircuitSimulationState;
  simulationControls: SimulationCanvasControls | null;
  simulationStatus: SimulationCanvasStatus | null;
  compileFeedback: CompileFeedback | null;
  hasVisitedCodingEnvironment: boolean;
  /** Lines the simulated board printed with Serial.println, newest last (the Serial Monitor shows them). */
  simulatedSerialLines: string[];
}

interface SimulationStoreActions {
  setSimulationState: (patch: Partial<CircuitSimulationState>) => void;
  resetSimulationState: () => void;
  setSimulationControls: (controls: SimulationCanvasControls | null) => void;
  setSimulationStatus: (status: SimulationCanvasStatus | null) => void;
  setCompileFeedback: (feedback: CompileFeedback | null) => void;
  clearCompileFeedback: () => void;
  setHasVisitedCodingEnvironment: (value: boolean) => void;
  appendSimulatedSerialLine: (line: string) => void;
  clearSimulatedSerialLines: () => void;
  resetSimulationStore: () => void;
}

export type SimulationStore = SimulationStoreState & SimulationStoreActions;

const MAX_SIMULATED_SERIAL_LINES = 200;

export const defaultSimulationState: CircuitSimulationState = {
  running: false,
  ready: false,
  error: null,
  digitalPins: {},
  pulseWidths: {},
  analogPins: {},
  netStates: {},
  electricalPins: {},
  pinDetails: {},
  componentVisuals: {},
  busEvents: [],
  traceEvents: [],
  warnings: [],
  capabilities: null,
};

function shallowRecordEqual<T>(left: Record<string, T>, right: Record<string, T>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

function arrayEqual<T>(left: T[], right: T[]) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function simulationStatusEqual(left: SimulationCanvasStatus | null, right: SimulationCanvasStatus | null) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return !left && !right;
  }

  return (
    left.isCompiling === right.isCompiling &&
    left.isRunning === right.isRunning &&
    left.isReady === right.isReady &&
    left.canStart === right.canStart &&
    left.isLoaded === right.isLoaded &&
    left.errorText === right.errorText &&
    left.compileFeedback === right.compileFeedback
  );
}

export function selectCircuitLabSimulationView(state: SimulationStore): CircuitLabSimulationView {
  return {
    running: state.simulationState.running,
    ready: state.simulationState.ready,
    digitalPins: state.simulationState.digitalPins,
    netStates: state.simulationState.netStates,
    componentVisuals: state.simulationState.componentVisuals,
  };
}

export function circuitLabSimulationViewEqual(
  left: CircuitLabSimulationView,
  right: CircuitLabSimulationView
) {
  return (
    left.running === right.running &&
    left.ready === right.ready &&
    shallowRecordEqual(left.digitalPins, right.digitalPins) &&
    shallowRecordEqual(left.netStates, right.netStates) &&
    shallowRecordEqual(left.componentVisuals, right.componentVisuals)
  );
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  simulationState: defaultSimulationState,
  simulationControls: null,
  simulationStatus: null,
  compileFeedback: null,
  hasVisitedCodingEnvironment: false,
  simulatedSerialLines: [],

  setSimulationState: (patch) =>
    set((state) => {
      const nextState: CircuitSimulationState = {
        ...state.simulationState,
        ...patch,
        digitalPins: patch.digitalPins ?? state.simulationState.digitalPins,
        pulseWidths: patch.pulseWidths ?? state.simulationState.pulseWidths,
        analogPins: patch.analogPins ?? state.simulationState.analogPins,
        netStates: patch.netStates ?? state.simulationState.netStates,
        electricalPins: patch.electricalPins ?? state.simulationState.electricalPins,
        pinDetails: patch.pinDetails ?? state.simulationState.pinDetails,
        componentVisuals: patch.componentVisuals ?? state.simulationState.componentVisuals,
        busEvents: patch.busEvents ?? state.simulationState.busEvents,
        traceEvents: patch.traceEvents ?? state.simulationState.traceEvents,
        warnings: patch.warnings ?? state.simulationState.warnings,
        capabilities: patch.capabilities ?? state.simulationState.capabilities,
      };

      const currentState = state.simulationState;
      const hasChanged =
        currentState.running !== nextState.running ||
        currentState.ready !== nextState.ready ||
        currentState.error !== nextState.error ||
        !shallowRecordEqual(currentState.digitalPins, nextState.digitalPins) ||
        !shallowRecordEqual(currentState.pulseWidths, nextState.pulseWidths) ||
        !shallowRecordEqual(currentState.analogPins, nextState.analogPins) ||
        !shallowRecordEqual(currentState.netStates, nextState.netStates) ||
        !shallowRecordEqual(currentState.electricalPins, nextState.electricalPins) ||
        !shallowRecordEqual(currentState.pinDetails, nextState.pinDetails) ||
        !shallowRecordEqual(currentState.componentVisuals, nextState.componentVisuals) ||
        !arrayEqual(currentState.busEvents, nextState.busEvents) ||
        !arrayEqual(currentState.traceEvents, nextState.traceEvents) ||
        !arrayEqual(currentState.warnings, nextState.warnings) ||
        currentState.capabilities !== nextState.capabilities;

      return hasChanged ? { simulationState: nextState } : state;
    }),

  resetSimulationState: () =>
    set((state) => (state.simulationState === defaultSimulationState ? state : { simulationState: defaultSimulationState })),

  setSimulationControls: (controls) =>
    set((state) => (state.simulationControls === controls ? state : { simulationControls: controls })),

  setSimulationStatus: (status) =>
    set((state) => (simulationStatusEqual(state.simulationStatus, status) ? state : { simulationStatus: status })),

  setCompileFeedback: (compileFeedback) =>
    set((state) => (state.compileFeedback === compileFeedback ? state : { compileFeedback })),

  clearCompileFeedback: () =>
    set((state) => (state.compileFeedback === null ? state : { compileFeedback: null })),

  setHasVisitedCodingEnvironment: (value) =>
    set((state) => (state.hasVisitedCodingEnvironment === value ? state : { hasVisitedCodingEnvironment: value })),

  appendSimulatedSerialLine: (line) =>
    set((state) => ({
      // Serial.println ends lines with "\r\n"; the monitor only needs the text.
      simulatedSerialLines: [...state.simulatedSerialLines.slice(-(MAX_SIMULATED_SERIAL_LINES - 1)), line.replace(/\r$/, '')],
    })),

  clearSimulatedSerialLines: () =>
    set((state) => (state.simulatedSerialLines.length === 0 ? state : { simulatedSerialLines: [] })),

  resetSimulationStore: () =>
    set({
      simulationState: defaultSimulationState,
      simulationControls: null,
      simulationStatus: null,
      compileFeedback: null,
      hasVisitedCodingEnvironment: false,
      simulatedSerialLines: [],
    }),
}));
