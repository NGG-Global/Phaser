/**
 * The four colours the whole game is keyed to, as Phaser `0xRRGGBB` numbers.
 *
 * They are duplicated in `index.html` as CSS custom properties (`--shell-bg`,
 * `--shell-fg`, `--shell-muted`, `--shell-accent`), the `theme-color` meta tag and
 * `capacitor.config.ts`, because the HTML overlays and the WebView paint before the
 * bundle has loaded. Change all of them together. Everything else on screen derives
 * its tones from one of these or from a vignette's own palette through `ui/colour.ts`.
 */
export const PALETTE = {
  /** The paper: the canvas clear colour and the ground every stage sits on. */
  paper: 0xeee8d8,
  /** The ink: type, outlines, the forged tools. */
  ink: 0x243e35,
  muted: 0x788074,
  /** The coral: the one action colour. */
  coral: 0xcf5134,
} as const;
