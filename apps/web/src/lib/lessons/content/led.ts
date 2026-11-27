import type { Lesson, LessonActivity, LessonStep } from '../types';
import {
  all,
  blinksInOrder,
  BLOCKS_INTRO,
  DRAG_INTO_ON_START,
  forever,
  onStart,
  pinModeBlock,
  PLACING_HINT,
  program,
  setsOutput,
  STARTER_BOARD_PARTS,
  WAIT_MS_FIND,
  waitBlock,
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
      body: `${BLOCKS_INTRO} First, tell the board that pin 6 sends power out to the LED.`,
      build: [
        {
          type: 'arduino_pinMode',
          group: 'output',
          block: 'set pin ▾ to OUTPUT ▾',
          place: DRAG_INTO_ON_START,
          set: 'Click the pin number and choose 6. Leave OUTPUT as it is.',
        },
      ],
      picture: program(onStart(pinModeBlock(6)), forever()),
      expect: 'Nothing lights up yet. This block only gets pin 6 ready; the next step switches the LED on and off.',
      cpp: 'pinMode(6, OUTPUT);',
      hint: 'Clicking a group on the left (like Output) opens its drawer of blocks. If you put a block in the wrong place, drag it out and drop it in the right one.',
      check: setsOutput(6),
    },
    {
      id: 'code-loop',
      kind: 'code',
      title: 'Switch it on and off',
      body: 'Now fill "forever" with four blocks, one under the other: on, wait, off, wait. Each block snaps under the one before it.',
      build: [
        {
          type: 'arduino_digitalWrite',
          group: 'output',
          block: 'digital write pin ▾ to HIGH ▾',
          place: 'Drag it inside "forever".',
          set: 'Choose pin 6. Leave HIGH: HIGH means on.',
        },
        {
          type: 'time_delay',
          group: 'start',
          block: 'wait 1000 milliseconds',
          find: WAIT_MS_FIND,
          place: 'Snap it under the "digital write" block.',
          set: 'Leave it at 1000. 1000 milliseconds is one second.',
        },
        {
          type: 'arduino_digitalWrite',
          group: 'output',
          block: 'digital write pin ▾ to HIGH ▾',
          place: 'Snap it under the "wait" block.',
          set: 'Choose pin 6, then change HIGH to LOW. LOW means off.',
        },
        {
          type: 'time_delay',
          group: 'start',
          block: 'wait 1000 milliseconds',
          find: WAIT_MS_FIND,
          place: 'Snap it at the bottom, under the second "digital write" block.',
          set: 'Leave it at 1000.',
        },
      ],
      picture: blinkSequence([6]),
      expect: 'The LED turns on for one second, then off for one second, again and again.',
      cpp: 'digitalWrite(6, HIGH);\ndelay(1000);\ndigitalWrite(6, LOW);\ndelay(1000);',
      hint: 'Both waits are needed. Without the first, the LED goes off again too fast to see. Without the second, it comes back on straight away and looks like it never turns off. "wait 1 seconds" works too.',
      check: all(writesPin(6, 'HIGH'), writesPin(6, 'LOW'), blinksInOrder(6)),
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
      body: `Keep all your blocks. Get pin ${pin} ready in "on start", then add the same four blocks you used for pin ${LED_PINS[index - 1]} at the bottom of "forever": on, wait, off, wait.`,
      build: [
        {
          type: 'arduino_pinMode',
          group: 'output',
          block: 'set pin ▾ to OUTPUT ▾',
          place: `Snap it inside "on start", under the last "set pin" block.`,
          set: `Choose pin ${pin}. Leave OUTPUT.`,
        },
        {
          type: 'arduino_digitalWrite',
          group: 'output',
          block: 'digital write pin ▾ to HIGH ▾',
          place: 'Snap it at the bottom of "forever", under the last "wait" block.',
          set: `Choose pin ${pin}. Leave HIGH.`,
        },
        {
          type: 'time_delay',
          group: 'start',
          block: 'wait 1000 milliseconds',
          find: WAIT_MS_FIND,
          place: 'Snap it under the block you just added.',
          set: 'Leave it at 1000.',
        },
        {
          type: 'arduino_digitalWrite',
          group: 'output',
          block: 'digital write pin ▾ to HIGH ▾',
          place: 'Snap it under the "wait" block.',
          set: `Choose pin ${pin}, then change HIGH to LOW.`,
        },
        {
          type: 'time_delay',
          group: 'start',
          block: 'wait 1000 milliseconds',
          find: WAIT_MS_FIND,
          place: 'Snap it at the very bottom of "forever".',
          set: 'Leave it at 1000.',
        },
      ],
      picture: blinkSequence(pinsSoFar),
      expect: text.observe,
      cpp: `pinMode(${pin}, OUTPUT);\n\ndigitalWrite(${pin}, HIGH);\ndelay(1000);\ndigitalWrite(${pin}, LOW);\ndelay(1000);`,
      hint: 'Quicker: right-click a block and choose Duplicate to copy it, then change the pin number on the copy.',
      check: all(
        setsOutput(pin),
        ...pinsSoFar.slice(0, -1).flatMap((p) => [writesPin(p, 'HIGH'), writesPin(p, 'LOW')]),
        blinksInOrder(pin),
      ),
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
