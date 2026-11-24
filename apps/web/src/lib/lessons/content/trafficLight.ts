import type { Lesson, LessonActivity, LessonStep, StepCheck } from '../types';
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

const PARTS = [...STARTER_BOARD_PARTS, { type: 'TRAFFIC_LIGHT', label: 'Traffic light module', count: 1 }];

function wiredLamp(lamp: Lamp): StepCheck {
  return { kind: 'wired', type: 'TRAFFIC_LIGHT', pin: LAMPS[lamp].modulePin, to: String(LAMPS[lamp].pin) };
}

function lampOn(lamp: Lamp, index: number): LessonActivity {
  const { pin, modulePin, name, meaning } = LAMPS[lamp];
  const first = index === 0;
  const steps: LessonStep[] = [];

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
      title: `Wire ${name.toLowerCase()}`,
      body: `Keep your circuit. Connect the module's ${modulePin} pin to pin ${pin}.`,
      hint: WIRING_HINT,
      check: wiredLamp(lamp),
    });
  }

  steps.push(
    {
      id: 'code',
      kind: 'code',
      title: `Switch ${name.toLowerCase()} on`,
      body: first
        ? 'Open Blocks. In loop, add "digital write pin 5 to HIGH". HIGH sends power out of pin 5 to the red lamp.'
        : `Open Blocks. Delete the blocks inside loop (drag them to the bin). Then add "digital write pin ${pin} to HIGH".`,
      blocks: ['loop', `digital write pin ${pin} to HIGH`],
      cpp: `const int ${lamp} = ${pin};\n\npinMode(${lamp}, OUTPUT);\ndigitalWrite(${lamp}, HIGH);`,
      check: writesPin(pin, 'HIGH'),
    },
    { id: 'run', kind: 'run', title: 'Run the simulation', body: first ? RUN_STEP_BODY : RERUN_STEP_BODY, check: { kind: 'simulating' } },
    {
      id: 'observe',
      kind: 'observe',
      title: `See the ${name.toLowerCase()} light`,
      body: `The ${name.toLowerCase()} lamp should be on and stay on.`,
      check: { kind: 'seen', tokens: [`TRAFFIC_LIGHT:${lamp}`], label: `${name} lamp is on` },
    },
  );

  return {
    id: `traffic-${index + 1}`,
    title: `${name} light on`,
    goal: `Switch on the ${name.toLowerCase()} lamp of the traffic light.`,
    realWorld: meaning,
    parts: PARTS,
    steps,
    solution: program(onStart(pinModeBlock(pin)), forever(writeBlock(pin, 'HIGH'))),
    observe: `The ${name.toLowerCase()} lamp is on.`,
    wrapUp: `Each lamp has its own pin, so your program can choose exactly which light is on.`,
  };
}

function lampBlink(lamp: Lamp, index: number): LessonActivity {
  const { pin, name, blinkMeaning } = LAMPS[lamp];
  return {
    id: `traffic-${index + 1}`,
    title: `${name} light blinking`,
    goal: `Make the ${name.toLowerCase()} lamp blink.`,
    realWorld: blinkMeaning,
    parts: PARTS,
    steps: [
      {
        id: 'code',
        kind: 'code',
        title: 'On, wait, off, wait',
        body: `In loop, after "digital write pin ${pin} to HIGH", add: wait 400 milliseconds, set pin ${pin} LOW, wait 400 milliseconds.`,
        blocks: [`digital write pin ${pin} to HIGH`, 'wait 400 milliseconds', `digital write pin ${pin} to LOW`, 'wait 400 milliseconds'],
        cpp: `digitalWrite(${lamp}, HIGH);\ndelay(400);\ndigitalWrite(${lamp}, LOW);\ndelay(400);`,
        check: all(writesPin(pin, 'HIGH'), writesPin(pin, 'LOW'), waits(400)),
      },
      { id: 'run', kind: 'run', title: 'Run the simulation', body: RERUN_STEP_BODY, check: { kind: 'simulating' } },
      {
        id: 'observe',
        kind: 'observe',
        title: 'Watch it blink',
        body: `The ${name.toLowerCase()} lamp should switch on and off a few times a second.`,
        check: { kind: 'blinked', type: 'TRAFFIC_LIGHT', times: 4 },
      },
    ],
    solution: program(onStart(pinModeBlock(pin)), forever(writeBlock(pin, 'HIGH'), waitBlock(400), writeBlock(pin, 'LOW'), waitBlock(400))),
    observe: `The ${name.toLowerCase()} lamp blinks.`,
    wrapUp: 'A short wait makes a fast blink. Try 1000 milliseconds to see the difference.',
  };
}

const fullSequence: LessonActivity = {
  id: 'traffic-7',
  title: 'A real traffic light',
  goal: 'Run the full traffic light sequence: red, yellow, green, yellow, and round again.',
  realWorld: 'Traffic lights keep junctions safe by giving each direction its turn in a fixed order.',
  parts: PARTS,
  steps: [
    {
      id: 'code',
      kind: 'code',
      title: 'Program the sequence',
      body: 'Delete the blocks inside loop. Then build: red on, wait 3000, red off; yellow on, wait 1000, yellow off; green on, wait 3000, green off; yellow on, wait 1000, yellow off.',
      blocks: [
        'digital write pin 5 to HIGH', 'wait 3000 milliseconds', 'digital write pin 5 to LOW',
        'digital write pin 6 to HIGH', 'wait 1000 milliseconds', 'digital write pin 6 to LOW',
        'digital write pin 7 to HIGH', 'wait 3000 milliseconds', 'digital write pin 7 to LOW',
        'digital write pin 6 to HIGH', 'wait 1000 milliseconds', 'digital write pin 6 to LOW',
      ],
      cpp: 'digitalWrite(red, HIGH);    delay(3000); digitalWrite(red, LOW);\ndigitalWrite(yellow, HIGH); delay(1000); digitalWrite(yellow, LOW);\ndigitalWrite(green, HIGH);  delay(3000); digitalWrite(green, LOW);\ndigitalWrite(yellow, HIGH); delay(1000); digitalWrite(yellow, LOW);',
      hint: 'Build one colour (on, wait, off), then right-click its blocks and choose Duplicate for the next one.',
      check: all(writesPin(5, 'HIGH'), writesPin(6, 'HIGH'), writesPin(7, 'HIGH'), waits(3000), waits(1000)),
    },
    { id: 'run', kind: 'run', title: 'Run the simulation', body: RERUN_STEP_BODY, check: { kind: 'simulating' } },
    {
      id: 'observe',
      kind: 'observe',
      title: 'Watch a full cycle',
      body: 'Watch for about ten seconds: red, then yellow, then green, then yellow again.',
      check: { kind: 'seen', tokens: ['TRAFFIC_LIGHT:red', 'TRAFFIC_LIGHT:yellow', 'TRAFFIC_LIGHT:green'], label: 'Red, yellow and green each come on' },
    },
  ],
  solution: program(
    onStart(pinModeBlock(5), pinModeBlock(6), pinModeBlock(7)),
    forever(
      writeBlock(5, 'HIGH'), waitBlock(3000), writeBlock(5, 'LOW'),
      writeBlock(6, 'HIGH'), waitBlock(1000), writeBlock(6, 'LOW'),
      writeBlock(7, 'HIGH'), waitBlock(3000), writeBlock(7, 'LOW'),
      writeBlock(6, 'HIGH'), waitBlock(1000), writeBlock(6, 'LOW'),
    ),
  ),
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
