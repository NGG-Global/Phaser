import type Phaser from 'phaser';
import { STYLE, type Treatment } from '@/config/style';
import { hex, shade } from './colour';

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

function shadowFor(t: Treatment, colour: number, size: number): NonNullable<TextStyle['shadow']> {
  switch (t.typeShadow) {
    // A hard drop, the printed-sticker look. Dark and close.
    case 'drop': return { offsetX: 0, offsetY: Math.max(1, size * 0.07), color: hex(shade(colour, -0.55)), blur: 0, fill: true, stroke: true };
    // Letterpress: a hair of light below, as if the letter were pressed into the surface.
    case 'inset': return { offsetX: 0, offsetY: Math.max(1, size * 0.045), color: 'rgba(255,255,255,0.5)', blur: 0, fill: true, stroke: false };
    // A cast shadow, soft and well away: the letters stand off the board.
    case 'deep': return { offsetX: size * 0.03, offsetY: Math.max(2, size * 0.12), color: 'rgba(20,14,8,0.42)', blur: size * 0.22, fill: true, stroke: true };
  }
}

function strokeFor(t: Treatment, size: number): number {
  // The outline weight tracks the treatment's silhouette weight so type and object agree.
  return t.outline === 0 ? 0 : Math.max(1.5, size * 0.02 * t.outline);
}

export interface TypeSpec {
  readonly size: number;
  readonly colour: number;
  /** Defaults to the treatment's outline colour; the tavern uses a darker frame ink. */
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
  if (strokeThickness > 0) { s.stroke = hex(spec.outline ?? shade(spec.colour, -0.6)); s.strokeThickness = strokeThickness; }
  if (dress) s.shadow = shadowFor(t, spec.colour, spec.size);
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
  if (!dress) return;
  const stroke = strokeFor(t, size);
  text.setStroke(hex(shade(colour, -0.6)), stroke);
  const sh = shadowFor(t, colour, size);
  text.setShadow(sh.offsetX, sh.offsetY, sh.color, sh.blur, sh.stroke, sh.fill);
}

/**
 * A metallic fill for the tavern's headline: a canvas gradient in the text's own
 * context, brass at the top through a highlight to a darker base. Reapply after any
 * size change, since the gradient is in canvas pixels.
 */
export function brass(text: Phaser.GameObjects.Text): void {
  const h = Math.max(1, text.height);
  const gradient = text.context.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#f5d98a');
  gradient.addColorStop(0.42, '#fff3c4');
  gradient.addColorStop(0.55, '#d9a94a');
  gradient.addColorStop(1, '#8a5f1e');
  text.setFill(gradient);
}
