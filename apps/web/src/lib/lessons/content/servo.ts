import type { Lesson, LessonActivity, StepCheck } from '../types';
import { all, countBlock, forever, onStart, PLACING_HINT, program, servoAttachBlock, servoWriteBlock, waitBlock, WIRING_HINT } from './helpers';

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
      body: 'Open Blocks. From Sensors, drag "attach servo on pin" into setup. Name it myServo and pick pin 10.',
      blocks: ['setup', 'attach servo myServo on pin 10'],
      cpp: '#include <Servo.h>\nServo motor;\n\nmotor.attach(10);',
      check: attaches,
    },
    {
      id: 'code-move',
      kind: 'code',
      title: 'Turn to 90° and 180°',
      body: 'In loop: set the servo to 90 degrees, wait 1000 milliseconds, set it to 180 degrees, wait 1000 milliseconds.',
      blocks: ['loop', 'set servo myServo to 90 degrees', 'wait 1000 milliseconds', 'set servo myServo to 180 degrees', 'wait 1000 milliseconds'],
      cpp: 'motor.write(90);\ndelay(1000);\nmotor.write(180);\ndelay(1000);',
      hint: 'The wait gives the servo time to get there before it is told to move again.',
      check: all(turnsTo(90), turnsTo(180)),
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
  solution: program(
    onStart(servoAttachBlock(10)),
    forever(servoWriteBlock(90), waitBlock(1000), servoWriteBlock(180), waitBlock(1000)),
  ),
  observe: 'The servo arm swings between 90° and 180°.',
  wrapUp: 'Servos turn to the exact angle you ask for. That is what makes them useful for arms, doors and steering.',
};

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
      body: 'Keep your circuit. Remove the blocks inside loop. Add "count with i from 0 to 180 by 1" from Decide. Inside it, set the servo to i degrees and wait 10 milliseconds.',
      blocks: ['count with i from 0 to 180 by 1', 'set servo myServo to (i) degrees', 'wait 10 milliseconds'],
      cpp: 'for (int i = 0; i <= 180; i++) {\n  motor.write(i);\n  delay(10);\n}',
      hint: 'Find the round "i" block under Variables and drop it into the angle of the servo block.',
      check: all({ kind: 'code', pattern: 'for\\s*\\(', label: 'Has a counting loop' }, turnsTo('i')),
    },
    {
      id: 'code-down',
      kind: 'code',
      title: 'Count back down',
      body: 'Below the first loop, add a second "count with" from 180 to 0 by 1 (the same as counting down), again setting the servo to i and waiting 10 milliseconds.',
      blocks: ['count with i from 180 to 0 by 1', 'set servo myServo to (i) degrees', 'wait 10 milliseconds'],
      cpp: 'for (int i = 180; i >= 0; i--) {\n  motor.write(i);\n  delay(10);\n}',
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
  solution: program(
    onStart(servoAttachBlock(10)),
    forever(
      countBlock(0, 180, servoWriteBlock('i'), waitBlock(10)),
      countBlock(180, 0, servoWriteBlock('i'), waitBlock(10)),
    ),
  ),
  observe: 'The servo sweeps smoothly from 0° to 180° and back.',
  wrapUp: 'Many small steps with short waits make smooth movement. Change the wait to make the sweep faster or slower.',
};

export const servoLesson: Lesson = {
  slug: 'servo-motor',
  title: 'Servo Motor',
  source: 'STEMAIDE CODER manual: Servo Motor',
  activities: [oneAngle, sweep],
};
