import Phaser from 'phaser';

import { DESIGN_WIDTH } from '@/config/design';
import { SceneKey } from '@/config/scenes';
import { COLORS, CSS_COLORS, FONT_FAMILY } from '@/config/theme';
import { hideBootOverlay } from '@/core/shell';
import { generateCoreTextures } from '@/textures/generateCoreTextures';
import { generateMaterials } from '@/textures/materials';
import { generateFeedbackTextures } from '@/ui/feedback';

/** Family name, relative URL, and the variable font's weight range for `font-weight` matching. */
const FONTS: readonly (readonly [string, string, string])[] = [
  ['Fredoka', 'fonts/fredoka/Fredoka.ttf', '300 700'],
  ['Quicksand', 'fonts/quicksand/Quicksand.ttf', '300 700'],
  ['Baloo 2', 'fonts/baloo2/Baloo2.ttf', '400 800'],
  ['Nunito', 'fonts/nunito/Nunito.ttf', '200 1000'],
];

const BAR_WIDTH = DESIGN_WIDTH * 0.62;
const BAR_HEIGHT = 8;

/**
 * Asset loading, with an in-canvas progress bar.
 *
 * The project ships no binary assets yet, so the loader queue is empty and this
 * scene completes in a single frame. It exists in full anyway: the progress UI
 * and the ordering around {@link generateCoreTextures} are what real assets
 * will need, and wiring that up later against a live loader is more error-prone
 * than keeping the shape now.
 */
export class PreloadScene extends Phaser.Scene {
  public constructor() {
    super(SceneKey.Preload);
  }

  public preload(): void {
    this.createProgressBar();

    // Textures are generated here rather than in `create` so they are in the
    // cache before any scene that draws them starts.
    generateCoreTextures(this);
    generateMaterials(this);
    generateFeedbackTextures(this);

    // The bundled typefaces, all SIL Open Font Licence, with each family's OFL.txt beside
    // it. Registered as FontFaces before Menu builds, because Phaser Text rasterises at
    // creation and will not reflow when a font arrives later. Relative paths: the APK
    // serves from a file origin where an absolute `/fonts/...` would 404.
    for (const [family, url, weight] of FONTS) {
      this.load.font({ key: family, url, format: 'truetype', descriptors: { weight, style: 'normal' } });
    }
  }

  public create(): void {
    // The DOM boot panel stays up until a scene is genuinely on screen, so a
    // slow first paint never shows a blank canvas.
    hideBootOverlay();

    this.scene.start(SceneKey.Menu);
  }

  /**
   * Draws a progress bar centred in the canvas.
   *
   * Positioned against the live canvas size rather than the design constants,
   * since this scene can be on screen while the Scale Manager is still
   * settling on Android Chrome's first layout pass.
   */
  private createProgressBar(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    this.add
      .text(centerX, centerY - 40, 'Loading', {
        fontFamily: FONT_FAMILY,
        fontSize: '28px',
        color: CSS_COLORS.textMuted,
      })
      .setOrigin(0.5);

    const track = this.add.graphics();
    track.fillStyle(COLORS.surface, 1);
    track.fillRoundedRect(
      centerX - BAR_WIDTH / 2,
      centerY,
      BAR_WIDTH,
      BAR_HEIGHT,
      BAR_HEIGHT / 2,
    );

    const fill = this.add.graphics();

    const redraw = (progress: number): void => {
      fill.clear();

      if (progress <= 0) {
        return;
      }

      fill.fillStyle(COLORS.accent, 1);
      fill.fillRoundedRect(
        centerX - BAR_WIDTH / 2,
        centerY,
        Math.max(BAR_HEIGHT, BAR_WIDTH * progress),
        BAR_HEIGHT,
        BAR_HEIGHT / 2,
      );
    };

    this.load.on(Phaser.Loader.Events.PROGRESS, redraw);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.load.off(Phaser.Loader.Events.PROGRESS, redraw);
    });

    redraw(this.load.progress);
  }
}
