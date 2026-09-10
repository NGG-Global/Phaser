import { RHYTHM, type TimingWindows } from '../config/rhythm';

export type Grade = 'Perfect' | 'Good' | 'Miss';
export interface Judgement {
  readonly grade: Grade;
  readonly kind: 'hit' | 'extra' | 'omission';
  readonly index: number | null;
  readonly deltaMs: number | null;
}
export interface JudgeState {
  readonly targets: readonly number[];
  readonly windows: TimingWindows;
  readonly outcomes: (Judgement | null)[];
  readonly extras: Judgement[];
}

const EPSILON_MS = 0.000001; // Only absorb floating-point subtraction at exact boundaries.

export function createJudge(targets: readonly number[], windows: TimingWindows = RHYTHM): JudgeState {
  if (!targets.length || targets.some((t, i) => !Number.isFinite(t) || (i > 0 && t <= targets[i - 1]!))) {
    throw new Error('Targets must be nonempty, finite and strictly increasing.');
  }
  if (![windows.perfectMs, windows.goodMs, windows.deliveryGraceMs].every(Number.isFinite)
    || windows.perfectMs < 0 || windows.goodMs < windows.perfectMs || windows.deliveryGraceMs < 0) {
    throw new Error('Invalid timing windows.');
  }
  return { targets: [...targets], windows: { ...windows }, outcomes: targets.map(() => null), extras: [] };
}

/** Nearest fixed target, including already resolved targets; ties go to the earlier one. */
export function judgeTap(state: JudgeState, inputSec: number): Judgement {
  if (!Number.isFinite(inputSec)) throw new Error('Input time must be finite.');
  let index = 0;
  for (let i = 1; i < state.targets.length; i++) {
    if (Math.abs(inputSec - state.targets[i]!) < Math.abs(inputSec - state.targets[index]!) - EPSILON_MS / 1000) index = i;
  }
  const deltaMs = (inputSec - state.targets[index]!) * 1000;
  if (Math.abs(deltaMs) > state.windows.goodMs + EPSILON_MS || state.outcomes[index] !== null) {
    const extra: Judgement = { kind: 'extra', grade: 'Miss', index: null, deltaMs };
    state.extras.push(extra);
    return extra;
  }
  const result: Judgement = {
    kind: 'hit', index, deltaMs,
    grade: Math.abs(deltaMs) <= state.windows.perfectMs + EPSILON_MS ? 'Perfect' : 'Good',
  };
  state.outcomes[index] = result;
  return result;
}

/** Call after pending input delivery. Grace delays finalization, never widens hit windows. */
export function expireTargets(state: JudgeState, nowSec: number): Judgement[] {
  const missed: Judgement[] = [];
  state.targets.forEach((target, i) => {
    const next = state.targets[i + 1];
    const edge = Math.min(target + state.windows.goodMs / 1000, next === undefined ? Infinity : (target + next) / 2);
    if (state.outcomes[i] === null && nowSec > edge + state.windows.deliveryGraceMs / 1000) {
      const result: Judgement = { kind: 'omission', grade: 'Miss', index: i, deltaMs: null };
      state.outcomes[i] = result;
      missed.push(result);
    }
  });
  return missed;
}
