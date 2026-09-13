import Phaser from 'phaser';
import { applyCalibration, currentAudio, isMuted, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { MUSIC } from '@/config/music';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { reducedMotion } from '@/core/motionPreference';
import { areaOf } from '@/game/levels';
import { clearProgress, loadProgress } from '@/game/progress';
import { calibrationFrom, CALIBRATION_TAPS, loadSettings } from '@/game/settings';
import { TapInput, type Tap } from '@/input/TapInput';
import { MaterialKey } from '@/textures/materials';
import { Backdrop } from '@/ui/backdrop';
import { shade } from '@/ui/colour';
import { faces } from '@/ui/light';
import { drawPanel, placeSurface, surface } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { spring } from '@/ui/spring';
import { body, display, label, resize } from '@/ui/type';

const PANEL = {
  cardHeight: 156, cardGap: 22, pressSec: 0.42,
  /** Four beats of count-in before a tap counts, then room for twice the taps asked for. */
  leadBeats: 4, measureBeats: 20,
} as const;

/** The few colours the scene owns; the paper is the game's clear colour. */
const LOOK = { ink: PALETTE.ink, card: 0xf6ead0, button: 0xfff4dc, done: PALETTE.coral, cream: 0xfff4dc, sun: 0xdfc37f } as const;

type Phase = 'idle' | 'counting' | 'measured' | 'failed';
interface Button { readonly rect: Phaser.Geom.Rectangle; readonly label: Phaser.GameObjects.Text; readonly hero: boolean }

/**
 * Player settings: output-latency calibration, mute, and the one control that can
 * destroy saved progress.
 *
 * Calibration measures a *residual* against the offset already in force, so running it
 * twice refines the first result instead of starting over. The measurement is the median
 * of the taps that land, never the mean — one fumbled tap in eight would drag a mean by an
 * eighth of its own error, and the player calibrating is the likeliest to fumble one.
 *
 * The cards bake once in `layout()`; only a live press and the count-in beads redraw.
 */
export class SettingsScene extends BaseScene {
  private backdrop!: Backdrop;
  private plates!: Phaser.GameObjects.Graphics;
  private controls!: Phaser.GameObjects.Graphics;
  private beats!: Phaser.GameObjects.Graphics;
  private surfaces: Phaser.GameObjects.TileSprite[] = [];
  private cards: Phaser.Geom.Rectangle[] = [];
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
  private beadRow = { x: 0, y: 0, gap: 0, radius: 0 };
  private phase: Phase = 'idle';
  private calibrationMs = 0;
  private measuredMs: number | null = null;
  private residuals: number[] = [];
  private origin = 0;
  private period = 60 / MUSIC.sourceBpm;
  private pressedAt = -Infinity;
  private pressed: Button | null = null;
  private pressDirty = false;
  private beadsShown = false;
  private resetArmed = false;
  private from: string = SceneKey.Menu;
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor() { super(SceneKey.Settings); }

  protected override build(): void {
    const data = this.sys.settings.data as { from?: string } | undefined;
    this.from = data?.from === SceneKey.Map ? SceneKey.Map : SceneKey.Menu;
    this.phase = 'idle';
    this.resetArmed = false;
    this.residuals = [];
    this.measuredMs = null;
    this.pressedAt = -Infinity;
    this.pressed = null;
    this.calibrationMs = loadSettings().calibrationMs;
    this.backdrop = new Backdrop(this, PALETTE.paper, LOOK.sun, { glowAt: { x: 0.3, y: 0.2 }, glowAlpha: 0.6 });
    this.plates = this.add.graphics();
    this.surfaces = [0, 1, 2].map(() => surface(this, MaterialKey.parchment, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, LOOK.card, 0.45));
    this.cards = [0, 1, 2].map(() => new Phaser.Geom.Rectangle());
    this.controls = this.add.graphics().setDepth(2);
    this.beats = this.add.graphics().setDepth(2);
    this.eyebrow = label(this, 'Tiny Tempo', { size: 15, colour: LOOK.ink }).setDepth(1).setAlpha(0.7);
    this.headline = display(this, 'Settings', { size: 66, colour: LOOK.ink }).setDepth(1);
    this.offsetLabel = label(this, 'Audio offset', { size: 12, colour: LOOK.ink }).setDepth(1).setAlpha(0.6);
    this.offsetValue = display(this, '', { size: 28, colour: LOOK.ink }).setDepth(1);
    this.offsetNote = body(this, '', { size: 16, colour: LOOK.ink }).setDepth(1).setAlpha(0.8);
    this.soundLabel = label(this, 'Sound', { size: 12, colour: LOOK.ink }).setDepth(1).setAlpha(0.6);
    this.soundValue = display(this, '', { size: 28, colour: LOOK.ink }).setDepth(1);
    this.progressLabel = label(this, 'Progress', { size: 12, colour: LOOK.ink }).setDepth(1).setAlpha(0.6);
    this.progressValue = display(this, '', { size: 28, colour: LOOK.ink }).setDepth(1);
    this.footnote = body(this,
      'Calibration matters most on Bluetooth headphones and speakers, where Android can '
      + 'delay output well past the timing window. Wired output rarely needs it.',
      { size: 17, colour: LOOK.ink }).setDepth(1).setAlpha(0.7);
    this.buttons = {
      calibrate: this.button('Calibrate', false),
      sound: this.button('', false),
      reset: this.button('Reset', false),
      done: this.button('Done', true),
    };
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.curtain = new SceneCurtain(this);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.curtain.reveal());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.refreshCopy();
  }
  private button(caption: string, hero: boolean): Button {
    const text = hero
      ? display(this, caption, { size: 30, colour: LOOK.cream }).setOrigin(0.5).setDepth(3)
      : label(this, caption, { size: 15, colour: LOOK.ink }).setOrigin(0.5).setDepth(3);
    return { rect: new Phaser.Geom.Rectangle(), label: text, hero };
  }

  protected override layout(): void {
    const { safe } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1150);
    this.uiScale = s;
    this.backdrop.layout(this.viewport);
    const left = safe.centerX - 322 * s;
    const width = 644 * s;
    this.eyebrow.setPosition(left, safe.top + 40 * s).setFontSize(Math.max(15 * s, 8 * this.viewport.unitScale));
    resize(this.headline, 66 * s, LOOK.ink);
    this.headline.setPosition(left - 2 * s, safe.top + 62 * s);
    const top = safe.top + 184 * s;
    const card = PANEL.cardHeight * s;
    const gap = PANEL.cardGap * s;
    // Buttons keep a full touch target even where the card is short.
    const control = Math.max(88 * s, 48 * this.viewport.unitScale);
    const g = this.plates.clear();
    const place = (index: number, caption: Phaser.GameObjects.Text, value: Phaser.GameObjects.Text, button: Button, buttonWidth: number) => {
      const rect = this.cards[index]!.setTo(left, top + index * (card + gap), width, card);
      drawPanel(g, rect, s, { fill: LOOK.card, depth: 8 });
      placeSurface(this.surfaces[index]!, rect, s);
      caption.setPosition(left + 26 * s, rect.y + 22 * s).setFontSize(Math.max(12 * s, 8 * this.viewport.unitScale));
      resize(value, 28 * s, LOOK.ink);
      value.setPosition(left + 26 * s, rect.y + 44 * s);
      const w = Math.max(buttonWidth * s, control);
      button.rect.setTo(left + width - 26 * s - w, rect.y + card - 26 * s - control, w, control);
    };
    place(0, this.offsetLabel, this.offsetValue, this.buttons.calibrate, 210);
    this.offsetNote.setFontSize(Math.max(16 * s, 10 * this.viewport.unitScale)).setPosition(left + 26 * s, top + 92 * s).setWordWrapWidth(width - 290 * s);
    this.beadRow = { x: left + 26 * s + 7 * s, y: top + 128 * s, gap: 26 * s, radius: 6 * s };
    place(1, this.soundLabel, this.soundValue, this.buttons.sound, 150);
    place(2, this.progressLabel, this.progressValue, this.buttons.reset, 150);
    this.footnote.setFontSize(Math.max(17 * s, 11 * this.viewport.unitScale)).setPosition(left + 4 * s, top + 3 * (card + gap) + 16 * s).setWordWrapWidth(width - 8 * s);
    const done = this.buttons.done;
    const doneHeight = Math.max(96 * s, control);
    done.rect.setTo(safe.centerX - 200 * s, safe.bottom - 132 * s - doneHeight, 400 * s, doneHeight);
    this.drawButtons(0);
    this.pressDirty = true;
  }

  /** Each control is a block on its card; the one that leaves the screen is the coral hero. */
  private drawButtons(press: number): void {
    const s = this.uiScale;
    const g = this.controls.clear();
    for (const button of Object.values(this.buttons)) {
      const p = this.pressed === button ? press : 0;
      const depth = button.hero ? 14 : 8;
      drawPanel(g, button.rect, s, { fill: button.hero ? LOOK.done : LOOK.button, depth, press: p, hero: button.hero, radius: Math.min(button.rect.height / 2, STYLE.current.radius) });
      const size = button.hero ? 30 * s : Math.max(15 * s, 9 * this.viewport.unitScale);
      if (button.hero) resize(button.label, size, LOOK.cream); else button.label.setFontSize(size);
      button.label.setPosition(button.rect.centerX, button.rect.centerY + depth * s * p * 0.8);
    }
  }

  private refreshCopy(): void {
    const muted = isMuted(this);
    const progress = loadProgress();
    const shown = this.phase === 'measured' && this.measuredMs !== null ? this.measuredMs : this.calibrationMs;
    // A typographic minus, to match the rest of the game's type rather than a hyphen.
    this.offsetValue.setText(`${shown > 0 ? '+' : ''}${String(shown).replace('-', '−')} ms`);
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
    // A press sinks the block and springs it back; the buttons redraw only while that runs.
    const press = this.pressedAt > -Infinity ? Math.max(0, 1 - spring((now - this.pressedAt) / PANEL.pressSec, 5, 2)) : 0;
    if (press > 0.001 || this.pressDirty) {
      this.drawButtons(press);
      this.pressDirty = press > 0.001;
      if (!this.pressDirty) this.pressed = null;
    }
    this.drawBeats();
  }

  /** Four beads on the count-in's own pulse, so the player can see the beat before hearing it. */
  private drawBeats(): void {
    if (this.phase !== 'counting') {
      if (this.beadsShown) { this.beats.clear(); this.beadsShown = false; }
      return;
    }
    const audio = currentAudio(this);
    if (!audio) return;
    const g = this.beats.clear();
    this.beadsShown = true;
    const s = this.uiScale;
    const elapsed = (audio.context.currentTime - this.origin) / this.period;
    const beat = Math.floor(Math.max(0, elapsed));
    const phase = Math.max(0, elapsed) % 1;
    const still = this.reducedMotion;
    for (let i = 0; i < 4; i++) {
      const lit = i === beat % 4;
      const grow = lit && !still ? 1 + (1 - phase) ** 2 * 0.7 * STYLE.current.exaggeration : 1;
      const f = faces(lit ? PALETTE.coral : shade(LOOK.card, -0.3));
      const x = this.beadRow.x + i * this.beadRow.gap, r = this.beadRow.radius * grow;
      g.fillStyle(f.edge, 1).fillCircle(x, this.beadRow.y + 2.5 * s, r);
      g.fillStyle(f.face, 1).fillCircle(x, this.beadRow.y, r);
      g.fillStyle(f.rim, 0.8).fillCircle(x - r * 0.3, this.beadRow.y - r * 0.35, r * 0.3);
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
      this.pressDirty = true;
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
    this.backdrop.destroy();
  }
}
