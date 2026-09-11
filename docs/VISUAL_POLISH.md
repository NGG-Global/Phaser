# Visual and navigation refinement

## Design

- The title is a printed-cover composition: larger serif type, a quieter caption,
  coral tempo dots, and a matte full-width action. The next-level information sits
  directly on the paper instead of inside a glossy score-style card.
- Hammer has an opt-in cover framing that leaves room for the title on short
  screens. Its gameplay scale, poses, sounds and contact timing are unchanged.
- The road uses a softer sage/sand palette, a coral current-level marker and a
  persistent next-level dock. Locked levels remain discoverable but subordinate.
  Tapping one gives a short, local nudge and explains the next available step.
- Navigation uses a 320 ms diagonal paper sweep with a narrow coral edge. A
  completed outgoing sweep remains opaque until scene shutdown, avoiding a flash
  when Phaser queues the scene change. Reduced-motion users get an immediate cut.
- Gameplay replaces the task-number string with quiet progress marks and gently
  reveals the result stars. Essential navigation targets are separated by at
  least 56 CSS pixels, with at least 48 CSS pixel hit areas.

## Boundaries

`SceneCurtain` owns only screen-navigation motion. It cancels its tween and update
listener at shutdown, prevents repeated navigation, and releases the new level's
start callback after the illustration is revealed. It never shifts an active
rhythm grid. Musical task transitions, Web Audio scheduling, input timestamps,
judgement, difficulty and scores are unchanged. The edit in `game/levels.ts` is
only the Grass palette.

The map retains its own scrolling input, now with pointer ownership, cancellation
on blur/touch cancellation, desktop wheel input, bounded inertial steps, and a
resize anchor that preserves the viewed stretch of road. UI navigation stops
outgoing action voices; shared background music retains its existing lifetime.

## Verification

- Typecheck, lint, production build and 117 tests across 17 files pass.
- New tests cover frame-rate-independent inertia, resize anchoring, stalled-frame
  bounds, transition re-entry, late callbacks after shutdown and reduced motion.
- Browser inspection: 320×568, 390×844, 430×932 and 800×600. Title/tool collisions
  are resolved; controls and next-level information remain within the layout.
- Scrolled between map areas and resized while browsing; the same stretch of road
  remained visible. Tested locked-level feedback and next-level dock navigation.
- An accurate Hammer level completed at 100%; a deliberately rough Window level
  completed at 0%. Both used the existing development replay controls, which send
  mouse events through the normal input path.
- Rapid restarts, leaving during play, and Menu → Map → Play → Map → Menu were
  exercised. The debug readout stayed at one pointer handler and stable object
  counts (17 Hammer / 16 Window); debug controls disappeared on scene exit.
- Observed roughly 60–61 fps during the browser runs and no warning/error console
  entries. This is not a physical-device performance or latency certification.

Remaining device QA: real multitouch and interrupted gestures, native safe-area
insets, Android/iOS audio latency, and OS reduced-motion behavior. The reduced
motion transition path is covered by automated tests, not an OS-setting run.
