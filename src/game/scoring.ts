import { RHYTHM } from '../config/rhythm';
import type { JudgeState } from '../rhythm/judge';

export interface RoundResult {
  readonly perfect: number;
  readonly good: number;
  readonly missed: number;
  readonly extras: number;
  readonly accuracy: number;
  readonly meanAbsoluteErrorMs: number | null;
}

export function scoreRound(state: JudgeState): RoundResult {
  const hits = state.outcomes.filter(result => result?.kind === 'hit');
  const perfect = hits.filter(result => result?.grade === 'Perfect').length;
  const good = hits.length - perfect;
  return {
    perfect, good, missed: state.targets.length - hits.length, extras: state.extras.length,
    accuracy: Math.max(0, perfect * 100 + good * RHYTHM.goodPoints - state.extras.length * RHYTHM.extraPenalty) / state.targets.length,
    meanAbsoluteErrorMs: hits.length ? hits.reduce((sum, result) => sum + Math.abs(result?.deltaMs ?? 0), 0) / hits.length : null,
  };
}
