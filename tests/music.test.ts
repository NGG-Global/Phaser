import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicSystem, detectLeadIn, normalizeLoop, validateStemBuffers, type StemBuffers } from '../src/audio/MusicSystem';
import { MUSIC, STEM_IDS, loopSeconds, pickupSeconds } from '../src/config/music';

// A 100 Hz "sample rate" keeps the fake buffers tiny while exercising real frame arithmetic.
const RATE = 100;
const FILE_FRAMES = 11993; // 119.93 s: 75 ms short of 60 bars, like the delivered stems.
const LEAD = 18; // the drums' first transient at 0.18 s in the decoded MP3
const N = STEM_IDS.length;
function fakeBuffer(length: number, rate = RATE, channels = 2) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  if (length > LEAD) data[1]![LEAD] = 0.5; // one decoded transient after silence
  return { length, sampleRate: rate, duration: length / rate, numberOfChannels: channels,
    getChannelData: (c: number) => data[c]!,
    copyToChannel: (source: Float32Array, c: number) => { data[c]!.set(source.subarray(0, length)); } };
}
afterEach(() => vi.unstubAllGlobals());

function setup(mismatch = false) {
  const nodes: ReturnType<typeof makeSource>[] = [];
  const makeSource = () => ({ buffer: null as { length: number } | null, loop: false, loopStart: -1, loopEnd: -1, playbackRate: { value: 0 },
    start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null });
  const gains: { gain: { value: number; cancelScheduledValues: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> }; disconnect: ReturnType<typeof vi.fn> }[] = [];
  let decoded = 0;
  const context = {
    currentTime: 10, state: 'running',
    decodeAudioData: vi.fn(async () => { decoded++; return fakeBuffer(FILE_FRAMES + (mismatch && decoded === N ? 1 : 0)); }),
    createBuffer: (channels: number, length: number, rate: number) => fakeBuffer(length, rate, channels),
    createGain: () => {
      const node = { gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(node); return node;
    },
    createBufferSource: () => { const source = makeSource(); nodes.push(source); return source; },
  };
  const fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) }));
  vi.stubGlobal('fetch', fetcher);
  return { system: new MusicSystem(context as unknown as AudioContext, {} as AudioNode), context, nodes, gains, fetcher };
}

describe('synchronized stems', () => {
  it('loads all stems atomically and schedules identical full-buffer loops from offset zero', async () => {
    const { system, nodes, fetcher, context } = setup();
    expect(() => system.start()).toThrow(/Load all/);
    const first = system.load();
    expect(system.load()).toBe(first);
    await first;
    expect(fetcher).toHaveBeenCalledTimes(N);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(N);
    expect(system.start(12)).toBeCloseTo(12 + pickupSeconds(MUSIC.sourceBpm, MUSIC.pickupBeats), 9);
    expect(system.leadInSeconds).toBeCloseTo(LEAD / RATE, 9);
    expect(nodes).toHaveLength(N);
    for (const node of nodes) {
      expect(node.start).toHaveBeenCalledExactlyOnceWith(12, 0);
      expect(node.loop).toBe(true);
      expect(node.loopStart).toBe(0);
      expect(node.loopEnd).toBe(loopSeconds());
      expect(node.buffer!.length).toBe(loopSeconds() * RATE);
      expect(node.playbackRate.value).toBe(1);
    }
    await system.load();
    expect(fetcher).toHaveBeenCalledTimes(N);
  });
  it('detects the lead-in from the reference stem and falls back for a silent one', () => {
    expect(detectLeadIn(fakeBuffer(FILE_FRAMES) as unknown as AudioBuffer, 0.01, 0.5)).toBe(LEAD);
    expect(detectLeadIn(fakeBuffer(FILE_FRAMES) as unknown as AudioBuffer, 0.9, 0.5)).toBe(50);
    expect(detectLeadIn(fakeBuffer(4) as unknown as AudioBuffer, 0.01, 0.5)).toBe(50);
  });
  it('normalizes a stem into an exact whole-bar loop: drops the lead-in and pads the tail', () => {
    const source = fakeBuffer(FILE_FRAMES);
    for (let i = 0; i < FILE_FRAMES; i++) source.getChannelData(0)[i] = i;
    const lead = LEAD;
    const loop = normalizeLoop({ createBuffer: (c: number, l: number, r: number) => fakeBuffer(l, r, c) } as unknown as AudioContext, source as unknown as AudioBuffer, lead);
    expect(loop.length).toBe(loopSeconds() * RATE);
    expect(loop.getChannelData(0)[0]).toBe(lead);
    expect(loop.getChannelData(0)[FILE_FRAMES - lead - 1]).toBe(FILE_FRAMES - 1);
    expect(loop.getChannelData(0)[FILE_FRAMES - lead]).toBe(0);
    expect(loop.getChannelData(0)[loop.length - 1]).toBe(0);
    expect(() => normalizeLoop({} as AudioContext, fakeBuffer(lead) as unknown as AudioBuffer, lead)).toThrow(/lead-in/);
    expect(() => normalizeLoop({} as AudioContext, source as unknown as AudioBuffer, 1.5)).toThrow(/whole number/);
  });
  it('retains the same four sources through silent gains, restoration and multiple loops', async () => {
    const { system, nodes, gains, context } = setup();
    await system.load(); system.start(12);
    for (const id of STEM_IDS) {
      system.setGain(id, 0); expect(system.gain(id)).toBe(0);
      context.currentTime += system.duration;
      system.setGain(id, MUSIC.mix[id]);
    }
    expect(system.activeSources).toBe(N);
    expect(system.completedLoops).toBe(N - 1);
    expect(system.playbackGeneration).toBe(1);
    for (const node of nodes) { expect(node.start).toHaveBeenCalledTimes(1); expect(node.stop).not.toHaveBeenCalled(); }
    expect(gains[1]!.gain.linearRampToValueAtTime).toHaveBeenCalled();
  });
  it('cleans all old sources on restart and disposes idempotently', async () => {
    const { system, nodes } = setup();
    await system.load(); system.start(12); system.start(14);
    expect(system.activeSources).toBe(N);
    for (const node of nodes.slice(0, N)) { expect(node.stop).toHaveBeenCalledTimes(1); expect(node.disconnect).toHaveBeenCalledTimes(1); }
    system.dispose(); system.dispose();
    expect(system.activeSources).toBe(0);
    for (const node of nodes) expect(node.stop).toHaveBeenCalledTimes(1);
    await expect(system.load()).rejects.toThrow(/disposed/);
  });
  it('rejects even a one-frame mismatch without starting or altering buffers', async () => {
    const { system, nodes } = setup(true);
    await expect(system.load()).rejects.toThrow(/duration mismatch/);
    expect(system.ready).toBe(false); expect(nodes).toHaveLength(0);
  });
  it('can retry a failed fetch without committing a partial stem set', async () => {
    const { system, fetcher, nodes } = setup();
    fetcher.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(system.load()).rejects.toThrow(/Network/);
    expect(system.ready).toBe(false);
    expect(nodes).toHaveLength(0);
    await system.load();
    expect(system.ready).toBe(true);
  });
  it('rejects suspended or non-future starts and invalid gains', async () => {
    const { system, context, nodes } = setup();
    await system.load();
    expect(() => system.start(10)).toThrow(/future/);
    context.state = 'suspended';
    expect(() => system.start(12)).toThrow(/Unlock/);
    expect(() => system.setGain('bass', NaN)).toThrow();
    expect(nodes).toHaveLength(0);
  });
  it('does not commit decoded buffers after disposal during loading', async () => {
    const { system, nodes } = setup();
    const loading = system.load(); system.dispose();
    await expect(loading).rejects.toThrow(/disposed/);
    expect(system.ready).toBe(false); expect(nodes).toHaveLength(0);
  });
  it('starts the count-in on the loop downbeat and validates equal stem lengths', () => {
    expect(pickupSeconds(MUSIC.sourceBpm, MUSIC.pickupBeats)).toBe(0);
    expect(pickupSeconds(100, 1)).toBe(0.6);
    expect(loopSeconds()).toBe(120);
    const buffer = { length: 5760000, sampleRate: 48000, duration: 120 } as AudioBuffer;
    expect(validateStemBuffers(Object.fromEntries(STEM_IDS.map(id => [id, buffer])) as StemBuffers)).toBe(buffer.duration);
  });
});
