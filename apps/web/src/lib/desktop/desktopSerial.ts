/**
 * `navigator.serial` for the desktop app.
 *
 * WebView2 has no Web Serial, so the desktop app provides the small part of it this IDE uses
 * (hooks/web-serial/*), backed by native serial ports in Rust (serial_* commands in
 * apps/desktop/src-tauri/src/main.rs). Uploading (STK500 flashing), the serial monitor and
 * MicroPython file sync then run through exactly the same code as in the browser.
 *
 * Behaviour copied from the Web Serial spec where the IDE depends on it:
 * - `readable` / `writable` are getters that return a fresh stream once the previous one was
 *   cancelled or closed while the port is open (the flasher cancels the monitor's reader, reopens
 *   the port at 115200 baud and takes a new reader).
 * - requestPort() rejects with a NotFoundError DOMException when the user cancels.
 * - navigator.serial fires `disconnect` when an open port goes away (e.g. USB unplugged).
 */
import { desktopErrorMessage, desktopInvoke, desktopListen } from './runtime';
import { isBoardUsbVendor } from '@/lib/serial/boardUsbIds';

type NativePortInfo = {
  path: string;
  label: string;
  usbVendorId: number | null;
  usbProductId: number | null;
};

type SerialDataEvent = { id: number; data: number[] };
type SerialClosedEvent = { id: number; reason: string };

const openPorts = new Map<number, DesktopSerialPort>();

class DesktopSerialPort extends EventTarget {
  private portId: number | null = null;
  private readableStream: ReadableStream<Uint8Array> | null = null;
  private readController: ReadableStreamDefaultController<Uint8Array> | null = null;
  private writableStream: WritableStream<Uint8Array> | null = null;

  constructor(private readonly info: NativePortInfo, private readonly onLost: () => void) {
    super();
  }

  get readable(): ReadableStream<Uint8Array> | null {
    if (this.portId === null) return null;
    if (!this.readableStream) {
      this.readableStream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          this.readController = controller;
        },
        cancel: () => {
          this.readableStream = null;
          this.readController = null;
        },
      });
    }
    return this.readableStream;
  }

  get writable(): WritableStream<Uint8Array> | null {
    if (this.portId === null) return null;
    if (!this.writableStream) {
      const id = this.portId;
      this.writableStream = new WritableStream<Uint8Array>({
        write: async (chunk) => {
          await desktopInvoke<void>('serial_write', { id, data: Array.from(chunk) });
        },
        close: () => {
          this.writableStream = null;
        },
        abort: () => {
          this.writableStream = null;
        },
      });
    }
    return this.writableStream;
  }

  getInfo() {
    return {
      usbVendorId: this.info.usbVendorId ?? undefined,
      usbProductId: this.info.usbProductId ?? undefined,
    };
  }

  async open(options: { baudRate: number }) {
    if (this.portId !== null) {
      throw new DOMException('The port is already open.', 'InvalidStateError');
    }
    try {
      const id = await desktopInvoke<number>('serial_open', { path: this.info.path, baudRate: options.baudRate });
      this.portId = id;
      openPorts.set(id, this);
    } catch (error) {
      throw new DOMException(desktopErrorMessage(error, `Could not open ${this.info.path}.`), 'NetworkError');
    }
  }

  async setSignals(signals: { dataTerminalReady?: boolean; requestToSend?: boolean }) {
    if (this.portId === null) {
      throw new DOMException('The port is not open.', 'InvalidStateError');
    }
    await desktopInvoke<void>('serial_set_signals', {
      id: this.portId,
      dtr: signals.dataTerminalReady ?? null,
      rts: signals.requestToSend ?? null,
    });
  }

  async close() {
    const id = this.portId;
    if (id === null) return;
    // Forget the port first so the reader thread's "closed" event is not reported as a disconnect.
    openPorts.delete(id);
    this.portId = null;
    this.endStreams();
    await desktopInvoke<void>('serial_close', { id });
  }

  async forget() {
    await this.close();
  }

  /** Bytes from the native reader thread. Dropped while nobody holds a readable stream. */
  receive(bytes: number[]) {
    try {
      this.readController?.enqueue(new Uint8Array(bytes));
    } catch {
      // The stream was closed or cancelled between events.
    }
  }

  /** The native port failed (unplugged, driver error). */
  lose(reason: string) {
    this.portId = null;
    try {
      this.readController?.error(new DOMException(reason || 'The device has been lost.', 'NetworkError'));
    } catch {
      // Already errored or closed.
    }
    this.readableStream = null;
    this.readController = null;
    this.writableStream = null;
    this.onLost();
  }

  private endStreams() {
    try {
      this.readController?.close();
    } catch {
      // Already cancelled.
    }
    this.readableStream = null;
    this.readController = null;
    this.writableStream = null;
  }
}

class DesktopSerial extends EventTarget {
  async requestPort(options?: { filters?: Array<{ usbVendorId?: number }> }) {
    // With filters (as the app passes them), boards come first and other ports wait behind a button.
    const info = await choosePort(Boolean(options?.filters?.length));
    return new DesktopSerialPort(info, () => this.dispatchEvent(new Event('disconnect')));
  }

  async getPorts() {
    // Ports are not remembered between sessions; every connection goes through requestPort().
    return [];
  }
}

// --- Port picker ----------------------------------------------------------------------------

const PICKER_STYLES = `
.sticial-port-picker{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(15,10,35,.55);font-family:inherit}
.sticial-port-picker__card{width:min(420px,calc(100% - 32px));border-radius:18px;background:#fff;color:#1e1638;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);padding:20px}
.sticial-port-picker h2{margin:0;font-size:17px;font-weight:700}
.sticial-port-picker p{margin:6px 0 14px;font-size:13px;line-height:1.5;color:#5b5275}
.sticial-port-picker ul{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:8px;max-height:260px;overflow:auto}
.sticial-port-picker__port{width:100%;text-align:left;border:1px solid #ddd6f3;border-radius:12px;background:#faf8ff;padding:10px 12px;cursor:pointer;font:inherit;color:inherit}
.sticial-port-picker__port:hover,.sticial-port-picker__port:focus-visible{border-color:#7641ea;background:#f1ebff;outline:none}
.sticial-port-picker__port strong{display:block;font-size:14px}
.sticial-port-picker__port span{display:block;font-size:12px;color:#5b5275;margin-top:2px}
.sticial-port-picker__empty{font-size:13px;color:#5b5275;border:1px dashed #ddd6f3;border-radius:12px;padding:12px}
.sticial-port-picker__actions{display:flex;justify-content:flex-end;gap:8px}
.sticial-port-picker__actions button{border-radius:10px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #ddd6f3;background:#fff;color:#1e1638}
.sticial-port-picker__actions button:focus-visible{outline:2px solid #7641ea;outline-offset:2px}
`;

function choosePort(boardsFirst: boolean): Promise<NativePortInfo> {
  let showOtherPorts = !boardsFirst;
  return new Promise((resolve, reject) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overlay = document.createElement('div');
    overlay.className = 'sticial-port-picker';
    overlay.innerHTML = `
      <style>${PICKER_STYLES}</style>
      <div class="sticial-port-picker__card" role="dialog" aria-modal="true" aria-labelledby="sticial-port-picker-title">
        <h2 id="sticial-port-picker-title">Choose your board</h2>
        <p>Plug the board into this computer with a USB cable, then pick its port.</p>
        <ul aria-live="polite"></ul>
        <div class="sticial-port-picker__actions">
          <button type="button" data-action="refresh">Refresh</button>
          <button type="button" data-action="cancel">Cancel</button>
        </div>
      </div>`;
    const list = overlay.querySelector('ul')!;

    const finish = (result: NativePortInfo | null) => {
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      previousFocus?.focus?.();
      if (result) resolve(result);
      else reject(new DOMException('No port selected by the user.', 'NotFoundError'));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    };

    const render = async () => {
      list.innerHTML = '<li class="sticial-port-picker__empty">Looking for boards…</li>';
      let ports: NativePortInfo[] = [];
      try {
        ports = await desktopInvoke<NativePortInfo[]>('serial_list');
      } catch (error) {
        list.innerHTML = '';
        const item = document.createElement('li');
        item.className = 'sticial-port-picker__empty';
        item.textContent = desktopErrorMessage(error, 'Could not list serial ports.');
        list.append(item);
        return;
      }
      list.innerHTML = '';
      const boardPorts = ports.filter((port) => isBoardUsbVendor(port.usbVendorId));
      const otherPorts = ports.filter((port) => !isBoardUsbVendor(port.usbVendorId));
      const shown = showOtherPorts ? [...boardPorts, ...otherPorts] : boardPorts;

      if (shown.length === 0) {
        const item = document.createElement('li');
        item.className = 'sticial-port-picker__empty';
        item.textContent = 'No boards found. Plug your board in with a USB cable, then press Refresh.';
        list.append(item);
      }
      for (const port of shown) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sticial-port-picker__port';
        const title = document.createElement('strong');
        title.textContent = port.label || port.path;
        const detail = document.createElement('span');
        detail.textContent = port.label && port.label !== port.path ? port.path : 'Serial port';
        button.append(title, detail);
        button.addEventListener('click', () => finish(port));
        item.append(button);
        list.append(item);
      }
      if (!showOtherPorts && otherPorts.length > 0) {
        const item = document.createElement('li');
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'sticial-port-picker__port';
        const title = document.createElement('strong');
        title.textContent = `Show other ports (${otherPorts.length})`;
        const detail = document.createElement('span');
        detail.textContent = 'Bluetooth and built-in ports. Use this if your board is not listed above.';
        more.append(title, detail);
        more.addEventListener('click', () => {
          showOtherPorts = true;
          void render();
        });
        item.append(more);
        list.append(item);
      }
      const firstButton = list.querySelector('button') as HTMLButtonElement | null;
      (firstButton ?? (overlay.querySelector('[data-action="refresh"]') as HTMLButtonElement)).focus();
    };

    overlay.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
      if (action === 'cancel' || event.target === overlay) finish(null);
      if (action === 'refresh') void render();
    });
    document.addEventListener('keydown', onKeyDown, true);
    document.body.append(overlay);
    void render();
  });
}

// --- Install ----------------------------------------------------------------------------------

let installed = false;

/** Provide navigator.serial in the desktop app. Safe to call more than once. */
export function installDesktopSerial() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const serial = new DesktopSerial();
  Object.defineProperty(navigator, 'serial', { value: serial, configurable: true });

  // A reload or page change forgets open ports while the app still holds them, which blocks the
  // board for every uploader (here, the Arduino IDE, the browser) until the app quits.
  void desktopInvoke<void>('serial_close_all').catch(() => undefined);

  void desktopListen<SerialDataEvent>('serial-data', ({ id, data }) => openPorts.get(id)?.receive(data));
  void desktopListen<SerialClosedEvent>('serial-closed', ({ id, reason }) => {
    const port = openPorts.get(id);
    if (!port) return;
    openPorts.delete(id);
    port.lose(reason);
  });
}
