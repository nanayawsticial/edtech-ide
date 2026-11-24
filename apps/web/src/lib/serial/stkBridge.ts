import { Duplex } from 'stream-browserify';

/**
 * Connects the STK500 upload library (which expects a Node stream) to a Web Serial port.
 *
 * The library listens for a reply only after its write is confirmed. Through the desktop app's
 * native serial bridge the board's reply can arrive before that confirmation, and a reply emitted
 * with nobody listening would be lost (the first desktop upload test failed this way: the board
 * answered every sync with 14 10 but the library never saw it). So bytes that arrive while nobody
 * listens are held until a listener attaches, and leftovers are dropped when the next command goes
 * out, as avrdude drains before each command.
 *
 * Kept free of app imports so `scripts/validate-stk-bridge.mjs` can test it with Node.
 */
export interface StkBridge {
  /** The stream to hand to the STK500 library. */
  stream: InstanceType<typeof Duplex>;
  /** Pass bytes read from the board. */
  deliver: (bytes: Uint8Array) => void;
  /** What crossed the wire, for the "Upload details" line when an upload fails. */
  wire: { sent: number; received: number; firstBytes: number[] };
  destroy: () => void;
}

export function createStkBridge(write: (bytes: Uint8Array) => Promise<void>): StkBridge {
  const pending: Uint8Array[] = [];
  const wire = { sent: 0, received: 0, firstBytes: [] as number[] };

  const stream = new Duplex({
    read() {
      // The library pulls nothing; bytes are pushed as they arrive.
    },
    write(chunk: Uint8Array, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
      pending.length = 0;
      wire.sent += chunk.length;
      write(chunk).then(() => callback()).catch((error) => callback(error));
    },
  });

  const flushPending = () => {
    while (pending.length > 0 && stream.listenerCount('data') > 0) {
      stream.push(pending.shift());
    }
  };

  stream.on('newListener', (event: string | symbol) => {
    if (event === 'data') {
      // Runs once the listener is attached.
      queueMicrotask(flushPending);
    }
  });

  return {
    stream,
    wire,
    deliver(bytes) {
      wire.received += bytes.length;
      if (wire.firstBytes.length < 12) {
        wire.firstBytes.push(...Array.from(bytes).slice(0, 12 - wire.firstBytes.length));
      }
      if (stream.listenerCount('data') > 0) {
        stream.push(bytes);
      } else {
        pending.push(bytes);
      }
    },
    destroy() {
      pending.length = 0;
      stream.destroy();
    },
  };
}
