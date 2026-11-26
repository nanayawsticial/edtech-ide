import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { API_BASE_URL, apiFetch, safeJson } from '@/lib/api';
import { useEditorOrchestrator } from './EditorOrchestrator';
import { useCircuitOrchestrator } from './CircuitOrchestrator';
import { useSplitViewEventBus } from './SplitViewEventBus';
import { extractCompileFeedback } from '@/lib/simulator/compileFeedback';
import { useSimulationStore } from '@/stores/simulationStore';
import { encodeUtf8AsHex } from './helpers';
import { micropythonBoardMatches, type UsbBoardDescription } from '@/lib/serial/boardIdentity';
import type { useWebSerial } from '@/hooks/useWebSerial';

interface CompileResponse {
  success?: boolean;
  log?: string;
  hex?: string;
  error?: string;
  requestId?: string;
  compiledFiles?: number;
}

interface CompileControllerValue {
  isCompiling: boolean;
  supportsDeviceFiles: boolean;
  supportsSimulation: boolean;
  boardSupportNote?: string;
}

const CompileControllerContext = createContext<CompileControllerValue | null>(null);

type WebSerialController = ReturnType<typeof useWebSerial>;

export function useCompileFlow(webSerial: WebSerialController): CompileControllerValue {
  const eventBus = useSplitViewEventBus();
  const {
    boardConfig,
    currentBoard,
    compileStrategy,
    currentGenerator,
    sourceCode,
    isBlockMode,
    syncBlocklySourceCode,
    micropythonProjectDirectories,
    micropythonProjectFiles,
    arduinoProjectFiles,
    arduinoEntryFilePath,
  } = useEditorOrchestrator();
  const { simulationControls, simulationStatus } = useCircuitOrchestrator();
  const setCompileFeedback = useSimulationStore((state) => state.setCompileFeedback);
  const clearCompileFeedback = useSimulationStore((state) => state.clearCompileFeedback);
  const [isCompiling, setIsCompiling] = useState(false);

  const supportsSimulation = compileStrategy === 'arduino-cli' && Boolean(boardConfig?.supportsBrowserSimulation);
  const supportsDeviceFiles = boardConfig?.uploadTransport === 'micropython-raw-repl';
  const boardSupportNote = boardConfig?.supportNote;
  const isSimulationActive = Boolean(simulationStatus && (simulationStatus.isRunning || simulationStatus.isReady));
  const arduinoCompileScopeLabel = arduinoProjectFiles.length > 1 ? `project (${arduinoProjectFiles.length} files)` : 'sketch';

  const reportUnsupportedBoardAction = useCallback(
    (action: string) => {
      const detail = boardSupportNote ? ` ${boardSupportNote}` : '';
      webSerial.addMessage('error', `${action} is not available for ${currentBoard}.${detail}`.trim());
    },
    [boardSupportNote, currentBoard, webSerial],
  );

  const openBlockTerminalTab = useCallback(
    (tab: 'serial' | 'build' | 'connection') => {
      eventBus.emit('layout:block-terminal-request', { tab, open: true });
    },
    [eventBus],
  );

  const reportWrongBoard = useCallback(
    (connectedName: string) => {
      webSerial.addMessage(
        'error',
        `This project is for the ${currentBoard}, but the board connected is the ${connectedName}. Connect the ${currentBoard} instead, or pick the board you have in the board menu at the top.`,
      );
    },
    [currentBoard, webSerial],
  );

  /**
   * Says which board was just connected, and warns when it is not the project's board. False when
   * it is a different kind of board altogether (an Arduino for a Pico project), so Upload stops.
   */
  const checkConnectedBoard = useCallback(
    async (board: UsbBoardDescription): Promise<boolean> => {
      if (board.family && boardConfig?.family && board.family !== boardConfig.family) {
        reportWrongBoard(board.name);
        return false;
      }
      if (!supportsDeviceFiles) {
        return true;
      }
      // MicroPython names the exact board (a Pico 2 W, not just "a Pico") when it is at its prompt.
      const banner = await webSerial.identifyMicroPythonBoard();
      if (!banner) {
        return true;
      }
      const model = banner.machine.replace(/ with .*$/, '');
      webSerial.nameConnectedBoard(model);
      webSerial.addMessage('system', `The board is a ${banner.machine}, running MicroPython ${banner.version}.`);
      if (micropythonBoardMatches(banner.machine, currentBoard) === false) {
        reportWrongBoard(model);
      }
      return true;
    },
    [boardConfig?.family, currentBoard, reportWrongBoard, supportsDeviceFiles, webSerial],
  );

  const buildArduinoCompilePayload = useCallback(
    () => ({
      board: currentBoard,
      sourceCode,
      files: arduinoProjectFiles.length > 0 ? arduinoProjectFiles : undefined,
      entryFilePath: arduinoEntryFilePath ?? undefined,
    }),
    [arduinoEntryFilePath, arduinoProjectFiles, currentBoard, sourceCode],
  );

  const handleVerify = useCallback(async () => {
    openBlockTerminalTab('build');
    clearCompileFeedback();
    if (compileStrategy === 'unsupported') {
      reportUnsupportedBoardAction('Compilation');
      return;
    }

    if (supportsDeviceFiles) {
      webSerial.addMessage('system', 'MicroPython code is validated on device upload. Use Upload.');
      return;
    }

    setIsCompiling(true);
    clearCompileFeedback();
    webSerial.addMessage('system', `Compiling ${arduinoCompileScopeLabel} for ${currentBoard}...`);

    try {
      const res = await apiFetch('/api/compile/arduino', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildArduinoCompilePayload()),
      });
      const data = await safeJson<CompileResponse>(res);

      if (res.ok && data?.success) {
        clearCompileFeedback();
        webSerial.addMessage('system', 'Compilation successful.');
        const lines = (data.log || '').split('\n').filter((line) => line.trim().length > 0);
        lines.forEach((line) => webSerial.addMessage('app', line));
      } else {
        const message = data?.error || (res.ok ? 'Compilation failed.' : `Compiler API error (status ${res.status}).`);
        setCompileFeedback(extractCompileFeedback(data?.log || data?.error || message, message));
        webSerial.addMessage('error', message);
        const lines = (data?.log || '').split('\n').filter((line) => line.trim().length > 0);
        lines.forEach((line) => webSerial.addMessage('error', line));
      }
    } catch (error) {
      const message = `Compiler API offline at ${API_BASE_URL}: ${(error as Error).message}`;
      setCompileFeedback(extractCompileFeedback(message, message));
      webSerial.addMessage('error', message);
    } finally {
      setIsCompiling(false);
    }
  }, [arduinoCompileScopeLabel, buildArduinoCompilePayload, clearCompileFeedback, compileStrategy, currentBoard, openBlockTerminalTab, reportUnsupportedBoardAction, setCompileFeedback, supportsDeviceFiles, webSerial]);

  const syncMicroPythonProjectToDevice = useCallback(async () => {
    if (micropythonProjectFiles.length === 0) {
      throw new Error('No MicroPython files found in this project.');
    }

    // This stops a running program, which saving files does anyway, and makes sure of the board.
    const machine = (await webSerial.runMicroPythonCommand('import os\nprint(os.uname().machine)', 6000)).trim();
    if (machine) {
      webSerial.nameConnectedBoard(machine.replace(/ with .*$/, ''));
      if (micropythonBoardMatches(machine, currentBoard) === false) {
        reportWrongBoard(machine.replace(/ with .*$/, ''));
      }
    }

    if (micropythonProjectDirectories.length > 0) {
      const mkdirScript = `import os\nfor _path in ${JSON.stringify(micropythonProjectDirectories)}:\n try:\n  os.mkdir(_path)\n except OSError:\n  pass\nprint("READY")`;
      await webSerial.runMicroPythonCommand(mkdirScript, 12000);
    }

    for (const file of micropythonProjectFiles) {
      const writeScript = `import binascii\nwith open(${JSON.stringify(file.path)}, "wb") as _target:\n _target.write(binascii.unhexlify(${JSON.stringify(encodeUtf8AsHex(file.content))}))\nprint("OK")`;
      const timeoutMs = Math.max(10000, file.content.length * 8);
      await webSerial.runMicroPythonCommand(writeScript, timeoutMs);
      webSerial.addMessage('system', `Synced ${file.path}`);
    }

    webSerial.addMessage('system', 'Files saved to the MicroPython device.');
    if (micropythonProjectFiles.some((file) => file.path === 'main.py')) {
      // Restart the board rather than paste the code into the REPL: it then runs main.py exactly as
      // it will when switched on away from the computer, and a soft reboot frees what the last run
      // held (a web server's port 80, for one).
      webSerial.addMessage('system', 'Restarting the board to run main.py. What it prints comes next.');
      await webSerial.restartMicroPython();
    } else if (sourceCode.trim()) {
      webSerial.addMessage('system', 'Running the program from the synced project...');
      await webSerial.executeMicroPythonRaw(sourceCode);
    }
  }, [currentBoard, micropythonProjectDirectories, micropythonProjectFiles, reportWrongBoard, sourceCode, webSerial]);

  const handleUploadToBoard = useCallback(async () => {
    openBlockTerminalTab('build');
    clearCompileFeedback();
    if (compileStrategy === 'unsupported' || boardConfig?.uploadTransport === 'unsupported') {
      reportUnsupportedBoardAction('Upload');
      return;
    }

    if (!webSerial.isConnected) {
      // Connect as part of Upload: the browser shows its port list (this click counts as the permission).
      webSerial.addMessage('system', 'Connecting to your board. If a list of ports opens, choose it there (usually a COM port or "USB Serial Device").');
      const connection = await webSerial.connect();
      if (!connection.connected) {
        // Say why here too: this is the tab the learner is looking at.
        webSerial.addMessage('error', `Upload stopped. ${connection.problem}`);
        return;
      }
      if (!(await checkConnectedBoard(connection.board))) {
        webSerial.addMessage('error', 'Upload stopped: this is not the board the project is for.');
        return;
      }
    }

    if (supportsDeviceFiles) {
      setIsCompiling(true);
      webSerial.addMessage('system', `Saving ${micropythonProjectFiles.length} file(s) on the ${currentBoard}...`);
      // The board's replies while files are saved are not the program's output: keep them out of
      // the Serial Monitor until the board restarts into main.py.
      webSerial.setBoardOutputQuiet(true);
      try {
        await syncMicroPythonProjectToDevice();
      } catch (error) {
        webSerial.addMessage('error', `Upload failed: ${(error as Error).message}`);
      } finally {
        webSerial.setBoardOutputQuiet(false);
        setIsCompiling(false);
      }
      return;
    }

    setIsCompiling(true);
    clearCompileFeedback();
    webSerial.addMessage('system', `Compiling ${arduinoCompileScopeLabel} for ${currentBoard} before upload...`);

    try {
      const res = await apiFetch('/api/compile/arduino', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildArduinoCompilePayload()),
      });
      const data = await safeJson<CompileResponse>(res);

      if (res.ok && data?.success && data?.hex) {
        clearCompileFeedback();
        webSerial.addMessage('system', 'Compilation successful. Starting upload...');
        await webSerial.flashArduino(data.hex, currentBoard);
      } else {
        const message = data?.error || (res.ok ? 'Compilation failed. Upload aborted.' : `Compiler API error (status ${res.status}).`);
        setCompileFeedback(extractCompileFeedback(data?.log || data?.error || message, message));
        webSerial.addMessage('error', message);
        const lines = (data?.log || '').split('\n').filter((line) => line.trim().length > 0);
        lines.forEach((line) => webSerial.addMessage('error', line));
      }
    } catch (error) {
      const message = `Compiler API offline at ${API_BASE_URL}: ${(error as Error).message}`;
      setCompileFeedback(extractCompileFeedback(message, message));
      webSerial.addMessage('error', message);
    } finally {
      setIsCompiling(false);
    }
  }, [
    arduinoCompileScopeLabel,
    boardConfig?.uploadTransport,
    buildArduinoCompilePayload,
    compileStrategy,
    currentBoard,
    micropythonProjectFiles.length,
    openBlockTerminalTab,
    reportUnsupportedBoardAction,
    supportsDeviceFiles,
    syncMicroPythonProjectToDevice,
    checkConnectedBoard,
    webSerial,
    clearCompileFeedback,
    setCompileFeedback,
  ]);

  const handleConnectDevice = useCallback(async () => {
    openBlockTerminalTab('connection');
    if (webSerial.isConnected) {
      await webSerial.disconnect();
      return;
    }
    const connection = await webSerial.connect();
    if (connection.connected) {
      await checkConnectedBoard(connection.board);
    }
  }, [checkConnectedBoard, openBlockTerminalTab, webSerial]);

  const handleUploadAndSimulate = useCallback(async () => {
    if (!supportsSimulation || !simulationControls) {
      return;
    }

    if (isSimulationActive) {
      simulationControls.stop();
      return;
    }

    let latestSourceCode = sourceCode;
    if (isBlockMode) {
      latestSourceCode = syncBlocklySourceCode();
      if (latestSourceCode !== sourceCode) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }

    if (!latestSourceCode.trim()) {
      return;
    }

    await simulationControls.start();

    // The simulator only shows compile errors next to the circuit and the text editor. Put them in
    // Build output too, so a failed run from the Blocks screen never looks like nothing happened.
    const feedback = useSimulationStore.getState().compileFeedback;
    if (feedback) {
      openBlockTerminalTab('build');
      const diagnostics = feedback.diagnostics.map((diagnostic) => diagnostic.raw.trim()).filter(Boolean);
      if (diagnostics.length > 0) {
        webSerial.addMessage('error', 'Simulation did not start: the code did not compile.');
        diagnostics.forEach((line) => webSerial.addMessage('error', line));
      } else {
        webSerial.addMessage('error', `Simulation did not start: ${feedback.message}`);
      }
    }
  }, [isBlockMode, isSimulationActive, openBlockTerminalTab, simulationControls, sourceCode, supportsSimulation, syncBlocklySourceCode, webSerial]);

  useEffect(() => eventBus.on('compile:verify-request', () => { void handleVerify(); }), [eventBus, handleVerify]);
  useEffect(() => eventBus.on('compile:upload-request', () => { void handleUploadToBoard(); }), [eventBus, handleUploadToBoard]);
  useEffect(() => eventBus.on('device:connect-toggle-request', () => { void handleConnectDevice(); }), [eventBus, handleConnectDevice]);
  useEffect(() => eventBus.on('simulation:toggle-request', () => { void handleUploadAndSimulate(); }), [eventBus, handleUploadAndSimulate]);

  return useMemo(
    () => ({
      isCompiling,
      supportsDeviceFiles,
      supportsSimulation,
      boardSupportNote,
    }),
    [boardSupportNote, isCompiling, supportsDeviceFiles, supportsSimulation],
  );
}

export function CompileController({ children, webSerial }: { children: ReactNode; webSerial: WebSerialController }) {
  const value = useCompileFlow(webSerial);
  return <CompileControllerContext.Provider value={value}>{children}</CompileControllerContext.Provider>;
}

export function useCompileController() {
  const context = useContext(CompileControllerContext);
  if (!context) {
    throw new Error('useCompileController must be used within CompileController');
  }
  return context;
}


