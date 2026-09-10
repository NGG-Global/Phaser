import Phaser from 'phaser';
import { currentAudio, sharedAudio } from '@/audio/sharedAudio';
import { SceneKey } from '@/config/scenes';
import { BaseScene } from '@/core/BaseScene';
import { areaOf } from '@/game/levels';
import { loadProgress } from '@/game/progress';
import { TapInput, type Tap } from '@/input/TapInput';
import { VIGNETTES } from '@/vignettes/registry';
import type { Vignette } from '@/vignettes/Vignette';

const MENU = { buttonWidth: 340, buttonHeight: 96, buttonFromBottom: 190, radius: 48 } as const;

/**
 * Title screen. Owns the first audio gesture: PLAY unlocks the shared AudioEngine and
 * loads the stems before the play scene starts, so play begins on the same tap.
 */
export class MenuScene extends BaseScene {
  private illustration!: Vignette;
  private edition!: Phaser.GameObjects.Text;
  private headline!: Phaser.GameObjects.Text;
  private caption!: Phaser.GameObjects.Text;
  private note!: Phaser.GameObjects.Text;
  private button!: Phaser.GameObjects.Graphics;
  private playLabel!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private taps!: TapInput;
  private buttonRect = new Phaser.Geom.Rectangle();
  private controlSize = 96;
  private busy = false;
  private disposed = false;
  private request = 0;
  private readonly ink = VIGNETTES[0]!.ink;

  public constructor() { super(SceneKey.Menu); }

  protected override build(): void {
    this.disposed = false;
    this.busy = false;
    // The hammer's idle sway doubles as the title illustration; it never receives a plan.
    this.illustration = VIGNETTES[0]!.create(this);
    this.edition = this.text('TINY TEMPO', 17, 'monospace').setLetterSpacing(2);
    this.headline = this.text('Tiny\nTempo.', 104, 'Georgia, serif').setLineSpacing(-17);
    this.caption = this.text('Watch a rhythm. Tap it back.', 23, 'Georgia, serif').setFontStyle('italic');
    const progress = loadProgress();
    this.note = this.text(progress.unlocked === 1 ? 'A NEW ROAD BEGINS' : `NEXT UP   LEVEL ${progress.unlocked}   ·   ${areaOf(progress.unlocked).name.toUpperCase()}`, 16, 'monospace').setLetterSpacing(2).setOrigin(0.5);
    this.button = this.add.graphics();
    this.playLabel = this.text('PLAY', 22, 'monospace').setLetterSpacing(6).setOrigin(0.5);
    this.mute = this.text(currentAudio(this)?.muted ? '×' : '♪', 32, 'Georgia, serif').setOrigin(0.5);
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }
  private text(value: string, size: number, fontFamily: string): Phaser.GameObjects.Text {
    return this.add.text(0, 0, value, { fontFamily, fontSize: `${size}px`, color: `#${this.ink.toString(16).padStart(6, '0')}` });
  }
  protected override layout(): void {
    const { safe } = this.viewport;
    this.illustration.layout(this.viewport);
    const s = Math.min(safe.width / 720, safe.height / 1150);
    const left = safe.centerX - 310 * s;
    this.edition.setPosition(left, safe.top + 47 * s).setFontSize(16 * s);
    this.headline.setPosition(left - 5 * s, safe.top + 135 * s).setFontSize(88 * s).setLineSpacing(-12 * s);
    this.caption.setPosition(left, safe.top + 360 * s).setFontSize(23 * s);
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    this.mute.setPosition(safe.centerX + 283 * s, safe.top + 55 * s).setFontSize(32 * s);
    // The button sits a fixed distance above the bottom edge: thumb reach is absolute, not proportional.
    const height = Math.max(MENU.buttonHeight * s, this.controlSize);
    this.buttonRect.setTo(safe.centerX - MENU.buttonWidth * s / 2, safe.bottom - MENU.buttonFromBottom * s - height / 2, MENU.buttonWidth * s, height);
    this.button.clear();
    this.button.fillStyle(this.ink, 0.12).fillRoundedRect(this.buttonRect.x + 4 * s, this.buttonRect.y + 6 * s, this.buttonRect.width, this.buttonRect.height, MENU.radius * s);
    this.button.fillStyle(this.ink).fillRoundedRect(this.buttonRect.x, this.buttonRect.y, this.buttonRect.width, this.buttonRect.height, MENU.radius * s);
    this.playLabel.setPosition(this.buttonRect.centerX, this.buttonRect.centerY).setFontSize(22 * s).setColor('#eee8d8');
    this.note.setPosition(safe.centerX, this.buttonRect.bottom + 46 * s).setFontSize(15 * s);
  }
  public override update(): void { this.illustration.update(performance.now() / 1000); }

  private handleTap(tap: Tap): void {
    if (Math.abs(tap.x - this.mute.x) < this.controlSize / 2 && Math.abs(tap.y - this.mute.y) < this.controlSize / 2) {
      const audio = sharedAudio(this);
      audio.toggleMute();
      this.mute.setText(audio.muted ? '×' : '♪');
      return;
    }
    if (Phaser.Geom.Rectangle.Contains(this.buttonRect, tap.x, tap.y)) void this.play();
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
