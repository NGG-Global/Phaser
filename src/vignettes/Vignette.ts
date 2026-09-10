import type Phaser from 'phaser';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import type { VignetteSounds } from '@/audio/AudioEngine';
import type { TransitionPainter } from './transitions';

export interface Vignette {
  layout(viewport: Viewport): void;
  reset(plan: RoundPlan): void;
  onPhase(phase: Phase, now: number): void;
  onDemonstrationBeat(time: number): void;
  onPlayerHit(now: number): void;
  /** Includes successful hits, omissions, and extra taps. */
  onAccuracy(result: Judgement, now: number): void;
  finish(successful: boolean, contactSec: number): void;
  pause(): void;
  update(now: number): void;
  translate(offset: number): void;
  destroy(): void;
}
export interface VignetteDefinition {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly ink: number;
  readonly success: readonly [string, string];
  readonly rough: readonly [string, string];
  readonly endingSec: number;
  readonly successAccuracy: number;
  readonly transition: TransitionPainter;
  create(scene: Phaser.Scene): Vignette;
  sounds(context: AudioContext): VignetteSounds;
}
