/**
 * In-app lessons: step-by-step activities adapted from the STEMAIDE manuals.
 *
 * A lesson (one per course catalog entry, matched by slug) holds a few activities. Each activity
 * walks the learner through placing parts, wiring, building the code with blocks (the matching
 * C++ is shown alongside), running the simulation and checking what happens. Activities in one
 * lesson build on the same circuit, so later ones only describe what changes.
 */

import type { ToolboxLearningLevel } from '@/lib/blockly/guidedToolbox';
import type { MicroPythonLibraryId } from './libraries';

/** A board pin as the netlist names it: '6', 'A0', '5V'. 'GND' matches any ground pin. */
export type BoardPinRef = string;

/** Every check can carry its own short label for the checklist; otherwise one is generated. */
export type StepCheck = { label?: string } & (
  /** At least `count` parts of this component type are on the canvas. */
  | { kind: 'parts'; type: string; count: number }
  /**
   * Some part of `type` has `pin` (any pin when omitted) connected to the board pin `to`,
   * through the breadboard and jumper wires. With `viaResistor`, a resistor in between counts too.
   * With `count`, at least that many different parts must be wired this way.
   */
  | { kind: 'wired'; type: string; pin?: string; to: BoardPinRef; viaResistor?: boolean; count?: number }
  /**
   * The learner's code matches this regular expression (source string): the code made from the
   * blocks, or in a typed-code project the code in the editor.
   */
  | { kind: 'code'; pattern: string }
  /** A file with this exact name is in the project (e.g. a driver such as BME280.py). */
  | { kind: 'file'; name: string }
  /** The simulation is running. */
  | { kind: 'simulating' }
  /**
   * While this step was open, outputs of `type` (default LED) switched on or off at least `times`
   * times in total: LEDs, buzzers, traffic light lamps, RGB colour changes.
   */
  | { kind: 'blinked'; times: number; type?: string }
  /**
   * While this step was open, the simulation showed every one of these, e.g. 'TRAFFIC_LIGHT:red',
   * 'RGB_LED:yellow', 'BUZZER:on'.
   */
  | { kind: 'seen'; tokens: string[] }
  /** While this step was open, some servo reached every angle in `angles` (within 10 degrees). */
  | { kind: 'servoReached'; angles: number[] }
  | { kind: 'all'; checks: StepCheck[] }
);

export type LessonStepKind = 'place' | 'wire' | 'code' | 'run' | 'observe';

/** A group in the Blocks sidebar, by id (the learner sees its label, e.g. "Output"). */
export type BlockGroupId =
  | 'start'
  | 'your-circuit'
  | 'output'
  | 'decide'
  | 'sense'
  | 'numbers'
  | 'variables'
  | 'functions'
  | 'messages'
  | 'displays';

/** One block to add, in order: which block, where to find it, where it goes, what to change. */
export interface BlockInstruction {
  /** The Blockly block type. The lesson tests check it is in `group` and in the step's picture. */
  type: string;
  /**
   * The group in the Blocks sidebar the block is in. Left out for a block already in the learner's
   * program, which they move or change instead of adding a new one.
   */
  group?: BlockGroupId;
  /** The words on the block as the learner sees it in the drawer, e.g. "set pin ▾ to OUTPUT ▾". */
  block: string;
  /** Where in the drawer to look, when the block is hard to spot: far down, or next to a look-alike. */
  find?: string;
  /** Where it goes, as a short sentence: 'Snap it inside "on start".' */
  place: string;
  /** What to change on it, as a short sentence: 'Click the pin number and choose 6.' */
  set?: string;
}

export interface LessonStep {
  id: string;
  kind: LessonStepKind;
  title: string;
  /** Plain sentences. Short: one idea per step. */
  body: string;
  /** Blocks to use, by the text the learner sees on them, e.g. "digital write pin 6 to HIGH". */
  blocks?: string[];
  /**
   * Block lessons: each block to add, in order, shown as a numbered list. Takes the place of
   * `blocks` when given.
   */
  build?: BlockInstruction[];
  /**
   * How the blocks should look at the end of this step (Blockly XML), drawn as a picture. The
   * lesson tests require this step's code checks to pass on it.
   */
  picture?: string;
  /** What happens when the program runs after this step (or that nothing shows yet, and why). */
  expect?: string;
  /** The C++ these blocks make, as taught in the manual. */
  cpp?: string;
  /** MicroPython for the learner to copy into main.py (typed-code lessons), with a Copy button. */
  python?: string;
  /** A kit driver this step adds to the project with one button (typed-code lessons). */
  library?: MicroPythonLibraryId;
  /** Extra help shown on request. */
  hint?: string;
  /** Ticks the step off automatically when true. Steps without a check are ticked by the learner. */
  check?: StepCheck;
  /**
   * The block program at the end of this step, when it differs from the activity's final
   * `solution` (e.g. a step that is later changed). The lesson tests use it for this step's checks.
   */
  solution?: string;
  /** Like `solution`, for typed-code lessons: the code at the end of this step. */
  solutionCode?: string;
}

export interface LessonActivity {
  id: string;
  title: string;
  /** What the learner builds, in a sentence or two. */
  goal: string;
  /** Where this is used in real life. */
  realWorld: string;
  /**
   * Parts this activity needs in total (not only the new ones). For Circuit Lab activities `type`
   * is a Circuit Lab part type; for activities on real hardware it is only a key.
   */
  parts: Array<{ type: string; label: string; count: number }>;
  /** Built on a real board instead of in Circuit Lab: no circuit or simulation checks. */
  onRealHardware?: boolean;
  /** Block categories this activity needs; the toolbox is raised to this level, never lowered. */
  learningLevel?: ToolboxLearningLevel;
  steps: LessonStep[];
  /**
   * The finished block program (Blockly XML) for this activity. The lesson tests generate its
   * C++ and require every code check in the activity to pass on it.
   */
  solution?: string;
  /**
   * The finished program as typed code (typed-code lessons). The lesson tests require every code
   * check in the activity to pass on it, with the Wi-Fi placeholders filled in.
   */
  solutionCode?: string;
  /** What the learner should see when it works. */
  observe: string;
  /** One or two sentences to close. */
  wrapUp: string;
}

export interface Lesson {
  /** Matches the course catalog lesson slug. */
  slug: string;
  title: string;
  /** Manual the activities were adapted from. */
  source: string;
  activities: LessonActivity[];
}
