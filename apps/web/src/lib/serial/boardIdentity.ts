// Which board is on the other end of a serial port, in words a learner recognises.
//
// The browser only tells us the USB vendor and product IDs, and Chrome's port list shows names such
// as "USB Serial Device (COM21)". MicroPython boards say exactly what they are in their banner
// ("MicroPython v1.29.0 on 2026-08-24; Raspberry Pi Pico 2 W with RP2350").

export type UsbBoardFamily = 'arduino' | 'raspberry' | 'esp';

export interface UsbBoardDescription {
  /** For example "Arduino Uno" or "Raspberry Pi Pico running MicroPython" (no "a", so it fits a status line). */
  name: string;
  /** Set only when the USB IDs settle it: a CH340 chip can sit on an Uno copy or an ESP32. */
  family: UsbBoardFamily | null;
}

interface UsbPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

const hex = (value: number) => value.toString(16).padStart(4, '0');

const ARDUINO_PRODUCTS: Record<number, string> = {
  0x0001: 'Arduino Uno',
  0x0043: 'Arduino Uno',
  0x0243: 'Arduino Uno',
  0x0069: 'Arduino Uno R4 Minima',
  0x1002: 'Arduino Uno R4 WiFi',
  0x0010: 'Arduino Mega 2560',
  0x0042: 'Arduino Mega 2560',
  0x0036: 'Arduino Leonardo',
  0x8036: 'Arduino Leonardo',
  0x0037: 'Arduino Micro',
  0x8037: 'Arduino Micro',
  0x0058: 'Arduino Nano Every',
};

export function describeUsbBoard(info: UsbPortInfo): UsbBoardDescription {
  const vendor = info.usbVendorId;
  const product = info.usbProductId ?? -1;
  if (typeof vendor !== 'number') {
    return { name: 'serial port without USB details (Bluetooth or built in)', family: null };
  }

  switch (vendor) {
    case 0x2341:
    case 0x2a03:
      return { name: ARDUINO_PRODUCTS[product] ?? 'Arduino board', family: 'arduino' };
    case 0x2e8a:
      if (product === 0x0005) return { name: 'Raspberry Pi Pico running MicroPython', family: 'raspberry' };
      if (product === 0x0003 || product === 0x000f) return { name: 'Raspberry Pi Pico in install mode', family: 'raspberry' };
      return { name: 'Raspberry Pi Pico (not running MicroPython)', family: 'raspberry' };
    case 0x303a:
      return { name: 'ESP32 board', family: 'esp' };
    case 0x1a86:
      return { name: 'board with a CH340 USB chip (an Uno or Nano copy, or an ESP32)', family: null };
    case 0x10c4:
      return { name: 'board with a CP210x USB chip (often an ESP32)', family: null };
    case 0x0403:
      return { name: 'board with an FTDI USB chip', family: null };
    case 0x067b:
      return { name: 'Prolific USB-serial adapter', family: null };
    case 0x239a:
      return { name: 'Adafruit board', family: null };
    case 0x1b4f:
      return { name: 'SparkFun board', family: null };
    default:
      return { name: `USB serial device (${hex(vendor)}:${hex(product < 0 ? 0 : product)})`, family: null };
  }
}

export interface MicroPythonBanner {
  /** "v1.29.0" */
  version: string;
  /** "Raspberry Pi Pico 2 W with RP2350" */
  machine: string;
}

/** Finds MicroPython's start-up banner in what the board printed. */
export function parseMicroPythonBanner(text: string): MicroPythonBanner | null {
  const match = /MicroPython (v\S+) on [^;\r\n]+; ([^\r\n]+?)\s*\r?\n/.exec(text);
  return match ? { version: match[1], machine: match[2] } : null;
}

const simplify = (name: string) => name.toLowerCase().replace(/ with .*$/, '').replace(/[^a-z0-9]/g, '');

/**
 * Whether the board a MicroPython banner names is the project's board: true, false, or null when
 * there is no way to tell (a board this check does not know).
 */
export function micropythonBoardMatches(machine: string, projectBoard: string): boolean | null {
  const project = simplify(projectBoard);
  const board = machine.toLowerCase();
  if (project.startsWith('raspberrypipico')) {
    return board.includes('pico') ? simplify(machine) === project : false;
  }
  if (project === 'esp32' || project === 'esp8266') {
    return board.includes(project);
  }
  return null;
}
