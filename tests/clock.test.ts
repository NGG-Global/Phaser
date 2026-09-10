import { expect, it } from 'vitest';
import { mapTimestamp, normalizeTimestamp } from '../src/audio/AudioClock';

it('normalizes modern/legacy timestamps and falls back for invalid ones', () => {
  const origin = 1_700_000_000_000;
  expect(normalizeTimestamp(980, 1000, origin)).toBe(980);
  expect(normalizeTimestamp(origin + 980, 1000, origin)).toBe(980);
  expect(normalizeTimestamp(NaN, 1000, origin)).toBe(1000);
  expect(normalizeTimestamp(0, 1000, origin)).toBe(1000);
  expect(normalizeTimestamp(2000, 1000, origin)).toBe(1000);
});
it('maps original input to the audio output domain without adding handler delay', () => {
  expect(mapTimestamp(950, 1000, 2)).toBeCloseTo(1.95);
  expect(mapTimestamp(1050, 1000, 2)).toBeCloseTo(2.05);
});
