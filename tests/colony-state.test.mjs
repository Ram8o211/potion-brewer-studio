// The colony inside the game: dosing a chosen rabbit, buying within the
// hutch's room, nights in the hutch, remains as real (hidden) ingredients,
// saving, and old saves becoming colonies.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameState, SAVE_VERSION, migrate } from '../src/game/state.js';
import { capabilities } from '../src/game/equipment.js';
import { normalizeTrials } from '../src/game/experiments.js';
import { NE, EFFECT_INDEX, theoryOf } from '../src/alchemy/effects.js';
import { decodeSnap, rabbitSnap, findRabbit, livingRabbits, encodeSnap, stageOf } from '../src/game/colony.js';
import { remainsId } from '../src/materials/remains.js';
import { Simulation } from '../src/simulation/world.js';
import { solidLook, chunkSize, LOOK } from '../src/materials/shapes.js';

const fx = (o) => { const e = new Array(NE).fill(0); for (const [k, v] of Object.entries(o)) e[EFFECT_INDEX[k]] = v; return e; };
const dose = (o) => ({ effects: fx(o), resonance: [], color: [0.5, 0.5, 0.5], temperature: 20 });
const ctx = (st, extra = {}) => ({ ml: 10, source: 'cauldron', batchId: st.batch.id, rev: st.batch.rev, theory: new Array(NE).fill(0), parts: [], ...extra });

test('a trial doses the chosen rabbit only, and records who, how sure, and a replay', () => {
  const st = GameState.create('colony-1', { tutorial: false });
  const r1 = JSON.stringify(findRabbit(st.colony, 'r1'));
  const { record } = st.recordTrial('rabbit', dose({ vitality: 12, acidity: 9 }), ctx(st, { rabbitId: 'r2' }));
  assert.equal(JSON.stringify(findRabbit(st.colony, 'r1')), r1, 'Clover untouched');
  const r2 = findRabbit(st.colony, 'r2');
  assert.equal(record.rabbitId, 'r2');
  assert.equal(record.rabbitName, 'Bramble');
  assert.equal(r2.doses[r2.doses.length - 1].rec, record.id);
  assert.deepEqual(decodeSnap(record.replay.a), rabbitSnap(r2, st.day));
  assert.ok(record.values.acidity > 0, 'a rabbit shows acid too');
  assert.ok(r2.marks.acid > 0, 'and the acid acted on it');
  assert.ok(record.err.vitality > 0);
  // no rabbit named: the selected one
  st.selectRabbit('r1');
  assert.equal(st.recordTrial('rabbit', dose({ love: 5 }), ctx(st)).record.rabbitId, 'r1');
  // kits read less precisely
  // (the same batch id for both: the same random draws, so only the stage differs)
  const kitRec = (() => { const s2 = GameState.create('colony-1b', { tutorial: false }); const k = findRabbit(s2.colony, 'r1'); k.born = s2.day; return s2.recordTrial('rabbit', dose({ vitality: 12 }), ctx(s2, { batchId: 'kit-vs-adult' })).record; })();
  const adultRec = GameState.create('colony-1c', { tutorial: false }).recordTrial('rabbit', dose({ vitality: 12 }), ctx(GameState.create('colony-1c', { tutorial: false }), { batchId: 'kit-vs-adult' })).record;
  assert.ok(kitRec.err.vitality / kitRec.values.vitality > adultRec.err.vitality / adultRec.values.vitality, 'relative to what they read');
});

test('the hutch: rabbits cost coins, the kennel and warren make room; a full hutch refuses', () => {
  assert.equal(capabilities([]).hutch, 4);
  assert.equal(capabilities(['kennel']).hutch, 6);
  assert.equal(capabilities(['kennel', 'warren']).hutch, 10);
  const st = GameState.create('colony-2', { tutorial: false });
  st.coins = 100;
  const spent0 = st.stats.spent;
  assert.equal(st.buyRabbit().cost, 6);
  assert.equal(st.stats.spent - spent0, 6);
  assert.equal(st.colony.focus, st.colony.rabbits[2].id, 'the new rabbit is selected');
  st.buyRabbit();
  const full = st.buyRabbit();
  assert.equal(full.ok, false);
  assert.match(full.reason, /full/);
  st.equipment.push('kennel');
  assert.equal(st.rabbitPrice(), 3);
  assert.ok(st.buyRabbit().ok);
  assert.equal(st.buyEquipment('warren').ok, false, 'needs rank or prerequisites');
  // a full hutch with a dead selection: "replace" picks a living rabbit for free
  const s3 = GameState.create('colony-3', { tutorial: false });
  s3.coins = 100;
  s3.trials.subjects.rabbit = { ...s3.trials.subjects.rabbit, alive: false, health: 0 }; // Clover dies
  const deadId = s3.colony.focus;
  assert.ok(s3.buyRabbit().ok); assert.ok(s3.buyRabbit().ok); assert.ok(s3.buyRabbit().ok); // four living again
  s3.selectRabbit(deadId);
  const c0 = s3.coins;
  const rep = s3.replaceSubject('rabbit');
  assert.ok(rep.ok);
  assert.equal(rep.cost, 0);
  assert.equal(s3.coins, c0);
  assert.ok(s3.trials.subjects.rabbit.alive, 'a living rabbit is selected instead');
  // with room, "replace" buys a new rabbit
  const s4 = GameState.create('colony-3b', { tutorial: false });
  s4.trials.subjects.rabbit = { ...s4.trials.subjects.rabbit, alive: false, health: 0 };
  const c4 = s4.coins;
  assert.equal(s4.replaceSubject('rabbit').cost, 6);
  assert.equal(s4.coins, c4 - 6);
});

test('nights in the hutch: births are reported, counted and celebrated; money is untouched', () => {
  const st = GameState.create('colony-4', { tutorial: false });
  let born = 0, summary = null;
  for (let d = 0; d < 20 && !born; d++) {
    st.current = null; st.customerIndex = st.customersPerDay;
    summary = st.endDay();
    born += summary.colony.born.length;
  }
  assert.ok(born > 0, 'a healthy pair has kits');
  assert.ok(Array.isArray(summary.colony.died));
  assert.equal(st.stats.bred, livingRabbits(st.colony).length - 2);
  assert.ok(st.achievements.kit1);
  assert.ok(livingRabbits(st.colony).length <= st.cap.hutch);
});

test('remains: once per body, real materials with hidden effects, never in theory, shop or orders', () => {
  const st = GameState.create('colony-5', { tutorial: false });
  assert.equal(st.processRemains('r1').ok, false, 'not while alive');
  // Clover lives a hard life, then dies in fire
  st.recordTrial('rabbit', dose({ strength: 20, love: 15 }), ctx(st, { rabbitId: 'r1' }));
  st.recordTrial('rabbit', dose({ fire: 90 }), ctx(st, { rabbitId: 'r1', ml: 25 }));
  const r1 = findRabbit(st.colony, 'r1');
  assert.equal(r1.alive, false);
  assert.equal(r1.cause, 'fire');
  const n0 = st.world.materials.length;
  const res = st.processRemains('r1');
  assert.ok(res.ok);
  const parts = res.parts.map((p) => p.id);
  assert.ok(parts.includes(remainsId('r1', 'bone')));
  assert.ok(parts.includes(remainsId('r1', 'ash')), 'burned: ash');
  assert.ok(!parts.includes(remainsId('r1', 'fur')), 'burned: no pelt');
  assert.equal(st.world.materials.length, n0 + parts.length);
  for (const id of parts) {
    assert.ok(st.world.ingredients.includes(id));
    assert.ok(st.inventory[id] > 0);
    assert.ok(st.lookup(id), 'the live lookup sees it');
  }
  const bone = st.lookup(remainsId('r1', 'bone'));
  assert.ok(bone.effects.strength > 3, 'its strength lingers in the bones');
  assert.equal(st.lookup(bone.id + '~a'), undefined, 'ordinary remains do not acquire an Arcane transition');
  assert.equal(solidLook(bone), LOOK.BONE);
  assert.equal(chunkSize(bone), 11);
  assert.equal(st.processRemains('r1').ok, false, 'only once');
  assert.equal(st.colony.memorial[0].id, 'r1');
  assert.equal(st.stats.recovered, 1);
  assert.ok(st.achievements.remains1);
  // hidden: no theory, not for sale, not in commission planning
  const th = theoryOf([{ id: bone.id, ml: 50 }, { id: st.world.roles.water, ml: 50 }], st.lookup);
  assert.ok(Array.from(th).every((v) => v === 0));
  assert.ok(!st.purchasable().includes(bone.id));
  assert.ok(!st.commissionContext().available.has(bone.id));
  // and it is a real solid: 55 ml poured into a cauldron becomes one bone
  const sim = new Simulation({ size: 'pot', lookup: st.lookup, reactions: st.world.reactions, laws: st.world.laws });
  sim.emitter.start(bone, { amount: 11 });
  let g = 0;
  while (sim.emitter.pouring && g++ < 20000) sim.step();
  assert.equal(sim.p.count, 11);
  // burying makes nothing
  st.recordTrial('rabbit', dose({ death: 60 }), ctx(st, { rabbitId: 'r2', ml: 25 }));
  const m1 = st.world.materials.length;
  assert.ok(st.buryRabbit('r2').ok);
  assert.equal(st.world.materials.length, m1);
});

test('saving keeps the colony, the memorial and the remains with their stock', () => {
  const st = GameState.create('colony-6', { tutorial: false });
  st.recordTrial('rabbit', dose({ love: 20, transformation: 9 }), ctx(st, { rabbitId: 'r2', ml: 25 }));
  st.recordTrial('rabbit', dose({ death: 60 }), ctx(st, { rabbitId: 'r1', ml: 25 }));
  st.processRemains('r1');
  const json = JSON.parse(JSON.stringify(st.toJSON()));
  assert.equal(json.version, SAVE_VERSION);
  assert.ok(!('rabbit' in json.trials.subjects));
  const back = GameState.fromJSON(json);
  assert.equal(JSON.stringify(back.colony), JSON.stringify(st.colony));
  assert.equal(back.trials.subjects.rabbit.id, st.colony.focus);
  const boneId = remainsId('r1', 'bone');
  assert.deepEqual(back.lookup(boneId).effects, st.lookup(boneId).effects);
  assert.deepEqual(back.lookup(boneId).arcane, st.lookup(boneId).arcane);
  assert.equal(back.inventory[boneId], st.inventory[boneId]);
  assert.deepEqual(back.world.ingredients, st.world.ingredients);
  const again = GameState.fromJSON(JSON.parse(JSON.stringify(back.toJSON())));
  assert.equal(JSON.stringify(again.colony), JSON.stringify(back.colony));
});

test('an old version-3 save becomes a colony: the rabbit, its trials, sales and follow-ups survive', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/save-v3.json', import.meta.url), 'utf8'));
  assert.equal(raw.version, 3);
  const st = GameState.fromJSON(raw);
  assert.equal(st.toJSON().version, SAVE_VERSION);
  const f = findRabbit(st.colony, 'r1');
  assert.equal(f.health, 35);
  assert.equal(f.marks.love, 40);
  assert.equal(f.marks.fire, 20);
  assert.equal(f.marks.transformation, 30);
  assert.equal(f.doses.length, 2, 'both rabbit trials are Clover’s');
  assert.ok(st.trials.records.filter((r) => r.subjectId === 'rabbit').every((r) => r.rabbitId === 'r1'));
  assert.ok(findRabbit(st.colony, 'r2').alive, 'with a companion');
  assert.ok(!('rabbit' in JSON.parse(JSON.stringify(st.toJSON())).trials.subjects));
  assert.equal(st.sales.length, 1);
  assert.equal(st.followUps.length, 1);
  // an early v3 save (before sales existed)
  const early = JSON.parse(JSON.stringify(raw));
  delete early.sales; delete early.followUps; delete early.referrals;
  const e = GameState.fromJSON(early);
  assert.deepEqual(e.sales, []);
  assert.deepEqual(e.followUps, []);
  // a v3 save whose rabbit had died keeps the body
  const dead = JSON.parse(JSON.stringify(raw));
  dead.trials.subjects.rabbit.alive = false;
  dead.trials.subjects.rabbit.health = 0;
  const d = GameState.fromJSON(dead);
  assert.equal(findRabbit(d.colony, 'r1').alive, false);
  assert.equal(d.trials.subjects.rabbit.id, 'r2', 'the living companion is selected');
  // the sandbox's unversioned trials blob
  const blob = normalizeTrials({ subjects: { rabbit: { health: 50, alive: true, trials: 1, marks: { love: 12 } } }, records: [] });
  assert.equal(findRabbit(blob.colony, 'r1').health, 50);
  assert.equal(migrate({ ...raw }).version, SAVE_VERSION);
  void encodeSnap;
});

test('founders of a colony made from a late save are young adults, not elders', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/save-v3.json', import.meta.url), 'utf8'));
  raw.day = 60;
  const st = GameState.fromJSON(raw);
  assert.deepEqual(livingRabbits(st.colony).map((r) => stageOf(r, st.day)), ['adult', 'adult']);
  const born = livingRabbits(st.colony).map((r) => r.born);
  // and their birthdays stay put once saved
  const again = GameState.fromJSON(JSON.parse(JSON.stringify(st.toJSON())));
  assert.deepEqual(livingRabbits(again.colony).map((r) => r.born), born);
});
