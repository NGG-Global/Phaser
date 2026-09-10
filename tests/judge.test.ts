import { describe, expect, it } from 'vitest';
import { createJudge, expireTargets, judgeTap } from '../src/rhythm/judge';
import { scoreRound } from '../src/game/scoring';

describe('casual timing windows', () => {
  it.each([
    [-130, 'Good'], [-55.001, 'Good'], [-55, 'Perfect'], [0, 'Perfect'],
    [55, 'Perfect'], [55.001, 'Good'], [130, 'Good'], [130.001, 'Miss'], [-130.001, 'Miss'],
  ] as const)('grades %s ms as %s', (ms, grade) => {
    const result = judgeTap(createJudge([10]), 10 + ms / 1000);
    expect(result.grade).toBe(grade);
    expect(result.deltaMs).toBeCloseTo(ms);
  });
  it('does not let duplicate taps steal the next target', () => {
    const state = createJudge([1, 1.2]);
    expect(judgeTap(state, 1).grade).toBe('Perfect');
    expect(judgeTap(state, 1.08).kind).toBe('extra');
    expect(state.outcomes[1]).toBeNull();
    expect(judgeTap(state, 1.2).grade).toBe('Perfect');
  });
  it('resolves an exact midpoint to the earlier target', () => {
    const state = createJudge([1, 1.2]);
    expect(judgeTap(state, 1.1).index).toBe(0);
    expect(judgeTap(state, 1.1).kind).toBe('extra');
  });
  it('allows delivery grace without widening the eligibility window', () => {
    const state = createJudge([1]);
    expect(expireTargets(state, 1.17)).toEqual([]);
    expect(judgeTap(state, 1.13).grade).toBe('Good');
    expect(expireTargets(state, 1.3)).toEqual([]);
    const missing = createJudge([1]);
    expect(expireTargets(missing, 1.181)).toHaveLength(1);
    expect(expireTargets(missing, 2)).toEqual([]);
    expect(judgeTap(missing, 1)).toMatchObject({ kind: 'extra', grade: 'Miss' });
  });
  it('scores perfect, mixed, no-input and spam rounds', () => {
    const state = createJudge([1, 2, 3]);
    judgeTap(state, 1); judgeTap(state, 2.1); expireTargets(state, 4);
    expect(scoreRound(state)).toMatchObject({ perfect: 1, good: 1, missed: 1, extras: 0 });
    expect(scoreRound(state).accuracy).toBeCloseTo(170 / 3);
    for (let i = 0; i < 20; i++) judgeTap(state, 1);
    expect(scoreRound(state).accuracy).toBe(0);
    expect(scoreRound(createJudge([1])).meanAbsoluteErrorMs).toBeNull();
    const perfect = createJudge([1, 2]); judgeTap(perfect, 1); judgeTap(perfect, 2);
    expect(scoreRound(perfect).accuracy).toBe(100);
  });
});
