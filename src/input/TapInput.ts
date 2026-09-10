import Phaser from 'phaser';

export interface Tap { readonly x: number; readonly y: number; readonly timestamp: number }

/** Phaser unifies mouse/touch. Preserve the native timestamp, not Pointer.downTime. */
export class TapInput {
  private held: number | null = null;
  public constructor(private readonly scene: Phaser.Scene, private readonly receive: (tap: Tap) => void) {
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.down, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.up, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.up, this);
    window.addEventListener('touchcancel', this.reset);
    window.addEventListener('pointercancel', this.reset);
    window.addEventListener('blur', this.reset);
  }
  private down(pointer: Phaser.Input.Pointer): void {
    if (this.held !== null || (!pointer.wasTouch && pointer.button !== 0)) return;
    this.held = pointer.id;
    this.receive({ x: pointer.x, y: pointer.y, timestamp: pointer.event.timeStamp });
  }
  private up(pointer: Phaser.Input.Pointer): void {
    if (this.held === pointer.id) this.held = null;
  }
  public readonly reset = (): void => { this.held = null; };
  public dispose(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.down, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.up, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.up, this);
    window.removeEventListener('touchcancel', this.reset);
    window.removeEventListener('pointercancel', this.reset);
    window.removeEventListener('blur', this.reset);
    this.reset();
  }
}
