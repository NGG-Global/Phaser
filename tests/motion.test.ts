import { describe, expect, it } from 'vitest';
import { isPlayerTurn, TURN_OPEN_SEC } from '../src/vignettes/motion';

describe('turn handover', () => {
  it('treats only respond as the player’s turn', () => {
    expect(isPlayerTurn('respond')).toBe(true);
    expect(isPlayerTurn('demonstrate')).toBe(false);
    expect(isPlayerTurn('prepare')).toBe(false);
    expect(isPlayerTurn('result')).toBe(false);
  });
  it('opens the stage faster than a beat at the source tempo', () => {
    // A 700 ms fade still looked like the example after judging had begun.
    expect(TURN_OPEN_SEC).toBeLessThan(0.5);
    expect(TURN_OPEN_SEC).toBeGreaterThan(0.1);
  });
});
