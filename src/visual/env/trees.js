// The two kinds of trees in a wild region. Background trees stand in rows
// behind the terrain, alike in kind and size and faded into the distance —
// a homogeneous wood. Terrain trees grow on the terrain itself, in the
// plane of the ground and its ledges: each takes a spot on a dry surface
// (the ground or a ledge's top) and a height and shape that fit there, and
// is placed only where none of it overlaps the terrain above its foot, the
// cave's rock, a prop or another terrain tree — a tall one where there is room, a
// small one under a ledge, none at all where nothing fits.

import { branchTree, tree } from './objects.js';
import { Rng } from '../../core/rng.js';
import { pack, hex } from '../color.js';

/**
 * A row of background trees standing on a line (drawn before the terrain,
 * so the ground and ledges cover their feet): one kind, sizes within a
 * narrow band, evenly spaced, faded toward `haze`.
 * @param {any} cv @param {any} rng @param {Record<string, number[]>} pal
 * @param {{line:ArrayLike<number>, gap:[number, number], h:[number, number], haze:string, fade:number, shape?:string, kind?:string, dy?:number, look?:any}} o
 */
export function treeRow(cv, rng, pal, o) {
  const haze = pack(hex(o.haze));
  const density = cv.meta.artDensity ?? 1;
  if (density === 0) return;
  o = { ...o, gap: [Math.max(2, o.gap[0] / density), Math.max(2, o.gap[1] / density)] };
  for (let x = rng.int(-6, 6); x < cv.W + 10; x += rng.int(o.gap[0], o.gap[1])) {
    const h = rng.int(o.h[0], o.h[1]), xi = Math.max(0, Math.min(cv.W - 1, x));
    const m = o.kind ? tree(rng, o.kind, h, Math.max(2, h / 16), { look: o.look }) : branchTree(rng, h, Math.max(2, h / 12), { shape: o.shape || 'tall', mats: o.look?.mats });
    // the far trees sway less: the wind barely shows at that distance
    cv.stamp(m, pal, x, Math.round(o.line[xi]) + (o.dy ?? 0), { haze: [haze, o.fade], outline: false, sway: 1 - o.fade * 0.8 });
  }
}

/**
 * Terrain trees: up to n trees on the dry surfaces, each fitted to its spot.
 * kinds: tree kinds to choose from (objects.js tree: 'oak' is the branch
 * tree; 'gnarl', 'tiers', 'willow', 'wisteria', 'sparse' the gnarled trees
 * of leaf clusters; 'dead', 'pine'); look: the region's leaves (their
 * ramps, blossoms and hanging strands); h: the height range (a tree shrinks to fit,
 * down to 45% of the height drawn for it); gap: least distance between
 * two feet; ledges: whether ledge tops are spots too.
 * @param {any} cv @param {any} rng @param {Record<string, number[]>} pal
 * @param {{n:number, kinds:string[], h:[number, number], gap?:number, ledges?:boolean, dark?:number, x?:[number, number], shapes?:string[], look?:any}} o
 * @returns {[number, number, number][]} the trees placed: foot x, foot y, height
 */
export function terrainTrees(cv, rng, pal, o) {
  o = { ...o, n: Math.round(o.n * (cv.meta.artDensity ?? 1)) };
  const W = cv.W, H = cv.H, S = cv.solid, gap = o.gap ?? 22, [xa, xb] = o.x || [4, W - 5];
  // the spots: dry surface pixels with room above them, away from liquids
  const spots = [];
  for (let y = 20; y < H - 2; y++) for (let x = xa; x <= xb; x++) {
    const k = y * W + x;
    if (!S[k] || S[k - W] || cv.liquid[k - W] || cv.rock[k - W]) continue;
    if (!o.ledges && cv.ground && y < cv.ground[x] - 4) continue;
    let wet = false;
    for (let i = -5; i <= 5 && !wet; i++) wet = x + i >= 0 && x + i < W && (cv.liquid[k - W + i] || cv.liquid[k + i]);
    if (!wet) spots.push([x, y]);
  }
  /** @type {[number, number, number][]} */
  const out = [];
  for (let tries = 0; tries < Math.min(60, Math.max(30, o.n * 8)) && out.length < o.n && spots.length; tries++) {
    const [x, y] = spots[Math.floor(rng.next() * spots.length)];
    if (out.some(([a, b]) => Math.abs(a - x) < gap && Math.abs(b - y) < 30)) continue;
    const kind = o.kinds[Math.floor(rng.next() * o.kinds.length)], shape = o.shapes ? o.shapes[Math.floor(rng.next() * o.shapes.length)] : undefined;
    const h0 = rng.int(o.h[0], o.h[1]), seed = rng.int(0, 1e9);
    for (let f = 1; f >= 0.45; f *= 0.8) {
      const h = Math.round(h0 * f), tw = Math.max(2, Math.round(h / 11)), fy = y + 2;
      // the same tree at every size tried (its own stream), scaled
      const m = tree(new Rng(seed), kind, h, tw, { shape, look: o.look });
      const ok = cv.stamp(m, pal, x, fy, {
        roots: [Math.max(4, tw * 1.5), 2], dark: o.dark,
        test: (p, X, Y) => {
          for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
            if (!(p.px[j * p.w + i] >>> 24)) continue;
            const xx = X + i, yy = Y + j;
            if (yy < 1 || xx < 0 || xx >= W) return false;
            if (yy >= H) continue;
            const k = yy * W + xx;
            // nothing of it in the terrain above its foot, the cave's rock, a liquid, a prop or another tree
            if ((S[k] && yy < fy - 3 - tw) || cv.rock[k] || cv.liquid[k] || cv.trees[k] || cv.props[k]) return false;
          }
          return true;
        },
      });
      if (!ok) continue;
      const p = ok.raster.pix;
      for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
        const xx = ok.x + i, yy = ok.y + j;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && p.px[j * p.w + i] >>> 24) cv.trees[yy * W + xx] = 1;
      }
      out.push([x, fy, h]);
      break;
    }
  }
  return out;
}
