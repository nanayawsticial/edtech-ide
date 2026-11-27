import { create } from 'zustand';
import { CircuitNetlist, NetlistEngine, ComponentPinMapping } from '@/lib/wiring/NetlistEngine';
import {
  buildCodingCircuitSnapshot,
  EMPTY_CODING_CIRCUIT_SNAPSHOT,
  type CodingCircuitSnapshot,
} from '@/lib/blockly/circuitAwareness';
import {
  type ComponentData,
  type NetData,
  type CircuitData,
} from '@/contexts/CircuitContext';
import { getNetFromNodeId, getNetToNodeId } from '@/lib/circuit/netData';
import type { MountedPlacement } from '@/lib/wiring/mountingTypes';
import { createMountedPlacement, getBreadboardMountPreview } from '@/lib/wiring/breadboardMounting';
import { getBoardNodePrefix, parseBoardNodeId } from '@/lib/wiring/boardNodes';
import { isBreadboardNodeId } from '@/lib/wiring/breadboardModel';
import { normalizeComponentType } from '@/lib/wiring/componentDefinitions';

interface CircuitStoreState {
  components: ComponentData[];
  nets: NetData[];
  netlist: CircuitNetlist;
  resolvedConnections: Record<string, ComponentPinMapping>;
  codingSnapshot: CodingCircuitSnapshot;
  selectedComponentId: string | null;
}

interface CircuitStoreActions {
  addComponent: (component: ComponentData) => void;
  removeComponent: (id: string) => void;
  updateComponentPosition: (id: string, x: number, y: number, mountedPlacement?: MountedPlacement | null) => void;
  /** Moves several parts in one undo step, keeping their breadboard mounts (used when a breadboard carries its parts). */
  moveComponentsTogether: (moves: Array<{ id: string; x: number; y: number }>) => void;
  updateComponentState: (
    id: string,
    updater: Record<string, any> | ((previousState: Record<string, any>) => Record<string, any>)
  ) => void;
  /** A learner's edit to a part's settings (colour, value, name): undoable. Undefined removes a key. */
  setComponentProperties: (id: string, patch: Record<string, unknown>) => void;
  addNet: (net: NetData) => void;
  removeNet: (id: string) => void;
  /** Removes several parts and wires as one undo step (wires on removed parts go too). */
  removeItems: (componentIds: string[], netIds: string[]) => void;
  updateNet: (id: string, updater: Partial<NetData>) => void;
  setCircuitData: (data: CircuitData, skipHistory?: boolean) => void;
  clearCircuit: () => void;
  /** Turns a part a quarter turn: clockwise by default, anticlockwise with direction -1. */
  rotateComponent: (id: string, direction?: 1 | -1) => void;
  /** Adds several parts and wires as one undo step (paste and duplicate). */
  addItems: (components: ComponentData[], nets: NetData[]) => void;
  selectComponent: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
}

interface HistoryState {
  past: CircuitData[];
  future: CircuitData[];
}

export type CircuitStore = CircuitStoreState & CircuitStoreActions & HistoryState;

const emptyNetlist: CircuitNetlist = { nets: [] };

function deriveCircuit(components: ComponentData[], nets: NetData[]) {
  const netlist = NetlistEngine.generateNetlist(components, nets);
  const resolvedConnections = NetlistEngine.resolveConnections(components, nets);
  const codingSnapshot = buildCodingCircuitSnapshot(components, nets, netlist, resolvedConnections);
  return { netlist, resolvedConnections, codingSnapshot };
}

function hasStateChanged(previous: Record<string, any>, next: Record<string, any>) {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);

  if (previousKeys.length !== nextKeys.length) {
    return true;
  }

  return nextKeys.some((key) => previous[key] !== next[key]);
}

function mountedPlacementsEqual(left?: MountedPlacement | null, right?: MountedPlacement | null) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return !left && !right;
  }

  if (
    left.componentId !== right.componentId ||
    left.mounted !== right.mounted ||
    left.footprintType !== right.footprintType ||
    left.rotation !== right.rotation ||
    left.pinMap.length !== right.pinMap.length
  ) {
    return false;
  }

  return left.pinMap.every((entry, index) => {
    const next = right.pinMap[index];
    return Boolean(next) && entry.pinId === next.pinId && entry.nodeId === next.nodeId;
  });
}

function isComponentOwnedNode(nodeId: string, componentId: string) {
  return nodeId.startsWith(`${componentId}.`);
}

/**
 * Whether a wire end sits on one of `component`'s pins. Part pins are named "<id>.<pin>", but board
 * pins ("UNO_13") and breadboard holes ("BB_...") are named by kind, so removing the board or the
 * breadboard must also catch those, or its wires stay behind with nothing to attach to.
 */
function isNodeOnComponent(nodeId: string, component: ComponentData) {
  if (isComponentOwnedNode(nodeId, component.id)) {
    return true;
  }
  const type = normalizeComponentType(component.type);
  if (type === 'BREADBOARD') {
    return isBreadboardNodeId(nodeId);
  }
  const board = parseBoardNodeId(nodeId);
  return Boolean(board) && board?.prefix === getBoardNodePrefix(type);
}

export const useCircuitStore = create<CircuitStore>((set) => ({
  components: [],
  nets: [],
  netlist: emptyNetlist,
  resolvedConnections: {},
  codingSnapshot: EMPTY_CODING_CIRCUIT_SNAPSHOT,
  selectedComponentId: null,
  past: [],
  future: [],

  addComponent: (component) =>
    set((state) => {
      const components = [...state.components, component];
      return {
        components,
        ...deriveCircuit(components, state.nets),
        past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
        future: [],
      };
    }),

  removeComponent: (id) =>
    set((state) => {
      const removed = state.components.find((component) => component.id === id);
      const components = state.components.filter((component) => component.id !== id);
      const nets = state.nets.filter((net) => {
        if (!removed) return true;
        return !isNodeOnComponent(getNetFromNodeId(net), removed) && !isNodeOnComponent(getNetToNodeId(net), removed);
      });
      return {
        components,
        nets,
        ...deriveCircuit(components, nets),
        selectedComponentId: state.selectedComponentId === id ? null : state.selectedComponentId,
        past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
        future: [],
      };
    }),

  updateComponentPosition: (id, x, y, mountedPlacement) =>
    set((state) => {
      let didChange = false;
      const components = state.components.map((component) => {
        if (component.id !== id) {
          return component;
        }

        const nextMountedPlacement = mountedPlacement === undefined
          ? component.x === x && component.y === y
            ? component.mountedPlacement
            : null
          : mountedPlacement;
        if (component.x === x && component.y === y && mountedPlacementsEqual(component.mountedPlacement, nextMountedPlacement)) {
          return component;
        }

        didChange = true;
        return { ...component, x, y, mountedPlacement: nextMountedPlacement };
      });

      if (!didChange) {
        return state;
      }

      return {
        components,
        ...deriveCircuit(components, state.nets),
        past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
        future: [],
      };
    }),

  moveComponentsTogether: (moves) =>
    set((state) => {
      const moveById = new Map(moves.map((move) => [move.id, move]));
      let didChange = false;
      const components = state.components.map((component) => {
        const move = moveById.get(component.id);
        if (!move || (component.x === move.x && component.y === move.y)) {
          return component;
        }

        didChange = true;
        return { ...component, x: move.x, y: move.y };
      });

      if (!didChange) {
        return state;
      }

      return {
        components,
        ...deriveCircuit(components, state.nets),
        past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
        future: [],
      };
    }),

  updateComponentState: (id, updater) =>
    set((state) => {
      let didChange = false;
      const components = state.components.map((component) => {
        if (component.id !== id) {
          return component;
        }

        const previousState = component.state || {};
        const patch = typeof updater === 'function' ? updater(previousState) : updater;
        const nextState = { ...previousState, ...patch };

        if (!hasStateChanged(previousState, nextState)) {
          return component;
        }

        didChange = true;
        return { ...component, state: nextState };
      });

      if (!didChange) {
        return state;
      }

      return { components };
    }),

  setComponentProperties: (id, patch) =>
    set((state) => {
      let didChange = false;
      const components = state.components.map((component) => {
        if (component.id !== id) {
          return component;
        }
        const nextState: Record<string, any> = { ...(component.state || {}) };
        Object.entries(patch).forEach(([key, value]) => {
          if (value === undefined) delete nextState[key];
          else nextState[key] = value;
        });
        if (!hasStateChanged(component.state || {}, nextState)) {
          return component;
        }
        didChange = true;
        return { ...component, state: nextState };
      });
      if (!didChange) {
        return state;
      }
      return {
        components,
        ...deriveCircuit(components, state.nets),
        past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
        future: [],
      };
    }),

  addNet: (net) =>
    set((state) => {
      const nets = [...state.nets, net];
      return {
        nets,
        ...deriveCircuit(state.components, nets),
        past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
        future: [],
      };
    }),

  removeNet: (id) =>
    set((state) => {
      const nets = state.nets.filter((net) => net.id !== id);
      return {
        nets,
        ...deriveCircuit(state.components, nets),
        past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
        future: [],
      };
    }),

  removeItems: (componentIds, netIds) =>
    set((state) => {
      const removedComponents = new Set(componentIds);
      const removedNets = new Set(netIds);
      if (removedComponents.size === 0 && removedNets.size === 0) {
        return state;
      }

      const removedParts = state.components.filter((component) => removedComponents.has(component.id));
      const ownedByRemoved = (nodeId: string) => removedParts.some((component) => isNodeOnComponent(nodeId, component));
      const components = state.components.filter((component) => !removedComponents.has(component.id));
      const nets = state.nets.filter(
        (net) => !removedNets.has(net.id) && !ownedByRemoved(getNetFromNodeId(net)) && !ownedByRemoved(getNetToNodeId(net))
      );
      return {
        components,
        nets,
        ...deriveCircuit(components, nets),
        selectedComponentId:
          state.selectedComponentId && removedComponents.has(state.selectedComponentId) ? null : state.selectedComponentId,
        past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
        future: [],
      };
    }),

  updateNet: (id, updater) =>
    set((state) => {
      const nets = state.nets.map((net) =>
        net.id === id ? { ...net, ...updater } : net
      );
      return {
        nets,
        ...deriveCircuit(state.components, nets),
        past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
        future: [],
      };
    }),

  setCircuitData: (data, skipHistory = false) =>
    set((state) => ({
      components: data.components,
      nets: data.nets,
      ...deriveCircuit(data.components, data.nets),
      past: skipHistory ? state.past : [...state.past, { components: state.components, nets: state.nets }].slice(-50),
      future: skipHistory ? state.future : [],
    })),

  clearCircuit: () =>
    set((state) => ({
      components: [],
      nets: [],
      ...deriveCircuit([], []),
      selectedComponentId: null,
      past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
      future: [],
    })),

  addItems: (newComponents, newNets) =>
    set((state) => {
      if (newComponents.length === 0 && newNets.length === 0) {
        return state;
      }
      const components = [...state.components, ...newComponents];
      const nets = [...state.nets, ...newNets];
      return {
        components,
        nets,
        ...deriveCircuit(components, nets),
        past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
        future: [],
      };
    }),

  rotateComponent: (id, direction = 1) =>
    set((state) => {
      let didChange = false;
      const components = state.components.map((component) => {
        if (component.id !== id) {
          return component;
        }

        const nextRotation = ((((component.rotation || 0) + 90 * direction) % 360) + 360) % 360;
        if (component.mountedPlacement?.mounted) {
          const preview = getBreadboardMountPreview(
            component,
            { x: component.x, y: component.y, rotation: nextRotation },
            state.components
          );

          if (!preview?.isValid) {
            return component;
          }

          didChange = true;
          return {
            ...component,
            x: preview.position.x,
            y: preview.position.y,
            rotation: nextRotation,
            mountedPlacement: createMountedPlacement(component.id, nextRotation, preview),
          };
        }

        didChange = true;
        return {
          ...component,
          rotation: nextRotation,
          mountedPlacement: null,
        };
      });

      if (!didChange) {
        return state;
      }

      return {
        components,
        ...deriveCircuit(components, state.nets),
        past: [...state.past, { components: state.components, nets: state.nets }].slice(-50),
        future: [],
      };
    }),

  selectComponent: (id) => set({ selectedComponentId: id }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) {
        return state;
      }

      const previous = state.past[state.past.length - 1];
      return {
        components: previous.components,
        nets: previous.nets,
        ...deriveCircuit(previous.components, previous.nets),
        past: state.past.slice(0, state.past.length - 1),
        future: [{ components: state.components, nets: state.nets }, ...state.future],
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) {
        return state;
      }

      const next = state.future[0];
      return {
        components: next.components,
        nets: next.nets,
        ...deriveCircuit(next.components, next.nets),
        past: [...state.past, { components: state.components, nets: state.nets }],
        future: state.future.slice(1),
      };
    }),
}));
