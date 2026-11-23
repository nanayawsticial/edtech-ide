"use client";

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';

import * as Blockly from 'blockly';

import { defineCustomBlocks } from '@/lib/blockly/blocks';
import { getBlocklyGridColor, getBlocklyTheme } from '@/lib/blockly/theme';
import { buildSourceCodeFromBlocklyWorkspace } from '@/lib/blockly/codegen';

import { useBoard, BoardKey } from '@/contexts/BoardContext';
import { useStudioPreferences } from '@/contexts/StudioPreferencesContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSplitViewEventBus } from './split-view/SplitViewEventBus';

import {
  buildGuidedCategoryToolboxXml,
  getGuidedToolboxCategories,
  hideNativeToolboxUi,
  isLikelyBlocklyXmlDocument,
  type CircuitAwareWindow,
  type GuidedToolboxCategorySummary,
} from '@/lib/blockly/toolbox';

import { useCircuitStore } from '@/stores/circuitStore';
import { useBlocklyStore } from '@/stores/blocklyStore';

import { isOptionalCircuitBlock } from '@/lib/blockly/circuitAwareness';

import {
  BLOCKLY_FLYOUT_FIXED_WIDTH,
  BLOCKLY_FLYOUT_SCALE,
  BLOCKLY_SYNC_DEBOUNCE_MS,
  DISPLAY_BLOCK_TYPES,
  EMPTY_TOOLBOX_XML,
  FALLBACK_START_CATEGORY,
  ROOT_FLOW_BLOCK_TYPES,
  TIMING_BLOCK_TYPES,
  boardLabel,
  clampCodePanelWidth,
  stringArrayEqual,
  toShelfCategory,
  type BlocklyMotionEvent,
  type BoardAwareWindow,
  type StabilizedFlyout,
} from './block-editor/config';
import { CanvasToolbar } from './block-editor/CanvasToolbar';
import { CategoryManagerDialog } from './block-editor/CategoryManagerDialog';
import { CategorySidebar } from './block-editor/CategorySidebar';
import { CoachCard } from './block-editor/CoachCard';
import { CodePreviewPanel } from './block-editor/CodePreviewPanel';
import { getDisplayStarters } from './block-editor/displayStarters';
import { getCoachMilestones, getLearningGuide, type LearningGuideActionId } from './block-editor/learningGuide';

export default function BlockEditor({
  onCodeChange,
  onXmlChange,
  initialXml,
  generatorType,
  onWorkspaceReady,
  selectedCategoryName,
  onSelectCategory,
  sourceCode,
  isCompactLayout = false,
}: {
  onCodeChange: (code: string) => void;

  onXmlChange?: (xml: string) => void;

  initialXml?: string;

  generatorType: string;

  onWorkspaceReady?: (workspace: Blockly.WorkspaceSvg | null) => void;

  selectedCategoryName?: string;

  onSelectCategory?: (category: string) => void;

  sourceCode?: string;

  isCompactLayout?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);

  const persistedXmlRef = useRef<string | null>(null);

  const { currentBoard } = useBoard();
  const { theme } = useTheme();
  const eventBus = useSplitViewEventBus();
  const { showAdvancedBlocks } = useStudioPreferences();

  const circuitComponents = useCircuitStore((state) => state.components);
  const circuitNets = useCircuitStore((state) => state.nets);
  const codingSnapshot = useCircuitStore((state) => state.codingSnapshot);
  const circuitData = useMemo(() => ({ components: circuitComponents, nets: circuitNets }), [circuitComponents, circuitNets]);

  const showCodePanel = useBlocklyStore((state) => state.showCodePanel);
  const setShowCodePanel = useBlocklyStore((state) => state.setShowCodePanel);
  const codePanelWidth = useBlocklyStore((state) => state.codePanelWidth);
  const setCodePanelWidth = useBlocklyStore((state) => state.setCodePanelWidth);
  const isCodePanelResizing = useBlocklyStore((state) => state.isCodePanelResizing);
  const setIsCodePanelResizing = useBlocklyStore((state) => state.setIsCodePanelResizing);
  const generatedPreviewCode = useBlocklyStore((state) => state.generatedPreviewCode);
  const setGeneratedPreviewCode = useBlocklyStore((state) => state.setGeneratedPreviewCode);
  const previewWarning = useBlocklyStore((state) => state.previewWarning);
  const setPreviewWarning = useBlocklyStore((state) => state.setPreviewWarning);
  const isCategoryManagerOpen = useBlocklyStore((state) => state.isCategoryManagerOpen);
  const setIsCategoryManagerOpen = useBlocklyStore((state) => state.setIsCategoryManagerOpen);
  const hiddenCategoryIds = useBlocklyStore((state) => state.hiddenCategoryIds);
  const setHiddenCategoryIds = useBlocklyStore((state) => state.setHiddenCategoryIds);
  const categoryManagerDraft = useBlocklyStore((state) => state.categoryManagerDraft);
  const setCategoryManagerDraft = useBlocklyStore((state) => state.setCategoryManagerDraft);
  const blockCount = useBlocklyStore((state) => state.blockCount);
  const setBlockCount = useBlocklyStore((state) => state.setBlockCount);
  const categoryQuery = useBlocklyStore((state) => state.categoryQuery);
  const setCategoryQuery = useBlocklyStore((state) => state.setCategoryQuery);
  const isFlyoutVisible = useBlocklyStore((state) => state.isFlyoutVisible);
  const setIsFlyoutVisible = useBlocklyStore((state) => state.setIsFlyoutVisible);
  const toolboxLearningLevel = useBlocklyStore((state) => state.toolboxLearningLevel);
  const setToolboxLearningLevel = useBlocklyStore((state) => state.setToolboxLearningLevel);

  const [workspaceBlockTypes, setWorkspaceBlockTypes] = useState<string[]>([]);
  const [showCategorySidebar, setShowCategorySidebar] = useState(!isCompactLayout);
  const showExtendedBlocks = showAdvancedBlocks || toolboxLearningLevel === 'explore';

  useEffect(() => {
    setShowCategorySidebar(!isCompactLayout);
  }, [isCompactLayout]);

  const prevBoardRef = useRef<BoardKey | null>(null);
  const prevThemeRef = useRef(theme);

  const codePanelResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const blocklyTheme = useMemo(() => getBlocklyTheme(theme), [theme]);
  const blocklyGridColor = useMemo(() => getBlocklyGridColor(theme), [theme]);

  const onCodeChangeRef = useRef(onCodeChange);

  const onXmlChangeRef = useRef(onXmlChange);

  const onWorkspaceReadyRef = useRef(onWorkspaceReady);

  const generatorTypeRef = useRef(generatorType);

  const initialXmlRef = useRef(initialXml || '');

  const selectedCategoryNameRef = useRef(selectedCategoryName || 'start');

  const lastSyncedXmlRef = useRef<string | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sourceCodeRef = useRef(sourceCode || '');
  const currentBoardRef = useRef(currentBoard);
  const isFlyoutVisibleRef = useRef(false);
  const lastCircuitUpdateSignatureRef = useRef('');

  useEffect(() => {
    if (!isCodePanelResizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = codePanelResizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const deltaX = resizeState.startX - event.clientX;
      setCodePanelWidth(clampCodePanelWidth(resizeState.startWidth + deltaX));
    };

    const stopResizing = () => {
      codePanelResizeStateRef.current = null;
      setIsCodePanelResizing(false);
    };

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [codePanelWidth, isCodePanelResizing]);

  useEffect(() => {
    (window as BoardAwareWindow).SELECTED_BOARD = currentBoard;
  }, [currentBoard]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const awareWindow = window as CircuitAwareWindow;

    awareWindow.__CIRCUIT_DATA = circuitData;

    awareWindow.__CIRCUIT_CODING_SNAPSHOT = codingSnapshot;
  }, [circuitData, codingSnapshot]);

  useEffect(() => {
    onCodeChangeRef.current = onCodeChange;

    onXmlChangeRef.current = onXmlChange;

    onWorkspaceReadyRef.current = onWorkspaceReady;

    generatorTypeRef.current = generatorType;
  }, [onCodeChange, onXmlChange, onWorkspaceReady, generatorType]);

  useEffect(() => {
    initialXmlRef.current = initialXml || '';
  }, [initialXml]);

  useEffect(() => {
    sourceCodeRef.current = sourceCode || '';
    if (workspaceRef.current) return;
    setGeneratedPreviewCode(sourceCode || '');
  }, [sourceCode]);

  useEffect(() => {
    currentBoardRef.current = currentBoard;
  }, [currentBoard]);

  useEffect(() => {
    isFlyoutVisibleRef.current = isFlyoutVisible;
  }, [isFlyoutVisible]);

  useEffect(() => {
    selectedCategoryNameRef.current = selectedCategoryName || 'start';
  }, [selectedCategoryName]);

  const syncBlockCount = useCallback(() => {
    if (!workspaceRef.current) {
      setBlockCount(0);
      setWorkspaceBlockTypes((current) => (current.length === 0 ? current : []));
      return;
    }

    const blocks = workspaceRef.current
      .getAllBlocks(false)
      .filter((block) => !block.isShadow());
    const count = blocks.length;
    const nextTypes = Array.from(new Set(blocks.map((block) => block.type))).sort();

    setBlockCount(count);
    setWorkspaceBlockTypes((current) => (stringArrayEqual(current, nextTypes) ? current : nextTypes));
  }, [setBlockCount]);

  const serializeWorkspace = useCallback(() => {
    if (!workspaceRef.current) return '';

    const xml = Blockly.Xml.workspaceToDom(workspaceRef.current);

    return Blockly.utils.xml.domToText(xml);
  }, []);

  const emitBlocklyChanged = useCallback(
    (force = false) => {
      const xmlText = serializeWorkspace();

      if (!force && lastSyncedXmlRef.current === xmlText) {
        return;
      }

      lastSyncedXmlRef.current = xmlText;
      persistedXmlRef.current = xmlText;
      eventBus.emit('BLOCKLY_CHANGED', { xml: xmlText });
    },
    [eventBus, serializeWorkspace]
  );

  const createDefaultSetupBlock = useCallback(() => {
    if (!workspaceRef.current) return;

    const legacyRootBlock = workspaceRef.current.newBlock('arduino_setup_loop');
    legacyRootBlock.initSvg();
    legacyRootBlock.render();
    legacyRootBlock.moveBy(56, 56);

    syncBlockCount();
  }, [syncBlockCount]);

  const loadXmlIntoWorkspace = useCallback(
    (xmlText: string | null | undefined) => {
      if (!workspaceRef.current) return;

      const candidate = typeof xmlText === 'string' ? xmlText.trim() : '';

      workspaceRef.current.clear();

      if (!candidate || !isLikelyBlocklyXmlDocument(candidate)) {
        createDefaultSetupBlock();

        return;
      }

      try {
        const xml = Blockly.utils.xml.textToDom(candidate);

        Blockly.Xml.domToWorkspace(xml, workspaceRef.current);

        const hasUserBlocks = workspaceRef.current
          .getAllBlocks(false)
          .some((block) => !block.isShadow());

        if (!hasUserBlocks) {
          createDefaultSetupBlock();
        }
      } catch (e) {
        console.error('Failed to load workspace XML', e);

        workspaceRef.current.clear();

        createDefaultSetupBlock();
      }

      syncBlockCount();
    },
    [createDefaultSetupBlock, syncBlockCount]
  );

  const stabilizeFlyoutViewport = useCallback((flyout: Blockly.IFlyout) => {
  const flyoutApi = flyout as StabilizedFlyout;

  if (!flyoutApi.__edtechFixedScale) {
    flyoutApi.getFlyoutScale = () => BLOCKLY_FLYOUT_SCALE;
    flyoutApi.__edtechFixedScale = true;
  }

  const flyoutWorkspace = flyout.getWorkspace();
  if (!flyoutWorkspace) return;

  flyoutWorkspace.setScale(BLOCKLY_FLYOUT_SCALE);
  flyout.reflow?.();

  const widthChanged = Math.abs((flyoutApi.width_ ?? BLOCKLY_FLYOUT_FIXED_WIDTH) - BLOCKLY_FLYOUT_FIXED_WIDTH) > 0.001;
  flyoutApi.width_ = BLOCKLY_FLYOUT_FIXED_WIDTH;
  flyoutApi.position?.();

  const flyoutRoot = flyoutApi.svgGroup_;
  if (flyoutRoot) {
    flyoutRoot.setAttribute('width', String(BLOCKLY_FLYOUT_FIXED_WIDTH));
    flyoutRoot.style.overflow = 'hidden';
  }

  const targetWorkspace = (flyoutApi.getTargetWorkspace?.() ?? workspaceRef.current) as (Blockly.WorkspaceSvg & {
    resizeContents?: () => void;
    recordDragTargets?: () => void;
    translate?: (x: number, y: number) => void;
    scrollX: number;
    scrollY: number;
  }) | null;

  if (targetWorkspace && widthChanged) {
    targetWorkspace.translate?.(targetWorkspace.scrollX + BLOCKLY_FLYOUT_FIXED_WIDTH, targetWorkspace.scrollY);
  }

  targetWorkspace?.resizeContents?.();
  targetWorkspace?.recordDragTargets?.();
}, []);

const showCategoryFlyout = useCallback(
  (board: BoardKey, categoryName: string | null | undefined) => {
    if (!workspaceRef.current) return;

    hideNativeToolboxUi(workspaceRef.current);

    const flyout = workspaceRef.current.getFlyout();
    if (!flyout) return;

    const flyoutApi = flyout as StabilizedFlyout;
    stabilizeFlyoutViewport(flyout);

    const nextCategory = (categoryName || '').trim();
    const flyoutXmlText = nextCategory
      ? buildGuidedCategoryToolboxXml(board, nextCategory, circuitData, codingSnapshot, {
          learningLevel: toolboxLearningLevel,
          showAdvancedBlocks: showExtendedBlocks,
        })
      : EMPTY_TOOLBOX_XML;

    const flyoutXml = Blockly.utils.xml.textToDom(flyoutXmlText);

    flyoutApi.setAutoClose?.(false);
    flyoutApi.setContainerVisible?.(true);
    flyoutApi.setVisible?.(true);

    flyout.show(Array.from(flyoutXml.childNodes) as unknown as Blockly.utils.toolbox.FlyoutItemInfoArray);
    stabilizeFlyoutViewport(flyout);
  },
  [circuitData, codingSnapshot, showExtendedBlocks, stabilizeFlyoutViewport, toolboxLearningLevel]
);

const hideCategoryFlyout = useCallback(() => {
    const flyout = workspaceRef.current?.getFlyout();

    if (!flyout) return;

    const flyoutApi = flyout as Blockly.IFlyout & {
      setVisible?: (visible: boolean) => void;
      setContainerVisible?: (visible: boolean) => void;
    };

    flyout.hide();
    flyoutApi.setVisible?.(false);
    flyoutApi.setContainerVisible?.(false);
  }, []);

  const syncFlyoutScale = useCallback(() => {
  const flyout = workspaceRef.current?.getFlyout();
  if (!flyout) return;

  stabilizeFlyoutViewport(flyout);
}, [stabilizeFlyoutViewport]);

const handleGenerate = useCallback((force = false) => {
    if (!workspaceRef.current) return;

    try {
      const result = buildSourceCodeFromBlocklyWorkspace(workspaceRef.current, generatorTypeRef.current);
      const warning = result.looseTopLevelBlockCount > 0
        ? `Preview auto-routed ${result.looseTopLevelBlockCount} loose ${result.looseTopLevelBlockCount === 1 ? 'block' : 'blocks'} into setup()/loop(). Snap them into the root flow for exact behavior.`
        : null;

      setGeneratedPreviewCode((prev) => (prev === result.code ? prev : result.code));
      setPreviewWarning((prev) => (prev === warning ? prev : warning));

      if (force || sourceCodeRef.current !== result.code) {
        eventBus.emit('CODE_GENERATED', { code: result.code, warning });
      }
    } catch (e) {
      console.error('Code generation error:', e);
    }
  }, [eventBus]);

  const flushBlocklySync = useCallback(
    (force = false) => {
      emitBlocklyChanged(force);
      handleGenerate(force);
    },
    [emitBlocklyChanged, handleGenerate]
  );

  const onWorkspaceChange = useCallback(
    (e: Blockly.Events.Abstract) => {
      if (e.type === Blockly.Events.VIEWPORT_CHANGE) {
        syncFlyoutScale();
      }

      if (e.isUiEvent || e.type === Blockly.Events.FINISHED_LOADING) return;

      if (e.type === Blockly.Events.BLOCK_DRAG || e.type === Blockly.Events.BLOCK_MOVE) {
        const motionEvent = e as BlocklyMotionEvent;

        if (motionEvent.isStart || motionEvent.isMoveInProgress) return;
      }

      syncBlockCount();

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        flushBlocklySync();
        debounceTimerRef.current = null;
      }, BLOCKLY_SYNC_DEBOUNCE_MS);
    },
    [flushBlocklySync, syncBlockCount, syncFlyoutScale]
  );

  const initializeWorkspace = useCallback(
    (board: BoardKey) => {
      if (!containerRef.current) return;

      workspaceRef.current = Blockly.inject(containerRef.current, {
        toolbox: EMPTY_TOOLBOX_XML,
        media: '/blockly/media/',
        theme: blocklyTheme,
        renderer: 'zelos',
        trashcan: true,
        move: { scrollbars: true, drag: true, wheel: true },
        zoom: { controls: true, wheel: true, startScale: 1, maxScale: 2.4, minScale: 0.42, scaleSpeed: 1.12 },
        grid: {
          spacing: 28,
          length: 0,
          colour: blocklyGridColor,
          snap: true,
        },
      });

      workspaceRef.current.addChangeListener(onWorkspaceChange);

      requestAnimationFrame(() => {
        if (workspaceRef.current) {
          hideNativeToolboxUi(workspaceRef.current);

          if (isFlyoutVisible) {
            showCategoryFlyout(board, selectedCategoryNameRef.current);

            syncFlyoutScale();
          } else {
            hideCategoryFlyout();
          }

          Blockly.svgResize(workspaceRef.current);

          workspaceRef.current.scrollCenter();
        }
      });

      if (onWorkspaceReadyRef.current) {
        onWorkspaceReadyRef.current(workspaceRef.current);
      }

      Blockly.svgResize(workspaceRef.current);

      const xmlToRestore = persistedXmlRef.current || initialXmlRef.current;

      loadXmlIntoWorkspace(xmlToRestore);

      flushBlocklySync(true);

      const snapshot = serializeWorkspace();

      persistedXmlRef.current = snapshot;

      lastSyncedXmlRef.current = snapshot;

      syncBlockCount();
    },
    [blocklyGridColor, blocklyTheme, flushBlocklySync, hideCategoryFlyout, isFlyoutVisible, loadXmlIntoWorkspace, onWorkspaceChange, serializeWorkspace, showCategoryFlyout, syncBlockCount, syncFlyoutScale]
  );

  useEffect(() => {
    defineCustomBlocks();

    return () => {
      if (workspaceRef.current) {
        if (onWorkspaceReadyRef.current) {
          onWorkspaceReadyRef.current(null);
        }

        workspaceRef.current.dispose();

        workspaceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const boardChanged = prevBoardRef.current !== currentBoard;
    const themeChanged = prevThemeRef.current !== theme;

    if (!workspaceRef.current || boardChanged || themeChanged) {
      if (workspaceRef.current) {
        persistedXmlRef.current = serializeWorkspace();
        if (onWorkspaceReadyRef.current) {
          onWorkspaceReadyRef.current(null);
        }
        workspaceRef.current.dispose();
        workspaceRef.current = null;
      }

      initializeWorkspace(currentBoard);
      prevBoardRef.current = currentBoard;
      prevThemeRef.current = theme;
    }
  }, [currentBoard, initializeWorkspace, serializeWorkspace, theme]);

  useEffect(() => {
    return eventBus.subscribe('CIRCUIT_UPDATED', ({ signature }) => {
      if (!workspaceRef.current || signature === lastCircuitUpdateSignatureRef.current) {
        return;
      }

      lastCircuitUpdateSignatureRef.current = signature;
      hideNativeToolboxUi(workspaceRef.current);

      if (isFlyoutVisibleRef.current) {
        showCategoryFlyout(currentBoardRef.current, selectedCategoryNameRef.current);
        syncFlyoutScale();
      } else {
        hideCategoryFlyout();
      }

      Blockly.svgResize(workspaceRef.current);
      flushBlocklySync(true);
      syncBlockCount();
    });
  }, [eventBus, flushBlocklySync, hideCategoryFlyout, showCategoryFlyout, syncBlockCount, syncFlyoutScale]);

  useEffect(() => {
    if (!workspaceRef.current) return;

    const incomingXml = (initialXml || '').trim();

    const currentXml = serializeWorkspace().trim();

    if (incomingXml === lastSyncedXmlRef.current) return;

    if (incomingXml === currentXml) return;

    if (incomingXml.length === 0 && currentXml.length === 0) return;

    persistedXmlRef.current = initialXml || '';

    loadXmlIntoWorkspace(initialXml);

    flushBlocklySync(true);

    const snapshot = serializeWorkspace();

    persistedXmlRef.current = snapshot;

    lastSyncedXmlRef.current = snapshot;

    syncBlockCount();
  }, [flushBlocklySync, initialXml, loadXmlIntoWorkspace, serializeWorkspace, syncBlockCount]);

  useEffect(() => {
    if (!workspaceRef.current) return;

    hideNativeToolboxUi(workspaceRef.current);

    if (isFlyoutVisible) {
      showCategoryFlyout(currentBoard, selectedCategoryNameRef.current);

      syncFlyoutScale();
    } else {
      hideCategoryFlyout();
    }

    Blockly.svgResize(workspaceRef.current);
  }, [currentBoard, hideCategoryFlyout, isFlyoutVisible, selectedCategoryName, showCategoryFlyout, syncFlyoutScale]);

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (workspaceRef.current) {
        Blockly.svgResize(workspaceRef.current);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const handleCodePanelResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    codePanelResizeStateRef.current = {
      startX: event.clientX,
      startWidth: codePanelWidth,
    };
    setIsCodePanelResizing(true);
  }, [codePanelWidth]);

  const handleFitWorkspace = useCallback(() => {
    workspaceRef.current?.zoomToFit();

    requestAnimationFrame(() => {
      syncFlyoutScale();
    });
  }, [syncFlyoutScale]);

  const handleCenterWorkspace = useCallback(() => {
    workspaceRef.current?.scrollCenter();
  }, []);

  const handleCleanWorkspace = useCallback(() => {
    workspaceRef.current?.cleanUp();
  }, []);

  const handleCategorySelect = useCallback(
    (categoryId: string) => {
      selectedCategoryNameRef.current = categoryId;

      onSelectCategory?.(categoryId);

      setIsFlyoutVisible(true);

      if (isCompactLayout) {
        setShowCategorySidebar(false);
      }

      if (!workspaceRef.current) {
        return;
      }

      hideNativeToolboxUi(workspaceRef.current);

      showCategoryFlyout(currentBoard, categoryId);

      syncFlyoutScale();

      Blockly.svgResize(workspaceRef.current);
    },
    [currentBoard, isCompactLayout, onSelectCategory, showCategoryFlyout, syncFlyoutScale]
  );

    const handleStageClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;

      if (!isFlyoutVisible || !target) return;

      if (target.closest('[data-coach-card]')) {
        return;
      }

      if (target.closest('.blocklyFlyout') || target.closest('.blocklyFlyoutBackground')) {
        return;
      }

      setIsFlyoutVisible(false);

      hideCategoryFlyout();
    },
    [hideCategoryFlyout, isFlyoutVisible]
  );

  const workspaceLooksEmpty = blockCount <= 1;

  const guidedToolboxCategories = useMemo<GuidedToolboxCategorySummary[]>(
    () =>
      getGuidedToolboxCategories(currentBoard, circuitData, codingSnapshot, {
        learningLevel: toolboxLearningLevel,
        showAdvancedBlocks: showExtendedBlocks,
      }),
    [currentBoard, circuitData, codingSnapshot, showExtendedBlocks, toolboxLearningLevel]
  );

  // Every group with its icon and colour; the Customize dialog lists all of them, the sidebar only the visible ones.
  const shelfCategories = useMemo(() => guidedToolboxCategories.map(toShelfCategory), [guidedToolboxCategories]);

  const hiddenCategoryIdSet = useMemo(() => new Set(hiddenCategoryIds), [hiddenCategoryIds]);
  const availableCategories = useMemo(
    () => shelfCategories.filter((category) => !hiddenCategoryIdSet.has(category.id)),
    [shelfCategories, hiddenCategoryIdSet]
  );

  useEffect(() => {
    if (availableCategories.length === 0) {
      return;
    }

    const hasSelectedCategory = availableCategories.some((category) => category.id === selectedCategoryName);
    if (hasSelectedCategory) {
      return;
    }

    const nextCategory = availableCategories[0].id;
    selectedCategoryNameRef.current = nextCategory;
    onSelectCategory?.(nextCategory);
  }, [availableCategories, onSelectCategory, selectedCategoryName]);

  const activeCategoryName =
    selectedCategoryName && availableCategories.some((category) => category.id === selectedCategoryName)
      ? selectedCategoryName
      : availableCategories[0]?.id || 'start';

  const activeCategory =
    availableCategories.find((category) => category.id === activeCategoryName) ?? availableCategories[0] ?? FALLBACK_START_CATEGORY;

  const filteredCategories = useMemo(() => {
    const normalizedQuery = categoryQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return availableCategories;
    }

    return availableCategories.filter((category) =>
      category.label.toLowerCase().includes(normalizedQuery) ||
      category.description.toLowerCase().includes(normalizedQuery)
    );
  }, [availableCategories, categoryQuery]);

  const availableBlockTypeSet = useMemo(
    () => new Set(codingSnapshot.availableBlockTypes),
    [codingSnapshot.availableBlockTypes]
  );

  const orphanedCircuitBlockTypes = useMemo(
    () => workspaceBlockTypes.filter((blockType) => isOptionalCircuitBlock(blockType) && !availableBlockTypeSet.has(blockType)),
    [availableBlockTypeSet, workspaceBlockTypes]
  );

  const hasDisplayStarterBlocks = useMemo(
    () => codingSnapshot.availableBlockTypes.some((blockType) => DISPLAY_BLOCK_TYPES.has(blockType)),
    [codingSnapshot.availableBlockTypes]
  );

  const hasTimingBlock = useMemo(
    () => workspaceBlockTypes.some((blockType) => TIMING_BLOCK_TYPES.has(blockType)),
    [workspaceBlockTypes]
  );

  const hasRootFlowBlock = useMemo(
    () => workspaceBlockTypes.some((blockType) => ROOT_FLOW_BLOCK_TYPES.has(blockType)),
    [workspaceBlockTypes]
  );

  const hasCodeReadyComponent = codingSnapshot.components.some((component) => component.isCodeReady);
  const hasPreviewWarning = Boolean(previewWarning);

  const learningGuide = useMemo(
    () =>
      getLearningGuide({
        hasCodeReadyComponent,
        orphanedCircuitBlockCount: orphanedCircuitBlockTypes.length,
        workspaceLooksEmpty,
        availableBlockTypes: availableBlockTypeSet,
        workspaceBlockTypes,
        hasRootFlowBlock,
        hasTimingBlock,
        hasPreviewWarning,
        showCodePanel,
        learningLevel: toolboxLearningLevel,
        blockCount,
      }),
    [
      availableBlockTypeSet,
      blockCount,
      hasCodeReadyComponent,
      hasPreviewWarning,
      hasRootFlowBlock,
      hasTimingBlock,
      orphanedCircuitBlockTypes.length,
      showCodePanel,
      toolboxLearningLevel,
      workspaceBlockTypes,
      workspaceLooksEmpty,
    ]
  );

  const coachMilestones = useMemo(
    () => getCoachMilestones({ workspaceLooksEmpty, hasRootFlowBlock, hasPreviewWarning, hasTimingBlock, showCodePanel }),
    [hasPreviewWarning, hasRootFlowBlock, hasTimingBlock, showCodePanel, workspaceLooksEmpty]
  );
  const [isCoachOpen, setIsCoachOpen] = useState(true);

  const handleOpenCategoryManager = useCallback(() => {
    const visibleIds = shelfCategories
      .filter((category) => !hiddenCategoryIds.includes(category.id))
      .map((category) => category.id);

    setCategoryManagerDraft(visibleIds);
    setIsCategoryManagerOpen(true);
    setIsFlyoutVisible(false);
    hideCategoryFlyout();
  }, [shelfCategories, hiddenCategoryIds, hideCategoryFlyout]);

  const handleCloseCategoryManager = useCallback(() => {
    setIsCategoryManagerOpen(false);
  }, []);

  const handleToggleCategoryVisibility = useCallback((categoryId: string) => {
    setCategoryManagerDraft((current) => {
      const isVisible = current.includes(categoryId);
      if (isVisible) {
        if (current.length <= 1) {
          return current;
        }
        return current.filter((id) => id !== categoryId);
      }

      return [...current, categoryId];
    });
  }, []);

  const handleConfirmCategoryVisibility = useCallback(() => {
    const categoryIds = shelfCategories.map((category) => category.id);
    const selectedIds = new Set(categoryManagerDraft);
    if (selectedIds.size === 0) {
      return;
    }

    setHiddenCategoryIds((current) => {
      const preserved = current.filter((id) => !categoryIds.includes(id));
      const nextHidden = categoryIds.filter((id) => !selectedIds.has(id));
      return [...preserved, ...nextHidden];
    });
    setIsCategoryManagerOpen(false);
  }, [shelfCategories, categoryManagerDraft]);

  const handleGuideAction = useCallback((actionId: LearningGuideActionId) => {
    switch (actionId) {
      case 'open-start':
        handleCategorySelect('start');
        break;
      case 'open-output':
        handleCategorySelect('output');
        break;
      case 'open-your-circuit':
        handleCategorySelect('your-circuit');
        break;
      case 'show-code':
        setShowCodePanel(true);
        break;
      case 'advance-builder':
        setToolboxLearningLevel('builder');
        break;
      case 'advance-explore':
        setToolboxLearningLevel('explore');
        break;
      default:
        break;
    }
  }, [handleCategorySelect, setShowCodePanel, setToolboxLearningLevel]);

  const displayStarters = useMemo(() => getDisplayStarters(currentBoard), [currentBoard]);

  const insertDisplayStarter = useCallback(
    (starterId: string) => {
      const workspace = workspaceRef.current;
      if (!workspace) {
        return;
      }

      const starter = displayStarters.find((candidate) => candidate.id === starterId);
      if (!starter) {
        return;
      }

      const nextY = 36 + workspace.getTopBlocks(false).length * 120;
      const xml = Blockly.utils.xml.textToDom(starter.buildXml(40, nextY));
      Blockly.Xml.domToWorkspace(xml, workspace);
      flushBlocklySync(true);
      syncBlockCount();
      Blockly.svgResize(workspace);
      workspace.scrollCenter();
    },
    [displayStarters, flushBlocklySync, syncBlockCount]
  );

  const shouldShowDisplayWizard =
    hasDisplayStarterBlocks && (activeCategoryName === 'displays' || activeCategoryName === 'your-circuit');

  return (
    <div className="custom-blockly-host relative flex h-full w-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-[22px] border border-[var(--blockly-shell-border)] bg-[image:var(--blockly-shell-bg)] shadow-[var(--blockly-shell-shadow)] sm:rounded-[30px]" data-flyout-visible={isFlyoutVisible ? 'true' : 'false'}>
      <CategorySidebar
        isCompactLayout={isCompactLayout}
        isOpen={showCategorySidebar}
        onClose={() => setShowCategorySidebar(false)}
        boardName={boardLabel(currentBoard)}
        learningLevel={toolboxLearningLevel}
        onLearningLevelChange={setToolboxLearningLevel}
        query={categoryQuery}
        onQueryChange={setCategoryQuery}
        displayStarters={shouldShowDisplayWizard ? displayStarters : []}
        onInsertDisplayStarter={insertDisplayStarter}
        categories={filteredCategories}
        activeCategoryId={activeCategoryName}
        onSelectCategory={handleCategorySelect}
        isCategoryManagerOpen={isCategoryManagerOpen}
        onOpenCategoryManager={handleOpenCategoryManager}
      />

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <CanvasToolbar
            activeCategoryLabel={activeCategory.label}
            isCompactLayout={isCompactLayout}
            isSidebarOpen={showCategorySidebar}
            onToggleSidebar={() => setShowCategorySidebar((value) => !value)}
            blockCount={blockCount}
            onFit={handleFitWorkspace}
            onCenter={handleCenterWorkspace}
            onArrange={handleCleanWorkspace}
            showCodePanel={showCodePanel}
            onToggleCodePanel={() => setShowCodePanel((v) => !v)}
          />

          <div
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(134,78,251,0.2),transparent_42%),linear-gradient(180deg,#32106f_0%,#270e5b_100%)]"
            onClickCapture={handleStageClickCapture}
          >
            <div ref={containerRef} className="absolute inset-0 h-full w-full min-h-0 min-w-0" />
            <CoachCard
              isOpen={isCoachOpen}
              onOpenChange={setIsCoachOpen}
              milestones={coachMilestones}
              guide={learningGuide}
              onAction={handleGuideAction}
            />
          </div>
        </div>

        {showCodePanel ? (
          <CodePreviewPanel
            isCompactLayout={isCompactLayout}
            width={codePanelWidth}
            isResizing={isCodePanelResizing}
            onResizeStart={handleCodePanelResizeStart}
            warning={previewWarning}
            code={generatedPreviewCode}
            onClose={() => setShowCodePanel(false)}
          />
        ) : null}
      </div>

      {isCategoryManagerOpen ? (
        <CategoryManagerDialog
          categories={shelfCategories}
          visibleIds={categoryManagerDraft}
          onToggle={handleToggleCategoryVisibility}
          onCancel={handleCloseCategoryManager}
          onConfirm={handleConfirmCategoryVisibility}
        />
      ) : null}
    </div>
  );
}
