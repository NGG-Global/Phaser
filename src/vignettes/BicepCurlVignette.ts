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
//
// Cartoon-athletic proportions: an egg of a head (not a circle), a V of a torso, and
// legs that taper to the ankle instead of standing as two square pillars. About five
// heads tall, so the face can carry the effort and the working arm stays the subject.
const HIP_Y = -292;
/** Trunk space: origin at the hips. */
const SHOULDER = { x: 56, y: -236 } as const;
const ELBOW = { x: 68, y: -64 } as const;
const HEAD = { x: 54, y: -402, rx: 58, ry: 72 } as const;
const JAW = { x: 64, y: -352, rx: 42, ry: 38 } as const;
const HAIR = { x: 46, y: -440, rx: 56, ry: 44 } as const;
const DELTOID_R = 46;
const UPPER_ARM = { shoulder: 42, elbow: 28 } as const;
const FOREARM = { elbow: 28, wrist: 20 } as const;
/** Side-on plates either side of the grip, and the grip itself. */
const PLATE = { reach: 66, w: 40, h: 118 } as const;
const GRIP_R = 28;
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
   * A fleshy limb that tapers between two joints. Circular caps keep the silhouette
   * one sausage, so a thigh meeting a knee does not seam the way stacked ellipses did.
   */
  private taper(
    g: Phaser.GameObjects.Graphics,
    x1: number, y1: number, r1: number,
    x2: number, y2: number, r2: number,
    colour: number, grow = 0,
  ): void {
    const a = r1 + grow, b = r2 + grow;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    g.fillStyle(colour);
    if (len < 1) { g.fillCircle(x1, y1, a); return; }
    const nx = -dy / len, ny = dx / len;
    fan(g, [x1 + nx * a, y1 + ny * a, x2 + nx * b, y2 + ny * b, x2 - nx * b, y2 - ny * b, x1 - nx * a, y1 - ny * a]);
    g.fillCircle(x1, y1, a);
    g.fillCircle(x2, y2, b);
  }

  private drawLegs(g: Phaser.GameObjects.Graphics): void {
    const line = STYLE.current.outline * 1.4;
    const ink = faces(GYM.ink);
    const skin = faces(GYM.skin);
    const drop = castShadow(6);
    g.fillStyle(GYM.ink, drop.alpha).fillEllipse(22 + drop.dx, 10, 280, 22);
    // Athletic stance, slight bend: the back leg in shade, the front leg lit. Each
    // segment tapers hip → knee → ankle, so the mass sits in the thigh and calf
    // instead of reading as two square posts under a box of shorts.
    const back = { hip: { x: -26, y: -248 }, knee: { x: -40, y: -138 }, ankle: { x: -48, y: -40 } } as const;
    const front = { hip: { x: 44, y: -248 }, knee: { x: 58, y: -132 }, ankle: { x: 70, y: -38 } } as const;
    for (const pass of line > 0 ? [line, 0] : [0]) {
      const shadeTone = pass > 0 ? ink.edge : skin.shade;
      const litTone = pass > 0 ? ink.edge : skin.face;
      this.taper(g, back.hip.x, back.hip.y, 36, back.knee.x, back.knee.y, 22, shadeTone, pass);
      this.taper(g, back.knee.x, back.knee.y, 24, back.ankle.x, back.ankle.y, 15, shadeTone, pass);
      g.fillStyle(shadeTone).fillEllipse(back.knee.x - 6, back.knee.y + 28, (26 + pass) * 2, (40 + pass) * 2);
      this.taper(g, front.hip.x, front.hip.y, 40, front.knee.x, front.knee.y, 24, litTone, pass);
      this.taper(g, front.knee.x, front.knee.y, 26, front.ankle.x, front.ankle.y, 16, litTone, pass);
      g.fillStyle(litTone).fillEllipse(front.knee.x + 8, front.knee.y + 30, (28 + pass) * 2, (44 + pass) * 2);
    }
    g.fillStyle(skin.lit, 0.5).fillEllipse(front.hip.x - 4, -196, 28, 52);
    g.fillStyle(skin.lit, 0.4).fillEllipse(front.knee.x - 2, front.knee.y + 18, 20, 28);
    g.fillStyle(skin.shade, 0.35).fillEllipse(front.knee.x + 16, front.knee.y + 38, 16, 22);
    this.drawShoe(g, back.ankle.x - 8, 0, 0.86, false, line);
    this.drawShoe(g, front.ankle.x - 14, 2, 1, true, line);
    // Shorts as a hip bubble and two thigh lobes, so the hem follows the leg instead
    // of cutting a rounded rectangle across it.
    for (const pass of line > 0 ? [line, 0] : [0]) {
      const seat = pass > 0 ? ink.edge : ink.face;
      const backLobe = pass > 0 ? ink.edge : ink.shade;
      g.fillStyle(backLobe).fillEllipse(-30, HIP_Y + 56, (36 + pass) * 2, (32 + pass) * 2);
      g.fillStyle(seat).fillEllipse(16, HIP_Y + 10, (78 + pass) * 2, (48 + pass) * 2);
      g.fillStyle(seat).fillEllipse(50, HIP_Y + 62, (40 + pass) * 2, (34 + pass) * 2);
    }
    g.fillStyle(ink.shade, 0.45).fillEllipse(-28, HIP_Y + 18, 52, 58);
    g.fillStyle(ink.lit, 0.35).fillEllipse(36, HIP_Y - 4, 70, 28);
    g.fillStyle(ink.face).fillRoundedRect(-52, HIP_Y - 18, 128, 22, 11);
    g.fillStyle(ink.lit, 0.7).fillRoundedRect(-46, HIP_Y - 16, 116, 8, 4);
    g.fillStyle(GYM.tank, 0.95).fillEllipse(72, HIP_Y + 28, 14, 72);
  }

  /** A trainer in side view: round toe, heel cup, chalk midsole. Not a rounded brick. */
  private drawShoe(
    g: Phaser.GameObjects.Graphics, heelX: number, soleY: number, size: number, lit: boolean, line: number,
  ): void {
    const ink = faces(GYM.ink);
    const upper = lit ? ink.face : ink.shade;
    const w = 112 * size;
    const h = 36 * size;
    const r = 14 * size;
    for (const pass of line > 0 ? [line, 0] : [0]) {
      const tone = pass > 0 ? ink.edge : upper;
      g.fillStyle(tone).fillRoundedRect(heelX - pass, soleY - h + 8 - pass, w + pass * 2, h * 0.62 + pass * 2, r);
      g.fillStyle(tone).fillEllipse(heelX + w * 0.78, soleY - h * 0.42, (w * 0.28 + pass) * 2, (h * 0.42 + pass) * 2);
      g.fillStyle(tone).fillEllipse(heelX + w * 0.18, soleY - h * 0.52, (w * 0.2 + pass) * 2, (h * 0.48 + pass) * 2);
    }
    g.fillStyle(lit ? ink.lit : ink.face, 0.55).fillEllipse(heelX + w * 0.42, soleY - h * 0.62, w * 0.42, h * 0.28);
    g.fillStyle(GYM.chalk).fillRoundedRect(heelX + 4, soleY - 12 * size, w - 8, 10 * size, 4 * size);
    g.fillStyle(ink.edge).fillRoundedRect(heelX + 2, soleY - 4 * size, w - 4, 8 * size, 4 * size);
    g.lineStyle(4.5 * size, GYM.tank).beginPath()
      .arc(heelX + w * 0.55, soleY - h * 0.22, 22 * size, Math.PI * 1.15, Math.PI * 1.75, false)
      .strokePath();
  }

  private drawBody(g: Phaser.GameObjects.Graphics): void {
    const line = STYLE.current.outline * 1.4;
    const ink = faces(GYM.ink);
    const skin = faces(GYM.skin);
    const tank = faces(GYM.tank);
    // The far arm hangs behind the torso in shade: the one that is not working.
    for (const pass of line > 0 ? [line, 0] : [0]) {
      const tone = pass > 0 ? ink.edge : skin.shade;
      this.taper(g, -36, -210, 22, -48, -92, 16, tone, pass);
      this.taper(g, -48, -92, 16, -40, -48, 13, tone, pass);
      g.fillStyle(tone).fillEllipse(-38, -40, (16 + pass) * 2, (13 + pass) * 2);
    }
    // Torso, neck and head as one silhouette: a V through the shoulders, an egg of a
    // skull with a jaw, hair as a mass that breaks the oval. Drawn together so the
    // outline runs the whole figure and a neck does not seam onto a floating circle.
    const torso = [-40, -242, 104, -262, 122, -196, 108, -108, 74, -10, -22, -8, -46, -132, -50, -210];
    if (line > 0) {
      g.lineStyle(line * 2, ink.edge); outline(g, torso);
      this.taper(g, 16, -244, 30, 44, -348, 22, ink.edge, line);
      g.fillStyle(ink.edge).fillEllipse(HEAD.x, HEAD.y, (HEAD.rx + line) * 2, (HEAD.ry + line) * 2);
      g.fillStyle(ink.edge).fillEllipse(JAW.x, JAW.y, (JAW.rx + line) * 2, (JAW.ry + line) * 2);
      g.fillStyle(ink.edge).fillEllipse(HAIR.x, HAIR.y, (HAIR.rx + line) * 2, (HAIR.ry + line) * 2);
      g.fillStyle(ink.edge).fillEllipse(HEAD.x + 22, HEAD.y - 64, 56 + line * 2, 40 + line * 2);
    }
    g.fillStyle(skin.face); fan(g, torso);
    this.taper(g, 16, -244, 30, 44, -348, 22, skin.face);
    g.fillStyle(skin.shade, 0.38); fan(g, [-40, -242, -6, -240, -4, -8, -22, -8, -46, -132, -50, -210]);
    g.fillStyle(skin.face).fillEllipse(86, -176, 78, 96);
    g.fillStyle(skin.lit, 0.55).fillEllipse(98, -192, 40, 46);
    g.fillStyle(skin.face).fillEllipse(HEAD.x, HEAD.y, HEAD.rx * 2, HEAD.ry * 2);
    g.fillStyle(skin.face).fillEllipse(JAW.x, JAW.y, JAW.rx * 2, JAW.ry * 2);
    g.fillStyle(skin.lit, 0.72).fillEllipse(HEAD.x - 16, HEAD.y - 18, 58, 52);
    g.fillStyle(skin.shade, 0.28).fillEllipse(HEAD.x + 28, HEAD.y + 22, 36, 44);
    // Singlet, side-on: a lit chest panel, a thin shaded back, two straps. No mass
    // behind the spine, which is what made an earlier vest read as luggage.
    const vest = [-14, -178, 92, -192, 116, -136, 80, -12, -16, -10, -32, -122];
    if (line > 0) { g.lineStyle(line, tank.edge); outline(g, vest); }
    g.fillStyle(tank.face); fan(g, vest);
    g.fillStyle(tank.shade, 0.9); fan(g, [-32, -122, -4, -134, 0, -10, -16, -10]);
    g.fillStyle(tank.lit, 0.88); fan(g, [10, -170, 90, -184, 110, -136, 78, -112, 18, -110]);
    if (line > 0) g.lineStyle(16 + line * 2, tank.edge).lineBetween(-4, -180, 10, -252).lineBetween(72, -194, 62, -258);
    g.lineStyle(16, tank.face).lineBetween(-4, -180, 10, -252).lineBetween(72, -194, 62, -258);
    // Hair as a distinct mass — short sides, volume on top — then the sweatband and ear.
    g.fillStyle(ink.face).fillEllipse(HAIR.x, HAIR.y, HAIR.rx * 2, HAIR.ry * 2);
    g.fillStyle(ink.face).fillEllipse(HEAD.x + 22, HEAD.y - 64, 56, 40);
    g.fillStyle(ink.shade, 0.45).fillEllipse(HAIR.x + 18, HAIR.y + 8, 40, 24);
    g.fillStyle(ink.lit, 0.25).fillEllipse(HAIR.x - 14, HAIR.y - 10, 36, 22);
    g.fillStyle(GYM.chalk).fillRoundedRect(HEAD.x - 58, HEAD.y - 32, 120, 22, 10);
    g.fillStyle(GYM.tank).fillRect(HEAD.x - 54, HEAD.y - 24, 112, 5);
    g.fillStyle(skin.shade).fillEllipse(HEAD.x - 50, HEAD.y + 8, 28, 34);
    g.fillStyle(skin.face).fillEllipse(HEAD.x - 48, HEAD.y + 6, 22, 28);
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
    this.bursts.burst('dust', HEAD.x + 78, HIP_Y + HEAD.y + 36, [GYM.chalk, GYM.wall], 3);
  }

  private sweat(): void {
    if (this.reducedMotion) return;
    this.bursts.burst('water', HEAD.x + 16, HIP_Y + HEAD.y - 62, [GYM.sweat, GYM.chalk], 3);
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
    const angle = forearmAngle(flex + tremble);
    // The bicep sits on the front of the upper arm and swells with the flexion; the pump
    // grows its resting size as the set goes on.
    const grow = 1 + this.pump * 0.2;
    const bx = 78 + 10 * bulge;
    const by = -152 + 6 * bulge;
    const rx = (26 + 16 * bulge) * grow + pop * 2;
    const ry = (46 + 8 * bulge) * grow;
    const deltoid = DELTOID_R + this.pump * 4;
    // Deltoid, upper arm, bicep, elbow and forearm as one silhouette: the edge pass first.
    for (const pass of line > 0 ? [line, 0] : [0]) {
      const tone = pass > 0 ? ink.edge : skin.face;
      g.fillStyle(tone).fillCircle(SHOULDER.x, SHOULDER.y, deltoid + pass);
      this.taper(g, SHOULDER.x, SHOULDER.y, UPPER_ARM.shoulder, ELBOW.x, ELBOW.y, UPPER_ARM.elbow, tone, pass);
      g.fillStyle(tone).fillEllipse(bx, by, (rx + pass) * 2, (ry + pass) * 2);
      g.fillStyle(tone).fillCircle(ELBOW.x, ELBOW.y, 30 + pass);
      this.taper(g, ELBOW.x, ELBOW.y, FOREARM.elbow, hand.x, hand.y, FOREARM.wrist, tone, pass);
    }
    // Planes under the one light, drawn inside the silhouette.
    g.fillStyle(skin.lit, 0.7).fillCircle(SHOULDER.x - 14, SHOULDER.y - 16, 24);
    g.fillStyle(skin.lit, 0.75).fillEllipse(bx - rx * 0.28, by - ry * 0.3, rx * 0.9, ry * 0.8);
    g.fillStyle(skin.shade, 0.45).fillEllipse(bx + rx * 0.35, by + ry * 0.4, rx * 0.7, ry * 0.5);
    g.lineStyle(2.5, ink.face, 0.35 + bulge * 0.3).beginPath().arc(bx, by, ry * 0.92, Math.PI * 1.55, Math.PI * 1.95, false).strokePath();
    g.fillStyle(skin.shade, 0.35).fillCircle(ELBOW.x + 12, ELBOW.y + 8, 12);
    // Wristband echoes the sweatband: a wrap perpendicular to the forearm, not a disc.
    const wx = ELBOW.x + Math.cos(angle) * (CURL_MOTION.forearm - 38);
    const wy = ELBOW.y + Math.sin(angle) * (CURL_MOTION.forearm - 38);
    const nx = -Math.sin(angle) * 20, ny = Math.cos(angle) * 20;
    g.lineStyle(13, GYM.chalk).lineBetween(wx - nx, wy - ny, wx + nx, wy + ny);
    g.lineStyle(4, GYM.tank).lineBetween(wx - nx, wy - ny, wx + nx, wy + ny);
    // The dumbbell held level, with the plates either side of the fist. In the rough
    // coda the hand is open and the weight is on the floor, drawn by the loose layer.
    const held = !(this.finished && !this.successful);
    if (held) this.drawDumbbell(g, hand.x, hand.y, now);
    const thumbA = angle - 1.15;
    const tx = hand.x + Math.cos(thumbA) * 22;
    const ty = hand.y + Math.sin(thumbA) * 22;
    for (const pass of line > 0 ? [line, 0] : [0]) {
      const tone = pass > 0 ? ink.edge : skin.face;
      g.fillStyle(tone).fillCircle(hand.x, hand.y, GRIP_R + pass);
      g.fillStyle(tone).fillCircle(tx, ty, 13 + pass);
    }
    g.fillStyle(skin.lit, 0.6).fillCircle(hand.x - 8, hand.y - 8, 11);
    g.lineStyle(3, ink.face, 0.4);
    for (let i = -1; i <= 1; i++) g.lineBetween(hand.x - 12, hand.y + i * 9, hand.x + 12, hand.y + i * 9);
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
    // Cheeks flush with the pump, the brow drops with the effort. Features sit on the
    // egg of a head, large enough to read the squeeze from the back of a bus.
    g.fillStyle(GYM.flush, this.pump * 0.28).fillEllipse(HEAD.x + 36, HEAD.y + 22, 36, 32);
    const eyeX = HEAD.x + 34;
    const eyeY = HEAD.y - 4;
    g.lineStyle(6, ink, 1).lineBetween(eyeX - 16, eyeY - 22 + effort * 8, eyeX + 16, eyeY - 24 + effort * 12);
    if (relieved || effort > 0.6) {
      g.lineStyle(6, ink, 1).lineBetween(eyeX - 12, eyeY + 2, eyeX + 12, eyeY - (relieved ? -3 : 1));
    } else {
      g.fillStyle(GYM.chalk).fillEllipse(eyeX, eyeY, 28, 24);
      g.fillStyle(ink).fillCircle(eyeX + 4, eyeY - (beaten ? -3 : 1), 7);
      g.fillStyle(GYM.chalk, 0.7).fillCircle(eyeX + 1, eyeY - 5, 3);
    }
    // A nose so the three-quarter head has a plane, not a ball with a sticker on it.
    g.lineStyle(4, ink, 0.85).beginPath().moveTo(HEAD.x + 52, HEAD.y + 2).lineTo(HEAD.x + 62, HEAD.y + 16).lineTo(HEAD.x + 50, HEAD.y + 18).strokePath();
    const mouthX = HEAD.x + 44;
    const mouthY = HEAD.y + 38;
    if (beaten) {
      g.fillStyle(ink).fillEllipse(mouthX, mouthY + 4, 16, 20);
    } else if (relieved) {
      g.lineStyle(6, ink, 1).beginPath().arc(mouthX - 4, mouthY - 4, 18, Math.PI * 0.15, Math.PI * 0.8, false).strokePath();
    } else if (effort > 0) {
      // Teeth gritted on the squeeze.
      const w = 16 + effort * 18;
      g.lineStyle(4, ink, 1).strokeRoundedRect(mouthX - w / 2, mouthY - 7, w, 15, 6);
      g.fillStyle(GYM.chalk).fillRoundedRect(mouthX - w / 2, mouthY - 7, w, 15, 6);
      g.lineStyle(2, ink, 0.7).lineBetween(mouthX - w / 2 + 3, mouthY + 1, mouthX + w / 2 - 3, mouthY + 1);
    } else {
      g.lineStyle(5, ink, 1).lineBetween(mouthX - 10, mouthY, mouthX + 10, mouthY - 1);
    }
    // Sweat on the brow once the set has started to tell.
    if (this.pump > 0.4 && !this.reducedMotion) {
      const bob = (now * 1.3) % 1;
      g.fillStyle(GYM.sweat, 0.9).fillEllipse(HEAD.x + 68, HEAD.y - 28 + bob * 34, 8, 12);
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
