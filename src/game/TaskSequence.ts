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
  public ending(end: number, holdBeats = 1): { contact: number; slide: number; swap: number; next: number } {
    // Contact and both halves of the table slide use three beats; the hold completes whole bars.
    if (!Number.isInteger(holdBeats) || holdBeats < 1 || (holdBeats + 3) % 4 !== 0) throw new Error('Ending hold must complete whole bars.');
    const beat = secondsPerBeat(this.bpm);
    return { contact: end + beat, slide: end + (1 + holdBeats) * beat, swap: end + (2 + holdBeats) * beat, next: end + (3 + holdBeats) * beat };
  }
}
