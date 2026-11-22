import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { SerialChunkListener, SerialMessageSink } from './types';

export interface SerialTransportController {
  isConnected: boolean;
  baudRate: number;
  portRef: MutableRefObject<SerialPort | null>;
  readerRef: MutableRefObject<ReadableStreamDefaultReader<string> | null>;
  writerRef: MutableRefObject<WritableStreamDefaultWriter<Uint8Array> | null>;
  textDecoderRef: MutableRefObject<TextDecoderStream | null>;
  baudRateRef: MutableRefObject<number>;
  keepReadingRef: MutableRefObject<boolean>;
  pipeAbortControllerRef: MutableRefObject<AbortController | null>;
  pipeToPromiseRef: MutableRefObject<Promise<void> | null>;
  connect: (baudRate?: number) => Promise<void>;
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
}

function normalizeBaudRate(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 9600;
}

export function useSerialTransport({ addMessage }: UseSerialTransportOptions): SerialTransportController {
  const [isConnected, setIsConnected] = useState(false);
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

  const readLoop = useCallback(async () => {
    let lineBuffer = '';

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

        lineBuffer += value;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        lines.forEach((line) => {
          if (line.trim() !== '' || line === '\r') {
            addMessage('app', line.replace(/\r$/, ''));
          }
        });
      } catch (error) {
        if (keepReadingRef.current) {
          addMessage('error', `Read error: ${(error as Error).message}`);
        }
        break;
      }
    }
  }, [addMessage]);

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

  const connect = useCallback(async (requestedBaudRate?: number) => {
    if (!(typeof navigator !== 'undefined' && 'serial' in navigator)) {
      addMessage('error', 'Web Serial API is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const nextBaudRate = normalizeBaudRate(requestedBaudRate ?? baudRateRef.current);

    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: nextBaudRate });

      portRef.current = port;
      baudRateRef.current = nextBaudRate;
      setBaudRateState(nextBaudRate);
      setIsConnected(true);

      await resumeDecodedReadPipeline();

      const info = port.getInfo();
      addMessage('system', `Connected to device (VID: ${info.usbVendorId}, PID: ${info.usbProductId}) at ${nextBaudRate} baud`);
    } catch (error) {
      const serialError = error as Error;
      if (serialError.name === 'NotFoundError') {
        addMessage('error', 'No port selected.');
      } else {
        addMessage('error', `Connection failed: ${serialError.message}`);
      }
    }
  }, [addMessage, resumeDecodedReadPipeline]);

  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;

    try {
      await pauseDecodedReadPipeline();

      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }

      setIsConnected(false);
      addMessage('system', 'Disconnected from device.');
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

  const setChunkListener = useCallback((listener: SerialChunkListener) => {
    chunkListenerRef.current = listener;
  }, []);

  useEffect(() => {
    const handleDisconnect = () => {
      setIsConnected(false);
      keepReadingRef.current = false;
      portRef.current = null;
      readerRef.current = null;
      writerRef.current = null;
      textDecoderRef.current = null;
      pipeAbortControllerRef.current = null;
      pipeToPromiseRef.current = null;
      addMessage('error', 'Device disconnected unexpectedly.');
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
