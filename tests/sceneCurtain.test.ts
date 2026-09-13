import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { SceneCurtain } from '../src/ui/SceneCurtain';

vi.mock('phaser', () => ({ default: { Scenes: { Events: { SHUTDOWN: 'shutdown', UPDATE: 'update' } } } }));
// The curtain reads the preference through the shared helper, so the fixture sets that.
let reducedPreference = false;
vi.mock('../src/core/motionPreference', () => ({ reducedMotion: () => reducedPreference }));
afterEach(() => vi.unstubAllGlobals());

function fixture(reduced = false) {
  reducedPreference = reduced;
  const graphic = {
    setScrollFactor: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(), fillStyle: vi.fn().mockReturnThis(),
    beginPath: vi.fn().mockReturnThis(), moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(), closePath: vi.fn().mockReturnThis(),
    fillPath: vi.fn().mockReturnThis(), destroy: vi.fn(),
  };
  type Animation = { targets: { progress: number }; progress: number; duration: number; onComplete: () => void };
  let animation: Animation | undefined;
  let shutdown: (() => void) | undefined;
  const scene = {
    add: { graphics: () => graphic }, scale: { width: 720, height: 1280 },
    events: {
      once: (_event: string, fn: () => void, context: object) => { shutdown = fn.bind(context); },
      on: vi.fn(), off: vi.fn(),
    },
    tweens: {
      killTweensOf: vi.fn(),
      add: vi.fn((value: Animation) => { animation = value; }),
    },
  };
  const curtain = new SceneCurtain(scene as unknown as Phaser.Scene);
  const complete = () => {
    animation!.targets.progress = animation!.progress;
    animation!.onComplete();
  };
  return { curtain, graphic, scene, complete, shutdown: () => shutdown!(), duration: () => animation!.duration };
}

describe('screen transition lifecycle', () => {
  it('keeps the outgoing screen covered and blocks repeat navigation until shutdown', () => {
    const f = fixture(), next = vi.fn();
    f.curtain.cover(next);
    f.curtain.cover(next);
    expect(f.scene.tweens.add).toHaveBeenCalledTimes(1);
    f.complete();
    expect(next).toHaveBeenCalledTimes(1);
    expect(f.curtain.active).toBe(true);
    f.curtain.cover(next);
    expect(f.scene.tweens.add).toHaveBeenCalledTimes(1);
  });

  it('releases input and calls the start callback only after the reveal', () => {
    const f = fixture(), start = vi.fn();
    f.curtain.reveal(start);
    expect(f.curtain.active).toBe(true);
    expect(start).not.toHaveBeenCalled();
    f.complete();
    expect(f.curtain.active).toBe(false);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('cancels motion, removes its update listener and ignores late callbacks', () => {
    const f = fixture(), next = vi.fn();
    f.curtain.cover(next);
    f.shutdown();
    f.complete();
    expect(next).not.toHaveBeenCalled();
    expect(f.graphic.destroy).toHaveBeenCalledTimes(1);
    expect(f.scene.events.off).toHaveBeenCalledWith('update', expect.any(Function), f.curtain);
    expect(f.scene.tweens.killTweensOf).toHaveBeenCalledTimes(2);
  });

  it('removes travel time for reduced-motion users', () => {
    const f = fixture(true);
    f.curtain.reveal();
    expect(f.duration()).toBe(1);
    f.complete();
    expect(f.curtain.active).toBe(false);
  });
});
