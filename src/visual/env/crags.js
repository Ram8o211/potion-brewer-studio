// Ember Crags: a volcanic cavern (red-black gloom, far pillars in a haze
// of heat, a roof of stalactites with glowing tips, lava pouring from it)
// or the open slopes under a smoking cone. In front the volcanic ground in
// cross-section — dark cobbled basalt with glowing veins seeping from the
// lava pool into the rock under a crust of ash and scorched moss, pillars
// dripping moss, a lava tube, the pool lighting everything round it,
// basalt columns, fire-glass, charred brush and the steaming vents. All
// the lava in the ground is the pool's: no seams of it elsewhere.

import { sky } from './paint.js';
import { palette, vary, streamOf } from './kit.js';
import { heights, dip, raise, fillSolid, blob, ledges, paintTerrain, pool, markOpen, glow, drips, silhouette, col, rockFace } from './side.js';
import { caveFrame, farPillars, fog, moss, fall, veins, LAVA_VEINS } from './cave.js';
import { basalt, spire, cloud } from './objects.js';
import { terrainTrees } from './trees.js';
import { fbm1, hash2 } from '../noise.js';
import { mixPacked } from '../color.js';
import { Model, lumpy } from '../geometry.js';

const LAVA = ['#fff0a0', '#ffc040', '#ff8a2a', '#e05a18', '#a8320e'];

export function compose(cv, seed) {
  const W = cv.W, H = cv.H, s = (p) => streamOf(seed, 'crags', p);
  const pal = vary(palette({
    rock: ['#3a2e34', { spread: 0.5 }], lava: ['#e05a18', { spread: 0.7, n: 7, warm: 0.6 }], bark: ['#2a1e1a', { spread: 0.35 }],
    gem: ['#f65b4e', { spread: 0.55, cool: 0.15 }], leaf: ['#7f831d', { spread: 0.5 }], leaf2: ['#9a9728', { spread: 0.48 }], bloom: ['#f08a2a', { spread: 0.4 }], wood: '#3a2a20', cloud: ['#4a3a3e', { spread: 0.4 }],
  }), s('pal'), 0.6);
  // a volcanic cavern, or the open slopes under a smoking cone
  const fs = s('frame'), cave = fs.next() < 0.85;
  let frame = null;
  if (cave) {
    sky(cv, 0, H, ['#080303', '#120505', '#1c0807', '#260c08']);
    farPillars(cv, { n: 8, fill: '#1a0a08', rim: '#2a0e0a', seed: s('far1').int(0, 1e9), w: [10, 22], floor: 180 });
    fog(cv, '#5a180c', 80, 210, 0.35, s('fog1').int(0, 1e9));
    farPillars(cv, { n: 5, fill: '#24100c', rim: '#381610', seed: s('far2').int(0, 1e9), w: [18, 30], floor: 185, caps: true });
    fog(cv, '#6a2210', 130, 216, 0.25, s('fog2').int(0, 1e9));
    frame = caveFrame(cv, {
      seed: fs.int(0, 1e9), stones: ['#4d3932', '#5b4038', '#392a27'], mortar: '#080404', dark: 0.2, roof: [10, 30], walls: [8, 9],
      stal: { n: 18, len: [6, 34], w: [3, 7], tip: '#ff6a20' }, lip: ['#5a2a1a', '#3a1a12'],
    });
    for (const [x, y] of cv.meta.tips) glow(cv, x, y, 10, [1, 0.4, 0.12], 0.4);
  } else {
    sky(cv, 0, H, ['#1a080a', '#3a1010', '#7a2a18', '#c8582a', '#e88a40']);
    const cr = s('clouds');
    for (let i = 0; i < 4; i++) cv.stamp(cloud(cr, cr.int(40, 90), cr.int(8, 16)), pal, cr.int(0, W), cr.int(10, 50), { outline: false, texture: 0 });
    // the cone: a dark silhouette, its crater glowing, lava running down its flanks
    const cs = s('cone'), vx = cs.int(110, 270), cseed = cs.int(0, 1e9);
    const cone = volcano(cv, vx, cseed);
    const top = cone[vx];
    glow(cv, vx, top - 2, 60, [1, 0.45, 0.15], 0.5);
    plume(cv, vx, top - 1, cseed + 5);
    cv.meta.crater = [vx, top - 4];
    silhouette(cv, { base: 124, amp: 10, freq: 0.02, seed: s('r1').int(0, 1e9), fill: '#24161a', rim: '#3a2024', rough: 4, peaks: 0.4 });
    fog(cv, '#8a3a1a', 100, 170, 0.25, s('haze').int(0, 1e9));
  }
  // the ground: ash slopes, a lava tube, lava in a hollow, pillars of basalt
  const ts = s('terrain'), top = heights(W, ts.int(0, 1e9), { base: 168, amp: 10, freq: 0.014 });
  const px = ts.int(90, W - 90), hw = ts.int(30, 46);
  dip(top, px, hw, 22, 0.3);
  const kx = px < W / 2 ? ts.int(230, 300) : ts.int(30, 90);
  raise(top, kx, kx + ts.int(30, 50), Math.min(...top) - ts.int(10, 16), 2);
  fillSolid(cv, top);
  ledges(cv, top, ts, 6, { keep: [[px - hw - 6, px + hw + 6]] });
  blob(cv, kx + 20, Math.round(top[kx + 20]) + 22, ts.int(16, 24), 7, ts.int(0, 1e9), 0);
  const ss = ts.int(0, 1e9);
  paintTerrain(cv, {
    a: '#2a2228', b: '#352a30', grain: '#5a3a36', dark: '#100a0a', deep: '#060304', cave: '#040203',
    crust: ['#a4aa35', '#7d852c', '#555922', '#35351b'], crustH: 4, seed: ss,
    cobble: { stones: ['#45312d', '#3a231e', '#5e3a30', '#4a2a22', '#6c4436', '#3e2a26'], mortar: '#050202', s: 10 },
    grass: { cols: ['#5a5a26', '#6a6a2e', '#4a4420'], tall: 3, rate: 0.45, flowers: ['#ff5a2a', '#ff8a3a', '#e0302a'] },
    // under the scorched moss a slab of grey ash speckled pale, a band of red cinders, then the red-brown cinder stones
    layers: [
      { kind: 'ash', cols: ['#625658', '#6c5e60', '#d8c0b0'], h: [6, 9] },
      { kind: 'gravel', cols: ['#c0603a', '#8a3a22', '#5a2416', '#1a0c08'], h: [3, 5] },
    ],
  });
  moss(cv, { cols: ['#6a6a2e', '#4e4e24', '#3a3a1e', '#2a2418'], seed: ss + 1, drape: 8, rate: 0.18, len: 10 });
  const level = Math.round(Math.max(top[px - hw], top[px + hw])) + 4;
  cv.meta.lava = pool(cv, px - hw, px + hw, level, { surface: '#ffe680', body: ['#ffb040', '#ff8a2a', '#e05a18', '#b03a10'], see: 0, bed: ['#ffd060', '#e05a18', '#5a2a1a'] });
  veins(cv, cv.meta.lava, LAVA_VEINS(ss + 4));
  glow(cv, px, level, hw + 50, [1, 0.42, 0.12], 0.6);
  markOpen(cv);
  // in the cavern, a fall of lava from the roof into the pool (all the lava there is pours into or lies in the pool)
  const lf = s('falls');
  const fx = px + lf.int(-hw + 8, hw - 8);
  if (frame) fall(cv, fx, Math.max(0, frame.roof[fx]) + 1, { w: 3, cols: LAVA, rgb: [1, 0.45, 0.12], seed: lf.int(0, 1e9) });
  // basalt columns, fire-glass, charred brush
  const br = s('basalt');
  for (let g = 0; g < 2; g++) {
    // a group of columns side by side: each may touch its neighbours, nothing else
    let x = br.int(20, W - 40);
    const group = ++cv.nprops;
    for (let i = 0; i < br.int(3, 5); i++) {
      const at = cv.place(basalt(br, 6, br.int(10, 24)), pal, x, { sink: 2, foot: [3, 2], range: i ? 2 : 40, step: 1, group });
      if (!at) break;
      x = at.fx + 6;
    }
  }
  const gr = s('glass');
  for (let i = 0; i < 2; i++) cv.place(spire(gr, gr.int(8, 13)), pal, gr.int(10, W - 10), { foot: [4, 2], range: 30 });
  const dr = s('brush');
  // a gnarled tree or two holding on in the heat, then the charred brush
  terrainTrees(cv, dr, pal, { n: 2, kinds: ['gnarl', 'sparse'], h: [34, 64], gap: 60, ledges: true, look: { mats: ['leaf', 'leaf2'], bloom: { mat: 'bloom', rate: 0.08 } } });
  terrainTrees(cv, dr, pal, { n: 3, kinds: ['dead'], h: [18, 34], gap: 30, ledges: true });
  // the vents: rock mounds with glowing throats (their steam is animated)
  const vr = s('vents'), vents = [];
  for (let i = 0; i < 2; i++) {
    const m = new Model();
    m.poly(lumpy(0, -4, 9, 5, () => vr.next(), 0.2, 6), 'rock', { shade: 'round' });
    m.ellipse(0, -9, 2.5, 1, 'lava', { shade: 'flat', tone: 0.3 });
    const at = cv.place(m, pal, vr.int(30, W - 30), { foot: [9, 2], range: 40 });
    if (!at) continue;
    glow(cv, at.fx, at.fy - 9, 16, [1, 0.5, 0.2], 0.4);
    vents.push({ x: at.fx, y: at.fy - 10, r: 4 });
  }
  cv.meta.vents = vents;
  cv.meta.trickles = drips(cv, ss, 4);
  cv.meta.vignette = cave ? 0.32 : 0.2;
  cv.meta.wind = cave ? 0.3 : 0.6;
  cv.meta.horizon = 120;
}

/**
 * The volcano behind the crags: a cone whose flanks sweep out concave from
 * a broad, ragged crater rim (notched where the lava spills), its rock
 * shaded and gullied like the mountains (side.js rockFace), and lava
 * running down the gullies from the notch — meandering, splitting,
 * cooling from a bright core to dark crust as it goes. Returns its crest.
 * @param {any} cv @param {number} vx @param {number} seed
 */
function volcano(cv, vx, seed) {
  const W = cv.W, top = 46, cr = 13 + Math.round(hash2(1, 1, seed) * 5), line = new Float32Array(W), own = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const d = Math.abs(x - vx), side = x < vx ? 0 : 1;
    // concave flanks: steep under the rim, flattening into the plain
    let y = d < cr ? top + (cr - d < 4 ? 0 : 2) : top + 96 * (1 - Math.exp(-(d - cr) / (side ? 78 : 66)));
    // the crater: a dip between two rims, one higher than the other
    if (d < cr - 3) y = top + 3 + Math.round((1 - d / cr) * 2) - (x < vx ? 1 : 0);
    y += (fbm1(x * 0.06, seed + 2, 3) - 0.5) * 9 * Math.min(1, d / 30 + 0.3) + (fbm1(x * 0.25, seed + 3, 2) - 0.5) * 3;
    line[x] = Math.round(y);
  }
  rockFace(cv, line, own, [[vx, top, 96]], { seed, fill: '#3e2628', lit: '#5a3634', dark: '#2c1a1e', bottom: 140, deep: 1.2 });
  // the crater's throat glowing between the rims
  const glowC = [col('#ffe680'), col('#ffb040'), col('#e0601e')];
  for (let x = vx - cr + 4; x <= vx + cr - 4; x++) {
    const y = line[x];
    cv.set(x, y, glowC[Math.abs(x - vx) < cr * 0.4 ? 0 : 1]);
    cv.set(x, y + 1, glowC[2]);
    if (hash2(x, 3, seed) < 0.5) cv.set(x, y - 1, glowC[2]);
  }
  // lava runs from the notch, following the slope, meandering and splitting
  const runs = [[vx + (hash2(2, 1, seed) < 0.5 ? -1 : 1) * (cr - 4), 1, 0]];
  for (let r = 0; r < runs.length && r < 7; r++) {
    let [x, alive, gen, y0] = runs[r];
    const dir = x < vx ? -1 : 1, len = gen ? 30 + hash2(r, 6, seed) * 40 : 90;
    let y = y0 ?? line[Math.round(x)] + 1, px = Math.round(x);
    for (let k = 0; k < len && alive; k++, y++) {
      // down a row, and across the slope at most a pixel (the run stays joined)
      x += dir * (0.25 + fbm1(k * 0.07, seed + r * 9, 2) * 0.6) + (hash2(k, r, seed + 4) - 0.5) * 0.5;
      let xi = Math.round(x);
      xi = Math.max(px - 1, Math.min(px + 1, xi)); x = Math.max(x - 1, Math.min(x + 1, x));
      if (xi < 1 || xi >= W - 1 || y >= 138) break;
      // never above the flank (it runs on the surface or just under its crest)
      if (y < line[xi]) y = line[xi];
      const t = k / 90, core = t < 0.4 ? glowC[0] : t < 0.7 ? glowC[1] : glowC[2], edge = mixPacked(glowC[2], col('#3e2628'), 0.25 + t * 0.55);
      cv.set(xi, y, core);
      if (xi !== px) cv.set(px, y, core);
      cv.set(xi + dir, y, edge);
      if (gen === 0 && t < 0.4) cv.set(xi - dir, y, edge);
      px = xi;
      if (k > 10 && hash2(k, r, seed + 5) < 0.03 && runs.length < 7) runs.push([x, 1, gen + 1, y]);
      if (k % 18 === 9) cv.glow(xi, y, 10, [1, 0.45, 0.15], 0.22);
    }
  }
  return line;
}

/**
 * A plume of smoke over the crater, painted: billowing puffs rising and
 * leaning with the wind, each lit on its upper left and shaded under,
 * the lowest lit orange from the crater's fire.
 * @param {any} cv @param {number} x0 @param {number} y0 @param {number} seed
 */
function plume(cv, x0, y0, seed) {
  const W = cv.W, cols = ['#2a1e22', '#3e3036', '#56464c', '#706068'].map(col), fire = [col('#7a3a24'), col('#b8582a')];
  const puffs = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8, r = 4 + t * 9 + hash2(i, 1, seed) * 3;
    puffs.push([x0 + t * t * 34 + (hash2(i, 2, seed) - 0.5) * 6, y0 - 3 - t * 40, r, t]);
  }
  // the furthest first, the nearest (lowest) last
  for (let i = puffs.length - 1; i >= 0; i--) {
    const [cx, cy, r, t] = puffs[i];
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r * 1.2); x <= cx + r * 1.2; x++) {
      if (x < 0 || y < 0 || x >= W) continue;
      const u = (x - cx) / (r * 1.2), v = (y - cy) / r, a = Math.atan2(v, u), e = u * u + v * v - 0.12 * Math.abs(Math.sin(a * 4 + i));
      if (e > 1) continue;
      const lit = -(u * 0.6 + v * 0.8) + (1 - e) * 0.3;
      let c = lit > 0.55 ? cols[3] : lit > 0.1 ? cols[2] : lit > -0.4 ? cols[1] : cols[0];
      // the fire below lights its underside
      if (t < 0.3 && v > 0.1) c = v > 0.5 ? fire[1] : fire[0];
      if (e > 0.82 && v > 0.2) c = cols[0];
      cv.set(x, y, c);
    }
  }
}
