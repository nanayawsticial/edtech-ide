import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { SerialChunkListener, SerialMessageSink, SerialPartialLineSink } from './types';
import { BOARD_USB_VENDOR_IDS, isBoardUsbVendor } from '@/lib/serial/boardUsbIds';
import { describeUsbBoard, type UsbBoardDescription } from '@/lib/serial/boardIdentity';

export type ConnectResult = { connected: true; board: UsbBoardDescription } | { connected: false; problem: string };

export interface SerialTransportController {
  isConnected: boolean;
  /** What the connected board is, in words (null when nothing is connected). */
  connectedBoard: UsbBoardDescription | null;
  /** Replaces the board's name once the board has said exactly what it is (MicroPython does). */
  nameConnectedBoard: (name: string) => void;
  /** Keeps the board's replies out of the Serial Monitor while the IDE talks to it (saving files). */
  setBoardOutputQuiet: (quiet: boolean) => void;
  baudRate: number;
  portRef: MutableRefObject<SerialPort | null>;
  readerRef: MutableRefObject<ReadableStreamDefaultReader<string> | null>;
  writerRef: MutableRefObject<WritableStreamDefaultWriter<Uint8Array> | null>;
  textDecoderRef: MutableRefObject<TextDecoderStream | null>;
  baudRateRef: MutableRefObject<number>;
  keepReadingRef: MutableRefObject<boolean>;
  pipeAbortControllerRef: MutableRefObject<AbortController | null>;
  pipeToPromiseRef: MutableRefObject<Promise<void> | null>;
  /** Asks the learner to pick a port and opens it. On failure, `problem` says what to do. */
  connect: (baudRate?: number) => Promise<ConnectResult>;
  disconnect: () => Promise<void>;
  setBaudRate: (baudRate: number) => Promise<void>;
  writeText: (text: string) => Promise<void>;
  writeBytes: (data: Uint8Array) => Promise<void>;
  setChunkListener: (listener: SerialChunkListener) => void;
  pauseDecodedReadPipeline: () => Promise<void>;
  resumeDecodedReadPipeline: () => Promise<void>;
  reopenPort: (baudRate: number) => Promise<void>;
}

interface UseSerialTransportOptions {
  addMessage: SerialMessageSink;
  /** Shows text the board printed without a newline yet (progress dots, a prompt). */
  showPartialLine?: SerialPartialLineSink;
}

function normalizeBaudRate(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 9600;
}

export function useSerialTransport({ addMessage, showPartialLine }: UseSerialTransportOptions): SerialTransportController {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedBoard, setConnectedBoard] = useState<UsbBoardDescription | null>(null);
  const [baudRate, setBaudRateState] = useState(9600);
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const textDecoderRef = useRef<TextDecoderStream | null>(null);
  const baudRateRef = useRef(9600);
  const keepReadingRef = useRef(true);
  const pipeAbortControllerRef = useRef<AbortController | null>(null);
  const pipeToPromiseRef = useRef<Promise<void> | null>(null);
  const chunkListenerRef = useRef<SerialChunkListener>(null);
  /** After a cancelled pick, the next list shows every port (for boards with unusual USB chips). */
  const showAllPortsNextRef = useRef(false);
  /** While true, what the board sends goes to the chunk listener only, not the Serial Monitor. */
  const quietRef = useRef(false);

  const readLoop = useCallback(async () => {
    let lineBuffer = '';
    let partialTimer: ReturnType<typeof setTimeout> | null = null;

    while (portRef.current?.readable && keepReadingRef.current && readerRef.current) {
      try {
        const { value, done } = await readerRef.current.read();
        if (done) {
          break;
        }

        if (!value) {
          continue;
        }

        chunkListenerRef.current?.(value);

        if (quietRef.current) {
          // The IDE is talking to the board (saving files): its replies are not the program's output.
          lineBuffer = '';
          if (partialTimer) {
            clearTimeout(partialTimer);
            partialTimer = null;
          }
          continue;
        }

        lineBuffer += value;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        lines.forEach((line) => {
          if (line.trim() !== '' || line === '\r') {
            addMessage('app', line.replace(/\r$/, ''));
          }
        });

        // Text without a newline yet (a dot a second while Wi-Fi connects, the ">>>" prompt) would
        // otherwise stay hidden until the line ends. Show it once the board pauses.
        if (partialTimer) {
          clearTimeout(partialTimer);
          partialTimer = null;
        }
        if (showPartialLine && lineBuffer.trim() !== '') {
          partialTimer = setTimeout(() => {
            partialTimer = null;
            showPartialLine(lineBuffer.replace(/\r$/, ''));
          }, 150);
        }
      } catch (error) {
        if (keepReadingRef.current) {
          addMessage('error', `Read error: ${(error as Error).message}`);
        }
        break;
      }
    }
    if (partialTimer) {
      clearTimeout(partialTimer);
    }
  }, [addMessage, showPartialLine]);

  const pauseDecodedReadPipeline = useCallback(async () => {
    keepReadingRef.current = false;

    const activeReader = readerRef.current;
    readerRef.current = null;

    if (activeReader) {
      await activeReader.cancel().catch(() => undefined);
      try {
        activeReader.releaseLock();
      } catch {
        // Ignore stale reader locks while pausing the line reader.
      }
    }

    const pipeAbortController = pipeAbortControllerRef.current;
    pipeAbortControllerRef.current = null;
    if (pipeAbortController) {
      pipeAbortController.abort();
    }

    const pipeToPromise = pipeToPromiseRef.current;
    pipeToPromiseRef.current = null;
    if (pipeToPromise) {
      await pipeToPromise.catch(() => undefined);
    }

    textDecoderRef.current = null;

    if (writerRef.current) {
      try {
        writerRef.current.releaseLock();
      } catch {
        // Ignore stale writer locks while pausing the line reader.
      }
      writerRef.current = null;
    }
  }, []);

  const resumeDecodedReadPipeline = useCallback(async () => {
    const port = portRef.current;
    if (!port?.readable) {
      return;
    }

    keepReadingRef.current = true;

    const textDecoder = new TextDecoderStream();
    const abortController = new AbortController();
    pipeAbortControllerRef.current = abortController;

    const pipeToPromise = port.readable
      .pipeTo(textDecoder.writable, { signal: abortController.signal })
      .catch(() => undefined)
      .finally(() => {
        if (pipeToPromiseRef.current === pipeToPromise) {
          pipeToPromiseRef.current = null;
        }
      });
    pipeToPromiseRef.current = pipeToPromise;
    readerRef.current = textDecoder.readable.getReader();
    textDecoderRef.current = textDecoder;

    void readLoop();
  }, [readLoop]);

  const reopenPort = useCallback(async (nextBaudRate: number) => {
    const port = portRef.current;
    if (!port) {
      throw new Error('Port not available.');
    }

    await port.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await port.open({ baudRate: nextBaudRate });
  }, []);

  /** A board picked before reconnects straight away; otherwise the browser shows its port list. */
  const chooseBoardPort = useCallback(async () => {
    const remembered = (await navigator.serial.getPorts()).filter((port) => isBoardUsbVendor(port.getInfo().usbVendorId));
    if (remembered.length === 1) {
      return remembered[0];
    }

    const showAll = showAllPortsNextRef.current;
    showAllPortsNextRef.current = false;
    return navigator.serial.requestPort(
      { filters: showAll ? [] : BOARD_USB_VENDOR_IDS.map((usbVendorId) => ({ usbVendorId })) }
    );
  }, []);

  const connect = useCallback(async (requestedBaudRate?: number): Promise<ConnectResult> => {
    const fail = (problem: string): ConnectResult => {
      addMessage('error', problem);
      return { connected: false, problem };
    };

    if (!(typeof navigator !== 'undefined' && 'serial' in navigator)) {
      return fail('This browser cannot connect to boards. Open Sticial Studio in Chrome or Edge, or use the desktop app.');
    }

    const nextBaudRate = normalizeBaudRate(requestedBaudRate ?? baudRateRef.current);

    const askedAt = Date.now();
    try {
      const port = await chooseBoardPort();
      await port.open({ baudRate: nextBaudRate });

      portRef.current = port;
      baudRateRef.current = nextBaudRate;
      setBaudRateState(nextBaudRate);
      setIsConnected(true);

      await resumeDecodedReadPipeline();

      const board = describeUsbBoard(port.getInfo());
      setConnectedBoard(board);
      addMessage('system', `Connected: ${board.name}.`);
      return { connected: true, board };
    } catch (error) {
      const serialError = error as Error;
      if (serialError.name === 'NotFoundError' && Date.now() - askedAt < 400) {
        // Refused faster than anyone could click: this window never showed the board list.
        return fail('This window cannot show the list of boards. Open Sticial Studio in Chrome or Edge, or use the desktop app, to connect a board.');
      }
      if (serialError.name === 'NotFoundError') {
        showAllPortsNextRef.current = true;
        return fail(
          'No board was chosen. In the list, pick your board (for example "Arduino Uno (COM9)" or "USB-SERIAL CH340"). If it is not in the list, check the USB cable and try again: the next list shows every port.'
        );
      }
      if (serialError.name === 'NetworkError' || serialError.name === 'InvalidStateError') {
        return fail('The board is busy: another program is using it. Close the Sticial Studio app, other tabs connected to the board, the Arduino IDE or Thonny, then try again.');
      }
      return fail(`Could not connect to the board: ${serialError.message}`);
    }
  }, [addMessage, chooseBoardPort, resumeDecodedReadPipeline]);

  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;

    try {
      await pauseDecodedReadPipeline();

      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }

      setIsConnected(false);
      setConnectedBoard(null);
      addMessage('system', 'Disconnected from the board.');
    } catch (error) {
      addMessage('error', `Disconnect error: ${(error as Error).message}`);
    }
  }, [addMessage, pauseDecodedReadPipeline]);

  const setBaudRate = useCallback(async (nextValue: number) => {
    const nextBaudRate = normalizeBaudRate(nextValue);
    const previousBaudRate = baudRateRef.current;

    if (nextBaudRate === previousBaudRate) {
      return;
    }

    baudRateRef.current = nextBaudRate;
    setBaudRateState(nextBaudRate);

    if (!portRef.current || !isConnected) {
      addMessage('system', `Baud rate set to ${nextBaudRate} for the next connection.`);
      return;
    }

    try {
      await pauseDecodedReadPipeline();
      await reopenPort(nextBaudRate);
      await resumeDecodedReadPipeline();
      addMessage('system', `Switched serial connection to ${nextBaudRate} baud.`);
    } catch (error) {
      baudRateRef.current = previousBaudRate;
      setBaudRateState(previousBaudRate);

      try {
        await reopenPort(previousBaudRate);
        await resumeDecodedReadPipeline();
      } catch {
        // Best-effort recovery only.
      }

      addMessage('error', `Baud rate change failed: ${(error as Error).message}`);
    }
  }, [addMessage, isConnected, pauseDecodedReadPipeline, reopenPort, resumeDecodedReadPipeline]);

  const writeBytes = useCallback(async (data: Uint8Array) => {
    if (!portRef.current?.writable) {
      addMessage('error', 'Port not writable or not connected.');
      return;
    }

    try {
      const writer = portRef.current.writable.getWriter();
      writerRef.current = writer;
      await writer.write(data);
      writer.releaseLock();
      writerRef.current = null;
    } catch (error) {
      addMessage('error', `WriteBytes error: ${(error as Error).message}`);
    }
  }, [addMessage]);

  const writeText = useCallback(async (text: string) => {
    const encoder = new TextEncoder();
    await writeBytes(encoder.encode(`${text}\n`));
    addMessage('sent', text);
  }, [addMessage, writeBytes]);

  const setBoardOutputQuiet = useCallback((quiet: boolean) => {
    quietRef.current = quiet;
    if (quiet) {
      showPartialLine?.(''); // a waiting ">>>" prompt is about to be stale
    }
  }, [showPartialLine]);

  const nameConnectedBoard = useCallback((name: string) => {
    setConnectedBoard((board) => (board ? { ...board, name } : board));
  }, []);

  const setChunkListener = useCallback((listener: SerialChunkListener) => {
    chunkListenerRef.current = listener;
  }, []);

  useEffect(() => {
    const handleDisconnect = (event: Event) => {
      // The browser reports every board it knows being unplugged, connected or not. Only the one in
      // use matters (a Pico restarting into its install mode, for one, is not an error here).
      // Chrome sends the event from the port itself; the desktop app's bridge sends it from
      // navigator.serial, and only for the open port.
      const fromAnotherPort = event.target !== event.currentTarget && event.target !== portRef.current;
      if (!portRef.current || fromAnotherPort) {
        return;
      }
      setIsConnected(false);
      setConnectedBoard(null);
      keepReadingRef.current = false;
      portRef.current = null;
      readerRef.current = null;
      writerRef.current = null;
      textDecoderRef.current = null;
      pipeAbortControllerRef.current = null;
      pipeToPromiseRef.current = null;
      addMessage('error', 'The board was disconnected. Check the USB cable, then connect again.');
    };

    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      navigator.serial.addEventListener('disconnect', handleDisconnect);
    }

    return () => {
      if (typeof navigator !== 'undefined' && 'serial' in navigator) {
        navigator.serial.removeEventListener('disconnect', handleDisconnect);
      }
    };
  }, [addMessage]);

  return {
    isConnected,
    connectedBoard,
    nameConnectedBoard,
    setBoardOutputQuiet,
    baudRate,
    portRef,
    readerRef,
    writerRef,
    textDecoderRef,
    baudRateRef,
    keepReadingRef,
    pipeAbortControllerRef,
    pipeToPromiseRef,
    connect,
    disconnect,
    setBaudRate,
    writeText,
    writeBytes,
    setChunkListener,
    pauseDecodedReadPipeline,
    resumeDecodedReadPipeline,
    reopenPort,
  };
}
