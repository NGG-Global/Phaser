import type Phaser from 'phaser';
import { STYLE, type Treatment } from '@/config/style';
import { PALETTE } from '@/config/theme';
import { hex, relativeLuminance, shade, typeStroke } from './colour';

/**
 * The type system. One display face and one body face per treatment, both bundled and
 * registered by `load.font()` before the menu builds, replacing Georgia headlines and
 * sixteen letter-spaced monospace eyebrows — the pairing that read most as a web page,
 * and one that was not even stable across devices, since Android ships no Georgia.
 *
 * Dressing scales with the size, so a headline and a caption in the same treatment
 * carry the same weight of stroke and shadow relative to their letterforms.
 */

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/** A hard drop under the letter and its outline: the printed-sticker look. Dark and close. */
function shadowFor(colour: number, size: number): NonNullable<TextStyle['shadow']> {
  const drop = relativeLuminance(colour) > 0.45 ? shade(PALETTE.ink, -0.25) : shade(colour, -0.7);
  return { offsetX: 0, offsetY: Math.max(1, size * 0.07), color: hex(drop), blur: 0, fill: true, stroke: true };
}

/** Below this the outline is tapered; a headline at or above it carries its full weight. */
const FULL_WEIGHT_SIZE = 44;

function strokeFor(t: Treatment, size: number): number {
  // The outline weight tracks the treatment's silhouette weight so type and object agree.
  // It tapers below headline size, though: a stroke that stays proportional all the way
  // down fills in Fredoka's counters, and a 28px value reads as a smudge rather than a
  // word. The outline is there to give a large letter a cartoon silhouette, and a small
  // one has no silhouette to give.
  if (t.outline === 0) return 0;
  // Squared, because the stroke is laid on the outside of a stem that is itself only
  // linear in the size: proportional weight costs a 28px letter well over half its stem
  // again, and Fredoka's counters close up. A headline keeps every bit of its outline.
  const taper = Math.min(1, size / FULL_WEIGHT_SIZE) ** 2;
  return Math.max(1.5, size * 0.02 * t.outline * taper);
}

export interface TypeSpec {
  readonly size: number;
  readonly colour: number;
  /** Defaults to a dark shade of the fill. */
  readonly outline?: number;
  readonly align?: 'left' | 'center' | 'right';
  readonly wrap?: number;
}

function style(t: Treatment, family: string, weight: number, spec: TypeSpec, dress: boolean): TextStyle {
  const strokeThickness = dress ? strokeFor(t, spec.size) : 0;
  const s: TextStyle = {
    // Quoted, because Phaser assembles the canvas font shorthand verbatim and an unquoted
    // "Baloo 2" is not a valid family there: the canvas falls back to 10px sans-serif.
    fontFamily: `"${family}"`,
    fontStyle: String(weight),
    fontSize: `${spec.size}px`,
    color: hex(spec.colour),
    align: spec.align ?? 'left',
  };
  if (strokeThickness > 0) { s.stroke = hex(spec.outline ?? typeStroke(spec.colour)); s.strokeThickness = strokeThickness; }
  if (dress) s.shadow = shadowFor(spec.colour, spec.size);
  if (spec.wrap !== undefined) s.wordWrap = { width: spec.wrap, useAdvancedWrap: true };
  return s;
}

/** A headline or a value: the display face, fully dressed. */
export function display(scene: Phaser.Scene, text: string, spec: TypeSpec, t = STYLE.current): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, text, style(t, t.display, t.displayWeight, spec, true));
}

/** Running copy: the body face, undressed, so it sits back behind the display. */
export function body(scene: Phaser.Scene, text: string, spec: TypeSpec, t = STYLE.current): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, text, style(t, t.body, t.bodyWeight, spec, false));
}

/** A control or a small tag: the body face, heavier, uppercase, no tracking. */
export function label(scene: Phaser.Scene, text: string, spec: TypeSpec, t = STYLE.current): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, text.toUpperCase(), style(t, t.body, Math.min(900, t.bodyWeight + 200), spec, false));
}

/**
 * Re-dress a display text after a size change. `setFontSize` alone would leave the stroke
 * and shadow at the old size's proportions.
 */
export function resize(text: Phaser.GameObjects.Text, size: number, colour: number, t = STYLE.current, dress = true): void {
  text.setFontSize(size);
  if (!dress) {
    // A previous dressed size would otherwise leave a headline stroke on a caption.
    text.setStroke('#000000', 0);
    text.setShadow(0, 0, '#000000', 0, false, false);
    return;
  }
  const stroke = strokeFor(t, size);
  text.setStroke(hex(typeStroke(colour)), stroke);
  const sh = shadowFor(colour, size);
  text.setShadow(sh.offsetX, sh.offsetY, sh.color, sh.blur, sh.stroke, sh.fill);
}
