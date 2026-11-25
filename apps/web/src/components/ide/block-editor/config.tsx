import type React from 'react';
import type * as Blockly from 'blockly';
import { Activity, Blocks as BlocksIcon, GitBranch, Infinity as InfinityIcon, Lightbulb, MessageSquare, Monitor, SlidersHorizontal, Sparkles, SquareFunction, Variable } from 'lucide-react';

import type { BoardKey } from '@/contexts/BoardContext';
import type { ToolboxLearningLevel } from '@/lib/blockly/guidedToolbox';
import type { GuidedToolboxCategorySummary } from '@/lib/blockly/toolbox';

export type BoardAwareWindow = Window & typeof globalThis & {
  SELECTED_BOARD?: BoardKey;
};

export type BlocklyMotionEvent = Blockly.Events.Abstract & {
  isStart?: boolean;
  isMoveInProgress?: boolean;
};

/** Blockly flyout internals the editor reaches into to keep the flyout at a fixed size and scale. */
export type StabilizedFlyout = Blockly.IFlyout & {
  setAutoClose?: (autoClose: boolean) => void;
  getFlyoutScale?: () => number;
  setVisible?: (visible: boolean) => void;
  setContainerVisible?: (visible: boolean) => void;
  reflow?: () => void;
  position?: () => void;
  getTargetWorkspace?: () => Blockly.WorkspaceSvg;
  svgGroup_?: SVGElement | null;
  width_?: number;
  __edtechFixedScale?: boolean;
};

export const EMPTY_TOOLBOX_XML = '<xml xmlns="https://developers.google.com/blockly/xml"></xml>';

export const BLOCKLY_FLYOUT_SCALE = 0.9;
export const BLOCKLY_FLYOUT_FIXED_WIDTH = 320;
// Panel width and visibility are persisted by the blockly store (src/stores/blocklyStore.ts).
export const BLOCKLY_CODE_PANEL_MIN_WIDTH = 280;
export const BLOCKLY_CODE_PANEL_MAX_WIDTH = 520;
export const BLOCKLY_CODE_PANEL_COMPACT_MAX_WIDTH = 360;
export const BLOCKLY_SYNC_DEBOUNCE_MS = 200;

export function clampCodePanelWidth(width: number) {
  return Math.min(BLOCKLY_CODE_PANEL_MAX_WIDTH, Math.max(BLOCKLY_CODE_PANEL_MIN_WIDTH, width));
}

export function boardLabel(board: BoardKey) {
  return board.replace(/_/g, ' ');
}

export function stringArrayEqual(left: string[], right: string[]) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export const LEARNING_LEVEL_LABELS: Record<ToolboxLearningLevel, string> = {
  starter: 'Starter',
  builder: 'Builder',
  explore: 'Explore',
};

export const DISPLAY_BLOCK_TYPES = new Set(['oled_init', 'lcd_i2c_init', 'arduino_tft_init']);
export const TIMING_BLOCK_TYPES = new Set(['arduino_delay', 'time_delay', 'time_wait_seconds', 'time_wait_until']);
export const ROOT_FLOW_BLOCK_TYPES = new Set(['arduino_setup_loop', 'arduino_on_start', 'arduino_forever', 'controls_forever']);

type CategoryChrome = { icon: React.ReactNode; color: string };

const GUIDED_CATEGORY_METADATA: Record<string, CategoryChrome> = {
  start: { icon: <Sparkles size={16} strokeWidth={2.3} />, color: '#6d7cff' },
  'your-circuit': { icon: <BlocksIcon size={16} strokeWidth={2.3} />, color: '#5b6dff' },
  output: { icon: <Lightbulb size={16} strokeWidth={2.3} />, color: '#d5607c' },
  decide: { icon: <GitBranch size={16} strokeWidth={2.3} />, color: '#744ffc' },
  sense: { icon: <Activity size={16} strokeWidth={2.3} />, color: '#c0488a' },
  numbers: { icon: <InfinityIcon size={16} strokeWidth={2.3} />, color: '#54b274' },
  variables: { icon: <Variable size={16} strokeWidth={2.3} />, color: '#df8b2d' },
  functions: { icon: <SquareFunction size={16} strokeWidth={2.3} />, color: '#efb936' },
  messages: { icon: <MessageSquare size={16} strokeWidth={2.3} />, color: '#d86b43' },
  displays: { icon: <Monitor size={16} strokeWidth={2.3} />, color: '#5e31a6' },
};

const DEFAULT_CATEGORY_CHROME: CategoryChrome = { icon: <BlocksIcon size={16} strokeWidth={2.3} />, color: '#5b6dff' };

/** A block group as the sidebar shows it: the toolbox summary plus its icon and colour. */
export type ShelfCategory = GuidedToolboxCategorySummary & CategoryChrome;

export function toShelfCategory(category: GuidedToolboxCategorySummary): ShelfCategory {
  const chrome = GUIDED_CATEGORY_METADATA[category.id] || DEFAULT_CATEGORY_CHROME;
  return { ...category, icon: chrome.icon, color: chrome.color };
}

/** Shown when every group is hidden or the toolbox has not loaded yet. */
export const FALLBACK_START_CATEGORY: ShelfCategory = {
  id: 'start',
  label: 'Start',
  description: 'Begin your program and add timing.',
  icon: <Sparkles size={16} strokeWidth={2.3} />,
  color: '#6d7cff',
  blockCount: 0,
  isDynamic: false,
  isEmpty: false,
  sourceCategoryNames: ['Control'],
};

/** The "Customize" entry at the bottom of the sidebar, which opens the block group manager. */
export const CUSTOMIZE_CATEGORY_ENTRY = {
  id: 'more-groups',
  label: 'Customize',
  description: 'Choose which learning groups stay visible.',
  icon: <SlidersHorizontal size={16} strokeWidth={2.3} />,
  color: '#111111',
};
