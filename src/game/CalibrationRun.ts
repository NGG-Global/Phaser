import { calibrationFrom, CALIBRATION_TAPS } from './settings';

/** Slower than gameplay so common Bluetooth delays cannot wrap onto a neighbouring beat. */
export const CALIBRATION = {
  bpm: 60,
  leadBeats: 4,
  measureBeats: 12,
  startLeadSec: 0.6,
  acceptanceRatio: 0.4,
  maxJitterMs: 45,
} as const;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** Pure calibration state. Audio, persistence and presentation stay in the scene. */
export class CalibrationRun {
  public readonly period = 60 / CALIBRATION.bpm;
  private readonly beats = new Set<number>();
  private readonly residuals: number[] = [];

  public constructor(public readonly origin: number, private readonly currentMs: number) {}

  public get count(): number { return this.residuals.length; }
  public get complete(): boolean { return this.count >= CALIBRATION_TAPS; }
  public get end(): number { return this.origin + (CALIBRATION.leadBeats + CALIBRATION.measureBeats) * this.period; }
  public beatAt(now: number): number { return (now - this.origin) / this.period; }

  /** At most one sample per beat: rapid tapping cannot manufacture a result. */
  public tap(correctedSec: number): boolean {
    if (!Number.isFinite(correctedSec) || this.complete) return false;
    const beat = Math.round(this.beatAt(correctedSec));
    if (beat < CALIBRATION.leadBeats || beat >= CALIBRATION.leadBeats + CALIBRATION.measureBeats || this.beats.has(beat)) return false;
    const residual = (correctedSec - (this.origin + beat * this.period)) * 1000;
    if (Math.abs(residual) > this.period * 1000 * CALIBRATION.acceptanceRatio) return false;
    this.beats.add(beat);
    this.residuals.push(residual);
    return true;
  }

  public result(): number | null {
    if (!this.complete) return null;
    const centre = median(this.residuals);
    const jitter = median(this.residuals.map(value => Math.abs(value - centre)));
    return jitter > CALIBRATION.maxJitterMs ? null : calibrationFrom(this.currentMs, this.residuals);
  }
}
