import { useCallback, useState } from 'react';
import { createStkBridge, type StkBridge } from '@/lib/serial/stkBridge';
import STK500 from 'stk500-esm';
import type { SerialMessageSink } from './types';
import type { SerialTransportController } from './useSerialTransport';

interface UseArduinoFlashOptions {
  addMessage: SerialMessageSink;
  transport: Pick<
    SerialTransportController,
    | 'portRef'
    | 'baudRateRef'
    | 'pauseDecodedReadPipeline'
    | 'resumeDecodedReadPipeline'
    | 'reopenPort'
  >;
}

interface BootloaderSettings {
  /** Shown when this attempt runs, e.g. "old bootloader". */
  label?: string;
  baudRate: number;
}

const ATMEGA328P = { signature: new Uint8Array([0x1e, 0x95, 0x0f]), pageSize: 128 };

/**
 * STK500v1 boards and the bootloader speeds to try, in order. Nano clones often still have the
 * "old bootloader", which listens at 57600 baud instead of 115200.
 */
const STK500_BOARDS: Record<string, BootloaderSettings[]> = {
  // A second try covers a reset that lands a moment too early or late.
  'Arduino Uno': [{ baudRate: 115200 }, { label: 'second try', baudRate: 115200 }],
  'Arduino Nano': [{ baudRate: 115200 }, { label: 'old bootloader', baudRate: 57600 }],
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Turns uploader errors into something a learner can act on. */
export function explainUploadError(message: string, board: string) {
  if (/Sync failed|receiveData timeout|timeout/i.test(message)) {
    return `The ${board} did not answer. Check that the USB cable is plugged in firmly (some cables only charge), that you picked the right port, that the board chosen in the app matches the real board, and that no other program such as the Arduino IDE has the board open. Then try Upload again.`;
  }
  if (/Failed to open|Access denied|busy|in use|NetworkError/i.test(message)) {
    return 'The board is busy. Close any other program that might be using it (the Arduino IDE Serial Monitor, another browser tab), unplug the board, plug it back in, and try again.';
  }
  if (/disappeared|disconnected|not ready/i.test(message)) {
    return 'The board was unplugged or stopped responding during the upload. Plug it back in, connect again, and retry.';
  }
  return `The upload did not finish (${message}). Unplug the board, plug it back in, and try again.`;
}

export function useArduinoFlash({ addMessage, transport }: UseArduinoFlashOptions) {
  const [isFlashing, setIsFlashing] = useState(false);

  /** Resets the board into its bootloader and sends the program at one bootloader speed. */
  const flashOnce = useCallback(
    async (hexData: string, settings: BootloaderSettings) => {
      let keepReadingBridge = true;
      let rawReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let rawWriter: WritableStreamDefaultWriter<Uint8Array> | undefined;
      let streamBridge: StkBridge | null = null;
      let readError = '';

      const releaseRawStreams = async () => {
        keepReadingBridge = false;
        streamBridge?.destroy();
        await rawReader?.cancel().catch(() => undefined);
        try {
          rawReader?.releaseLock();
        } catch {
          // Already released.
        }
        try {
          rawWriter?.releaseLock();
        } catch {
          // Already released.
        }
      };

      try {
        const port = transport.portRef.current;
        if (!port) {
          throw new Error('Port disappeared before flashing could start.');
        }

        // Same order as the official uploader (avrdude's "arduino" programmer): open the port at the
        // bootloader speed first, then reset the board through DTR/RTS on that open port. Reopening
        // after the reset can reset the board again at an unknown moment and miss its ~1 s window.
        await transport.reopenPort(settings.baudRate);

        const flashingPort = transport.portRef.current;
        if (!flashingPort?.readable || !flashingPort.writable) {
          throw new Error('Serial port is not ready for flashing.');
        }

        rawReader = flashingPort.readable.getReader();
        rawWriter = flashingPort.writable.getWriter();
        const writer = rawWriter;
        const reader = rawReader;

        const bridge = createStkBridge((bytes) => writer.write(bytes));
        streamBridge = bridge;

        // Bytes from before the reset (the old program printing) would confuse the first sync.
        let discardIncoming = true;
        void (async () => {
          while (keepReadingBridge) {
            try {
              const { value, done } = await reader.read();
              if (done) break;
              if (value && !discardIncoming) bridge.deliver(value);
            } catch (error) {
              readError = (error as Error)?.message || String(error);
              break;
            }
          }
        })();

        const portWithSignals = flashingPort as SerialPort & {
          setSignals?: (signals: { dataTerminalReady: boolean; requestToSend: boolean }) => Promise<void>;
        };
        await portWithSignals.setSignals?.({ dataTerminalReady: false, requestToSend: false });
        await sleep(250);
        await portWithSignals.setSignals?.({ dataTerminalReady: true, requestToSend: true });
        await sleep(50);
        discardIncoming = false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the library types expect a Node stream
        const stk = new STK500(bridge.stream as any, { name: 'Arduino', baudRate: settings.baudRate, ...ATMEGA328P, timeout: 400 }, { quiet: true });
        let lastReported = -1;
        await stk.bootload(hexData, (status, percentage) => {
          const step = Math.floor(percentage / 25) * 25;
          if (step > lastReported) {
            lastReported = step;
            addMessage('system', `Upload progress: ${status} ${step}%`);
          }
        });
      } catch (error) {
        const wire = streamBridge?.wire ?? { sent: 0, received: 0, firstBytes: [] };
        const bytes = wire.firstBytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
        const detail = `sent ${wire.sent} bytes, received ${wire.received}${bytes ? ` (${bytes})` : ''}${readError ? `, read error: ${readError}` : ''}`;
        throw new Error(`${(error as Error).message} [${detail}]`);
      } finally {
        await releaseRawStreams();
      }
    },
    [addMessage, transport]
  );

  /** Uploads a compiled program. Returns true when the board accepted it. */
  const flashArduino = useCallback(
    async (hexData: string, board = 'Arduino Uno') => {
      if (typeof window === 'undefined' || !('serial' in navigator)) {
        return false;
      }

      if (!transport.portRef.current) {
        addMessage('error', 'Cannot upload: no board is connected.');
        return false;
      }

      const attempts = STK500_BOARDS[board] ?? STK500_BOARDS['Arduino Uno'];
      let lastError: Error | null = null;

      setIsFlashing(true);
      addMessage('system', `Uploading to the ${board}...`);
      await transport.pauseDecodedReadPipeline();

      try {
        for (const settings of attempts) {
          try {
            if (settings.label) {
              addMessage('system', settings.label === 'second try' ? 'No answer yet. Resetting the board and trying once more...' : `Trying again for a board with the ${settings.label} (${settings.baudRate} baud)...`);
            }
            await flashOnce(hexData, settings);
            addMessage('system', 'Upload complete. The board is restarting with your program.');
            return true;
          } catch (error) {
            lastError = error as Error;
          }
        }

        addMessage('error', explainUploadError(lastError?.message ?? 'unknown error', board));
        // For whoever helps the learner: what the uploader saw.
        addMessage('system', `Upload details: ${lastError?.message ?? 'unknown error'}`);
        return false;
      } finally {
        // Back to the Serial Monitor at the learner's baud rate.
        try {
          if (transport.portRef.current) {
            await transport.reopenPort(transport.baudRateRef.current);
            await transport.resumeDecodedReadPipeline();
          }
        } catch {
          addMessage('error', 'The Serial Monitor could not reconnect after the upload. Click Connect to open it again.');
        }
        setIsFlashing(false);
      }
    },
    [addMessage, flashOnce, transport]
  );

  return {
    isFlashing,
    flashArduino,
  };
}
