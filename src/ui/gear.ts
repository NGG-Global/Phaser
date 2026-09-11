import Phaser from 'phaser';

/**
 * A settings cog drawn with Graphics rather than set as a glyph. U+2699 is missing from
 * enough Android system fonts to show a tofu box on a real handset, and every other mark
 * on this map and menu is drawn the same way.
 */
export function drawGear(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, colour: number, alpha = 1): void {
  const teeth = 8;
  const points: Phaser.Math.Vector2[] = [];
  const steps = teeth * 4;
  for (let i = 0; i < steps; i++) {
    // Four samples per tooth: out, out, in, in — a square wave on the radius.
    const r = i % 4 < 2 ? radius : radius * 0.74;
    const angle = i * 2 * Math.PI / steps - Math.PI / 2;
    points.push(new Phaser.Math.Vector2(x + Math.cos(angle) * r, y + Math.sin(angle) * r));
  }
  g.lineStyle(Math.max(1.4, radius * 0.2), colour, alpha).strokePoints(points, true);
  g.strokeCircle(x, y, radius * 0.34);
}
