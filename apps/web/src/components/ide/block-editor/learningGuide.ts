import type { ToolboxLearningLevel } from '@/lib/blockly/guidedToolbox';

export type LearningGuideActionId =
  | 'open-start'
  | 'open-output'
  | 'open-your-circuit'
  | 'show-code'
  | 'advance-builder'
  | 'advance-explore';

export type LearningGuide = {
  tone: 'progress' | 'warning' | 'neutral' | 'success';
  title: string;
  detail: string;
  actionId: LearningGuideActionId | null;
};

export const LEARNING_GUIDE_ACTION_LABELS: Record<LearningGuideActionId, string> = {
  'open-start': 'Open Start',
  'open-output': 'Open Output',
  'open-your-circuit': 'Open Your Circuit',
  'show-code': 'Show Code',
  'advance-builder': 'Try Builder',
  'advance-explore': 'Open Explore',
};

export type LearningGuideInput = {
  /** At least one part in the circuit is wired well enough to code against. */
  hasCodeReadyComponent: boolean;
  /** Blocks on the canvas for parts that are no longer in the circuit. */
  orphanedCircuitBlockCount: number;
  workspaceLooksEmpty: boolean;
  /** Block types the current circuit unlocks. */
  availableBlockTypes: ReadonlySet<string>;
  workspaceBlockTypes: readonly string[];
  hasRootFlowBlock: boolean;
  hasTimingBlock: boolean;
  /** The code preview reported loose blocks or another problem. */
  hasPreviewWarning: boolean;
  showCodePanel: boolean;
  learningLevel: ToolboxLearningLevel;
  blockCount: number;
};

/** The single next thing to suggest, checked in order from "nothing built yet" to "ready to run". */
export function getLearningGuide(input: LearningGuideInput): LearningGuide {
  if (!input.hasCodeReadyComponent) {
    return {
      tone: 'progress',
      title: 'Start with output',
      detail: 'Open Output and try the board LED or a simple pin block first.',
      actionId: 'open-output',
    };
  }

  if (input.orphanedCircuitBlockCount > 0) {
    return {
      tone: 'warning',
      title: 'This code still uses a removed part',
      detail: 'Reconnect that part or replace the hidden blocks before you run.',
      actionId: 'open-your-circuit',
    };
  }

  if (input.workspaceLooksEmpty) {
    if (input.availableBlockTypes.has('arduino_led_set')) {
      return {
        tone: 'progress',
        title: 'Turn your LED on',
        detail: 'Open Your Circuit and drag the LED block into the loop.',
        actionId: 'open-your-circuit',
      };
    }

    if (input.availableBlockTypes.size > 0) {
      return {
        tone: 'progress',
        title: 'Start with a part block',
        detail: 'Open Your Circuit and drop one block into the loop.',
        actionId: 'open-your-circuit',
      };
    }

    return {
      tone: 'progress',
      title: 'Start with output',
      detail: 'Open Output and try the board LED or a pin block.',
      actionId: 'open-output',
    };
  }

  if (!input.hasRootFlowBlock || input.hasPreviewWarning) {
    return {
      tone: 'warning',
      title: 'Snap loose blocks into the flow',
      detail: 'Place blocks inside setup or loop so the program runs in order.',
      actionId: 'open-start',
    };
  }

  if (input.workspaceBlockTypes.includes('arduino_led_set') && !input.hasTimingBlock) {
    return {
      tone: 'progress',
      title: 'Add a short wait',
      detail: 'A delay makes LED changes easier to see in the simulator.',
      actionId: 'open-start',
    };
  }

  if (!input.showCodePanel) {
    return {
      tone: 'neutral',
      title: 'See the code version',
      detail: 'Show code to compare your blocks with the generated program.',
      actionId: 'show-code',
    };
  }

  if (input.learningLevel === 'starter' && (input.blockCount > 2 || input.availableBlockTypes.size > 1)) {
    return {
      tone: 'neutral',
      title: 'Ready for more?',
      detail: 'Builder adds decisions, sensors, and numbers when you need them.',
      actionId: 'advance-builder',
    };
  }

  if (input.learningLevel === 'builder' && input.blockCount > 4) {
    return {
      tone: 'neutral',
      title: 'Want more control?',
      detail: 'Explore unlocks variables, functions, displays, and messages.',
      actionId: 'advance-explore',
    };
  }

  return {
    tone: 'success',
    title: 'You are ready to run',
    detail: 'Save your work, then use Run Simulation in the top bar.',
    actionId: null,
  };
}

export type CoachMilestone = { id: string; label: string; done: boolean };

/** The coach card checklist: the same stages the learning guide walks through, ticked off live. */
export function getCoachMilestones(
  input: Pick<LearningGuideInput, 'workspaceLooksEmpty' | 'hasRootFlowBlock' | 'hasPreviewWarning' | 'hasTimingBlock' | 'showCodePanel'>
): CoachMilestone[] {
  return [
    { id: 'add', label: 'Add a block from Output or Your Circuit', done: !input.workspaceLooksEmpty },
    { id: 'flow', label: 'Snap it inside setup or loop', done: !input.workspaceLooksEmpty && input.hasRootFlowBlock && !input.hasPreviewWarning },
    { id: 'wait', label: 'Add a wait so changes are easy to see', done: input.hasTimingBlock },
    { id: 'code', label: 'Compare your blocks with the code', done: input.showCodePanel },
  ];
}
