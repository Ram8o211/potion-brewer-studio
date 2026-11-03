// The cobbled stone the caverns are built of (cave.js): ground, pillars,
// roof and walls share this one texture, so they read as one rock.

import { hash2, noise2 } from '../noise.js';
import { mixPacked } from '../color.js';

/**
 * The cobbled stone texture: rounded stones of a few colours packed in a
 * darker mortar, each lit along its upper left and shaded underneath, with
 * a rare single-pixel speckle (the stones kept clean). A pure function of the pixel.
 * @param {number} x @param {number} y
 * @param {{stones:number[], mortar:number, s:number, seed:number, flat?:number, round?:boolean}} o
 *   round: the wilds' rounded pebbles (pebble below) instead of packed cobbles
 */
export function cobble(x, y, o) {
  if (o.round) return pebble(x, y, o);
  const s = o.s, gx = Math.floor(x / s), gy = Math.floor(y / s), fl = o.flat ?? 1.3;
  let d1 = 1e9, d2 = 1e9, bx = 0, by = 0, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j;
    const px = (cx + 0.15 + hash2(cx, cy, o.seed) * 0.7) * s, py = (cy + 0.15 + hash2(cx, cy, o.seed + 1) * 0.7) * s;
    const dx = x + 0.5 - px, dy = (y + 0.5 - py) * fl, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; bx = dx; by = dy / fl; id = cx * 7919 + cy * 104729; }
    else if (d < d2) d2 = d;
  }
  const edge = Math.sqrt(d2) - Math.sqrt(d1);
  if (edge < 0.9) return o.mortar;
  let c = o.stones[Math.floor(hash2(id, 3, o.seed) * o.stones.length)];
  // each stone a low dome lit from the upper left: a bright cap, a lit
  // shoulder, a shaded underside and a dark rim where it beds into the mortar
  const r = s * 0.5, lit = -((bx / r) * 0.55 + (by / r) * 0.85);
  if (edge < 1.7 && by > -r * 0.2) c = mixPacked(c, 0xff000000, 0.32);
  else if (lit > 0.6) c = mixPacked(c, 0xffffffff, 0.24);
  else if (lit > 0.22) c = mixPacked(c, 0xffffffff, 0.11);
  else if (lit < -0.5) c = mixPacked(c, 0xff000000, 0.24);
  else if (lit < -0.15) c = mixPacked(c, 0xff000000, 0.1);
  const g = hash2(x, y, o.seed + 9);
  if (g > 0.993) c = mixPacked(c, 0xffffffff, 0.12); else if (g < 0.007) c = mixPacked(c, 0xff000000, 0.22);
  return c;
}

/** A stone's five tones, highlight to deep shade, by its base colour (cached). @type {Map<number, number[]>} */
const TONES = new Map();
/** @param {number} c */
function tones(c) {
  let t = TONES.get(c);
  if (!t) {
    t = [mixPacked(c, 0xffffffff, 0.34), mixPacked(c, 0xffffffff, 0.16), c, mixPacked(c, 0xff000000, 0.2), mixPacked(c, 0xff000000, 0.4)];
    TONES.set(c, t);
  }
  return t;
}

/**
 * The wilds' stone, after the reference sheets: closely packed irregular
 * cobbles with chipped corners, a little wider than tall, separated by
 * thin near-black joints. Five flat tones describe the upper-left light,
 * the body and a dark underside; broad mineral facets break up the body.
 * A few stones have a short crack, and with
 * `moss` a tuft of moss on the tops of some.
 * @param {number} x @param {number} y
 * @param {{stones:number[], mortar:number, s:number, seed:number, flat?:number, moss?:number[]}} o moss: [shade, lit] colours
 */
export function pebble(x, y, o) {
  const s = o.s, fl = o.flat ?? 1.3;
  // Stones fit their neighbours. A jittered, staggered Voronoi field leaves
  // thin joints, rather than isolated oval pebbles in large black holes.
  const gx = Math.floor(x / s), gy = Math.floor(y * fl / s);
  let d1 = Infinity, d2 = Infinity, d3 = Infinity, bx = 0, by = 0, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j;
    const px = (cx + (cy & 1) * 0.45 + 0.18 + hash2(cx, cy, o.seed) * 0.64) * s;
    const py = (cy + 0.18 + hash2(cx, cy, o.seed + 1) * 0.64) * s / fl;
    const dx = x + 0.5 - px, dy = (y + 0.5 - py) * fl;
    const d = dx * dx + dy * dy;
    if (d < d1) { d3 = d2; d2 = d1; d1 = d; bx = dx; by = dy; id = cx * 7919 + cy * 104729; }
    else if (d < d2) { d3 = d2; d2 = d; }
    else if (d < d3) d3 = d;
  }
  const edge = Math.sqrt(d2) - Math.sqrt(d1);
  // Chip the corners where three stones meet, rounding the packed cells.
  if (edge < 0.75 || Math.sqrt(d3) - Math.sqrt(d1) < 1.7) return o.mortar;
  const r = s * 0.56, e = Math.sqrt(d1) / r;
  const T = tones(o.stones[Math.floor(hash2(id, 3, o.seed) * o.stones.length)]);
  const u = bx / r, v = by / r, lit = -(u * 0.55 + v * 0.85);
  // moss on its top: a tuft of two greens on some of the stones
  if (o.moss && v < -0.22 && e > 0.3 && hash2(id, 11, o.seed) < 0.12) {
    const m = Math.abs(u - (hash2(id, 12, o.seed) - 0.5) * 0.8);
    if (m < 0.6 - (e - 0.3) * 0.25) return v < -0.55 || m < 0.2 ? o.moss[1] : o.moss[0];
  }
  // the underside's shadow, then the dome's light from the upper left
  let t;
  if (edge < 1.35 && v > -0.3) t = 4;
  else if (lit > 0.6 && edge < 2.7) t = 0;
  else if (lit > 0.25) t = 1;
  else if (lit > -0.35) t = 2;
  else t = lit > -0.7 ? 3 : 4;
  // Broad mineral facets, anchored to the stone, never salt-and-pepper noise.
  const n = noise2((x + id % 7) * 0.2, y * 0.24, o.seed + 31);
  if (t === 2 && n > 0.68) t = 1;
  else if (t === 2 && n < 0.23) t = 3;
  // a crack across some of them
  if (hash2(id, 13, o.seed) < 0.08 && e < 0.7) {
    const ca = hash2(id, 14, o.seed) * Math.PI, d = Math.abs(u * Math.sin(ca) - v * Math.cos(ca) + (hash2(id, 15, o.seed) - 0.5) * 0.4);
    if (d < 0.07 + 0.04 * Math.abs(Math.sin(u * 9))) return T[4];
  }
  return T[t];
}
