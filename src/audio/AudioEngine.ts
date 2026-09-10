import { AudioClock } from './AudioClock';
import { MusicSystem } from './MusicSystem';
import type { SoundKind, SoundSink } from '../rhythm/RhythmScheduler';

const TONE = { count: 440, ready: 660, action: 880 } as const;
const DURATION = 0.065;
export interface VignetteSounds { readonly action: AudioBuffer; readonly success: AudioBuffer; readonly rough: AudioBuffer }

/** Tiny synthesized clicks keep the prototype independent of asset downloads. */
export class AudioEngine implements SoundSink {
  public readonly context = new AudioContext({ latencyHint: 'interactive' });
  public readonly clock = new AudioClock(this.context);
  private readonly master = this.context.createGain();
  public readonly music = new MusicSystem(this.context, this.master);
  private readonly sources = new Map<AudioScheduledSourceNode, GainNode>();
  private sounds: VignetteSounds | null = null;
  private disposed = false;
  public muted = false;

  public constructor() {
    this.master.connect(this.context.destination);
  }
  public setSounds(sounds: VignetteSounds): void { this.cancel(); this.sounds = sounds; }
  public async unlock(): Promise<void> {
    if (this.disposed) throw new Error('Audio has been disposed.');
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Sound is blocked. Tap Start again.');
    this.clock.reset();
  }
  public get activeSources(): number { return this.sources.size; }
  public play(time: number, kind: SoundKind): void {
    if (this.disposed) return;
    if (kind === 'action' && this.sounds) { this.playBuffer(time, this.sounds.action, 0.65); return; }
    const source = this.context.createOscillator();
    const envelope = this.context.createGain();
    const start = Math.max(time, this.context.currentTime);
    source.frequency.value = TONE[kind];
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(kind === 'action' ? 0.22 : 0.1, start + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + DURATION);
    source.connect(envelope).connect(this.master);
    this.sources.set(source, envelope);
    source.onended = () => { source.disconnect(); envelope.disconnect(); this.sources.delete(source); };
    source.start(start);
    source.stop(start + DURATION);
  }
  /** A non-scoring coda, scheduled by presentation only after the round is resolved. */
  public playFinish(time: number, successful: boolean): void {
    if (this.sounds) this.playBuffer(time, successful ? this.sounds.success : this.sounds.rough, 0.8);
  }
  private playBuffer(time: number, buffer: AudioBuffer, gain: number): void {
    if (this.disposed) return;
    const source = this.context.createBufferSource();
    const envelope = this.context.createGain();
    source.buffer = buffer;
    envelope.gain.value = gain;
    source.connect(envelope).connect(this.master);
    this.sources.set(source, envelope);
    source.onended = () => { source.disconnect(); envelope.disconnect(); this.sources.delete(source); };
    source.start(Math.max(time, this.context.currentTime));
  }
  public toggleMute(): void {
    this.muted = !this.muted;
    this.master.gain.setValueAtTime(this.muted ? 0 : 1, this.context.currentTime);
  }
  public cancel(): void {
    for (const [source, envelope] of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
      envelope.disconnect();
    }
    this.sources.clear();
  }
  public dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.music.dispose();
    this.disposed = true;
    this.master.disconnect();
    void this.context.close();
  }
}
