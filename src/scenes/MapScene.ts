import Phaser from 'phaser';
import { sharedAudio, currentAudio } from '@/audio/sharedAudio';
import { PROGRESSION } from '@/config/progression';
import { SceneKey } from '@/config/scenes';
import { BaseScene } from '@/core/BaseScene';
import { areaOf, levelSpec, starsFor, type Area } from '@/game/levels';
import { loadProgress, type Progress } from '@/game/progress';
import { hex, mix, shade } from '@/ui/colour';
import { dashes, smoothPath, type Point } from '@/ui/path';
import { drawStar } from '@/ui/star';

/** Design-unit metrics of the road map; every one is multiplied by the viewport scale. */
const MAP = {
  step: 176, nodeRadius: 42, wobble: 0.29, topPad: 320, bottomPad: 250,
  roadWidth: 58, tapSlop: 14, friction: 5,
  /** Spline samples per level span. Enough that the curve reads smooth at any width. */
  smoothing: 14,
  /** Vertical offset of every cast shadow: one light source, high and to the left. */
  shadowDrop: 9,
  /** Bands used for the haze ramp up each area and for the blend across a boundary. */
  hazeBands: 12, blendBands: 9, blendHeight: 120,
  /**
   * The map renders a window, not the whole road. It used to build one Phaser Text per
   * level from level 1, so a deep — or corrupt — frontier allocated thousands of them
   * on every entry and re-laid them out on every resize.
   */
  window: 48, history: 20,
} as const;

/**
 * Endless, scrollable road of levels grouped into themed areas. Pure presentation of
 * `levelSpec`/`Progress`: the map never decides difficulty, it only draws it.
 *
 * Everything except the pulse and the touch ripple is baked in `layout()`, so the depth
 * work — the raised road, cast shadows, terrain and scenery — costs nothing per frame.
 */
export class MapScene extends BaseScene {
  private progress!: Progress;
  private shown = 0;
  /** Lowest level rendered. Node i is level `first + i`. */
  private first = 1;
  private firstBand = 0;
  private world!: Phaser.GameObjects.Graphics;
  private pulse!: Phaser.GameObjects.Graphics;
  private touch!: Phaser.GameObjects.Graphics;
  private frame!: Phaser.GameObjects.Graphics;
  private hudBack!: Phaser.GameObjects.Graphics;
  private edition!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private menu!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private numbers: Phaser.GameObjects.Text[] = [];
  private areaTitles: Phaser.GameObjects.Text[] = [];
  private areaRanges: Phaser.GameObjects.Text[] = [];
  private nodes: Point[] = [];
  private road: Point[] = [];
  private uiScale = 1;
  private controlSize = 96;
  private worldHeight = 0;
  private hudHeight = 0;
  private scrollY = 0;
  private velocity = 0;
  private drag: { lastY: number; lastAt: number; startX: number; startY: number; moved: boolean } | null = null;
  private touchAt = -Infinity;
  private touchPoint = { x: 0, y: 0 };
  private focus = 1;
  private centered = false;
  private disposed = false;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  public constructor() { super(SceneKey.Map); }

  protected override build(): void {
    this.disposed = false;
    this.centered = false;
    this.progress = loadProgress();
    const data = this.sys.settings.data as { focus?: number } | undefined;
    this.focus = Math.max(1, Math.min(this.progress.unlocked, data?.focus ?? this.progress.unlocked));
    const top = this.progress.unlocked + PROGRESSION.mapLookahead;
    this.first = Math.max(1, Math.min(this.focus - MAP.history, top - MAP.window + 1));
    this.shown = Math.min(top, this.first + MAP.window - 1) - this.first + 1;
    this.world = this.add.graphics();
    this.pulse = this.add.graphics().setDepth(4);
    this.touch = this.add.graphics().setDepth(5);
    this.numbers = Array.from({ length: this.shown }, (_, i) => this.add.text(0, 0, String(this.first + i), { fontFamily: 'Georgia, serif', fontSize: '32px' }).setOrigin(0.5).setDepth(3));
    // Bands are addressed absolutely, because the window rarely starts on a band edge.
    this.firstBand = Math.floor((this.first - 1) / PROGRESSION.areaSize);
    const areas = Math.floor((this.first + this.shown - 2) / PROGRESSION.areaSize) - this.firstBand + 1;
    this.areaTitles = Array.from({ length: areas }, () => this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '40px' }).setOrigin(0, 0.5).setDepth(2));
    this.areaRanges = Array.from({ length: areas }, () => this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '15px' }).setLetterSpacing(2).setOrigin(0, 0.5).setDepth(2));
    // Frames the scrolling strip; fixed to the camera so it reads as the window, not the world.
    this.frame = this.add.graphics().setScrollFactor(0).setDepth(6);
    this.hudBack = this.add.graphics().setScrollFactor(0).setDepth(10);
    const hud = (value: string, size: number, font: string) => this.add.text(0, 0, value, { fontFamily: font, fontSize: `${size}px`, color: '#2b3a2f' }).setScrollFactor(0).setDepth(11);
    this.edition = hud('TINY TEMPO', 16, 'monospace').setLetterSpacing(2);
    this.status = hud('', 15, 'monospace').setLetterSpacing(2);
    this.menu = hud('MENU', 14, 'monospace').setLetterSpacing(2).setOrigin(0.5);
    this.mute = hud(currentAudio(this)?.muted ? '×' : '♪', 30, 'Georgia, serif').setOrigin(0.5);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  /** Deterministic per index, so the terrain and scenery are identical on every layout. */
  private static noise(seed: number): number {
    let t = (seed * 0x9e3779b1 + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  protected override layout(): void {
    const { safe, full } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1150);
    this.uiScale = s;
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    this.hudHeight = safe.top + 104 * s;
    this.worldHeight = (MAP.topPad + MAP.bottomPad + (this.shown - 1) * MAP.step) * s + this.hudHeight;
    // Level 1 sits at the bottom; the road climbs. x wanders left and right inside the safe frame.
    this.nodes = Array.from({ length: this.shown }, (_, i) => ({
      x: safe.centerX + Math.sin((this.first + i) * 0.9) * safe.width * MAP.wobble,
      y: this.worldHeight - (MAP.bottomPad + i * MAP.step) * s,
    }));
    // The road runs one span past the last node so it leaves the frame rather than stopping.
    const beyond: Point = { x: safe.centerX + Math.sin((this.first + this.shown) * 0.9) * safe.width * MAP.wobble, y: (this.nodes[this.shown - 1]?.y ?? 0) - MAP.step * s };
    this.road = smoothPath([...this.nodes, beyond], MAP.smoothing);
    const g = this.world.clear();
    this.drawTerrain(g, s);
    this.drawRoad(g, s);
    this.drawScenery(g, s);
    this.drawPlaques(g, s);
    this.drawNodes(g, s);
    this.drawFrame(s);
    this.drawHud(s);
    this.cameras.main.setBounds(0, 0, full.width, this.worldHeight);
    if (!this.centered) { this.centered = true; this.scrollTo(this.focus); }
    this.clampScroll();
  }

  /**
   * One rendered band: the part of absolute area `firstBand + k` that falls inside the
   * window, as node indices, plus the area's own full level range for its sign.
   */
  private band(k: number): { area: Area; name: string; from: number; to: number; atBottom: boolean; atTop: boolean; range: readonly [number, number] } {
    const size = PROGRESSION.areaSize;
    const absolute = this.firstBand + k;
    const last = this.first + this.shown - 1;
    const startLevel = Math.max(this.first, absolute * size + 1);
    const endLevel = Math.min(last, (absolute + 1) * size);
    const { area, name } = areaOf(absolute * size + 1);
    return {
      area, name,
      from: startLevel - this.first,
      to: endLevel - this.first,
      atBottom: startLevel <= this.first,
      atTop: endLevel >= last,
      range: [absolute * size + 1, (absolute + 1) * size] as const,
    };
  }

  /** Ground, haze up each area, a soft blend at every boundary, and per-area texture. */
  private drawTerrain(g: Phaser.GameObjects.Graphics, s: number): void {
    const { full } = this.viewport;
    const size = PROGRESSION.areaSize;
    for (let k = 0; k < this.areaTitles.length; k++) {
      const band = this.band(k);
      const area = band.area;
      const first = this.nodes[band.from]!;
      const last = this.nodes[band.to]!;
      const isLast = band.atTop;
      const top = isLast ? 0 : last.y - MAP.step * s / 2;
      const bottom = band.atBottom ? this.worldHeight : first.y + MAP.step * s / 2;
      const height = bottom - top;
      g.fillStyle(area.ground).fillRect(full.x, top, full.width, height);
      // Atmospheric recession: the far end of a band hazes toward its own sky colour.
      for (let b = 0; b < MAP.hazeBands; b++) {
        const t = b / MAP.hazeBands;
        const bandTop = top + height * t * 0.55;
        g.fillStyle(mix(area.ground, area.sky, 0.32 * (1 - t)), 1);
        g.fillRect(full.x, bandTop, full.width, height * 0.55 / MAP.hazeBands + 1);
      }
      this.drawTexture(g, area, this.firstBand + k, top, bottom, s);
      if (!isLast) {
        const next = areaOf((this.firstBand + k + 1) * size + 1).area;
        const blend = MAP.blendHeight * s;
        const hazed = mix(area.ground, area.sky, 0.32);
        for (let b = 0; b < MAP.blendBands; b++) {
          const t = b / MAP.blendBands;
          // t = 0 is the boundary itself, so it starts on the neighbour's ground and
          // walks back into this area's. The other way round paints a slab.
          g.fillStyle(mix(next.ground, hazed, t), 1);
          g.fillRect(full.x, top + blend * t, full.width, blend / MAP.blendBands + 1);
        }
      }
    }
  }

  /** Plaques are drawn after the scenery, or a prop lands on top of the name. */
  private drawPlaques(g: Phaser.GameObjects.Graphics, s: number): void {
    for (let k = 0; k < this.areaTitles.length; k++) {
      const band = this.band(k);
      const first = this.nodes[band.from]!;
      this.placePlaque(g, band.area, band.name, k, band.atBottom ? this.worldHeight : first.y + MAP.step * s / 2, s, band.range);
    }
  }

  /** A quiet repeating motif per area, so a band reads as ground rather than paint. */
  private drawTexture(g: Phaser.GameObjects.Graphics, area: Area, band: number, top: number, bottom: number, s: number): void {
    const kind = band % 5;
    const ink = shade(area.ground, -0.14);
    const pale = shade(area.ground, 0.16);
    const rows = Math.max(1, Math.floor((bottom - top) / (76 * s)));
    for (let r = 0; r < rows; r++) {
      const y = bottom - (r + 0.5) * (bottom - top) / rows;
      const jitter = MapScene.noise(band * 97 + r);
      for (let c = 0; c < 5; c++) {
        const x = this.viewport.full.x + (c + 0.5 + (MapScene.noise(band * 31 + r * 7 + c) - 0.5) * 0.6) * this.viewport.full.width / 5;
        // Keep the motif off the road so it never fights the ribbon for attention.
        if (Math.abs(x - this.roadXAt(y)) < MAP.roadWidth * s * 1.3) continue;
        const n = MapScene.noise(band * 13 + r * 5 + c);
        if (kind === 0) {
          g.lineStyle(2.5 * s, ink, 0.5);
          for (let t = -1; t <= 1; t++) g.lineBetween(x + t * 7 * s, y + 6 * s, x + t * 10 * s, y - (10 + n * 8) * s);
        } else if (kind === 1) {
          // Staggered slabs, courses offset by row, so it reads as laid paving.
          const off = (r % 2 ? 26 : -8) * s;
          g.fillStyle(shade(area.ground, -0.07), 0.5).fillRoundedRect(x - 36 * s + off, y - 17 * s, 70 * s, 33 * s, 4 * s);
          g.fillStyle(pale, 0.28).fillRect(x - 33 * s + off, y - 14 * s, 64 * s, 3 * s);
        } else if (kind === 2) {
          g.lineStyle(2.4 * s, ink, 0.32);
          g.beginPath();
          for (let a = 0; a <= 8; a++) g[a === 0 ? 'moveTo' : 'lineTo'](x - 36 * s + a * 9 * s, y + Math.sin(a * 0.8 + jitter * 6) * 5 * s);
          g.strokePath();
        } else if (kind === 3) {
          g.fillStyle(pale, 0.7).fillEllipse(x, y, (56 + n * 30) * s, 17 * s, 10);
        } else {
          g.fillStyle(shade(area.ground, -0.22), 0.55).fillEllipse(x, y, (18 + n * 12) * s, (11 + n * 5) * s, 8);
          g.fillStyle(pale, 0.35).fillEllipse(x - 3 * s, y - 3 * s, 8 * s, 5 * s, 6);
        }
      }
    }
  }

  /**
   * Road x at a world y. Node y is linear in the level index and the spline samples it
   * uniformly, so the index inverts directly — a scan here would be quadratic against
   * the terrain cells that call it.
   */
  private roadXAt(y: number): number {
    if (this.road.length === 0) return this.viewport.safe.centerX;
    const s = this.uiScale;
    const level = (this.worldHeight - MAP.bottomPad * s - y) / (MAP.step * s);
    const index = Math.round(level * MAP.smoothing);
    return (this.road[Math.max(0, Math.min(this.road.length - 1, index))] ?? this.road[0]!).x;
  }

  /** A plate for the area name, on whichever side of the road has room for it. */
  private placePlaque(g: Phaser.GameObjects.Graphics, area: Area, name: string, index: number, bottom: number, s: number, levels: readonly [number, number]): void {
    const { safe } = this.viewport;
    const y = bottom - 66 * s;
    const roadX = this.roadXAt(y);
    const onLeft = roadX > safe.centerX;
    const h = 74 * s;
    // Size the plate to its own text: area names are authored, and a long one overflowed.
    const title = this.areaTitles[index]!.setText(name.toUpperCase()).setFontSize(30 * s);
    const range = this.areaRanges[index]!.setText(`LEVELS ${levels[0]}–${levels[1]}`).setFontSize(13 * s);
    const pad = 52 * s;
    const w = Math.min(safe.width - 36 * s, Math.max(206 * s, Math.max(title.width, range.width) + pad));
    // Repeat areas gain a numeral (GRASS VIII), so shrink rather than overflow the plate.
    if (title.width > w - pad) title.setFontSize(30 * s * (w - pad) / title.width);
    const x = onLeft ? safe.left + 18 * s : safe.right - 18 * s - w;
    const plate = shade(area.paper, -0.02);
    g.fillStyle(shade(area.ground, -0.3), 0.22).fillRoundedRect(x + 3 * s, y - h / 2 + MAP.shadowDrop * s * 0.7, w, h, 16 * s);
    g.fillStyle(plate, 0.94).fillRoundedRect(x, y - h / 2, w, h, 16 * s);
    g.lineStyle(2 * s, area.ink, 0.28).strokeRoundedRect(x, y - h / 2, w, h, 16 * s);
    g.fillStyle(area.ink, 0.9).fillRoundedRect(x, y - h / 2 + 12 * s, 5 * s, h - 24 * s, 3 * s);
    title.setPosition(x + 22 * s, y - 13 * s).setColor(hex(area.ink)).setAlpha(1);
    range.setPosition(x + 22 * s, y + 18 * s).setColor(hex(area.ink)).setAlpha(0.62);
  }

  /** The ribbon: a dropped shadow, the surface, a top sheen and dashed markings. */
  private drawRoad(g: Phaser.GameObjects.Graphics, s: number): void {
    const width = MAP.roadWidth * s;
    const stroke = (path: readonly Point[], w: number, colour: number, alpha: number, dy = 0): void => {
      g.lineStyle(w, colour, alpha);
      g.beginPath();
      path.forEach((p, i) => g[i === 0 ? 'moveTo' : 'lineTo'](p.x, p.y + dy));
      g.strokePath();
    };
    const { area: base } = areaOf(1);
    // One shadow for the whole ribbon, offset like every other cast shadow on the map.
    stroke(this.road, width + 10 * s, shade(base.ground, -0.55), 0.2, MAP.shadowDrop * s);
    const surface = (slice: readonly Point[], colour: number): void => {
      if (slice.length < 2) return;
      stroke(slice, width + 6 * s, shade(colour, -0.34), 1);
      stroke(slice, width, colour, 1);
      stroke(slice, width * 0.42, shade(colour, 0.14), 0.5, -width * 0.24);
    };
    // One stretch per level. A span that crosses an area boundary is split at its
    // midpoint, which is exactly where the ground changes, so surface and terrain
    // change on the same line instead of a node apart.
    for (let i = 0; i < this.shown; i++) {
      const from = Math.max(0, i * MAP.smoothing - 1);
      const to = i * MAP.smoothing + MAP.smoothing + 1;
      const here = areaOf(this.first + i).area.road;
      const next = areaOf(this.first + i + 1).area.road;
      if (here === next) { surface(this.road.slice(from, to), here); continue; }
      const mid = i * MAP.smoothing + Math.floor(MAP.smoothing / 2);
      surface(this.road.slice(from, mid + 1), here);
      surface(this.road.slice(mid, to), next);
    }
    for (const [from, to] of dashes(this.road, 26 * s, 30 * s)) {
      g.lineStyle(4 * s, 0xffffff, 0.45).lineBetween(from.x, from.y, to.x, to.y);
    }
  }

  /** Props beside the road, each with a cast shadow. The shadows are the depth. */
  private drawScenery(g: Phaser.GameObjects.Graphics, s: number): void {
    const { safe } = this.viewport;
    for (let i = 0; i < this.shown; i++) {
      const node = this.nodes[i]!;
      const y = node.y - MAP.step * s * 0.5;
      const roadX = this.roadXAt(y);
      const level = this.first + i;
      const { area } = areaOf(level);
      const kind = Math.floor((level - 1) / PROGRESSION.areaSize) % 5;
      const gapLeft = roadX - safe.left;
      const gapRight = safe.right - roadX;
      const sides: number[] = [];
      if (gapLeft > 150 * s) sides.push(-1);
      if (gapRight > 150 * s) sides.push(1);
      for (const side of sides) {
        const n = MapScene.noise(i * 17 + (side > 0 ? 3 : 11));
        if (n < 0.46) continue;
        const edge = side < 0 ? safe.left : safe.right;
        const x = edge - side * (52 + n * 40) * s;
        if (Math.abs(x - roadX) < MAP.roadWidth * s * 1.6) continue;
        const variant = MapScene.noise(i * 23 + (side > 0 ? 5 : 19)) < 0.5 ? 0 : 1;
        this.prop(g, kind, variant, x, y + (n - 0.5) * 46 * s, (0.74 + n * 0.62) * s, area);
      }
    }
  }

  /** Two silhouettes per area, so a band has variety without a sprite sheet. */
  private prop(g: Phaser.GameObjects.Graphics, kind: number, variant: number, x: number, y: number, k: number, area: Area): void {
    const ink = shade(area.ink, 0.06);
    const drop = MAP.shadowDrop * k;
    const quad = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): void => {
      g.fillTriangle(ax, ay, bx, by, cx, cy);
      g.fillTriangle(ax, ay, cx, cy, dx, dy);
    };
    g.fillStyle(shade(area.ground, -0.45), 0.2).fillEllipse(x + 6 * k, y + drop, (variant ? 62 : 74) * k, 19 * k, 10);
    if (kind === 0 && variant === 0) {
      // Pine: stacked canopy, each tier hazed a little further toward the sky.
      g.fillStyle(shade(0x4a6b3a, -0.15)).fillRect(x - 5 * k, y - 26 * k, 10 * k, 28 * k);
      for (let t = 0; t < 3; t++) {
        const w = (52 - t * 12) * k;
        const cy = y - (26 + t * 30) * k;
        g.fillStyle(mix(0x4a6b3a, area.sky, t * 0.14)).fillTriangle(x - w / 2, cy, x + w / 2, cy, x, cy - 42 * k);
      }
      g.fillStyle(0xffffff, 0.16).fillTriangle(x - 22 * k, y - 26 * k, x - 4 * k, y - 26 * k, x - 13 * k, y - 62 * k);
    } else if (kind === 0) {
      // Round bush, to break up a run of conifers.
      g.fillStyle(shade(0x4a6b3a, -0.2)).fillRect(x - 4 * k, y - 16 * k, 8 * k, 18 * k);
      g.fillStyle(0x5b7d45).fillCircle(x - 14 * k, y - 28 * k, 19 * k);
      g.fillStyle(0x5b7d45).fillCircle(x + 13 * k, y - 24 * k, 16 * k);
      g.fillStyle(mix(0x5b7d45, area.sky, 0.1)).fillCircle(x - 1 * k, y - 42 * k, 22 * k);
      g.fillStyle(0xffffff, 0.14).fillCircle(x - 8 * k, y - 50 * k, 9 * k);
    } else if (kind === 1 && variant === 0) {
      // Street lamp: the only tall vertical in a flat band, so it sells the light direction.
      g.fillStyle(ink).fillRect(x - 4 * k, y - 106 * k, 8 * k, 106 * k);
      g.fillStyle(ink).fillEllipse(x, y, 24 * k, 8 * k, 8);
      g.fillStyle(0xf6e6bc, 0.18).fillTriangle(x, y - 96 * k, x - 40 * k, y + 4 * k, x + 40 * k, y + 4 * k);
      g.fillStyle(ink);
      quad(x - 5 * k, y - 128 * k, x + 5 * k, y - 128 * k, x + 19 * k, y - 104 * k, x - 19 * k, y - 104 * k);
      g.fillStyle(0xf6e6bc, 0.95).fillRoundedRect(x - 14 * k, y - 106 * k, 28 * k, 7 * k, 3 * k);
    } else if (kind === 1) {
      // Bollard and litter bin: low street furniture at kerb height.
      g.fillStyle(ink).fillRoundedRect(x - 26 * k, y - 46 * k, 20 * k, 48 * k, 6 * k);
      g.fillStyle(shade(ink, 0.3), 0.5).fillRect(x - 22 * k, y - 40 * k, 4 * k, 36 * k);
      g.fillStyle(shade(area.ground, -0.32)).fillRoundedRect(x + 2 * k, y - 34 * k, 30 * k, 36 * k, 5 * k);
      g.fillStyle(ink, 0.8).fillRoundedRect(x, y - 38 * k, 34 * k, 7 * k, 3 * k);
    } else if (kind === 2 && variant === 0) {
      // Cactus.
      const green = 0x6f8f5a;
      g.fillStyle(green).fillRoundedRect(x - 11 * k, y - 96 * k, 22 * k, 96 * k, 11 * k);
      g.fillStyle(green).fillRoundedRect(x + 6 * k, y - 74 * k, 26 * k, 15 * k, 7 * k);
      g.fillStyle(green).fillRoundedRect(x + 19 * k, y - 96 * k, 14 * k, 30 * k, 7 * k);
      g.fillStyle(shade(green, 0.22), 0.7).fillRoundedRect(x - 7 * k, y - 90 * k, 5 * k, 78 * k, 3 * k);
    } else if (kind === 2) {
      // Rock cluster with a dry shrub.
      const rock = shade(area.ground, -0.3);
      g.fillStyle(rock).fillEllipse(x - 12 * k, y - 14 * k, 46 * k, 32 * k, 10);
      g.fillStyle(shade(rock, 0.14)).fillEllipse(x + 14 * k, y - 10 * k, 32 * k, 22 * k, 10);
      g.fillStyle(shade(rock, 0.26), 0.6).fillEllipse(x - 18 * k, y - 22 * k, 20 * k, 11 * k, 8);
      g.lineStyle(2.4 * k, shade(0x8a7a4a, -0.1), 0.8);
      for (let t = -1; t <= 1; t++) g.lineBetween(x + 20 * k, y - 18 * k, x + (20 + t * 14) * k, y - (42 + Math.abs(t) * -8) * k);
    } else if (kind === 3 && variant === 0) {
      // Snow-capped fir.
      g.fillStyle(shade(0x3f5a4a, -0.1)).fillRect(x - 5 * k, y - 22 * k, 10 * k, 24 * k);
      for (let t = 0; t < 3; t++) {
        const w = (54 - t * 13) * k;
        const cy = y - (22 + t * 28) * k;
        g.fillStyle(mix(0x3f5a4a, area.sky, 0.1 + t * 0.12)).fillTriangle(x - w / 2, cy, x + w / 2, cy, x, cy - 40 * k);
        g.fillStyle(0xffffff, 0.8).fillTriangle(x - w / 3.4, cy - 22 * k, x + w / 3.4, cy - 22 * k, x, cy - 40 * k);
      }
    } else if (kind === 3) {
      // Drift banked against a marker post: the pole gives the drift its scale.
      g.fillStyle(shade(area.ink, 0.1)).fillRect(x + 12 * k, y - 76 * k, 6 * k, 78 * k);
      g.fillStyle(0xd2604a).fillRect(x + 12 * k, y - 76 * k, 6 * k, 18 * k);
      g.fillStyle(0xffffff, 0.92).fillEllipse(x - 4 * k, y - 8 * k, 84 * k, 40 * k, 12);
      g.fillStyle(mix(0xffffff, area.sky, 0.5), 0.9).fillEllipse(x + 6 * k, y + 2 * k, 62 * k, 24 * k, 10);
    } else if (variant === 0) {
      // Dusk lantern: a warm pool is the one warm note in a cool band.
      g.fillStyle(ink).fillRect(x - 3 * k, y - 88 * k, 6 * k, 88 * k);
      g.fillStyle(0xe8b878, 0.22).fillCircle(x, y - 94 * k, 40 * k);
      g.fillStyle(0xf0c98a).fillRoundedRect(x - 12 * k, y - 110 * k, 24 * k, 30 * k, 9 * k);
      g.fillStyle(ink).fillRoundedRect(x - 15 * k, y - 116 * k, 30 * k, 8 * k, 4 * k);
      g.fillStyle(0xe8b878, 0.16).fillEllipse(x, y + 2 * k, 96 * k, 26 * k, 10);
    } else {
      // Standing stone, catching the last of the light on one face.
      const stone = shade(area.ground, 0.12);
      g.fillStyle(stone);
      quad(x - 20 * k, y, x + 22 * k, y, x + 14 * k, y - 86 * k, x - 12 * k, y - 94 * k);
      g.fillStyle(shade(stone, 0.2), 0.55);
      quad(x - 20 * k, y, x - 4 * k, y, x - 2 * k, y - 90 * k, x - 12 * k, y - 94 * k);
      g.fillStyle(shade(area.ink, 0.05), 0.35).fillEllipse(x + 2 * k, y - 2 * k, 52 * k, 14 * k, 8);
    }
  }

  /** Raised discs: cast shadow, a side wall, a face, a rim light. */
  private drawNodes(g: Phaser.GameObjects.Graphics, s: number): void {
    for (let i = 0; i < this.shown; i++) {
      const level = this.first + i;
      const { area } = areaOf(level);
      const node = this.nodes[i]!;
      const cleared = level < this.progress.unlocked;
      const current = level === this.progress.unlocked;
      const r = (current ? MAP.nodeRadius * 1.1 : cleared ? MAP.nodeRadius : MAP.nodeRadius * 0.84) * s;
      const text = this.numbers[i]!.setPosition(node.x, node.y).setFontSize((current ? 33 : cleared ? 30 : 26) * s);
      g.fillStyle(shade(area.ground, -0.5), 0.24).fillEllipse(node.x + 4 * s, node.y + (MAP.shadowDrop + 2) * s, r * 2.05, r * 1.15, 14);
      const face = cleared ? area.ink : current ? area.paper : mix(area.ground, area.paper, 0.5);
      // A darker disc peeking below the face is the whole trick: it reads as thickness.
      g.fillStyle(shade(face, -0.3), cleared || current ? 1 : 0.85).fillCircle(node.x, node.y + 5 * s, r);
      g.fillStyle(face, cleared || current ? 1 : 0.92).fillCircle(node.x, node.y, r);
      g.lineStyle(2.5 * s, shade(area.ink, cleared ? 0.25 : 0), cleared ? 0.5 : current ? 0.85 : 0.32).strokeCircle(node.x, node.y, r);
      g.fillStyle(0xffffff, cleared ? 0.14 : 0.4).fillEllipse(node.x - r * 0.22, node.y - r * 0.42, r * 1.05, r * 0.5, 12);
      if (current) {
        g.lineStyle(5 * s, area.ink, 1).strokeCircle(node.x, node.y, r);
        text.setColor(hex(area.ink)).setAlpha(1);
        this.drawStars(g, node, r, 3, 0, area, s);
      } else if (cleared) {
        text.setColor(hex(area.paper)).setAlpha(1);
        this.drawStars(g, node, r, starsFor(this.progress.best[level] ?? 0, levelSpec(level)), 3, area, s);
      } else {
        text.setColor(hex(area.ink)).setAlpha(0.5);
        // A shackle and body say locked without needing a glyph the device font might lack.
        const ly = node.y + r + 17 * s;
        g.lineStyle(4 * s, area.ink, 0.45).beginPath();
        g.arc(node.x, ly - 1 * s, 9 * s, Math.PI, 0);
        g.strokePath();
        g.fillStyle(area.ink, 0.5).fillRoundedRect(node.x - 13 * s, ly, 26 * s, 19 * s, 5 * s);
        g.fillStyle(area.paper, 0.5).fillCircle(node.x, ly + 9 * s, 3.2 * s);
      }
    }
  }

  /** Stars on their own plate, so they never sit directly on the road surface. */
  private drawStars(g: Phaser.GameObjects.Graphics, node: Point, r: number, stars: number, of: number, area: Area, s: number): void {
    if (of === 0) return;
    const w = 84 * s;
    const h = 28 * s;
    const y = node.y + r + 18 * s;
    g.fillStyle(shade(area.ground, -0.45), 0.18).fillRoundedRect(node.x - w / 2 + 2 * s, y - h / 2 + 5 * s, w, h, h / 2);
    g.fillStyle(shade(area.paper, -0.03), 0.96).fillRoundedRect(node.x - w / 2, y - h / 2, w, h, h / 2);
    g.lineStyle(1.5 * s, area.ink, 0.24).strokeRoundedRect(node.x - w / 2, y - h / 2, w, h, h / 2);
    for (let k = 0; k < of; k++) {
      drawStar(g, node.x + (k - 1) * 24 * s, y, 9 * s, k < stars ? shade(area.ink, 0.1) : area.ink, k < stars, k < stars ? 1 : 0.28);
    }
  }

  /** Edge shading: the strip reads as a lit corridor rather than a flat fill. */
  private drawFrame(s: number): void {
    const { full } = this.viewport;
    const g = this.frame.clear();
    const bands = 7;
    const width = 46 * s;
    for (let b = 0; b < bands; b++) {
      const alpha = 0.05 * (1 - b / bands);
      g.fillStyle(0x1d2a20, alpha);
      g.fillRect(full.x, full.y, width * (1 - b / bands), full.height);
      g.fillRect(full.right - width * (1 - b / bands), full.y, width * (1 - b / bands), full.height);
    }
  }

  private drawHud(s: number): void {
    const { safe, full } = this.viewport;
    const g = this.hudBack.clear();
    const paper = 0xf4f0e2;
    const ink = 0x2b3a2f;
    g.fillStyle(ink, 0.1).fillRect(full.x, this.hudHeight, full.width, 10 * s);
    g.fillStyle(ink, 0.05).fillRect(full.x, this.hudHeight, full.width, 4 * s);
    g.fillStyle(paper, 1).fillRect(full.x, full.y, full.width, this.hudHeight);
    g.lineStyle(1.5 * s, ink, 0.22).lineBetween(full.x, this.hudHeight, full.right, this.hudHeight);
    const left = safe.centerX - 310 * s;
    this.edition.setPosition(left, safe.top + 34 * s).setFontSize(15 * s);
    const current = areaOf(this.progress.unlocked);
    const total = Object.entries(this.progress.best).reduce((sum, [level, best]) => sum + starsFor(best, levelSpec(Number(level))), 0);
    this.status.setText(`LEVEL ${this.progress.unlocked}  ·  ${current.name.toUpperCase()}  ·  ${total}★`).setPosition(left, safe.top + 66 * s).setFontSize(14 * s);
    // Round chips, sized to the accessible floor, so both controls read as buttons.
    const chip = (cx: number, cy: number, radius: number) => {
      g.fillStyle(ink, 0.12).fillCircle(cx + 1 * s, cy + 3 * s, radius);
      g.fillStyle(shade(paper, -0.04), 1).fillCircle(cx, cy, radius);
      g.lineStyle(1.5 * s, ink, 0.26).strokeCircle(cx, cy, radius);
    };
    const radius = 27 * s;
    const menuX = safe.centerX + 188 * s;
    const muteX = safe.centerX + 283 * s;
    const cy = safe.top + 52 * s;
    chip(menuX, cy, radius * 1.28);
    chip(muteX, cy, radius);
    this.menu.setPosition(menuX, cy).setFontSize(13 * s);
    this.mute.setPosition(muteX, cy).setFontSize(28 * s);
  }

  private scrollTo(level: number): void {
    const node = this.nodes[level - this.first];
    if (node) this.scrollY = node.y - (this.hudHeight + (this.viewport.full.height - this.hudHeight) * 0.55);
    this.clampScroll();
  }
  private clampScroll(): void {
    const max = Math.max(0, this.worldHeight - this.viewport.full.height);
    this.scrollY = Math.max(0, Math.min(max, this.scrollY));
    this.cameras.main.setScroll(0, this.scrollY);
  }

  public override update(_time: number, delta: number): void {
    if (!this.drag && Math.abs(this.velocity) > 1) {
      this.scrollY += this.velocity * delta / 1000;
      this.velocity *= Math.exp(-MAP.friction * delta / 1000);
      this.clampScroll();
    }
    const s = this.uiScale;
    const now = performance.now() / 1000;
    this.pulse.clear();
    const current = this.nodes[this.progress.unlocked - this.first];
    if (current && !this.reducedMotion) {
      const { area } = areaOf(this.progress.unlocked);
      const r = MAP.nodeRadius * 1.1 * s;
      const p = (now * 0.75) % 1;
      this.pulse.lineStyle(3 * s, area.ink, (1 - p) * 0.55).strokeCircle(current.x, current.y, r + 6 * s + p * 40 * s);
      this.pulse.lineStyle(2 * s, area.ink, (1 - ((p + 0.5) % 1)) * 0.3).strokeCircle(current.x, current.y, r + 6 * s + ((p + 0.5) % 1) * 40 * s);
    }
    this.touch.clear();
    const age = now - this.touchAt;
    if (age < 0.3) this.touch.lineStyle(2.5 * s, 0x2b3a2f, (1 - age / 0.3) * 0.7).strokeCircle(this.touchPoint.x, this.touchPoint.y + this.scrollY, (20 + age * 160) * s);
  }

  private pointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.drag || (!pointer.wasTouch && pointer.button !== 0)) return;
    this.drag = { lastY: pointer.y, lastAt: performance.now(), startX: pointer.x, startY: pointer.y, moved: false };
    this.velocity = 0;
    this.touchAt = performance.now() / 1000;
    this.touchPoint = { x: pointer.x, y: pointer.y };
  }
  private pointerMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag || !pointer.isDown) return;
    const dy = pointer.y - drag.lastY;
    const now = performance.now();
    if (Math.hypot(pointer.x - drag.startX, pointer.y - drag.startY) > MAP.tapSlop * this.viewport.unitScale) drag.moved = true;
    if (drag.moved) {
      this.scrollY -= dy;
      const dt = Math.max(1, now - drag.lastAt) / 1000;
      this.velocity = -dy / dt * 0.6 + this.velocity * 0.4;
      this.clampScroll();
    }
    drag.lastY = pointer.y;
    drag.lastAt = now;
  }
  private pointerUp(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    if (drag.moved) return;
    this.velocity = 0;
    this.handleTap(pointer.x, pointer.y);
  }
  private handleTap(x: number, y: number): void {
    if (Math.abs(x - this.mute.x) < this.controlSize / 2 && Math.abs(y - this.mute.y) < this.controlSize / 2) {
      const audio = sharedAudio(this);
      audio.toggleMute();
      this.mute.setText(audio.muted ? '×' : '♪');
      return;
    }
    if (Math.abs(x - this.menu.x) < this.controlSize / 2 && Math.abs(y - this.menu.y) < this.controlSize / 2) { this.scene.start(SceneKey.Menu); return; }
    if (y < this.hudHeight) return;
    const worldY = y + this.scrollY;
    const reach = Math.max(MAP.nodeRadius * this.uiScale, this.controlSize / 2);
    const index = this.nodes.findIndex(node => Math.hypot(node.x - x, node.y - worldY) <= reach);
    if (index < 0) return;
    const level = this.first + index;
    if (level > this.progress.unlocked) return;
    this.scene.start(SceneKey.Play, { level, autoStart: true });
  }
  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUp, this);
  }
}
