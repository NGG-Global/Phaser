/** Musical model of the stems. No tempo progression or playback-rate adjustment. */
export const STEM_IDS = ['drums', 'bass', 'guitar', 'keyboard', 'percussion', 'synth', 'brass'] as const;
export type StemId = typeof STEM_IDS[number];
export const MUSIC = {
  // Measured from the delivered files (see docs/MUSIC.md): 120 BPM, 60 bars, every stem
  // 119.925 s. The first downbeat sits about 0.156 s into the file, and the file ends
  // 75 ms short of bar 61, so the raw file neither starts on the beat nor loops on a bar.
  // MusicSystem copies each stem into an exact whole-bar loop: it drops `leadInSec` and
  // pads the silent tail to `bars` bars. The files themselves are untouched.
  sourceBpm: 120,
  beatsPerBar: 4,
  bars: 60,
  leadInSec: 0.156,
  pickupBeats: 0,
  startLeadSec: 0.2,
  gainRampSec: 0.025,
  masterGain: 0.4,
  // The stems arrive balanced against each other; the bus supplies SFX headroom.
  mix: { drums: 1, bass: 1, guitar: 1, keyboard: 1, percussion: 1, synth: 1, brass: 1 } satisfies Record<StemId, number>,
  urls: {
    drums: new URL('../../bgm/0 Drums.wav', import.meta.url).href,
    bass: new URL('../../bgm/1 Bass.wav', import.meta.url).href,
    guitar: new URL('../../bgm/2 Guitar.wav', import.meta.url).href,
    keyboard: new URL('../../bgm/3 Keyboard.wav', import.meta.url).href,
    percussion: new URL('../../bgm/4 Percussion.wav', import.meta.url).href,
    synth: new URL('../../bgm/5 Synth.wav', import.meta.url).href,
    brass: new URL('../../bgm/6 Brass.wav', import.meta.url).href,
  } satisfies Record<StemId, string>,
} as const;
export const pickupSeconds = (bpm: number, beats: number): number => beats * 60 / bpm;
/** Exact loop length in seconds: whole bars at the source tempo. */
export const loopSeconds = (): number => MUSIC.bars * MUSIC.beatsPerBar * 60 / MUSIC.sourceBpm;
