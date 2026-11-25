import type { Lesson, LessonActivity, StepCheck } from '../types';
import {
  all,
  buttonAddBlock,
  buttonPressedBlock,
  forever,
  ifElseBlock,
  onStart,
  PLACING_HINT,
  program,
  STARTER_BOARD_PARTS,
  waitBlock,
  waits,
  WIRING_HINT,
  writeBlock,
  writesPin,
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

function ledWiring(count: number): StepCheck {
  return all(
    { kind: 'wired', type: 'LED', pin: 'A', to: String(LED_PINS[count - 1]), viaResistor: true },
    { kind: 'wired', type: 'LED', pin: 'C', to: 'GND', count, viaResistor: true, label: count > 1 ? `All ${count} LED − legs → GND` : undefined },
  );
}

function lightWhilePressed(pins: readonly number[]) {
  return program(
    onStart(buttonAddBlock(BUTTON_PIN)),
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
      body: 'Open Blocks. From Output, drag "add button on pin" into setup. Keep the name myButton and pick pin 7.',
      blocks: ['setup', 'add button myButton on pin 7'],
      cpp: `pinMode(${BUTTON_PIN}, INPUT_PULLUP);`,
      hint: 'INPUT_PULLUP means the pin reads HIGH normally and LOW while the button joins it to GND.',
      check: buttonCode,
    },
    {
      id: 'code-decide',
      kind: 'code',
      title: 'Light the LED while pressed',
      body: 'In loop, add "if do else" from Decide. Put "is myButton pressed?" in the if. In "do", set pin 3 HIGH. In "else", set pin 3 LOW.',
      blocks: ['loop', 'if do else', 'is myButton pressed?', 'digital write pin 3 to HIGH', 'digital write pin 3 to LOW'],
      cpp: cppFor([3]),
      check: all(readsButton, writesPin(3, 'HIGH'), writesPin(3, 'LOW')),
    },
    {
      id: 'run',
      kind: 'run',
      title: 'Run the simulation',
      body: 'Click Run Simulation at the top of the Blocks screen, then click Build to watch your circuit.',
      check: { kind: 'simulating' },
    },
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
      {
        id: 'code',
        kind: 'code',
        title: `Add pin ${pin}`,
        body: `In "do", add a block that sets pin ${pin} HIGH. In "else", add one that sets pin ${pin} LOW.`,
        blocks: [`digital write pin ${pin} to HIGH`, `digital write pin ${pin} to LOW`],
        cpp: cppFor(pins),
        check: all(readsButton, ...pins.flatMap((p) => [writesPin(p, 'HIGH'), writesPin(p, 'LOW')])),
      },
      {
        id: 'run',
        kind: 'run',
        title: 'Run the simulation',
        body: 'Click Run Simulation at the top of the Blocks screen (if it is still running, stop it and run it again so it uses your new code), then click Build to watch your circuit.',
        check: { kind: 'simulating' },
      },
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
    {
      id: 'code',
      kind: 'code',
      title: 'Flash while held',
      body: 'In "do": set pins 3, 4, 5 and 6 HIGH, wait 500 milliseconds, set them all LOW, wait 500 milliseconds. Keep "else" setting them all LOW.',
      blocks: ['digital write pin 3 to HIGH', '…pins 4, 5, 6 HIGH', 'wait 500 milliseconds', 'digital write pin 3 to LOW', '…pins 4, 5, 6 LOW', 'wait 500 milliseconds'],
      cpp: `pinMode(${BUTTON_PIN}, INPUT_PULLUP);\n\nif (digitalRead(${BUTTON_PIN}) == LOW) {\n  digitalWrite(3, HIGH); digitalWrite(4, HIGH);\n  digitalWrite(5, HIGH); digitalWrite(6, HIGH);\n  delay(500);\n  digitalWrite(3, LOW); digitalWrite(4, LOW);\n  digitalWrite(5, LOW); digitalWrite(6, LOW);\n  delay(500);\n} else {\n  // all four LOW\n}`,
      hint: 'Because loop repeats forever, the flashing keeps going for as long as the button is held.',
      check: all(readsButton, ...LED_PINS.flatMap((p) => [writesPin(p, 'HIGH'), writesPin(p, 'LOW')]), waits(500)),
    },
    {
      id: 'run',
      kind: 'run',
      title: 'Run the simulation',
      body: 'Click Run Simulation at the top of the Blocks screen (if it is still running, stop it and run it again so it uses your new code), then click Build to watch your circuit.',
      check: { kind: 'simulating' },
    },
    {
      id: 'observe',
      kind: 'observe',
      title: 'Hold the button',
      body: 'Click the button to hold it down. The LEDs flash together until you click it again to let go.',
      check: { kind: 'blinked', times: 16 },
    },
  ],
  solution: program(
    onStart(buttonAddBlock(BUTTON_PIN)),
    forever(
      ifElseBlock(
        buttonPressedBlock(),
        [
          ...LED_PINS.map((pin) => writeBlock(pin, 'HIGH')),
          waitBlock(500),
          ...LED_PINS.map((pin) => writeBlock(pin, 'LOW')),
          waitBlock(500),
        ],
        LED_PINS.map((pin) => writeBlock(pin, 'LOW')),
      ),
    ),
  ),
  observe: 'All four LEDs flash together for as long as the button is held.',
  wrapUp: 'You combined a decision with a repeating pattern. Many devices work like this: do something over and over while a condition is true.',
};

export const pushButtonLesson: Lesson = {
  slug: 'push-button',
  title: 'Push Button',
  source: 'STEMAIDE CODER manual: Push Button',
  activities: [first, more(1), more(2), blinkWhileHeld],
};
