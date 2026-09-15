import type { Judgement } from '@/rhythm/judge';
import { advanceOnHit, clamp01, easeOut, REFERENCE_BEAT } from './motion';
export { acceptDemoBeat, clamp01, easeOut, REFERENCE_BEAT } from './motion';

/** Presentation-only curves. They never alter a target, grade or score. */
export const CUCUMBER_MOTION = {
  // Phases are fractions of a beat, so the chop tightens with the tempo ramp and the
  // knife is always back up before the next possible hit, a half beat away.
  windupBeats: 0.34,
  holdBeats: 0.05,
  riseBeats: 0.36,
  tumbleBeats: 0.72,
  juiceBeats: 0.82,
  /** How far the knife lifts between chops, in board units. */
  lift: 96,
  /** Centre of the cucumber on the board. */
  x: -140,
  /** Half-length and half-height of the stadium; a cucumber is a long capsule. */
  radiusX: 248,
  radiusY: 70,
  /** A flawless response leaves a heel standing; the unscored coda takes it. */
  cutAtFullResponse: 0.86,
} as const;

export interface CucumberTiming {
  readonly windupSec: number;
  readonly holdSec: number;
  readonly riseSec: number;
  readonly tumbleSec: number;
  readonly juiceSec: number;
}

/** The chop's phases in seconds for a given beat length. */
export function cucumberTiming(beat = REFERENCE_BEAT): CucumberTiming {
  return {
    windupSec: CUCUMBER_MOTION.windupBeats * beat,
    holdSec: CUCUMBER_MOTION.holdBeats * beat,
    riseSec: CUCUMBER_MOTION.riseBeats * beat,
    tumbleSec: CUCUMBER_MOTION.tumbleBeats * beat,
    juiceSec: CUCUMBER_MOTION.juiceBeats * beat,
  };
}

/**
 * How far the knife has lifted since contact: 0 with the edge on the board, held
 * briefly, then rising to 1. The contact itself is at age 0 and carries the timing.
 */
export function knifeLift(age: number, beat = REFERENCE_BEAT): number {
  if (age < 0) return 1;
  const { holdSec, riseSec } = cucumberTiming(beat);
  return easeOut((age - holdSec) / (riseSec - holdSec));
}

/**
 * The windup before a known contact: from wherever the knife is, a little higher,
 * then accelerating down to exactly 0 at the beat. Quick pairs start their windup
 * while the previous rise is still moving, so blend from that height.
 */
export function knifeWindup(untilContact: number, from = 1, beat = REFERENCE_BEAT): number {
  const p = clamp01(1 - untilContact / cucumberTiming(beat).windupSec);
  const start = Math.min(1, from);
  const peak = Math.min(1.12, start + 0.18);
  return p < 0.38 ? start + (peak - start) * Math.sin(p / 0.38 * Math.PI / 2) : peak * (1 - ((p - 0.38) / 0.62) ** 3);
}

/** Fraction of the cucumber's length taken by accurate slices alone. */
export function cutFraction(slices: number, targets: number): number {
  return clamp01(slices / Math.max(1, targets)) * CUCUMBER_MOTION.cutAtFullResponse;
}

export function cutStart(): number {
  return CUCUMBER_MOTION.x + CUCUMBER_MOTION.radiusX;
}

export function cutAt(fraction: number): number {
  return cutStart() - 2 * CUCUMBER_MOTION.radiusX * clamp01(fraction);
}

/** A coin's topple onto the pile: crisp, no flop — a cucumber disc is firm. */
export function sliceTumble(age: number, beat = REFERENCE_BEAT): number {
  return easeOut(age / cucumberTiming(beat).tumbleSec);
}

/** Pale sap leaves the cut on contact and falls under its own weight. */
export function juiceFall(age: number, beat = REFERENCE_BEAT): number {
  const p = clamp01(age / cucumberTiming(beat).juiceSec);
  return p * p * 180;
}

/**
 * Clip a closed polyline to the half-plane `x <= cutX`. Used to open the stadium
 * at the cut without a mask, so the remaining cucumber is one fan-filled polygon.
 */
export function clipLeft(pts: readonly number[], cutX: number): number[] {
  const n = pts.length >> 1;
  if (n < 2) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const ax = pts[i * 2]!, ay = pts[i * 2 + 1]!;
    const j = i + 1 === n ? 0 : i + 1;
    const bx = pts[j * 2]!, by = pts[j * 2 + 1]!;
    const aIn = ax <= cutX + 1e-6;
    const bIn = bx <= cutX + 1e-6;
    if (aIn && bIn) {
      out.push(bx, by);
    } else if (aIn && !bIn) {
      const t = (cutX - ax) / (bx - ax || 1e-6);
      out.push(cutX, ay + (by - ay) * t);
    } else if (!aIn && bIn) {
      const t = (cutX - ax) / (bx - ax || 1e-6);
      out.push(cutX, ay + (by - ay) * t);
      out.push(bx, by);
    }
  }
  return out;
}

/** Uncut stadium, then clipped to the left of the cut so the remaining fruit is solid. */
export function cucumberBody(cutX: number, steps = 28): number[] {
  const { x: cx, radiusX: rx, radiusY: ry } = CUCUMBER_MOTION;
  const cy = -ry;
  const cap = ry;
  const left = cx - (rx - cap);
  const right = cx + (rx - cap);
  const capSteps = Math.max(6, Math.floor(steps / 2));
  const raw: number[] = [];
  for (let i = 0; i <= capSteps; i++) {
    const a = -Math.PI / 2 + Math.PI * i / capSteps;
    raw.push(right + cap * Math.cos(a), cy + cap * Math.sin(a));
  }
  raw.push(left, cy + cap);
  for (let i = 1; i <= capSteps; i++) {
    const a = Math.PI / 2 + Math.PI * i / capSteps;
    raw.push(left + cap * Math.cos(a), cy + cap * Math.sin(a));
  }
  raw.push(right, cy - cap);
  return clipLeft(raw, cutX);
}

/** Half-height of the cucumber at a vertical cut, for the edge-on flesh strip. */
export function cucumberHalfAt(cutX: number): number {
  const { x: cx, radiusX: rx, radiusY: ry } = CUCUMBER_MOTION;
  const cap = ry;
  const left = cx - (rx - cap);
  const right = cx + (rx - cap);
  if (cutX >= left && cutX <= right) return ry;
  const capCx = cutX < left ? left : right;
  const inside = ry * ry - (cutX - capCx) ** 2;
  return inside > 0 ? Math.sqrt(inside) : 0;
}

/**
 * Only an accurate chop takes a slice. An extra tap lands the knife on the bare board
 * with a clack and a nick, and a missed target leaves the knife hovering with a tremble;
 * neither cuts, and an omission never invents a chop the player did not make.
 */
export function advanceSlice(slices: number, kind: Judgement['kind']): number {
  return advanceOnHit(slices, kind);
}
