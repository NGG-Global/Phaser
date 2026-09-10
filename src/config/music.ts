/** Musical model of the stems. No tempo progression or playback-rate adjustment. */
export const STEM_IDS = ['drums', 'bass', 'guitar', 'keyboard', 'percussion', 'synth', 'brass'] as const;
export type StemId = typeof STEM_IDS[number];
export const MUSIC = {
  // Measured from the delivered files (see docs/MUSIC.md): 120 BPM, 60 bars, every stem
  // 119.925 s. The first downbeat sits about 0.156 s into the WAV, and the file ends 75 ms
  // short of bar 61, so the raw file neither starts on the beat nor loops on a bar.
  // MusicSystem copies each stem into an exact whole-bar loop: it drops the lead-in and pads
  // the silent tail to `bars` bars. The lead-in is detected at load from the first drum
  // transient rather than configured, because the shipped MP3s decode with an extra
  // decoder delay (23 ms in Chromium) that other decoders may or may not trim.
  sourceBpm: 120,
  beatsPerBar: 4,
  bars: 60,
  leadIn: { stem: 'drums', threshold: 0.01, fallbackSec: 0.179 } as { readonly stem: StemId; readonly threshold: number; readonly fallbackSec: number },
  pickupBeats: 0,
  startLeadSec: 0.2,
  gainRampSec: 0.025,
  masterGain: 0.4,
  // The stems arrive balanced against each other; the bus supplies SFX headroom.
  mix: { drums: 1, bass: 1, guitar: 1, keyboard: 1, percussion: 1, synth: 1, brass: 1 } satisfies Record<StemId, number>,
  // Shipped assets are the MP3s produced by `npm run music:encode` from the WAV masters in bgm/.
  urls: {
    drums: new URL('../../bgm/mp3/0 Drums.mp3', import.meta.url).href,
    bass: new URL('../../bgm/mp3/1 Bass.mp3', import.meta.url).href,
    guitar: new URL('../../bgm/mp3/2 Guitar.mp3', import.meta.url).href,
    keyboard: new URL('../../bgm/mp3/3 Keyboard.mp3', import.meta.url).href,
    percussion: new URL('../../bgm/mp3/4 Percussion.mp3', import.meta.url).href,
    synth: new URL('../../bgm/mp3/5 Synth.mp3', import.meta.url).href,
    brass: new URL('../../bgm/mp3/6 Brass.mp3', import.meta.url).href,
  } satisfies Record<StemId, string>,
} as const;
export const pickupSeconds = (bpm: number, beats: number): number => beats * 60 / bpm;
/** Exact loop length in seconds: whole bars at the source tempo. */
export const loopSeconds = (): number => MUSIC.bars * MUSIC.beatsPerBar * 60 / MUSIC.sourceBpm;
