export type ImpactSound = 'hit' | 'flush' | 'bent' | 'skid' | 'dead';

/** A dry wood body, a short metal mode and a restrained noisy attack. No downloads. */
export function synthesizeImpact(sampleRate: number, kind: ImpactSound): Float32Array {
  const duration = kind === 'flush' ? 0.7 : kind === 'bent' ? 0.42 : kind === 'skid' ? 0.2 : kind === 'dead' ? 0.26 : 0.22;
  // A tap that hit nothing glances off the timber, and a beat that went by leaves the
  // head resting dead on the wood. Both are the same materials as the strike, quieter.
  if (kind === 'skid' || kind === 'dead') {
    const samples = new Float32Array(Math.ceil(sampleRate * duration));
    let seed = 1063;
    let rasp = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = i / sampleRate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      rasp = rasp * 0.86 + (seed / 4294967296 * 2 - 1) * 0.14;
      const voice = kind === 'skid'
        // Metal grazing the nail's head and running off it.
        ? (rasp * 1.5 + Math.sin(2 * Math.PI * (980 * t - 520 * t * t)) * 0.16) * Math.exp(-t * 15)
        // A soft knock with none of the strike's ring: the blow that never came.
        : (Math.sin(2 * Math.PI * 96 * t) * 0.5 + rasp * 0.5) * Math.exp(-t * 19);
      samples[i] = Math.max(-1, Math.min(1, Math.min(1, t / 0.0015) * voice));
    }
    return samples;
  }
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = 731;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 4294967296 * 2 - 1;
    const body = Math.sin(2 * Math.PI * (kind === 'flush' ? 104 : 145) * t) * Math.exp(-t * 35);
    const metal = Math.sin(2 * Math.PI * (kind === 'bent' ? 770 - 250 * t : 1860) * t) * Math.exp(-t * 65);
    const attack = noise * Math.exp(-t * 180);
    const ring = kind === 'flush'
      ? (Math.sin(2 * Math.PI * 1320 * t) + 0.5 * Math.sin(2 * Math.PI * 1980 * t)) * Math.exp(-t * 9) * 0.13
      : kind === 'bent' ? Math.sin(2 * Math.PI * (480 * t - 130 * t * t)) * Math.exp(-t * 13) * 0.2 : 0;
    samples[i] = Math.tanh(body * 0.65 + metal * 0.18 + attack * 0.33 + ring) * Math.min(1, t / 0.0008);
  }
  return samples;
}

export function createImpactBuffers(context: AudioContext): Record<ImpactSound, AudioBuffer> {
  const make = (kind: ImpactSound): AudioBuffer => {
    const data = synthesizeImpact(context.sampleRate, kind);
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  };
  return { hit: make('hit'), flush: make('flush'), bent: make('bent'), skid: make('skid'), dead: make('dead') };
}
