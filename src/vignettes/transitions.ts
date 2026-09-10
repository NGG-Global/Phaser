import type Phaser from 'phaser';
import type { Viewport } from '@/core/Viewport';
import { clamp01 } from './motion';
export type TransitionPainter = (g: Phaser.GameObjects.Graphics, viewport: Viewport, progress: number) => void;

/** The last nail's pressure ring expands into warm sawdust, then reveals the next act. */
export const impactTransition: TransitionPainter = (g, { full }, progress) => {
  const p = clamp01(progress);
  const radius = Math.sin(Math.PI * p) * Math.hypot(full.width, full.height) * 1.15;
  g.fillStyle(0xdfbd83).fillCircle(full.x + full.width * 0.43, full.y + full.height * 0.68, radius);
  g.lineStyle(8, 0xf5eddb, 0.6).strokeCircle(full.x + full.width * 0.43, full.y + full.height * 0.68, radius + 12);
};
/** A full-screen rubber blade clears the glass into the next palette. */
export const glassTransition: TransitionPainter = (g, { full }, progress) => {
  const x = full.x + full.width * (1 - 2.2 * clamp01(progress));
  g.fillStyle(0xc8dfda).fillRect(x, full.y, full.width * 1.2, full.height);
  g.fillStyle(0x49394e).fillRect(x, full.y, 12, full.height);
  g.fillStyle(0xf9f1df, 0.75).fillRect(x + 12, full.y, 5, full.height);
};
