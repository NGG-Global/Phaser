/** All musical timing values are seconds unless the name explicitly says Ms. */
export const RHYTHM = {
  perfectMs: 55,
  goodMs: 130,
  deliveryGraceMs: 50,
  leadSec: 0.2,
  beatsPerBar: 4,
  prepareBeats: 4,
  handoffBeats: 4,
  pumpMs: 20,
  stallMs: 250,
  clockStampMaxAgeMs: 250,
  goodPoints: 70,
  extraPenalty: 25,
} as const;

export interface TimingWindows {
  readonly perfectMs: number;
  readonly goodMs: number;
  readonly deliveryGraceMs: number;
}
