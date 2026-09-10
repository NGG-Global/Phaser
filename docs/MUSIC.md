# Synchronized composition stems

## Files and inspection

Seven unmodified stems: `bgm/0 Drums.wav`, `1 Bass.wav`, `2 Guitar.wav`, `3 Keyboard.wav`, `4 Percussion.wav`, `5 Synth.wav`, `6 Brass.wav`. All are stereo 16-bit PCM at 48 kHz with 5,756,414 frames: **119.925292 seconds**, about 23 MB each. They replace the earlier four-stem composition (kept in Git history). No trimming, normalization, independent offsets or time stretching was applied to the files.

## Musical metadata (measured)

The delivery note said the music begins on the first beat at second 0 and loops well. Onset analysis says otherwise, and `config/music.ts` records what was measured:

- **Tempo 120 BPM.** A comb-filter scan from 60 to 200 BPM and a least-squares fit over 227 drum onsets both land within 0.01 BPM of 120; the residual drift between the first and last thirty seconds is about 6 ms, which rules out 120.075 (the tempo that would make the raw file length a whole number of beats).
- **Lead-in 0.156 s.** Drums, percussion and keyboard all first exceed 1% of full scale between 0.156 and 0.158 s; the first 156 ms hold only dither-level noise. The first downbeat is therefore ~156 ms into the file, not at zero. Bass enters at 16.1 s, synth 10.4 s, brass 44.4 s, guitar 67.6 s.
- **Loop is 75 ms short of 60 bars.** 119.925 s is 239.85 beats at 120 BPM; 60 bars would be 120.000 s. Looping the raw file would slip the grid by 75 ms every cycle, and the signal ends at 119.89 s, so the tail is already silent.

`MusicSystem.normalizeLoop()` therefore copies each decoded stem into an exact 120.000 s buffer: it drops the first `leadInSec` and pads the silent tail to `bars × beatsPerBar` beats. Beat 0 of the loop is the first downbeat, so `pickupBeats` is 0 and the count-in begins on the loop origin. The gameplay grid and the file loop then stay aligned indefinitely. Bar phase (which beat is "one") assumes the first audible beat is a downbeat; confirm with the composer.

## Shipped format: MP3 from WAV masters

The WAVs are 161 MB and are kept only as masters. `npm run music:encode` (`scripts/encode-music.mjs`, pure-JavaScript LAME at 160 kb/s joint stereo) writes `bgm/mp3/*.mp3`, about 2.4 MB each, 17 MB total; `config/music.ts` points at those, so the web bundle and the Android APK carry only the MP3s. Re-run it whenever a WAV changes.

MP3 decoding is not sample-exact: Chromium's decode of every stem is 5,757,696 frames (119.952 s) and cross-correlation against the WAV shows the audio starting **1105 frames (23.02 ms) later** than in the file, the usual encoder-plus-decoder delay. Other decoders may trim that delay using the LAME header. The lead-in is therefore not a constant: at load, `detectLeadIn` finds the first frame of the drum stem above 1% full scale (the opening transient is sharp and preceded by dither-level noise), and every stem is normalized with that frame count. Measured in Chromium it lands within 2 ms of the true onset (0.1808 s versus 0.156 + 0.023). `fallbackSec` covers a silent or missing reference. Peak levels come out about 6% lower than the WAVs; no gain compensation is applied.

Decoded memory is unchanged by compression: seven stereo 120 s buffers are about 322 MB of float PCM (transiently more while normalizing). That remains a memory-pressure risk on low-end handsets and the reason to consider a premix or a load-time mixdown if device testing shows trouble.

## Playback

`MusicSystem` replaces the old single-buffer `MusicBed`. It shares `AudioEngine.context` and master output/mute, never creating another live context. `load()` fetches/decodes all stems concurrently and commits them atomically after validation. Concurrent callers share one promise; decoded buffers are cached. Failure or a decoded frame-count/sample-rate mismatch rejects playback with a visible retry error. No partial set starts. Disposal aborts downloads and prevents late decodes from committing.

After the menu's PLAY gesture resumes the shared AudioContext and awaits loading, the play scene starts and schedules one future start (context time + configured 200 ms lead). It creates all seven BufferSourceNodes from the normalized loop buffers, then gives each exactly `start(sharedTime, 0)`. Every source has `loop = true`, `loopStart = 0`, `loopEnd = 120`, and playback rate 1. Native Web Audio handles loops: no bar timers, boundary restarts or resynchronization.

The gameplay count-in begins on the loop origin, which is the first musical downbeat. Every task in every round uses the stems' 120 BPM; rounds and tasks carry no tempo of their own. No tempo progression or playback-rate control is implemented.

## Gains and cleanup

The delivered stems are balanced against each other, so every stem gain starts at 1.0. Each stem feeds its own GainNode, then a music bus at 0.4 for SFX headroom, then master output. `setGain(id, value)` validates 0–1 and ramps over 25 ms. Zero gain leaves the source running silently. Global mute likewise changes only gain. Stem gain choices persist across session restarts.

Music continues through task slides, vignette changes, the final summary and the return to the menu. Task SFX cancellation/profile changes do not touch it. Explicit session restart stops/disconnects all four old sources and schedules four fresh sources using cached buffers. Background interruption/audio suspension stops music alongside the attempt; resume needs a fresh gesture/count-in. Disposal stops sources, disconnects gains and releases buffers. No player-facing mixer was added; individual controls are available through the API and DEV panel.

## Validation and risks

Tests cover atomic loading, shared starts, full-buffer loops, silent running/restoration, repeated loops without source creation, restart/disposal, failed-load retry, disposal during loading, invalid starts/gains, one-frame mismatch rejection and musical pickup calculation. Audio integration tests verify task cancellation cannot stop music.

Browser QA used the actual files: four active stems, matching decoded durations, unchanged playback generation/start across multiple complete loops, independent mute/restore, all-silent looping, and rapid session restarts returning to exactly four music sources. No console warnings/errors were observed. Build/source hashes match. Loop counters are schedule diagnostics, not acoustic phase measurements.

Remaining risks: confirm the bar phase with the composer; verify the detected lead-in and the loop seam by ear on Android and iOS decoders; watch decoded-PCM memory on low-end devices (see Shipped format); perform real listening checks for the padded loop seam, relative loudness and clipping; test iOS/Android unlock, interruption and output routes.
