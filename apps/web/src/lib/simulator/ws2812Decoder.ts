/**
 * Decodes the WS2812 (NeoPixel) signal on one pin from the simulated CPU's pin edges.
 *
 * Each bit is one HIGH pulse: about 0.4 µs for a 0 and 0.8 µs for a 1 (at 800 kHz). A LOW gap of
 * more than about 50 µs latches the frame. Pulses much longer than a bit are ordinary digitalWrite
 * use and reset the decoder, so a pin that is not driving NeoPixels never produces frames.
 */
export interface Ws2812DecoderOptions {
  cpuFrequency: number;
}

export class Ws2812Decoder {
  private readonly bitThreshold: number;
  private readonly maxBitHigh: number;
  private readonly latchGap: number;
  private riseCycle: number | null = null;
  private lastFallCycle = 0;
  private currentByte = 0;
  private bitCount = 0;
  private bytes: number[] = [];

  constructor({ cpuFrequency }: Ws2812DecoderOptions) {
    const cyclesPerMicro = cpuFrequency / 1e6;
    this.bitThreshold = 0.6 * cyclesPerMicro;
    this.maxBitHigh = 1.6 * cyclesPerMicro;
    this.latchGap = 50 * cyclesPerMicro;
  }

  /** True while bits are arriving (so callers can skip per-edge work for this pin). */
  get active() {
    return this.bytes.length > 0 || this.bitCount > 0;
  }

  /** Feed an edge. Returns a finished frame (GRB bytes) when a new burst starts after a latch gap. */
  edge(high: boolean, cycle: number): number[] | null {
    let finished: number[] | null = null;
    if (high) {
      if (this.active && cycle - this.lastFallCycle > this.latchGap) {
        finished = this.takeFrame();
      }
      this.riseCycle = cycle;
      return finished;
    }

    if (this.riseCycle === null) return null;
    const width = cycle - this.riseCycle;
    this.riseCycle = null;
    this.lastFallCycle = cycle;
    if (width > this.maxBitHigh) {
      this.reset();
      return null;
    }
    this.currentByte = (this.currentByte << 1) | (width > this.bitThreshold ? 1 : 0);
    this.bitCount += 1;
    if (this.bitCount === 8) {
      this.bytes.push(this.currentByte & 0xff);
      this.currentByte = 0;
      this.bitCount = 0;
    }
    return null;
  }

  /** Call regularly: returns the frame once the line has stayed LOW long enough to latch. */
  poll(cycle: number): number[] | null {
    if (this.riseCycle === null && this.bytes.length > 0 && cycle - this.lastFallCycle > this.latchGap) {
      return this.takeFrame();
    }
    return null;
  }

  private takeFrame() {
    const frame = this.bytes;
    this.reset();
    return frame.length >= 3 ? frame : null;
  }

  private reset() {
    this.bytes = [];
    this.currentByte = 0;
    this.bitCount = 0;
  }
}

/** GRB byte stream to "#rrggbb" colours, one per pixel. */
export function ws2812FrameToColors(frame: number[]): string[] {
  const colors: string[] = [];
  for (let index = 0; index + 2 < frame.length; index += 3) {
    const [g, r, b] = [frame[index], frame[index + 1], frame[index + 2]];
    colors.push(`#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`);
  }
  return colors;
}
