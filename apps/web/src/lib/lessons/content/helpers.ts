import type { StepCheck } from '../types';

/** Code checks for the C++ the blocks generate (spacing-tolerant). */
export function writesPin(pin: string | number, state: 'HIGH' | 'LOW'): StepCheck {
  return { kind: 'code', pattern: `digitalWrite\\(\\s*${pin}\\s*,\\s*${state}\\s*\\)`, label: `Pin ${pin} is set ${state}` };
}

export function setsOutput(pin: string | number): StepCheck {
  return { kind: 'code', pattern: `pinMode\\(\\s*${pin}\\s*,\\s*OUTPUT\\s*\\)`, label: `Pin ${pin} is an OUTPUT` };
}

export function waits(ms: number): StepCheck {
  return { kind: 'code', pattern: `delay\\(\\s*${ms}\\s*\\)`, label: `Waits ${ms} milliseconds` };
}

export function all(...checks: StepCheck[]): StepCheck {
  return { kind: 'all', checks };
}

// --- Blockly XML for reference solutions (same blocks the toolbox offers learners) ---

/** Chains blocks one after another with <next>. */
function chain(blocks: string[]): string {
  return blocks.reduceRight((rest, block) => (rest ? block.replace(/<\/block>$/, `<next>${rest}</next></block>`) : block), '');
}

const number = (value: number | string) => `<shadow type="math_number"><field name="NUM">${value}</field></shadow>`;

export const program = (...roots: string[]) =>
  `<xml xmlns="https://developers.google.com/blockly/xml"><variables><variable id="var-i">i</variable></variables>${roots.join('')}</xml>`;
export const onStart = (...blocks: string[]) =>
  `<block type="arduino_on_start" x="0" y="0"><statement name="SETUP">${chain(blocks)}</statement></block>`;
export const forever = (...blocks: string[]) =>
  `<block type="arduino_forever" x="0" y="240"><statement name="LOOP">${chain(blocks)}</statement></block>`;
export const pinModeBlock = (pin: number, mode = 'OUTPUT') =>
  `<block type="arduino_pinMode"><field name="PIN">${pin}</field><field name="MODE">${mode}</field></block>`;
export const writeBlock = (pin: number, state: 'HIGH' | 'LOW') =>
  `<block type="arduino_digitalWrite"><field name="PIN">${pin}</field><field name="STATE">${state}</field></block>`;
export const waitBlock = (ms: number) => `<block type="time_delay"><value name="MS">${number(ms)}</value></block>`;
export const ifElseBlock = (condition: string, then: string[], otherwise: string[]) =>
  `<block type="controls_if"><mutation else="1"></mutation><value name="IF0">${condition}</value><statement name="DO0">${chain(then)}</statement><statement name="ELSE">${chain(otherwise)}</statement></block>`;
export const buttonAddBlock = (pin: number) =>
  `<block type="arduino_button_add"><field name="NAME">myButton</field><field name="PIN">${pin}</field></block>`;
export const buttonPressedBlock = () => `<block type="arduino_button_is_pressed"><field name="NAME">myButton</field></block>`;
export const servoAttachBlock = (pin: number) =>
  `<block type="arduino_servo_attach"><field name="NAME">myServo</field><field name="PIN">${pin}</field></block>`;
export const servoWriteBlock = (angle: number | 'i') =>
  `<block type="arduino_servo_set_angle"><field name="NAME">myServo</field><value name="ANGLE">${
    angle === 'i' ? '<block type="variables_get"><field name="VAR" id="var-i">i</field></block>' : number(angle)
  }</value></block>`;
export const countBlock = (from: number, to: number, ...body: string[]) =>
  `<block type="controls_for_loop"><field name="VAR" id="var-i">i</field><value name="FROM">${number(from)}</value><value name="TO">${number(to)}</value><value name="BY">${number(1)}</value><statement name="DO">${chain(body)}</statement></block>`;
export const sonarAddBlock = (trig: number, echo: number) =>
  `<block type="arduino_sonar_add"><field name="NAME">mySonar</field><field name="TRIG">${trig}</field><field name="ECHO">${echo}</field></block>`;
export const sonarReadBlock = () => `<block type="arduino_sonar_read"><field name="UNIT">CM</field><field name="NAME">mySonar</field></block>`;
export const serialBeginBlock = (baud = 9600) => `<block type="arduino_serialBegin"><field name="BAUD">${baud}</field></block>`;
export const serialPrintLineBlock = (value: string) => `<block type="arduino_serialPrintln"><value name="TEXT">${value}</value></block>`;

export const STARTER_BOARD_PARTS = [
  { type: 'ARDUINO_UNO', label: 'Arduino Uno', count: 1 },
  { type: 'BREADBOARD', label: 'Breadboard', count: 1 },
];

export const WIRING_HINT =
  'Click a pin or a breadboard hole to start a wire, then click where it should end. Any hole in the same breadboard column as a leg connects to that leg.';

export const PLACING_HINT =
  'Click a part in the Parts drawer, then click the canvas to place it. Drop a part onto the breadboard holes to plug it in.';
