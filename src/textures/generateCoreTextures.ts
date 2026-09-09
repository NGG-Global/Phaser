import type Phaser from 'phaser';

import { COLORS } from '@/config/theme';

/** Texture keys produced by {@link generateCoreTextures}. */
export const TextureKey = {
  Player: 'player',
  Pixel: 'pixel',
} as const;

export type TextureKey = (typeof TextureKey)[keyof typeof TextureKey];

/**
 * Source resolution of the player texture, in pixels.
 *
 * Generated larger than the on-screen size so it stays sharp when a
 * high-density display scales the canvas up. Scaling a texture down is close
 * to free; scaling one up is visibly soft.
 */
const PLAYER_TEXTURE_SIZE = 256;

/**
 * Draws the project's placeholder art into the texture cache.
 *
 * The repository intentionally ships no binary assets. Generating textures at
 * boot keeps it that way while still exercising the real path — scenes look
 * textures up by key exactly as they will once art is dropped into
 * `public/assets` and loaded in `PreloadScene`.
 */
export function generateCoreTextures(scene: Phaser.Scene): void {
  generatePlayerTexture(scene);
  generatePixelTexture(scene);
}

/** A rounded square with a soft top highlight, so its rotation reads clearly. */
function generatePlayerTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TextureKey.Player)) {
    return;
  }

  const size = PLAYER_TEXTURE_SIZE;
  const radius = size * 0.28;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);

  // Body.
  graphics.fillStyle(COLORS.player, 1);
  graphics.fillRoundedRect(0, 0, size, size, radius);

  // Highlight across the upper half, inset so it follows the rounded corners.
  graphics.fillStyle(COLORS.playerActive, 0.45);
  graphics.fillRoundedRect(
    size * 0.12,
    size * 0.1,
    size * 0.76,
    size * 0.34,
    radius * 0.6,
  );

  // Grip marks: three bars that make horizontal movement legible.
  graphics.fillStyle(COLORS.background, 0.55);
  const barWidth = size * 0.07;
  const barHeight = size * 0.26;
  const barY = size * 0.55;
  for (let i = -1; i <= 1; i += 1) {
    graphics.fillRoundedRect(
      size / 2 + i * (barWidth * 2.1) - barWidth / 2,
      barY,
      barWidth,
      barHeight,
      barWidth / 2,
    );
  }

  // Outline, to hold the shape against a dark background.
  graphics.lineStyle(size * 0.02, COLORS.playerActive, 0.8);
  graphics.strokeRoundedRect(0, 0, size, size, radius);

  graphics.generateTexture(TextureKey.Player, size, size);
  graphics.destroy();
}

/**
 * A single white pixel.
 *
 * Standard utility texture: tint and stretch it wherever a solid rectangle is
 * needed. Cheaper than a Graphics object per rectangle, since every instance
 * shares one texture and batches with the rest of the sprite draw calls.
 */
function generatePixelTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TextureKey.Pixel)) {
    return;
  }

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(0xffffff, 1);
  graphics.fillRect(0, 0, 1, 1);
  graphics.generateTexture(TextureKey.Pixel, 1, 1);
  graphics.destroy();
}
