/**
 * Channel-wise colour helpers. Areas author five colours each (`levels.ts`); the map
 * derives every depth tone — shadows, hazed distance, bevels — from those rather than
 * adding fields, so a new area stays five values.
 */
export const hex = (colour: number): string => `#${(colour & 0xffffff).toString(16).padStart(6, '0')}`;

const byte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/** Linear blend in RGB. `t` is clamped, so callers can pass an unbounded ratio. */
export function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (byte(ar + (br - ar) * k) << 16) | (byte(ag + (bg - ag) * k) << 8) | byte(ab + (bb - ab) * k);
}

/** Positive lightens toward white, negative darkens toward black. */
export function shade(colour: number, amount: number): number {
  return amount >= 0 ? mix(colour, 0xffffff, amount) : mix(colour, 0x000000, -amount);
}
