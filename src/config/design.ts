/**
 * Design-space constants.
 *
 * The game is authored against a fixed portrait "design resolution" and the
 * Scale Manager maps that onto whatever the device actually reports. Scene
 * code must never read these numbers to position anything — it lays out
 * against the live {@link import('../core/Viewport').Viewport}, which accounts
 * for the device's real aspect ratio and safe-area insets. These values only
 * define the reference frame and the limits of it.
 */

/**
 * Authoring resolution: 720x1280 (9:16).
 *
 * Chosen deliberately over a 1080p design box. Under `Phaser.Scale.EXPAND` the
 * canvas backing store tracks the logical game size, so a smaller design box
 * means fewer fragments per frame. On a mid-range Android handset the GPU, not
 * the CPU, is usually the constraint, and 720p upscaled by the compositor is
 * visually indistinguishable from 1080p at phone viewing distance while
 * costing roughly half the fill rate.
 */
export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

/** Design-space aspect ratio (width / height), ~0.5625. */
export const DESIGN_ASPECT = DESIGN_WIDTH / DESIGN_HEIGHT;

/**
 * Layout metrics in design units. Scene code scales these through the
 * Viewport rather than using raw pixel numbers inline.
 */
export const LAYOUT = {
  /** Minimum gap between interactive content and the screen edge. */
  screenPadding: 28,
  /**
   * Minimum touch target, in design units. 88 design units is ~48 CSS px on a
   * 720-wide design box rendered to a typical phone width, which is the
   * Material Design accessible minimum. Anything the player taps should meet
   * this even when its art is smaller.
   */
  minTouchTarget: 88,
  /** Vertical space reserved for the diagnostics header. */
  headerHeight: 190,
  /** Distance from the bottom safe edge to the drag track's centre line. */
  trackOffsetFromBottom: 260,
} as const;

/** Fixed z-ordering for the play scene. Keeps depth values in one place. */
export const DEPTH = {
  background: 0,
  track: 10,
  player: 20,
  hud: 30,
  debug: 40,
} as const;
