import type Phaser from 'phaser';

import { DESIGN_HEIGHT, DESIGN_WIDTH, LAYOUT } from '@/config/design';
import { readSafeAreaInsets, type SafeAreaInsets } from '@/core/safeArea';

/** An axis-aligned rectangle in game units, with edges precomputed. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

function rect(x: number, y: number, width: number, height: number): Rect {
  return {
    x,
    y,
    width,
    height,
    left: x,
    right: x + width,
    top: y,
    bottom: y + height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

/**
 * Resolves the live layout frame for a scene.
 *
 * Under `Phaser.Scale.EXPAND` the logical game size is not fixed: it tracks
 * the device's aspect ratio, so on a 20:9 handset the world is taller in game
 * units than the 720x1280 design box. Hardcoding design coordinates would put
 * content off-screen on one device and leave dead space on another.
 *
 * Layout code therefore asks the Viewport for one of three frames:
 *
 * - {@link full} — the entire logical area. Backgrounds only; parts of it are
 *   under the notch or off the design box on some devices.
 * - {@link safe} — `full` minus the device safe-area insets. Nothing
 *   interactive should sit outside this.
 * - {@link content} — `safe` inset by {@link LAYOUT.screenPadding}. The
 *   default frame for HUD and gameplay.
 *
 * {@link designBox} is the 720x1280 reference frame, centred. It is the region
 * guaranteed visible on every device, so art that must never be cropped
 * belongs inside it.
 */
export class Viewport {
  /** Whole logical game area. */
  public full: Rect = rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  /** Logical area minus device safe-area insets. */
  public safe: Rect = this.full;
  /** Safe area minus the standard screen padding. */
  public content: Rect = this.full;
  /** The centred design-resolution reference frame. */
  public designBox: Rect = this.full;

  /** Safe-area insets converted from CSS pixels into game units. */
  public insets: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

  /**
   * Game units per CSS pixel. Above 1 the canvas is being downscaled to fit
   * the screen, so a 1-unit stroke lands on less than one physical pixel.
   */
  public unitScale = 1;

  /**
   * Scale of the logical area relative to the design box, taking the smaller
   * axis. Multiply design-space sizes (font sizes, radii) by this to keep
   * their on-screen proportions steady across devices.
   */
  public designScale = 1;

  /** Whether the *canvas* is portrait. Prefer this over the device orientation. */
  public isPortrait = true;

  public constructor(private readonly scale: Phaser.Scale.ScaleManager) {
    this.refresh();
  }

  /**
   * Recomputes every frame from the Scale Manager. Call on scene create and
   * from the Scale Manager's `resize` event — not per game tick.
   */
  public refresh(): this {
    const { width, height } = this.scale.gameSize;
    const display = this.scale.displaySize;

    this.full = rect(0, 0, width, height);
    this.isPortrait = height >= width;

    // `displaySize` is the canvas's on-screen size in CSS pixels, so this
    // ratio converts CSS lengths (safe-area insets) into game units. Guard
    // against a zero display size, which occurs if the parent is display:none.
    this.unitScale = display.width > 0 ? width / display.width : 1;

    const cssInsets = readSafeAreaInsets();
    this.insets = {
      top: cssInsets.top * this.unitScale,
      right: cssInsets.right * this.unitScale,
      bottom: cssInsets.bottom * this.unitScale,
      left: cssInsets.left * this.unitScale,
    };

    this.safe = rect(
      this.insets.left,
      this.insets.top,
      Math.max(0, width - this.insets.left - this.insets.right),
      Math.max(0, height - this.insets.top - this.insets.bottom),
    );

    const pad = LAYOUT.screenPadding;
    this.content = rect(
      this.safe.left + pad,
      this.safe.top + pad,
      Math.max(0, this.safe.width - pad * 2),
      Math.max(0, this.safe.height - pad * 2),
    );

    // The design box is centred and clamped to the logical area, so it stays
    // meaningful even when a device is narrower than the design width.
    const boxWidth = Math.min(DESIGN_WIDTH, width);
    const boxHeight = Math.min(DESIGN_HEIGHT, height);
    this.designBox = rect(
      (width - boxWidth) / 2,
      (height - boxHeight) / 2,
      boxWidth,
      boxHeight,
    );

    this.designScale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);

    return this;
  }

  /** Logical width, in game units. */
  public get width(): number {
    return this.full.width;
  }

  /** Logical height, in game units. */
  public get height(): number {
    return this.full.height;
  }

  public get centerX(): number {
    return this.full.centerX;
  }

  public get centerY(): number {
    return this.full.centerY;
  }

  /**
   * Scales a design-space length for the current viewport, never shrinking
   * below `min`. Used to keep touch targets usable on small screens.
   */
  public scaled(designLength: number, min = 0): number {
    return Math.max(min, designLength * this.designScale);
  }

  /**
   * Enforces the minimum accessible touch target, in game units. Art may be
   * smaller than its hit area; this returns the size the hit area needs.
   */
  public touchTarget(preferred: number): number {
    return Math.max(preferred, this.scaled(LAYOUT.minTouchTarget));
  }
}
