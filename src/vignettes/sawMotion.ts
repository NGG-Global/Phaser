import type { Judgement } from '@/rhythm/judge';
import { clamp01, easeOut } from './motion';
export { clamp01, easeOut } from './motion';

/** Presentation-only curves. They never alter a target, grade or score. */
export const SAW_MOTION = {
  // A stroke has to finish inside the tightest authored interval. Adjacent half
  // beats are 250 ms apart, so the draw back and follow-through together stay
  // under that; otherwise a quick pair reads as one long scrub.
  drawBackSec: 0.15,
  biteHoldSec: 0.028,
  followThroughSec: 0.19,
  dustSec: 0.42,
  /** Half the stroke's reach along the blade, in board units. */
  travel: 152,
  boardThickness: 86,
  /** The blade stands inside the plane of the cut, so it plunges rather than lying on the face. */
  bladeTiltRad: Math.PI / 6,
  /** A flawless response stops short of severing; the unscored coda finishes the cut. */
  kerfAtFullResponse: 0.86,
} as const;

/**
 * Push, pull, push. Parity of the action count is the only source of direction,
 * so nothing can hold a stale copy of it.
 */
export function sawDirection(strokeIndex: number): 1 | -1 {
  return ((Math.trunc(strokeIndex) % 2) + 2) % 2 === 0 ? 1 : -1;
}

/**
 * Travel along the blade after the bite, in the stroke's own direction: 0 at
 * maximum tooth engagement, 1 at the end of the follow-through. Consecutive
 * strokes alternate direction, so a stroke resting at 1 is the next stroke's -1.
 */
export function strokeTravel(age: number): number {
  if (age <= 0) return 0;
  return easeOut((age - SAW_MOTION.biteHoldSec) / (SAW_MOTION.followThroughSec - SAW_MOTION.biteHoldSec));
}

/**
 * The draw back before the bite, in the same frame: -1 fully back, 0 at contact.
 * Quick pairs begin the draw back while the previous follow-through is still
 * moving, so blend from that pose instead of snapping to the nominal end of travel.
 */
export function drawBack(untilBite: number, from = -1): number {
  const p = clamp01(1 - untilBite / SAW_MOTION.drawBackSec);
  // Slow off the reversal, accelerating into the beat: the bite is what carries the timing.
  return from * (1 - p ** 2);
}

/** Depth cut by accurate strokes alone, as a fraction of the board. */
export function kerfDepth(bites: number, targets: number): number {
  return clamp01(bites / Math.max(1, targets)) * SAW_MOTION.kerfAtFullResponse;
}

/** The blade is never visible below the depth it has actually sawn. */
export function bladeVisibleDepth(kerf: number): number {
  return SAW_MOTION.boardThickness * clamp01(kerf);
}

/** Sawdust leaves the kerf on the bite and falls under its own weight. */
export function dustFall(age: number): number {
  const p = clamp01(age / SAW_MOTION.dustSec);
  return p * p * 210;
}

/**
 * Only an accurate stroke deepens the kerf. An extra tap still skids across the
 * face and a missed target judders, but neither cuts, and an omission never
 * invents a stroke the player did not make.
 */
export function advanceBite(bites: number, kind: Judgement['kind']): number {
  return kind === 'hit' ? bites + 1 : bites;
}

/**
 * A demonstration beat can arrive twice: rendering re-scans the plan's cues every
 * frame, and the host also forwards the controller's cue. Returns the new high
 * water mark, or null when the beat has already been drawn.
 */
export function acceptDemoBeat(lastDemo: number, time: number): number | null {
  return time > lastDemo ? time : null;
}
