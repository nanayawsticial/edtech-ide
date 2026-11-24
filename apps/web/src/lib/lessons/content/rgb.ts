import type { Lesson, LessonActivity, LessonStep } from '../types';
import {
  all,
  forever,
  onStart,
  pinModeBlock,
  PLACING_HINT,
  program,
  RERUN_STEP_BODY,
  RUN_STEP_BODY,
  STARTER_BOARD_PARTS,
  waitBlock,
  waits,
  WIRING_HINT,
  writeBlock,
  writesPin,
} from './helpers';

// Adapted from the STEMAIDE CODER manuals "5. Red Green Blue (RGB) Module" (5.0-5.7). Pins from
// the manuals' code: red = 2, green = 7, blue = 10, and the common leg to GND.
// Changes: blinks use 500 ms (the manual's 50 ms is too fast to see), and the rainbow mixes colours
// by switching colours fully on and off, because pins 2 and 7 cannot dim (they are not PWM pins).

type Channel = 'red' | 'green' | 'blue';
const PINS: Record<Channel, number> = { red: 2, green: 7, blue: 10 };
const CHANNELS: Channel[] = ['red', 'green', 'blue'];
const NAMES: Record<Channel, string> = { red: 'Red', green: 'Green', blue: 'Blue' };

const PARTS = [...STARTER_BOARD_PARTS, { type: 'RGB_LED', label: 'RGB LED', count: 1 }];

/** digital writes that show one colour: the chosen channels HIGH, the rest LOW. */
function showColor(on: Channel[]) {
  return CHANNELS.map((channel) => writeBlock(PINS[channel], on.includes(channel) ? 'HIGH' : 'LOW'));
}

function colorCpp(on: Channel[]) {
  return CHANNELS.map((channel) => `digitalWrite(${NAMES[channel]}, ${on.includes(channel) ? 'HIGH' : 'LOW'});`).join('\n');
}

const SETUP = onStart(pinModeBlock(2), pinModeBlock(7), pinModeBlock(10));

const REAL_WORLD: Record<Channel, { on: string; blink: string }> = {
  red: {
    on: 'A security light can glow red when it detects an intruder.',
    blink: 'Blinking red is used on alarms and safety lights to warn of danger.',
  },
  green: {
    on: 'A quiz board can glow green when the right answer is chosen.',
    blink: 'Game pads and gadgets blink green to look exciting or to say "ready".',
  },
  blue: {
    on: 'A room light can be switched to blue by a program instead of by hand.',
    blink: 'Ambulances and police cars flash blue lights to ask for space on the road.',
  },
};

function colorOn(channel: Channel, index: number): LessonActivity {
  const pin = PINS[channel];
  const name = NAMES[channel];
  const first = index === 0;
  const steps: LessonStep[] = [];

  if (first) {
    steps.push(
      {
        id: 'place',
        kind: 'place',
        title: 'Place the parts',
        body: 'Add an Arduino Uno, a breadboard and an RGB LED. Plug the RGB LED into the breadboard.',
        hint: PLACING_HINT,
        check: all(
          { kind: 'parts', type: 'ARDUINO_UNO', count: 1 },
          { kind: 'parts', type: 'BREADBOARD', count: 1 },
          { kind: 'parts', type: 'RGB_LED', count: 1 },
        ),
      },
      {
        id: 'wire',
        kind: 'wire',
        title: 'Wire the four legs',
        body: 'An RGB LED is three LEDs in one. Connect the red leg to pin 2, the green leg to pin 7, the blue leg to pin 10, and the longest (common) leg to GND.',
        hint: `${WIRING_HINT} If your real RGB LED only lights when its common leg goes to 5V, it is a "common anode" one: then LOW switches a colour on instead of HIGH.`,
        check: all(
          { kind: 'wired', type: 'RGB_LED', pin: 'R', to: '2' },
          { kind: 'wired', type: 'RGB_LED', pin: 'G', to: '7' },
          { kind: 'wired', type: 'RGB_LED', pin: 'B', to: '10' },
          { kind: 'wired', type: 'RGB_LED', pin: 'COM', to: 'GND' },
        ),
      },
    );
  }

  steps.push(
    {
      id: 'code',
      kind: 'code',
      title: `Show ${name.toLowerCase()} only`,
      body: first
        ? 'Open Blocks. In loop, set pin 2 (red) HIGH, pin 7 (green) LOW and pin 10 (blue) LOW.'
        : `Delete the blocks inside loop. Then set pin ${pin} (${name.toLowerCase()}) HIGH and the other two colour pins LOW.`,
      blocks: CHANNELS.map((c) => `digital write pin ${PINS[c]} to ${c === channel ? 'HIGH' : 'LOW'}`),
      cpp: colorCpp([channel]),
      check: writesPin(pin, 'HIGH'),
    },
    { id: 'run', kind: 'run', title: 'Run the simulation', body: first ? RUN_STEP_BODY : RERUN_STEP_BODY, check: { kind: 'simulating' } },
    {
      id: 'observe',
      kind: 'observe',
      title: `See ${name.toLowerCase()}`,
      body: `The RGB LED should glow ${name.toLowerCase()}.`,
      check: { kind: 'seen', tokens: [`RGB_LED:${channel}`], label: `RGB LED is ${name.toLowerCase()}` },
    },
  );

  return {
    id: `rgb-${index + 1}`,
    title: `${name} on`,
    goal: `Make the RGB LED glow ${name.toLowerCase()}, with the other two colours off.`,
    realWorld: REAL_WORLD[channel].on,
    parts: PARTS,
    steps,
    solution: program(SETUP, forever(...showColor([channel]))),
    observe: `The RGB LED glows ${name.toLowerCase()}.`,
    wrapUp: 'Each colour has its own pin, so you choose the colour by choosing which pins are HIGH.',
  };
}

function colorBlink(channel: Channel, index: number): LessonActivity {
  const pin = PINS[channel];
  const name = NAMES[channel];
  return {
    id: `rgb-${index + 1}`,
    title: `${name} blinking`,
    goal: `Make the ${name.toLowerCase()} light blink.`,
    realWorld: REAL_WORLD[channel].blink,
    parts: PARTS,
    steps: [
      {
        id: 'code',
        kind: 'code',
        title: 'On, wait, off, wait',
        body: `After the three colour blocks, add: wait 500 milliseconds, set pin ${pin} LOW, wait 500 milliseconds.`,
        blocks: ['wait 500 milliseconds', `digital write pin ${pin} to LOW`, 'wait 500 milliseconds'],
        cpp: `${colorCpp([channel])}\ndelay(500);\ndigitalWrite(${name}, LOW);\ndelay(500);`,
        hint: 'The manual waits only 50 milliseconds: on a real board that is a fast flicker. 500 is easier to see.',
        check: all(writesPin(pin, 'HIGH'), writesPin(pin, 'LOW'), waits(500)),
      },
      { id: 'run', kind: 'run', title: 'Run the simulation', body: RERUN_STEP_BODY, check: { kind: 'simulating' } },
      {
        id: 'observe',
        kind: 'observe',
        title: 'Watch it blink',
        body: `The ${name.toLowerCase()} light should switch on and off every half second.`,
        check: { kind: 'blinked', type: 'RGB_LED', times: 4 },
      },
    ],
    solution: program(SETUP, forever(...showColor([channel]), waitBlock(500), writeBlock(pin, 'LOW'), waitBlock(500))),
    observe: `The RGB LED blinks ${name.toLowerCase()}.`,
    wrapUp: 'The same on-wait-off-wait pattern works for every colour.',
  };
}

const RAINBOW: Array<{ name: string; on: Channel[] }> = [
  { name: 'red', on: ['red'] },
  { name: 'yellow', on: ['red', 'green'] },
  { name: 'green', on: ['green'] },
  { name: 'cyan', on: ['green', 'blue'] },
  { name: 'blue', on: ['blue'] },
  { name: 'magenta', on: ['red', 'blue'] },
  { name: 'white', on: ['red', 'green', 'blue'] },
];

const rainbow: LessonActivity = {
  id: 'rgb-7',
  title: 'Mix a rainbow',
  goal: 'Mix the three colours to make new ones: red + green = yellow, green + blue = cyan, red + blue = magenta, all three = white.',
  realWorld: 'Every pixel on a TV or phone screen is a tiny red, green and blue light mixed like this.',
  parts: PARTS,
  steps: [
    {
      id: 'code-mix',
      kind: 'code',
      title: 'Make yellow',
      body: 'Delete the blocks inside loop. Set pin 2 (red) HIGH, pin 7 (green) HIGH and pin 10 (blue) LOW. Red and green light together look yellow.',
      blocks: ['digital write pin 2 to HIGH', 'digital write pin 7 to HIGH', 'digital write pin 10 to LOW'],
      cpp: colorCpp(['red', 'green']),
      check: all(writesPin(2, 'HIGH'), writesPin(7, 'HIGH'), writesPin(10, 'LOW')),
    },
    {
      id: 'code-rainbow',
      kind: 'code',
      title: 'Cycle through the colours',
      body: 'After the yellow blocks, add "wait 1000 milliseconds". Then add three blocks and a wait for each colour: green, cyan (green + blue), blue, magenta (red + blue) and white (all three). Start the loop with red.',
      blocks: ['red: 2 HIGH, 7 LOW, 10 LOW', 'yellow: 2 HIGH, 7 HIGH, 10 LOW', 'green: 2 LOW, 7 HIGH, 10 LOW', 'cyan: 2 LOW, 7 HIGH, 10 HIGH', 'blue: 2 LOW, 7 LOW, 10 HIGH', 'magenta: 2 HIGH, 7 LOW, 10 HIGH', 'white: all HIGH', 'wait 1000 milliseconds after each'],
      cpp: `// yellow\n${colorCpp(['red', 'green'])}\ndelay(1000);\n// cyan\n${colorCpp(['green', 'blue'])}\ndelay(1000);\n// ...and so on for each colour`,
      hint: 'Build one colour (three blocks and a wait), duplicate it, and change the HIGHs and LOWs.',
      check: all(writesPin(10, 'HIGH'), waits(1000)),
    },
    { id: 'run', kind: 'run', title: 'Run the simulation', body: RERUN_STEP_BODY, check: { kind: 'simulating' } },
    {
      id: 'observe',
      kind: 'observe',
      title: 'Watch the colours',
      body: 'Watch for about seven seconds: the RGB LED should show each colour in turn.',
      check: {
        kind: 'seen',
        tokens: ['RGB_LED:yellow', 'RGB_LED:cyan', 'RGB_LED:magenta', 'RGB_LED:white'],
        label: 'Shows yellow, cyan, magenta and white',
      },
    },
  ],
  solution: program(SETUP, forever(...RAINBOW.flatMap((color) => [...showColor(color.on), waitBlock(1000)]))),
  observe: 'The RGB LED shows red, yellow, green, cyan, blue, magenta and white in turn.',
  wrapUp: 'Mixing red, green and blue light makes other colours. With PWM pins and analogWrite you could even mix in-between shades.',
};

export const rgbLesson: Lesson = {
  slug: 'red-green-blue-rgb-module',
  title: 'Red Green Blue (RGB) Module',
  source: 'STEMAIDE CODER manual: Red Green Blue (RGB) Module',
  activities: [
    colorOn('red', 0),
    colorBlink('red', 1),
    colorOn('green', 2),
    colorBlink('green', 3),
    colorOn('blue', 4),
    colorBlink('blue', 5),
    rainbow,
  ],
};
