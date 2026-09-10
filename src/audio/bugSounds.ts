import type { VignetteSounds } from './AudioEngine';
export function synthesizeStomp(rate: number, kind: keyof VignetteSounds): Float32Array {
  const data = new Float32Array(Math.ceil(rate * (kind === 'action' ? 0.2 : 0.55)));
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    const thump = Math.sin(2 * Math.PI * (92 * t - 45 * t * t)) * Math.exp(-t * 28);
    const rubber = Math.sin(2 * Math.PI * (kind === 'rough' ? 340 * t - 200 * t * t : 260 * t + 420 * t * t)) * Math.exp(-t * 13);
    data[i] = Math.min(1, t / 0.003) * (0.55 * thump + 0.18 * rubber);
  }
  return data;
}
export function createBugSounds(context: AudioContext): VignetteSounds {
  const make = (kind: keyof VignetteSounds) => {
    const samples = synthesizeStomp(context.sampleRate, kind);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  };
  return { action: make('action'), success: make('success'), rough: make('rough') };
}
