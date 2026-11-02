// The wilds' scene in the interface: each region's procedural environment
// (visual/env/scene.js) as a cached canvas, its foliage swaying in the wind,
// where each plant stands on its open ground, which plant a tap lands on,
// and the moving parts drawn over the still painting every frame (birds,
// motes, river glints, wisps, embers, the steam of the crags' vents).
// A finger sets the hanging strands of the scenery swinging (a vine from
// the cave's roof or a bough): each a hanging chain of links it pushes
// where it touches, bending there, the wave running down to its end and
// swinging on for seconds (SceneTouch). The trees and bushes of the
// painting stay put: they move with the wind alone.

import { artRevision } from '../studio/direction.js';
import { sceneOf, SCENE_W, SCENE_H } from '../visual/env/scene.js';
import { MIN_HIT } from './species-sprites.js';
import { hashString } from '../core/rng.js';
import { frameMount } from '../visual/growth.js';

export { SCENE_W, SCENE_H };

/** @type {Map<string, HTMLCanvasElement>} */
const canvases = new Map();

/** A region's painted scene as a canvas (browser), made once per world and region. @param {string} region @param {string} seed */
export function sceneCanvas(region, seed) {
  const k = artRevision() + ':' + region + ':' + seed;
  let cv = canvases.get(k);
  if (!cv) {
    cv = sceneOf(region, seed).pix.toCanvas();
    if (canvases.size >= 6) canvases.delete(/** @type {string} */ (canvases.keys().next().value));
    canvases.set(k, cv);
  }
  return cv;
}

/**
 * The wind over a region at column x and time t (seconds): a breeze slowly
 * rising, falling and turning about, waves running along with it through
 * the leaves, and now and then a gust sweeping across the scene, each of
 * its own strength (some cycles stay calm). About −1…2: what a group with a
 * sway of one pixel moves. `ph` sets the world's own weather.
 * @param {number} x @param {number} t @param {number} ph
 */
export function windAt(x, t, ph) {
  const breeze = 0.55 * Math.sin(t * 0.11 + ph) + 0.25 * Math.sin(t * 0.37 + ph * 2.1) + 0.15, dir = breeze >= 0 ? 1 : -1;
  const wave = 0.3 * Math.sin(t * 1.4 - dir * x * 0.03 + ph) + 0.15 * Math.sin(t * 2.7 - dir * x * 0.07 + ph * 3);
  let gust = 0;
  for (let i = 0; i < 2; i++) {
    const period = 9 + i * 5.3, at = (t + i * 3.7 + ph) / period, c = Math.floor(at), u = at - c, s = rnd(c * 2 + i, ph);
    if (s < 0.35) continue;
    const fx = dir > 0 ? -90 + u * (SCENE_W + 180) : SCENE_W + 90 - u * (SCENE_W + 180);
    gust += (s - 0.2) * 1.5 * Math.exp(-(((x - fx) / 60) ** 2));
  }
  return breeze + wave * (0.5 + Math.abs(breeze)) + dir * gust;
}

/**
 * Whether the segment from (x0, y0) to (x1, y1) passes through the box
 * [left, right] × [top, bottom] (clipping it side by side, Liang–Barsky).
 */
export function crosses(x0, y0, x1, y1, left, top, right, bottom) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - left], [dx, right - x0], [-dy, y0 - top], [dy, bottom - y0]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

/** Pull on a hanging strand, scene pixels per second² (what sets how slowly a long vine swings). */
const ROPE_G = 520;
/** How far apart a strand's links are (scene pixels): a vine bends at every one. */
const LINK = 4;

/**
 * The finger's hold on a scene's hanging strands (vines from a bough or
 * the cave's roof). Each strand is a hanging chain of links held at its
 * top: every link swings sideways under the pull of the links below it, so
 * a knock runs down the vine as a wave, its end whips, and it settles back
 * slowly. The finger pushes the links it passes — the vine bends where it
 * was touched and is dragged along with a slow finger. The trees and
 * bushes of the painting are left to the wind. Pure: the view pushes it as
 * the finger moves and steps it every frame.
 */
export class SceneTouch {
  /** @param {NonNullable<import('../visual/env/scene.js').Scene['sway']>} sw */
  constructor(sw) {
    const G = sw.amp.length;
    this.G = G;
    this.hang = sw.hang;
    this.amp = sw.amp;
    /** each group's box [x0, y0, x1, y1] */
    this.box = new Float32Array(G * 4);
    for (let g = 0; g < G; g++) { this.box[g * 4] = this.box[g * 4 + 1] = Infinity; this.box[g * 4 + 2] = this.box[g * 4 + 3] = -Infinity; }
    for (let i = 0; i < sw.k.length; i++) {
      const g = sw.g[i], k = sw.k[i], x = k % SCENE_W, y = (k - x) / SCENE_W, b = g * 4;
      if (x < this.box[b]) this.box[b] = x;
      if (y < this.box[b + 1]) this.box[b + 1] = y;
      if (x > this.box[b + 2]) this.box[b + 2] = x;
      if (y > this.box[b + 3]) this.box[b + 3] = y;
    }
    /** per strand: its first link's index in the arrays below and how many links it has (0: not a strand) */
    this.first = new Int32Array(G);
    this.links = new Uint8Array(G);
    let n = 0;
    for (let g = 0; g < G; g++) {
      // (only the scenery in front can be touched: the background trees are out of reach)
      if (!(this.hang[g] > 0) || (sw.far && sw.far[g])) continue;
      const len = this.box[g * 4 + 3] - this.box[g * 4 + 1] + 1;
      this.first[g] = n;
      this.links[g] = Math.max(2, Math.min(14, Math.round(len / LINK)));
      n += this.links[g];
    }
    /** each link's sideways offset (pixels) and speed */
    this.u = new Float32Array(n);
    this.w = new Float32Array(n);
    /** each strand's column (where its line hangs) */
    this.cx = new Float32Array(G);
    for (let g = 0; g < G; g++) this.cx[g] = (this.box[g * 4] + this.box[g * 4 + 2]) / 2;
    /** the strands swinging now */
    this.live = new Set();
    /** something is still moving */
    this.awake = false;
  }

  /** How far a strand is moved at height f (0 at its top, 1 at its end), in pixels. @param {number} g @param {number} f */
  offset(g, f) {
    const N = this.links[g];
    if (!N) return 0;
    const s = Math.max(0, Math.min(1, f)) * N, i = Math.floor(s), t = s - i, a = this.first[g];
    const at = (/** @type {number} */ j) => (j <= 0 ? 0 : this.u[a + Math.min(N, j) - 1]);
    return at(i) + (at(i + 1) - at(i)) * t;
  }

  /** Whether strand g is moving. @param {number} g */
  moving(g) { return this.live.has(g); }

  /**
   * The finger passed from (x0, y0) to (x1, y1) (scene pixels) within a
   * frame: every link of a strand it came within reach of is pushed along
   * with it (to the side of the finger it was knocked to). Returns how many
   * strands it touched.
   */
  push(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
    if (L2 < 0.25) return 0;
    // the finger's own speed sideways (a stroke is about a frame long)
    const vf = Math.max(-180, Math.min(180, dx * 60)), reach = 3.5;
    let n = 0;
    for (let g = 0; g < this.G; g++) {
      const N = this.links[g];
      if (!N) continue;
      const b = g * 4, len = this.box[b + 3] - this.box[b + 1] + 1, lk = len / N;
      // (quickly: only a strand whose reach the stroke crosses)
      const sw = Math.abs(this.offset(g, 1)) + 3;
      if (!crosses(x0, y0, x1, y1, this.box[b] - sw, this.box[b + 1] - 2, this.box[b + 2] + sw, this.box[b + 3] + 2)) continue;
      let hit = false;
      for (let i = 0; i < N; i++) {
        const k = this.first[g] + i, nx = this.cx[g] + this.u[k], ny = this.box[b + 1] + (i + 1) * lk;
        const t = Math.max(0, Math.min(1, ((nx - x0) * dx + (ny - y0) * dy) / L2));
        const qx = x0 + dx * t, qy = y0 + dy * t;
        if (Math.hypot(nx - qx, ny - qy) > reach) continue;
        hit = true;
        // carried along at the finger's speed, and put out of its way on the side it is going
        this.w[k] += (vf - this.w[k]) * 0.75;
        if (Math.abs(dx) > 0.2) {
          const side = Math.sign(dx), want = x1 + side * reach * 0.6 - this.cx[g];
          if ((want - this.u[k]) * side > 0) this.u[k] += (want - this.u[k]) * 0.6;
        }
      }
      if (hit) { this.live.add(g); n++; }
    }
    if (n) this.awake = true;
    return n;
  }

  /** Let the strands swing on by dt seconds. @param {number} dt */
  step(dt) {
    if (!this.awake) return;
    const h = 1 / 120, steps = Math.max(1, Math.round(Math.min(dt, 0.1) / h));
    for (const g of this.live) {
      const N = this.links[g], a = this.first[g], b = g * 4, lk = (this.box[b + 3] - this.box[b + 1] + 1) / N, u = this.u, w = this.w;
      const maxU = (this.box[b + 3] - this.box[b + 1]) * 0.45 + 2;
      for (let s = 0; s < steps; s++) {
        // a hanging chain: each link pulled toward its neighbours, the more the more chain hangs below it
        for (let i = 0; i < N; i++) {
          const k = a + i, up = i ? u[k - 1] : 0, below = N - i, acc = (ROPE_G / lk) * (below * (up - u[k]) - (i < N - 1 ? (below - 1) * (u[k] - u[k + 1]) : 0));
          // (air slows it, and a link moving apart from its neighbours more)
          const wUp = i ? w[k - 1] : 0, wDn = i < N - 1 ? w[k + 1] : w[k];
          w[k] += (acc - 0.45 * w[k] + 0.6 * (wUp + wDn - 2 * w[k])) * h;
        }
        for (let i = 0; i < N; i++) {
          const k = a + i;
          u[k] += w[k] * h;
          // a link stays a link: never pulled further sideways from the one above than it is long
          const up = i ? u[k - 1] : 0, gap = lk * 0.75;
          if (u[k] - up > gap) { u[k] = up + gap; if (w[k] > (i ? w[k - 1] : 0)) w[k] = i ? w[k - 1] : 0; }
          if (up - u[k] > gap) { u[k] = up - gap; if (w[k] < (i ? w[k - 1] : 0)) w[k] = i ? w[k - 1] : 0; }
          if (u[k] > maxU) u[k] = maxU; if (u[k] < -maxU) u[k] = -maxU;
        }
      }
      // still once it no longer moves a pixel anywhere
      let quiet = true;
      for (let i = 0; i < N && quiet; i++) if (Math.abs(u[a + i]) > 0.25 || Math.abs(w[a + i]) > 0.6) quiet = false;
      if (quiet) { for (let i = 0; i < N; i++) { u[a + i] = 0; w[a + i] = 0; } this.live.delete(g); }
    }
    this.awake = this.live.size > 0;
  }
}

/** @type {Map<string, SceneTouch>} */
const touches = new Map();

/** The finger's hold on a region's scenery (null where nothing sways). @param {string} region @param {string} seed */
export function sceneTouch(region, seed) {
  const k = artRevision() + ':' + region + ':' + seed;
  let t = touches.get(k);
  if (!t) {
    const sw = sceneOf(region, seed).sway;
    if (!sw) return null;
    t = new SceneTouch(sw);
    if (touches.size >= 3) touches.delete(/** @type {string} */ (touches.keys().next().value));
    touches.set(k, t);
  }
  return t;
}

/** Per sway group, its shift this frame: of the whole group, and further at a hanging strand's end. */
let shiftBuf = new Float32Array(0), tipBuf = new Float32Array(0);

/**
 * Paint a region's painting with its foliage moved by the wind at time t
 * into `out` (packed pixels, SCENE_W × SCENE_H): the bare painting, then
 * every swaying pixel shifted sideways with its group — a cluster as one,
 * a strand bending more toward its end, each fluttering a little on its own
 * — over what was painted behind it, never over what stands in front of it.
 * Pure: the same time paints the same pixels.
 * @param {NonNullable<import('../visual/env/scene.js').Scene['sway']>} sw @param {Uint32Array} out @param {number} t
 * @param {number} [wind] the region's wind strength (meta.wind) @param {number} [ph] the world's weather
 * @param {SceneTouch|null} [touch] the finger's push on top of the wind (a strand bends link by link)
 */
export function swayPixels(sw, out, t, wind = 1, ph = 0, touch = null) {
  out.set(sw.bare);
  const G = sw.amp.length, W = SCENE_W;
  if (shiftBuf.length < G) { shiftBuf = new Float32Array(G); tipBuf = new Float32Array(G); }
  for (let g = 0; g < G; g++) {
    const x = sw.gx[g], v = windAt(x, t, ph) * wind, a = sw.amp[g];
    shiftBuf[g] = a ? Math.max(-3, Math.min(3, a * (v * 0.7 + 0.15 * wind * Math.sin(t * (2.6 + (g % 5) * 0.37) + g * 1.7)))) : 0;
    // a strand's end follows the wind a moment late, whipping a little
    tipBuf[g] = sw.hang[g] * (windAt(x, t - 0.4, ph) * wind * 0.9 + 0.25 * wind * Math.sin(t * 2.1 + g * 2.3));
  }
  for (let i = 0; i < sw.k.length; i++) {
    const g = sw.g[i], k = sw.k[i];
    // (a strand the finger set swinging bends link by link)
    const dx = Math.round(shiftBuf[g] + tipBuf[g] * sw.f[i] + (touch && touch.live.has(g) ? touch.offset(g, sw.f[i]) : 0)), x = k % W + dx;
    if (x < 0 || x >= W) continue;
    if (sw.layer[k + dx] > sw.s[i]) continue;
    out[k + dx] = sw.c[i];
  }
}

/** @type {Map<string, {cv:HTMLCanvasElement, ctx:CanvasRenderingContext2D, img:ImageData, buf:Uint32Array, step:number, live:boolean}>} */
const frames = new Map();

/** How often the leaves are moved (per second): the wind's pixel steps are coarse, so this is plenty — */
const SWAY_RATE = 12;
/** — but what a finger has set moving is followed closely. */
const TOUCH_RATE = 30;

/**
 * A region's painting at time t with its foliage swaying in the wind
 * (browser): the still painting where nothing in it sways.
 * @param {string} region @param {string} seed @param {number} t seconds
 */
export function sceneFrame(region, seed, t) {
  const sc = sceneOf(region, seed);
  if (!sc.sway) return sceneCanvas(region, seed);
  const key = artRevision() + ':' + region + ':' + seed;
  let f = frames.get(key);
  if (!f) {
    const cv = document.createElement('canvas');
    cv.width = SCENE_W; cv.height = SCENE_H;
    const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')), img = ctx.createImageData(SCENE_W, SCENE_H);
    f = { cv, ctx, img, buf: new Uint32Array(img.data.buffer), step: -1, live: false };
    if (frames.size >= 3) frames.delete(/** @type {string} */ (frames.keys().next().value));
    frames.set(key, f);
  }
  const touch = touches.get(key), live = !!touch && (touch.awake || f.live);
  const step = live ? Math.floor(t * TOUCH_RATE) * 1e3 + 1 : Math.floor(t * SWAY_RATE);
  if (step !== f.step) {
    f.step = step;
    // (one more frame once the springs are still, to lay them back at rest)
    f.live = !!touch && touch.awake;
    swayPixels(sc.sway, f.buf, live ? Math.floor(t * TOUCH_RATE) / TOUCH_RATE : step / SWAY_RATE, sc.meta.wind ?? 1, (hashString(seed) % 1000) / 100, touch);
    f.ctx.putImageData(f.img, 0, 0);
  }
  return f.cv;
}

/** The room a plant keeps round itself where the ground allows (scene pixels). */
const ROOM = 2;

/**
 * @typedef {{w:number, h:number, ax:number, ay:number, m:Uint8Array}} Silhouette
 * @typedef {{x:number, y:number, flip:boolean, sup:number}} Anchor  a point something can be attached at: the open pixel next to its support (sup), facing away from it
 */

/** How the ground decides where a plant may stand: its mounts, weighted (the ground by default). */
const GROUND_ONLY = () => /** @type {[string, number][]} */ ([['ground', 1]]);

/**
 * The points of a scene where an ingredient can be attached other than the
 * open ground: the undersides of branches and leaves (bough), of ledges and
 * the cave's roof (ceiling) and of either (hang), the sides of upright rock
 * faces (wall) and of tree trunks (trunk), each with open air before it.
 * @param {import('../visual/env/scene.js').Scene} sc @returns {Record<string, Anchor[]>}
 */
export function findAnchors(sc) {
  const W = SCENE_W, H = SCENE_H, S = sc.solid, R = sc.rock, T = sc.trees, L = sc.liquid, P = sc.props;
  const stone = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !!(S[y * W + x] || R[y * W + x]);
  const tree = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !!T[y * W + x];
  const air = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !(S[y * W + x] || R[y * W + x] || T[y * W + x] || L[y * W + x] || P[y * W + x]);
  /** @type {Record<string, Anchor[]>} */
  const out = { hang: [], bough: [], ceiling: [], wall: [], trunk: [] };
  for (let y = 4; y < H - 12; y++) for (let x = 3; x < W - 3; x++) {
    const k = y * W + x;
    // a hold underneath: air below for a good drop
    if ((stone(x, y) || tree(x, y)) && air(x, y + 1) && air(x, y + 3) && air(x, y + 8) && air(x - 1, y + 2) && air(x + 1, y + 2)) {
      const a = { x, y: y + 1, flip: false, sup: k };
      // only the cave's rock holds the hanging vines' plants, not a bough
      if (!tree(x, y)) out.hang.push(a);
      out[tree(x, y) ? 'bough' : 'ceiling'].push(a);
    }
    for (const dir of [1, -1]) {
      // a sheer face of the ground: ground above and below, open air off it (not the far columns of the backdrop)
      if (S[k] && S[k - 3 * W] && S[k + 3 * W] && air(x + dir, y) && air(x + dir, y - 2) && air(x + dir, y + 2) && air(x + dir * 4, y)) out.wall.push({ x: x + dir, y, flip: dir < 0, sup: k });
      // a trunk: a narrow upright run of wood, open air off it
      // (a trunk, not a twig: the wood runs on down a good way)
      if (tree(x, y) && tree(x, y + 4) && tree(x, y + 8) && tree(x, y + 14) && air(x + dir, y) && air(x + dir * 4, y) && air(x + dir, y - 2) && air(x + dir, y + 2)) {
        let run = 0;
        for (let i = 0; i < 10 && tree(x - dir * i, y); i++) run++;
        if (run < 9 && !tree(x - dir * 9, y + 4) && !tree(x - dir * 9, y + 10)) out.trunk.push({ x: x + dir, y, flip: dir < 0, sup: k });
      }
    }
  }
  return out;
}

/**
 * Where the plants of a region grow. A plant keeps its spot once it has
 * one, so it grows in place. A new one takes one of the mounts its species
 * is found on (chosen by its id, weighted): on the ground, the open ground
 * nearest the random spot it came up at — its foot on open ground (never in
 * water, lava, a rock or a cliff) and its whole grown silhouette in front
 * of any scenery it overlaps (never peeking out from behind a trunk or a
 * bush); hanging from a branch, the leaves, a ledge or the roof; out of a
 * rock face or a tree's trunk — the nearest such hold with room below or
 * before it for the whole of its silhouette, clear of the rock, the water
 * and other scenery. Every plant keeps a little room from every other, so
 * a stand never crowds into a clump; a mount with no room left gives way
 * to the next, the ground last.
 */
export class PlantGround {
  /** @param {string} region @param {string} seed */
  constructor(region, seed) {
    const sc = sceneOf(region, seed);
    this.region = region;
    this.sc = sc;
    this.open = sc.open;
    this.depth = sc.depth;
    this.solid = sc.solid;
    this.top = Math.max(1, sc.top);
    /** the holds other than the ground, found when first needed @type {Record<string, Anchor[]>|null} */
    this.anchors = null;
    /** plant id → its spot in scene pixels, its mount and the silhouette it was placed with @type {Map<string, {x:number, y:number, s:Silhouette, mount:string, flip:boolean, light:number[]}>} */
    this.spots = new Map();
    /** the average brightness of the whole painting (what a spot is lit relative to), found when first needed @type {number|null} */
    this.mean = null;
  }

  /**
   * The light a plant stands in: how much brighter or darker the painting is
   * round its spot than the region on average, and the colour it is
   * (the lava's red, the fen's cold blue, the sun's gold), as the multiplier
   * to give its colours. Quantized, so a stand shares a few tints.
   * @param {number} x @param {number} y @param {string} mount @param {Silhouette} s
   * @returns {number[]}
   */
  lightAt(x, y, mount, s) {
    const px = this.sc.pix.px, W = SCENE_W, H = SCENE_H;
    if (this.mean === null) {
      let sum = 0, n = 0;
      for (let k = 0; k < px.length; k += 7) { const c = px[k]; sum += (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11; n++; }
      this.mean = Math.max(20, sum / n);
    }
    // the painting where the plant is: the box its silhouette covers, a little wider
    const x0 = Math.max(0, x - s.ax - 4), x1 = Math.min(W - 1, x - s.ax + s.w + 4), y0 = Math.max(0, y - s.ay - 3), y1 = Math.min(H - 1, y - s.ay + s.h + 3);
    let r = 0, g = 0, b = 0, n = 0;
    /** @type {number[]} */
    const samples = [];
    for (let j = y0; j <= y1; j += 2) for (let i = x0; i <= x1; i += 2) { const c = px[j * W + i]; r += c & 255; g += (c >>> 8) & 255; b += (c >>> 16) & 255; n++; samples.push(c); }
    if (!n) return [1, 1, 1];
    r /= n; g /= n; b /= n;
    const luma = Math.max(1, r * 0.3 + g * 0.59 + b * 0.11), bright = Math.max(0.62, Math.min(1.12, 0.6 + 0.4 * (luma / this.mean)));
    // the colour of the light: the surroundings' own, half way from white
    const q = (v) => Math.round(v * 12) / 12;
    // and the colour of the shadows round it (the darkest quarter of the painting there), which its outline takes on
    const lum = (/** @type {number} */ c) => (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11;
    const dark = samples.sort((u, v) => lum(u) - lum(v)).slice(0, Math.max(1, samples.length >> 2));
    const dk = [0, 8, 16].map((sh) => Math.round(dark.reduce((a, c) => a + ((c >>> sh) & 255), 0) / dark.length / 255 * 16) / 16);
    return [q(bright * (1 + 0.5 * (r / luma - 1))), q(bright * (1 + 0.5 * (g / luma - 1))), q(bright * (1 + 0.5 * (b / luma - 1))), ...dk];
  }

  /**
   * Each plant's spot, as fractions of the scene, and the mount it grows on.
   * @param {{id:string, x:number, y:number}[]} plants oldest first
   * @param {(p:any, mount?:string, flip?:boolean)=>Silhouette|null} shapeOf
   * @param {(p:any)=>[string, number][]} [mountsOf] the mounts a plant's species takes, weighted
   * @returns {Record<string, {x:number, y:number, mount:string, flip:boolean, light:number[]}>}
   */
  place(plants, shapeOf, mountsOf = GROUND_ONLY) {
    const W = SCENE_W, H = SCENE_H;
    /** @type {Record<string, {x:number, y:number, mount:string, flip:boolean, light:number[]}>} */
    const out = {};
    for (const p of plants) out[p.id] = { x: p.x, y: p.y, mount: 'ground', flip: false, light: [1, 1, 1] };
    const here = new Set(plants.map((p) => p.id));
    for (const id of [...this.spots.keys()]) if (!here.has(id)) this.spots.delete(id);
    const fresh = plants.filter((p) => !this.spots.has(p.id) && shapeOf(p));
    if (fresh.length) {
      const roomy = new Uint8Array(W * H), tight = new Uint8Array(W * H), free = new Uint8Array(W * H);
      const mark = (/** @type {{x:number, y:number, s:Silhouette}} */ q) => {
        stampMask(roomy, q.s, q.x, q.y, ROOM);
        stampMask(tight, q.s, q.x, q.y, 0);
      };
      for (const q of this.spots.values()) mark(q);
      for (const p of fresh) {
        // where it came up (gathering.js sprouts at 0.56..0.9 of the scene's height) maps onto this region's own ground,
        // mostly its lower half: the main ground and the low ledges fill before the high ones
        const ox = Math.round(p.x * W), oy = Math.round(this.top + (0.35 + 0.65 * Math.max(0, Math.min(1, (p.y - 0.56) / 0.34))) * (H - 4 - this.top));
        let spot = null;
        for (const mount of mountOrder(p.id, mountsOf(p))) {
          spot = mount === 'ground' ? this.onGround(p, shapeOf, ox, oy, roomy, tight, null) : this.onHold(p, shapeOf, mount, ox, oy, roomy, tight);
          if (spot) break;
        }
        // no room anywhere: the nearest open ground it fits at all, crowding the others
        if (!spot) spot = this.onGround(p, shapeOf, ox, oy, roomy, tight, free);
        const q = spot || { x: ox, y: oy, s: /** @type {Silhouette} */ (shapeOf(p)), mount: 'ground', flip: false };
        mark(q);
        this.spots.set(p.id, { ...q, light: this.lightAt(q.x, q.y, q.mount, q.s) });
      }
    }
    for (const [id, q] of this.spots) out[id] = { x: q.x / W, y: q.y / H, mount: q.mount, flip: q.flip, light: q.light };
    return out;
  }

  /**
   * The nearest open ground a plant fits on with room round it, else one
   * where it only crowds another plant — or, given `free`, else one where it
   * overlaps others, else the nearest open ground at all.
   * @param {any} p @param {Function} shapeOf @param {number} ox @param {number} oy @param {Uint8Array} roomy @param {Uint8Array} tight @param {Uint8Array|null} free
   */
  onGround(p, shapeOf, ox, oy, roomy, tight, free) {
    const W = SCENE_W, H = SCENE_H, G = this.open, D = this.depth, S = this.solid, L = this.sc.liquid;
    const s = /** @type {Silhouette} */ (shapeOf(p, 'ground', false));
    if (!s) return null;
    const sw = Math.max(3, Math.round(s.w * 0.3));
    /** @param {Uint8Array} taken @param {number} ax @param {number} ay */
    const fits = (taken, ax, ay) => {
      const left = ax - s.ax, top = ay - s.ay;
      if (ay < this.top || ay > H - 3 || left < 1 || left + s.w > W - 1 || top < 1 || top + s.h > H) return false;
      for (let y = ay - 1; y <= ay; y++) for (let x = ax - (sw >> 1); x < ax - (sw >> 1) + sw; x++) if (!G[y * W + x]) return false;
      for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
        if (!s.m[j * s.w + i]) continue;
        const k = (top + j) * W + left + i;
        // never behind scenery, never into the ground above its own foot (an overhang, a slope, a cave's roof), never into water or lava
        if (taken[k] || D[k] > ay || (S[k] && top + j < ay - 1) || L[k]) return false;
      }
      return true;
    };
    /** @type {[number, number, number][]} */
    const tries = [];
    for (let y = this.top; y <= H - 3; y++) for (let x = (y + ox) % 3; x < W; x += 3) if (G[y * W + x] && G[(y - 1) * W + x]) tries.push([(x - ox) ** 2 + ((y - oy) * 1.6) ** 2, x, y]);
    tries.sort((a, b) => a[0] - b[0]);
    const spot = tries.find(([, x, y]) => fits(roomy, x, y)) || tries.find(([, x, y]) => fits(tight, x, y)) || (free && (tries.find(([, x, y]) => fits(free, x, y)) || tries[0]));
    return spot ? { x: spot[1], y: spot[2], s, mount: 'ground', flip: false } : null;
  }

  /**
   * The nearest hold of a mount (hang, wall, trunk) a plant fits at, with
   * room round it (else crowding another plant), or null where there is none.
   * @param {any} p @param {Function} shapeOf @param {string} mount @param {number} ox @param {number} oy @param {Uint8Array} roomy @param {Uint8Array} tight
   */
  onHold(p, shapeOf, mount, ox, oy, roomy, tight) {
    const W = SCENE_W, H = SCENE_H, sc = this.sc, D = this.depth;
    if (!this.anchors) this.anchors = findAnchors(sc);
    const holds = this.anchors[mount];
    if (!holds || !holds.length) return null;
    const hangs = frameMount(mount) === 'hang';
    /** @type {Record<string, Silhouette|null>} */
    const shapes = { L: shapeOf(p, mount, true), R: shapeOf(p, mount, false) };
    /** @param {Uint8Array} taken @param {Anchor} a */
    const fits = (taken, a) => {
      const s = shapes[a.flip ? 'L' : 'R'];
      if (!s) return false;
      const left = a.x - s.ax, top = a.y - s.ay, onTree = !!sc.trees[a.sup], ref = D[a.sup];
      if (left < 1 || left + s.w > W - 1 || top < 1 || top + s.h > H - 1) return false;
      for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
        if (!s.m[j * s.w + i]) continue;
        // what holds it on (it may lie a pixel or two into a ceiling or face that is not quite flat), and right round the hold
        const X = left + i, Y = top + j, k = Y * W + X, near = (hangs ? Y - a.y <= 2 : (a.flip ? a.x - X : X - a.x) <= 2) || Math.abs(X - a.x) + Math.abs(Y - a.y) <= 3;
        if (taken[k] || sc.liquid[k] || sc.props[k]) return false;
        // clear of the rock and the trees but where it holds on; on a tree, never behind what stands before that tree
        if (!near && (sc.solid[k] || sc.rock[k] || (sc.trees[k] && !onTree))) return false;
        if (onTree && D[k] > ref) return false;
      }
      return true;
    };
    // the holds nearest where it came up, along the scene more than up or down it
    const tries = holds.map((a) => /** @type {[number, Anchor]} */ ([(a.x - ox) ** 2 + ((a.y - oy) * 0.35) ** 2, a])).sort((u, v) => u[0] - v[0]);
    const hit = tries.find(([, a]) => fits(roomy, a)) || tries.find(([, a]) => fits(tight, a));
    if (!hit) return null;
    const a = hit[1];
    return { x: a.x, y: a.y, s: /** @type {Silhouette} */ (shapes[a.flip ? 'L' : 'R']), mount, flip: a.flip };
  }
}

/**
 * The order a plant tries its species' mounts in: one chosen by its id
 * (weighted) first, then the others by weight.
 * @param {string} id @param {[string, number][]} prefs
 */
export function mountOrder(id, prefs) {
  const total = prefs.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let u = ((hashString('mount:' + id) % 10000) / 10000) * total, first = prefs[0][0];
  for (const [k, w] of prefs) { if (u < w) { first = k; break; } u -= Math.max(0, w); }
  return [first, ...prefs.filter(([k]) => k !== first).sort((a, b) => b[1] - a[1]).map(([k]) => k)];
}

/** Mark a silhouette standing at (ax, ay), grown by `grow`, in a scene grid. */
function stampMask(grid, s, ax, ay, grow) {
  const W = SCENE_W, H = SCENE_H, left = ax - s.ax, top = ay - s.ay;
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    if (!s.m[j * s.w + i]) continue;
    for (let y = Math.max(0, top + j - grow); y <= Math.min(H - 1, top + j + grow); y++) for (let x = Math.max(0, left + i - grow); x <= Math.min(W - 1, left + i + grow); x++) grid[y * W + x] = 1;
  }
}

/**
 * Where a plant is and what can be tapped: its frame's box placed by its
 * anchor (its foot, or the point it hangs or juts from), grown round its
 * middle to at least MIN_HIT square; `front` is its lowest row (what stands
 * nearer). A plant on the ground keeps a little more below its foot.
 * @param {{x:number, y:number, mount?:string}} p @param {{w:number, h:number, ax:number, ay:number}|null} f its frame @param {number} W @param {number} H
 */
export function plantBox(p, f, W = SCENE_W, H = SCENE_H) {
  const ax = Math.round(p.x * W), ay = Math.round(p.y * H);
  const w = f ? f.w : 16, h = f ? f.h : 16, x0 = ax - (f ? f.ax : w / 2), y0 = ay - (f ? f.ay : h);
  const cx = x0 + w / 2, cy = y0 + h / 2, hw = Math.max(w, MIN_HIT) / 2, hh = Math.max(h, MIN_HIT) / 2;
  const ground = !p.mount || p.mount === 'ground';
  // (a hanging or jutting plant's box also reaches the hold it is attached to)
  return { ax, ay, w, h, x0: Math.min(cx - hw, ax - 8), x1: Math.max(cx + hw, ax + 8), y0: ground ? Math.min(cy - hh, ay - MIN_HIT) : Math.min(cy - hh, ay - 10), y1: ground ? ay + 3 : Math.max(cy + hh, ay + 3), front: y0 + h };
}

/**
 * The plant under a scene point: the front-most (lowest on screen) box that
 * contains it, else the nearest box within `slop` pixels. Only plants are ever
 * hit — the scenery is part of the painting and never takes a tap.
 * @template {{x:number, y:number, mount?:string}} P
 * @param {P[]} plants @param {(p:P)=>{w:number, h:number, ax:number, ay:number}|null} frameOf @param {number} px @param {number} py @param {number} [W] @param {number} [H] @param {number} [slop]
 * @returns {P | null}
 */
export function hitPlant(plants, frameOf, px, py, W = SCENE_W, H = SCENE_H, slop = 5) {
  /** @type {P | null} */
  let best = null, bestY = -Infinity, near = null, nearD = slop * slop;
  for (const p of plants) {
    const b = plantBox(p, frameOf(p), W, H);
    if (px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1) {
      if (b.front > bestY) { bestY = b.front; best = p; }
      continue;
    }
    const dx = Math.max(b.x0 - px, 0, px - b.x1), dy = Math.max(b.y0 - py, 0, py - b.y1), dd = dx * dx + dy * dy;
    if (dd <= nearD) { nearD = dd; near = p; }
  }
  return best || near;
}

/** @param {CanvasRenderingContext2D} ctx */
function px(ctx, x, y, c, w = 1, h = 1) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

/** A disc of light added over the scene in flat rings (the pixel artist's glow). @param {CanvasRenderingContext2D} ctx */
function halo(ctx, x, y, r, c, a) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = c;
  for (let k = 3; k >= 1; k--) {
    ctx.globalAlpha = a * (4 - k) / 3;
    ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), Math.max(1, Math.round(r * k / 3)), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** A cheap repeatable pseudo-random number in [0, 1) for particle i. */
const rnd = (i, k = 0) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };

const STEAM = ['#fff0b0', '#f49e39', '#e56522', '#8a4a50', '#6a4457', '#4e3040'];

/** @type {Map<string, HTMLCanvasElement>} */
const puffs = new Map();
/**
 * A puff of smoke or steam as pixel art (cached): a scalloped disc of
 * radius r in its colour, lit on its upper left, shaded underneath, a
 * dark rim along its lower edge — no soft edges.
 * @param {number} r @param {string} c
 */
function puffSprite(r, c) {
  const k = r + c;
  let cv = puffs.get(k);
  if (cv) return cv;
  const n = r * 2 + 3, base = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const tone = (/** @type {number} */ f) => `rgb(${base.map((v) => Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f)).join(',')})`;
  cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5 - n / 2) / r, v = (y + 0.5 - n / 2) / r, a = Math.atan2(v, u), e = u * u + v * v - 0.1 * Math.abs(Math.sin(a * 3 + r));
    if (e > 1) continue;
    const lit = -(u * 0.6 + v * 0.8) + (1 - e) * 0.3;
    ctx.fillStyle = e > 0.78 && v > 0.15 ? tone(0.7) : lit > 0.55 ? tone(1.18) : lit > 0.05 ? tone(1.06) : lit > -0.45 ? tone(0.92) : tone(0.8);
    ctx.fillRect(x, y, 1, 1);
  }
  puffs.set(k, cv);
  return cv;
}
const EMBER = ['#fff4b0', '#ffd060', '#ff9a3a', '#e05a18', '#8a2a14'];

/** Grains of loose earth trickling from an overhang and landing in a puff. @param {CanvasRenderingContext2D} ctx */
function trickles(ctx, list, t, c, dust) {
  list.forEach(([x, y, fall], j) => {
    // each spout runs in bursts
    if (Math.sin(t * 0.7 + j * 2.3) < 0.2) return;
    for (let i = 0; i < 6; i++) {
      const age = (t * 0.9 + i / 6 + j * 0.37) % 1, d = age * age * fall;
      px(ctx, x + (rnd(i, j) > 0.7 ? 1 : 0), y + d, i % 2 ? c : dust);
    }
    if (Math.sin(t * 9 + j) > 0) px(ctx, x - 1 + Math.round(rnd(Math.floor(t * 9), j) * 2), y + fall - 1, dust);
  });
}

/** Shimmer on a liquid's surface: bright pixels sliding along it; lava bubbles that swell and pop. @param {CanvasRenderingContext2D} ctx */
function surface(ctx, p, t, c, lava) {
  if (!p) return;
  const w = p.x1 - p.x0;
  for (let i = 0; i < Math.max(3, w / 10); i++) {
    const x = p.x0 + ((rnd(i) * w + t * (lava ? 2 : 6) * (i % 2 ? 1 : -1)) % w + w) % w;
    if (lava) {
      const ph = (t * 0.8 + rnd(i, 3)) % 1;
      if (ph < 0.6) px(ctx, x, p.level - Math.floor(ph * 4), ph < 0.45 ? c : '#fff4b0', ph < 0.3 ? 2 : 1, 1);
    } else px(ctx, x, p.level + (i % 3), c, 2 + (i % 2), 1);
  }
}

/** Drip colours of each region's stalactites: [drop, splash]. */
const DRIP = { meadow: ['#8ac0e0', '#c8e4f4'], forest: ['#6aa0a0', '#a0d0c8'], netherwood: ['#8a7ac8', '#d0c0ff'], river: ['#7ad8d0', '#c8f4f0'], quarry: ['#c8803a', '#e8b070'], moonfen: ['#8ab0f0', '#d0e0ff'], crags: ['#ffb040', '#fff0a0'] };

/**
 * What every cavern has moving in it: drops falling from the stalactites'
 * tips, its falls (lava, water) running, its torches flickering and its
 * glowing mushrooms breathing light. @param {CanvasRenderingContext2D} ctx
 */
function cavern(ctx, region, t, meta) {
  const [drop, splash] = DRIP[region] || DRIP.river;
  (meta.tips || []).forEach(([x, y], j) => {
    if (j % 3) return;
    const ph = (t * 0.35 + rnd(j, 11)) % 1, H = SCENE_H, d = ph * ph * (H - y);
    if (ph < 0.12) px(ctx, x, y, drop);
    else if (y + d < H - 2) px(ctx, x, y + d, drop, 1, 2);
    else px(ctx, x - 1, H - 3, splash, 3, 1);
  });
  for (const [x, y0, y1, w] of meta.falls || []) {
    // bright streaks running down the fall
    for (let i = 0; i < Math.max(2, (y1 - y0) / 12); i++) {
      const y = y0 + ((t * 40 + rnd(i, x) * (y1 - y0)) % Math.max(1, y1 - y0));
      px(ctx, x - w + Math.floor(rnd(i, 2) * (w * 2 + 1)), y, '#fff4c0', 1, 3);
    }
    halo(ctx, x, y1 - 3, 8, '#ff8a2a', 0.06 + 0.04 * Math.sin(t * 7 + x));
  }
  for (const [x, y] of meta.torches || []) {
    halo(ctx, x, y, 12, '#ffb050', 0.1 + 0.05 * Math.sin(t * 9 + x) + 0.03 * Math.sin(t * 23 + x));
    if (Math.sin(t * 13 + x) > 0.3) px(ctx, x + (Math.sin(t * 5 + x) > 0 ? 1 : 0), y - 4, '#fff4b0');
  }
  if (region !== 'moonfen') for (const [x, y] of meta.glows || []) halo(ctx, x, y, 8, region === 'forest' ? '#ff9a40' : region === 'netherwood' ? '#b070ff' : '#4ad8f0', 0.06 + 0.04 * Math.sin(t * 1.7 + x));
}

/**
 * The moving parts of a region, drawn over its painting each frame: its
 * particles (pollen, motes, falling leaves, fireflies, wisps, embers, ash,
 * steam, trickling grit, the shimmer of water and lava) and its lights
 * flickering. Cheap: a few dozen pixels, positions from the time alone
 * (no state).
 * @param {CanvasRenderingContext2D} ctx @param {string} region @param {number} t seconds @param {string} seed
 */
export function animateRegion(ctx, region, t, seed) {
  const W = SCENE_W, H = SCENE_H, meta = sceneOf(region, seed).meta;
  if (meta.artAtmosphere !== undefined) {
    if (meta.artAtmosphere === 0) return;
    ctx.save(); ctx.globalAlpha *= Math.min(1, meta.artAtmosphere);
    for (let k = 0; k < Math.max(0, Math.floor((meta.artAtmosphere - 1) * 24)); k++) { ctx.fillStyle = '#b4e8d075'; ctx.fillRect((k * 71 + t * 4) % W, (k * 31 + t * 2) % H, 1, 1); }
  }
  cavern(ctx, region, t, meta);
  if (region === 'meadow') {
    // birds crossing the sky beyond the cave mouth, two wingbeats apart
    for (let i = 0; i < 3; i++) {
      const x = ((t * (7 + i * 2) + i * 130) % (W + 30)) - 15, y = 16 + i * 11 + Math.sin(t * 1.5 + i) * 3, up = Math.sin(t * 9 + i * 2) > 0 ? 1 : 0;
      for (const [dx, dy] of [[0, 0], [-1, -up], [1, -up], [-2, 1 - up * 2], [2, 1 - up * 2]]) px(ctx, x + dx, y + dy, '#2a2024');
    }
  }
  if (region === 'meadow') {
    for (let i = 0; i < 5; i++) {
      // butterflies over the field
      const x = W * (0.12 + i * 0.18) + Math.sin(t * 0.8 + i * 3) * 22, y = H * 0.6 + Math.sin(t * 1.6 + i) * 14, open = Math.sin(t * 13 + i) > 0;
      const c = ['#ffe58a', '#ff9fc7', '#ffffff', '#c9b7ff', '#ffb070'][i];
      px(ctx, x - (open ? 2 : 1), y, c, open ? 2 : 1, 2); px(ctx, x + 1, y, c, open ? 2 : 1, 2); px(ctx, x, y, '#2a1a12', 1, 2);
    }
    // pollen drifting up in the sun
    for (let i = 0; i < 18; i++) { const age = (t * 0.06 + rnd(i)) % 1; px(ctx, rnd(i, 1) * W + Math.sin(t + i) * 6, H * 0.8 - age * 120, age < 0.8 ? '#fff4c0' : '#e8d890'); }
    if (meta.hives) for (let i = 0; i < 6; i++) px(ctx, meta.hives[0] + Math.sin(t * 3 + i * 1.7) * 12, meta.hives[1] + Math.cos(t * 4.3 + i) * 6, i % 2 ? '#ffd040' : '#2a1a12');
    surface(ctx, meta.pond, t, '#ffffff', false);
  }
  if (region === 'forest') {
    // motes in the light shaft, and leaves falling, swaying
    const sx = meta.shaft || W / 2;
    for (let i = 0; i < 20; i++) {
      const y = (rnd(i) * H + t * 3) % H, x = sx + y * 0.45 + rnd(i, 2) * 50 + Math.sin(t * 0.6 + i) * 3;
      if (Math.sin(t * 2 + i * 1.7) > -0.2) px(ctx, x, y, '#fff2b0');
    }
    for (let i = 0; i < 5; i++) {
      const y = ((t * 8 + i * 47) % (H + 20)) - 10, x = (rnd(i, 4) * W + Math.sin(t * 1.3 + i) * 14) % W, flat = Math.sin(t * 3 + i) > 0;
      px(ctx, x, y, i % 2 ? '#c88a2a' : '#8aa83a', flat ? 2 : 1, flat ? 1 : 2);
    }
    trickles(ctx, meta.trickles || [], t, '#5a3a24', '#3a2618');
  }
  if (region === 'netherwood') {
    // spores drifting up from the glowing fungi, flickering as they rise
    for (let i = 0; i < 24; i++) {
      const age = (t * 0.04 + rnd(i)) % 1, x = rnd(i, 1) * W + Math.sin(t * 0.7 + i * 1.3) * 8, y = H * 0.85 - age * H * 0.7;
      if (Math.sin(t * 3 + i * 2.3) > -0.3) px(ctx, x, y, age < 0.7 ? (i % 3 ? '#d8b8ff' : '#a8f0ff') : '#7a6aa8');
    }
    if (meta.pool) surface(ctx, meta.pool, t, '#c8c0ff', false);
    trickles(ctx, meta.trickles || [], t, '#4a3a44', '#2e2430');
  }
  if (region === 'river') {
    surface(ctx, meta.river, t, '#e4f4ff', false);
    // now and then a fish leaps from the stream in an arc
    if (meta.river) {
      const ph = (t * 0.25) % 1, r = meta.river, fx = r.x0 + (r.x1 - r.x0) * rnd(Math.floor(t * 0.25), 5);
      if (ph < 0.25) { const u = ph / 0.25; px(ctx, fx + u * 14, r.level - Math.sin(u * Math.PI) * 10, '#c8d8e0', 2, 1); }
    }
    // dragonflies over the water
    for (let i = 0; i < 2; i++) { const r = meta.river || { x0: 0, x1: W, level: H / 2 }; px(ctx, r.x0 + (r.x1 - r.x0) * (0.3 + 0.4 * i) + Math.sin(t * 2.1 + i) * 20, r.level - 14 + Math.sin(t * 5 + i * 3) * 4, '#4ad0e0', 3, 1); }
  }
  if (region === 'quarry') {
    trickles(ctx, meta.trickles || [], t, '#b8a688', '#8a7e70');
    for (let i = 0; i < 10; i++) { const age = (t * 0.05 + rnd(i)) % 1; ctx.globalAlpha = 0.7; px(ctx, rnd(i, 1) * W + age * 30, 60 + rnd(i, 2) * 120 - age * 20, '#fff0d8'); ctx.globalAlpha = 1; }
    if (meta.lantern) halo(ctx, meta.lantern[0], meta.lantern[1], 12, '#ffb050', 0.1 + 0.05 * Math.sin(t * 9) + 0.03 * Math.sin(t * 23));
    if (meta.adit) halo(ctx, meta.adit[0], meta.adit[1], 7, '#ff9a40', 0.08 + 0.04 * Math.sin(t * 5));
  }
  if (region === 'moonfen') {
    for (let i = 0; i < 6; i++) {
      // wisps drifting over the bog
      const x = W * (0.08 + i * 0.16) + Math.sin(t * 0.6 + i * 2) * 14, y = H * 0.6 + Math.sin(t * 1.2 + i) * 9;
      halo(ctx, x, y, 8, '#5fd4e8', 0.12);
      px(ctx, x - 1, y - 2, '#8fe0ff', 2, 4); px(ctx, x - 1, y, '#e9fbff', 2, 2); px(ctx, x, y - 4 + Math.round(Math.sin(t * 8 + i)), '#5fd4e8', 1, 2);
    }
    // fireflies blinking
    for (let i = 0; i < 14; i++) {
      if (Math.sin(t * 2.5 + i * 2.1) < 0.4) continue;
      const x = (rnd(i) * W + Math.sin(t * 0.4 + i) * 12) % W, y = 110 + rnd(i, 1) * 80 + Math.sin(t * 0.9 + i) * 5;
      halo(ctx, x, y, 4, '#d8ff8a', 0.15); px(ctx, x, y, '#f4ffc0');
    }
    for (const [gx, gy] of meta.glows || []) halo(ctx, gx, gy, 12, '#70c8ff', 0.08 + 0.05 * Math.sin(t * 2 + gx));
    for (const p of meta.pools || []) surface(ctx, p, t, '#d8e4ff', false);
  }
  if (region === 'crags') {
    for (const v of meta.vents || []) {
      // steam: puffs lit by the vent, swelling, cooling to grey and drifting off
      for (let k = 13; k >= 0; k--) {
        const age = (t * 0.18 + k / 14) % 1, x = v.x + age * 10 + Math.sin(age * 5 + k) * (1 + age * 2), y = v.y - age * 46;
        const r = Math.max(2, Math.round(v.r * (0.6 + age * 1.3)));
        ctx.globalAlpha = age < 0.55 ? 0.75 : ((1 - age) / 0.45) * 0.75;
        const sp = puffSprite(r, STEAM[Math.min(STEAM.length - 1, Math.floor(Math.sqrt(age) * STEAM.length))]);
        ctx.drawImage(sp, Math.round(x - sp.width / 2), Math.round(y - sp.height / 2));
      }
      ctx.globalAlpha = 1;
      px(ctx, v.x - 1, v.y - 1 - (Math.sin(t * 9) > 0 ? 1 : 0), STEAM[0], 2, 2);
    }
    if (meta.crater) for (let k = 0; k < 6; k++) {
      const age = (t * 0.07 + k / 6) % 1;
      // smoke billowing up the painted plume, fading as it climbs
      ctx.globalAlpha = 0.6 * (1 - age) * Math.min(1, age * 6);
      const sp = puffSprite(Math.round(3 + age * 8), age < 0.2 ? '#8a4a3a' : '#5a4a50');
      ctx.drawImage(sp, Math.round(meta.crater[0] + age * age * 34 - sp.width / 2 + Math.sin(t * 0.5 + k) * 2), Math.round(meta.crater[1] - age * 44 - sp.height / 2));
    }
    ctx.globalAlpha = 1;
    // embers rising from the lava, cooling as they climb; ash falling
    const lava = meta.lava;
    for (let i = 0; i < 22; i++) {
      const age = (t * 0.3 + rnd(i)) % 1, x0 = lava ? lava.x0 + rnd(i, 1) * (lava.x1 - lava.x0) : rnd(i, 1) * W, y0 = lava ? lava.level : H * 0.8;
      px(ctx, x0 + Math.sin(t * 2 + i) * 4 * age + age * 8, y0 - age * 90, EMBER[Math.min(EMBER.length - 1, Math.floor(age * EMBER.length))]);
    }
    for (let i = 0; i < 12; i++) { const age = (t * 0.04 + rnd(i, 7)) % 1; px(ctx, (rnd(i, 8) * W + Math.sin(t * 0.7 + i) * 10) % W, age * H, '#6a5e5a'); }
    surface(ctx, lava, t, '#ffe680', true);
    if (lava) halo(ctx, (lava.x0 + lava.x1) / 2, lava.level, (lava.x1 - lava.x0) / 2 + 10, '#ff6a20', 0.06 + 0.03 * Math.sin(t * 3) + 0.02 * Math.sin(t * 11));
    trickles(ctx, meta.trickles || [], t, '#5a4e4c', '#3e3438');
  }
  if (meta.artAtmosphere !== undefined) ctx.restore();
}
