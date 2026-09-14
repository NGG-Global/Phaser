/** All musical timing values are seconds unless the name explicitly says Ms. */
export const RHYTHM = {
  perfectMs: 55,
  goodMs: 130,
  deliveryGraceMs: 50,
  leadSec: 0.2,
  beatsPerBar: 4,
  /** One bar, once at the start of a level. Tasks after the first have no lead-in at all. */
  leadInBeats: 4,
  pumpMs: 20,
  stallMs: 250,
  /**
   * How old a `getOutputTimestamp()` pair may be before it is ignored. Bluetooth A2DP
   * routinely reports 200–400 ms of output delay; the previous 250 ms ceiling treated
   * those stamps as stale, fell back to the render clock, and jumped the scene forward
   * by the delay — which expired the player's targets before they heard them.
   */
  clockStampMaxAgeMs: 1000,
  goodPoints: 70,
  extraPenalty: 25,
} as const;

export interface TimingWindows {
  readonly perfectMs: number;
  readonly goodMs: number;
  readonly deliveryGraceMs: number;
}
