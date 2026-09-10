import type { Judgement } from '@/rhythm/judge';
import { advanceOnHit, clamp01, easeOut, REFERENCE_BEAT } from './motion';
export { acceptDemoBeat, clamp01, easeOut, REFERENCE_BEAT } from './motion';

/** Presentation-only curves. They never alter a target, grade or score. */
export const TOMATO_MOTION = {
  // Phases are fractions of a beat, so the chop tightens with the tempo ramp and the
  // knife is always back up before the next possible hit, a half beat away.
  windupBeats: 0.34,
  holdBeats: 0.05,
  riseBeats: 0.36,
  tumbleBeats: 0.9,
  juiceBeats: 0.7,
  /** How far the knife lifts between chops, in board units. */
  lift: 118,
  /** Half-axes of the tomato in profile; it is a little wider than it is tall. */
  radiusX: 152,
  radiusY: 136,
  /** A flawless response leaves a heel standing; the unscored coda takes it. */
  cutAtFullResponse: 0.86,
} as const;

export interface TomatoTiming {
  readonly windupSec: number;
  readonly holdSec: number;
  readonly riseSec: number;
  readonly tumbleSec: number;
  readonly juiceSec: number;
}

/** The chop's phases in seconds for a given beat length. */
export function tomatoTiming(beat = REFERENCE_BEAT): TomatoTiming {
  return {
    windupSec: TOMATO_MOTION.windupBeats * beat,
    holdSec: TOMATO_MOTION.holdBeats * beat,
    riseSec: TOMATO_MOTION.riseBeats * beat,
    tumbleSec: TOMATO_MOTION.tumbleBeats * beat,
    juiceSec: TOMATO_MOTION.juiceBeats * beat,
  };
}

/**
 * How far the knife has lifted since contact: 0 with the edge on the board, held
 * briefly, then rising to 1. The contact itself is at age 0 and carries the timing.
 */
export function knifeLift(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 1;
  const { holdSec, riseSec } = tomatoTiming(beat);
  return easeOut((age - holdSec) / (riseSec - holdSec));
}

/**
 * The windup before a known contact: from wherever the knife is, a little higher,
 * then accelerating down to exactly 0 at the beat. Quick pairs start their windup
 * while the previous rise is still moving, so blend from that height.
 */
export function knifeWindup(untilContact: number, from = 1, beat = REFERENCE_BEAT): number {
  const p = clamp01(1 - untilContact / tomatoTiming(beat).windupSec);
  const start = Math.min(1, from);
  const peak = Math.min(1.12, start + 0.18);
  // Rise for the first part of the windup, then fall with gathering speed.
  return p < 0.38 ? start + (peak - start) * Math.sin(p / 0.38 * Math.PI / 2) : peak * (1 - ((p - 0.38) / 0.62) ** 3);
}

/** Fraction of the tomato's width taken by accurate slices alone. */
export function cutFraction(slices: number, targets: number): number {
  return clamp01(slices / Math.max(1, targets)) * TOMATO_MOTION.cutAtFullResponse;
}

/** A slab's topple onto the pile: 0 standing at the cut, 1 leaning against the last slice. */
export function sliceTumble(age: number, beat = REFERENCE_BEAT): number {
  return easeOut(age / tomatoTiming(beat).tumbleSec);
}

/** Juice leaves the cut on contact and falls under its own weight. */
export function juiceFall(age: number, beat = REFERENCE_BEAT): number {
  const p = clamp01(age / tomatoTiming(beat).juiceSec);
  return p * p * 160;
}

/**
 * Only an accurate chop takes a slice. An extra tap lands the knife on the bare board
 * with a clack and a nick, and a missed target leaves the knife hovering with a tremble;
 * neither cuts, and an omission never invents a chop the player did not make.
 */
export function advanceSlice(slices: number, kind: Judgement['kind']): number {
  return advanceOnHit(slices, kind);
}
