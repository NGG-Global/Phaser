/** Musical model of the stems. No tempo progression or playback-rate adjustment. */
export const STEM_IDS = ['drums', 'bass', 'keyboard', 'synth'] as const;
export type StemId = typeof STEM_IDS[number];
export const MUSIC = {
  // Measured, not assumed: onset analysis of `0 Drums.wav` scores 121 BPM roughly ten
  // times higher than 120, and the 51.578 s file is 104.02 beats at 121 (26 bars), so
  // the file loops cleanly. The first beat lands about 0.248 s in, one eighth after
  // the opening drum pickup. At 120 the count-in drifts 4 ms per beat and is half a
  // beat off the drums before the third act. Bar phase (which beat is "one") is inferred
  // from kick accents; confirm with the composer.
  sourceBpm: 121,
  beatsPerBar: 4,
  pickupBeats: 0.5,
  startLeadSec: 0.2,
  gainRampSec: 0.025,
  masterGain: 0.4,
  mix: { keyboard: 1, bass: 0.75, synth: 0.45, drums: 0.2 } satisfies Record<StemId, number>,
  urls: {
    drums: new URL('../../bgm/0 Drums.wav', import.meta.url).href,
    bass: new URL('../../bgm/1 Bass.wav', import.meta.url).href,
    keyboard: new URL('../../bgm/2 Keyboard.wav', import.meta.url).href,
    synth: new URL('../../bgm/3 Synth.wav', import.meta.url).href,
  } satisfies Record<StemId, string>,
} as const;
export const pickupSeconds = (bpm: number, beats: number): number => beats * 60 / bpm;
