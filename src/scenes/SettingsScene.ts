import Phaser from 'phaser';
import { applyCalibration, currentAudio, isMuted, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { MUSIC } from '@/config/music';
import { SceneKey } from '@/config/scenes';
import { BaseScene } from '@/core/BaseScene';
import { areaOf } from '@/game/levels';
import { clearProgress, loadProgress } from '@/game/progress';
import { calibrationFrom, CALIBRATION_TAPS, loadSettings } from '@/game/settings';
import { TapInput, type Tap } from '@/input/TapInput';
import { hex, shade } from '@/ui/colour';
import { SceneCurtain } from '@/ui/SceneCurtain';

const PANEL = {
  ink: 0x243e35, paper: 0xf4f0e2,
  cardHeight: 152, cardGap: 20, radius: 22, pressSec: 0.14,
  /** Four beats of count-in before a tap counts, then room for twice the taps asked for. */
  leadBeats: 4, measureBeats: 20,
} as const;

type Phase = 'idle' | 'counting' | 'measured' | 'failed';
interface Button { readonly rect: Phaser.Geom.Rectangle; readonly label: Phaser.GameObjects.Text }

/**
 * Player settings: output-latency calibration, mute, and the one control that can
 * destroy saved progress.
 *
 * Calibration measures a *residual* against the offset already in force, so running it
 * twice refines the first result instead of starting over. The measurement is the median
 * of the taps that land, never the mean — one fumbled tap in eight would drag a mean by an
 * eighth of its own error, and the player calibrating is the likeliest to fumble one.
 */
export class SettingsScene extends BaseScene {
  private plates!: Phaser.GameObjects.Graphics;
  private beats!: Phaser.GameObjects.Graphics;
  private eyebrow!: Phaser.GameObjects.Text;
  private headline!: Phaser.GameObjects.Text;
  private offsetLabel!: Phaser.GameObjects.Text;
  private offsetValue!: Phaser.GameObjects.Text;
  private offsetNote!: Phaser.GameObjects.Text;
  private soundLabel!: Phaser.GameObjects.Text;
  private soundValue!: Phaser.GameObjects.Text;
  private progressLabel!: Phaser.GameObjects.Text;
  private progressValue!: Phaser.GameObjects.Text;
  private footnote!: Phaser.GameObjects.Text;
  private buttons: Record<'calibrate' | 'sound' | 'reset' | 'done', Button> = null!;
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private uiScale = 1;
  private phase: Phase = 'idle';
  private calibrationMs = 0;
  private measuredMs: number | null = null;
  private residuals: number[] = [];
  private origin = 0;
  private period = 60 / MUSIC.sourceBpm;
  private pressedAt = -Infinity;
  private pressed: Button | null = null;
  private resetArmed = false;
  private from: string = SceneKey.Menu;

  public constructor() { super(SceneKey.Settings); }

  protected override build(): void {
    const data = this.sys.settings.data as { from?: string } | undefined;
    this.from = data?.from === SceneKey.Map ? SceneKey.Map : SceneKey.Menu;
    this.phase = 'idle';
    this.resetArmed = false;
    this.residuals = [];
    this.measuredMs = null;
    this.calibrationMs = loadSettings().calibrationMs;
    this.cameras.main.setBackgroundColor(hex(PANEL.paper));
    this.plates = this.add.graphics();
    this.beats = this.add.graphics().setDepth(2);
    this.eyebrow = this.text('TINY TEMPO', 16, 'monospace').setLetterSpacing(2);
    this.headline = this.text('Settings.', 72, 'Georgia, serif');
    this.offsetLabel = this.text('AUDIO OFFSET', 13, 'monospace').setLetterSpacing(2).setAlpha(0.6);
    this.offsetValue = this.text('', 30, 'Georgia, serif');
    this.offsetNote = this.text('', 17, 'Georgia, serif').setFontStyle('italic').setAlpha(0.75);
    this.soundLabel = this.text('SOUND', 13, 'monospace').setLetterSpacing(2).setAlpha(0.6);
    this.soundValue = this.text('', 30, 'Georgia, serif');
    this.progressLabel = this.text('PROGRESS', 13, 'monospace').setLetterSpacing(2).setAlpha(0.6);
    this.progressValue = this.text('', 30, 'Georgia, serif');
    this.footnote = this.text(
      'Calibration matters most on Bluetooth headphones and speakers, where Android can '
      + 'delay output well past the timing window. Wired output rarely needs it.',
      18, 'Georgia, serif').setFontStyle('italic').setAlpha(0.62);
    this.buttons = {
      calibrate: this.button('CALIBRATE'),
      sound: this.button(''),
      reset: this.button('RESET'),
      done: this.button('DONE'),
    };
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.refreshCopy();
  }
  private text(value: string, size: number, fontFamily: string): Phaser.GameObjects.Text {
    return this.add.text(0, 0, value, { fontFamily, fontSize: `${size}px`, color: hex(PANEL.ink) }).setDepth(1);
  }
  private button(label: string): Button {
    return { rect: new Phaser.Geom.Rectangle(), label: this.text(label, 16, 'monospace').setLetterSpacing(3).setOrigin(0.5).setDepth(3) };
  }

  protected override layout(): void {
    const { safe } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1150);
    this.uiScale = s;
    const left = safe.centerX - 322 * s;
    const width = 644 * s;
    this.eyebrow.setPosition(left, safe.top + 40 * s).setFontSize(15 * s);
    this.headline.setPosition(left - 4 * s, safe.top + 74 * s).setFontSize(66 * s);
    const top = safe.top + 184 * s;
    const card = PANEL.cardHeight * s;
    const gap = PANEL.cardGap * s;
    // Buttons keep a full touch target even where the card is short.
    const control = Math.max(88 * s, 48 * this.viewport.unitScale);
    const g = this.plates.clear();
    const place = (index: number, label: Phaser.GameObjects.Text, value: Phaser.GameObjects.Text, button: Button, buttonWidth: number) => {
      const y = top + index * (card + gap);
      this.plate(g, left, y, width, card, s);
      label.setPosition(left + 26 * s, y + 24 * s).setFontSize(12 * s);
      value.setPosition(left + 26 * s, y + 48 * s).setFontSize(28 * s);
      const w = Math.max(buttonWidth * s, control);
      button.rect.setTo(left + width - 26 * s - w, y + card - 24 * s - control, w, control);
      button.label.setPosition(button.rect.centerX, button.rect.centerY).setFontSize(15 * s);
    };
    place(0, this.offsetLabel, this.offsetValue, this.buttons.calibrate, 210);
    this.offsetNote.setPosition(left + 26 * s, top + 92 * s).setFontSize(16 * s).setWordWrapWidth(width - 290 * s);
    place(1, this.soundLabel, this.soundValue, this.buttons.sound, 150);
    place(2, this.progressLabel, this.progressValue, this.buttons.reset, 150);
    this.footnote.setPosition(left + 4 * s, top + 3 * (card + gap) + 16 * s).setFontSize(17 * s).setWordWrapWidth(width - 8 * s);
    const done = this.buttons.done;
    const doneHeight = Math.max(96 * s, control);
    done.rect.setTo(safe.centerX - 183 * s, safe.bottom - 132 * s - doneHeight, 366 * s, doneHeight);
    done.label.setPosition(done.rect.centerX, done.rect.centerY).setFontSize(20 * s).setColor(hex(PANEL.paper));
    this.drawButtons(0);
  }

  /** The raised plate the map's area signs and the menu's progress card already use. */
  private plate(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, s: number): void {
    g.fillStyle(PANEL.ink, 0.13).fillRoundedRect(x + 2 * s, y + 6 * s, w, h, PANEL.radius * s);
    g.fillStyle(shade(PANEL.paper, 0.02), 0.97).fillRoundedRect(x, y, w, h, PANEL.radius * s);
    g.lineStyle(2 * s, PANEL.ink, 0.2).strokeRoundedRect(x, y, w, h, PANEL.radius * s);
  }

  private drawButtons(press: number): void {
    const s = this.uiScale;
    const g = this.plates;
    for (const [name, button] of Object.entries(this.buttons)) {
      const solid = name === 'done';
      const sink = (this.pressed === button ? press : 0) * 4 * s;
      const r = button.rect;
      const radius = Math.min(r.height / 2, 30 * s);
      g.fillStyle(PANEL.ink, 0.18).fillRoundedRect(r.x + 1 * s, r.y + 6 * s, r.width, r.height, radius);
      g.fillStyle(shade(PANEL.ink, solid ? -0.4 : 0.62), 1).fillRoundedRect(r.x, r.y + 4 * s, r.width, r.height, radius);
      g.fillStyle(solid ? PANEL.ink : shade(PANEL.paper, -0.04), 1).fillRoundedRect(r.x, r.y + sink, r.width, r.height, radius);
      if (!solid) g.lineStyle(1.5 * s, PANEL.ink, 0.28).strokeRoundedRect(r.x, r.y + sink, r.width, r.height, radius);
      button.label.setY(r.centerY + sink);
    }
  }

  private refreshCopy(): void {
    const muted = isMuted(this);
    const progress = loadProgress();
    const shown = this.phase === 'measured' && this.measuredMs !== null ? this.measuredMs : this.calibrationMs;
    // A typographic minus, to match the rest of the game's type rather than a hyphen.
    this.offsetValue.setText(`${shown > 0 ? '+' : ''}${String(shown).replace('-', '\u2212')} ms`);
    this.offsetNote.setText(
      this.phase === 'counting' ? `Tap on the beat.  ${this.residuals.length} of ${CALIBRATION_TAPS}`
      : this.phase === 'measured' ? 'Measured. Keep it, or run it again.'
      : this.phase === 'failed' ? 'Too few taps landed near a beat. Try again.'
      : 'Taps are judged this much earlier, to match output your device delays.');
    this.buttons.calibrate.label.setText(this.phase === 'counting' ? 'STOP' : this.phase === 'measured' ? 'KEEP IT' : 'CALIBRATE');
    this.soundValue.setText(muted ? 'Muted' : 'On');
    this.buttons.sound.label.setText(muted ? 'UNMUTE' : 'MUTE');
    this.progressValue.setText(progress.unlocked === 1 ? 'A new road' : `Level ${progress.unlocked} · ${areaOf(progress.unlocked).name}`);
    this.buttons.reset.label.setText(this.resetArmed ? 'TAP AGAIN' : 'RESET');
  }

  public override update(): void {
    const now = performance.now() / 1000;
    const press = Math.max(0, 1 - (now - this.pressedAt) / PANEL.pressSec);
    this.plates.clear();
    const { safe } = this.viewport;
    const s = this.uiScale;
    const left = safe.centerX - 322 * s;
    const top = safe.top + 184 * s;
    for (let i = 0; i < 3; i++) this.plate(this.plates, left, top + i * (PANEL.cardHeight + PANEL.cardGap) * s, 644 * s, PANEL.cardHeight * s, s);
    this.drawButtons(press);
    if (press === 0) this.pressed = null;
    this.drawBeats();
  }

  /** Four dots on the count-in's own pulse, so the player can see the beat before hearing it. */
  private drawBeats(): void {
    const g = this.beats.clear();
    if (this.phase !== 'counting') return;
    const audio = currentAudio(this);
    if (!audio) return;
    const s = this.uiScale;
    const { safe } = this.viewport;
    const elapsed = (audio.context.currentTime - this.origin) / this.period;
    const beat = Math.floor(Math.max(0, elapsed));
    const phase = Math.max(0, elapsed) % 1;
    const x = safe.centerX - 322 * s + 26 * s;
    const y = safe.top + 184 * s + 124 * s;
    for (let i = 0; i < 4; i++) {
      const lit = i === beat % 4;
      g.fillStyle(PANEL.ink, lit ? 0.85 : 0.2);
      g.fillCircle(x + i * 26 * s, y, 5.5 * s * (lit ? 1 + (1 - phase) * 0.5 : 1));
    }
    if (elapsed > PANEL.leadBeats + PANEL.measureBeats) this.finishCalibration();
  }

  private handleTap(tap: Tap): void {
    if (this.curtain.active) return;
    if (this.phase === 'counting' && !Phaser.Geom.Rectangle.Contains(this.buttons.calibrate.rect, tap.x, tap.y)) {
      this.recordTap(tap);
      return;
    }
    for (const [name, button] of Object.entries(this.buttons)) {
      if (!Phaser.Geom.Rectangle.Contains(button.rect, tap.x, tap.y)) continue;
      this.pressedAt = performance.now() / 1000;
      this.pressed = button;
      if (name !== 'reset') this.resetArmed = false;
      if (name === 'calibrate') void this.calibrateTapped();
      else if (name === 'sound') { const audio = sharedAudio(this); toggleMute(audio); this.refreshCopy(); }
      else if (name === 'reset') this.resetTapped();
      else this.curtain.cover(() => this.scene.start(this.from));
      return;
    }
    this.resetArmed = false;
    this.refreshCopy();
  }

  private async calibrateTapped(): Promise<void> {
    if (this.phase === 'counting') { this.finishCalibration(); return; }
    if (this.phase === 'measured' && this.measuredMs !== null) {
      this.calibrationMs = this.measuredMs;
      applyCalibration(sharedAudio(this), this.measuredMs);
      this.phase = 'idle';
      this.measuredMs = null;
      this.refreshCopy();
      return;
    }
    const audio = sharedAudio(this);
    try {
      // This tap is the gesture, so a player who opened settings before ever pressing PLAY
      // can still calibrate.
      await audio.unlock();
    } catch {
      this.phase = 'failed';
      this.offsetNote.setText('Sound is blocked on this device. Tap again to retry.');
      return;
    }
    audio.clock.refresh();
    this.residuals = [];
    this.phase = 'counting';
    this.origin = audio.context.currentTime + 0.6;
    for (let beat = 0; beat < PANEL.leadBeats + PANEL.measureBeats; beat++) {
      audio.play(this.origin + beat * this.period, beat % 4 === 0 ? 'ready' : 'count');
    }
    this.refreshCopy();
  }

  private recordTap(tap: Tap): void {
    const audio = currentAudio(this);
    if (!audio) return;
    audio.clock.refresh();
    const at = audio.clock.input(tap.timestamp);
    const beat = Math.round((at - this.origin) / this.period);
    // Ignore the count-in, anything past the last scheduled beat, and a tap nearer the gap
    // between beats than to either of them: none of those says anything about latency.
    if (beat < PANEL.leadBeats || beat >= PANEL.leadBeats + PANEL.measureBeats) return;
    const residual = (at - (this.origin + beat * this.period)) * 1000;
    if (Math.abs(residual) >= this.period * 500 * 0.8) return;
    this.residuals.push(residual);
    if (this.residuals.length >= CALIBRATION_TAPS) this.finishCalibration();
    else this.refreshCopy();
  }

  private finishCalibration(): void {
    currentAudio(this)?.cancel();
    const measured = calibrationFrom(this.calibrationMs, this.residuals);
    this.measuredMs = measured;
    this.phase = measured === null ? 'failed' : 'measured';
    this.refreshCopy();
  }

  /** Two taps, because there is no undo: the second one destroys every cleared level. */
  private resetTapped(): void {
    if (!this.resetArmed) { this.resetArmed = true; this.refreshCopy(); return; }
    this.resetArmed = false;
    const cleared = clearProgress();
    this.refreshCopy();
    if (!cleared) this.progressValue.setText('This device would not clear it.');
  }

  private shutdown(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    currentAudio(this)?.cancel();
    this.taps.dispose();
  }
}
