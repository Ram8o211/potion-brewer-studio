import { collectedShop } from './game-fixtures.mjs';
// The gameplay-purpose refactor: every campaign tool and technique serves a
// mechanic, customers only ask for outcomes, retired equipment migrates
// fairly, recipes compare what matters, evidence never claims more than it
// knows, the automated player plays on public knowledge, and each retained
// mechanic makes a measurable difference in the real simulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameState, SAVE_VERSION, retireEquipment } from '../src/game/state.js';
import { EQUIPMENT, STARTING_EQUIPMENT, RETIRED_EQUIPMENT, RANKS, capabilities } from '../src/game/equipment.js';
import { MECHANICS, MECHANIC_BY_ID, SANDBOX_CONTROLS } from '../src/game/mechanics.js';
import { prepFor, generateCommission, TECHNIQUES } from '../src/game/commissions.js';
import { compareRecipe, matchRecipe, buildProcedure, traceSample, migrateRecipe, procedureShape } from '../src/game/recipes.js';
import { AutoBrewer, condensedCount } from '../src/game/autobrew.js';
import { summarize, effectEvidence, requirementEvidence } from '../src/game/experiments.js';
import { measureParticles, tapSelection } from '../src/game/measure.js';
import { EFFECT_INDEX, EFFECT_KEYS } from '../src/alchemy/effects.js';
import { Rng } from '../src/core/rng.js';
import { windowOf } from '../scripts/lib/player.mjs';
import { cauldron, pour, hold, settleTo, stirFor, boilDown, tap } from '../scripts/lib/experiment.mjs';
import { SIM, PHASE } from '../src/simulation/constants.js';

const OUTCOME = (k) => k === 'purity' || EFFECT_INDEX[k] !== undefined;

test('every piece of equipment serves a campaign mechanic, and every technique exercises one', () => {
  for (const e of EQUIPMENT) {
    assert.ok(Array.isArray(e.mechanics) && e.mechanics.length, `${e.id} names its mechanics`);
    for (const m of e.mechanics) assert.ok(MECHANIC_BY_ID[m], `${e.id}: unknown mechanic ${m}`);
    assert.ok(e.desc && e.desc.length > 20, `${e.id} says what it lets the player do`);
    if (e.requires) for (const r of e.requires) assert.ok(EQUIPMENT.some((x) => x.id === r), `${e.id} requires a real item`);
    assert.ok(!RETIRED_EQUIPMENT[e.id], `${e.id} is not both sold and retired`);
  }
  for (const t of TECHNIQUES) assert.ok(MECHANIC_BY_ID[t.mechanic], `${t.id} exercises a mechanic`);
  for (const m of MECHANICS) for (const k of ['decision', 'consequence', 'objective', 'feedback']) assert.ok(m[k], `${m.id} documents its ${k}`);
  for (const id of STARTING_EQUIPMENT) assert.equal(EQUIPMENT.find((e) => e.id === id).price, 0, `${id} is free`);
  for (const [id, r] of Object.entries(RETIRED_EQUIPMENT)) if (r.into) assert.ok(EQUIPMENT.some((e) => e.id === r.into), `${id} becomes a real item`);
  assert.deepEqual(SANDBOX_CONTROLS.slice().sort(), ['alembic', 'heatmap', 'readouts', 'skimmer']);
  // a purchase is never only the key to another purchase
  for (const e of EQUIPMENT.filter((x) => x.price > 0)) assert.ok(e.effect || e.mechanics.some((m) => m !== 'storage') || e.id.startsWith('rack'), `${e.id} does something itself`);
});

test('customers only ask for outcomes they can judge: effects, purity and quantity — never a serving temperature', () => {
  let n = 0;
  for (let tier = 0; tier < 5; tier++) {
    for (let k = 0; k < 4; k++) {
      const st = GameState.create(`outcome-${tier}-${k}`, { tutorial: false });
      st.reputation = RANKS[tier].rep; collectedShop(st);
      st.coins = 400;
      st.equipment.push('kit', 'frostrune', ...(tier >= 3 ? ['glacial'] : []));
      const com = generateCommission(st.commissionContext(), new Rng(`o${tier}${k}`), { tier });
      if (!com) continue;
      n++;
      for (const r of com.requirements) assert.ok(OUTCOME(r.key), `${com.style}: ${r.key} is an outcome`);
      assert.ok(!com.requirements.some((r) => r.key === 'temperature'), 'no serving temperature is asked');
      assert.ok(com.requirements.some((r) => r.effect && r.key !== 'purity'), 'every order wants an effect');
      for (const t of com.techniques) assert.ok(TECHNIQUES.some((x) => x.id === t), `${t} is a current technique`);
    }
  }
  assert.ok(n >= 16, `orders generated (${n})`);
});

test('an order taken before keeps everything but its serving temperature', () => {
  const st = GameState.create('old-serve-1', { tutorial: false });
  st.current = generateCommission(st.commissionContext(), new Rng('old-serve'), { tier: 0 });
  const com = st.current;
  com.requirements.unshift({ key: 'temperature', kind: 'target', target: 50, tol: 8, zero: 24, label: '42–58°C' });
  com.techniques = ['serve'];
  com.style = com.style.split('+')[0] + '+serve';
  const n = com.requirements.length;
  const back = GameState.fromJSON(JSON.parse(JSON.stringify(st.toJSON())));
  assert.equal(back.current.requirements.length, n - 1);
  assert.ok(!back.current.requirements.some((r) => r.key === 'temperature'));
  assert.deepEqual(back.current.techniques, []);
  assert.equal(back.current.style, com.style.split('+')[0]);
  assert.equal(back.current.customer.name, com.customer.name);
});

test('cold steeps are only planned where the equipment can hold them, never frozen', () => {
  let cold = 0;
  for (let k = 0; k < 16; k++) {
    for (const eq of [[], ['frostrune']]) {
      const st = GameState.create(`cold-${k}`, { tutorial: false });
      st.reputation = RANKS[1].rep; collectedShop(st);
      st.coins = 300;
      st.equipment.push('kit', ...eq);
      const ctx = st.commissionContext(), m = st.lookup('wild-frostcap');
      const rx = st.world.reactions.find((r) => r.a === m.id && r.maxT <= 20);
      const prep = prepFor(m, ctx, [st.lookup(st.world.roles.water)]);
      if (!prep) { assert.ok(!eq.length && rx.maxT <= 12, 'the basin cannot hold a colder extraction window'); continue; }
      cold++;
      assert.ok(prep.coolTo >= (eq.length ? 4 : 10), 'extraction stays above freezing and the equipment floor');
      assert.ok(prep.coolTo <= rx.maxT - 3, 'the cold steep stays inside its window');
    }
  }
  assert.ok(cold > 0, 'cooling orders are planned with cold steeps');
});

/** A v5 save holding every retired item, an order with retired requirements and a distilling recipe. */
function v5Save() {
  const st = GameState.create('refit', { tutorial: false });
  st.nextCustomer();
  const raw = JSON.parse(JSON.stringify(st.toJSON()));
  raw.version = 5;
  raw.equipment = [...STARTING_EQUIPMENT.filter((id) => id !== 'pestle'), 'pestle', 'hydrometer', 'assay', 'viscometer', 'galvanometer', 'thermal', 'skimmer', 'alembic', 'bellows', 'athanor', 'lens', 'arcanometer', 'trowel', 'rockhammer', 'brush', 'sickle', 'shelf1', 'shelf2', 'stirrer', 'rack1'];
  raw.receiver = { count: 3, comp: { [st.world.roles.water]: 3 }, color: [0.5, 0.5, 0.5] };
  raw.current.requirements.push(
    { key: 'color', kind: 'target', target: [0.6, 0, 0], tol: 8, zero: 25, label: 'pale gold' },
    { key: 'stability', kind: 'min', target: 85, tol: 0, zero: 40, label: 'at least 85' },
    { key: 'density', kind: 'target', target: 1.05, tol: 0.05, zero: 0.15, label: '1.00–1.10 g/ml' });
  raw.current.techniques = ['colour', 'stable', 'density', 'concentrate'];
  raw.current.style = 'healing+colour+concentrate+density+stable';
  raw.recipes = [
    { id: 'r1', name: 'Distilled tonic', ingredients: [{ id: st.world.roles.water, ml: 100 }], steps: [{ op: 'pour', id: st.world.roles.water, ml: 100 }, { op: 'distil', ml: 20 }, { op: 'serve', T: 20 }], result: { color: [0.5, 0.5, 0.5] }, verified: { vitality: 9 }, brews: 2, reproduced: 1 },
    { id: 'r2', name: 'Plain tonic', ingredients: [{ id: st.world.roles.water, ml: 100 }], steps: [{ op: 'pour', id: st.world.roles.water, ml: 100 }, { op: 'temp', T: 60, hold: 20, stir: 0.5 }, { op: 'serve', T: 30 }], result: { color: [0.5, 0.5, 0.5] }, verified: { vitality: 9 } },
  ];
  return { st, raw };
}

test('a version-5 save is refitted once: retired tools refunded or replaced, the order and recipes brought up to date', () => {
  const { raw } = v5Save();
  const coins = raw.coins;
  const back = GameState.fromJSON(JSON.parse(JSON.stringify(raw)));
  assert.equal(back.version, SAVE_VERSION);
  for (const id of Object.keys(RETIRED_EQUIPMENT)) assert.ok(!back.has(id), `${id} is retired`);
  for (const id of ['kit', 'arcanometer', 'stirrer', 'rack1', 'pestle']) assert.ok(back.has(id), `${id} is owned`);
  // full refunds, the lens refunded (an arcanometer was owned), the kit's tools beyond its price, the pestle
  const full = ['hydrometer', 'assay', 'viscometer', 'galvanometer', 'thermal', 'skimmer', 'alembic', 'bellows', 'athanor', 'shelf1', 'shelf2', 'lens'].reduce((a, id) => a + RETIRED_EQUIPMENT[id].price, 0);
  const tools = ['trowel', 'rockhammer', 'brush', 'sickle'].reduce((a, id) => a + RETIRED_EQUIPMENT[id].price, 0);
  const expected = full + (tools - EQUIPMENT.find((e) => e.id === 'kit').price) + 35;
  assert.ok(Math.abs(back.coins - (coins + expected)) < 0.05, `refund ${back.coins - coins} = ${expected}`);
  assert.ok(back.journal['note:refit'] && /paid back/.test(back.journal['note:refit'].text));
  // the order keeps its customer and budget; only outcomes remain
  assert.equal(back.current.customer.name, raw.current.customer.name);
  assert.equal(back.current.budget, raw.current.budget);
  for (const r of back.current.requirements) assert.ok(OUTCOME(r.key), `${r.key} kept`);
  assert.deepEqual(back.current.techniques, ['strong']);
  assert.equal(back.current.style, 'healing+strong');
  // recipes: the distilling one cannot be replayed exactly; the plain one is untouched
  assert.ok(back.recipes[0].approx && /retired/.test(back.recipes[0].approxWhy));
  assert.equal(back.recipes[0].reproduced, 1, 'its history is kept');
  assert.ok(!back.recipes[1].approx);
  assert.equal(back.toJSON().receiver, undefined, 'the alembic receiver is gone');
  // saved and loaded again: no second refund
  const again = GameState.fromJSON(JSON.parse(JSON.stringify(back.toJSON())));
  assert.equal(again.coins, back.coins);
  assert.deepEqual(again.equipment.slice().sort(), back.equipment.slice().sort());
  // loading the same old file twice gives the same result (the refund is a function of the file)
  const twice = GameState.fromJSON(JSON.parse(JSON.stringify(raw)));
  assert.equal(twice.coins, back.coins);
});

test('retiring equipment: a lens without an arcanometer becomes one; a single gathering tool becomes the kit', () => {
  const a = retireEquipment(['hearth', 'lens']);
  assert.ok(a.equipment.includes('arcanometer') && !a.equipment.includes('lens'));
  assert.equal(a.refund, 0);
  const b = retireEquipment(['hearth', 'trowel']);
  assert.ok(b.equipment.includes('kit'));
  assert.equal(b.refund, 0, 'a 20-coin trowel buys no refund, only the kit');
  const c = retireEquipment(['hearth', 'kit', 'sickle']);
  assert.equal(c.refund, 45, 'a sickle bought on top of the kit is refunded');
  const d = retireEquipment(STARTING_EQUIPMENT.filter((id) => id !== 'pestle'));
  assert.equal(d.refund, 0, 'a shop that bought nothing retired gets nothing');
});

/** Steps of a typical brew (ids are only labels for the comparison). */
const steps = (o = {}) => /** @type {any[]} */ ([
  { op: 'pour', id: 'water', ml: 200 },
  { op: 'pour', id: 'leaf', ml: 50, ground: o.whole ? undefined : true },
  ...(o.late ? [] : [{ op: 'pour', id: 'sun', ml: 25, ground: true }]),
  { op: 'stir', s: 8 },
  { op: 'temp', T: o.T ?? 62, hold: o.hold ?? 22, stir: 0.5, ...(o.loss ? { loss: o.loss } : {}) },
  ...(o.late ? [{ op: 'pour', id: 'sun', ml: 25, ground: true }, { op: 'stir', s: 6 }] : []),
  { op: 'serve', T: o.serve ?? 45 },
]);
const parts = [{ id: 'water', ml: 200 }, { id: 'leaf', ml: 50 }, { id: 'sun', ml: 25 }];
const recipe = { ingredients: parts.map((p) => ({ ...p })), steps: steps(), verified: { vitality: 10 } };

test('recipes compare the operations that change the potion, and only those', () => {
  assert.equal(matchRecipe(recipe, parts, steps()), 'procedure');
  // pour order within a stage, seconds of stirring and the exact hold do not matter
  const reordered = steps();
  [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  reordered[3] = { op: 'stir', s: 15 };
  reordered[4] = { op: 'temp', T: 58, hold: 30, stir: 0.6 };
  assert.equal(matchRecipe(recipe, parts, reordered), 'procedure', 'equivalent preparations are the same procedure');
  // what does matter
  /** @type {[any[], RegExp, string][]} */
  const cases = [
    [steps({ late: true }), /sun: .*stage/i, 'a herb added after the steep'],
    [steps({ whole: true }), /left whole/, 'a herb left whole'],
    [steps({ T: 85 }), /85°C instead of 62°C/, 'another steeping heat'],
    [steps({ hold: 6 }), /heat stage|held/, 'a steep cut short'],
    [steps({ loss: 0.25 }), /boiled away/, 'a boil-down the recipe does not have'],
    [steps({ serve: 10 }), /bottled at 10°C/, 'another serving temperature'],
  ];
  for (const [s, re, what] of cases) {
    const c = compareRecipe(recipe, parts, /** @type {any} */ (s));
    assert.equal(c.formulation, true, `${what}: the formulation is the same`);
    assert.equal(c.procedure, false, `${what}: not the same procedure`);
    assert.ok(c.differences.some((d) => re.test(d)), `${what}: ${c.differences.join('; ')}`);
  }
  // whole herbs crushed in the pot before the steep are prepared like ground ones
  const crushed = steps({ whole: true });
  crushed.splice(3, 0, { op: 'crush', s: 12 });
  const forms = (/** @type {string} */ id) => ({ name: id, form: id === 'water' ? 'liquid' : 'solid' });
  assert.equal(matchRecipe(recipe, parts, crushed, forms), 'procedure', 'the pestle prepares them as the mortar does');
  // different amounts: not the formulation
  assert.equal(matchRecipe(recipe, [{ id: 'water', ml: 200 }, { id: 'leaf', ml: 80 }, { id: 'sun', ml: 25 }], steps()), null);
  // an approximate recipe can only claim its formulation
  const approx = { ...recipe, approx: true };
  assert.equal(compareRecipe(approx, parts, steps()).procedure, null);
  assert.equal(matchRecipe(approx, parts, steps()), 'formulation');
  assert.equal(procedureShape(steps()).stages.length, 1);
});

test('older recipes that boiled with the lid open, or skimmed, are marked approximate', () => {
  const boiled = migrateRecipe({ ...recipe, steps: [{ op: 'pour', id: 'water', ml: 200 }, { op: 'lid', closed: false }, { op: 'temp', T: 99, hold: 30 }, { op: 'serve', T: 20 }] });
  assert.ok(boiled.approx && /boiled away/.test(boiled.approxWhy));
  assert.ok(migrateRecipe({ ...recipe, steps: [...steps(), { op: 'skim', ml: 20 }] }).approx);
  assert.ok(!migrateRecipe(recipe).approx);
});

test('a boil-down is recorded with the share that boiled away, and the homunculus replays it', () => {
  const st = GameState.create('boil-replay', { tutorial: false });
  const sim = cauldron(st, STARTING_EQUIPMENT);
  const log = [];
  let next = 0;
  const trace = () => {
    if (sim.time < next) return;
    next = sim.time + 1;
    let T = 0, n = 0;
    for (let i = 0; i < sim.p.count; i++) if (sim.p.phase[i] !== PHASE.GAS) { T += sim.p.temp[i]; n++; }
    if (n) traceSample(log, { t: sim.time, T: T / n, stir: false, crush: false, lid: sim.cauldron.lidClosed, ml: condensedCount(sim) * SIM.ML_PER_PARTICLE });
  };
  const W = st.world.roles.water;
  pour(st, sim, W, 60); log.push({ type: 'pour', id: W, ml: 300, t: 0 });
  pour(st, sim, 'wild-ironroot', 14, { ground: true }); log.push({ type: 'pour', id: 'wild-ironroot', ml: 70, t: 1, ground: true });
  sim.cauldron.lidClosed = false;
  log.push({ type: 'lid', closed: false, t: Math.round(sim.time) });
  const from = condensedCount(sim);
  for (let g = 0; g < 120 * 120 && condensedCount(sim) > from * 0.72; g++) { sim.furnace.setting = 0.7; sim.step(); trace(); }
  sim.furnace.setting = 0;
  for (let g = 0; g < 120 * 20; g++) { sim.step(); trace(); }
  const s = buildProcedure(log, 20);
  const boil = /** @type {any} */ (s.find((x) => x.op === 'temp' && /** @type {any} */ (x).loss));
  assert.ok(boil && boil.loss >= 0.15, `the boil-down is a step with its loss (${JSON.stringify(s)})`);
  const a = measureParticles(sim, tapSelection(sim, 20));
  const sim2 = cauldron(st, STARTING_EQUIPMENT);
  const ab = new AutoBrewer(sim2, /** @type {any} */ ({ ingredients: [], heatTo: 20, coolTo: 20, serveTemp: 20, steps: s }), st.lookup);
  for (let g = 0; !ab.done && g < 120 * 900; g++) { ab.tick(); sim2.step(); }
  assert.ok(!ab.failed, 'the replay completes');
  const volA = condensedCount(sim), volB = condensedCount(sim2);
  assert.ok(Math.abs(volA - volB) / volA < 0.12, `the same share boiled away (${volA} vs ${volB} particles)`);
  const k = EFFECT_INDEX.strength;
  const b = measureParticles(sim2, tapSelection(sim2, 20));
  assert.ok(Math.abs(a.effects[k] - b.effects[k]) <= Math.max(2.5, 0.2 * a.effects[k]), `strength ${b.effects[k].toFixed(1)} vs ${a.effects[k].toFixed(1)}`);
});

test('evidence never claims more than it knows: not detected is not absent, and a margin across a limit is unsettled', () => {
  const zero10 = summarize({ fire: [{ v: 0, r: 'a', rec: 't1', e: 1 }] });
  const ev = effectEvidence(zero10, 'fire', { kind: 'limit', target: 1.2 });
  assert.equal(ev.state, 'not-detected');
  assert.ok(ev.bound > 1.2, `one 10 ml reading leaves room for ${ev.bound}%`);
  assert.equal(ev.within, null, 'so it does not prove the purity limit');
  // several large doses on several rabbits narrow it below the limit
  const zero25 = summarize({ fire: ['a', 'b', 'c', 'd'].map((r, i) => ({ v: 0, r, rec: 't' + i, e: Math.sqrt(10 / 25) })) });
  assert.equal(effectEvidence(zero25, 'fire', { kind: 'limit', target: 1.2 }).within, true);
  // a detected value whose margin straddles the asked minimum
  const one = summarize({ vitality: [{ v: 11, r: 'a', rec: 't1', e: 1 }] });
  assert.equal(effectEvidence(one, 'vitality').state, 'detected');
  assert.equal(effectEvidence(one, 'vitality', { kind: 'min', target: 10 }).within, null);
  const many = summarize({ vitality: [14, 15, 14.5, 15.2, 14.8].map((v, i) => ({ v, r: 'r' + i, rec: 't' + i, e: 1 })) });
  assert.equal(effectEvidence(many, 'vitality', { kind: 'min', target: 10 }).within, true);
  assert.equal(effectEvidence(many, 'vitality').state, 'corroborated');
  // a purity rule reads as unsettled, not as passed, after one small dose
  const purity = { key: 'purity', kind: 'max', target: 1.2, exclude: ['vitality'] };
  const all = Object.fromEntries(EFFECT_KEYS.map((k) => [k, [{ v: k === 'vitality' ? 12 : 0, r: 'a', rec: 't1', e: 1 }]]));
  assert.equal(requirementEvidence(purity, summarize(all)).evidence, 'unsure');
  assert.equal(requirementEvidence(purity, summarize({ vitality: all.vitality })).evidence, 'untested');
});

test('the automated player plays on public knowledge only', () => {
  const src = fs.readFileSync(new URL('../scripts/lib/player.mjs', import.meta.url), 'utf8');
  assert.ok(!/arcane\.thr/.test(src), 'it never reads an ingredient’s hidden arcane threshold');
  assert.ok(!/\.reference\b/.test(src), 'it never reads an order’s hidden plan');
  assert.ok(!/\.laws\b(?!\s*\))/.test(src.replace(/world\.laws\s*\}/g, '').replace(/laws: st\.world\.laws/g, '')), 'it never reads the hidden laws');
  // steeping windows: from the lore until the extraction is in the journal
  const st = GameState.create('honest', { tutorial: false });
  const cap = windowOf(st, 'wild-frostcap');
  assert.ok(cap && !cap.known && cap.hi <= 12, `the lore says Frostcap wants ice-cold water (${JSON.stringify(cap)})`);
  const rx = st.world.reactions.find((r) => r.a === 'wild-frostcap' && /^rw_extract/.test(r.id));
  st.journal['reaction:' + rx.id] = { key: 'reaction:' + rx.id, title: 'x', text: '', kind: 'reaction' };
  const known = windowOf(st, 'wild-frostcap');
  assert.ok(known.known && known.lo === rx.minT && known.hi === rx.maxT, 'once seen, the journal’s window');
});

test('equipment capabilities: the basin cannot hold a cold steep, the frost rune can; the hearth reaches every steep', () => {
  const basin = capabilities(STARTING_EQUIPMENT), rune = capabilities([...STARTING_EQUIPMENT, 'frostrune']);
  assert.ok(basin.minCool > 0 && rune.minCool < -20);
  assert.equal(basin.maxFlame, 340, 'the hearth is the only fire');
  const st = GameState.create('caps', { tutorial: false });
  const hot = st.world.reactions.filter((r) => /^rw_extract/.test(r.id) && r.minT > 20);
  assert.ok(hot.every((r) => r.minT + 7 <= basin.maxFlame - 40), 'every hot steep window opens below what the hearth reaches');
});

test('the mechanics make a measurable difference in the real cauldron: grinding, the steeping heat, cold extraction, boiling down', () => {
  const st = GameState.create('experiment-0', { tutorial: false });
  const kit = [...STARTING_EQUIPMENT, 'frostrune'];
  const W = st.world.roles.water;
  const brew = (herb, n, { ground = true, T = 62, eq = kit, boil = 0 } = {}) => {
    const sim = cauldron(st, eq);
    pour(st, sim, W, 50);
    pour(st, sim, herb, n, { ground });
    hold(sim, T, 22, 'hand');
    if (boil) boilDown(sim, boil);
    settleTo(sim, 20, 90, 'hand');
    stirFor(sim, 4, 'hand');
    return tap(sim, 20);
  };
  const v = EFFECT_INDEX.vitality, f = EFFECT_INDEX.frost;
  const whole = brew('wild-silverleaf', 16, { ground: false }), ground = brew('wild-silverleaf', 16);
  assert.ok(whole.effects[v] < 1 && ground.effects[v] > 5, `grinding: ${whole.effects[v].toFixed(1)} → ${ground.effects[v].toFixed(1)}`);
  const cool = brew('wild-silverleaf', 34, { T: 25 }), warm = brew('wild-silverleaf', 34);
  assert.ok(warm.effects[v] > cool.effects[v] * 1.2, `steeping in the window: ${cool.effects[v].toFixed(1)} → ${warm.effects[v].toFixed(1)}`);
  const warmCap = brew('wild-frostcap', 34, { T: 40, eq: STARTING_EQUIPMENT }), basin = brew('wild-frostcap', 34, { T: 9, eq: STARTING_EQUIPMENT });
  assert.ok(basin.effects[f] > warmCap.effects[f] * 1.8, `cold extraction: ${warmCap.effects[f].toFixed(1)} (warm) → ${basin.effects[f].toFixed(1)} (the basin's 9°C)`);
  const reduced = brew('wild-silverleaf', 16, { boil: 0.3, T: 62 });
  assert.ok(reduced.effects[f] > ground.effects[f] * 1.1, `boiling down strengthens the side effect too: frost ${ground.effects[f].toFixed(1)} → ${reduced.effects[f].toFixed(1)}`);
});
