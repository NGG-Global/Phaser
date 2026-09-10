# Five vignettes — implementation and QA

## Scope and content

Menu → map → level → result → map. A level is one vignette and several tasks (see [Game design](GAME_DESIGN.md) for the progression curve); tasks hand over with the two-beat table slide, and the music's playback rate steps up on the same downbeat that starts the next task. The result screen records the level (`game/progress.ts`, localStorage), shows stars and either TAP TO CONTINUE back to the map or TAP TO TRY AGAIN. ↻ restarts the level; MAP leaves for the map; both reset the music to its source tempo. There is no infinite difficulty escalation, randomness or new input mechanic.

Progression is `game/levels.ts`: `levelSpec(level)` derives tasks, tempos, tier and clear bar from one difficulty curve, deterministically per level. `MapScene` draws the road from that and from saved progress and never decides difficulty itself. Adjacent half beats are 250 ms apart, closer than two 130 ms Good windows, so the judge's fixed nearest-target cells (midpoint tie to the earlier target) decide those, and Perfect windows never overlap. Four-beat count-ins and handoffs remain intact. Strong/rough outcomes are visual interpretations of the original score, not another judge.

## Bug + Shoe

`BugShoeVignette.ts` owns all cartoon motion and geometry. A cream-soled dark sneaker stomps over a plum bug on sage tiles. The bug looks around, wiggles its antenna and legs, briefly squashes like rubber on contact, then springs onto the toe or escapes beside it. It is never killed or graphically injured. Motion samples audio time: anticipatory lift before known demo beats, immediate contact for player input, a 35 ms pose hold, recovery, sparse contact rings and a final spring. Reduced-motion preference suppresses stage vibration and large transition travel.

`bugSounds.ts` supplies deterministic synthesized thump/rubber tones through the existing generic action/success/rough buffer slots. No external media, per-stroke listeners or timers are used.


## Saw + Timber

`SawTimberVignette.ts` owns the illustration and `sawMotion.ts` its pure curves. A handsaw
cuts a plank cantilevered past two sawhorses, in a deliberately cool palette so it cannot
read as Hammer's warm workshop. One tap is one stroke and direction alternates; maximum
tooth engagement lands on the beat, with the draw back as anticipation and the overshoot as
follow-through. Accurate strokes deepen the kerf and throw sawdust; an extra tap skids and
scuffs, a missed target judders, and neither cuts or invents a stroke. Fresh timber arrives
on the handoff, and an unscored coda severs the plank. Stroke phases are fractions of a
beat, so the stroke tightens with the level's tempo ramp. See [saw notes](SAW_TIMBER.md).

`sawSounds.ts` supplies deterministic bite/skid/judder/sever/creak synthesis. The engine
gained optional `scrape` and `judder` slots on the sound set with a `playAccent` that
no-ops without them, because the action sound is scheduled before the tap is graded; the
host plays them from `showJudgement`.

## Knife + Tomato

`TomatoKnifeVignette.ts` owns the illustration and `tomatoMotion.ts` its pure curves. A
chef's knife slices a tomato on a board in a white-tiled kitchen, the fruit the only
saturated thing in frame. One tap is one rocking chop: the tip stays near the board, the
heel drops, and the edge meeting the board carries the timing; the windup before it and the
rise after it do not. Each accurate chop takes a slice, which topples off the cut and leans
on the pile as a disc showing its cross-section; an extra tap lands on bare board with a
hollow clack and a nick, a missed target leaves the knife hovering with a tremble, and
neither takes a slice. Off chops make the later slices uneven, so a rough ending is visible
before it is announced. A whole tomato arrives on the handoff, and the unscored coda takes
the standing heel; a rough coda squashes the last slice instead. Chop phases are fractions
of a beat, so the knife is always back up before the next possible hit at any tempo. See
[knife notes](TOMATO_KNIFE.md).

`tomatoSounds.ts` supplies a deterministic board knock with a wet element, plus the shared
`scrape`/`judder` accent slots.

## Transitions

Vignettes no longer swap inside a session (each level is one vignette and the map sits between levels), so the impact-ring and squeegee curtain painters were retired; they remain in Git history if a direct level-to-level flow ever wants them.

## Verification

Final checks: typecheck, lint, all 65 tests and the production build pass. A no-input browser session also completed at 0%; repeated restarts during the first transition returned to Hammer without stale scene or sound activity.

Automated coverage includes authored ordering/tempos/lengths, non-overlapping hit windows, three repeated complete sessions at accurate/Good/late/spam input, rejection of demonstration and transition input, cartoon contact/recovery curves, and finite bounded sound buffers. The full suite also retains clock, input, source cancellation, pattern, judgement and lifecycle tests.

Browser sessions completed accurately (100%), with 80 ms-late Good timing (70%), and with rapid taps throughout phases (0%). The spam replay runs at roughly 25 taps/sec through the same DOM/Phaser input path, including demonstration and transition periods. Viewport checks include 390×844, 320×568 and 844×390 landscape returning to portrait. Consecutive restarts and session replays retain one input handler, bounded scene object counts and zero SFX voices at summary. Warning/error logs were empty.

The in-app browser was frequently throttled to roughly 1 fps in this run, despite audio-clock judgement completing correctly; a landscape resize briefly showed normal frame rates. Do not interpret this run as a reliable smooth-motion performance benchmark. Physical mobile touch, mobile Safari, touch-device rotate-to-pause behavior, reduced-motion preference and acoustic latency still require foreground/device QA.

DEV replay buttons: Accurate, Good (+80 ms), Rough (+240 ms), Spam (40 ms intervals). Rough can occasionally match a following offbeat; it is intentionally poor input, not forced zero scoring. `?debug&vignette=bug` starts a single-act preview; normal production starts the whole session. Replays never inject grades or alter judgement.

## Adding content

1. Implement `Vignette` with responsive layout, callbacks, absolute-time update and complete destroy.
2. Register its factory, identity/copy, palette, sound buffers, outcome presentation settings and transition painter.
3. Add it to `VIGNETTES`; levels rotate through the registry in order, so a fourth vignette appears at every fourth level automatically. New rhythmic vocabulary goes into `PATTERN_TIERS`.

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

## Menu and map visual design

Both screens share one raised language: a cast shadow, a darker side wall, a face and a
rim light, so a node, a plate, a chip and the PLAY button all read as the same material
lit from the same direction. `ui/colour.ts` derives every depth tone — shadows, hazed
distance, bevels, sheens — from the five colours an area already authors in `levels.ts`,
so adding an area is still five values.

The road is a Catmull-Rom spline through the level nodes (`ui/path.ts`), sampled fourteen
times per span. Stroking the nodes directly folded the road at every level; the spline
cuts the sharpest turn to under a third of that. It is drawn as a dropped shadow, a
casing, the surface and a top sheen, with markings dashed at an even pitch along the
curve rather than per node. A span that crosses an area boundary is split at its
midpoint, which is exactly where the ground changes, so surface and terrain change on the
same line instead of a node apart.

Depth in the terrain is atmospheric rather than perspective: each band hazes toward its
own sky colour at its far end, boundaries cross-fade over nine bands, and a quiet motif
per area — tufts, staggered paving, ripples, drifts, stones — keeps the ground from
reading as flat paint. Scenery sits beside the road with two silhouettes per area and a
cast shadow each; the shadows are what sell the depth. Stars sit on their own plate so
they never lie on the road surface, area signs are plates sized to their own text (repeat
areas gain a numeral), and locked nodes carry a drawn padlock rather than a dimmed number
alone. The menu adds a scrim behind the type, a progress card previewing the next area's
ground and road, and four dots on the game's own 120 BPM pulse; reduced-motion holds the
dots and the frontier pulse still.

Everything except the frontier pulse, the tap ripple and a 140 ms button press is baked in
`layout()`. Measured in headless Chromium: the heaviest bake the map can be asked for — 82
levels over nine areas, 1,149 road samples — takes about 10 ms, and idle frame rate is flat
across 13, 42 and 82 levels, so geometry volume is not what costs. That renderer caps
around 14 fps regardless, so it says nothing about a real handset; on-device frame rate is
still unmeasured.

## Level map and progression (10 September 2026)

`MapScene` is a vertically scrolling road: level 1 at the bottom, ten levels per themed area, the road continuing twelve levels past the frontier. Drag scrolls with a little inertia; a tap under the slop threshold selects. Cleared nodes are filled with their stars, the frontier pulses, locked nodes are faded and ignore taps. The whole road is one static Graphics rebuilt in `layout()`; only the pulse ring and tap acknowledgement redraw per frame. `PlayScene` receives `{ level, autoStart }`, builds the vignette for that level, and steps `MusicSystem.setRate` on each task's downbeat; the last task's ending schedules the rate back to 1.

Browser check: a fresh profile went menu → map → level 1 (Good replay, 70%, two stars) → TAP TO CONTINUE → map with level 2 unlocked and the frontier moved; level 2 with the Rough replay failed with the bar shown and TAP TO TRY AGAIN restarting the same level; MAP mid-level returned to the road with the music running at rate 1. A seeded profile at level 25 played six tasks from 120 to 134 BPM with the music rate stepping 1 → 1.025 → 1.05 → 1.067 → 1.092 → 1.117 on task downbeats and back to 1 at the end; every plan started exactly on the previous ending's `next`. Console error and warning logs were empty.
