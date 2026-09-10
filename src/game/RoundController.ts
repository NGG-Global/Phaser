import { RHYTHM } from '../config/rhythm';
import { createJudge, expireTargets, judgeTap, type JudgeState, type Judgement } from '../rhythm/judge';
import { createRoundPlan, RhythmScheduler, type RoundPlan, type ScheduledCue, type SoundSink } from '../rhythm/RhythmScheduler';
import type { Pattern } from '../rhythm/patterns';
import { scoreRound, type RoundResult } from './scoring';

export type Phase = 'idle' | 'prepare' | 'demonstrate' | 'handoff' | 'respond' | 'result' | 'paused';
export interface RoundEvents {
  phase(phase: Phase): void;
  cue(cue: ScheduledCue): void;
  tap(): void;
  judgement(result: Judgement): void;
  complete(result: RoundResult): void;
  interrupted(reason: string): void;
}

/** Pure coordinator: callers supply clock readings. No Phaser, DOM or animation dependency. */
export class RoundController {
  public phase: Phase = 'idle';
  public plan: RoundPlan | null = null;
  public result: RoundResult | null = null;
  private judge: JudgeState | null = null;
  private generation = 0;
  private cueIndex = 0;
  private lastPumpMs = 0;
  private readonly scheduler: RhythmScheduler;

  public constructor(private readonly sound: SoundSink, private readonly events: RoundEvents) {
    this.scheduler = new RhythmScheduler(sound);
  }
  public get active(): boolean { return this.plan !== null && this.phase !== 'result' && this.phase !== 'paused'; }
  public start(pattern: Pattern, bpm: number, renderNow: number, wallMs: number, startAt = renderNow + RHYTHM.leadSec): void {
    this.scheduler.cancel();
    this.plan = createRoundPlan(++this.generation, pattern, bpm, startAt);
    this.judge = createJudge(this.plan.targets);
    this.result = null;
    this.cueIndex = 0;
    this.lastPumpMs = wallMs;
    this.scheduler.schedule(this.plan);
    this.setPhase('prepare');
  }
  private healthy(wallMs: number): boolean {
    if (wallMs - this.lastPumpMs > RHYTHM.stallMs) {
      this.interrupt('Timing interrupted. Restart this round.');
      return false;
    }
    return true;
  }
  public tick(now: number, wallMs: number): void {
    if (!this.active || !this.plan || !this.judge || !this.healthy(wallMs)) return;
    this.lastPumpMs = wallMs;
    const plan = this.plan;
    this.setPhase(now < plan.demo ? 'prepare' : now < plan.handoff ? 'demonstrate' : now < plan.response ? 'handoff' : 'respond');
    while (this.cueIndex < plan.cues.length && plan.cues[this.cueIndex]!.time <= now) {
      const cue = plan.cues[this.cueIndex++]!;
      if (now - cue.time < RHYTHM.stallMs / 1000) this.events.cue(cue);
    }
    for (const miss of expireTargets(this.judge, now)) this.events.judgement(miss);
    if (now > plan.end + (RHYTHM.goodMs + RHYTHM.deliveryGraceMs) / 1000) {
      this.result = scoreRound(this.judge);
      this.scheduler.cancel();
      this.setPhase('result');
      this.events.complete(this.result);
    }
  }
  public tap(inputSec: number, renderNow: number, wallMs: number): Judgement | null {
    if (!this.active || !this.plan || !this.judge || !this.healthy(wallMs)) return null;
    if (inputSec < this.plan.response - RHYTHM.goodMs / 1000 || inputSec > this.plan.end + RHYTHM.goodMs / 1000) return null;
    this.events.tap();
    this.sound.play(renderNow, 'action');
    const result = judgeTap(this.judge, inputSec);
    this.events.judgement(result);
    return result;
  }
  public interrupt(reason: string): void {
    if (!this.active) return;
    this.scheduler.cancel();
    this.judge = null;
    this.result = null;
    this.setPhase('paused');
    this.events.interrupted(reason);
  }
  public dispose(): void {
    this.scheduler.cancel();
    this.plan = null;
    this.judge = null;
    this.result = null;
    this.phase = 'idle';
  }
  private setPhase(phase: Phase): void {
    if (this.phase !== phase) { this.phase = phase; this.events.phase(phase); }
  }
}
