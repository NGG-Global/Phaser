import Phaser from 'phaser';
import { AudioEngine } from '@/audio/AudioEngine';
import { MUSIC, STEM_IDS } from '@/config/music';
import { TaskSequence } from '@/game/TaskSequence';
import { SceneKey } from '@/config/scenes';
import { RHYTHM } from '@/config/rhythm';
import { BaseScene } from '@/core/BaseScene';
import { isTouchPrimary } from '@/core/shell';
import { RoundController, type Phase } from '@/game/RoundController';
import type { RoundResult } from '@/game/scoring';
import { TapInput, type Tap } from '@/input/TapInput';
import type { Judgement } from '@/rhythm/judge';
import { SESSION, sessionAccuracy } from '@/game/session';
import type { TransitionPainter } from '@/vignettes/transitions';
import { VIGNETTES } from '@/vignettes/registry';
import type { Vignette } from '@/vignettes/Vignette';
import { easeOut } from '@/vignettes/motion';


/** Composes the existing engine with registered visual vignettes. No judgement rules live here. */
export class PlayScene extends BaseScene {
  private audio: AudioEngine | null = null;
  private controller: RoundController | null = null;
  private taps!: TapInput;
  private vignette!: Vignette;
  private readonly previewAct = import.meta.env.DEV ? Math.max(0, SESSION.findIndex(act => act.vignette === new URLSearchParams(location.search).get('vignette'))) : 0;
  private actIndex = this.previewAct;
  private vignetteIndex = VIGNETTES.findIndex(v => v.id === SESSION[this.actIndex]!.vignette);
  private get act() { return SESSION[this.actIndex]!; }
  private sessionResults: number[] = [];
  private summaryShown = false;
  private get definition() { return VIGNETTES[this.vignetteIndex]!; }
  private curtain!: Phaser.GameObjects.Graphics;
  private headline!: Phaser.GameObjects.Text;
  private edition!: Phaser.GameObjects.Text;
  private caption!: Phaser.GameObjects.Text;
  private invitation!: Phaser.GameObjects.Text;
  private accuracy!: Phaser.GameObjects.Text;
  private restart!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private marks!: Phaser.GameObjects.Graphics;
  private rule!: Phaser.GameObjects.Graphics;
  private debug!: Phaser.GameObjects.Text;
  private controlSize = 96;
  private uiScale = 1;
  private headlineY = 0;
  private headlineAt = -Infinity;
  private outcomes: ('perfect' | 'good' | 'miss' | 'pending')[] = [];
  private sequence: TaskSequence | null = null;
  private transition: { slide: number; swap: number; next: number; swapped: boolean; painter: TransitionPainter } | null = null;
  private replayOffset: number | null = null;
  private attempts = 0;
  private demoCount = 0;
  private finishUnlock = Infinity;
  private startRequest = 0;
  private disposed = false;
  private starting = false;
  private lastJudgement = '';
  private replay: { roundId: number; targets: readonly number[]; next: number } | null = null;
  private replayPanel: HTMLElement | null = null;
  private pump: ReturnType<typeof setInterval> | null = null;
  private readonly debugMode = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');

  public constructor() { super(SceneKey.Play); }

  protected override build(): void {
    this.disposed = false;
    this.starting = false;
    this.vignette = this.definition.create(this);
    this.curtain = this.add.graphics().setDepth(100);
    this.edition = this.text('SMALL ACTS     /     01', 17, 'monospace').setLetterSpacing(2);
    this.headline = this.text(this.definition.intro, 104, 'Georgia, serif').setLineSpacing(-17);
    this.caption = this.text(this.definition.title, 23, 'Georgia, serif').setOrigin(0.5).setFontStyle('italic');
    this.invitation = this.text('TAP ANYWHERE TO BEGIN', 17, 'monospace').setLetterSpacing(2).setOrigin(0.5);
    this.accuracy = this.text('', 18, 'monospace').setOrigin(0.5);
    this.restart = this.text('↻', 38, 'Arial, sans-serif').setOrigin(0.5);
    this.mute = this.text('♪', 32, 'Georgia, serif').setOrigin(0.5);
    this.marks = this.add.graphics();
    this.rule = this.add.graphics();
    this.debug = this.text('', 16, 'monospace').setVisible(this.debugMode);
    if (this.debugMode) this.installReplayPanel();
    this.taps = new TapInput(this, tap => this.handleTap(tap));
    this.pump = setInterval(() => this.tick(), RHYTHM.pumpMs);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.pageHide);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.checkOrientation, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }
  private text(value: string, size: number, fontFamily: string): Phaser.GameObjects.Text {
    return this.add.text(0, 0, value, { fontFamily, fontSize: `${size}px`, color: `#${this.definition.ink.toString(16).padStart(6, '0')}` });
  }
  protected override layout(): void {
    const { safe } = this.viewport;
    this.vignette.layout(this.viewport);
    const s = Math.min(safe.width / 720, safe.height / 1150);
    this.uiScale = s;
    const left = safe.centerX - 310 * s;
    const top = safe.top;
    this.edition.setPosition(left, top + 47 * s).setFontSize(16 * s);
    this.headlineY = top + 135 * s;
    this.headline.setPosition(left - 5 * s, this.headlineY).setFontSize(88 * s).setLineSpacing(-12 * s);
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    this.restart.setPosition(safe.centerX + 175 * s, top + 55 * s).setFontSize(36 * s);
    this.mute.setPosition(safe.centerX + 283 * s, top + 55 * s).setFontSize(32 * s);
    this.caption.setPosition(safe.centerX, safe.bottom - 160 * s).setFontSize(23 * s);
    this.invitation.setPosition(safe.centerX, safe.bottom - 72 * s).setFontSize(17 * s);
    this.accuracy.setPosition(safe.centerX, safe.bottom - 115 * s).setFontSize(16 * s);
    this.debug.setPosition(left, top + 360 * s).setFontSize(16 * s);
    this.drawMarks();
    this.rule.clear().lineStyle(1, this.definition.ink, 0.3).lineBetween(left, top + 100 * s, safe.centerX + 310 * s, top + 100 * s);
  }
  private blocked(): boolean { return document.hidden || (isTouchPrimary() && this.scale.isLandscape); }
  private now(): number { return this.audio?.clock.now() ?? performance.now() / 1000; }

  private async startRound(): Promise<void> {
    const request = ++this.startRequest;
    this.replay = null;
    this.replayOffset = null;
    this.transition = null;
    this.lastJudgement = '';
    this.actIndex = this.previewAct;
    this.sessionResults = [];
    this.summaryShown = false;
    this.controller?.dispose();
    this.audio?.cancel();
    this.audio?.music.stop();
    this.vignette.pause();
    this.accuracy.setText('');
    this.finishUnlock = Infinity;
    this.demoCount = 0;
    if (this.blocked()) return;
    this.starting = true;
    this.invitation.setText('ONE MOMENT');
    try {
      if (!this.audio) {
        this.audio = new AudioEngine();
        this.audio.setSounds(this.definition.sounds(this.audio.context));
        this.audio.context.addEventListener('statechange', this.audioState);
        this.controller = new RoundController(this.audio, {
          phase: phase => this.showPhase(phase),
          cue: cue => {
            if (cue.kind === 'action') {
              this.vignette.onDemonstrationBeat(cue.time);
              this.demoCount++;
              this.drawMarks();
            }
          },
          tap: () => this.vignette.onPlayerHit(this.now()),
          judgement: result => this.showJudgement(result),
          complete: result => this.showResult(result),
          interrupted: () => this.showPause(),
        });
      }
      await this.audio.unlock();
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      this.invitation.setText('LOADING MUSIC');
      await this.audio.music.load();
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      this.starting = false;
      this.selectVignette();
      const origin = this.audio.music.start();
      this.sequence = new TaskSequence(MUSIC.sourceBpm, origin, 1);
      this.beginTask(origin);
    } catch (error) {
      if (this.disposed || request !== this.startRequest) return;
      this.starting = false;
      this.controller?.dispose();
      this.audio?.cancel();
      this.audio?.music.stop();
      this.changeHeadline('One more\ntry.');
      this.caption.setText(error instanceof Error ? error.message : 'Sound could not start.');
      this.invitation.setText('TAP TO RETRY');
    }
  }
  private selectVignette(): void {
    const index = VIGNETTES.findIndex(v => v.id === this.act.vignette);
    if (index < 0) throw new Error(`Unregistered vignette: ${this.act.vignette}`);
    if (index !== this.vignetteIndex) {
      this.vignette.destroy();
      this.vignetteIndex = index;
      this.vignette = this.definition.create(this);
    }
    this.audio!.setSounds(this.definition.sounds(this.audio!.context));
    const color = `#${this.definition.ink.toString(16).padStart(6, '0')}`;
    for (const text of [this.headline, this.edition, this.caption, this.invitation, this.accuracy, this.restart, this.mute, this.debug]) text.setColor(color);
    this.layout();
  }
  private beginTask(startAt: number): void {
    this.attempts++;
    this.demoCount = 0;
    this.finishUnlock = Infinity;
    this.accuracy.setText('');
    this.edition.setText(`SMALL ACTS   /   ${this.actIndex + 1} OF ${SESSION.length}`);
    this.outcomes = this.act.pattern.hits.map(() => 'pending');
    this.controller!.start(this.act.pattern, this.sequence!.bpm, this.audio!.context.currentTime, performance.now(), startAt);
    this.vignette.reset(this.controller!.plan!);
    if (this.replayOffset !== null) {
      const plan = this.controller!.plan!;
      this.replay = { roundId: plan.id, targets: this.replayTargets(), next: 0 };
    }
    this.drawMarks();
  }
  private handleTap(tap: Tap): void {
    if (this.blocked()) return;
    if (Math.abs(tap.x - this.mute.x) < this.controlSize / 2 && Math.abs(tap.y - this.mute.y) < this.controlSize / 2) {
      this.audio?.toggleMute();
      this.mute.setText(this.audio?.muted ? '×' : '♪');
      return;
    }
    if (Math.abs(tap.x - this.restart.x) < this.controlSize / 2 && Math.abs(tap.y - this.restart.y) < this.controlSize / 2) {
      void this.startRound(); return;
    }
    const phase = this.controller?.phase ?? 'idle';
    if (phase === 'idle' || phase === 'paused') { if (!this.starting) void this.startRound(); return; }
    if (phase === 'result') {
      if (this.summaryShown) void this.startRound();
      return;
    }
    if (!this.audio || !this.controller?.active) return;
    this.audio.clock.refresh();
    this.controller.tap(this.audio.clock.input(tap.timestamp), this.audio.context.currentTime, performance.now());
  }
  private tick(): void {
    if (!this.audio || this.blocked()) return;
    if (this.audio.context.state !== 'running') { this.interrupt(); return; }
    this.audio.clock.refresh();
    const transition = this.transition;
    if (transition && this.now() >= transition.swap && !transition.swapped) {
      if (this.audio.context.currentTime > transition.next - RHYTHM.leadSec) { this.interrupt(); return; }
      transition.swapped = true;
      this.actIndex++;
      this.selectVignette();
      this.sequence = new TaskSequence(MUSIC.sourceBpm, transition.next, 1);
      this.beginTask(transition.next);
    }
    if (transition && this.now() >= transition.next) this.transition = null;
    this.replayTick();
    if (this.controller?.active) this.controller.tick(this.now(), performance.now());
  }
  /** Development-only integration exercise: actual DOM mouse events go through TapInput. */
  private installReplayPanel(): void {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:20;display:flex;gap:6px;';
    panel.style.flexWrap = 'wrap';
    for (const mode of ['Accurate replay', 'Good replay', 'Rough replay', 'Spam replay'] as const) {
      const button = document.createElement('button');
      button.textContent = mode;
      button.style.cssText = 'padding:9px;border:1px solid #243e35;background:#eee8d8;color:#243e35;font:11px monospace;';
      button.addEventListener('click', () => { void this.runReplay(mode === 'Accurate replay' ? 0 : mode === 'Good replay' ? 0.08 : mode === 'Spam replay' ? -1 : 0.24); });
      panel.appendChild(button);
    }
    for (const id of STEM_IDS) {
      const button = document.createElement('button');
      button.textContent = id;
      button.style.cssText = 'padding:6px;font:11px monospace';
      button.addEventListener('click', () => {
        const music = this.audio?.music;
        if (!music) return;
        music.setGain(id, music.gain(id) === 0 ? MUSIC.mix[id] : 0);
        button.style.opacity = music.gain(id) === 0 ? '0.45' : '1';
      });
      panel.appendChild(button);
    }
    document.body.appendChild(panel);
    this.replayPanel = panel;
  }
  private async runReplay(offsetSec: number): Promise<void> {
    const request = this.startRequest + 1;
    await this.startRound();
    if (request !== this.startRequest || !this.controller?.active || !this.controller.plan) return;
    const plan = this.controller.plan;
    this.replayOffset = offsetSec;
    this.replay = { roundId: plan.id, targets: this.replayTargets(), next: 0 };
  }
  private replayTargets(): readonly number[] {
    const plan = this.controller!.plan!;
    return this.replayOffset === -1
      ? Array.from({ length: Math.ceil((plan.end + 3 * 60 / plan.bpm - plan.start) / 0.04) }, (_, i) => plan.start + i * 0.04)
      : plan.targets.map(time => time + this.replayOffset!);
  }
  private replayTick(): void {
    const replay = this.replay;
    if (!replay || replay.roundId !== this.controller?.plan?.id || this.controller.phase === 'paused') { this.replay = null; return; }
    const target = replay.targets[replay.next];
    if (target === undefined || this.now() < target) return;
    replay.next++;
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const options = { bubbles: true, clientX: rect.left + rect.width * 0.5, clientY: rect.top + rect.height * 0.58, button: 0 };
    canvas.dispatchEvent(new MouseEvent('mousedown', { ...options, buttons: 1 }));
    canvas.dispatchEvent(new MouseEvent('mouseup', { ...options, buttons: 0 }));
  }
  public override update(): void {
    const now = this.now();
    this.vignette.update(now);
    const slide = this.transition;
    if (slide && now >= slide.slide && now < slide.next) {
      const p = slide.swapped ? (now - slide.swap) / (slide.next - slide.swap) : (now - slide.slide) / (slide.swap - slide.slide);
      this.vignette.translate(this.viewport.full.width * (slide.swapped ? 1 - easeOut(p) : -(Math.min(1, Math.max(0, p)) ** 3)));
    }
    this.curtain.clear();
    if (slide && now >= slide.slide && now < slide.next) {
      const p = (now - slide.slide) / (slide.next - slide.slide);
      slide.painter(this.curtain, this.viewport, p);
    }
    const reveal = easeOut((now - this.headlineAt) / 0.21);
    const playing = this.controller?.active;
    const endReveal = this.controller?.phase === 'result'
      ? easeOut((now - (this.finishUnlock - this.definition.endingSec) - 0.28) / 0.3) : 1;
    this.headline.setFontSize((playing ? 48 : 88) * this.uiScale).setAlpha(reveal * endReveal).setY(this.headlineY + (1 - reveal * endReveal) * 12 * this.uiScale);
    this.caption.setAlpha(endReveal);
    if (this.controller?.phase === 'result' && !this.transition && now >= this.finishUnlock && !this.summaryShown) {
      this.summaryShown = true;
      this.replay = null;
      this.changeHeadline('Three small\nacts.');
      this.caption.setText('A little rhythm goes a long way.');
      this.accuracy.setText(`${Math.round(sessionAccuracy(this.sessionResults))}% IN TIME`);
      this.invitation.setText('TAP TO PLAY AGAIN');
    }
    if (this.debugMode) {
      const music = this.audio?.music;
      this.debug.setText(`${this.definition.id} task ${this.attempts} · ${this.controller?.phase ?? 'idle'}\nvoices ${this.audio?.activeSources ?? 0} · handlers ${this.input.listenerCount(Phaser.Input.Events.POINTER_DOWN)} · objects ${this.children.length}\n${this.controller?.result?.accuracy.toFixed(0) ?? '—'}% · ${this.audio?.clock.mode ?? 'locked'} · ${this.game.loop.actualFps.toFixed(0)} fps\n${this.lastJudgement}\nstems ${music?.activeSources ?? 0} · run ${music?.playbackGeneration ?? 0} · loops ${music?.completedLoops ?? 0}\nstart ${music?.startTime?.toFixed(3) ?? '—'} · length ${music?.duration.toFixed(6) ?? '—'}\n${STEM_IDS.map(id => `${id[0]}:${music?.gain(id) ?? MUSIC.mix[id]}`).join(' ')}`);
    }
  }
  private changeHeadline(text: string): void {
    if (this.headline.text === text) return;
    this.headlineAt = this.now();
    this.headline.setText(text).setAlpha(0).setY(this.headlineY + 12 * this.uiScale);
  }
  private showPhase(phase: Phase): void {
    this.vignette.onPhase(phase, this.now());
    if (phase === 'prepare') { this.changeHeadline('Watch.'); this.caption.setText(''); this.invitation.setText(''); }
    if (phase === 'demonstrate') { this.changeHeadline('Watch.'); this.caption.setText(''); }
    if (phase === 'handoff') { this.changeHeadline('Repeat.'); this.caption.setText(''); this.demoCount = 0; this.drawMarks(); }
    if (phase === 'respond') { this.caption.setText(''); this.invitation.setText(''); }
  }
  private showJudgement(result: Judgement): void {
    this.lastJudgement = `${result.kind} ${result.grade} ${result.deltaMs?.toFixed(0) ?? '—'} ms`;
    this.vignette.onAccuracy(result, this.now());
    if (result.index !== null) this.outcomes[result.index] = result.grade === 'Perfect' ? 'perfect' : result.grade === 'Good' ? 'good' : 'miss';
    this.drawMarks();
  }
  private drawMarks(): void {
    this.marks.clear();
    if (!this.debugMode) return;
    const phase = this.controller?.phase;
    if (!phase || phase === 'idle' || phase === 'paused' || phase === 'result') return;
    const { safe } = this.viewport;
    const s = this.uiScale;
    const length = this.outcomes.length;
    this.outcomes.forEach((outcome, i) => {
      const x = safe.centerX + (i - (length - 1) / 2) * 27 * s;
      const y = safe.bottom - 210 * s;
      const filled = phase === 'demonstrate' ? i < this.demoCount : outcome === 'perfect' || outcome === 'good';
      this.marks.lineStyle(1.5 * s, this.definition.ink, 0.5).strokeCircle(x, y, 4 * s);
      if (filled) this.marks.fillStyle(this.definition.ink).fillCircle(x, y, 4 * s);
      if (outcome === 'miss') this.marks.lineBetween(x - 4 * s, y, x + 4 * s, y);
    });
  }
  private showResult(result: RoundResult): void {
    const strong = result.accuracy >= this.definition.successAccuracy;
    this.sequence!.complete(result.accuracy);
    this.sessionResults[this.actIndex] = result.accuracy;
    const ending = this.sequence!.ending(this.controller!.plan!.end);
    const contact = ending.contact;
    this.vignette.finish(strong, contact);
    this.audio!.playFinish(contact, strong);
    this.finishUnlock = contact + this.definition.endingSec;
    this.transition = this.actIndex < SESSION.length - 1 ? { ...ending, swapped: false, painter: this.definition.transition } : null;
    const copy = strong ? this.definition.success : this.definition.rough;
    this.changeHeadline(copy[0]);
    this.caption.setText(copy[1]);
    this.accuracy.setText(this.debugMode ? `${Math.round(result.accuracy)}% IN TIME` : '');
    this.invitation.setText('');
    this.drawMarks();
  }
  private showPause(): void {
    this.vignette.pause();
    this.changeHeadline('Take a\nbreath.');
    this.caption.setText('We’ll start that one again.');
    this.invitation.setText('TAP TO RESUME');
  }
  private interrupt(): void {
    ++this.startRequest;
    this.replay = null;
    this.replayOffset = null;
    this.transition = null;
    const wasStarting = this.starting;
    this.starting = false;
    this.taps.reset();
    const wasEnding = this.controller?.phase === 'result';
    this.controller?.interrupt('Paused');
    if (wasEnding || wasStarting) { this.controller?.dispose(); this.showPause(); }
    this.audio?.cancel();
    this.audio?.music.stop();
    this.vignette.pause();
  }
  private readonly visibility = (): void => { if (document.hidden) this.interrupt(); };
  private readonly pageHide = (): void => { this.interrupt(); };
  private readonly audioState = (): void => { if (this.audio?.context.state !== 'running') this.interrupt(); };
  private checkOrientation(): void { if (this.blocked()) this.interrupt(); }
  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    ++this.startRequest;
    if (this.pump !== null) clearInterval(this.pump);
    this.pump = null;
    this.taps.dispose();
    this.replayPanel?.remove();
    this.replayPanel = null;
    this.controller?.dispose();
    this.vignette.destroy();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.pageHide);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.checkOrientation, this);
    this.audio?.context.removeEventListener('statechange', this.audioState);
    this.audio?.dispose();
    this.audio = null;
  }
}
