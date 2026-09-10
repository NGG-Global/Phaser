import { parsePattern, type Pattern } from '../rhythm/patterns';

/** One round is several tasks of a single vignette; consecutive rounds change vignette. */
export interface SessionRound { readonly vignette: string; readonly tasks: readonly Pattern[] }
/** A round's task flattened for the host, which advances one task at a time. */
export interface SessionTask {
  readonly index: number;
  readonly round: number;
  readonly task: number;
  readonly vignette: string;
  readonly pattern: Pattern;
  /** True when the following task belongs to a different round (or none). */
  readonly closesRound: boolean;
}

/**
 * Authored vocabulary, all at the music's tempo. Hammer teaches quarter notes, Window
 * introduces one offbeat per phrase, Bug combines both over eight beats. Adjacent half
 * beats are about 250 ms apart, which the judge's nearest-target cells resolve.
 */
export const SESSION: readonly SessionRound[] = Object.freeze([
  { vignette: 'hammer', tasks: [parsePattern('learn', 'X X X -'), parsePattern('rest', 'X X - X'), parsePattern('lift', 'X - X X')] },
  { vignette: 'window', tasks: [parsePattern('offbeat', 'X - X - X - - X', 0.5), parsePattern('push', 'X - X - - X X -', 0.5), parsePattern('lean', 'X - - X X - X -', 0.5)] },
  { vignette: 'bug', tasks: [parsePattern('combine', 'X - X - - X X - X - X - - X X -', 0.5), parsePattern('answer', 'X - - X X - X - X - - X X - X -', 0.5), parsePattern('skip', 'X - X X - X X - X - X X - - X -', 0.5)] },
]);

export function validateSession(rounds: readonly SessionRound[]): void {
  if (!rounds.length) throw new Error('A session needs at least one round.');
  rounds.forEach((round, i) => {
    if (!round.tasks.length) throw new Error(`Round ${i + 1} has no tasks.`);
    if (i > 0 && rounds[i - 1]!.vignette === round.vignette) throw new Error(`Rounds ${i} and ${i + 1} repeat the same vignette.`);
  });
}

export function sessionTasks(rounds: readonly SessionRound[] = SESSION): readonly SessionTask[] {
  validateSession(rounds);
  return Object.freeze(rounds.flatMap((round, r) => round.tasks.map((pattern, t) => Object.freeze({
    index: rounds.slice(0, r).reduce((sum, previous) => sum + previous.tasks.length, 0) + t,
    round: r, task: t, vignette: round.vignette, pattern, closesRound: t === round.tasks.length - 1,
  }))));
}

export function sessionAccuracy(results: readonly number[]): number {
  const completed = results.filter(Number.isFinite);
  return completed.length ? completed.reduce((sum, accuracy) => sum + accuracy, 0) / completed.length : 0;
}
