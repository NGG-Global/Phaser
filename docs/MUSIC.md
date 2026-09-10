# Synchronized composition stems

## Files and inspection

Unmodified files: `bgm/0 Drums.wav`, `bgm/1 Bass.wav`, `bgm/2 Keyboard.wav`, `bgm/3 Synth.wav`. All are stereo 16-bit PCM at 48 kHz with 2,475,742 frames: **51.577958333 seconds**. Browser decoding also reported matching 51.577958-second buffers. SHA-256 checks of source and production assets matched for each file. No trimming, normalization, independent offsets or time stretching occurred.

## Musical metadata (measured)

The tempo was previously configured as 120 BPM with a note that the composer had also said 121. Onset analysis of `0 Drums.wav` (2 ms RMS hops, comb-filter tempo scan from 110 to 130 BPM in 0.05 steps) settles it: **121 BPM** scores roughly ten times higher than 120 or any neighbour, and the 51.577958 s file is 104.016 beats at 121, i.e. 26 bars within 8 ms, so the file loops cleanly on a bar. At 120 it would be 103.16 beats and the count-in would drift 4 ms per beat, landing about half a beat off the drums before the third act. `config/music.ts` now records `sourceBpm: 121`, `pickupBeats: 0.5`.

The first beat lands about 0.248 s into the file, an eighth note after the opening drum hit; the harmonic stems enter one beat later. Bar phase (which of those beats is "one") is inferred from kick accents, which are strongest at beats 0, 2 and every eighth beat from 0.248 s, and from the drum pattern reading as `X X X -` per bar from there. This inference should be confirmed with the composer; if the downbeat is actually 0.744 s, change `pickupBeats` to 1.5. Either way the beat grid is the same, so the count-in stays on the beat.

The first musical downbeat is `sharedStart + pickupBeats * 60 / sourceBpm`. Source playback starts at zero and the pickup is audible. File-loop boundaries and musical bar boundaries coincide to within 8 ms per loop at this tempo.

## Playback

`MusicSystem` replaces the old single-buffer `MusicBed`. It shares `AudioEngine.context` and master output/mute, never creating another live context. `load()` fetches/decodes all stems concurrently and commits them atomically after validation. Concurrent callers share one promise; decoded buffers are cached. Failure or a decoded frame-count/sample-rate mismatch rejects playback with a visible retry error. No partial set starts. Disposal aborts downloads and prevents late decodes from committing.

After a direct gesture resumes AudioContext, the scene awaits loading and rechecks cancellation before choosing one future start (context time + configured 200 ms lead). It creates all four BufferSourceNodes, then gives each exactly `start(sharedTime, 0)`. Every source has `loop = true`, `loopStart = 0`, `loopEnd = commonBuffer.duration`, and playback rate 1. Native Web Audio handles loops: no bar timers, boundary restarts or resynchronization.

The gameplay count-in begins on the calculated first musical downbeat. All three acts use the stems' 121 BPM; `SESSION` entries no longer carry a tempo of their own (the earlier 86/96/104 values were never played). Pattern progression remains, but no tempo progression or playback-rate control is implemented. Gameplay uses the existing AudioContext clock and absolute targets, never stem position or loop counters.

## Gains and cleanup

Central initial mix: keyboard 1.0, bass 0.75, synth 0.45, drums 0.20. Each stem feeds its own GainNode, then a music bus at 0.4 for SFX headroom, then master output. `setGain(id, value)` validates 0–1 and ramps over 25 ms. Zero gain leaves the source running silently. Global mute likewise changes only gain. Stem gain choices persist across session restarts.

Music continues through vignette changes and the final summary. Task SFX cancellation/profile changes do not touch it. Explicit session restart stops/disconnects all four old sources and schedules four fresh sources using cached buffers. Background interruption/audio suspension stops music alongside the attempt; resume needs a fresh gesture/count-in. Disposal stops sources, disconnects gains and releases buffers. No player-facing mixer was added; individual controls are available through the API and DEV panel.

## Validation and risks

Tests cover atomic loading, shared starts, full-buffer loops, silent running/restoration, repeated loops without source creation, restart/disposal, failed-load retry, disposal during loading, invalid starts/gains, one-frame mismatch rejection and musical pickup calculation. Audio integration tests verify task cancellation cannot stop music.

Browser QA used the actual files: four active stems, matching decoded durations, unchanged playback generation/start across multiple complete loops, independent mute/restore, all-silent looping, and rapid session restarts returning to exactly four music sources. No console warnings/errors were observed. Build/source hashes match. Loop counters are schedule diagnostics, not acoustic phase measurements.

Remaining risks: confirm the bar phase (downbeat at 0.248 s or 0.744 s) with the composer; perform real listening checks for seams, relative loudness and clipping; test iOS/Android unlock, interruption and output routes. Four ~9.9 MB WAVs require ~39.6 MB transfer and ~79.2 MB decoded float PCM at 48 kHz stereo, plus decode overhead. Lower-memory devices need testing. Browser decoding may resample all files to the context rate; identical decoded lengths are checked, with no custom per-stem compensation.
