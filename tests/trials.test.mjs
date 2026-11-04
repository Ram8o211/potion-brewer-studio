// Experiments, certification, gathering and save migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameState, SAVE_VERSION, retireEquipment } from '../src/game/state.js';
import { LAB_ROLES } from '../src/materials/generator.js';
import { Simulation } from '../src/simulation/world.js';
import { applySnapshot } from '../src/simulation/snapshot.js';
import { tapSelection, measureParticles } from '../src/game/measure.js';
import { theoryOf, EFFECT_INDEX, NE } from '../src/alchemy/effects.js';
import { SUBJECTS, SUBJECT_BY_ID, certification, missingEffects, suggestSubjects } from '../src/game/experiments.js';
import { rabbitResponse, findRabbit } from '../src/game/colony.js';
import { depositStatus, generateDeposits } from '../src/game/gathering.js';
import { PHASE } from '../src/simulation/constants.js';

const V = EFFECT_INDEX;

function brew(st, parts) {
  const sim = new Simulation({ size: 'small', lookup: st.lookup, reactions: st.world.reactions, laws: st.world.laws });
  for (const [id, n, ground] of parts) {
    sim.emitter.start(st.lookup(id), { amount: n, ground });
    let g = 0;
    while (sim.emitter.pouring && g++ < 20000) sim.step();
    st.touchBatch();
  }
  const t = sim.tool; t.type = 'spoon';
  for (let k = 0; k < 120 * 10; k++) { const a = k / 120 * 2.6; t.setTarget(Math.cos(a) * 0.9, 2.6 + Math.sin(a) * 0.35, true); sim.advance(1 / 120, 1, 2); }
  t.setTarget(0, 2.6, false);
  for (let k = 0; k < 240; k++) sim.step();
  return sim;
}

/** Draw a dose from the tap exactly as the trials room does. */
function drawDose(sim, ml) {
  const sel = tapSelection(sim, Math.round(ml / 5));
  const m = measureParticles(sim, sel);
  for (const i of sel.sort((a, b) => b - a)) sim.removeParticle(i);
  return m;
}

test('a trial consumes a real dose; a rabbit shows every effect, read with an individual bias', () => {
  const st = GameState.create('trial-seed-1', { tutorial: false });
  const R = st.world.roles;
  const stock0 = st.stock(R.essenceA);
  const sim = brew(st, [[R.water, 30], [R.essenceA, 30]]);
  const before = sim.p.count;
  const dose = drawDose(sim, 10);
  assert.equal(sim.p.count, before - 2, 'two 5 ml particles left the cauldron');
  assert.equal(st.stock(R.essenceA), stock0, 'no ingredient was duplicated or refunded');
  const theory = theoryOf([{ id: R.water, ml: 150 }, { id: R.essenceA, ml: 150 }], st.lookup);
  assert.deepEqual(SUBJECTS.map((s) => s.id), ['rabbit'], 'rabbits are the only subjects');
  // a fixed batch id: the reading's random draws are the same every run
  const { record } = st.recordTrial('rabbit', dose, { ml: 10, source: 'cauldron', batchId: 'trial-seed-1', rev: st.batch.rev, theory, parts: [] });
  assert.equal(record.revealed.length, NE, 'a rabbit shows every effect');
  assert.ok(record.values.vitality > 3, `the rabbit shows vitality ${record.values.vitality}`);
  assert.notEqual(record.values.vitality, record.tv.vitality, 'a reading is not the exact truth');
  assert.ok(Math.abs(record.values.vitality - record.tv.vitality) < 0.6 * record.tv.vitality, 'but it is close');
  assert.ok(record.observations.some((o) => o.key === 'vitality'));
  assert.throws(() => st.recordTrial('stone', dose, { ml: 10, source: 'cauldron', batchId: st.batch.id, rev: st.batch.rev, theory, parts: [] }), /rabbits/);
  assert.equal(st.trials.records.length, 1);
  assert.equal(st.stats.trials, 1);
  assert.ok(st.achievements.trial1);
});

test('certification: valid for this batch only, invalidated by a new pour or by drift', () => {
  const st = GameState.create('trial-seed-2', { tutorial: false });
  const R = st.world.roles;
  const sim = brew(st, [[R.water, 30], [R.essenceA, 30]]);
  const theory = new Float64Array(NE);
  st.batch.id = 'trial-seed-2'; // fixed: the reading is the same every run
  st.recordTrial('rabbit', drawDose(sim, 10), { ml: 10, source: 'cauldron', batchId: st.batch.id, rev: st.batch.rev, theory, parts: [] });
  const now = measureParticles(sim, tapSelection(sim, 20)).effects;
  const cert = certification(st.trials, st.batch, now);
  assert.ok(cert.values.vitality > 3 && cert.values.toxicity !== undefined && cert.values.fire !== undefined, 'every effect estimated');
  assert.equal(cert.rabbits.vitality, 1);
  const order = { requirements: [{ key: 'vitality' }, { key: 'toxicity' }, { key: 'color' }, { key: 'fire' }] };
  assert.deepEqual(missingEffects(order, cert.values), [], 'one rabbit reads them all');
  assert.deepEqual(suggestSubjects(['fire']), ['rabbit']);
  // a different measurement (drift) invalidates silently
  const drifted = now.slice(); drifted[V.vitality] += 20;
  assert.equal(certification(st.trials, st.batch, drifted).values.vitality, undefined, 'drift invalidates');
  // pouring anything new invalidates
  st.touchBatch();
  const after = certification(st.trials, st.batch, now);
  assert.equal(after.values.vitality, undefined);
  assert.ok(after.changed, 'the trial is known to be outdated');
  // a fresh batch knows nothing
  st.newBatch();
  assert.deepEqual(certification(st.trials, st.batch, now).values, {});
});

test('resonance laws are discovered by repeated trials where they act, then join the theory', () => {
  const st = GameState.create('trial-seed-3', { tutorial: false });
  const L = st.world.laws[0];
  const dose = { effects: new Float64Array(NE), resonance: new Float64Array(st.world.laws.length) };
  dose.resonance[0] = 6;
  dose.effects[L.a] = 15;
  const ctx = { ml: 10, source: 'cauldron', batchId: 'x', rev: 0, theory: new Float64Array(NE), parts: [] };
  st.recordTrial('rabbit', dose, { ...ctx, rabbitId: 'r1' });
  assert.equal(st.knownLaws.length, 0, 'one anomaly is not yet a law');
  const { events } = st.recordTrial('rabbit', dose, { ...ctx, rabbitId: 'r2' });
  assert.equal(st.knownLaws.length, 1, 'confirmed on the second trial');
  assert.ok(events.some((e) => e.type === 'law'));
  assert.ok(st.journal['law:' + L.id]);
});

test('lethal doses kill a rabbit; a dead one cannot be dosed and a new one costs coins', () => {
  const tox = new Float64Array(NE); tox[V.toxicity] = 40; tox[V.death] = 30;
  const st = GameState.create('trial-seed-4', { tutorial: false });
  const dead = rabbitResponse(findRabbit(st.colony, 'r1'), tox, 25, { day: st.day });
  assert.equal(dead.after.alive, false, 'poison and death kill the rabbit');
  st.trials.subjects.rabbit = dead.after;
  assert.throws(() => st.recordTrial('rabbit', { effects: tox }, { ml: 10, source: 'cauldron', batchId: 'b', rev: 0, theory: [], parts: [] }));
  const c0 = st.coins;
  assert.ok(st.replaceSubject('rabbit').ok);
  assert.equal(st.coins, c0 - SUBJECT_BY_ID.rabbit.cost);
  assert.equal(st.trials.subjects.rabbit.alive, true);
  assert.equal(st.subjectAvailable('wisp'), false, 'the old subjects are gone');
});

test('the wilds: deterministic deposits, plants that mature with time, rank locks and storage limits', () => {
  const st = GameState.create('wild-seed-1', { tutorial: false });
  const again = generateDeposits(st.world, st.lookup, st.gathering.instances);
  assert.equal(JSON.stringify(again), JSON.stringify(st.deposits), 'deterministic layout');
  const regions = new Set(st.deposits.map((d) => d.region));
  assert.deepEqual([...regions], ['forest'], 'only the starting biome is open');
  const d = st.deposits.find((x) => x.rank === 0 && !x.rare);
  const t0 = Date.now() + 60 * 60000;
  const inv0 = st.stock(d.materialId);
  let got = 0, n = 0;
  // careful or thorough, each harvest takes one mature plant until none is left
  while (n++ < 100) { const r = st.gather(d.id, { now: t0 }); if (!r.ok) { assert.equal(r.reason, 'depleted'); break; } got += r.amount; }
  assert.ok(got > 0 && got <= d.capacity, `gathered ${got} of ${d.capacity}`);
  assert.equal(st.stock(d.materialId), inv0 + got, 'everything gathered is in the inventory');
  assert.equal(depositStatus(st.gathering, d, t0 + 86400000).mature, 0, 'finite populations stay depleted');
  // shelves cap what can be carried home
  st.inventory[d.materialId] = st.cap.storage;
  st.regenerateBiome('forest');
  const renewed = st.deposits.find((x) => x.materialId === d.materialId) || st.deposits[0];
  st.inventory[renewed.materialId] = st.cap.storage;
  assert.equal(st.gather(renewed.id, { now: t0 + d.regrowMs * 3 }).reason, 'full');
  // persistence of the plants
  const back = GameState.fromJSON(JSON.parse(JSON.stringify(st.toJSON())));
  assert.equal(JSON.stringify(back.gathering.nodes), JSON.stringify(st.gathering.nodes));
  // a new day cannot refill a finite population
  st.inventory[d.materialId] = 0;
  const now = Date.now();
  st.gathering.nodes[d.id] = { plants: [], due: now + d.spawnMs, seq: 10 };
  st.endDay();
  assert.equal(depositStatus(st.gathering, d).plants.length, 0, 'shop days cannot refill an exhausted generation');
});

test('a genuine v2 save migrates: progress kept, effects and wilds added, aspect order rescaled and needing a trial', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/save-v2.json', import.meta.url), 'utf8'));
  assert.equal(raw.version, 2);
  const st = GameState.fromJSON(raw);
  assert.equal(st.version, SAVE_VERSION);
  // prepared reagents are no longer stocked: the guild bought them back
  const prepared = new Set(LAB_ROLES.map((r) => raw.world.roles[r]));
  const paid = Object.entries(raw.inventory).reduce((a, [k, v]) => a + (prepared.has(k) && Number(v) > 0 ? (Number(v) / 100) * raw.world.materials.find((m) => m.id === k).price * 0.4 : 0), 0);
  // retired equipment is refunded or replaced (v6): the pestle (now in every kit) and
  // the hydrometer are paid back, the Aether Lens becomes the Arcanometer
  const refit = retireEquipment(raw.equipment);
  assert.equal(refit.refund, 35 + 45);
  assert.ok(Math.abs(st.coins - (raw.coins + paid + refit.refund)) < 0.2, `coins kept, plus the buy-back and the refit (${raw.coins} + ${paid.toFixed(1)} + ${refit.refund} → ${st.coins})`);
  assert.ok(st.has('arcanometer') && st.has('pestle') && !st.has('lens') && !st.has('hydrometer'), 'the lens became an arcanometer; the pestle stays as part of the kit');
  assert.ok(st.journal['note:refit'], 'the journal says what the guild took back and paid');
  assert.equal(st.reputation, raw.reputation);
  assert.equal(st.day, raw.day);
  assert.equal(st.recipes.length, raw.recipes.length);
  assert.equal(st.journal['boil:x'].title, 'Water boils');
  for (const [k, v] of Object.entries(raw.inventory)) assert.equal(String(st.inventory[k] === Infinity ? 'inf' : st.inventory[k]), prepared.has(k) ? '0' : String(v), `stock of ${k} kept (or bought back)`);
  assert.ok(st.world.wild.length >= 15 && st.world.laws.length === 6, 'wild ingredients and laws added');
  for (const m of st.world.materials) assert.ok(m.effects, `${m.id} has effects`);
  assert.ok(!st.has('mortar') && st.has('pestle'), 'the retired mortar is gone; the pestle crushes');
  // the old reagents are exactly the ones the seed always had
  const oldIds = raw.world.materials.map((m) => m.id);
  for (const id of oldIds) assert.ok(st.lookup(id), id);
  // in-progress order: fortitude → strength, rescaled, now an effect order
  const req = st.current.requirements.find((r) => r.key === 'strength');
  assert.ok(req && req.effect && req.target >= 3, 'fortitude requirement became strength');
  assert.ok(st.current.effectOrder);
  assert.ok(!st.current.requirements.some((r) => r.key === 'fortitude' || r.key === 'ardor'));
  // the cauldron snapshot (v1 snapshot, no charge field) restores
  const sim = new Simulation({ size: 'small', lookup: st.lookup, reactions: st.world.reactions, laws: st.world.laws });
  applySnapshot(sim, st.cauldron, { lookup: st.lookup });
  assert.equal(sim.p.count, raw.cauldron.n);
  for (let i = 0; i < sim.p.count; i++) assert.equal(sim.p.q[i], 0);
  const m = measureParticles(sim, tapSelection(sim, 10));
  assert.ok(m.effects[V.vitality] > 0, 'the old brew now has measurable (hidden) effects');
  // and it saves and loads as v3
  const again = GameState.fromJSON(JSON.parse(JSON.stringify(st.toJSON())));
  assert.equal(again.world.materials.length, st.world.materials.length);
  assert.equal(JSON.stringify(again.current.requirements), JSON.stringify(st.current.requirements));
});

test('corrupted, partial and future saves are rejected or repaired, never silently reset', () => {
  const st = GameState.create('robust-1', { tutorial: false });
  const good = st.toJSON();
  // partial new-system data is repaired
  const partial = { ...good, trials: { subjects: { rabbit: { health: 'x' } }, records: [null, 5, { subjectId: 'stone', values: { acidity: 3 } }] }, gathering: { nodes: { a: { stock: 'nan', at: 3 } } } };
  const p = GameState.fromJSON(JSON.parse(JSON.stringify(partial)));
  assert.equal(p.trials.subjects.rabbit.health, 100);
  assert.equal(p.trials.records.length, 1);
  assert.deepEqual(p.gathering.nodes, {});
  assert.throws(() => GameState.fromJSON({ ...good, version: SAVE_VERSION + 1 }), /newer version/);
  assert.throws(() => GameState.fromJSON({ ...good, inventory: null }), /inventory/);
  assert.throws(() => GameState.fromJSON(null));
  // a missing world regenerates from the seed (v2 behaviour, still supported)
  const noWorld = { ...JSON.parse(JSON.stringify(good)), world: undefined };
  const r = GameState.fromJSON(noWorld);
  assert.equal(r.world.seed, 'robust-1');
  assert.ok(r.world.wild.length > 0);
});

void PHASE;
