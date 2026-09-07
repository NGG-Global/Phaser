import Phaser from 'phaser';

/** Configuration for {@link HorizontalDragBehaviour}. */
export interface HorizontalDragOptions {
  /** Leftmost centre position the target may reach, in game units. */
  minX: number;
  /** Rightmost centre position the target may reach, in game units. */
  maxX: number;
  /** Fired when a pointer takes hold of the target. */
  onGrab?: (() => void) | undefined;
  /** Fired on every movement, with the clamped x and its 0..1 position in range. */
  onMove?: ((x: number, progress: number) => void) | undefined;
  /** Fired when the pointer lets go, including when it is lifted off-canvas. */
  onRelease?: ((x: number, progress: number) => void) | undefined;
}

/**
 * Constrains a game object to be dragged along the x axis only.
 *
 * Phaser's drag system moves an object on both axes, which is wrong for a
 * horizontal control: a thumb travelling across the screen always drifts
 * vertically, and an unconstrained object follows that drift off its track.
 * This behaviour applies the horizontal component and discards the vertical
 * one, so the object stays on its line no matter how imprecise the gesture.
 *
 * Attach one per draggable object and call {@link destroy} when the object
 * goes away — or rely on the scene shutdown wiring, which does the same.
 */
export class HorizontalDragBehaviour {
  private minX: number;
  private maxX: number;
  private dragging = false;

  public constructor(
    private readonly target: Phaser.GameObjects.Image,
    private readonly options: HorizontalDragOptions,
  ) {
    this.minX = options.minX;
    this.maxX = options.maxX;

    const scene = target.scene;
    scene.input.setDraggable(target);

    target.on(Phaser.Input.Events.GAMEOBJECT_DRAG_START, this.handleDragStart, this);
    target.on(Phaser.Input.Events.GAMEOBJECT_DRAG, this.handleDrag, this);
    target.on(Phaser.Input.Events.GAMEOBJECT_DRAG_END, this.handleDragEnd, this);
  }

  /** Whether a pointer currently holds the target. */
  public get isDragging(): boolean {
    return this.dragging;
  }

  /** The target's position within its range, from 0 (left) to 1 (right). */
  public get progress(): number {
    const span = this.maxX - this.minX;
    return span <= 0 ? 0 : Phaser.Math.Clamp((this.target.x - this.minX) / span, 0, 1);
  }

  /**
   * Updates the travel limits and re-clamps the target into them.
   *
   * Called from scene layout on every resize: the range is derived from the
   * viewport, so it changes when the device rotates or the URL bar collapses.
   */
  public setRange(minX: number, maxX: number): void {
    this.minX = Math.min(minX, maxX);
    this.maxX = Math.max(minX, maxX);
    this.target.x = this.clamp(this.target.x);
  }

  /** Moves the target to a clamped x, as a tap-to-move or programmatic set. */
  public moveTo(x: number): void {
    this.target.x = this.clamp(x);
    this.options.onMove?.(this.target.x, this.progress);
  }

  public destroy(): void {
    this.target.off(Phaser.Input.Events.GAMEOBJECT_DRAG_START, this.handleDragStart, this);
    this.target.off(Phaser.Input.Events.GAMEOBJECT_DRAG, this.handleDrag, this);
    this.target.off(Phaser.Input.Events.GAMEOBJECT_DRAG_END, this.handleDragEnd, this);
  }

  private clamp(x: number): number {
    return Phaser.Math.Clamp(x, this.minX, this.maxX);
  }

  private handleDragStart(): void {
    this.dragging = true;
    this.options.onGrab?.();
  }

  /**
   * Phaser passes the position the object would move to, already offset by
   * where within the object the pointer grabbed it. Only `dragX` is applied —
   * `dragY` is deliberately ignored to pin the target to its track.
   */
  private handleDrag(_pointer: Phaser.Input.Pointer, dragX: number): void {
    this.target.x = this.clamp(dragX);
    this.options.onMove?.(this.target.x, this.progress);
  }

  private handleDragEnd(): void {
    this.dragging = false;
    this.options.onRelease?.(this.target.x, this.progress);
  }
}
