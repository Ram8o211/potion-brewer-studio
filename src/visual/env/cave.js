// The cavern every wild region is set in: a dioramic cut through the
// underworld. A dark back wall with rows of far pillars fading into fog;
// a rocky roof with stalactites and curtains of hanging vines (or, where
// the region opens to the sky, a cave mouth framing it); cobbled stone
// for the ground and its mushroom-capped pillars, mossy caps dripping
// moss down their sides and strands from their undersides; and the
// little lights that make the dark worth looking at — glowing mushrooms,
// torches, lava falls — with a vignette closing the picture.

import { fbm1, fbm2, hash2 } from '../noise.js';
import { mixPacked } from '../color.js';
import { col, far } from './side.js';
import { cobble } from './stone.js';
import { illuminate } from './lighting.js';

/**
 * Far pillars of the cave, standing between its floor and its roof: wavy
 * columns flaring at both ends, some only a stalagmite or a stalactite,
 * painted as a flat faint material. Far rows first, near rows after.
 * @param {any} cv @param {{n:number, fill:string, rim?:string, seed:number, w:[number, number], floor:number, caps?:boolean}} o
 */
export function farPillars(cv, o) {
  const fill = col(o.fill), rim = o.rim ? col(o.rim) : fill, W = cv.W;
  for (let i = 0; i < o.n; i++) {
    const cx = ((i + 0.2 + hash2(i, 1, o.seed) * 0.6) / o.n) * W, w = o.w[0] + hash2(i, 2, o.seed) * (o.w[1] - o.w[0]);
    const kind = hash2(i, 3, o.seed), top = kind < 0.25 ? o.floor - 30 - hash2(i, 4, o.seed) * 50 : -2, bottom = kind > 0.85 ? 30 + hash2(i, 5, o.seed) * 50 : o.floor + 20;
    for (let y = Math.max(0, Math.floor(top)); y < Math.min(cv.H, bottom); y++) {
      const u = (y - top) / Math.max(1, bottom - top);
      // narrowest in the middle, flaring into the floor and the roof
      let hw = w / 2 * (0.75 + 1.1 * (u - 0.5) ** 2 * 2) + (fbm1(y * 0.08, o.seed + i, 2) - 0.5) * w * 0.4;
      if (kind < 0.25) hw *= Math.min(1, u * 2.4);
      if (kind > 0.85) hw *= Math.min(1, (1 - u) * 2.4);
      const sx = cx + (fbm1(y * 0.015, o.seed + i * 3, 2) - 0.5) * w * 0.8;
      for (let x = Math.max(0, Math.floor(sx - hw)); x <= Math.min(W - 1, Math.ceil(sx + hw)); x++) cv.set(x, y, x < sx - hw + 2 ? rim : far(fill, x, y, o.seed + i));
    }
    if (o.caps && kind >= 0.25 && kind <= 0.85) {
      // a mushroom cap part way up
      const cy = o.floor - 40 - hash2(i, 6, o.seed) * 60, cw = w * (1.6 + hash2(i, 7, o.seed));
      for (let y = Math.floor(cy - 4); y < cy + 5; y++) for (let x = Math.floor(cx - cw); x <= cx + cw; x++) {
        if (x < 0 || x >= W || y < 0) continue;
        const e = ((x - cx) / cw) ** 4 + ((y - cy) / (y < cy ? 4 : 5)) ** 2;
        if (e <= 1) cv.set(x, y, y < cy - 3 ? rim : far(fill, x, y, o.seed + i));
      }
    }
  }
}

/** Mix a colour over the whole scene in bands (fog between depth layers). */
export function fog(cv, c, y0, y1, k, seed) {
  const fc = col(c);
  cv.wash(fc, (x, y) => {
    const t = (y - y0) / Math.max(1, y1 - y0);
    return t < 0 || t > 1 ? 0 : Math.sin(t * Math.PI) * k * (0.7 + fbm2(x * 0.02, y * 0.06, seed, 2) * 0.6);
  }, Math.max(0, Math.floor(y0)), Math.ceil(y1));
}

/**
 * The cave's frame: its roof (a band of rock with a ragged underside and
 * stalactites) and its side walls, painted in a darker cobble, a lip of
 * moss along the roof's underside. With `open` [x0, x1] the roof gives way
 * in an arch to the sky — a cave mouth. Drawn behind the ground.
 * Returns the roof's underside row in each column (-1 where it is open).
 * @param {any} cv
 * @param {{seed:number, stones:string[], mortar:string, s?:number, dark?:number, roof:[number, number], walls?:[number, number],
 *   open?:[number, number], stal?:{n:number, len:[number, number], w?:[number, number], tip?:string}, lip?:string[]}} o
 */
export function caveFrame(cv, o) {
  const W = cv.W, H = cv.H, seed = o.seed;
  const tex = { stones: o.stones.map(col), mortar: col(o.mortar), s: o.s ?? 8, seed, round: true };
  const roof = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let y = o.roof[0] + fbm1(x * 0.03, seed, 3) * (o.roof[1] - o.roof[0]) + (hash2(x >> 1, 0, seed) - 0.5) * 2;
    if (o.open) {
      const [a, b] = o.open, u = (x - a) / (b - a);
      if (u > 0 && u < 1) y = y * Math.pow(1 - Math.sin(u * Math.PI), 1.6) - Math.sin(u * Math.PI) * 6;
    }
    roof[x] = Math.round(y);
  }
  const [wl, wr] = o.walls || [0, 0];
  const wallL = (y) => wl ? wl * (0.6 + 0.8 * (1 - y / H) ** 2) + (fbm1(y * 0.05, seed + 3, 3) - 0.5) * 10 : -1;
  const wallR = (y) => wr ? W - 1 - (wr * (0.6 + 0.8 * (1 - y / H) ** 2) + (fbm1(y * 0.05, seed + 4, 3) - 0.5) * 10) : W;
  const inRock = (x, y) => y <= roof[Math.max(0, Math.min(W - 1, x))] || x < wallL(y) || x > wallR(y);
  const dark = o.dark ?? 0.45, lip = (o.lip || []).map(col);
  for (let y = 0; y < H; y++) {
    const l = wallL(y), r = wallR(y);
    for (let x = 0; x < W; x++) {
      if (!(y <= roof[x] || x < l || x > r)) continue;
      cv.rock[y * W + x] = 1;
      // the edge facing the cave: a mossy lip under the roof, a lit rim on the walls
      const under = !inRock(x, y + 1) || !inRock(x, y + 2), inner = (x < l && !inRock(x + 2, y)) || (x > r && !inRock(x - 2, y));
      let c = mixPacked(cobble(x, y, tex), 0xff000000, dark);
      if (under && lip.length && y <= roof[x]) c = lip[!inRock(x, y + 1) ? 0 : 1];
      else if (under || inner) c = mixPacked(c, 0xff000000, 0.35);
      cv.set(x, y, c);
    }
  }
  // stalactites hanging from the roof
  const tips = [];
  if (o.stal) {
    const st = o.stal, tip = st.tip ? col(st.tip) : 0;
    for (let i = 0; i < st.n; i++) {
      const x0 = Math.round(((i + hash2(i, 1, seed + 7)) / st.n) * W), y0 = roof[Math.max(0, Math.min(W - 1, x0))];
      if (y0 < 0) continue;
      const L = st.len[0] + hash2(i, 2, seed + 7) * (st.len[1] - st.len[0]), w = (st.w || [3, 7])[0] + hash2(i, 3, seed + 7) * ((st.w || [3, 7])[1] - (st.w || [3, 7])[0]);
      const bend = (hash2(i, 4, seed + 7) - 0.5) * 4;
      for (let j = -2; j < L; j++) {
        const u = Math.max(0, j) / L, hw = w * Math.pow(1 - u, 1.2) + (j < 2 ? 1.5 : 0), cx = x0 + bend * u * u;
        for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
          if (x < 0 || x >= W || y0 + j < 0 || y0 + j >= H || Math.abs(x - cx) > hw) continue;
          const y = y0 + j;
          let c = mixPacked(cobble(x, y, { ...tex, s: 3 }), 0xff000000, dark);
          if (x < cx - hw + 1.5) c = mixPacked(c, 0xffffffff, 0.12); else if (x > cx + hw - 1.5) c = mixPacked(c, 0xff000000, 0.35);
          if (tip && u > 0.8) c = mixPacked(c, tip, (u - 0.8) * 4);
          cv.set(x, y, c);
          cv.rock[y * W + x] = 1;
        }
      }
      tips.push([Math.round(x0 + bend), Math.round(y0 + L)]);
    }
  }
  cv.meta.tips = tips;
  return { roof, wallL, wallR };
}

/**
 * Curtains of vines hanging from a line (the roof's underside): strands a
 * pixel wide with leaves on alternate sides, in clusters, darker toward
 * their tips, stopping short of the ground.
 * @param {any} cv @param {Float32Array} line @param {{cols:string[], seed:number, rate?:number, len:[number, number], leaf?:string, flower?:string}} o
 */
export function vines(cv, line, o) {
  const W = cv.W, cols = o.cols.map(col), leaf = col(o.leaf || o.cols[0]), fl = o.flower ? col(o.flower) : 0, rate = o.rate ?? 0.3;
  for (let x = 1; x < W - 1; x++) {
    const y0 = line[x];
    if (y0 < 0) continue;
    const cluster = fbm1(x * 0.06, o.seed, 2);
    if (hash2(x, 1, o.seed) > rate * cluster * 2) continue;
    const L = Math.round(o.len[0] + (o.len[1] - o.len[0]) * hash2(x, 2, o.seed) * cluster * 1.6);
    let vx = x;
    // each vine swings from the roof, its end the furthest
    const g = cv.swayGroup(0, 1 + L * 0.05);
    for (let j = 1; j <= L; j++) {
      const y = y0 + j;
      if (y >= cv.H || cv.solid[y * W + vx] || cv.liquid[y * W + vx]) break;
      if (hash2(x, j >> 3, o.seed + 5) > 0.85 && j % 8 === 0) vx += hash2(x, j, o.seed) < 0.5 ? -1 : 1;
      if (vx < 0 || vx >= W) break;
      const c = cols[Math.min(cols.length - 1, Math.floor((j / Math.max(1, L)) * cols.length))];
      cv.swaySet(vx, y, c, g);
      if (j % 3 === 0) { const s = (j / 3) % 2 ? 1 : -1; if (vx + s >= 0 && vx + s < W) cv.swaySet(vx + s, y, leaf, g); }
      if (fl && j === L && hash2(x, 3, o.seed) < 0.15) cv.swaySet(vx, y + 1, fl, g);
    }
  }
}

/**
 * Moss on the ground's caps: running down the sides of every ledge and
 * pillar a little way, and hanging in strands from their undersides.
 * @param {any} cv @param {{cols:string[], seed:number, drape?:number, rate?:number, len?:number}} o
 */
export function moss(cv, o) {
  const W = cv.W, H = cv.H, S = cv.solid, cols = o.cols.map(col), drape = o.drape ?? 10, rate = o.rate ?? 0.25, len = o.len ?? 12;
  for (let x = 1; x < W - 1; x++) {
    let d = 0, top = 0;
    for (let y = 0; y < H; y++) {
      const k = y * W + x;
      if (!S[k]) { d = 0; continue; }
      if (y === 0 || !S[k - W]) { d = 0; top = y; } else d++;
      // down the sides: where air is beside it, for a run set by where the cap is
      const side = !S[k - 1] || !S[k + 1];
      if (side && d > 0 && d < drape * (0.4 + hash2(x >> 1, top, o.seed))) cv.set(x, y, cols[Math.min(cols.length - 1, 1 + (d > drape * 0.6 ? 1 : 0))]);
      // and in strands from the underside of a cap
      if (y + 1 < H && !S[k + W] && !cv.liquid[k + W] && y - top < 24 && hash2(x, y, o.seed + 1) < rate) {
        const L = 1 + Math.floor(hash2(x, y, o.seed + 2) ** 2 * len);
        // a strand long enough to swing sways from its cap
        const g = L >= 4 ? cv.swayGroup(0, 0.5 + L * 0.06) : -1;
        for (let j = 1; j <= L && y + j < H && !S[k + j * W] && !cv.liquid[k + j * W]; j++) {
          const c = cols[Math.min(cols.length - 1, Math.floor((j / L) * cols.length))];
          if (g >= 0) cv.swaySet(x, y + j, c, g); else cv.set(x, y + j, c);
        }
      }
    }
  }
}

/**
 * Small mushrooms glowing in the dark on the open ground: a pale stem and a
 * bright cap, lighting the ground round them. Not a harvest — scenery.
 * @param {any} cv @param {{n:number, cap:string, lit:string, stem:string, rgb:number[], seed:number, minY?:number}} o
 */
export function glowShrooms(cv, o) {
  const W = cv.W, cap = col(o.cap), lit = col(o.lit), stem = col(o.stem), spots = [];
  for (let k = 0; k < cv.open.length; k++) if (cv.open[k] && cv.solid[k] && Math.floor(k / W) >= (o.minY ?? 0)) spots.push(k);
  const out = [];
  for (let i = 0; i < o.n * 4 && out.length < o.n && spots.length; i++) {
    const k = spots[Math.floor(hash2(i, 1, o.seed) * spots.length)], x = k % W, y = Math.floor(k / W);
    if (out.some(([a, b]) => Math.abs(a - x) < 10 && Math.abs(b - y) < 6)) continue;
    // a cluster on level ground, clear of trees, props and overhangs
    if (!cv.clear(x - 4, y - 8, x + 4, y - 1) || !cv.solid[k - 4] || !cv.solid[k + 4]) continue;
    const n = 1 + Math.floor(hash2(i, 2, o.seed) * 3);
    for (let m = 0; m < n; m++) {
      const mx = x + (m - (n - 1) / 2) * 3, h = 2 + Math.floor(hash2(i, m + 3, o.seed) * 4), r = 1 + (m === 0 ? 1 : 0);
      for (let j = 1; j <= h; j++) cv.setThing(mx, y - j, stem);
      for (let dx = -r; dx <= r; dx++) cv.setThing(mx + dx, y - h - 1, cap);
      for (let dx = -r + 1; dx <= r - 1; dx++) cv.setThing(mx + dx, y - h - 2, lit);
      cv.setThing(mx - r, y - h - 2, cap);
    }
    cv.block(x - 4, y - 8, x + 5, y + 1);
    cv.claim(x - 4, y - 8, x + 4, y - 1);
    cv.glow(x, y - 4, 22, o.rgb, 0.6);
    out.push([x, y - 4]);
  }
  return out;
}

/** A torch on a short post: its flame and a warm light round it. */
export function torch(cv, x, y, h = 10) {
  const wood = col('#4a3020'), woodL = col('#6a4830'), iron = col('#2a2624'), fl = [col('#fff4b0'), col('#ffc040'), col('#ff7a20'), col('#c03a10')];
  for (let j = 0; j < h; j++) { cv.setThing(x, y - j, wood); cv.setThing(x + 1, y - j, j % 3 ? woodL : wood); }
  for (let dx = -1; dx <= 2; dx++) cv.setThing(x + dx, y - h, iron);
  const flame = [[0, 1, 0], [-1, 1, 1], [0, 0, 0], [1, 0, 1], [0, 2, 1], [1, 1, 0], [-1, 2, 2], [2, 1, 2], [0, 3, 2], [1, 2, 1], [1, 3, 3], [0, 4, 3]];
  for (const [dx, dy, t] of flame) cv.set(x + dx, y - h - dy, fl[t]);
  cv.claim(x - 1, y - h - 4, x + 2, y);
  cv.glow(x + 0.5, y - h - 2, 34, [1, 0.6, 0.25], 0.6);
  (cv.meta.torches ||= []).push([x, y - h - 2]);
}

/**
 * A fall of lava (or water) from (x, y0) straight down to whatever it
 * lands on, splashing there: a bright core, darker edges, its own light.
 * Marked as liquid, and no plant stands under it.
 * @param {any} cv @param {number} x @param {number} y0 @param {{w?:number, cols:string[], rgb?:number[], seed:number}} o
 */
export function fall(cv, x, y0, o) {
  const W = cv.W, w = o.w ?? 3, cols = o.cols.map(col);
  let y = y0;
  while (y < cv.H - 1 && !cv.solid[y * W + x] && !cv.liquid[y * W + x]) y++;
  for (let yy = y0; yy < y; yy++) {
    const wob = Math.round((hash2(yy >> 2, 0, o.seed) - 0.5) * 1.2);
    for (let dx = -w; dx <= w; dx++) {
      const xx = x + dx + wob;
      if (xx < 0 || xx >= W) continue;
      const k = yy * W + xx, a = Math.abs(dx) / (w + 0.5);
      cv.paint(k, cols[Math.min(cols.length - 1, Math.floor(a * cols.length + (hash2(xx, yy >> 1, o.seed) > 0.8 ? 1 : 0)))]);
      cv.liquid[k] = 1; cv.open[k] = 0;
    }
  }
  // the splash where it lands
  for (let dx = -w - 3; dx <= w + 3; dx++) for (let j = 0; j < 3; j++) {
    const xx = x + dx, yy = y - j;
    if (xx < 0 || xx >= W || yy < 0 || hash2(xx, j, o.seed + 1) < 0.3 + j * 0.25) continue;
    cv.set(xx, yy, cols[Math.min(cols.length - 1, j)]);
  }
  cv.block(x - w - 6, y - 10, x + w + 7, y + 2);
  if (o.rgb) {
    cv.glow(x, y - 4, 28, o.rgb, 0.55);
    for (let yy = y0 + 10; yy < y - 10; yy += 18) cv.glow(x, yy, 18, o.rgb, 0.3);
  }
  (cv.meta.falls ||= []).push([x, y0, y, w]);
  return y;
}

/**
 * Ruins standing in the dark: columns of squared blocks, their tops broken,
 * some joined by an arch, as a faint flat material (moonfen's far layer).
 * @param {any} cv @param {{n:number, fill:string, line:string, rim?:string, seed:number, floor:number}} o
 */
export function ruins(cv, o) {
  const fill = col(o.fill), line = col(o.line), rim = col(o.rim || o.fill), W = cv.W;
  const cols = [];
  for (let i = 0; i < o.n; i++) {
    const cx = Math.round(((i + 0.2 + hash2(i, 1, o.seed) * 0.6) / o.n) * W), w = 10 + Math.floor(hash2(i, 2, o.seed) * 8), h = 50 + hash2(i, 3, o.seed) * 70;
    cols.push([cx, w, h]);
    const top = o.floor - h;
    for (let y = Math.max(0, Math.floor(top - 8)); y < o.floor + 10; y++) for (let x = cx - w / 2; x < cx + w / 2; x++) {
      if (x < 0 || x >= W) continue;
      // a broken top: the blocks stop at different heights
      const bt = top - Math.floor(hash2(Math.floor((x - cx + w) / 4), i, o.seed) * 3) * 4;
      if (y < bt) continue;
      const row = Math.floor((y - top) / 5), off = row % 2 ? 3 : 0, mortar = (y - top) % 5 === 4 || ((x - cx + off + 40) % 7) === 0;
      cv.set(Math.floor(x), y, y < bt + 1 ? rim : mortar ? line : far(fill, Math.floor(x), y, o.seed + i));
    }
  }
  // an arch between two neighbouring columns
  for (let i = 0; i + 1 < cols.length; i += 2) {
    const [ax, aw, ah] = cols[i], [bx, bw, bh] = cols[i + 1];
    if (bx - ax > 120 || hash2(i, 9, o.seed) < 0.3) continue;
    const cx = (ax + bx) / 2, r = (bx - ax) / 2, y0 = o.floor - Math.min(ah, bh) + 8, t = 6;
    for (let y = Math.floor(y0 - r - t); y <= y0; y++) for (let x = Math.floor(cx - r - t); x <= cx + r + t; x++) {
      const d = Math.hypot(x - cx, (y - y0) * 1.1);
      if (x < 0 || x >= W || y < 0 || d < r - aw / 2 || d > r - aw / 2 + t) continue;
      cv.set(x, y, (Math.floor(Math.atan2(y - y0, x - cx) * 9) % 2 === 0 && Math.abs(d - (r - aw / 2 + t / 2)) > 2) ? far(fill, x, y, o.seed) : line);
    }
  }
}

/**
 * The finish: a vignette darkening the corners and edges, then the lights
 * recorded by the composition (cv.glow) added over everything, so the
 * scenery stamped after a light was placed is lit by it as well.
 * @param {any} cv @param {number} k vignette strength
 */
export function finish(cv, k = 0.55) {
  const W = cv.W, H = cv.H;
  if (k > 0) cv.wash(0xff000000, (x, y) => {
    const u = (x - W / 2) / (W * 0.62), v = (y - H * 0.55) / (H * 0.75), t = Math.max(0, u * u + v * v - 0.3) * k;
    return t > 0.01 ? Math.min(0.8, t) : 0;
  });
  illuminate(cv, cv.pending);
  cv.pending = [];
}

/**
 * Spots on the tops of the ledges and pillars (open ground well above the
 * main ground), spread across the scene: where cattails, torches and the
 * like are set.
 * @param {any} cv @param {number} n @param {number} seed @param {number} [rise]
 * @returns {[number, number][]}
 */
export function ledgeTops(cv, n, seed, rise = 12) {
  const W = cv.W, /** @type {[number, number][]} */ all = [];
  for (let k = W; k < cv.open.length; k++) {
    const x = k % W, y = Math.floor(k / W);
    if (cv.open[k] && cv.solid[k] && !cv.solid[k - W] && cv.ground && y < cv.ground[x] - rise) all.push([x, y]);
  }
  /** @type {[number, number][]} */
  const out = [];
  for (let i = 0; i < n * 4 && out.length < n && all.length; i++) {
    const p = all[Math.floor(hash2(i, 0, seed) * all.length)];
    if (!out.some(([x, y]) => Math.abs(x - p[0]) < 14 && Math.abs(y - p[1]) < 10)) out.push(p);
  }
  return out;
}

/**
 * Veins seeping from a pool into the ground round it, continuing the pool
 * itself: the fluid filters into the rock rather than lying on it. The bed
 * soaks, its rock stained toward the pool's deep colour and its cracks
 * brimming with the fluid, fading out through the ground; and a few winding
 * seams leave the bed, wandering out and down, along which the fluid fills
 * the mortar and crevices between the stones (the stones themselves only
 * darkened and stained), thinning and sinking into the rock's colour toward
 * their tips. Lava veins glow and light the rock round them; water veins
 * shine a little and wet it.
 * @param {any} cv @param {{x0:number, x1:number, level:number}} p
 * @param {{from:string[], to:string, seed:number, n?:number, reach?:number, soak?:number, k?:number, w?:number, branch?:number, rgb?:number[], glow?:number}} o
 *   from: the vein's colours from the pool outward (start with the pool's own); to: the colour the
 *   soaked rock turns toward; soak: how far the bed soaks; k: how strongly; w: a seam's width at the pool
 */
export function veins(cv, p, o) {
  const W = cv.W, H = cv.H, S = cv.solid, L = cv.liquid, seed = o.seed, reach = o.reach ?? 60, soak = o.soak ?? 10, k = o.k ?? 0.7;
  const from = o.from.map(col), to = col(o.to), w0 = o.w ?? 3;
  const x0 = Math.max(0, p.x0 - reach), x1 = Math.min(W - 1, p.x1 + reach), y0 = Math.max(0, p.level - 4);
  const px = cv.pix.px;
  // distance from the pool through the ground (a two-pass chamfer in a box round it)
  const dist = new Float32Array(W * H).fill(1e3);
  for (let y = y0; y < H; y++) for (let x = x0; x <= x1; x++) if (L[y * W + x]) dist[y * W + x] = 0;
  for (let pass = 0; pass < 2; pass++) {
    const fwd = pass === 0, d1 = fwd ? -1 : 1;
    for (let yy = 0; yy < H - y0; yy++) {
      const y = fwd ? y0 + yy : H - 1 - yy;
      for (let xx = 0; xx <= x1 - x0; xx++) {
        const x = fwd ? x0 + xx : x1 - xx, i = y * W + x;
        if (!S[i]) continue;
        let d = dist[i];
        const sx = x + d1 >= x0 && x + d1 <= x1, sy = y + d1 >= y0 && y + d1 < H;
        if (sx) d = Math.min(d, dist[i + d1] + 1);
        if (sy) d = Math.min(d, dist[i + d1 * W] + 1);
        if (sx && sy) d = Math.min(d, dist[i + d1 * W + d1] + 1.41);
        if (sx && y - d1 >= y0 && y - d1 < H) d = Math.min(d, dist[i - d1 * W + d1] + 1.41);
        dist[i] = d;
      }
    }
  }
  // the seams: how wet each pixel is (1 on a seam's line at the pool, falling off
  // across it and along it) and t there (0 at the pool, 1 at the tip)
  const wet = new Float32Array(W * H), vt = new Float32Array(W * H).fill(1);
  const n = o.n ?? 6, walkers = [];
  for (let v = 0; v < n; v++) {
    const sx = Math.round(p.x0 + (v + 0.2 + hash2(v, 1, seed) * 0.6) / n * (p.x1 - p.x0));
    let sy = p.level;
    while (sy < H - 1 && !S[sy * W + sx]) sy++;
    const out = (sx - (p.x0 + p.x1) / 2) / Math.max(1, (p.x1 - p.x0) / 2);
    walkers.push([sx, sy - 1, Math.PI / 2 - out * 1.1 + (hash2(v, 2, seed) - 0.5) * 0.6, reach * (0.55 + hash2(v, 3, seed) * 0.45), 0, w0, v]);
  }
  for (let wi = 0; wi < walkers.length && wi < n * 3; wi++) {
    let [x, y, a, len, t0, wd, id] = walkers[wi];
    for (let t = 0; t < len; t++) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 1 || xi >= W - 1 || yi >= H - 1 || yi < 0) break;
      if (!S[yi * W + xi] && !L[yi * W + xi]) break;
      // a band a few stones wide round the line, the fluid soaking out through it
      const u = t0 + (1 - t0) * (t / len), r = 0.9 + wd * 1.1 * (1 - u) ** 1.5, R = Math.ceil(r);
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const q = (yi + j) * W + xi + i;
        if (q < 0 || q >= W * H || !S[q]) continue;
        const e = 1 - Math.sqrt(i * i + j * j) / (r + 0.5);
        if (e <= 0) continue;
        const v = e * (1 - u * 0.75);
        if (v > wet[q]) { wet[q] = v; vt[q] = u; }
      }
      a += (hash2(id, t, seed + 5) - 0.5) * 0.75 + (Math.PI / 2 - a) * 0.025;
      x += Math.cos(a); y += Math.max(-0.2, Math.sin(a));
      if (hash2(id, t, seed + 6) < (o.branch ?? 0.015) && t > 4 && walkers.length < n * 3) walkers.push([x, y, a + (hash2(id, t, seed + 7) < 0.5 ? -0.7 : 0.7), (len - t) * 0.6, u, wd * (1 - u) * 0.8, id * 31 + t]);
    }
  }
  // how deep a crack each pixel sits in: darker than the rock round it (the
  // mortar between the stones, their shaded undersides, pits) — where the fluid gathers
  const lum = (/** @type {number} */ c) => (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11;
  const crev = new Float32Array(W * H);
  for (let y = y0; y < H; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (!S[i] || (dist[i] >= soak && wet[i] <= 0)) continue;
    let sum = 0, m = 0;
    for (let j = -2; j <= 2; j++) for (let ii = -2; ii <= 2; ii++) {
      const xx = x + ii, yy = y + j;
      if (xx < 0 || xx >= W || yy < 0 || yy >= H || !S[yy * W + xx]) continue;
      sum += lum(px[yy * W + xx]); m++;
    }
    const avg = sum / m;
    crev[i] = Math.max(0, Math.min(1, (avg - lum(px[i])) / (avg * 0.18 + 4)));
  }
  const grad = (/** @type {number} */ u) => { const f = Math.min(from.length - 1.001, u * (from.length - 1)), i = Math.floor(f); return mixPacked(from[i], from[i + 1], f - i); };
  const light = new Float32Array(W * H);
  for (let y = y0; y < H; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (!S[i]) continue;
    // the bed soaks: its rock stained, its cracks brimming, fading out with distance
    const d = dist[i];
    let bed = 0;
    if (d < soak) bed = (1 - d / soak) ** 1.6 * (0.75 + fbm2(x * 0.15, y * 0.15, seed + 9, 2) * 0.5);
    // along a seam: every crack filled by the pool, thinning out farther along
    // into isolated pockets of fluid, so it reads as filtering through rather than drawn on
    const gap = Math.min(1, Math.max(0, (fbm2(x * 0.3, y * 0.3, seed + 11, 2) - vt[i] * 0.95 + 0.1) / 0.1));
    const s = wet[i] * gap * (0.7 + (1 - vt[i]) * 0.3);
    if (bed <= 0 && s <= 0) continue;
    const c = crev[i], u = Math.min(1, vt[i] + (1 - Math.min(1, s)) * 0.3);
    // the stone: darkened and stained toward the soaked colour
    const stain = Math.min(0.85, (bed * 0.7 + s * 0.45) * k);
    cv.paint(i, mixPacked(px[i], to, stain));
    // the cracks: filled with the fluid itself
    const fill = Math.min(0.95, bed * c * 1.7 + Math.max(0, s * (c * 1.7 + 0.08) - 0.12) + bed * bed * 0.2);
    if (fill > 0) cv.paint(i, mixPacked(px[i], s > bed ? grad(u) : from[Math.min(from.length - 1, 1)], fill));
    light[i] = Math.max(bed * 0.5, fill * (1 - u * 0.6));
  }
  if (o.rgb) {
    const g = o.glow ?? 0.4, rgb = o.rgb, R = 4;
    // each lit pixel spreads a little light round it
    const spread = new Float32Array(W * H);
    for (let y = y0; y < H; y++) for (let x = x0; x <= x1; x++) {
      const v = light[y * W + x];
      if (v < 0.05) continue;
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const xx = x + i, yy = y + j;
        if (xx >= 0 && xx < W && yy >= 0 && yy < H) spread[yy * W + xx] += v * 0.05 * Math.exp(-(i * i + j * j) / 5);
      }
    }
    cv.light(rgb, (x, y) => Math.min(0.6, spread[y * W + x] * g), y0, H);
  }
}

/** Veins of water seeping from a pool (its colours first): shining a little, wetting the rock. @param {number} seed @param {string[]} [from] */
export const WATER_VEINS = (seed, from = ['#6aaac8', '#4a8aa8', '#36708c', '#2a5a70']) => ({ from, to: '#14262e', seed, n: 6, reach: 54, soak: 11, k: 0.6, w: 1.8, branch: 0.025, rgb: [0.35, 0.65, 0.8], glow: 0.35 });

/** Veins of lava spreading from a pool (its colours first): glowing, lighting the rock round them. @param {number} seed */
export const LAVA_VEINS = (seed) => ({ from: ['#ffd060', '#ffb040', '#ff8a2a', '#e05a18', '#a8320e', '#5a1a0c'], to: '#8a2a10', seed, n: 4, reach: 60, soak: 5, k: 0.6, w: 1, branch: 0.012, rgb: [1, 0.45, 0.14], glow: 0.35 });
