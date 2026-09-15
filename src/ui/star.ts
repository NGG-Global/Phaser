import Phaser from 'phaser';
import { shade } from './colour';

/** Five-point star drawn with Graphics, so it needs no glyph the device font might lack. */
export function drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number, alpha = 1): void {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? radius * 0.45 : radius;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    points.push(new Phaser.Math.Vector2(x + Math.cos(angle) * r, y + Math.sin(angle) * r));
  }
  g.fillStyle(color, alpha).fillPoints(points, true);
  // Same cartoon edge the pucks and plaques carry; a fill with no outline read as a sticker
  // from a different game.
  g.lineStyle(Math.max(1.8, radius * 0.22), shade(color, -0.55), alpha).strokePoints(points, true);
}
