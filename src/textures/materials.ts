import type Phaser from 'phaser';

/**
 * Generated materials, following the workshop grain's precedent: a seeded, deterministic
 * canvas made once at boot, guarded against duplicate creation, applied as one tiled
 * sprite per surface so it costs a single draw call however large the surface is.
 *
 * Every opaque tile is a light neutral — greys near white carrying the texture as small
 * variation — so a tile tinted to a material's colour *is* that surface, slightly and
 * unevenly darkened the way a real one is, rather than a flat fill with a film over it.
 * Paper is the exception: transparent fibres meant to lie over anything. Tiles are
 * periodic by construction, so they wrap without a seam.
 */
export const MaterialKey = Object.freeze({
  paper: 'material-paper',
  wood: 'material-wood',
  metal: 'material-metal',
  cloth: 'material-cloth',
  parchment: 'material-parchment',
});
export type MaterialKey = (typeof MaterialKey)[keyof typeof MaterialKey];

/** 256 so a tile is sharp on a 3x display when scaled down: scaling down is nearly free, scaling up is visibly soft. */
const SIZE = 256;

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

type Painter = (ctx: CanvasRenderingContext2D, random: () => number) => void;

function make(scene: Phaser.Scene, key: string, seed: number, paint: Painter): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, SIZE, SIZE);
  if (!texture) return;
  paint(texture.getContext(), lcg(seed));
  texture.refresh();
}

/** Fibre speckle in both tones, denser than the old grain so it reads at full-screen scale. */
const paper: Painter = (ctx, random) => {
  for (let i = 0; i < 9000; i++) {
    const x = Math.floor(random() * SIZE), y = Math.floor(random() * SIZE);
    const light = random() < 0.4;
    ctx.fillStyle = light ? `rgba(255,255,255,${0.18 + random() * 0.22})` : `rgba(0,0,0,${0.06 + random() * 0.1})`;
    const length = random() < 0.15 ? 2 + Math.floor(random() * 3) : 1;
    // Fibres lie mostly along the grain of the sheet.
    if (random() < 0.7) ctx.fillRect(x, y, length, 1); else ctx.fillRect(x, y, 1, length);
  }
};

/** Growth rings as slow bands down the tile, cut by fine streaks along it. Periodic in both axes. */
const wood: Painter = (ctx, random) => {
  const image = ctx.createImageData(SIZE, SIZE);
  const d = image.data;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE * Math.PI * 2, v = y / SIZE * Math.PI * 2;
      // Few, wide rings that wander along the tile, each sharpened on one side the way a
      // growth ring is: the earlywood is soft, the latewood a hard line. Frequencies are
      // whole so the tile wraps.
      const warp = Math.sin(u) * 0.55 + Math.sin(u * 3 + 1.3) * 0.2;
      const slow = Math.sin(v * 4 + warp);
      const ring = Math.sign(slow) * Math.abs(slow) ** 0.35 * 0.5 + Math.sin(v * 9 + warp * 2 + 0.7) * 0.22;
      // Fine streaks run along the grain — with the rings, not across them — and break up
      // along their length so none reads as a ruled line.
      const streak = Math.sin(v * 58 + Math.sin(u * 2) * 2.5) * (0.5 + 0.5 * Math.sin(u * 5 + v * 3)) * 0.045;
      const value = 0.85 + ring * 0.1 + streak;
      const i = (y * SIZE + x) * 4;
      const g = Math.round(Math.max(0, Math.min(1, value)) * 255);
      d[i] = d[i + 1] = d[i + 2] = g;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  // A few darker pores, which is what says wood rather than corduroy.
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.06 + random() * 0.1})`;
    ctx.fillRect(Math.floor(random() * SIZE), Math.floor(random() * SIZE), 2 + Math.floor(random() * 14), 1);
  }
};

/** Brushed: long horizontal streaks with a soft sheen band. Periodic along the brush. */
const metal: Painter = (ctx, random) => {
  const image = ctx.createImageData(SIZE, SIZE);
  const d = image.data;
  const rows: number[] = Array.from({ length: SIZE }, () => 0.86 + (random() - 0.5) * 0.12);
  for (let y = 0; y < SIZE; y++) {
    const sheen = Math.sin(y / SIZE * Math.PI * 2) * 0.05;
    for (let x = 0; x < SIZE; x++) {
      const streak = Math.sin(x / SIZE * Math.PI * 2 * 3 + y * 0.9) * 0.02;
      const value = rows[y]! + sheen + streak;
      const i = (y * SIZE + x) * 4;
      const g = Math.round(Math.max(0, Math.min(1, value)) * 255);
      d[i] = d[i + 1] = d[i + 2] = g;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
};

/** A plain weave: two thread directions, each a soft sine, crossing at half period. */
const cloth: Painter = (ctx) => {
  const image = ctx.createImageData(SIZE, SIZE);
  const d = image.data;
  const threads = 32;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const a = Math.sin(x / SIZE * Math.PI * 2 * threads);
      const b = Math.sin(y / SIZE * Math.PI * 2 * threads);
      const over = Math.floor(x / (SIZE / threads)) + Math.floor(y / (SIZE / threads));
      const weave = over % 2 === 0 ? a : b;
      const value = 0.86 + weave * 0.08;
      const i = (y * SIZE + x) * 4;
      const g = Math.round(value * 255);
      d[i] = d[i + 1] = d[i + 2] = g;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
};

/** Mottled blotches under a light speckle: aged sheet rather than fresh paper. */
const parchment: Painter = (ctx, random) => {
  ctx.fillStyle = 'rgb(224,224,224)';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 60; i++) {
    const x = random() * SIZE, y = random() * SIZE, r = 14 + random() * 40;
    const dark = random() < 0.55;
    const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
    blob.addColorStop(0, dark ? 'rgba(0,0,0,0.11)' : 'rgba(255,255,255,0.12)');
    blob.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = blob;
    // Draw wrapped so the tile is seamless.
    for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
      ctx.save(); ctx.translate(ox, oy); ctx.fillRect(0, 0, SIZE, SIZE); ctx.restore();
    }
  }
  paper(ctx, random);
};

/** Generate every material once. Called from Preload so scenes can look them up by key. */
export function generateMaterials(scene: Phaser.Scene): void {
  make(scene, MaterialKey.paper, 431, paper);
  make(scene, MaterialKey.wood, 733, wood);
  make(scene, MaterialKey.metal, 911, metal);
  make(scene, MaterialKey.cloth, 277, cloth);
  make(scene, MaterialKey.parchment, 1559, parchment);
}
