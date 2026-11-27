/**
 * Measures the duty cycle of a pin driven by analogWrite (hardware PWM at about 490 or 980 Hz).
 * Slow toggling (blinking, servo pulses at 50 Hz) is not PWM and is left to the normal pin messages.
 */
export interface PwmTrackerOptions {
  cpuFrequency: number;
  /** Periods longer than this are not treated as PWM (default 1/300 s, so 50 Hz servo signals pass through). */
  maxPeriodSeconds?: number;
}

export class PwmTracker {
  private readonly maxPeriod: number;
  private lastRise: number | null = null;
  private lastFall: number | null = null;
  private highCycles: number | null = null;
  private period: number | null = null;
  private lastEdge = 0;
  private reported: number | null = null;

  constructor({ cpuFrequency, maxPeriodSeconds = 1 / 300 }: PwmTrackerOptions) {
    this.maxPeriod = cpuFrequency * maxPeriodSeconds;
  }

  edge(high: boolean, cycle: number) {
    if (high) {
      if (this.lastRise !== null) this.period = cycle - this.lastRise;
      this.lastRise = cycle;
    } else if (this.lastRise !== null) {
      this.highCycles = cycle - this.lastRise;
      this.lastFall = cycle;
    }
    this.lastEdge = cycle;
  }

  /** True while the pin is toggling fast enough to be PWM. */
  active(cycle: number) {
    return this.period !== null && this.period <= this.maxPeriod && cycle - this.lastEdge <= this.period * 3;
  }

  duty(): number | null {
    if (this.period === null || this.highCycles === null || this.period <= 0) return null;
    return Math.max(0, Math.min(1, this.highCycles / this.period));
  }

  /**
   * Call regularly. Returns the duty cycle when it changed noticeably, `null` once PWM has stopped
   * (after it was reported), or `undefined` when there is nothing new.
   */
  poll(cycle: number): number | null | undefined {
    if (this.active(cycle)) {
      const duty = this.duty();
      if (duty !== null && (this.reported === null || Math.abs(duty - this.reported) >= 0.01)) {
        this.reported = duty;
        return duty;
      }
      return undefined;
    }
    if (this.reported !== null) {
      this.reported = null;
      this.period = null;
      return null;
    }
    return undefined;
  }
}
