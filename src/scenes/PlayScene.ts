import Phaser from 'phaser';

import { DEPTH, LAYOUT } from '@/config/design';
import { SceneKey } from '@/config/scenes';
import { COLORS, CSS_COLORS, FONT_FAMILY } from '@/config/theme';
import { BaseScene } from '@/core/BaseScene';
import { HorizontalDragBehaviour } from '@/input/HorizontalDragBehaviour';
import { Player } from '@/objects/Player';
import { TextureKey } from '@/textures/generateCoreTextures';

/** Player art size in design units, before viewport scaling. */
const PLAYER_DESIGN_SIZE = 148;
/** Height of the drag rail in design units. */
const TRACK_THICKNESS = 14;
/** Number of tick marks along the rail, endpoints included. Must be >= 2. */
const TRACK_TICKS = 5;
/** Duration of the tap-to-move glide. */
const TAP_MOVE_MS = 260;

/**
 * Playable test scene.
 *
 * Exercises the four things this project needs to get right before any real
 * game code is written: a portrait layout, touch input, a layout that survives
 * an arbitrary screen size, and an object that can be dragged.
 *
 * The player can be moved two ways, because a mobile game needs both: dragged
 * directly, or sent to a position by tapping the playfield. Everything is
 * positioned from `this.viewport`, so the same code covers a 4:3 tablet and a
 * 21:9 handset without branching.
 */
export class PlayScene extends BaseScene {
  private bleed!: Phaser.GameObjects.Image;
  private designPanel!: Phaser.GameObjects.Image;
  private designOutline!: Phaser.GameObjects.Graphics;
  private tapZone!: Phaser.GameObjects.Zone;
  private track!: Phaser.GameObjects.Graphics;
  private player!: Player;
  private drag!: HorizontalDragBehaviour;

  private title!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private readout!: Phaser.GameObjects.Text;
  private diagnostics!: Phaser.GameObjects.Text;

  /** Rail geometry, recomputed on every layout pass. */
  private trackY = 0;
  private trackLeft = 0;
  private trackRight = 0;

  private tapTween?: Phaser.Tweens.Tween | undefined;

  public constructor() {
    super(SceneKey.Play);
  }

  protected override build(): void {
    // Two backgrounds: the deep fill covers the whole canvas including the
    // region outside the 9:16 design box, and the panel marks the design box
    // itself. Seeing where the bleed starts is the quickest way to catch a
    // layout that only works at one aspect ratio.
    this.bleed = this.add
      .image(0, 0, TextureKey.Pixel)
      .setOrigin(0, 0)
      .setTint(COLORS.bleed)
      .setDepth(DEPTH.background);

    this.designPanel = this.add
      .image(0, 0, TextureKey.Pixel)
      .setOrigin(0, 0)
      .setTint(COLORS.background)
      .setDepth(DEPTH.background);

    this.designOutline = this.add.graphics().setDepth(DEPTH.background);

    // Catches taps that miss the player. `topOnly` (Phaser's default) means the
    // player consumes its own touches, so grabbing it never also fires a tap.
    this.tapZone = this.add
      .zone(0, 0, 1, 1)
      .setOrigin(0, 0)
      .setDepth(DEPTH.background);
    this.tapZone.setInteractive();
    this.tapZone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.handleTap, this);

    this.track = this.add.graphics().setDepth(DEPTH.track);

    this.title = this.add
      .text(0, 0, 'Phaser 4 · Mobile Starter', {
        fontFamily: FONT_FAMILY,
        fontSize: '34px',
        fontStyle: '600',
        color: CSS_COLORS.text,
      })
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud);

    this.hint = this.add
      .text(0, 0, 'Drag the block, or tap anywhere to send it there.', {
        fontFamily: FONT_FAMILY,
        fontSize: '24px',
        color: CSS_COLORS.textMuted,
        wordWrap: { width: 100 }, // replaced in layout, once the width is known
      })
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud);

    this.readout = this.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '30px',
        fontStyle: '600',
        color: CSS_COLORS.accent,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.hud);

    this.diagnostics = this.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: CSS_COLORS.textMuted,
        lineSpacing: 6,
      })
      .setOrigin(0, 1)
      .setDepth(DEPTH.debug);

    this.player = this.player ?? new Player(this, 0, 0);
    this.player.setDepth(DEPTH.player);

    // Pressing the player is fed back visually before any movement happens, so
    // a touch feels acknowledged even if the finger has not moved yet.
    this.player.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.stopTapGlide();
      this.player.press();
    });
    this.player.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.player.release());
    this.player.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.player.release());

    this.drag = new HorizontalDragBehaviour(this.player, {
      minX: 0,
      maxX: 0,
      onGrab: () => {
        this.stopTapGlide();
        this.player.press();
      },
      onMove: (_x, progress) => this.updateReadout(progress),
      onRelease: (_x, progress) => {
        this.player.release();
        this.updateReadout(progress);
      },
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.drag.destroy();
      this.stopTapGlide();
    });
  }

  protected override layout(): void {
    const { full, content, designBox } = this.viewport;

    this.bleed.setPosition(full.left, full.top).setDisplaySize(full.width, full.height);

    this.designPanel
      .setPosition(designBox.left, designBox.top)
      .setDisplaySize(designBox.width, designBox.height);

    this.designOutline.clear();
    this.designOutline.lineStyle(2, COLORS.surfaceRaised, 1);
    this.designOutline.strokeRect(
      designBox.left,
      designBox.top,
      designBox.width,
      designBox.height,
    );

    this.tapZone.setPosition(full.left, full.top).setSize(full.width, full.height);
    // A Zone's hit area is not rebuilt by `setSize`, so it is resized too.
    this.tapZone.input?.hitArea?.setTo(0, 0, full.width, full.height);

    // Header sits inside the content frame, which already excludes the notch.
    this.title.setPosition(content.left, content.top);
    this.hint
      .setPosition(content.left, content.top + this.title.height + 12)
      .setWordWrapWidth(content.width);

    /*
     * The rail is placed a fixed distance from the bottom edge rather than at a
     * fraction of the height. Thumb reach is an absolute distance from where
     * the hand grips the device, so a proportional offset would push the
     * control out of reach on a tall handset. It is then clamped so it can
     * never collide with the header on a short screen.
     */
    const preferredY = content.bottom - this.viewport.scaled(LAYOUT.trackOffsetFromBottom);
    const minY = content.top + this.viewport.scaled(LAYOUT.headerHeight);
    this.trackY = Math.max(minY, Math.min(preferredY, content.bottom));

    const playerSize = this.viewport.scaled(PLAYER_DESIGN_SIZE);
    this.player.resize(playerSize, this.viewport.touchTarget(playerSize));

    // The rail is inset by half the player so the player's edges stay inside
    // the content frame at both extremes of travel.
    this.trackLeft = content.left + playerSize / 2;
    this.trackRight = content.right - playerSize / 2;

    this.drawTrack();

    const progressBefore = this.drag.progress;
    this.drag.setRange(this.trackLeft, this.trackRight);
    this.player.setY(this.trackY);

    // Preserve where the player sat relative to the rail across a resize,
    // instead of letting a clamp snap it to an edge.
    this.drag.moveTo(this.trackLeft + (this.trackRight - this.trackLeft) * progressBefore);

    this.readout.setPosition(content.centerX, this.trackY - playerSize * 0.72);
    this.diagnostics.setPosition(content.left, content.bottom);

    this.updateReadout(this.drag.progress);
    this.updateDiagnostics();
  }

  protected override onResize(): void {
    this.updateDiagnostics();
  }

  /** Redraws the rail and its tick marks for the current geometry. */
  private drawTrack(): void {
    const thickness = this.viewport.scaled(TRACK_THICKNESS, 2);
    const width = this.trackRight - this.trackLeft;

    this.track.clear();

    if (width <= 0) {
      return;
    }

    this.track.fillStyle(COLORS.track, 1);
    this.track.fillRoundedRect(
      this.trackLeft,
      this.trackY - thickness / 2,
      width,
      thickness,
      thickness / 2,
    );

    this.track.fillStyle(COLORS.trackEdge, 1);
    const tickWidth = Math.max(2, thickness * 0.25);
    const tickHeight = thickness * 2.4;

    for (let i = 0; i < TRACK_TICKS; i += 1) {
      const t = i / (TRACK_TICKS - 1);
      this.track.fillRect(
        this.trackLeft + width * t - tickWidth / 2,
        this.trackY - tickHeight / 2,
        tickWidth,
        tickHeight,
      );
    }
  }

  /**
   * Sends the player to a tapped x with a short glide.
   *
   * Tapping is a first-class way to move on a touch screen — reaching across a
   * large phone to drag is uncomfortable — and the glide keeps the change of
   * position readable rather than teleporting.
   */
  private handleTap(pointer: Phaser.Input.Pointer): void {
    // `worldX` is in game units; `pointer.x` would be in canvas pixels.
    const targetX = Phaser.Math.Clamp(pointer.worldX, this.trackLeft, this.trackRight);

    this.stopTapGlide();
    this.player.press();

    this.tapTween = this.tweens.add({
      targets: this.player,
      x: targetX,
      duration: TAP_MOVE_MS,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.updateReadout(this.drag.progress),
      onComplete: () => {
        this.tapTween = undefined;
        this.player.release();
        this.updateReadout(this.drag.progress);
      },
    });
  }

  /** Cancels an in-flight tap glide so a touch always takes precedence. */
  private stopTapGlide(): void {
    this.tapTween?.remove();
    this.tapTween = undefined;
  }

  private updateReadout(progress: number): void {
    this.readout.setText(`${Math.round(progress * 100)}%`);
  }

  /**
   * On-screen viewport diagnostics.
   *
   * Deliberately part of the test scene: these are the numbers needed to work
   * out why a layout looks wrong on a specific handset, and on a real device
   * there is no console to read them from.
   */
  private updateDiagnostics(): void {
    const { width, height, insets, unitScale, designScale } = this.viewport;
    const display = this.scale.displaySize;
    const dpr = window.devicePixelRatio;
    const hasInsets = insets.top + insets.right + insets.bottom + insets.left > 0;

    this.diagnostics.setText([
      `logical  ${Math.round(width)} x ${Math.round(height)}  (${(width / height).toFixed(3)})`,
      `css      ${Math.round(display.width)} x ${Math.round(display.height)}  dpr ${dpr.toFixed(2)}`,
      `scale    design x${designScale.toFixed(3)}  unit x${unitScale.toFixed(3)}`,
      hasInsets
        ? `insets   ${Math.round(insets.top)} / ${Math.round(insets.right)} / ${Math.round(insets.bottom)} / ${Math.round(insets.left)}`
        : 'insets   none',
    ]);
  }
}
