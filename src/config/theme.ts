/**
 * The four colours the whole game is keyed to, as Phaser `0xRRGGBB` numbers.
 *
 * They are duplicated in `index.html` as CSS custom properties (`--shell-bg`,
 * `--shell-fg`, `--shell-muted`, `--shell-accent`), the `theme-color` meta tag and
 * `capacitor.config.ts`, because the HTML overlays and the WebView paint before the
 * bundle has loaded. Change all of them together. Everything else on screen derives
 * its tones from one of these or from a vignette's own palette through `ui/colour.ts`.
 *
 * `muted` is the supporting ink — captions, miss marks, the DOM overlay note — and has
 * to hold a 4.5:1 contrast against `paper`. A lighter sage washed out on the cream.
 */
export const PALETTE = {
  /** The paper: the canvas clear colour and the ground every stage sits on. */
  paper: 0xeee8d8,
  /** The ink: type, outlines, the forged tools. */
  ink: 0x243e35,
  muted: 0x4e5a52,
  /** The coral: the one action colour. */
  coral: 0xcf5134,
} as const;

/**
 * Workshop surfaces that every chrome scene shares: the hanging-sign timber, the
 * painted cream on it, the compact puck, the bench the next-level block sits on.
 * Vignettes keep their own palettes; these are the shell, not the acts.
 */
export const SHELL = {
  cream: 0xfff4dc,
  puck: 0xf6ead0,
  wood: 0xd98a48,
  rope: 0x6b4a2e,
  bench: 0xe6dcc4,
  sun: 0xdfc37f,
} as const;
