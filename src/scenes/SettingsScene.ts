import Phaser from 'phaser';
import { applyCalibration, currentAudio, isMuted, sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { SceneKey } from '@/config/scenes';
import { STYLE } from '@/config/style';
import { PALETTE, SHELL } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { reducedMotion } from '@/core/motionPreference';
import { CalibrationRun, CALIBRATION } from '@/game/CalibrationRun';
import { clearProgress, loadProgress } from '@/game/progress';
import { clearHealth } from '@/game/health';
import { CALIBRATION_TAPS, loadSettings } from '@/game/settings';
import { monetization, PRODUCT, purchaseFeedback, restoreFeedback } from '@/monetization';
import { TapInput, type Tap } from '@/input/TapInput';
import { MaterialKey } from '@/textures/materials';
import { Backdrop } from '@/ui/backdrop';
import { shade } from '@/ui/colour';
import { pressAmount } from '@/ui/chrome';
import { faces } from '@/ui/light';
import { drawPanel, placeSurface, surface } from '@/ui/panel';
import { SceneCurtain } from '@/ui/SceneCurtain';
import { arrive } from '@/ui/spring';
import { body, display, resize } from '@/ui/type';

const PANEL = {
  cardHeight: 118, cardGap: 16,
} as const;

/** The few colours the scene owns; the paper is the game's clear colour. */
const LOOK = { ink: PALETTE.ink, card: SHELL.puck, button: SHELL.cream, done: PALETTE.coral, cream: SHELL.cream, sun: SHELL.sun } as const;

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
  private headline!: Phaser.GameObjects.Text;
  private offsetValue!: Phaser.GameObjects.Text;
  private soundValue!: Phaser.GameObjects.Text;
  private progressValue!: Phaser.GameObjects.Text;
  private premiumValue!: Phaser.GameObjects.Text;
  private buttons: Record<'calibrate' | 'sound' | 'reset' | 'unlock' | 'restore' | 'done', Button> = null!;
  private taps!: TapInput;
  private curtain!: SceneCurtain;
  private uiScale = 1;
  private beadRow = { x: 0, y: 0, gap: 0, radius: 0 };
  private phase: Phase = 'idle';
  private calibrationMs = 0;
  private measuredMs: number | null = null;
  private run: CalibrationRun | null = null;
  private pressedAt = -Infinity;
  private pressed: Button | null = null;
  private pressDirty = false;
  private beadsShown = false;
  private resetArmed = false;
  private commerceBusy = false;
  private from: string = SceneKey.Menu;
  private enteredAt = 0;
  private headlineX = 0;
  private headlineY = 0;
  /** Read per use, so a preference change applies mid-scene. */
  private get reducedMotion(): boolean { return reducedMotion(); }

  public constructor() { super(SceneKey.Settings); }

  protected override build(): void {
    const data = this.sys.settings.data as { from?: string } | undefined;
    this.from = data?.from === SceneKey.Map ? SceneKey.Map : SceneKey.Menu;
    this.phase = 'idle';
    this.resetArmed = false;
    this.commerceBusy = false;
    this.run = null;
    this.measuredMs = null;
    this.pressedAt = -Infinity;
    this.pressed = null;
    this.calibrationMs = loadSettings().calibrationMs;
    this.enteredAt = performance.now() / 1000;
    this.backdrop = new Backdrop(this, PALETTE.paper, LOOK.sun, { glowAt: { x: 0.3, y: 0.2 }, glowAlpha: 0.6 });
    this.plates = this.add.graphics();
    this.surfaces = [0, 1, 2, 3].map(() => surface(this, MaterialKey.parchment, new Phaser.Geom.Rectangle(0, 0, 10, 10), 1, LOOK.card, 0.45));
    this.cards = [0, 1, 2, 3].map(() => new Phaser.Geom.Rectangle());
    this.controls = this.add.graphics().setDepth(2);
    this.beats = this.add.graphics().setDepth(2);
    this.headline = display(this, 'Settings', { size: 66, colour: LOOK.ink }).setDepth(1);
    this.offsetValue = body(this, '', { size: 32, colour: LOOK.ink }).setOrigin(0, 0.5).setDepth(1);
    this.soundValue = body(this, '', { size: 32, colour: LOOK.ink }).setOrigin(0, 0.5).setDepth(1);
    this.progressValue = body(this, '', { size: 32, colour: LOOK.ink }).setOrigin(0, 0.5).setDepth(1);
    this.premiumValue = body(this, '', { size: 32, colour: LOOK.ink }).setOrigin(0, 0.5).setDepth(1);
    this.buttons = {
      calibrate: this.button('Calibrate', false),
      sound: this.button('', false),
      reset: this.button('Reset', false),
      unlock: this.button('Unlock', false),
      restore: this.button('Restore', false),
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
    const text = (hero ? display : body)(this, caption, { size: hero ? 30 : 25, colour: hero ? LOOK.cream : LOOK.ink }).setOrigin(0.5).setDepth(3);
    return { rect: new Phaser.Geom.Rectangle(), label: text, hero };
  }

  protected override layout(): void {
    const { safe } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1150);
    this.uiScale = s;
    this.backdrop.layout(this.viewport);
    const left = safe.centerX - 322 * s;
    const width = 644 * s;
    resize(this.headline, 66 * s, LOOK.ink);
    this.headlineX = left - 2 * s;
    this.headlineY = safe.top + 58 * s;
    this.headline.setPosition(this.headlineX, this.headlineY);
    const top = safe.top + 164 * s;
    const card = PANEL.cardHeight * s;
    const gap = PANEL.cardGap * s;
    // Buttons keep a full touch target even where the card is short.
    const control = Math.max(88 * s, 48 * this.viewport.unitScale);
    const g = this.plates.clear();
    const place = (index: number, value: Phaser.GameObjects.Text, button: Button, buttonWidth: number) => {
      const rect = this.cards[index]!.setTo(left, top + index * (card + gap), width, card);
      drawPanel(g, rect, s, { fill: LOOK.card, depth: 8 });
      placeSurface(this.surfaces[index]!, rect, s);
      resize(value, 32 * s, LOOK.ink, STYLE.current, false);
      value.setPosition(left + 28 * s, rect.centerY - 2 * s);
      const w = Math.max(buttonWidth * s, control);
      button.rect.setTo(left + width - 24 * s - w, rect.centerY - control / 2, w, control);
    };
    place(0, this.offsetValue, this.buttons.calibrate, 190);
    this.beadRow = { x: left + 34 * s, y: top + card - 24 * s, gap: 26 * s, radius: 6 * s };
    place(1, this.soundValue, this.buttons.sound, 150);
    place(2, this.progressValue, this.buttons.reset, 160);
    this.placePremium(left, top + 3 * (card + gap), width, card, control, s);
    const done = this.buttons.done;
    const doneHeight = Math.max(96 * s, control);
    done.rect.setTo(safe.centerX - 200 * s, safe.bottom - 132 * s - doneHeight, 400 * s, doneHeight);
    this.drawButtons(0);
    this.pressDirty = true;
  }

  private placePremium(left: number, top: number, width: number, card: number, control: number, s: number): void {
    const rect = this.cards[3]!.setTo(left, top, width, card);
    const g = this.plates;
    drawPanel(g, rect, s, { fill: LOOK.card, depth: 8 });
    placeSurface(this.surfaces[3]!, rect, s);
    resize(this.premiumValue, 32 * s, LOOK.ink, STYLE.current, false);
    this.premiumValue.setPosition(left + 28 * s, rect.centerY - 2 * s);
    const restoreW = Math.max(150 * s, control);
    const unlockW = Math.max(150 * s, control);
    const entitled = monetization().premium();
    this.buttons.unlock.label.setVisible(!entitled);
    if (entitled) {
      this.buttons.unlock.rect.setTo(0, 0, 0, 0);
      this.buttons.restore.rect.setTo(left + width - 24 * s - restoreW, rect.centerY - control / 2, restoreW, control);
    } else {
      this.buttons.unlock.rect.setTo(left + width - 24 * s - unlockW, rect.centerY - control / 2, unlockW, control);
      this.buttons.restore.rect.setTo(
        this.buttons.unlock.rect.x - 12 * s - restoreW,
        rect.centerY - control / 2,
        restoreW,
        control,
      );
    }
  }

  /** Each control is a block on its card; the one that leaves the screen is the coral hero. */
  private drawButtons(press: number): void {
    const s = this.uiScale;
    const g = this.controls.clear();
    for (const button of Object.values(this.buttons)) {
      if (button.rect.width <= 0 || button.rect.height <= 0) continue;
      const p = this.pressed === button ? press : 0;
      const depth = button.hero ? 14 : 8;
      drawPanel(g, button.rect, s, { fill: button.hero ? LOOK.done : LOOK.button, depth, press: p, hero: button.hero, radius: Math.min(button.rect.height / 2, STYLE.current.radius) });
      const size = button.hero ? 30 * s : 25 * s;
      resize(button.label, size, button.hero ? LOOK.cream : LOOK.ink, STYLE.current, button.hero);
      button.label.setPosition(button.rect.centerX, button.rect.centerY + depth * s * p * 0.8);
    }
  }

  private refreshCopy(): void {
    const muted = isMuted(this);
    const progress = loadProgress();
    const shown = this.phase === 'measured' && this.measuredMs !== null ? this.measuredMs : this.calibrationMs;
    // A typographic minus, to match the rest of the game's type rather than a hyphen.
    this.offsetValue.setText(this.phase === 'counting' ? `${this.run?.count ?? 0} / ${CALIBRATION_TAPS}`
      : this.phase === 'failed' ? 'Try again'
      : `${shown > 0 ? '+' : ''}${String(shown).replace('-', '−')} ms`);
    this.buttons.calibrate.label.setText(this.phase === 'counting' ? 'Stop' : this.phase === 'measured' ? 'Keep' : this.phase === 'failed' ? 'Retry' : 'Calibrate');
    this.soundValue.setText(muted ? 'Sound off' : 'Sound on');
    this.buttons.sound.label.setText(muted ? 'Unmute' : 'Mute');
    this.progressValue.setText(this.resetArmed ? 'Reset progress?' : `Level ${progress.unlocked}`);
    this.buttons.reset.label.setText(this.resetArmed ? 'Confirm' : 'Reset');
    const entitled = monetization().premium();
    const price = monetization().productPrice(PRODUCT.premium);
    this.premiumValue.setText(entitled ? 'Unlimited hearts' : 'Premium');
    this.buttons.unlock.label.setText(price ?? 'Unlock');
    this.buttons.unlock.label.setVisible(!entitled);
    this.buttons.restore.label.setText('Restore');
  }

  public override update(): void {
    const now = performance.now() / 1000;
    // A press sinks the block and springs it back; the buttons redraw only while that runs.
    const press = pressAmount(now, this.pressedAt);
    if (press > 0.001 || this.pressDirty) {
      this.drawButtons(press);
      this.pressDirty = press > 0.001;
      if (!this.pressDirty) this.pressed = null;
    }
    const age = now - this.enteredAt;
    if (age < 1.1) {
      const { rise, alpha } = this.reducedMotion ? { rise: 0, alpha: 1 } : arrive(age, 0.7);
      this.headline.setPosition(this.headlineX, this.headlineY + rise * 36 * this.uiScale).setAlpha(alpha);
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
    if (!this.run) return;
    const elapsed = this.run.beatAt(audio.context.currentTime);
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
    if (audio.context.currentTime > this.run.end) this.finishCalibration();
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
      else if (name === 'unlock') void this.buyPremium();
      else if (name === 'restore') void this.restorePurchases();
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
      this.refreshCopy();
      return;
    }
    audio.clock.refresh();
    this.phase = 'counting';
    this.run = new CalibrationRun(audio.context.currentTime + CALIBRATION.startLeadSec, this.calibrationMs);
    for (let beat = 0; beat < CALIBRATION.leadBeats + CALIBRATION.measureBeats; beat++) {
      audio.play(this.run.origin + beat * this.run.period, beat % 4 === 0 ? 'ready' : 'count');
    }
    this.refreshCopy();
  }

  private recordTap(tap: Tap): void {
    const audio = currentAudio(this);
    if (!audio || !this.run) return;
    audio.clock.refresh();
    const at = audio.clock.input(tap.timestamp);
    if (!this.run.tap(at)) return;
    if (this.run.complete) this.finishCalibration();
    else this.refreshCopy();
  }

  private finishCalibration(): void {
    currentAudio(this)?.cancel();
    const measured = this.run?.result() ?? null;
    this.run = null;
    this.measuredMs = measured;
    this.phase = measured === null ? 'failed' : 'measured';
    this.refreshCopy();
  }

  /** Two taps, because there is no undo: the second one destroys every cleared level. */
  private resetTapped(): void {
    if (!this.resetArmed) { this.resetArmed = true; this.refreshCopy(); return; }
    this.resetArmed = false;
    const cleared = clearProgress();
    clearHealth();
    this.refreshCopy();
    if (!cleared) this.progressValue.setText('Couldn’t reset');
  }

  private async buyPremium(): Promise<void> {
    if (this.commerceBusy || this.curtain.active || monetization().premium()) return;
    this.commerceBusy = true;
    try {
      const result = await monetization().purchase(PRODUCT.premium);
      if (this.curtain.active) return;
      if (!result.ok) {
        this.premiumValue.setText(purchaseFeedback(result.reason));
        return;
      }
      this.layout();
      this.refreshCopy();
    } finally {
      this.commerceBusy = false;
    }
  }

  private async restorePurchases(): Promise<void> {
    if (this.commerceBusy || this.curtain.active) return;
    this.commerceBusy = true;
    try {
      const result = await monetization().restorePurchases();
      if (this.curtain.active) return;
      this.layout();
      this.refreshCopy();
      this.premiumValue.setText(restoreFeedback(result));
    } finally {
      this.commerceBusy = false;
    }
  }

  private shutdown(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    currentAudio(this)?.cancel();
    this.taps.dispose();
    this.backdrop.destroy();
  }
}
