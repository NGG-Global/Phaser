import Phaser from 'phaser';
import { shade } from './colour';
import { STYLE } from '@/config/style';
import { PALETTE } from '@/config/theme';
import { reducedMotion } from '@/core/motionPreference';

/**
 * A card slid across the bench between screens. Presentation only: never schedules a
 * musical event.
 *
 * Three sheared bands: an ink edge, the coral card edge behind it, then the paper face.
 * Only fills are used — `tests/sceneCurtain.test.ts` doubles the Graphics object with
 * exactly the methods `draw` calls, so a stroke here would fail every test in that file
 * rather than just the one it changed.
 */
export class SceneCurtain {
  private readonly graphic: Phaser.GameObjects.Graphics;
  private readonly motion = { progress: 0 };
  private busy = false;
  private disposed = false;
  /** Read when a sweep starts, so a preference change applies to the next transition. */
  private get reduced(): boolean { return reducedMotion(); }

  // A hair lighter than the paper it slides over, or the card and the bench are the
  // same colour and the sweep reads as a fade rather than as an object crossing.
  public constructor(private readonly scene: Phaser.Scene, private readonly colour: number = shade(PALETTE.paper, 0.05)) {
    this.graphic = scene.add.graphics().setScrollFactor(0).setDepth(1000);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.draw, this);
  }

  public get active(): boolean { return this.busy; }

  public reveal(done?: () => void): void { this.run(1, 2, done); }
  public cover(done: () => void): void {
    if (!this.busy) this.run(0, 1, done);
  }

  private run(from: number, to: number, done?: () => void): void {
    if (this.disposed) return;
    this.scene.tweens.killTweensOf(this.motion);
    this.busy = true;
    this.motion.progress = from;
    this.draw();
    this.scene.tweens.add({
      targets: this.motion, progress: to, duration: this.reduced ? 1 : 320,
      ease: 'Cubic.InOut',
      onComplete: () => {
        if (this.disposed) return;
        // ScenePlugin.start is queued. Keep the outgoing scene covered until
        // shutdown, otherwise its last frame flashes between the two sweeps.
        this.draw();
        if (to === 2) { this.busy = false; this.graphic.clear(); }
        done?.();
      },
    });
  }

  private draw(): void {
    if (!this.busy) return;
    const w = this.scene.scale.width, h = this.scene.scale.height;
    const p = this.motion.progress;
    const edge = (p <= 1 ? (1 - p) * (w + h * 0.12) : -(p - 1) * (w + h * 0.12)) - h * 0.12;
    const right = p <= 1 ? w + h * 0.12 : w - (p - 1) * (w + h * 0.12);
    const g = this.graphic.clear();
    // Band widths track the treatment's outline weight, so the card's edge is as heavy
    // as every other edge in the game.
    const ink = STYLE.current.outline * 0.8;
    const coral = STYLE.current.outline * 1.9;
    const band = (offset: number, colour: number): void => {
      g.fillStyle(colour).beginPath().moveTo(edge - offset, 0).lineTo(right, 0)
        .lineTo(right + h * 0.12, h).lineTo(edge + h * 0.12 - offset, h).closePath().fillPath();
    };
    band(ink + coral, shade(PALETTE.ink, -0.2));
    band(coral, PALETTE.coral);
    band(0, this.colour);
  }

  private dispose(): void {
    this.disposed = true;
    this.scene.tweens.killTweensOf(this.motion);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.draw, this);
    this.graphic.destroy();
  }
}
