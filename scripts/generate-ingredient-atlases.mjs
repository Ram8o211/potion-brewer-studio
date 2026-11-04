// Export the exact deterministic species artwork used by the game.
// Run from the repository root: node scripts/generate-ingredient-atlases.mjs
// No canvas, image libraries, or network required.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { generateWorld } from '../src/materials/generator.js';
import { WILD_SPECS } from '../src/materials/wild.js';
import { BIOMES } from '../src/game/biomes.js';
import { describe } from '../src/visual/descriptor.js';
import { iconFrame, plantFrame } from '../src/visual/render.js';
import { DANGLERS, ORCHARD } from '../src/visual/growth.js';
import { validateAtlas } from '../src/visual/atlas-contract.js';

const OUT = new URL('../assets/ingredients/', import.meta.url);
const CELL = 192; // 192x192 transparent RGBA pixels per asset
const COLS = 18;  // 3456px wide, at most 4096px high (atlas contract v1)
const PAD = 12;
const seed = 'atlas-v1';
const world = generateWorld(seed);
const byKey = new Map(world.materials.filter((m) => m.wild && !m.product).map((m) => [m.wild.key, m]));
const variants = new Map(WILD_SPECS.map((s) => [s.key, s]));
const biomeIndex = new Map(BIOMES.map((b, i) => [b.id, i]));
const rarityIndex = new Map(['common', 'uncommon', 'rare', 'unique', 'legendary'].map((r, i) => [r, i]));
const originals = WILD_SPECS.filter((s) => !s.arcaneVariant).sort((a, b) =>
  (biomeIndex.get(a.region) ?? 99) - (biomeIndex.get(b.region) ?? 99)
  || (rarityIndex.get(a.rarity) ?? 99) - (rarityIndex.get(b.rarity) ?? 99)
  || a.noun.localeCompare(b.noun)
  || a.key.localeCompare(b.key));
const specs = originals.flatMap((s) => [s, variants.get(s.key + '@arcane')]);
if (specs.some((s) => !s) || specs.length !== world.wild.length)
  throw new Error('Atlas species mismatch: expected a normal and Arcane counterpart for every species');
if (specs.some((s) => !byKey.has(s.key))) throw new Error('Missing species in generated world');
const ROWS = Math.ceil(specs.length / COLS), WIDTH = COLS * CELL, HEIGHT = ROWS * CELL;
if (WIDTH > 4096 || HEIGHT > 4096) throw new Error('Atlas exceeds 4096px contract');

function mountOf(shape) {
  if (DANGLERS.includes(shape) || ORCHARD.includes(shape)) return 'hang';
  if (shape === 'bark' || shape === 'bracket') return 'wall';
  return 'ground';
}
function bounds(pix) {
  let left = pix.w, top = pix.h, right = -1, bottom = -1, count = 0;
  for (let y = 0; y < pix.h; y++) for (let x = 0; x < pix.w; x++) {
    if (!(pix.px[y * pix.w + x] >>> 24)) continue;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    count++;
  }
  if (!count) throw new Error('Renderer produced an empty sprite');
  return { left, top, right, bottom, w: right - left + 1, h: bottom - top + 1, count };
}
function drawTile(pixels, frame, index, mode, mount) {
  const src = frame.pix, b = bounds(src);
  const fit = Math.floor(Math.min((CELL - PAD * 2) / b.w, (CELL - PAD * 2) / b.h));
  const scale = Math.max(1, Math.min(6, fit));
  if (b.w * scale > CELL || b.h * scale > CELL) throw new Error('Oversized sprite at index ' + index);
  const tw = b.w * scale, th = b.h * scale;
  const cx = (index % COLS) * CELL, cy = Math.floor(index / COLS) * CELL;
  let ox = cx + Math.floor((CELL - tw) / 2), oy = cy + Math.floor((CELL - th) / 2);
  if (mode === 'wilds') {
    if (mount === 'hang') oy = cy + PAD;
    else if (mount === 'wall') ox = cx + PAD;
    else oy = cy + CELL - PAD - th;
  }
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const color = src.px[(b.top + y) * src.w + b.left + x];
    if (!(color >>> 24)) continue;
    const dy = oy + y * scale, dx = ox + x * scale;
    for (let sy = 0; sy < scale; sy++) {
      const base = (dy + sy) * WIDTH + dx;
      for (let sx = 0; sx < scale; sx++) pixels[base + sx] = color;
    }
  }
  return { artRect: [ox - cx, oy - cy, tw, th], sourceRect: [b.left, b.top, b.w, b.h], scale, opaqueSourcePixels: b.count };
}
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let i = 0; i < 8; i++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, checksum]);
}
function toPng(pixels) {
  const rowBytes = WIDTH * 4, rowStride = rowBytes + 1;
  const raw = Buffer.alloc(HEIGHT * rowStride); // PNG filter 0, lossless RGBA
  const bytes = Buffer.from(pixels.buffer);
  for (let y = 0; y < HEIGHT; y++) bytes.copy(raw, y * rowStride + 1, y * rowBytes, (y + 1) * rowBytes);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0); ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA, no palette or background
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
function exportAtlas(kind) {
  const pixels = new Uint32Array(WIDTH * HEIGHT); // zero alpha = fully transparent
  const atlas = {
    version: 1, width: WIDTH, height: HEIGHT,
    image: kind + '-atlas.png', tileSize: CELL, columns: COLS, count: specs.length,
    source: 'Potion Brewer Studio native procedural renderer', seed,
    frames: {},
  };
  specs.forEach((s, i) => {
    const material = byKey.get(s.key);
    const d = describe(material.vis);
    const mount = mountOf(s.shape);
    const frame = kind === 'wilds'
      ? plantFrame(d, 2, { mount, k: 2, variant: 0 })
      : iconFrame(d);
    const drawn = drawTile(pixels, frame, i, kind, mount);
    const species = s.baseKey || s.key, arcane = !!s.arcaneVariant;
    atlas.frames[material.id] = {
      species, arcane, stage: kind === 'wilds' ? 'mature' : 'icon',
      rarity: s.rarity, biome: s.region, name: s.noun, shape: s.shape,
      rect: [(i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL],
      pivot: kind === 'icons' ? [0.5, 0.5] : mount === 'hang' ? [0.5, 0] : mount === 'wall' ? [0, 0.5] : [0.5, 1],
      mount: kind === 'wilds' ? mount : null, ...drawn,
    };
  });
  const errors = validateAtlas(atlas);
  if (errors.length) throw new Error(kind + ' atlas invalid: ' + errors.join('; '));
  const png = toPng(pixels);
  writeFileSync(new URL(kind + '-atlas.png', OUT), png);
  writeFileSync(new URL(kind + '-atlas.json', OUT), JSON.stringify(atlas, null, 2) + '\n');
  console.log(kind + ': ' + specs.length + ' sprites / ' + WIDTH + 'x' + HEIGHT + ' transparent PNG / ' + png.length + ' bytes');
}
mkdirSync(OUT, { recursive: true });
exportAtlas('wilds');
exportAtlas('icons');
