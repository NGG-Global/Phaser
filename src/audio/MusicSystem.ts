import { MUSIC, STEM_IDS, pickupSeconds, type StemId } from '../config/music';

export type StemBuffers = Record<StemId, AudioBuffer>;
export function validateStemBuffers(buffers: StemBuffers): number {
  const first = buffers[STEM_IDS[0]];
  if (!first || first.length <= 0 || first.sampleRate <= 0) throw new Error('Music stem is empty or invalid.');
  const mismatch = STEM_IDS.some(id => !buffers[id] || buffers[id].length !== first.length || buffers[id].sampleRate !== first.sampleRate);
  if (mismatch) {
    const details = STEM_IDS.map(id => `${id}: ${buffers[id]?.length ?? 'missing'} frames at ${buffers[id]?.sampleRate ?? '?'} Hz`).join('; ');
    throw new Error(`Music stem duration mismatch. Files were not trimmed or stretched. ${details}`);
  }
  return first.duration;
}

/** Four sample-synchronous full-file loops, on the existing AudioContext. */
export class MusicSystem {
  private readonly bus: GainNode;
  private readonly gains = new Map<StemId, GainNode>();
  private readonly sources = new Map<StemId, AudioBufferSourceNode>();
  private readonly levels: Record<StemId, number> = { ...MUSIC.mix };
  private buffers: StemBuffers | null = null;
  private pending: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private disposed = false;
  private origin: number | null = null;
  private generation = 0;
  public constructor(private readonly context: AudioContext, destination: AudioNode) {
    this.bus = context.createGain();
    this.bus.gain.value = MUSIC.masterGain;
    this.bus.connect(destination);
    for (const id of STEM_IDS) {
      const gain = context.createGain();
      gain.gain.value = this.levels[id];
      gain.connect(this.bus);
      this.gains.set(id, gain);
    }
  }
  public get ready(): boolean { return this.buffers !== null; }
  public get activeSources(): number { return this.sources.size; }
  public get startTime(): number | null { return this.origin; }
  public get downbeatTime(): number | null { return this.origin === null ? null : this.origin + pickupSeconds(MUSIC.sourceBpm, MUSIC.pickupBeats); }
  public get duration(): number { return this.buffers?.drums.duration ?? 0; }
  public get playbackGeneration(): number { return this.generation; }
  /** Diagnostic only. Gameplay never uses file position or loop count as its clock. */
  public get completedLoops(): number { return this.origin === null ? 0 : Math.floor(Math.max(0, this.context.currentTime - this.origin) / this.duration); }
  public gain(id: StemId): number { return this.levels[id]; }

  /** Atomic load: no source can start until every fetch/decode and validation succeeds. */
  public load(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Music is disposed.'));
    if (this.ready) return Promise.resolve();
    if (this.pending) return this.pending;
    const abort = new AbortController();
    this.abort = abort;
    this.pending = Promise.all(STEM_IDS.map(async id => {
      const response = await fetch(MUSIC.urls[id], { signal: abort.signal });
      if (!response.ok) throw new Error(`Could not load ${id} stem (${response.status}).`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      return [id, buffer] as const;
    })).then(entries => {
      if (this.disposed) throw new Error('Music was disposed during loading.');
      const buffers = Object.fromEntries(entries) as StemBuffers;
      validateStemBuffers(buffers);
      this.buffers = buffers;
    }).catch((error: unknown) => {
      abort.abort();
      throw error;
    }).finally(() => { this.pending = null; this.abort = null; });
    return this.pending;
  }
  /** Returns the first musical downbeat, retaining the audible pickup at source position zero. */
  public start(at = this.context.currentTime + MUSIC.startLeadSec): number {
    if (this.disposed || !this.buffers) throw new Error('Load all music stems before playback.');
    if (this.context.state !== 'running') throw new Error('Unlock audio before starting music.');
    if (!Number.isFinite(at) || at <= this.context.currentTime) throw new Error('Schedule music at a future shared timestamp.');
    this.stop();
    const end = validateStemBuffers(this.buffers);
    try {
      // Build every node first, then start every node with the identical explicit time.
      for (const id of STEM_IDS) {
        const source = this.context.createBufferSource();
        source.buffer = this.buffers[id];
        source.loop = true;
        source.loopStart = 0;
        source.loopEnd = end;
        source.playbackRate.value = 1;
        source.connect(this.gains.get(id)!);
        this.sources.set(id, source);
      }
      for (const source of this.sources.values()) source.start(at, 0);
      this.origin = at;
      this.generation++;
      return this.downbeatTime!;
    } catch (error) { this.stop(); throw error; }
  }
  public setGain(id: StemId, value: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Stem gain must be between zero and one.');
    const parameter = this.gains.get(id)!.gain;
    const now = this.context.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.linearRampToValueAtTime(value, now + MUSIC.gainRampSec);
    this.levels[id] = value;
    // Zero gain is not a lifecycle event. The buffer source keeps running.
  }
  public stop(): void {
    for (const source of this.sources.values()) {
      source.onended = null;
      try { source.stop(); } catch { /* A partially constructed start can contain unstarted nodes. */ }
      source.disconnect();
    }
    this.sources.clear();
    this.origin = null;
  }
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort?.abort();
    this.stop();
    this.buffers = null;
    for (const gain of this.gains.values()) gain.disconnect();
    this.gains.clear();
    this.bus.disconnect();
  }
}
