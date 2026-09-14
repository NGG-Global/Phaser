import { PALETTE } from '@/config/theme';

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

/** WCAG relative luminance of a Phaser colour, in linear sRGB. */
export function relativeLuminance(colour: number): number {
  const chan = (value: number): number => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan((colour >> 16) & 0xff)
    + 0.7152 * chan((colour >> 8) & 0xff)
    + 0.0722 * chan(colour & 0xff);
}

/** Contrast ratio of two Phaser colours, 1–21, same definition as WCAG. */
export function contrastRatio(a: number, b: number): number {
  const l1 = relativeLuminance(a), l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Outline for dressed type. Light paint (cream on timber, cream on coral) used to
 * self-shade into a muddy brown halo that sat at about 2.5:1 on the wood; the
 * workshop outline is the game's ink, the same dark the props use. Dark or saturated
 * fills (a coral "Your turn", a vignette's own ink) keep a deeper self-shade so the
 * stroke stays in the letter's family.
 */
export function typeStroke(fill: number, ink = PALETTE.ink): number {
  // Cream on timber needs a step darker than the supporting ink to clear 4.5:1; the
  // ink itself is 4.2 on that orange. Saturated fills keep a self-shade.
  return relativeLuminance(fill) > 0.45 ? shade(ink, -0.22) : shade(fill, -0.72);
}
