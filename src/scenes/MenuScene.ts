import Phaser from 'phaser';
import { isMuted, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { SceneKey } from '@/config/scenes';
import { BaseScene } from '@/core/BaseScene';
import { areaOf, levelSpec, starsFor } from '@/game/levels';
import { loadProgress } from '@/game/progress';
import { TapInput, type Tap } from '@/input/TapInput';
import { hex, shade } from '@/ui/colour';
import { VIGNETTES } from '@/vignettes/registry';
import type { Vignette } from '@/vignettes/Vignette';

const MENU = {
  buttonWidth: 366, buttonHeight: 104, buttonFromBottom: 152, radius: 52,
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
  private buttonRect = new Phaser.Geom.Rectangle();
  private controlSize = 96;
  private muteAt = { x: 0, y: 0 };
  private setupAt = { x: 0, y: 0 };
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
    this.illustration = VIGNETTES[0]!.create(this);
    // Sits between the illustration and the type, so the title always has contrast.
    this.scrim = this.add.graphics().setDepth(-5);
    this.plate = this.add.graphics();
    this.button = this.add.graphics();
    this.beats = this.add.graphics();
    this.edition = this.text('TINY TEMPO', 17, 'monospace').setLetterSpacing(2);
    this.headline = this.text('Tiny\nTempo.', 104, 'Georgia, serif').setLineSpacing(-17);
    this.caption = this.text('Watch a rhythm. Tap it back.', 23, 'Georgia, serif').setFontStyle('italic');
    const progress = loadProgress();
    const stars = Object.entries(progress.best).reduce((sum, [level, best]) => sum + starsFor(best, levelSpec(Number(level))), 0);
    const fresh = progress.unlocked === 1;
    this.progressLabel = this.text(fresh ? 'A NEW ROAD' : 'NEXT UP', 13, 'monospace').setLetterSpacing(2);
    this.progressValue = this.text(
      fresh ? 'Level 1 · Grass' : `Level ${progress.unlocked} · ${areaOf(progress.unlocked).name}${stars > 0 ? `  ·  ${stars}★` : ''}`,
      22, 'Georgia, serif');
    this.playLabel = this.text('PLAY', 22, 'monospace').setLetterSpacing(6).setOrigin(0.5);
    this.mute = this.text(isMuted(this) ? '×' : '♪', 30, 'Georgia, serif').setOrigin(0.5);
    this.setup = this.text('SETUP', 14, 'monospace').setLetterSpacing(2).setOrigin(0.5);
    this.taps = new TapInput(this, tap => this.handleTap(tap));
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
    // Scrim: opaque behind the type, gone by the illustration's middle, and back at the
    // foot so the button reads against a calm ground.
    const g = this.scrim.clear();
    const fade = safe.top + 470 * s;
    for (let b = 0; b < 16; b++) {
      const t = b / 16;
      g.fillStyle(this.paper, 0.9 * (1 - t) ** 1.5);
      g.fillRect(full.x, full.y + (fade - full.y) * t, full.width, (fade - full.y) / 16 + 1);
    }
    const foot = this.buttonTop(s) - 130 * s;
    for (let b = 0; b < 12; b++) {
      const t = b / 12;
      g.fillStyle(this.paper, 0.82 * t ** 1.4);
      g.fillRect(full.x, foot + (full.bottom - foot) * t, full.width, (full.bottom - foot) / 12 + 1);
    }
    this.edition.setPosition(left, safe.top + 44 * s).setFontSize(15 * s);
    g.lineStyle(1.5 * s, this.ink, 0.28).lineBetween(left, safe.top + 74 * s, left + 168 * s, safe.top + 74 * s);
    this.headline.setPosition(left - 5 * s, safe.top + 118 * s).setFontSize(88 * s).setLineSpacing(-12 * s);
    this.caption.setPosition(left, safe.top + 344 * s).setFontSize(23 * s);
    this.beatRow = { x: left + 5 * s, y: safe.top + 400 * s, gap: 26 * s, radius: 5.5 * s };
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    this.muteAt = { x: safe.centerX + 283 * s, y: safe.top + 52 * s };
    this.setupAt = { x: safe.centerX + 188 * s, y: this.muteAt.y };
    const chipR = 27 * s;
    // Two chips in the same language the map's HUD uses, so a control reads as a control.
    const chip = (cx: number, cy: number, radius: number) => {
      g.fillStyle(this.ink, 0.1).fillCircle(cx + 1 * s, cy + 3 * s, radius);
      g.fillStyle(shade(this.paper, -0.03), 1).fillCircle(cx, cy, radius);
      g.lineStyle(1.5 * s, this.ink, 0.24).strokeCircle(cx, cy, radius);
    };
    chip(this.setupAt.x, this.setupAt.y, chipR * 1.28);
    chip(this.muteAt.x, this.muteAt.y, chipR);
    this.mute.setPosition(this.muteAt.x, this.muteAt.y).setFontSize(28 * s);
    this.setup.setPosition(this.setupAt.x, this.setupAt.y).setFontSize(13 * s);
    // The button sits a fixed distance above the bottom edge: thumb reach is absolute, not proportional.
    const height = Math.max(MENU.buttonHeight * s, this.controlSize);
    this.buttonRect.setTo(safe.centerX - MENU.buttonWidth * s / 2, this.buttonTop(s), MENU.buttonWidth * s, height);
    this.drawPlate(s);
    this.drawButton(0, s);
    this.playLabel.setPosition(this.buttonRect.centerX, this.buttonRect.centerY).setFontSize(22 * s).setColor(hex(this.paper));
  }
  private buttonTop(s: number): number {
    const { safe } = this.viewport;
    const height = Math.max(MENU.buttonHeight * s, Math.max(88 * s, 48 * this.viewport.unitScale));
    return safe.bottom - MENU.buttonFromBottom * s - height / 2;
  }

  /** Progress card, in the same plate language the map uses for its area signs. */
  private drawPlate(s: number): void {
    const { safe } = this.viewport;
    const progress = loadProgress();
    const accent = areaOf(progress.unlocked).area;
    const w = MENU.buttonWidth * s;
    const h = 84 * s;
    const x = safe.centerX - w / 2;
    const y = this.buttonRect.top - 34 * s - h;
    const g = this.plate;
    g.clear();
    g.fillStyle(this.ink, 0.14).fillRoundedRect(x + 2 * s, y + 6 * s, w, h, 20 * s);
    g.fillStyle(shade(this.paper, 0.02), 0.97).fillRoundedRect(x, y, w, h, 20 * s);
    g.lineStyle(2 * s, this.ink, 0.2).strokeRoundedRect(x, y, w, h, 20 * s);
    // A swatch of the area the player is heading into, so the card previews the map.
    g.fillStyle(accent.ground, 1).fillRoundedRect(x + 16 * s, y + 16 * s, 52 * s, h - 32 * s, 12 * s);
    g.fillStyle(accent.road, 1).fillRect(x + 16 * s, y + h / 2 - 5 * s, 52 * s, 10 * s);
    g.lineStyle(1.5 * s, this.ink, 0.22).strokeRoundedRect(x + 16 * s, y + 16 * s, 52 * s, h - 32 * s, 12 * s);
    this.progressLabel.setPosition(x + 84 * s, y + 20 * s).setFontSize(12 * s).setAlpha(0.6);
    this.progressValue.setPosition(x + 84 * s, y + 40 * s).setFontSize(21 * s).setAlpha(1);
  }

  /** Shadow, side wall, face and sheen: the same raised language as the map's nodes. */
  private drawButton(press: number, s: number): void {
    const r = this.buttonRect;
    const radius = Math.min(MENU.radius * s, r.height / 2);
    const sink = press * 5 * s;
    const g = this.button;
    g.clear();
    g.fillStyle(this.ink, 0.2 * (1 - press * 0.6)).fillRoundedRect(r.x + 2 * s, r.y + (9 - press * 4) * s, r.width, r.height, radius);
    g.fillStyle(shade(this.ink, -0.4), 1).fillRoundedRect(r.x, r.y + 6 * s, r.width, r.height, radius);
    g.fillStyle(this.ink, 1).fillRoundedRect(r.x, r.y + sink, r.width, r.height, radius);
    g.fillStyle(0xffffff, 0.075 - press * 0.04).fillRoundedRect(r.x + 10 * s, r.y + sink + 5 * s, r.width - 20 * s, r.height * 0.42, radius);
    this.playLabel.setY(r.centerY + sink);
  }

  public override update(): void {
    const now = performance.now() / 1000;
    this.illustration.update(now);
    const s = Math.min(this.viewport.safe.width / 720, this.viewport.safe.height / 1150);
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
      g.fillStyle(this.ink, lit ? 0.85 : 0.22);
      g.fillCircle(this.beatRow.x + i * this.beatRow.gap, this.beatRow.y, this.beatRow.radius * grow);
    }
  }

  private handleTap(tap: Tap): void {
    if (Math.abs(tap.x - this.muteAt.x) < this.controlSize / 2 && Math.abs(tap.y - this.muteAt.y) < this.controlSize / 2) {
      this.mute.setText(toggleMute(sharedAudio(this)) ? '×' : '♪');
      return;
    }
    if (Math.abs(tap.x - this.setupAt.x) < this.controlSize / 2 && Math.abs(tap.y - this.setupAt.y) < this.controlSize / 2) {
      this.scene.start(SceneKey.Settings, { from: SceneKey.Menu });
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
    this.playLabel.setText('ONE MOMENT');
    try {
      const audio = sharedAudio(this);
      await audio.unlock();
      if (this.disposed || request !== this.request) return;
      this.playLabel.setText('LOADING');
      await audio.music.load();
      if (this.disposed || request !== this.request) return;
      this.scene.start(SceneKey.Map);
    } catch (error) {
      if (this.disposed || request !== this.request) return;
      this.busy = false;
      this.playLabel.setText('PLAY');
      this.caption.setText(error instanceof Error ? error.message : 'Sound could not start.');
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
