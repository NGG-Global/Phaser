import Phaser from 'phaser';
import type { AudioEngine } from '@/audio/AudioEngine';
import { sharedAudio, toggleMute } from '@/audio/sharedAudio';
import { MUSIC } from '@/config/music';
import { TaskSequence } from '@/game/TaskSequence';
import { SceneKey } from '@/config/scenes';
import { RHYTHM } from '@/config/rhythm';
import { BaseScene } from '@/core/BaseScene';
import { isTouchPrimary } from '@/core/shell';
import { RoundController, type Phase } from '@/game/RoundController';
import type { RoundResult } from '@/game/scoring';
import { TapInput, type Tap } from '@/input/TapInput';
import type { Judgement } from '@/rhythm/judge';
import { levelSpec, meanAccuracy, starsFor, type LevelSpec } from '@/game/levels';
import { loadProgress, recordResult, saveProgress, type LevelOutcome } from '@/game/progress';
import { drawStar } from '@/ui/star';
import { VIGNETTES } from '@/vignettes/registry';
import type { Vignette } from '@/vignettes/Vignette';
import { easeOut } from '@/vignettes/motion';

/** Composes the existing engine with registered visual vignettes. No judgement rules live here. */
export class PlayScene extends BaseScene {
  private audio: AudioEngine | null = null;
  private controller: RoundController | null = null;
  private taps!: TapInput;
  private vignette!: Vignette;
  /** The level is fixed for the scene's life; one vignette, tasks ramping in tempo and density. */
  private spec: LevelSpec = levelSpec(1);
  private taskIndex = 0;
  private get task() { return this.spec.tasks[this.taskIndex]!; }
  private results: number[] = [];
  private summaryShown = false;
  private levelCleared = false;
  /** Computed and persisted the instant the last task resolves; the summary only displays it. */
  private outcome: LevelOutcome | null = null;
  private saveFailed = false;
  private get definition() { return VIGNETTES.find(v => v.id === this.spec.vignette) ?? VIGNETTES[0]!; }
  private stars!: Phaser.GameObjects.Graphics;
  private headline!: Phaser.GameObjects.Text;
  private edition!: Phaser.GameObjects.Text;
  private caption!: Phaser.GameObjects.Text;
  private invitation!: Phaser.GameObjects.Text;
  private accuracy!: Phaser.GameObjects.Text;
  private restart!: Phaser.GameObjects.Text;
  private menu!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private marks!: Phaser.GameObjects.Graphics;
  private rule!: Phaser.GameObjects.Graphics;
  private debug!: Phaser.GameObjects.Text;
  private controlSize = 96;
  private uiScale = 1;
  private headlineY = 0;
  private headlineSize = 0;
  private headlineAt = -Infinity;
  private outcomes: ('perfect' | 'good' | 'miss' | 'pending')[] = [];
  private sequence: TaskSequence | null = null;
  /** Beat-aligned table slide between tasks; the next task and the music's new tempo both start at `next`. */
  private transition: { slide: number; swap: number; next: number; swapped: boolean } | null = null;
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
    const data = this.sys.settings.data as { level?: number; autoStart?: boolean } | undefined;
    const requested = data?.level ?? (import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('level')) : 0);
    this.spec = levelSpec(Number.isInteger(requested) && requested >= 1 ? requested : 1);
    this.vignette = this.definition.create(this);
    this.stars = this.add.graphics();
    this.edition = this.text(`LEVEL ${this.spec.level}`, 17, 'monospace').setLetterSpacing(2);
    this.headline = this.text(this.definition.intro, 104, 'Georgia, serif').setLineSpacing(-17);
    this.caption = this.text(this.definition.title, 23, 'Georgia, serif').setOrigin(0.5).setFontStyle('italic');
    this.invitation = this.text('TAP ANYWHERE TO BEGIN', 17, 'monospace').setLetterSpacing(2).setOrigin(0.5);
    this.accuracy = this.text('', 18, 'monospace').setOrigin(0.5);
    this.restart = this.text('↻', 38, 'Arial, sans-serif').setOrigin(0.5);
    this.menu = this.text('MAP', 16, 'monospace').setLetterSpacing(2).setOrigin(0.5);
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
    // Arriving from the map: audio is already unlocked and loaded, so begin at once.
    if (data?.autoStart) this.events.once(Phaser.Scenes.Events.CREATE, () => { void this.startRound(); });
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
    this.headlineSize = (this.controller?.active ? 48 : 88) * s;
    this.headline.setPosition(left - 5 * s, this.headlineY).setFontSize(this.headlineSize).setLineSpacing(-12 * s);
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    this.restart.setPosition(safe.centerX + 175 * s, top + 55 * s).setFontSize(36 * s);
    this.menu.setPosition(safe.centerX + 70 * s, top + 55 * s).setFontSize(15 * s);
    this.mute.setPosition(safe.centerX + 283 * s, top + 55 * s).setFontSize(32 * s);
    this.caption.setPosition(safe.centerX, safe.bottom - 160 * s).setFontSize(23 * s);
    this.invitation.setPosition(safe.centerX, safe.bottom - 72 * s).setFontSize(17 * s);
    this.accuracy.setPosition(safe.centerX, safe.bottom - 115 * s).setFontSize(16 * s);
    this.debug.setPosition(left, top + 360 * s).setFontSize(16 * s);
    this.drawMarks();
    this.drawStars();
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
    this.taskIndex = 0;
    this.results = [];
    this.summaryShown = false;
    this.levelCleared = false;
    this.outcome = null;
    this.saveFailed = false;
    this.stars.clear();
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
      if (!this.controller) {
        this.audio = sharedAudio(this);
        this.audio.setSounds(this.definition.sounds(this.audio.context));
        this.audio.context.addEventListener('statechange', this.audioState);
        this.mute.setText(this.audio.muted ? '×' : '♪');
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
      await this.audio!.unlock();
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      this.invitation.setText('LOADING MUSIC');
      await this.audio!.music.load();
      if (this.disposed || request !== this.startRequest || this.blocked()) return;
      this.starting = false;
      this.audio!.setSounds(this.definition.sounds(this.audio!.context));
      const origin = this.audio!.music.start(); // fresh sources: every level starts at the base tempo
      this.sequence = new TaskSequence(this.task.bpm, origin, 1);
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
  private beginTask(startAt: number): void {
    this.attempts++;
    this.demoCount = 0;
    this.finishUnlock = Infinity;
    this.accuracy.setText('');
    this.edition.setText(`LEVEL ${this.spec.level}   ·   TASK ${this.taskIndex + 1}/${this.spec.tasks.length}`);
    this.outcomes = this.task.pattern.hits.map(() => 'pending');
    this.controller!.start(this.task.pattern, this.task.bpm, this.audio!.context.currentTime, performance.now(), startAt);
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
      if (this.audio) this.mute.setText(toggleMute(this.audio) ? '×' : '♪');
      return;
    }
    if (Math.abs(tap.x - this.restart.x) < this.controlSize / 2 && Math.abs(tap.y - this.restart.y) < this.controlSize / 2) {
      void this.startRound(); return;
    }
    if (Math.abs(tap.x - this.menu.x) < this.controlSize / 2 && Math.abs(tap.y - this.menu.y) < this.controlSize / 2) {
      this.leaveForMap(); return;
    }
    const phase = this.controller?.phase ?? 'idle';
    if (phase === 'idle' || phase === 'paused') { if (!this.starting) void this.startRound(); return; }
    if (phase === 'result') {
      // Cleared: back to the road, centred on what just opened. Failed: straight into another go.
      if (this.summaryShown) { if (this.levelCleared) this.leaveForMap(); else void this.startRound(); }
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
      this.taskIndex++;
      // The music speeds up on the same downbeat the next count-in starts, so the grid and
      // the stems change tempo together. Every task's plan is whole beats, so `next` is on a beat.
      this.audio.music.setRate(this.task.bpm / MUSIC.sourceBpm, transition.next);
      this.sequence = new TaskSequence(this.task.bpm, transition.next, 1);
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
    const mute = document.createElement('button');
    mute.textContent = 'music';
    mute.style.cssText = 'padding:6px;font:11px monospace';
    mute.addEventListener('click', () => {
      const music = this.audio?.music;
      if (!music) return;
      music.setGain(music.gain === 0 ? MUSIC.masterGain : 0);
      mute.style.opacity = music.gain === 0 ? '0.45' : '1';
    });
    panel.appendChild(mute);
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
    const reveal = easeOut((now - this.headlineAt) / 0.21);
    const playing = this.controller?.active;
    const endReveal = this.controller?.phase === 'result'
      ? easeOut((now - (this.finishUnlock - this.definition.endingSec) - 0.28) / 0.3) : 1;
    // setFontSize re-measures and re-rasterises the text canvas; only pay for it on change.
    const headlineSize = (playing ? 48 : 88) * this.uiScale;
    if (headlineSize !== this.headlineSize) { this.headlineSize = headlineSize; this.headline.setFontSize(headlineSize); }
    this.headline.setAlpha(reveal * endReveal).setY(this.headlineY + (1 - reveal * endReveal) * 12 * this.uiScale);
    this.caption.setAlpha(endReveal);
    if (this.controller?.phase === 'result' && !this.transition && now >= this.finishUnlock && !this.summaryShown) this.showSummary();
    if (this.debugMode) {
      const music = this.audio?.music;
      this.debug.setText(`${this.definition.id} L${this.spec.level} t${this.taskIndex + 1}/${this.spec.tasks.length} ${this.task.bpm}bpm tier${this.task.tier} clear${this.spec.clearAccuracy} rate${music?.playbackRate ?? 1} attempt ${this.attempts} · ${this.controller?.phase ?? 'idle'}\nvoices ${this.audio?.activeSources ?? 0} · handlers ${this.input.listenerCount(Phaser.Input.Events.POINTER_DOWN)} · objects ${this.children.length}\n${this.controller?.result?.accuracy.toFixed(0) ?? '—'}% · ${this.audio?.clock.mode ?? 'locked'} · ${this.game.loop.actualFps.toFixed(0)} fps\n${this.lastJudgement}\nmusic ${music?.activeSources ?? 0} · run ${music?.playbackGeneration ?? 0} · loops ${music?.completedLoops ?? 0}\nstart ${music?.startTime?.toFixed(3) ?? '—'} · length ${music?.duration.toFixed(6) ?? '—'}\ngain ${(music?.gain ?? MUSIC.masterGain).toFixed(3)} · lead ${music?.leadInSeconds.toFixed(3) ?? '—'}`);
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
    // The action sound is scheduled before the tap is graded, so a reaction to the
    // grade needs its own voice. Sound sets that declare neither accent stay silent.
    if (result.kind === 'extra') this.audio?.playAccent(this.now(), 'scrape');
    else if (result.kind === 'omission') this.audio?.playAccent(this.now(), 'judder');
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
    this.results[this.taskIndex] = result.accuracy;
    const ending = this.sequence!.ending(this.controller!.plan!.end);
    const contact = ending.contact;
    this.vignette.finish(strong, contact);
    this.audio!.playFinish(contact, strong);
    this.finishUnlock = contact + this.definition.endingSec;
    const last = this.taskIndex >= this.spec.tasks.length - 1;
    this.transition = last ? null : { ...ending, swapped: false };
    if (last) {
      this.audio!.music.setRate(1, ending.next); // back to the source tempo on the next downbeat
      // Record here, not when the summary draws. The summary waits out the coda, and a
      // notification in that window used to route through interrupt() and discard a
      // cleared level entirely.
      this.recordOutcome();
    }
    const copy = strong ? this.definition.success : this.definition.rough;
    this.changeHeadline(copy[0]);
    this.caption.setText(copy[1]);
    this.accuracy.setText(this.debugMode ? `${Math.round(result.accuracy)}% IN TIME` : '');
    this.invitation.setText('');
    this.drawMarks();
  }
  /** Idempotent: the level is scored and saved once, however often this is reached. */
  private recordOutcome(): void {
    if (this.outcome) return;
    const outcome = recordResult(loadProgress(), this.spec.level, meanAccuracy(this.results));
    this.outcome = outcome;
    this.levelCleared = outcome.cleared;
    this.saveFailed = outcome.cleared && !saveProgress(outcome.progress);
  }
  private showSummary(): void {
    this.summaryShown = true;
    this.replay = null;
    const accuracy = meanAccuracy(this.results);
    this.recordOutcome();
    const outcome = this.outcome!;
    const stars = starsFor(accuracy, this.spec);
    this.changeHeadline(outcome.cleared ? `Level ${this.spec.level}\ncleared.` : 'Not quite\nyet.');
    this.caption.setText(this.saveFailed
      // Silently losing a clear is worse than saying so once.
      ? 'Cleared — but this device would not save it.'
      : outcome.cleared
      ? (stars === 3 ? 'Every beat where it belongs.' : stars === 2 ? 'Steady hands.' : 'That will do nicely.')
      : `${this.spec.clearAccuracy}% in time clears this one.`);
    this.accuracy.setText(`${Math.round(accuracy)}% IN TIME`);
    this.invitation.setText(outcome.cleared ? 'TAP TO CONTINUE' : 'TAP TO TRY AGAIN');
    this.drawStars();
  }
  private drawStars(): void {
    this.stars.clear();
    if (!this.summaryShown) return;
    const { safe } = this.viewport;
    const s = this.uiScale;
    const earned = starsFor(meanAccuracy(this.results), this.spec);
    for (let k = 0; k < 3; k++) drawStar(this.stars, safe.centerX + (k - 1) * 46 * s, safe.bottom - 215 * s, 15 * s, this.definition.ink, k < earned, k < earned ? 1 : 0.35);
  }
  private leaveForMap(): void {
    this.audio?.music.setRate(1, this.audio.context.currentTime);
    this.scene.start(SceneKey.Map, { focus: this.levelCleared ? this.spec.level + 1 : this.spec.level });
  }
  private showPause(): void {
    this.vignette.pause();
    this.changeHeadline('Take a\nbreath.');
    this.caption.setText('We’ll take it from the top.');
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
    const wasRunning = this.controller !== null && this.controller.phase !== 'idle';
    this.controller?.interrupt('Paused');
    if (wasEnding || wasStarting) { this.controller?.dispose(); this.showPause(); }
    this.audio?.cancel();
    this.audio?.music.stop();
    // Freezing the idle illustration would leave it stuck until the next round begins.
    if (wasRunning || wasStarting) this.vignette.pause();
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
    this.controller = null;
    this.audio?.context.removeEventListener('statechange', this.audioState);
    // The engine and its music belong to the game (see sharedAudio); only this scene's voices stop.
    this.audio?.cancel();
    this.audio = null;
  }
}
