import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { cubicContour, fillContour, paintedContour } from '@/ui/illustration';

/** Shared chef's knife; the cutting tip is the origin used by the musical pose. */
export function kitchenKnife(scene: Phaser.Scene, handle: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const ink = 0x39484b;
  const blade = cubicContour(0, 0, [
    [47, -14, 125, -9, 232, -9],
    [234, -30, 233, -62, 228, -75],
    [154, -79, 72, -75, 0, 0],
  ]);
  paintedContour(g, blade, 0xd4dfe0, ink, STYLE.current.outline);
  g.fillStyle(0xf6faf5);
  fillContour(
    g,
    cubicContour(5, -2, [
      [76, -21, 173, -17, 231, -17],
      [231, -14, 231, -11, 231, -9],
      [132, -8, 61, -12, 5, -2],
    ]),
  );
  g.fillStyle(0xb1c3c7);
  fillContour(g, [87, -60, 145, -72, 184, -74, 127, -16, 102, -16, 150, -70]);
  g.lineStyle(2, 0xffffff, 0.65).lineBetween(108, -69, 225, -70);
  paintedContour(
    g,
    cubicContour(229, -76, [
      [242, -77, 252, -73, 257, -68],
      [277, -70, 310, -74, 329, -69],
      [342, -59, 342, -31, 331, -23],
      [309, -16, 273, -20, 257, -24],
      [247, -21, 239, -17, 233, -16],
      [230, -34, 230, -54, 229, -76],
    ]),
    handle,
    ink,
    STYLE.current.outline,
  );
  g.fillStyle(0xe9bc77).fillRoundedRect(240, -71, 13, 48, 4);
  g.fillStyle(0xffffff, 0.13).fillRoundedRect(265, -66, 59, 9, 4);
  for (const x of [275, 318]) {
    g.fillStyle(0x172f32, 0.6).fillCircle(x, -43, 6);
    g.fillStyle(0xe8d3ad).fillCircle(x - 1, -44, 4);
  }
  return g;
}

export const KITCHEN_BOARD = { left: -448, right: 448, thickness: 42 } as const;

export function kitchenBoard(g: Phaser.GameObjects.Graphics, board: number, edge: number): void {
  g.clear();
  g.fillStyle(0x403a30, 0.12).fillEllipse(12, 64, 892, 38);
  g.fillStyle(edge).fillRoundedRect(-448, 0, 896, 42, 15);
  g.lineStyle(STYLE.current.outline, 0x746043).strokeRoundedRect(-448, 0, 896, 42, 15);
  g.fillStyle(board).fillRoundedRect(-447, -7, 894, 29, 13);
  g.lineStyle(3, 0xffefd0, 0.8).lineBetween(-427, -3, 426, -3);
  g.lineStyle(2, 0x937449, 0.25);
  for (let i = 0; i < 4; i++) g.lineBetween(-390 + i * 107, 7 + (i % 2) * 7, -333 + i * 111, 7 + (i % 2) * 7);
  g.lineStyle(2, 0x6e5436, 0.3).lineBetween(-428, 31, 427, 31);
  // Routed handhold on the end grain, plus a warm brass inset.
  g.fillStyle(0x8e7048).fillRoundedRect(383, 10, 43, 13, 6);
  g.fillStyle(0xd5b17a).fillRoundedRect(386, 13, 37, 6, 3);
}
