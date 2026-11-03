// Willow Bank, a river under the sky or through a cave: dark teal water running along the cave floor
// under chalky pillars of cobbled stone, their mossy caps hung with moss
// and crowned with cattails; mushrooms glowing cyan in the dark, a
// weeping willow on the bank, a roof of stalactites dripping vines, and
// far pillars fading into the river mist. In some worlds a footbridge
// crosses the stream.

import { sky } from './paint.js';
import { palette, vary, streamOf } from './kit.js';
import { heights, dip, raise, fillSolid, ledges, paintTerrain, pool, markOpen, surfaceAt, silhouette, mountains, treeShape } from './side.js';
import { caveFrame, farPillars, fog, vines, moss, glowShrooms, ledgeTops, veins, WATER_VEINS } from './cave.js';
import { reeds, beam, cloud } from './objects.js';
import { terrainTrees } from './trees.js';
import { Model } from '../geometry.js';

export function compose(cv, seed) {
  const W = cv.W, H = cv.H, s = (p) => streamOf(seed, 'river', p);
  const pal = vary(palette({
    leaf: ['#5d9c29', { spread: 0.5, cool: 0.12 }], leaf2: ['#85aa32', { spread: 0.48, cool: 0.12 }], bark: ['#684528', { spread: 0.5 }], reed: ['#4e7a2e', { spread: 0.5 }],
    cattail: '#7a3a22', timber: '#6a4a2e', cloud: ['#eef2f4', { spread: 0.3 }],
  }), s('pal'), 1);
  // Usually a cave oasis; some worlds have an open river bank.
  const fs = s('frame'), cave = fs.next() < 0.75;
  if (cave) {
    sky(cv, 0, H, ['#05090c', '#08121a', '#0c1c20', '#102624']);
    farPillars(cv, { n: 8, fill: '#0f1e1e', rim: '#162a28', seed: s('far1').int(0, 1e9), w: [10, 20], floor: 180, caps: true });
    fog(cv, '#1e4040', 90, 200, 0.35, s('fog1').int(0, 1e9));
    farPillars(cv, { n: 5, fill: '#142824', rim: '#1e3a32', seed: s('far2').int(0, 1e9), w: [16, 28], floor: 185, caps: true });
    fog(cv, '#24504a', 120, 210, 0.25, s('fog2').int(0, 1e9));
    const frame = caveFrame(cv, {
      seed: fs.int(0, 1e9), stones: ['#494c44', '#5a5b4e', '#41463e'], mortar: '#0b100d', dark: 0.2, roof: [10, 28], walls: [8, 9],
      stal: { n: 18, len: [8, 36], w: [3, 7] }, lip: ['#4e8a2e', '#2e5a22'],
    });
    vines(cv, frame.roof, { cols: ['#78af28', '#4f8a23', '#2c541a'], leaf: '#a3cd38', seed: fs.int(0, 1e9), rate: 0.24, len: [8, 58] });
  } else {
    sky(cv, 0, 170, ['#3a6eb4', '#6a9ad0', '#a8c8e0', '#d8e6e4']);
    const cr = s('clouds');
    for (let i = 0; i < 3 + cr.int(0, 2); i++) cv.stamp(cloud(cr, cr.int(30, 60), cr.int(7, 12)), pal, cr.int(0, W), cr.int(14, 50), { outline: false, texture: 0 });
    mountains(cv, { base: 118, amp: 70, n: 6, seed: s('m').int(0, 1e9), fill: '#7a8eb4', lit: '#98aacc', dark: '#64769c', snow: '#eef2f8' });
    fog(cv, '#c8d8e4', 80, 130, 0.3, s('haze').int(0, 1e9));
    const pines = silhouette(cv, { base: 122, amp: 8, freq: 0.02, seed: s('p').int(0, 1e9), fill: '#4e7a6a' });
    const pr = s('pines');
    for (let x = 2; x < W; x += pr.int(5, 11)) treeShape(cv, x, pines[x] + 2, pr.int(12, 22), 'pine', '#3e6a5a', pr.int(0, 1e9));
  }
  // the banks, the river bed between them, pillars rising from both
  const ts = s('terrain'), top = heights(W, ts.int(0, 1e9), { base: 168, amp: 8, freq: 0.012 });
  const rx = ts.int(150, 240), hw = ts.int(30, 38);
  dip(top, rx, hw, 28, 0.45);
  const bank = ts.next() < 0.5 ? ts.int(20, 90) : ts.int(300, 360);
  raise(top, bank, bank + ts.int(20, 40), Math.min(...top) - ts.int(6, 12), 3);
  fillSolid(cv, top);
  ledges(cv, top, ts, 8, { keep: [[rx - hw - 6, rx + hw + 6]], high: 1 });
  const ss = ts.int(0, 1e9);
  paintTerrain(cv, {
    a: '#8a7a62', b: '#c8c0a8', grain: '#e8e4d4', dark: '#2a2a22', deep: '#141612', cave: '#0a0c0a',
    // a bank of sand: pale on top, a sparse grass growing in it
    crust: ['#fefbc7', '#fce199', '#fbd88d', '#f6d187'], crustH: 3, seed: ss,
    cobble: { stones: ['#57524a', '#4a463e', '#625e54', '#3e3a34', '#56544a', '#4c4a42'], mortar: '#080807', s: 10, moss: ['#3e7226', '#6aa83a'] },
    grass: { cols: ['#5a9a3a', '#7ac04a', '#4a8a30'], tall: 4, rate: 0.32, flowers: ['#ffe58a', '#ffffff'] },
    // under the sand a seam of grey rock, then the river stones
    layers: [
      { kind: 'sand', cols: ['#fefbc7', '#fcdb91', '#dfba77', '#927d58'], h: [10, 15] },
      { kind: 'band', cols: ['#525d60', '#606766', '#787c74', '#34322e'], h: [3, 5] },
    ],
  });
  moss(cv, { cols: ['#7ac04a', '#4e8a34', '#3a6e2a', '#2a5020'], seed: ss + 1, drape: 12, rate: 0.3, len: 15 });
  const level = Math.round(Math.max(top[rx - hw], top[rx + hw])) + 5;
  cv.meta.river = pool(cv, rx - hw, rx + hw, level, { surface: '#b3ffff', body: ['#139eac', '#087d90', '#086375', '#064c60', '#063b4e'], see: 0.15, bed: ['#2a3a2e', '#34463a', '#1e2a22'] });
  veins(cv, cv.meta.river, WATER_VEINS(ss + 4, ['#5a9a98', '#2a6a68', '#1e5654', '#164442']));
  markOpen(cv);
  if (s('bridge').next() < 0.8) {
    // a footbridge from bank to bank
    const y = level - 4, m = new Model(), x0 = rx - hw - 4, x1 = rx + hw + 4;
    beam(m, [x0, y], [x1, y], 3);
    for (let x = x0 + 8; x < x1; x += 16) beam(m, [x, y - 8], [x, y + 1], 1.6);
    beam(m, [x0, y - 8], [x1, y - 8], 1.4);
    cv.stamp(m, pal, 0, 0, { dark: 0.2, claim: ++cv.nprops });
    cv.meta.bridge = [x0, x1, y];
  }
  // cattails on the pillars and at the water's edge
  const rr = s('reeds');
  for (const [x, y] of ledgeTops(cv, 5, rr.int(0, 1e9))) cv.place(reeds(rr, rr.int(10, 16), rr.int(3, 5), { heads: 0.7 }), pal, x, { y, range: 9 });
  for (const side of [-1, 1]) {
    let x = rx + side * (hw - rr.int(2, 10));
    while (cv.liquid[(surfaceAt(cv, x) - 1) * W + x] && x > 0 && x < W - 1) x += side;
    // on the bank, at the water's edge or as near it as there is room
    cv.place(reeds(rr, rr.int(12, 20), rr.int(4, 7), { heads: 0.6 }), pal, x + side * 4, { range: 30, step: 2, x: side < 0 ? [2, x + 4] : [x - 4, W - 3] });
  }
  // the weeping willow on the far bank
  const wr = s('willow');
  const look = { mats: ['leaf', 'leaf2'] };
  terrainTrees(cv, wr, pal, { n: 1, kinds: ['willow'], h: [70, 126], dark: 0.15, ledges: true, x: rx < W / 2 ? [rx + hw + 20, W - 10] : [10, rx - hw - 20], look });
  terrainTrees(cv, wr, pal, { n: 3, kinds: ['oak', 'gnarl'], shapes: ['spread', 'lean', 'tall'], h: [36, 80], gap: 40, ledges: true, look });
  cv.meta.glows = glowShrooms(cv, { n: cave ? 9 : 4, cap: '#2ab8d8', lit: '#b0f4ff', stem: '#c8dcd4', rgb: [0.25, 0.75, 0.95], seed: s('shrooms').int(0, 1e9) });
  cv.meta.vignette = cave ? 0.3 : 0.14;
  cv.meta.wind = cave ? 0.35 : 1;
  cv.meta.horizon = 116;
}
