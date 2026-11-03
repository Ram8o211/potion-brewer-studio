// Ironstone Quarry, an open pit under a pale sky and far cliffs, or a mine
// worked deep in a cavern under a roof of stalactites dripping rust; in
// front the worked rock in cross-section — benches cut down in steps, dark
// cobbled stone holding pockets of rust, gold and quartz and
// flecked with ore, pillars left standing; timber scaffolds and a winding
// wheel, a mine adit framed in timber, a crane, a ladder against a face, a
// cart on its rails, crates, and torches and a lantern burning in the dark.

import { sky } from './paint.js';
import { palette, vary, streamOf } from './kit.js';
import { fillSolid, blob, ledges, paintTerrain, markOpen, glow, drips, silhouette, mountains, sunbeams } from './side.js';
import { caveFrame, farPillars, fog, moss, torch, ledgeTops } from './cave.js';
import { crane, ladder, cart, crate, beam, boulder, scaffold, wheel, cloud, spire } from './objects.js';
import { terrainTrees } from './trees.js';
import { Model } from '../geometry.js';
import { Rng } from '../../core/rng.js';

export function compose(cv, seed) {
  const W = cv.W, H = cv.H, s = (p) => streamOf(seed, 'quarry', p);
  const pal = vary(palette({
    rock: ['#5a5048', { spread: 0.55 }], timber: ['#6a4428', { spread: 0.5 }], rope: '#4a3a2a', ore: ['#5a4a46', { spread: 0.5 }], metal: '#5a5a62',
    seamC: ['#e8c040', { spread: 0.4, n: 4 }], leaf: ['#647e35', { spread: 0.45 }], leaf2: ['#85873e', { spread: 0.45 }], bark: ['#4a3e34', { spread: 0.45 }], cloud: ['#eef0f0', { spread: 0.3 }], gem: ['#f05e48', { spread: 0.5, n: 5, cool: 0.12 }],
  }), s('pal'), 0.8);
  // an open pit under the sky, or a mine worked deep in a cavern
  const fs = s('frame'), cave = fs.next() < 0.2;
  if (cave) {
    sky(cv, 0, H, ['#070504', '#0e0a08', '#16100c', '#1c140e']);
    farPillars(cv, { n: 7, fill: '#1a130e', rim: '#241a12', seed: s('far1').int(0, 1e9), w: [12, 24], floor: 180 });
    fog(cv, '#3a2a1c', 80, 200, 0.3, s('fog1').int(0, 1e9));
    farPillars(cv, { n: 4, fill: '#22180f', rim: '#30221a', seed: s('far2').int(0, 1e9), w: [20, 34], floor: 185, caps: true });
    caveFrame(cv, {
      seed: fs.int(0, 1e9), stones: ['#3a3028', '#2e2620', '#463a2e'], mortar: '#0c0806', dark: 0.4, roof: [10, 34], walls: [10, 12],
      stal: { n: 18, len: [6, 34], w: [3, 7], tip: '#c8702a' }, lip: ['#5a4a36', '#3a2e22'],
    });
  } else {
    sky(cv, 0, 150, ['#5a8ac0', '#8ab0d4', '#c8d8e0', '#e8e0d0']);
    const cr = s('clouds');
    for (let i = 0; i < 3; i++) cv.stamp(cloud(cr, cr.int(26, 50), cr.int(6, 10)), pal, cr.int(0, W), cr.int(10, 34), { outline: false, texture: 0 });
    mountains(cv, { base: 104, amp: 44, n: 8, seed: s('far').int(0, 1e9), fill: '#b0a498', lit: '#c8beb0', dark: '#9a8e82' });
    fog(cv, '#e0d8cc', 70, 120, 0.25, s('haze').int(0, 1e9));
    silhouette(cv, { base: 100, amp: 8, freq: 0.02, seed: s('far2').int(0, 1e9), fill: '#8a7e72', rim: '#a09486', rough: 3 });
    sunbeams(cv, 32, 52, 0.2);
  }
  // the benches: steps cut down from one side, each a level shelf over a sheer face
  const ts = s('terrain'), top = new Float32Array(W), right = ts.next() < 0.5;
  const steps = [ts.int(108, 118), ts.int(128, 138), ts.int(148, 156), ts.int(166, 176)];
  let x = 0;
  const edges = [];
  for (let k = 0; k < steps.length; k++) {
    const w = k === steps.length - 1 ? W - x : ts.int(64, 96);
    for (let i = x; i < Math.min(W, x + w); i++) top[right ? W - 1 - i : i] = steps[k] + (i - x < 2 ? -1 : 0);
    x += w;
    edges.push(right ? W - x : x);
  }
  fillSolid(cv, top);
  // pillars of rock left standing, their shelves jutting from the faces
  ledges(cv, top, ts, 8, { rise: [26, 34] });
  // a mine adit cut into one of the faces
  const ak = ts.int(0, 2), ax = right ? edges[ak] - 14 : edges[ak] + 14, ay = steps[ak + 1] - 8;
  blob(cv, ax, ay, 9, 7, ts.int(0, 1e9), 0, 0.1);
  for (let yy = ay; yy < steps[ak + 1]; yy++) for (let xx = ax - 9; xx <= ax + 9; xx++) if (cv.solid[yy * W + xx]) { cv.solid[yy * W + xx] = 0; cv.cave[yy * W + xx] = 1; }
  const ss = ts.int(0, 1e9);
  paintTerrain(cv, {
    a: '#5a5048', b: '#4e463e', grain: '#8a7e70', dark: '#1e1812', deep: '#0e0a08', cave: '#060404',
    crust: ['#fddf88', '#f7c069', '#e8b160'], crustH: 3, seed: ss,
    cobble: { stones: ['#4a3e34', '#3e342c', '#55483c', '#463a30', '#5a4c40', '#40362e'], mortar: '#080605', s: 10 },
    // under the gravel banded sandstone, a seam of grey rock, then the dark stone the ore is in
    layers: [
      { kind: 'banded', cols: ['#fdcc76', '#f7c069', '#fddf88', '#e8b160', '#a86e38'], h: [12, 18] },
      { kind: 'band', cols: ['#525d60', '#606766', '#787c74', '#34322e'], h: [4, 6] },
    ],
  });
  moss(cv, { cols: ['#8a7a5e', '#6a5c48', '#4a4034'], seed: ss + 1, drape: 5, rate: 0.08, len: 6 });
  // pockets of ore in the rock — rust, gold, quartz — and stray flecks glinting
  const fl = s('flecks'), ores = [[0xff2a5aa8, 0xff3a7ac8], [0xff3ab0e8, 0xff2a7ad0], [0xffd8e0e4, 0xffa8b0b4]];
  for (let i = 0; i < 18; i++) {
    const cx = fl.int(0, W - 1), cy = fl.int(100, H - 4), ore = ores[i % ores.length], r = fl.int(3, 6);
    for (let k = 0; k < r * r * 1.6; k++) {
      const a = fl.next() * Math.PI * 2, d = Math.sqrt(fl.next()) * r, xx = Math.round(cx + Math.cos(a) * d * 1.4), yy = Math.round(cy + Math.sin(a) * d);
      if (xx < 0 || xx >= W || yy < 0 || yy >= H || !cv.solid[yy * W + xx] || !cv.solid[(yy - 3) * W + xx]) continue;
      cv.set(xx, yy, ore[fl.next() < 0.7 ? 0 : 1]);
    }
  }
  for (let i = 0; i < 90; i++) {
    const xx = fl.int(0, W - 1), yy = fl.int(0, H - 1);
    if (!cv.solid[yy * W + xx]) continue;
    cv.set(xx, yy, fl.next() < 0.6 ? 0xff3ab0e8 : 0xff2a7ad0);
  }
  markOpen(cv);
  // the adit's timber frame
  const fm = new Model();
  beam(fm, [-9, 0], [-9, -15], 2.4); beam(fm, [9, 0], [9, -15], 2.4); beam(fm, [-11, -15], [11, -15], 2.6);
  cv.stamp(fm, pal, ax, steps[ak + 1], { claim: ++cv.nprops });
  cv.meta.adit = [ax, ay];
  // timber: a ladder up a face, the rails on the lowest bench and the cart on them,
  // the crane on the top bench, scaffolds, crates — each set down where it fits
  const tm = s('timber');
  // (never up the face the adit is cut into)
  const lk = ak === 1 ? 2 : ak === 2 ? 1 : tm.int(1, 2), lxx = right ? edges[lk] - 6 : edges[lk] + 6;
  cv.stamp(ladder(steps[lk + 1] - steps[lk] + 6, 0.05), pal, lxx, steps[lk + 1] + 1, { claim: ++cv.nprops });
  const r0 = right ? 0 : edges[2], r1 = right ? edges[2] : W, ry = steps[3] - 1;
  for (let i = r0; i < r1; i++) { cv.set(i, ry, pal.metal[4]); if (i % 6 === 0) { cv.set(i, ry, pal.timber[1]); cv.set(i + 1, ry, pal.timber[1]); } }
  const tcx = Math.round((r0 + r1) / 2) + tm.int(-30, 30);
  cv.place(cart(tm, 24), pal, tcx, { y: steps[3], sink: 0, foot: [13, 2], range: 60, x: [r0 + 16, r1 - 16] });
  // the crane on the top bench, its jib reaching out over the pit
  // (shorter where the roof or a ledge hangs low)
  const cx = right ? tm.int(W - 50, W - 24) : tm.int(24, 50), ch = tm.int(60, 72), cseed = tm.int(0, 1e9);
  for (let h = ch; h >= 36; h -= 8) {
    const cm = crane(new Rng(cseed), h);
    if (right) cm.transform(-1, 0, 0, 1, 0, 0, 1);
    if (cv.place(cm, pal, cx, { roots: [6, 2], range: 50, x: right ? [edges[0] + 4, W - 3] : [2, edges[0] - 4] })) break;
  }
  const wx = right ? tm.int(40, 120) : tm.int(W - 120, W - 40);
  cv.place(wheel(tm, tm.int(10, 14), tm.int(30, 40)), pal, wx, { roots: [8, 2], range: 80 });
  for (let i = 0; i < 2; i++) cv.place(scaffold(tm, tm.int(16, 26), tm.int(16, 30)), pal, tm.int(60, W - 60), { foot: [12, 2], range: 100 });
  for (let i = 0; i < 2; i++) cv.place(crate(tm.int(8, 11)), pal, tm.int(30, W - 30), { foot: [6, 2] });
  // sparse, dusty trees clinging to the benches
  terrainTrees(cv, s('trees'), pal, { n: cave ? 1 : 3, kinds: ['sparse', 'sparse', 'gnarl'], h: [30, 64], gap: 50, ledges: true, dark: cave ? 0.3 : 0, look: { mats: ['leaf', 'leaf2'] } });
  const br = s('rubble');
  for (let i = 0; i < 4; i++) cv.place(boulder(br, br.int(3, 6), br.int(2, 4)), pal, br.int(10, W - 10), { foot: [5, 1], range: 30 });
  const gems = s('gems');
  for (let i = 0; i < 2; i++) cv.place(spire(gems, gems.int(12, 19)), pal, gems.int(18, W - 18), { foot: [6, 2], range: 45 });
  // a lantern on its post, and torches on the shelves
  const lp = new Model();
  beam(lp, [0, 0], [0, -26], 2.4); beam(lp, [0, -26], [6, -26], 1.6);
  lp.poly([[4, -24], [8, -24], [8, -18], [4, -18]], 'seamC', { shade: 'flat', tone: 0.3 });
  const lat = cv.place(lp, pal, tm.int(40, W - 40), { foot: [3, 2], range: 80 });
  if (lat) {
    glow(cv, lat.fx + 6, lat.fy - 22, 40, [1, 0.7, 0.3], 0.55);
    cv.meta.lantern = [lat.fx + 6, lat.fy - 22];
  }
  glow(cv, ax, ay, 20, [1, 0.6, 0.25], 0.35);
  const tr = s('torches');
  for (const [x0, y0] of ledgeTops(cv, 3, tr.int(0, 1e9), 8)) {
    const h = tr.int(8, 12);
    if (!cv.clear(x0 - 1, y0 - h - 4, x0 + 2, y0 - 1)) continue;
    torch(cv, x0, y0, h); cv.block(x0 - 3, y0 - 14, x0 + 4, y0 + 1);
  }
  cv.meta.trickles = drips(cv, ss, 5);
  cv.meta.vignette = cave ? 0.32 : 0.14;
  cv.meta.wind = cave ? 0.3 : 0.8;
  cv.meta.horizon = 100;
}
