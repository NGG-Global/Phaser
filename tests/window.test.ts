import { describe, expect, it } from 'vitest';
import { synthesizeWipe } from '../src/audio/windowSounds';
import { easeOut } from '../src/vignettes/motion';

describe('window presentation sound', () => {
  it.each(['action', 'success', 'rough'] as const)('produces a finite deterministic %s buffer', kind => {
    const data = synthesizeWipe(48000, kind);
    expect(data.length).toBeGreaterThan(10000);
    expect(data[0]).toBe(0);
    expect(data.every(v => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
    expect(Array.from(data.slice(1, 480)).some(v => Math.abs(v) > 0.01)).toBe(true);
    expect(data).toEqual(synthesizeWipe(48000, kind));
  });
  it('keeps presentation progress bounded including unresolved grime', () => {
    expect(easeOut(-Infinity)).toBe(0);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(100)).toBe(1);
  });
});
