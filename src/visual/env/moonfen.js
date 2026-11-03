// Moonfen, a haunted bog under the night sky, or in a cavern open to it
// through a rent in its roof: a starry sky and a haloed moon; below, ruined columns and
// arches standing in the blue dark and the mist; and in front the bog in
// cross-section — grey-blue cobbles under a crust of moss, mossy pillars
// dripping moss, still pools of black water holding the moon's light,
// willows hung with moss, a dead tree, a cairn, crystals and star-flowers
// glowing cold in the dark and banks of mist.

import { sky } from './paint.js';
import { palette, vary, streamOf } from './kit.js';
import { heights, dip, raise, fillSolid, ledges, paintTerrain, pool, markOpen, surfaceAt, glow, silhouette, treeShape } from './side.js';
import { caveFrame, farPillars, fog, vines, moss, ruins, glowShrooms, veins, WATER_VEINS } from './cave.js';
import { reeds, spire, cairn } from './objects.js';
import { terrainTrees } from './trees.js';
import { fbm2 } from '../noise.js';
import { pack } from '../color.js';

export function compose(cv, seed) {
  const W = cv.W, H = cv.H, s = (p) => streamOf(seed, 'moonfen', p);
  const pal = vary(palette({
    leaf: ['#278679', { spread: 0.45, cool: 0.15 }], leaf2: ['#307d96', { spread: 0.45, cool: 0.15 }], bloom: ['#c860a8', { spread: 0.5 }], moss: ['#3c9270', { spread: 0.45 }], bark: ['#49404b', { spread: 0.4 }], wood: '#5a4a3a', rock: ['#61677e', { spread: 0.45 }],
    reed: ['#2e4a34', { spread: 0.45 }], cattail: '#3a2a1e', gem: ['#6ac8f0', { spread: 0.6 }],
  }), s('pal'), 0.8);
  sky(cv, 0, H, ['#04050e', '#0a0f2a', '#121a40', '#1a2250']);
  // stars, a few bright ones crossed
  const st = s('stars');
  for (let i = 0; i < 140; i++) { const x = st.int(0, W - 1), y = st.int(0, 110), b = st.next(); cv.set(x, y, pack(b > 0.8 ? [0.95, 0.95, 1] : b > 0.4 ? [0.7, 0.72, 0.95] : [0.45, 0.48, 0.75])); }
  for (let i = 0; i < 5; i++) { const x = st.int(4, W - 4), y = st.int(4, 70), c = pack([0.85, 0.9, 1]); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]) cv.set(x + dx, y + dy, c); }
  // the moon and its halo, in the rent of the roof
  const fs = s('frame'), cave = fs.next() < 0.12, o0 = fs.int(70, 150), o1 = o0 + fs.int(140, 200);
  const mx = Math.round((o0 + o1) / 2) + s('moon').int(-30, 30), my = s('moon2').int(30, 44), mr = 12;
  glow(cv, mx, my, 80, [0.45, 0.5, 0.8], 0.4);
  const ms = s('craters').int(0, 1e9), crescent = s('phase').next() < 0.5;
  for (let y = my - mr; y <= my + mr; y++) for (let x = mx - mr; x <= mx + mr; x++) {
    if (Math.hypot(x - mx, y - my) > mr + 0.3) continue;
    // in some worlds a crescent: the dark of the moon is the sky behind it
    if (crescent && Math.hypot(x - mx - mr * 0.55, y - my + mr * 0.3) < mr * 0.95) continue;
    const l = fbm2(x * 0.25, y * 0.25, ms, 2) > 0.58 ? 0.8 : 0.95;
    cv.set(x, y, pack([0.86 * l + 0.1, 0.9 * l + 0.08, l]));
  }
  // the dark beyond: far pillars, ruined columns and arches, mist between
  if (cave) farPillars(cv, { n: 8, fill: '#0e1430', rim: '#141c3e', seed: s('far1').int(0, 1e9), w: [10, 20], floor: 180 });
  else {
    // the open bog: a black treeline against the night
    const tl = s('tl'), line = silhouette(cv, { base: 132, amp: 6, freq: 0.03, seed: tl.int(0, 1e9), fill: '#0e1430', rough: 3 });
    for (let x = 2; x < W; x += tl.int(7, 15)) treeShape(cv, x, line[x] + 2, tl.int(12, 26), tl.next() < 0.3 ? 'dead' : 'oak', '#0e1430', tl.int(0, 1e9));
  }
  fog(cv, '#2a3466', 90, 200, 0.3, s('fog1').int(0, 1e9));
  ruins(cv, { n: 5, fill: '#1a2246', line: '#0e1430', rim: '#2a3460', seed: s('ruins').int(0, 1e9), floor: 178 });
  fog(cv, '#30407a', 120, 210, 0.22, s('fog2').int(0, 1e9));
  if (cave) {
    const frame = caveFrame(cv, {
      seed: fs.int(0, 1e9), stones: ['#2a2e40', '#22263a', '#30344a'], mortar: '#08080e', dark: 0.4, roof: [26, 50], walls: [12, 14], open: [o0, o1],
      stal: { n: 14, len: [6, 28], w: [2, 6] }, lip: ['#2e6a56', '#1e4a3c'],
    });
    vines(cv, frame.roof, { cols: ['#2e6a56', '#1e4a3c', '#14322a'], leaf: '#3e8a6a', flower: '#8ff0ff', seed: fs.int(0, 1e9), rate: 0.3, len: [4, 50] });
  }
  // the bog: low ground, tussocks and a barrow, a pool in a hollow (dry ground is scarce here: one pool, a ledge or two more)
  const ts = s('terrain'), top = heights(W, ts.int(0, 1e9), { base: 166, amp: 8, freq: 0.02 });
  const bx = ts.int(40, W - 100);
  raise(top, bx, bx + ts.int(30, 50), Math.min(...top) - ts.int(10, 16), 4);
  const pools = [];
  for (let i = 0; i < 6 && pools.length < 1; i++) {
    const px = ts.int(30, W - 30), hw = ts.int(18, 30);
    if (px + hw > bx - 8 && px - hw < bx + 60) continue;
    if (pools.some((q) => Math.abs(q.x - px) < q.hw + hw + 16)) continue;
    pools.push({ x: px, hw, level: Math.round(top[px]) + 2 });
    dip(top, px, hw, ts.int(10, 16));
  }
  fillSolid(cv, top);
  ledges(cv, top, ts, 8, { keep: pools.map((p) => [p.x - p.hw - 4, p.x + p.hw + 4]), high: 1 });
  const ss = ts.int(0, 1e9);
  paintTerrain(cv, {
    a: '#1e1a18', b: '#2a2420', grain: '#4a4038', dark: '#0a0a10', deep: '#050508', cave: '#030305',
    crust: ['#7ae3be', '#40b59a', '#287a6c', '#205449'], crustH: 4, seed: ss,
    cobble: { stones: ['#283247', '#323850', '#3b425b', '#454f68', '#2e3a4c', '#3a4658'], mortar: '#020308', s: 10, moss: ['#1e4a3c', '#3e8a6a'] },
    grass: { cols: ['#2e6a52', '#3e8a6a', '#1e4a3c'], tall: 4, rate: 0.55, flowers: ['#8ff0ff', '#d8ff8a'] },
    // under the bog moss a dark peaty earth with pale pebbles, a seam of blue-grey rock, then the stones
    layers: [
      { kind: 'dirt', cols: ['#1d1c1c', '#24222a', '#33333b', '#404c54', '#516b6e', '#141416'], h: [6, 10] },
      { kind: 'band', cols: ['#33333b', '#404c54', '#516b6e', '#141416'], h: [3, 5] },
    ],
  });
  moss(cv, { cols: ['#3e8a6a', '#2e6a52', '#1e4a3c', '#14322a'], seed: ss + 1, drape: 10, rate: 0.25, len: 14 });
  cv.meta.pools = pools.map((p) => pool(cv, p.x - p.hw, p.x + p.hw, p.level, { surface: '#b0c4f0', body: ['#22346a', '#1a2a58', '#142046', '#0e1834'], see: 0.15, bed: ['#0e1a14', '#16261e', '#0a0e0c'] }));
  cv.meta.pools.forEach((p, i) => veins(cv, p, { ...WATER_VEINS(ss + 4 + i, ['#5a74b0', '#2a3e78', '#22346a', '#1a2a58']), to: '#0c1428', n: 3, reach: 40, rgb: [0.35, 0.45, 0.85] }));
  markOpen(cv);
  // willows hung with moss, a dead tree, reeds at the pools
  const wr = s('willows');
  const look = { mats: ['leaf', 'leaf2'], bloom: { mat: 'bloom', rate: 0.05 }, hang: { mat: 'moss', rate: 0.4, len: /** @type {[number, number]} */ ([4, 12]) } };
  terrainTrees(cv, wr, pal, { n: 2, kinds: ['gnarl', 'tiers'], h: [54, 96], dark: 0.06, gap: 120, look });
  terrainTrees(cv, wr, pal, { n: 2, kinds: ['dead', 'wisteria', 'gnarl'], shapes: ['lean', 'tall'], h: [36, 70], dark: 0.08, gap: 40, ledges: true, look });
  const rr = s('reeds');
  for (const p of pools) for (const side of [-1, 1]) {
    let x = p.x + side * p.hw;
    while (x > 0 && x < W - 1 && cv.liquid[(surfaceAt(cv, x) - 1) * W + x]) x += side;
    cv.place(reeds(rr, rr.int(10, 18), rr.int(3, 5), { heads: 0.4 }), pal, x + side * 4, { range: 24, step: 2, x: side < 0 ? [2, x + 4] : [x - 4, W - 3] });
  }
  // a cairn on the barrow, crystals glowing in the dark, star-flowers on the pillars
  const sr = s('stones');
  cv.place(cairn(sr, 6), pal, bx + sr.int(5, 25), { foot: [6, 2], range: 30 });
  const glows = [];
  for (let i = 0; i < 3; i++) {
    const at = cv.place(spire(sr, sr.int(12, 20)), pal, sr.int(16, W - 16), { foot: [5, 2], range: 40 });
    if (!at) continue;
    glow(cv, at.fx, at.fy - 7, 30, [0.3, 0.6, 0.95], 0.4);
    glows.push([at.fx, at.fy - 7]);
  }
  glows.push(...glowShrooms(cv, { n: 7, cap: '#7ae0f0', lit: '#e8ffff', stem: '#5a8a8a', rgb: [0.4, 0.85, 1], seed: s('flowers').int(0, 1e9) }));
  // banks of mist lying low over the bog, in flat bands
  const fm = s('mist').int(0, 1e9), mist = pack([0.4, 0.48, 0.72]);
  cv.wash(mist, (x, y) => {
    const band = Math.exp(-(((y - 160) / 8) ** 2)) * 0.35 + Math.exp(-(((y - 130) / 6) ** 2)) * 0.2;
    return band * (fbm2(x * 0.02, y * 0.05, fm, 3) > 0.5 ? 1 : 0.5);
  }, 100, H);
  cv.meta.glows = glows;
  cv.meta.moon = [mx, my];
  cv.meta.vignette = 0.3;
  cv.meta.wind = cave ? 0.4 : 0.7;
  cv.meta.horizon = 124;
}
