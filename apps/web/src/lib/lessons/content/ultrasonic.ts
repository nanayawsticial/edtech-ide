import type { Lesson } from '../types';
import {
  all,
  forever,
  onStart,
  PLACING_HINT,
  program,
  serialBeginBlock,
  serialPrintLineBlock,
  sonarAddBlock,
  sonarReadBlock,
  waitBlock,
  WIRING_HINT,
} from './helpers';

// Adapted from the STEMAIDE CODER manual "8. Ultrasonic Sensor" (8.0). Trig on pin 11, Echo on pin 12.

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
          body: 'Open Blocks. Into setup, add "add sonar" from Sensors with trig 11 and echo 12, and "Serial begin at baud 9600" from Messages.',
          blocks: ['setup', 'add sonar mySonar trig 11 echo 12', 'Serial begin at baud 9600'],
          cpp: 'int Trig = 11;\nint Echo = 12;\n\npinMode(Trig, OUTPUT);\npinMode(Echo, INPUT);\nSerial.begin(9600);',
          hint: 'Serial begin lets the board send text to the Serial Monitor at the bottom of the screen.',
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
          body: 'In loop, add "Serial print line" and put "cm distance from mySonar" inside it. Then wait 100 milliseconds.',
          blocks: ['loop', 'Serial print line', 'cm distance from mySonar', 'wait 100 milliseconds'],
          cpp: 'digitalWrite(Trig, HIGH);\ndelay(100);\ndigitalWrite(Trig, LOW);\nduration = pulseIn(Echo, HIGH);\ndistance = duration * 0.034 / 2;\nSerial.println(distance);\ndelay(100);',
          hint: 'The "cm distance" block does the pulse timing for you. The C++ shows what it does: sound travels 0.034 cm per microsecond, there and back, so the time is halved.',
          check: { kind: 'code', pattern: 'Serial\\.println\\([^)]*_read_cm\\(\\)', label: 'Prints the distance' },
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
          body: 'The Serial Monitor should show a new distance in centimetres every tenth of a second. Change the distance on the sensor and watch the numbers follow.',
        },
      ],
      solution: program(
        onStart(sonarAddBlock(11, 12), serialBeginBlock(9600)),
        forever(serialPrintLineBlock(sonarReadBlock()), waitBlock(100)),
      ),
      observe: 'The Serial Monitor shows the distance in centimetres, updating as it changes.',
      wrapUp: 'You turned an echo into a measurement. The same idea helps robots avoid walls and cars park safely.',
    },
  ],
};
