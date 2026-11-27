/**
 * Decodes a 16x2 character LCD driven over I2C (an HD44780 behind a PCF8574 backpack, as used by
 * the LiquidCrystal_I2C library) from the bytes the sketch writes to the backpack.
 *
 * Backpack bits: P0 = RS, P1 = RW, P2 = EN, P3 = backlight, P4-P7 = D4-D7. The HD44780 reads the
 * data lines when EN falls. It starts in 8-bit mode (each pulse is a whole command, upper nibble
 * only) until a "function set" asks for 4-bit mode, after which pairs of pulses make a byte.
 */
export interface LcdState {
  lines: [string, string];
  backlight: boolean;
  displayOn: boolean;
}

const COLUMNS = 16;
const ROW_ADDRESSES = [0x00, 0x40];

export class LcdI2cDecoder {
  private previous = 0;
  private fourBitMode = false;
  private pendingHigh: number | null = null;
  private address = 0;
  private writingCgram = false;
  private readonly ddram = new Uint8Array(0x80).fill(0x20);
  private backlight = false;
  private displayOn = false;
  private changed = false;

  /** Feed one byte written to the backpack. */
  write(value: number) {
    const backlight = (value & 0x08) !== 0;
    if (backlight !== this.backlight) {
      this.backlight = backlight;
      this.changed = true;
    }
    const enFell = (this.previous & 0x04) !== 0 && (value & 0x04) === 0;
    if (enFell) {
      this.latch(this.previous);
    }
    this.previous = value;
  }

  /** The current screen if it changed since the last call, else null. */
  takeChange(): LcdState | null {
    if (!this.changed) return null;
    this.changed = false;
    return this.state();
  }

  state(): LcdState {
    const line = (row: number) =>
      String.fromCharCode(...Array.from(this.ddram.slice(ROW_ADDRESSES[row], ROW_ADDRESSES[row] + COLUMNS)).map((code) => (code >= 0x20 && code < 0x7f ? code : 0x20)));
    return { lines: [line(0), line(1)], backlight: this.backlight, displayOn: this.displayOn };
  }

  private latch(sample: number) {
    const rs = (sample & 0x01) !== 0;
    const nibble = (sample >> 4) & 0x0f;
    if (!this.fourBitMode) {
      this.handle(rs, nibble << 4);
      return;
    }
    if (this.pendingHigh === null) {
      this.pendingHigh = nibble;
      return;
    }
    const byte = (this.pendingHigh << 4) | nibble;
    this.pendingHigh = null;
    this.handle(rs, byte);
  }

  private handle(isData: boolean, byte: number) {
    if (isData) {
      if (this.writingCgram) return;
      this.ddram[this.address & 0x7f] = byte;
      this.address = (this.address + 1) & 0x7f;
      this.changed = true;
      return;
    }

    if (byte & 0x80) {
      this.address = byte & 0x7f;
      this.writingCgram = false;
    } else if (byte & 0x40) {
      this.writingCgram = true;
    } else if (byte & 0x20) {
      // Function set: DL (bit 4) = 0 means 4-bit mode.
      const wantsFourBit = (byte & 0x10) === 0;
      if (wantsFourBit !== this.fourBitMode) {
        this.fourBitMode = wantsFourBit;
        this.pendingHigh = null;
      }
    } else if (byte & 0x08) {
      this.displayOn = (byte & 0x04) !== 0;
      this.changed = true;
    } else if (byte === 0x01) {
      this.ddram.fill(0x20);
      this.address = 0;
      this.writingCgram = false;
      this.changed = true;
    } else if ((byte & 0xfe) === 0x02) {
      this.address = 0;
      this.writingCgram = false;
    }
  }
}

/** I2C addresses the common backpacks use. */
export const LCD_I2C_ADDRESSES = [0x27, 0x3f] as const;
