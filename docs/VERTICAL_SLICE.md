# Three small acts — implementation and QA

## Scope and content

One authored session, approximately 43 seconds: Hammer → Window → Bug → summary. The summary uses the mean of the three task accuracy percentages. Another tap restarts from Hammer; the top restart control does the same during any phase. There is no infinite difficulty escalation, randomness or new input mechanic.

Progression is `game/session.ts`, separate from visual registration. It starts with three straight taps at 86 BPM, introduces a final half-beat at 96, then extends to a repeated eight-beat phrase at 104. Minimum target spacing is about 288 ms, above the combined 260 ms Good-window width. Four-beat count-ins and handoffs remain intact. Strong/rough outcomes are visual interpretations of the original score, not another judge.

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
3. Add an authored `{ vignette, bpm, pattern }` entry to `SESSION`.

Do not add vignette-specific rules to `RoundController`, `judge.ts`, `TapInput`, or `AudioClock`.
