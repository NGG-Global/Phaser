# Three small acts — implementation and QA

## Scope and content

One authored session of three **rounds**, each three **tasks** of a single vignette: Hammer ×3 → Window ×3 → Bug ×3 → summary, roughly 100 seconds at 120 BPM. Consecutive rounds always change vignette (`validateSession` rejects a repeat). Inside a round, tasks hand over with the two-beat table slide and no curtain; a round boundary adds the outgoing vignette's transition painter. The summary uses the mean of all task accuracies. Another tap restarts from the first task; the top ↻ control does the same during any phase, and MENU returns to the title screen while the music keeps playing. There is no infinite difficulty escalation, randomness or new input mechanic.

Progression is `game/session.ts`: `SESSION` is a list of rounds (`{ vignette, tasks }`) and `sessionTasks()` flattens it for the host, which advances one task at a time. Hammer teaches quarter-note phrases, Window adds one offbeat per phrase, Bug combines both over eight beats. Everything plays at the music's measured 120 BPM (see [Music](MUSIC.md)). Adjacent half beats are 250 ms apart, closer than two 130 ms Good windows, so the judge's fixed nearest-target cells (midpoint tie to the earlier target) decide those, and Perfect windows never overlap. Four-beat count-ins and handoffs remain intact. Strong/rough outcomes are visual interpretations of the original score, not another judge.

## Bug + Shoe

`BugShoeVignette.ts` owns all cartoon motion and geometry. A cream-soled dark sneaker stomps over a plum bug on sage tiles. The bug looks around, wiggles its antenna and legs, briefly squashes like rubber on contact, then springs onto the toe or escapes beside it. It is never killed or graphically injured. Motion samples audio time: anticipatory lift before known demo beats, immediate contact for player input, a 35 ms pose hold, recovery, sparse contact rings and a final spring. Reduced-motion preference suppresses stage vibration and large transition travel.

`bugSounds.ts` supplies deterministic synthesized thump/rubber tones through the existing generic action/success/rough buffer slots. No external media, per-stroke listeners or timers are used.

## Action-connected transitions

The registry now supplies a transition painter rather than the host choosing by vignette id. Hammer's last contact expands a warm pressure ring into the next scene. Window's rubber blade clears a pale glass-colored strip across the viewport. These effects use the outgoing act's existing two-beat slide interval and cover the scene swap at its midpoint. The next count-in is scheduled ahead on the planned downbeat, independent of frame rate or transition completion.

## Verification

Final checks: typecheck, lint, all 65 tests and the production build pass. A no-input browser session also completed at 0%; repeated restarts during the first transition returned to Hammer without stale scene or sound activity.

Automated coverage includes authored ordering/tempos/lengths, non-overlapping hit windows, three repeated complete sessions at accurate/Good/late/spam input, rejection of demonstration and transition input, cartoon contact/recovery curves, and finite bounded sound buffers. The full suite also retains clock, input, source cancellation, pattern, judgement and lifecycle tests.

Browser sessions completed accurately (100%), with 80 ms-late Good timing (70%), and with rapid taps throughout phases (0%). The spam replay runs at roughly 25 taps/sec through the same DOM/Phaser input path, including demonstration and transition periods. Viewport checks include 390×844, 320×568 and 844×390 landscape returning to portrait. Consecutive restarts and session replays retain one input handler, bounded scene object counts and zero SFX voices at summary. Warning/error logs were empty.

The in-app browser was frequently throttled to roughly 1 fps in this run, despite audio-clock judgement completing correctly; a landscape resize briefly showed normal frame rates. Do not interpret this run as a reliable smooth-motion performance benchmark. Physical mobile touch, mobile Safari, touch-device rotate-to-pause behavior, reduced-motion preference and acoustic latency still require foreground/device QA.

DEV replay buttons: Accurate, Good (+80 ms), Rough (+240 ms), Spam (40 ms intervals). Rough can occasionally match a following offbeat; it is intentionally poor input, not forced zero scoring. `?debug&vignette=bug` starts a single-act preview; normal production starts the whole session. Replays never inject grades or alter judgement.

## Adding content

1. Implement `Vignette` with responsive layout, callbacks, absolute-time update and complete destroy.
2. Register its factory, identity/copy, palette, sound buffers, outcome presentation settings and transition painter.
3. Add a round `{ vignette, tasks }` to `SESSION`, or more tasks to an existing round; consecutive rounds must differ in vignette.

Do not add vignette-specific rules to `RoundController`, `judge.ts`, `TapInput`, or `AudioClock`.

## QA pass (10 September 2026)

Method: repeated headless Chromium sessions through the DEV replay buttons and real pointer taps at 320×568, 360×640, 390×844, 412×915, 430×932, 768×1024 and 1024×768, restart storms during count-in, slides and vignette swaps, visibility loss mid-round and while idle, viewport shrink and rotation, plus onset analysis of the stems.

Fixed in this pass:

- The count-in grid ran at 120 BPM against 121 BPM stems with the downbeat assumed 0.5 s in; the grid drifted 4 ms per beat and was about half a beat off the drums by the third act. Tempo and pickup now match the measured file.
- `SESSION` acts carried 86/96/104 BPM values that were never played; the test asserting hit-window spacing validated those tempos rather than the real one. The field is gone and the test uses the music tempo.
- The headline `Text` had its font size set every frame, re-measuring and re-rasterising its canvas each time. It now changes only when the size does.
- Window grime (about 400 ellipses) and the Hammer timber grain were tessellated every frame at full resolution; JS frame cost roughly halved for both after coarser segments with no visible change.
- Losing visibility on the idle title froze the hammer's idle sway until the next round. The illustration is only paused when a round or start was in progress.
- An AudioContext `resume()` that never settles left the scene at ONE MOMENT indefinitely; unlock now fails after three seconds with the retry prompt.
- The pause copy said the interrupted act would be repeated; a resume restarts from the first act, and the copy now says so.
- Every page load logged a favicon 404.

Not changed, but observed: the outcome headline is fully legible for well under a second before the scene slides away, because it is tied to the two-beat ending grid; the stall detector (250 ms between pumps) pauses the round on heavily loaded renderers, which is by design but means slow devices see "Take a breath" on the first heavy frame; the canvas backing store is the logical 720-wide size regardless of device pixel ratio, so high-DPI handsets upscale the render; taps during the demonstration receive no acknowledgement; Perfect and Good are visually identical and omissions have no immediate cue in Hammer or Bug.

## Main menu and shared audio (10 September 2026)

`MenuScene` is the first interactive scene: title, a one-line invitation, the round/task count, a PLAY button anchored a fixed distance above the bottom edge, and the sound toggle. The hammer illustration's idle sway is reused as the title art. PLAY is the audio gesture: it creates or reuses the game-wide `AudioEngine` (`audio/sharedAudio.ts`, held in the Phaser registry and disposed with the game), awaits unlock and stem loading, then starts `PlayScene` with `autoStart`, which begins the first count-in on its create event. PlayScene no longer owns or disposes the engine; leaving for the menu cancels its voices and lets the music run on. `RoundController` now tolerates a pump stall that ends inside the count-in, because the scene switch and the first heavy frames of a fresh scene land there and no beat has been shown or judged yet; any later stall still pauses the attempt.

Browser check: menu → PLAY reached the first count-in in about 6.7 s (161 MB of stems from localhost), nine tasks completed with the expected slides and two curtains, MENU mid-round and from the summary returned to the title with seven stems still running and one pointer handler, and PLAY again started a fresh session. Console error and warning logs were empty.
