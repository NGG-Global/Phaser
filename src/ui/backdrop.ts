import Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { COLORS } from '@/config/theme';
import type { Viewport } from '@/core/Viewport';
import { MaterialKey } from '@/textures/materials';
import { mix } from './colour';
import { FxKey } from './feedback';

/**
 * The shared stage behind a vignette. Five vignettes each filled the screen with their
 * own paper colour and one of them laid a grain over it; this is that, once: the ground
 * colour, a soft pool of warmer light from the shared light's side, and the paper fibre
 * over the whole frame so every surface in the game is on the same sheet.
 *
 * Every full-screen pass costs fill rate, which is the budget on a phone, so this uses
 * as few as possible: a paper that matches the game's clear colour costs nothing at all,
 * any other paper is the camera's background rather than a drawn rectangle, and the pool
 * is one large tinted soft-disc image rather than a gradient shader — a third of the
 * shader's cost under software rendering, and a plain textured quad on any GPU.
 */
export class Backdrop {
  private readonly glow: Phaser.GameObjects.Image;
  private readonly fibre: Phaser.GameObjects.TileSprite;

  public constructor(private readonly scene: Phaser.Scene, private readonly paper: number, glowColour: number) {
    this.ground();
    this.glow = scene.add.image(0, 0, FxKey.glow).setTint(mix(paper, glowColour, 0.7)).setAlpha(0.85).setDepth(-19);
    this.fibre = scene.add.tileSprite(0, 0, 1, 1, MaterialKey.paper).setOrigin(0).setDepth(-9).setAlpha(0.32 * STYLE.current.grain);
  }

  public layout(viewport: Viewport): void {
    const { full } = viewport;
    this.ground();
    const size = Math.max(full.width, full.height) * 1.25;
    this.glow.setPosition(full.x + full.width * 0.38, full.y + full.height * 0.34).setDisplaySize(size, size);
    this.fibre.setPosition(full.x, full.y).setSize(full.width, full.height);
  }

  private ground(): void {
    if (this.paper !== COLORS.background) this.scene.cameras.main.setBackgroundColor(this.paper);
  }

  public destroy(): void {
    this.glow.destroy();
    this.fibre.destroy();
  }
}
