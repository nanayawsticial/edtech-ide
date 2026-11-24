import type { Lesson, LessonActivity, LessonStep } from '../types';
import {
  all,
  forever,
  onStart,
  pinModeBlock,
  PLACING_HINT,
  program,
  setsOutput,
  STARTER_BOARD_PARTS,
  waitBlock,
  waits,
  WIRING_HINT,
  writeBlock,
  writesPin,
} from './helpers';

// Adapted from the STEMAIDE CODER manuals "1. Light Emitting Diode (LED)" (activities 1-5).
// Each activity adds one LED to the same circuit, on the pins the manuals use: 6, 5, 4, 3, 2.

const LED_PINS = [6, 5, 4, 3, 2] as const;

function blinkSequence(pins: readonly number[]) {
  return program(
    onStart(...pins.map((pin) => pinModeBlock(pin))),
    forever(...pins.flatMap((pin) => [writeBlock(pin, 'HIGH'), waitBlock(1000), writeBlock(pin, 'LOW'), waitBlock(1000)])),
  );
}

const firstActivity: LessonActivity = {
  id: 'led-1',
  title: 'Blink one LED',
  goal: 'Make an LED switch on and off every second, all by itself, with no one pressing a switch.',
  realWorld: 'This is the start of home automation: smart lights switch on and off on their own in the same way.',
  parts: [...STARTER_BOARD_PARTS, { type: 'LED', label: 'LED', count: 1 }],
  steps: [
    {
      id: 'place',
      kind: 'place',
      title: 'Place the parts',
      body: 'Add an Arduino Uno, a breadboard and one LED. Plug the LED into the breadboard.',
      hint: PLACING_HINT,
      check: all(
        { kind: 'parts', type: 'ARDUINO_UNO', count: 1 },
        { kind: 'parts', type: 'BREADBOARD', count: 1 },
        { kind: 'parts', type: 'LED', count: 1 },
      ),
    },
    {
      id: 'wire-plus',
      kind: 'wire',
      title: 'Wire the + leg to pin 6',
      body: "An LED has a long leg (+) and a short leg (−). Connect the LED's + leg to pin 6 on the Arduino.",
      hint: WIRING_HINT,
      check: { kind: 'wired', type: 'LED', pin: 'A', to: '6' },
    },
    {
      id: 'wire-minus',
      kind: 'wire',
      title: 'Wire the − leg to GND',
      body: "Connect the LED's − leg to a GND pin on the Arduino. GND (ground) is where the current goes back to.",
      hint: WIRING_HINT,
      check: { kind: 'wired', type: 'LED', pin: 'C', to: 'GND' },
    },
    {
      id: 'code-setup',
      kind: 'code',
      title: 'Make pin 6 an output',
      body: 'Open Blocks. From Output, drag "set pin to OUTPUT" into setup and pick pin 6. Setup runs once, when the board starts. An output pin sends power out to the LED.',
      blocks: ['setup', 'set pin 6 to OUTPUT'],
      cpp: 'pinMode(6, OUTPUT);',
      hint: 'Setup and loop are the two slots of the big purple block. If your workspace has separate "on start" and "forever" blocks instead, use those: they work the same way.',
      check: setsOutput(6),
    },
    {
      id: 'code-loop',
      kind: 'code',
      title: 'Switch it on and off',
      body: 'Inside loop (it repeats forever): switch pin 6 HIGH (on), wait 1000 milliseconds, switch it LOW (off), wait 1000 milliseconds again. 1000 milliseconds is one second.',
      blocks: ['loop', 'digital write pin 6 to HIGH', 'wait 1000 milliseconds', 'digital write pin 6 to LOW', 'wait 1000 milliseconds'],
      cpp: 'digitalWrite(6, HIGH);\ndelay(1000);\ndigitalWrite(6, LOW);\ndelay(1000);',
      hint: 'Both waits are needed. Without the second one, the LED switches back on straight away and looks like it never turns off.',
      check: all(writesPin(6, 'HIGH'), writesPin(6, 'LOW'), waits(1000)),
    },
    {
      id: 'run',
      kind: 'run',
      title: 'Run the simulation',
      body: 'Click Run Simulation at the top of the Blocks screen.',
      check: { kind: 'simulating' },
    },
    {
      id: 'observe',
      kind: 'observe',
      title: 'Watch it blink',
      body: 'The LED should be on for one second, then off for one second, again and again.',
      hint: 'Nothing happening? Check the LED is the right way round: the + leg goes to pin 6.',
      check: { kind: 'blinked', times: 4 },
    },
  ],
  solution: blinkSequence([6]),
  observe: 'The LED blinks: one second on, one second off.',
  wrapUp: 'You programmed a light to control itself. Every blinking light you see works on this idea: switch on, wait, switch off, wait.',
};

const NEXT_ACTIVITY_TEXT: Array<Pick<LessonActivity, 'title' | 'goal' | 'realWorld' | 'observe' | 'wrapUp'>> = [
  {
    title: 'Blink two LEDs',
    goal: 'Add a second LED and make the two LEDs take turns, one after the other.',
    realWorld: 'A police siren light works like this: one colour flashes, goes off, then the other colour flashes.',
    observe: 'The first LED blinks, then the second, then the first again.',
    wrapUp: 'Two outputs, one after the other: that is how you make a pattern of lights.',
  },
  {
    title: 'Blink three LEDs',
    goal: 'Add a third LED and make the three LEDs light up one after the other.',
    realWorld: 'Traffic lights switch between their lights in a fixed order to direct cars safely.',
    observe: 'The three LEDs light up in turn, one at a time.',
    wrapUp: 'You now control three outputs in a sequence, like a simple traffic light.',
  },
  {
    title: 'Blink four LEDs',
    goal: 'Add a fourth LED and light all four up one after the other.',
    realWorld: 'Party and decoration lights run through their colours one after another like this.',
    observe: 'The four LEDs light up in turn, one at a time.',
    wrapUp: 'Adding an LED is always the same three things: wire it, set its pin as an output, add it to the sequence.',
  },
  {
    title: 'Blink five LEDs',
    goal: 'Add a fifth LED and run a light chase across all five.',
    realWorld: 'Shop signs and stage lights use long chains of lights that switch on one after another.',
    observe: 'A light runs along all five LEDs, one at a time.',
    wrapUp: 'Five LEDs on five pins, all controlled by your program. You can now build any light pattern you can imagine.',
  },
];

function nextActivity(index: number): LessonActivity {
  // index 1 adds the second LED (pin 5), index 4 the fifth (pin 2).
  const ledCount = index + 1;
  const pin = LED_PINS[index];
  const pinsSoFar = LED_PINS.slice(0, ledCount);
  const text = NEXT_ACTIVITY_TEXT[index - 1];

  const steps: LessonStep[] = [
    {
      id: 'place',
      kind: 'place',
      title: `Add LED number ${ledCount}`,
      body: `Keep your circuit from the last activity. Plug one more LED into the breadboard, in a free column.`,
      hint: PLACING_HINT,
      check: { kind: 'parts', type: 'LED', count: ledCount },
    },
    {
      id: 'wire',
      kind: 'wire',
      title: `Wire it to pin ${pin} and GND`,
      body: `Connect the new LED's + leg to pin ${pin}, and its − leg to GND.`,
      hint: WIRING_HINT,
      check: all(
        { kind: 'wired', type: 'LED', pin: 'A', to: String(pin) },
        { kind: 'wired', type: 'LED', pin: 'C', to: 'GND', count: ledCount, label: `All ${ledCount} LED − legs → GND` },
      ),
    },
    {
      id: 'code',
      kind: 'code',
      title: `Add pin ${pin} to the sequence`,
      body: `In loop, after the blocks for pin ${LED_PINS[index - 1]}, add the same four blocks for pin ${pin}: on, wait, off, wait.`,
      blocks: [`digital write pin ${pin} to HIGH`, 'wait 1000 milliseconds', `digital write pin ${pin} to LOW`, 'wait 1000 milliseconds'],
      cpp: `digitalWrite(${pin}, HIGH);\ndelay(1000);\ndigitalWrite(${pin}, LOW);\ndelay(1000);`,
      hint: 'Right-click a block and choose Duplicate to copy it, then change the pin number.',
      check: all(...pinsSoFar.flatMap((p) => [writesPin(p, 'HIGH'), writesPin(p, 'LOW')])),
    },
    {
      id: 'run',
      kind: 'run',
      title: 'Run the simulation',
      body: 'Click Run Simulation at the top of the Blocks screen. If it is still running, stop it and run it again so it uses your new code.',
      check: { kind: 'simulating' },
    },
    {
      id: 'observe',
      kind: 'observe',
      title: 'Watch the sequence',
      body: text.observe,
      check: { kind: 'blinked', times: ledCount * 2 },
    },
  ];

  return {
    id: `led-${ledCount}`,
    title: text.title,
    goal: text.goal,
    realWorld: text.realWorld,
    parts: [...STARTER_BOARD_PARTS, { type: 'LED', label: 'LED', count: ledCount }],
    steps,
    solution: blinkSequence(pinsSoFar),
    observe: text.observe,
    wrapUp: text.wrapUp,
  };
}

export const ledLesson: Lesson = {
  slug: 'light-emitting-diode-led',
  title: 'Light Emitting Diode (LED)',
  source: 'STEMAIDE CODER manual: Light Emitting Diode (LED)',
  activities: [firstActivity, nextActivity(1), nextActivity(2), nextActivity(3), nextActivity(4)],
};
