import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';

/**
 * The beat track: what the row of beads under the action is showing at any moment.
 *
 * Pure, with no Phaser import, so it unit-tests under node like the vignettes' motion
 * curves. The scene draws what these return; it decides nothing itself.
 *
 * The track is the answer to two complaints at once. A player could not tell the
 * demonstration from their own turn, because only a headline word changed; and a tap
 * that landed perfectly looked exactly like one that missed by 120 ms, because nothing
 * recorded the outcome outside a debug build.
 */

/** What one bead is showing. `pending` is a beat not yet played or not yet answered. */
export type Mark = 'pending' | 'perfect' | 'good' | 'miss';

/**
 * The mark for one beat, from the judge's own verdict.
 *
 * An extra tap never reaches here: it carries no index, because it belongs to no beat.
 * The scene shakes the whole track for those instead of marking one.
 */
export function markFor(outcome: Judgement | null | undefined): Mark {
  if (!outcome) return 'pending';
  if (outcome.kind === 'omission') return 'miss';
  if (outcome.kind === 'extra') return 'pending';
  return outcome.grade === 'Perfect' ? 'perfect' : outcome.grade === 'Good' ? 'good' : 'miss';
}

export interface TrackGeometry {
  /** Bead centres as offsets from the track's centre, in the same units as `width`. */
  readonly centres: readonly number[];
  /** Radius that keeps `count` beads inside `width` with room to breathe. */
  readonly radius: number;
  readonly gap: number;
}

/** Spacing that keeps a nine-beat pattern inside the frame instead of running off it. */
export function trackGeometry(count: number, width: number, preferredGap = 46, maxRadius = 13): TrackGeometry {
  if (count <= 0 || !Number.isFinite(width) || width <= 0) return { centres: [], radius: 0, gap: 0 };
  if (count === 1) return { centres: [0], radius: maxRadius, gap: 0 };
  // Shrink the pitch before the beads: a tight row of readable marks beats a loose row
  // of dots, and the longest pattern the vocabulary produces still has to fit.
  const gap = Math.min(preferredGap, width / (count - 1));
  const radius = Math.min(maxRadius, gap * 0.38);
  const centres = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * gap);
  return { centres, radius, gap };
}

/**
 * How many of the demonstration's beats have sounded by `now`, from the plan's own action
 * cues. Sampled from the audio clock by the caller, so a dropped frame cannot lose one.
 */
export function beatsPlayed(plan: RoundPlan | null, now: number): number {
  if (!plan) return 0;
  let played = 0;
  for (const cue of plan.cues) if (cue.kind === 'action' && cue.time <= now) played++;
  return played;
}

/**
 * The last four lead-in ticks before the demonstration, as a fraction filled.
 *
 * Only the last four count, so the opening bar and a sixteen-beat breather read the
 * same: a breather is a rest, not a count to sixteen. Returns null outside the lead-in,
 * which is what tells the scene to hide the pips.
 */
export function countIn(plan: RoundPlan | null, now: number, beats = 4): number | null {
  if (!plan || now >= plan.demo) return null;
  const lead = plan.cues.filter(cue => cue.kind !== 'action');
  if (lead.length === 0) return null;
  const last = lead.slice(-beats);
  const first = last[0]!.time;
  // One beat of warning before the first pip, so the row arrives rather than appearing
  // already half full. Earlier than that — deep in a breather — there is nothing to count.
  const beat = last.length > 1 ? last[1]!.time - first : plan.demo - first;
  if (now < first - beat) return null;
  let filled = 0;
  for (const cue of last) if (cue.time <= now) filled++;
  return filled;
}
