import { useCallback, useState } from 'react';
import { Duplex } from 'stream-browserify';
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
  'Arduino Uno': [{ baudRate: 115200 }],
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
      let streamBridge: InstanceType<typeof Duplex> | null = null;

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

        // Pulse DTR/RTS: on Uno/Nano this resets the chip into its bootloader for about a second.
        const serialPortWithSignals = port as SerialPort & {
          setSignals?: (signals: { dataTerminalReady: boolean; requestToSend: boolean }) => Promise<void>;
        };
        await serialPortWithSignals.setSignals?.({ dataTerminalReady: false, requestToSend: false });
        await sleep(250);
        await serialPortWithSignals.setSignals?.({ dataTerminalReady: true, requestToSend: true });
        await sleep(50);
        await serialPortWithSignals.setSignals?.({ dataTerminalReady: false, requestToSend: false });
        await sleep(50);

        await transport.reopenPort(settings.baudRate);

        const flashingPort = transport.portRef.current;
        if (!flashingPort?.readable || !flashingPort.writable) {
          throw new Error('Serial port is not ready for flashing.');
        }

        rawReader = flashingPort.readable.getReader();
        rawWriter = flashingPort.writable.getWriter();
        const writer = rawWriter;
        const reader = rawReader;

        const bridge = new Duplex({
          read() {
            // The STK500 library pulls data from the stream; reads are pushed from the loop below.
          },
          write(chunk: Uint8Array, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
            writer.write(chunk).then(() => callback()).catch((error) => callback(error));
          },
        });
        streamBridge = bridge;

        void (async () => {
          while (keepReadingBridge) {
            try {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) bridge.push(Buffer.from(value));
            } catch {
              break;
            }
          }
        })();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the library types expect a Node stream
        const stk = new STK500(bridge as any, { name: 'Arduino', baudRate: settings.baudRate, ...ATMEGA328P, timeout: 400 });
        let lastReported = -1;
        await stk.bootload(hexData, (status, percentage) => {
          const step = Math.floor(percentage / 25) * 25;
          if (step > lastReported) {
            lastReported = step;
            addMessage('system', `Upload progress: ${status} ${step}%`);
          }
        });
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
              addMessage('system', `Trying again for a board with the ${settings.label} (${settings.baudRate} baud)...`);
            }
            await flashOnce(hexData, settings);
            addMessage('system', 'Upload complete. The board is restarting with your program.');
            return true;
          } catch (error) {
            lastError = error as Error;
          }
        }

        addMessage('error', explainUploadError(lastError?.message ?? 'unknown error', board));
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
