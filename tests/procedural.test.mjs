// The procedural graphics: every wild ingredient carries a visual identity
// from which its plant (at each growth stage), icon and cauldron pieces are
// drawn; the same world always paints the same pixels, other worlds paint
// other species; one ingredient looks like itself wherever it is shown; the
// identity travels between devices; the seven environments are generated
// deterministically with open ground for plants (never water, lava or
// scenery in front), their scenery set down where it fits, and plants are
// placed and hit-tested on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, addAlchemy } from '../src/materials/generator.js';
import { WILD_SPECS } from '../src/materials/wild.js';
import { identityOf, encodeIdentity, decodeIdentity, attachVisuals, identityKey, VISUAL_SCHEMA } from '../src/visual/identity.js';
import { describe } from '../src/visual/descriptor.js';
import { plantFrame, iconFrame, pieceFrame, ICON_PX, PIECE_GRID } from '../src/visual/render.js';
import { familyOf, BOTANICAL } from '../src/visual/taxonomy.js';
import { FAMILIES } from '../src/visual/families/index.js';
import { composeScene, sceneOf, SCENE_W, SCENE_H } from '../src/visual/env/scene.js';
import { PlantGround, plantBox, hitPlant, swayPixels } from '../src/rendering/wild-scene.js';
import { silhouetteOf, plantFrameOf, mountsOf, variantOf, MIN_HIT } from '../src/rendering/species-sprites.js';
import { dominantColour } from '../src/rendering/brew-palette.js';
import { rgbToOklab, deltaE } from '../src/core/color.js';
import { GameState } from '../src/game/state.js';
import { REGIONS, depositStatus } from '../src/game/gathering.js';

const wild = (/** @type {any} */ w) => w.wild.map((id) => /** @type {any} */ (w.materials.find((m) => m.id === id)));
const species = (seed) => wild(generateWorld(seed)).map((m) => ({ m, d: describe(m.vis) }));
/** every opaque pixel as sRGB 0..1 */
const colours = (/** @type {any} */ pix) => { const out = []; for (const c of pix.px) if (c >>> 24) out.push([(c & 255) / 255, ((c >>> 8) & 255) / 255, ((c >>> 16) & 255) / 255]); return out; };

test('every wild ingredient carries a versioned visual identity of its world, which survives a save and travels as a short code', () => {
  const w = generateWorld('vis-1');
  for (const m of wild(w)) {
    assert.ok(m.vis, `${m.wild.key} has an identity`);
    assert.equal(m.vis.v, VISUAL_SCHEMA);
    assert.equal(m.vis.origin, 'catalog-v1');
    assert.equal(m.vis.key, m.wild.key);
    const code = encodeIdentity(m.vis);
    assert.ok(code.length < 400, `compact (${code.length})`);
    assert.deepEqual(decodeIdentity(code), m.vis, 'decodes to the same identity');
    assert.equal(identityKey(decodeIdentity(code)), identityKey(m.vis));
  }
  assert.equal(decodeIdentity('nonsense'), null);
  // a save from before the procedural graphics: its ingredients get exactly the identity a fresh world of that seed gives
  const old = JSON.parse(JSON.stringify(w));
  for (const m of old.materials) delete m.vis;
  addAlchemy(old);
  for (const m of wild(old)) assert.deepEqual(m.vis, wild(w).find((x) => x.id === m.id).vis);
  // an identity already there is kept, even from an older schema
  const kept = JSON.parse(JSON.stringify(w));
  kept.materials.find((m) => m.id === 'wild-ironroot').vis.seed = 12345;
  attachVisuals(kept);
  assert.equal(kept.materials.find((m) => m.id === 'wild-ironroot').vis.seed, 12345);
});

test('the same world paints identical pixels; species remain visually identical across regenerated worlds', () => {
  const a = species('same-seed'), b = species('same-seed'), c = species('other-seed');
  let differ = 0;
  for (let i = 0; i < a.length; i++) {
    const { d } = a[i], d2 = b[i].d, d3 = c.find((x) => x.m.id === a[i].m.id).d;
    for (let st = 0; st < 3; st++) assert.equal(plantFrame(d, st).pix.hash(), plantFrame(d2, st).pix.hash(), `${a[i].m.wild.key} stage ${st}`);
    assert.equal(iconFrame(d).pix.hash(), iconFrame(d2).pix.hash());
    for (let v = 0; v < 4; v++) assert.equal(pieceFrame(d, v).pix.hash(), pieceFrame(d2, v).pix.hash());
    if (iconFrame(d).pix.hash() !== iconFrame(d3).pix.hash() && plantFrame(d, 2).pix.hash() !== plantFrame(d3, 2).pix.hash()) differ++;
  }
  assert.equal(differ, 0, 'species identity is independent of the world seed');
});

test('within a world every species is its own: distinct icons, plants and pieces', () => {
  const s = species('distinct-1');
  const icons = new Set(s.map(({ d }) => iconFrame(d).pix.hash()));
  const plants = new Set(s.map(({ d }) => plantFrame(d, 2).pix.hash()));
  const pieces = new Set(s.map(({ d }) => pieceFrame(d, 0).pix.hash()));
  assert.equal(icons.size, s.length);
  assert.equal(plants.size, s.length);
  assert.equal(pieces.size, s.length);
});

test('every species follows its family grammar: a living plant or a crystal grows in three distinct stages, a stone or shell lies there whole; a full icon and four solid pieces', () => {
  for (const seed of ['grammar-1', 'grammar-2']) for (const { m, d } of species(seed)) {
    const key = m.wild.key;
    assert.equal(d.family, familyOf(m.wild.shape));
    assert.ok(FAMILIES[d.family], `${key}: ${d.family} has its grammar`);
    assert.equal(d.botanical, BOTANICAL.has(d.family));
    const area = [0, 1, 2].map((st) => plantFrame(d, st).pix.mask().reduce((a, v) => a + v, 0));
    const h = [0, 1, 2].map((st) => plantFrame(d, st));
    if (d.botanical || d.form === 'crystal' || d.form === 'shard') {
      assert.ok(area[0] < area[1] && area[0] < area[2], `${key} grows: ${area}`);
      assert.ok(new Set(h.map((f) => f.pix.hash())).size === 3, `${key}: each stage has its own form`);
    } else assert.ok(new Set(h.map((f) => f.pix.hash())).size === 1, `${key}: inorganic, it does not grow`);
    const mature = h[2];
    assert.ok(mature.pix.h >= 10 && mature.pix.h <= 70 && mature.pix.w <= 70, `${key} is ${mature.pix.w}×${mature.pix.h}`);
    const ic = iconFrame(d).pix.mask().reduce((a, v) => a + v, 0);
    assert.ok(ic >= ICON_PX * ICON_PX * 0.18, `${key} icon fills its box (${ic})`);
    for (let v = 0; v < 4; v++) {
      const cells = pieceFrame(d, v).mask.reduce((a, x) => a + x, 0);
      assert.ok(cells >= 40 && cells < PIECE_GRID * PIECE_GRID, `${key} piece ${v}: ${cells} cells`);
    }
  }
});

test('one ingredient looks like itself on the ground, as an icon and in the cauldron', () => {
  for (const { m, d } of species('match-1')) {
    const lab = (rgb) => rgbToOklab(rgb[0], rgb[1], rgb[2]);
    // the colours of its own body (not the soil, leaves or rock it grows from) agree across contexts
    const plant = colours(plantFrame(d, 2).pix), icon = colours(iconFrame(d).pix), pieces = [0, 1, 2, 3].flatMap((v) => colours(pieceFrame(d, v).pix));
    const body = [...d.pal.main, ...d.pal.crystal, ...d.pal.glow, ...(d.family === 'bark' ? d.pal.wood : [])];
    const near = (cs) => Math.min(...body.map((c) => Math.min(...cs.map((x) => deltaE(lab(x), lab([(c & 255) / 255, ((c >>> 8) & 255) / 255, ((c >>> 16) & 255) / 255]))))));
    for (const [what, cs] of [['plant', plant], ['icon', icon], ['pieces', pieces]]) assert.ok(near(cs) < 4, `${m.wild.key}: its ${what} shows its own colour`);
    // and the dominant colour of the pieces (what dyes a brew) is the same family of colour as the icon's
    const palette = new Set(icon.map((c) => c.map((v) => Math.round(v * 31)).join(',')));
    const shared = pieces.filter((c) => palette.has(c.map((v) => Math.round(v * 31)).join(','))).length;
    assert.ok(shared > pieces.length * 0.35, `${m.wild.key}: broken pieces retain the icon's texture palette`);
  }
});

test('the alchemy leaves clues: a species\' colour inputs change its palette but not its shape; its effects change its traits', () => {
  const m = wild(generateWorld('clues-1')).find((x) => x.wild.key === 'heartpetal');
  const d = describe(m.vis);
  const recoloured = describe({ ...m.vis, color: [0.2, 0.4, 0.9] });
  assert.deepEqual(recoloured.m, d.m, 'separate streams: colour never moves the morphology');
  assert.notDeepEqual(recoloured.pal.main, d.pal.main);
  const poisoned = describe({ ...m.vis, fx: { ...m.vis.fx, toxicity: 30 } });
  assert.ok(poisoned.tr.spots > d.tr.spots, 'poison spots it');
  const deadly = describe({ ...m.vis, fx: { death: 30 } });
  assert.ok(deadly.tr.droop > 0.9 && d.tr.droop === 0);
});

test('the six environments are side views, generated deterministically, differing per world, with plants only on dry ground surfaces', () => {
  for (const r of REGIONS) {
    const t0 = performance.now();
    const a = composeScene(r.id, 'env-1');
    const ms = performance.now() - t0;
    assert.ok(ms < 12000, `${r.id} cold composition in ${ms.toFixed(0)} ms under the concurrent suite`);
    assert.equal(a.pix.w, SCENE_W);
    assert.equal(a.pix.h, SCENE_H);
    assert.equal(a.pix.hash(), composeScene(r.id, 'env-1').pix.hash(), `${r.id} is deterministic`);
    assert.notEqual(a.pix.hash(), composeScene(r.id, 'env-2').pix.hash(), `${r.id} differs per world`);
    assert.ok(a.pix.px.every((c) => c >>> 24 === 255), `${r.id} is fully painted`);
    // open ground is only ever a surface: the top of the ground, or the air just above it — never in a liquid
    let open = 0;
    for (let y = 1; y < SCENE_H - 1; y++) for (let x = 0; x < SCENE_W; x++) {
      const k = y * SCENE_W + x;
      if (!a.open[k]) continue;
      open++;
      assert.ok(y >= a.top);
      assert.equal(a.liquid[k], 0, `${r.id}: nothing grows in water or lava`);
      const surface = (a.solid[k] && !a.solid[k - SCENE_W]) || (!a.solid[k] && a.solid[k + SCENE_W]);
      assert.ok(surface, `${r.id}: (${x}, ${y}) is open but not a surface`);
    }
    assert.ok(a.top >= 40 && a.top < 190, `${r.id} ground starts at ${a.top}`);
    assert.ok(open > SCENE_W * 0.8, `${r.id} has room to grow (${open} px)`);
  }
  // the river and the lava lie in their beds, and nothing grows in them
  for (const [region, key] of [['river', 'river'], ['crags', 'lava']]) {
    const sc = composeScene(region, 'env-1'), p = sc.meta[key];
    assert.ok(p && p.x1 > p.x0, `${region} has its ${key}`);
    const mid = Math.round((p.x0 + p.x1) / 2);
    assert.equal(sc.liquid[(p.level + 1) * SCENE_W + mid], 1, `${region}: its ${key} fills its bed`);
    for (let x = p.x0; x <= p.x1; x++) for (let y = p.level - 1; y < SCENE_H; y++) if (sc.liquid[y * SCENE_W + x]) assert.equal(sc.open[y * SCENE_W + x], 0);
  }
});

test('the leaves sway in the wind: still in a calm, moving in a gust, the same at the same moment, only over what lies behind them', () => {
  for (const r of REGIONS.filter((r) => !['skyshard', 'ghostglass', 'chronoglass'].includes(r.id))) {
    const sc = sceneOf(r.id, 'env-1'), sw = sc.sway;
    // (a mine deep in a cavern may have no room for a tree: only its moss sways)
    const few = r.id === 'quarry';
    assert.ok(sw && sw.k.length > (few ? 0 : 200), `${r.id} has foliage that sways`);
    const out = new Uint32Array(SCENE_W * SCENE_H);
    // no wind: the painting exactly
    swayPixels(sw, out, 5, 0);
    assert.ok(out.every((c, k) => c === sc.pix.px[k]), `${r.id}: in a calm the leaves rest where they were painted`);
    // wind: some leaves move, and only leaves (and what they uncover)
    let moved = 0;
    for (const t of [3, 11, 19, 27]) {
      swayPixels(sw, out, t, 1, 0.5);
      const again = new Uint32Array(out.length);
      swayPixels(sw, again, t, 1, 0.5);
      assert.ok(again.every((c, k) => c === out[k]), `${r.id}: the wind is the same at the same moment`);
      for (let k = 0; k < out.length; k++) if (out[k] !== sc.pix.px[k]) moved++;
    }
    assert.ok(moved > (few ? 0 : 50), `${r.id}: the wind moves the leaves (${moved} px)`);
    const near = new Uint8Array(SCENE_W * SCENE_H);
    for (const k of sw.k) for (let d = -4; d <= 4; d++) { const x = (k % SCENE_W) + d; if (x >= 0 && x < SCENE_W) near[k + d] = 1; }
    swayPixels(sw, out, 27, 1, 0.5);
    for (let k = 0; k < out.length; k++) if (out[k] !== sc.pix.px[k]) assert.ok(near[k], `${r.id}: only the foliage moves (pixel ${k})`);
  }
});

test('scenery is set down where it fits: never into another piece, a tree, the cave\'s rock or a liquid, and standing on ground', () => {
  for (const r of REGIONS) for (const seed of ['fit-1', 'fit-2', 'fit-3']) {
    const sc = composeScene(r.id, seed);
    let pieces = 0;
    for (let k = 0; k < sc.props.length; k++) {
      if (!sc.props[k]) continue;
      pieces = Math.max(pieces, sc.props[k]);
      assert.ok(!sc.trees[k] && !sc.rock[k], `${r.id}/${seed}: a prop at (${k % SCENE_W}, ${Math.floor(k / SCENE_W)}) overlaps a tree or the rock`);
    }
    assert.ok(pieces > 0, `${r.id}/${seed} has scenery`);
  }
  // the Whisperwood always lies in the open air; the Netherwood is its cavern under a roof of rock
  for (const seed of ['fit-1', 'fit-2', 'fit-3', 'fit-4', 'fit-5', 'fit-6']) {
    assert.equal(composeScene('forest', seed).rock.some((v) => v), false, `the Whisperwood of ${seed} has no cave roof`);
    assert.ok(composeScene('netherwood', seed).rock.some((v) => v), `the Netherwood of ${seed} is a cavern`);
  }
});

test('plants grow where their species is found — on open ground, hanging from boughs and rock, out of rock faces and trunks — never behind scenery, with room round them; taps pick the plant in front', () => {
  const mounts = new Set();
  for (const r of REGIONS) {
    const st = GameState.create('place-1', { tutorial: false });
    st.reputation = 800; st.stats.served = 36;
    st.unlockedBiomes.push(r.id);
    // Placement coverage must not depend on a rare species happening to spawn
    // in an apprentice's random roster. Exercise representative native ground,
    // wall and hanging forms while retaining every geometry/occlusion assertion.
    const pool = st.world.materials.filter((m) => m.wild?.region === r.id && !m.arcaneVariant && !m.product);
    const examples = [...new Set([...pool.slice(0, 3),
      pool.find((m) => mountsOf(m).some(([mount]) => mount === 'wall' || mount === 'trunk')),
      pool.find((m) => mountsOf(m).some(([mount]) => ['hang', 'bough', 'ceiling'].includes(mount)))].filter(Boolean))];
    st.gathering.instances[r.id] = { version: 1, seed: st.sceneSeed(r.id), revision: 0, captured: [], roster: examples.map((m) => ({ id: m.id, count: 1 })) };
    st.gathering.nodes = {}; st._deposits = null;
    const seed = st.sceneSeed(r.id), ground = new PlantGround(r.id, seed), sc = sceneOf(r.id, seed);
    const plants = [];
    for (const d of st.deposits.filter((x) => x.region === r.id)) {
      const m = st.lookup(d.materialId);
      for (const p of depositStatus(st.gathering, d).plants) plants.push({ ...p, m });
    }
    const shape = (p, mount, flip) => silhouetteOf(p.m, { mount, variant: variantOf(p.id), flip });
    const spots = ground.place(plants, shape, (p) => mountsOf(p.m));
    let overlap = 0;
    const taken = new Uint8Array(SCENE_W * SCENE_H);
    const at = (x, y) => y * SCENE_W + x;
    for (const p of plants) {
      const s = spots[p.id], ax = Math.round(s.x * SCENE_W), ay = Math.round(s.y * SCENE_H), sil = shape(p, s.mount, s.flip);
      mounts.add(s.mount);
      assert.ok(mountsOf(p.m).some(([k]) => k === s.mount), `${r.id}: ${p.m.wild.key} is found on ${s.mount}`);
      const stone = (k) => sc.solid[k] || sc.rock[k];
      if (s.mount === 'ground') assert.ok(sc.open[at(ax, ay)], `${r.id}: ${p.id} stands on open ground`);
      else if (s.mount === 'bough') assert.ok(sc.trees[at(ax, ay - 1)], `${r.id}: ${p.id} hangs from a tree`);
      else if (s.mount === 'ceiling') assert.ok(stone(at(ax, ay - 1)), `${r.id}: ${p.id} hangs from the rock`);
      else if (s.mount === 'hang') assert.ok(stone(at(ax, ay - 1)) || sc.trees[at(ax, ay - 1)], `${r.id}: ${p.id} hangs from something`);
      else if (s.mount === 'wall') assert.ok(stone(at(ax + (s.flip ? 1 : -1), ay)), `${r.id}: ${p.id} juts from a rock face`);
      else if (s.mount === 'trunk') assert.ok(sc.trees[at(ax + (s.flip ? 1 : -1), ay)], `${r.id}: ${p.id} grows on a trunk`);
      for (let j = 0; j < sil.h; j++) for (let i = 0; i < sil.w; i++) {
        if (!sil.m[j * sil.w + i]) continue;
        const k = at(ax - sil.ax + i, ay - sil.ay + j);
        assert.ok(!sc.liquid[k], `${r.id}: ${p.id} is not in the water`);
        if (s.mount === 'ground') assert.ok(sc.depth[k] <= ay, `${r.id}: ${p.id} is not behind scenery`);
        if (taken[k]) overlap++;
        taken[k] = 1;
      }
    }
    assert.ok(overlap < 60, `${r.id}: plants hardly touch (${overlap} px)`);
    // the same plants keep their spots
    assert.deepEqual(ground.place(plants, shape, (p) => mountsOf(p.m)), spots);
  }
  for (const k of ['ground', 'wall']) assert.ok(mounts.has(k), `something grows on ${k}: ${[...mounts]}`);
  assert.ok(mounts.has('bough') || mounts.has('hang') || mounts.has('ceiling'), `something hangs: ${[...mounts]}`);
  // hit testing: the nearer plant wins where boxes overlap; a tiny plant still has a fair target
  const f = { w: 10, h: 10, ax: 5, ay: 9 };
  const back = { x: 100 / SCENE_W, y: 150 / SCENE_H }, front = { x: 104 / SCENE_W, y: 160 / SCENE_H };
  assert.equal(hitPlant([back, front], () => f, 103, 145), front);
  const b = plantBox(back, f);
  assert.ok(b.x1 - b.x0 >= MIN_HIT && b.y1 - b.y0 >= MIN_HIT);
  assert.equal(hitPlant([back], () => f, 10, 10), null, 'the scenery takes no tap');
  assert.ok(plantFrameOf(wild(generateWorld('place-1'))[0], 'mature', { hover: true }));
});

test('the identity record alone rebuilds the same pictures on another device', () => {
  const m = wild(generateWorld('trade-1')).find((x) => x.wild.key === 'starquartz');
  const sent = encodeIdentity(m.vis), got = decodeIdentity(sent);
  assert.equal(iconFrame(describe(got)).pix.hash(), iconFrame(describe(m.vis)).pix.hash());
  assert.equal(plantFrame(describe(got), 2).pix.hash(), plantFrame(describe(m.vis), 2).pix.hash());
  assert.equal(got.origin, 'catalog-v1', 'it remembers its world of origin');
  assert.ok(WILD_SPECS.length >= 240, 'all twelve biomes have ordinary and Arcane species');
});

test('the finger reaches only the scenery in front: background trees sway in the wind but cannot be pushed', async () => {
  const { SceneTouch } = await import('../src/rendering/wild-scene.js');
  let farStrands = 0, nearStrands = 0;
  for (const id of ['forest', 'netherwood']) {
    const sw = sceneOf(id, 'touch-1').sway;
    assert.ok(sw && sw.far, `${id}: its foliage knows what is far`);
    const t = new SceneTouch(sw);
    for (let g = 0; g < sw.amp.length; g++) {
      if (!(sw.hang[g] > 0)) continue;
      // a swipe straight across the strand's middle
      const b = g * 4, x0 = t.box[b] - 6, x1 = t.box[b + 2] + 6, y = (t.box[b + 1] + t.box[b + 3]) / 2;
      t.push(x0, y, x1, y);
      if (sw.far[g]) { farStrands++; assert.ok(!t.moving(g), `${id}: background strand ${g} stays put`); }
      else if (t.moving(g)) nearStrands++;
    }
    assert.ok(sw.far.some((f, g) => f && sw.amp[g] > 0), `${id}: its background trees still sway in the wind`);
  }
  assert.ok(farStrands > 0, 'there were background strands to try');
  assert.ok(nearStrands > 0, 'while strands in front are moved by the finger');
});
