import { parsePattern, type Pattern } from '../rhythm/patterns';
export interface SessionAct { readonly vignette: string; readonly pattern: Pattern }
/**
 * Authored vocabulary: steady quarter notes → one offbeat → a longer answer.
 * Every act plays at the music's tempo (`MUSIC.sourceBpm`); acts do not carry their own.
 */
export const SESSION: readonly SessionAct[] = Object.freeze([
  { vignette: 'hammer', pattern: parsePattern('learn', 'X X X -') },
  { vignette: 'window', pattern: parsePattern('offbeat', 'X - X - X - - X', 0.5) },
  { vignette: 'bug', pattern: parsePattern('combine', 'X - X - - X X - X - X - - X X -', 0.5) },
]);
export function sessionAccuracy(results: readonly number[]): number {
  const completed = results.filter(Number.isFinite);
  return completed.length ? completed.reduce((sum, accuracy) => sum + accuracy, 0) / completed.length : 0;
}
