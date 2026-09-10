import { MUSIC, STEM_IDS, loopSeconds, pickupSeconds, type StemId } from '../config/music';

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

/**
 * First frame on which any channel exceeds the threshold: the reference stem's opening
 * transient marks the first downbeat. Returns the fallback when nothing exceeds it, so a
 * silent or missing reference cannot produce an absurd offset.
 */
export function detectLeadIn(reference: AudioBuffer, threshold: number, fallbackSec: number): number {
  const channels = Array.from({ length: reference.numberOfChannels }, (_, c) => reference.getChannelData(c));
  const limit = Math.min(reference.length, Math.round(reference.sampleRate * 2));
  for (let i = 0; i < limit; i++) for (const data of channels) if (Math.abs(data[i]!) > threshold) return i;
  return Math.round(fallbackSec * reference.sampleRate);
}

/**
 * Copies a decoded stem into an exact whole-bar loop buffer: `lead` frames of exported
 * pre-roll (and decoder delay) before the first downbeat are dropped and the (silent) tail
 * is padded or trimmed so the loop length is precisely `bars` bars. Native looping then
 * keeps the bar grid aligned indefinitely instead of slipping by the export's rounding.
 */
export function normalizeLoop(context: BaseAudioContext, source: AudioBuffer, lead: number): AudioBuffer {
  const frames = Math.round(loopSeconds() * source.sampleRate);
  if (!Number.isInteger(lead) || lead < 0) throw new Error('Lead-in must be a whole number of frames.');
  if (source.length <= lead) throw new Error('Music stem is shorter than its lead-in.');
  if (lead === 0 && source.length === frames) return source;
  const target = context.createBuffer(source.numberOfChannels, frames, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    target.copyToChannel(source.getChannelData(channel).subarray(lead, lead + frames), channel);
  }
  return target;
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
  private leadInFrames = 0;
  private rate = 1;
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
  /** Diagnostic: frames dropped before the first downbeat of the shipped decode. */
  public get leadInSeconds(): number { return this.buffers ? this.leadInFrames / this.buffers.drums.sampleRate : 0; }
  public get playbackGeneration(): number { return this.generation; }
  /** Diagnostic only. Gameplay never uses file position or loop count as its clock. */
  public get completedLoops(): number { return this.origin === null ? 0 : Math.floor(Math.max(0, this.context.currentTime - this.origin) / this.duration); }
  public gain(id: StemId): number { return this.levels[id]; }
  /** Most recently scheduled playback rate (1 = the source tempo). */
  public get playbackRate(): number { return this.rate; }

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
      const decoded = Object.fromEntries(entries) as StemBuffers;
      validateStemBuffers(decoded);
      const lead = detectLeadIn(decoded[MUSIC.leadIn.stem], MUSIC.leadIn.threshold, MUSIC.leadIn.fallbackSec);
      const buffers = Object.fromEntries(STEM_IDS.map(id => [id, normalizeLoop(this.context, decoded[id], lead)])) as StemBuffers;
      this.leadInFrames = lead;
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
        this.rate = 1;
        source.connect(this.gains.get(id)!);
        this.sources.set(id, source);
      }
      for (const source of this.sources.values()) source.start(at, 0);
      this.origin = at;
      this.generation++;
      return this.downbeatTime!;
    } catch (error) { this.stop(); throw error; }
  }
  /**
   * Speeds every stem up together at one shared instant, which the caller places on a beat.
   * Pitch rises with tempo (Web Audio has no time-stretch); the level curve caps this at
   * +25% for that reason. All sources get the identical automation so they stay locked.
   */
  public setRate(rate: number, at: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) throw new Error('Playback rate must be between 0.5 and 2.');
    if (!Number.isFinite(at)) throw new Error('Schedule the rate change at a finite time.');
    for (const source of this.sources.values()) source.playbackRate.setValueAtTime(rate, Math.max(at, this.context.currentTime));
    this.rate = rate;
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
