import Phaser from 'phaser';

/** Five-point star drawn with Graphics, so it needs no glyph the device font might lack. */
export function drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number, filled: boolean, alpha = 1): void {
  const points: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? radius * 0.45 : radius;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    points.push(new Phaser.Math.Vector2(x + Math.cos(angle) * r, y + Math.sin(angle) * r));
  }
  if (filled) g.fillStyle(color, alpha).fillPoints(points, true);
  else g.lineStyle(Math.max(1.5, radius * 0.16), color, alpha).strokePoints(points, true);
}
