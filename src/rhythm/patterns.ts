export interface Pattern {
  readonly id: string;
  readonly label: string;
  readonly lengthBeats: number;
  readonly hits: readonly number[];
}

export function validatePattern(pattern: Pattern): void {
  if (!Number.isFinite(pattern.lengthBeats) || pattern.lengthBeats <= 0 || !pattern.hits.length) {
    throw new Error('A pattern needs a positive length and at least one TAP.');
  }
  let previous = -Infinity;
  for (const beat of pattern.hits) {
    if (!Number.isFinite(beat) || beat < 0 || beat >= pattern.lengthBeats || beat <= previous) {
      throw new Error('TAP beats must be finite, unique, sorted and inside the phrase.');
    }
    previous = beat;
  }
}

/** Each whitespace-separated X or - occupies stepBeats, including trailing rests. */
export function parsePattern(id: string, notation: string, stepBeats = 1): Pattern {
  const tokens = notation.trim().split(/\s+/);
  if (!Number.isFinite(stepBeats) || stepBeats <= 0 || tokens.some(t => t !== 'X' && t !== '-')) {
    throw new Error('Use X and - tokens with a positive step length.');
  }
  const pattern: Pattern = Object.freeze({
    id, label: notation, lengthBeats: tokens.length * stepBeats,
    hits: Object.freeze(tokens.flatMap((token, i) => token === 'X' ? [i * stepBeats] : [])),
  });
  validatePattern(pattern);
  return pattern;
}

export function secondsPerBeat(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('BPM must be positive and finite.');
  return 60 / bpm;
}

export const PATTERNS: readonly Pattern[] = Object.freeze([
  parsePattern('steady', 'X X X -'),
  parsePattern('gap', 'X X - X X'),
  parsePattern('double', 'X - X - - - X X', 0.5),
]);
export const TEMPOS = [80, 100, 120] as const;
