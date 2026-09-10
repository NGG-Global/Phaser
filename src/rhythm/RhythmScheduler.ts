import { RHYTHM } from '../config/rhythm';
import { secondsPerBeat, validatePattern, type Pattern } from './patterns';

export type SoundKind = 'count' | 'ready' | 'action';
export interface ScheduledCue { readonly time: number; readonly kind: SoundKind }
export interface RoundPlan {
  readonly id: number;
  readonly pattern: Pattern;
  readonly bpm: number;
  readonly start: number;
  readonly demo: number;
  readonly handoff: number;
  readonly response: number;
  readonly end: number;
  readonly targets: readonly number[];
  readonly cues: readonly ScheduledCue[];
}
export interface SoundSink {
  play(time: number, kind: SoundKind): void;
  cancel(): void;
}

export function createRoundPlan(id: number, pattern: Pattern, bpm: number, start: number): RoundPlan {
  validatePattern(pattern);
  if (!Number.isFinite(start)) throw new Error('Invalid round origin.');
  const beat = secondsPerBeat(bpm);
  const demo = start + RHYTHM.prepareBeats * beat;
  const phraseBeats = Math.ceil(pattern.lengthBeats / RHYTHM.beatsPerBar) * RHYTHM.beatsPerBar;
  const handoff = demo + phraseBeats * beat;
  const response = handoff + RHYTHM.handoffBeats * beat;
  return Object.freeze({
    id, pattern, bpm, start, demo, handoff, response, end: response + phraseBeats * beat,
    targets: Object.freeze(pattern.hits.map(hit => response + hit * beat)),
    cues: Object.freeze([
      ...Array.from({ length: RHYTHM.prepareBeats }, (_, i) => ({ time: start + i * beat, kind: 'count' as const })),
      ...pattern.hits.map(hit => ({ time: demo + hit * beat, kind: 'action' as const })),
      ...Array.from({ length: RHYTHM.handoffBeats }, (_, i) => ({ time: handoff + i * beat, kind: 'ready' as const })),
    ]),
  });
}

/** Entire short phrase is submitted ahead of time; no JS callback starts a demo beat. */
export class RhythmScheduler {
  public constructor(private readonly sound: SoundSink) {}
  public schedule(plan: RoundPlan): void {
    this.cancel();
    for (const cue of plan.cues) this.sound.play(cue.time, cue.kind);
  }
  public cancel(): void { this.sound.cancel(); }
}
