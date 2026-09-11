# Window Cleaning — implementation and architecture review

## Visual behavior

The cool scene uses lavender wall `#e5dfe8`, plum framing `#756278`, blue glass `#a8ced4` and an apricot glove. The window is a large rounded architectural form with an abstract landscape, sun reflection, diagonal highlights and a deep sill. A vertical squeegee blade makes lateral strokes in 230 ms, fitting even the existing 300 ms double. Motion, grime removal and droplets are sampled from absolute audio time. Every accepted tap starts motion immediately; successful judgement separately marks a cleaning band. An early accepted tap during handoff still moves the tool.

Demonstration beats clear the same bands; handoff restores the dirty surface. Successful final presentation clears remaining grime without re-dirtying already cleaned bands, strengthens the reflection and turns the reflected sun into a four-point glint. Poor performances retain grime and a short pale drip. Neither changes the numerical task result.

Graphics are deterministic local geometry. The dirt consists of a fixed small grid of irregular translucent marks, redrawn with its cleaning state; there are no dynamic texture masks, external assets, per-stroke display objects, listeners or timers. The Window owns one root container and a background; destroying it recursively destroys its tool, glass, grime, glints and droplets. Hammer's single cached paper texture is deliberately retained as a reusable asset; its display objects are destroyed on replacement.

## What the API review changed

The original callback shape was sufficient for the second mechanic presentation. The coupling was in the host: Hammer construction, color, copy, finishing constants, sound-profile selection and a method named `translateTable` were hardcoded there.

- `Vignette.ts` makes the lifecycle contract explicit; `onAccuracy` carries hits, omissions and extra taps, so a separate miss channel was unnecessary.
- `registry.ts` owns vignette-specific data, factories and sound-buffer generation.
- `translate(offset)` replaces the Hammer-specific transition name.
- `AudioEngine` accepts a generic three-buffer sound set. Hammer uses thock/flush/bent; Window uses wipe/glint/rough squeak. Replacing the set first cancels every old SFX voice.
- Common bounded easing moved to `motion.ts`; no Window file imports Hammer behavior.

The rhythm engine, patterns and TAP input path were not edited for this feature. New content should need a visual class, sound data and one registry entry.

## Flow and testing

Three Hammer tasks → musical paper wipe → three Window tasks → musical paper wipe → repeat. Task transitions retain the existing slide; inter-vignette replacement is covered by an opaque cream panel, not a fade or loading screen. Both sound sets are generated locally. Music, when supplied later, remains a shared continuous bedding layer rather than an outgoing vignette sound.

DEV `/?debug&vignette=window` starts directly in Window. Accurate/Rough replay uses DOM mouse events through normal Phaser input and continues across round boundaries. Debug shows current vignette/task, SFX voices, listener count, top-level object count, timing error and observed frame rate. Production has no direct-start override or replay controls.

Verification: typecheck, lint, the full test suite and the production build pass. Browser play covered accurate and rough Window results, alternating Window → Hammer → Window rounds, repeated restarts, and 320×568, 390×844 and 430×932 layouts. Observed roughly 60–65 fps, one pointer handler, stable 13 Window / 14 Hammer top-level objects, and zero SFX voices between phrases/results. Console warning/error checks were empty. Tests cover deterministic bounded Window synthesis and sound-set replacement canceling old sources independently of music.

Physical touch devices, mobile Safari, reduced-motion preference, and actual acoustic synchronization still need device/listening QA. Browser timing replay validates the input/judgement path but does not measure speaker or digitizer latency.
