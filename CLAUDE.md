# Development guidelines

Mobile-first Phaser 4 game project. Portrait, touch-first, with Android as the
intended primary platform.

These are the conventions for this repository. Where a rule states a reason,
the reason is the rule — if it no longer applies, change the rule deliberately
rather than working around it.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with HMR on port 5173, exposed on the LAN |
| `npm run build` | Type-check, then produce the production bundle in `dist/` |
| `npm run preview` | Serve the built bundle on port 4173 |
| `npm run typecheck` | Type-check only |

`npm run build` runs `tsc --noEmit` first, so a type error fails the build.
Vite does not type-check on its own — `npm run dev` will happily serve code
that does not compile. Run `npm run typecheck` before assuming work is done.

### Testing on a real device

The dev server binds to all interfaces, so a handset on the same network can
load `http://<dev-machine-ip>:5173`. Do this early and often. A desktop browser
at a phone-sized viewport does not reproduce touch latency, digitiser jitter,
GPU fill-rate limits, or the URL bar collapsing mid-frame.

## Stack

- **Phaser 4.2.x** — `Phaser.AUTO` renderer (WebGL, canvas fallback)
- **TypeScript 7** — strict, plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`
- **Vite 8** — bundles with **Rolldown**, not Rollup
- **npm**

Three version-specific traps, all of which cost time if assumed away:

1. **TypeScript 7 removed `baseUrl`.** Entries in `paths` must be relative
   (`"@/*": ["./src/*"]`).
2. **Vite 8 uses Rolldown.** Chunking is `build.rollupOptions.output.codeSplitting.groups`.
   Rollup's `manualChunks` object form is not supported — only a function, and
   it is deprecated.
3. **Phaser 4 ships `export = Phaser`** typings against an ESM runtime build.
   `import Phaser from 'phaser'` is the form used here; named imports also work
   but do not meaningfully shrink the bundle, since the engine is monolithic.

## Project layout

```
src/
  main.ts              Entry point; creates the game, reports boot failure
  config/
    design.ts          Design resolution, layout metrics, depth ordering
    game.ts            Phaser game config (every non-default value is justified)
    scenes.ts          Scene keys
    theme.ts           Palette and font stack
  core/
    BaseScene.ts       Scene base class owning the build/layout lifecycle
    Viewport.ts        Live layout frames (full / safe / content / designBox)
    safeArea.ts        Reads env(safe-area-inset-*) via a probe element
    shell.ts           Controls the DOM overlays in index.html
  input/
    HorizontalDragBehaviour.ts   Reusable axis-constrained drag
  objects/
    Player.ts          The draggable player
  scenes/
    BootScene.ts       Input tuning, orientation guard
    PreloadScene.ts    Asset loading and progress bar
    PlayScene.ts       The playable test scene
  textures/
    generateCoreTextures.ts   Procedural placeholder art
```

Add new directories along the same axis — by role, not by feature — until a
feature grows large enough to own a folder of scenes and objects together.

## The scaling model

This is the single most important thing to understand before touching layout.

The game is authored against a **720x1280 design box** and runs under
`Phaser.Scale.EXPAND`. Under EXPAND the logical game size is **not constant**.
Phaser anchors whichever axis makes the design box fit and expands the other to
match the device's aspect ratio:

| Device | Logical game size |
| --- | --- |
| 393x851 phone (20:9) | 720 x 1559 — width anchored, height expanded |
| 375x667 phone (16:9) | 720 x 1281 — close to the design box |
| 768x1024 tablet (4:3) | 960 x 1280 — height anchored, width expanded |

`EXPAND` is used instead of `FIT` because `FIT` letterboxes: on a 20:9 handset
that is black bars across roughly a fifth of the screen. The cost of EXPAND is
that no coordinate can be hardcoded.

### Rules that follow from it

- **Never position anything using `DESIGN_WIDTH` / `DESIGN_HEIGHT`.** They
  define the reference frame; they are not the runtime screen size.
- **Never use `this.scale.width` directly in layout code.** Go through
  `this.viewport`, which also accounts for safe-area insets.
- Pick the right frame for the job:
  - `viewport.full` — backgrounds only. Extends under the notch.
  - `viewport.safe` — `full` minus device safe-area insets. Nothing
    interactive may sit outside this.
  - `viewport.content` — `safe` inset by `LAYOUT.screenPadding`. The default
    for HUD and gameplay.
  - `viewport.designBox` — the centred 720x1280 frame. Guaranteed visible on
    every device, so art that must not be cropped goes here.
- Scale design-space lengths with `viewport.scaled(n)`; get hit-area sizes from
  `viewport.touchTarget(n)`.

### Scene lifecycle

Scenes that lay anything out extend `BaseScene` and implement two methods:

- `build()` — create game objects. Runs **once**.
- `layout()` — position and size them. Runs on create **and on every viewport
  change**.

`layout()` must be idempotent: no object creation, no event listeners, no
tweens started. `BaseScene` handles the resize subscription, the camera resize,
and unsubscribing on shutdown. Do not override `create()`.

Use `onResize()` for post-resize work that is not layout, such as regenerating
a texture at a new resolution.

A resize is a routine event on Android, not an edge case — Chrome collapses its
URL bar, the keyboard opens, the device rotates. Assume `layout()` runs often.

## Touch input

- **Design for the thumb.** Interactive elements belong within reach of the
  bottom edge. Note that thumb reach is an *absolute* distance from where the
  hand grips the device, so anchor controls at a fixed offset from the bottom
  (`LAYOUT.trackOffsetFromBottom`) rather than at a fraction of the height,
  which drifts out of reach on a tall handset.
- **Honour the minimum touch target.** `LAYOUT.minTouchTarget` (88 design
  units, ~48 CSS px) is the accessible floor. Hit areas are expressed in
  texture-local units and therefore shrink with an object's scale, so small art
  needs its hit area widened explicitly — see `Player.refreshHitArea`.
- **Constrain gestures deliberately.** A thumb travelling horizontally always
  drifts vertically. `HorizontalDragBehaviour` applies the horizontal component
  and discards the vertical one. Do not use Phaser's raw drag for an
  axis-locked control.
- **Support tap as well as drag.** Reaching across a large phone to drag is
  uncomfortable; tap-to-position is often the gesture players actually use.
- **Acknowledge every touch visually**, before any movement happens.
- **Leave `input.smoothFactor` at 0.** Phaser computes
  `x = newX * smoothFactor + previousX * (1 - smoothFactor)`, so the value is
  the weight of the *new* sample — a low non-zero value such as `0.2` keeps 80%
  of the previous position and lags the finger by roughly 45 game units at the
  end of a fast swipe. `0` and `1` both mean "use the exact position".

## Configuration traps

Verified by testing, and easy to reintroduce:

- **Do not set `scale.min` / `scale.max`.** They clamp the **display** size in
  CSS pixels, not the logical game size. A floor of 480 CSS px forces the
  canvas wider than a 393 px handset screen, and `autoCenter` then centres the
  overflow so content is clipped off *both* edges. Bound the logical size in
  `Viewport` instead.
- **Keep `scale.expandParent: false`.** `#game-root` is sized by CSS using
  `100dvh`, which is what keeps the canvas stable while Android Chrome
  collapses its URL bar. Letting Phaser style the parent fights that.
- **Keep `base: './'` in the Vite config.** An Android WebView serves the
  bundle from local storage, where absolute `/assets/...` URLs 404.
- **Leave `render.powerPreference` at `'default'`.** A phone has one GPU, so
  `'high-performance'` mostly opts out of power management — a poor trade for a
  2D game, costing battery life and bringing on thermal throttling sooner.

## Assets

The repository ships **no binary assets**. Placeholder art is generated at boot
in `textures/generateCoreTextures.ts` and looked up by key from `TextureKey`.

Real assets go in `public/assets/` and load in `PreloadScene.preload()`. Prefer
one texture atlas over many loose images: each separate texture is a
state change for the GPU, and on mobile draw-call count is usually what limits
frame rate. Generate textures larger than their on-screen size — scaling down
is nearly free, scaling up is visibly soft.

## Orientation

The game is portrait-only. On the web this can only be requested, not enforced:
the Screen Orientation API can lock orientation only from fullscreen on
Android, and fullscreen needs a user gesture. `BootScene` therefore shows the
`#orientation-overlay` prompt while a **touch** device is held in landscape —
gated on `pointer: coarse` so a landscape desktop window, a normal development
setup, is never nagged.

A native build declares the lock in its manifest and never shows this prompt.

## Style

- TypeScript strict mode is non-negotiable; do not add `any` or
  `@ts-expect-error` to move past a type error.
- Name things after what they do in the game, not after their Phaser type.
- Comment the *why*, not the *what*. The comments worth keeping here are the
  ones recording a decision and its trade-off; a comment restating the code is
  noise.
- Keep magic numbers in `config/design.ts` or as a named constant at the top of
  the file that uses them.
- `window.__PHASER_GAME__` exposes the running game in **development builds
  only** — useful from a device's remote console. Do not depend on it in game
  code.

## Not yet in scope

Capacitor and the Android toolchain are deliberately absent. The groundwork
that matters for adding them later is already in place: relative asset base,
touch-first input, safe-area handling, and no dependence on a web-only API.

When native packaging is added, the orientation lock moves to the native
manifest and the DOM prompt becomes a fallback for the browser build.
