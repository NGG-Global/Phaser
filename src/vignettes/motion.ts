import type { Judgement } from '@/rhythm/judge';

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
export const easeOut = (value: number): number => 1 - (1 - clamp01(value)) ** 3;

/** Seconds per beat at the music's source tempo. Motion tuned at this length scales from it. */
export const REFERENCE_BEAT = 0.5;

/**
 * A demonstration beat can arrive twice: rendering re-scans the plan's cues every
 * frame, and the host also forwards the controller's cue. Returns the new high
 * water mark, or null when the beat has already been drawn.
 */
export function acceptDemoBeat(lastDemo: number, time: number): number | null {
  return time > lastDemo ? time : null;
}

/**
 * Only an accurate action advances a vignette's progress. An extra tap still moves
 * the tool and a missed target still reacts, but neither counts, and an omission
 * never invents an action the player did not make.
 */
export function advanceOnHit(count: number, kind: Judgement['kind']): number {
  return kind === 'hit' ? count + 1 : count;
}
