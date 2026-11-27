import type { BlockInstruction, Lesson, LessonActivity, LessonStep } from '../types';
import {
  all,
  BLOCKS_INTRO,
  DRAG_INTO_ON_START,
  EMPTY_FOREVER,
  forever,
  loopRunsInOrder,
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

function showColorStatements(on: Channel[]) {
  return CHANNELS.map((channel) => writeStatement(PINS[channel], on.includes(channel) ? 'HIGH' : 'LOW'));
}

function colorCpp(on: Channel[]) {
  return CHANNELS.map((channel) => `digitalWrite(${NAMES[channel]}, ${on.includes(channel) ? 'HIGH' : 'LOW'});`).join('\n');
}

/**
 * The three "digital write" blocks that show a colour, one instruction each. `firstPlace` says where
 * the first one goes; the other two snap under it.
 */
function colorBlocks(on: Channel[], firstPlace: string): BlockInstruction[] {
  return CHANNELS.map((channel, index) => ({
    type: 'arduino_digitalWrite',
    group: 'output',
    block: 'digital write pin ▾ to HIGH ▾',
    place: index === 0 ? firstPlace : `Snap it under the ${index === 1 ? 'first' : 'second'} "digital write" block.`,
    set: on.includes(channel)
      ? `Choose pin ${PINS[channel]} (${channel}). Leave HIGH: ${channel} on.`
      : `Choose pin ${PINS[channel]} (${channel}), then change HIGH to LOW: ${channel} off.`,
  }));
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
  const name = NAMES[channel];
  const colour = name.toLowerCase();
  const first = index === 0;
  const steps: LessonStep[] = [];
  const finished = program(SETUP, forever(...showColor([channel])));

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
      {
        id: 'code-setup',
        kind: 'code',
        title: 'Get the three colour pins ready',
        body: `${BLOCKS_INTRO} An RGB LED uses three pins, one for each colour. Get all three ready in "on start".`,
        build: CHANNELS.map((each, position) => ({
          type: 'arduino_pinMode',
          group: 'output',
          block: 'set pin ▾ to OUTPUT ▾',
          place: position === 0 ? DRAG_INTO_ON_START : `Snap it under the ${position === 1 ? 'first' : 'second'} "set pin" block.`,
          set: `Choose pin ${PINS[each]} (${each}). Leave OUTPUT.`,
        })),
        picture: program(SETUP, forever()),
        expect: 'Nothing lights up yet: this gets the three colour pins ready.',
        cpp: 'pinMode(Red, OUTPUT);\npinMode(Green, OUTPUT);\npinMode(Blue, OUTPUT);',
        check: all(setsOutput(2), setsOutput(7), setsOutput(10)),
      },
    );
  }

  steps.push(
    {
      id: 'code',
      kind: 'code',
      title: `Show ${colour} only`,
      body: first
        ? 'Now choose the colour. In "forever", switch red on and the other two colours off.'
        : `${EMPTY_FOREVER} Then switch ${colour} on and the other two colours off.`,
      build: colorBlocks([channel], first ? 'Drag it inside "forever".' : 'Drag it inside the empty "forever".'),
      picture: finished,
      expect: `The RGB LED glows ${colour}.`,
      cpp: colorCpp([channel]),
      check: loopRunsInOrder(`${name} on, the other two off`, ...showColorStatements([channel])),
    },
    { id: 'run', kind: 'run', title: 'Run the simulation', body: first ? RUN_STEP_BODY : RERUN_STEP_BODY, check: { kind: 'simulating' } },
    {
      id: 'observe',
      kind: 'observe',
      title: `See ${colour}`,
      body: `The RGB LED should glow ${colour}.`,
      check: { kind: 'seen', tokens: [`RGB_LED:${channel}`], label: `RGB LED is ${colour}` },
    },
  );

  return {
    id: `rgb-${index + 1}`,
    title: `${name} on`,
    goal: `Make the RGB LED glow ${colour}, with the other two colours off.`,
    realWorld: REAL_WORLD[channel].on,
    parts: PARTS,
    steps,
    solution: finished,
    observe: `The RGB LED glows ${colour}.`,
    wrapUp: 'Each colour has its own pin, so you choose the colour by choosing which pins are HIGH.',
  };
}

function colorBlink(channel: Channel, index: number): LessonActivity {
  const pin = PINS[channel];
  const name = NAMES[channel];
  const colour = name.toLowerCase();
  const finished = program(SETUP, forever(...showColor([channel]), waitBlock(500), writeBlock(pin, 'LOW'), waitBlock(500)));
  return {
    id: `rgb-${index + 1}`,
    title: `${name} blinking`,
    goal: `Make the ${colour} light blink.`,
    realWorld: REAL_WORLD[channel].blink,
    parts: PARTS,
    steps: [
      {
        id: 'code',
        kind: 'code',
        title: 'On, wait, off, wait',
        body: `Keep your blocks. Under the three colour blocks in "forever", add three more: wait, ${colour} off, wait.`,
        build: [
          {
            type: 'time_delay',
            group: 'start',
            block: 'wait 1000 milliseconds',
            find: WAIT_MS_FIND,
            place: 'Snap it under the three "digital write" blocks in "forever".',
            set: 'Change 1000 to 500: half a second.',
          },
          {
            type: 'arduino_digitalWrite',
            group: 'output',
            block: 'digital write pin ▾ to HIGH ▾',
            place: 'Snap it under the "wait" block.',
            set: `Choose pin ${pin} (${colour}), then change HIGH to LOW.`,
          },
          {
            type: 'time_delay',
            group: 'start',
            block: 'wait 1000 milliseconds',
            find: WAIT_MS_FIND,
            place: 'Snap it at the bottom of "forever".',
            set: 'Change 1000 to 500.',
          },
        ],
        picture: finished,
        expect: `The ${colour} light switches on and off every half second.`,
        cpp: `${colorCpp([channel])}\ndelay(500);\ndigitalWrite(${name}, LOW);\ndelay(500);`,
        hint: 'The manual waits only 50 milliseconds: on a real board that is a fast flicker. 500 is easier to see.',
        check: loopRunsInOrder(
          `${name}: on, wait, off, wait`,
          ...showColorStatements([channel]),
          waitStatement(500),
          writeStatement(pin, 'LOW'),
          waitStatement(500),
        ),
      },
      { id: 'run', kind: 'run', title: 'Run the simulation', body: RERUN_STEP_BODY, check: { kind: 'simulating' } },
      {
        id: 'observe',
        kind: 'observe',
        title: 'Watch it blink',
        body: `The ${colour} light should switch on and off every half second.`,
        check: { kind: 'blinked', type: 'RGB_LED', times: 4 },
      },
    ],
    solution: finished,
    observe: `The RGB LED blinks ${colour}.`,
    wrapUp: 'The same on-wait-off-wait pattern works for every colour.',
  };
}

const RAINBOW: Array<{ name: string; on: Channel[]; intro: string }> = [
  { name: 'red', on: ['red'], intro: `${EMPTY_FOREVER} Then show red: red on, green off, blue off, and a wait.` },
  { name: 'yellow', on: ['red', 'green'], intro: 'Now mix! Red and green light together look yellow. At the bottom of "forever", add red on, green on, blue off, and a wait.' },
  { name: 'green', on: ['green'], intro: 'Next, green on its own: red off, green on, blue off, and a wait.' },
  { name: 'cyan', on: ['green', 'blue'], intro: 'Green and blue together make cyan, a light blue: red off, green on, blue on, and a wait.' },
  { name: 'blue', on: ['blue'], intro: 'Blue on its own: red off, green off, blue on, and a wait.' },
  { name: 'magenta', on: ['red', 'blue'], intro: 'Red and blue together make magenta, a pinky purple: red on, green off, blue on, and a wait.' },
  { name: 'white', on: ['red', 'green', 'blue'], intro: 'Last, all three together look white: red on, green on, blue on, and a wait.' },
];

const colorAndWait = (on: Channel[]) => [...showColor(on), waitBlock(1000)];
const colorAndWaitStatements = (on: Channel[]) => [...showColorStatements(on), waitStatement(1000)];

function rainbowStep(index: number): LessonStep {
  const color = RAINBOW[index];
  const title = color.name[0].toUpperCase() + color.name.slice(1);
  const last = index === RAINBOW.length - 1;
  return {
    id: `code-${color.name}`,
    kind: 'code',
    title,
    body: color.intro,
    build: [
      ...colorBlocks(color.on, index === 0 ? 'Drag it inside the empty "forever".' : 'Snap it at the bottom of "forever".'),
      {
        type: 'time_delay',
        group: 'start',
        block: 'wait 1000 milliseconds',
        find: WAIT_MS_FIND,
        place: 'Snap it at the bottom of "forever".',
        set: 'Leave it at 1000: each colour shows for one second.',
      },
    ],
    picture: program(SETUP, forever(...RAINBOW.slice(0, index + 1).flatMap((each) => colorAndWait(each.on)))),
    expect: last
      ? 'The LED shows red, yellow, green, cyan, blue, magenta and white, one second each, over and over.'
      : index === 0
        ? 'The LED glows red.'
        : `The LED shows each colour you have added so far for one second, then starts again from red.`,
    cpp: `// ${color.name}\n${colorCpp(color.on)}\ndelay(1000);`,
    hint: index === 0 ? undefined : 'Quicker: right-click a block and choose Duplicate, then change HIGH or LOW on the copy.',
    check: last
      ? loopRunsInOrder('All seven colours, in order', ...RAINBOW.flatMap((each) => colorAndWaitStatements(each.on)))
      : loopRunsInOrder(`${title}, then a wait`, ...colorAndWaitStatements(color.on)),
  };
}

const rainbow: LessonActivity = {
  id: 'rgb-7',
  title: 'Mix a rainbow',
  goal: 'Mix the three colours to make new ones: red + green = yellow, green + blue = cyan, red + blue = magenta, all three = white.',
  realWorld: 'Every pixel on a TV or phone screen is a tiny red, green and blue light mixed like this.',
  parts: PARTS,
  steps: [
    ...RAINBOW.map((_, index) => rainbowStep(index)),
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
  solution: program(SETUP, forever(...RAINBOW.flatMap((color) => colorAndWait(color.on)))),
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
