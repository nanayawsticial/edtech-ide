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

/** C++ statements as regular expressions, for `loopRunsInOrder`. */
export const writeStatement = (pin: number | string, state: 'HIGH' | 'LOW') => `digitalWrite\\(\\s*${pin}\\s*,\\s*${state}\\s*\\);`;
/** "wait 1 seconds" makes the same delay(1000) as "wait 1000 milliseconds", so either block counts. */
export const waitStatement = (ms: number) => `delay\\(\\s*${ms}\\s*\\);`;

/**
 * These statements come one straight after another inside forever (the loop must hold no braces
 * before them). Checks the order, not just that the blocks are there: on, off, wait makes an LED
 * that looks always off.
 */
export function loopRunsInOrder(label: string, ...statements: string[]): StepCheck {
  return { kind: 'code', pattern: `void loop\\(\\)\\s*\\{[^}]*${statements.join('\\s*')}`, label };
}

/** Inside forever, `pin` goes on, then a wait, then off, then a wait, in that order. */
export function blinksInOrder(pin: number, ms = 1000): StepCheck {
  return loopRunsInOrder(
    `Pin ${pin}: on, wait, off, wait, in that order`,
    writeStatement(pin, 'HIGH'),
    waitStatement(ms),
    writeStatement(pin, 'LOW'),
    waitStatement(ms),
  );
}

// --- Wording shared by the numbered block steps ---

/** Opens the first code step of an activity that starts a new circuit. */
export const BLOCKS_INTRO =
  'Click Open Blocks at the top of the screen. Your program has two big blocks: "on start" runs once, when the board switches on, and "forever" runs again and again.';

/** Where the very first block goes: says how to drag, for learners who have never done it. */
export const DRAG_INTO_ON_START = 'Press and hold it, drag it inside "on start", and let go when it clicks into place.';
export const DRAG_INTO_FOREVER = 'Press and hold it, drag it inside "forever", and let go when it clicks into place.';

/** The Start drawer has "wait 1 seconds" just above "wait 1000 milliseconds": point at the right one. */
export const WAIT_MS_FIND = 'Take "wait 1000 milliseconds", just under "wait 1 seconds".';

/** Clearing "forever" before building something new in it. */
export const EMPTY_FOREVER =
  'First empty "forever": drag the top block inside it onto the bin in the bottom-right corner. The blocks under it go with it.';

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

export const analogReadBlock = (pin: string) => `<block type="arduino_analogRead"><field name="PIN">${pin}</field></block>`;
export const digitalReadBlock = (pin: number) => `<block type="arduino_digitalRead"><field name="PIN">${pin}</field></block>`;

export function readsAnalog(pin: string): StepCheck {
  return { kind: 'code', pattern: `analogRead\\(\\s*${pin}\\s*\\)`, label: `Reads ${pin}` };
}

export function readsDigital(pin: number): StepCheck {
  return { kind: 'code', pattern: `digitalRead\\(\\s*${pin}\\s*\\)`, label: `Reads pin ${pin}` };
}

export const startsSerial: StepCheck = { kind: 'code', pattern: 'Serial\\.begin\\(\\s*9600\\s*\\)', label: 'Serial Monitor is started' };
export const printsLine: StepCheck = { kind: 'code', pattern: 'Serial\\.println\\(', label: 'Prints to the Serial Monitor' };

export const RUN_STEP_BODY = 'Click Run Simulation at the top of the Blocks screen, then click Build to watch your circuit.';
export const RERUN_STEP_BODY = 'Click Run Simulation at the top of the Blocks screen (if it is still running, stop it and run it again so it uses your new code), then click Build to watch your circuit.';

export const STARTER_BOARD_PARTS = [
  { type: 'ARDUINO_UNO', label: 'Arduino Uno', count: 1 },
  { type: 'BREADBOARD', label: 'Breadboard', count: 1 },
];

export const WIRING_HINT =
  'Click a pin or a breadboard hole to start a wire, then click where it should end. Any hole in the same breadboard column as a leg connects to that leg.';

export const PLACING_HINT =
  'Click a part in the Parts drawer, then click the canvas to place it. Drop a part onto the breadboard holes to plug it in.';
