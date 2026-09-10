import Phaser from 'phaser';
import { AudioEngine } from './AudioEngine';

const KEY = 'audio';

/**
 * One AudioEngine for the whole game, held in the registry so the menu can unlock it
 * inside the PLAY gesture and the play scene can start immediately without a second tap.
 * Music keeps running across scene changes; only game destruction disposes the context.
 */
export function sharedAudio(scene: Phaser.Scene): AudioEngine {
  const existing = currentAudio(scene);
  if (existing) return existing;
  const engine = new AudioEngine();
  scene.registry.set(KEY, engine);
  scene.game.events.once(Phaser.Core.Events.DESTROY, () => { engine.dispose(); scene.registry.remove(KEY); });
  return engine;
}

export function currentAudio(scene: Phaser.Scene): AudioEngine | null {
  const engine: unknown = scene.registry.get(KEY);
  return engine instanceof AudioEngine ? engine : null;
}
