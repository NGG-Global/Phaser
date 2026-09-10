import { afterEach, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';
import { createImpactBuffers } from '../src/audio/hammerSounds';

afterEach(() => vi.unstubAllGlobals());

it('schedules hammer/coda sources at absolute times and cancels every voice on restart', async () => {
  const nodes: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null }[] = [];
  const close = vi.fn(() => Promise.resolve());
  vi.stubGlobal('AudioContext', class {
    currentTime = 10;
    state = 'running';
    sampleRate = 8000;
    decodeAudioData = async () => ({ length: 80000, sampleRate: 8000, duration: 10 });
    destination = {};
    close = close;
    createGain() {
      return { gain: { value: 1 }, connect: vi.fn((target: object) => target), disconnect: vi.fn() };
    }
    createBuffer(_channels: number, length: number) {
      return { getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      const node = {
        playbackRate: { value: 1 },
        buffer: null, connect: vi.fn((target: object) => target), start: vi.fn(), stop: vi.fn(),
        disconnect: vi.fn(), onended: null as (() => void) | null,
      };
      nodes.push(node);
      return node;
    }
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  const engine = new AudioEngine();
  const buffers = createImpactBuffers(engine.context);
  engine.setSounds({ action: buffers.hit, success: buffers.flush, rough: buffers.bent });
  engine.play(12, 'action');
  engine.playFinish(12.5, true);
  expect(nodes[0]!.start).toHaveBeenCalledWith(12);
  expect(nodes[1]!.start).toHaveBeenCalledWith(12.5);
  expect(engine.activeSources).toBe(2);
  engine.setSounds({ action: buffers.hit, success: buffers.flush, rough: buffers.bent });
  engine.cancel();
  expect(engine.activeSources).toBe(0);
  for (const node of nodes) {
    expect(node.stop).toHaveBeenCalledTimes(1);
    expect(node.disconnect).toHaveBeenCalledTimes(1);
    expect(node.onended).toBeNull();
  }
  engine.playFinish(13, false);
  nodes[2]!.onended!();
  expect(engine.activeSources).toBe(0);
  await engine.music.load();
  engine.music.start(14);
  engine.cancel();
  for (const node of nodes.slice(3)) expect(node.stop).not.toHaveBeenCalled();
  engine.dispose(); engine.dispose();
  for (const node of nodes.slice(3)) expect(node.stop).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

it('gives up on an unlock whose resume() never settles instead of waiting forever', async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal('AudioContext', class {
      currentTime = 0;
      state = 'suspended';
      sampleRate = 8000;
      destination = {};
      close = vi.fn(() => Promise.resolve());
      resume = vi.fn(() => new Promise<void>(() => { /* a blocked route never resolves */ }));
      createGain() { return { gain: { value: 1 }, connect: vi.fn((target: object) => target), disconnect: vi.fn() }; }
    });
    const engine = new AudioEngine();
    const unlock = engine.unlock();
    const outcome = unlock.then(() => 'resolved', (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(3500);
    expect(await outcome).toMatch(/blocked/);
  } finally { vi.useRealTimers(); }
});
