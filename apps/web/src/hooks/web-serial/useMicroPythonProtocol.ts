import { useCallback, useEffect, useRef } from 'react';
import type { SerialMessageSink } from './types';
import type { SerialTransportController } from './useSerialTransport';
import {
  CTRL_A,
  CTRL_B,
  CTRL_C,
  CTRL_D,
  describeMicroPythonError,
  parseRawReplReply,
  type RawReplReply,
} from '@/lib/serial/rawRepl';
import { parseMicroPythonBanner, type MicroPythonBanner } from '@/lib/serial/boardIdentity';

interface UseMicroPythonProtocolOptions {
  addMessage: SerialMessageSink;
  transport: Pick<SerialTransportController, 'portRef' | 'setBoardOutputQuiet' | 'setChunkListener' | 'writeBytes'>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// These read the open port (a ref), not React's isConnected, so they work straight after connect()
// in the same click, before the next render.
export function useMicroPythonProtocol({ addMessage, transport }: UseMicroPythonProtocolOptions) {
  const outputCaptureRef = useRef<{
    active: boolean;
    buffer: string;
    onComplete: ((reply: RawReplReply) => void) | null;
  }>({ active: false, buffer: '', onComplete: null });
  const bannerWatchRef = useRef<{ buffer: string; onBanner: ((banner: MicroPythonBanner) => void) | null }>({
    buffer: '',
    onBanner: null,
  });

  const handleIncomingChunk = useCallback((chunk: string) => {
    const watch = bannerWatchRef.current;
    if (watch.onBanner) {
      watch.buffer += chunk;
      const banner = parseMicroPythonBanner(watch.buffer);
      if (banner) {
        const onBanner = watch.onBanner;
        bannerWatchRef.current = { buffer: '', onBanner: null };
        onBanner(banner);
      }
    }

    if (!outputCaptureRef.current.active) {
      return;
    }

    outputCaptureRef.current.buffer += chunk;
    const reply = parseRawReplReply(outputCaptureRef.current.buffer);
    if (!reply) {
      return;
    }

    outputCaptureRef.current.active = false;
    const onComplete = outputCaptureRef.current.onComplete;
    outputCaptureRef.current.onComplete = null;
    onComplete?.(reply);
  }, []);

  useEffect(() => {
    transport.setChunkListener(handleIncomingChunk);
    return () => {
      transport.setChunkListener(null);
    };
  }, [handleIncomingChunk, transport]);

  const executeMicroPythonRaw = useCallback(async (code: string) => {
    if (!transport.portRef.current) {
      addMessage('error', 'Cannot execute: Board not connected.');
      return;
    }

    addMessage('system', 'Uploading to board (Raw REPL)...');

    try {
      await transport.writeBytes(new Uint8Array([CTRL_C, CTRL_C]));
      await sleep(100);
      await transport.writeBytes(new Uint8Array([CTRL_A]));
      await sleep(50);

      const encoder = new TextEncoder();
      await transport.writeBytes(encoder.encode(code));
      await transport.writeBytes(new Uint8Array([CTRL_D]));
      transport.setBoardOutputQuiet(false); // from here on it is the program's output
      await sleep(100);
      await transport.writeBytes(new Uint8Array([CTRL_B]));
    } catch (error) {
      transport.setBoardOutputQuiet(false);
      addMessage('error', `Execution failed: ${(error as Error).message}`);
    }
  }, [addMessage, transport]);

  /**
   * Asks a board at the ">>>" prompt to print its banner (Ctrl-B does that) and reads which board
   * it is. Resolves null if no banner comes, e.g. while a program runs: it is not stopped for this.
   * Reads the port directly, so it works straight after connect(), before the next render.
   */
  const identifyMicroPythonBoard = useCallback(async (timeoutMs: number = 1200): Promise<MicroPythonBanner | null> => {
    return new Promise<MicroPythonBanner | null>((resolve) => {
      const timeoutId = setTimeout(() => {
        bannerWatchRef.current = { buffer: '', onBanner: null };
        resolve(null);
      }, timeoutMs);
      bannerWatchRef.current = {
        buffer: '',
        onBanner: (banner) => {
          clearTimeout(timeoutId);
          resolve(banner);
        },
      };
      void transport.writeBytes(new Uint8Array([CTRL_B]));
    });
  }, [transport]);

  /** Soft-reboots the board from the normal prompt, so it runs boot.py and main.py as it does when switched on. */
  const restartMicroPython = useCallback(async () => {
    if (!transport.portRef.current) {
      throw new Error('Board not connected.');
    }

    await transport.writeBytes(new Uint8Array([CTRL_C]));
    await sleep(50);
    await transport.writeBytes(new Uint8Array([CTRL_B]));
    await sleep(150);
    transport.setBoardOutputQuiet(false); // "MPY: soft reboot", then whatever main.py prints
    await transport.writeBytes(new Uint8Array([CTRL_D]));
  }, [transport]);

  /** Runs code in the raw REPL and resolves with what it printed; rejects with the error line if it failed. */
  const runMicroPythonCommand = useCallback(async (code: string, timeoutMs: number = 8000): Promise<string> => {
    if (!transport.portRef.current) {
      throw new Error('Board not connected.');
    }

    return new Promise<string>(async (resolve, reject) => {
      outputCaptureRef.current = {
        active: true,
        buffer: '',
        onComplete: async (reply: RawReplReply) => {
          clearTimeout(timeoutId);
          try {
            await transport.writeBytes(new Uint8Array([CTRL_B]));
          } catch {
            // Leaving the raw REPL is a courtesy: the next command enters it again anyway.
          }

          if (reply.error.trim()) {
            reject(new Error(describeMicroPythonError(reply.error)));
          } else {
            resolve(reply.output);
          }
        },
      };

      const timeoutId = setTimeout(() => {
        outputCaptureRef.current.active = false;
        outputCaptureRef.current.onComplete = null;
        reject(new Error('The board did not answer. Check that it runs MicroPython, then unplug it and plug it back in.'));
      }, timeoutMs);

      try {
        await transport.writeBytes(new Uint8Array([CTRL_C, CTRL_C]));
        await sleep(100);
        await transport.writeBytes(new Uint8Array([CTRL_A]));
        await sleep(50);

        const encoder = new TextEncoder();
        await transport.writeBytes(encoder.encode(code));
        await transport.writeBytes(new Uint8Array([CTRL_D]));
      } catch (error) {
        clearTimeout(timeoutId);
        outputCaptureRef.current.active = false;
        outputCaptureRef.current.onComplete = null;
        reject(error);
      }
    });
  }, [transport]);

  return {
    executeMicroPythonRaw,
    identifyMicroPythonBoard,
    restartMicroPython,
    runMicroPythonCommand,
  };
}
