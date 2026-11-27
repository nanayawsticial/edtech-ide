import type { Lesson, LessonActivity, LessonStep, StepCheck } from '../types';
import {
  all,
  BLOCKS_INTRO,
  buttonAddBlock,
  buttonPressedBlock,
  DRAG_INTO_ON_START,
  forever,
  ifElseBlock,
  onStart,
  pinModeBlock,
  PLACING_HINT,
  program,
  RERUN_STEP_BODY,
  RUN_STEP_BODY,
  setsOutput,
  STARTER_BOARD_PARTS,
  WAIT_MS_FIND,
  waitBlock,
  waitStatement,
  WIRING_HINT,
  writeBlock,
  writeStatement,
} from './helpers';

// Adapted from the STEMAIDE CODER manuals "3. Push Button" (activities 3.1-3.4).
// The manuals change pins between activities; here the circuit carries over, so the button stays
// on pin 7 and the LEDs go on pins 3, 4, 5 and 6 (pins 7 and 3 come from the first manual's code).

const BUTTON_PIN = 7;
const LED_PINS = [3, 4, 5, 6] as const;

const BUTTON_WIRING_HINT =
  'A push button has two sides. Pressing it joins them. Wire one side to pin 7 and the other side to GND. On the breadboard, place the button across the middle gap so its sides are not already joined.';

const buttonCode: StepCheck = { kind: 'code', pattern: `_pin = ${BUTTON_PIN};`, label: `Button is on pin ${BUTTON_PIN}` };
const readsButton: StepCheck = { kind: 'code', pattern: 'digitalRead\\(\\w+_pin\\) == LOW', label: 'Checks if the button is pressed' };
/** The start of the "do" slot of the if/else on the button, in the C++. */
const IF_PRESSED = 'digitalRead\\(\\w+_pin\\) == LOW\\)*\\s*\\{';

/** `pin` is switched HIGH in "do" (pressed) and LOW in "else" (not pressed), not the other way round. */
function followsButton(pin: number): StepCheck {
  return {
    kind: 'code',
    pattern: `${IF_PRESSED}[^}]*${writeStatement(pin, 'HIGH')}[^}]*\\}\\s*else\\s*\\{[^}]*${writeStatement(pin, 'LOW')}`,
    label: `Pin ${pin}: HIGH in "do", LOW in "else"`,
  };
}

function ledWiring(count: number): StepCheck {
  return all(
    { kind: 'wired', type: 'LED', pin: 'A', to: String(LED_PINS[count - 1]), viaResistor: true },
    { kind: 'wired', type: 'LED', pin: 'C', to: 'GND', count, viaResistor: true, label: count > 1 ? `All ${count} LED − legs → GND` : undefined },
  );
}

function setup(pins: readonly number[]) {
  return onStart(buttonAddBlock(BUTTON_PIN), ...pins.map((pin) => pinModeBlock(pin)));
}

function lightWhilePressed(pins: readonly number[]) {
  return program(
    setup(pins),
    forever(
      ifElseBlock(
        buttonPressedBlock(),
        pins.map((pin) => writeBlock(pin, 'HIGH')),
        pins.map((pin) => writeBlock(pin, 'LOW')),
      ),
    ),
  );
}

function cppFor(pins: readonly number[]) {
  const on = pins.map((pin) => `  digitalWrite(${pin}, HIGH);`).join('\n');
  const off = pins.map((pin) => `  digitalWrite(${pin}, LOW);`).join('\n');
  return `pinMode(${BUTTON_PIN}, INPUT_PULLUP);\n\nif (digitalRead(${BUTTON_PIN}) == LOW) {\n${on}\n} else {\n${off}\n}`;
}

const RUN_AGAIN: LessonStep = { id: 'run', kind: 'run', title: 'Run the simulation', body: RERUN_STEP_BODY, check: { kind: 'simulating' } };

/** Adds one more LED pin to the button program: set it up, HIGH in "do", LOW in "else". */
function addLedStep(pin: number, pins: readonly number[]): LessonStep {
  return {
    id: 'code',
    kind: 'code',
    title: `Add pin ${pin}`,
    body: `Keep all your blocks. Get pin ${pin} ready, then switch it on in "do" and off in "else", like the other LEDs.`,
    build: [
      {
        type: 'arduino_pinMode',
        group: 'output',
        block: 'set pin ▾ to OUTPUT ▾',
        place: 'Snap it inside "on start", under the last "set pin" block.',
        set: `Choose pin ${pin}. Leave OUTPUT.`,
      },
      {
        type: 'arduino_digitalWrite',
        group: 'output',
        block: 'digital write pin ▾ to HIGH ▾',
        place: 'Snap it in the "do" slot, under the last block there.',
        set: `Choose pin ${pin}. Leave HIGH.`,
      },
      {
        type: 'arduino_digitalWrite',
        group: 'output',
        block: 'digital write pin ▾ to HIGH ▾',
        place: 'Snap it in the "else" slot, under the last block there.',
        set: `Choose pin ${pin}, then change HIGH to LOW.`,
      },
    ],
    picture: lightWhilePressed(pins),
    expect: `All ${pins.length} LEDs light together while the button is held, and go off together when you let go.`,
    cpp: cppFor(pins),
    hint: 'Quicker: right-click a "digital write" block and choose Duplicate, then change the pin number on the copy.',
    check: all(readsButton, setsOutput(pin), ...pins.map((p) => followsButton(p))),
  };
}

const first: LessonActivity = {
  id: 'button-1',
  title: 'Press to light one LED',
  goal: 'Light an LED only while a push button is held down. Let go and it switches off.',
  realWorld: 'A bedside light that glows while you hold the button, so you can find your way without fumbling for a switch.',
  parts: [
    ...STARTER_BOARD_PARTS,
    { type: 'BUTTON', label: 'Push button', count: 1 },
    { type: 'LED', label: 'LED', count: 1 },
    { type: 'RESISTOR', label: 'Resistor (optional)', count: 1 },
  ],
  learningLevel: 'builder',
  steps: [
    {
      id: 'place',
      kind: 'place',
      title: 'Place the parts',
      body: 'Add an Arduino Uno, a breadboard, a push button and an LED. Plug the button and the LED into the breadboard.',
      hint: PLACING_HINT,
      check: all(
        { kind: 'parts', type: 'ARDUINO_UNO', count: 1 },
        { kind: 'parts', type: 'BREADBOARD', count: 1 },
        { kind: 'parts', type: 'BUTTON', count: 1 },
        { kind: 'parts', type: 'LED', count: 1 },
      ),
    },
    {
      id: 'wire-button',
      kind: 'wire',
      title: 'Wire the button',
      body: 'Connect one side of the button to pin 7, and the other side to GND.',
      hint: BUTTON_WIRING_HINT,
      check: all(
        { kind: 'wired', type: 'BUTTON', to: String(BUTTON_PIN), label: 'Button → pin 7' },
        { kind: 'wired', type: 'BUTTON', to: 'GND', label: 'Button → GND' },
      ),
    },
    {
      id: 'wire-led',
      kind: 'wire',
      title: 'Wire the LED',
      body: "Connect the LED's + leg to pin 3 and its − leg to GND. On a real board, put a resistor between pin 3 and the + leg to protect the LED.",
      hint: WIRING_HINT,
      check: ledWiring(1),
    },
    {
      id: 'code-button',
      kind: 'code',
      title: 'Tell the board about the button',
      body: `${BLOCKS_INTRO} In "on start", tell the board where the button and the LED are.`,
      build: [
        {
          type: 'arduino_button_add',
          group: 'output',
          block: 'add button myButton on pin ▾',
          place: DRAG_INTO_ON_START,
          set: 'Leave the name myButton. Click the pin number and choose 7.',
        },
        {
          type: 'arduino_pinMode',
          group: 'output',
          block: 'set pin ▾ to OUTPUT ▾',
          place: 'Snap it under the "add button" block.',
          set: "Choose pin 3, the LED's pin. Leave OUTPUT.",
        },
      ],
      picture: program(setup([3]), forever()),
      expect: 'Nothing happens yet: the board now knows where the button and the LED are. The next step makes them work together.',
      cpp: `pinMode(${BUTTON_PIN}, INPUT_PULLUP);\npinMode(3, OUTPUT);`,
      hint: 'INPUT_PULLUP means the pin reads HIGH normally and LOW while the button joins it to GND.',
      check: all(buttonCode, setsOutput(3)),
    },
    {
      id: 'code-decide',
      kind: 'code',
      title: 'Light the LED while pressed',
      body: 'In "forever", the board asks a question again and again: is the button pressed? If it is, switch the LED on. If not ("else"), switch it off.',
      build: [
        {
          type: 'controls_if',
          group: 'decide',
          block: 'if … do … else',
          place: 'Take the one with "else" in it. Drag it inside "forever".',
        },
        {
          type: 'arduino_button_is_pressed',
          group: 'output',
          block: 'is myButton pressed?',
          place: 'Drop it into the gap next to "if".',
        },
        {
          type: 'arduino_digitalWrite',
          group: 'output',
          block: 'digital write pin ▾ to HIGH ▾',
          place: 'Snap it into the "do" slot.',
          set: 'Choose pin 3. Leave HIGH.',
        },
        {
          type: 'arduino_digitalWrite',
          group: 'output',
          block: 'digital write pin ▾ to HIGH ▾',
          place: 'Snap it into the "else" slot.',
          set: 'Choose pin 3, then change HIGH to LOW.',
        },
      ],
      picture: lightWhilePressed([3]),
      expect: 'The LED lights while you hold the button down, and goes off when you let go.',
      cpp: cppFor([3]),
      check: all(readsButton, followsButton(3)),
    },
    { id: 'run', kind: 'run', title: 'Run the simulation', body: RUN_STEP_BODY, check: { kind: 'simulating' } },
    {
      id: 'observe',
      kind: 'observe',
      title: 'Press the button',
      body: 'Click the button on the canvas to press it, and click it again to let go. The LED should follow the button.',
      check: { kind: 'blinked', times: 2 },
    },
  ],
  solution: lightWhilePressed([3]),
  observe: 'The LED is on while the button is pressed and off when it is released.',
  wrapUp: 'Your program now reacts to a person. Reading an input and deciding what to do is the heart of every interactive gadget.',
};

const MORE: Array<Pick<LessonActivity, 'title' | 'goal' | 'realWorld' | 'observe' | 'wrapUp'>> = [
  {
    title: 'Press to light two LEDs',
    goal: 'Add a second LED. One press lights both LEDs together.',
    realWorld: 'A doorbell light: one LED outside and one inside light up together, so people inside know someone is at the door.',
    observe: 'Both LEDs light up together while the button is pressed.',
    wrapUp: 'One input can control many outputs at once.',
  },
  {
    title: 'Press to light three LEDs',
    goal: 'Add a third LED. The button now controls all three.',
    realWorld: 'Party decorations that light up all their colours when a guest presses a button.',
    observe: 'All three LEDs light up while the button is pressed.',
    wrapUp: 'Adding outputs to a decision is just adding blocks to "do" and "else".',
  },
];

function more(index: number): LessonActivity {
  const count = index + 1;
  const pin = LED_PINS[index];
  const pins = LED_PINS.slice(0, count);
  const text = MORE[index - 1];

  return {
    id: `button-${count}`,
    ...text,
    parts: [...STARTER_BOARD_PARTS, { type: 'BUTTON', label: 'Push button', count: 1 }, { type: 'LED', label: 'LED', count }],
    learningLevel: 'builder',
    solution: lightWhilePressed(pins),
    steps: [
      {
        id: 'place',
        kind: 'place',
        title: `Add LED number ${count}`,
        body: 'Keep your circuit. Plug one more LED into the breadboard.',
        hint: PLACING_HINT,
        check: { kind: 'parts', type: 'LED', count },
      },
      {
        id: 'wire',
        kind: 'wire',
        title: `Wire it to pin ${pin} and GND`,
        body: `Connect the new LED's + leg to pin ${pin} and its − leg to GND.`,
        hint: WIRING_HINT,
        check: ledWiring(count),
      },
      addLedStep(pin, pins),
      RUN_AGAIN,
      {
        id: 'observe',
        kind: 'observe',
        title: 'Press the button',
        body: 'Click the button to press it, and again to let go.',
        check: { kind: 'blinked', times: count * 2 },
      },
    ],
  };
}

const flashing = program(
  setup(LED_PINS),
  forever(
    ifElseBlock(
      buttonPressedBlock(),
      [...LED_PINS.map((pin) => writeBlock(pin, 'HIGH')), waitBlock(500), ...LED_PINS.map((pin) => writeBlock(pin, 'LOW')), waitBlock(500)],
      LED_PINS.map((pin) => writeBlock(pin, 'LOW')),
    ),
  ),
);

const blinkWhileHeld: LessonActivity = {
  id: 'button-4',
  title: 'Hold to flash four LEDs',
  goal: 'Add a fourth LED. While the button is held, all four LEDs flash on and off together.',
  realWorld: 'Room lighting effects: hold a button and the lights around the room flash to change the mood.',
  parts: [...STARTER_BOARD_PARTS, { type: 'BUTTON', label: 'Push button', count: 1 }, { type: 'LED', label: 'LED', count: 4 }],
  learningLevel: 'builder',
  steps: [
    {
      id: 'place',
      kind: 'place',
      title: 'Add LED number 4',
      body: 'Keep your circuit. Plug a fourth LED into the breadboard.',
      hint: PLACING_HINT,
      check: { kind: 'parts', type: 'LED', count: 4 },
    },
    {
      id: 'wire',
      kind: 'wire',
      title: 'Wire it to pin 6 and GND',
      body: "Connect the new LED's + leg to pin 6 and its − leg to GND.",
      hint: WIRING_HINT,
      check: ledWiring(4),
    },
    { ...addLedStep(6, LED_PINS), id: 'code-add' },
    {
      id: 'code',
      kind: 'code',
      title: 'Flash while held',
      body: 'Now make the LEDs flash while the button is held. In "do", under the four HIGH blocks, add: wait, all four off, wait. Leave "else" as it is.',
      build: [
        {
          type: 'time_delay',
          group: 'start',
          block: 'wait 1000 milliseconds',
          find: WAIT_MS_FIND,
          place: 'Snap it in "do", under "digital write pin 6 to HIGH".',
          set: 'Change 1000 to 500: half a second.',
        },
        ...LED_PINS.map((pin, index) => ({
          type: 'arduino_digitalWrite',
          group: 'output' as const,
          block: 'digital write pin ▾ to HIGH ▾',
          place: index === 0 ? 'Snap it under the "wait" block.' : 'Snap it under the last block in "do".',
          set: `Choose pin ${pin}, then change HIGH to LOW.`,
        })),
        {
          type: 'time_delay',
          group: 'start',
          block: 'wait 1000 milliseconds',
          find: WAIT_MS_FIND,
          place: 'Snap it at the bottom of "do".',
          set: 'Change 1000 to 500.',
        },
      ],
      picture: flashing,
      expect: 'While you hold the button, all four LEDs flash on and off together. Let go and they stay off.',
      cpp: `pinMode(${BUTTON_PIN}, INPUT_PULLUP);\n\nif (digitalRead(${BUTTON_PIN}) == LOW) {\n  digitalWrite(3, HIGH); digitalWrite(4, HIGH);\n  digitalWrite(5, HIGH); digitalWrite(6, HIGH);\n  delay(500);\n  digitalWrite(3, LOW); digitalWrite(4, LOW);\n  digitalWrite(5, LOW); digitalWrite(6, LOW);\n  delay(500);\n} else {\n  // all four LOW\n}`,
      hint: 'Because "forever" repeats, the flashing keeps going for as long as the button is held.',
      check: all(readsButton, {
        kind: 'code',
        pattern: `${IF_PRESSED}\\s*${[
          ...LED_PINS.map((pin) => writeStatement(pin, 'HIGH')),
          waitStatement(500),
          ...LED_PINS.map((pin) => writeStatement(pin, 'LOW')),
          waitStatement(500),
        ].join('\\s*')}`,
        label: 'In "do": all four on, wait, all four off, wait',
      }),
    },
    RUN_AGAIN,
    {
      id: 'observe',
      kind: 'observe',
      title: 'Hold the button',
      body: 'Click the button to hold it down. The LEDs flash together until you click it again to let go.',
      check: { kind: 'blinked', times: 16 },
    },
  ],
  solution: flashing,
  observe: 'All four LEDs flash together for as long as the button is held.',
  wrapUp: 'You combined a decision with a repeating pattern. Many devices work like this: do something over and over while a condition is true.',
};

export const pushButtonLesson: Lesson = {
  slug: 'push-button',
  title: 'Push Button',
  source: 'STEMAIDE CODER manual: Push Button',
  activities: [first, more(1), more(2), blinkWhileHeld],
};
