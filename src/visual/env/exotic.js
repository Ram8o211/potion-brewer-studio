import { Rng, hashString } from '../../core/rng.js';
import { sky } from './paint.js';
import { heights, dip, raise, fillSolid, blob, paintTerrain, markOpen, col, pool, surfaceAt, ledges, silhouette, sunbeams } from './side.js';
import { caveFrame, farPillars, fog, vines, ruins, fall, moss, torch } from './cave.js';
import { palette } from './kit.js';
import { treeRow, terrainTrees } from './trees.js';
import { hash2 } from '../noise.js';
import { branchTree, spire, fern, cairn, mushroom } from './objects.js';

export const EXOTIC_ART = {
  skyshard: { sky: ['#284e85', '#4d98c0', '#85c8dc', '#d2ebdf'], rock: ['#424868', '#61637d', '#807f92'], turf: ['#a7d95c', '#78b342', '#4b793e'], gem: '#73d9fa', soil: '#524969' },
  morphgrove: { sky: ['#112331', '#284c55', '#426f6b', '#6d9e8c'], rock: ['#424951', '#555d60', '#6e7470'], turf: ['#a8cd5d', '#659b43', '#40683c'], gem: '#e89ccd', soil: '#5c3a43' },
  veil: { sky: ['#060a15', '#121e29', '#223842', '#385359'], rock: ['#343f4c', '#4c585c', '#616e6c'], turf: ['#a3c589', '#688767', '#405b51'], gem: '#c7a6ee', soil: '#383a48' },
  ghostglass: { sky: ['#020c20', '#092b45', '#104862', '#126875'], rock: ['#263b55', '#37526a', '#4a6980'], turf: ['#8bedf3', '#47b4c6', '#257b92'], gem: '#68e7ef', soil: '#31475d' },
  chronoglass: { sky: ['#584270', '#9d6f8d', '#dca788', '#f0d4a2'], rock: ['#665157', '#8b695f', '#ad866b'], turf: ['#f1d582', '#d5af62', '#a47d4b'], gem: '#d4a1f0', soil: '#92704c' },
};

export function composeExotic(cv, seed, id) {
  const rng = new Rng(`${id}:terrain-v1:${seed}`), a = EXOTIC_ART[id], W = cv.W, H = cv.H, nseed = hashString(seed + id);
  sky(cv, 0, H, a.sky);
  cv.meta.exotic = id; cv.meta.interactionPoints = [];
  cv.meta.pools = [];
  const pools = [];
  const treePal = palette({ bark: '#765043', wood: '#b38c62', leaf: '#63ab58', leaf2: '#c878bb', bloom: '#f2b7de', moss: '#63b59a' });
  const pal = palette({ bark: '#68434c', wood: '#9a6e59', leaf: id === 'morphgrove' ? '#b26999' : '#4b9a99', leaf2: '#749d69', rock: a.rock[1], gem: a.gem });
  if (id === 'skyshard') {
    // Distant islands and overlapping cloud banks establish open-air depth.
    for (let i = 0; i < 13; i++) {
      const x = rng.int(-10, W + 10), y = rng.int(20, H - 10), w = rng.int(10, 32);
      for (let yy = -4; yy < 5; yy++) for (let xx = -w; xx <= w; xx++) {
        if ((xx / w) ** 2 + (yy / 5) ** 2 < 1 + hash2(xx, yy, nseed + i) * 0.2) cv.set(x + xx, y + yy, col(yy < 1 ? '#deeff3' : '#aed4e6'));
      }
    }
    for (let i = 0; i < 8; i++) {
      const x = rng.int(0, W - 1), y = rng.int(35, 195), w = rng.int(7, 15);
      for (let j = 0; j < 13; j++) for (let k = -w + j; k <= w - j; k++) cv.set(x + k, y + j, col(j < 2 ? '#8dc6a4' : '#6b9eae'));
    }
    // Large sloping caps, irregular shoulders, and long mineral taproots.
    // These stay in the resource map. Small signature islands animate separately.
    for (let i = 0; i < 5; i++) {
      const x = 35 + i * 76 + rng.int(-10, 10), y = 87 + (i % 2) * 68 + rng.int(-10, 10), rx = rng.int(24, 34), depth = rng.int(28, 45);
      for (let yy = y; yy < Math.min(H, y + depth); yy++) {
        const u = (yy - y) / depth, half = rx * (1 - u ** 1.7) + (hash2(0, yy, nseed + i) - 0.5) * 4;
        for (let xx = Math.max(0, Math.ceil(x - half)); xx <= Math.min(W - 1, x + half); xx++) cv.solid[yy * W + xx] = 1;
      }
      cv.meta.interactionPoints.push([x + rng.int(-9, 9), Math.max(30, y - 42)]);
    }
    cv.ground = Float32Array.from({ length: W }, (_, x) => surfaceAt(cv, x));
    sunbeams(cv, 310, 12, 0.16);
  } else {
    const top = heights(W, nseed, { base: id === 'ghostglass' ? 187 : 176, amp: id === 'chronoglass' ? 17 : 9, freq: 0.012 });
    if (id === 'morphgrove') {
      for (let i = 0; i < 3; i++) raise(top, 24 + i * 130, 68 + i * 130, 153 - i % 2 * 14, 12);
      treeRow(cv, rng, treePal, { line: top.map((y) => y - 14), gap: [27, 40], h: [64, 94], haze: '#54837f', fade: 0.67, shape: 'lean' });
      treeRow(cv, rng, treePal, { line: top.map((y) => y - 5), gap: [38, 54], h: [74, 105], haze: '#427a73', fade: 0.4, shape: 'spread' });
      dip(top, 210, 26, 22); pools.push({ x0: 184, x1: 236, level: Math.round(top[184]) + 2 });
    }
    if (id === 'veil') {
      dip(top, 192, 44, 28); pools.push({ x0: 149, x1: 235, level: 191 });
      treeRow(cv, rng, treePal, { line: top.map((y) => y - 8), gap: [33, 47], h: [74, 110], haze: '#273f48', fade: 0.78, shape: 'lean' });
    }
    if (id === 'ghostglass') {
      for (let i = 0; i < 5; i++) { const x = 17 + i * 83; raise(top, x, x + 40, 106 + i % 3 * 29, 8); }
      pools.push({ x0: 0, x1: W - 1, level: 186 });
    }
    if (id === 'chronoglass') {
      silhouette(cv, { base: 134, amp: 13, freq: 0.013, seed: nseed + 1, fill: '#b58785', rough: 2 });
      silhouette(cv, { base: 157, amp: 12, freq: 0.018, seed: nseed + 2, fill: '#c99c83', rough: 2 });
      ruins(cv, { n: 9, fill: '#99747e', line: '#79576b', rim: '#bd9696', seed: nseed, floor: 171 });
    } else if (id !== 'morphgrove') farPillars(cv, { n: 7, fill: a.sky[1], rim: a.sky[2], seed: nseed, w: [8, 18], floor: 184, caps: false });
    fog(cv, a.sky[2], 75, 195, id === 'veil' ? 0.2 : 0.1, nseed);
    fillSolid(cv, top);
    if (id === 'morphgrove' || id === 'veil' || id === 'chronoglass') ledges(cv, top, rng, 5, { high: id === 'chronoglass' ? 2 : 1, keep: pools.map((p) => [p.x0 - 4, p.x1 + 4]) });
    for (let i = 0; i < 4; i++) blob(cv, rng.int(30, W - 30), rng.int(188, 210), rng.int(12, 26), rng.int(6, 10), rng.int(0, 1e9), 0, 0.17);
    if (id === 'veil') {
      const frame = caveFrame(cv, { seed: nseed, stones: a.rock, mortar: '#050a11', roof: [9, 20], walls: [7, 7], dark: 0.15, stal: { n: 10, len: [5, 17] } });
      vines(cv, frame.roof, { cols: ['#8a6aa0', '#5f5274', '#3b3c58'], seed: nseed, rate: 0.34, len: [18, 62], leaf: '#8c81b0', flower: '#c6a2f5' });
    }
  }
  paintTerrain(cv, { a: a.soil, b: a.rock[0], grain: a.rock[2], dark: '#101520', deep: a.sky[0], cave: a.sky[0], crust: a.turf, crustH: 3, seed: nseed,
    cobble: { stones: a.rock, mortar: '#101422', s: id === 'chronoglass' ? 9 : 7 },
    layers: [{ kind: id === 'chronoglass' ? 'sand' : 'dirt', cols: [a.soil, a.rock[0], a.rock[2], a.soil, a.rock[1], a.sky[0]], h: [5, 10] }],
    grass: id === 'chronoglass' ? undefined : { cols: a.turf, tall: 3, rate: 0.3 },
  });
  markOpen(cv);
  if (id === 'morphgrove') {
    terrainTrees(cv, rng, treePal, { n: 7, kinds: ['gnarl', 'oak', 'tiers'], shapes: ['lean', 'spread'], h: [56, 99], gap: 25, ledges: true, look: { mats: ['leaf', 'leaf2'], bloom: { mat: 'bloom', rate: 0.08 } } });
    for (let i = 0; i < 4; i++) {
      const x = 36 + i * 100, y = surfaceAt(cv, x);
      cv.place(mushroom(rng, rng.int(12, 20), rng.int(9, 15), { cap: 'leaf2', stem: 'wood' }), treePal, x, { roots: [3, 1], range: 20 });
      cv.meta.interactionPoints.push([x, Math.max(35, y - 23)]);
    }
  }
  if (id === 'skyshard' || id === 'veil' || id === 'chronoglass') {
    const x = id === 'skyshard' ? 181 : id === 'veil' ? 285 : 77, y = surfaceAt(cv, x);
    gate(cv, x, y, id === 'chronoglass' ? '#b18b61' : '#7e9894', id === 'skyshard' ? '#a9eaff' : id === 'veil' ? '#d2bded' : '#f9d68f');
    if (id === 'veil') { torch(cv, x - 15, y - 5, 8); torch(cv, x + 15, y - 5, 8); }
  }
  if (id === 'skyshard') terrainTrees(cv, rng, treePal, { n: 3, kinds: ['gnarl'], shapes: ['spread'], h: [20, 32], gap: 45, ledges: true, look: { mats: ['leaf'] } });
  if (id === 'morphgrove' || id === 'veil') moss(cv, { cols: a.turf, seed: nseed + 5, drape: 9, rate: 0.24, len: 12 });
  for (const p of pools) cv.meta.pools.push(pool(cv, p.x0, p.x1, p.level, { surface: id === 'ghostglass' ? '#76e4ee' : '#b2d9dc', body: ['#286a7c', '#1b526a', '#14394f'], see: 0.12 }));
  if (id === 'ghostglass') {
    for (let i = 0; i < 9; i++) coral(cv, 22 + i * 42 + rng.int(-8, 8), surfaceAt(cv, 22 + i * 42), rng.int(15, 33), i % 2 ? '#de86d9' : '#62dbe1', nseed + i);
    for (let i = 0; i < 5; i++) cv.light([0.22, 0.6, 0.9], (x, y) => Math.max(0, 1 - Math.abs(x - i * 95 + y * 0.45) / 9) * 0.11, 0, H);
  }
  for (let i = 0; i < 9; i++) {
    const x = rng.int(12, W - 12), y = surfaceAt(cv, x);
    if (y < 30 || y >= H - 5) continue;
    if (id !== 'morphgrove') cv.place(spire(rng, rng.int(9, 25)), pal, x, { seed: nseed + i, roots: [1, 3] });
    else cv.place(fern(rng, rng.int(8, 14)), pal, x, { seed: nseed + i });
    cv.pending.push([x, y - 10, 22, id === 'chronoglass' ? [0.6, 0.3, 1] : [0.25, 0.7, 1], 0.3]);
    if (id !== 'skyshard' && id !== 'morphgrove') cv.meta.interactionPoints.push([x, y - 12]);
  }
  if (id === 'chronoglass') cv.meta.sandfalls = cv.meta.interactionPoints.slice(0, 4);
  // Pools were painted after the first surface pass: erase their old slots.
  for (let k = 0; k < cv.open.length; k++) if (cv.liquid[k] || (k >= W && cv.liquid[k - W])) cv.open[k] = 0;
  cv.meta.vignette = id === 'veil' ? 0.3 : 0.12; cv.meta.wind = id === 'skyshard' ? 1.4 : 0.6;
}

export const skyshard = { compose: (cv, seed) => composeExotic(cv, seed, 'skyshard') };
export const morphgrove = { compose: (cv, seed) => composeExotic(cv, seed, 'morphgrove') };
export const veil = { compose: (cv, seed) => composeExotic(cv, seed, 'veil') };
export const ghostglass = { compose: (cv, seed) => composeExotic(cv, seed, 'ghostglass') };
export const chronoglass = { compose: (cv, seed) => composeExotic(cv, seed, 'chronoglass') };

/** Broken domestic-scale stone arch; scenery only, never a false plant surface. */
function gate(cv, x, y, stone, gem) {
  if (y > cv.H - 8 || y < 50) return;
  const base = col(stone), edge = col('#343742'), glow = col(gem), h = 31;
  for (let yy = y - h; yy < y; yy++) for (const side of [-1, 1]) for (let j = 0; j < 5; j++) {
    const xx = x + side * 13 + j - 2;
    cv.set(xx, yy, (yy % 7 === 0 || j === 4) ? edge : base);
  }
  for (let xx = -14; xx <= 16; xx++) for (let j = 0; j < 5; j++) cv.set(x + xx, y - h + j, j === 4 || xx % 7 === 0 ? edge : base);
  for (let j = -3; j <= 3; j++) { cv.set(x + j, y - 18, glow); cv.set(x, y - 18 + j, glow); }
  cv.glow(x, y - 18, 20, [0.5, 0.75, 0.95], 0.25);
  cv.block(x - 19, y - 36, x + 19, y + 1);
}

/** Branching reef fans with lit tips and darker attachment points. */
function coral(cv, x, y, height, color, seed) {
  const dark = col('#315e81'), mid = col(color), hi = col('#e6efff');
  for (let branch = -2; branch <= 2; branch++) {
    const end = height * (0.65 + hash2(branch, 0, seed) * 0.35);
    for (let j = 0; j < end; j++) {
      const xx = x + Math.round(branch * j * 0.18 + Math.sin(j * 0.22 + branch) * j * 0.05), yy = y - j;
      cv.set(xx, yy, mid); cv.set(xx + 1, yy, j > end - 3 ? hi : dark);
      if (j > 4 && j % 6 === 0) for (let k = 0; k < 5; k++) cv.set(xx + Math.sign(branch || 1) * k, yy - k, mid);
    }
  }
  cv.glow(x, y - height * 0.6, 23, [0.3, 0.7, 0.9], 0.24);
  cv.block(x - 12, y - height, x + 12, y + 1);
}
