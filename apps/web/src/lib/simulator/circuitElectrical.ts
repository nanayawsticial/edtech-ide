/**
 * Electrical model of a Circuit Lab circuit for the DC solver.
 *
 * Each simulation net (wires, breadboard strips, closed switches and buttons already merged) is one
 * node; every net with a GND pin is ground. Board pins become voltage sources with a realistic
 * output resistance; resistors, LEDs, potentiometers, motors and similar parts become elements.
 * The result says how bright each LED is, what the analog pins read, and what would be unsafe.
 */
import type { ComponentData } from '@/contexts/CircuitContext';
import type { ComponentPinMapping } from '@/lib/wiring/NetlistEngine';
import { getComponentDefinition } from '@/lib/wiring/componentDefinitions';
import { isGroundPinId } from '@/lib/wiring/componentConnectivity';

import { solveDc, type DcElement, type DcSolution } from './dcSolver';
import type { PinElectricalState } from './simulationTypes';

export interface ElectricalNet {
  id: string;
  baseNetIds: string[];
  boardPins: string[];
}

export interface ElectricalInputs {
  nets: ElectricalNet[];
  components: ComponentData[];
  resolvedConnections: Record<string, ComponentPinMapping>;
  avrDigitalPins: Record<string, boolean>;
  avrElectricalPins: Record<string, PinElectricalState>;
  /** PWM duty cycle (0..1) per board pin, for analogWrite. */
  pwmDuty?: Record<string, number>;
}

export interface ElectricalResult {
  solution: DcSolution;
  /** Voltage per simulation net id; null when nothing drives the net. */
  netVoltages: Record<string, number | null>;
  /** Current through each part's element, keyed "<componentId>:<element>". */
  currents: Record<string, number>;
  /** LED brightness 0..1 per component id (for RGB and multi-segment parts, per channel). */
  brightness: Record<string, Record<string, number>>;
  /** Board pin -> current it supplies (positive out of the pin), for pins driven by the sketch. */
  pinCurrents: Record<string, number>;
  warnings: string[];
}

/** Output resistance of a microcontroller pin, and of a pull-up resistor. */
const PIN_OHMS = 25;
const PULL_OHMS = 35000;
const RAIL_OHMS = 0.05;
/** Current at which an LED looks fully bright, and above which it would be damaged. */
const LED_FULL_CURRENT = 0.015;
const LED_MAX_CURRENT = 0.03;
/** A microcontroller pin's absolute maximum. */
const PIN_MAX_CURRENT = 0.04;
const SHORT_CURRENT = 0.2;

const LED_FORWARD_VOLTS: Record<string, number> = {
  red: 1.8,
  orange: 2.0,
  yellow: 2.1,
  green: 2.2,
  blue: 3.0,
  white: 3.0,
};

function logicHighVolts(pinId: string) {
  // Pico pins (GP0...) are 3.3 V logic; Arduino Uno pins are 5 V.
  return /^GP\d+$/.test(pinId) ? 3.3 : 5;
}

function supplyVolts(pinId: string): number | null {
  switch (pinId) {
    case '5V':
    case 'VIN':
    case 'VBUS':
    case 'VSYS':
    case 'IOREF':
      return 5;
    case '3.3V':
    case '3V3':
      return 3.3;
    default:
      return null;
  }
}

function parseOhms(value: unknown, fallback: number) {
  const ohms = Number(value);
  return Number.isFinite(ohms) && ohms > 0 ? ohms : fallback;
}

export function solveCircuitElectrically({
  nets,
  components,
  resolvedConnections,
  avrDigitalPins,
  avrElectricalPins,
  pwmDuty = {},
}: ElectricalInputs): ElectricalResult {
  // --- Nodes ---
  const nodeOfBaseNet = new Map<string, number>();
  const nodeOfNet = new Map<string, number>();
  let nextNode = 1;
  nets.forEach((net) => {
    const grounded = net.boardPins.some((pinId) => isGroundPinId(pinId));
    const node = grounded ? 0 : nextNode++;
    nodeOfNet.set(net.id, node);
    net.baseNetIds.forEach((baseNetId) => nodeOfBaseNet.set(baseNetId, node));
  });
  const newNode = () => nextNode++;
  const pinNode = (component: ComponentData, pinId: string): number | null => {
    const netId = resolvedConnections[component.id]?.[pinId]?.netId;
    if (!netId) return null;
    return nodeOfBaseNet.get(netId) ?? null;
  };

  // --- Sources: rails and pins the sketch drives ---
  const elements: DcElement[] = [];
  const pinSources = new Map<string, string>();
  const groundShorts: string[] = [];
  nets.forEach((net) => {
    const node = nodeOfNet.get(net.id) ?? 0;
    if (node === 0) {
      // A rail, or a pin the sketch drives HIGH, on the ground net itself is a dead short.
      net.boardPins.forEach((pinId) => {
        const state = avrElectricalPins[pinId] ?? (pinId in avrDigitalPins ? (avrDigitalPins[pinId] ? 'high' : 'low') : undefined);
        if (supplyVolts(pinId) !== null || state === 'high') {
          groundShorts.push(/^\d+$/.test(pinId) ? `D${pinId}` : pinId);
        }
      });
      return;
    }
    net.boardPins.forEach((pinId) => {
      const rail = supplyVolts(pinId);
      if (rail !== null) {
        elements.push({ kind: 'source', id: `rail:${pinId}`, node, volts: rail, ohms: RAIL_OHMS });
        return;
      }
      const high = logicHighVolts(pinId);
      const state = avrElectricalPins[pinId] ?? (pinId in avrDigitalPins ? (avrDigitalPins[pinId] ? 'high' : 'low') : undefined);
      const id = `pin:${pinId}`;
      if (state === 'high' || state === 'low') {
        const duty = pwmDuty[pinId];
        const volts = typeof duty === 'number' ? high * Math.max(0, Math.min(1, duty)) : state === 'high' ? high : 0;
        elements.push({ kind: 'source', id, node, volts, ohms: PIN_OHMS });
        pinSources.set(pinId, id);
      } else if (state === 'pullup' || state === 'pulldown') {
        elements.push({ kind: 'source', id, node, volts: state === 'pullup' ? high : 0, ohms: PULL_OHMS });
      }
    });
  });

  // --- Parts ---
  const partElements: Array<{ componentId: string; key: string; elementId: string; kind: 'led' | 'other'; name: string }> = [];
  const addPart = (component: ComponentData, key: string, element: DcElement, kind: 'led' | 'other' = 'other') => {
    elements.push(element);
    partElements.push({ componentId: component.id, key, elementId: element.id, kind, name: String(component.state?.name ?? '') });
  };
  const diode = (component: ComponentData, key: string, anode: number | null, cathode: number | null, forwardVolts: number) => {
    if (anode === null || cathode === null) return;
    addPart(component, key, { kind: 'diode', id: `${component.id}:${key}`, anode, cathode, forwardVolts, ohms: 10 }, 'led');
  };
  const resistor = (component: ComponentData, key: string, a: number | null, b: number | null, ohms: number) => {
    if (a === null || b === null) return;
    addPart(component, key, { kind: 'resistor', id: `${component.id}:${key}`, a, b, ohms });
  };
  const groundNodes = new Set([0]);
  const isGroundNode = (node: number | null) => node !== null && groundNodes.has(node);

  components.forEach((component) => {
    const definition = getComponentDefinition(component.type);
    if (!definition) return;
    const node = (pinId: string) => pinNode(component, pinId);
    switch (definition.id) {
      case 'RESISTOR':
        resistor(component, 'R', node('A'), node('B'), parseOhms(component.state?.resistance, 220));
        break;
      case 'LED':
        diode(component, 'LED', node('A'), node('C'), LED_FORWARD_VOLTS[String(component.state?.color ?? 'red')] ?? 1.8);
        break;
      case 'RGB_LED': {
        const common = node('COM');
        // Common anode when the common leg goes to a supply rather than to ground.
        const anodeCommon = common !== null && !isGroundNode(common) && elements.some((element) => element.kind === 'source' && element.node === common && element.id.startsWith('rail:'));
        ([['R', 1.9], ['G', 3.0], ['B', 3.0]] as const).forEach(([pinId, vf]) => {
          if (anodeCommon) diode(component, pinId, common, node(pinId), vf);
          else diode(component, pinId, node(pinId), common, vf);
        });
        break;
      }
      case 'TRAFFIC_LIGHT':
        // The module has a resistor in series with each lamp.
        ([['R', 1.8], ['Y', 2.1], ['G', 2.2]] as const).forEach(([pinId, vf]) => {
          const pin = node(pinId);
          if (pin === null) return;
          const middle = newNode();
          resistor(component, `${pinId}:R`, pin, middle, 220);
          diode(component, pinId, middle, node('GND'), vf);
        });
        break;
      case 'SEVEN_SEGMENT': {
        const anode = String(component.state?.common ?? 'cathode') === 'anode';
        const com1 = node('COM.1');
        const com2 = node('COM.2');
        resistor(component, 'COM', com1, com2, 0.01);
        const common = com1 ?? com2;
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'].forEach((pinId) => {
          if (anode) diode(component, pinId, common, node(pinId), 2.0);
          else diode(component, pinId, node(pinId), common, 2.0);
        });
        break;
      }
      case 'POTENTIOMETER': {
        const position = Math.max(0, Math.min(1, Number(component.state?.value ?? 512) / 1023));
        const total = 10000;
        resistor(component, 'top', node('VCC'), node('OUT'), Math.max(1, total * (1 - position)));
        resistor(component, 'bottom', node('OUT'), node('GND'), Math.max(1, total * position));
        break;
      }
      case 'BUZZER':
        resistor(component, 'coil', node('POS'), node('NEG'), 200);
        break;
      case 'DC_MOTOR':
        resistor(component, 'winding', node('POS'), node('NEG'), 15);
        break;
      default:
        break;
    }
  });

  const solution = solveDc(nextNode, elements);

  // --- Results ---
  const netVoltages: Record<string, number | null> = {};
  nets.forEach((net) => {
    const n = nodeOfNet.get(net.id) ?? 0;
    netVoltages[net.id] = solution.driven[n] ? solution.voltages[n] : null;
  });

  const currents: Record<string, number> = {};
  const brightness: Record<string, Record<string, number>> = {};
  const warnings: string[] = [];
  partElements.forEach(({ componentId, key, elementId, kind, name }) => {
    const current = solution.currents[elementId] ?? 0;
    currents[`${componentId}:${key}`] = current;
    if (kind !== 'led') return;
    const level = Math.max(0, Math.min(1, current / LED_FULL_CURRENT));
    brightness[componentId] = { ...(brightness[componentId] ?? {}), [key]: level < 0.02 ? 0 : level };
    if (current > LED_MAX_CURRENT) {
      const definition = getComponentDefinition(components.find((component) => component.id === componentId)?.type ?? '');
      const label = name || definition?.name || 'An LED';
      warnings.push(`${label}${key !== 'LED' ? ` (${key})` : ''} draws ${Math.round(current * 1000)} mA. A real one would burn out: add a resistor (about 220 Ω) in series.`);
    }
  });

  groundShorts.forEach((label) => {
    warnings.push(`Short circuit: ${label} is wired straight to GND.`);
  });

  const pinCurrents: Record<string, number> = {};
  pinSources.forEach((elementId, pinId) => {
    const current = solution.currents[elementId] ?? 0;
    pinCurrents[pinId] = current;
    const label = /^\d+$/.test(pinId) ? `D${pinId}` : pinId;
    if (Math.abs(current) > SHORT_CURRENT) {
      warnings.push(`Short circuit on pin ${label}: it is wired almost straight to ${current > 0 ? 'ground' : 'power'}.`);
    } else if (Math.abs(current) > PIN_MAX_CURRENT) {
      warnings.push(`Pin ${label} would have to supply ${Math.round(Math.abs(current) * 1000)} mA; a board pin manages about 20 mA (40 mA at most). Use a transistor or a driver module.`);
    }
  });

  return { solution, netVoltages, currents, brightness, pinCurrents, warnings };
}
