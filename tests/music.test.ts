import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicSystem, validateStemBuffers, type StemBuffers } from '../src/audio/MusicSystem';
import { MUSIC, STEM_IDS, pickupSeconds } from '../src/config/music';
afterEach(() => vi.unstubAllGlobals());

function setup(mismatch = false) {
  const nodes: ReturnType<typeof makeSource>[] = [];
  const makeSource = () => ({ buffer: null, loop: false, loopStart: -1, loopEnd: -1, playbackRate: { value: 0 },
    start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null });
  const gains: { gain: { value: number; cancelScheduledValues: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> }; disconnect: ReturnType<typeof vi.fn> }[] = [];
  let decoded = 0;
  const context = {
    currentTime: 10, state: 'running',
    decodeAudioData: vi.fn(async () => { decoded++; const length = 2475742 + (mismatch && decoded === 4 ? 1 : 0); return { length, sampleRate: 48000, duration: length / 48000 }; }),
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
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(4);
    expect(system.start(12)).toBeCloseTo(12 + pickupSeconds(MUSIC.sourceBpm, MUSIC.pickupBeats), 9);
    expect(nodes).toHaveLength(4);
    for (const node of nodes) {
      expect(node.start).toHaveBeenCalledExactlyOnceWith(12, 0);
      expect(node.loop).toBe(true);
      expect(node.loopStart).toBe(0);
      expect(node.loopEnd).toBe(2475742 / 48000);
      expect(node.playbackRate.value).toBe(1);
    }
    await system.load();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('retains the same four sources through silent gains, restoration and multiple loops', async () => {
    const { system, nodes, gains, context } = setup();
    await system.load(); system.start(12);
    for (const id of STEM_IDS) {
      system.setGain(id, 0); expect(system.gain(id)).toBe(0);
      context.currentTime += system.duration;
      system.setGain(id, MUSIC.mix[id]);
    }
    expect(system.activeSources).toBe(4);
    expect(system.completedLoops).toBe(3);
    expect(system.playbackGeneration).toBe(1);
    for (const node of nodes) { expect(node.start).toHaveBeenCalledTimes(1); expect(node.stop).not.toHaveBeenCalled(); }
    expect(gains[1]!.gain.linearRampToValueAtTime).toHaveBeenCalled();
  });
  it('cleans all old sources on restart and disposes idempotently', async () => {
    const { system, nodes } = setup();
    await system.load(); system.start(12); system.start(14);
    expect(system.activeSources).toBe(4);
    for (const node of nodes.slice(0, 4)) { expect(node.stop).toHaveBeenCalledTimes(1); expect(node.disconnect).toHaveBeenCalledTimes(1); }
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
  it('keeps the measured pickup musical and loops the stems on a whole bar', () => {
    expect(pickupSeconds(MUSIC.sourceBpm, MUSIC.pickupBeats)).toBeCloseTo(0.248, 3);
    expect(pickupSeconds(100, 1)).toBe(0.6);
    const buffer = { length: 2475742, sampleRate: 48000, duration: 2475742 / 48000 } as AudioBuffer;
    // 51.578 s at 121 BPM is 104.02 beats: 26 bars, within 8 ms. At 120 it would be 103.16.
    const beats = buffer.duration * MUSIC.sourceBpm / 60;
    expect(Math.abs(beats - Math.round(beats)) * 60 / MUSIC.sourceBpm).toBeLessThan(0.01);
    expect(Math.round(beats) % MUSIC.beatsPerBar).toBe(0);
    expect(validateStemBuffers(Object.fromEntries(STEM_IDS.map(id => [id, buffer])) as StemBuffers)).toBe(buffer.duration);
  });
});
