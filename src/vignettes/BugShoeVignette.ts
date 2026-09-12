import type Phaser from 'phaser';
import { reducedMotion } from '@/core/motionPreference';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import type { Vignette } from './Vignette';
import { clamp01, easeOut } from './motion';

export const GARDEN = { paper: 0xe4e7ce, ink: 0x303f43, tile: 0xb8c2a0, plum: 0x8b6085, cream: 0xfff5dc, coral: 0xd87d62 };
export function shoeLift(age: number): number { return 245 * easeOut((age - 0.035) / 0.28); }

/** A rubbery fictional insect, never injury or gore. No input or scoring ownership. */
export class BugShoeVignette implements Vignette {
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly floor: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly bug: Phaser.GameObjects.Graphics;
  private readonly shoe: Phaser.GameObjects.Container;
  private readonly accents: Phaser.GameObjects.Graphics;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  private lastDemo = -Infinity;
  private strikeAt = -100;
  private finishAt: number | null = null;
  private finished = false;
  private successful = false;
  private hit = false;
  private lastNow = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  private contactX = 0;
  private previousX = 0;
  private steps = 0;
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean { return reducedMotion(); }
  public constructor(scene: Phaser.Scene) {
    this.backdrop = scene.add.graphics().setDepth(-20);
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.floor = scene.add.graphics();
    this.shadow = scene.add.ellipse(0, 7, 365, 30, GARDEN.ink, 0.12);
    this.shoe = scene.add.container(0, -245);
    const s = scene.add.graphics();
    // Oversized canvas sneaker: cream foxing, coral heel tab, graphic laces.
    s.fillStyle(GARDEN.ink).fillRoundedRect(-200, -108, 350, 95, 40);
    s.fillStyle(GARDEN.ink).fillRoundedRect(46, -208, 111, 159, 19);
    s.fillStyle(0x516b69).fillRoundedRect(-148, -112, 197, 43, 18);
    s.fillStyle(GARDEN.cream).fillRoundedRect(-217, -57, 389, 57, 21);
    s.fillStyle(0xd3c7a8).fillRoundedRect(-213, -13, 381, 13, 5);
    s.fillStyle(GARDEN.coral).fillRoundedRect(142, -188, 20, 66, 6);
    s.lineStyle(7, GARDEN.cream, 0.9);
    for (let i = 0; i < 4; i++) s.lineBetween(-83 + i * 29, -108 - i * 7, -65 + i * 29, -80 - i * 7);
    s.lineStyle(2, GARDEN.ink, 0.22).lineBetween(-197, -24, 148, -24);
    this.shoe.add(s);
    this.bug = scene.add.graphics();
    this.accents = scene.add.graphics();
    this.stage.add([this.floor, this.shadow, this.shoe, this.bug, this.accents]);
  }
  public layout({ full, safe }: Viewport): void {
    this.scale = Math.min(safe.width / 720, safe.height / 1080);
    this.baseX = safe.centerX; this.baseY = safe.top + safe.height * 0.7;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.clear().fillStyle(GARDEN.paper).fillRect(full.x, full.y, full.width, full.height);
    this.backdrop.fillStyle(GARDEN.cream, 0.3).fillCircle(safe.centerX + 140 * this.scale, this.baseY - 170 * this.scale, 290 * this.scale);
    const g = this.floor.clear();
    g.fillStyle(GARDEN.tile).fillRect(-2500, 0, 5000, 2500);
    g.lineStyle(2, GARDEN.ink, 0.12);
    for (let row = 0; row < 8; row++) g.lineBetween(-2000, 32 + row * 80, 2000, 32 + row * 80);
    for (let col = -5; col < 6; col++) g.lineBetween(col * 190, 0, col * 290, 900);
    g.fillStyle(GARDEN.cream, 0.2).fillRect(-2500, 0, 5000, 5);
  }
  public reset(plan: RoundPlan): void {
    this.plan = plan; this.phase = 'prepare'; this.lastDemo = -Infinity;
    this.strikeAt = -100; this.finishAt = null; this.finished = false; this.hit = false;
    this.contactX = this.previousX = this.steps = 0;
  }
  public onPhase(phase: Phase, _now: number): void {
    this.phase = phase;
    // The bug is never consumed, so this only returns the shoe to the first stop of its
    // cycle for the player's turn.
    if (phase === 'respond') { this.steps = 0; this.previousX = this.contactX = 0; }
  }
  private strike(time: number): void {
    this.previousX = this.contactX;
    this.contactX = [0, -95, 80, -45][this.steps++ % 4]!;
    this.strikeAt = time; this.hit = false;
    this.shoe.setPosition(this.contactX, 0).setRotation(0);
  }
  public onDemonstrationBeat(time: number): void {
    if (time <= this.lastDemo) return;
    this.lastDemo = time; this.strike(time); this.hit = true;
  }
  public onPlayerHit(now: number): void { this.strike(now); }
  public onAccuracy(result: Judgement, _now: number): void { if (result.kind === 'hit') this.hit = true; }
  public finish(successful: boolean, time: number): void { this.successful = successful; this.finishAt = time; }
  public pause(): void { this.phase = 'paused'; this.finishAt = null; }
  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow; else this.lastNow = now;
    if (this.phase === 'prepare' || this.phase === 'demonstrate') for (const cue of this.plan?.cues ?? []) {
      if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
    }
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true; this.strike(this.finishAt); this.hit = this.successful;
    }
    const age = now - this.strikeAt;
    let lift = shoeLift(age);
    const next = this.finishAt !== null && !this.finished ? this.finishAt :
      this.phase === 'prepare' || this.phase === 'demonstrate' ? this.plan?.cues.find(c => c.kind === 'action' && c.time > now)?.time : undefined;
    if (next !== undefined && next !== null && next - now < 0.22) {
      const p = clamp01(1 - (next - now) / 0.22);
      lift = lift * (1 - p) + (245 + Math.sin(p * Math.PI) * 44 - p ** 5 * 245) * p;
    }
    if (this.finished) lift = 22 * easeOut(age / 0.45);
    const squash = age < 0.12 ? Math.sin(clamp01(age / 0.12) * Math.PI) : 0;
    this.shoe.setPosition(this.contactX, -lift).setRotation(-0.12 * clamp01(lift / 245)).setScale(1 + squash * 0.035, 1 - squash * 0.035);
    this.shadow.setPosition(this.contactX, 7).setScale(1 - lift / 1000, 1).setAlpha(1 - lift / 400);
    this.stage.setPosition(this.baseX, this.baseY + (this.reducedMotion ? 0 : squash * 2 * this.scale));
    let x = this.previousX + (this.contactX - this.previousX) * easeOut(age / 0.18);
    let y = -24 - Math.abs(Math.sin(now * 9)) * (this.reducedMotion ? 0 : 3);
    if (!this.hit && age < 0.4) x += 150 * easeOut(age / 0.15);
    if (this.finished) {
      x = this.contactX + (this.successful ? -118 : 207) * easeOut(age / 0.5);
      y = -24 - (this.successful ? 110 : 0) * easeOut(age / 0.5) - Math.sin(clamp01(age / 0.5) * Math.PI) * 100;
    }
    const g = this.bug.clear();
    const compression = this.hit ? squash * 0.72 : 0;
    g.setPosition(x, y).setScale(1 + compression, 1 - compression);
    g.lineStyle(4, GARDEN.ink);
    for (let i = -1; i <= 1; i++) {
      const wiggle = Math.sin(now * 14 + i) * 5;
      g.lineBetween(i * 15, 10, i * 23 - 7, 22 + wiggle);
      g.lineBetween(i * 15, -2, i * 23 + 5, -16 - wiggle);
    }
    g.fillStyle(GARDEN.plum).fillEllipse(0, 0, 72, 40);
    g.fillStyle(0xb68da2).fillEllipse(-10, -6, 33, 20);
    g.lineStyle(2, GARDEN.ink, 0.5).lineBetween(-4, -17, -4, 18);
    for (const eyeX of [20, 35]) {
      g.fillStyle(GARDEN.cream).fillCircle(eyeX, -14, 11);
      g.fillStyle(GARDEN.ink).fillCircle(eyeX + Math.sin(now * 2) * 2, -16, 4);
    }
    g.lineStyle(2, GARDEN.ink).lineBetween(26, -22, 22 + Math.sin(now * 7) * 5, -42);
    this.accents.clear();
    if (age >= 0 && age < 0.22) {
      const p = age / 0.22;
      this.accents.lineStyle(3, GARDEN.cream, 1 - p).strokeEllipse(this.contactX, 2, 210 + p * 180, 14 + p * 22);
    }
  }
  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
  public destroy(): void { this.stage.destroy(true); this.backdrop.destroy(); }
}
