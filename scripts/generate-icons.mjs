/**
 * Generates every shipped icon from the one 1024px master in assets/icon/.
 *
 * The icons are derived, not authored: re-run this after replacing the master rather
 * than editing a PNG by hand. Needs ffmpeg on PATH (Lanczos resampling and the circular
 * alpha for the round launcher icon); nothing else in the build depends on it.
 *
 *   node scripts/generate-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const SOURCE = join(ROOT, 'assets/icon/tiny-tempo-1024.jpg');
const RES = join(ROOT, 'android/app/src/main/res');
const PUBLIC = join(ROOT, 'public');

/**
 * The master is a full-bleed scene, so it is cropped to the hammer and nail before any
 * icon is cut from it. An adaptive icon guarantees only the centre 72 of its 108 units,
 * and OEM masks take the rest, so the subject has to sit inside that circle while the
 * artwork still reaches every edge. Measured against the master: this window centres the
 * strike and keeps the whole hammer legible under a circular mask.
 */
const CROP = { size: 880, x: 144, y: 96 };
/** The master's flat ground, sampled at 40,40. The game's own coral, near enough. */
export const BACKGROUND = '#CE5133';

/** Android density buckets: legacy icon size, then adaptive layer size (108/48 larger). */
const DENSITIES = [
  ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
];

const crop = `crop=${CROP.size}:${CROP.size}:${CROP.x}:${CROP.y}`;
/** Transparent outside the inscribed circle, so a launcher's own mask has nothing to cut. */
const circle = (size) => `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${size / 2},Y-${size / 2}),${size / 2}),255,0)'`;

function render(size, target, round = false) {
  mkdirSync(dirname(target), { recursive: true });
  const filter = [crop, `scale=${size}:${size}:flags=lanczos`, ...(round ? [circle(size)] : [])].join(',');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', SOURCE, '-vf', filter, target]);
  console.log(`${target.slice(ROOT.length)}  ${size}x${size}  ${(statSync(target).size / 1024).toFixed(1)} kB`);
}

for (const [density, legacy, adaptive] of DENSITIES) {
  render(legacy, join(RES, `mipmap-${density}/ic_launcher.png`));
  render(legacy, join(RES, `mipmap-${density}/ic_launcher_round.png`), true);
  render(adaptive, join(RES, `mipmap-${density}/ic_launcher_foreground.png`));
}

writeFileSync(join(RES, 'values/ic_launcher_background.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
  + `    <color name="ic_launcher_background">${BACKGROUND}</color>\n</resources>\n`);
console.log(`android/app/src/main/res/values/ic_launcher_background.xml  ${BACKGROUND}`);

// The web build had no icon at all: index.html carried an empty data URL to stop the 404.
// Only what index.html actually references: an unreferenced 512 costs 140 kB of bundle
// and buys nothing until there is a web manifest to install from.
for (const [size, name] of [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png'], [192, 'icon-192.png']]) {
  render(size, join(PUBLIC, name));
}
