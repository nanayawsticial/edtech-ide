/**
 * In-app lessons: step-by-step activities adapted from the STEMAIDE manuals.
 *
 * A lesson (one per course catalog entry, matched by slug) holds a few activities. Each activity
 * walks the learner through placing parts, wiring, building the code with blocks (the matching
 * C++ is shown alongside), running the simulation and checking what happens. Activities in one
 * lesson build on the same circuit, so later ones only describe what changes.
 */

import type { ToolboxLearningLevel } from '@/lib/blockly/guidedToolbox';

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
  /** The code made from the blocks matches this regular expression (source string). */
  | { kind: 'code'; pattern: string }
  /** The simulation is running. */
  | { kind: 'simulating' }
  /** While this step was open, LEDs switched on and off at least `times` times in total. */
  | { kind: 'blinked'; times: number }
  /** While this step was open, some servo reached every angle in `angles` (within 10 degrees). */
  | { kind: 'servoReached'; angles: number[] }
  | { kind: 'all'; checks: StepCheck[] }
);

export type LessonStepKind = 'place' | 'wire' | 'code' | 'run' | 'observe';

export interface LessonStep {
  id: string;
  kind: LessonStepKind;
  title: string;
  /** Plain sentences. Short: one idea per step. */
  body: string;
  /** Blocks to use, by the text the learner sees on them, e.g. "digital write pin 6 to HIGH". */
  blocks?: string[];
  /** The C++ these blocks make, as taught in the manual. */
  cpp?: string;
  /** Extra help shown on request. */
  hint?: string;
  /** Ticks the step off automatically when true. Steps without a check are ticked by the learner. */
  check?: StepCheck;
}

export interface LessonActivity {
  id: string;
  title: string;
  /** What the learner builds, in a sentence or two. */
  goal: string;
  /** Where this is used in real life. */
  realWorld: string;
  /** Parts this activity needs in total (not only the new ones). */
  parts: Array<{ type: string; label: string; count: number }>;
  /** Block categories this activity needs; the toolbox is raised to this level, never lowered. */
  learningLevel?: ToolboxLearningLevel;
  steps: LessonStep[];
  /**
   * The finished block program (Blockly XML) for this activity. The lesson tests generate its
   * C++ and require every code check in the activity to pass on it.
   */
  solution?: string;
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
