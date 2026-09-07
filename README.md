# Phaser Mobile Starter

A mobile-first [Phaser 4](https://phaser.io) game project: portrait, touch-first,
built with TypeScript and Vite. Android is the intended primary platform.

Native packaging (Capacitor, Android tooling) is not included yet — see
[Roadmap](#roadmap).

## Requirements

- Node.js 20.19+ (developed against 22.x)
- npm

## Getting started

```bash
npm install
npm run dev
```

The dev server binds to all interfaces, so a phone on the same network can open
`http://<your-machine-ip>:5173`. Testing on real hardware early is worth the
setup — a desktop browser at a phone-sized viewport does not reproduce touch
latency, GPU fill-rate limits, or Android Chrome's collapsing URL bar.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with HMR on port 5173 |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the built bundle on port 4173 |
| `npm run typecheck` | Type-check without building |

Vite does not type-check on its own, so `npm run build` runs `tsc --noEmit`
first and fails on a type error.

## What the test scene does

`PlayScene` is a deliberately small but complete vertical slice, covering the
things that have to work before any real game code is written:

- **Portrait layout** against a 720x1280 design box.
- **Touch input** — drag the block along its rail, or tap anywhere to send it
  there. Presses are acknowledged visually before anything moves.
- **Horizontal-only dragging**, clamped to the ends of the rail. The vertical
  component of the gesture is discarded, so the block never drifts off its
  track.
- **Responsive layout** — everything is positioned from the live viewport, so
  the same code covers a 4:3 tablet and a 21:9 handset.
- **On-screen diagnostics** — logical size, CSS size, device pixel ratio, scale
  factors, and safe-area insets. These are the numbers needed to diagnose a
  layout problem on a device with no console attached.

## Architecture

```
src/
  main.ts              Entry point; creates the game, reports boot failure
  config/              Design constants, game config, scene keys, palette
  core/                Viewport, BaseScene, safe-area probe, DOM shell
  input/               Reusable input behaviours
  objects/             Game objects
  scenes/              Boot, Preload, Play
  textures/            Procedural placeholder art
```

Two pieces carry most of the mobile-specific work:

**`core/Viewport.ts`** resolves the live layout frame. The game runs under
`Phaser.Scale.EXPAND`, so the logical game size is not constant — it tracks the
device's aspect ratio (720x1559 on a 20:9 phone, 960x1280 on a 4:3 tablet).
Layout code asks the viewport for `full`, `safe`, `content`, or `designBox`
rather than hardcoding coordinates.

**`core/BaseScene.ts`** splits scene setup into `build()` (create objects, runs
once) and `layout()` (position them, runs on every viewport change), and owns
the resize subscription and teardown. On Android a resize is routine, not an
edge case.

`CLAUDE.md` documents the conventions in full, including several
version-specific traps in this stack that are easy to reintroduce.

## No binary assets

The repository ships no images. Placeholder art is generated procedurally at
boot in `textures/generateCoreTextures.ts`. Real assets go in `public/assets/`
and load in `PreloadScene.preload()`, which already has the progress-bar
plumbing in place.

## Orientation

The game is portrait-only. A browser cannot enforce that — the Screen
Orientation API can lock orientation only from fullscreen on Android — so a
touch device held in landscape gets a "rotate your device" prompt instead. The
prompt is gated on a coarse pointer, so a landscape desktop window is left
alone.

## Roadmap

Not yet in scope, in rough order:

1. Capacitor and the Android build (orientation lock moves to the native
   manifest at that point).
2. Real assets as a texture atlas.
3. Audio, with the mobile autoplay-unlock gesture.
4. Persistence.
