import type Phaser from 'phaser';
import { STYLE } from '@/config/style';
import { reducedMotion } from '@/core/motionPreference';
import type { Viewport } from '@/core/Viewport';
import type { Phase } from '@/game/RoundController';
import type { RoundPlan } from '@/rhythm/RhythmScheduler';
import type { Judgement } from '@/rhythm/judge';
import { MaterialKey } from '@/textures/materials';
import { Backdrop } from '@/ui/backdrop';
import { mix, shade } from '@/ui/colour';
import { Feedback } from '@/ui/feedback';
import { castShadow, faces } from '@/ui/light';
import type { Vignette } from './Vignette';
import {
  acceptDemoBeat, advanceRep, bicepBulge, chalkDraw, clamp01, CURL_MOTION, curlFlex, curlLift,
  curlTiming, DROP_LANDING_SEC, dropHeight, easeOut, forearmAngle, holdTremor, pumpLevel, REFERENCE_BEAT,
} from './curlMotion';
import { isPlayerTurn, TURN_OPEN_SEC } from './motion';

/**
 * Concrete, rubber and iron, with one warm body in the middle of it. The tank is the only
 * saturated colour in the room, so the figure is the subject at a glance.
 */
export const GYM = {
  paper: 0xdad4cb, ink: 0x2b2733, wall: 0xcbc3b7, lamp: 0xfff1d6,
  mat: 0x4c4954, matSeam: 0x5d5966, skin: 0xd8945f, flush: 0xd9634a,
  tank: 0x2e9c8e, iron: 0x3b3e47, chrome: 0xbcc3ca,
  board: 0x34493f, frame: 0x8a6743, chalk: 0xf4eddc, sweat: 0xbfe4ec,
} as const;

// The figure stands with the floor at y 0 and faces +x. The trunk is its own container,
// hinged at the hips, so a lean or a squash moves the head, the shoulders and the working
// arm together and leaves the feet planted.
const HIP_Y = -320;
/** Trunk space: origin at the hips. */
const SHOULDER = { x: 48, y: -250 } as const;
const ELBOW = { x: 62, y: -72 } as const;
const HEAD = { x: 40, y: -384, r: 60 } as const;
const DELTOID_R = 56;
const UPPER_ARM_W = 84;
const FOREARM_W = 62;
/** Side-on plates either side of the grip, and the grip itself. */
const PLATE = { reach: 66, w: 40, h: 118 } as const;
const GRIP_R = 31;
/** The chalkboard on the wall, left of the torso. It keeps the set's count. */
const BOARD = { x: -420, y: -560, w: 210, h: 168 } as const;
const TALLY_STEP = 22;
const TALLY_GROUP = 5;
const TALLY_GROUPS_PER_ROW = 2;

/** A convex polygon as a fan of triangles. `fillPoints` wants Vector2 instances. */
function fan(g: Phaser.GameObjects.Graphics, pts: readonly number[]): void {
  for (let i = 2; i + 1 < pts.length; i += 2) {
    g.fillTriangle(pts[0]!, pts[1]!, pts[i]!, pts[i + 1]!, pts[i + 2] ?? pts[0]!, pts[i + 3] ?? pts[1]!);
  }
}

function outline(g: Phaser.GameObjects.Graphics, pts: readonly number[]): void {
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) g[i === 0 ? 'moveTo' : 'lineTo'](pts[i]!, pts[i + 1]!);
  g.closePath().strokePath();
}

/** Owns an illustration and its motion. Judgement arrives already decided; it is never computed here. */
export class BicepCurlVignette implements Vignette {
  private readonly backdrop: Backdrop;
  private readonly stage: Phaser.GameObjects.Container;
  private readonly room: Phaser.GameObjects.Graphics;
  private readonly matting: Phaser.GameObjects.TileSprite;
  private readonly boardG: Phaser.GameObjects.Graphics;
  private readonly tally: Phaser.GameObjects.Graphics;
  private readonly legs: Phaser.GameObjects.Graphics;
  private readonly trunk: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Graphics;
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly arm: Phaser.GameObjects.Graphics;
  private readonly loose: Phaser.GameObjects.Graphics;
  private readonly bursts: Feedback;
  private plan: RoundPlan | null = null;
  private phase: Phase = 'idle';
  /** When the player's turn began; the stage light opens toward them from here. */
  private respondAt = -100;
  private lastDemo = -Infinity;
  private repAt = -100;
  /** How high the current rep gets. A wasted tap only makes half of one. */
  private repPeak = 1;
  private reps = 0;
  private pump = 0;
  private pumpFrom = 0;
  private pumpTo = 0;
  private pumpAt = -100;
  /** Off reps lean the figure back into bad form. Presentation of outcomes, never a grade. */
  private strain = 0;
  private judderAt = -100;
  private clankAt = -100;
  private finishAt: number | null = null;
  private finished = false;
  private successful = false;
  /** Where the weight left the hand in the rough coda, in stage space, and how far it falls. */
  private dropX = 0;
  private dropFrom = 0;
  private lastNow = 0;
  private baseX = 0;
  private baseY = 0;
  private scale = 1;
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor(scene: Phaser.Scene) {
    // The pool of light sits over the working arm, which is what the eye is meant to follow.
    this.backdrop = new Backdrop(scene, GYM.paper, GYM.lamp, { glowAt: { x: 0.56, y: 0.4 }, glowAlpha: 0.7 });
    this.stage = scene.add.container(0, 0).setDepth(-10);
    this.room = scene.add.graphics();
    // Rubber matting is cloth at low strength: a weave over a dark ground reads as a mat,
    // where a flat fill read as a hole in the floor.
    this.matting = scene.add.tileSprite(-3000, 0, 6000, 3000, MaterialKey.cloth).setOrigin(0)
      .setTint(GYM.matSeam).setAlpha(0.4 * STYLE.current.grain);
    this.matting.setTileScale(0.7, 0.7);
    this.boardG = scene.add.graphics();
    this.tally = scene.add.graphics();
    this.legs = scene.add.graphics();
    this.drawLegs(this.legs);
    this.trunk = scene.add.container(0, HIP_Y);
    this.body = scene.add.graphics();
    this.drawBody(this.body);
    this.face = scene.add.graphics();
    this.arm = scene.add.graphics();
    this.trunk.add([this.body, this.face, this.arm]);
    this.loose = scene.add.graphics();
    this.stage.add([this.room, this.matting, this.boardG, this.tally, this.legs, this.trunk, this.loose]);
    this.bursts = new Feedback(scene, -10, this.stage);
  }

  /**
   * A limb as a thick line, grown by `grow` on each side. Masses are drawn twice: once
   * grown in the edge colour, all of them, and then again in their face colours over the
   * top, so the figure has one outline round its silhouette and no seams where a bicep
   * meets an arm or a neck meets a chest.
   */
  private limb(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, width: number, colour: number, grow = 0): void {
    g.lineStyle(width + grow * 2, colour).lineBetween(x1, y1, x2, y2);
  }

  private drawLegs(g: Phaser.GameObjects.Graphics): void {
    const line = STYLE.current.outline * 1.4;
    const ink = faces(GYM.ink);
    const skin = faces(GYM.skin);
    const drop = castShadow(6);
    g.fillStyle(GYM.ink, drop.alpha).fillEllipse(30 + drop.dx, 8, 330, 26);
    // Back leg in shade, front leg lit: two planes under the one light. Quads and
    // calves are the same silhouette, grown on the edge pass so they do not seam.
    for (const pass of line > 0 ? [line, 0] : [0]) {
      const back = pass > 0 ? ink.edge : skin.shade;
      const front = pass > 0 ? ink.edge : skin.face;
      this.limb(g, -48, -250, -62, -48, 108, back, pass);
      g.fillStyle(back).fillEllipse(-56, -150, (42 + pass) * 2, (70 + pass) * 2);
      g.fillStyle(back).fillEllipse(-70, -78, (36 + pass) * 2, (58 + pass) * 2);
      this.limb(g, 40, -250, 54, -48, 108, front, pass);
      g.fillStyle(front).fillEllipse(58, -148, (46 + pass) * 2, (74 + pass) * 2);
      g.fillStyle(front).fillEllipse(68, -76, (40 + pass) * 2, (62 + pass) * 2);
    }
    g.fillStyle(skin.lit, 0.45).fillEllipse(42, -148, 36, 60);
    g.fillStyle(skin.shade, 0.4).fillEllipse(86, -76, 28, 44);
    if (line > 0) g.lineStyle(line, ink.edge).strokeRoundedRect(-124, -38, 124, 40, 15);
    g.fillStyle(ink.shade).fillRoundedRect(-124, -38, 124, 40, 15);
    g.fillStyle(GYM.chalk).fillRoundedRect(-120, -14, 116, 12, 5);
    if (line > 0) g.lineStyle(line, ink.edge).strokeRoundedRect(-4, -38, 144, 40, 15);
    g.fillStyle(ink.face).fillRoundedRect(-4, -38, 144, 40, 15);
    g.fillStyle(ink.lit, 0.8).fillRoundedRect(6, -35, 100, 10, 5);
    g.fillStyle(GYM.chalk).fillRoundedRect(0, -14, 136, 12, 5);
    // Shorts over the top of both legs, tucked under the tank.
    if (line > 0) g.lineStyle(line, ink.edge).strokeRoundedRect(-104, HIP_Y - 40, 214, 160, 34);
    g.fillStyle(ink.shade).fillRoundedRect(-104, HIP_Y - 40, 214, 160, 34);
    g.fillStyle(ink.face).fillRoundedRect(-104, HIP_Y - 40, 214, 134, 34);
    g.fillStyle(GYM.tank, 0.9).fillRoundedRect(76, HIP_Y - 16, 14, 108, 6);
  }

  private drawBody(g: Phaser.GameObjects.Graphics): void {
    const line = STYLE.current.outline * 1.4;
    const ink = faces(GYM.ink);
    const skin = faces(GYM.skin);
    const tank = faces(GYM.tank);
    // The far arm hangs behind the torso in shade: the one that is not working.
    // It is thinner and lower than the working arm, so it reads as behind, not as a pack.
    for (const pass of line > 0 ? [line, 0] : [0]) {
      const tone = pass > 0 ? ink.edge : skin.shade;
      g.fillStyle(tone).fillCircle(-58, -210, 32 + pass);
      this.limb(g, -58, -210, -78, -70, 48, tone, pass);
      g.fillStyle(tone).fillCircle(-78, -52, 24 + pass);
    }
    // Torso, neck and head as one silhouette: broad through the shoulders and the
    // traps, narrowing to the waist.
    const torso = [-110, -250, 108, -276, 132, -150, 92, -8, -70, -8, -122, -130];
    if (line > 0) {
      g.lineStyle(line * 2, ink.edge); outline(g, torso);
      this.limb(g, 4, -254, 34, -328, 72, ink.edge, line);
      g.fillStyle(ink.edge).fillCircle(HEAD.x, HEAD.y, HEAD.r + line);
    }
    g.fillStyle(skin.face); fan(g, torso);
    this.limb(g, 4, -254, 34, -328, 72, skin.face);
    g.fillStyle(skin.shade, 0.4); fan(g, [-110, -250, -40, -250, -40, -8, -70, -8, -122, -130]);
    // A chest plane under the tank, so the vest has a body rather than hanging in air.
    g.fillStyle(skin.face).fillEllipse(70, -170, 92, 110);
    g.fillStyle(skin.lit, 0.55).fillEllipse(88, -186, 48, 54);
    g.fillStyle(skin.face).fillCircle(HEAD.x, HEAD.y, HEAD.r);
    g.fillStyle(skin.lit, 0.7).fillCircle(HEAD.x - 14, HEAD.y - 16, 30);
    // Tank top: the one saturated colour in the room. Side-on, so a lit front and a
    // shaded back, with the armholes cut as the straps.
    const vest = [-96, -188, 86, -200, 128, -138, 92, -8, -70, -8, -114, -118];
    if (line > 0) { g.lineStyle(line, tank.edge); outline(g, vest); }
    g.fillStyle(tank.face); fan(g, vest);
    g.fillStyle(tank.shade, 0.88); fan(g, [-114, -118, -70, -140, -46, -8, -70, -8]);
    g.fillStyle(tank.lit, 0.85); fan(g, [-20, -180, 84, -192, 118, -140, 80, -118, -10, -118]);
    if (line > 0) g.lineStyle(22 + line * 2, tank.edge).lineBetween(-72, -196, -62, -248).lineBetween(64, -204, 56, -258);
    g.lineStyle(22, tank.face).lineBetween(-72, -196, -62, -248).lineBetween(64, -204, 56, -258);
    // A close crop, a sweatband and an ear.
    g.fillStyle(ink.face).slice(HEAD.x, HEAD.y, HEAD.r + 1, Math.PI * 0.94, Math.PI * 1.72, false).fillPath();
    g.fillStyle(GYM.chalk).fillRoundedRect(HEAD.x - 56, HEAD.y - 44, 114, 22, 10);
    g.fillStyle(GYM.tank).fillRect(HEAD.x - 52, HEAD.y - 36, 106, 5);
    g.fillStyle(skin.shade).fillCircle(HEAD.x - 44, HEAD.y + 2, 12);
  }

  public layout(viewport: Viewport): void {
    const { safe } = viewport;
    // A standing figure needs height more than width, so the floor sits low in the frame
    // and the frame is fitted to the figure's height first.
    this.scale = Math.min(safe.width / 900, safe.height / 1450);
    this.baseX = safe.centerX - 30 * this.scale;
    this.baseY = safe.top + safe.height * 0.68;
    this.stage.setPosition(this.baseX, this.baseY).setScale(this.scale);
    this.backdrop.layout(viewport);
    const r = this.room.clear();
    // The wall is the paper itself, so the pool of light still falls across it; a dado
    // and the rubber floor sit in stage space so they stay anchored to the feet however
    // the stage is scaled.
    r.fillStyle(GYM.wall, 0.4).fillRect(-3000, -400, 6000, 400);
    r.lineStyle(4, GYM.ink, 0.1).lineBetween(-3000, -400, 3000, -400);
    r.fillStyle(GYM.mat).fillRect(-3000, 0, 6000, 3000);
    const mat = faces(GYM.mat);
    if (STYLE.current.outline > 0) r.fillStyle(shade(GYM.mat, -0.6)).fillRect(-3000, -STYLE.current.outline * 0.7, 6000, STYLE.current.outline * 0.7);
    r.fillStyle(mat.lit).fillRect(-3000, 0, 6000, 9);
    r.fillStyle(mat.rim, 0.5).fillRect(-3000, 0, 6000, 3);
    r.lineStyle(3, GYM.matSeam, 0.7);
    for (let col = -6; col < 7; col++) r.lineBetween(col * 230, 0, col * 330, 900);
    for (let row = 1; row < 6; row++) r.lineBetween(-3000, row * 95, 3000, row * 95);
    this.drawBoard(this.boardG.clear());
  }

  private drawBoard(g: Phaser.GameObjects.Graphics): void {
    const line = STYLE.current.outline * 1.4;
    const frame = faces(GYM.frame);
    const drop = castShadow(7);
    g.fillStyle(GYM.ink, drop.alpha).fillRoundedRect(BOARD.x + drop.dx, BOARD.y + drop.dy, BOARD.w, BOARD.h, 10);
    if (line > 0) g.lineStyle(line, frame.edge).strokeRoundedRect(BOARD.x - 12, BOARD.y - 12, BOARD.w + 24, BOARD.h + 24, 12);
    g.fillStyle(frame.face).fillRoundedRect(BOARD.x - 12, BOARD.y - 12, BOARD.w + 24, BOARD.h + 24, 12);
    g.fillStyle(frame.lit, 0.8).fillRoundedRect(BOARD.x - 8, BOARD.y - 8, BOARD.w + 16, 6, 3);
    g.fillStyle(GYM.board).fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
    // Old chalk, wiped but not gone.
    g.fillStyle(GYM.chalk, 0.07).fillEllipse(BOARD.x + 90, BOARD.y + 120, 160, 60);
    g.lineStyle(3, GYM.chalk, 0.5).lineBetween(BOARD.x + 18, BOARD.y + 42, BOARD.x + BOARD.w - 18, BOARD.y + 42);
    g.lineStyle(4, GYM.chalk, 0.85);
    // A short heading stroke, and a rest for the chalk in the frame's channel.
    g.lineBetween(BOARD.x + 18, BOARD.y + 24, BOARD.x + 74, BOARD.y + 24);
    g.fillStyle(GYM.chalk).fillRoundedRect(BOARD.x + BOARD.w - 62, BOARD.y + BOARD.h + 2, 40, 8, 4);
  }

  public reset(plan: RoundPlan): void {
    this.plan = plan;
    this.phase = 'prepare';
    this.lastDemo = -Infinity;
    this.repAt = -100;
    this.repPeak = 1;
    this.reps = 0;
    this.pump = this.pumpFrom = this.pumpTo = 0;
    this.pumpAt = -100;
    this.respondAt = -100;
    this.strain = 0;
    this.judderAt = -100;
    this.clankAt = -100;
    this.finishAt = null;
    this.finished = false;
    this.successful = false;
    this.dropX = 0;
    this.dropFrom = 0;
  }

  public onPhase(phase: Phase, now: number): void {
    this.phase = phase;
    // The demonstration curls the weight in full without counting, so the player starts
    // on the empty board they watched and nothing has to be wiped in the instant before
    // their turn.
    if (phase === 'respond') { this.repAt = -100; this.reps = 0; this.setPump(0, now); this.respondAt = now; }
  }

  private setPump(level: number, now: number): void {
    this.pumpFrom = this.pump;
    this.pumpTo = clamp01(level);
    this.pumpAt = now;
  }

  private rep(now: number, peak = 1): void {
    this.repAt = now;
    this.repPeak = peak;
    this.exhale();
  }

  /** The breath out on the squeeze. Decorative, so it may skip under reduced motion. */
  private exhale(): void {
    if (this.reducedMotion) return;
    this.bursts.burst('dust', HEAD.x + 70, HIP_Y + HEAD.y + 24, [GYM.chalk, GYM.wall], 3);
  }

  private sweat(): void {
    if (this.reducedMotion) return;
    this.bursts.burst('water', HEAD.x + 10, HIP_Y + HEAD.y - 50, [GYM.sweat, GYM.chalk], 3);
  }

  public onDemonstrationBeat(time: number): void {
    const accepted = acceptDemoBeat(this.lastDemo, time);
    if (accepted === null) return;
    this.lastDemo = accepted;
    // The lift, the squeeze, the breath and its sound all play; only the count is
    // withheld. There is no bar between the demonstration and the response in which to
    // wipe the board.
    this.rep(time);
  }

  public onPlayerHit(now: number): void {
    if (!isPlayerTurn(this.phase)) return;
    this.rep(now);
  }

  public onAccuracy(result: Judgement, now: number): void {
    const reps = advanceRep(this.reps, result.kind);
    if (reps !== this.reps) {
      this.reps = reps;
      this.setPump(pumpLevel(reps, this.plan?.targets.length ?? 3), now);
      if (this.pump > 0.2) this.sweat();
      return;
    }
    // A wasted tap gets the weight halfway before the arm gives and the plates clank; a
    // missed target leaves the arm hanging and trembling under the load. Neither counts.
    if (result.kind === 'extra') { this.repPeak = CURL_MOTION.halfRep; this.clankAt = now; }
    else this.judderAt = now;
    this.strain = Math.min(1, this.strain + 0.22);
  }

  public finish(successful: boolean, contactSec: number): void {
    this.successful = successful;
    this.finishAt = contactSec;
  }
  public pause(): void { this.phase = 'paused'; this.finishAt = null; this.repAt = -100; }

  private beat(): number { return this.plan ? 60 / this.plan.bpm : REFERENCE_BEAT; }

  /** Only known beats are anticipated: the demonstration's, and the coda's squeeze. */
  private upcoming(now: number): number | null {
    if (this.finishAt !== null && !this.finished) return this.finishAt;
    if (this.phase !== 'prepare' && this.phase !== 'demonstrate') return null;
    return this.plan?.cues.find(cue => cue.kind === 'action' && cue.time > now)?.time ?? null;
  }

  /** Flexion of the working arm now: 0 hanging, 1 squeezed at the top. */
  private flexion(now: number): number {
    const beat = this.beat();
    const age = now - this.repAt;
    if (this.finished && this.finishAt !== null) {
      // A strong finish holds the squeeze. A rough one lost the weight at the top, and the
      // unloaded arm drifts down to hang.
      const held = now - this.finishAt;
      return this.successful ? 1 - Math.abs(holdTremor(held)) : 1 - easeOut((held - 0.1) / 0.7) * 0.85;
    }
    let flex = curlFlex(age, this.repPeak, beat);
    const next = this.upcoming(now);
    if (next !== null && next - now < curlTiming(beat).liftSec) flex = curlLift(next - now, flex, beat);
    return flex;
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
    // Rendering may observe a beat before the controller's next pump. The squeeze is
    // sampled from the same absolute cue, so a throttled frame cannot shift it.
    if (this.phase === 'prepare' || this.phase === 'demonstrate') {
      for (const cue of this.plan?.cues ?? []) {
        if (cue.kind === 'action' && cue.time <= now) this.onDemonstrationBeat(cue.time);
      }
    }
    this.pump = this.pumpFrom + (this.pumpTo - this.pumpFrom) * easeOut((now - this.pumpAt) / 0.18);
    if (this.finishAt !== null && now >= this.finishAt && !this.finished) {
      this.finished = true;
      // The unscored last rep of the set. It never changes the result: a strong set holds
      // the squeeze at the top, a rough one gets the weight there and loses it.
      this.rep(this.finishAt);
      if (this.successful) { this.setPump(1, this.finishAt); this.sweat(); }
      else {
        this.strain = Math.max(this.strain, 0.6);
        const hand = this.handAt(1);
        const r = this.trunk.rotation;
        this.dropX = hand.x * Math.cos(r) - hand.y * Math.sin(r);
        this.dropFrom = -PLATE.h / 2 - (HIP_Y + hand.x * Math.sin(r) + hand.y * Math.cos(r));
      }
    }
    const age = now - this.repAt;
    const flex = this.flexion(now);
    const pop = age >= 0 && age < 0.14 ? Math.sin(age / 0.14 * Math.PI) * STYLE.current.exaggeration : 0;
    const idle = this.reducedMotion ? 0 : Math.sin(now * 1.7) * 0.004;
    // The squeeze compresses the whole trunk and rocks it back; strain leans it back for
    // good. Both hinge at the hips, so the feet stay planted.
    this.trunk.setScale(1 + pop * 0.018, 1 - pop * 0.022 + idle);
    this.trunk.setRotation(-this.strain * 0.1 - (this.reducedMotion ? 0 : pop * 0.025));
    const landing = this.finished && !this.successful && this.finishAt !== null ? now - this.finishAt - DROP_LANDING_SEC : -1;
    const thump = this.reducedMotion || landing < 0 || landing > 0.2 ? 0 : Math.sin(landing * 110) * Math.exp(-landing * 20) * 3 * STYLE.current.exaggeration;
    this.stage.setPosition(this.baseX + thump * this.scale * 0.4, this.baseY + thump * this.scale);
    this.drawArm(now, flex, pop);
    this.drawFace(now, flex);
    this.drawTally(now);
    this.drawLoose(now);
  }

  /** The centre of the grip in trunk space for a flexion. */
  private handAt(flex: number): { x: number; y: number } {
    const angle = forearmAngle(flex);
    return { x: ELBOW.x + Math.cos(angle) * CURL_MOTION.forearm, y: ELBOW.y + Math.sin(angle) * CURL_MOTION.forearm };
  }

  private drawArm(now: number, flex: number, pop: number): void {
    const g = this.arm.clear();
    const line = STYLE.current.outline * 1.4;
    const skin = faces(mix(GYM.skin, GYM.flush, this.pump * 0.22));
    const ink = faces(GYM.ink);
    const bulge = bicepBulge(flex);
    // Trembling: under a missed load, or shaking the arm out after dropping the weight.
    const shake = now - this.judderAt;
    const tremble = this.reducedMotion || shake < 0 || shake > 0.3 ? 0 : Math.sin(shake * 90) * Math.exp(-shake * 9) * 0.05;
    const hand = this.handAt(flex + tremble);
    // The bicep sits on the front of the upper arm and swells with the flexion; the pump
    // grows its resting size as the set goes on.
    const grow = 1 + this.pump * 0.5;
    const bx = 82 + 22 * bulge;
    const by = -168 + 10 * bulge;
    const rx = (38 + 36 * bulge) * grow + pop * 4;
    const ry = (64 + 14 * bulge) * grow;
    // Deltoid, upper arm, bicep, elbow and forearm as one silhouette: the edge pass first.
    for (const pass of line > 0 ? [line, 0] : [0]) {
      const tone = pass > 0 ? ink.edge : skin.face;
      g.fillStyle(tone).fillCircle(SHOULDER.x, SHOULDER.y, DELTOID_R + pass);
      this.limb(g, SHOULDER.x, SHOULDER.y, ELBOW.x, ELBOW.y, UPPER_ARM_W, tone, pass);
      g.fillStyle(tone).fillEllipse(bx, by, (rx + pass) * 2, (ry + pass) * 2);
      g.fillStyle(tone).fillCircle(ELBOW.x, ELBOW.y, 36 + pass);
      this.limb(g, ELBOW.x, ELBOW.y, hand.x, hand.y, FOREARM_W, tone, pass);
    }
    // Planes under the one light, drawn inside the silhouette.
    g.fillStyle(skin.lit, 0.7).fillCircle(SHOULDER.x - 14, SHOULDER.y - 16, 26);
    g.fillStyle(skin.lit, 0.75).fillEllipse(bx - rx * 0.28, by - ry * 0.3, rx * 0.9, ry * 0.8);
    g.fillStyle(skin.shade, 0.45).fillEllipse(bx + rx * 0.35, by + ry * 0.4, rx * 0.7, ry * 0.5);
    g.lineStyle(2.5, ink.face, 0.35 + bulge * 0.3).beginPath().arc(bx, by, ry * 0.92, Math.PI * 1.55, Math.PI * 1.95, false).strokePath();
    g.fillStyle(skin.shade, 0.35).fillCircle(ELBOW.x + 12, ELBOW.y + 8, 14);
    // The dumbbell held level, with the plates either side of the fist. In the rough
    // coda the hand is open and the weight is on the floor, drawn by the loose layer.
    const held = !(this.finished && !this.successful);
    if (held) this.drawDumbbell(g, hand.x, hand.y, now);
    if (line > 0) g.fillStyle(ink.edge).fillCircle(hand.x, hand.y, GRIP_R + line);
    g.fillStyle(skin.face).fillCircle(hand.x, hand.y, GRIP_R);
    g.fillStyle(skin.lit, 0.6).fillCircle(hand.x - 8, hand.y - 8, 12);
    g.lineStyle(3, ink.face, 0.4);
    for (let i = -1; i <= 1; i++) g.lineBetween(hand.x - 14, hand.y + i * 10, hand.x + 14, hand.y + i * 10);
  }

  private drawDumbbell(g: Phaser.GameObjects.Graphics, x: number, y: number, now: number): void {
    const line = STYLE.current.outline * 1.4;
    const iron = faces(GYM.iron);
    const chrome = faces(GYM.chrome);
    // Plates clank against each other when a half rep is let go.
    const clank = now - this.clankAt;
    const rattle = this.reducedMotion || clank < 0 || clank > 0.22 ? 0 : Math.sin(clank * 96) * Math.exp(-clank * 14) * 4;
    const drop = castShadow(6);
    g.fillStyle(GYM.ink, drop.alpha * 0.6).fillRoundedRect(x - PLATE.reach - PLATE.w / 2 + drop.dx, y - PLATE.h / 2 + drop.dy, PLATE.reach * 2 + PLATE.w, PLATE.h, 10);
    if (line > 0) g.lineStyle(line, chrome.edge).strokeRoundedRect(x - PLATE.reach, y - 12, PLATE.reach * 2, 24, 8);
    g.fillStyle(chrome.face).fillRoundedRect(x - PLATE.reach, y - 12, PLATE.reach * 2, 24, 8);
    g.fillStyle(chrome.rim, 0.9).fillRoundedRect(x - PLATE.reach + 6, y - 9, PLATE.reach * 2 - 12, 6, 3);
    for (const side of [-1, 1]) {
      const px = x + side * PLATE.reach + side * rattle;
      if (line > 0) g.lineStyle(line, iron.edge).strokeRoundedRect(px - PLATE.w / 2, y - PLATE.h / 2, PLATE.w, PLATE.h, 9);
      g.fillStyle(side < 0 ? iron.shade : iron.face).fillRoundedRect(px - PLATE.w / 2, y - PLATE.h / 2, PLATE.w, PLATE.h, 9);
      g.fillStyle(iron.lit, 0.8).fillRoundedRect(px - PLATE.w / 2 + 5, y - PLATE.h / 2 + 5, 8, PLATE.h - 10, 4);
      g.fillStyle(GYM.chalk, 0.5).fillRect(px - 6, y - 18, 12, 4);
    }
  }

  private drawFace(now: number, flex: number): void {
    const g = this.face.clear();
    const ink = GYM.ink;
    const effort = clamp01((flex - 0.55) / 0.35);
    const relieved = this.finished && this.successful;
    const beaten = this.finished && !this.successful;
    // Cheeks flush with the pump, the brow drops with the effort.
    g.fillStyle(GYM.flush, this.pump * 0.28).fillCircle(HEAD.x + 34, HEAD.y + 14, 16);
    const eyeX = HEAD.x + 30;
    const eyeY = HEAD.y - 6;
    g.lineStyle(5, ink, 1).lineBetween(eyeX - 12, eyeY - 18 + effort * 6, eyeX + 12, eyeY - 20 + effort * 10);
    if (relieved || effort > 0.6) {
      g.lineStyle(5, ink, 1).lineBetween(eyeX - 9, eyeY + 1, eyeX + 9, eyeY - (relieved ? -2 : 1));
    } else {
      g.fillStyle(GYM.chalk).fillCircle(eyeX, eyeY, 10);
      g.fillStyle(ink).fillCircle(eyeX + 3, eyeY - (beaten ? -2 : 1), 5);
    }
    const mouthX = HEAD.x + 40;
    const mouthY = HEAD.y + 26;
    if (beaten) {
      g.fillStyle(ink).fillEllipse(mouthX, mouthY + 2, 14, 18);
    } else if (relieved) {
      g.lineStyle(5, ink, 1).beginPath().arc(mouthX - 4, mouthY - 4, 16, Math.PI * 0.15, Math.PI * 0.75, false).strokePath();
    } else if (effort > 0) {
      // Teeth gritted on the squeeze.
      const w = 14 + effort * 16;
      g.lineStyle(4, ink, 1).strokeRoundedRect(mouthX - w / 2, mouthY - 6, w, 13, 5);
      g.fillStyle(GYM.chalk).fillRoundedRect(mouthX - w / 2, mouthY - 6, w, 13, 5);
      g.lineStyle(2, ink, 0.7).lineBetween(mouthX - w / 2 + 3, mouthY + 1, mouthX + w / 2 - 3, mouthY + 1);
    } else {
      g.lineStyle(4, ink, 1).lineBetween(mouthX - 8, mouthY, mouthX + 8, mouthY - 1);
    }
    // Sweat on the brow once the set has started to tell.
    if (this.pump > 0.4 && !this.reducedMotion) {
      const bob = (now * 1.3) % 1;
      g.fillStyle(GYM.sweat, 0.9).fillEllipse(HEAD.x + 62, HEAD.y - 22 + bob * 30, 7, 11);
    }
  }

  private drawTally(now: number): void {
    const g = this.tally.clear();
    const left = BOARD.x + 26;
    const top = BOARD.y + 66;
    g.lineStyle(5, GYM.chalk, 0.92);
    // Four strokes and a fifth across them, the way sets are counted on a real board.
    for (let i = 0; i < this.reps; i++) {
      const group = Math.floor(i / TALLY_GROUP);
      const index = i % TALLY_GROUP;
      const gx = left + (group % TALLY_GROUPS_PER_ROW) * (TALLY_STEP * 3 + 40);
      const gy = top + Math.floor(group / TALLY_GROUPS_PER_ROW) * 62;
      if (index < TALLY_GROUP - 1) g.lineBetween(gx + index * TALLY_STEP, gy, gx + index * TALLY_STEP + 3, gy + 48);
      else g.lineBetween(gx - 8, gy + 40, gx + TALLY_STEP * 3 + 10, gy + 6);
    }
    if (!this.finished || this.finishAt === null) return;
    const p = chalkDraw(now - this.finishAt - 0.15);
    if (p <= 0) return;
    if (this.successful) {
      // A ring drawn round the count once the weight is held at the top.
      const cx = BOARD.x + BOARD.w / 2;
      const cy = BOARD.y + BOARD.h / 2 + 14;
      g.lineStyle(5, GYM.chalk, 0.9).beginPath().arc(cx, cy, 84, -Math.PI * 0.5, -Math.PI * 0.5 + p * Math.PI * 2, false).strokePath();
    } else {
      // The chalk dragged across the count: the set is not what was written.
      g.lineStyle(9, GYM.chalk, 0.35).lineBetween(left - 6, top + 44, left - 6 + p * 170, top + 10 + p * 8);
    }
  }

  /** The dropped weight in the rough coda, in stage space, and its mark on the mat. */
  private drawLoose(now: number): void {
    const g = this.loose.clear();
    if (!this.finished || this.successful || this.finishAt === null) return;
    const age = now - this.finishAt;
    const height = dropHeight(age, this.dropFrom);
    const x = this.dropX + Math.min(1, age / 0.6) * 26;
    const y = -PLATE.h / 2 - height;
    const landed = age - DROP_LANDING_SEC;
    if (landed > 0 && landed < 0.3) {
      g.lineStyle(3, GYM.chalk, (1 - landed / 0.3) * 0.8).strokeEllipse(x, -2, 160 + landed * 400, 12 + landed * 40);
    }
    this.drawDumbbell(g, x, y, now);
    if (landed > 0) g.fillStyle(GYM.ink, 0.35).fillEllipse(x, -1, 150, 10);
  }

  public translate(offset: number): void { this.stage.x += this.reducedMotion ? 0 : offset; }
  public destroy(): void { this.bursts.destroy(); this.stage.destroy(true); this.backdrop.destroy(); }
}
