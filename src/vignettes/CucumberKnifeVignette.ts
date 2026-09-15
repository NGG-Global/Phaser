import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { reducedMotion } from '@/core/motionPreference';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { MaterialKey } from '@/textures/materials';
import { Backdrop } from '@/ui/backdrop';
import { shade } from '@/ui/colour';
import { Feedback } from '@/ui/feedback';
import { castShadow, faces } from '@/ui/light';
import type { Vignette } from './Vignette';
import {
  acceptDemoBeat, advanceSlice, clamp01, cucumberBody, cucumberHalfAt, CUCUMBER_MOTION, cucumberTiming,
  cutAt, cutFraction, cutStart, easeOut, juiceFall, knifeLift, knifeWindup, REFERENCE_BEAT, sliceTumble,
} from './cucumberMotion';
import { isPlayerTurn, TURN_OPEN_SEC } from './motion';

/**
 * A cool tiled kitchen. The cucumber is the only saturated green in it, so it is the
 * subject — away from Window's glass, Bug's sage and Curl's teal tank.
 */
export const CRISP = {
  paper: 0xf1f5f3, ink: 0x2c4038, grout: 0xb7c9c4, counter: 0x8aa198,
  board: 0xddd0a8, boardEdge: 0xb08d58, boardLine: 0xc9b47e,
  skin: 0x3f8a38, skinLit: 0x6fb85a, stripe: 0x8fd46a, blossom: 0xf0c35a,
  flesh: 0xeef6d4, fleshRing: 0xd4e8a4, gel: 0xc5d86a, seed: 0x6a7a32,
  stem: 0x3a5c32, stemLit: 0x5a7c48,
  steel: 0xd3dadd, steelLit: 0xf4f7f8, steelDark: 0x9aa5aa, handle: 0x2b2b30, rivet: 0xb9c2c6,
} as const;

const BOARD_LEFT = -620;
const BOARD_RIGHT = 620;
const BOARD_THICK = 42;
const CX = CUCUMBER_MOTION.x;
const RX = CUCUMBER_MOTION.radiusX;
const RY = CUCUMBER_MOTION.radiusY;
// Coins come off the flower end and lean in a pile to the right of the remaining fruit.
const PILE_X = 186;
const PILE_STEP = 22;
const SLICE_R = 58;
const LEAN = 0.38;
const BLADE_LEN = 300;
const HANDLE_LEN = 168;
const ARC_STEPS = 28;
const JUICE_DROPS = 8;

function fan(g: Phaser.GameObjects.Graphics, pts: readonly number[]): void {
  for (let i = 2; i + 1 < pts.length; i += 2) {
    g.fillTriangle(pts[0]!, pts[1]!, pts[i]!, pts[i + 1]!, pts[i + 2] ?? pts[0]!, pts[i + 3] ?? pts[1]!);
  }
}

function disc(cx: number, cy: number, a: number, b: number, tilt: number): number[] {
  const pts: number[] = [];
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  for (let i = 0; i < ARC_STEPS; i++) {
    const t = i / ARC_STEPS * Math.PI * 2;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    pts.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return pts;
}

function strokePoly(g: Phaser.GameObjects.Graphics, pts: readonly number[]): void {
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) g[i === 0 ? 'moveTo' : 'lineTo'](pts[i]!, pts[i + 1]!);
  g.closePath().strokePath();
}

/** Owns an illustration and its motion. Judgement arrives already decided; it is never computed here. */
export class CucumberKnifeVignette implements Vignette {
  private readonly backdrop: Backdrop;
  private readonly wall: Phaser.GameObjects.Graphics;
  private readonly boardSurface: Phaser.GameObjects.TileSprite;
  private readonly bursts: Feedback;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly boardG: Phaser.GameObjects.Graphics;
  private readonly produce: Phaser.GameObjects.Container;
  private readonly cucumberG: Phaser.GameObjects.Graphics;
  private readonly slicesG: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly juice: Phaser.GameObjects.Graphics;
  private readonly knife: Phaser.GameObjects.Container;
  private readonly rings: Phaser.GameObjects.Graphics;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  private respondAt = -100;
  private lastDemo = -Infinity;
  private strikes = 0;
  private strikeAt = -100;
  private strikeX = 0;
  private slices = 0;
  private sliceAt: number[] = [];
  private sliceFrom: number[] = [];
  private sliceWobble: number[] = [];
  private cut = 0;
  private cutFrom = 0;
  private cutTo = 0;
  private cutAt = -100;
  private uneven = 0;
  private nicks: number[] = [];
  private judderAt = -100;
  private finishAt: number | null = null;
  private finished = false;
  private successful = false;
  private lastNow = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor(scene: Phaser.Scene) {
    this.backdrop = new Backdrop(scene, CRISP.paper, CRISP.board, { glowAt: { x: 0.42, y: 0.42 }, glowAlpha: 0.4 });
    this.wall = scene.add.graphics().setDepth(-20);
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.boardG = scene.add.graphics();
    this.boardSurface = scene.add.tileSprite(BOARD_LEFT, 0, BOARD_RIGHT - BOARD_LEFT, BOARD_THICK, MaterialKey.wood)
      .setOrigin(0).setTint(CRISP.board).setAlpha(0.5 * STYLE.current.grain);
    this.boardSurface.setTileScale(0.3, 0.3);
    this.produce = scene.add.container(0, 0);
    this.cucumberG = scene.add.graphics();
    this.slicesG = scene.add.graphics();
    this.marks = scene.add.graphics();
    this.juice = scene.add.graphics();
    this.produce.add([this.marks, this.cucumberG, this.slicesG, this.juice]);
    this.knife = scene.add.container(0, 0);
    this.knife.add(this.drawKnife(scene));
    this.rings = scene.add.graphics();
    this.stage.add([this.boardG, this.boardSurface, this.produce, this.rings, this.knife]);
    this.bursts = new Feedback(scene, -10, this.stage);
    this.cut = this.cutFrom = this.cutTo = cutStart();
  }

  private drawKnife(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics();
    const line = STYLE.current.outline * 1.4;
    const blade = [0, 0, BLADE_LEN, 0, BLADE_LEN, -72, 210, -74, 120, -62, 40, -34, 8, -8];
    const drop = castShadow(8);
    g.fillStyle(CRISP.ink, drop.alpha);
    fan(g, blade.map((v, i) => v + (i % 2 ? drop.dy : drop.dx)));
    if (line > 0) {
      g.lineStyle(line, shade(CRISP.steel, -0.55), 1).beginPath();
      for (let i = 0; i < blade.length; i += 2) g[i === 0 ? 'moveTo' : 'lineTo'](blade[i]!, blade[i + 1]!);
      g.closePath().strokePath();
    }
    g.fillStyle(CRISP.steel);
    fan(g, blade);
    g.lineStyle(3, CRISP.steelLit, 0.9).lineBetween(6, -3, BLADE_LEN - 4, -3);
    g.lineStyle(2, CRISP.steelDark, 0.6).lineBetween(40, -33, BLADE_LEN - 2, -71);
    g.fillStyle(CRISP.steelDark).fillRoundedRect(BLADE_LEN - 8, -76, 22, 82, 5);
    const handle = faces(CRISP.handle);
    if (line > 0) g.lineStyle(line, handle.edge, 1).strokeRoundedRect(BLADE_LEN + 8, -64, HANDLE_LEN, 58, 16);
    g.fillStyle(handle.shade).fillRoundedRect(BLADE_LEN + 8, -64, HANDLE_LEN, 58, 16);
    g.fillStyle(handle.face).fillRoundedRect(BLADE_LEN + 8, -64, HANDLE_LEN, 46, 16);
    g.fillStyle(CRISP.paper, 0.12).fillRoundedRect(BLADE_LEN + 22, -56, HANDLE_LEN - 40, 14, 7);
    g.fillStyle(CRISP.rivet);
    for (const x of [BLADE_LEN + 46, BLADE_LEN + 92, BLADE_LEN + 138]) g.fillCircle(x, -35, 6);
    return g;
  }

  public layout(viewport: Viewport): void {
    const { full, safe } = viewport;
    this.scale = Math.min(safe.width / 900, safe.height / 1300);
    this.baseX = safe.centerX - 40 * this.scale;
    this.baseY = safe.top + safe.height * 0.62;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.layout(viewport);
    const bg = this.wall.clear();
    const tile = 120 * this.scale;
    const counterY = this.baseY + BOARD_THICK * this.scale;
    bg.lineStyle(2 * this.scale, CRISP.grout, 0.55);
    for (let y = counterY - tile; y > full.y - tile; y -= tile) bg.lineBetween(full.x, y, full.right, y);
    for (let x = this.baseX % tile; x < full.right + tile; x += tile) bg.lineBetween(x, full.y, x, counterY);
    bg.fillStyle(CRISP.counter, 0.35).fillRect(full.x, counterY, full.width, full.bottom - counterY);
    bg.fillStyle(CRISP.ink, 0.08).fillRect(full.x, counterY, full.width, 6 * this.scale);
    const b = this.boardG.clear();
    const board = faces(CRISP.board);
    const line = STYLE.current.outline * 1.4;
    const boardDrop = castShadow(10);
    b.fillStyle(CRISP.ink, boardDrop.alpha).fillRect(BOARD_LEFT + 10 + boardDrop.dx, BOARD_THICK + boardDrop.dy, BOARD_RIGHT - BOARD_LEFT - 20, 14);
    if (line > 0) b.lineStyle(line, shade(CRISP.board, -0.6), 1).strokeRoundedRect(BOARD_LEFT, 0, BOARD_RIGHT - BOARD_LEFT, BOARD_THICK, 6);
    b.fillStyle(board.face).fillRoundedRect(BOARD_LEFT, 0, BOARD_RIGHT - BOARD_LEFT, BOARD_THICK, 6);
    b.fillStyle(shade(CRISP.boardEdge, -0.1)).fillRect(BOARD_LEFT, BOARD_THICK - 16, BOARD_RIGHT - BOARD_LEFT, 16);
    b.fillStyle(board.lit).fillRect(BOARD_LEFT + 4, 0, BOARD_RIGHT - BOARD_LEFT - 8, 7);
    b.fillStyle(board.rim, 0.7).fillRect(BOARD_LEFT + 4, 0, BOARD_RIGHT - BOARD_LEFT - 8, 3);
    b.lineStyle(1.5, CRISP.boardLine, 0.7);
    for (const y of [11, 19]) b.lineBetween(BOARD_LEFT + 30, y, BOARD_RIGHT - 30, y + 1);
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.phase = 'prepare';
    this.lastDemo = -Infinity;
    this.strikes = this.slices = 0;
    this.strikeAt = -100;
    this.strikeX = cutStart();
    this.respondAt = -100;
    this.sliceAt = [];
    this.sliceFrom = [];
    this.sliceWobble = [];
    this.cut = this.cutFrom = this.cutTo = cutStart();
    this.cutAt = -100;
    this.uneven = 0;
    this.nicks = [];
    this.judderAt = -100;
    this.finishAt = null;
    this.finished = false;
    this.successful = false;
  }

  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    if (phase === 'respond') { this.strikeAt = -100; this.setCut(0, now); this.respondAt = now; }
  }

  private setCut(fraction: number, now: number): void {
    this.cutFrom = this.cut;
    this.cutTo = cutAt(clamp01(fraction));
    this.cutAt = now;
  }

  private strike(now: number): void {
    this.strikes++;
    this.strikeAt = now;
    this.strikeX = this.cutTo;
  }

  private takeSlice(now: number, targets: number): void {
    if (!this.reducedMotion) this.bursts.burst('water', this.cutTo, -RY, [CRISP.flesh, CRISP.gel, CRISP.fleshRing], 7);
    this.sliceAt.push(now);
    this.sliceFrom.push(this.cutTo);
    this.sliceWobble.push(this.uneven * (((this.slices * 7 + 3) % 5) / 5 - 0.5));
    this.setCut(cutFraction(this.slices, targets), now);
  }

  public onDemonstrationBeat(time: number): void {
    const accepted = acceptDemoBeat(this.lastDemo, time);
    if (accepted === null) return;
    this.lastDemo = accepted;
    this.strike(time);
  }

  public onPlayerHit(now: number): void {
    if (!isPlayerTurn(this.phase)) return;
    this.strike(now);
  }

  public onAccuracy(result: Judgement, now: number): void {
    const slices = advanceSlice(this.slices, result.kind);
    if (slices !== this.slices) {
      this.slices = slices;
      this.takeSlice(now, this.plan?.targets.length ?? 3);
      return;
    }
    if (result.kind === 'extra') {
      this.strikeX = this.cutTo + 96 + this.nicks.length * 12;
      this.nicks.push(this.strikeX);
    } else {
      this.judderAt = now;
    }
    this.uneven = Math.min(1, this.uneven + 0.22);
  }

  public finish(successful: boolean, contactSec: number): void {
    this.successful = successful;
    this.finishAt = contactSec;
  }
  public pause(): void { this.phase = 'paused'; this.finishAt = null; this.strikeAt = -100; }

  private beat(): number { return this.plan ? 60 / this.plan.bpm : REFERENCE_BEAT; }

  private upcoming(now: number): number | null {
    if (this.finishAt !== null && !this.finished) return this.finishAt;
    if (this.phase !== 'prepare' && this.phase !== 'demonstrate') return null;
    return this.plan?.cues.find(cue => cue.kind === 'action' && cue.time > now)?.time ?? null;
  }

  private openStage(now: number): void {
    const offered = this.phase === 'respond' || this.phase === 'result';
    this.backdrop.open(offered ? easeOut((now - this.respondAt) / TURN_OPEN_SEC) : 0);
  }

  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow; else this.lastNow = now;
    this.openStage(now);
    if (this.phase === 'prepare' || this.phase === 'demonstrate') {
      for (const cue of this.plan?.cues ?? []) {
        if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
      }
    }
    this.cut = this.cutFrom + (this.cutTo - this.cutFrom) * easeOut((now - this.cutAt) / 0.09);
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true;
      this.strike(this.finishAt);
      this.slices++;
      this.sliceAt.push(this.finishAt);
      this.sliceFrom.push(this.cutTo);
      this.sliceWobble.push(this.successful ? 0 : 0.5);
      this.setCut(1, this.finishAt);
      if (!this.successful) this.uneven = Math.max(this.uneven, 0.6);
    }
    const beat = this.beat();
    const age = now - this.strikeAt;
    const press = age >= 0 && age < 0.14 ? Math.sin(age / 0.14 * Math.PI) * STYLE.current.exaggeration : 0;
    const shake = this.reducedMotion || age < 0 || age > 0.16 ? 0 : Math.sin(age * 120) * Math.exp(-age * 24) * 1.8 * STYLE.current.exaggeration;
    this.stage.setPosition(this.baseX + shake * this.scale, this.baseY + shake * this.scale * 0.5);
    this.produce.setPosition(0, this.reducedMotion ? 0 : press * 1.2);
    this.poseKnife(now, beat, age);
    this.drawCucumber();
    this.drawSlices(now, beat);
    this.drawMarks(now);
    this.drawJuice(beat, age);
    this.drawRings(age);
  }

  private poseKnife(now: number, beat: number, age: number): void {
    const parked = age > 0.5 && (this.phase === 'idle' || this.phase === 'prepare');
    let lift = knifeLift(age, beat);
    const next = this.upcoming(now);
    if (next !== null && next - now < cucumberTiming(beat).windupSec) lift = knifeWindup(next - now, lift, beat);
    let tremble = 0;
    if (now - this.judderAt < 0.24 && !this.finished) {
      tremble = Math.sin((now - this.judderAt) * 92) * Math.exp(-(now - this.judderAt) * 12) * 0.035;
    }
    let x = this.strikeX + 6;
    if (parked) {
      lift = 1;
      x = this.cutTo + 54;
      if (!this.reducedMotion) lift += Math.sin(now * 1.6) * 0.02;
    }
    this.knife.setPosition(x, -lift * CUCUMBER_MOTION.lift);
    this.knife.setRotation(-0.12 - 0.42 * Math.min(1.12, lift) + tremble);
  }

  /** Remaining stadium, clipped at the cut, with ridges, a stem and an edge-on flesh face. */
  private drawCucumber(): void {
    const g = this.cucumberG.clear();
    const pts = cucumberBody(this.cut);
    if (pts.length < 6) return;
    const half = cucumberHalfAt(this.cut);
    g.fillStyle(CRISP.ink, 0.1);
    fan(g, disc(CX + 10, 6, Math.min(RX, (this.cut - (CX - RX)) / 2 + 8), 14, 0));
    const line = STYLE.current.outline * 1.4;
    if (line > 0) {
      g.lineStyle(line, shade(CRISP.skin, -0.55), 1);
      strokePoly(g, pts);
    }
    g.fillStyle(CRISP.skin);
    fan(g, pts);
    g.fillStyle(CRISP.stripe, 0.75);
    for (const offset of [-22, -4, 16]) {
      const ribbon: number[] = [];
      const left = CX - RX + RY + 18;
      const right = Math.min(this.cut - 8, CX + RX - RY - 12);
      if (right - left < 20) continue;
      ribbon.push(left, -RY + offset - 5, right, -RY + offset - 7, right, -RY + offset + 5, left, -RY + offset + 6);
      fan(g, ribbon);
    }
    if (this.cut > CX - 40) {
      g.fillStyle(CRISP.skinLit, 0.7);
      fan(g, disc(Math.min(CX - 90, this.cut - 40), -RY - 28, 70, 16, -0.12));
    }
    if (half > 4) {
      g.fillStyle(CRISP.flesh).fillRect(this.cut - 7, -RY - half, 8, half * 2);
      g.fillStyle(CRISP.gel, 0.9).fillRect(this.cut - 5, -RY - half * 0.38, 6, half * 0.76);
      g.fillStyle(CRISP.seed, 0.85);
      for (let i = -1; i <= 1; i++) g.fillEllipse(this.cut - 3, -RY + i * half * 0.28, 3.5, 8, 6);
    }
    if (this.cut > CX - RX + 50) {
      g.fillStyle(CRISP.stem);
      fan(g, [CX - RX - 8, -RY - 10, CX - RX + 18, -RY - 14, CX - RX + 18, -RY + 14, CX - RX - 8, -RY + 10]);
      g.fillStyle(CRISP.stemLit).fillRoundedRect(CX - RX - 16, -RY - 7, 14, 14, 4);
    }
    if (this.cut > CX + RX - 18) {
      const fx = CX + RX + 6;
      g.fillStyle(CRISP.blossom);
      for (let p = 0; p < 5; p++) {
        const a = p * Math.PI * 2 / 5 - Math.PI / 2;
        g.fillEllipse(fx + Math.cos(a) * 12, -RY + Math.sin(a) * 10, 10, 16, 6);
      }
      g.fillStyle(shade(CRISP.blossom, -0.25)).fillCircle(fx, -RY, 5);
    }
  }

  /** Each slice is a round coin that topples from the cut and leans on the last one. */
  private drawSlices(now: number, beat: number): void {
    const g = this.slicesG.clear();
    for (let i = 0; i < this.sliceAt.length; i++) {
      const p = sliceTumble(now - this.sliceAt[i]!, beat);
      const wobble = this.sliceWobble[i] ?? 0;
      const restX = PILE_X + i * PILE_STEP;
      const restLean = LEAN + wobble * 0.5;
      const squash = this.finished && !this.successful && i === this.sliceAt.length - 1 ? 0.55 : 1;
      const x = this.sliceFrom[i]! + (restX - this.sliceFrom[i]!) * p;
      const lean = restLean * p;
      const b = SLICE_R * squash;
      const cy = -b * Math.cos(lean) + 6;
      const a = 5 + (SLICE_R - 5) * Math.sin(Math.min(1, p) * Math.PI / 2);
      g.fillStyle(CRISP.ink, 0.1);
      fan(g, disc(x + 8, 6, a * 0.9 + 6, 10, 0));
      const outline = STYLE.current.outline * 1.4;
      if (outline > 0 && a > 12) {
        g.lineStyle(outline, shade(CRISP.skin, -0.55), 1);
        strokePoly(g, disc(x, cy, a, b, lean));
      }
      g.fillStyle(CRISP.skin);
      fan(g, disc(x, cy, a, b, lean));
      g.fillStyle(CRISP.flesh);
      fan(g, disc(x, cy, a * 0.86, b * 0.86, lean));
      g.fillStyle(CRISP.fleshRing, 0.7);
      fan(g, disc(x, cy, a * 0.62, b * 0.62, lean));
      if (a > 18) {
        g.fillStyle(CRISP.gel, 0.95);
        fan(g, disc(x, cy, a * 0.34, b * 0.34, lean));
        g.fillStyle(CRISP.seed);
        for (let s = 0; s < 6; s++) {
          const t = s * Math.PI / 3 + 0.35;
          const sx = a * 0.22 * Math.cos(t);
          const sy = b * 0.22 * Math.sin(t);
          g.fillEllipse(
            x + sx * Math.cos(lean) - sy * Math.sin(lean),
            cy + sx * Math.sin(lean) + sy * Math.cos(lean),
            5 + a / 18, 10, 6,
          );
        }
      }
    }
  }

  private drawMarks(now: number): void {
    const g = this.marks.clear();
    for (const x of this.nicks) {
      g.lineStyle(3, CRISP.boardEdge, 0.7).lineBetween(x - 28, 5, x + 30, 5);
      g.lineStyle(1.5, CRISP.ink, 0.25).lineBetween(x - 22, 7, x + 26, 7);
    }
    if (this.finished && this.successful && this.finishAt !== null) {
      const p = clamp01((now - this.finishAt - 0.9) / 0.32);
      if (p > 0 && p < 1) {
        g.fillStyle(CRISP.seed, 1 - p * 0.5);
        g.fillEllipse(cutAt(1) + 18, -56 + p * 54, 5, 9, 6);
      }
    }
  }

  private drawJuice(beat: number, age: number): void {
    const g = this.juice.clear();
    const { juiceSec } = cucumberTiming(beat);
    if (age < 0 || age > juiceSec || this.sliceAt.length === 0) return;
    if (Math.abs((this.sliceAt[this.sliceAt.length - 1] ?? -100) - this.strikeAt) > 0.001) return;
    const fall = juiceFall(age, beat);
    const spread = easeOut(age / juiceSec) * 80;
    const life = 1 - age / juiceSec;
    for (let i = 0; i < JUICE_DROPS; i++) {
      const seed = (i * 29 + 7) % 17;
      const x = this.strikeX + (seed / 17 - 0.5) * spread * 1.4;
      const y = -RY - 12 - Math.sin(i * 1.9) * spread * 0.5 + fall * (0.7 + seed / 34);
      g.fillStyle(i % 3 ? CRISP.flesh : CRISP.gel, life * 0.85);
      g.fillEllipse(x, y, 4 + seed % 3, 7 + seed % 4, 6);
    }
  }

  private drawRings(age: number): void {
    const g = this.rings.clear();
    if (age < 0 || age > 0.2) return;
    const p = age / 0.2;
    g.lineStyle(3, CRISP.paper, 1 - p).strokeEllipse(this.strikeX + 60, 3, 150 + p * 160, 12 + p * 18);
  }

  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
  public destroy(): void { this.bursts.destroy(); this.wall.destroy(); this.stage.destroy(true); this.backdrop.destroy(); }
}
