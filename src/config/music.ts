/** User-supplied musical model. No tempo progression or playback-rate adjustment. */
export const STEM_IDS = ['drums', 'bass', 'keyboard', 'synth'] as const;
export type StemId = typeof STEM_IDS[number];
export const MUSIC = {
  sourceBpm: 120,
  beatsPerBar: 4,
  pickupBeats: 1,
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
