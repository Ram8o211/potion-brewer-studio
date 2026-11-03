// The enclosures of the farm: one for every kind of animal, the Moon
// Rabbits' hutch among them (a wire-fenced run with a hutch on legs), each
// a 224 × 92 scene painted procedurally — pure functions of a seed,
// no picture files — in the farm's own look: dusky skies over layered
// tree lines, timber frames with braced posts, lanterns glowing warm,
// heaps of hay, rail fences, open thatched shelters, stone and brick laid in
// courses with moss and vines over their tops. Colour is laid in flat
// tones, a lit edge along the top or left of every piece and a shade along
// the other, with a little texture in broad patches, so each piece reads at
// a glance.
//
// Every pen is a wall or a view behind, things set against it on its back
// line (BACK), and the ground the animals walk on below — their feet on the
// rows GROUND_Y0.. (`ground`, as hutch-ground.js's runs) — with a fringe of
// it in front of their feet (`front`, transparent elsewhere). A kind
// always gets the same pixels (cached).

import { Canvas } from './paint.js';
import { col, silhouette, treeShape } from './side.js';
import { finish } from './cave.js';
import { grade } from './grade.js';
import { cobble } from './stone.js';
import { fbm1, fbm2, hash2, noise2 } from '../noise.js';
import { mixPacked } from '../color.js';
import { Rng, hashString } from '../../core/rng.js';

export const PEN_W = 224;
export const PEN_H = 92;
/** Where things stand against the back, and the rows a foot may rest on. */
export const BACK = 67;
export const GROUND_Y0 = 69;
const GROUND_Y1 = 86;

/** Version of the pens' painting (names caches only). */
export const PENS_VERSION = 8;

/**
 * @typedef {Object} Pen
 * @property {string} kind
 * @property {string} title
 * @property {import('../pixels.js').Pixels} back   everything behind the animals
 * @property {import('../pixels.js').Pixels} front  what is drawn over them (transparent elsewhere)
 * @property {number} y0          first row of `ground`
 * @property {number[][][]} ground  per row from y0, the [x0, x1) runs a foot may rest on
 * @property {{x:number, y:number}} rack  where an animal stands to eat (facing left)
 * @property {[number, number][]} slots   where the bodies lie
 * @property {[number, number, number, number]} cloth  the cloth they lie on (x, y, w, h)
 * @property {[number, number, number, number]} nest   where nest straw goes while a female is expecting (x0, y0, x1, y1)
 * @property {{type:string, [k:string]:any}[]} anim  what moves in it (drawn each frame by rendering/pen-anim.js)
 */

/** Ramps of the farm's materials, darkest first. */
const P = {
  wood: ['#241412', '#4a2818', '#784622', '#a36b32', '#d2964b', '#f2c780'].map(col),
  oak: ['#160c14', '#2e1c1a', '#4a3020', '#684828', '#8c6a3c', '#b4945c'].map(col),
  straw: ['#4a2a12', '#82561a', '#b8862a', '#e0ae3a', '#f6d260', '#fff2b0'].map(col),
  thatch: ['#3a2414', '#6e4c22', '#9c7432', '#c49e48', '#e2c46a', '#f8e4a0'].map(col),
  stone: ['#1a1a24', '#363844', '#525460', '#6e7078', '#92929a', '#bcbcc0'].map(col),
  brick: ['#1e0e10', '#42201a', '#6a3224', '#8a4630', '#ae6242', '#d08a60'].map(col),
  plaster: ['#3a2c3c', '#584658', '#766676', '#968696', '#b4a8b2', '#d2c8cc'].map(col),
  beige: ['#5a4434', '#8a7058', '#b49c80', '#cdb898', '#e0d0b2', '#f2e8d0'].map(col),
  lime: ['#6e6a66', '#948e84', '#b4ac9e', '#cec6b4', '#e4dccc', '#f8f4e8'].map(col),
  earth: ['#180c0c', '#301c14', '#4c3020', '#6a462a', '#8a6238', '#ae8450'].map(col),
  dirt: ['#2a1a1a', '#4a3226', '#6a4c34', '#8a6644', '#ac8656', '#cca870'].map(col),
  grass: ['#18331a', '#285325', '#3e792b', '#629d32', '#95c842', '#c2e267'].map(col),
  leaf: ['#122c1c', '#204b28', '#326d32', '#4c8b36', '#75ae44', '#a2cc5c'].map(col),
  moss: ['#1e3a1a', '#336022', '#4e862a', '#72aa34', '#9ccc44', '#ccec6c'].map(col),
  snow: ['#6a7a98', '#94a4c0', '#bccadc', '#dae2ee', '#eef2f8', '#ffffff'].map(col),
  water: ['#0c1c3a', '#16305c', '#22487e', '#36649e', '#6a9ccc', '#c8e6fa'].map(col),
  tile: ['#2a0c0e', '#521a16', '#7a2a20', '#9c3e2a', '#c05a3a', '#e08458'].map(col),
  // each kind of thing its own wood, so a cask, a crate, a trough and the fence behind them never share one brown
  // floors underfoot: a warm worn flagstone and a sandstone, apart from the cool grey of walls
  flag: ['#1c1614', '#3a302a', '#5a4c42', '#786656', '#988470', '#bca690'].map(col),
  sand: ['#2a1e16', '#5a4430', '#8a6c4a', '#b0905e', '#d0b07a', '#ecd6a4'].map(col),
  cask: ['#1e0c0c', '#4a1e16', '#74321e', '#9a4a26', '#c06a36', '#e09454'].map(col),
  pine: ['#2a1a10', '#5e3e1c', '#8e6632', '#b88e4c', '#dab26a', '#f4d894'].map(col),
  weathered: ['#16161c', '#36363c', '#5a5652', '#7e766c', '#a29888', '#c8bea8'].map(col),
  iron: ['#0c0c12', '#1e1e28', '#34343e', '#52525e'].map(col),
  red: ['#2e0a0e', '#5a1418', '#8e2622', '#c4402e'].map(col),
  ink: col('#100810'),
};

const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Paint every pixel of a rectangle with fn(x, y) (a colour, or 0 to leave it). */
function fill(cv, x0, y0, x1, y1, fn) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(cv.H, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(cv.W, Math.ceil(x1)); x++) {
    const c = fn(x, y);
    if (c) cv.set(x, y, c);
  }
}
const rect = (cv, x0, y0, x1, y1, c) => fill(cv, x0, y0, x1, y1, () => c);
/** A broad patch pattern, sampled on 2-pixel blocks so it steps chunkily. */
const patch = (x, y, seed, f = 0.09) => fbm2((x >> 1) * f * 2, (y >> 1) * f * 2.6, seed, 2);

// ------------------------------------------------------------------ skies and views

/** A smooth sky down to row y1, faintly dithered. @param {number[]} a @param {number[]} b */
function sky(cv, y1, a, b) {
  for (let y = 0; y < y1; y++) {
    const t = y / Math.max(1, y1 - 1);
    for (let x = 0; x < cv.W; x++) {
      const d = (((x & 1) ^ (y & 1)) - 0.5) * 0.012;
      const c = a.map((v, k) => clampI(v + (b[k] - v) * t + d, 0, 1));
      cv.set(x, y, ((255 << 24) | (Math.round(c[2] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[0] * 255)) >>> 0);
    }
  }
}
const rgb = (h) => { const c = col(h); return [(c & 255) / 255, ((c >>> 8) & 255) / 255, ((c >>> 16) & 255) / 255]; };

/** A line of trees against the sky: pines and round crowns, filled down to `bottom`. */
function treeline(cv, base, colour, seed, o = {}) {
  const r = new Rng(seed), c = col(colour), before = o.snow ? cv.pix.px.slice() : null;
  const h = o.h ?? [10, 18];
  for (let x = -4; x < cv.W + 4; x += r.int(4, 9)) {
    treeShape(cv, x, base + r.int(0, 2), r.int(h[0], h[1]), r.next() < (o.pines ?? 0.55) ? 'pine' : 'oak', colour, seed + x);
  }
  rect(cv, 0, base, cv.W, o.bottom ?? base + 6, c);
  if (before) {
    // snow lying along the tops of the trees' tiers
    const sn = col(o.snow), px = cv.pix.px, W = cv.W, tree = (k) => px[k] !== before[k];
    for (let k = px.length - 1; k >= W; k--) if (tree(k) && !tree(k - W) && hash2(k % W, (k / W) | 0, seed) > 0.25) { cv.paint(k, sn); if (tree(k + W)) cv.paint(k + W, mixPacked(sn, c, 0.4)); }
  }
}

/** Far hills, flat, a little lighter along their crest. */
function hills(cv, base, amp, fill_, rim, seed) {
  silhouette(cv, { base, amp, freq: 0.018, seed, fill: fill_, rim, bottom: base + amp + 20 });
}

/** Falling snow: flakes a pixel (or two) across. */
function flakes(cv, y1, seed, n) {
  const r = new Rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r.int(0, cv.W - 2), y = r.int(0, y1);
    cv.set(x, y, P.snow[5]);
    if (r.next() < 0.25) cv.set(x + 1, y, P.snow[4]);
  }
}

// ------------------------------------------------------------------ separation

/**
 * Draw a piece of the scene so it stands apart from what is behind it:
 * whatever `draw` paints is outlined — a dark contour on what lies round it,
 * deeper below and to the right where its shadow falls (the light comes
 * from the upper left), fainter above and to the left — so wood against
 * wood, hay against earth or stone against stone never run together.
 * @param {Canvas} cv @param {() => void} draw
 */
function layer(cv, draw, thing = false) {
  const px = cv.pix.px, W = cv.W, H = cv.H, before = px.slice(), was = MARK ? MARK.thing.slice() : null;
  draw();
  const m = new Uint8Array(W * H);
  for (let k = 0; k < m.length; k++) if (px[k] !== before[k]) m[k] = 1;
  if (MARK && was) for (let k = 0; k < m.length; k++) {
    if (!m[k]) continue;
    MARK.ground[k] = 0;
    // (a thing drawn inside a piece of structure — the hay in a shelter — stays a thing)
    MARK.thing[k] = thing || (MARK.thing[k] && !was[k]) ? 1 : 0;
  }
  // a thing is inked all round, firmly (it must read against anything); structure only shaded
  const shade = col('#0c0610'), deep = thing ? 0.82 : 0.5, soft = thing ? 0.6 : 0.28;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (m[k]) continue;
    // its shadow, cast down and to the right
    if ((x > 0 && m[k - 1]) || (y > 0 && m[k - W]) || (x > 0 && y > 0 && m[k - W - 1])) cv.paint(k, mixPacked(px[k], shade, deep));
    else if ((x < W - 1 && m[k + 1]) || (y < H - 1 && m[k + W])) cv.paint(k, mixPacked(px[k], shade, soft));
    else continue;
    if (MARK && thing) MARK.thing[k] = 1;
  }
}

/**
 * While a pen is painted: which pixels are things standing in it (furniture,
 * hay, casks, bowls…) and which its ground — everything else is its
 * structure and backdrop (walls, fences, beams, trees, sky), which `recede`
 * then sets back so the things stand out.
 * @type {{thing:Uint8Array, ground:Uint8Array} | null}
 */
let MARK = null;

/** A drawing function made into one that draws a piece of structure standing apart (layer). @template {Function} F @param {F} fn @returns {F} */
const prop = (fn) => /** @type {any} */ ((cv, ...a) => { let out; layer(cv, () => { out = fn(cv, ...a); }); return out; });
/** …and into one that draws a thing standing in the pen: inked all round, kept vivid. @template {Function} F @param {F} fn @returns {F} */
const thing = (fn) => /** @type {any} */ ((cv, ...a) => { let out; layer(cv, () => { out = fn(cv, ...a); }, true); return out; });

/** Luma of a packed colour. @param {number} c */
const luma = (c) => 0.3 * (c & 255) + 0.59 * ((c >>> 8) & 255) + 0.11 * ((c >>> 16) & 255);
/** A packed colour's saturation scaled by k round its own grey. @param {number} c @param {number} k */
function saturate(c, k) {
  const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255, l = luma(c);
  const f = (v) => clampI(Math.round(l + (v - l) * k), 0, 255);
  return ((c & 0xff000000) | (f(b) << 16) | (f(g) << 8) | f(r)) >>> 0;
}

/**
 * Set the backdrop back and bring the things forward: the walls, fences,
 * beams, trees and sky lose a little colour and contrast and take on the
 * scene's own ambient tone, as distance and shade do; the things keep
 * their colour, a touch richer. So a crate against planks, a cask against
 * a fence or hay against a wall reads at a glance.
 * @param {Canvas} cv
 */
function recede(cv) {
  if (!MARK) return;
  const px = cv.pix.px, N = px.length;
  let r = 0, g = 0, b = 0, n = 0, L = 0;
  for (let k = 0; k < N; k++) if (!MARK.thing[k] && !MARK.ground[k]) { const c = px[k]; r += c & 255; g += (c >>> 8) & 255; b += (c >>> 16) & 255; L += luma(c); n++; }
  if (!n) return;
  const amb = (255 << 24 | Math.round(b / n) << 16 | Math.round(g / n) << 8 | Math.round(r / n)) >>> 0, mean = L / n;
  for (let k = 0; k < N; k++) {
    const c = px[k];
    if (MARK.thing[k]) { px[k] = saturate(c, 1.12); continue; }
    if (MARK.ground[k]) continue;
    // less colour, flatter tones round the backdrop's mean, a veil of its ambient
    let q = saturate(c, 0.92);
    const l = luma(q), t = (mean - l) * 0.06;
    q = mixPacked(q, t > 0 ? 0xffffffff : 0xff000000, Math.min(0.3, Math.abs(t) / 255));
    px[k] = mixPacked(q, amb, 0.05);
  }
}

/**
 * As in the wilds (legible.js): what stands in the pen gets a dark line on
 * the backdrop round it, deeper under and to the left of it, so a crate, a
 * trough or a hutch reads apart from the wall or the grass behind it.
 * @param {any} cv
 */
function inkThings(cv) {
  if (!MARK) return;
  const W = cv.W, H = cv.H, px = cv.pix.px, T = MARK.thing, src = px.slice(), INK = 0xff100810;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (T[k]) continue;
    const l = x > 0 && T[k - 1], r = x < W - 1 && T[k + 1], u = y > 0 && T[k - W], d = y < H - 1 && T[k + W];
    if (l || u) px[k] = mixPacked(src[k], INK, 0.5);
    else if (r || d) px[k] = mixPacked(src[k], INK, 0.3);
  }
}

/** A 4×4 ordered dither threshold (0..1) at a pixel, for stepping between two tones without banding. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

// ------------------------------------------------------------------ timber

/**
 * A piece of wood: its body, a lit edge (top, or left when upright), a
 * shaded edge, and grain running along it.
 * @param {number[]} R ramp @param {{vertical?:boolean, seed?:number}} [o]
 */
function wood(cv, x0, y0, x1, y1, R, o = {}) {
  const v = !!o.vertical, seed = o.seed ?? 7, th = Math.round(v ? x1 - x0 : y1 - y0);
  // each piece its own shade of the wood, a little lighter or darker than the next
  const tone = Math.floor(hash2(Math.round(x0), Math.round(y0), seed + 77) * 3) - 1;
  fill(cv, x0, y0, x1, y1, (x, y) => {
    const along = v ? y : x, across = Math.floor(v ? x - x0 : y - y0);
    if (across === 0) return R[5];
    if (across === th - 1) return R[0];
    let i = 2 + (tone > 0 && th > 2 ? 1 : 0);
    if (across === 1 && th > 3) i = 4;
    else {
      // grain: dark streaks and pale ones running along it
      const g = noise2(along * 0.2, (across + seed) * 1.9, seed);
      if (g > 0.68) i = 1; else if (g < 0.2) i = Math.min(4, i + 1);
      if (tone < 0 && i > 1) i--;
    }
    // a knot now and then: a dark eye, ringed lighter along the grain
    const kc = Math.floor(along / 11), kn = hash2(kc, Math.floor(across / 4), seed + 3), ka = kc * 11 + 5, kr = Math.floor(th / 2);
    if (kn > 0.86 && th > 3 && across > 0 && across < th - 1) {
      const dA = Math.abs(along - ka), dC = Math.abs(across - kr);
      if (dA === 0 && dC === 0) return R[0];
      if (dA <= 2 && dC <= 1 && dA + dC <= 2) return dC === 0 && dA === 2 ? R[1] : R[Math.min(5, i + 1)];
    }
    // nail heads near each end of a piece across the grain: a dark dot with a lit pixel on it
    const len = Math.round(v ? y1 - y0 : x1 - x0), at = Math.round(along - (v ? y0 : x0));
    if (th >= 4 && (at === 2 || at === len - 3) && (across === 1 || across === th - 2)) return across === 1 ? R[5] : R[0];
    return R[i];
  });
}

/** A diagonal brace of width w from (ax, ay) to (bx, by), lit along its upper side. */
function brace(cv, ax, ay, bx, by, w, R) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  fill(cv, Math.min(ax, bx) - w, Math.min(ay, by) - w, Math.max(ax, bx) + w + 1, Math.max(ay, by) + w + 1, (x, y) => {
    const px = x + 0.5 - ax, py = y + 0.5 - ay, t = (px * dx + py * dy) / (L * L);
    if (t < 0 || t > 1) return 0;
    const d = px * nx + py * ny;
    if (Math.abs(d) > w / 2) return 0;
    const up = ny < 0 ? -d : d;
    return R[up > w / 2 - 1 ? 4 : up < -w / 2 + 1 ? 0 : noise2(t * L * 0.2, d, 3) > 0.65 ? 1 : 2];
  });
}

/** A timber frame across the top: a beam, posts down to the back line, knee braces. */
function frame_(cv, beamY, posts, R, o = {}) {
  wood(cv, 0, beamY, cv.W, beamY + 5, R, { seed: 11 });
  for (const x of posts) {
    wood(cv, x - 2, beamY + 5, x + 3, o.foot ?? BACK, R, { vertical: true, seed: x });
    for (const s of [-1, 1]) {
      const bx = x + s * 12;
      if (bx < -2 || bx > cv.W + 2) continue;
      brace(cv, x + s * 2, beamY + 15, bx, beamY + 4, 3, R);
    }
  }
}

/** A lantern hanging on a chain from row y0, its glass at (x, y), its light on everything round it. */
function lantern_(cv, x, y0, y) {
  for (let j = y0; j < y - 3; j++) cv.set(x, j, (j & 1) ? P.iron[2] : P.iron[1]);
  rect(cv, x - 2, y - 3, x + 3, y - 1, P.iron[1]);
  cv.set(x - 1, y - 3, P.iron[3]);
  rect(cv, x - 3, y - 1, x + 4, y, P.iron[2]);
  for (let j = 0; j < 6; j++) for (let i = -2; i <= 2; i++) {
    const edge = Math.abs(i) === 2;
    cv.set(x + i, y + j, edge ? P.iron[1] : j > 0 && j < 5 ? col(i === 0 && j > 1 && j < 4 ? '#fff4c0' : '#ffbe48') : col('#e08a2a'));
  }
  rect(cv, x - 3, y + 6, x + 4, y + 7, P.iron[2]);
  cv.glow(x, y + 3, 40, [1, 0.72, 0.36], 0.42);
}

/** A rail fence along the back: posts with caps lit, `rails` rails between them. */
function railFence_(cv, x0, x1, base, h, R, o = {}) {
  const gap = o.gap ?? 26, rails = o.rails ?? 2;
  for (let r = 0; r < rails; r++) {
    const y = base - h + 4 + Math.round((r * (h - 9)) / Math.max(1, rails - 1));
    wood(cv, x0, y, x1, y + 3, R, { seed: r + 3 });
  }
  for (let x = x0; x <= x1; x += gap) {
    const px = Math.min(x, x1 - 4);
    wood(cv, px, base - h, px + 4, base, R, { vertical: true, seed: px });
    rect(cv, px, base - h, px + 4, base - h + 1, R[5]);
  }
}

/** A tall fence of boards side by side, on posts and two rails. */
function boardFence_(cv, x0, x1, top, base, R, seed) {
  for (let x = x0; x < x1; x += 6) {
    const t = top + (hash2(x, 1, seed) > 0.6 ? 1 : 0);
    wood(cv, x, t, x + 6, base, R, { vertical: true, seed: x + seed });
    rect(cv, x, t, x + 6, t + 1, R[3]);
  }
  for (const y of [top + 6, base - 10]) wood(cv, x0, y, x1, y + 3, R.map((c) => mixPacked(c, 0xff000000, 0.08)), { seed: y });
  for (let x = x0 + 14; x < x1; x += 40) { wood(cv, x, top - 2, x + 5, base, R, { vertical: true, seed: x * 3 }); rect(cv, x, top - 2, x + 5, top - 1, R[5]); }
}

/** A board wainscot: upright boards of uneven height along the wall's foot. */
function wainscot(cv, x0, x1, top, base, R, seed) {
  // it is the wall: a shade deeper than the furniture standing against it
  const D = R.map((c) => mixPacked(c, col('#140a14'), 0.3));
  for (let x = x0; x < x1; x += 5) {
    const t = top + Math.floor(hash2(x, 2, seed) * 3);
    wood(cv, x, t, x + 5, base, D, { vertical: true, seed: x + seed });
  }
}

/** A post wound with rope. */
function ropePost_(cv, x, top, base) {
  wood(cv, x - 2, top, x + 3, base, P.wood, { vertical: true, seed: x });
  for (let y = top + 2; y < base - 1; y += 3) for (let i = -2; i < 3; i++) { cv.set(x + i, y, P.straw[i < 0 ? 4 : 3]); cv.set(x + i, y + 1, P.straw[2]); }
}

/** A table: a top of planks on legs. */
function table_(cv, x0, x1, top, base, R) {
  for (const lx of [x0 + 2, x1 - 6]) wood(cv, lx, top + 3, lx + 4, base, R, { vertical: true, seed: lx });
  wood(cv, x0, top, x1, top + 4, R, { seed: 21 });
  rect(cv, x0, top + 4, x1, top + 5, R[0]);
}

/** A shelf on two brackets. */
function shelf_(cv, x0, x1, y, R) {
  wood(cv, x0, y, x1, y + 3, R, { seed: x0 });
  for (const bx of [x0 + 4, x1 - 8]) wood(cv, bx, y + 3, bx + 3, y + 9, R, { vertical: true, seed: bx });
}

/** A bundle of red cloth, a loaf, a pot: small things on a shelf or a table. @param {'cloth'|'bread'|'pot'} what */
function item_(cv, x, y, what) {
  if (what === 'cloth') { rect(cv, x, y - 3, x + 10, y, P.red[2]); rect(cv, x, y - 3, x + 10, y - 2, P.red[3]); rect(cv, x, y - 1, x + 10, y, P.red[1]); }
  else if (what === 'bread') { for (let i = 0; i < 6; i++) { cv.set(x + i, y - 1, P.straw[3]); if (i > 0 && i < 5) cv.set(x + i, y - 2, P.straw[4]); } }
  else { rect(cv, x, y - 5, x + 6, y, P.iron[2]); rect(cv, x + 1, y - 5, x + 5, y - 4, P.iron[3]); rect(cv, x - 1, y - 5, x + 7, y - 4, P.iron[1]); }
}

/** An upright barrel: staves rounded by the light, two iron hoops. */
function barrel_(cv, cx, base, w, h) {
  fill(cv, cx - w / 2, base - h, cx + w / 2, base, (x, y) => {
    const u = (x + 0.5 - cx) / (w / 2), j = base - y;
    let i = u < -0.5 ? 3 : u < 0.1 ? 4 : u < 0.6 ? 2 : 1;
    if ((x - Math.round(cx - w / 2)) % 3 === 0) i = Math.max(0, i - 1);
    if (j === Math.round(h * 0.25) || j === Math.round(h * 0.75)) return P.iron[u < 0 ? 3 : 1];
    if (y === base - h) i = 5;
    // the stave's own grain: a dark streak now and then
    if (i > 1 && hash2(x, y >> 1, 41) > 0.86) i--;
    return P.cask[i];
  });
}

/** A crate: a frame of boards with a cross brace. */
function crate_(cv, x0, base, s, R = P.pine) {
  const y0 = base - s;
  fill(cv, x0, y0, x0 + s, base, (x, y) => {
    const e = Math.min(x - x0, x0 + s - 1 - x, y - y0, base - 1 - y);
    if (e < 2) return R[e === 0 ? (y === y0 || x === x0 ? 5 : 1) : 3];
    const d = Math.abs((x - x0) - (y - y0));
    if (d < 2) return R[d === 0 ? 4 : 2];
    // the boards behind the brace, each its own tone, a nail at their ends
    if ((x === x0 + 2 || x === x0 + s - 3) && (y - y0) % 4 === 2) return P.iron[1];
    const b = Math.floor((y - y0) / 4), at = (y - y0) % 4;
    return R[at === 0 ? 1 : at === 1 ? 3 : 2 + (hash2(b, x0, 5) > 0.6 ? 1 : 0) - (hash2(x, y, 9) > 0.9 ? 1 : 0)];
  });
}

/** A heap of hay: a lumpy mound of strands, lit on top, a few loose wisps round it. */
function hay_(cv, cx, base, w, h, seed) {
  const hw = w / 2;
  for (let x = Math.floor(cx - hw - 3); x <= cx + hw + 3; x++) {
    const u = (x + 0.5 - cx) / hw;
    if (Math.abs(u) <= 1) {
      const top = Math.round(base - h * Math.sqrt(1 - u * u) * (0.82 + 0.3 * fbm1(x * 0.3, seed, 2)));
      for (let y = top; y < base; y++) {
        const s = noise2(x * 0.7 + y * 0.6, y * 0.5, seed);
        let i = s > 0.62 ? 4 : s > 0.42 ? 3 : 2;
        if (y === top) i = 5; else if (y === top + 1) i = 4;
        if (base - y < 2) i -= 1;
        if (hash2(x, y, seed) > 0.94) i = 1;
        cv.set(x, y, P.straw[clampI(i, 0, 5)]);
      }
    }
    if (hash2(x, 3, seed) > 0.55) cv.set(x, base - (hash2(x, 4, seed) > 0.7 ? 1 : 0), P.straw[hash2(x, 5, seed) > 0.5 ? 4 : 2]);
  }
}

/** A thatch: straw laid in rows down a slope from (x0, y0) to (x1, y1), `t` thick, lit along its top. */
function thatch(cv, x0, y0, x1, y1, t, seed) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    const u = (x - x0) / (x1 - x0 || 1), top = Math.round(y0 + (y1 - y0) * u);
    // a ragged lower edge where the bundles end
    const th = t + Math.floor(hash2(x >> 1, 1, seed) * 3);
    for (let j = -1; j < th; j++) {
      if (j === -1 && hash2(x >> 1, 2, seed) < 0.5) continue;
      // the straw runs down the slope in strands
      const s = noise2(x * 0.9 + j * 0.35, j * 0.25, seed);
      let i = j <= 0 ? 5 : j === 1 ? 4 : s > 0.62 ? 4 : s > 0.36 ? 3 : 2;
      if (j === th - 1) i = 1; else if (j === th - 2) i = Math.min(i, 2);
      if (hash2(x, j, seed) > 0.95) i = 1;
      cv.set(x, top + j, P.thatch[clampI(i, 0, 5)]);
    }
  }
}

/** An open-fronted shelter: a thatched roof sloping one way, posts, a dark plank back, hay inside. */
function shelter_(cv, x0, x1, base, h, seed, o = {}) {
  const top = base - h;
  // the inside: a dark plank back wall and its shade
  fill(cv, x0 + 3, top + 4, x1 - 3, base, (x, y) => {
    const board = Math.floor((x - x0) / 7), bx = (x - x0) % 7;
    const c = bx === 0 ? P.oak[0] : P.oak[1 + (hash2(board, 1, seed) > 0.6 ? 1 : 0)];
    return mixPacked(c, 0xff000000, Math.max(0, 0.45 - (y - top) * 0.012));
  });
  wood(cv, x0 + 3, base - 14, x1 - 3, base - 11, P.oak, { seed: 5 });
  hay(cv, (x0 + x1) / 2 + 3, base, (x1 - x0) * 0.5, 9, seed + 1);
  // posts at the corners, a brace in the open front
  wood(cv, x0, top + 2, x0 + 4, base, P.wood, { vertical: true, seed: x0 });
  wood(cv, x1 - 4, top + 6, x1, base, P.wood, { vertical: true, seed: x1 });
  brace(cv, x0 + 3, top + 14, x0 + 13, top + 5, 3, P.wood);
  // the roof, overhanging, sloping down to the right
  thatch(cv, x0 - 6, top - 5, x1 + 6, top + 5, o.roof ?? 8, seed + 2);
}

/** A water trough: a box of planks, the water's surface catching the sky. */
function trough_(cv, x0, x1, base, h) {
  wood(cv, x0, base - h, x1, base, P.weathered, { seed: 9 });
  for (const bx of [x0 + 4, x1 - 6]) rect(cv, bx, base - h + 2, bx + 2, base - 1, P.iron[2]);
  rect(cv, x0 + 2, base - h, x1 - 2, base - h + 2, P.water[3]);
  rect(cv, x0 + 3, base - h, x1 - 6, base - h + 1, P.water[5]);
  for (const x of [x0, x1 - 3]) wood(cv, x, base - h - 2, x + 3, base, P.weathered, { vertical: true, seed: x });
}

/** A dog house: plank walls, a pitched roof (snowed on, or tiled), an arched dark door. */
function doghouse_(cv, cx, base, w, h, o = {}) {
  const x0 = cx - w / 2, x1 = cx + w / 2, top = base - h;
  fill(cv, x0, top, x1, base, (x, y) => P.dirt[(y - top) % 4 === 0 ? 3 : (x - x0) > w * 0.7 ? 4 : 5]);
  // the door
  fill(cv, cx - 4, base - 10, cx + 5, base, (x, y) => {
    const u = (x - cx) / 4.5, v = (y + 0.5 - (base - 6)) / 4.5;
    return y < base - 6 && u * u + v * v > 1 ? 0 : P.ink;
  });
  // the roof
  const half = w / 2 + 4;
  for (let i = 0; i <= half; i++) for (let j = 0; j < 4; j++) {
    for (const s of [-1, 1]) cv.set(Math.round(cx + s * i), Math.round(top - (half - i) * 0.7 + j), o.snow ? P.snow[j === 0 ? 5 : j === 1 ? 4 : 2] : P.tile[j === 0 ? 5 : j > 2 ? 2 : 3]);
  }
}

// ------------------------------------------------------------------ masonry and earth

/**
 * A plastered (or whitewashed) wall with the wear of years: two tones
 * stepped by an ordered dither in soft patches, fine grit, hairline cracks
 * branching from its corners, damp stains running down from the top, and
 * patches where it has flaked off to the laths or the bricks under it.
 * Returns nothing; paints rows y0..y1.
 * @param {number[]} R a 6-step ramp, light at the top end
 */
function plaster(cv, x0, y0, x1, y1, R, seed, o = {}) {
  fill(cv, x0, y0, x1, y1, (x, y) => {
    const m = fbm2(x * 0.03, y * 0.06, seed, 3) * 2 + bayer(x, y) * 0.6 - 0.2;
    let i = 3 + clampI(Math.floor(m), 0, 1);
    const g = hash2(x, y, seed + 5);
    if (g > 0.97) i++; else if (g < 0.035) i--;
    // damp: streaks running down from the top, fading
    const st = noise2(x * 0.35, 0, seed + 7);
    if (st > 0.72 && y - y0 < (st - 0.72) * 140 && bayer(x, y) < 0.7) i--;
    return R[clampI(i, 0, 5)];
  });
  const r = new Rng(seed + 3);
  // hairline cracks: wandering dark lines, each with a lit edge
  for (let k = 0; k < (x1 - x0) / 30; k++) {
    let x = r.int(x0, x1 - 1), y = r.int(y0, y1 - 1);
    for (let j = r.int(6, 16); j > 0; j--) {
      cv.set(x, y, R[1]); cv.set(x + 1, y, R[5]);
      y += 1; x += r.next() < 0.4 ? (r.next() < 0.5 ? -1 : 1) : 0;
      if (y >= y1) break;
    }
  }
  // flaked patches showing what is under the plaster, ringed by its broken edge
  for (let k = 0; k < (o.flakes ?? 3); k++) {
    const cx = r.int(x0 + 10, x1 - 10), cy = r.int(y0 + 6, y1 - 6), rx = r.int(4, 9), ry = r.int(3, 5);
    fill(cv, cx - rx - 1, cy - ry - 1, cx + rx + 2, cy + ry + 2, (x, y) => {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, e = u * u + v * v + (hash2(x, y, seed + 9) - 0.5) * 0.5;
      if (e > 1.35) return 0;
      if (e > 1) return R[u + v < 0 ? 1 : 5];
      if (o.under === 'brick') {
        const row = Math.floor(y / 4), bx = (x + (row & 1) * 4) % 8;
        return y % 4 === 3 || bx === 0 ? P.brick[0] : P.brick[hash2(Math.floor((x + (row & 1) * 4) / 8), row, seed) > 0.5 ? 3 : 2];
      }
      // laths: thin strips of wood with dark gaps
      return y % 3 === 2 ? P.oak[0] : P.oak[y % 3 === 0 ? 3 : 2];
    });
  }
}

/** Stone laid in courses: big rounded stones in a dark mortar, each lit on top. */
function stonewall(cv, x0, y0, x1, y1, R, seed, s = 9) {
  const t = { stones: [R[2], R[3], R[2], R[4], R[3]], mortar: mixPacked(R[0], 0xff000000, 0.5), s: s + 1, seed, flat: 1.6, round: true };
  fill(cv, x0, y0, x1, y1, (x, y) => cobble(x, y, t));
}

/** Bricks in courses: each its own tone, lit along its top, a mortar line under each course. */
function bricks(cv, x0, y0, x1, y1, R, seed, o = {}) {
  const bh = o.h ?? 4, bw = o.w ?? 9, mortar = o.mortar ?? R[0];
  fill(cv, x0, y0, x1, y1, (x, y) => {
    const row = Math.floor((y - y0) / bh), at = (y - y0) % bh, sx = x + (row & 1) * Math.floor(bw / 2), b = Math.floor(sx / bw), bx = sx % bw;
    if (at === bh - 1 || bx === 0) return mortar;
    const t = hash2(b, row, seed);
    let i = t < 0.25 ? 1 : t > 0.8 ? 3 : 2;
    if (at === 0 && bx < bw - 1) i++;
    // the brick's own grain: a few flecks lighter and darker, its face a little darker toward its lower right
    const g = hash2(x, y, seed + 4);
    if (g > 0.93) i++; else if (g < 0.06) i--;
    if (at === bh - 2 && bx > bw * 0.6 && bayer(x, y) < 0.5) i--;
    // a chipped corner
    if ((bx === 1 || bx === bw - 1) && (at === 0 || at === bh - 2) && hash2(b, row, seed + 7) > 0.8) return mortar;
    // soot and damp: a few bricks much darker, a few paler
    const odd = hash2(b, row, seed + 11);
    if (odd > 0.94) i -= 2; else if (odd < 0.04) i += 1;
    return R[clampI(i, 0, 5)];
  });
}

/** A wall's top grown over: a mat of moss with tufts, and strands of vine hanging down its face. */
function overgrowth(cv, x0, x1, y, R, seed, o = {}) {
  const len = o.len ?? [3, 14], rate = o.rate ?? 0.18;
  for (let x = x0; x < x1; x++) {
    const d = 2 + Math.floor(patch(x, 0, seed, 0.2) * 4);
    for (let j = -1; j < d; j++) {
      if (j === -1 && hash2(x >> 1, 9, seed) < 0.6) continue;
      cv.set(x, y + j, R[j <= 0 ? 5 : j === 1 ? 4 : j > 3 ? 2 : 3]);
    }
    // a strand of vine, leaves on alternate sides, darker down to its tip
    if (hash2(x, 3, seed) < rate * fbm1(x * 0.08, seed, 2) * 2) {
      const L = len[0] + Math.floor(hash2(x, 4, seed) * (len[1] - len[0]));
      for (let j = d; j < d + L; j++) {
        cv.set(x, y + j, R[clampI(4 - Math.floor(((j - d) / L) * 3), 1, 5)]);
        if ((j - d) % 3 === 1) cv.set(x + ((Math.floor((j - d) / 3) & 1) ? 1 : -1), y + j, R[3]);
      }
      if (o.flower && hash2(x, 6, seed) > 0.7) { cv.set(x, y + d + L, col(o.flower)); cv.set(x + 1, y + d + L, col(o.flower)); }
    }
  }
}

/** Snow lying on a top: a lumpy white cap, icicles below it. */
function snowcap(cv, x0, x1, y, seed) {
  for (let x = x0; x < x1; x++) {
    const up = Math.round(patch(x, 0, seed, 0.25) * 3), d = 4;
    for (let j = -up; j < d; j++) cv.set(x, y + j, P.snow[j === -up ? 5 : j < d - 1 ? 4 : 2]);
    if (hash2(x, 1, seed) > 0.72) {
      const L = 2 + Math.floor(hash2(x, 2, seed) * 6);
      for (let j = 0; j < L; j++) cv.set(x, y + d + j, P.snow[j < L - 2 ? 3 : 1]);
      if (L > 4) cv.set(x + 1, y + d, P.snow[3]);
    }
  }
}

/** A bank of earth: the ground's own material in broad patches, stones in it, darker deeper in. */
function earthbank(cv, x0, y0, x1, y1, R, seed) {
  fill(cv, x0, y0, x1, y1, (x, y) => {
    // strata: wavy bands of darker and lighter earth, stepped by an ordered dither
    const band = (y - y0 + noise2(x * 0.04, 0, seed) * 8) / 7, f = band - Math.floor(band);
    let i = 2 + (Math.floor(band) % 3 === 1 ? 1 : 0) + (f < 0.18 && bayer(x, y) < 0.6 ? -1 : 0);
    const m = fbm2(x * 0.05, y * 0.08, seed + 3, 2) + bayer(x, y) * 0.3;
    if (m > 0.85) i++; else if (m < 0.3) i--;
    const g = hash2(x, y, seed + 4);
    if (g > 0.975) i++; else if (g < 0.03) i--;
    if (y - y0 < 3) i++;
    return R[clampI(i - Math.floor((y - y0) / 26), 0, 5)];
  });
  const r = new Rng(seed + 5);
  // clods and grit bedded in it, lit above and shadowed under
  for (let k = 0; k < ((x1 - x0) * (y1 - y0)) / 70; k++) {
    const x = r.int(x0, x1 - 3), y = r.int(y0 + 3, y1 - 2), w = r.int(1, 3);
    for (let i = 0; i < w; i++) { cv.set(x + i, y, R[4]); cv.set(x + i, y + 1, R[0]); }
  }
  pebbles(cv, x0, x1 - 4, y0 + 4, y1 - 2, seed + 6, Math.round((x1 - x0) / 9));
}

/** A burrow into a bank: a dark rounded mouth, its rim worn, hay in its floor. */
function burrow(cv, cx, base, w, h, seed) {
  const r = w / 2, cy = base - h + r;
  fill(cv, cx - r - 2, base - h - 2, cx + r + 2, base, (x, y) => {
    const u = (x + 0.5 - cx) / r, v = (y + 0.5 - cy) / r;
    const inside = y >= cy ? Math.abs(u) <= 1 : u * u + v * v <= 1;
    if (inside) return mixPacked(col('#1a100a'), col('#06040a'), clampI((y - (base - h)) / h, 0, 1) * 0.8);
    const uo = (x + 0.5 - cx) / (r + 2), vo = (y + 0.5 - cy) / (r + 2);
    const rim = y >= cy ? Math.abs(uo) <= 1 : uo * uo + vo * vo <= 1;
    return rim ? P.earth[y < cy ? 1 : 0] : 0;
  });
  hay(cv, cx, base, w * 0.75, 4, seed);
}

/** A pond in a basin of stone blocks, its water still. */
function pond_(cv, x0, x1, top, base, seed) {
  fill(cv, x0, top, x1, base, (x, y) => {
    const d = y - top;
    let i = d === 0 ? 4 : d < 3 ? 3 : d < 6 ? 2 : 1;
    if (noise2(x * 0.25, y * 1.4, seed) > 0.72) i = 5;
    return P.water[i];
  });
  for (const bx of [x0 - 10, x1 - 2]) rocks(cv, bx, top - 6, bx + 12, base, P.sand, seed + bx, { h: 5 });
}

/** A hand pump on a post, spout and handle, a bucket under it. */
function pump_(cv, x, base) {
  wood(cv, x, base - 22, x + 4, base, P.wood, { vertical: true, seed: x });
  rect(cv, x - 1, base - 23, x + 5, base - 21, P.iron[2]);
  rect(cv, x - 8, base - 21, x, base - 19, P.iron[2]);
  rect(cv, x - 8, base - 19, x - 6, base - 16, P.iron[1]);
  rect(cv, x + 4, base - 24, x + 10, base - 23, P.iron[3]);
  wood(cv, x - 11, base - 7, x - 3, base, P.oak, { vertical: true, seed: 3 });
  rect(cv, x - 11, base - 5, x - 3, base - 4, P.iron[2]);
  rect(cv, x - 10, base - 7, x - 4, base - 6, P.water[4]);
}

/** Flowers on short stems. */
function flowers(cv, x0, x1, base, colours, seed, n) {
  const r = new Rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r.int(x0, x1), h = r.int(2, 5), c = col(r.pick(colours));
    for (let j = 1; j <= h; j++) cv.set(x, base - j, P.grass[3]);
    cv.set(x, base - h - 1, c); cv.set(x - 1, base - h, c); cv.set(x + 1, base - h, c); cv.set(x, base - h, col('#ffe680'));
  }
}

/** Grass tufts standing up from a line. */
function tufts(cv, x0, x1, base, seed, rate = 0.5, R = P.grass) {
  for (let x = x0; x < x1; x++) {
    if (hash2(x, 7, seed) > rate) continue;
    const h = 1 + Math.floor(hash2(x, 8, seed) * 4);
    for (let j = 1; j <= h; j++) cv.set(x, base - j, R[clampI(2 + j, 0, 5)]);
  }
}

/** A bank of foliage: clumps of leaves layered back to front, each lit on its upper left. */
function foliage(cv, y0, y1, seed) {
  const r = new Rng(seed);
  for (let layer = 0; layer < 3; layer++) {
    const dark = 2 - layer;
    for (let x = -8; x < cv.W + 8; x += r.int(10, 16)) {
      const rx = r.int(9, 15), ry = r.int(7, 11), cy = y0 + 6 + layer * 9 + r.int(-2, 3);
      fill(cv, x - rx, cy - ry, x + rx, y1, (px, py) => {
        const u = (px + 0.5 - x) / rx, v = (py + 0.5 - cy) / ry;
        if (py < cy && u * u + v * v + (hash2(px >> 1, py >> 1, seed + layer) - 0.5) * 0.35 > 1) return 0;
        if (Math.abs(u) > 1.05) return 0;
        const lit = -u * 0.5 - v * 0.8, n = noise2(px * 0.45, py * 0.45, seed + layer);
        const i = 2 + (lit > 0.45 ? 2 : lit > 0 ? 1 : 0) + (n > 0.68 ? 1 : n < 0.25 ? -1 : 0) - dark;
        return P.leaf[clampI(i, 0, 5)];
      });
    }
  }
}

/** A raised planter of boards with greens growing in it. */
function planter_(cv, x0, x1, base, h, seed) {
  const r = new Rng(seed);
  for (let x = x0 + 2; x < x1 - 2; x += 4) {
    const ph = r.int(7, 13);
    for (let j = 0; j < ph; j++) {
      cv.set(x, base - h - j, P.grass[3]);
      // leaves in pairs up the stem, lighter at the top
      if (j > 1 && j % 2 === 0) for (const s2 of [-1, 1]) { cv.set(x + s2, base - h - j, P.moss[j > ph - 4 ? 5 : 3]); cv.set(x + 2 * s2, base - h - j + 1, P.moss[j > ph - 4 ? 4 : 2]); }
    }
    cv.set(x, base - h - ph, P.moss[5]);
  }
  wood(cv, x0, base - h, x1, base, P.brick.map((c) => mixPacked(c, col('#8a4a32'), 0.3)), { seed: 13 });
  rect(cv, x0, base - h, x1, base - h + 1, P.earth[2]);
}

/** A bench of planks. */
function bench_(cv, x0, x1, base) {
  wood(cv, x0, base - 8, x1, base - 5, P.pine, { seed: 17 });
  for (const lx of [x0 + 2, x1 - 5]) wood(cv, lx, base - 5, lx + 3, base, P.pine, { vertical: true, seed: lx });
  wood(cv, x0 + 1, base - 13, x0 + 4, base - 8, P.pine, { vertical: true, seed: 2 });
  wood(cv, x0 + 1, base - 14, x1 - 1, base - 12, P.pine, { seed: 19 });
}

/** A roof of red tiles along the top: rows of round-ended tiles, the eaves' shadow under them. */
function tiles(cv, y1, seed) {
  for (let y = 0; y < y1; y++) for (let x = 0; x < cv.W; x++) {
    const row = Math.floor(y / 4), at = y % 4, tx = (x + (row & 1) * 3) % 6, t = hash2(Math.floor((x + (row & 1) * 3) / 6), row, seed);
    let i = t < 0.3 ? 2 : t > 0.8 ? 4 : 3;
    if (at === 3 && (tx === 0 || tx === 5)) i = 0; else if (at === 3) i = 1; else if (tx === 0) i = 1; else if (at === 0 && tx < 4) i = 5;
    cv.set(x, y, P.tile[i]);
  }
  rect(cv, 0, y1, cv.W, y1 + 2, mixPacked(P.lime[1], 0xff000000, 0.5));
}

/** Rows of pigeonholes: arched niches, each with a wooden ledge, some with nest hay. */
function pigeonholes(cv, x0, x1, y0, rows, seed) {
  for (let r = 0; r < rows; r++) for (let x = x0 + (r & 1) * 9; x + 9 < x1; x += 18) {
    const y = y0 + r * 17;
    fill(cv, x, y, x + 9, y + 10, (xx, yy) => {
      const u = (xx + 0.5 - (x + 4.5)) / 4.5, v = (yy + 0.5 - (y + 4.5)) / 4.5;
      if (yy < y + 4.5 && u * u + v * v > 1) return 0;
      return yy - y < 3 ? col('#140c10') : col('#22161a');
    });
    wood(cv, x - 2, y + 10, x + 11, y + 12, P.wood, { seed: x + r });
    wood(cv, x, y + 12, x + 2, y + 14, P.wood, { vertical: true, seed: 1 });
    wood(cv, x + 7, y + 12, x + 9, y + 14, P.wood, { vertical: true, seed: 2 });
    if (hash2(x, r, seed) > 0.65) hay(cv, x + 4.5, y + 10, 7, 2, seed + x);
  }
}

/** A vaulted arch in a brick wall: a ring of stone voussoirs round a dark hollow. */
function arch(cv, cx, base, r, legs, seed) {
  const cy = base - legs;
  fill(cv, cx - r - 6, cy - r - 6, cx + r + 6, base, (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = y < cy ? Math.hypot(dx, dy) : Math.abs(dx);
    if (d <= r) return mixPacked(col('#1e1418'), col('#0a0608'), clampI((y - (cy - r)) / (r + legs), 0, 1) * 0.5 + 0.3);
    if (d <= r + 6) {
      // the voussoirs: wedges round the arch (blocks down its legs), each its own tone, joints dark
      const a = y < cy ? Math.atan2(dy, dx) + Math.PI : 100 + Math.floor(dy / 6);
      const k = y < cy ? Math.floor(a / 0.3) : a, joint = (y < cy ? (a / 0.3) % 1 < 0.14 : (dy | 0) % 6 === 5) || d > r + 5;
      if (joint) return P.stone[0];
      const t = hash2(k, dx > 0 ? 1 : 0, seed);
      return P.stone[d < r + 2 ? 4 : t > 0.6 ? 3 : 2];
    }
    return 0;
  });
}

// ------------------------------------------------------------------ skies, groves and stone

/**
 * Clouds: rounded puffs along a flat base, white where the light catches
 * their tops, a cool shade in their bellies.
 * @param {{lit?:string, mid?:string, dark?:string}} [o]
 */
function clouds(cv, y0, y1, seed, n, o = {}) {
  const r = new Rng(seed), lit = col(o.lit ?? '#ffffff'), mid = col(o.mid ?? '#e2eaf6'), dark = col(o.dark ?? '#aebcd8');
  for (let c = 0; c < n; c++) {
    const cx = Math.round((c + 0.2 + r.next() * 0.6) * (cv.W / n)), cy = r.int(y0, y1), w = r.int(16, 30), k = r.int(3, 5);
    /** @type {number[][]} */
    const puffs = [];
    for (let j = 0; j < k; j++) {
      const t = (j + 0.5) / k, mid_ = 1 - Math.abs(t - 0.5) * 1.5;
      puffs.push([cx - w / 2 + t * w + r.range(-1.5, 1.5), cy - 1 - mid_ * r.range(1, 3), 2.2 + mid_ * r.range(2.5, 4.5)]);
    }
    fill(cv, cx - w / 2 - 8, cy - 12, cx + w / 2 + 8, cy + 2, (x, y) => {
      let best = -1e9, nx = 0, ny = 0;
      for (const [px, py, pr] of puffs) { const dx = x + 0.5 - px, dy = y + 0.5 - py, d = pr - Math.hypot(dx, dy); if (d > best) { best = d; nx = dx / pr; ny = dy / pr; } }
      if (best < 0 || y > cy + 1) return 0;
      if (y >= cy) return dark;
      const l = -ny * 0.9 - nx * 0.35;
      return l > 0.4 ? lit : l > -0.25 ? mid : dark;
    });
  }
}

/** A round-crowned tree: a trunk under a cluster of leafy lobes, each lit on its upper left. */
function crown(cv, x, base, h, R, seed) {
  const r = new Rng(seed), rad = h * 0.34, cy = base - h + rad;
  rect(cv, x - 1, cy, x + 1, base, P.oak[2]); rect(cv, x, cy, x + 1, base, P.oak[1]);
  const blobs = [[x, cy, rad]];
  for (let k = 0; k < 6; k++) blobs.push([x + r.range(-rad * 0.75, rad * 0.75), cy + r.range(-rad * 0.55, rad * 0.45), rad * r.range(0.5, 0.75)]);
  fill(cv, x - rad * 1.8, cy - rad * 1.6, x + rad * 1.8, cy + rad * 1.5, (px, py) => {
    let best = -1e9, nx = 0, ny = 0;
    for (const [bx, by, br] of blobs) { const dx = (px + 0.5 - bx) / br, dy = (py + 0.5 - by) / br, d = 1 - Math.hypot(dx, dy); if (d > best) { best = d; nx = dx; ny = dy; } }
    if (best + (hash2(px, py, seed) - 0.5) * 0.22 < 0) return 0;
    const lit = -(nx * 0.55 + ny * 0.85), n = noise2(px * 0.42, py * 0.42, seed);
    let i = 2 + (lit > 0.5 ? 2 : lit > 0.05 ? 1 : lit < -0.45 ? -1 : 0) + (n > 0.68 ? 1 : n < 0.28 ? -1 : 0);
    if (best < 0.12 && ny > 0.2) i--;
    return R[clampI(i, 0, 5)];
  });
}

/** A fir: tiers of boughs, lit on the left, shaded under each tier (snowed on along its tiers when asked). */
function pine(cv, x, base, h, R, seed, snow) {
  rect(cv, x - 1, base - 3, x + 1, base, P.oak[1]);
  const tiers = Math.max(3, Math.round(h / 5)), th = Math.round(h / tiers) + 3;
  for (let t = 0; t < tiers; t++) {
    const ty = base - 2 - Math.round((t * (h - th)) / (tiers - 1)), w = Math.round((1 - t / tiers) * h * 0.3) + 2;
    for (let j = 0; j < th; j++) {
      const half = Math.round((w * (j + 1)) / th), y = ty - th + 1 + j;
      for (let i = -half; i <= half; i++) {
        let k = i < -half * 0.35 ? 3 : i > half * 0.45 ? 1 : 2;
        if (j === th - 1) k = Math.min(k, 1);
        else if (i === -half && j > 1) k = 4;
        if (noise2((x + i) * 0.6, y * 0.6, seed) > 0.72) k++;
        let c = R[clampI(k, 0, 5)];
        if (snow && (i === -half || i === -half + 1) && j < th - 1 && hash2(x + i, y, seed) > 0.25) c = snow;
        cv.set(x + i, y, c);
      }
    }
  }
}

/**
 * A grove along a line: round crowns and firs packed side by side, the ones
 * behind drawn first, the ground under them filled down to `bottom`.
 * @param {number[]} R a 6-step leaf ramp @param {{h?:number[], pines?:number, gap?:number[], bottom?:number, snow?:string}} [o]
 */
function grove(cv, base, R, seed, o = {}) {
  const r = new Rng(seed), h = o.h ?? [12, 20], gap = o.gap ?? [7, 12];
  const trees = [];
  for (let x = -6; x < cv.W + 8; x += r.int(gap[0], gap[1])) trees.push({ x, h: r.int(h[0], h[1]), pine: r.next() < (o.pines ?? 0.35), y: base + r.int(0, 2) });
  const order = [...trees.filter((_, i) => i % 2), ...trees.filter((_, i) => !(i % 2))];
  for (const t of order) {
    if (t.pine) pine(cv, t.x, t.y, t.h, R, seed + t.x, o.snow ? col(o.snow) : 0);
    else crown(cv, t.x, t.y, t.h, R, seed + t.x);
  }
  fill(cv, 0, base, cv.W, o.bottom ?? base + 6, (x, y) => R[noise2(x * 0.3, y * 0.5, seed) > 0.6 ? 2 : 1]);
}

/** A leaf ramp faded toward a colour (distance). @param {number[]} R @param {string} c @param {number} k */
const haze = (R, c, k) => R.map((q) => mixPacked(q, col(c), k));

/**
 * Fieldstone laid in courses: rounded stones of uneven length in a dark
 * mortar, each lit on its upper left and shaded along its underside, moss
 * in some joints when asked.
 * @param {number[]} R @param {{h?:number, mortar?:number, moss?:number}} [o]
 */
function rocks(cv, x0, y0, x1, y1, R, seed, o = {}) {
  const sh = o.h ?? 9, r = new Rng(seed), mortar = o.mortar ?? R[0];
  fill(cv, x0, y0, x1, y1, (x, y) => (o.moss && hash2(x >> 1, y >> 1, seed + 8) < o.moss ? P.moss[1] : mortar));
  for (let ry = y0 - 2; ry < y1; ry += sh) {
    let sx = x0 - r.int(2, 10);
    while (sx < x1) {
      const w = r.int(Math.round(sh * 1.15), Math.round(sh * 2)), hh = sh + r.int(-1, 1), tone = r.int(-1, 1), sq = r.range(2.1, 3);
      const cx = sx + w / 2, cy = ry + sh / 2 + r.range(-0.6, 0.6), rx = w / 2 - 0.3, rv = hh / 2 - 0.3;
      fill(cv, Math.max(sx, x0), Math.max(ry - 1, y0), Math.min(sx + w, x1), Math.min(ry + hh + 1, y1), (x, y) => {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / rv, e = Math.abs(u) ** sq + Math.abs(v) ** sq;
        if (e > 1) return 0;
        const lit = -(u * 0.5 + v * 0.9);
        let i = 2 + tone + (lit > 0.55 ? 2 : lit > 0.1 ? 1 : lit < -0.5 ? -1 : 0);
        const n = noise2(x * 0.45, y * 0.45, seed + 3);
        if (n > 0.72) i++; else if (n < 0.2) i--;
        if (e > 0.7 && v > 0.3) i = Math.min(i, 1);
        if (hash2(x, y, seed + 5) > 0.97) i--;
        return R[clampI(i, 1, 5)];
      });
      sx += w;
    }
  }
}

/** Loose pebbles on the ground: little rounded stones, lit on top, a shadow under them. */
function pebbles(cv, x0, x1, y0, y1, seed, n) {
  const r = new Rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r.int(x0, x1), y = r.int(y0, y1), w = r.int(2, 4), t = r.int(0, 1);
    for (let k = 0; k < w; k++) {
      cv.set(x + k, y, P.stone[4 + (k === 0 && t ? 1 : 0) - (k === w - 1 ? 1 : 0)]);
      cv.set(x + k, y + 1, P.stone[k === w - 1 ? 1 : 2]);
      if (w > 2 && k > 0 && k < w - 1) cv.set(x + k, y - 1, P.stone[4]);
    }
    cv.set(x + w, y + 1, mixPacked(cv.pix.get(x + w, y + 1) || P.ink, 0xff000000, 0.35));
  }
}

// ------------------------------------------------------------------ small things

/** A lone rounded stone set in earth, lit on its upper left. */
function stone_(cv, cx, cy, w, seed) {
  const rx = w / 2, ry = w * 0.36;
  fill(cv, cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => {
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, e = u * u + v * v;
    if (e > 1) return 0;
    const lit = -(u * 0.5 + v * 0.9);
    return P.stone[clampI(2 + (lit > 0.5 ? 2 : lit > 0 ? 1 : lit < -0.5 ? -1 : 0) + (noise2(x * 0.6, y * 0.6, seed) > 0.7 ? 1 : 0), 1, 5)];
  });
}

/** A mushroom: a pale stem under a spotted cap. */
function mushroom_(cv, x, base, h, cap = '#d0302a') {
  const C = col(cap), D = mixPacked(C, 0xff000000, 0.35), L = mixPacked(C, 0xffffffff, 0.3);
  rect(cv, x, base - h + 2, x + 2, base, P.lime[4]); cv.set(x + 1, base - 1, P.lime[2]);
  for (let i = -2; i <= 3; i++) { cv.set(x + i, base - h + 1, i > 1 ? D : C); if (i > -2 && i < 3) cv.set(x + i, base - h, i < 1 ? L : C); }
  cv.set(x - 1, base - h + 1, P.lime[5]); cv.set(x + 1, base - h, P.lime[5]);
}

/** Roots hanging from the top of a bank: thin strands wandering down, forking now and then. */
function roots(cv, x0, x1, y, seed, rate = 0.08) {
  const r = new Rng(seed), C = [col('#3a2414'), col('#7a5430'), col('#a87a48')];
  for (let x = x0; x < x1; x++) {
    if (r.next() > rate) continue;
    const L = r.int(6, 16);
    const strand = (sx, sy, L, d) => {
      let px = sx;
      for (let j = 0; j < L; j++) {
        cv.set(px, sy + j, C[j < L - 3 ? 2 : 1]); cv.set(px + 1, sy + j, C[0]);
        if (r.next() < 0.3) px += r.next() < 0.5 ? -1 : 1;
        if (d < 2 && j > 2 && r.next() < 0.12) strand(px + (r.next() < 0.5 ? -1 : 1), sy + j, Math.round((L - j) * 0.7), d + 1);
      }
    };
    strand(x, y, L, 0);
  }
}

/** A glass bottle: a body of coloured liquid, a neck, a cork, a glint. @param {'tall'|'round'|'jar'} shape */
function bottle_(cv, x, base, liquid, shape = 'tall') {
  const L = col(liquid), D = mixPacked(L, 0xff000000, 0.4), H = mixPacked(L, 0xffffffff, 0.45), glass = col('#c8dce6');
  const w = shape === 'jar' ? 6 : 5, h = shape === 'tall' ? 7 : 5;
  fill(cv, x, base - h, x + w, base, (px, py) => {
    const u = px - x, v = py - (base - h);
    if (shape === 'round' && v === 0 && (u === 0 || u === w - 1)) return 0;
    if (u === 0 || v === 0) return v < 2 ? glass : D;
    if (u === w - 1 || py === base - 1) return P.ink;
    return v < 2 && shape !== 'jar' ? mixPacked(glass, L, 0.4) : u === 1 && v < h - 2 ? H : L;
  });
  if (shape === 'jar') { rect(cv, x, base - h - 1, x + w, base - h, col('#8a5a2c')); rect(cv, x + 1, base - h - 2, x + w - 1, base - h - 1, col('#b88242')); return; }
  rect(cv, x + 1, base - h - 2, x + w - 2, base - h, glass); cv.set(x + w - 2, base - h - 2, P.ink);
  rect(cv, x + 1, base - h - 4, x + w - 2, base - h - 2, col('#9a6a34')); cv.set(x + 1, base - h - 4, col('#d09a5a'));
}

/** A stack of split logs, their ends showing rings. */
function woodpile_(cv, x0, base, cols_, rows) {
  for (let row = 0; row < rows; row++) for (let c = 0; c < cols_ - row; c++) {
    const cx = x0 + c * 5 + row * 2.5 + 2.5, cy = base - 2.5 - row * 4.5;
    fill(cv, cx - 3, cy - 3, cx + 3, cy + 3, (x, y) => {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.1);
      if (d > 2.7) return 0;
      if (d > 2) return P.oak[x + 0.5 < cx && y + 0.5 < cy ? 3 : 1];
      return d < 0.8 ? P.wood[3] : P.wood[d < 1.5 ? 5 : 4];
    });
  }
}

/** A row of carrots: orange shoulders in the soil, feathery green tops. */
function carrots(cv, x0, x1, base, seed) {
  const r = new Rng(seed);
  for (let x = x0; x < x1; x += 6) {
    const h = r.int(5, 8);
    for (let j = 1; j <= h; j++) for (const s of [-1, 0, 1]) if (hash2(x + s, j, seed) > (s ? 0.45 : 0)) cv.set(x + s + (j > h - 2 ? s : 0), base - 2 - j, P.moss[clampI(2 + (j > h / 2 ? 1 : 0) + (s < 0 ? 1 : 0), 0, 5)]);
    rect(cv, x - 1, base - 3, x + 2, base, col('#e2741e')); cv.set(x - 1, base - 3, col('#ffa64a')); cv.set(x + 1, base - 1, col('#a04a14'));
  }
}

/** A cabbage: a round head of leaves, lit on top, veins pale. */
function cabbage_(cv, cx, base, rad) {
  fill(cv, cx - rad - 1, base - rad * 1.7, cx + rad + 1, base, (x, y) => {
    const u = (x + 0.5 - cx) / (rad + 0.5), v = (y + 0.5 - (base - rad * 0.85)) / (rad * 0.85);
    if (u * u + v * v > 1) return 0;
    if (Math.abs(u * 2.4 + v) < 0.18 || Math.abs(u * -2.4 + v) < 0.18) return P.moss[5];
    const lit = -(u * 0.5 + v * 0.85);
    return P.moss[clampI(2 + (lit > 0.45 ? 2 : lit > 0 ? 1 : lit < -0.5 ? -1 : 0), 0, 5)];
  });
}

/** A trellis of poles and crossbars, vines climbing it, red fruit hanging in the leaves. */
function trellis_(cv, x0, x1, top, base, seed) {
  const r = new Rng(seed);
  for (let x = x0 + 3; x < x1 - 3; x++) for (let y = top + 3; y < base - 2; y++) {
    const n = noise2(x * 0.35, y * 0.25, seed);
    if (n > 0.42) cv.set(x, y, P.leaf[n > 0.7 ? 4 : n > 0.56 ? 3 : 2]);
  }
  for (const x of [x0, Math.round((x0 + x1) / 2) - 1, x1 - 3]) wood(cv, x, top, x + 3, base, P.wood, { vertical: true, seed: x });
  for (const y of [top + 2, Math.round((top + base) / 2)]) wood(cv, x0, y, x1, y + 2, P.wood, { seed: y });
  for (let k = 0; k < (x1 - x0) / 3; k++) {
    const x = r.int(x0 + 3, x1 - 5), y = r.int(top + 6, base - 6);
    rect(cv, x, y, x + 3, y + 3, col('#c8281e')); cv.set(x, y, col('#ff7a5a')); cv.set(x + 2, y + 2, col('#7a1010')); cv.set(x + 1, y - 1, P.leaf[4]);
  }
}

/** A watering can: a tin body, a spout up to the left, a handle over it. */
function wateringCan_(cv, x, base) {
  fill(cv, x, base - 8, x + 9, base, (px, py) => P.stone[px === x ? 5 : px === x + 8 || py === base - 1 ? 2 : py === base - 8 ? 5 : 4]);
  for (let i = 0; i < 6; i++) { cv.set(x - 1 - i, base - 4 - i, P.stone[4]); cv.set(x - 1 - i, base - 3 - i, P.stone[2]); }
  rect(cv, x - 8, base - 11, x - 5, base - 9, P.stone[5]);
  for (let i = 1; i < 8; i++) cv.set(x + i, base - 11 + (i === 1 || i === 7 ? 1 : 0) + (i === 8 ? 2 : 0), P.stone[3]);
  rect(cv, x + 1, base - 10, x + 2, base - 8, P.stone[3]); rect(cv, x + 7, base - 10, x + 8, base - 8, P.stone[3]);
}

/** A pitchfork leaning against something: a long handle, three tines. */
function pitchfork_(cv, x, base, h) {
  for (let j = 0; j < h; j++) { const px = x + Math.round(j * 0.18); cv.set(px, base - 1 - j, P.wood[4]); cv.set(px + 1, base - 1 - j, P.wood[2]); }
  const tx = x + Math.round(h * 0.18), ty = base - h;
  rect(cv, tx - 2, ty, tx + 4, ty + 1, P.iron[3]);
  for (const i of [-2, 0, 2]) for (let j = 1; j < 6; j++) cv.set(tx + i + 1, ty - j, P.iron[j === 5 ? 2 : 3]);
}

/** A wooden bucket bound with iron, water in it. */
function bucket_(cv, cx, base, w = 8, h = 7) {
  barrel_(cv, cx, base, w, h);
  rect(cv, cx - w / 2 + 1, base - h, cx + w / 2 - 1, base - h + 1, P.water[4]);
  for (let i = -w / 2; i <= w / 2; i++) cv.set(Math.round(cx + i), Math.round(base - h - 3 + Math.abs(i) * 0.5), P.iron[2]);
}

/** A shallow bowl. @param {string} [content] what is in it */
function bowl_(cv, cx, base, w, content) {
  const x0 = Math.round(cx - w / 2), C = [col('#5a2e1e'), col('#8a4630'), col('#b4653e'), col('#d88a58')];
  for (let i = 0; i < w; i++) {
    const x = x0 + i, inset = i === 0 || i === w - 1;
    cv.set(x, base - 5, inset ? C[1] : C[3]);
    cv.set(x, base - 4, inset ? C[1] : content ? (i === 1 ? mixPacked(col(content), 0xffffffff, 0.35) : col(content)) : C[0]);
    for (let j = 1; j < 4; j++) if (!(j === 1 && inset)) cv.set(x, base - j, C[i < w / 3 ? 2 : i > (w * 2) / 3 ? 1 : 2] );
    if (i > 0 && i < w - 1) cv.set(x, base - 3, C[i < w / 3 ? 3 : 2]);
  }
}

/**
 * Wire mesh, a diamond lattice of fine bright wire, over whatever is behind
 * it (the stretch of a rabbit fence between its posts).
 */
function mesh(cv, x0, x1, y0, y1) {
  const wire = col('#d4d8e2'), shade = col('#5a5e6a');
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const a = (x + y) % 6 === 0, b = (((x - y) % 6) + 6) % 6 === 0;
    if (!(a || b)) continue;
    const q = cv.pix.get(x, y);
    cv.set(x, y, mixPacked(q, a && b ? wire : y % 2 ? shade : wire, a && b ? 0.75 : 0.45));
  }
}

/**
 * The rabbits' fence: stout posts with lit caps, three rails, and wire
 * mesh stretched between them down to the ground.
 */
function rabbitFence(cv, x0, x1, top, base, seed) {
  mesh(cv, x0, x1, top + 3, base);
  layer(cv, () => {
    for (const y of [top + 2, Math.round((top + base) / 2) - 1, base - 4]) wood(cv, x0, y, x1, y + 3, P.wood, { seed: y + seed });
    for (let x = x0 + 2; x < x1; x += 30) {
      wood(cv, x, top - 2, x + 5, base + 1, P.wood, { vertical: true, seed: x + seed });
      rect(cv, x - 1, top - 3, x + 6, top - 1, P.wood[4]); rect(cv, x - 1, top - 3, x + 6, top - 2, P.wood[5]);
    }
  });
}

/** A hay rack hung on the fence: a slatted V of wood, hay bristling out of its top. */
function hayRack_(cv, x0, x1, top, h, seed) {
  hay_(cv, (x0 + x1) / 2, top + 3, x1 - x0 + 2, 6, seed);
  fill(cv, x0, top + 2, x1, top + h, (x, y) => {
    const v = (y - top) / h, inset = Math.round(v * (x1 - x0) * 0.22);
    if (x < x0 + inset || x >= x1 - inset) return 0;
    if ((x - x0) % 4 === 0) return P.wood[(x - x0) % 8 === 0 ? 4 : 3];
    return P.straw[noise2(x * 0.8, y * 0.5, seed) > 0.5 ? 3 : 2];
  });
  wood(cv, x0 - 1, top + 2, x1 + 1, top + 4, P.wood, { seed: 31 });
  wood(cv, x0 + Math.round((x1 - x0) * 0.2), top + h - 1, x1 - Math.round((x1 - x0) * 0.2), top + h + 1, P.wood, { seed: 33 });
}

/**
 * A rabbit hutch on legs: a plank box under a shingled roof, its left half
 * fronted with wire, its right a solid door with a latch, a ramp down to
 * the run from a little round door in its side.
 */
function hutchBox_(cv, x0, x1, base, h, seed) {
  const legs = 7, bot = base - legs, top = base - h, mid = Math.round(x0 + (x1 - x0) * 0.55);
  for (const lx of [x0 + 1, x1 - 5]) wood(cv, lx, bot - 2, lx + 4, base, P.oak, { vertical: true, seed: lx });
  // the box
  fill(cv, x0, top, x1, bot, (x, y) => {
    const b = Math.floor((y - top) / 4), at = (y - top) % 4;
    if (at === 3) return P.wood[1];
    const t = hash2(b, 1, seed) > 0.6 ? 1 : 0;
    return P.pine[(at === 0 ? 4 : 3) - t - (noise2(x * 0.2, y * 2, seed) > 0.7 ? 1 : 0)];
  });
  // the wired front: dark inside, straw on its floor, the wire over it
  fill(cv, x0 + 3, top + 3, mid - 1, bot - 3, (x, y) => (y >= bot - 5 ? P.straw[hash2(x, y, seed) > 0.5 ? 3 : 2] : mixPacked(col('#2a1a14'), col('#120a0c'), (y - top) / h)));
  mesh(cv, x0 + 3, mid - 1, top + 3, bot - 3);
  wood(cv, x0, top, x1, top + 3, P.wood, { seed: 41 }); wood(cv, x0, bot - 3, x1, bot, P.wood, { seed: 43 });
  wood(cv, x0, top, x0 + 3, bot, P.wood, { vertical: true, seed: 45 }); wood(cv, mid - 1, top, mid + 2, bot, P.wood, { vertical: true, seed: 47 }); wood(cv, x1 - 3, top, x1, bot, P.wood, { vertical: true, seed: 49 });
  // the door: a Z-brace, hinges, a latch
  brace(cv, mid + 3, bot - 5, x1 - 4, top + 4, 2, P.wood);
  for (const y of [top + 5, bot - 7]) rect(cv, mid + 2, y, mid + 6, y + 2, P.iron[2]);
  rect(cv, x1 - 7, Math.round((top + bot) / 2), x1 - 4, Math.round((top + bot) / 2) + 2, P.iron[3]);
  // the roof: shingles in rows, overhanging, lit along their lower lips
  const rt = top - 7;
  for (let y = rt; y < top + 1; y++) {
    const over = 4 - Math.round(((y - rt) / 7) * 1), xs = x0 - over - (y - rt) * 0.3, xe = x1 + over + (y - rt) * 0.3;
    for (let x = Math.floor(xs); x < xe; x++) {
      const row = Math.floor((y - rt) / 3), at = (y - rt) % 3, sx = (x + row * 3) % 6;
      let i = at === 2 ? 1 : sx === 0 ? 1 : at === 0 ? 4 : 3;
      if (hash2(Math.floor((x + row * 3) / 6), row, seed) > 0.75 && i > 1) i--;
      cv.set(x, y, P.tile[i]);
    }
  }
  rect(cv, x0 - 5, rt - 1, x1 + 5, rt, P.tile[5]);
  rect(cv, x0 - 2, top + 1, x1 + 2, top + 2, mixPacked(P.wood[1], 0xff000000, 0.4));
  // a ramp down to the ground
  for (let i = 0; i < legs + 7; i++) {
    const y = bot - 2 + Math.round(i * 0.6);
    for (let j = 0; j < 4; j++) cv.set(x0 - 1 - i, y + j, P.wood[j === 0 ? 5 : j === 3 ? 1 : 3]);
    if (i % 4 === 1) { cv.set(x0 - 1 - i, y - 1, P.wood[4]); cv.set(x0 - 1 - i, y, P.wood[1]); }
  }
}

// ------------------------------------------------------------------ the ground

/**
 * The ground from row y0 down: style dirt, flags, cobble, grass, snow,
 * soil — darkest in the shade of the back, in broad patches, a few stones
 * and bits of straw in it.
 */
function ground(cv, y0, style, seed, o = {}) {
  const R = o.R || (style === 'grass' ? P.grass : style === 'snow' ? P.snow : style === 'soil' ? P.earth : style === 'flags' || style === 'cobble' ? P.flag : P.dirt);
  const s = { stones: [R[2], R[3], R[2], R[4]], mortar: mixPacked(R[0], 0xff000000, 0.5), s: 8, seed, flat: 1.3, round: true };
  const H = cv.H, depth = Math.max(1, H - y0);
  fill(cv, 0, y0, cv.W, H, (x, y) => {
    const d = y - y0, near = d / depth;
    let c;
    if (style === 'cobble') c = cobble(x, y, s);
    else if (style === 'flags') {
      const rh = 5 + Math.floor(d / 9), row = Math.floor(d / rh), at = d % rh, w = 8 + rh, v = x + Math.floor(hash2(row, 1, seed) * w), slab = Math.floor(v / w);
      if (at === rh - 1 || v % w === 0) c = o.joint ? col(o.joint) : R[0];
      else {
        // each slab its own tone, worn paler in its middle, pitted, a chip off a corner now and then
        let i = (hash2(slab, row, seed) > 0.6 ? 3 : 2) + (at === 0 ? 1 : 0);
        if (noise2(x * 0.3, y * 0.6, seed + slab) > 0.72) i++;
        if (hash2(x, y, seed + 3) > 0.985) i--;
        if ((v % w === 1 || v % w === w - 1) && at === rh - 2 && hash2(slab, row, seed + 5) > 0.5) i = 0;
        c = R[clampI(i, 0, 5)];
      }
    } else {
      // the ground's tones in clean flat patches (no dither), as the wilds' ground is laid
      const m = fbm2(x * 0.045, y * 0.11, seed, 3) * 2.2 + 0.12;
      let i = 1 + clampI(Math.floor(m), 0, 2);
      if (style === 'snow') i += 2;
      else if (style === 'soil') { i++; if ((d + Math.round(noise2(x * 0.05, 0, seed) * 3)) % 6 === 0) i--; }
      if (style === 'grass') {
        // as the wilds' grass: clean patches, and the blades in tufts — a few upright strokes together,
        // two to four pixels tall, lit at the tip, dark at the root — with plain turf between them
        const cxT = Math.floor(x / 7), cyT = Math.floor((y + (cxT & 1) * 3) / 6);
        if (hash2(cxT, cyT, seed + 8) < 0.42) {
          const tx = cxT * 7 + 3, ty = cyT * 6 - (cxT & 1) * 3 + 5, dx = x - tx, up = ty - y;
          if (Math.abs(dx) <= 2 && up >= 0) {
            const bh = 2 + Math.floor(hash2(x, cyT, seed + 1) * 3) - (Math.abs(dx) === 2 ? 1 : 0);
            if (up < bh && (dx & 1) === 0) i = up === bh - 1 ? Math.min(5, i + 2) : up === 0 ? Math.max(0, i - 1) : i + 1;
            else if (up === 0) i = Math.max(0, i - 1);
          }
        }
      }
      const g = hash2(x, y, seed + 2);
      if (g > 0.993) i += 1; else if (g < 0.007) i -= 1;
      c = R[clampI(i, 0, 5)];
    }
    // in the shade of the back
    if (d < 5) c = mixPacked(c, 0xff000000, (5 - d) * 0.07);
    void near;
    return c;
  });
  if (MARK) for (let y = Math.max(0, y0); y < H; y++) for (let x = 0; x < cv.W; x++) { MARK.ground[y * cv.W + x] = 1; MARK.thing[y * cv.W + x] = 0; }
  const r = new Rng(seed + 17), area = cv.W * depth;
  if (style === 'dirt' || style === 'soil') {
    // clods: little lumps, lit on top, a shadow under them — bigger toward the front
    for (let k = 0; k < area / 90; k++) {
      const x = r.int(0, cv.W - 4), y = r.int(y0 + 3, H - 2), big = (y - y0) / depth > 0.5 ? 1 : 0, w = 2 + r.int(0, 1) + big;
      for (let i = 0; i < w; i++) { cv.set(x + i, y - 1, R[4]); cv.set(x + i, y, R[3]); cv.set(x + i + 1, y + 1, R[0]); }
      cv.set(x, y - 1, R[5]);
    }
    // cracks in the dry earth: thin dark lines wandering, a lit lip under each
    for (let k = 0; k < area / 700; k++) {
      let x = r.int(0, cv.W - 1), y = r.int(y0 + 4, H - 2);
      for (let j = r.int(4, 10); j > 0; j--) {
        cv.set(x, y, R[0]); cv.set(x, y + 1, R[3]);
        x += r.next() < 0.7 ? 1 : 0; y += r.next() < 0.3 ? (r.next() < 0.5 ? -1 : 1) : 0;
        if (y <= y0 + 2 || y >= H - 1) break;
      }
    }
    pebbles(cv, 0, cv.W - 4, y0 + 4, H - 3, seed + 11, o.pebbles ?? 22);
    // grass coming up along the back, out of the shade
    if (o.tufts !== false) tufts(cv, 0, cv.W, y0 + 2, seed + 13, 0.12, P.moss);
  } else if (style === 'grass') {
    // clover and daisies in the sward
    for (let k = 0; k < area / 260; k++) {
      const x = r.int(1, cv.W - 2), y = r.int(y0 + 4, H - 2);
      if (r.next() < 0.5) { cv.set(x, y, P.leaf[4]); cv.set(x + 1, y, P.leaf[5]); cv.set(x, y - 1, P.leaf[4]); }
      else { cv.set(x, y, col('#ffffff')); cv.set(x, y + 1, P.grass[1]); }
    }
  } else if (style === 'snow') {
    // drifts: ridges lit on top with a blue shadow under them; glints of ice
    for (let k = 0; k < area / 160; k++) {
      const x = r.int(0, cv.W - 8), y = r.int(y0 + 3, H - 2), w = r.int(4, 10);
      for (let i = 0; i < w; i++) { cv.set(x + i, y, P.snow[5]); cv.set(x + i + 1, y + 1, P.snow[2]); }
    }
    for (let k = 0; k < area / 120; k++) cv.set(r.int(0, cv.W - 1), r.int(y0 + 2, H - 1), r.next() < 0.5 ? col('#ffffff') : P.snow[1]);
  } else if (style === 'flags') {
    // moss in the joints here and there
    for (let k = 0; k < area / 90; k++) {
      const x = r.int(0, cv.W - 1), y = r.int(y0, H - 1), c = cv.pix.get(x, y);
      if (c === (o.joint ? col(o.joint) : R[0])) { cv.set(x, y, P.moss[2]); if (r.next() < 0.5) cv.set(x, y - 1, P.moss[3]); }
    }
  }
  if (o.straw) {
    // loose straw: strands of three to five pixels lying every which way, each with a shadow
    for (let k = 0; k < area / 240; k++) {
      const x = r.int(0, cv.W - 6), y = r.int(y0 + 2, H - 2), L = r.int(3, 5), dir = r.int(-1, 1);
      for (let i = 0; i < L; i++) { const yy = y + Math.round((i * dir) / 2); cv.set(x + i, yy + 1, mixPacked(cv.pix.get(x + i, yy + 1), 0xff000000, 0.35)); cv.set(x + i, yy, P.straw[i === 0 ? 5 : i === L - 1 ? 2 : 4]); }
    }
  }
}

/** What stands in front of the feet: a fringe along the bottom edge (grass blades, snow, or nothing). */
function fringe(fg, style, seed) {
  if (style === 'grass') tufts(fg, 0, fg.W, fg.H, seed, 0.55);
  else if (style === 'snow') for (let x = 0; x < fg.W; x++) { const h = 1 + Math.floor(patch(x, 0, seed, 0.3) * 3); for (let j = 1; j <= h; j++) fg.set(x, fg.H - j, P.snow[j === h ? 5 : 4]); }
}

// each piece of furniture and scenery drawn standing apart from what is behind it
const frame = prop(frame_);
const lantern = thing(lantern_);
const railFence = prop(railFence_);
const boardFence = prop(boardFence_);
const ropePost = prop(ropePost_);
const table = thing(table_);
const shelf = prop(shelf_);
const item = thing(item_);
const barrel = thing(barrel_);
const crate = thing(crate_);
const hay = thing(hay_);
const shelter = prop(shelter_);
const trough = thing(trough_);
const doghouse = thing(doghouse_);
const pump = thing(pump_);
const planter = thing(planter_);
const bench = thing(bench_);
const pond = thing(pond_);
const mushroom = thing(mushroom_);
const stone = thing(stone_);
const bottle = thing(bottle_);
const woodpile = thing(woodpile_);
const cabbage = thing(cabbage_);
const trellis = prop(trellis_);
const wateringCan = thing(wateringCan_);
const pitchfork = thing(pitchfork_);
const bucket = thing(bucket_);
const bowl = thing(bowl_);
const hayRack = thing(hayRack_);
const hutchBox = thing(hutchBox_);

// ------------------------------------------------------------------ the pens

/** @typedef {{cv:Canvas, fg:Canvas, seed:number, block:(x0:number, y0:number, x1:number, y1:number)=>void}} Ctx */

/** @type {Record<string, {title:string, fringe?:string, compose:(c:Ctx)=>{rack:{x:number,y:number}, nest:[number,number,number,number], anim?:import('../../rendering/pen-anim.js').PenAnim[]}}>} */
const PENS = {
  rabbit: {
    title: 'The hutch',
    fringe: 'grass',
    compose({ cv, seed, block }) {
      // a run in the open: a blue sky, a grove beyond, the rabbits' wire fence, their hutch on its legs
      sky(cv, 46, rgb('#3e6cb8'), rgb('#a8cce8'));
      clouds(cv, 7, 15, seed + 1, 4);
      grove(cv, 33, haze(P.leaf, '#86a8cc', 0.5), seed + 2, { h: [9, 15], bottom: 40, pines: 0.5 });
      grove(cv, 41, P.leaf, seed + 3, { h: [12, 21], bottom: 48 });
      ground(cv, 46, 'grass', seed + 4);
      flowers(cv, 4, cv.W - 4, 47, ['#ffffff', '#f6d26a', '#f0a0c0'], seed + 10, 14);
      rabbitFence(cv, 0, cv.W, 35, BACK - 1, seed + 5);
      hayRack(cv, 12, 38, 46, 13, seed + 6);
      hutchBox(cv, 154, 210, BACK + 2, 36, seed + 7);
      // the run's things: a bowl of water, a bowl of greens, a crate of carrots
      crate(cv, 120, BACK + 1, 12);
      for (const [x, y] of [[121, BACK - 12], [126, BACK - 13], [124, BACK - 11]]) { rect(cv, x, y, x + 5, y + 2, col('#e2741e')); cv.set(x, y, col('#ffa64a')); cv.set(x + 5, y, P.moss[4]); cv.set(x + 6, y - 1, P.moss[3]); }
      bowl(cv, 88, GROUND_Y0 + 5, 11, '#6a9ccc');
      bowl(cv, 102, GROUND_Y0 + 5, 9, '#6eae3a');
      block(80, GROUND_Y0 - 2, 110, GROUND_Y0 + 6);
      flowers(cv, 52, 74, BACK + 3, ['#ffffff', '#f0a0c0'], seed + 8, 4);
      return { rack: { x: 42, y: GROUND_Y0 + 1 }, nest: [168, BACK - 3, 196, BACK + 1], anim: [{ type: 'butterflies', n: 2, x0: 50, x1: 150, y0: 30, y1: 60, colors: ['#f6d26a', '#ffffff'] }] };
    },
  },
  cat: {
    title: 'The cattery',
    compose({ cv, seed }) {
      // a loft: a plastered wall under the dark of the roof, a frame of beams
      plaster(cv, 0, 0, cv.W, 42, P.beige, seed, { flakes: 3 });
      fill(cv, 0, 0, cv.W, 24, (x, y) => (y < 7 + Math.floor(patch(x, 0, seed + 3, 0.2) * 16 * (hash2(x >> 2, 1, seed) > 0.4 ? 1 : 0.4)) ? col('#24181e') : 0));
      wainscot(cv, 0, cv.W, 40, BACK, P.oak, seed);
      frame(cv, 4, [30, 120, 210], P.wood);
      lantern(cv, 82, 9, 20);
      table(cv, 50, 104, 42, BACK, P.pine); bottle(cv, 60, 42, '#e0a030', 'jar'); item(cv, 84, 42, 'bread');
      shelf(cv, 146, 196, 28, P.wood);
      bottle(cv, 152, 28, '#d04a7a', 'round'); bottle(cv, 162, 28, '#4ab86a', 'tall'); bottle(cv, 172, 28, '#6a8ae0', 'tall'); crate(cv, 182, 28, 9);
      ropePost(cv, 120, 9, BACK);
      railFence(cv, 130, 222, BACK, 16, P.wood, { gap: 30, rails: 3 });
      ground(cv, BACK - 1, 'dirt', seed + 2, { straw: true, tufts: false });
      barrel(cv, 9, BACK + 1, 12, 15);
      hay(cv, 32, BACK + 2, 34, 13, seed + 1);
      barrel(cv, 112, BACK + 1, 9, 10);
      return { rack: { x: 54, y: GROUND_Y0 + 1 }, nest: [20, BACK - 4, 44, BACK], anim: [{ type: 'lantern', x: 82, y: 20 }, { type: 'motes', n: 10, x: 82, y: 32, r: 20 }] };
    },
  },
  toad: {
    title: 'The toad pond',
    compose({ cv, seed, block }) {
      sky(cv, 36, rgb('#3a64b0'), rgb('#9cc4e8'));
      clouds(cv, 4, 10, seed + 9, 3);
      grove(cv, 27, P.leaf, seed, { h: [9, 18], bottom: 32 });
      rocks(cv, 0, 26, cv.W, BACK, P.stone, seed + 1, { h: 9, moss: 0.05 });
      overgrowth(cv, 0, cv.W, 25, P.moss, seed + 2, { rate: 0.2, len: [3, 16], flower: '#e86a8a' });
      flowers(cv, 60, 80, 25, ['#d84a6a', '#f07aa0'], seed + 3, 4);
      ground(cv, BACK, 'flags', seed + 7, { joint: '#26301e' });
      pond(cv, 92, 178, BACK - 7, BACK + 3, seed + 4);
      // a spring spilling from the wall into the pond
      fill(cv, 150, BACK - 16, 156, BACK - 6, (x, y) => P.water[(x + y * 2 + (y >> 1)) % 4 === 0 ? 5 : x === 150 ? 3 : 4]);
      rect(cv, 148, BACK - 17, 158, BACK - 15, P.stone[4]);
      block(80, GROUND_Y0 - 3, 190, GROUND_Y0 + 2);
      pump(cv, 204, BACK);
      flowers(cv, 6, 30, BACK, ['#f0a0c0', '#ffffff', '#e86a8a'], seed + 5, 8);
      return { rack: { x: 40, y: GROUND_Y0 + 1 }, nest: [30, BACK - 3, 50, BACK], anim: [
        { type: 'waterfall', x0: 150, x1: 156, y0: BACK - 15, y1: BACK - 6 },
        { type: 'shimmer', n: 6, x0: 96, x1: 176, y0: BACK - 6, y1: BACK + 2 },
        { type: 'butterflies', n: 1, x0: 10, x1: 80, y0: 30, y1: 58, colors: ['#f07aa0'] },
      ] };
    },
  },
  salamander: {
    title: 'The hearth pit',
    compose({ cv, seed }) {
      bricks(cv, 0, 0, cv.W, BACK, P.brick.map((c) => mixPacked(c, 0xff000000, 0.3)), seed, { h: 5, w: 11 });
      frame(cv, 2, [8, 150], P.oak);
      // the fireplace: an arch of brick round a fire on its hearth
      const cx = 66;
      bricks(cv, cx - 30, 14, cx + 30, BACK, P.brick, seed + 1, { h: 4, w: 8 });
      fill(cv, cx - 22, 22, cx + 22, BACK - 3, (x, y) => {
        const u = (x + 0.5 - cx) / 22, v = (y + 0.5 - 42) / 20;
        if (y < 42 && u * u + v * v > 1) return 0;
        return mixPacked(col('#3a1a10'), col('#0e0606'), clampI((BACK - y) / 30, 0, 1));
      });
      // a bed of embers (the fire on it is animated: rendering/pen-anim.js)
      fill(cv, cx - 22, BACK - 5, cx + 22, BACK - 3, (x, y) => col(noise2(x * 0.6, y, seed) > 0.5 ? '#ff9a3a' : '#7a2410'));
      rect(cv, cx - 30, BACK - 3, cx + 30, BACK, P.sand[3]);
      rect(cv, cx - 30, BACK - 3, cx + 30, BACK - 2, P.sand[5]);
      for (let x = cx - 30; x < cx + 30; x += 9) cv.set(x, BACK - 1, P.sand[1]);
      cv.glow(cx, BACK - 10, 70, [1, 0.5, 0.2], 0.6);
      barrel(cv, 14, BACK, 12, 16); crate(cv, 22, BACK, 11);
      woodpile(cv, 98, BACK, 4, 3);
      lantern(cv, 186, 7, 18);
      railFence(cv, 122, 222, BACK, 15, P.oak, { gap: 24, rails: 2 });
      barrel(cv, 168, BACK - 3, 10, 13);
      ground(cv, BACK, 'cobble', seed + 2);
      return { rack: { x: 40, y: GROUND_Y0 + 1 }, nest: [196, BACK - 3, 216, BACK], anim: [{ type: 'fire', cx, base: BACK - 5, w: 17, h: 12 }, { type: 'lantern', x: 186, y: 18 }] };
    },
  },
  deer: {
    title: 'The paddock',
    fringe: 'grass',
    compose({ cv, seed, block }) {
      sky(cv, 50, rgb('#3e66b4'), rgb('#9cc0e4'));
      clouds(cv, 5, 14, seed + 9, 3);
      hills(cv, 28, 6, '#5a74a8', '#7088b8', seed);
      grove(cv, 42, haze(P.leaf, '#7a98c4', 0.5), seed + 1, { h: [8, 14], bottom: 48, pines: 0.6 });
      grove(cv, 50, P.leaf, seed + 2, { h: [9, 16], bottom: 58, gap: [6, 10] });
      ground(cv, 54, 'grass', seed + 3);
      railFence(cv, 0, cv.W, BACK - 4, 20, P.wood, { gap: 34 });
      shelter(cv, 150, 210, BACK - 2, 34, seed + 4);
      trough(cv, 86, 122, GROUND_Y0 + 4, 7);
      block(84, GROUND_Y0 - 3, 124, GROUND_Y0 + 5);
      flowers(cv, 8, 70, GROUND_Y0 + 2, ['#ffffff', '#f4e4a0', '#f0a0c0'], seed + 5, 9);
      flowers(cv, 126, 146, GROUND_Y0 + 1, ['#ffffff', '#f4e4a0'], seed + 6, 3);
      return { rack: { x: 40, y: GROUND_Y0 + 2 }, nest: [168, BACK - 6, 196, BACK - 2], anim: [{ type: 'butterflies', n: 2, x0: 10, x1: 140, y0: 50, y1: 68, colors: ['#ffffff', '#f6d26a'] }, { type: 'shimmer', n: 2, x0: 89, x1: 119, y0: GROUND_Y0 - 3, y1: GROUND_Y0 - 2 }] };
    },
  },
  badger: {
    title: 'The sett',
    compose({ cv, seed }) {
      sky(cv, 24, rgb('#2e4a84'), rgb('#6a8cc0'));
      grove(cv, 16, P.leaf, seed, { h: [8, 16], bottom: 22 });
      earthbank(cv, 0, 18, cv.W, BACK + 2, P.earth, seed + 1);
      roots(cv, 0, cv.W, 20, seed + 7, 0.07);
      for (const [x, y, w] of [[18, 52, 9], [104, 36, 7], [124, 58, 6], [204, 46, 8], [100, 60, 5]]) stone(cv, x, y, w, seed + x);
      overgrowth(cv, 0, cv.W, 17, P.moss, seed + 2, { rate: 0.22, len: [3, 18] });
      flowers(cv, 0, cv.W, 17, ['#f0a0c0', '#ffffff', '#e86a8a'], seed + 8, 12);
      burrow(cv, 62, BACK, 36, 27, seed + 3);
      burrow(cv, 164, BACK, 32, 24, seed + 4);
      mushroom(cv, 86, BACK, 5); mushroom(cv, 91, BACK, 4); mushroom(cv, 142, BACK, 4, '#c8a050');
      ground(cv, BACK, 'dirt', seed + 5);
      tufts(cv, 0, cv.W, BACK + 1, seed + 6, 0.22);
      return { rack: { x: 40, y: GROUND_Y0 + 1 }, nest: [54, BACK - 3, 72, BACK], anim: [{ type: 'butterflies', n: 2, x0: 10, x1: 214, y0: 4, y1: 16, colors: ['#f0a0c0', '#ffffff'] }] };
    },
  },
  dove: {
    title: 'The dovecote',
    compose({ cv, seed }) {
      plaster(cv, 0, 0, cv.W, BACK, P.lime, seed + 1, { flakes: 2, under: 'brick' });
      // worn through to the bricks toward the sides
      for (let y = 0; y < BACK; y++) for (let x = 0; x < cv.W; x++) {
        const edge = Math.min(x, cv.W - 1 - x) / 40;
        if (patch(x, y, seed, 0.07) - edge * 0.5 > 0.42) cv.pix.px[y * cv.W + x] = 0;
      }
      const under = new Canvas(seed, cv.W, BACK);
      bricks(under, 0, 0, cv.W, BACK, P.brick, seed + 2, { h: 4, w: 9, mortar: P.lime[1] });
      for (let k = 0; k < cv.W * BACK; k++) if (!(cv.pix.px[k] >>> 24)) cv.paint(k, under.pix.px[k]);
      tiles(cv, 10, seed + 3);
      overgrowth(cv, 0, 40, 12, P.moss, seed + 4, { rate: 0.4, len: [6, 20] });
      overgrowth(cv, 190, cv.W, 12, P.moss, seed + 5, { rate: 0.4, len: [6, 18] });
      pigeonholes(cv, 34, 196, 18, 2, seed + 6);
      table(cv, 18, 52, BACK - 10, BACK, P.pine); bottle(cv, 28, BACK - 10, '#8a5a2c', 'jar');
      planter(cv, 4, 16, BACK, 6, seed + 9);
      hay(cv, 150, BACK, 28, 8, seed + 7);
      crate(cv, 176, BACK, 13);
      ground(cv, BACK, 'flags', seed + 8, { joint: '#3a3638' });
      flowers(cv, 196, 220, BACK, ['#b070d0', '#d0a0f0', '#8a50b0'], seed + 10, 9);
      return { rack: { x: 58, y: GROUND_Y0 + 1 }, nest: [140, BACK - 3, 160, BACK], anim: [{ type: 'butterflies', n: 1, x0: 180, x1: 220, y0: 46, y1: 62, colors: ['#d0a0f0'] }] };
    },
  },
  fox: {
    title: 'The fox run',
    compose({ cv, seed, block }) {
      sky(cv, 34, rgb('#4a3a74'), rgb('#f2a070'));
      clouds(cv, 4, 12, seed + 9, 3, { lit: '#ffc8a0', mid: '#d88a8a', dark: '#8a5a80' });
      grove(cv, 27, haze(P.leaf, '#3a2a48', 0.72), seed, { h: [10, 18], bottom: 36 });
      boardFence(cv, 0, cv.W, 30, BACK, P.oak, seed + 1);
      shelter(cv, 142, 204, BACK, 36, seed + 2);
      pitchfork(cv, 148, BACK, 26);
      ground(cv, BACK, 'dirt', seed + 3, { straw: true });
      barrel(cv, 12, BACK + 1, 12, 15); crate(cv, 20, BACK + 1, 10);
      trough(cv, 90, 120, GROUND_Y0 + 3, 6);
      block(88, GROUND_Y0 - 3, 122, GROUND_Y0 + 4);
      hay(cv, 40, GROUND_Y0 + 2, 18, 3, seed + 4);
      return { rack: { x: 50, y: GROUND_Y0 + 1 }, nest: [160, BACK - 4, 188, BACK], anim: [{ type: 'fireflies', n: 9, x0: 4, x1: 220, y0: 20, y1: 64 }] };
    },
  },
  ermine: {
    title: 'The snow run',
    fringe: 'snow',
    compose({ cv, seed, block }) {
      sky(cv, 34, rgb('#2e3e6a'), rgb('#8a9ec0'));
      grove(cv, 27, haze(P.leaf, '#4a5a78', 0.5), seed, { h: [11, 19], bottom: 34, pines: 0.9, snow: '#e4ecf6' });
      rocks(cv, 0, 30, cv.W, BACK, P.stone, seed + 1, { h: 9 });
      snowcap(cv, 0, cv.W, 29, seed + 2);
      ground(cv, BACK - 2, 'snow', seed + 3);
      doghouse(cv, 160, BACK + 2, 30, 18, { snow: true });
      crate(cv, 30, BACK + 1, 13);
      hay(cv, 36, BACK - 3, 9, 3, seed + 7);
      snowcap(cv, 30, 43, BACK - 12, seed + 4);
      // a log bench under its snow, inked so it stands out of the drifts
      thing((/** @type {Canvas} */ c) => { wood(c, 104, BACK - 4, 132, BACK + 1, P.cask, { seed: 5 }); snowcap(c, 104, 132, BACK - 5, seed + 5); })(cv);
      block(102, GROUND_Y0 - 3, 134, GROUND_Y0 - 1);
      flakes(cv, 28, seed + 6, 14);
      return { rack: { x: 52, y: GROUND_Y0 + 1 }, nest: [152, BACK - 3, 168, BACK + 1], anim: [{ type: 'snow', n: 60, y1: 92 }] };
    },
  },
  snail: {
    title: 'The snail garden',
    compose({ cv, seed }) {
      sky(cv, 26, rgb('#3e6cb8'), rgb('#9cc4e4'));
      clouds(cv, 3, 7, seed + 9, 3);
      grove(cv, 22, P.leaf, seed + 1, { h: [10, 18], bottom: 28 });
      foliage(cv, 18, 46, seed);
      // the beds: furrowed soil, a row of carrots, cabbages, a trellis of tomatoes
      fill(cv, 0, 44, cv.W, BACK + 1, (x, y) => P.earth[(y - 44) % 6 === 0 ? 1 : patch(x, y, seed + 5, 0.1) > 0.55 ? 3 : 2]);
      trellis(cv, 152, 204, 24, BACK - 2, seed + 6);
      carrots(cv, 28, 98, 56, seed + 7);
      for (let x = 104; x < 146; x += 14) cabbage(cv, x, 58, 5);
      for (let x = 34; x < 140; x += 18) cabbage(cv, x, BACK - 1, 4);
      crate(cv, 4, 58, 14);
      wateringCan(cv, 8, 44);
      railFence(cv, 0, cv.W, BACK + 1, 14, P.wood, { gap: 36, rails: 2 });
      ground(cv, BACK + 1, 'dirt', seed + 3);
      tufts(cv, 0, cv.W, BACK + 2, seed + 4, 0.3);
      return { rack: { x: 40, y: GROUND_Y0 + 1 }, nest: [160, BACK - 2, 186, BACK], anim: [{ type: 'butterflies', n: 3, x0: 20, x1: 200, y0: 30, y1: 60, colors: ['#ffffff', '#f6d26a', '#f0a0c0'] }] };
    },
  },
  rat: {
    title: 'The cellar',
    compose({ cv, seed }) {
      bricks(cv, 0, 0, cv.W, BACK, P.brick.map((c) => mixPacked(c, 0xff000000, 0.2)), seed, { h: 4, w: 10 });
      for (const cx of [62, 166]) arch(cv, cx, BACK, 36, 18, seed + cx);
      // in the vaults: crates, hay, a low fence
      railFence(cv, 36, 92, BACK, 11, P.oak, { gap: 18, rails: 2 });
      crate(cv, 30, BACK, 13); crate(cv, 84, BACK, 10); hay(cv, 62, BACK, 22, 6, seed + 1);
      railFence(cv, 140, 190, BACK, 11, P.oak, { gap: 16, rails: 2 });
      crate(cv, 190, BACK, 12); hay(cv, 160, BACK, 26, 6, seed + 2);
      lantern(cv, 114, 0, 14);
      overgrowth(cv, 98, 132, 0, P.moss, seed + 3, { rate: 0.3, len: [4, 12] });
      ground(cv, BACK, 'cobble', seed + 4);
      return { rack: { x: 44, y: GROUND_Y0 + 1 }, nest: [54, BACK - 3, 70, BACK], anim: [{ type: 'lantern', x: 114, y: 14 }, { type: 'motes', n: 8, x: 114, y: 28, r: 18 }, { type: 'drip', x: 104, y0: 10, y1: BACK + 2, every: 3.2 }, { type: 'drip', x: 126, y0: 8, y1: BACK + 2, every: 4.5 }] };
    },
  },
};

/** Kinds with a pen of their own. */
export const PEN_KINDS = Object.keys(PENS);

/** The title of a kind's enclosure. @param {string} kind */
export const penTitle = (kind) => (PENS[kind] || PENS.rabbit).title;

/** @type {Map<string, Pen>} */
const cache = new Map();

/**
 * A kind's enclosure (cached), or null for a kind that has none.
 * @param {string} kind @returns {Pen|null}
 */
export function penOf(kind) {
  const def = PENS[kind];
  if (!def) return null;
  let p = cache.get(kind);
  if (p) return p;
  const seed = hashString(`pen:${PENS_VERSION}:${kind}`);
  const cv = new Canvas(seed, PEN_W, PEN_H), fg = new Canvas(seed + 1, PEN_W, PEN_H);
  // the ground a foot may rest on, less what was set down on it
  const walk = new Uint8Array(PEN_W * PEN_H);
  for (let y = GROUND_Y0; y <= GROUND_Y1; y++) for (let x = 12; x < PEN_W - 12; x++) walk[y * PEN_W + x] = 1;
  const block = (x0, y0, x1, y1) => { for (let y = Math.max(0, y0); y < Math.min(PEN_H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(PEN_W, x1); x++) walk[y * PEN_W + x] = 0; };
  MARK = { thing: new Uint8Array(PEN_W * PEN_H), ground: new Uint8Array(PEN_W * PEN_H) };
  let out;
  try {
    out = def.compose({ cv, fg, seed, block });
    recede(cv);
    inkThings(cv);
  } finally { MARK = null; }
  finish(cv, 0.18);
  fringe(fg, def.fringe || '', seed + 9);
  // the wilds' grade, so a pen looks like the same world as the wilds: deeper shadows, brighter lights, richer colour
  grade(cv, 'pen');
  grade(fg, 'pen');
  /** @type {number[][][]} */
  const ground = [];
  for (let y = GROUND_Y0; y <= GROUND_Y1; y++) {
    const runs = [];
    let start = -1;
    for (let x = 0; x <= PEN_W; x++) {
      const on = x < PEN_W && walk[y * PEN_W + x];
      if (on && start < 0) start = x;
      if (!on && start >= 0) { runs.push([start, x]); start = -1; }
    }
    ground.push(runs);
  }
  p = {
    kind, title: def.title, back: cv.pix, front: fg.pix, y0: GROUND_Y0, ground,
    rack: out.rack, nest: out.nest, anim: out.anim || [],
    cloth: [160, 80, 46, 11],
    slots: [[170, 86], [190, 87], [180, 89]],
  };
  cache.set(kind, p);
  return p;
}
