import Phaser from 'phaser';

import { LAYOUT } from '@/config/design';

/** How much the player grows while held, as a multiple of its resting scale. */
const PRESS_SCALE = 1.09;
const PRESS_TWEEN_MS = 90;
const RELEASE_TWEEN_MS = 160;

/**
 * The draggable player object.
 *
 * An `Image` rather than a `Container` so it stays a single batched draw call,
 * and so its texture frame provides a hit area for free.
 *
 * Sizing is driven by {@link resize} instead of the constructor, because the
 * logical game size is not known until layout and changes afterwards.
 */
export class Player extends Phaser.GameObjects.Image {
  /** Resting scale, kept so the press tween has something to return to. */
  private baseScale = 1;
  private pressTween?: Phaser.Tweens.Tween | undefined;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    // Unused starter code: the texture this named is no longer generated at boot.
    super(scene, x, y, 'player');

    this.setOrigin(0.5, 0.5);

    // A plain `setInteractive()` installs a rectangular hit area matching the
    // texture frame. `resize` then widens that rectangle when the art alone
    // would be too small to hit reliably with a thumb.
    this.setInteractive({ useHandCursor: true });

    scene.add.existing(this);
  }

  /**
   * Sets the on-screen size and re-derives the hit area.
   *
   * @param displaySize Width and height to draw at, in game units.
   * @param minTouchTarget Smallest acceptable *hit* size in game units,
   *   independent of how small the art is drawn.
   */
  public resize(displaySize: number, minTouchTarget: number): void {
    this.setDisplaySize(displaySize, displaySize);

    // `setDisplaySize` writes scaleX/scaleY, so capture the result as the new
    // resting scale and cancel any press tween still animating the old one.
    this.pressTween?.remove();
    this.pressTween = undefined;
    this.baseScale = this.scaleX;

    this.refreshHitArea(minTouchTarget);
  }

  /** Visual feedback for a touch landing on the player. */
  public press(): void {
    this.tweenScale(this.baseScale * PRESS_SCALE, PRESS_TWEEN_MS);
  }

  /** Returns the player to its resting appearance. */
  public release(): void {
    this.tweenScale(this.baseScale, RELEASE_TWEEN_MS);
  }

  /**
   * Grows the hit rectangle so the *displayed* touch target is never smaller
   * than `minTouchTarget`.
   *
   * Hit areas are expressed in the texture's own coordinate space, so they
   * shrink with the object's scale. On a small screen the art can legitimately
   * be drawn below a comfortable thumb size; the hit area must not follow it
   * down, or the player becomes fiddly to grab exactly where precision matters
   * least.
   */
  private refreshHitArea(minTouchTarget: number): void {
    const hitArea: unknown = this.input?.hitArea;

    if (!(hitArea instanceof Phaser.Geom.Rectangle)) {
      return;
    }

    const scale = this.scaleX === 0 ? 1 : Math.abs(this.scaleX);
    const target = Math.max(minTouchTarget, LAYOUT.minTouchTarget);
    // Convert the required display size back into local texture units.
    const needed = target / scale;

    const width = Math.max(this.width, needed);
    const height = Math.max(this.height, needed);

    // Centre the rectangle on the frame; hit-area coordinates are measured
    // from the frame's top-left regardless of the object's origin.
    hitArea.setTo((this.width - width) / 2, (this.height - height) / 2, width, height);
  }

  private tweenScale(to: number, duration: number): void {
    this.pressTween?.remove();
    this.pressTween = this.scene.tweens.add({
      targets: this,
      scaleX: to,
      scaleY: to,
      duration,
      ease: 'Quad.easeOut',
    });
  }
}
