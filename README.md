# Small Acts — a three-act rhythm game

**Current music update:** four synchronized WAV stems play continuously, including through the session summary. All acts run at fixed configured 120 BPM; no music tempo progression is active. The one-beat pickup is retained and the first gameplay downbeat is calculated musically. Stem levels and URLs live in `src/config/music.ts`. DEV `?debug` adds stem mute/restore buttons and diagnostics. See [music implementation and metadata caveat](docs/MUSIC.md); the supplied 120/121 BPM discrepancy needs confirmation. Earlier tempo/session-duration notes below describe the music-free milestone.

The current vertical slice is a finite ~43-second session: **Hammer + Nail → Window Cleaning → Bug + Shoe → summary**. Tap anywhere to begin, watch each four-beat count-in/demonstration, then reproduce the rhythm with TAP. Each act has its own payoff and an action-inspired musical transition. The final summary shows average accuracy; tap to play again. ↻ always restarts the entire session; ♪ mutes sound.

Authored progression lives in `src/game/session.ts`: steady taps at 86 BPM, an offbeat at 96 BPM, then an eight-beat phrase at 104 BPM. Vignette factories, sound sets, copy and transition painters live in `src/vignettes/registry.ts`. No random difficulty, swipe/hold input or music assets are added. See [vertical-slice notes](docs/VERTICAL_SLICE.md).

DEV `/?debug` includes Accurate, Good, Rough and Spam replay, all through Phaser pointer input. `?debug&vignette=bug` previews the final act only. Normal production always starts with Hammer.

## Previous two-vignette milestone

The game now alternates automatically between a three-task Hammer round and a three-task Window Cleaning round. Window uses TAP-driven squeegee strokes, removable grime, clearer reflections and a glint/drip ending. A cream-colored panel sweeps across the screen on the musical transition; there is no inter-round loading screen. ↻ restarts the current vignette's round. No Bug vignette or swipe input is implemented.

See [Window and vignette API notes](docs/WINDOW_CLEANING.md). The single-vignette notes below describe the earlier milestone. Development-only `/?debug&vignette=window` opens Window directly; Accurate/Rough replay continues across alternating rounds.

Each round contains three Hammer + Nail tasks. Tap anywhere to begin: four preparation beats, watch, four handoff beats, then repeat. Successful hits drive the nail deeper. After each flush/crooked ending, the table slides automatically into the next nail on the same musical grid. After task three, tap **Another round**. ↻ restarts the entire round; ♪ toggles sound. There are no other vignettes.

Default tempo is 100 BPM in 4/4. Phrases are padded with trailing rests to whole bars without changing their hits. Optional backing-music support is ready but no track is loaded; see [music integration](docs/MUSIC.md).

Art is procedural Phaser geometry with a small generated paper-grain texture. Hammer impacts are locally synthesized Web Audio buffers. The existing rhythm controller, scheduler, input adapter and judgement/scoring functions remain authoritative. See [Hammer implementation notes](docs/HAMMER_NAIL.md).

For development QA only, `/?debug` shows timing/resource counters and **Accurate replay / Rough replay** controls. These dispatch synthetic DOM mouse events through the normal Phaser input adapter; they do not inject grades. Production builds omit the QA controls.

## Previous timing prototype

The default Play scene is a mobile call-and-response rhythm prototype. Tap **Start / Restart**, watch/listen to the circle, then tap the game area to repeat the phrase. **Pattern** cycles three authored phrases and **BPM** cycles 80/100/120; both start a fresh round. **Sound** toggles mute. Restart repeats the current settings. Use touch or the primary mouse button; no keyboard, holds or swipes yet.

Perfect is within ±55 ms; Good is within ±130 ms; otherwise Miss. Extra taps are shown as Miss and penalize the weighted accuracy. Timing constants live in `src/config/rhythm.ts`. Audio is synthesized and scheduled on the Web Audio clock; the circle is temporary debug art. The small voices/input-handler readout helps verify restart cleanup.

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

See [Game design](docs/GAME_DESIGN.md) and [Technical architecture](docs/TECHNICAL_ARCHITECTURE.md). Their implementation notes distinguish this timing-only prototype from future vignette work.

## Original starter foundation

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

## Original drag scene (replaced by Rhythm Lab)

The original `PlayScene` was a deliberately small test, covering the
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
  input/               Unified timestamped taps; legacy drag helper unused
  audio/               Web Audio engine and output-clock mapping
  rhythm/              Patterns, scheduling and pure timing judgement
  game/                Round controller and score calculation
  objects/             Legacy starter player (unused)
  scenes/              Boot, Preload, Rhythm Lab in Play
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
3. Vignette art and action samples (prototype click audio/unlock now implemented).
4. Persistence.
