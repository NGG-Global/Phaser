/**
 * Encodes the delivered WAV stems in bgm/ to MP3 in bgm/mp3/ for shipping.
 *
 * The WAVs stay the source of truth (161 MB, unmodified); the game and the Android
 * build bundle only the MP3s (~2 MB each). Pure JavaScript LAME (lamejs), so no
 * native encoder is needed on the machine that runs this. Re-run after replacing
 * a stem, then measure the decoded lead-in again (see docs/MUSIC.md).
 *
 *   node scripts/encode-music.mjs [kbps]
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Mp3Encoder } from '@breezystack/lamejs';

const KBPS = Number(process.argv[2] ?? 160);
const SOURCE = new URL('../bgm/', import.meta.url).pathname;
const TARGET = join(SOURCE, 'mp3');

function readWav(path) {
  const buf = readFileSync(path);
  let offset = 12, channels = 0, sampleRate = 0, bits = 0, data = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') { channels = buf.readUInt16LE(offset + 10); sampleRate = buf.readUInt32LE(offset + 12); bits = buf.readUInt16LE(offset + 22); }
    if (id === 'data') { data = buf.subarray(offset + 8, offset + 8 + size); break; }
    offset += 8 + size + (size % 2);
  }
  if (!data || bits !== 16 || channels !== 2) throw new Error(`${basename(path)}: expected 16-bit stereo PCM`);
  const frames = data.length / 4;
  const left = new Int16Array(frames), right = new Int16Array(frames);
  for (let i = 0; i < frames; i++) { left[i] = data.readInt16LE(i * 4); right[i] = data.readInt16LE(i * 4 + 2); }
  return { sampleRate, frames, left, right };
}

mkdirSync(TARGET, { recursive: true });
for (const file of readdirSync(SOURCE).filter(f => f.endsWith('.wav')).sort()) {
  const started = Date.now();
  const wav = readWav(join(SOURCE, file));
  const encoder = new Mp3Encoder(2, wav.sampleRate, KBPS);
  const chunks = [];
  const block = 1152 * 8;
  for (let i = 0; i < wav.frames; i += block) {
    const out = encoder.encodeBuffer(wav.left.subarray(i, i + block), wav.right.subarray(i, i + block));
    if (out.length) chunks.push(Buffer.from(out.buffer, out.byteOffset, out.length));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail.buffer, tail.byteOffset, tail.length));
  const target = join(TARGET, file.replace(/\.wav$/, '.mp3'));
  writeFileSync(target, Buffer.concat(chunks));
  console.log(`${file} -> ${basename(target)} ${(statSync(target).size / 1e6).toFixed(2)} MB in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
