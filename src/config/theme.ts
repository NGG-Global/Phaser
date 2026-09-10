/**
 * Colour palette, as Phaser-friendly `0xRRGGBB` numbers.
 *
 * The shell colours are duplicated in `index.html` (as CSS custom properties)
 * because the HTML overlays paint before the bundle has loaded. Change both
 * together — the constants below carry the CSS name they mirror.
 */
export const COLORS = {
  /** Mirrors `--shell-bg`. */
  background: 0xeee8d8,
  backgroundDeep: 0x080b12,
  surface: 0x1a2130,
  surfaceRaised: 0x243044,

  /** Mirrors `--shell-accent`. */
  accent: 0xcf5134,
  accentDim: 0x2a7f9e,
  player: 0xf7b267,
  playerActive: 0xffd6a0,

  /** Mirrors `--shell-fg`. */
  text: 0x243e35,
  /** Mirrors `--shell-muted`. */
  textMuted: 0x788074,

  track: 0x243044,
  trackEdge: 0x33415c,
  /** Tints the area outside the guaranteed design box, to make bleed visible. */
  bleed: 0x0b0f18,
} as const;

/** Same palette as CSS hex strings, for Phaser text styles and DOM writes. */
export const CSS_COLORS = {
  text: '#243e35',
  textMuted: '#788074',
  accent: '#cf5134',
} as const;

/** Font stack for Phaser `Text` objects — system fonts only, so nothing loads. */
export const FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
