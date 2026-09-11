import type Phaser from 'phaser';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import type { Vignette } from './Vignette';
import {
  acceptDemoBeat, advanceSlice, clamp01, cutFraction, easeOut, juiceFall, knifeLift, knifeWindup,
  REFERENCE_BEAT, sliceTumble, TOMATO_MOTION, tomatoTiming,
} from './tomatoMotion';

/** A white-tiled kitchen. The tomato is the only saturated thing in it, so it is the subject. */
export const KITCHEN = {
  paper: 0xf6f7f2, ink: 0x33402f, grout: 0xc9d8cc, counter: 0x9fb3a6,
  board: 0xe3cfa6, boardEdge: 0xb8965f, boardLine: 0xcdb383,
  tomato: 0xd94a3a, tomatoLit: 0xee7c6a, flesh: 0xe35f4a, fleshRing: 0xf0a08e, seed: 0xf5d98a,
  stem: 0x4d7c3a, stemLit: 0x6f9c4c,
  steel: 0xd3dadd, steelLit: 0xf4f7f8, steelDark: 0x9aa5aa, handle: 0x2b2b30, rivet: 0xb9c2c6,
} as const;

// The board's top face is y = 0 in stage space; everything on it sits above that line.
const BOARD_LEFT = -620;
const BOARD_RIGHT = 620;
const BOARD_THICK = 42;
const TOMATO_X = -70;
const RX = TOMATO_MOTION.radiusX;
const RY = TOMATO_MOTION.radiusY;
// Slices come off the right side of the tomato and lean against each other to its right,
// which keeps the knife's descent over cleared board rather than through uncut fruit.
const PILE_X = 168;
const PILE_STEP = 30;
const SLICE_RX = 64;
const SLICE_RY = 118;
const LEAN = 0.42;
const BLADE_LEN = 300;
const HANDLE_LEN = 168;
// Graphics re-tessellate every frame, so curves use a fixed small point budget.
const ARC_STEPS = 26;
const JUICE_DROPS = 6;

/** Fills a convex polygon as a fan of triangles: `fillPoints` wants Vector2 instances. */
function fan(g: Phaser.GameObjects.Graphics, pts: readonly number[]): void {
  for (let i = 2; i + 1 < pts.length; i += 2) {
    g.fillTriangle(pts[0]!, pts[1]!, pts[i]!, pts[i + 1]!, pts[i + 2] ?? pts[0]!, pts[i + 3] ?? pts[1]!);
  }
}

/** Points of an ellipse rotated by `tilt`, as a flat x,y list. */
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

/** Owns an illustration and its motion. Judgement arrives already decided; it is never computed here. */
export class TomatoKnifeVignette implements Vignette {
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly boardG: Phaser.GameObjects.Graphics;
  private readonly produce: Phaser.GameObjects.Container;
  private readonly tomatoG: Phaser.GameObjects.Graphics;
  private readonly slicesG: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly juice: Phaser.GameObjects.Graphics;
  private readonly knife: Phaser.GameObjects.Container;
  private readonly rings: Phaser.GameObjects.Graphics;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  private lastDemo = -Infinity;
  private strikes = 0;
  private strikeAt = -100;
  /** Where the edge meets the board. A hit lands at the cut; an extra lands on bare board. */
  private strikeX = 0;
  private slices = 0;
  private sliceAt: number[] = [];
  private sliceFrom: number[] = [];
  private sliceWobble: number[] = [];
  private cut = 0;
  private cutFrom = 0;
  private cutTo = 0;
  private cutAt = -100;
  /** Off chops make later slices uneven. Presentation of outcomes, never a grade. */
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
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  public constructor(scene: Phaser.Scene) {
    this.backdrop = scene.add.graphics().setDepth(-20);
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.boardG = scene.add.graphics();
    this.produce = scene.add.container(0, 0);
    this.tomatoG = scene.add.graphics();
    this.slicesG = scene.add.graphics();
    this.marks = scene.add.graphics();
    this.juice = scene.add.graphics();
    this.produce.add([this.marks, this.tomatoG, this.slicesG, this.juice]);
    this.knife = scene.add.container(0, 0);
    this.knife.add(this.drawKnife(scene));
    this.rings = scene.add.graphics();
    this.stage.add([this.boardG, this.produce, this.rings, this.knife]);
    this.cut = this.cutFrom = this.cutTo = this.cutStart();
  }

  /** The cut begins at the tomato's right edge and advances left as slices come off. */
  private cutStart(): number { return TOMATO_X + RX; }
  private cutFor(fraction: number): number { return this.cutStart() - 2 * RX * fraction; }

  private drawKnife(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    // The tip is the origin and the pivot: a rocking chop keeps it near the board.
    const g = scene.add.graphics();
    g.fillStyle(KITCHEN.ink, 0.08);
    fan(g, [6, 10, BLADE_LEN + 6, 10, BLADE_LEN + 6, -62, 216, -64, 126, -52, 46, -24, 14, 2]);
    g.fillStyle(KITCHEN.steel);
    fan(g, [0, 0, BLADE_LEN, 0, BLADE_LEN, -72, 210, -74, 120, -62, 40, -34, 8, -8]);
    g.lineStyle(3, KITCHEN.steelLit, 0.9).lineBetween(6, -3, BLADE_LEN - 4, -3);
    g.lineStyle(2, KITCHEN.steelDark, 0.6).lineBetween(40, -33, BLADE_LEN - 2, -71);
    g.fillStyle(KITCHEN.steelDark).fillRoundedRect(BLADE_LEN - 8, -76, 22, 82, 5);
    g.fillStyle(KITCHEN.handle).fillRoundedRect(BLADE_LEN + 8, -64, HANDLE_LEN, 58, 16);
    g.fillStyle(KITCHEN.paper, 0.12).fillRoundedRect(BLADE_LEN + 22, -56, HANDLE_LEN - 40, 14, 7);
    g.fillStyle(KITCHEN.rivet);
    for (const x of [BLADE_LEN + 46, BLADE_LEN + 92, BLADE_LEN + 138]) g.fillCircle(x, -35, 6);
    return g;
  }

  public layout({ full, safe }: Viewport): void {
    this.scale = Math.min(safe.width / 900, safe.height / 1300);
    this.baseX = safe.centerX - 40 * this.scale;
    this.baseY = safe.top + safe.height * 0.62;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    const bg = this.backdrop.clear();
    bg.fillStyle(KITCHEN.paper).fillRect(full.x, full.y, full.width, full.height);
    // Tile grout, faint and regular: a kitchen wall without a warm note in it.
    const tile = 120 * this.scale;
    const counterY = this.baseY + BOARD_THICK * this.scale;
    bg.lineStyle(2 * this.scale, KITCHEN.grout, 0.55);
    for (let y = counterY - tile; y > full.y - tile; y -= tile) bg.lineBetween(full.x, y, full.right, y);
    for (let x = this.baseX % tile; x < full.right + tile; x += tile) bg.lineBetween(x, full.y, x, counterY);
    bg.fillStyle(KITCHEN.counter, 0.35).fillRect(full.x, counterY, full.width, full.bottom - counterY);
    bg.fillStyle(KITCHEN.ink, 0.08).fillRect(full.x, counterY, full.width, 6 * this.scale);
    const b = this.boardG.clear();
    b.fillStyle(KITCHEN.ink, 0.1).fillRect(BOARD_LEFT + 10, BOARD_THICK, BOARD_RIGHT - BOARD_LEFT - 20, 14);
    b.fillStyle(KITCHEN.board).fillRoundedRect(BOARD_LEFT, 0, BOARD_RIGHT - BOARD_LEFT, BOARD_THICK, 6);
    b.fillStyle(KITCHEN.boardEdge).fillRect(BOARD_LEFT, BOARD_THICK - 16, BOARD_RIGHT - BOARD_LEFT, 16);
    b.fillStyle(KITCHEN.paper, 0.35).fillRect(BOARD_LEFT + 4, 0, BOARD_RIGHT - BOARD_LEFT - 8, 4);
    b.lineStyle(1.5, KITCHEN.boardLine, 0.7);
    for (const y of [11, 19]) b.lineBetween(BOARD_LEFT + 30, y, BOARD_RIGHT - 30, y + 1);
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.phase = 'prepare';
    this.lastDemo = -Infinity;
    this.strikes = this.slices = 0;
    this.strikeAt = -100;
    this.strikeX = this.cutStart();
    this.sliceAt = [];
    this.sliceFrom = [];
    this.sliceWobble = [];
    this.cut = this.cutFrom = this.cutTo = this.cutStart();
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
    // The demonstration rocks the knife over the fruit without cutting it, so the player
    // starts on the tomato they watched and nothing has to arrive in the instant before
    // their turn.
    if (phase === 'respond') { this.strikeAt = -100; this.setCut(0, now); }
  }

  private setCut(fraction: number, now: number): void {
    this.cutFrom = this.cut;
    this.cutTo = this.cutFor(clamp01(fraction));
    this.cutAt = now;
  }

  private strike(now: number): void {
    this.strikes++;
    this.strikeAt = now;
    this.strikeX = this.cutTo;
  }

  private takeSlice(now: number, targets: number): void {
    this.sliceAt.push(now);
    this.sliceFrom.push(this.cutTo);
    // Off chops so far decide how crooked this slice lands; deterministic per slice.
    this.sliceWobble.push(this.uneven * (((this.slices * 7 + 3) % 5) / 5 - 0.5));
    this.setCut(cutFraction(this.slices, targets), now);
  }

  public onDemonstrationBeat(time: number): void {
    const accepted = acceptDemoBeat(this.lastDemo, time);
    if (accepted === null) return;
    this.lastDemo = accepted;
    // The rock, the board contact and its sound all play; only the slice is withheld.
    // There is no bar between the demonstration and the response in which to replace
    // the fruit.
    this.strike(time);
  }

  public onPlayerHit(now: number): void { this.strike(now); }

  public onAccuracy(result: Judgement, now: number): void {
    const slices = advanceSlice(this.slices, result.kind);
    if (slices !== this.slices) {
      this.slices = slices;
      this.takeSlice(now, this.plan?.targets.length ?? 3);
      return;
    }
    // An extra tap lands the knife on bare board beside the fruit and nicks it; an
    // omission leaves the knife hovering with a tremble. Neither takes a slice.
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

  /** Only known beats are anticipated: the demonstration's, and the coda's contact. */
  private upcoming(now: number): number | null {
    if (this.finishAt !== null && !this.finished) return this.finishAt;
    if (this.phase !== 'prepare' && this.phase !== 'demonstrate') return null;
    return this.plan?.cues.find(cue => cue.kind === 'action' && cue.time > now)?.time ?? null;
  }

  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow; else this.lastNow = now;
    // Rendering may observe a beat before the controller's next pump. Contact is
    // sampled from the same absolute cue, so a throttled frame cannot shift it.
    if (this.phase === 'prepare' || this.phase === 'demonstrate') {
      for (const cue of this.plan?.cues ?? []) {
        if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
      }
    }
    this.cut = this.cutFrom + (this.cutTo - this.cutFrom) * easeOut((now - this.cutAt) / 0.09);
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true;
      this.strike(this.finishAt);
      // The unscored finishing chop takes the heel. It never changes the result.
      this.slices++;
      this.sliceAt.push(this.finishAt);
      this.sliceFrom.push(this.cutTo);
      this.sliceWobble.push(this.successful ? 0 : 0.5);
      this.setCut(1, this.finishAt);
      if (!this.successful) this.uneven = Math.max(this.uneven, 0.6);
    }
    const beat = this.beat();
    const age = now - this.strikeAt;
    const press = age >= 0 && age < 0.14 ? Math.sin(age / 0.14 * Math.PI) : 0;
    const shake = this.reducedMotion || age < 0 || age > 0.16 ? 0 : Math.sin(age * 120) * Math.exp(-age * 24) * 1.8;
    this.stage.setPosition(this.baseX + shake * this.scale, this.baseY + shake * this.scale * 0.5);
    this.produce.setPosition(0, this.reducedMotion ? 0 : press * 1.4);
    this.poseKnife(now, beat, age);
    this.drawTomato();
    this.drawSlices(now, beat);
    this.drawMarks(now);
    this.drawJuice(beat, age);
    this.drawRings(age);
  }

  private poseKnife(now: number, beat: number, age: number): void {
    const parked = age > 0.5 && (this.phase === 'idle' || this.phase === 'prepare');
    let lift = knifeLift(age, beat);
    const next = this.upcoming(now);
    if (next !== null && next - now < tomatoTiming(beat).windupSec) lift = knifeWindup(next - now, lift, beat);
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
    // A rocking chop: the tip stays close to the board while the heel lifts and drops.
    this.knife.setPosition(x, -lift * TOMATO_MOTION.lift);
    this.knife.setRotation(-0.12 - 0.42 * Math.min(1.12, lift) + tremble);
  }

  /** The uncut fruit: an ellipse clipped to the left of the cut, with the cut face edge-on. */
  private drawTomato(): void {
    const g = this.tomatoG.clear();
    const k = Math.max(-1, Math.min(1, (this.cut - TOMATO_X) / RX));
    if (k <= -0.999) return;
    const th0 = Math.acos(k);
    const pts: number[] = [];
    for (let i = 0; i <= ARC_STEPS; i++) {
      const a = th0 + (Math.PI * 2 - 2 * th0) * i / ARC_STEPS;
      pts.push(TOMATO_X + RX * Math.cos(a), -RY + RY * Math.sin(a));
    }
    g.fillStyle(KITCHEN.ink, 0.1);
    fan(g, disc(TOMATO_X + 8, 6, Math.min(RX, (this.cut - (TOMATO_X - RX)) / 2 + 4), 16, 0));
    g.fillStyle(KITCHEN.tomato);
    fan(g, pts);
    if (this.cut > TOMATO_X - 60) {
      g.fillStyle(KITCHEN.tomatoLit, 0.75);
      fan(g, disc(Math.min(TOMATO_X - 58, this.cut - 30), -RY - 58, 34, 22, -0.5));
    }
    // The cut face is edge-on from the side; a strip of flesh says it is open fruit.
    const half = RY * Math.sin(th0);
    g.fillStyle(KITCHEN.flesh).fillRect(this.cut - 7, -RY - half, 8, half * 2);
    g.fillStyle(KITCHEN.seed, 0.8);
    for (let i = -1; i <= 1; i++) g.fillEllipse(this.cut - 3, -RY + i * half * 0.45, 4, 9, 6);
    if (this.cut > TOMATO_X + 12) {
      g.fillStyle(KITCHEN.stem);
      fan(g, [TOMATO_X - 34, -2 * RY + 10, TOMATO_X + 34, -2 * RY + 10, TOMATO_X + 22, -2 * RY - 12, TOMATO_X - 18, -2 * RY - 14]);
      g.fillStyle(KITCHEN.stemLit).fillRoundedRect(TOMATO_X - 5, -2 * RY - 30, 10, 26, 4);
    }
  }

  /** Each slice is a disc that topples from the cut and leans on the last one. */
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
      const b = SLICE_RY * squash;
      const cy = -b * Math.cos(lean) + 6;
      const a = 5 + (SLICE_RX - 5) * Math.sin(Math.min(1, p) * Math.PI / 2);
      g.fillStyle(KITCHEN.ink, 0.1);
      fan(g, disc(x + 10, 6, a * 0.9 + 8, 12, 0));
      g.fillStyle(KITCHEN.tomato);
      fan(g, disc(x, cy, a, b, lean));
      g.fillStyle(KITCHEN.fleshRing);
      fan(g, disc(x, cy, a * 0.84, b * 0.86, lean));
      g.fillStyle(KITCHEN.flesh);
      fan(g, disc(x, cy, a * 0.58, b * 0.62, lean));
      if (a > 20) {
        g.fillStyle(KITCHEN.seed);
        for (let s = 0; s < 4; s++) {
          const t = s * Math.PI / 2 + 0.6;
          const sx = a * 0.42 * Math.cos(t);
          const sy = b * 0.44 * Math.sin(t);
          g.fillEllipse(x + sx * Math.cos(lean) - sy * Math.sin(lean), cy + sx * Math.sin(lean) + sy * Math.cos(lean), 6 + a / 16, 12, 6);
        }
      }
    }
  }

  private drawMarks(now: number): void {
    const g = this.marks.clear();
    for (const x of this.nicks) {
      g.lineStyle(3, KITCHEN.boardEdge, 0.7).lineBetween(x - 28, 5, x + 30, 5);
      g.lineStyle(1.5, KITCHEN.ink, 0.25).lineBetween(x - 22, 7, x + 26, 7);
    }
    if (this.finished && this.successful && this.finishAt !== null) {
      // One late seed, after everything else has settled.
      const p = clamp01((now - this.finishAt - 0.9) / 0.32);
      if (p > 0 && p < 1) {
        g.fillStyle(KITCHEN.seed, 1 - p * 0.5);
        g.fillEllipse(this.cutFor(1) + 22, -70 + p * 68, 5, 10, 6);
      }
    }
  }

  private drawJuice(beat: number, age: number): void {
    const g = this.juice.clear();
    const { juiceSec } = tomatoTiming(beat);
    if (age < 0 || age > juiceSec || this.sliceAt.length === 0) return;
    // Juice only leaves a cut that happened on this chop, never a knock on bare board.
    if (Math.abs((this.sliceAt[this.sliceAt.length - 1] ?? -100) - this.strikeAt) > 0.001) return;
    const fall = juiceFall(age, beat);
    const spread = easeOut(age / juiceSec) * 70;
    const life = 1 - age / juiceSec;
    for (let i = 0; i < JUICE_DROPS; i++) {
      const seed = (i * 29 + 7) % 17;
      const x = this.strikeX + (seed / 17 - 0.5) * spread * 1.4;
      const y = -RY - 20 - Math.sin(i * 1.9) * spread * 0.6 + fall * (0.7 + seed / 34);
      g.fillStyle(i % 3 ? KITCHEN.flesh : KITCHEN.seed, life * 0.9);
      g.fillEllipse(x, y, 4 + seed % 3, 6 + seed % 4, 6);
    }
  }

  private drawRings(age: number): void {
    const g = this.rings.clear();
    if (age < 0 || age > 0.2) return;
    const p = age / 0.2;
    g.lineStyle(3, KITCHEN.paper, 1 - p).strokeEllipse(this.strikeX + 60, 3, 150 + p * 160, 12 + p * 18);
  }

  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
  public destroy(): void { this.stage.destroy(true); this.backdrop.destroy(); }
}
