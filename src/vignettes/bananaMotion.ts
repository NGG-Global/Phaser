import type { Judgement } from '@/rhythm/judge';
import { advanceOnHit, clamp01, easeOut, REFERENCE_BEAT } from './motion';
export { acceptDemoBeat, clamp01, easeOut, REFERENCE_BEAT } from './motion';

/** Presentation-only curves. They never alter a target, grade or score. */
export const BANANA_MOTION = {
  // Phases are fractions of a beat, so the chop tightens with the tempo ramp and the
  // knife is always back up before the next possible hit, a half beat away.
  windupBeats: 0.34,
  holdBeats: 0.05,
  riseBeats: 0.36,
  tumbleBeats: 1.02,
  juiceBeats: 0.52,
  /** How far the knife lifts between chops, in board units. */
  lift: 104,
  /** Stem attachment, the left of the fruit. */
  stemX: -210,
  /** Horizontal span from stem to tip. */
  length: 332,
  /** Thickness at the fattest point. */
  thickness: 76,
  /** How high the ends lift off the board; the belly sits on it. */
  arch: 28,
  /** A flawless response leaves the stem standing; the unscored coda takes it. */
  cutAtFullResponse: 0.86,
} as const;

export interface BananaTiming {
  readonly windupSec: number;
  readonly holdSec: number;
  readonly riseSec: number;
  readonly tumbleSec: number;
  readonly juiceSec: number;
}

export interface BananaSample {
  readonly x: number;
  readonly y: number;
  readonly half: number;
  readonly nx: number;
  readonly ny: number;
}

/** The chop's phases in seconds for a given beat length. */
export function bananaTiming(beat = REFERENCE_BEAT): BananaTiming {
  return {
    windupSec: BANANA_MOTION.windupBeats * beat,
    holdSec: BANANA_MOTION.holdBeats * beat,
    riseSec: BANANA_MOTION.riseBeats * beat,
    tumbleSec: BANANA_MOTION.tumbleBeats * beat,
    juiceSec: BANANA_MOTION.juiceBeats * beat,
  };
}

/**
 * How far the knife has lifted since contact: 0 with the edge on the board, held
 * briefly, then rising to 1. The contact itself is at age 0 and carries the timing.
 */
export function knifeLift(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 1;
  const { holdSec, riseSec } = bananaTiming(beat);
  return easeOut((age - holdSec) / (riseSec - holdSec));
}

/**
 * The windup before a known contact: from wherever the knife is, a little higher,
 * then accelerating down to exactly 0 at the beat. Quick pairs start their windup
 * while the previous rise is still moving, so blend from that height.
 */
export function knifeWindup(untilContact: number, from = 1, beat = REFERENCE_BEAT): number {
  const p = clamp01(1 - untilContact / bananaTiming(beat).windupSec);
  const start = Math.min(1, from);
  const peak = Math.min(1.12, start + 0.18);
  return p < 0.38 ? start + (peak - start) * Math.sin(p / 0.38 * Math.PI / 2) : peak * (1 - ((p - 0.38) / 0.62) ** 3);
}

/** Fraction of the banana's length taken by accurate slices alone. */
export function cutFraction(slices: number, targets: number): number {
  return clamp01(slices / Math.max(1, targets)) * BANANA_MOTION.cutAtFullResponse;
}

/** Parameter t of the cut: 1 at the tip, shrinking toward the stem as slices come off. */
export function bananaCutT(fraction: number): number {
  return 1 - clamp01(fraction) * BANANA_MOTION.cutAtFullResponse;
}

/**
 * Centreline, half-thickness and upward normal of the banana at parameter `t` in
 * [0, 1], stem to tip. The belly sits on the board at the middle; the ends lift.
 */
export function bananaAt(t: number): BananaSample {
  const u = clamp01(t);
  const { stemX, length, thickness, arch } = BANANA_MOTION;
  const x = stemX + u * length;
  const taper = 0.52 + 0.48 * Math.sin(Math.PI * u);
  const half = thickness * 0.5 * taper;
  const lift = arch * (1 - Math.sin(Math.PI * u));
  const y = -half - lift;
  const dx = length;
  const cos = Math.cos(Math.PI * u);
  const dy = Math.PI * cos * (arch - thickness * 0.5 * 0.48);
  const hyp = Math.hypot(dx, dy) || 1;
  let nx = -dy / hyp;
  let ny = dx / hyp;
  if (ny > 0) { nx = -nx; ny = -ny; }
  return { x, y, half, nx, ny };
}

/** Closed silhouette of the remaining banana, stem to the cut at `tEnd`. */
export function bananaOutline(tEnd: number, steps = 28): number[] {
  const end = clamp01(tEnd);
  if (end <= 0.02) return [];
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = bananaAt((i / steps) * end);
    pts.push(p.x + p.nx * p.half, p.y + p.ny * p.half);
  }
  for (let i = steps; i >= 0; i--) {
    const p = bananaAt((i / steps) * end);
    pts.push(p.x - p.nx * p.half, p.y - p.ny * p.half);
  }
  return pts;
}

/**
 * A slab's flop onto the pile: 0 standing at the cut, 1 leaning against the last slice.
 * Soft fruit overshoots a little, then settles.
 */
export function sliceTumble(age: number, beat = REFERENCE_BEAT): number {
  const p = clamp01(age / bananaTiming(beat).tumbleSec);
  if (p <= 0) return 0;
  const eased = easeOut(p);
  const flop = Math.sin(p * Math.PI) * 0.08 * (1 - p);
  return eased + flop;
}

/** Cream leaves the cut on contact and falls under its own weight. */
export function juiceFall(age: number, beat = REFERENCE_BEAT): number {
  const p = clamp01(age / bananaTiming(beat).juiceSec);
  return p * p * 120;
}

/**
 * Only an accurate chop takes a slice. An extra tap lands the knife on the bare board
 * with a clack and a nick, and a missed target leaves the knife hovering with a tremble;
 * neither cuts, and an omission never invents a chop the player did not make.
 */
export function advanceSlice(slices: number, kind: Judgement['kind']): number {
  return advanceOnHit(slices, kind);
}
