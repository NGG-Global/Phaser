import { parsePattern, type Pattern } from '../rhythm/patterns';
export interface SessionAct { readonly vignette: string; readonly bpm: number; readonly pattern: Pattern }
/** Authored vocabulary: steady quarter notes → one offbeat → a longer answer. */
export const SESSION: readonly SessionAct[] = Object.freeze([
  { vignette: 'hammer', bpm: 86, pattern: parsePattern('learn', 'X X X -') },
  { vignette: 'window', bpm: 96, pattern: parsePattern('offbeat', 'X - X - X - - X', 0.5) },
  { vignette: 'bug', bpm: 104, pattern: parsePattern('combine', 'X - X - - X X - X - X - - X X -', 0.5) },
]);
export function sessionAccuracy(results: readonly number[]): number {
  const completed = results.filter(Number.isFinite);
  return completed.length ? completed.reduce((sum, accuracy) => sum + accuracy, 0) / completed.length : 0;
}
