import type { BlockInstruction, Lesson, LessonActivity, StepCheck } from '../types';
import {
  all,
  BLOCKS_INTRO,
  countBlock,
  DRAG_INTO_ON_START,
  EMPTY_FOREVER,
  forever,
  loopRunsInOrder,
  onStart,
  PLACING_HINT,
  program,
  servoAttachBlock,
  servoWriteBlock,
  WAIT_MS_FIND,
  waitBlock,
  waitStatement,
  WIRING_HINT,
} from './helpers';

// Adapted from the STEMAIDE CODER manuals "7. Servo Motor" (7.0 One Angle, 7.1 Sweep). Signal on pin 10.

const SERVO_PARTS = [
  { type: 'ARDUINO_UNO', label: 'Arduino Uno', count: 1 },
  { type: 'SERVO', label: 'Servo motor', count: 1 },
];

const SERVO_WIRING: StepCheck = all(
  { kind: 'wired', type: 'SERVO', pin: 'PWM', to: '10' },
  { kind: 'wired', type: 'SERVO', pin: 'VCC', to: '5V' },
  { kind: 'wired', type: 'SERVO', pin: 'GND', to: 'GND' },
);

const attaches: StepCheck = { kind: 'code', pattern: '\\.attach\\(\\s*10\\s*\\)', label: 'Servo is attached to pin 10' };

function turnsTo(angle: number | string): StepCheck {
  return { kind: 'code', pattern: `\\.write\\(\\s*${angle}\\s*\\)`, label: `Servo is told to turn to ${angle}${typeof angle === 'number' ? '°' : ''}` };
}

const writeAngleStatement = (angle: number) => `\\w+\\.write\\(\\s*${angle}\\s*\\);`;

/** The servo blocks that name myServo sit low in the Sensors drawer, below look-alikes. */
const FIND_NAMED_SERVO =
  'Scroll down the drawer to the second "Named instances" heading. Use the blocks that say myServo, not "No Servo Connected".';

const SET_SERVO = 'set servo myServo to 90 degrees';

const oneAngleProgram = program(onStart(servoAttachBlock(10)), forever(servoWriteBlock(90), waitBlock(1000), servoWriteBlock(180), waitBlock(1000)));

const oneAngle: LessonActivity = {
  id: 'servo-1',
  title: 'Turn a servo to an angle',
  goal: 'Make a servo motor turn to 90 degrees, then to 180 degrees, and back again.',
  realWorld: 'A robot arm moves by turning its servos to exact angles, like 90° or 180°.',
  parts: SERVO_PARTS,
  learningLevel: 'builder',
  steps: [
    {
      id: 'place',
      kind: 'place',
      title: 'Place the parts',
      body: 'Add an Arduino Uno and a servo motor. The servo plugs straight into the Arduino with wires, so you do not need a breadboard.',
      hint: PLACING_HINT,
      check: all({ kind: 'parts', type: 'ARDUINO_UNO', count: 1 }, { kind: 'parts', type: 'SERVO', count: 1 }),
    },
    {
      id: 'wire',
      kind: 'wire',
      title: 'Wire the servo',
      body: 'A servo has three wires. Connect the orange signal wire to pin 10, the red power wire to 5V, and the brown ground wire to GND.',
      hint: WIRING_HINT,
      check: SERVO_WIRING,
    },
    {
      id: 'code-attach',
      kind: 'code',
      title: 'Attach the servo',
      body: `${BLOCKS_INTRO} In "on start", tell the board that a servo called myServo is on pin 10.`,
      build: [
        {
          type: 'arduino_servo_attach',
          group: 'sense',
          block: 'attach servo myServo on pin ▾',
          find: FIND_NAMED_SERVO,
          place: DRAG_INTO_ON_START,
          set: 'Leave the name myServo. Click the pin number and choose 10.',
        },
      ],
      picture: program(onStart(servoAttachBlock(10)), forever()),
      expect: 'Nothing moves yet: the board now knows where the servo is.',
      cpp: '#include <Servo.h>\nServo motor;\n\nmotor.attach(10);',
      check: attaches,
    },
    {
      id: 'code-move',
      kind: 'code',
      title: 'Turn to 90° and 180°',
      body: 'In "forever": turn to 90 degrees, wait, turn to 180 degrees, wait. The waits give the arm time to get there.',
      build: [
        {
          type: 'arduino_servo_set_angle',
          group: 'sense',
          block: SET_SERVO,
          find: 'It is two blocks under "attach servo myServo", in the same place.',
          place: 'Drag it inside "forever".',
          set: 'Leave 90.',
        },
        {
          type: 'time_delay',
          group: 'start',
          block: 'wait 1000 milliseconds',
          find: WAIT_MS_FIND,
          place: 'Snap it under the "set servo" block.',
          set: 'Leave it at 1000: one second.',
        },
        {
          type: 'arduino_servo_set_angle',
          group: 'sense',
          block: SET_SERVO,
          place: 'Snap it under the "wait" block.',
          set: 'Click 90 and type 180.',
        },
        {
          type: 'time_delay',
          group: 'start',
          block: 'wait 1000 milliseconds',
          find: WAIT_MS_FIND,
          place: 'Snap it at the bottom of "forever".',
          set: 'Leave it at 1000.',
        },
      ],
      picture: oneAngleProgram,
      expect: 'The servo arm swings to 90°, waits a second, swings to 180°, waits, and does it again.',
      cpp: 'motor.write(90);\ndelay(1000);\nmotor.write(180);\ndelay(1000);',
      hint: 'Without the waits, the servo is told to move again before it gets there, and it hardly moves.',
      check: all(
        turnsTo(90),
        turnsTo(180),
        loopRunsInOrder('90°, wait, 180°, wait, in that order', writeAngleStatement(90), waitStatement(1000), writeAngleStatement(180), waitStatement(1000)),
      ),
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
      title: 'Watch the arm',
      body: 'The servo arm should swing between 90° and 180° every second.',
      check: { kind: 'servoReached', angles: [90, 180] },
    },
  ],
  solution: oneAngleProgram,
  observe: 'The servo arm swings between 90° and 180°.',
  wrapUp: 'Servos turn to the exact angle you ask for. That is what makes them useful for arms, doors and steering.',
};

/** A "count with" loop that turns the servo one degree at a time: the loop, the servo block, "i", the wait. */
function countingBlocks(from: number, to: number, firstPlace: string, which: string): BlockInstruction[] {
  return [
    {
      type: 'controls_for_loop',
      group: 'decide',
      block: 'count with i from 0 to 10 by 1',
      place: firstPlace,
      set: from === 0 ? 'Change 10 to 180. Leave 0 and 1.' : `Change 0 to ${from} and 10 to ${to}: it counts down from ${from} to ${to}.`,
    },
    {
      type: 'arduino_servo_set_angle',
      group: 'sense',
      block: SET_SERVO,
      find: 'It is under the second "Named instances" heading, below "attach servo myServo".',
      place: `Snap it inside the ${which} "count with" block.`,
    },
    {
      type: 'variables_get',
      group: 'variables',
      block: 'i',
      place: `Drop it onto the 90 in the ${which} "set servo" block, so the servo turns to i degrees.`,
    },
    {
      type: 'time_delay',
      group: 'start',
      block: 'wait 1000 milliseconds',
      find: WAIT_MS_FIND,
      place: `Snap it under the ${which} "set servo" block, still inside "count with".`,
      set: 'Change 1000 to 10: a tiny pause between each degree.',
    },
  ];
}

const sweepUp = program(onStart(servoAttachBlock(10)), forever(countBlock(0, 180, servoWriteBlock('i'), waitBlock(10))));
const sweepProgram = program(
  onStart(servoAttachBlock(10)),
  forever(countBlock(0, 180, servoWriteBlock('i'), waitBlock(10)), countBlock(180, 0, servoWriteBlock('i'), waitBlock(10))),
);

const sweep: LessonActivity = {
  id: 'servo-2',
  title: 'Sweep like a wiper',
  goal: 'Make the servo sweep smoothly from 0° to 180° and back, like a windscreen wiper.',
  realWorld: 'Windscreen wipers and automatic doors move to and fro smoothly in the same way.',
  parts: SERVO_PARTS,
  learningLevel: 'explore',
  steps: [
    {
      id: 'code-up',
      kind: 'code',
      title: 'Count up to 180',
      body: `Keep your circuit. ${EMPTY_FOREVER} Then use a counting block: it counts i from 0 to 180, and each time it turns the servo to i degrees.`,
      build: countingBlocks(0, 180, 'Drag it inside the empty "forever".', 'first'),
      picture: sweepUp,
      expect: 'The arm sweeps smoothly from 0° to 180°, then jumps straight back to 0° and sweeps again.',
      cpp: 'for (int i = 0; i <= 180; i++) {\n  motor.write(i);\n  delay(10);\n}',
      hint: 'The round "i" block appears in the Variables drawer once the "count with" block is in your program.',
      check: all({ kind: 'code', pattern: 'for\\s*\\(', label: 'Has a counting loop' }, turnsTo('i')),
    },
    {
      id: 'code-down',
      kind: 'code',
      title: 'Count back down',
      body: 'To sweep back smoothly instead of jumping, add a second counting block under the first one that counts from 180 down to 0.',
      build: countingBlocks(180, 0, 'Snap it under the first "count with" block, not inside it.', 'second'),
      picture: sweepProgram,
      expect: 'The arm sweeps smoothly all the way across and all the way back, again and again.',
      cpp: 'for (int i = 180; i >= 0; i--) {\n  motor.write(i);\n  delay(10);\n}',
      hint: 'Quicker: right-click the first "count with" block and choose Duplicate. The copy comes with the blocks inside it; change its numbers to 180 and 0.',
      check: { kind: 'code', pattern: 'for\\s*\\([\\s\\S]*for\\s*\\(', label: 'Has a second loop counting back' },
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
      title: 'Watch it sweep',
      body: 'The arm should sweep smoothly all the way across and back.',
      check: { kind: 'servoReached', angles: [0, 180] },
    },
  ],
  solution: sweepProgram,
  observe: 'The servo sweeps smoothly from 0° to 180° and back.',
  wrapUp: 'Many small steps with short waits make smooth movement. Change the wait to make the sweep faster or slower.',
};

export const servoLesson: Lesson = {
  slug: 'servo-motor',
  title: 'Servo Motor',
  source: 'STEMAIDE CODER manual: Servo Motor',
  activities: [oneAngle, sweep],
};
