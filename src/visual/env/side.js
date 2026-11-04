// The side view of a wild region, after Noita: no perspective, only flat
// layers. A banded sky, flat silhouettes of the distance behind, and in
// front a cross-section of the ground itself — solid terrain whose surface
// is the only place things grow, painted as a mottled material (two
// colours in broad blotches, a few stones and grains) under a crust of
// grass, moss or ash, with ledges, overhangs and cave pockets; liquids lie
// in its hollows as flat pools; light sources glow over everything.
//
// The terrain lives in the canvas' `solid` map (1: ground), liquids in its
// `liquid` map; `markOpen` turns the dry surface into the open ground
// plants stand on (the surface row and the row of air above it).

import { fbm1, fbm2, hash2, noise2 } from '../noise.js';
import { mixPacked, pack, hex } from '../color.js';
import { CELL } from './paint.js';
import { cobble } from './stone.js';

/** A coordinate snapped down to the scene's grid of CELL squares. @param {number} v */
const snap = (v) => v - (((v % CELL) + CELL) % CELL);

/** Packed colour from '#rrggbb'. @param {string} h */
export const col = (h) => pack(hex(h));

/**
 * A pixel of a distant flat material, painted like the ground but fainter:
 * its colour, in broad blotches a shade lighter, with a rare grain.
 * @param {number} c packed colour @param {number} x @param {number} y @param {number} seed
 */
export function far(c, x, y, seed) {
  const g = hash2(Math.floor(x / CELL), Math.floor(y / CELL), seed + 7);
  if (g > 0.993) return mixPacked(c, 0xffffffff, 0.1);
  if (g < 0.006) return mixPacked(c, 0xff000000, 0.14);
  return fbm2(snap(x) * 0.05, snap(y) * 0.07, seed, 2) > 0.55 ? mixPacked(c, 0xffffffff, 0.06) : c;
}

/**
 * A surface line across the scene: base ± amp of low noise, with plateaus
 * (heights rounded to `step` pixels) so plants find level ground.
 * @param {number} W @param {number} seed @param {{base:number, amp:number, freq?:number, step?:number}} o
 */
export function heights(W, seed, o) {
  const top = new Float32Array(W), step = o.step ?? 1, f = o.freq ?? 0.012;
  for (let x = 0; x < W; x++) top[x] = Math.round((o.base + (fbm1(x * f, seed, 3) - 0.5) * 2 * o.amp) / step) * step;
  return top;
}

/** Lower the surface in a smooth hollow round cx (a basin for a pool, a river bed). */
export function dip(top, cx, hw, depth, flat = 0.4) {
  for (let x = Math.max(0, Math.floor(cx - hw)); x <= Math.min(top.length - 1, Math.ceil(cx + hw)); x++) {
    const u = Math.abs(x - cx) / hw, t = u < flat ? 1 : Math.cos(((u - flat) / (1 - flat)) * Math.PI / 2);
    top[x] = Math.round(Math.max(top[x], top[x] + depth * t * t));
  }
}

/** Raise a flat-topped mound or terrace step. */
export function raise(top, x0, x1, y, slope = 4) {
  for (let x = Math.max(0, Math.floor(x0 - slope * 3)); x <= Math.min(top.length - 1, Math.ceil(x1 + slope * 3)); x++) {
    const out = x < x0 ? (x0 - x) / slope : x > x1 ? (x - x1) / slope : 0;
    top[x] = Math.min(top[x], Math.round(y + out * out));
  }
}

/**
 * Fill the ground below a surface line (kept as the scene's ground line),
 * its steps snapped to the grid, a whole square wide and deep.
 * @param {any} cv @param {Float32Array} top
 */
export function fillSolid(cv, top) {
  // Geometry is sampled at every art pixel. Texture clusters may be coarser,
  // but snapping geometry to their grid creates artificial rectangular stairs.
  for (let x = 0; x < cv.W; x++) top[x] = Math.round(top[x]);
  cv.ground = top;
  for (let x = 0; x < cv.W; x++) for (let y = Math.max(0, Math.round(top[x])); y < cv.H; y++) cv.solid[y * cv.W + x] = 1;
}

/**
 * A lumpy blob of ground (v = 1: a floating ledge or outcrop) or of air
 * carved out of it (v = 0: a cave pocket, marked as cave).
 */
export function blob(cv, cx, cy, rx, ry, seed, v = 1, rough = 0.35) {
  if (!(rx > 0 && ry > 0)) return;
  const x0 = Math.max(0, Math.floor(cx - rx * 1.4)), x1 = Math.min(cv.W - 1, Math.ceil(cx + rx * 1.4));
  const y0 = Math.max(0, Math.floor(cy - ry * 1.4)), y1 = Math.min(cv.H - 1, Math.ceil(cy + ry * 1.4));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const u = (x + 0.5 - cx) / rx, w = (y + 0.5 - cy) / ry;
    // Broad geological lobes, then small chips. No blur or fractional alpha.
    const warp = (fbm2(x * 0.045, y * 0.065, seed, 2) - 0.5) * rough * 1.6;
    const chip = (noise2(x * 0.28, y * 0.3, seed + 17) - 0.5) * rough * 0.22;
    if (Math.abs(u) ** 2.6 + Math.abs(w) ** 2.3 + warp + chip > 1) continue;
    if (v && y < cy - ry * 0.55) continue;
    const k = y * cv.W + x;
    if (v) cv.solid[k] = 1; else if (cv.solid[k]) { cv.solid[k] = 0; cv.cave[k] = 1; }
  }
}

/**
 * Paint the terrain: crust on top, the mottled material below darkening
 * in steps with depth, stones and grains in it, dark rims where it meets
 * the air at its sides and underneath, and caves as a dark hollow.
 * @param {any} cv
 *   cobble: the body is cobbled stone (cave.js cobble) instead of blotches;
 *   rocks: stones set in the ground (lit on top); strata: horizontal bands
 *   of the second colour instead of blotches; seams: streaks of ore;
 *   layers: the region's strata under the crust, top down (sand, soil, clay,
 *   gravel, peat, ash, banded rock… see STRATA), each `h` rows deep (a range:
 *   its floor wavers along the ground), the body (cobble or blotches) below
 *   the last; each layer's top edge is drawn as a clean line
 * @param {{a:string, b:string, grain:string, dark:string, crust:string[], crustH?:number, deep:string, cave:string, seed:number, blot?:number,
 *   grass?:{cols:string[], tall?:number, flowers?:string[], rate?:number}, cobble?:{stones:string[], mortar:string, s?:number, flat?:number, moss?:string[]}, rocks?:{cols:string[], n:number, r?:number}, strata?:boolean, seams?:{cols:string[], n:number},
 *   layers?:{kind:string, cols:string[], h:[number, number]}[]}} o
 */
export function paintTerrain(cv, o) {
  const W = cv.W, H = cv.H, S = cv.solid;
  const A = col(o.a), B = col(o.b), G = col(o.grain), D = col(o.dark), deep = col(o.deep), cave = col(o.cave), crust = o.crust.map(col);
  const ch = o.crustH ?? 3, blot = o.blot ?? 0.06;
  const tex = o.cobble ? { stones: o.cobble.stones.map(col), mortar: col(o.cobble.mortar), s: o.cobble.s ?? 6, seed: o.seed, flat: o.cobble.flat, round: true, moss: o.cobble.moss ? o.cobble.moss.map(col) : undefined } : null;
  const layers = (o.layers || []).map((l, i) => ({ ...l, c: l.cols.map(col), paint: STRATA[l.kind] || STRATA.soil, seed: o.seed + 101 * (i + 1) }));
  /** where each layer ends in a column, rows below the crust (its floor wavers gently along the ground) */
  const floors = layers.length ? new Float32Array(W * layers.length) : null;
  if (floors) for (let x = 0; x < W; x++) {
    let acc = 0;
    layers.forEach((l, i) => { acc += l.h[0] + (l.h[1] - l.h[0]) * fbm1(x * 0.035, l.seed, 2); floors[x * layers.length + i] = Math.round(acc); });
  }
  const strat = cv.stratum || (cv.stratum = new Uint8Array(W * H));
  for (let x = 0; x < W; x++) {
    let d = 0;
    for (let y = 0; y < H; y++) {
      const k = y * W + x;
      if (!S[k]) {
        d = 0;
        if (cv.cave[k]) {
          // the back wall of a cave: the material in deep shade
          const m = fbm2(snap(x) * blot, snap(y) * blot * 1.3, o.seed + 5, 2) > 0.5;
          cv.set(x, y, mixPacked(m ? B : A, cave, 0.78));
        }
        continue;
      }
      const airAbove = y === 0 || !S[k - W];
      if (airAbove) d = 0; else d++;
      let c;
      // the material is sampled square by square, so its blotches step in blocks
      const qx = snap(x), qy = snap(y);
      // the strata under the crust: which one this row is in, and how far into it
      let li = -1, into = 0, thick = 1;
      if (d >= ch && floors) {
        // (in the main ground the strata lie level with its surface, running on under the pillars that
        // stand on it; in a ledge they follow the ledge's own top)
        const g = cv.ground ? Math.round(cv.ground[x]) : -1;
        // Material seams meander independently of the contour. A one-pixel
        // clustered transition replaces perfectly parallel stripes.
        const seam = (noise2(x * 0.18, y * 0.15, o.seed + 81) - 0.5) * 1.8;
        const e = (g >= 0 && y >= g ? y - g - ch : d - ch) + seam;
        for (let i = 0, top = 0; i < layers.length; top = floors[x * layers.length + i], i++) if (e >= 0 && e < floors[x * layers.length + i]) { li = i; into = e - top; thick = floors[x * layers.length + i] - top; break; }
      }
      // the crust's lower edge uneven: here and there it hangs a pixel or two into what lies under it, in drips two pixels wide
      const drip = hash2(x >> 1, 5, o.seed) < 0.32 ? 1 + Math.floor(hash2(x >> 1, 6, o.seed) * 2) : 0;
      if (d < ch) {
        let tone = Math.min(crust.length - 1, d);
        // Short lit clumps break up the otherwise ruler-straight turf/sand
        // bands; keep the top edge continuous enough to read as a ledge.
        const tuft = hash2(x >> 1, y - d, o.seed + 19);
        if (d === 0 && tuft < 0.16) tone = Math.min(crust.length - 1, 1);
        else if (d > 0 && tuft > 0.74) tone--;
        c = crust[tone];
      }
      else if (d < ch + drip && floors) c = crust[Math.min(crust.length - 1, d - 1)];
      else if (li >= 0) {
        const l = layers[li];
        c = l.paint(x, y, into, l.c, l.seed, thick);
        // its top edge a clean, darker line: the boundary between two strata reads at a glance
        if (into === 0 && li > 0) c = mixPacked(c, D, 0.4);
        strat[k] = li + 1;
      } else if (tex) {
        c = cobble(x, y, tex);
        // lit from above: darker down a pillar and deeper in the ground, in flat steps
        const dd = cv.ground ? Math.min(d, Math.max(0, y - cv.ground[x]) + 10) : d;
        const t = Math.min(4, Math.floor((dd - ch) / 10));
        if (t > 0) c = mixPacked(c, deep, t * 0.045);
      } else {
        const m = o.strata ? (Math.floor((qy + fbm1(qx * 0.02, o.seed, 2) * 14) / 8) % 2 ? 0.6 : 0.4) + (fbm2(qx * blot, qy * blot, o.seed, 2) - 0.5) * 0.3
          : fbm2(qx * blot, qy * blot * 1.3, o.seed, 2) + (noise2(qx * 0.3, qy * 0.3, o.seed + 9) - 0.5) * 0.08;
        c = m > 0.52 ? B : A;
        const g = hash2(Math.floor(x / CELL), Math.floor(y / CELL), o.seed + 3);
        if (g > 0.955) c = G; else if (g < 0.03) c = D;
        // deeper is darker, in flat steps (measured from the main ground, so a ledge's column leaves no streak)
        const dd = cv.ground ? Math.min(d, Math.max(0, y - cv.ground[x])) : d;
        const t = Math.min(4, Math.floor((dd - ch) / 14));
        if (t > 0) c = mixPacked(c, deep, t * 0.16);
      }
      // rims, a square thick, against air at the sides and below
      const air = (/** @type {number} */ dx, /** @type {number} */ dy) => { const xx = x + dx, yy = y + dy; return xx >= 0 && xx < W && yy < H && !S[yy * W + xx]; };
      let below = false, side = false;
      for (let j = 1; j <= CELL; j++) { below ||= air(0, j); side ||= air(-j, 0) || air(j, 0); }
      if (below || (side && d >= ch)) c = mixPacked(c, D, 0.55);
      cv.set(x, y, c);
    }
  }
  if (o.rocks) inclusions(cv, o.rocks, ch, o.seed);
  if (o.seams) seams(cv, o.seams, ch, o.seed);
  if (o.grass) grass(cv, o.grass, o.seed);
}

/**
 * The strata a region's ground is layered in, each painted in its own clean
 * pixel texture (flat tones, no dither): (x, y) the pixel, `into` its row
 * within the layer (0 at its top), `c` the layer's colours, `seed`, and
 * `thick` how many rows the layer has in that column.
 * @type {Record<string, (x:number, y:number, into:number, c:number[], seed:number, thick:number) => number>}
 */
export const STRATA = {
  // dirt: a band of bright earth along its top (wavering), a darker body streaked with
  // short lighter runs, small round pebbles bedded in it, each lit on top and shaded under, and a dark
  // seam along its floor — c: body, body 2, streak, top band, pebble, pebble shade
  dirt(x, y, into, c, seed, thick) {
    const band = 1 + Math.round(fbm1(x * 0.13, seed + 11, 2) * 2);
    if (thick - into <= 1 + (hash2(x >> 1, 7, seed) < 0.4 ? 1 : 0)) return mixPacked(c[0], 0xff000000, 0.3);
    // pebbles: one now and then in a cell of 10 × 7, an egg of 4–5 × 3, its corners rounded off
    const cx = Math.floor(x / 10), cy = Math.floor((y + (cx & 1) * 3) / 7);
    if (hash2(cx, cy, seed + 3) < 0.42) {
      const pw = 4 + (hash2(cx, cy, seed + 5) < 0.5 ? 1 : 0), ph = 3;
      const px = cx * 10 + 1 + Math.floor(hash2(cx, cy, seed + 4) * (9 - pw)), py = cy * 7 - (cx & 1) * 3 + 1 + Math.floor(hash2(cx, cy, seed + 8) * 3);
      const u = x - px, v = y - py;
      if (u >= 0 && u < pw && v >= 0 && v < ph && !((u === 0 || u === pw - 1) && (v === 0 || v === ph - 1))) return v === 0 ? c[4] : v === ph - 1 ? c[5] : (u < 2 ? c[4] : mixPacked(c[4], c[5], 0.45));
    }
    if (into < band) return hash2(x >> 1, y, seed + 9) < 0.2 ? c[2] : c[3];
    const clod = noise2(x * 0.23, y * 0.38, seed + 17);
    const streak = hash2(Math.floor((x + (y & 3) * 2) / 4), y, seed + 7);
    if (streak < 0.12 && clod > 0.45) return c[2];
    if (clod < 0.24) return mixPacked(c[0], 0xff000000, 0.18);
    if (clod > 0.72) return mixPacked(c[1], c[2], 0.5);
    return fbm2(x * 0.13, y * 0.25, seed, 2) > 0.5 ? c[1] : c[0];
  },
  // a band of grey rock between soils: lit along its top, dark along its floor, streaked — c: body, streak, lit, shade
  band(x, y, into, c, seed, thick) {
    if (into === 0) return c[2];
    if (into >= thick - 1) return c[3];
    return hash2(Math.floor((x + into * 3) / 6), y, seed) < 0.28 ? c[1] : c[0];
  },
  // sand: pale ripples lying level, a light skin on top, a dark grain here and there — c: light, mid, dark, grain
  sand(x, y, into, c, seed) {
    if (into === 0) return c[0];
    const g = hash2(x, y, seed + 1);
    if (g < 0.018) return c[3];
    if (g > 0.98) return c[0];
    // long faint ripples of shade lying level, the sand between them flat
    const v = y + fbm1(x * 0.05, seed, 2) * 5;
    if (Math.floor(v / 4) % 3 === 2 && hash2(x >> 3, Math.floor(v / 4), seed + 2) < 0.7) return c[2];
    const patch = noise2(x * 0.22, y * 0.32, seed + 12);
    return patch > 0.68 ? mixPacked(c[1], c[0], 0.45) : patch < 0.28 ? mixPacked(c[1], c[2], 0.4) : c[1];
  },
  // soil: two tones in soft blotches, small pebbles bedded in it, each lit on top — c: a, b, pebble lit, pebble shade
  soil(x, y, into, c, seed) {
    const cx = Math.floor(x / 5), cy = Math.floor((y + (cx & 1) * 2) / 4);
    if (hash2(cx, cy, seed + 3) < 0.16) {
      const px = cx * 5 + 1 + Math.floor(hash2(cx, cy, seed + 4) * 2), py = cy * 4 - (cx & 1) * 2 + 1;
      if (x >= px && x <= px + 1 && y >= py && y <= py + 1) return y === py ? c[2] : c[3];
    }
    return fbm2(x * 0.09, y * 0.14, seed, 2) > 0.52 ? c[1] : c[0];
  },
  // clay: thin smooth bands, gently wavering — c: the bands' colours in turn
  clay(x, y, into, c, seed) {
    const v = y + fbm1(x * 0.03, seed, 2) * 5;
    return c[Math.floor(v / 2) % c.length];
  },
  // banded rock (sandstone, shale): wavering beds of a few colours, each lit along its top, a thin
  // dark bedding line under each that breaks off now and then — c: the beds' colours in turn, then the line's
  banded(x, y, into, c, seed) {
    const n = c.length - 1, v = y + fbm1(x * 0.025, seed, 2) * 7 + fbm1(x * 0.11, seed + 3, 2) * 1.5, h = 4, b = Math.floor(v / h), f = v - b * h;
    const t = c[((b % n) + n) % n];
    if (f >= h - 1 && hash2(x >> 2, b, seed + 4) < 0.65) return c[n];
    const grain = noise2(x * 0.35, y * 0.4, seed + 8);
    if (f < 1) return mixPacked(t, 0xffffffff, grain > 0.5 ? 0.18 : 0.08);
    return grain < 0.24 ? mixPacked(t, c[n], 0.22) : grain > 0.74 ? mixPacked(t, 0xffffffff, 0.1) : t;
  },
  // gravel: small rounded stones of uneven sizes packed close, each lit on its upper left, grit between — c: lit, mid, shade, the grit
  gravel(x, y, into, c, seed) {
    return cobble(x, y, { stones: [c[1], c[1], c[0], c[2]], mortar: c[3], s: 3.6, seed, flat: 1.15, round: true });
  },
  // peat: dark, with paler fibres lying in short horizontal streaks — c: a, b, fibre
  peat(x, y, into, c, seed) {
    const s = hash2(Math.floor(x / 5), y, seed + 7);
    if (s < 0.14) return c[2];
    return fbm2(x * 0.08, y * 0.2, seed, 2) > 0.5 ? c[1] : c[0];
  },
  // ash: fine pale specks in faint level bands — c: a, b, speck
  ash(x, y, into, c, seed) {
    if (hash2(x, y, seed + 5) < 0.07) return c[2];
    return Math.floor((y + fbm1(x * 0.05, seed, 2) * 3) / 3) % 2 ? c[1] : c[0];
  },
};

/** Depth below the surface of a ground pixel (rows of ground above it). */
function depthAt(cv, x, y) {
  let d = 0;
  while (y - d - 1 >= 0 && cv.solid[(y - d - 1) * cv.W + x]) d++;
  return d;
}

/** Stones set in the ground: lumps of a lighter rock, lit along their tops, dark beneath. */
function inclusions(cv, r, ch, seed) {
  const [lit, mid, dark] = r.cols.map(col);
  for (let i = 0; i < r.n; i++) {
    const cx = Math.floor(hash2(i, 1, seed + 40) * cv.W), cy = Math.floor(hash2(i, 2, seed + 40) * cv.H);
    if (!cv.solid[cy * cv.W + cx] || depthAt(cv, cx, cy) < ch + 3) continue;
    const rx = 2 + hash2(i, 3, seed + 40) * (r.r ?? 5), ry = rx * (0.5 + hash2(i, 4, seed + 40) * 0.3);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (x < 0 || y < 0 || x >= cv.W || y >= cv.H || !cv.solid[y * cv.W + x]) continue;
      // judged square by square: a blocky stone
      const qx = snap(x) + CELL / 2, qy = snap(y) + CELL / 2;
      const e = (Math.abs(qx - cx) / rx) ** 3 + (Math.abs(qy - cy) / ry) ** 3 + (hash2(Math.floor(x / CELL), Math.floor(y / CELL), seed + i) - 0.5) * 0.5;
      if (e > 1) continue;
      cv.set(x, y, qy < cy - ry * 0.45 ? lit : e > 0.6 && qy > cy ? dark : mid);
    }
  }
}

/** Seams of ore: thin wavering horizontal streaks of colour in the ground. */
function seams(cv, sm, ch, seed) {
  const cols = sm.cols.map(col);
  for (let i = 0; i < sm.n; i++) {
    const y0 = Math.floor(hash2(i, 5, seed + 50) * cv.H), x0 = Math.floor(hash2(i, 6, seed + 50) * cv.W), len = 20 + Math.floor(hash2(i, 7, seed + 50) * 60);
    const c = cols[i % cols.length];
    for (let x = x0; x < Math.min(cv.W, x0 + len); x++) {
      const y = snap(Math.round(y0 + (fbm1(snap(x) * 0.05, seed + i, 2) - 0.5) * 8));
      for (const yy of [y, y + 1, ...(hash2(Math.floor(x / CELL), i, seed) > 0.6 ? [y + 2, y + 3] : [])]) if (yy > 0 && yy < cv.H && cv.solid[yy * cv.W + x] && depthAt(cv, x, yy) >= ch + 2) cv.set(x, yy, c);
    }
  }
}

/** A flat silhouette hanging from the top of the scene (a canopy, a cave roof) down to a noise line. */
export function hanging(cv, o) {
  const fill = col(o.fill), rim = o.rim ? col(o.rim) : fill, line = new Float32Array(cv.W);
  for (let x = 0; x < cv.W; x++) {
    const qx = snap(x);
    line[x] = snap(Math.round(o.base + (fbm1(qx * o.freq, o.seed, 4) - 0.5) * 2 * o.amp + (o.rough ? (hash2(qx >> 1, 1, o.seed) - 0.5) * o.rough : 0))) + CELL - 1;
    for (let y = 0; y <= Math.min(cv.H - 1, line[x]); y++) cv.set(x, y, y > line[x] - CELL ? rim : far(fill, x, y, o.seed));
  }
  return line;
}

/** Blades of grass (and a flower now and then) standing on the crust. */
function grass(cv, g, seed) {
  const cols = g.cols.map(col), fl = (g.flowers || []).map(col), tall = g.tall ?? 3, rate = g.rate ?? 0.6;
  for (let x = 0; x < cv.W; x++) for (let y = 1; y < cv.H; y++) {
    const k = y * cv.W + x;
    if (!cv.solid[k] || cv.solid[k - cv.W] || cv.liquid[k - cv.W]) continue;
    // a blade is a square wide: both columns of a square draw the same one
    const bx = Math.floor(x / CELL), r = hash2(bx, y, seed + 21);
    if (r > rate) continue;
    const h = 1 + Math.floor(hash2(bx, y, seed + 22) * tall);
    if (cv.grass) cv.grass[k] = 1;
    for (let j = 1; j <= h; j++) if (y - j >= 0 && !cv.solid[k - j * cv.W]) cv.set(x, y - j, cols[(j + (r > rate * 0.5 ? 1 : 0)) % cols.length]);
    if (fl.length && hash2(bx, y, seed + 23) < 0.025) for (const yy of [y - h - 1, y - h - 2]) cv.set(x, yy, fl[Math.floor(hash2(bx, y, seed + 24) * fl.length)]);
  }
}

/**
 * A pool: every pixel of air in [x0, x1] from `level` down to the ground
 * becomes liquid — a bright surface line, the body darkening smoothly, faintly
 * showing what lies behind it.
 * Its bed (the ground it touches) is repainted in `bed` (mud, silt, slag).
 * @param {any} cv @param {{surface:string, body:string[], see?:number, bed?:string[]}} o
 */
export function pool(cv, x0, x1, level, o) {
  const surf = col(o.surface), body = o.body.map(col), see = o.see ?? 0.15, bed = (o.bed || []).map(col);
  for (let x = Math.max(0, x0); x <= Math.min(cv.W - 1, x1); x++) {
    for (let y = level; y < cv.H; y++) {
      const k = y * cv.W + x;
      if (cv.solid[k]) break;
      cv.liquid[k] = 1;
      const d = y - level, f = Math.min(body.length - 1, d / 5), i = Math.floor(f), c = d === 0 ? surf : i >= body.length - 1 ? body[i] : mixPacked(body[i], body[i + 1], f - i);
      cv.paint(k, mixPacked(c, cv.pix.px[k], d === 0 ? 0 : see));
    }
  }
  if (bed.length) for (let y = level; y < cv.H; y++) for (let x = Math.max(0, x0 - 3); x <= Math.min(cv.W - 1, x1 + 3); x++) {
    const k = y * cv.W + x;
    if (!cv.solid[k]) continue;
    let near = 9;
    for (let j = -3; j <= 0; j++) for (let i = -3; i <= 3; i++) {
      const xx = x + i, yy = y + j;
      if (xx >= 0 && yy >= 0 && xx < cv.W && cv.liquid[yy * cv.W + xx]) near = Math.min(near, Math.max(Math.abs(i), -j));
    }
    if (near < 3) cv.paint(k, bed[Math.min(bed.length - 1, near + (hash2(x, y, 77) > 0.8 ? 1 : 0))]);
  }
  // Short horizontal reflections break up the flat fill. They are part of
  // the cached painting; the moving glints are still added by wild-scene.
  // The pool's own palette keeps lava reflections warm and water cool.
  for (let y = level + 1; y < cv.H; y += 3) for (let x = Math.max(1, x0); x < Math.min(cv.W - 1, x1); x += 5) {
    if (hash2(x, y, cv.seed + 83) > 0.45) continue;
    const len = 1 + Math.floor(hash2(x, y, cv.seed + 84) * 4);
    for (let i = 0; i < len; i++) {
      const k = y * cv.W + x + i;
      if (x + i <= x1 && cv.liquid[k]) cv.paint(k, mixPacked(cv.pix.px[k], y < level + 5 ? surf : body[0], y < level + 5 ? 0.7 : 0.35));
    }
  }
  return { x0, x1, level };
}

/** Sunlight behind the terrain, in broad shafts rather than a scene-wide haze. */
export function sunbeams(cv, sx, sy, strength = 0.12) {
  cv.light([1, 0.94, 0.7], (x, y) => {
    if (y < sy) return 0;
    const d = y - sy, u = x - sx + d * 0.65;
    let a = 0;
    for (const off of [-15, 0, 19]) {
      const q = Math.abs(u - off) / (3 + d * 0.08);
      if (q < 1) a = Math.max(a, (1 - q) * strength * Math.max(0, 1 - d / cv.H));
    }
    // Gentle rays keep the daytime sky's colour and cloud detail.
    return a * 0.48;
  }, sy, cv.H);
}

/**
 * The open ground: every dry surface pixel (ground with air above) and the
 * air pixel above it, away from the edges and out of liquids.
 */
export function markOpen(cv, minY = 30) {
  const W = cv.W, S = cv.solid, L = cv.liquid;
  for (let y = Math.max(1, minY); y < cv.H; y++) for (let x = 2; x < W - 2; x++) {
    const k = y * W + x;
    if (!S[k] || S[k - W] || L[k - W] || L[k]) continue;
    cv.open[k] = 1; cv.open[k - W] = 1;
  }
}

/**
 * A few ledges jutting out over the ground: about three fifths of n,
 * 32–46 pixels above the ground under them (clear of the columns in
 * `keep`, [x0, x1] ranges such as pools; `rise` sets other heights), and
 * `high` more (none by default) 42 pixels higher again. A ledge is left out where it would crowd
 * another: any two keep a clear gap beside each other, and one above
 * another leaves room for what grows on the lower one. None floats: each
 * stands on a buttress of rock, off centre and leaning, reaching down to
 * the ground or to a ledge below, and the shapes are joined as one mass of
 * ground (a smooth union), so a buttress flares into the ledge it holds and
 * into the ground it stands on.
 */
export function ledges(cv, top, rng, n, o = {}) {
  const keep = o.keep || [], r0 = o.rise || [32, 46];
  /** @type {((x:number, y:number) => number)[]} distance fields of the shapes so far (< 0 inside) */
  const shapes = [];
  /** @type {[number, number, number, number][]} the ledges so far: x0, top, x1, underside */
  const boxes = [];
  // (few of them: the regions are mostly low ground, a ledge or two standing out of it)
  const n0 = Math.max(3, Math.round(n * 0.6)), n1 = o.high || 0;
  // the dry stretches between the kept columns: the ledges are spread along them, not over the pools
  /** @type {[number, number][]} */
  const dry = [];
  let a = 0;
  for (const [k0, k1] of [...keep].sort((p, q) => p[0] - q[0])) { if (k0 > a) dry.push([a, k0]); a = Math.max(a, k1); }
  if (a < cv.W) dry.push([a, cv.W]);
  const span = dry.reduce((t, [p, q]) => t + q - p, 0);
  /** the column a fraction u of the way along the dry stretches, nudged by dx but kept a ledge's half width r inside its stretch */
  const along = (/** @type {number} */ u, /** @type {number} */ dx, /** @type {number} */ r) => {
    let d = u * span;
    for (const [p, q] of dry) {
      if (d <= q - p) return Math.round(q - p > 2 * r ? Math.max(p + r, Math.min(q - r, p + d + dx)) : (p + q) / 2);
      d -= q - p;
    }
    return cv.W / 2;
  };
  for (const [tier, count, rise] of /** @type {[number, number, number[]][]} */ ([[0, n0, r0], [1, n1, [r0[0] + 42, r0[1] + 42]]])) {
    let x0 = cv.W, x1 = 0, y0 = cv.H;
    for (let i = 0; i < count; i++) {
      const rx = rng.int(22, 30), x = along(tier ? (i + 1) / (count + 1) : (i + 0.5) / count, rng.int(-14, 14), rx + (keep.length ? 4 : -rx));
      if (!tier && keep.some(([a, b]) => x + rx > a && x - rx < b)) continue;
      const ground = Math.min(top[Math.max(0, x - rx)], top[Math.min(cv.W - 1, x)], top[Math.min(cv.W - 1, x + rx)]);
      // never so high that what grows on it would reach out of the scene
      const y = snap(Math.max(60, Math.round(ground) - rng.int(rise[0], rise[1])));
      if (ground - y < 24) continue;
      const ry = rng.int(7, 10), seed = rng.int(0, 1e9);
      // a clear gap beside every other ledge, and room to grow between one and the next above or below it
      const box = /** @type {[number, number, number, number]} */ ([x - rx, y - ry * 0.55, x + rx, y + ry]);
      if (boxes.some((b) => box[0] < b[2] + 12 && box[2] > b[0] - 12 && box[1] < b[3] + 26 && box[3] + 26 > b[1])) continue;
      shapes.push(slab(x, y, rx, ry, seed));
      // the buttress: under one end of the ledge, leaning a little, down to whatever lies below
      const side = rng.next() < 0.5 ? -1 : 1, bx = x + side * Math.round(rx * rng.next() * 0.25);
      const lean = side * rng.int(0, 4), fx = Math.max(2, Math.min(cv.W - 3, bx + lean));
      // no buttress stands in a pool
      if (keep.some(([a, b]) => fx + rx * 0.5 > a && fx - rx * 0.5 < b)) { shapes.pop(); continue; }
      let land = Math.round(y + ry);
      while (land < cv.H - 1 && !cv.solid[land * cv.W + fx]) land++;
      const w0 = Math.round(rx * (tier ? 0.42 : 0.4)) + rng.int(0, 3), w1 = w0 + rng.int(4, 10);
      shapes.push(buttress(bx, y + ry * 0.6, fx, land + 3, w0, w1, seed));
      boxes.push(box);
      x0 = Math.min(x0, x - rx - 12, fx - w1 - 12); x1 = Math.max(x1, x + rx + 12, fx + w1 + 12); y0 = Math.min(y0, y - ry * 2);
    }
    // fill every square inside the union of the shapes and the ground; never fill a cave
    const ground = (/** @type {number} */ x, /** @type {number} */ y) => top[Math.max(0, Math.min(cv.W - 1, Math.round(x)))] - y;
    for (let Y = snap(Math.max(0, Math.floor(y0))); Y < cv.H; Y += CELL) for (let X = snap(Math.max(0, x0)); X < Math.min(cv.W, x1); X += CELL) {
      const x = X + CELL / 2, y = Y + CELL / 2;
      let d = ground(x, y);
      for (const f of shapes) d = smin(d, f(x, y), 8);
      if (d >= 0) continue;
      for (let yy = Y; yy < Math.min(cv.H, Y + CELL); yy++) for (let xx = X; xx < Math.min(cv.W, X + CELL); xx++) {
        const k = yy * cv.W + xx;
        if (!cv.cave[k]) cv.solid[k] = 1;
      }
    }
  }
}

/** Smooth minimum of two distances: their union, with a fillet of radius about k where they meet. */
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * A ledge's distance field: a squared-off slab (a superellipse) with its
 * upper third cut level, its edge ragged.
 */
function slab(cx, cy, rx, ry, seed) {
  const cut = cy - ry * 0.55;
  return (/** @type {number} */ x, /** @type {number} */ y) => {
    // well clear of it: far enough that the union takes no fillet from it
    if (Math.abs(x - cx) > rx + 16 || Math.abs(y - cy) > ry + 16) return 1e3;
    const e = Math.pow(Math.abs(x - cx) / rx, 4) + Math.pow(Math.abs(y - cy) / ry, 3);
    const d = (Math.pow(e, 0.28) - 1) * ry + (fbm2(x * 0.08, y * 0.12, seed, 2) - 0.5) * 4;
    return Math.max(d, cut - y);
  };
}

/** A buttress's distance field: a ragged column from (x0, y0) to (x1, y1), w0 wide at the top widening to w1 at its foot. */
function buttress(x0, y0, x1, y1, w0, w1, seed) {
  const vx = x1 - x0, vy = y1 - y0, ll = vx * vx + vy * vy || 1;
  const lx = Math.min(x0, x1) - w1 - 16, hx = Math.max(x0, x1) + w1 + 16, ly = Math.min(y0, y1) - w1 - 16, hy = Math.max(y0, y1) + w1 + 16;
  return (/** @type {number} */ x, /** @type {number} */ y) => {
    if (x < lx || x > hx || y < ly || y > hy) return 1e3;
    const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / ll));
    const r = (w0 + (w1 - w0) * t * t) / 2 + (hash2(Math.floor(y / 4), 0, seed) - 0.5) * 1.6;
    return Math.hypot(x - x0 - vx * t, y - y0 - vy * t) - r;
  };
}

/** The row of the main ground's surface in a column (where trees and the like stand; ledges above it are ignored). */
export function surfaceAt(cv, x) {
  x = Math.max(0, Math.min(cv.W - 1, Math.round(x)));
  if (cv.ground) return Math.round(cv.ground[x]);
  for (let y = 0; y < cv.H; y++) if (cv.solid[y * cv.W + x]) return y;
  return cv.H - 1;
}

/**
 * A flat silhouette of the distance: one colour below a noise line (with a
 * lighter rim), e.g. hills, mountains, a far wood's canopy.
 * @param {any} cv @param {{base:number, amp:number, freq:number, seed:number, fill:string, rim?:string, peaks?:number, rough?:number, bottom?:number}} o
 */
export function silhouette(cv, o) {
  const fill = col(o.fill), rim = o.rim ? col(o.rim) : fill, line = new Float32Array(cv.W);
  for (let x = 0; x < cv.W; x++) {
    const qx = snap(x);
    let v = fbm1(qx * o.freq, o.seed, 4);
    if (o.peaks) v = Math.pow(v, 1 / (1 + o.peaks));
    // a crest broken at a finer scale too: knolls and dips along it, never a smooth curve
    line[x] = snap(Math.round(o.base - (v - 0.5) * 2 * o.amp - (fbm1(qx * 0.11, o.seed + 5, 2) - 0.5) * Math.max(2, o.amp * 0.35) - (o.rough ? (hash2(qx >> 1, 0, o.seed) - 0.5) * o.rough : 0)));
  }
  // lit along its crest (a rim one to three pixels deep, thickest on the slopes facing the light), shaded in a band under that
  const shade = mixPacked(fill, 0xff000000, 0.12);
  for (let x = 0; x < cv.W; x++) {
    const rise = line[Math.max(0, x - 2)] - line[Math.min(cv.W - 1, x + 2)], deep = 1 + (rise < 0 ? 2 : rise === 0 ? 1 : 0) + (hash2(x >> 1, 9, o.seed) < 0.3 ? -1 : 0);
    const band = 3 + Math.round(fbm1(x * 0.08, o.seed + 6, 2) * 5);
    for (let y = Math.max(0, line[x]); y < (o.bottom ?? cv.H); y++) {
      const d = y - line[x];
      cv.set(x, y, d < Math.max(1, deep) ? rim : d < deep + band && rise > 0 ? shade : far(fill, x, y, o.seed));
    }
  }
  return line;
}

/**
 * A range of mountains: a crest broken at several scales into summits,
 * shoulders and notches, its slopes uneven, and the rock below painted by
 * rockFace — lit on the faces toward the light, shaded on the others,
 * scored by gullies running down from every summit, the tallest capped
 * with snow that reaches down the gullies. Returns the crest line.
 * @param {any} cv @param {{base:number, amp:number, n:number, seed:number, fill:string, lit?:string, dark?:string, snow?:string, snowAt?:number, bottom?:number}} o
 */
export function mountains(cv, o) {
  const W = cv.W, peaks = [];
  for (let i = 0; i < o.n; i++) {
    const px = ((i + 0.15 + hash2(i, 1, o.seed) * 0.7) / o.n) * (W + 80) - 40, h = o.amp * (0.45 + hash2(i, 2, o.seed) * 0.55);
    // each side its own steepness
    peaks.push([px, h, h * (1.2 + hash2(i, 3, o.seed) * 1.1), h * (1.2 + hash2(i, 4, o.seed) * 1.1)]);
  }
  const line = new Float32Array(W), own = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    let best = -1e9, bi = 0;
    for (let i = 0; i < peaks.length; i++) {
      const [px, h, wl, wr] = peaks[i], u = Math.min(1, Math.abs(x - px) / (x < px ? wl : wr));
      const v = h * (1 - u) * (1 - u * 0.3);
      if (v > best) { best = v; bi = i; }
    }
    // shoulders, notches and crags: the crest broken at three scales
    const h = peaks[bi][1];
    best += (fbm1(x * 0.045, o.seed + 11, 3) - 0.5) * h * 0.34 + (fbm1(x * 0.19, o.seed + 12, 2) - 0.5) * h * 0.1 + (hash2(x >> 1, 7, o.seed) - 0.5) * 1.4;
    line[x] = Math.round(o.base - Math.max(0, best));
    own[x] = bi;
  }
  rockFace(cv, line, own, peaks.map(([px, h]) => [px, o.base - h, h]), o);
  return line;
}

/**
 * The rock of a mountain or a volcano below its crest line: every pixel on
 * the face of the summit that owns its column (`own`), lit left of a ridge
 * wandering down from that summit and shaded right of it, scored by
 * gullies radiating down from the summit (darker grooves, paler ribs),
 * fading into the plain body colour lower down; snow above the snow line,
 * deepest in the gullies.
 * @param {any} cv @param {Float32Array} line @param {Int16Array} own @param {number[][]} tops [x, y, height] of each summit
 * @param {{seed:number, fill:string, lit?:string, dark?:string, snow?:string, snowAt?:number, bottom?:number, base?:number, amp?:number, deep?:number}} o
 */
export function rockFace(cv, line, own, tops, o) {
  const W = cv.W, fill = col(o.fill), L = o.lit ? col(o.lit) : mixPacked(fill, 0xffffffff, 0.18), D = o.dark ? col(o.dark) : mixPacked(fill, 0xff000000, 0.18);
  const LL = mixPacked(L, 0xffffffff, 0.16), DD = mixPacked(D, 0xff000000, 0.2);
  const snow = o.snow ? col(o.snow) : 0, snowS = o.snow ? mixPacked(snow, D, 0.32) : 0, snowL = o.snow ? mixPacked(snow, L, 0.18) : 0;
  const snowAt = o.snowAt ?? (o.base !== undefined && o.amp !== undefined ? o.base - o.amp * 0.6 : -1e9);
  for (let x = 0; x < W; x++) {
    const i = own[x], [px, py, h] = tops[i];
    for (let y = Math.max(0, line[x]); y < (o.bottom ?? cv.H); y++) {
      const d = y - line[x], below = Math.max(1, y - py);
      // the ridge down from the summit, wandering
      const rx = px + (fbm1(y * 0.05, o.seed + i * 13, 3) - 0.5) * Math.min(1, below / 24) * h * 0.7;
      const lit = x < rx;
      // gullies: grooves radiating from the summit, broken along their length
      const ang = (x - px) / (below + 6), g = fbm2(ang * 9, y * 0.035, o.seed + i * 7, 2);
      let c = lit ? L : D;
      if (g > 0.6) c = lit ? fill : DD; else if (g < 0.32) c = lit ? LL : fill;
      // the face fades into the body of the mountain lower down, raggedly
      const deep = (o.deep ?? 0.95) * h + (fbm1(x * 0.04, o.seed + 9, 2) - 0.5) * h * 0.5;
      if (d > deep) c = g > 0.66 ? D : fill;
      if (d === 0) c = lit ? LL : c;
      if (snow) {
        const edge = snowAt + (g - 0.45) * 22 + (hash2(x >> 1, y >> 2, o.seed + 3) - 0.5) * 3;
        if (y < edge) c = lit ? (g < 0.35 ? snowL : snow) : snowS;
      }
      cv.set(x, y, c);
    }
  }
}

/** A flat silhouette of a tree (pine, round-crowned or bare) standing at (x, y). */
export function treeShape(cv, x, y, h, kind, c, seed) {
  const fill = col(c), tw = Math.max(1, Math.round(h / 14));
  // drawn a square at a time
  const put = (px, py) => {
    const X = snap(px), Y = snap(py);
    for (let j = Y; j < Y + CELL; j++) for (let i = X; i < X + CELL; i++) if (i >= 0 && j >= 0 && i < cv.W && j < cv.H) cv.paint(j * cv.W + i, far(fill, i, j, seed));
  };
  for (let j = 0; j < h * (kind === 'pine' ? 0.9 : 0.6); j++) for (let i = -tw; i < tw; i++) put(Math.round(x + i), Math.round(y - j));
  if (kind === 'pine') {
    for (let j = 0; j < h * 0.85; j++) {
      const t = j / (h * 0.85), w = Math.round((1 - t) * h * 0.28 * (0.8 + 0.4 * ((j >> 2) % 2)));
      for (let i = -w; i <= w; i++) put(Math.round(x + i), Math.round(y - h * 0.15 - j));
    }
  } else if (kind === 'dead') {
    for (let b = 0; b < 4; b++) {
      const s = b % 2 ? 1 : -1, y0 = y - h * (0.35 + b * 0.12);
      for (let i = 0; i < h * 0.2; i++) put(Math.round(x + s * i), Math.round(y0 - i * 0.7));
    }
  } else {
    // a crown of round clumps, each lit on its upper left and shaded under,
    // the back ones first so the front ones overlap them
    const r = h * 0.3, cy = y - h * 0.65, lit = mixPacked(fill, 0xffffffff, 0.14), shade = mixPacked(fill, 0xff000000, 0.22);
    const n = 4 + Math.floor(hash2(x, 3, seed) * 3), clumps = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash2(i, 1, seed) * 0.8, d = r * (0.35 + hash2(i, 2, seed) * 0.35);
      clumps.push([x + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d * 0.8, r * (0.45 + hash2(i, 4, seed) * 0.25)]);
    }
    clumps.sort((p, q) => p[1] - q[1]);
    clumps.push([x, cy - r * 0.1, r * 0.62]);
    for (const [ccx, ccy, cr] of clumps) for (let j = Math.floor(-cr); j <= cr; j++) for (let i = Math.floor(-cr); i <= cr; i++) {
      const e = (i * i + j * j) / (cr * cr) + (hash2(Math.round(ccx + i), Math.round(ccy + j), seed) - 0.5) * 0.25;
      if (e > 1) continue;
      const px = Math.round(ccx + i), py = Math.round(ccy + j);
      if (px < 0 || py < 0 || px >= cv.W || py >= cv.H) continue;
      const l = -(i / cr) * 0.5 - (j / cr) * 0.85;
      cv.paint(py * cv.W + px, l > 0.55 && e > 0.25 ? lit : l < -0.5 ? shade : far(fill, px, py, seed));
    }
  }
}

/**
 * Light from a source, added in flat steps when the scene is finished: a
 * disc fading out to radius r (Canvas.glow).
 * @param {any} cv @param {number} x @param {number} y @param {number} r @param {number[]} rgb @param {number} k
 */
export function glow(cv, x, y, r, rgb, k) {
  cv.glow(x, y, r, rgb, k);
}

/**
 * Where loose grains trickle from: undersides of overhangs and ledges
 * (ground with air below) — [x, y, how far they fall before they land].
 */
export function drips(cv, seed, n) {
  const out = [];
  for (let y = 20; y < cv.H - 10; y++) for (let x = 4; x < cv.W - 4; x++) {
    const k = y * cv.W + x;
    if (!cv.solid[k] || cv.solid[k + cv.W] || cv.liquid[k + cv.W] || hash2(x, y, seed) > 0.05) continue;
    let fall = 1;
    while (y + fall < cv.H && !cv.solid[k + fall * cv.W] && !cv.liquid[k + fall * cv.W]) fall++;
    if (fall > 6) out.push([x, y + 1, fall - 1]);
  }
  return out.filter((_, i) => i % Math.max(1, Math.floor(out.length / n)) === 0).slice(0, n);
}
