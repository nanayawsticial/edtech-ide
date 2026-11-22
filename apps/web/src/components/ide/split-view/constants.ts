export const DEFAULT_BLOCKLY_XML = '<xml xmlns="https://developers.google.com/blockly/xml"></xml>';
export const BLOCK_TERMINAL_MIN_HEIGHT = 160;
export const BLOCK_TERMINAL_DEFAULT_HEIGHT = 220;
export const BLOCK_TERMINAL_MAX_HEIGHT = 420;
export const BLOCK_TERMINAL_HEIGHT_STORAGE_KEY = 'edtech:block-terminal-height';
export const BLOCK_TERMINAL_COLLAPSED_STORAGE_KEY = 'edtech:block-terminal-collapsed';
export const BLOCK_TERMINAL_TAB_STORAGE_KEY = 'edtech:block-terminal-tab';
export const COMPACT_WORKSPACE_BREAKPOINT = 1280;
export const COMPACT_TEXT_EDITOR_BREAKPOINT = 1180;
export const MEDIUM_TEXT_EDITOR_BREAKPOINT = 1440;
export const SHORT_WORKSPACE_HEIGHT = 780;
export const LEFT_PANEL_MIN_WIDTH = 220;
export const LEFT_PANEL_WIDTH = 272;
export const RIGHT_PANEL_MIN_WIDTH = 280;
export const RIGHT_PANEL_WIDTH = 360;

export type PhysicalTextViewportMode = 'compact' | 'medium' | 'wide';

function clampPanelWidth(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getPhysicalTextViewportMode(viewportWidth: number): PhysicalTextViewportMode {
  if (viewportWidth < COMPACT_TEXT_EDITOR_BREAKPOINT) {
    return 'compact';
  }

  if (viewportWidth < MEDIUM_TEXT_EDITOR_BREAKPOINT) {
    return 'medium';
  }

  return 'wide';
}

export function getResponsiveShellPanelWidths(viewportWidth: number) {
  return {
    left: clampPanelWidth(Math.round(viewportWidth * 0.19), LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_WIDTH),
    right: clampPanelWidth(Math.round(viewportWidth * 0.23), RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_WIDTH),
  };
}
