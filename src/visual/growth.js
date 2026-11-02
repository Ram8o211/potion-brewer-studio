// How a wild ingredient grows where it is found: the plant (or deposit) in
// the wilds at each growth stage, built procedurally in the pixel artist's
// way rather than drawn from a fixed picture.
//
//   1. a base structure: a stem, trunk or strand walks from where it is
//      attached (the ground, a branch or a cave's roof it hangs from, a rock
//      face or a tree trunk it juts from), bending with jitter and drooping
//      under its own weight;
//   2. branches fork off it, each by chance (some species branch freely,
//      some hardly at all, few of them symmetrically);
//   3. the elements are added along it and at its tips: leaves, flowers,
//      buds, berries, pods, seed heads, caps, shelves, tufts, prisms, lumps,
//      needles, drips of resin;
//   4. every species has its own variation parameters (height, branching,
//      angles, leaf and flower type, droopiness, hanging parts, symmetry,
//      clustering), drawn from its identity's morphology stream, and every
//      plant of it its own variant (one of four), so a stand is never a row
//      of copies.
//
// Inorganic finds follow their own build rules: a crystal grows from a seed
// that elongates, splits and clusters into its habit (a shard, a spike, a
// cluster, a fan, a tall prism, or points hanging from a cave's roof), each
// point a cut gem of lit, middle and shadowed faces with a bright ridge, two
// tip facets and a glowing heart, a mineral fractures into chunks (embers glow
// in the cracks of a fiery one), chalk erodes into pitted stacks, a crust
// blooms into needles, a nugget sits in its matrix of rock.
//
// Pure: a descriptor, a stage, a mount and a variant always paint the same
// pixels. Colours come from the descriptor's ramps, lit from the upper left.

import { artDomain } from '../studio/direction.js';
import { Rng } from '../core/rng.js';
import { Pixels } from './pixels.js';
import { inked } from './style.js';
import { pack } from './color.js';

const TAU = Math.PI * 2, UP = -Math.PI / 2, DOWN = Math.PI / 2;

/** The forms that hang from the roof on a vine: glowing crystal drops, bells, orbs, tears, nets, jellies and puffs. */
export const DANGLERS = ['icicle', 'bellbloom', 'orb', 'teardrop', 'bluebell', 'netpod', 'jelly', 'puffbloom'];

/** The forms that grow among the leaves of a tree: round fruit on short stalks, apples, pears and plums. */
export const ORCHARD = ['apple', 'pear', 'plum'];

/**
 * Where each form of ingredient is found, and how often: on the ground; hanging
 * (only the dangling vines hang: from the boughs, a ledge's underside or the
 * cave's roof); out of a rock face (wall) or a tree's trunk (trunk). The
 * ground is always the last resort.
 * @type {Record<string, [string, number][]>}
 */
export const MOUNTS = {
  bracket: [['trunk', 0.65], ['wall', 0.35]],
  moss: [['wall', 0.6], ['ground', 0.4]],
  bark: [['trunk', 0.85], ['ground', 0.15]],
  crystal: [['ground', 0.45], ['wall', 0.35], ['ceiling', 0.2]],
  shard: [['ground', 0.55], ['wall', 0.3], ['ceiling', 0.15]],
  stone: [['ground', 0.75], ['wall', 0.25]],
  powder: [['ground', 0.5], ['wall', 0.5]],
  crust: [['wall', 0.75], ['ground', 0.25]],
  nugget: [['wall', 0.6], ['ground', 0.4]],
  scale: [['ground', 0.6], ['wall', 0.4]],
  ...Object.fromEntries(DANGLERS.map((k) => [k, [['hang', 1]]])),
  ...Object.fromEntries(ORCHARD.map((k) => [k, [['bough', 1]]])),
};

/**
 * The mounts a form can take, with their weights; anything can stand on the
 * ground (weight 0 where it is not found there: only when nowhere else has room).
 * @param {string} form @returns {[string, number][]}
 */
export function mountsOfForm(form) {
  const m = MOUNTS[form];
  if (!m) return [['ground', 1]];
  return m.some(([k]) => k === 'ground') ? m : [...m, ['ground', 0]];
}

/** The picture a mount is drawn as: a trunk is a wall of wood. @param {string} [mount] */
export const frameMount = (mount) => (mount === 'hang' || mount === 'bough' || mount === 'ceiling' ? 'hang' : mount === 'wall' || mount === 'trunk' ? 'wall' : 'ground');

/** Mature height (scene pixels) of each family before its own variation. */
const BASE_H = { flower: 15, herb: 12, root: 14, fungus: 11, moss: 10, fruit: 13, reed: 19, bark: 10, crystal: 19, mineral: 12.5, shell: 12 };

// ---------------------------------------------------------------- the sketch

/** A deterministic hash of a pixel in [0, 1). */
const hash2 = (x, y, s) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The colour of a ramp lit by `l` (−1 turned away from the light … 1 facing it), in the style's four tones. @param {number[]} r @param {number} l */
function tone(r, l) {
  const n = r.length - 1, t = l < -0.45 ? 0.2 : l < 0.2 ? 0.5 : l < 0.65 ? 0.7 : 0.9;
  return r[Math.round(n * t)];
}

/** Of a ramp, the colour at fraction t. @param {number[]} r @param {number} t */
const at = (r, t) => r[Math.max(0, Math.min(r.length - 1, Math.round((r.length - 1) * t)))];

/** How a normal faces the light from the upper left. */
const lit = (nx, ny) => nx * -0.6 + ny * -0.8;

/** The signed difference between two angles. */
const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * A scratch canvas centred on the anchor (the point the plant is attached
 * at), clipped to its side of the surface it grows from; the elements are
 * queued by layer and painted back to front.
 */
class Sketch {
  /**
   * @param {string} mount 'ground' | 'hang' | 'wall' @param {number} seed
   * @param {number} [k] its definition: k pixels to a unit of the plant (2: twice the scene's resolution,
   *   for the wilds' detail layer — every shape sampled in finer steps, so it has more pixels, not bigger ones)
   */
  constructor(mount, seed, k = 1) {
    this.k = k;
    this.N = 160 * k; this.o = 80 * k;
    this.pix = new Pixels(this.N, this.N);
    this.mount = mount;
    this.seed = seed;
    /** @type {number[][]} */
    this.glints = [];
    /** pixels that give light (glowing caps, berries, crystal tips) @type {number[][]} */
    this.glows = [];
    /** @type {[number, number, Function][]} */
    this.jobs = [];
  }

  /** Paint a pixel (anchor-relative, in units), never into the surface it grows from (at k > 1, its k × k cell). */
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if ((this.mount === 'ground' && y > 0) || (this.mount === 'hang' && y < 0) || (this.mount === 'wall' && x < 0)) return;
    const k = this.k;
    if (k === 1) { this.pix.set(x + this.o, y + this.o, c); return; }
    const h = (k - 1) >> 1;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) this.pix.set(x * k - h + i + this.o, y * k - h + j + this.o, c);
  }

  /** Paint one pixel of the fine grid at (x, y) in units (a pixel at k = 1), never into the surface it grows from. */
  fine(x, y, c) {
    const k = this.k;
    if (k === 1) { this.set(x, y, c); return; }
    const fx = Math.round(x * k), fy = Math.round(y * k), lim = (k - 1) >> 1;
    if ((this.mount === 'ground' && fy > lim) || (this.mount === 'hang' && fy < -lim) || (this.mount === 'wall' && fx < -lim)) return;
    this.pix.set(fx + this.o, fy + this.o, c);
  }

  /** Whether a pixel is painted. */
  has(x, y) { return !!(this.pix.get(Math.round(x * this.k) + this.o, Math.round(y * this.k) + this.o) >>> 24); }

  /** A pixel that gives light of its own: painted in a colour the lighting leaves alone, and a halo is drawn round it. */
  emit(x, y, c) { this.set(x, y, c); this.glows.push([Math.round(x), Math.round(y)]); }

  /** A pixel that may glimmer. */
  glint(x, y) { this.glints.push([Math.round(x), Math.round(y)]); }

  /** Queue a paint job on a layer (lower layers are painted first). @param {number} z @param {Function} fn */
  later(z, fn) { this.jobs.push([z, this.jobs.length, fn]); }

  flush() {
    while (this.jobs.length) {
      const jobs = this.jobs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      this.jobs = [];
      for (const [, , fn] of jobs) fn();
    }
  }

  /** The finished frame: cropped round what was painted (and the anchor), ringed in ink, optionally mirrored. @param {boolean} flip */
  frame(flip) {
    const { N, o } = this, src = this.pix.px;
    let x0 = o, y0 = o, x1 = o, y1 = o;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!(src[y * N + x] >>> 24)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Pixels(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.px[y * w + (flip ? w - 1 - x : x)] = src[(y + y0) * N + x + x0];
    const fx = (x) => (flip ? w - 1 - (x + o - x0) : x + o - x0);
    const within = (list) => {
      const seen = new Set();
      const k = this.k;
      return list.map(([x, y]) => [fx(x * k), y * k + o - y0]).filter(([x, y]) => {
        const k = y * w + x;
        if (x < 0 || y < 0 || x >= w || y >= h || !(out.px[k] >>> 24) || seen.has(k)) return false;
        seen.add(k);
        return true;
      }).map(([x, y]) => [x + 1, y + 1]);
    };
    return { pix: inked(out), ax: fx(0) + 1, ay: o - y0 + 1, glints: within(this.glints), glows: within(this.glows), k: this.k };
  }
}

// ---------------------------------------------------------------- elements

/** A round dab, lit from the upper left. @param {Sketch} sk @param {number[]} rp */
function disc(sk, x, y, r, rp, o = {}) {
  const K = sk.k, R = Math.max(0.5, r), k = Math.ceil(R * K), cx = Math.round(x * K) / K, cy = Math.round(y * K) / K;
  for (let j = -k; j <= k; j++) for (let i = -k; i <= k; i++) {
    const u = i / K, v = j / K;
    if (u * u + v * v > R * R + R * 0.6 / K) continue;
    sk.fine(cx + u, cy + v, o.flat !== undefined ? at(rp, o.flat) : tone(rp, lit(u / R, v / R) * 1.15 + (o.lift || 0)));
  }
}

/**
 * A blob: an ellipse (turned by `ang`), its outline roughened by a few
 * harmonics (rocks) or many bumps (moss), optionally faceted, grainy, or
 * clipped by `keep`; lit along its normal.
 * @param {Sketch} sk @param {number[]} rp
 * @param {{ang?:number, rough?:number, bumps?:number, ph?:number[], facets?:number, grain?:number, lift?:number, keep?:(i:number, j:number)=>boolean, seed?:number}} [o]
 */
function blob(sk, x, y, rx, ry, rp, o = {}) {
  const a = o.ang || 0, ca = Math.cos(a), sa = Math.sin(a), ph = o.ph || [0.3, 1.7, 2.9], am = o.rough || 0, bm = o.bumps || 0;
  const R = (th) => 1 + am * (0.6 * Math.cos(2 * th + ph[0]) + 0.4 * Math.cos(3 * th + ph[1]) + 0.3 * Math.cos(5 * th + ph[2])) + bm * Math.cos(9 * th + ph[0] * 3);
  const K = sk.k, ext = Math.ceil((Math.max(rx, ry) * (1 + am + bm) + 1) * K), cx = Math.round(x * K) / K, cy = Math.round(y * K) / K;
  for (let jj = -ext; jj <= ext; jj++) for (let ii = -ext; ii <= ext; ii++) {
    const i = ii / K, j = jj / K;
    const u = (i * ca + j * sa) / Math.max(0.5, rx), v = (-i * sa + j * ca) / Math.max(0.5, ry), d = Math.hypot(u, v), th = Math.atan2(v, u), r = R(th);
    if (d > r || (o.keep && !o.keep(Math.round(i), Math.round(j)))) continue;
    let nu = u / r, nv = v / r;
    if (o.facets) {
      const fa = Math.round(th / (TAU / o.facets)) * (TAU / o.facets), m = d / r;
      nu = Math.cos(fa) * m; nv = Math.sin(fa) * m;
    }
    let l = lit(nu * ca - nv * sa, nu * sa + nv * ca) * 1.15 + (o.lift || 0);
    if (o.grain) l += (hash2(Math.round((cx + i) * K), Math.round((cy + j) * K), sk.seed + (o.seed || 0)) - 0.5) * o.grain;
    sk.fine(cx + i, cy + j, tone(rp, l));
  }
}

/**
 * A stroke along a polyline, tapering from w0 to w1: a round stem lit on
 * its upper left (a hair of one pixel in its body colour).
 * @param {Sketch} sk @param {number[][]} pts @param {number[]} rp
 */
function stroke(sk, pts, w0, w1, rp) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len * 2 * sk.k));
    for (let k = 0; k <= n; k++) {
      const t = k / n, w = w0 + (w1 - w0) * ((s + len * t) / (total || 1)), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      // a hair: one pixel, or at a finer definition a little over a unit wide, lit on its left
      if (w <= 1.25) {
        if (sk.k === 1) sk.set(x, y, at(rp, 0.45));
        else { sk.fine(x - 0.25, y, at(rp, 0.6)); sk.fine(x + 0.25, y, at(rp, 0.38)); }
      } else disc(sk, x, y, w / 2, rp);
    }
    s += len;
  }
}

/** Leaf outlines: half-width along the blade (0 at the stalk, 1 at the tip). */
const LEAF = {
  oval: (t) => Math.sin(Math.PI * t),
  lance: (t) => 0.75 * Math.sin(Math.PI * Math.pow(t, 0.6)),
  round: (t) => Math.pow(Math.sin(Math.PI * t), 0.5),
  heart: (t) => Math.sin(Math.PI * Math.pow(t, 1.35)),
  needle: (t) => 0.5 * (1 - t) * Math.min(1, t * 6),
  pod: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.45),
  cone: (t) => Math.pow(1 - t, 0.7) * Math.min(1, t * 3 + 0.2),
};

/**
 * A blade (leaf, petal, pod) from (x, y) at angle a: its side turned to the
 * light a tone lighter, a darker midrib down a long one.
 * @param {Sketch} sk @param {number[]} rp
 * @param {string} [shape] @param {{serrate?:boolean, rib?:number[]|null, gloss?:boolean}} [o]
 */
function leaf(sk, x, y, a, len, wid, rp, shape = 'oval', o = {}) {
  if (len < 0.8) return;
  const ca = Math.cos(a), sa = Math.sin(a), f = LEAF[shape] || LEAF.oval;
  const side = lit(-sa, ca) >= 0 ? 1 : -1;
  const st = 0.5 / sk.k;
  for (let u = 0; u <= len; u += st) {
    const t = u / len;
    let hw = wid * f(t);
    if (o.serrate) hw *= Math.floor(u) % 2 ? 1.2 : 0.75;
    for (let v = -hw; v <= hw + 0.01; v += st) {
      // at a finer definition the leaf has a lit edge, a body and a shaded edge, and a vein-side tone between
      const c = v * side > 0.4 ? at(rp, sk.k > 1 && v * side > hw - 0.5 ? 0.92 : 0.8) : v * side < -hw + 0.6 && hw > 1.2 ? at(rp, 0.3) : at(rp, sk.k > 1 && v * side < -0.2 ? 0.42 : 0.5);
      sk.fine(x + ca * u - sa * v, y + sa * u + ca * v, c);
    }
  }
  if (o.rib !== null && len >= 5 && wid >= 1.2) for (let u = len * 0.15; u < len * 0.8; u += st) sk.fine(x + ca * u, y + sa * u, at(o.rib || rp, 0.2));
  if (o.gloss) sk.fine(x + ca * len * 0.3 - sa * wid * 0.3 * side, y + sa * len * 0.3 + ca * wid * 0.3 * side, at(rp, 1));
}

/**
 * A prism (a crystal's spike) from (x, y) along a: its face toward the light
 * bright, the other dark, the ridge between them brightest, deeper toward
 * its root, ending in a point (skewed for a shard).
 * @param {Sketch} sk @param {number[]} rp
 */
function prism(sk, x, y, a, len, wid, rp, o = {}) {
  const ca = Math.cos(a), sa = Math.sin(a), tip = Math.max(1.5, wid * (o.tip ?? 0.9)), sgn = lit(-sa, ca) >= 0 ? 1 : -1, skew = o.skew || 0;
  const stp = 0.5 / sk.k;
  for (let u = 0; u <= len; u += stp) {
    const tt = (len - u) / tip, hw = wid / 2, inTip = u > len - tip;
    for (let v = -hw; v <= hw; v += stp) {
      // the point: both edges close in, toward a tip set off by the skew
      if (inTip) { const c = skew * hw; if (v < c - (c + hw) * tt || v > c + (hw - c) * tt) continue; }
      const s = v * sgn;
      let t = s > 0.6 ? 0.66 : s < -0.4 ? 0.33 : 0.85;
      if (u < len * 0.22) t -= 0.17;
      sk.fine(x + ca * u - sa * v, y + sa * u + ca * v, at(rp, t));
    }
  }
  sk.glint(x + ca * (len - 1), y + sa * (len - 1));
}

/**
 * A cut crystal point from (x, y) along a, in the way of a pixel artist's
 * gem: a column of three faces — the one toward the light pale, the middle
 * one bright, the far one deep — with a bright ridge between the first two
 * and a shadowed edge on the far side, darker where it roots in the rock;
 * a termination of two facets (lit and shadowed) meeting at a white apex;
 * a heart of its glow colour down the middle of a luminous one; and here
 * and there a fracture across it. `skew` sets the apex off-centre (a shard).
 * @param {Sketch} sk @param {number[]} rp @param {number[]|null} glow
 * @param {{tip?:number, skew?:number, crack?:number, seed?:number}} [o]
 */
function gem(sk, x, y, a, len, wid, rp, glow, o = {}) {
  const ca = Math.cos(a), sa = Math.sin(a), hw = Math.max(1, wid / 2), sgn = lit(-sa, ca) >= 0 ? 1 : -1, skew = o.skew || 0;
  const tip = Math.min(len * 0.6, Math.max(2, wid * (o.tip ?? 0.85))), body = len - tip, c0 = skew * hw;
  const P = (u, v) => [x + ca * u - sa * v, y + sa * u + ca * v];
  // first its own dark outline, so a point standing before another is cut clear of it
  const ink = at(rp, 0), gs = 0.5 / sk.k, ew = 1 / sk.k;
  for (let u = gs; u <= len + ew; u += gs) {
    const inTip = u > body, tt = inTip ? Math.max(0, (len + ew - u) / (tip + ew)) : 1, e = hw + ew;
    for (let v = -e; v <= e; v += gs) {
      if (inTip && (v < c0 - (c0 + e) * tt || v > c0 + (e - c0) * tt)) continue;
      const [px, py] = P(u, v);
      sk.fine(px, py, ink);
    }
  }
  for (let u = 0; u <= len; u += gs) {
    const inTip = u > body, tt = inTip ? (len - u) / tip : 1;
    for (let v = -hw; v <= hw; v += gs) {
      // the point: both edges close in toward the apex
      if (inTip && (v < c0 - (c0 + hw) * tt || v > c0 + (hw - c0) * tt)) continue;
      const s = ((v - (inTip ? c0 * (1 - tt) : 0)) * sgn) / hw;
      let t;
      if (inTip) t = s > 0.08 ? 0.96 : s > -0.12 ? 1 : 0.46;
      else t = s > 0.62 ? 0.8 : s > 0.28 ? 1 : s > -0.3 ? 0.62 : s > -0.78 ? 0.32 : 0.16;
      // rooted in the rock: the foot is in shadow
      if (u < len * 0.16) t -= 0.24; else if (u < len * 0.3) t -= 0.08;
      const [px, py] = P(u, v);
      sk.fine(px, py, at(rp, t));
    }
  }
  // a fracture across the column, catching the light on its far lip
  if (o.crack && body > 6) {
    const u = body * (0.45 + ((o.seed || 0) % 5) * 0.06);
    for (let v = -hw; v <= hw; v += gs) { const [px, py] = P(u + v * 0.35 * sgn, v); sk.fine(px, py, at(rp, 0.28)); const [qx, qy] = P(u + 1 / sk.k + v * 0.35 * sgn, v); if (v * sgn > 0) sk.fine(qx, qy, at(rp, 1)); }
  }
  // a luminous heart down the middle, brightest toward the point
  if (glow && body > 3) for (let u = len * 0.3; u < body; u += 1 / sk.k) { const [px, py] = P(u, -0.25 * sgn); sk.fine(px, py, at(glow, 0.45 + 0.5 * (u / body))); }
  const [ax, ay] = P(len - 0.5, c0);
  sk.fine(ax, ay, at(rp, 1));
  sk.glint(ax, ay);
  const [rx, ry] = P(body * 0.6, hw * 0.45 * sgn);
  sk.glint(rx, ry);
  if (glow) sk.emit(...P(Math.max(1, len - tip * 0.6), c0 * 0.5), at(glow, 0.95));
}

/** A drop of resin or dew running down from (x, y): a thread swelling into a bead. @param {Sketch} sk @param {number[]} rp */
function drip(sk, x, y, len, rp) {
  for (let i = 0; i < len; i++) {
    sk.set(x, y + i, at(rp, i < 2 ? 0.55 : 0.45));
    if (i < len * 0.45) sk.set(x + 1, y + i, at(rp, 0.3));
  }
  disc(sk, x, y + len, 1.1, rp);
  sk.set(x - 0, y + len - 1, at(rp, 1));
  sk.glint(x, y + len);
}

/** A crack wandering through a stone from (x, y), glowing if hot. @param {Sketch} sk */
function crack(sk, rng, x, y, a, len, c, hot) {
  for (let i = 0; i < len; i++) {
    if (!sk.has(x, y)) break;
    sk.set(x, y, c);
    if (hot && i % 3 === 1) sk.glint(x, y);
    a += (rng.next() - 0.5) * 1.2;
    x += Math.cos(a); y += Math.sin(a);
  }
}

/**
 * A stem's walk from (x, y) at angle a: steps of jitter, a steady curl, and
 * a droop pulling its end down under its weight.
 * @returns {number[][]}
 */
function walk(rng, x, y, a, len, o = {}) {
  const n = Math.max(2, Math.round(len / 1.5)), step = len / n, pts = [[x, y]];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    a += (rng.next() - 0.5) * (o.jitter ?? 0.2) + (o.curl || 0);
    if (o.droop) a += turn(a, DOWN) * o.droop * t * 0.22;
    if (o.rise) a += turn(a, UP) * o.rise * 0.2;
    x += Math.cos(a) * step; y += Math.sin(a) * step;
    pts.push([x, y]);
  }
  return pts;
}

/** A stem: its walk, painted on layer z (1 by default). @param {Sketch} sk @param {number[]} rp */
function stem(sk, rng, x, y, a, len, w0, w1, rp, o = {}) {
  const pts = walk(rng, x, y, a, len, o);
  sk.later(o.z ?? 1, () => stroke(sk, pts, w0, w1, rp));
  return pts;
}

/** The direction a walk ends in. @param {number[][]} pts */
const tipAngle = (pts) => {
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
};

/** Call fn at every `every`-th point of a walk (not its root nor its tip): (x, y, angle, t, count). */
function nodes(pts, every, fn) {
  let n = 0;
  for (let i = every; i < pts.length - 1; i += every) {
    const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    fn(pts[i][0], pts[i][1], a, i / (pts.length - 1), n++);
  }
}

/** A tuft of small leaves round a point. @param {Sketch} sk @param {number[]} rp */
function tuft(sk, rng, x, y, size, rp, a0 = UP) {
  const n = 3 + Math.round(size);
  for (let i = 0; i < n; i++) leaf(sk, x, y, a0 + (i / (n - 1) - 0.5) * 2.6 + (rng.next() - 0.5) * 0.4, size * (0.7 + rng.next() * 0.5), Math.max(0.8, size * 0.35), rp, 'oval', { rib: null });
}

/** A round fruit: lit from the upper left, a glint on it, and, if it glows, a core that gives light. @param {Sketch} sk @param {number[]} rp @param {number[]|null} [gl] the glow ramp */
function globe(sk, x, y, r, rp, gl = null) {
  disc(sk, x, y, r, rp);
  sk.fine(x - r * 0.4, y - r * 0.4, at(rp, 1));
  if (sk.k > 1 && r >= 1.2) { sk.fine(x - r * 0.4 + 0.5, y - r * 0.4, at(rp, 0.85)); sk.fine(x + r * 0.45, y + r * 0.5, at(rp, 0.12)); }
  if (gl) {
    sk.emit(x, y, at(gl, 0.8));
    if (r >= 1.5) sk.set(x + 1, y, at(gl, 0.45));
  } else sk.glint(x - r * 0.4, y - r * 0.4);
}

/** A hanging bunch of berries below (x, y): rows widening, then narrowing to a point. @param {Sketch} sk @param {number[]} rp @param {number[]|null} [gl] */
function bunch(sk, rng, x, y, n, r, rp, gl = null) {
  const rows = [1, 2, 3, 2, 2, 1, 1];
  let k = 0;
  for (let row = 0; k < n && row < rows.length; row++) {
    const m = Math.min(rows[row], n - k);
    for (let i = 0; i < m; i++, k++) {
      const bx = x + (i - (m - 1) / 2) * r * 1.7 + (rng.next() - 0.5) * 0.6, by = y + r + row * r * 1.5;
      globe(sk, bx, by, r, rp, gl && (i + row) % 2 === 0 ? gl : null);
    }
  }
}

/** The ramp a fiery stone glows with in its cracks. */
const EMBER = [[0.55, 0.12, 0.05], [0.85, 0.3, 0.06], [1, 0.55, 0.12], [1, 0.78, 0.3], [1, 0.95, 0.65]].map((c) => pack(c));

// ---------------------------------------------------------------- variation

/**
 * @typedef {{sk:Sketch, d:any, P:any, g:number, st:number, H:number, rng:Rng, pal:Record<string, number[]>, mount:string, closed:boolean}} Ctx
 */

/** @type {WeakMap<object, any>} */
const PARAMS = new WeakMap();

/** A species' variation parameters, from its morphology stream and the clues of its effects. @param {any} d */
function baseGrowthParams(d) {
  let P = PARAMS.get(d);
  if (P) return P;
  const r = new Rng((d.seeds.morph ^ 0x6a09e667) >>> 0), tr = d.tr, f = () => r.next();
  const leafs = tr.sharp > 0.4 ? ['lance', 'needle', 'lance'] : tr.round > 0.4 ? ['round', 'heart'] : ['oval', 'lance', 'round', 'heart'];
  P = {
    h: (BASE_H[d.family] || 16) * (0.85 + f() * 0.3) * (1 + tr.thick * 0.12 + tr.lush * 0.1) * (d.id.rare ? 1.12 : 1),
    stems: 1 + Math.floor(f() * 3),
    spread: 0.15 + f() * 0.2,
    jitter: 0.1 + f() * 0.22 + tr.asym * 0.3,
    droop: 0.04 + f() * 0.16 + tr.droop * 0.5,
    node: 2 + Math.floor(f() * 2),
    leaf: leafs[Math.floor(f() * leafs.length)],
    leafLen: (2.4 + f() * 1.8) * (1 + tr.lush * 0.3),
    leafW: 0.9 + f() * 0.6,
    branchP: 0.25 + f() * 0.45 + tr.lush * 0.2,
    branchAng: 0.4 + f() * 0.35,
    head: (2.1 + f() * 1.2) * (1 + tr.round * 0.2),
    petals: 4 + Math.floor(f() * 3) + (tr.round > 0.5 ? 1 : 0),
    petal: tr.sharp > 0.4 ? 'lance' : tr.round > 0.4 ? 'round' : f() < 0.5 ? 'oval' : 'lance',
    sym: tr.asym < 0.25 && f() < 0.4,
    thick: tr.thick > 0.4 ? 1 : 0,
    lush: 0.5 + tr.lush * 0.5,
    cluster: 3 + Math.floor(f() * 3),
    capR: 0.28 + f() * 0.14, capH: 0.6 + f() * 0.45, capFlat: 0.35 + f() * 0.5,
    tiers: 2 + Math.floor(f() * 3),
    rings: 2 + Math.floor(f() * 3),
    prisms: 3 + Math.floor(f() * 4), fan: 0.8 + f() * 0.6, cw: 2.2 + f() * 1.6,
    chunks: 2 + Math.floor(f() * 2),
    berryR: 1 + f() * 0.4 + tr.round * 0.25,
    podLen: 3.2 + f() * 2.2,
    tilt: (f() - 0.5) * 0.3,
    mandrake: tr.asym > 0.45,
    hot: tr.warm > 0.4,
    glow: false,
  };
  // what glows: every mushroom and berry, the lichens of the dark regions, the arcane and the luminous, and a few others
  const dark = d.id.region === 'netherwood' || d.id.region === 'moonfen';
  P.glow = tr.glow > 0.25 || d.family === 'fungus' || d.form === 'berry' || (d.family === 'moss' && dark) || d.family === 'crystal' || (dark && d.family !== 'mineral' && f() < 0.35) || f() < 0.08;
  // a crystal's habit, its points' girth, how slender, how fractured (drawn last, so no other plant changes)
  P.habit = d.form === 'shard' ? ['shard', 'spike', 'shard', 'fan'][Math.floor(f() * 4)] : ['cluster', 'fan', 'spike', 'prism', 'cluster'][Math.floor(f() * 5)];
  P.gw = 4 + f() * 1.6 + tr.thick; P.slim = 0.8 + f() * 0.45 - tr.thick * 0.15; P.cracks = f() < 0.35 + tr.sharp * 0.3;
  PARAMS.set(d, P);
  return P;
}

// ---------------------------------------------------------------- families

/** A flower head at the tip of a walk (a bud before it is grown, or while it is closed). @param {Ctx} c @param {number[][]} pts @param {number} k */
function head(c, pts, k) {
  const { sk, d, g, pal, closed, P, rng } = c, [x, y] = pts[pts.length - 1], a = tipAngle(pts);
  if (g < 0.5) {
    // a seedling: two seed leaves
    sk.later(2, () => { leaf(sk, x, y, a - 0.9, 3, 1.2, pal.leaf); leaf(sk, x, y, a + 0.9, 3, 1.2, pal.leaf); });
    return;
  }
  if (g < 0.95 || closed) {
    // a bud in its sepals
    const bl = (closed ? 4 : 3) * k;
    sk.later(3, () => { leaf(sk, x, y, a, bl, 1.3 * k + 0.2, pal.main, 'oval', { rib: null }); leaf(sk, x, y, a - 0.6, bl * 0.6, 0.8, pal.leaf); leaf(sk, x, y, a + 0.6, bl * 0.6, 0.8, pal.leaf); });
    return;
  }
  const r = P.head * k, rot = rng.next() * TAU;
  sk.later(3, () => {
    switch (d.form) {
      case 'flower': {
        // a thistle: a green bulb of bracts with a brush of rays
        const n = 7 + Math.round(r * 2);
        for (let i = 0; i < n; i++) {
          const b = a + (i / (n - 1) - 0.5) * 2.4;
          stroke(sk, [[x, y], [x + Math.cos(b) * r * 1.1, y + Math.sin(b) * r * 1.1]], 1, 1, pal.main);
          sk.set(x + Math.cos(b) * r * 1.1, y + Math.sin(b) * r * 1.1, at(pal.main, 1));
        }
        disc(sk, x - Math.cos(a) * 0.8, y - Math.sin(a) * 0.8, Math.max(1, r * 0.42), pal.leaf);
        disc(sk, x, y, Math.max(0.8, r * 0.3), pal.center);
        break;
      }
      case 'clover': {
        // a round puff of tiny florets over a trefoil
        for (const s of [-1, 0, 1]) leaf(sk, x - Math.cos(a) * 2, y - Math.sin(a) * 2, a + s * 1.4, 2.6 * k, 1.4 * k, pal.leaf, 'round');
        for (let i = 0; i < 6; i++) disc(sk, x + Math.cos(rot + i) * r * 0.45, y + Math.sin(rot + i) * r * 0.45, 1, pal.main);
        disc(sk, x, y, 1.2, pal.main, { lift: 0.3 });
        break;
      }
      case 'spike': {
        // florets crowding the top of the stem, smaller toward its tip
        const from = Math.floor(pts.length * 0.5);
        for (let i = from; i < pts.length; i++) {
          const t = (i - from) / Math.max(1, pts.length - 1 - from), [px, py] = pts[i], rr = 1.5 * k * (1 - t * 0.5);
          for (const s of [-1, 1]) disc(sk, px + Math.cos(a + s * DOWN) * rr, py + Math.sin(a + s * DOWN) * rr, Math.max(0.6, rr * 0.8), pal.main);
        }
        disc(sk, x, y, 1, pal.accent);
        break;
      }
      case 'lily': {
        // a bell nodding from the top of its upright stem, its petals curling back at the mouth
        const nod = a + turn(a, DOWN) * 0.55;
        leaf(sk, x, y, nod, r * 1.3, r * 0.55, pal.main, 'round', { rib: null });
        const mx = x + Math.cos(nod) * r * 1.2, my = y + Math.sin(nod) * r * 1.2;
        for (const s of [-1, 0, 1]) leaf(sk, mx, my, nod + s * 1.1, r * 0.7, r * 0.3, pal.main, 'lance', { rib: null });
        sk.set(mx + Math.cos(nod) * 1.5, my + Math.sin(nod) * 1.5, at(pal.accent, 0.8));
        if (P.glow) sk.emit(mx, my, at(pal.glow, 1));
        break;
      }
      default: {
        // open petals round a heart
        for (let i = 0; i < P.petals; i++) leaf(sk, x, y, rot + (i * TAU) / P.petals, r, r * 0.5, pal.main, P.petal, { rib: pal.mark });
        disc(sk, x, y, Math.max(0.7, r * 0.28), pal.center);
        if (P.glow) sk.emit(x, y, at(pal.glow, 1));
      }
    }
  });
}

/** @type {Record<string, (c:Ctx)=>void>} */
const BUILD = {
  flower(c) {
    const { sk, d, P, g, H, rng, pal, closed } = c, lily = d.form === 'lily';
    const nb = lily ? 2 : 2 + Math.round(g * 2 * P.lush);
    for (let i = 0; i < nb; i++) {
      const s = i % 2 ? 1 : -1, a = UP + s * (0.7 + rng.next() * 0.5), len = P.leafLen * (0.6 + g * 0.5) * (lily ? 1.3 : 1);
      sk.later(2, () => leaf(sk, s * 0.5, 0, a, len, P.leafW, pal.leaf, lily ? 'lance' : P.leaf));
    }
    const n = g < 0.5 ? 1 : g < 0.95 || lily ? Math.min(2, P.stems) : P.stems, mid = Math.floor(n / 2);
    for (let s = 0; s < n; s++) {
      const off = s - (n - 1) / 2, len = H * (s === mid ? 1 : 0.62 + rng.next() * 0.3);
      const droop = (lily ? 0.06 + P.droop * 0.3 : P.droop) * g;
      const pts = stem(sk, rng, off * 1.5, 0, UP + off * P.spread * (lily ? 0.5 : 1) + P.tilt * (lily ? 0.5 : 1) + (rng.next() - 0.5) * 0.25, len, 1 + (g > 0.6 ? P.thick : 0), 1, pal.stem, { jitter: P.jitter, droop });
      nodes(pts, P.node, (x, y, a, t, i) => {
        if (t > 0.82 || t < 0.1) return;
        const side = P.sym ? (i % 2 ? 1 : -1) : rng.next() < 0.5 ? 1 : -1;
        const ll = P.leafLen * 0.8 * (1 - t * 0.5) * Math.min(1, g + 0.3);
        sk.later(2, () => leaf(sk, x, y, a + side * (0.95 + rng.next() * 0.4), ll, P.leafW * (closed ? 0.6 : 0.8), pal.leaf, P.leaf));
        if (g >= 0.95 && !lily && t > 0.3 && rng.next() < P.branchP) {
          const bp = stem(sk, rng, x, y, a + side * P.branchAng, len * (0.26 + rng.next() * 0.16), 1, 1, pal.stem, { jitter: P.jitter, droop });
          head(c, bp, 0.72);
        }
      });
      head(c, pts, 1);
    }
  },

  herb(c) {
    const { sk, d, P, g, H, rng, pal, closed } = c, big = d.form === 'leaf', sprig = d.form === 'sprig';
    const n = g < 0.5 ? 1 : Math.min(3, P.stems + (big ? 1 : 0));
    for (let s = 0; s < n; s++) {
      const off = s - (n - 1) / 2;
      const a0 = UP + off * P.spread + P.tilt + (rng.next() - 0.5) * 0.3;
      const len = H * (s === Math.floor(n / 2) ? 1 : 0.68 + rng.next() * 0.2);
      const pts = stem(sk, rng, off * 1.5, 0, a0, len, 1 + (g > 0.9 ? P.thick : 0), 1, pal.stem, { jitter: P.jitter, droop: P.droop * 0.5 });
      nodes(pts, sprig ? 2 : P.node, (x, y, a, t, i) => {
        if (t < 0.12) return;
        const ll = (big ? P.leafLen * 1.45 : P.leafLen) * (1 - t * 0.5) * Math.min(1, 0.45 + g * 0.6);
        const sides = sprig ? [-1, 1] : [P.sym ? (i % 2 ? 1 : -1) : rng.next() < 0.5 ? 1 : -1];
        for (const sd of sides) {
          const la = a + sd * (sprig ? 0.9 : 1.05) + (rng.next() - 0.5) * 0.3;
          sk.later(2, () => leaf(sk, x, y, la, ll, (big ? P.leafW * 1.45 : P.leafW) * (closed ? 0.55 : 1), pal.main, big ? P.leaf : 'lance', { serrate: sprig, rib: pal.mark }));
        }
        if (g >= 0.95 && d.tr.spots > 0.3 && rng.next() < 0.4) sk.later(3, () => bunch(sk, rng, x, y, 3, 1, pal.accent, null));
        if (g >= 0.95 && sprig && t > 0.4 && rng.next() < 0.5) sk.later(3, () => stroke(sk, walk(rng, x, y, DOWN + (rng.next() - 0.5) * 0.8, 3, { jitter: 0.3 }), 1, 1, pal.accent));
      });
      const ta = tipAngle(pts), [tx, ty] = pts[pts.length - 1];
      sk.later(2, () => leaf(sk, tx, ty, ta, P.leafLen * (big ? 1.1 : 0.8) * Math.min(1, 0.5 + g * 0.5), big ? P.leafW * 1.2 : P.leafW, pal.main, big ? P.leaf : 'lance', { serrate: sprig, rib: pal.mark }));
    }
  },

  root(c) {
    const { sk, P, g, H, rng, pal } = c;
    if (P.mandrake) {
      // a mandrake half pulled from the ground: a forked body under a rosette
      const by = -(2.5 + g * 3.5), rx = 1.5 + g * 1.8, ry = 2 + g * 2.6;
      for (const s of [-1, 1]) sk.later(1, () => stroke(sk, [[s * rx * 0.4, by + ry * 0.6], [s * (rx * 0.7 + 1), -0.5], [s * (rx + 1.6), 0]], 2, 1, pal.main));
      sk.later(2, () => blob(sk, 0, by, rx, ry, pal.main, { rough: 0.12, ph: [rng.next() * 6, 1, 2] }));
      if (g >= 0.95) {
        for (const s of [-1, 1]) sk.later(3, () => stroke(sk, [[s * rx * 0.8, by - ry * 0.1], [s * (rx + 2), by + 1], [s * (rx + 3), by + 2.5]], 1.5, 1, pal.main));
        sk.later(4, () => { sk.set(-1, by - ry * 0.35, at(pal.mark, 0)); sk.set(1, by - ry * 0.35, at(pal.mark, 0)); sk.set(0, by + ry * 0.05, at(pal.mark, 0)); });
      }
      const n = 3 + Math.round(g * 3);
      for (let i = 0; i < n; i++) {
        const a = UP + (i / (n - 1) - 0.5) * 2.2 + (rng.next() - 0.5) * 0.3;
        sk.later(3, () => leaf(sk, 0, by - ry + 0.5, a, P.leafLen * (0.8 + g * 0.9), P.leafW * 1.2, pal.leaf, 'lance'));
      }
      return;
    }
    // a gnarled woody root rising from the ground, its flares gripping the soil and tufts of leaves at its forks
    const w = 1.8 + g * (1.6 + P.thick);
    const pts = stem(sk, rng, 0, 0, UP + P.tilt + (rng.next() - 0.5) * 0.5, H, w, 1.2, pal.main, { jitter: 0.45 + P.jitter, curl: (rng.next() - 0.5) * 0.1 });
    for (const s of [-1, 1]) sk.later(1, () => stroke(sk, [[0, -1.5], [s * (1.5 + g), -0.6], [s * (3 + g * 2.5), 0]], Math.max(1.5, w * 0.8), 1, pal.main));
    nodes(pts, 3, (x, y, a, t) => {
      if (t < 0.35 || g < 0.95 || rng.next() > 0.65) return;
      const b = stem(sk, rng, x, y, a + (rng.next() < 0.5 ? -1 : 1) * (0.7 + rng.next() * 0.4), H * (0.25 + rng.next() * 0.15) * g, Math.max(1, w * 0.5), 1, pal.main, { jitter: 0.5 });
      const [bx, by] = b[b.length - 1];
      sk.later(3, () => tuft(sk, rng, bx, by, 1.5 + g * 1.5, pal.leaf, tipAngle(b)));
    });
    const [tx, ty] = pts[pts.length - 1];
    sk.later(3, () => tuft(sk, rng, tx, ty, 1.5 + g * 2, pal.leaf));
  },

  fungus(c) {
    const { sk, d, P, g, H, rng, pal, mount, st } = c;
    if (d.form === 'bracket') {
      let x0 = 0;
      if (mount !== 'wall') {
        // on the ground: an old stump to grow from
        const sh = Math.round(H * 0.75), sw = 3;
        sk.later(1, () => {
          for (let y = -sh; y <= 0; y++) for (let x = -sw; x <= sw; x++) {
            if (y === -sh && Math.abs(x) === sw) continue;
            sk.set(x, y, y <= -sh + 1 ? at(pal.pale, 0.6) : x === -sw + 1 ? at(pal.wood, 0.75) : x === sw ? at(pal.wood, 0.2) : (x + 7) % 3 === 0 ? at(pal.wood, 0.3) : at(pal.wood, 0.5));
          }
        });
        x0 = sw;
      }
      const m = [1, 2, P.tiers][st];
      for (let i = 0; i < m; i++) {
        const y = (mount === 'wall' ? 0 : -H * 0.4) + (i - (m - 1) / 2) * 3.4 + (rng.next() - 0.5);
        const rx = (2.5 + H * 0.45 * g) * (1 - Math.abs(i - (m - 1) / 2) * 0.12), ry = Math.max(1.5, rx * 0.42);
        // a shelf: zoned in rings, its growing rim pale, its underside dark
        sk.later(2 + i, () => {
          for (let j = -Math.ceil(ry); j <= Math.ceil(ry * 0.35); j++) for (let x = 0; x <= Math.ceil(rx); x++) {
            const dd = (x / rx) ** 2 + (j / ry) ** 2;
            if (dd > 1) continue;
            const ring = Math.floor(Math.sqrt(dd) * P.rings);
            const col = dd > 0.78 ? at(pal.pale, 0.7) : j >= Math.ceil(ry * 0.35) ? at(pal.gill, 0.2) : at(pal.main, ring % 2 ? 0.45 : j < -ry * 0.4 ? 0.75 : 0.6);
            if (P.glow && !c.closed && dd > 0.78 && x > 0) sk.emit(x0 + x, y + j, at(pal.glow, 0.7)); else sk.set(x0 + x, y + j, col);
          }
        });
        if (x0) sk.later(2 + i, () => {
          for (let j = -Math.ceil(ry * 0.7); j <= 0; j++) for (let x = 0; x <= Math.ceil(rx * 0.6); x++) if ((x / (rx * 0.6)) ** 2 + (j / (ry * 0.7)) ** 2 <= 1) sk.set(-x0 - x, y + 2 + j, at(pal.main, j < -1 ? 0.7 : 0.4));
        });
      }
      return;
    }
    // a cluster of mushrooms, tall ones behind
    const toad = d.form === 'toadstool';
    const k = [1, toad ? 1 : 2, toad ? 2 + (P.cluster > 4 ? 1 : 0) : P.cluster][st];
    const caps = [];
    for (let i = 0; i < k; i++) caps.push({ x: i === 0 ? 0 : (i % 2 ? 1 : -1) * (0.25 + rng.next() * 0.3) * H, h: H * (i === 0 ? 1 : 0.4 + rng.next() * 0.45), tilt: P.tilt + (rng.next() - 0.5) * 0.5 });
    caps.sort((a, b) => b.h - a.h);
    caps.forEach((m, i) => {
      const h = m.h * (0.45 + 0.55 * g), r = Math.max(1.5, h * (toad ? 0.55 : P.capR) * (g < 0.5 ? 0.8 : 1)), hh = Math.max(1.2, r * (g < 0.5 ? 0.9 : P.capH));
      const a = UP + m.tilt, tx = m.x + Math.cos(a) * (h - hh), ty = Math.sin(a) * (h - hh);
      sk.later(1 + i, () => {
        stroke(sk, [[m.x, 0], [(m.x + tx) / 2 + m.tilt, ty / 2], [tx, ty]], toad || P.thick ? 2.2 : 1.6, toad ? 1.8 : 1.2, pal.pale);
        // the cap: a dome lit from the upper left over a dark band of gills
        const flat = g < 0.5 ? 0.7 : P.capFlat;
        for (let j = -Math.ceil(hh); j <= 0; j++) {
          const t = -j / hh, hw = r * Math.pow(Math.max(0, 1 - t * t), flat);
          for (let x = -Math.round(hw); x <= Math.round(hw); x++) sk.set(tx + x, ty + j, tone(pal.main, lit(x / (r + 0.01), -t) * 1.2 + 0.15));
        }
        const shine = P.glow && !c.closed;
        for (let x = -Math.round(r) + 1; x <= Math.round(r) - 1; x++) {
          if (shine && x % 2 === 0) sk.emit(tx + x, ty + 1, at(pal.glow, 0.75));
          else sk.set(tx + x, ty + 1, at(pal.gill, Math.abs(x) % 2 ? 0.25 : 0.5));
        }
        if (shine) { sk.emit(tx - Math.round(r), ty, at(pal.glow, 1)); sk.emit(tx + Math.round(r), ty, at(pal.glow, 1)); }
        if (g >= 0.95 && (toad || d.tr.spots > 0.3)) for (let s = 0; s < 2 + Math.round(r); s++) {
          const sx = tx + Math.round((rng.next() - 0.5) * r * 1.3), sy = ty - 1 - Math.floor(rng.next() * hh * 0.8);
          if (sk.has(sx, sy)) { sk.set(sx, sy, at(pal.pale, 0.9)); if (r > 3 && sk.has(sx + 1, sy)) sk.set(sx + 1, sy, at(pal.pale, 0.7)); }
        }
        if (shine) for (let s = 0; s < 2 + Math.round(r / 3); s++) {
          const sx = tx + Math.round((rng.next() - 0.5) * r * 1.2), sy = ty - 1 - Math.floor(rng.next() * hh * 0.8);
          if (sk.has(sx, sy)) sk.emit(sx, sy, at(pal.glow, 1));
        }
      });
    });
  },

  moss(c) {
    const { sk, P, g, H, rng, pal, mount, st, closed } = c;
    const bead = P.glow && !closed ? pal.glow : pal.main;
    if (mount === 'wall') {
      // a cushion on the rock face, strands trailing from it
      const n = [2, 4, 6][st];
      for (let i = 0; i < n; i++) {
        const y = (i / Math.max(1, n - 1) - 0.5) * H * 0.8 * (0.5 + g * 0.5), r = 1.8 + rng.next() * (1 + g * 1.4);
        sk.later(1, () => blob(sk, r * 0.6, y, r, r * 1.1, pal.main, { bumps: 0.15, grain: 0.9, ph: [rng.next() * 6, 0, 0] }));
      }
      for (let i = 0; i < [0, 1, 3][st]; i++) {
        const x = 1 + rng.next() * 2, y = H * 0.35 * g;
        sk.later(2, () => { const p = walk(rng, x, y, DOWN, 3 + rng.next() * H * 0.6, { jitter: 0.25 }); stroke(sk, p, 1, 1, pal.main); disc(sk, p[p.length - 1][0], p[p.length - 1][1], 0.8, bead); if (P.glow && !closed) sk.emit(p[p.length - 1][0], p[p.length - 1][1], at(pal.glow, 1)); else sk.glint(p[p.length - 1][0], p[p.length - 1][1]); });
      }
      return;
    }
    // a cushion on the ground, its spore stalks rising from it
    const rx = 2 + H * 0.45 * g, ry = 1.5 + H * 0.3 * g;
    sk.later(1, () => blob(sk, 0, 0, rx, ry, pal.main, { bumps: 0.12, grain: 1, ph: [rng.next() * 6, 1, 2] }));
    for (let i = 0; i < [0, 2, 3 + Math.round(P.lush * 2)][st]; i++) {
      const x = (rng.next() - 0.5) * rx * 1.4, p = walk(rng, x, -ry * 0.6, UP + (rng.next() - 0.5) * 0.6, H * (0.35 + rng.next() * 0.35), { jitter: 0.15 });
      sk.later(2, () => { stroke(sk, p, 1, 1, pal.stem); const [ex, ey] = p[p.length - 1]; disc(sk, ex, ey, 0.9, bead); if (P.glow && !closed) sk.emit(ex, ey, at(pal.glow, 1)); });
    }
  },

  fruit(c) {
    const { sk, d, P, g, H, rng, pal, st, closed } = c;
    const fruitPal = g < 0.95 ? pal.leaf : pal.main;
    const gl = P.glow && !closed && g >= 0.95 ? pal.glow : null;
    if (d.form === 'seed') {
      // an umbel: a spotted stem, feathery leaves, rays fanning to seed heads
      const pts = stem(sk, rng, 0, 0, UP + P.tilt, H, 1 + (g > 0.6 ? 1 : 0), 1, pal.stem, { jitter: P.jitter * 0.6 });
      sk.later(1.5, () => { for (let i = 2; i < pts.length - 1; i += 3) sk.set(pts[i][0], pts[i][1], at(pal.mark, 0.4)); });
      nodes(pts, 2, (x, y, a, t, i) => {
        if (t > 0.6) return;
        sk.later(2, () => { for (let k = 0; k < 3; k++) leaf(sk, x, y, a + (i % 2 ? 1 : -1) * (0.8 + k * 0.35), P.leafLen * (0.9 - k * 0.2) * Math.min(1, g + 0.3), 0.8, pal.leaf, 'lance', { serrate: true, rib: null }); });
      });
      if (g < 0.5) return;
      const [tx, ty] = pts[pts.length - 1], m = st === 1 ? 4 : 5 + Math.round(P.lush * 3), sag = closed ? 1.2 : 0;
      for (let i = 0; i < m; i++) {
        const b = UP + (i / (m - 1) - 0.5) * 2.3, l = H * 0.24 * (0.8 + rng.next() * 0.3), ex = tx + Math.cos(b) * l, ey = ty + Math.sin(b) * l + sag * Math.abs(Math.cos(b)) * l * 0.6;
        sk.later(2, () => { stroke(sk, [[tx, ty], [ex, ey]], 1, 1, pal.stem); for (let k = 0; k < 4; k++) disc(sk, ex + ((k % 2) - 0.5) * 1.6, ey - 0.5 + (k >> 1) * 1.4 - 1, 0.7, fruitPal); });
      }
      return;
    }
    // a bush on the ground: arching stems, leaves, fruit hanging from them (berries, pods, peppers)
    const pepper = d.form === 'pepper', n = g < 0.5 ? 1 : pepper ? 2 : Math.max(2, P.stems);
    for (let s = 0; s < n; s++) {
      const off = s - (n - 1) / 2;
      const pts = stem(sk, rng, off * 1.5, 0, UP + off * (P.spread + 0.1) + P.tilt, H * (s === Math.floor(n / 2) ? 1 : 0.75 + rng.next() * 0.2), 1 + (g > 0.6 ? 1 : 0), 1, pal.stem, { jitter: P.jitter, droop: (0.12 + P.droop * 0.6) * g, curl: d.form === 'bean' ? 0.04 : 0, rise: d.form === 'bean' ? 0.3 : 0 });
      nodes(pts, 2, (x, y, a, t, i) => {
        if (t < 0.2) return;
        const side = i % 2 ? 1 : -1;
        sk.later(2, () => leaf(sk, x, y, a + side * 1.0, P.leafLen * 0.85 * Math.min(1, g + 0.3), P.leafW, pal.leaf, P.leaf));
        if (g < 0.5 || i % 2 === 0) return;
        if (pepper) sk.later(3, () => { disc(sk, x, y + 0.5, 0.8, pal.stem); leaf(sk, x, y + 1, DOWN + (rng.next() - 0.5) * 0.5, P.podLen * (0.6 + g * 0.4) * 1.2, 1.7, fruitPal, 'cone', { rib: null, gloss: true }); });
        else if (d.form === 'bean') sk.later(3, () => leaf(sk, x, y, DOWN + (rng.next() - 0.5) * 0.6, P.podLen * g, 1.3, fruitPal, 'pod', { rib: null, gloss: true }));
        else sk.later(3, () => bunch(sk, rng, x, y, [0, 2, 3 + Math.round(P.lush * 2)][st], P.berryR * (0.7 + g * 0.3), fruitPal, gl));
      });
      const [tx, ty] = pts[pts.length - 1];
      sk.later(2, () => leaf(sk, tx, ty, tipAngle(pts), P.leafLen * 0.7, P.leafW * 0.9, pal.leaf, P.leaf));
    }
  },

  reed(c) {
    const { sk, P, g, H, rng, pal, st, closed } = c;
    const n = [2, 3, 3 + P.stems][st];
    const stems = [];
    for (let i = 0; i < n; i++) stems.push({ off: (i / Math.max(1, n - 1) - 0.5) * 2, h: H * (0.55 + rng.next() * 0.45) * (0.45 + g * 0.55) });
    stems.sort((a, b) => b.h - a.h);
    const heads = [0, 1, 1 + Math.round(P.lush * 2)][st];
    stems.forEach((s, i) => {
      const pts = stem(sk, rng, s.off * 1.4, 0, UP + s.off * 0.1 + P.tilt, s.h, 1 + (i === 0 ? P.thick : 0), 1, pal.stem, { jitter: 0.08 });
      if (i < heads) {
        const k = pts.length - 1, from = Math.max(1, k - Math.round(3 + g * 3));
        sk.later(2, () => {
          stroke(sk, pts.slice(from, k), 2.8 * (0.7 + g * 0.3), 2.6 * (0.7 + g * 0.3), P.glow && !closed ? pal.glow : pal.main);
          stroke(sk, pts.slice(from, k), 1, 1, pal.main);
          const [tx, ty] = pts[k], a = tipAngle(pts);
          stroke(sk, [[tx, ty], [tx + Math.cos(a) * 3, ty + Math.sin(a) * 3]], 1, 1, pal.stem);
          if (P.glow && !closed) { sk.emit(pts[from + 1][0], pts[from + 1][1], at(pal.glow, 1)); sk.emit(pts[from + 2][0] + 1, pts[from + 2][1], at(pal.glow, 0.8)); }
        });
      }
    });
    for (let i = 0; i < [2, 3, 4][st]; i++) {
      const s = i % 2 ? 1 : -1;
      sk.later(3, () => stroke(sk, walk(rng, s * 0.5, 0, UP + s * (0.25 + rng.next() * 0.35), H * (0.35 + rng.next() * 0.35) * (0.5 + g * 0.5), { jitter: 0.1, droop: 0.25 + P.droop * 0.5 }), 1.6, 1, pal.leaf));
    }
  },

  bark(c) {
    const { sk, P, g, H, rng, pal, mount } = c, k = H / 15;
    const resin = Math.round(P.lush * 2) + (P.hot ? 1 : 0);
    if (mount === 'wall') {
      // bark peeling from the trunk in curls, beads of resin running from under them
      const m = 2 + (P.stems > 2 ? 1 : 0);
      sk.later(0, () => { for (let y = -Math.round(H * 0.55); y <= Math.round(H * 0.55); y++) sk.set(0, y, at(pal.pale, 0.55)); });
      for (let i = 0; i < m; i++) {
        const y0 = (i - (m - 1) / 2) * 5.5 * k + (rng.next() - 0.5) * 2, curl = (2.5 + rng.next() * 2) * k * g;
        sk.later(1 + i, () => {
          stroke(sk, [[0, y0 + 3 * k], [0.8, y0 + k], [curl * 0.6, y0 - curl * 0.5], [curl, y0 - curl * 0.8], [curl + 0.8, y0 - curl * 0.5]], 2.6 * k + 0.4, 1.6, pal.main);
          stroke(sk, [[0.5, y0 + 2 * k], [curl * 0.55, y0 - curl * 0.35]], 1, 1, pal.wood.slice(0, 2));
        });
        if (g >= 0.95 && i < resin) sk.later(5, () => drip(sk, 1, y0 + 3 * k + 1, 2 + Math.round(rng.next() * 3 * k), pal.accent));
      }
      return;
    }
    // on the ground: a fallen length of branch, its bark split and curling, a bead of resin on it
    const w = Math.round(4 + 4 * g * k), h = Math.max(2, Math.round(2 + 1.5 * g * k));
    sk.later(1, () => {
      for (let y = -2 * h; y <= 0; y++) for (let x = -w; x <= w; x++) {
        const t = (y + h) / h;
        if (Math.abs(t) > 1.05) continue;
        sk.set(x, y, (x + y * 3 + 40) % 5 === 0 ? at(pal.main, 0.25) : tone(pal.main, -t * 0.9));
      }
      blob(sk, -w, -h, 1.2, h, pal.pale, { lift: 0.2 });
      sk.set(-w, -h, at(pal.wood, 0.3));
    });
    sk.later(2, () => stroke(sk, [[w - 2, -2 * h], [w, -2 * h - 2 * g], [w + 1.5, -2 * h - 1]], 2, 1.2, pal.main));
    if (g >= 0.95 && resin) sk.later(3, () => drip(sk, Math.round(w * 0.3), -h, 1, pal.accent));
  },

  crystal(c) {
    const { sk, P, g, st, H, rng, pal, mount } = c, wall = mount === 'wall', hang = mount === 'hang';
    // a cave's roof grows its points hanging; a rock face, leaning out and up
    const habit = hang ? 'hanging' : P.habit, nrm = hang ? DOWN : wall ? -0.45 : UP, tan = nrm + Math.PI / 2;
    const shardy = habit === 'shard';
    // the seed: the host rock it grows out of — a broken, faceted stone half sunk in the ground (or the face or roof it
    // grows from), a smaller one leaning on it, a pebble or two, grainy, lit from the upper left
    const bx = wall ? 1 : 0, by = mount === 'ground' ? 0 : hang ? 1 : 0;
    const rr = (2.6 + g * 2.4) * (0.9 + P.gw * 0.04), side = rng.next() < 0.5 ? -1 : 1, ph = () => [rng.next() * 6, rng.next() * 6, rng.next() * 6];
    const along = (k) => [bx + Math.cos(tan) * k, by + Math.sin(tan) * k], out = hang ? 1 : wall ? 0 : -1;
    const stones = [[0, rr * 0.8, rr * 0.62], [side * rr * 0.9, rr * 0.55, rr * 0.55], [-side * rr * 0.85, rr * 0.42, rr * 0.4]];
    // (in front of the crystal's foot, sunk into what it grows from: the points come up out of the stone)
    stones.forEach(([k, rx, ry], i) => {
      if (i && g < 0.6 * i) return;
      const [sx, sy] = along(k), lift = (i ? -0.25 : -0.12) + (rng.next() - 0.5) * 0.15, sink = -out * ry * 0.12;
      const o = { ang: tan + (rng.next() - 0.5) * 0.5, rough: 0.35, facets: 5 + i, grain: 0.6, lift, ph: ph(), seed: i * 31 };
      sk.later(i ? 40 : 41, () => blob(sk, sx - (wall ? rx * 0.35 : 0), sy + (wall ? 0 : sink), rx, ry, pal.rock, o));
    });
    if (g >= 0.95) sk.later(42, () => { const [px, py] = along(-1.3 * rr * side), dy = hang ? 0.5 : -0.5; sk.set(px, py + dy, at(pal.rock, 0.7)); sk.set(px + 1, py + dy, at(pal.rock, 0.4)); sk.set(px, py + dy * 3, at(pal.rock, 0.5)); sk.set(px + 1, py + dy * 3, at(pal.rock, 0.3)); });
    // the habit: how many points, how widely fanned, how long the side ones are against the main one
    const H0 = H * (habit === 'prism' ? 1.08 : habit === 'spike' ? 1.12 : habit === 'fan' ? 0.85 : 1);
    const plan = {
      shard: { n: 2 + (P.chunks > 2 ? 1 : 0), spread: 0.7, side: 0.72, w: 0.7 },
      spike: { n: 3, spread: 0.8, side: 0.48, w: 0.72 },
      prism: { n: 3, spread: 0.6, side: 0.5, w: 1.05 },
      cluster: { n: Math.max(4, P.prisms), spread: P.fan * 0.95, side: 0.68, w: 0.85 },
      fan: { n: Math.max(5, P.prisms + 1), spread: 1.35 + P.fan * 0.3, side: 0.82, w: 0.72 },
      hanging: { n: Math.max(3, P.prisms - 1), spread: 0.75, side: 0.66, w: 0.82 },
    }[habit];
    // it grows: a seed point, then it elongates and splits, then clusters into its full habit
    const n = st === 0 ? 1 : st === 1 ? Math.min(plan.n, 2 + (plan.n > 4 ? 1 : 0)) : plan.n;
    const spikes = [];
    for (let i = 0; i < n; i++) {
      // the main point in the middle, the others alternating out to either side
      const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? -1 : 1), off = plan.n === 1 ? 0 : k / Math.max(1, plan.n - 1);
      const main = i === 0, ang = nrm + off * plan.spread + (rng.next() - 0.5) * 0.18 + (mount === 'ground' ? P.tilt : 0);
      const len = H0 * (main ? 1 : plan.side * (1 - Math.abs(off) * 0.45) * (0.8 + rng.next() * 0.3)) * (st === 0 ? 0.62 : 1);
      // a point is three to five times as long as it is wide (a seed is stubbier), never wider than a third of its length
      const wid = Math.min(len * 0.34, P.gw * plan.w * P.slim * (main ? 1 : 0.75 + rng.next() * 0.15) * (0.75 + g * 0.25));
      spikes.push({ off, ang, len, wid, main });
    }
    // the short side points behind the main one
    const mainW = Math.max(2, spikes[0].wid);
    spikes.sort((a, b) => a.len - b.len);
    spikes.forEach((s, i) => sk.later(1 + i, () => {
      // (each side point rooted beside the main one, clear of its girth)
      const L = Math.max(3, s.len), sp = s.main ? 0 : s.off * (mainW + 2), x0 = bx + Math.cos(tan) * sp, y0 = by + Math.sin(tan) * sp;
      gem(sk, x0, y0, s.ang, L, Math.max(2, s.wid), pal.crystal, P.glow ? pal.glow : null, { tip: shardy ? 1.8 : habit === 'spike' ? 1.6 : 1.1, skew: shardy ? (rng.next() < 0.5 ? -0.7 : 0.7) : 0, crack: P.cracks && s.main && st === 2 ? 1 : 0, seed: i + 3 });
    }));
  },

  mineral(c) {
    const { sk, d, P, g, H, rng, pal, mount } = c, wall = mount === 'wall';
    const nrm = wall ? 0 : UP, tan = nrm + Math.PI / 2;
    const ph = () => [rng.next() * 6, rng.next() * 6, rng.next() * 6];
    switch (d.form) {
      case 'powder': {
        if (wall) {
          // a crust on the rock face, grains trickling from it
          sk.later(1, () => blob(sk, 1.2, 0, 2.2 + g, H * 0.45, pal.main, { rough: 0.25, grain: 1.4, ph: ph() }));
          sk.later(2, () => { for (let i = 0; i < 4; i++) sk.set(1 + (i % 2), H * 0.45 + 1 + i * 1.5, at(pal.main, 0.8)); });
        } else sk.later(1, () => blob(sk, 0, -H * 0.25, H * 0.55, H * 0.62, pal.main, { rough: 0.15, grain: 1.4, ph: ph() }));
        sk.later(3, () => { for (let i = 0; i < 6; i++) { const x = (rng.next() - 0.5) * (wall ? 3 : H), y = wall ? (rng.next() - 0.5) * H * 0.8 : -rng.next() * H * 0.3; if (sk.has(x, y)) { sk.set(x, y, at(pal.main, 1)); if (i < 3) sk.glint(x, y); } } });
        return;
      }
      case 'crust': {
        // needles blooming from the rock in tufts
        const m = 3 + (P.chunks > 2 ? 1 : 0);
        sk.later(0, () => blob(sk, wall ? 1 : 0, wall ? 0 : -1, wall ? 1.6 : H * 0.45, wall ? H * 0.45 : 1.6, pal.rock, { rough: 0.3, ph: ph() }));
        for (let i = 0; i < m; i++) {
          const off = (i / (m - 1) - 0.5) * H * 0.8, ox = Math.cos(tan) * off + (wall ? 1 : 0), oy = Math.sin(tan) * off;
          sk.later(1, () => {
            const k = 4 + Math.floor(rng.next() * 4);
            for (let j = 0; j < k; j++) {
              const a = nrm + (j / (k - 1) - 0.5) * 1.8, l = (4.5 + rng.next() * H * 0.5) * (0.65 + g * 0.35);
              for (let u = 0; u <= l; u += 0.5) sk.set(ox + Math.cos(a) * u, oy + Math.sin(a) * u, at(pal.main, u > l - 1 ? 1 : j % 2 ? 0.55 : 0.75));
              if (j % 3 === 0) sk.glint(ox + Math.cos(a) * l, oy + Math.sin(a) * l);
            }
          });
        }
        return;
      }
      case 'nugget': {
        // lumps of metal set in their matrix of rock
        const cx = wall ? 2 : 0, cy = wall ? 0 : -3.6;
        sk.later(0, () => blob(sk, cx, cy, wall ? 3 : H * 0.55, wall ? H * 0.55 : 4.8, pal.rock, { rough: 0.25, facets: 7, ph: ph() }));
        const m = 2 + P.chunks - 1;
        for (let i = 0; i < m; i++) {
          const off = (i / Math.max(1, m - 1) - 0.5) * H * 0.6, x = cx + Math.cos(tan) * off + Math.cos(nrm) * 1.5, y = cy + Math.sin(tan) * off + Math.sin(nrm) * 1.5, r = 1.4 + rng.next() * 1.4;
          sk.later(1, () => { blob(sk, x, y, r, r * 0.85, pal.main, { rough: 0.25, ph: ph(), lift: -0.1 }); sk.set(x - r * 0.4, y - r * 0.4, at(pal.main, 1)); sk.glint(x - r * 0.4, y - r * 0.4); });
        }
        return;
      }
      default: {
        if (P.hot) {
          // chunks fractured from the rock, embers glowing in their cracks
          const m = P.chunks;
          for (let i = 0; i < m; i++) {
            const big = i === 0, r = H * (big ? 0.5 : 0.3 + rng.next() * 0.12);
            const off = big ? 0 : (i % 2 ? 1 : -1) * H * 0.55, x = (wall ? r * 0.55 : 0) + Math.cos(tan) * off, y = (wall ? 0 : -r * 0.7) + Math.sin(tan) * off;
            sk.later(big ? 2 : 1, () => {
              blob(sk, x, y, r, r * 0.8, pal.main, { rough: 0.22, facets: 6, ph: ph(), lift: -0.4 });
              for (let k = 0; k < 2; k++) crack(sk, rng, x + (rng.next() - 0.5) * r, y + (rng.next() - 0.5) * r * 0.6, rng.next() * TAU, Math.round(r * 1.5), k ? EMBER[3] : EMBER[2], true);
            });
          }
          return;
        }
        // soft stone weathered into a pitted stack, its layers paler at their lips
        const m = wall ? 1 : 1 + (P.chunks > 2 ? 2 : 1);
        let y = 0;
        for (let i = 0; i < m; i++) {
          const rx = H * (0.62 - i * 0.16), ry = H * (0.34 - i * 0.06), cx = (wall ? rx * 0.6 : 0) + (i ? (rng.next() - 0.5) * rx * 0.5 : 0), cy = wall ? 0 : y - ry * 0.8;
          sk.later(1 + i, () => {
            blob(sk, cx, cy, rx, ry, pal.main, { rough: 0.2, ph: ph(), grain: 0.5 });
            for (let k = 0; k < 2 + Math.round(rx / 3); k++) {
              const hx = Math.round(cx + (rng.next() - 0.5) * rx * 1.2), hy = Math.round(cy + (rng.next() - 0.3) * ry);
              if (sk.has(hx, hy) && sk.has(hx + 1, hy) && sk.has(hx, hy - 1)) { sk.set(hx, hy, at(pal.main, 0)); sk.set(hx + 1, hy, at(pal.main, 0.2)); sk.set(hx, hy - 1, at(pal.main, 0.2)); }
            }
          });
          y = cy - ry * 0.6;
        }
      }
    }
  },

  shell(c) {
    const { sk, d, P, g, H, rng, pal, mount } = c;
    if (d.form === 'scale') {
      // scales shed in the ash, overlapping like shingles
      const wall = mount === 'wall';
      if (!wall) sk.later(0, () => blob(sk, 0, 0, H * 0.55, 2, pal.soil, { rough: 0.2, grain: 0.6 }));
      const rows = 3, per = 3;
      for (let rw = 0; rw < rows; rw++) for (let i = 0; i < per - rw; i++) {
        const x = wall ? 2 + rw * 2.5 : (i - (per - rw - 1) / 2) * 3.2, y = wall ? (i - (per - rw - 1) / 2) * 3.2 : -1.5 - rw * 2.6;
        sk.later(1 + rw, () => { blob(sk, x, y, 2.1, 2.4, pal.main, { ang: wall ? -0.4 : 0.2 * (i - 1) }); sk.set(x, y + 2, at(pal.main, 0)); sk.set(x - 1, y - 1, at(pal.main, 1)); sk.glint(x - 1, y - 1); });
      }
      return;
    }
    // mussels half sunk in the silt, one open on its pearl
    sk.later(0, () => blob(sk, 0, 0, H * 0.9, 1.6, pal.soil, { rough: 0.2, grain: 0.6 }));
    const m = 2 + (P.chunks > 2 ? 1 : 0);
    for (let i = 0; i < m; i++) {
      const x = (i - (m - 1) / 2) * H * 0.7, a = (rng.next() - 0.5) * 0.8 + (i % 2 ? 0.3 : -0.3), open = i === Math.floor(m / 2);
      sk.later(1 + (open ? 1 : 0), () => {
        if (open) {
          blob(sk, x - 1.5, -3.6, H * 0.4, Math.max(3.2, H * 0.3), pal.main, { ang: a - 0.7 });
          blob(sk, x + 1.5, -3.6, H * 0.4, Math.max(3.2, H * 0.3), pal.main, { ang: a + 0.7 });
          disc(sk, x, -3.2, 1.3, pal.pale, { lift: 0.3 });
          sk.set(x - 0.5, -3.8, at(pal.iris, 1));
          sk.glint(x - 0.5, -3.8);
        } else {
          blob(sk, x, -3.4, H * 0.46, Math.max(3.4, H * 0.4), pal.main, { ang: a });
          for (let u = -2; u <= 2; u += 2) sk.set(x + u * Math.cos(a), -3 + u * Math.sin(a), at(pal.main, 0.2));
        }
      });
    }
  },
};

// ------------------------------------------------------- the dangling vines

/**
 * Pendants: what hangs at the end of a dangling vine's threads, each drawn
 * from its anchor (x, y) downward at scale r. Every one gives light of its
 * own unless its hour is closed.
 * @type {Record<string, (sk:any, rng:Rng, x:number, y:number, r:number, pal:any, lit:boolean, ripe:boolean) => void>}
 */
const PENDANT = {
  // a faceted crystal point-down, a spark of dust beneath it
  icicle(sk, rng, x, y, r, pal, lit) {
    const rp = pal.crystal || pal.main, len = 3.4 * r, wid = Math.max(1.6, 1.5 * r);
    prism(sk, x, y, DOWN, len, wid, rp, { tip: 1.6 });
    if (lit) sk.emit(x, y + len * 0.45, at(pal.glow, 0.9));
    sk.set(x + (rng.next() < 0.5 ? -1 : 1) * (1 + r * 0.6), y + len + 1.5 + r * 0.8, at(pal.glow, 0.7));
  },
  // a drooping tulip: three petals closing over a pale throat
  bellbloom(sk, rng, x, y, r, pal, lit) {
    for (const a of [DOWN - 0.55, DOWN + 0.55, DOWN]) leaf(sk, x, y, a, 3.4 * r, 1.25 * r, pal.main, 'oval', { rib: null });
    leaf(sk, x, y, DOWN, 2.2 * r, 0.8 * r, pal.accent, 'lance', { rib: null });
    if (lit) sk.emit(x, y + 2.6 * r, at(pal.glow, 0.75));
    sk.set(x + (rng.next() < 0.5 ? -1 : 1), y + 4.2 * r, at(pal.main, 0.9));
  },
  // a clear bubble: dark rim, bright glint, a drop swelling beneath
  orb(sk, rng, x, y, r, pal, lit) {
    const R = 1.3 * r + 0.4;
    disc(sk, x, y + R, R, pal.main);
    for (let a = 0; a < 8; a++) sk.set(x + Math.cos(a * TAU / 8) * R, y + R + Math.sin(a * TAU / 8) * R, at(pal.main, 0.2));
    sk.set(x - R * 0.45, y + R - R * 0.45, at(pal.main, 1));
    if (lit) sk.emit(x + 0.5, y + R + 0.5, at(pal.glow, 0.7));
    sk.set(x, y + 2 * R + 1, at(pal.main, 0.7));
  },
  // a teardrop of molten light, still dripping
  teardrop(sk, rng, x, y, r, pal, lit) {
    const L = 4.4 * r;
    leaf(sk, x, y, DOWN, L, 1.5 * r, pal.main, 'pod', { rib: null, gloss: true });
    for (let j = 0; j < L * 0.55; j++) sk.set(x, y + L * 0.3 + j, at(pal.accent, 0.55 + 0.35 * (j / (L * 0.55))));
    if (lit) sk.emit(x, y + L * 0.62, at(pal.glow, 0.95));
    drip(sk, x, y + L + 0.5, 1 + Math.round(r), pal.main);
  },
  // a few bells on a nodding sprig, each flaring at its lip
  bluebell(sk, rng, x, y, r, pal, lit) {
    const n = 2 + Math.round(r), sg = rng.next() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const bx = x + sg * i * 1.5, by = y + 1.5 + i * 2.6 * r;
      stroke(sk, [[x, by - 1], [bx, by]], 1, 1, pal.stem);
      blob(sk, bx, by + 1.4, 1.2 * r + 0.2, 1.5 * r, pal.main);
      for (const f of [-1, 1]) sk.set(bx + f * (1.4 * r + 0.8), by + 1.4 + 1.5 * r, at(pal.main, 0.7));
      if (lit && i === n - 1) sk.emit(bx, by + 2.4, at(pal.glow, 0.8));
    }
  },
  // a netted pod: a lattice of two tones, tailing off into a drip
  netpod(sk, rng, x, y, r, pal, lit) {
    const R = 1.5 * r + 0.4, cy = y + R + 0.5;
    disc(sk, x, cy, R, pal.main);
    for (let j = -Math.ceil(R); j <= Math.ceil(R); j++) for (let i = -Math.ceil(R); i <= Math.ceil(R); i++) {
      if (i * i + j * j > R * R) continue;
      if ((i + j + 40) % 2 === 0) sk.set(x + i, cy + j, at(pal.main, 0.3));
    }
    sk.set(x - R * 0.4, cy - R * 0.4, at(pal.main, 1));
    if (lit) sk.emit(x, cy, at(pal.glow, 0.75));
    drip(sk, x, cy + R, 1 + Math.round(r * 1.5), pal.main);
  },
  // a bell of jelly trailing its tentacles
  jelly(sk, rng, x, y, r, pal, lit) {
    const R = 1.6 * r + 0.3, cy = y + R;
    blob(sk, x, cy, R, R * 0.85, pal.main, { keep: (i, j) => j <= 1 });
    sk.set(x - R * 0.4, cy - R * 0.5, at(pal.main, 1));
    if (lit) sk.emit(x, cy - 0.5, at(pal.glow, 0.85));
    const n = 2 + Math.round(r);
    for (let i = 0; i < n; i++) {
      const tx = x + (i / (n - 1) - 0.5) * R * 1.4;
      stroke(sk, walk(rng, tx, cy + 1, DOWN, 3 + r * 3 + rng.next() * 2, { jitter: 0.35 }), 1, 1, pal.main);
    }
  },
  // a puff of soft blossoms heaped round a core
  puffbloom(sk, rng, x, y, r, pal, lit) {
    const cy = y + 2.2 * r;
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + rng.next() * 0.4, d = 1.5 * r;
      disc(sk, x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, 1.2 * r + 0.2, pal.pale);
    }
    disc(sk, x, cy, 1.1 * r, pal.pale, { lift: 0.2 });
    if (lit) sk.emit(x, cy, at(pal.glow, 0.9));
    sk.glint(x - r, cy - r);
    sk.set(x + (rng.next() < 0.5 ? -1 : 1) * 2, y + 5.5 * r, at(pal.pale, 0.9));
  },
};

/**
 * A dangling vine: a clump on the roof, a thread winding down with a few
 * small leaves and side threads, and the pendants of its kind hanging along
 * it, the largest at the lowest thread. On any other mount it grows upward
 * (only when no roof has room), drawn mirrored.
 * @param {Ctx} c
 */
function dangle(c) {
  const { d, P, g, st, H, rng, pal, mount, closed } = c, dir = mount === 'hang' ? 1 : -1;
  const sk = /** @type {Sketch} */ (dir === 1 ? c.sk : /** @type {any} */ ({
    seed: c.sk.seed, k: c.sk.k, set: (x, y, k) => c.sk.set(x, -y, k), fine: (x, y, k) => c.sk.fine(x, -y, k), has: (x, y) => c.sk.has(x, -y), emit: (x, y, k) => c.sk.emit(x, -y, k),
    glint: (x, y) => c.sk.glint(x, -y), later: (z, fn) => c.sk.later(z, fn),
  }));
  const lit = !closed, pend = PENDANT[d.form] || PENDANT.orb, L = H * (1.05 + g * 0.5);
  // the clump it hangs from, on the roof
  sk.later(0, () => blob(sk, 0, 0, 2.4 + g, 1.4, pal.rock, { rough: 0.25, bumps: 0.1, ph: [rng.next() * 6, 1, 2] }));
  const pts = stem(sk, rng, 0, 0, DOWN + (rng.next() - 0.5) * 0.3, L, 1.4, 1, pal.stem, { jitter: 0.3 + P.jitter * 0.4, curl: (rng.next() - 0.5) * 0.14 });
  nodes(pts, 3, (x, y, a, t, i) => {
    if (t < 0.12 || t > 0.9) return;
    const side = i % 2 ? 1 : -1;
    sk.later(2, () => leaf(sk, x, y, a + side * 1.1, P.leafLen * 0.55 * Math.min(1, g + 0.3), P.leafW * 0.7, pal.leaf, P.leaf, { rib: null }));
  });
  // the pendants, from the thread's lower half down; ripe and mature ones grow bigger and brighter
  const m = [1, 2, 3 + (P.cluster > 4 ? 1 : 0)][st], base = 0.8 + g * 0.55;
  for (let k = 0; k < m; k++) {
    const t = m === 1 ? 1 : 0.42 + (k / (m - 1)) * 0.58, i = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
    const [px, py] = pts[i], side = k % 2 ? 1 : -1, r = base * (0.6 + 0.55 * t) * (0.92 + rng.next() * 0.16);
    // the last hangs straight from the tip; the others on a short thread to one side
    const ox = k === m - 1 ? 0 : side * (1.5 + rng.next() * 1.5), oy = k === m - 1 ? 0.5 : 1.5 + rng.next() * 1.5;
    sk.later(3, () => {
      if (ox || oy > 1) stroke(sk, [[px, py], [px + ox * 0.4, py + oy * 0.6], [px + ox, py + oy]], 1, 1, pal.stem);
      pend(sk, rng, px + ox, py + oy, r, pal, lit, g >= 0.95);
      // they shine: a share of the pendant's own pixels gives light
      if (lit) for (let j = 0; j < 7 * r + 2; j++) for (let i = -4; i <= 4; i++) {
        const X = px + ox + i, Y = py + oy + j;
        if (sk.has(X, Y) && hash2(X, Y, c.sk.seed) < 0.22) sk.emit(X, Y, at(pal.glow, 0.6 + 0.4 * hash2(Y, X, 7)));
      }
    });
  }
}

// ------------------------------------------------------- fruit among the leaves

/**
 * A fruiting twig: a leafy sprig hanging from a bough of the tree, and on
 * short stalks the round fruit of its kind — an apple (round, dimpled at the
 * stalk), a pear (a narrow neck swelling into a heavy base) or a plum (small,
 * in a pair or three, with a pale bloom). Green and small while ripening;
 * the species' colour, glossy, when mature. On the ground (only when no tree
 * has room) the twig lies mirrored.
 * @param {Ctx} c
 */
function orchard(c) {
  const { d, P, g, st, H, rng, pal, mount, closed } = c, dir = mount === 'bough' || mount === 'hang' ? 1 : -1;
  const sk = /** @type {Sketch} */ (dir === 1 ? c.sk : /** @type {any} */ ({
    seed: c.sk.seed, k: c.sk.k, set: (x, y, k) => c.sk.set(x, -y, k), fine: (x, y, k) => c.sk.fine(x, -y, k), has: (x, y) => c.sk.has(x, -y), emit: (x, y, k) => c.sk.emit(x, -y, k),
    glint: (x, y) => c.sk.glint(x, -y), later: (z, fn) => c.sk.later(z, fn),
  }));
  const ripe = g >= 0.95, body = ripe ? pal.main : pal.leaf, gl = ripe && !closed && P.glow ? pal.glow : null;
  // the twig: a short woody sprig with leaves, hanging from the bough
  const L = H * (0.7 + g * 0.3), pts = stem(sk, rng, 0, 0, DOWN + (rng.next() - 0.5) * 0.5, L, 1.3, 1, pal.wood, { jitter: 0.25, curl: (rng.next() - 0.5) * 0.12 });
  sk.later(0, () => blob(sk, 0, 0, 2.2, 1.2, pal.leaf, { bumps: 0.2 }));
  nodes(pts, 2, (x, y, a, t, i) => {
    if (t < 0.15) return;
    const side = i % 2 ? 1 : -1;
    sk.later(2, () => leaf(sk, x, y, a + side * 1.0, 3 * Math.min(1, g + 0.4), 1.5, pal.leaf, 'oval', { rib: pal.mark }));
  });
  const n = d.form === 'plum' ? [1, 2, 3][st] : [1, 1, 2][st], R = (d.form === 'plum' ? 2.5 : 3.6) * (0.55 + 0.45 * g) * (0.92 + P.berryR * 0.08);
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0.95 : 0.55 + (k / (n - 1)) * 0.45, [px, py] = pts[Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))];
    const side = k % 2 ? 1 : -1, ox = k === n - 1 ? side * 1.5 : side * (2.5 + rng.next() * 1.5), len = 1.5 + rng.next(), fy = py + len + R, fx = px + ox;
    sk.later(3, () => {
      stroke(sk, [[px, py], [px + ox * 0.5, py + len * 0.6], [fx, fy - R * 0.8]], 1, 1, pal.wood);
      if (d.form === 'pear') {
        // narrow neck, heavy base
        disc(sk, fx, fy - R * 0.55, R * 0.62, body);
        disc(sk, fx, fy + R * 0.3, R * 0.95, body);
      } else if (d.form === 'plum') {
        blob(sk, fx, fy, R * 0.9, R, body);
        for (let j = 0; j < R * 1.6; j++) sk.set(fx, fy - R + 0.5 + j, at(body, 0.25));
      } else {
        disc(sk, fx, fy, R, body);
        sk.set(fx, fy - R + 0.5, at(body, 0.1));
      }
      const hy = d.form === 'pear' ? fy + R * 0.1 : fy;
      if (ripe) { sk.set(fx - R * 0.45, hy - R * 0.45, at(body, 1)); sk.set(fx - R * 0.2, hy - R * 0.5, at(body, 0.9)); if (d.form === 'plum') sk.set(fx + R * 0.35, hy + R * 0.2, at(pal.pale, 0.7)); }
      if (gl) { sk.emit(fx, hy, at(gl, 0.8)); sk.emit(fx + 1, hy + 1, at(gl, 0.6)); }
      else sk.glint(fx - R * 0.45, hy - R * 0.45);
      if (k === 0 && ripe) leaf(sk, px + ox * 0.5, py + len * 0.4, -side * 0.6 + DOWN * 0.4, 2.6, 1.2, pal.leaf, 'oval', { rib: null });
    });
  }
}

const MOUNT_CODE = { ground: 0, hang: 1, wall: 2 };

/**
 * The plant (or deposit) of a species in the wilds at a growth stage, on its
 * mount and in one of its variants. A stone or shell does not grow: it is
 * the same at every stage; a crystal grows from a seed into its habit.
 * @param {any} d descriptor @param {number} stage 0 sprout, 1 ripe, 2 mature
 * @param {{closed?:boolean, mount?:string, variant?:number, flip?:boolean, k?:number}} [o] k: its definition (2: twice the scene's resolution)
 * @returns {{pix:Pixels, ax:number, ay:number, glints:number[][], glows:number[][], k:number}}
 */
export function growFrame(d, stage, o = {}) {
  const mount = frameMount(o.mount), st = d.botanical || d.form === 'crystal' || d.form === 'shard' ? Math.max(0, Math.min(2, stage | 0)) : 2, variant = (o.variant ?? 0) & 3;
  const P = growthParams(d);
  const seed = (d.seeds.morph ^ Math.imul(variant + 1, 0x9e3779b1) ^ Math.imul(MOUNT_CODE[mount] + 1, 0x85ebca6b)) >>> 0;
  // each variant a little taller or shorter than the next
  const vk = variant ? 0.84 + new Rng((d.seeds.morph + variant * 7919) >>> 0).next() * 0.3 : 1;
  const g = [0.4, 0.7, 1][st];
  const sk = new Sketch(mount, seed, o.k ?? 1);
  /** @type {Ctx} */
  const c = { sk, d, P, g, st, H: Math.min(26, P.h * vk * (mount === 'hang' ? 1.1 : 1) * (0.45 + 0.55 * g)), rng: new Rng(seed), pal: d.pal, mount, closed: !!o.closed };
  (DANGLERS.includes(d.form) ? dangle : ORCHARD.includes(d.form) ? orchard : BUILD[d.family] || BUILD.mineral)(c);
  sk.flush();
  return sk.frame(!!o.flip);
}

export function growthParams(d) {
  const p = baseGrowthParams(d), edits = artDomain('ingredients', d.id.key)?.growth || {};
  for (const [k, v] of Object.entries(edits)) if (typeof p[k] === typeof v) p[k] = v;
  return p;
}
