"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';

import { useBoard } from '@/contexts/BoardContext';
import { useProject } from '@/contexts/ProjectContext';
import {
  buildWorkspaceDraft,
  clearWorkspaceDraft,
  draftScope,
  hasWorkInProgress,
  readWorkspaceDraft,
  shouldRestoreDraft,
  workspaceSignature,
  writeWorkspaceDraft,
  type WorkspaceMeta,
  type WorkspaceSnapshot,
} from '@/lib/projects/workspaceDraft';
import { useCircuitStore } from '@/stores/circuitStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSplitViewEventBus } from './SplitViewEventBus';

const WRITE_DELAY_MS = 800;

// Unsaved new work comes back once per page load (after a reload or crash), never when the
// learner deliberately starts a new sketch later on.
let scratchDraftCheckedThisPageLoad = false;

function currentSnapshot(): WorkspaceSnapshot {
  const { components, nets } = useCircuitStore.getState();
  return { files: useEditorStore.getState().files, circuit: { components, nets } };
}

function applySnapshot(snapshot: WorkspaceSnapshot) {
  useEditorStore.getState().setFiles(snapshot.files);
  useCircuitStore.getState().setCircuitData(snapshot.circuit, true);
}

interface RecoveryNotice {
  scope: string;
  updatedAt: number;
  isScratch: boolean;
  /** What the workspace held before the draft was put back, for "use the saved version". */
  previous: WorkspaceSnapshot;
  previousName: string;
}

/**
 * Keeps a local copy of unsaved work and offers it back after a reload. Renders only the
 * "we kept your work" notice.
 */
export default function WorkspaceDraftKeeper() {
  const eventBus = useSplitViewEventBus();
  const { projectId, projectName, setProjectName, hasLoadedProjectFiles } = useProject();
  const { currentBoard, codingMode, language, generator, environment, pendingProjectIntent } = useBoard();
  const [notice, setNotice] = useState<RecoveryNotice | null>(null);

  const scope = draftScope(projectId);
  const startedFromIntentRef = useRef(Boolean(pendingProjectIntent));
  /** The scope whose draft has been checked; drafts are only written for it. */
  const readyScopeRef = useRef<string | null>(null);
  /** The work as last saved (or as opened), so unchanged work does not leave a draft behind. */
  const baselineRef = useRef('');
  const liveRef = useRef({ scope, projectName, meta: {} as WorkspaceMeta });

  useEffect(() => {
    liveRef.current = {
      scope,
      projectName,
      meta: { board: currentBoard ?? null, codingMode: codingMode ?? null, language: language ?? null, generator: generator ?? null, environment: environment ?? null },
    };
  }, [codingMode, currentBoard, environment, generator, language, projectName, scope]);

  // Check for a draft once the workspace for this scope has loaded.
  useEffect(() => {
    if (readyScopeRef.current === scope) {
      return;
    }
    readyScopeRef.current = null;
    if (projectId && !hasLoadedProjectFiles) {
      return;
    }

    // Wait a tick so the project's circuit and the starter files are in place first.
    const timer = window.setTimeout(() => {
      const isScratch = !projectId;
      const current = currentSnapshot();
      const draft = readWorkspaceDraft(scope);
      const mayRestore = isScratch ? !scratchDraftCheckedThisPageLoad && !startedFromIntentRef.current : true;
      if (isScratch) {
        scratchDraftCheckedThisPageLoad = true;
      }

      baselineRef.current = workspaceSignature(current);

      if (draft && mayRestore && shouldRestoreDraft(draft, current, liveRef.current.meta)) {
        const previousName = liveRef.current.projectName;
        applySnapshot(draft);
        useEditorStore.getState().setHasUnsavedChanges(true);
        if (isScratch && draft.projectName) {
          setProjectName(draft.projectName);
        }
        setNotice({ scope, updatedAt: draft.updatedAt, isScratch, previous: current, previousName });
      } else {
        clearWorkspaceDraft(scope);
      }

      readyScopeRef.current = scope;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [hasLoadedProjectFiles, projectId, scope, setProjectName]);

  const writeDraftNow = useCallback(() => {
    const live = liveRef.current;
    if (readyScopeRef.current !== live.scope) {
      return;
    }

    const snapshot = currentSnapshot();
    if (workspaceSignature(snapshot) === baselineRef.current || (live.scope === 'scratch' && !hasWorkInProgress(snapshot, live.meta.codingMode))) {
      clearWorkspaceDraft(live.scope);
      return;
    }

    writeWorkspaceDraft(buildWorkspaceDraft(live.scope, live.projectName, snapshot, live.meta));
  }, []);

  // Write the draft shortly after each change, and straight away when the page is closing.
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(writeDraftNow, WRITE_DELAY_MS);
    };

    const stopEditor = useEditorStore.subscribe((state, previous) => {
      if (state.files !== previous.files) schedule();
    });
    const stopCircuit = useCircuitStore.subscribe((state, previous) => {
      if (state.components !== previous.components || state.nets !== previous.nets) schedule();
    });
    const flush = () => {
      window.clearTimeout(timer);
      writeDraftNow();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);

    return () => {
      window.clearTimeout(timer);
      stopEditor();
      stopCircuit();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [writeDraftNow]);

  // Saved work needs no recovery copy.
  useEffect(() => {
    const stopSaved = eventBus.on('FILE_SAVED', ({ origin, projectId: savedProjectId }) => {
      if (origin === 'create') {
        clearWorkspaceDraft('scratch');
      }
      clearWorkspaceDraft(draftScope(savedProjectId));
      baselineRef.current = workspaceSignature(currentSnapshot());
      setNotice(null);
    });
    const stopReset = eventBus.on('app:reset-request', () => {
      clearWorkspaceDraft('scratch');
      clearWorkspaceDraft(liveRef.current.scope);
      setNotice(null);
    });
    return () => {
      stopSaved();
      stopReset();
    };
  }, [eventBus]);

  // The notice belongs to the workspace it was shown for.
  if (!notice || notice.scope !== scope) {
    return null;
  }

  const time = new Date(notice.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const usePreviousVersion = () => {
    applySnapshot(notice.previous);
    useEditorStore.getState().setHasUnsavedChanges(false);
    if (notice.isScratch) {
      setProjectName(notice.previousName);
    }
    clearWorkspaceDraft(notice.scope);
    baselineRef.current = workspaceSignature(currentSnapshot());
    setNotice(null);
  };

  return (
    <div
      role="status"
      data-testid="workspace-recovery-notice"
      // Below the top bars, so the Save button it points to stays visible.
      className="ui-always-dark pointer-events-auto absolute left-1/2 top-[200px] z-[70] flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-start gap-3 rounded-2xl border border-emerald-400/25 bg-[color:var(--ui-popover-bg)]/95 p-4 text-slate-100 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-200">
        <History size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-white">We kept your unsaved work</p>
        <p className="mt-1 text-[13px] leading-5 text-slate-300">
          Your circuit and code are back as you left them at {time}.{' '}
          {notice.isScratch ? 'Click Save to keep them in your projects.' : 'Click Save to keep these changes.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-white transition hover:bg-emerald-400"
          >
            <span className="text-[13px] font-semibold">Got it</span>
          </button>
          <button
            type="button"
            onClick={usePreviousVersion}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-slate-200 transition hover:bg-white/15"
          >
            <span className="text-[13px] font-semibold">{notice.isScratch ? 'Start empty instead' : 'Use the saved version'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
