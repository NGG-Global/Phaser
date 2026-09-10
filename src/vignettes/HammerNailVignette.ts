import Phaser from 'phaser';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import type { Vignette } from './Vignette';
import { anticipation, clamp01, easeOut, HAMMER_MOTION, nailHeight, recoil } from './hammerMotion';

export const WORKSHOP = {
  paper: 0xeee8d8, ink: 0x243e35, muted: 0x788074, sun: 0xdfc37f,
  wood: 0xc99460, woodDark: 0x936542, red: 0xcf5134, cream: 0xfff9e8,
} as const;

/** Owns an illustration and its motion. It cannot capture input or judge a rhythm. */
export class HammerNailVignette implements Vignette {
  private readonly stage: Phaser.GameObjects.Container;
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly disc: Phaser.GameObjects.Arc;
  private readonly wood: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly nail: Phaser.GameObjects.Graphics;
  private readonly hammer: Phaser.GameObjects.Container;
  private readonly dust: Phaser.GameObjects.Graphics;
  private readonly halo: Phaser.GameObjects.Graphics;
  private readonly grain: Phaser.GameObjects.TileSprite;
  private phase: Phase = 'idle';
  private plan: RoundPlan | null = null;
  private depth = 0;
  private depthFrom = 0;
  private depthTo = 0;
  private depthAt = -100;
  private strikeAt = -100;
  private impactX = 310;
  private impactY = -203;
  private strength = 1;
  private finishAt: number | null = null;
  private finishDone = false;
  private successful = false;
  private bend = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  private lastNow = 0;
  private lastDemoStrike = -Infinity;
  private handoffAt = -100;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  public constructor(private readonly scene: Phaser.Scene) {
    this.backdrop = scene.add.graphics().setDepth(-20);
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.disc = scene.add.circle(270, -285, 258, WORKSHOP.sun, 0.36);
    this.halo = scene.add.graphics();
    this.wood = scene.add.graphics();
    this.shadow = scene.add.ellipse(340, 8, 142, 22, WORKSHOP.ink, 0.12);
    this.nail = scene.add.graphics();
    this.hammer = scene.add.container(0, 0);
    this.drawHammer();
    this.dust = scene.add.graphics();
    this.stage.add([this.disc, this.halo, this.wood, this.shadow, this.nail, this.hammer, this.dust]);
    this.makeGrain();
    this.grain = scene.add.tileSprite(0, 0, 1, 1, 'workshop-grain').setOrigin(0).setAlpha(0.23).setDepth(-9);
  }

  private makeGrain(): void {
    if (this.scene.textures.exists('workshop-grain')) return;
    const texture = this.scene.textures.createCanvas('workshop-grain', 192, 192);
    if (!texture) return;
    const ctx = texture.getContext();
    let seed = 431;
    for (let i = 0; i < 5500; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const x = seed % 192;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,240,.32)' : 'rgba(45,52,37,.15)';
      ctx.fillRect(x, seed % 192, 1, i % 5 === 0 ? 2 : 1);
    }
    texture.refresh();
  }

  private drawHammer(): void {
    const g = this.scene.add.graphics();
    // The grip is the rotation pivot. The striking face is exactly (-290, 36).
    g.fillStyle(WORKSHOP.ink, 0.08).fillRoundedRect(-256, -14, 275, 52, 16);
    g.fillStyle(WORKSHOP.red).fillRoundedRect(-270, -25, 286, 48, 14);
    g.fillStyle(0xe07950).fillRoundedRect(-248, -24, 220, 8, 4);
    g.fillStyle(0xaa3e2c).fillRoundedRect(-243, 13, 245, 10, 4);
    g.fillStyle(WORKSHOP.ink).fillRoundedRect(-45, -26, 68, 51, 13);
    g.lineStyle(2, 0x698075, 0.42);
    for (let x = -34; x < 11; x += 9) { g.lineBetween(x, -15, x + 6, 14); }
    // Forged head, poll on the left and a deliberately graphic split claw on the right.
    g.fillStyle(WORKSHOP.ink);
    g.fillRoundedRect(-322, -63, 78, 101, 8);
    g.fillRect(-247, -52, 42, 36);
    g.fillPoints([[-210, -52], [-158, -44], [-139, -3], [-167, -18], [-196, -23], [-209, -16]].map(([x, y]) => new Phaser.Math.Vector2(x!, y!)), true);
    g.fillStyle(0x466053).fillRoundedRect(-322, -63, 78, 13, 5);
    g.fillStyle(0x799181).fillRect(-319, -47, 6, 64);
    g.fillStyle(0x162b25).fillRoundedRect(-327, 25, 88, 13, 4);
    g.fillStyle(0xa9b6a1).fillRoundedRect(-327, 33, 88, 5, 2);
    g.fillStyle(WORKSHOP.paper).fillCircle(-275, -34, 4);
    this.hammer.add(g);
  }

  public layout(viewport: Viewport): void {
    const { full, safe } = viewport;
    this.scale = Math.min(safe.width / 650, safe.height / 1000);
    this.baseX = safe.centerX - 350 * this.scale;
    this.baseY = safe.top + safe.height * 0.68;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.clear().fillStyle(WORKSHOP.paper).fillRect(full.x, full.y, full.width, full.height);
    this.wood.clear();
    this.wood.fillStyle(WORKSHOP.wood).fillRect(-2500, 0, 5700, 2500);
    this.wood.fillStyle(0xe2b47f).fillRect(-2500, 0, 5700, 19);
    this.wood.fillStyle(WORKSHOP.cream, 0.18).fillRect(-2500, 0, 5700, 3);
    this.wood.lineStyle(1.5, WORKSHOP.woodDark, 0.18);
    // Widely spaced growth lines, interrupted by a knot; baked geometry, no texture download.
    for (let row = 0; row < 15; row++) {
      const y = 48 + row * 38;
      this.wood.beginPath();
      for (let x = -900; x <= 1650; x += 15) {
        const wave = Math.sin(x / 185 + row * 0.65) * 8 + Math.exp(-(((x - 540) / 100) ** 2)) * (row % 2 ? 12 : -12);
        if (x === -900) this.wood.moveTo(x, y + wave); else this.wood.lineTo(x, y + wave);
      }
      this.wood.strokePath();
    }
    this.wood.lineStyle(2, WORKSHOP.woodDark, 0.22).strokeEllipse(538, 124, 58, 16).strokeEllipse(538, 124, 26, 6);
    this.grain.setPosition(full.x, full.y).setSize(full.width, full.height);
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.depth = this.depthFrom = this.depthTo = 0;
    this.depthAt = this.strikeAt = -100;
    this.bend = 0;
    this.finishAt = null;
    this.finishDone = false;
    this.handoffAt = -100;
    this.lastDemoStrike = -Infinity;
    this.phase = 'prepare';
  }
  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    if (phase === 'handoff') {
      this.setDepth(0, now);
      this.handoffAt = now;
    }
  }
  private setDepth(value: number, now: number): void {
    this.depthFrom = this.depth;
    this.depthTo = clamp01(value);
    this.depthAt = now;
  }
  public onDemonstrationBeat(time: number): void {
    if (time <= this.lastDemoStrike) return;
    this.lastDemoStrike = time;
    this.strike(time, 0.8);
    this.setDepth(this.depthTo + 0.65 / (this.plan?.targets.length ?? 4), time);
  }
  public onPlayerHit(now: number): void { this.strike(now, 1); }
  public onAccuracy(result: Judgement, now: number): void {
    if (result.kind === 'hit') this.setDepth(this.depthTo + 0.75 / (this.plan?.targets.length ?? 4), now);
    else if (result.kind === 'extra') this.strength = 0.4;
  }
  public finish(successful: boolean, contactSec: number): void {
    this.successful = successful;
    this.finishAt = contactSec;
  }
  public pause(): void {
    this.phase = 'paused';
    this.finishAt = null;
    this.strikeAt = -100;
  }
  private strike(now: number, strength: number): void {
    this.strikeAt = now;
    this.strength = strength;
    this.impactX = 310;
    this.impactY = -nailHeight(this.depth) - 10;
    // Input callbacks can render contact immediately, independently of the next frame.
    this.pose(0, this.depth);
  }
  private pose(angle: number, depth: number): void {
    this.hammer.setPosition(600, -nailHeight(depth) - 48).setRotation(angle);
  }

  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow;
    else this.lastNow = now;
    // Rendering may observe a beat before the controller's next pump. Contact is
    // sampled from the same absolute cue, preventing a one-frame rebound/pop.
    if (this.phase === 'prepare' || this.phase === 'demonstrate') {
      for (const cue of this.plan?.cues ?? []) {
        if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
      }
    }
    this.depth = this.depthFrom + (this.depthTo - this.depthFrom) * easeOut((now - this.depthAt) / (this.phase === 'handoff' ? 0.3 : 0.085));
    if (this.finishAt !== null && now >= this.finishAt && !this.finishDone) {
      this.finishDone = true;
      this.strike(this.finishAt, this.successful ? 1.6 : 0.7);
      this.setDepth(this.successful ? 1 : Math.max(0.5, this.depth), this.finishAt);
    }
    const age = now - this.strikeAt;
    let angle = age < HAMMER_MOTION.recoilSec ? recoil(age) : 0.55;
    const next = this.phase === 'demonstrate' || this.phase === 'prepare'
      ? this.plan?.cues.find(cue => cue.kind === 'action' && cue.time > now)?.time : undefined;
    const upcoming = this.finishAt !== null && !this.finishDone ? this.finishAt : next;
    if (upcoming !== undefined && upcoming !== null && upcoming - now < HAMMER_MOTION.anticipationSec) angle = anticipation(upcoming - now, angle);
    if (this.phase === 'idle') angle += Math.sin(now * 1.25) * 0.025;
    if (this.phase === 'handoff' && this.plan && !this.reducedMotion) {
      const offer = clamp01((now - this.handoffAt) / (this.plan.response - this.plan.handoff));
      angle += Math.sin(offer * Math.PI) ** 2 * 0.18;
    }
    if (this.finishDone && !this.successful) {
      this.bend = easeOut((now - this.finishAt!) / 0.36);
      angle += Math.sin((now - this.finishAt!) * 14) * Math.exp(-(now - this.finishAt!) * 3) * 0.1;
    }
    this.pose(angle, this.depth);
    const squash = age >= 0 && age < 0.07 ? Math.sin(age / 0.07 * Math.PI) * 0.045 * this.strength : 0;
    this.hammer.setScale(1 + squash, 1 - squash);
    // Keep the striking face pinned while the handle compresses around it.
    this.hammer.x += (290 * Math.cos(angle) - 38 * Math.sin(angle)) * squash;
    this.hammer.y += (290 * Math.sin(angle) + 38 * Math.cos(angle)) * squash;
    const shake = this.reducedMotion || age < 0 || age > 0.2 ? 0 : Math.sin(age * 110) * Math.exp(-age * 20) * this.strength * 2.7;
    this.stage.setPosition(this.baseX + shake * this.scale, this.baseY + shake * this.scale * 0.35);
    const pressure = age >= 0 && age < 0.18 ? Math.sin(age / 0.18 * Math.PI) * this.strength : 0;
    this.shadow.setPosition(340 - Math.sin(angle) * 25, 10).setScale(1 + pressure * 0.25, 1 - pressure * 0.2).setAlpha(0.8 + pressure * 0.2);
    this.wood.y = this.reducedMotion ? 0 : pressure * 1.6;
    this.drawNail(now);
    this.drawDust(age);
    this.halo.clear();
    const transfer = easeOut((now - this.handoffAt) / 0.7);
    const offered = this.phase === 'handoff' || this.phase === 'respond' || this.phase === 'result';
    // The spotlight opens toward the player's side, then two existing audio
    // ready cues contract onto the nail. No independent visual beat timer.
    this.disc.setPosition(270 + (offered ? transfer * 40 : 0), -285 + (offered ? transfer * 28 : 0));
    this.disc.setScale(offered ? 1 + transfer * 0.09 : 1).setAlpha(offered ? 0.36 + transfer * 0.18 : 0.36);
    if (this.phase === 'handoff' && this.plan) {
      const beat = 60 / this.plan.bpm;
      const p = clamp01(((now - this.plan.handoff) % beat) / beat);
      const radius = 45 + (1 - easeOut(p)) * 130;
      this.halo.lineStyle(2, WORKSHOP.ink, Math.sin(p * Math.PI) * 0.35).strokeCircle(310, -nailHeight(this.depth) - 10, radius);
    }
  }
  private drawNail(now: number): void {
    const h = nailHeight(this.depth);
    const x = 310;
    const bentX = this.bend * 48;
    const wobble = this.phase === 'result' && this.bend > 0 ? Math.sin((now - (this.finishAt ?? now)) * 19) * Math.exp(-(now - (this.finishAt ?? now)) * 3) * 4 : 0;
    const g = this.nail.clear();
    // A long, low-contrast cast shadow anchors the slender shaft to the timber.
    g.fillStyle(WORKSHOP.ink, 0.075).fillTriangle(x - 12, 5, x + 12, 5, x + Math.max(0, h) * 0.7, 34 + Math.max(0, h) * 0.14);
    g.fillStyle(WORKSHOP.ink, 0.2).fillEllipse(x + 7, 3, 72, 14);
    if (h > 0) {
      g.lineStyle(25, WORKSHOP.ink).beginPath().moveTo(x, 0).lineTo(x, -h * 0.38).lineTo(x + bentX + wobble, -h).strokePath();
      g.lineStyle(6, 0xa6b29d).beginPath().moveTo(x - 6, -4).lineTo(x - 6, -h * 0.4).lineTo(x + bentX + wobble - 6, -h).strokePath();
    }
    g.fillStyle(WORKSHOP.ink).fillRoundedRect(x + bentX + wobble - 38, -h - 10, 76, 15, 5);
    g.fillStyle(0x9baa96).fillEllipse(x + bentX + wobble, -h - 10, 76, 13);
    g.lineStyle(2, WORKSHOP.cream, 0.8).lineBetween(x + bentX - 20, -h - 13, x + bentX + 11, -h - 13);
    if (this.finishDone && this.successful) {
      const p = clamp01((now - this.finishAt!) / 0.7);
      g.lineStyle(2, WORKSHOP.cream, 1 - p);
      g.lineBetween(x + 42, -25 - p * 20, x + 42, -9 - p * 20);
      g.lineBetween(x + 34, -17 - p * 20, x + 50, -17 - p * 20);
    }
  }
  private drawDust(age: number): void {
    const g = this.dust.clear();
    if (age < 0 || age > 0.42) return;
    const p = age / 0.42;
    const distance = easeOut(p) * 70 * this.strength;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + i * Math.PI / 6;
      const x = this.impactX + Math.cos(a) * distance;
      const y = this.impactY + Math.sin(a) * distance * 0.65 + p * p * 25;
      g.fillStyle(i % 2 ? WORKSHOP.cream : WORKSHOP.sun, (1 - p) * 0.9);
      g.fillRect(x, y, (i % 3 + 2) * (1 - p), (i % 2 + 3) * (1 - p));
    }
    if (age < 0.08) {
      g.lineStyle(3, WORKSHOP.cream, 1 - age / 0.08);
      g.lineBetween(this.impactX - 48, this.impactY - 10, this.impactX - 66, this.impactY - 25);
      g.lineBetween(this.impactX + 48, this.impactY - 10, this.impactX + 66, this.impactY - 25);
    }
    if (age < 0.17) {
      const ring = age / 0.17;
      g.lineStyle(2, WORKSHOP.cream, (1 - ring) * 0.55);
      g.strokeEllipse(this.impactX, this.impactY + 4, 78 + ring * 65, 12 + ring * 15);
    }
  }
  public destroy(): void { this.stage.destroy(true); this.backdrop.destroy(); this.grain.destroy(); }
  /** Scene supplies absolute musical slide progress; never owns a transition timer. */
  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
}
