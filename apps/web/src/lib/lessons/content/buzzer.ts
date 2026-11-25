import type { Lesson } from '../types';
import {
  all,
  forever,
  onStart,
  pinModeBlock,
  PLACING_HINT,
  program,
  RERUN_STEP_BODY,
  RUN_STEP_BODY,
  setsOutput,
  STARTER_BOARD_PARTS,
  waitBlock,
  waits,
  WIRING_HINT,
  writeBlock,
  writesPin,
} from './helpers';

// Adapted from the STEMAIDE CODER manuals "2. Buzzer" (2.1 On and Off, 2.2 Beep). + leg on pin 3.

const PARTS = [...STARTER_BOARD_PARTS, { type: 'BUZZER', label: 'Buzzer', count: 1 }];

export const buzzerLesson: Lesson = {
  slug: 'buzzer',
  title: 'Buzzer',
  source: 'STEMAIDE CODER manual: Buzzer',
  activities: [
    {
      id: 'buzzer-1',
      title: 'Switch a buzzer on and off',
      goal: 'Make a buzzer sound, then make it stop, by switching one pin HIGH and LOW.',
      realWorld: 'Microwaves, washing machines and alarm clocks beep to tell you something is done.',
      parts: PARTS,
      steps: [
        {
          id: 'place',
          kind: 'place',
          title: 'Place the parts',
          body: 'Add an Arduino Uno, a breadboard and a buzzer. Plug the buzzer into the breadboard.',
          hint: PLACING_HINT,
          check: all(
            { kind: 'parts', type: 'ARDUINO_UNO', count: 1 },
            { kind: 'parts', type: 'BREADBOARD', count: 1 },
            { kind: 'parts', type: 'BUZZER', count: 1 },
          ),
        },
        {
          id: 'wire',
          kind: 'wire',
          title: 'Wire the buzzer',
          body: "A buzzer has a + leg and a − leg. Connect the + leg to pin 3 and the − leg to GND.",
          hint: `${WIRING_HINT} The + leg is usually the longer one, and the top of the buzzer is marked +.`,
          check: all({ kind: 'wired', type: 'BUZZER', pin: 'POS', to: '3' }, { kind: 'wired', type: 'BUZZER', pin: 'NEG', to: 'GND' }),
        },
        {
          id: 'code-on',
          kind: 'code',
          title: 'Switch it on',
          body: 'Open Blocks. Into setup, add "set pin 3 to OUTPUT" and then "digital write pin 3 to HIGH". Setup runs once, so the buzzer is switched on and stays on.',
          blocks: ['setup', 'set pin 3 to OUTPUT', 'digital write pin 3 to HIGH'],
          cpp: 'int buzzer = 3;\n\npinMode(buzzer, OUTPUT);\ndigitalWrite(buzzer, HIGH);',
          check: all(setsOutput(3), writesPin(3, 'HIGH')),
          solution: program(onStart(pinModeBlock(3), writeBlock(3, 'HIGH'))),
        },
        { id: 'run', kind: 'run', title: 'Run the simulation', body: RUN_STEP_BODY, check: { kind: 'simulating' } },
        {
          id: 'observe-on',
          kind: 'observe',
          title: 'Listen with your eyes',
          body: 'The buzzer shows sound waves while it is beeping. On a real board you would hear a steady beep.',
          check: { kind: 'seen', tokens: ['BUZZER:on'], label: 'Buzzer is beeping' },
        },
        {
          id: 'code-off',
          kind: 'code',
          title: 'Switch it off',
          body: 'Change the HIGH in "digital write pin 3" to LOW, then run the simulation again. The buzzer goes quiet.',
          blocks: ['digital write pin 3 to LOW'],
          cpp: 'digitalWrite(buzzer, LOW);',
          check: writesPin(3, 'LOW'),
        },
      ],
      solution: program(onStart(pinModeBlock(3), writeBlock(3, 'LOW'))),
      observe: 'HIGH makes the buzzer beep; LOW makes it stop.',
      wrapUp: 'A buzzer is switched just like an LED: HIGH for on, LOW for off. Only the result is a sound instead of light.',
    },
    {
      id: 'buzzer-2',
      title: 'Make it beep',
      goal: 'Make the buzzer beep on and off every second, like an alarm.',
      realWorld: 'Ambulances, reversing trucks and smoke alarms all use beeping patterns to get your attention.',
      parts: PARTS,
      steps: [
        {
          id: 'code',
          kind: 'code',
          title: 'Beep in a loop',
          body: 'Keep your circuit. Move the "digital write" block out of setup. In loop: set pin 3 HIGH, wait 1000 milliseconds, set it LOW, wait 1000 milliseconds.',
          blocks: ['loop', 'digital write pin 3 to HIGH', 'wait 1000 milliseconds', 'digital write pin 3 to LOW', 'wait 1000 milliseconds'],
          cpp: 'digitalWrite(buzzer, HIGH);\ndelay(1000);\ndigitalWrite(buzzer, LOW);\ndelay(1000);',
          hint: 'Try a shorter wait, like 200 milliseconds, for a faster, more urgent beep.',
          check: all(writesPin(3, 'HIGH'), writesPin(3, 'LOW'), waits(1000)),
        },
        { id: 'run', kind: 'run', title: 'Run the simulation', body: RERUN_STEP_BODY, check: { kind: 'simulating' } },
        {
          id: 'observe',
          kind: 'observe',
          title: 'Watch it beep',
          body: 'The sound waves should appear for one second, then disappear for one second, again and again.',
          check: { kind: 'blinked', type: 'BUZZER', times: 4 },
        },
      ],
      solution: program(onStart(pinModeBlock(3)), forever(writeBlock(3, 'HIGH'), waitBlock(1000), writeBlock(3, 'LOW'), waitBlock(1000))),
      observe: 'The buzzer beeps for one second, then is quiet for one second.',
      wrapUp: 'On, wait, off, wait: the same pattern that blinks an LED makes an alarm beep.',
    },
  ],
};
