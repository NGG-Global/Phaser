import Phaser from 'phaser';
import { isMuted, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { BaseScene } from '@/core/BaseScene';
import { reducedMotion } from '@/core/motionPreference';
import { levelSpec } from '@/game/levels';
import { loadProgress } from '@/game/progress';
import { TapInput, type Tap } from '@/input/TapInput';
import { MaterialKey } from '@/textures/materials';
import { shade } from '@/ui/colour';
import { drawGear } from '@/ui/gear';
import { drawPlay, drawSpeaker } from '@/ui/icons';
import { faces } from '@/ui/light';
import { BRASS, drawDisc, drawPanel, placeSurface, surface } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { arrive, settle, spring } from '@/ui/spring';
import { body, display, label, resize } from '@/ui/type';
import { HammerNailVignette } from '@/vignettes/HammerNailVignette';
import { VIGNETTES } from '@/vignettes/registry';
import type { Vignette } from '@/vignettes/Vignette';

const MENU = {
  sign: { width: 560, height: 300, top: 118, ropeInset: 150 },
  button: { width: 560, height: 110, fromBottom: 96 },
  tag: { height: 88, gap: 22 },
  puck: 34,
  /** Beats per second of the sign's tempo beads: the game's own 120 BPM. */
  beatHz: 2, dots: 4,
  pressSec: 0.42,
} as const;

/** The few colours the menu owns outright. Everything else is derived through `faces()`. */
const LOOK = { sign: 0xd98a48, title: 0xfff4dc, button: 0xcf5134, tag: 0xf6ead0, puck: 0xf6ead0, icon: 0x243e35, ink: 0x243e35, rope: 0x6b4a2e } as const;

/**
 * Title screen. Owns the first audio gesture: PLAY unlocks the shared AudioEngine and
 * loads the music before the map starts, so play begins on the same tap.
 *
 * The title is an object rather than a heading: a sign hung from the top edge on two
 * ropes, swinging as one rigid body about the ceiling. The action is a block sitting on
 * the bench, and the two utility controls are pucks. Nothing here is a column of text.
 */
export class MenuScene extends BaseScene {
  private illustration!: Vignette;
  private sign!: Phaser.GameObjects.Container;
  private ropes!: Phaser.GameObjects.Graphics;
  private board!: Phaser.GameObjects.Graphics;
  private boardSurface!: Phaser.GameObjects.TileSprite;
  private beads!: Phaser.GameObjects.Graphics;
  private headline!: Phaser.GameObjects.Text;
  private caption!: Phaser.GameObjects.Text;
  private tag!: Phaser.GameObjects.Graphics;
  private tagSurface!: Phaser.GameObjects.TileSprite;
  private progressLabel!: Phaser.GameObjects.Text;
  private progressValue!: Phaser.GameObjects.Text;
  private button!: Phaser.GameObjects.Graphics;
  private buttonSurface!: Phaser.GameObjects.TileSprite;
  private playLabel!: Phaser.GameObjects.Text;
  private pucks!: Phaser.GameObjects.Graphics;
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private enteredAt = 0;
  private uiScale = 1;
  private ceilingY = 0;
  private buttonRect = new Phaser.Geom.Rectangle();
  private tagRect = new Phaser.Geom.Rectangle();
  private boardRect = new Phaser.Geom.Rectangle();
  private controlSize = 96;
  private muteAt = { x: 0, y: 0 };
  private setupAt = { x: 0, y: 0 };
  private beadRow = { x: 0, y: 0, gap: 0, radius: 0 };
  private pressedAt = -Infinity;
  private pressDirty = false;
  private muted = false;
  private busy = false;
  private disposed = false;
  private request = 0;
  private readonly look = LOOK;

  public constructor() { super(SceneKey.Menu); }

  protected override build(): void {
    this.disposed = false;
    this.busy = false;
    this.pressedAt = -Infinity;
    this.muted = isMuted(this);
    // The hammer's idle sway doubles as the title illustration; it never receives a plan.
    this.illustration = new HammerNailVignette(this, true);

    this.sign = this.add.container(0, 0);
    this.ropes = this.add.graphics();
    this.board = this.add.graphics();
    this.boardSurface = surface(this, MaterialKey.wood, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, this.look.sign, 0.7);
    this.beads = this.add.graphics();
    this.headline = display(this, 'Tiny\nTempo', { size: 96, colour: this.look.title, align: 'center' }).setOrigin(0.5, 0.5);
    this.caption = body(this, 'Little things. Perfect timing.', { size: 24, colour: this.look.title }).setOrigin(0.5).setAlpha(0.85);
    this.sign.add([this.ropes, this.board, this.boardSurface, this.beads, this.headline, this.caption]);

    const progress = loadProgress();
    const fresh = progress.unlocked === 1;
    const next = VIGNETTES.find(v => v.id === levelSpec(progress.unlocked).vignette)!;
    this.tag = this.add.graphics();
    this.tagSurface = surface(this, MaterialKey.parchment, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, this.look.tag, 0.5);
    this.progressLabel = label(this, `${fresh ? 'Begin here' : 'Next up'} · level ${progress.unlocked}`, { size: 15, colour: this.look.ink }).setAlpha(0.7);
    this.progressValue = display(this, next.title, { size: 30, colour: this.look.ink }).setOrigin(0, 0.5);

    this.button = this.add.graphics();
    this.buttonSurface = surface(this, MaterialKey.cloth, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, this.look.button, 0.35);
    this.playLabel = display(this, fresh ? 'Let’s play' : 'Keep playing', { size: 40, colour: 0xfff4dc, align: 'center' }).setOrigin(0.5);
    this.pucks = this.add.graphics();

    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.enteredAt = performance.now() / 1000;
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  protected override layout(): void {
    const { safe, full } = this.viewport;
    this.illustration.layout(this.viewport);
    const s = this.uiScale = Math.min(safe.width / 720, safe.height / 1150);

    // The sign. Local space has its origin at the ceiling anchor so the whole object
    // swings about the point it hangs from.
    this.ceilingY = full.y - 4 * s;
    const ropeLength = safe.top + MENU.sign.top * s - this.ceilingY;
    const w = MENU.sign.width * s, h = MENU.sign.height * s;
    this.boardRect.setTo(-w / 2, ropeLength, w, h);
    this.sign.setPosition(safe.centerX, this.ceilingY);
    this.drawRopes(s, ropeLength);
    this.board.clear();
    drawPanel(this.board, this.boardRect, s, { fill: this.look.sign, depth: 14, hero: true });
    placeSurface(this.boardSurface, this.boardRect, s);
    resize(this.headline, 96 * s, this.look.title);
    this.headline.setLineSpacing(-22 * s).setPosition(0, this.boardRect.y + h * 0.42);
    this.caption.setFontSize(Math.max(24 * s, 12 * this.viewport.unitScale)).setPosition(0, this.boardRect.y + h * 0.78);
    this.beadRow = { x: -1.5 * 34 * s, y: this.boardRect.y + h * 0.9, gap: 34 * s, radius: 6 * s };

    // Utility pucks, top right, inside the safe frame and clear of the sign's swing.
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    // Both pucks stay right of the sign's ropes even at full swing.
    this.muteAt = { x: safe.right - 56 * s, y: safe.top + 66 * s };
    this.setupAt = { x: this.muteAt.x - Math.max(88 * s, this.controlSize + 4 * s), y: this.muteAt.y };
    this.drawPucks(s);

    // The block sits a fixed distance above the bottom edge: thumb reach is absolute, not proportional.
    const height = Math.max(MENU.button.height * s, this.controlSize);
    this.buttonRect.setTo(safe.centerX - MENU.button.width * s / 2, safe.bottom - MENU.button.fromBottom * s - height, MENU.button.width * s, height);
    this.tagRect.setTo(this.buttonRect.x, this.buttonRect.y - (MENU.tag.height + MENU.tag.gap) * s, this.buttonRect.width, MENU.tag.height * s);
    this.tag.clear();
    drawPanel(this.tag, this.tagRect, s, { fill: this.look.tag, depth: 6 });
    placeSurface(this.tagSurface, this.tagRect, s);
    this.progressLabel.setFontSize(Math.max(15 * s, 8 * this.viewport.unitScale)).setPosition(this.tagRect.x + 26 * s, this.tagRect.y + 14 * s);
    resize(this.progressValue, 30 * s, this.look.ink);
    this.progressValue.setPosition(this.tagRect.x + 26 * s, this.tagRect.y + this.tagRect.height * 0.64);
    this.drawButton(0, s);
    resize(this.playLabel, 40 * s, 0xfff4dc);
  }

  private drawRopes(s: number, length: number): void {
    const g = this.ropes.clear();
    const t = STYLE.current;
    const inset = MENU.sign.ropeInset * s;
    for (const x of [-inset, inset]) {
      g.lineStyle(t.outline * s * 0.55 + 9 * s, shade(this.look.rope, -0.5), 1).lineBetween(x, 0, x, length);
      g.lineStyle(9 * s, this.look.rope, 1).lineBetween(x, 0, x, length);
      g.lineStyle(2.5 * s, shade(this.look.rope, 0.35), 0.6).lineBetween(x - 2 * s, 0, x - 2 * s, length);
      // The eye the rope passes through.
      g.fillStyle(faces(BRASS).edge, 1).fillCircle(x, length + 2 * s, 9 * s);
      g.fillStyle(BRASS, 1).fillCircle(x, length, 9 * s);
      g.fillStyle(shade(this.look.sign, -0.6), 1).fillCircle(x, length, 3.5 * s);
    }
  }

  private drawPucks(s: number): void {
    const g = this.pucks.clear();
    const r = MENU.puck * s;
    drawDisc(g, this.muteAt.x, this.muteAt.y, r, s, { fill: this.look.puck, depth: 7 });
    drawDisc(g, this.setupAt.x, this.setupAt.y, r, s, { fill: this.look.puck, depth: 7 });
    drawSpeaker(g, this.muteAt.x, this.muteAt.y, r * 0.5, this.look.icon, this.muted);
    drawGear(g, this.setupAt.x, this.setupAt.y, r * 0.52, this.look.icon, 1);
  }

  /** The block sinks on the tap and springs back: one press, one rebound, then still. */
  private drawButton(press: number, s: number): void {
    const g = this.button.clear();
    const r = this.buttonRect;
    drawPanel(g, r, s, { fill: this.look.button, depth: 16, press, hero: true });
    const sink = 16 * s * press * 0.8;
    placeSurface(this.buttonSurface, r, s, sink);
    const labelX = r.centerX + 22 * s;
    this.playLabel.setPosition(labelX, r.centerY + sink);
    const iconX = labelX - this.playLabel.displayWidth / 2 - 34 * s;
    g.fillStyle(0x000000, 0.18).fillCircle(iconX, r.centerY + sink, 22 * s);
    drawPlay(g, iconX + 2 * s, r.centerY + sink, 12 * s, 0xfff4dc);
  }

  public override update(): void {
    const now = performance.now() / 1000;
    this.illustration.update(now);
    const s = this.uiScale;
    const t = STYLE.current;
    const still = reducedMotion();
    const age = now - this.enteredAt;

    // The sign drops in on its ropes and swings itself quiet; at rest it drifts a little.
    const entry = still ? { rise: 0, alpha: 1 } : arrive(age - 0.1, 0.9);
    const swing = still ? 0 : settle(age - 0.3, 5.2, 1.6) * 0.06 * t.exaggeration + Math.sin(now * 0.7) * 0.012 * t.exaggeration;
    this.sign.setPosition(this.viewport.safe.centerX, this.ceilingY - entry.rise * 260 * s).setRotation(swing).setAlpha(entry.alpha);

    const press = this.pressedAt > -Infinity ? 1 - spring((now - this.pressedAt) / MENU.pressSec, 5, 2) : 0;
    if (press > 0.001 || this.pressDirty) {
      this.drawButton(Math.max(0, press), s);
      // One last frame at rest, then stop: the block is otherwise static geometry.
      this.pressDirty = press > 0.001;
    }

    // Four beads on the game's own pulse: the sign says what the game is before the copy does.
    const g = this.beads.clear();
    const beat = still ? 0 : Math.floor(now * MENU.beatHz) % MENU.dots;
    const phase = still ? 0 : (now * MENU.beatHz) % 1;
    for (let i = 0; i < MENU.dots; i++) {
      const lit = still ? i === 0 : i === beat;
      const grow = lit ? 1 + (1 - phase) ** 2 * 0.7 * t.exaggeration : 1;
      const colour = lit ? this.look.button : shade(this.look.sign, -0.25);
      const f = faces(colour);
      const x = this.beadRow.x + i * this.beadRow.gap, r = this.beadRow.radius * grow;
      g.fillStyle(f.edge, 1).fillCircle(x, this.beadRow.y + 2.5 * s, r);
      g.fillStyle(f.face, 1).fillCircle(x, this.beadRow.y, r);
      g.fillStyle(f.rim, 0.8).fillCircle(x - r * 0.3, this.beadRow.y - r * 0.35, r * 0.3);
    }
  }

  private handleTap(tap: Tap): void {
    if (this.curtain.active || this.busy) return;
    const half = this.controlSize / 2;
    if (Math.abs(tap.x - this.muteAt.x) < half && Math.abs(tap.y - this.muteAt.y) < half) {
      this.muted = toggleMute(sharedAudio(this));
      this.drawPucks(this.uiScale);
      return;
    }
    if (Math.abs(tap.x - this.setupAt.x) < half && Math.abs(tap.y - this.setupAt.y) < half) {
      this.curtain.cover(() => this.scene.start(SceneKey.Settings, { from: SceneKey.Menu }));
      return;
    }
    if (Phaser.Geom.Rectangle.Contains(this.buttonRect, tap.x, tap.y)) {
      this.pressedAt = performance.now() / 1000;
      this.pressDirty = true;
      void this.play();
    }
  }
  private async play(): Promise<void> {
    if (this.busy) return;
    const request = ++this.request;
    this.busy = true;
    this.playLabel.setText('Waking up…');
    try {
      const audio = sharedAudio(this);
      await audio.unlock();
      if (this.disposed || request !== this.request) return;
      this.playLabel.setText('Tuning up…');
      await audio.music.load();
      if (this.disposed || request !== this.request) return;
      this.playLabel.setText('Here we go.');
      this.curtain.cover(() => this.scene.start(SceneKey.Map));
    } catch (error) {
      if (this.disposed || request !== this.request) return;
      this.busy = false;
      this.playLabel.setText('Try again');
      this.caption.setText('Sound needs another try.');
      console.error('Unable to prepare music', error);
    }
  }
  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.request;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.taps.dispose();
    this.illustration.destroy();
  }
}
