import { secondsPerBeat } from '../rhythm/patterns';

/** One round is a fixed playlist of nail tasks, all on one audio-clock grid. */
export class TaskSequence {
  public index = 0;
  public readonly results: number[] = [];
  public constructor(public readonly bpm: number, public readonly origin: number, public readonly taskCount = 3) {
    secondsPerBeat(bpm);
    if (!Number.isFinite(origin) || !Number.isInteger(taskCount) || taskCount < 1) throw new Error('Invalid sequence.');
  }
  public get last(): boolean { return this.index === this.taskCount - 1; }
  public get accuracy(): number { return this.results.length ? this.results.reduce((a, b) => a + b, 0) / this.results.length : 0; }
  public complete(accuracy: number): void { this.results[this.index] = accuracy; }
  public advance(): void { if (!this.last) this.index++; }
  public ending(end: number): { contact: number; slide: number; swap: number; next: number } {
    const beat = secondsPerBeat(this.bpm);
    return { contact: end + beat, slide: end + 2 * beat, swap: end + 3 * beat, next: end + 4 * beat };
  }
}
