import Phaser from 'phaser';

/** A paper sweep between screens. Presentation only: never schedules a musical event. */
export class SceneCurtain {
  private readonly graphic: Phaser.GameObjects.Graphics;
  private readonly motion = { progress: 0 };
  private busy = false;
  private disposed = false;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  public constructor(private readonly scene: Phaser.Scene, private readonly colour = 0xf4f0e2) {
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
    g.fillStyle(0xcf5134).beginPath().moveTo(edge - 12, 0).lineTo(right, 0)
      .lineTo(right + h * 0.12, h).lineTo(edge + h * 0.12 - 12, h).closePath().fillPath();
    g.fillStyle(this.colour).beginPath().moveTo(edge, 0).lineTo(right, 0)
      .lineTo(right + h * 0.12, h).lineTo(edge + h * 0.12, h).closePath().fillPath();
  }

  private dispose(): void {
    this.disposed = true;
    this.scene.tweens.killTweensOf(this.motion);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.draw, this);
    this.graphic.destroy();
  }
}
