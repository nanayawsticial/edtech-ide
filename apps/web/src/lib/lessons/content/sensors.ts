import type { Lesson } from '../types';
import {
  all,
  analogReadBlock,
  digitalReadBlock,
  forever,
  onStart,
  PLACING_HINT,
  printsLine,
  program,
  readsAnalog,
  readsDigital,
  serialBeginBlock,
  serialPrintLineBlock,
  startsSerial,
  waitBlock,
  waits,
  WIRING_HINT,
} from './helpers';

// Adapted from the STEMAIDE CODER manuals "6. Light Dependent Resistor (LDR)" (6.0) and
// "9. Sound Sensor" (9.0). LDR: DO -> pin 2, AO -> A0. Sound sensor: its analog output -> A0.

const LIVE_INPUTS_HINT = 'While the simulation runs, a Live inputs box appears in the bottom-left corner. Its sliders change what the sensor feels.';

export const ldrLesson: Lesson = {
  slug: 'light-dependent-resistor-ldr',
  title: 'Light Dependent Resistor (LDR)',
  source: 'STEMAIDE CODER manual: Light Dependent Resistor (LDR)',
  activities: [
    {
      id: 'ldr-1',
      title: 'Measure the light',
      goal: 'Read how bright it is with a light sensor, and show the reading on the Serial Monitor.',
      realWorld: 'Street lights and phone screens use light sensors to switch on at night or dim in the dark.',
      parts: [
        { type: 'ARDUINO_UNO', label: 'Arduino Uno', count: 1 },
        { type: 'LDR', label: 'Light sensor (LDR) module', count: 1 },
      ],
      learningLevel: 'explore',
      steps: [
        {
          id: 'place',
          kind: 'place',
          title: 'Place the parts',
          body: 'Add an Arduino Uno and a light sensor module. The module connects with jumper wires, so you do not need a breadboard.',
          hint: PLACING_HINT,
          check: all({ kind: 'parts', type: 'ARDUINO_UNO', count: 1 }, { kind: 'parts', type: 'LDR', count: 1 }),
        },
        {
          id: 'wire',
          kind: 'wire',
          title: 'Wire the sensor',
          body: 'Connect VCC to 5V and GND to GND. Then connect DO to pin 2 and AO to A0.',
          hint: `${WIRING_HINT} AO (analog out) gives a number for how bright it is. DO (digital out) is just on or off: it switches when it gets dark.`,
          check: all(
            { kind: 'wired', type: 'LDR', pin: 'VCC', to: '5V' },
            { kind: 'wired', type: 'LDR', pin: 'GND', to: 'GND' },
            { kind: 'wired', type: 'LDR', pin: 'DO', to: '2' },
            { kind: 'wired', type: 'LDR', pin: 'AO', to: 'A0' },
          ),
        },
        {
          id: 'code-setup',
          kind: 'code',
          title: 'Start the Serial Monitor',
          body: 'Open Blocks. From Messages, add "Serial begin at baud 9600" into setup. It lets the board send text to the Serial Monitor at the bottom of the screen.',
          blocks: ['setup', 'Serial begin at baud 9600'],
          cpp: 'const int LDR_PIN = A0;\nconst int DO_PIN = 2;\n\npinMode(DO_PIN, INPUT);\nSerial.begin(9600);',
          check: startsSerial,
        },
        {
          id: 'code-read',
          kind: 'code',
          title: 'Print both readings',
          body: 'In loop: add "Serial print line" with "analog read pin A0" inside it. Below it, another "Serial print line" with "digital read pin 2" inside. Then wait 500 milliseconds.',
          blocks: ['loop', 'Serial print line (analog read pin A0)', 'Serial print line (digital read pin 2)', 'wait 500 milliseconds'],
          cpp: 'int ldrValue = analogRead(LDR_PIN);\nint digitalValue = digitalRead(DO_PIN);\nSerial.print("Analog Value: ");\nSerial.println(ldrValue);\nSerial.print("Digital Value: ");\nSerial.println(digitalValue);\ndelay(500);',
          hint: 'Find "analog read pin" and "digital read pin" under Output. Drop them into the gap on the "Serial print line" block.',
          check: all(readsAnalog('A0'), readsDigital(2), printsLine, waits(500)),
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
          title: 'Change the light',
          body: 'Move the Light slider in the Live inputs box. In bright light the analog number goes down; in the dark it goes up. When it gets dark, the digital value changes from 0 to 1.',
          hint: LIVE_INPUTS_HINT,
        },
      ],
      solution: program(
        onStart(serialBeginBlock(9600)),
        forever(serialPrintLineBlock(analogReadBlock('A0')), serialPrintLineBlock(digitalReadBlock(2)), waitBlock(500)),
      ),
      observe: 'The analog reading falls as the light gets brighter, and the digital value is 1 when it is dark.',
      wrapUp: 'Your board can now sense light. Next you could switch an LED on when the digital value says it is dark: an automatic night light.',
    },
  ],
};

export const soundSensorLesson: Lesson = {
  slug: 'sound-sensor',
  title: 'Sound Sensor',
  source: 'STEMAIDE CODER manual: Sound Sensor',
  activities: [
    {
      id: 'sound-1',
      title: 'Build a noise checker',
      goal: 'Measure how loud it is with a sound sensor, and show the loudness on the Serial Monitor.',
      realWorld: 'Noise meters in libraries, factories and classrooms warn when it gets too loud.',
      parts: [
        { type: 'ARDUINO_UNO', label: 'Arduino Uno', count: 1 },
        { type: 'SOUND_SENSOR', label: 'Sound sensor module', count: 1 },
      ],
      learningLevel: 'explore',
      steps: [
        {
          id: 'place',
          kind: 'place',
          title: 'Place the parts',
          body: 'Add an Arduino Uno and a sound sensor module.',
          hint: PLACING_HINT,
          check: all({ kind: 'parts', type: 'ARDUINO_UNO', count: 1 }, { kind: 'parts', type: 'SOUND_SENSOR', count: 1 }),
        },
        {
          id: 'wire',
          kind: 'wire',
          title: 'Wire the sensor',
          body: 'Connect VCC to 5V, GND to GND, and the analog output (AOUT, called OUT on some sensors) to A0.',
          hint: WIRING_HINT,
          check: all(
            { kind: 'wired', type: 'SOUND_SENSOR', pin: 'VCC', to: '5V' },
            { kind: 'wired', type: 'SOUND_SENSOR', pin: 'GND', to: 'GND' },
            { kind: 'wired', type: 'SOUND_SENSOR', pin: 'AO', to: 'A0' },
          ),
        },
        {
          id: 'code-setup',
          kind: 'code',
          title: 'Start the Serial Monitor',
          body: 'Open Blocks. From Messages, add "Serial begin at baud 9600" into setup.',
          blocks: ['setup', 'Serial begin at baud 9600'],
          cpp: 'const int soundSensorPin = A0;\n\nSerial.begin(9600);',
          check: startsSerial,
        },
        {
          id: 'code-read',
          kind: 'code',
          title: 'Print the loudness',
          body: 'In loop: add "Serial print line" with "analog read pin A0" inside it, then wait 50 milliseconds.',
          blocks: ['loop', 'Serial print line (analog read pin A0)', 'wait 50 milliseconds'],
          cpp: 'int soundValue = analogRead(soundSensorPin);\nSerial.println(soundValue);\ndelay(50);',
          check: all(readsAnalog('A0'), printsLine, waits(50)),
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
          title: 'Make some noise',
          body: 'Move the Loudness slider in the Live inputs box. The louder it is, the bigger the number. On a real board, clap or talk near the sensor.',
          hint: LIVE_INPUTS_HINT,
        },
      ],
      solution: program(onStart(serialBeginBlock(9600)), forever(serialPrintLineBlock(analogReadBlock('A0')), waitBlock(50))),
      observe: 'The number on the Serial Monitor rises when it is loud and falls when it is quiet.',
      wrapUp: 'Your board can now hear. Next you could light an LED or sound a buzzer when it gets too loud.',
    },
  ],
};
