import { RHYTHM } from '../config/rhythm';

export function normalizeTimestamp(timestamp: number, nowMs: number, originMs: number): number {
  const normalized = timestamp > originMs ? timestamp - originMs : timestamp;
  return Number.isFinite(normalized) && normalized > 0 && normalized <= nowMs + 1
    && nowMs - normalized < 1000 ? normalized : nowMs;
}

export function mapTimestamp(eventMs: number, performanceMs: number, audioSec: number): number {
  return audioSec + (eventMs - performanceMs) / 1000;
}

export class AudioClock {
  /**
   * Milliseconds the device's output lags the schedule, subtracted from every judged tap.
   * Owned by whoever constructs the clock rather than read from a store here: the clock
   * is the single funnel for judged timestamps and has no business knowing about storage.
   */
  public calibrationMs = 0;
  private performanceMs = 0;
  private audioSec = 0;
  private lastStamp = 0;
  public mode: 'output' | 'estimated' = 'estimated';
  public constructor(private readonly context: AudioContext) {}

  public refresh(): void {
    const now = performance.now();
    const stamp = this.context.getOutputTimestamp?.();
    if (stamp?.contextTime !== undefined && stamp.performanceTime !== undefined
      && stamp.contextTime > 0 && stamp.contextTime <= this.context.currentTime
      && stamp.performanceTime > 0 && stamp.performanceTime >= this.lastStamp
      && now >= stamp.performanceTime && now - stamp.performanceTime < RHYTHM.clockStampMaxAgeMs) {
      this.audioSec = stamp.contextTime;
      this.performanceMs = stamp.performanceTime;
      this.lastStamp = stamp.performanceTime;
      this.mode = 'output';
    } else {
      this.audioSec = this.context.currentTime;
      this.performanceMs = now;
      this.mode = 'estimated';
    }
  }
  public reset(): void { this.lastStamp = 0; this.refresh(); }
  public now(): number {
    return mapTimestamp(performance.now(), this.performanceMs, this.audioSec);
  }
  public input(timestamp: number): number {
    const time = normalizeTimestamp(timestamp, performance.now(), performance.timeOrigin);
    // Input only. If output is delayed by L the player hears late and taps late, so
    // removing L from their timestamp is the correction; visuals are not delayed by the
    // device, and shifting those would introduce an error rather than remove one.
    return mapTimestamp(time, this.performanceMs, this.audioSec) - this.calibrationMs / 1000;
  }
}
