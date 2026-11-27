import type { Lesson } from '../types';
import {
  all,
  BLOCKS_INTRO,
  DRAG_INTO_ON_START,
  forever,
  onStart,
  PLACING_HINT,
  program,
  serialBeginBlock,
  serialPrintLineBlock,
  sonarAddBlock,
  sonarReadBlock,
  WAIT_MS_FIND,
  waitBlock,
  waits,
  WIRING_HINT,
} from './helpers';

// Adapted from the STEMAIDE CODER manual "8. Ultrasonic Sensor" (8.0). Trig on pin 11, Echo on pin 12.

const finished = program(onStart(sonarAddBlock(11, 12), serialBeginBlock(9600)), forever(serialPrintLineBlock(sonarReadBlock()), waitBlock(100)));

export const ultrasonicLesson: Lesson = {
  slug: 'ultrasonic-sensor',
  title: 'Ultrasonic Sensor',
  source: 'STEMAIDE CODER manual: Ultrasonic Sensor',
  activities: [
    {
      id: 'ultrasonic-1',
      title: 'Build a digital ruler',
      goal: 'Measure how far away something is with an ultrasonic sensor, and show the distance on the Serial Monitor.',
      realWorld: 'Parking sensors and intruder alarms measure distance like this, using sound you cannot hear.',
      parts: [
        { type: 'ARDUINO_UNO', label: 'Arduino Uno', count: 1 },
        { type: 'ULTRASONIC', label: 'Ultrasonic sensor (HC-SR04)', count: 1 },
      ],
      learningLevel: 'explore',
      steps: [
        {
          id: 'place',
          kind: 'place',
          title: 'Place the parts',
          body: 'Add an Arduino Uno and an ultrasonic sensor.',
          hint: PLACING_HINT,
          check: all({ kind: 'parts', type: 'ARDUINO_UNO', count: 1 }, { kind: 'parts', type: 'ULTRASONIC', count: 1 }),
        },
        {
          id: 'wire',
          kind: 'wire',
          title: 'Wire the sensor',
          body: 'Connect VCC to 5V, GND to GND, Trig to pin 11 and Echo to pin 12.',
          hint: `${WIRING_HINT} Trig sends out a sound pulse; Echo listens for it to bounce back.`,
          check: all(
            { kind: 'wired', type: 'ULTRASONIC', pin: 'VCC', to: '5V' },
            { kind: 'wired', type: 'ULTRASONIC', pin: 'GND', to: 'GND' },
            { kind: 'wired', type: 'ULTRASONIC', pin: 'TRIG', to: '11' },
            { kind: 'wired', type: 'ULTRASONIC', pin: 'ECHO', to: '12' },
          ),
        },
        {
          id: 'code-setup',
          kind: 'code',
          title: 'Set up the sensor and Serial Monitor',
          body: `${BLOCKS_INTRO} In "on start", tell the board which pins the sensor uses, and switch on the Serial Monitor: the panel at the bottom of the screen where the board can send text.`,
          build: [
            {
              type: 'arduino_sonar_add',
              group: 'sense',
              block: 'add sonar mySonar trig ▾ echo ▾',
              find: 'Scroll down to the first "Named instances" heading: it is just under it. Do not use "add ultrasonic" at the top.',
              place: DRAG_INTO_ON_START,
              set: 'Leave the name mySonar. Choose 11 for trig and 12 for echo.',
            },
            {
              type: 'arduino_serialBegin',
              group: 'messages',
              block: 'Serial begin at baud 9600 ▾',
              place: 'Snap it under the "add sonar" block.',
              set: 'Leave 9600 as it is.',
            },
          ],
          picture: program(onStart(sonarAddBlock(11, 12), serialBeginBlock(9600)), forever()),
          expect: 'Nothing shows yet: the board knows about the sensor, but you have not told it to measure anything.',
          cpp: 'int Trig = 11;\nint Echo = 12;\n\npinMode(Trig, OUTPUT);\npinMode(Echo, INPUT);\nSerial.begin(9600);',
          check: all(
            { kind: 'code', pattern: '_trig = 11;', label: 'Trig is on pin 11' },
            { kind: 'code', pattern: '_echo = 12;', label: 'Echo is on pin 12' },
            { kind: 'code', pattern: 'Serial\\.begin\\(\\s*9600\\s*\\)', label: 'Serial Monitor is started' },
          ),
        },
        {
          id: 'code-print',
          kind: 'code',
          title: 'Print the distance',
          body: 'In "forever", measure the distance and print it, ten times a second. The distance block is round: it drops into the gap on the "Serial print line" block.',
          build: [
            {
              type: 'arduino_serialPrintln',
              group: 'messages',
              block: 'Serial print line ▢',
              place: 'Drag it inside "forever".',
            },
            {
              type: 'arduino_sonar_read',
              group: 'sense',
              block: 'cm ▾ distance from mySonar ▾',
              find: 'It is just under "add sonar mySonar" in the Sensors drawer.',
              place: 'Drop it into the gap on the "Serial print line" block.',
              set: 'Leave cm: it measures in centimetres.',
            },
            {
              type: 'time_delay',
              group: 'start',
              block: 'wait 1000 milliseconds',
              find: WAIT_MS_FIND,
              place: 'Snap it under the "Serial print line" block.',
              set: 'Change 1000 to 100: a tenth of a second.',
            },
          ],
          picture: finished,
          expect: 'The Serial Monitor shows a new distance in centimetres ten times a second.',
          cpp: 'digitalWrite(Trig, HIGH);\ndelay(100);\ndigitalWrite(Trig, LOW);\nduration = pulseIn(Echo, HIGH);\ndistance = duration * 0.034 / 2;\nSerial.println(distance);\ndelay(100);',
          hint: 'The "cm distance" block does the pulse timing for you. The C++ shows what it does: sound travels 0.034 cm per microsecond, there and back, so the time is halved.',
          check: all({ kind: 'code', pattern: 'Serial\\.println\\([^)]*_read_cm\\(\\)', label: 'Prints the distance' }, waits(100)),
        },
        {
          id: 'run',
          kind: 'run',
          title: 'Run the simulation',
          body: 'Click Run Simulation at the top of the Blocks screen, then open the Serial Monitor tab at the bottom.',
          check: { kind: 'simulating' },
        },
        {
          id: 'observe',
          kind: 'observe',
          title: 'Read the distance',
          body: 'The Serial Monitor should show a new distance in centimetres every tenth of a second. Move the Distance slider in the Live inputs box (bottom-left) and watch the numbers follow.',
          hint: 'The Live inputs box appears while the simulation runs. On a real board, move your hand in front of the sensor instead.',
        },
      ],
      solution: finished,
      observe: 'The Serial Monitor shows the distance in centimetres, updating as it changes.',
      wrapUp: 'You turned an echo into a measurement. The same idea helps robots avoid walls and cars park safely.',
    },
  ],
};
