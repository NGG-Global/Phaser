import Phaser from 'phaser';
import { sharedAudio, currentAudio } from '@/audio/sharedAudio';
import { PROGRESSION } from '@/config/progression';
import { SceneKey } from '@/config/scenes';
import { BaseScene } from '@/core/BaseScene';
import { areaOf, levelSpec, starsFor } from '@/game/levels';
import { loadProgress, type Progress } from '@/game/progress';
import { drawStar } from '@/ui/star';

/** Design-unit metrics of the road map; every one is multiplied by the viewport scale. */
const MAP = { step: 172, nodeRadius: 44, wobble: 0.3, topPad: 300, bottomPad: 260, roadWidth: 46, tapSlop: 14, friction: 5 } as const;

/**
 * Endless, scrollable road of levels grouped into themed areas. Pure presentation of
 * `levelSpec`/`Progress`: the map never decides difficulty, it only draws it.
 */
export class MapScene extends BaseScene {
  private progress!: Progress;
  private shown = 0;
  private world!: Phaser.GameObjects.Graphics;
  private pulse!: Phaser.GameObjects.Graphics;
  private touch!: Phaser.GameObjects.Graphics;
  private hudBack!: Phaser.GameObjects.Graphics;
  private edition!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private menu!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private numbers: Phaser.GameObjects.Text[] = [];
  private areaTitles: Phaser.GameObjects.Text[] = [];
  private areaRanges: Phaser.GameObjects.Text[] = [];
  private nodes: { x: number; y: number }[] = [];
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

  public constructor() { super(SceneKey.Map); }

  protected override build(): void {
    this.disposed = false;
    this.centered = false;
    this.progress = loadProgress();
    const data = this.sys.settings.data as { focus?: number } | undefined;
    this.focus = Math.max(1, Math.min(this.progress.unlocked, data?.focus ?? this.progress.unlocked));
    this.shown = this.progress.unlocked + PROGRESSION.mapLookahead;
    this.world = this.add.graphics();
    this.pulse = this.add.graphics();
    this.touch = this.add.graphics().setDepth(5);
    this.numbers = Array.from({ length: this.shown }, (_, i) => this.add.text(0, 0, String(i + 1), { fontFamily: 'Georgia, serif', fontSize: '32px' }).setOrigin(0.5));
    const areas = Math.ceil(this.shown / PROGRESSION.areaSize);
    this.areaTitles = Array.from({ length: areas }, (_, k) => this.add.text(0, 0, areaOf(k * PROGRESSION.areaSize + 1).name.toUpperCase(), { fontFamily: 'Georgia, serif', fontSize: '40px' }).setOrigin(0, 0.5));
    this.areaRanges = Array.from({ length: areas }, (_, k) => this.add.text(0, 0, `LEVELS ${k * PROGRESSION.areaSize + 1}–${(k + 1) * PROGRESSION.areaSize}`, { fontFamily: 'monospace', fontSize: '15px' }).setLetterSpacing(2).setOrigin(0, 0.5));
    this.hudBack = this.add.graphics().setScrollFactor(0).setDepth(10);
    const hud = (value: string, size: number, font: string) => this.add.text(0, 0, value, { fontFamily: font, fontSize: `${size}px`, color: '#243e35' }).setScrollFactor(0).setDepth(11);
    this.edition = hud('SMALL ACTS', 16, 'monospace').setLetterSpacing(2);
    this.status = hud('', 15, 'monospace').setLetterSpacing(2);
    this.menu = hud('MENU', 15, 'monospace').setLetterSpacing(2).setOrigin(0.5);
    this.mute = hud(currentAudio(this)?.muted ? '×' : '♪', 32, 'Georgia, serif').setOrigin(0.5);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
  }

  protected override layout(): void {
    const { safe, full } = this.viewport;
    const s = Math.min(safe.width / 720, safe.height / 1150);
    this.uiScale = s;
    this.controlSize = Math.max(88 * s, 48 * this.viewport.unitScale);
    this.hudHeight = safe.top + 100 * s;
    this.worldHeight = (MAP.topPad + MAP.bottomPad + (this.shown - 1) * MAP.step) * s + this.hudHeight;
    // Level 1 sits at the bottom; the road climbs. x wanders left and right inside the safe frame.
    this.nodes = Array.from({ length: this.shown }, (_, i) => ({
      x: safe.centerX + Math.sin((i + 1) * 0.9) * safe.width * MAP.wobble,
      y: this.worldHeight - (MAP.bottomPad + i * MAP.step) * s,
    }));
    const g = this.world.clear();
    const size = PROGRESSION.areaSize;
    for (let k = 0; k < this.areaTitles.length; k++) {
      const { area, name } = areaOf(k * size + 1);
      const first = this.nodes[k * size]!;
      const last = this.nodes[Math.min(this.shown, (k + 1) * size) - 1]!;
      const top = k * size + size >= this.shown ? 0 : last.y - MAP.step * s / 2;
      const bottom = k === 0 ? this.worldHeight : first.y + MAP.step * s / 2;
      g.fillStyle(area.ground).fillRect(full.x, top, full.width, bottom - top);
      g.fillStyle(area.sky, 0.55).fillRect(full.x, top, full.width, Math.min(60 * s, bottom - top));
      this.areaTitles[k]!.setText(name.toUpperCase()).setPosition(safe.left + 36 * s, bottom - 56 * s).setFontSize(34 * s).setColor(hex(area.ink)).setAlpha(0.85);
      this.areaRanges[k]!.setPosition(safe.left + 36 * s, bottom - 24 * s).setFontSize(14 * s).setColor(hex(area.ink)).setAlpha(0.7);
    }
    // Road: one segment per level in that area's road colour, continuing past the last node.
    for (let i = 0; i < this.shown; i++) {
      const from = this.nodes[i]!;
      const to = this.nodes[i + 1] ?? { x: safe.centerX + Math.sin((i + 2) * 0.9) * safe.width * MAP.wobble, y: from.y - MAP.step * s };
      const { area } = areaOf(i + 1);
      g.lineStyle(MAP.roadWidth * s, area.road, 1).lineBetween(from.x, from.y, to.x, to.y);
      g.fillStyle(area.road).fillCircle(from.x, from.y, MAP.roadWidth * s / 2);
      g.lineStyle(3 * s, 0xffffff, 0.35).lineBetween(from.x, from.y, to.x, to.y);
    }
    for (let i = 0; i < this.shown; i++) {
      const level = i + 1;
      const { area } = areaOf(level);
      const node = this.nodes[i]!;
      const r = MAP.nodeRadius * s;
      const text = this.numbers[i]!.setPosition(node.x, node.y).setFontSize(30 * s);
      g.fillStyle(0x000000, 0.14).fillCircle(node.x + 3 * s, node.y + 6 * s, r);
      if (level < this.progress.unlocked) {
        g.fillStyle(area.ink).fillCircle(node.x, node.y, r);
        text.setColor(hex(area.paper)).setAlpha(1);
        const stars = starsFor(this.progress.best[level] ?? 0, levelSpec(level));
        for (let k = 0; k < 3; k++) drawStar(g, node.x + (k - 1) * 22 * s, node.y + r + 20 * s, 9 * s, area.ink, k < stars, k < stars ? 1 : 0.35);
      } else if (level === this.progress.unlocked) {
        g.fillStyle(area.paper).fillCircle(node.x, node.y, r);
        g.lineStyle(5 * s, area.ink).strokeCircle(node.x, node.y, r);
        text.setColor(hex(area.ink)).setAlpha(1);
      } else {
        g.fillStyle(area.paper, 0.35).fillCircle(node.x, node.y, r * 0.8);
        text.setColor(hex(area.ink)).setAlpha(0.45);
      }
    }
    this.hudBack.clear().fillStyle(0xeee8d8, 0.92).fillRect(full.x, full.y, full.width, this.hudHeight);
    this.hudBack.lineStyle(1, 0x243e35, 0.3).lineBetween(safe.centerX - 310 * s, this.hudHeight, safe.centerX + 310 * s, this.hudHeight);
    const left = safe.centerX - 310 * s;
    this.edition.setPosition(left, safe.top + 36 * s).setFontSize(15 * s);
    const current = areaOf(this.progress.unlocked);
    this.status.setText(`NEXT UP   LEVEL ${this.progress.unlocked}   ·   ${current.name.toUpperCase()}`).setPosition(left, safe.top + 66 * s).setFontSize(14 * s);
    this.menu.setPosition(safe.centerX + 175 * s, safe.top + 52 * s).setFontSize(15 * s);
    this.mute.setPosition(safe.centerX + 283 * s, safe.top + 52 * s).setFontSize(32 * s);
    this.cameras.main.setBounds(0, 0, full.width, this.worldHeight);
    if (!this.centered) { this.centered = true; this.scrollTo(this.focus); }
    this.clampScroll();
  }
  private scrollTo(level: number): void {
    const node = this.nodes[level - 1];
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
    const current = this.nodes[this.progress.unlocked - 1];
    if (current) {
      const { area } = areaOf(this.progress.unlocked);
      const p = (now * 0.9) % 1;
      this.pulse.lineStyle(3 * s, area.ink, (1 - p) * 0.6).strokeCircle(current.x, current.y, (MAP.nodeRadius + 8 + p * 34) * s);
    }
    this.touch.clear();
    const age = now - this.touchAt;
    if (age < 0.3) this.touch.lineStyle(2.5 * s, 0x243e35, (1 - age / 0.3) * 0.7).strokeCircle(this.touchPoint.x, this.touchPoint.y + this.scrollY, (20 + age * 160) * s);
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
    if (index < 0 || index + 1 > this.progress.unlocked) return;
    this.scene.start(SceneKey.Play, { level: index + 1, autoStart: true });
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
const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
