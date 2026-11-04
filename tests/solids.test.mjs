// Whole solid ingredients and frozen bodies: recognisable shapes, local
// cracking into fragments before grinding, conservation, pushing a block
// with the spoon, and fragments melting back without losing matter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation/world.js';
import { PHASE } from '../src/simulation/constants.js';
import { generateWorld, makeLookup } from '../src/materials/generator.js';
import { chunkSize, chunkTemplate, piece, skinOf, hasPieces } from '../src/materials/shapes.js';
import { PIECE_KEYS } from '../src/visual/pieces.js';
import { snapshotSim, restoreSim } from '../src/simulation/snapshot.js';

const world = generateWorld('solids-tests-1');
const lookup = makeLookup(world);
const R = world.roles;

function sim() {
  return new Simulation({ size: 'small', lookup, reactions: world.reactions, laws: world.laws });
}
function pour(s, id, n, x = 0, ground = false) {
  s.emitter.start(lookup(id), { x, amount: n, ground });
  let g = 0;
  while (s.emitter.pouring && g++ < 20000) s.step();
}
function run(s, sec) { for (let k = 0; k < Math.round(sec * 120); k++) s.step(); }
function bodies(s) {
  /** @type {Map<number, number[]>} */
  const m = new Map();
  for (let i = 0; i < s.p.count; i++) {
    const g = s.p.group[i];
    if (g < 0 || s.p.phase[i] !== PHASE.SOLID) continue;
    if (!m.has(g)) m.set(g, []);
    m.get(g).push(i);
  }
  return [...m.values()];
}
/** principal-axis aspect ratio of a set of particles */
function aspect(s, idx) {
  let cx = 0, cy = 0;
  for (const i of idx) { cx += s.p.x[i]; cy += s.p.y[i]; }
  cx /= idx.length; cy /= idx.length;
  let xx = 0, yy = 0, xy = 0;
  for (const i of idx) { const dx = s.p.x[i] - cx, dy = s.p.y[i] - cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  const tr = xx + yy, det = xx * yy - xy * xy;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det));
  return Math.sqrt(l1 / Math.max(1e-9, l2));
}
function volume(s, id) {
  const slot = s.species.slotOf.get(id);
  let t = 0;
  for (let i = 0; i < s.p.count; i++) t += s.p.comp[i * s.p.S + slot];
  return t;
}

test('whole ingredients enter as recognisable rigid objects, not as powder', () => {
  const s = sim();
  const n = chunkSize(lookup('wild-ironroot'));
  pour(s, 'wild-ironroot', n);
  run(s, 3);
  const b = bodies(s);
  assert.equal(b.length, 1, 'one root');
  assert.equal(b[0].length, n, 'every particle belongs to it');
  for (let i = 0; i < s.p.count; i++) assert.equal(s.p.phase[i], PHASE.SOLID);
  // it is one of the root's painted pieces, its particles laid out over it
  const skin = s.p.skin[b[0][0]], v = skin - skinOf(lookup('wild-ironroot'), 0);
  assert.ok(v >= 0 && v < 4, 'the root carries one of its four pieces');
  const pts = chunkTemplate(lookup('wild-ironroot'), n, v);
  for (const i of b[0]) {
    assert.equal(s.p.skin[i], skin, 'the whole body shares the piece');
    assert.ok(pts.some(([u, w]) => Math.abs(u - s.p.skinU[i]) < 1e-6 && Math.abs(w - s.p.skinV[i]) < 1e-6), 'each particle knows its spot in it');
  }
  const t = sim();
  pour(t, 'wild-riverchalk', chunkSize(lookup('wild-riverchalk')));
  run(t, 3);
  assert.ok(aspect(t, bodies(t)[0]) < 3, 'a broken pebble stays compact');
  // whole roots carry the renderer's look and count as "whole"
  assert.ok(s.p.whole[0] > 0.99);
});

test('every wild solid has four procedural pieces, each fitted with exactly its template\'s particles; a pour picks one at random', () => {
  for (const id of world.materials.map((m) => m.id)) {
    const def = lookup(id);
    if (!hasPieces(def)) continue;
    assert.ok(PIECE_KEYS.includes(def.wild.key), def.wild.key);
    for (let v = 0; v < 4; v++) {
      const pc = piece(skinOf(def, v));
      assert.ok(pc, `${def.wild.key} piece ${v} fits`);
      assert.equal(pc.pts.length, chunkSize(def), `${def.wild.key} piece ${v} weighs a whole object`);
    }
  }
  // powders and shop solids keep their own shapes
  assert.ok(!hasPieces(lookup('wild-mica')));
  const s = sim();
  const def = lookup('wild-riverchalk'), n = chunkSize(def), seen = new Set();
  for (let k = 0; k < 16; k++) {
    s.clear();
    pour(s, 'wild-riverchalk', n);
    seen.add(s.p.skin[0]);
  }
  assert.equal(seen.size, 4, 'all four pieces turn up');
  // a saved cauldron keeps every object's piece
  const back = restoreSim(snapshotSim(s, 'small'), { lookup, reactions: world.reactions });
  for (let i = 0; i < s.p.count; i++) {
    assert.equal(back.p.skin[i], s.p.skin[i]);
    assert.equal(back.p.skinU[i], s.p.skinU[i]);
    assert.equal(back.p.skinV[i], s.p.skinV[i]);
  }
});

test('the pestle grinds a body into sand where it strikes, rather than shattering it; untouched parts stay whole', () => {
  const s = sim();
  pour(s, R.water, 120);
  const n = chunkSize(lookup('wild-riverchalk'));
  for (const x of [-0.9, 0, 0.9]) pour(s, 'wild-riverchalk', n, x);
  run(s, 4);
  const total = () => Object.values(s.inventory()).reduce((a, b) => a + b, 0);
  const v0 = total();
  assert.equal(bodies(s).length, 3, 'three pebbles');
  // find the left-most pebble and strike only it
  const bs = bodies(s).map((b) => ({ b, x: b.reduce((a, i) => a + s.p.x[i], 0) / b.length, y: b.reduce((a, i) => a + s.p.y[i], 0) / b.length }));
  bs.sort((a, b) => a.x - b.x);
  const target = bs[0], far = bs[2];
  const farIds = new Set(far.b);
  const t = s.tool;
  t.type = 'pestle';
  let sawFragments = 0;
  for (let k = 0; k < 360; k++) {
    t.setTarget(target.x + Math.sin(k / 9) * 0.12, target.y - 0.22 + Math.abs(Math.sin(k / 5)) * 0.25, true);
    s.advance(1 / 120, 1, 2);
    if (k % 30 === 0) sawFragments = Math.max(sawFragments, bodies(s).length);
  }
  t.setTarget(0, 0.5, false);
  run(s, 2);
  assert.ok(sawFragments <= 4, `the struck pebble is worn down, not shattered into chunks (${sawFragments} bodies)`);
  // ground chalk: grains, which the pestle's stirring kneads into chalk milk
  const slot = s.species.slotOf.get('wild-riverchalk');
  let released = 0;
  for (let i = 0; i < s.p.count; i++) if (s.p.phase[i] !== PHASE.SOLID) released += s.p.comp[i * s.p.S + slot];
  assert.ok(released > 2, `then ground into grains (${released.toFixed(2)} particles' worth released)`);
  // the far pebble was never touched: still whole, one body
  let intact = 0;
  for (let i = 0; i < s.p.count; i++) if (s.p.phase[i] === PHASE.SOLID && s.p.whole[i] > 0.5 && s.p.x[i] > 0.5) intact++;
  assert.ok(intact >= n - 1, `the untouched pebble stays whole (${intact}/${n})`);
  // (ground chalk steeps into chalk milk: the substance changes, the matter does not)
  assert.ok(Math.abs(total() - v0) < 1e-3, 'no matter lost or created');
  void farIds;
});

test('the spoon pushes a frozen block as one body, and its fragments melt back without loss', () => {
  const s = sim();
  pour(s, R.water, 160);
  Object.assign(s.furnace, { setting: -1, minCool: -40, coolPower: 12 });
  run(s, 40);
  s.furnace.setting = 0;
  assert.equal(bodies(s).length, 1, 'one block of ice');
  const v0 = volume(s, R.water);
  // push it sideways with the spoon from the left
  const b = bodies(s)[0];
  const x0 = b.reduce((a, i) => a + s.p.x[i], 0) / b.length;
  const y0 = b.reduce((a, i) => a + s.p.y[i], 0) / b.length;
  const t = s.tool;
  t.type = 'spoon';
  for (let k = 0; k < 120; k++) {
    t.setTarget(-1.6 + k * 0.012, y0 - 0.05, true);
    s.advance(1 / 120, 1, 2);
  }
  t.setTarget(0, 0.5, false);
  run(s, 1);
  const b2 = bodies(s);
  assert.equal(b2.length, 1, 'still one block');
  const x1 = b2[0].reduce((a, i) => a + s.p.x[i], 0) / b2[0].length;
  assert.ok(Math.abs(x1 - x0) > 0.02, `the spoon pushed it (${(x1 - x0).toFixed(3)})`);
  // crack it with the pestle, then melt everything
  t.type = 'pestle';
  for (let k = 0; k < 240; k++) {
    t.setTarget(Math.sin(k / 15) * 0.8, y0 - 0.25 + Math.abs(Math.sin(k / 5)) * 0.3, true);
    s.advance(1 / 120, 1, 2);
  }
  t.setTarget(0, 0.5, false);
  assert.ok(bodies(s).length > 1 || [...Array(s.p.count).keys()].some((i) => s.p.phase[i] === PHASE.POWDER), 'the ice broke');
  s.furnace.setting = 0.6;
  run(s, 40);
  s.furnace.setting = 0;
  let solid = 0;
  for (let i = 0; i < s.p.count; i++) if (s.p.phase[i] === PHASE.SOLID || (s.p.phase[i] === PHASE.POWDER)) solid++;
  assert.equal(solid, 0, 'all of it melted back to liquid');
  assert.ok(Math.abs(volume(s, R.water) - v0) < 1e-3, 'not a drop lost');
});
