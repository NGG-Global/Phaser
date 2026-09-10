import Phaser from 'phaser';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import type { Vignette } from './Vignette';
import { easeOut } from './motion';

export const GLASS = { wall: 0xe5dfe8, ink: 0x49394e, frame: 0x756278, blue: 0xa8ced4, light: 0xf9f1df, glove: 0xdc9775 };
export const strokeProgress = (age: number): number => easeOut(age / 0.23);

/** All cleaning is presentation of existing outcomes; taps are never interpreted as swipes. */
export class WindowCleaningVignette implements Vignette {
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly glass: Phaser.GameObjects.Graphics;
  private readonly dirt: Phaser.GameObjects.Graphics;
  private readonly gleam: Phaser.GameObjects.Graphics;
  private readonly tool: Phaser.GameObjects.Container;
  private readonly droplets: Phaser.GameObjects.Graphics;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  private cleanAt: number[] = [];
  private strokeAt = -100;
  private lane = 0;
  private strokes = 0;
  private lastDemo = -Infinity;
  private finishAt: number | null = null;
  private finished = false;
  private successful = false;
  private lastNow = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  public constructor(scene: Phaser.Scene) {
    this.backdrop = scene.add.graphics().setDepth(-20);
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.glass = scene.add.graphics();
    this.dirt = scene.add.graphics();
    this.gleam = scene.add.graphics();
    this.tool = scene.add.container(0, 0);
    const hand = scene.add.graphics();
    // Vertical rubber blade and a warm mitten: lateral motion, not a hammer reskin.
    hand.fillStyle(GLASS.ink, 0.12).fillRoundedRect(-8, -66, 27, 148, 7);
    hand.fillStyle(GLASS.ink).fillRoundedRect(-13, -70, 16, 140, 4);
    hand.fillStyle(0xd3e1db).fillRoundedRect(0, -66, 12, 132, 5);
    hand.fillStyle(GLASS.frame).fillRoundedRect(8, -9, 55, 18, 7);
    hand.fillStyle(GLASS.glove).fillRoundedRect(41, -26, 61, 54, 17);
    hand.fillStyle(0xf0bb95).fillRoundedRect(36, -31, 42, 22, 10);
    hand.fillStyle(0xc27c63).fillRoundedRect(85, -20, 50, 43, 10);
    hand.fillStyle(GLASS.ink).fillRoundedRect(114, -26, 82, 56, 6);
    hand.lineStyle(2, GLASS.light, 0.22).lineBetween(127, -17, 177, -17);
    this.tool.add(hand);
    this.droplets = scene.add.graphics();
    this.stage.add([this.glass, this.dirt, this.gleam, this.tool, this.droplets]);
  }
  public layout({ full, safe }: Viewport): void {
    this.scale = Math.min(safe.width / 700, safe.height / 1120);
    this.baseX = safe.centerX;
    this.baseY = safe.top + safe.height * 0.54;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    const bg = this.backdrop.clear();
    bg.fillStyle(GLASS.wall).fillRect(full.x, full.y, full.width, full.height);
    bg.fillStyle(GLASS.frame, 0.055).fillTriangle(full.x, safe.bottom, safe.right, safe.bottom, safe.right, safe.top + safe.height * 0.4);
    const g = this.glass.clear();
    g.fillStyle(GLASS.ink, 0.12).fillRoundedRect(-253, -266, 540, 606, 104);
    g.fillStyle(GLASS.frame).fillRoundedRect(-272, -286, 544, 606, 108);
    g.fillStyle(GLASS.ink).fillRoundedRect(-252, -267, 504, 560, 94);
    g.fillStyle(GLASS.blue).fillRoundedRect(-236, -251, 472, 529, 82);
    // Flattened landscape and reflected light sit behind the removable surface dirt.
    g.fillStyle(0xc8dfda).fillCircle(106, -144, 54);
    g.fillStyle(0x83b1be).fillRect(-230, 111, 460, 162);
    g.fillStyle(0x719ba9).fillTriangle(-230, 181, -71, 20, 111, 273);
    g.fillStyle(0x8ebcc4).fillTriangle(-93, 273, 132, 45, 230, 273);
    g.fillStyle(GLASS.light, 0.45).fillTriangle(-218, -169, -99, -244, -218, 26);
    g.fillStyle(GLASS.light, 0.25).fillTriangle(-198, 112, 27, -239, 65, -239);
    g.lineStyle(3, GLASS.light, 0.55).lineBetween(-251, 277, 251, 277);
    g.fillStyle(GLASS.ink).fillRoundedRect(-291, 300, 582, 24, 6);
    g.fillStyle(0xc6b8c6).fillRoundedRect(-282, 291, 565, 15, 4);
    g.fillStyle(GLASS.ink, 0.12).fillEllipse(13, 344, 500, 25);
  }
  public reset(plan: RoundPlan): void {
    this.plan = plan; this.phase = 'prepare'; this.cleanAt = plan.targets.map(() => Infinity);
    this.strokeAt = -100; this.strokes = 0; this.lane = 0; this.lastDemo = -Infinity;
    this.finishAt = null; this.finished = false; this.successful = false;
  }
  public onPhase(phase: Phase, _now: number): void {
    this.phase = phase;
    if (phase === 'handoff') { this.cleanAt.fill(Infinity); this.strokes = 0; this.strokeAt = -100; }
  }
  public onDemonstrationBeat(time: number): void {
    if (time <= this.lastDemo) return;
    this.lastDemo = time;
    this.stroke(time);
    this.cleanAt[this.lane] = time;
  }
  private stroke(now: number): void {
    this.lane = this.strokes++ % (this.plan?.targets.length ?? 4);
    this.strokeAt = now;
    this.positionTool(now);
  }
  public onPlayerHit(now: number): void { this.stroke(now); }
  public onAccuracy(result: Judgement, now: number): void {
    if (result.kind === 'hit' && result.index !== null) {
      this.lane = result.index;
      this.cleanAt[this.lane] = now;
      this.positionTool(now);
    }
  }
  public finish(successful: boolean, contactSec: number): void { this.successful = successful; this.finishAt = contactSec; }
  public pause(): void { this.phase = 'paused'; this.finishAt = null; }
  private positionTool(now: number): void {
    const age = now - this.strokeAt;
    const p = strokeProgress(age);
    const direction = this.lane % 2 ? -1 : 1;
    const y = -184 + (this.lane + 0.5) * 430 / (this.plan?.targets.length ?? 4);
    const x = direction * (-212 + 424 * p);
    this.tool.setPosition(age > 0.5 ? x : x + direction * Math.sin(p * Math.PI) * 9, y);
    this.tool.setRotation(direction * Math.sin(p * Math.PI) * 0.08);
    this.tool.setScale(1, 1 - Math.sin(p * Math.PI) * 0.06);
    if (age > 0.5) this.tool.y += Math.sin(now * 1.6) * (this.reducedMotion ? 0 : 2);
    if (age > 0.5 && (this.phase === 'idle' || this.phase === 'prepare' || this.phase === 'handoff')) this.tool.setPosition(-190, 165).setRotation(-0.15);
  }
  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow; else this.lastNow = now;
    this.stage.setPosition(this.baseX, this.baseY);
    if (this.phase === 'prepare' || this.phase === 'demonstrate') {
      for (const cue of this.plan?.cues ?? []) if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
    }
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true;
      this.stroke(this.finishAt);
      if (this.successful) this.cleanAt = this.cleanAt.map(time => Math.min(time, this.finishAt!));
    }
    this.positionTool(now);
    const g = this.dirt.clear();
    const count = this.plan?.targets.length ?? 4;
    // Fixed deterministic marks, no per-hit objects or texture/mask allocations.
    for (let row = 0; row < 24; row++) {
      for (let col = 0; col < 17; col++) {
        const x = -215 + col * 26;
        const y = -215 + row * 20;
        if (y < -180 && Math.abs(x) > 188) continue;
        const lane = Math.min(count - 1, Math.max(0, Math.floor((y + 184) / (430 / count))));
        const p = strokeProgress(now - (this.cleanAt[lane] ?? Infinity));
        const covered = lane % 2 ? x > 212 - 424 * p : x < -212 + 424 * p;
        const seed = (row * 43 + col * 29) % 19;
        const alpha = covered ? 0.02 : 0.17 + seed / 90;
        g.fillStyle(seed % 2 ? 0x7c8e98 : 0xd5d2bd, alpha).fillEllipse(x + seed % 9 - 4, y + seed % 11 - 5, 31 + seed, 19 + seed % 13);
        if (seed < 5 && !covered) g.lineStyle(2, GLASS.ink, 0.12).lineBetween(x, y, x - 3, y + 26);
      }
    }
    const shine = this.gleam.clear();
    const clean = this.cleanAt.reduce((sum, time) => sum + strokeProgress(now - time), 0) / count;
    shine.lineStyle(4, GLASS.light, 0.15 + clean * 0.65).lineBetween(-192, 76, -34, -185);
    shine.lineStyle(12, GLASS.light, clean * 0.3).lineBetween(-169, 82, -12, -179);
    if (this.phase === 'handoff' && this.plan) {
      const p = ((now - this.plan.handoff) / (60 / this.plan.bpm)) % 1;
      shine.lineStyle(2, GLASS.light, Math.sin(p * Math.PI) * 0.7).strokeEllipse(0, 20, 400 + p * 40, 435 + p * 30);
    }
    if (this.finished && this.finishAt !== null) {
      const p = easeOut((now - this.finishAt) / 0.45);
      if (this.successful) {
        // The reflected sun becomes a crisp little four-point glint.
        shine.fillStyle(GLASS.light, p).fillTriangle(106, -188, 98, -144, 114, -144);
        shine.fillStyle(GLASS.light, p).fillTriangle(106, -100, 98, -144, 114, -144);
        shine.fillStyle(GLASS.light, p).fillTriangle(69, -144, 106, -151, 106, -137);
        shine.fillStyle(GLASS.light, p).fillTriangle(143, -144, 106, -151, 106, -137);
      } else {
        shine.lineStyle(5, GLASS.light, 0.75).strokeEllipse(93, 16, 36, 53);
        shine.lineBetween(93, 44, 95, 44 + p * 29);
      }
    }
    this.droplets.clear();
    const age = now - this.strokeAt;
    if (age >= 0 && age < 0.32) for (let i = 0; i < 5; i++) {
      this.droplets.fillStyle(GLASS.light, (1 - age / 0.32) * 0.75).fillEllipse(this.tool.x - 15 - i * 7, this.tool.y + 48 + age * age * 390 + i * 5, 4, 9);
    }
  }
  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
  public destroy(): void { this.stage.destroy(true); this.backdrop.destroy(); }
}
