import Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { reducedMotion } from '@/core/motionPreference';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { Backdrop } from '@/ui/backdrop';
import { shade } from '@/ui/colour';
import { Feedback } from '@/ui/feedback';
import { castShadow, faces } from '@/ui/light';
import type { Vignette } from './Vignette';
import { easeOut, isPlayerTurn, TURN_OPEN_SEC } from './motion';

export const GLASS = { paper: 0xe5dfe8, ink: 0x49394e, frame: 0x756278, blue: 0xa8ced4, light: 0xf9f1df, glove: 0xdc9775, sill: 0xc6b8c6 };
export const strokeProgress = (age: number): number => easeOut(age / 0.23);
// Graphics re-tessellate every frame; ~400 grime marks at Phaser's default 32 segments were
// the slice's heaviest per-frame JS cost. Eight segments are indistinguishable at this size.
const GRIME_SEGMENTS = 8;
/** The window's bounding box in stage units, which the painted-wood tile covers. */
const FRAME = { x: -272, y: -286, width: 544, height: 606, radius: 108 } as const;

/**
 * All cleaning is presentation of existing outcomes; taps are never interpreted as swipes.
 *
 * The frame is painted wood under the shared light, the pane is the one thing in the
 * game with no material on it, and the wall behind is the same sheet every other scene
 * stands on. The lateral stroke and its timing are unchanged.
 */
export class WindowCleaningVignette implements Vignette {
  private readonly backdrop: Backdrop;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly glass: Phaser.GameObjects.Graphics;
  private readonly dirt: Phaser.GameObjects.Graphics;
  private readonly gleam: Phaser.GameObjects.Graphics;
  private readonly tool: Phaser.GameObjects.Container;
  private readonly bursts: Feedback;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  /** When the player's turn began; the stage light opens toward them from here. */
  private respondAt = -100;
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
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor(scene: Phaser.Scene) {
    // The pool of light sits where the pane's own sun already is, upper right.
    this.backdrop = new Backdrop(scene, GLASS.paper, GLASS.light, { glowAt: { x: 0.6, y: 0.3 } });
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.frame = scene.add.graphics();
    this.glass = scene.add.graphics();
    this.dirt = scene.add.graphics();
    this.gleam = scene.add.graphics();
    this.tool = scene.add.container(0, 0);
    this.drawSqueegee(scene);
    this.stage.add([this.frame, this.glass, this.dirt, this.gleam, this.tool]);
    this.bursts = new Feedback(scene, -10, this.stage);
  }

  /** Vertical rubber blade and a warm mitten: lateral motion, not a hammer reskin. */
  private drawSqueegee(scene: Phaser.Scene): void {
    const hand = scene.add.graphics();
    const line = STYLE.current.outline * 1.4;
    const ink = faces(GLASS.ink), glove = faces(GLASS.glove), frame = faces(GLASS.frame);
    // The contact shadow the blade throws on the pane behind it.
    const drop = castShadow(8);
    hand.fillStyle(GLASS.ink, drop.alpha).fillRoundedRect(-8 + drop.dx, -66 + drop.dy, 27, 148, 7);
    // The blade's back, its rubber edge and the ferrule.
    if (line > 0) hand.lineStyle(line, ink.edge, 1).strokeRoundedRect(-13, -70, 16, 140, 4);
    hand.fillStyle(ink.face).fillRoundedRect(-13, -70, 16, 140, 4);
    hand.fillStyle(ink.lit).fillRoundedRect(-13, -70, 16, 26, 4);
    if (line > 0) hand.lineStyle(line, shade(0xd3e1db, -0.55), 1).strokeRoundedRect(0, -66, 12, 132, 5);
    hand.fillStyle(0xd3e1db).fillRoundedRect(0, -66, 12, 132, 5);
    hand.fillStyle(GLASS.light, 0.8).fillRoundedRect(2, -60, 4, 118, 2);
    if (line > 0) hand.lineStyle(line, frame.edge, 1).strokeRoundedRect(8, -9, 55, 18, 7);
    hand.fillStyle(frame.face).fillRoundedRect(8, -9, 55, 18, 7);
    hand.fillStyle(frame.lit).fillRoundedRect(8, -9, 55, 7, 7);
    // Glove, cuff, forearm and handle, each with a lit top face.
    if (line > 0) hand.lineStyle(line, glove.edge, 1).strokeRoundedRect(41, -26, 61, 54, 17);
    hand.fillStyle(glove.shade).fillRoundedRect(41, -26, 61, 54, 17);
    hand.fillStyle(glove.face).fillRoundedRect(41, -26, 61, 42, 17);
    hand.fillStyle(glove.lit).fillRoundedRect(46, -24, 48, 10, 5);
    hand.fillStyle(0xf0bb95).fillRoundedRect(36, -31, 42, 22, 10);
    hand.fillStyle(0xc27c63).fillRoundedRect(85, -20, 50, 43, 10);
    if (line > 0) hand.lineStyle(line, ink.edge, 1).strokeRoundedRect(114, -26, 82, 56, 6);
    hand.fillStyle(ink.shade).fillRoundedRect(114, -26, 82, 56, 6);
    hand.fillStyle(ink.face).fillRoundedRect(114, -26, 82, 44, 6);
    hand.fillStyle(ink.rim, 0.5).fillRoundedRect(127, -19, 50, 4, 2);
    this.tool.add(hand);
  }

  public layout(viewport: Viewport): void {
    const { safe } = viewport;
    this.scale = Math.min(safe.width / 700, safe.height / 1120);
    this.baseX = safe.centerX;
    this.baseY = safe.top + safe.height * 0.54;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.layout(viewport);
    const line = STYLE.current.outline * 1.4;
    const frame = faces(GLASS.frame), ink = faces(GLASS.ink), sill = faces(GLASS.sill);
    // The frame: cast shadow on the wall, the painted face, its lit top edge.
    const f = this.frame.clear();
    const drop = castShadow(14);
    f.fillStyle(GLASS.ink, drop.alpha).fillRoundedRect(FRAME.x + drop.dx, FRAME.y + drop.dy, FRAME.width, FRAME.height, FRAME.radius);
    if (line > 0) f.lineStyle(line, shade(GLASS.frame, -0.6), 1).strokeRoundedRect(FRAME.x, FRAME.y, FRAME.width, FRAME.height, FRAME.radius);
    f.fillStyle(frame.shade).fillRoundedRect(FRAME.x, FRAME.y, FRAME.width, FRAME.height, FRAME.radius);
    f.fillStyle(frame.face).fillRoundedRect(FRAME.x, FRAME.y, FRAME.width, FRAME.height - 14, FRAME.radius);
    f.fillStyle(frame.lit).fillRoundedRect(FRAME.x + 30, FRAME.y + 8, FRAME.width - 60, 12, 6);
    // Painted grain, drawn rather than tiled: a material tile is a rectangle, and its
    // square corners would show past the frame's 108-unit radius. The lines run the full
    // width as if the frame were cut from one board; the pane covers their middles.
    f.lineStyle(2.5, shade(GLASS.frame, -0.14), 0.45);
    for (let i = 0; i < 9; i++) {
      const y = FRAME.y + 34 + i * (FRAME.height - 68) / 8;
      f.beginPath();
      for (let x = FRAME.x + 22; x <= FRAME.x + FRAME.width - 22; x += 48) {
        const wobble = Math.sin(x / 90 + i * 1.7) * 4;
        if (x === FRAME.x + 22) f.moveTo(x, y + wobble); else f.lineTo(x, y + wobble);
      }
      f.strokePath();
    }
    // The reveal: the dark inside edge of the opening, which is what gives the frame depth.
    f.fillStyle(ink.face).fillRoundedRect(-252, -267, 504, 560, 94);

    const g = this.glass.clear();
    g.fillStyle(GLASS.blue).fillRoundedRect(-236, -251, 472, 529, 82);
    // Flattened landscape and reflected light sit behind the removable surface dirt.
    g.fillStyle(0xc8dfda).fillCircle(106, -144, 54);
    g.fillStyle(0x83b1be).fillRect(-230, 111, 460, 162);
    g.fillStyle(0x719ba9).fillTriangle(-230, 181, -71, 20, 111, 273);
    g.fillStyle(0x8ebcc4).fillTriangle(-93, 273, 132, 45, 230, 273);
    g.fillStyle(GLASS.light, 0.45).fillTriangle(-218, -169, -99, -244, -218, 26);
    g.fillStyle(GLASS.light, 0.25).fillTriangle(-198, 112, 27, -239, 65, -239);
    g.lineStyle(3, GLASS.light, 0.55).lineBetween(-251, 277, 251, 277);
    // The ledge, a solid with a lit top and a shadow under it.
    const ledgeDrop = castShadow(10);
    g.fillStyle(GLASS.ink, ledgeDrop.alpha).fillEllipse(13 + ledgeDrop.dx, 344 + ledgeDrop.dy, 500, 25);
    if (line > 0) g.lineStyle(line, shade(GLASS.sill, -0.6), 1).strokeRoundedRect(-291, 291, 582, 33, 6);
    g.fillStyle(sill.shade).fillRoundedRect(-291, 291, 582, 33, 6);
    g.fillStyle(sill.face).fillRoundedRect(-291, 291, 582, 22, 6);
    g.fillStyle(sill.rim, 0.7).fillRoundedRect(-282, 293, 565, 6, 3);
  }
  public reset(plan: RoundPlan): void {
    this.plan = plan; this.phase = 'prepare'; this.cleanAt = plan.targets.map(() => Infinity);
    this.strokeAt = -100; this.strokes = 0; this.lane = 0; this.lastDemo = -Infinity;
    this.finishAt = null; this.finished = false; this.successful = false;
    this.respondAt = -100;
  }
  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    // The demonstration wipes without clearing the grime, so the pane the player is given
    // is the one they watched and nothing has to be re-dirtied in the instant before
    // their turn.
    if (phase === 'respond') { this.cleanAt.fill(Infinity); this.strokes = 0; this.strokeAt = -100; this.respondAt = now; }
  }
  public onDemonstrationBeat(time: number): void {
    if (time <= this.lastDemo) return;
    this.lastDemo = time;
    // The blade travels its lane and sounds; only the glass is left dirty. There is no
    // bar between the demonstration and the response in which to restore it.
    this.stroke(time);
  }
  private stroke(now: number): void {
    this.lane = this.strokes++ % (this.plan?.targets.length ?? 4);
    this.strokeAt = now;
    this.positionTool(now);
    // Water flicked off the blade. Decorative, so it may skip under reduced motion.
    if (!this.reducedMotion) this.bursts.burst('water', this.tool.x - 10, this.tool.y + 40, [GLASS.light, 0xd3e1db], 5);
  }
  public onPlayerHit(now: number): void {
    if (!isPlayerTurn(this.phase)) return;
    this.stroke(now);
  }
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
    const ex = STYLE.current.exaggeration;
    const y = -184 + (this.lane + 0.5) * 430 / (this.plan?.targets.length ?? 4);
    const x = direction * (-212 + 424 * p);
    this.tool.setPosition(age > 0.5 ? x : x + direction * Math.sin(p * Math.PI) * 9 * ex, y);
    this.tool.setRotation(direction * Math.sin(p * Math.PI) * 0.08 * ex);
    this.tool.setScale(1, 1 - Math.sin(p * Math.PI) * 0.06 * ex);
    if (age > 0.5) this.tool.y += Math.sin(now * 1.6) * (this.reducedMotion ? 0 : 2);
    if (age > 0.5 && (this.phase === 'idle' || this.phase === 'prepare')) this.tool.setPosition(-190, 165).setRotation(-0.15);
  }
  /**
   * The stage light opens toward the player the instant their turn starts, and holds open
   * through the ending. It is the handover said without words, now that no bar separates
   * the demonstration from the response.
   */
  private openStage(now: number): void {
    const offered = this.phase === 'respond' || this.phase === 'result';
    this.backdrop.open(offered ? easeOut((now - this.respondAt) / TURN_OPEN_SEC) : 0);
  }
  public update(now: number): void {
    if (this.phase === 'paused') now = this.lastNow; else this.lastNow = now;
    this.openStage(now);
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
        g.fillStyle(seed % 2 ? 0x7c8e98 : 0xd5d2bd, alpha).fillEllipse(x + seed % 9 - 4, y + seed % 11 - 5, 31 + seed, 19 + seed % 13, GRIME_SEGMENTS);
        if (seed < 5 && !covered) g.lineStyle(2, GLASS.ink, 0.12).lineBetween(x, y, x - 3, y + 26);
      }
    }
    const shine = this.gleam.clear();
    const clean = this.cleanAt.reduce((sum, time) => sum + strokeProgress(now - time), 0) / count;
    shine.lineStyle(4, GLASS.light, 0.15 + clean * 0.65).lineBetween(-192, 76, -34, -185);
    shine.lineStyle(12, GLASS.light, clean * 0.3).lineBetween(-169, 82, -12, -179);
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
  }
  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
  public destroy(): void { this.bursts.destroy(); this.stage.destroy(true); this.backdrop.destroy(); }
}
