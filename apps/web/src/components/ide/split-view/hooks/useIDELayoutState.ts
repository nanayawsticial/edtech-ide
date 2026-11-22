import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { StudioView } from '../../TopToolbar';
import type { BlockTerminalTab } from '../../BlockTerminalShell';
import {
  BLOCK_TERMINAL_COLLAPSED_STORAGE_KEY,
  BLOCK_TERMINAL_DEFAULT_HEIGHT,
  BLOCK_TERMINAL_HEIGHT_STORAGE_KEY,
  BLOCK_TERMINAL_TAB_STORAGE_KEY,
  COMPACT_WORKSPACE_BREAKPOINT,
  SHORT_WORKSPACE_HEIGHT,
  getPhysicalTextViewportMode,
  type PhysicalTextViewportMode,
} from '../constants';
import { clampBlockTerminalHeight, getInitialStudioView } from '../helpers';
import { useSplitViewEventBus } from '../SplitViewEventBus';

const RIGHT_EDITOR_FOCUS_THRESHOLD = 20;
const LEFT_EDITOR_FOCUS_THRESHOLD = 26;
const START_VIEW_OVERRIDE_KEY = 'edtech:ide-start-view';

function readStartViewOverride(): StudioView | null {
  if (typeof window === 'undefined') return null;
  const stored = window.sessionStorage.getItem(START_VIEW_OVERRIDE_KEY);
  return stored === 'code' || stored === 'circuit' ? stored : null;
}

interface UseIDELayoutStateOptions {
  environment: string;
  isBlockMode: boolean;
  supportsDeviceFiles: boolean;
  editorFontSize: number;
}

function syncAutoCollapsedPanel(
  shouldCollapse: boolean,
  setCollapsed: Dispatch<SetStateAction<boolean>>,
  autoCollapsedRef: MutableRefObject<boolean>,
) {
  if (shouldCollapse) {
    setCollapsed((prev) => {
      if (prev) {
        return prev;
      }

      autoCollapsedRef.current = true;
      return true;
    });
    return;
  }

  if (autoCollapsedRef.current) {
    autoCollapsedRef.current = false;
    setCollapsed(false);
  }
}

export function useIDELayoutState({ environment, isBlockMode, supportsDeviceFiles, editorFontSize }: UseIDELayoutStateOptions) {
  const eventBus = useSplitViewEventBus();
  const [terminalHeight, setTerminalHeight] = useState(BLOCK_TERMINAL_DEFAULT_HEIGHT);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [blockTerminalTab, setBlockTerminalTab] = useState<BlockTerminalTab>('serial');
  const [hasLoadedBlockTerminalPrefs, setHasLoadedBlockTerminalPrefs] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  const [physicalTextViewportMode, setPhysicalTextViewportMode] = useState<PhysicalTextViewportMode>(() =>
    typeof window === 'undefined' ? 'wide' : getPhysicalTextViewportMode(window.innerWidth),
  );
  const [leftRailView, setLeftRailView] = useState('files');
  const [rightPanelView, setRightPanelView] = useState('terminal');
  const autoFocusCollapsedLeftRef = useRef(false);
  const autoFocusCollapsedRightRef = useRef(false);
  const autoViewportCollapsedLeftRef = useRef(false);
  const autoViewportCollapsedRightRef = useRef(false);
  const autoViewportCollapsedBottomRef = useRef(false);
  const leftFocusThresholdReachedRef = useRef(false);
  const rightFocusThresholdReachedRef = useRef(false);
  const lastPhysicalTextViewportModeRef = useRef<PhysicalTextViewportMode | null>(null);

  void supportsDeviceFiles;

  // One-shot override: the wizard stores 'edtech:ide-start-view' in sessionStorage
  // when the user explicitly picked a coding mode (not from Circuit Lab).
  // We read it once on mount (render stays side-effect free) and clear it in an effect,
  // so the env-reset effect below doesn't clobber it.
  const [startViewOverride] = useState<StudioView | null>(readStartViewOverride);
  const startViewOverrideRef = useRef(startViewOverride !== null);
  const [activeView, setActiveView] = useState<StudioView>(
    () => startViewOverride ?? getInitialStudioView(environment),
  );

  useEffect(() => {
    if (startViewOverride !== null) {
      window.sessionStorage.removeItem(START_VIEW_OVERRIDE_KEY);
    }
  }, [startViewOverride]);

  const defaultRightView = 'terminal';
  const effectiveBlockTerminalHeight = isCompact ? Math.min(terminalHeight, 180) : terminalHeight;

  const setStudioView = useCallback(
    (view: StudioView) => {
      if (view === activeView) return;
      if (view === 'code') {
        eventBus.emit('editor:runtime-sync-request', undefined);
      }
      setActiveView(view);
      eventBus.emit('layout:studio-view-changed', { view });
    },
    [activeView, eventBus],
  );

  useEffect(() => {
    // If we consumed a start-view override from the wizard on this mount,
    // skip the first run so we don't immediately clobber it.
    if (startViewOverrideRef.current) {
      startViewOverrideRef.current = false;
      return;
    }
    const nextView = getInitialStudioView(environment);
    setActiveView(nextView);
    if (nextView === 'code') {
      eventBus.emit('editor:runtime-sync-request', undefined);
    }
    eventBus.emit('layout:studio-view-changed', { view: nextView });
  }, [environment, eventBus]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isBlockMode) {
      setHasLoadedBlockTerminalPrefs(false);
      return;
    }

    const storedHeight = window.localStorage.getItem(BLOCK_TERMINAL_HEIGHT_STORAGE_KEY);
    if (storedHeight) {
      const parsedHeight = Number.parseInt(storedHeight, 10);
      if (Number.isFinite(parsedHeight)) {
        setTerminalHeight(clampBlockTerminalHeight(parsedHeight));
      }
    }

    const storedCollapsed = window.localStorage.getItem(BLOCK_TERMINAL_COLLAPSED_STORAGE_KEY);
    if (storedCollapsed === 'true' || storedCollapsed === 'false') {
      setBottomCollapsed(storedCollapsed === 'true');
    }

    const storedTab = window.localStorage.getItem(BLOCK_TERMINAL_TAB_STORAGE_KEY);
    if (storedTab === 'serial' || storedTab === 'build' || storedTab === 'connection') {
      setBlockTerminalTab(storedTab);
    }

    setHasLoadedBlockTerminalPrefs(true);
  }, [isBlockMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isBlockMode || !hasLoadedBlockTerminalPrefs) {
      return;
    }

    window.localStorage.setItem(BLOCK_TERMINAL_HEIGHT_STORAGE_KEY, String(clampBlockTerminalHeight(terminalHeight)));
    window.localStorage.setItem(BLOCK_TERMINAL_COLLAPSED_STORAGE_KEY, String(bottomCollapsed));
    window.localStorage.setItem(BLOCK_TERMINAL_TAB_STORAGE_KEY, blockTerminalTab);
  }, [blockTerminalTab, bottomCollapsed, hasLoadedBlockTerminalPrefs, isBlockMode, terminalHeight]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    lastPhysicalTextViewportModeRef.current = null;

    const updateViewportMode = () => {
      const nextViewportWidth = window.innerWidth;
      const nextViewportHeight = window.innerHeight;
      const nextIsCompact = nextViewportWidth < COMPACT_WORKSPACE_BREAKPOINT;
      const nextPhysicalTextViewportMode = getPhysicalTextViewportMode(nextViewportWidth);
      const shouldAutoCollapseBottom = isBlockMode && nextIsCompact && nextViewportHeight < SHORT_WORKSPACE_HEIGHT;

      setViewportWidth(nextViewportWidth);
      setIsCompact(nextIsCompact);
      setPhysicalTextViewportMode(nextPhysicalTextViewportMode);

      if (!isBlockMode && environment === 'physical') {
        const viewportModeChanged = lastPhysicalTextViewportModeRef.current !== nextPhysicalTextViewportMode;

        if (viewportModeChanged) {
          syncAutoCollapsedPanel(
            nextPhysicalTextViewportMode === 'compact',
            setLeftCollapsed,
            autoViewportCollapsedLeftRef,
          );
          syncAutoCollapsedPanel(
            nextPhysicalTextViewportMode !== 'wide',
            setRightCollapsed,
            autoViewportCollapsedRightRef,
          );
        }
      }

      if (shouldAutoCollapseBottom) {
        setBottomCollapsed((prev) => {
          if (prev) {
            return prev;
          }

          autoViewportCollapsedBottomRef.current = true;
          return true;
        });
      } else if (autoViewportCollapsedBottomRef.current) {
        autoViewportCollapsedBottomRef.current = false;
        setBottomCollapsed(false);
      }

      lastPhysicalTextViewportModeRef.current = nextPhysicalTextViewportMode;
    };

    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);
    return () => window.removeEventListener('resize', updateViewportMode);
  }, [environment, isBlockMode]);

  useEffect(() => {
    if (environment !== 'physical' || isBlockMode || physicalTextViewportMode !== 'wide') {
      leftFocusThresholdReachedRef.current = false;
      rightFocusThresholdReachedRef.current = false;
      autoFocusCollapsedLeftRef.current = false;
      autoFocusCollapsedRightRef.current = false;
      return;
    }

    const shouldCollapseRightForFocus = editorFontSize >= RIGHT_EDITOR_FOCUS_THRESHOLD;
    const shouldCollapseLeftForFocus = editorFontSize >= LEFT_EDITOR_FOCUS_THRESHOLD;

    if (shouldCollapseRightForFocus && !rightFocusThresholdReachedRef.current) {
      if (!rightCollapsed) {
        setRightCollapsed(true);
        autoFocusCollapsedRightRef.current = true;
      } else {
        autoFocusCollapsedRightRef.current = false;
      }
    } else if (!shouldCollapseRightForFocus && rightFocusThresholdReachedRef.current && autoFocusCollapsedRightRef.current) {
      setRightCollapsed(false);
      autoFocusCollapsedRightRef.current = false;
    }

    if (shouldCollapseLeftForFocus && !leftFocusThresholdReachedRef.current) {
      if (!leftCollapsed) {
        setLeftCollapsed(true);
        autoFocusCollapsedLeftRef.current = true;
      } else {
        autoFocusCollapsedLeftRef.current = false;
      }
    } else if (!shouldCollapseLeftForFocus && leftFocusThresholdReachedRef.current && autoFocusCollapsedLeftRef.current) {
      setLeftCollapsed(false);
      autoFocusCollapsedLeftRef.current = false;
    }

    rightFocusThresholdReachedRef.current = shouldCollapseRightForFocus;
    leftFocusThresholdReachedRef.current = shouldCollapseLeftForFocus;
  }, [editorFontSize, environment, isBlockMode, leftCollapsed, physicalTextViewportMode, rightCollapsed]);

  useEffect(() => {
    if (!isBlockMode) {
      setRightPanelView(defaultRightView);
      if (!isCompact) {
        setBottomCollapsed(environment === 'virtual');
      }
    }
  }, [defaultRightView, environment, isBlockMode, isCompact]);

  useEffect(() => {
    return eventBus.on('layout:block-terminal-request', ({ tab, open = true }) => {
      setBlockTerminalTab(tab);
      if (open) {
        setBottomCollapsed(false);
      }
    });
  }, [eventBus]);

  useEffect(() => {
    return eventBus.on('app:reset-request', () => {
      setTerminalHeight(BLOCK_TERMINAL_DEFAULT_HEIGHT);
      setLeftCollapsed(false);
      setRightCollapsed(false);
      setBottomCollapsed(false);
      setBlockTerminalTab('serial');
      setLeftRailView('files');
      setRightPanelView(defaultRightView);
      setActiveView(getInitialStudioView('virtual'));
      autoFocusCollapsedLeftRef.current = false;
      autoFocusCollapsedRightRef.current = false;
      autoViewportCollapsedLeftRef.current = false;
      autoViewportCollapsedRightRef.current = false;
      autoViewportCollapsedBottomRef.current = false;
      leftFocusThresholdReachedRef.current = false;
      rightFocusThresholdReachedRef.current = false;
      lastPhysicalTextViewportModeRef.current = null;

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(BLOCK_TERMINAL_HEIGHT_STORAGE_KEY);
        window.localStorage.removeItem(BLOCK_TERMINAL_COLLAPSED_STORAGE_KEY);
        window.localStorage.removeItem(BLOCK_TERMINAL_TAB_STORAGE_KEY);
      }
    });
  }, [defaultRightView, eventBus]);

  const handleTerminalResize = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = terminalHeight;

      const onMove = (moveEvent: MouseEvent) => {
        const delta = startY - moveEvent.clientY;
        setTerminalHeight(clampBlockTerminalHeight(startHeight + delta));
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [terminalHeight],
  );

  const toggleLeftCollapsed = useCallback(() => {
    autoFocusCollapsedLeftRef.current = false;
    autoViewportCollapsedLeftRef.current = false;
    setLeftCollapsed((prev) => !prev);
  }, []);

  const toggleRightCollapsed = useCallback(() => {
    autoFocusCollapsedRightRef.current = false;
    autoViewportCollapsedRightRef.current = false;
    setRightCollapsed((prev) => !prev);
  }, []);

  return {
    activeView,
    setStudioView,
    terminalHeight,
    effectiveBlockTerminalHeight,
    leftCollapsed,
    setLeftCollapsed,
    rightCollapsed,
    setRightCollapsed,
    bottomCollapsed,
    setBottomCollapsed,
    blockTerminalTab,
    setBlockTerminalTab,
    isCompact,
    viewportWidth,
    physicalTextViewportMode,
    leftRailView,
    setLeftRailView,
    rightPanelView,
    setRightPanelView,
    handleTerminalResize,
    defaultRightView,
    toggleLeftCollapsed,
    toggleRightCollapsed,
  };
}
