import Phaser from 'phaser';
import { isMuted, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { SceneKey } from '@/config/scenes';
import { BaseScene } from '@/core/BaseScene';
import { levelSpec } from '@/game/levels';
import { loadProgress } from '@/game/progress';
import { TapInput, type Tap } from '@/input/TapInput';
import { hex, shade } from '@/ui/colour';
import { VIGNETTES } from '@/vignettes/registry';
import { HammerNailVignette } from '@/vignettes/HammerNailVignette';
import { SceneCurtain } from '@/ui/SceneCurtain';
import type { Vignette } from '@/vignettes/Vignette';

const MENU = {
  buttonWidth: 620, buttonHeight: 104, buttonFromBottom: 100, radius: 16,
  /** Beats per second of the title's tempo dots: the game's own 120 BPM. */
  beatHz: 2, dots: 4,
  pressSec: 0.14,
} as const;

/**
 * Title screen. Owns the first audio gesture: PLAY unlocks the shared AudioEngine and
 * loads the stems before the play scene starts, so play begins on the same tap.
 */
export class MenuScene extends BaseScene {
  private illustration!: Vignette;
  private scrim!: Phaser.GameObjects.Graphics;
  private plate!: Phaser.GameObjects.Graphics;
  private button!: Phaser.GameObjects.Graphics;
  private beats!: Phaser.GameObjects.Graphics;
  private edition!: Phaser.GameObjects.Text;
  private headline!: Phaser.GameObjects.Text;
  private caption!: Phaser.GameObjects.Text;
  private progressLabel!: Phaser.GameObjects.Text;
  private progressValue!: Phaser.GameObjects.Text;
  private playLabel!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private setup!: Phaser.GameObjects.Text;
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private enteredAt = 0;
  private titleTop = 0;
  private buttonRect = new Phaser.Geom.Rectangle();
  private controlSize = 96;
  private muteAt = { x: 0, y: 0 };
  private setupRect = new Phaser.Geom.Rectangle();
  private beatRow = { x: 0, y: 0, gap: 0, radius: 0 };
  private pressedAt = -Infinity;
  private pressDirty = false;
  private busy = false;
  private disposed = false;
  private request = 0;
  private readonly ink = VIGNETTES[0]!.ink;
  private readonly paper = 0xf4f0e2;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  public constructor() { super(SceneKey.Menu); }

  protected override build(): void {
    this.disposed = false;
    this.busy = false;
    this.pressedAt = -Infinity;
    // The hammer's idle sway doubles as the title illustration; it never receives a plan.
    this.illustration = new HammerNailVignette(this, true);
    // Sits between the illustration and the type, so the title always has contrast.
    this.scrim = this.add.graphics().setDepth(-5);
    this.plate = this.add.graphics();
    this.button = this.add.graphics();
    this.beats = this.add.graphics();
    this.edition = this.text('RHYTHM IN THE EVERYDAY', 17, 'monospace').setLetterSpacing(2);
    this.headline = this.text('Tiny\nTempo.', 104, 'Georgia, serif').setLineSpacing(-17);
    this.caption = this.text('Little things. Perfect timing.', 23, 'Georgia, serif').setFontStyle('italic');
    const progress = loadProgress();
    const fresh = progress.unlocked === 1;
    this.progressLabel = this.text(`${fresh ? 'BEGIN HERE' : 'PICK UP THE RHYTHM'}  /  ${String(progress.unlocked).padStart(2, '0')}`, 13, 'monospace').setLetterSpacing(2);
    const next = VIGNETTES.find(v => v.id === levelSpec(progress.unlocked).vignette)!;
    this.progressValue = this.text(next.title, 28, 'Georgia, serif');
    this.playLabel = this.text(fresh ? 'Let’s play' : 'Keep playing', 30, 'Georgia, serif').setOrigin(0, 0.5);
    this.mute = this.text(isMuted(this) ? '×' : '♪', 30, 'Georgia, serif').setOrigin(0.5);
    this.setup = this.text('SETUP', 14, 'monospace').setLetterSpacing(2).setOrigin(0.5);
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.enteredAt = performance.now() / 1000;
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }
  private text(value: string, size: number, fontFamily: string): Phaser.GameObjects.Text {
    return this.add.text(0, 0, value, { fontFamily, fontSize: `${size}px`, color: hex(this.ink) });
  }

  protected override layout(): void {
    const { safe, full } = this.viewport;
    this.illustration.layout(this.viewport);
    const s = Math.min(safe.width / 720, safe.height / 1150);
    const left = safe.centerX - 310 * s;
    // A light scrim behind the type dissolves into the illustration's paper.
    const g = this.scrim.clear();
    const fade = safe.top + 410 * s;
    for (let b = 0; b < 16; b++) {
      const t = b / 16;
      g.fillStyle(this.paper, 0.9 * (1 - t) ** 1.5);
      g.fillRect(full.x, full.y + (fade - full.y) * t, full.width, (fade - full.y) / 16 + 1);
    }
    this.edition.setPosition(left, safe.top + 47 * s).setFontSize(Math.max(17 * s, 9 * this.viewport.unitScale));
    this.titleTop = safe.top + 108 * s;
    this.headline.setPosition(left - 5 * s, this.titleTop).setFontSize(108 * s).setLineSpacing(-20 * s);
    this.caption.setPosition(left, safe.top + 362 * s).setFontSize(Math.max(24 * s, 12 * this.viewport.unitScale));
    this.beatRow = { x: left + 5 * s, y: safe.top + 424 * s, gap: 30 * s, radius: 5 * s };
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    this.muteAt = { x: safe.centerX + 283 * s, y: safe.top + 52 * s };
    g.lineStyle(1.5 * s, this.ink, 0.2).strokeCircle(this.muteAt.x, this.muteAt.y, 30 * s);
    this.mute.setPosition(this.muteAt.x, this.muteAt.y).setFontSize(28 * s);
    // A pill rather than a circle, because the label is a word. Same outline weight, and
    // far enough from mute that neither control is hit by mistake.
    const setupWidth = Math.max(124 * s, 68 * this.viewport.unitScale);
    this.setupRect.setTo(this.muteAt.x - 60 * s - setupWidth, this.muteAt.y - this.controlSize / 2, setupWidth, this.controlSize);
    g.lineStyle(1.5 * s, this.ink, 0.2).strokeRoundedRect(
      this.setupRect.x, this.setupRect.centerY - 30 * s, this.setupRect.width, 60 * s, 30 * s);
    this.setup.setPosition(this.setupRect.centerX, this.setupRect.centerY).setFontSize(Math.max(15 * s, 8 * this.viewport.unitScale));
    // The button sits a fixed distance above the bottom edge: thumb reach is absolute, not proportional.
    const height = Math.max(MENU.buttonHeight * s, this.controlSize);
    this.buttonRect.setTo(safe.centerX - MENU.buttonWidth * s / 2, this.buttonTop(s), MENU.buttonWidth * s, height);
    this.drawPlate(s);
    this.drawButton(0, s);
    this.playLabel.setPosition(this.buttonRect.left + 30 * s, this.buttonRect.centerY).setFontSize(30 * s).setColor(hex(this.paper));
  }
  private buttonTop(s: number): number {
    const { safe } = this.viewport;
    const height = Math.max(MENU.buttonHeight * s, Math.max(88 * s, 48 * this.viewport.unitScale));
    return safe.bottom - MENU.buttonFromBottom * s - height / 2;
  }

  /** An unboxed colophon and one thumb-sized action, like the foot of a printed cover. */
  private drawPlate(s: number): void {
    const { safe, full } = this.viewport;
    const w = MENU.buttonWidth * s;
    const x = safe.centerX - w / 2;
    const y = this.buttonRect.top - 116 * s;
    const g = this.plate;
    g.clear();
    g.fillStyle(this.paper).fillRect(full.x, y - 24 * s, full.width, full.bottom - y + 24 * s);
    g.fillStyle(0xcf5134).fillRect(x, y - 25 * s, 54 * s, 4 * s);
    g.lineStyle(1.5 * s, this.ink, 0.18).lineBetween(x + 72 * s, y - 23 * s, x + w, y - 23 * s);
    this.progressLabel.setPosition(x, y + 5 * s).setFontSize(Math.max(17 * s, 9 * this.viewport.unitScale)).setAlpha(0.65);
    this.progressValue.setPosition(x, y + 34 * s).setFontSize(30 * s).setAlpha(1);
  }

  /** A matte face and shallow side wall give the action a restrained physical press. */
  private drawButton(press: number, s: number): void {
    const r = this.buttonRect;
    const radius = Math.min(MENU.radius * s, r.height / 2);
    const sink = press * 5 * s;
    const g = this.button;
    g.clear();
    g.fillStyle(this.ink, 0.2 * (1 - press * 0.6)).fillRoundedRect(r.x + 2 * s, r.y + (9 - press * 4) * s, r.width, r.height, radius);
    g.fillStyle(shade(this.ink, -0.4), 1).fillRoundedRect(r.x, r.y + 6 * s, r.width, r.height, radius);
    g.fillStyle(this.ink, 1).fillRoundedRect(r.x, r.y + sink, r.width, r.height, radius);
    const cx = r.right - 54 * s, cy = r.centerY + sink;
    g.fillStyle(this.paper, 0.12).fillCircle(cx, cy, 30 * s);
    g.lineStyle(2.5 * s, this.paper).lineBetween(cx - 10 * s, cy, cx + 11 * s, cy);
    g.lineBetween(cx + 3 * s, cy - 8 * s, cx + 11 * s, cy).lineBetween(cx + 11 * s, cy, cx + 3 * s, cy + 8 * s);
    this.playLabel.setY(r.centerY + sink);
  }

  public override update(): void {
    const now = performance.now() / 1000;
    this.illustration.update(now);
    const s = Math.min(this.viewport.safe.width / 720, this.viewport.safe.height / 1150);
    const arrival = this.reducedMotion ? 1 : Math.min(1, Math.max(0, (now - this.enteredAt - 0.12) / 0.65));
    this.headline.setY(this.titleTop + (1 - arrival) ** 3 * 30 * s).setAlpha(1 - (1 - arrival) ** 3);
    const press = Math.max(0, 1 - (now - this.pressedAt) / MENU.pressSec);
    if (press > 0 || this.pressDirty) {
      this.drawButton(press, s);
      // One last frame at rest, then stop: the button is otherwise static geometry.
      this.pressDirty = press > 0;
    }
    // Four dots on the game's own pulse: the title says what the game is before the copy does.
    const g = this.beats.clear();
    const beat = this.reducedMotion ? 0 : Math.floor(now * MENU.beatHz) % MENU.dots;
    for (let i = 0; i < MENU.dots; i++) {
      const lit = this.reducedMotion ? i === 0 : i === beat;
      const phase = this.reducedMotion ? 0 : (now * MENU.beatHz) % 1;
      const grow = lit ? 1 + (1 - phase) * 0.5 : 1;
      g.fillStyle(lit ? 0xcf5134 : this.ink, lit ? 1 : 0.18);
      g.fillCircle(this.beatRow.x + i * this.beatRow.gap, this.beatRow.y, this.beatRow.radius * grow);
    }
  }

  private handleTap(tap: Tap): void {
    if (this.curtain.active || this.busy) return;
    if (Math.abs(tap.x - this.muteAt.x) < this.controlSize / 2 && Math.abs(tap.y - this.muteAt.y) < this.controlSize / 2) {
      this.mute.setText(toggleMute(sharedAudio(this)) ? '×' : '♪');
      return;
    }
    if (Phaser.Geom.Rectangle.Contains(this.setupRect, tap.x, tap.y)) {
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
      this.caption.setText('Sound needs another try.').setWordWrapWidth(600 * Math.min(this.viewport.safe.width / 720, this.viewport.safe.height / 1150));
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
