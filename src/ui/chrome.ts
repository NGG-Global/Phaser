import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { SHELL } from '@/config/theme';
import { shade } from './colour';
import { faces } from './light';
import { BRASS, drawDisc } from './panel';

/**
 * Shared chrome: the hanging-sign ropes, the utility pucks, the coral action block.
 * Menu, map, play and settings used to each invent a slightly different puck radius,
 * rope weight and press spring, which is how the same control read as three objects.
 */
export const CHROME = {
  puckRadius: 34,
  puckDepth: 7,
  pressSec: 0.42,
  block: { width: 560, height: 110, fromBottom: 96, depth: 16 },
} as const;

export { pressAmount } from './spring';

export function puckSink(s: number, press: number): number {
  return CHROME.puckDepth * s * press * 0.8;
}

export function drawPuck(
  g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, press = 0, fill = SHELL.puck,
): void {
  drawDisc(g, x, y, CHROME.puckRadius * s, s, { fill, depth: CHROME.puckDepth, press });
}

/**
 * Two ropes in local space, origin at the ceiling anchor. `weight` is the rope's
 * design-unit thickness: the menu sign is larger than the map's, so it hangs on
 * heavier line rather than a copy of the same stroke.
 */
export function drawRopes(
  g: Phaser.GameObjects.Graphics,
  s: number,
  length: number,
  xs: readonly number[],
  weight: number,
  wood = SHELL.wood,
  rope = SHELL.rope,
): void {
  const outline = STYLE.current.outline * s * 0.55;
  const thick = weight * s;
  const eye = weight * s;
  for (const x of xs) {
    g.lineStyle(outline + thick, shade(rope, -0.5), 1).lineBetween(x, 0, x, length);
    g.lineStyle(thick, rope, 1).lineBetween(x, 0, x, length);
    g.lineStyle(weight * 0.28 * s, shade(rope, 0.35), 0.6).lineBetween(x - 2 * s, 0, x - 2 * s, length);
    g.fillStyle(faces(BRASS).edge, 1).fillCircle(x, length + 2 * s, eye);
    g.fillStyle(BRASS, 1).fillCircle(x, length, eye);
    g.fillStyle(shade(wood, -0.6), 1).fillCircle(x, length, eye * 0.38);
  }
}
