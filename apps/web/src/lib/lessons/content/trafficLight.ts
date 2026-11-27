import type { BlockInstruction, Lesson, LessonActivity, LessonStep, StepCheck } from '../types';
import {
  all,
  blinksInOrder,
  BLOCKS_INTRO,
  DRAG_INTO_FOREVER,
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
  writesPin,
  writeStatement,
} from './helpers';

// Adapted from the STEMAIDE CODER manuals "4. Traffic Light Module" (4.0-4.6). The manuals' code
// uses red = 5, yellow = 6, green = 7, and the module's GND to the Arduino's GND.

type Lamp = 'red' | 'yellow' | 'green';
const LAMPS: Record<Lamp, { pin: number; modulePin: 'R' | 'Y' | 'G'; name: string; meaning: string; blinkMeaning: string }> = {
  red: {
    pin: 5,
    modulePin: 'R',
    name: 'Red',
    meaning: 'Red tells drivers and riders to stop.',
    blinkMeaning: 'A blinking red light warns of danger on the road.',
  },
  yellow: {
    pin: 6,
    modulePin: 'Y',
    name: 'Yellow',
    meaning: 'Yellow tells drivers and riders to get ready to stop.',
    blinkMeaning: 'A blinking yellow light means "be careful": many traffic lights do this at night.',
  },
  green: {
    pin: 7,
    modulePin: 'G',
    name: 'Green',
    meaning: 'Green tells drivers and riders it is their turn to go.',
    blinkMeaning: 'A blinking green light catches the attention of drivers who are not looking.',
  },
};

/** The lamps are added in this order, and each activity keeps the pins set up before it. */
const LAMP_ORDER: Lamp[] = ['red', 'yellow', 'green'];

const PARTS = [...STARTER_BOARD_PARTS, { type: 'TRAFFIC_LIGHT', label: 'Traffic light module', count: 1 }];

function wiredLamp(lamp: Lamp): StepCheck {
  return { kind: 'wired', type: 'TRAFFIC_LIGHT', pin: LAMPS[lamp].modulePin, to: String(LAMPS[lamp].pin) };
}

/** "on start" with every lamp pin set up so far, up to and including `lamp`. */
function setupUpTo(lamp: Lamp) {
  const lamps = LAMP_ORDER.slice(0, LAMP_ORDER.indexOf(lamp) + 1);
  return onStart(...lamps.map((each) => pinModeBlock(LAMPS[each].pin)));
}

function lampOn(lamp: Lamp, index: number): LessonActivity {
  const { pin, modulePin, name, meaning } = LAMPS[lamp];
  const colour = name.toLowerCase();
  const first = index === 0;
  const steps: LessonStep[] = [];
  const finished = program(setupUpTo(lamp), forever(writeBlock(pin, 'HIGH')));

  if (first) {
    steps.push(
      {
        id: 'place',
        kind: 'place',
        title: 'Place the parts',
        body: 'Add an Arduino Uno, a breadboard and a traffic light module. Plug the module into the breadboard.',
        hint: PLACING_HINT,
        check: all(
          { kind: 'parts', type: 'ARDUINO_UNO', count: 1 },
          { kind: 'parts', type: 'BREADBOARD', count: 1 },
          { kind: 'parts', type: 'TRAFFIC_LIGHT', count: 1 },
        ),
      },
      {
        id: 'wire',
        kind: 'wire',
        title: 'Wire red and GND',
        body: "The module has four pins: R, Y, G and GND. Connect R to pin 5 and the module's GND to a GND pin on the Arduino.",
        hint: WIRING_HINT,
        check: all(wiredLamp('red'), { kind: 'wired', type: 'TRAFFIC_LIGHT', pin: 'GND', to: 'GND' }),
      },
    );
  } else {
    steps.push({
      id: 'wire',
      kind: 'wire',
      title: `Wire ${colour}`,
      body: `Keep your circuit. Connect the module's ${modulePin} pin to pin ${pin}.`,
      hint: WIRING_HINT,
      check: wiredLamp(lamp),
    });
  }

  const build: BlockInstruction[] = [
    {
      type: 'arduino_pinMode',
      group: 'output',
      block: 'set pin ▾ to OUTPUT ▾',
      place: first ? DRAG_INTO_ON_START : 'Snap it inside "on start", under the last "set pin" block.',
      set: `Choose pin ${pin}. Leave OUTPUT as it is.`,
    },
    {
      type: 'arduino_digitalWrite',
      group: 'output',
      block: 'digital write pin ▾ to HIGH ▾',
      place: first ? DRAG_INTO_FOREVER : 'Drag it inside the empty "forever".',
      set: `Choose pin ${pin}. Leave HIGH: HIGH sends power to the ${colour} lamp.`,
    },
  ];

  steps.push(
    {
      id: 'code',
      kind: 'code',
      title: `Switch ${colour} on`,
      body: first
        ? `${BLOCKS_INTRO} Get pin 5 ready in "on start", then switch the red lamp on in "forever".`
        : `${EMPTY_FOREVER} Then get pin ${pin} ready and switch the ${colour} lamp on.`,
      build,
      picture: finished,
      expect: `The ${colour} lamp comes on and stays on.`,
      cpp: `const int ${lamp} = ${pin};\n\npinMode(${lamp}, OUTPUT);\ndigitalWrite(${lamp}, HIGH);`,
      check: all(setsOutput(pin), writesPin(pin, 'HIGH')),
    },
    { id: 'run', kind: 'run', title: 'Run the simulation', body: first ? RUN_STEP_BODY : RERUN_STEP_BODY, check: { kind: 'simulating' } },
    {
      id: 'observe',
      kind: 'observe',
      title: `See the ${colour} light`,
      body: `The ${colour} lamp should be on and stay on.`,
      check: { kind: 'seen', tokens: [`TRAFFIC_LIGHT:${lamp}`], label: `${name} lamp is on` },
    },
  );

  return {
    id: `traffic-${index + 1}`,
    title: `${name} light on`,
    goal: `Switch on the ${colour} lamp of the traffic light.`,
    realWorld: meaning,
    parts: PARTS,
    steps,
    solution: finished,
    observe: `The ${colour} lamp is on.`,
    wrapUp: `Each lamp has its own pin, so your program can choose exactly which light is on.`,
  };
}

function lampBlink(lamp: Lamp, index: number): LessonActivity {
  const { pin, name, blinkMeaning } = LAMPS[lamp];
  const colour = name.toLowerCase();
  const finished = program(setupUpTo(lamp), forever(writeBlock(pin, 'HIGH'), waitBlock(400), writeBlock(pin, 'LOW'), waitBlock(400)));
  return {
    id: `traffic-${index + 1}`,
    title: `${name} light blinking`,
    goal: `Make the ${colour} lamp blink.`,
    realWorld: blinkMeaning,
    parts: PARTS,
    steps: [
      {
        id: 'code',
        kind: 'code',
        title: 'On, wait, off, wait',
        body: `Keep your blocks. Under "digital write pin ${pin} to HIGH" in "forever", add three more: wait, off, wait.`,
        build: [
          {
            type: 'time_delay',
            group: 'start',
            block: 'wait 1000 milliseconds',
            find: WAIT_MS_FIND,
            place: `Snap it under "digital write pin ${pin} to HIGH" in "forever".`,
            set: 'Click 1000 and type 400. 400 milliseconds is less than half a second.',
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
            place: 'Snap it at the bottom of "forever".',
            set: 'Change 1000 to 400.',
          },
        ],
        picture: finished,
        expect: `The ${colour} lamp switches on and off a few times a second.`,
        cpp: `digitalWrite(${lamp}, HIGH);\ndelay(400);\ndigitalWrite(${lamp}, LOW);\ndelay(400);`,
        check: all(writesPin(pin, 'LOW'), blinksInOrder(pin, 400)),
      },
      { id: 'run', kind: 'run', title: 'Run the simulation', body: RERUN_STEP_BODY, check: { kind: 'simulating' } },
      {
        id: 'observe',
        kind: 'observe',
        title: 'Watch it blink',
        body: `The ${colour} lamp should switch on and off a few times a second.`,
        check: { kind: 'blinked', type: 'TRAFFIC_LIGHT', times: 4 },
      },
    ],
    solution: finished,
    observe: `The ${colour} lamp blinks.`,
    wrapUp: 'A short wait makes a fast blink. Try 1000 milliseconds to see the difference.',
  };
}

/** The full sequence, one lamp at a time: on, wait, off. */
const PHASES: Array<{ lamp: Lamp; ms: number }> = [
  { lamp: 'red', ms: 3000 },
  { lamp: 'yellow', ms: 1000 },
  { lamp: 'green', ms: 3000 },
  { lamp: 'yellow', ms: 1000 },
];

const phaseBlocks = ({ lamp, ms }: { lamp: Lamp; ms: number }) => [
  writeBlock(LAMPS[lamp].pin, 'HIGH'),
  waitBlock(ms),
  writeBlock(LAMPS[lamp].pin, 'LOW'),
];
const phaseStatements = ({ lamp, ms }: { lamp: Lamp; ms: number }) => [
  writeStatement(LAMPS[lamp].pin, 'HIGH'),
  waitStatement(ms),
  writeStatement(LAMPS[lamp].pin, 'LOW'),
];

function sequenceStep(index: number): LessonStep {
  const phase = PHASES[index];
  const { pin, name } = LAMPS[phase.lamp];
  const colour = name.toLowerCase();
  const seconds = phase.ms / 1000;
  const last = index === PHASES.length - 1;
  const intro = [
    `${EMPTY_FOREVER} Then build the red part: red on, wait three seconds, red off.`,
    'At the bottom of "forever", add the yellow part: yellow on, wait one second, yellow off.',
    'At the bottom of "forever", add the green part: green on, wait three seconds, green off.',
    'Finish with yellow again, so drivers get ready to stop before red comes back.',
  ][index];

  return {
    id: `code-${index + 1}`,
    kind: 'code',
    title: last ? 'Yellow again' : `The ${colour} part`,
    body: intro,
    build: [
      {
        type: 'arduino_digitalWrite',
        group: 'output',
        block: 'digital write pin ▾ to HIGH ▾',
        place: index === 0 ? 'Drag it inside the empty "forever".' : 'Snap it at the bottom of "forever".',
        set: `Choose pin ${pin} (${colour}). Leave HIGH.`,
      },
      {
        type: 'time_delay',
        group: 'start',
        block: 'wait 1000 milliseconds',
        find: WAIT_MS_FIND,
        place: 'Snap it under that block.',
        set: phase.ms === 1000 ? 'Leave it at 1000: one second.' : `Change 1000 to ${phase.ms}. ${phase.ms} milliseconds is ${seconds} seconds.`,
      },
      {
        type: 'arduino_digitalWrite',
        group: 'output',
        block: 'digital write pin ▾ to HIGH ▾',
        place: 'Snap it under the "wait" block.',
        set: `Choose pin ${pin}, then change HIGH to LOW.`,
      },
    ],
    picture: program(setupUpTo('green'), forever(...PHASES.slice(0, index + 1).flatMap(phaseBlocks))),
    expect: last
      ? 'Red for three seconds, yellow for one, green for three, yellow for one, then red again, over and over.'
      : index === 0
        ? 'Red is on for three seconds, goes off, and comes straight back on, because "forever" starts again.'
        : `Each lamp you have added so far takes its turn. Keep going: the sequence is not finished yet.`,
    cpp: `digitalWrite(${phase.lamp}, HIGH);\ndelay(${phase.ms});\ndigitalWrite(${phase.lamp}, LOW);`,
    hint: index === 0 ? undefined : 'Quicker: right-click a block and choose Duplicate, then change the copy.',
    check: last
      ? loopRunsInOrder('Red, yellow, green, yellow, in that order', ...PHASES.flatMap(phaseStatements))
      : loopRunsInOrder(`${name}: on, wait ${seconds} second${seconds === 1 ? '' : 's'}, off`, ...phaseStatements(phase)),
  };
}

const fullSequence: LessonActivity = {
  id: 'traffic-7',
  title: 'A real traffic light',
  goal: 'Run the full traffic light sequence: red, yellow, green, yellow, and round again.',
  realWorld: 'Traffic lights keep junctions safe by giving each direction its turn in a fixed order.',
  parts: PARTS,
  steps: [
    ...PHASES.map((_, index) => sequenceStep(index)),
    { id: 'run', kind: 'run', title: 'Run the simulation', body: RERUN_STEP_BODY, check: { kind: 'simulating' } },
    {
      id: 'observe',
      kind: 'observe',
      title: 'Watch a full cycle',
      body: 'Watch for about ten seconds: red, then yellow, then green, then yellow again.',
      check: { kind: 'seen', tokens: ['TRAFFIC_LIGHT:red', 'TRAFFIC_LIGHT:yellow', 'TRAFFIC_LIGHT:green'], label: 'Red, yellow and green each come on' },
    },
  ],
  solution: program(setupUpTo('green'), forever(...PHASES.flatMap(phaseBlocks))),
  observe: 'The lights run red, yellow, green, yellow, over and over.',
  wrapUp: 'You built a working traffic light controller: three outputs in a timed sequence, the same logic real ones use.',
};

export const trafficLightLesson: Lesson = {
  slug: 'traffic-light-module',
  title: 'Traffic Light Module',
  source: 'STEMAIDE CODER manual: Traffic Light Module',
  activities: [
    lampOn('red', 0),
    lampBlink('red', 1),
    lampOn('yellow', 2),
    lampBlink('yellow', 3),
    lampOn('green', 4),
    lampBlink('green', 5),
    fullSequence,
  ],
};
