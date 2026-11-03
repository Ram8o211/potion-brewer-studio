// Scenery models for the wild environments: trees of several growth habits,
// shrubs, boulders, reeds, ferns, logs, giant mushrooms, clouds and the
// quarry's timberwork.
// Each is a geometry Model (visual/geometry.js) standing on its foot at
// (0, 0), built from a random stream and painted in the region's ramps by
// Canvas.stamp — the same rasterizer and shading as the species.

import { Model, blade, PROFILES, bezier, lumpy, ellipse, polygon } from '../geometry.js';
import { cluster, strand, grove, swayGroup } from './foliage.js';

/** @param {any} rng */
const R = (rng) => () => rng.next();

/**
 * A block of leaves: a rectangle with its corners cut in a step, its sides
 * nudged in and out a little (the crown is built of these, not of discs).
 * @param {number} x @param {number} y @param {number} hw @param {number} hh @param {() => number} rnd
 */
export function leafBlock(x, y, hw, hh, rnd) {
  const c = Math.max(1, Math.round(Math.min(hw, hh) * 0.4)), j = () => Math.round((rnd() - 0.5) * 2);
  const x0 = Math.round(x - hw) + j(), x1 = Math.round(x + hw) + j(), y0 = Math.round(y - hh) + j(), y1 = Math.round(y + hh) + j();
  return /** @type {import('../geometry.js').Pt[]} */ ([
    [x0 + c, y0], [x1 - c, y0], [x1 - c, y0 + c], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1 - c], [x1 - c, y1],
    [x0 + c, y1], [x0 + c, y1 - c], [x0, y1 - c], [x0, y0 + c], [x0 + c, y0 + c],
  ]);
}

/**
 * A crown of foliage: leaf clusters laid on a staggered grid inside the
 * crown's outline over a darker mass, the lower ones first so each higher
 * one overlaps the one below it (foliage.js cluster).
 */
export function crown(m, rng, cx, cy, rx, ry, mat = 'leaf', o = {}) {
  const rnd = R(rng), r = o.r ?? Math.max(2.5, Math.min(rx * 0.5, ry * 0.62, 9)), mats = [mat, ...(o.mats || []).filter((q) => q !== mat)];
  m.poly(lumpy(cx, cy + r * 0.2, rx * 0.92, ry * 0.88, rnd, 0.06, 7), mat, { shade: 'flat', tex: 0.3, tone: -0.24, sa: (o.amp ?? 1) * 0.85, sg: swayGroup() });
  const sx = r * 1.5, sy = r * 1.15, clumps = [];
  for (let row = -Math.ceil(ry / sy); row <= Math.ceil(ry / sy); row++) for (let col = -Math.ceil(rx / sx) - 1; col <= Math.ceil(rx / sx) + 1; col++) {
    const x = cx + col * sx + ((row & 1) ? sx / 2 : 0) + (rng.next() - 0.5) * r * 0.25, y = cy + row * sy + (rng.next() - 0.5) * r * 0.2;
    if (((x - cx) / (rx - r * 0.4)) ** 2 + ((y - cy) / (ry - r * 0.3)) ** 2 > 1) continue;
    clumps.push([x, y]);
  }
  clumps.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (const [x, y] of clumps) cluster(m, rng, x, y, r * 1.05, r * 0.9, { mats, bloom: o.bloom, amp: (o.amp ?? 1) * (0.9 + Math.max(0, (cy - y) / ry) * 0.2), tone: ((cx - x) / rx) * 0.04 });
  return m;
}

/**
 * A foliage pad: a cloud of leaves wider than tall, flat underneath — leaf
 * clusters heaped along its top over a dark mass, and strands of moss (or
 * leaves) hanging from its underside.
 */
export function pad(m, rng, x, y, rx, ry, mat = 'leaf', o = {}) {
  const mats = [mat, ...(o.mats || []).filter((q) => q !== mat)], amp = o.amp ?? 1;
  cluster(m, rng, x, y + ry * 0.12, rx, ry * 0.8, { mats, amp: amp * 0.9, flat: true, dense: 0.8 });
  const n = Math.max(2, Math.round(rx / (ry * 0.9)));
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1) - 0.5, bx = x + u * rx * 1.25, by = y - ry * (0.15 + (0.5 - Math.abs(u)) * 0.4), r = ry * (0.75 + rng.next() * 0.25);
    cluster(m, rng, bx, by, r * 1.15, r * 0.85, { mats, amp, bloom: o.bloom, tone: -u * 0.06 });
  }
  // strands dripping from the underside
  const drips = o.drips ?? Math.round(rx / 4);
  for (let i = 0; i < drips; i++) {
    const dx = x + (rng.next() - 0.5) * rx * 1.4, L = 2 + rng.next() * ry * 1.6;
    strand(m, rng, dx, y + ry * 0.55, L, { mat: o.drip || mat, amp, tone: o.drip ? 0 : 0.1, leaves: o.drip ? 3 : 2.2 });
  }
  return m;
}

/**
 * A tree after the branch concept: a sinuous trunk, branches forking off it
 * (alternating sides, rising, tapering), and a foliage pad at the tip of
 * every branch and at the top of the trunk. shape: 'tall' (a column of
 * short branches and small pads), 'spread' (a short trunk with long
 * reaching branches), 'lean' (an S-curved trunk leaning off its foot).
 * @param {any} rng @param {number} h height @param {number} tw trunk width
 * @param {{shape?:string, dir?:number, bark?:string, leaf?:string, drip?:string, mats?:string[], bloom?:{mat:string, rate:number}}} [o]
 */
export function branchTree(rng, h, tw, o = {}) {
  const m = new Model(), bark = o.bark || 'bark', leaf = o.leaf || 'leaf';
  const shape = o.shape || ['tall', 'spread', 'lean'][Math.floor(rng.next() * 3)], dir = o.dir ?? (rng.next() < 0.5 ? -1 : 1);
  const th = shape === 'spread' ? h * 0.62 : shape === 'tall' ? h * 0.86 : h * 0.8;
  const w1 = shape === 'lean' ? h * 0.14 : h * 0.05, w2 = shape === 'lean' ? -h * 0.04 : -h * 0.05;
  const lean = shape === 'lean' ? h * 0.16 : (rng.next() - 0.5) * h * 0.1;
  const spine = bezier([0, 0], [dir * w1, -th * 0.35], [dir * w2, -th * 0.7], [dir * lean, -th], 14);
  const ws = spine.map((_, i) => Math.max(1.2, tw * (1 - (i / (spine.length - 1)) * 0.55) * (i === 0 ? 1.2 : 1)));
  for (const s of [-1, 1]) m.stroke([[s * tw * 0.2, -tw * 0.7], [s * tw * 0.9, -1], [s * tw * 1.6, 1]], [tw * 0.45, tw * 0.25, 1.2], bark, { tone: s > 0 ? -0.08 : 0 });
  m.stroke(spine, ws, bark, { tex: 0.7 });
  // a lit stripe up the trunk's left side, a shaded one down its right
  m.line(/** @type {any} */ (spine.slice(1, -2).map((q, i) => [q[0] - ws[i + 1] * 0.25, q[1]])), bark, { lum: 0.78 });
  /** @type {[number, number, number, number][]} pads: x, y, rx, ry */
  const pads = [];
  const nb = shape === 'tall' ? 3 + Math.round(rng.next()) : shape === 'spread' ? 2 + Math.round(rng.next()) : 2 + Math.round(rng.next() * 2);
  for (let b = 0; b < nb; b++) {
    const t = shape === 'tall' ? 0.3 + (b / Math.max(1, nb - 1)) * 0.55 : shape === 'spread' ? 0.55 + (b / Math.max(1, nb - 1)) * 0.35 : 0.45 + (b / Math.max(1, nb - 1)) * 0.4;
    const i = Math.min(spine.length - 2, Math.round(t * (spine.length - 1))), [sx, sy] = spine[i], side = (b % 2 ? 1 : -1) * dir;
    const L = h * (shape === 'spread' ? 0.28 + rng.next() * 0.12 : shape === 'tall' ? 0.16 + rng.next() * 0.08 : 0.2 + rng.next() * 0.12);
    const a = (0.25 + rng.next() * 0.45), ex = sx + side * L * Math.cos(a), ey = sy - L * Math.sin(a);
    const pts = /** @type {[number, number][]} */ ([[sx, sy], [sx + side * L * 0.45, sy - L * 0.05 - (rng.next() - 0.3) * L * 0.25], [ex, ey]]);
    m.stroke(pts, [ws[i] * 0.6, Math.max(1, ws[i] * 0.28)], bark, { tex: 0.5 });
    const pr = h * (shape === 'tall' ? 0.14 + rng.next() * 0.04 : 0.16 + rng.next() * 0.05);
    pads.push([ex, ey - pr * 0.25, pr, pr * 0.62]);
    // a long branch forks once, rising
    if (L > h * 0.24) {
      const fx = sx + side * L * 0.55, fy = sy - L * 0.3, gx = fx + side * L * 0.25, gy = fy - L * 0.45;
      m.stroke([[fx, fy], [gx, gy]], [Math.max(1, ws[i] * 0.35), 1], bark, {});
      pads.push([gx, gy - pr * 0.25, pr * 0.8, pr * 0.52]);
    }
  }
  const top = spine[spine.length - 1], tr = h * (shape === 'tall' ? 0.17 : 0.2 + rng.next() * 0.05);
  pads.push([top[0], top[1] - tr * 0.3, tr, tr * 0.62]);
  pads.sort((p, q) => q[1] - p[1]);
  for (const [x, y, rx, ry] of pads) pad(m, rng, x, y, rx, ry, leaf, { drip: o.drip, mats: o.mats, bloom: o.bloom, amp: 0.7 + Math.min(1, -y / h) * 0.5 });
  return m;
}

/** The gnarled trees (foliage.js grove) by kind, and their crown's style. */
const GROVES = { gnarl: 'dome', tiers: 'tiers', willow: 'weep', wisteria: 'wisteria', sparse: 'sparse' };

/**
 * A tree. kind: oak (pads on branches), gnarl (a twisted trunk under a
 * dome of leaf clusters), tiers (flat layered clusters), willow (weeping
 * fronds), wisteria (hung with blossom), sparse (a few dusty clusters),
 * pine (tiers), birch (pale, slender), dead (bare branches). Height h,
 * trunk width tw; o.look: the region's leaves (mats, bloom, hang).
 */
export function tree(rng, kind, h, tw, o = {}) {
  const look = o.look || {};
  if (kind === 'oak' || kind === 'birch') return branchTree(rng, h, tw, { ...o, ...look, drip: look.hang?.mat, shape: o.shape || (kind === 'birch' ? 'tall' : undefined) });
  if (GROVES[kind]) return grove(rng, h, tw, { ...o, ...look, hang: kind === 'willow' || kind === 'wisteria' ? undefined : look.hang, style: GROVES[kind] });
  const m = new Model(), lean = (o.lean ?? (rng.next() - 0.5) * 0.15) * h;
  const trunkTop = kind === 'pine' ? h * 0.95 : kind === 'dead' ? h * 0.75 : h * 0.55;
  const spine = bezier([0, 0], [0, -trunkTop * 0.4], [lean * 0.6, -trunkTop * 0.75], [lean, -trunkTop], 12);
  const ws = spine.map((_, i) => tw * (1 - (i / spine.length) * (kind === 'pine' ? 0.8 : 0.45)) * (i === 0 ? 1.25 : 1));
  // root flares
  for (const s of [-1, 1]) m.stroke([[s * tw * 0.2, -tw * 0.6], [s * tw * 0.9, -1], [s * tw * 1.5, 1]], [tw * 0.45, tw * 0.25, 1.2], o.bark || 'bark', { tone: s > 0 ? -0.08 : 0 });
  m.stroke(spine, ws, o.bark || 'bark', { tex: 0.5 });
  // bark fissures
  for (let k = 0; k < Math.max(1, Math.round(tw / 3)); k++) {
    const f = (k + 0.5) / Math.max(1, Math.round(tw / 3)) - 0.5, pts = [];
    for (let i = 1; i < spine.length - 1; i += 1) pts.push([spine[i][0] + f * ws[i] * 0.7 + (rng.next() - 0.5) * 0.8, spine[i][1]]);
    m.line(/** @type {any} */ (pts), o.bark || 'bark', { lum: 0.12 });
  }
  const top = spine[spine.length - 1];
  if (kind === 'dead') {
    branch(m, rng, top[0], top[1], -Math.PI / 2, h * 0.3, tw * 0.6, 3, o.bark || 'bark');
    branch(m, rng, spine[6][0], spine[6][1], -Math.PI / 2 - 0.9, h * 0.25, tw * 0.45, 2, o.bark || 'bark');
    branch(m, rng, spine[8][0], spine[8][1], -Math.PI / 2 + 0.8, h * 0.22, tw * 0.4, 2, o.bark || 'bark');
    return m;
  }
  if (kind === 'pine') {
    const tiers = Math.max(4, Math.round(h / 9));
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1), y = -h * 0.28 - t * h * 0.7, w = h * 0.3 * (1 - t * 0.85) + 2;
      const pts = [[lean * (0.3 + t * 0.7) - w, y + h * 0.06], [lean * (0.3 + t * 0.7), y - h * 0.12], [lean * (0.3 + t * 0.7) + w, y + h * 0.06]];
      // a jagged lower edge
      for (let k = 5; k >= 1; k--) pts.push([lean * (0.3 + t * 0.7) - w + (k / 6) * w * 2, y + h * 0.06 - (k % 2) * h * 0.025]);
      m.poly(/** @type {any} */ (pts), o.leaf || 'leaf', { shade: 'fold', tex: 1.4, tone: -0.04 + t * 0.06, sa: 0.3 + t * 0.6, sg: swayGroup() });
    }
    return m;
  }
  // limbs reaching into the crown
  const cw = kind === 'birch' ? h * 0.24 : h * 0.36;
  for (const s of [-1, 1]) m.stroke([[top[0], top[1] + 3], [top[0] + s * cw * 0.35, top[1] - h * 0.08], [top[0] + s * cw * 0.6, top[1] - h * 0.18]], [tw * 0.5, tw * 0.25], o.bark || 'bark', {});
  const cy = top[1] - h * 0.2;
  crown(m, rng, top[0], cy, cw, h * (kind === 'birch' ? 0.3 : 0.28), o.leaf || 'leaf', look);
  if (kind === 'birch') for (let i = 2; i < spine.length - 1; i += 2) m.line([[spine[i][0] - ws[i] * 0.4, spine[i][1]], [spine[i][0] + ws[i] * 0.1, spine[i][1]]], o.bark || 'bark', { lum: 0.08 });
  return m;
}

/** A forking bare branch. */
export function branch(m, rng, x, y, ang, len, w, depth, mat) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  m.stroke([[x, y], [(x + ex) / 2 + (rng.next() - 0.5) * len * 0.2, (y + ey) / 2], [ex, ey]], [w, w * 0.6], mat, { noOutline: w < 2.5 });
  if (depth > 0) for (const s of [-1, 1]) branch(m, rng, ex, ey, ang + s * (0.35 + rng.next() * 0.35), len * (0.55 + rng.next() * 0.2), Math.max(1, w * 0.6), depth - 1, mat);
  return m;
}

/** A shrub: a mound of foliage, optionally hung with berries or flowers. */
export function bush(rng, rx, ry, o = {}) {
  const m = new Model();
  crown(m, rng, 0, -ry * 0.7, rx, ry, o.leaf || 'leaf', { amp: 0.4, mats: o.mats });
  if (o.dots) for (let i = 0; i < rx * 0.8; i++) {
    const a = Math.PI + rng.next() * Math.PI, q = Math.sqrt(rng.next()) * 0.8;
    m.dot(Math.cos(a) * rx * q, -ry * 0.7 + Math.sin(a) * ry * q * 0.8, o.dots, { lum: rng.next() < 0.5 ? 0.85 : 0.55 });
  }
  return m;
}

/** A boulder, optionally mossed on top. */
export function boulder(rng, rx, ry, o = {}) {
  const m = new Model();
  m.poly(lumpy(0, -ry * 0.8, rx, ry, R(rng), 0.2, 6), o.rock || 'rock', { shade: 'round', tex: 1.4 });
  for (let i = 0; i < Math.max(1, rx / 5); i++) {
    const x = (rng.next() - 0.5) * rx * 1.2, y = -ry * (0.4 + rng.next() * 0.6);
    m.line([[x, y], [x + (rng.next() - 0.5) * 3, y + ry * 0.3], [x + (rng.next() - 0.5) * 3, y + ry * 0.55]], o.rock || 'rock', { lum: 0.1 });
  }
  if (o.moss) for (let i = 0; i < rx * 1.5; i++) {
    const x = (rng.next() - 0.5) * rx * 1.4, y = -ry * 1.6 + rng.next() * ry * 0.7;
    m.dot(x, y, o.moss, { lum: 0.4 + rng.next() * 0.5 });
  }
  return m;
}

/** A clump of reeds or grass blades, some with cattail heads. */
export function reeds(rng, h, n, o = {}) {
  const m = new Model();
  for (let i = 0; i < n; i++) {
    const x = (i / Math.max(1, n - 1) - 0.5) * n * 1.3 + (rng.next() - 0.5);
    const L = h * (0.55 + rng.next() * 0.45), a = -Math.PI / 2 + (x / (n * 1.3)) * 0.8 + (rng.next() - 0.5) * 0.2;
    m.poly(blade([x, 0], a, L, Math.max(0.8, L * 0.05), PROFILES.linear, { curl: (rng.next() - 0.5) * 0.5 }), o.leaf || 'reed', { shade: 'fold', tone: i % 2 ? -0.06 : 0.04 });
    if (o.heads && rng.next() < o.heads) {
      const tx = x + Math.cos(a) * L * 0.92, ty = Math.sin(a) * L * 0.92;
      m.ellipse(tx, ty + 2, 1.3, 3, o.head || 'cattail', { shade: 'round' });
    }
  }
  return m;
}

/** A fern: arching fronds of paired leaflets. */
export function fern(rng, size, o = {}) {
  const m = new Model(), n = 5 + Math.round(rng.next() * 2);
  for (let f = 0; f < n; f++) {
    const a = -Math.PI / 2 + (f / (n - 1) - 0.5) * 2.6;
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8, bend = t * t * 0.9 * Math.sign(a + Math.PI / 2 || 1); pts.push([Math.cos(a + bend) * size * t, Math.sin(a + bend) * size * t * 0.85]); }
    m.stroke(/** @type {any} */ (pts), [1.4, 0.8], o.leaf || 'leaf', { noOutline: true, tone: -0.1 });
    for (let i = 2; i < 8; i++) {
      const q = /** @type {[number, number]} */ (pts[i]), s = 1.8 * (1 - i / 10);
      m.poly(blade(q, a - 1.2, size * 0.18 * (1 - i / 10) + 1, s, PROFILES.lance), o.leaf || 'leaf', { shade: 'fold', tone: 0.04 });
      m.poly(blade(q, a + 1.2, size * 0.18 * (1 - i / 10) + 1, s, PROFILES.lance), o.leaf || 'leaf', { shade: 'fold', tone: -0.04 });
    }
  }
  return m;
}

/** A tuft of grass. */
export function tuft(rng, h, o = {}) {
  const m = new Model();
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i - 1.5) * 0.35 + (rng.next() - 0.5) * 0.2;
    m.line([[i - 1.5, 0], [i - 1.5 + Math.cos(a) * h, Math.sin(a) * h * (0.7 + rng.next() * 0.3)]], o.leaf || 'leaf', { clip: false, lum: i % 2 ? 0.88 : 0.18 });
  }
  return m;
}

/**
 * A fallen log lying across the ground: a round trunk lit along its top,
 * tapering a little from its root end (a flare of root stubs) to the cut
 * end, which shows its pale face with rings; bark furrows broken into
 * short dashes along it, a snapped branch stub on its back and patches of
 * moss lying on top.
 */
export function log(rng, len, r, o = {}) {
  const m = new Model(), bark = o.bark || 'bark', wood = o.wood || 'wood', rnd = R(rng);
  const x0 = -len / 2 + r * 0.6, x1 = len / 2 - r * 0.6, sag = (rng.next() - 0.5) * 1.2;
  const hw = (/** @type {number} */ t) => r * (1.05 - 0.18 * t);
  /** @type {import('../geometry.js').Pt[]} */
  const pts = [];
  const ws = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([x0 + t * (x1 - x0), -hw(t) + Math.sin(t * Math.PI) * sag]);
    ws.push(hw(t) * 2);
  }
  const at = (/** @type {number} */ t) => { const f = t * 8, i = Math.min(7, Math.floor(f)), u = f - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]; };
  // root stubs splaying from the thick end, behind the trunk
  for (const [dy, a, l] of [[0.55, 2.7, 1.1], [0.1, 3.0, 1.3], [-0.45, 3.4, 0.9]]) {
    const bx = x0 + r * 0.2, by = pts[0][1] + dy * r, ex = bx + Math.cos(a) * r * l, ey = Math.min(-0.5, by - Math.sin(a) * r * l * 0.4);
    m.stroke([[bx, by], [ex, ey]], [r * 0.75, r * 0.3], bark, { tex: 1, tone: -0.06 });
  }
  m.stroke(pts, ws, bark, { tex: 1.2 });
  // a snapped branch on its back, leaning toward the cut end
  const bt = 0.45 + rng.next() * 0.2, [bxp, byp] = at(bt), bl = r * (0.9 + rng.next() * 0.4);
  const tip = /** @type {import('../geometry.js').Pt} */ ([bxp + bl * 0.6, byp - hw(bt) - bl * 0.75]);
  m.stroke([[bxp - r * 0.1, byp - hw(bt) * 0.4], tip], [r * 0.8, r * 0.5], bark, { tex: 1 });
  m.ellipse(tip[0], tip[1], r * 0.28, r * 0.2, wood, { shade: 'flat', tone: 0.05 });
  // bark furrows: short dark dashes running along the trunk, staggered row to row
  for (const [v, lum] of [[-0.35, 0.42], [0.15, 0.34], [0.55, 0.28]]) {
    let t = rng.next() * 0.08;
    while (t < 0.94) {
      const l = (0.06 + rng.next() * 0.1), t2 = Math.min(0.96, t + l);
      const [ax, ay] = at(t), [bx2, by2] = at(t2);
      m.line([[ax, ay + v * hw(t)], [bx2, by2 + v * hw(t2) + (rnd() < 0.3 ? 1 : 0)]], bark, { lum });
      t = t2 + 0.03 + rng.next() * 0.08;
    }
  }
  // a lit edge along the top of the bark
  for (let t = 0.05; t < 0.9; t += 0.1 + rng.next() * 0.1) {
    const [ax, ay] = at(t), [bx2, by2] = at(Math.min(0.95, t + 0.05 + rng.next() * 0.06));
    m.line([[ax, ay - hw(t) * 0.72], [bx2, by2 - hw(t) * 0.72]], bark, { lum: 0.86 });
  }
  // the cut end: a ring of bark round the pale face, its rings and a crack
  const ex = x1 + hw(1) * 0.35, ey = pts[8][1], fr = hw(1);
  m.ellipse(ex, ey, fr * 0.62, fr * 1.0, bark, { shade: 'flat', tone: -0.12, soft: true });
  m.ellipse(ex + 0.3, ey, fr * 0.5, fr * 0.84, wood, { shade: 'flat', tone: 0.08, noOutline: true });
  m.ellipse(ex + 0.3, ey, fr * 0.3, fr * 0.5, wood, { shade: 'flat', tone: -0.1, noOutline: true });
  m.ellipse(ex + 0.3, ey, fr * 0.14, fr * 0.22, wood, { shade: 'flat', tone: 0.04, noOutline: true });
  m.line([[ex + 0.3, ey], [ex + fr * 0.3, ey - fr * 0.6]], wood, { lum: 0.15 });
  // moss lying on top in a patch or two, a few threads hanging down its side
  if (o.moss) {
    for (let k = 0, n = 1 + Math.round(rng.next()); k < n; k++) {
      const t = 0.12 + (k / n) * 0.6 + rng.next() * 0.15, [mx, my] = at(t), mw = len * (0.1 + rng.next() * 0.08), top = my - hw(t);
      m.poly(lumpy(mx, top + 0.8, mw, 1.6, rnd, 0.25, 6), o.moss, { shade: 'round', tex: 0.6, tone: 0.08 });
      for (let i = 0; i < mw * 0.8; i++) {
        const dx = (rnd() - 0.5) * mw * 1.6, dl = 1 + Math.floor(rnd() * hw(t) * 0.7);
        m.line([[mx + dx, top + 1], [mx + dx, top + 1 + dl]], o.moss, { lum: 0.3 + rnd() * 0.3 });
      }
    }
  }
  return m;
}

/** A cut stump with growth rings. */
export function stump(rng, w, h, o = {}) {
  const m = new Model();
  m.poly([[-w / 2 - 2, 0], [-w / 2, -h], [w / 2, -h], [w / 2 + 2, 0]], o.bark || 'bark', { shade: 'round', tex: 1.5 });
  m.ellipse(0, -h, w / 2, Math.max(1.5, w * 0.18), o.wood || 'wood', { shade: 'flat' });
  m.ellipse(0, -h, w / 4, Math.max(0.8, w * 0.09), o.wood || 'wood', { shade: 'flat', tone: -0.2 });
  return m;
}

/**
 * A giant mushroom of the deep: a pale stalk curving up from a flared foot,
 * a broad domed cap lit along its top with the gills in shade beneath it,
 * and a few pale spots on the dome.
 */
export function mushroom(rng, h, r, o = {}) {
  const m = new Model(), stem = o.stem || 'stem', cap = o.cap || 'cap', lean = (rng.next() - 0.5) * h * 0.3;
  const spine = bezier([0, 0], [0, -h * 0.4], [lean * 0.5, -h * 0.8], [lean, -h], 10);
  for (const s of [-1, 1]) m.stroke([[s * r * 0.08, -3], [s * r * 0.3, 0]], [r * 0.2, 1.2], stem, { tone: s > 0 ? -0.1 : 0 });
  m.stroke(spine, spine.map((_, i) => Math.max(1.5, r * 0.3 * (1 - (i / spine.length) * 0.3))), stem, { tex: 0.6 });
  // the gills: a dark band under the cap
  m.poly(lumpy(lean, -h + r * 0.1, r * 0.92, r * 0.16, R(rng), 0.05, 6), cap, { shade: 'flat', tone: -0.35 });
  /** @type {[number, number][]} */
  const dome = [];
  for (let i = 0; i <= 14; i++) { const a = Math.PI + (i / 14) * Math.PI; dome.push([lean + Math.cos(a) * r, -h + Math.sin(a) * r * 0.6 * (1 + (rng.next() - 0.5) * 0.06)]); }
  m.poly(dome, cap, { shade: 'round', tex: 0.5 });
  for (let i = 0; i < Math.round(r / 3); i++) {
    const u = (rng.next() - 0.5) * 1.4, v = 0.25 + rng.next() * 0.5;
    m.ellipse(lean + u * r * 0.7, -h - v * r * 0.5, 1.3, 1, o.spot || stem, { shade: 'flat', tone: 0.2, noOutline: true });
  }
  return m;
}

/** A cloud: soft heaped puffs, lit on top. */
export function cloud(rng, w, h, mat = 'cloud') {
  const m = new Model(), n = Math.max(3, Math.round(w / 9));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * w * 0.8, r = h * (0.45 + Math.sin((i / (n - 1)) * Math.PI) * 0.45) * (0.8 + rng.next() * 0.3);
    m.poly(lumpy(x, -r * 0.8, r * 1.2, r, R(rng), 0.12, 6), mat, { shade: 'round', tex: 0.5, noOutline: true });
  }
  m.poly(ellipse(0, -h * 0.25, w * 0.5, h * 0.25), mat, { shade: 'round', tone: -0.1, noOutline: true });
  return m;
}

/** Beams: a straight timber from a to b. */
export function beam(m, a, b, w, mat = 'timber') {
  m.stroke([a, b], w, mat, { shade: 'cyl', tex: 1.2 });
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  if (w >= 2 && length > 6) {
    const nx = -dy / length, ny = dx / length, side = nx + ny > 0 ? -1 : 1;
    const at = (t, off) => /** @type {[number,number]} */ ([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
    m.line([at(0.06, side * w * 0.28), at(0.94, side * w * 0.28)], mat, { lum: 0.86 });
    // Grain runs along the beam; short dark cuts leave its bright bevel whole.
    for (let t = 0.15; t < 0.85; t += 0.26) m.line([at(t, -side * 0.2), at(Math.min(0.94, t + 0.14), -side * 0.2)], mat, { lum: 0.24 });
  }
  return m;
}

/** A timber crane with a jib, rope and a hanging stone. */
export function crane(rng, h) {
  const m = new Model();
  beam(m, [0, 0], [0, -h], 3);
  beam(m, [-4, 0], [0, -h * 0.4], 2);
  beam(m, [-h * 0.15, -h + 1], [h * 0.55, -h - 3], 2.5);
  beam(m, [0, -h * 0.75], [h * 0.3, -h - 1], 1.6);
  m.line([[h * 0.5, -h - 2], [h * 0.5, -h * 0.45]], 'rope', { clip: false, lum: 0.4 });
  m.poly(polygon(h * 0.5, -h * 0.4, 3.2, 5, 0.3, R(rng), 0.3, 0.8), 'rock', { shade: 'round' });
  return m;
}

/** A ladder leaning back at angle `lean`. */
export function ladder(h, lean = 0.12) {
  const m = new Model(), dx = h * lean;
  beam(m, [-3, 0], [-3 + dx, -h], 1.4);
  beam(m, [3, 0], [3 + dx, -h], 1.4);
  for (let y = 3; y < h; y += 4) m.stroke([[-3 + dx * (y / h), -y], [3 + dx * (y / h), -y]], 1, 'timber', { noOutline: true });
  return m;
}

/** A mine cart heaped with ore. */
export function cart(rng, w) {
  const m = new Model();
  m.poly([[-w / 2, -w * 0.55], [w / 2, -w * 0.55], [w / 2 - 2, -w * 0.18], [-w / 2 + 2, -w * 0.18]], 'timber', { shade: 'round' });
  for (let i = 1; i < 4; i++) m.line([[-w / 2 + (i * w) / 4, -w * 0.53], [-w / 2 + (i * w) / 4, -w * 0.2]], 'timber', { lum: 0.1 });
  m.poly(lumpy(0, -w * 0.58, w * 0.45, w * 0.16, R(rng), 0.4, 6), 'ore', { shade: 'round', tex: 2 });
  for (const s of [-1, 1]) { m.ellipse(s * w * 0.3, -w * 0.14, w * 0.13, w * 0.13, 'metal', {}); m.dot(s * w * 0.3, -w * 0.14, 'metal', { lum: 0.95 }); }
  return m;
}

/** A crate. */
export function crate(s) {
  const m = new Model();
  m.poly([[-s / 2, 0], [-s / 2, -s], [s / 2, -s], [s / 2, 0]], 'timber', { shade: 'round' });
  m.line([[-s / 2 + 1, -1], [s / 2 - 1, -s + 1]], 'timber', { lum: 0.15 });
  m.line([[-s / 2 + 1, -s / 2], [s / 2 - 1, -s / 2]], 'timber', { lum: 0.85 });
  return m;
}

/** A post-and-rail fence over `len` pixels. */
export function fence(len, h, gap = 14) {
  const m = new Model();
  for (const y of [-h * 0.75, -h * 0.4]) beam(m, [-len / 2, y], [len / 2, y + 1], 1.8);
  for (let x = -len / 2; x <= len / 2; x += gap) beam(m, [x, 1], [x, -h], 2.4);
  return m;
}

/** A straw beehive (skep) on a little stand. */
export function skep(s) {
  const m = new Model();
  beam(m, [-s * 0.6, 0], [s * 0.6, 0], 2);
  m.poly(lumpy(0, -s * 0.6, s * 0.5, s * 0.62, () => 0.5, 0, 3), 'straw', { shade: 'round' });
  for (let i = 1; i < 4; i++) m.line([[-s * 0.48, -s * 0.2 * i - 1], [s * 0.48, -s * 0.2 * i - 1]], 'straw', { lum: 0.2 });
  m.ellipse(0, -s * 0.2, 1.2, 1, 'straw', { shade: 'flat', tone: -0.5 });
  return m;
}

/** A column of hexagonal basalt. */
export function basalt(rng, w, h) {
  const m = new Model();
  const x0 = -w / 2, x1 = w / 2;
  m.poly([[x0, 0], [x0, -h], [x0 + w * 0.3, -h - w * 0.2], [x1, -h], [x1, 0]], 'rock', { shade: 'facet', lum: 0.42 });
  m.poly([[x0, 0], [x0, -h], [x0 + w * 0.3, -h + w * 0.05], [x0 + w * 0.3, 0]], 'rock', { shade: 'facet', lum: 0.62 });
  m.poly([[x0, -h], [x0 + w * 0.3, -h - w * 0.2], [x1, -h], [x0 + w * 0.3, -h + w * 0.05]], 'rock', { shade: 'facet', lum: 0.78 });
  for (let i = 0; i < 2; i++) { const y = -h * (0.3 + rng.next() * 0.5); m.line([[x0 + 1, y], [x1 - 1, y + 1]], 'rock', { lum: 0.1 }); }
  return m;
}

/** A spire of scenery crystals (not a harvest): a few faceted columns. */
export function spire(rng, h, mat = 'gem') {
  const m = new Model(), n = 2 + Math.round(rng.next() * 2);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.35, L = h * (i === Math.floor(n / 2) ? 1 : 0.6), w = L * 0.28;
    const c = Math.cos(a), s = Math.sin(a), px = -s, py = c, x = (i - (n - 1) / 2) * 2;
    const at = (u, v) => /** @type {[number, number]} */ ([x + c * u + px * v, s * u + py * v]);
    m.poly([at(0, -w / 2), at(L * 0.75, -w / 2), at(L, 0), at(L * 0.75, 0), at(0, 0)], mat, { shade: 'facet', lum: 0.8 });
    m.poly([at(0, 0), at(L * 0.75, 0), at(L, 0), at(L * 0.75, w / 2), at(0, w / 2)], mat, { shade: 'facet', lum: 0.42 });
  }
  return m;
}

/** A stone cairn or marker. */
export function cairn(rng, s) {
  const m = new Model();
  for (let i = 0; i < 3; i++) m.poly(lumpy(0, -s * 0.3 - i * s * 0.55, s * (0.7 - i * 0.15), s * 0.32, R(rng), 0.2, 5), 'rock', { shade: 'round', tone: i * 0.04 });
  return m;
}

/** A timber scaffold: two posts, a deck across their tops, a rail and crossed braces. */
export function scaffold(rng, w, h) {
  const m = new Model();
  for (const x of [-w / 2, w / 2]) beam(m, [x, 1], [x, -h - 6], 2.4);
  beam(m, [-w / 2 - 3, -h], [w / 2 + 3, -h], 2.6);
  beam(m, [-w / 2, -h - 6], [w / 2, -h - 6], 1.4);
  beam(m, [-w / 2, -2], [w / 2, -h + 2], 1.6);
  if (rng.next() < 0.6) beam(m, [w / 2, -2], [-w / 2, -h + 2], 1.6);
  if (h > 20) beam(m, [-w / 2, -h / 2], [w / 2, -h / 2], 1.6);
  return m;
}

/** A winding wheel on its frame (a mine's headgear): a rim with spokes, raised on two legs. */
export function wheel(rng, r, h) {
  const m = new Model();
  beam(m, [-r * 0.7, 0], [0, -h], 2.4); beam(m, [r * 0.7, 0], [0, -h], 2.4);
  const n = 16, pts = [];
  for (let i = 0; i <= n; i++) pts.push([Math.cos((i / n) * Math.PI * 2) * r, -h + Math.sin((i / n) * Math.PI * 2) * r]);
  for (let i = 0; i < n; i++) beam(m, pts[i], pts[i + 1], 1.8);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI + rng.next() * 0.1; beam(m, [Math.cos(a) * r, -h + Math.sin(a) * r], [-Math.cos(a) * r, -h - Math.sin(a) * r], 1.2); }
  m.ellipse(0, -h, 1.8, 1.8, 'metal', {});
  return m;
}
