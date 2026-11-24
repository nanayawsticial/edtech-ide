/**
 * Evaluates lesson step checks against the learner's circuit, code and simulation.
 *
 * Kept free of app imports (types only) so `scripts/validate-lessons.mjs` can run it directly
 * with Node's TypeScript support.
 */

import type { BoardPinRef, StepCheck } from './types';

/** The parts of a resolved pin connection that checks need (see NetlistEngine's PinConnection). */
export interface LessonPinConnection {
  netId: string | null;
  boardPins: string[];
}

export interface LessonCheckContext {
  /** Parts on the canvas, with their canonical type ('LED', 'BUTTON', 'RESISTOR', ...). */
  components: Array<{ id: string; type: string }>;
  /** componentId -> pinId -> connection, as the netlist resolves it. */
  connections: Record<string, Record<string, LessonPinConnection>>;
  /** Code made from the blocks. */
  code: string;
  simulating: boolean;
  /** What happened in the simulation since the current step opened. */
  observations: LessonObservations;
}

export interface LessonObservations {
  /** On/off switches per part type (LED, BUZZER, TRAFFIC_LIGHT, RGB_LED colour changes). */
  toggles: Record<string, number>;
  /** Things shown at least once, e.g. 'TRAFFIC_LIGHT:red', 'RGB_LED:yellow', 'BUZZER:on'. */
  seen: string[];
  servoAngles: number[];
}

export const EMPTY_OBSERVATIONS: LessonObservations = { toggles: {}, seen: [], servoAngles: [] };

/**
 * What one simulation update shows, compared with the previous one: which outputs switched and
 * what is on now. Used by the lesson guide to build up its observations.
 */
export function observeVisualChange(
  type: string,
  visual: Record<string, unknown> | undefined,
  before: Record<string, unknown> | undefined
): { toggles: number; seen: string[]; angle?: number } {
  const flag = (record: Record<string, unknown> | undefined, key: string) => Boolean(record?.[key]);
  switch (type) {
    case 'LED':
      return { toggles: flag(visual, 'outputHigh') !== flag(before, 'outputHigh') ? 1 : 0, seen: flag(visual, 'outputHigh') ? ['LED:on'] : [] };
    case 'BUZZER':
      return { toggles: flag(visual, 'sounding') !== flag(before, 'sounding') ? 1 : 0, seen: flag(visual, 'sounding') ? ['BUZZER:on'] : [] };
    case 'TRAFFIC_LIGHT': {
      const lamps = ['red', 'yellow', 'green'];
      return {
        toggles: lamps.filter((lamp) => flag(visual, lamp) !== flag(before, lamp)).length,
        seen: lamps.filter((lamp) => flag(visual, lamp)).map((lamp) => `TRAFFIC_LIGHT:${lamp}`),
      };
    }
    case 'RGB_LED': {
      const color = typeof visual?.color === 'string' ? visual.color : 'off';
      const previous = typeof before?.color === 'string' ? before.color : 'off';
      return { toggles: color !== previous ? 1 : 0, seen: color !== 'off' ? [`RGB_LED:${color}`] : [] };
    }
    case 'SERVO':
    case 'MICRO_SERVO':
      return { toggles: 0, seen: [], angle: typeof visual?.angle === 'number' ? (visual.angle as number) : undefined };
    default:
      return { toggles: 0, seen: [] };
  }
}

export interface CheckResult {
  label: string;
  passed: boolean;
}

export const PART_LABELS: Record<string, string> = {
  ARDUINO_UNO: 'Arduino Uno',
  BREADBOARD: 'breadboard',
  LED: 'LED',
  BUTTON: 'push button',
  RESISTOR: 'resistor',
  SERVO: 'servo motor',
  ULTRASONIC: 'ultrasonic sensor',
  BUZZER: 'buzzer',
  RGB_LED: 'RGB LED',
  TRAFFIC_LIGHT: 'traffic light',
  LDR: 'light sensor',
  SOUND_SENSOR: 'sound sensor',
};

/** Parts whose name takes "an": an Arduino Uno, an LED, an ultrasonic sensor. */
const AN_PARTS = new Set(['ARDUINO_UNO', 'LED', 'ULTRASONIC', 'RGB_LED']);

const PIN_LABELS: Record<string, Record<string, string>> = {
  LED: { A: '+ (long leg)', C: '− (short leg)' },
  BUZZER: { POS: '+ leg', NEG: '− leg' },
  RGB_LED: { R: 'red leg', G: 'green leg', B: 'blue leg', COM: 'common (longest) leg' },
  TRAFFIC_LIGHT: { R: 'R pin', Y: 'Y pin', G: 'G pin', GND: 'GND pin' },
  LDR: { VCC: 'VCC', GND: 'GND', DO: 'DO', AO: 'AO' },
  SOUND_SENSOR: { VCC: 'VCC', GND: 'GND', DO: 'DOUT', AO: 'AOUT' },
  SERVO: { PWM: 'signal (orange)', VCC: 'power (red)', GND: 'ground (brown)' },
  ULTRASONIC: { VCC: 'VCC', TRIG: 'Trig', ECHO: 'Echo', GND: 'GND' },
};

function partLabel(type: string) {
  return PART_LABELS[type] ?? type.toLowerCase();
}

function boardPinLabel(pin: BoardPinRef) {
  return /^\d+$/.test(pin) ? `pin ${pin}` : pin;
}

export function matchesBoardPin(actual: string, wanted: BoardPinRef) {
  if (wanted === 'GND') {
    return actual === 'GND' || actual.startsWith('GND.');
  }
  return actual === wanted;
}

function reaches(connection: LessonPinConnection | undefined, to: BoardPinRef) {
  return Boolean(connection?.boardPins.some((pin) => matchesBoardPin(pin, to)));
}

function countWired(context: LessonCheckContext, type: string, pin: string | undefined, to: BoardPinRef, viaResistor: boolean) {
  const parts = context.components.filter((component) => component.type === type);
  const resistors = viaResistor ? context.components.filter((component) => component.type === 'RESISTOR') : [];

  return parts.filter((part) => {
    const pinConnections = context.connections[part.id] ?? {};
    const pinIds = pin ? [pin] : Object.keys(pinConnections);

    return pinIds.some((pinId) => {
      const connection = pinConnections[pinId];
      if (reaches(connection, to)) {
        return true;
      }
      if (!connection?.netId) {
        return false;
      }

      // One resistor between the part and the board pin also counts.
      return resistors.some((resistor) => {
        const sides = context.connections[resistor.id] ?? {};
        return (
          (sides.A?.netId === connection.netId && reaches(sides.B, to)) ||
          (sides.B?.netId === connection.netId && reaches(sides.A, to))
        );
      });
    });
  }).length;
}

export function describeCheck(check: StepCheck): string {
  if (check.label) {
    return check.label;
  }

  switch (check.kind) {
    case 'parts': {
      const name = partLabel(check.type);
      const article = AN_PARTS.has(check.type) ? 'an' : 'a';
      return check.count === 1 ? `Add ${article} ${name}` : `Add ${check.count} ${name}s`;
    }
    case 'wired': {
      const pinName = check.pin ? PIN_LABELS[check.type]?.[check.pin] ?? check.pin : null;
      const count = check.count ?? 1;
      const part = count > 1 ? `${count} ${partLabel(check.type)}s` : partLabel(check.type);
      const from = pinName ? `${part} ${pinName}` : part;
      return `${from[0].toUpperCase()}${from.slice(1)} → ${boardPinLabel(check.to)}`;
    }
    case 'code':
      return 'Code is ready';
    case 'simulating':
      return 'Simulation is running';
    case 'blinked':
      return check.type === 'BUZZER'
        ? 'Buzzer beeps on and off'
        : check.type && check.type !== 'LED'
          ? `${partLabel(check.type)[0].toUpperCase()}${partLabel(check.type).slice(1)} changes`
          : 'LED switches on and off';
    case 'seen':
      return `Shows ${check.tokens.map((token) => token.split(':')[1] ?? token).join(', ')}`;
    case 'servoReached':
      return `Servo turns to ${check.angles.join('° and ')}°`;
    case 'all':
      return check.checks.map(describeCheck).join(', ');
  }
}

function evaluateOne(check: StepCheck, context: LessonCheckContext): boolean {
  switch (check.kind) {
    case 'parts':
      return context.components.filter((component) => component.type === check.type).length >= check.count;
    case 'wired':
      return countWired(context, check.type, check.pin, check.to, Boolean(check.viaResistor)) >= (check.count ?? 1);
    case 'code':
      try {
        return new RegExp(check.pattern).test(context.code);
      } catch {
        return false;
      }
    case 'simulating':
      return context.simulating;
    case 'blinked':
      return (context.observations.toggles[check.type ?? 'LED'] ?? 0) >= check.times;
    case 'seen':
      return check.tokens.every((token) => context.observations.seen.includes(token));
    case 'servoReached':
      return check.angles.every((angle) =>
        context.observations.servoAngles.some((seen) => Math.abs(seen - angle) <= 10)
      );
    case 'all':
      return check.checks.every((inner) => evaluateOne(inner, context));
  }
}

/** One checklist row per check (an 'all' check lists its parts), so learners see what's missing. */
export function evaluateCheck(check: StepCheck | undefined, context: LessonCheckContext): CheckResult[] {
  if (!check) {
    return [];
  }
  if (check.kind === 'all' && !check.label) {
    return check.checks.flatMap((inner) => evaluateCheck(inner, context));
  }
  return [{ label: describeCheck(check), passed: evaluateOne(check, context) }];
}
