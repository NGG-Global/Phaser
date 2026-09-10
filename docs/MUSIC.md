# Synchronized composition stems

## Files and inspection

Unmodified files: `bgm/0 Drums.wav`, `bgm/1 Bass.wav`, `bgm/2 Keyboard.wav`, `bgm/3 Synth.wav`. All are stereo 16-bit PCM at 48 kHz with 2,475,742 frames: **51.577958333 seconds**. Browser decoding also reported matching 51.577958-second buffers. SHA-256 checks of source and production assets matched for each file. No trimming, normalization, independent offsets or time stretching occurred.

## Musical metadata caveat

`config/music.ts` follows the explicit requested model: `sourceBpm: 120`, `beatsPerBar: 4`, `pickupBeats: 1`. The request also names 121 BPM; this discrepancy remains unresolved. At 120 BPM the full files contain approximately 103.155917 quarter-note beats, not an integer number of bars. Do not claim that the gameplay bar grid remains aligned to the composition across loops until its tempo/arrangement metadata is confirmed. This does not affect alignment among stems, which share identical lengths and schedules.

The first musical downbeat is `sharedStart + pickupBeats * 60 / sourceBpm`. At the current configuration it is half a second after playback starts, but no permanent 500 ms offset is stored. Source playback starts at zero and the pickup is audible. File-loop boundaries and musical bar boundaries are independent.

## Playback

`MusicSystem` replaces the old single-buffer `MusicBed`. It shares `AudioEngine.context` and master output/mute, never creating another live context. `load()` fetches/decodes all stems concurrently and commits them atomically after validation. Concurrent callers share one promise; decoded buffers are cached. Failure or a decoded frame-count/sample-rate mismatch rejects playback with a visible retry error. No partial set starts. Disposal aborts downloads and prevents late decodes from committing.

After a direct gesture resumes AudioContext, the scene awaits loading and rechecks cancellation before choosing one future start (context time + configured 200 ms lead). It creates all four BufferSourceNodes, then gives each exactly `start(sharedTime, 0)`. Every source has `loop = true`, `loopStart = 0`, `loopEnd = commonBuffer.duration`, and playback rate 1. Native Web Audio handles loops: no bar timers, boundary restarts or resynchronization.

The gameplay count-in begins on the calculated first musical downbeat. All three acts use fixed configured 120 BPM; the previous 86/96/104 tempo ramp is inactive. Pattern progression remains, but no tempo progression or playback-rate control is implemented. Gameplay uses the existing AudioContext clock and absolute targets, never stem position or loop counters.

## Gains and cleanup

Central initial mix: keyboard 1.0, bass 0.75, synth 0.45, drums 0.20. Each stem feeds its own GainNode, then a music bus at 0.4 for SFX headroom, then master output. `setGain(id, value)` validates 0–1 and ramps over 25 ms. Zero gain leaves the source running silently. Global mute likewise changes only gain. Stem gain choices persist across session restarts.

Music continues through vignette changes and the final summary. Task SFX cancellation/profile changes do not touch it. Explicit session restart stops/disconnects all four old sources and schedules four fresh sources using cached buffers. Background interruption/audio suspension stops music alongside the attempt; resume needs a fresh gesture/count-in. Disposal stops sources, disconnects gains and releases buffers. No player-facing mixer was added; individual controls are available through the API and DEV panel.

## Validation and risks

Tests cover atomic loading, shared starts, full-buffer loops, silent running/restoration, repeated loops without source creation, restart/disposal, failed-load retry, disposal during loading, invalid starts/gains, one-frame mismatch rejection and musical pickup calculation. Audio integration tests verify task cancellation cannot stop music.

Browser QA used the actual files: four active stems, matching decoded durations, unchanged playback generation/start across multiple complete loops, independent mute/restore, all-silent looping, and rapid session restarts returning to exactly four music sources. No console warnings/errors were observed. Build/source hashes match. Loop counters are schedule diagnostics, not acoustic phase measurements.

Remaining risks: confirm 120 versus 121 BPM and loop arrangement; perform real listening checks for seams, relative loudness and clipping; test iOS/Android unlock, interruption and output routes. Four ~9.9 MB WAVs require ~39.6 MB transfer and ~79.2 MB decoded float PCM at 48 kHz stereo, plus decode overhead. Lower-memory devices need testing. Browser decoding may resample all files to the context rate; identical decoded lengths are checked, with no custom per-stem compensation.
