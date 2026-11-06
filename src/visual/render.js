// Rasterized pictures of a species, without any DOM: the plant on the ground
// at each growth stage, its icon and its four cauldron pieces (shards
// broken from the icon). Pure functions
// of the descriptor (visual/descriptor.js), so Node and every browser paint
// the same pixels; visual/sprites.js caches them as canvases.

import { boundPixels } from '../studio/asset-runtime.js';
import { artRevision } from '../studio/direction.js';
import { FAMILIES } from './families/index.js';
import { rasterize } from './raster.js';
import { Pixels } from './pixels.js';
import { inked } from './style.js';
import { growFrame } from './growth.js';
import { noise2, hash2 } from './noise.js';
import { ingredientAssetFrame, ingredientArtRevision } from './ingredient-assets.js';

/** Icon size (art pixels, square). */
export const ICON_PX = 32;
/** A cauldron piece's cell (art pixels, square) and the silhouette grid it is fitted with. */
export const PIECE_PX = 40;
export const PIECE_GRID = 20;

/**
 * @typedef {Object} Frame
 * @property {Pixels} pix
 * @property {number} ax   foot (bottom centre) within the frame
 * @property {number} ay
 * @property {number[][]} glints  [x, y] pixels that may glimmer
 * @property {number[][]} [glows]  [x, y] pixels that give light (glowing caps, berries, crystal tips)
 */

/**
 * The plant (or deposit) where it is found, at a stage: grown procedurally
 * (visual/growth.js) on its mount — the ground, hanging, or jutting from a
 * rock face or a trunk — in one of its variants.
 * @param {import('./descriptor.js').Descriptor} d @param {number} stage 0 sprout, 1 ripe, 2 mature
 * @param {{closed?:boolean, mount?:string, variant?:number, flip?:boolean, k?:number}} [o]
 * @returns {Frame}
 */
export function plantFrame(d, stage, o = {}) {
  const size = Math.max(16, Math.round(Math.max(d.size.w, d.size.h) * (o.k || 1)));
  const custom = boundPixels(d.id.key, (d.id.seed + (o.variant || 0)) >>> 0, stage, size, size);
  if (custom) {
    const center = Math.floor(size / 2);
    if (o.mount === 'hang') {
      const p = new Pixels(size, size); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) p.set(x, y, custom.get(x, size - 1 - y));
      return { pix: p, ax: center, ay: 0, glints: [] };
    }
    if (o.mount === 'wall') {
      const p = new Pixels(size, size); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) p.set(o.flip ? size - 1 - x : x, y, custom.get(y, size - 1 - x));
      return { pix: p, ax: o.flip ? size - 1 : 0, ay: center, glints: [] };
    }
    return { pix: custom, ax: center, ay: size - 1, glints: [] };
  }
  const shipped = (!d.id.origin || d.id.origin === 'catalog-v1') && ingredientAssetFrame(d.id.key, stage === 0 ? 'sprout' : stage === 1 ? 'young' : 'mature',
    Math.max(20, Math.round(Math.max(d.size.w, d.size.h) * (o.k || 1))), o.mount, o.flip);
  if (shipped) return shipped;
  return growFrame(d, stage, o);
}

/** The ingredient's icon (ICON_PX square). @param {import('./descriptor.js').Descriptor} d @returns {Frame} */
export function iconFrame(d) {
  const custom = boundPixels(d.id.key, d.id.seed, 2, ICON_PX - 2, ICON_PX - 2);
  if (custom) { iconRasters.set(d, custom); return { pix: inked(custom), ax: ICON_PX / 2, ay: ICON_PX, glints: [] }; }
  const shipped = (!d.id.origin || d.id.origin === 'catalog-v1') && ingredientAssetFrame(d.id.key, 'icon', ICON_PX);
  if (shipped) return shipped;
  const model = FAMILIES[d.family].icon(d);
  model.fit(ICON_PX - 2, ICON_PX - 2, { margin: 0.5 });
  const r = rasterize(model, ICON_PX - 2, ICON_PX - 2, d.pal, { seed: d.seeds.surface ^ 0x1c0, outline: false });
  iconRasters.set(d, r.pix);
  return { pix: inked(r.pix), ax: ICON_PX / 2, ay: ICON_PX, glints: r.glints.map(([x, y]) => [x + 1, y + 1]) };
}

/** The icon raster's inner square (art pixels) in iconFrame, which piece fragments are measured in. */
const ICON_IN = ICON_PX - 2;

/** descriptor → the four shards its icon breaks into @type {WeakMap<object, {sx:number[], sy:number[], seed:number}>} */
let shards = new WeakMap();

/**
 * The icon broken into four shards: four seed points spread over its drawn
 * pixels (farthest-point sampling from a seeded start, then evened out by
 * k-means), each shard the
 * pixels nearer its seed than any other, along break lines roughened by
 * noise. Coordinates are in the icon's inner square, 0..1.
 * @param {import('./descriptor.js').Descriptor} d
 */
function shardsOf(d) {
  refreshAssetRasters();
  let got = shards.get(d);
  if (got) return got;
  const lo = shardsLow(d);
  /** @type {number[][]} */
  const pts = [];
  for (let y = 0; y < ICON_IN; y++) for (let x = 0; x < ICON_IN; x++) if (lo[y * ICON_IN + x]) pts.push([x + 0.5, y + 0.5]);
  if (!pts.length) pts.push([ICON_IN / 2, ICON_IN / 2]);
  const seed = d.seeds.surface ^ 0x5ba7d;
  const sx = [], sy = [];
  const first = pts[Math.floor(hash2(1, 2, seed) * pts.length)];
  sx.push(first[0]); sy.push(first[1]);
  const dist = pts.map(([x, y]) => (x - first[0]) ** 2 + (y - first[1]) ** 2);
  while (sx.length < 4) {
    let bi = 0;
    for (let k = 1; k < pts.length; k++) if (dist[k] > dist[bi]) bi = k;
    const [x, y] = pts[bi];
    sx.push(x); sy.push(y);
    for (let k = 0; k < pts.length; k++) dist[k] = Math.min(dist[k], (pts[k][0] - x) ** 2 + (pts[k][1] - y) ** 2);
  }
  // then settled (a few k-means steps) so the shards share the icon about evenly
  for (let it = 0; it < 8; it++) {
    const ax = [0, 0, 0, 0], ay = [0, 0, 0, 0], an = [0, 0, 0, 0];
    for (const [x, y] of pts) {
      let b = 0, bd = Infinity;
      for (let i = 0; i < 4; i++) { const dd = (x - sx[i]) ** 2 + (y - sy[i]) ** 2; if (dd < bd) { bd = dd; b = i; } }
      ax[b] += x; ay[b] += y; an[b]++;
    }
    for (let i = 0; i < 4; i++) if (an[i]) { sx[i] = ax[i] / an[i]; sy[i] = ay[i] / an[i]; }
  }
  got = { sx: sx.map((x) => x / ICON_IN), sy: sy.map((y) => y / ICON_IN), seed };
  shards.set(d, got);
  return got;
}

/** Which shard (0..3) a point of the icon's inner square (0..1) falls in. @param {{sx:number[], sy:number[], seed:number}} sh @param {number} u @param {number} v */
function shardAt(sh, u, v) {
  // break lines wander: each seed's distance is nudged by its own noise
  let best = 0, bd = Infinity;
  for (let i = 0; i < 4; i++) {
    const n = noise2(u * 9, v * 9, sh.seed + i * 977) - 0.5;
    const dd = Math.hypot(u - sh.sx[i], v - sh.sy[i]) + n * 0.14;
    if (dd < bd) { bd = dd; best = i; }
  }
  return best;
}

/**
 * Piece v drawn size square (art pixels): a shard of the ingredient's icon,
 * cut from the icon's very pixels — the same raster the menus show — along
 * its break lines (its largest connected part kept), magnified to fill the
 * square by nearest sampling (so it has exactly the icon's colours and
 * texture, only bigger), and ringed with ink.
 * @param {import('./descriptor.js').Descriptor} d @param {number} v 0..3 @param {number} size
 * @returns {Pixels}
 */
function shardArt(d, v, size) {
  const sh = shardsOf(d), want = v & 3, icon = iconRaster(d), N = ICON_IN;
  const part = new Pixels(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = icon.px[y * N + x];
    if (c >>> 24 && shardAt(sh, (x + 0.5) / N, (y + 0.5) / N) === want) part.px[y * N + x] = c;
  }
  keepLargest(part);
  let x0 = N, x1 = 0, y0 = N, y1 = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!(part.px[y * N + x] >>> 24)) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
  }
  const inner = size - 2, out = new Pixels(inner, inner);
  if (x1 <= x0) return inked(out);
  const mg = Math.max(1, Math.round(size / PIECE_PX)), bw = x1 - x0, bh = y1 - y0;
  const f = (inner - mg * 2) / Math.max(bw, bh), ox = (inner - bw * f) / 2, oy = (inner - bh * f) / 2;
  for (let y = 0; y < inner; y++) for (let x = 0; x < inner; x++) {
    const X = x0 + Math.floor((x + 0.5 - ox) / f), Y = y0 + Math.floor((y + 0.5 - oy) / f);
    if (X < x0 || Y < y0 || X >= x1 || Y >= y1) continue;
    out.px[y * inner + x] = part.px[Y * N + X];
  }
  return inked(out);
}

/** descriptor → the icon's raster, uninked (iconFrame's inner square) @type {WeakMap<object, Pixels>} */
let iconRasters = new WeakMap();
/** @param {import('./descriptor.js').Descriptor} d */
function iconRaster(d) {
  refreshAssetRasters();
  let p = iconRasters.get(d);
  if (p) return p;
  const custom = boundPixels(d.id.key, d.id.seed, 2, ICON_IN, ICON_IN);
  if (custom) { iconRasters.set(d, custom); return custom; }
  const shipped = (!d.id.origin || d.id.origin === 'catalog-v1') && ingredientAssetFrame(d.id.key, 'icon', ICON_IN);
  if (shipped) { iconRasters.set(d, shipped.pix); return shipped.pix; }
  const model = FAMILIES[d.family].icon(d);
  model.fit(ICON_IN, ICON_IN, { margin: 0.5 });
  p = rasterize(model, ICON_IN, ICON_IN, d.pal, { seed: d.seeds.surface ^ 0x1c0, outline: false }).pix;
  iconRasters.set(d, p);
  return p;
}

/** descriptor → the icon's opaque pixels in its inner square @type {WeakMap<object, Uint8Array>} */
let lowMasks = new WeakMap();
/** @param {import('./descriptor.js').Descriptor} d */
function shardsLow(d) {
  let m = lowMasks.get(d);
  if (m) return m;
  m = iconRaster(d).mask();
  lowMasks.set(d, m);
  return m;
}

/** Clear every opaque pixel outside the largest 4-connected part. @param {Pixels} p */
function keepLargest(p) {
  const { w, h, px } = p, lab = new Int32Array(w * h), stack = [];
  let next = 0, best = 0, bestN = 0;
  for (let k = 0; k < w * h; k++) {
    if (lab[k] || !(px[k] >>> 24)) continue;
    const id = ++next;
    let n = 0;
    lab[k] = id; stack.push(k);
    while (stack.length) {
      const q = /** @type {number} */ (stack.pop()), x = q % w, y = (q - x) / w;
      n++;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!lab[j] && px[j] >>> 24) { lab[j] = id; stack.push(j); }
      }
    }
    if (n > bestN) { bestN = n; best = id; }
  }
  for (let k = 0; k < w * h; k++) if (lab[k] !== best) px[k] = 0;
}

/**
 * A piece drawn at another size (size square, art pixels): the same shard
 * of the icon as pieceFrame, rasterized at the size it is shown at, so its
 * texture has the grain of the icons rather than their pixels blown up.
 * @param {import('./descriptor.js').Descriptor} d @param {number} v 0..3 @param {number} size
 */
export function pieceArt(d, v, size) {
  return shardArt(d, v, size);
}

/**
 * One of the four whole pieces poured into the cauldron (PIECE_PX square) —
 * a shard broken from the ingredient's icon — and its silhouette on the
 * PIECE_GRID grid.
 * @param {import('./descriptor.js').Descriptor} d @param {number} v 0..3
 */
export function pieceFrame(d, v) {
  const pix = shardArt(d, v, PIECE_PX);
  const k = PIECE_PX / PIECE_GRID, mask = new Uint8Array(PIECE_GRID * PIECE_GRID);
  for (let y = 0; y < PIECE_GRID; y++) for (let x = 0; x < PIECE_GRID; x++) {
    let n = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) if (pix.px[(y * k + j) * PIECE_PX + x * k + i] >>> 24) n++;
    mask[y * PIECE_GRID + x] = n * 2 >= k * k ? 1 : 0;
  }
  return { pix, mask };
}

export { Pixels };

let rasterRevision = '';
function refreshAssetRasters() {
  const revision = `${ingredientArtRevision()}:${artRevision()}`;
  if (rasterRevision === revision) return;
  rasterRevision = revision;
  shards = new WeakMap(); iconRasters = new WeakMap(); lowMasks = new WeakMap();
}
