import { collectedShop } from './game-fixtures.mjs';
// How the systems fit together: legal purchasing and the natural-ingredient
// market, commissions the shop can really supply (and a day that never
// stalls), techniques that the real simulation decides, honest uncertainty
// in trials, evidence that customers weigh, recipes as procedures the
// homunculus can replay, bottles of one batch sharing their evidence,
// patrons, repetition and old saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState, SAVE_VERSION } from '../src/game/state.js';
import { RANKS } from '../src/game/equipment.js';
import { generateCommission, checkSupply, TECHNIQUES } from '../src/game/commissions.js';
import { predictPlan } from '../src/game/predict.js';
import { summarize, readingSteadiness, evidenceRank } from '../src/game/experiments.js';
import { draftLabel, labelTrust, proofGaps, openNegotiation } from '../src/game/commerce.js';
import { buildProcedure, traceSample, migrateRecipe, matchRecipe, checkReproduction, recipeConfidence } from '../src/game/recipes.js';
import { notePatron, patronVerdict, welcomePatron, noveltyFactor } from '../src/game/patrons.js';
import { LAB_ROLES } from '../src/materials/generator.js';
import { Simulation } from '../src/simulation/world.js';
import { AutoBrewer, runPlanHeadless } from '../src/game/autobrew.js';
import { tapSelection, measureParticles } from '../src/game/measure.js';
import { evaluatePotion } from '../src/game/evaluate.js';
import { makeVial } from '../src/game/vial.js';
import { Rng } from '../src/core/rng.js';
import { PHASE } from '../src/simulation/constants.js';
import { NE, EFFECT_INDEX } from '../src/alchemy/effects.js';

/** @param {GameState} st */
function simFor(st) {
  const cap = st.cap;
  const sim = new Simulation({ size: cap.size, lookup: st.lookup, reactions: st.world.reactions, laws: st.world.laws });
  Object.assign(sim.furnace, { maxFlame: cap.maxFlame, heatPower: cap.heatPower, minCool: cap.minCool, coolPower: cap.coolPower });
  return sim;
}

test('the market sells only solvents and the herbalist’s common herbs, never gather-only finds, remains or prepared reagents', () => {
  const st = GameState.create('market-rules', { tutorial: false });
  const R = st.world.roles;
  for (const role of LAB_ROLES) if (R[role]) assert.equal(st.canBuy(R[role]).ok, false, `prepared reagent ${role} is not for sale`);
  for (const id of st.purchasable()) {
    const m = st.lookup(id);
    assert.ok(id === R.water || id === R.oil || id === R.spirit || (m.wild && !m.wild.gatherOnly), `${id} on sale is a solvent or a common herb`);
  }
  const shade = 'wild-nightshade';
  assert.ok(st.lookup(shade).wild.gatherOnly);
  const coins = st.coins;
  const r = st.buy(shade, 100);
  assert.equal(r.ok, false, 'a gather-only ingredient cannot be bought');
  assert.equal(st.coins, coins, 'and nothing was charged');
  // the herbalist sells common herbs only from Journeyman on
  const leaf = 'wild-silverleaf';
  assert.equal(st.buy(leaf, 100).ok, false, 'an apprentice cannot buy herbs');
  st.reputation = RANKS[1].rep;
  assert.equal(st.buy(leaf, 100).ok, true, 'a journeyman can');
  assert.equal(st.canBuy('wild-mandrake').ok, false, 'rare roots are never sold');
  assert.equal(st.buy(R.spirit, 100).ok, true, 'plain solvents are always for sale');
});

test('commissions only need what the shop can gather, hold or legally buy today', () => {
  for (let k = 0; k < 10; k++) {
    const st = GameState.create(`supply-${k}`, { tutorial: false });
    st.reputation = RANKS[k % 3].rep; collectedShop(st);
    st.coins = 30;
    const ctx = st.commissionContext();
    const com = generateCommission(ctx, new Rng(`s${k}`), { tier: k % 3 });
    assert.ok(com, 'a commission was generated');
    const sup = checkSupply(com.reference, ctx);
    assert.ok(sup.ok, `${com.style}: every ingredient obtainable (${sup.short.join(',')}) within the purse (${sup.cost})`);
    for (const ing of com.reference.ingredients) {
      if (ing.id === st.world.roles.water) continue;
      const enough = ctx.supply(ing.id) >= ing.n * 5;
      assert.ok(enough || st.canBuy(ing.id).ok, `${ing.id} is gatherable or for sale`);
    }
    assert.ok(com.supplies && com.supplies.brewMl > com.bottleMl, 'the order says how much brew to make');
  }
});

test('stripped wilds and an empty purse never stall the day: easier orders, then the next customer', () => {
  const st = GameState.create('stall', { tutorial: false });
  st.coins = 0;
  for (const id of Object.keys(st.inventory)) if (isFinite(st.inventory[id])) st.inventory[id] = 0;
  // strip every stand bare, now
  const now = Date.now();
  for (const d of st.deposits) st.gathering.nodes[d.id] = { plants: [], due: now + d.spawnMs, seq: d.slots, scar: true };
  let served = 0;
  for (let guard = 0; guard < 20 && !st.dayOver; guard++) {
    const com = st.nextCustomer();
    if (!com) break;
    served++;
    st.declineCustomer();
  }
  assert.ok(st.dayOver, 'the day reaches its end');
  st.endDay();
  assert.equal(st.opened, false, 'a new day starts with the shop closed');
  const next = st.nextCustomer();
  assert.ok(next || st.dayOver, 'the next day goes on');
  void served;
});

test('every technique can be asked for and changes the order; customers only ask for outcomes they can judge', () => {
  for (const t of TECHNIQUES) {
    let got = null, st = null;
    for (let k = 0; k < 8 && !got; k++) {
      st = GameState.create(`tech-${t.id}-${k}`, { tutorial: false });
      const tier = Math.max(2, t.minTier);
      st.reputation = RANKS[tier].rep; collectedShop(st);
      st.coins = 200;
      st.equipment.push('kit');
      const com = generateCommission(st.commissionContext(), new Rng(`t${k}`), { tier, techniques: [t.id] });
      if (com && com.techniques.includes(t.id)) got = com;
    }
    assert.ok(got && st, `${t.id} was generated`);
    for (const r of got.requirements) assert.ok(r.key === 'purity' || EFFECT_INDEX[r.key] !== undefined, `${t.id}: ${r.key} is an outcome a customer can judge`);
    if (t.id === 'strong') {
      assert.ok(got.reference.reduce && got.reference.reduce.frac > 0, 'a strong order is planned with a real boil-down');
      const plain = predictPlan(st.world, st.lookup, { ...got.reference, reduce: undefined });
      const r0 = got.requirements.find((r) => r.effect && r.key !== 'purity');
      assert.ok(Number(r0.target) > plain.effects[EFFECT_INDEX[r0.key]] * 0.98, `the asked strength (${r0.target}) is beyond the plain brew (${plain.effects[EFFECT_INDEX[r0.key]].toFixed(1)})`);
    }
  }
});

test('the simulation decides: whole herbs and an unsteeped brew miss an order the proper brew fills', () => {
  let st = null, com = null;
  for (let k = 0; k < 10 && !com; k++) {
    st = GameState.create(`phys-${k}`, { tutorial: false });
    st.reputation = RANKS[1].rep; collectedShop(st);
    st.equipment.push('kit');
    const c = generateCommission(st.commissionContext(), new Rng(`p${k}`), { tier: 1, techniques: [] });
    if (c && c.reference.steep && c.reference.crush) com = c;
  }
  assert.ok(com && st, 'an order whose plan crushes and steeps');
  const main = com.requirements.find((r) => r.effect && r.key !== 'purity');
  const score = (sim) => evaluatePotion(com, measureParticles(sim, tapSelection(sim, com.bottleN))).rows.find((r) => r.req.key === main.key).score;
  const good = simFor(st);
  runPlanHeadless(good, com.reference, st.lookup);
  assert.equal(score(good), 1, 'the plan, brewed properly, is strong enough');
  // the same herbs left whole: almost nothing dissolves
  const whole = simFor(st);
  runPlanHeadless(whole, { ...com.reference, crush: false }, st.lookup);
  assert.ok(score(whole) < 1, 'whole herbs fall short');
  // the same, crushed but never steeped
  const cold = simFor(st);
  runPlanHeadless(cold, { ...com.reference, steep: undefined, heatTo: 20 }, st.lookup);
  assert.ok(score(cold) < 1, 'unsteeped, it falls short');
});

test('boiling down with the lid off concentrates the brew as predicted, in the real cauldron', () => {
  // the first strong order the planner can brew well (a new ingredient reshuffles which orders come up)
  let st = null, com = null, sim = null, ev = null;
  for (let k = 0; k < 24 && !com; k++) {
    st = GameState.create(`conc-${k}`, { tutorial: false });
    st.reputation = RANKS[2].rep; collectedShop(st);
    st.coins = 200;
    const c = generateCommission(st.commissionContext(), new Rng(`c${k}`), { tier: 2, techniques: ['strong'] });
    if (!c || !c.techniques.includes('strong')) continue;
    sim = simFor(st);
    const ab = runPlanHeadless(sim, c.reference, st.lookup);
    if (ab.failed) continue;
    ev = evaluatePotion(c, measureParticles(sim, tapSelection(sim, c.bottleN)));
    if (ev.quality >= 0.85) com = c;
  }
  assert.ok(com && ev && st, 'a strong order, brewed to a high quality');
  // without the boiling it is too weak
  const plain = simFor(st);
  runPlanHeadless(plain, { ...com.reference, reduce: undefined }, st.lookup);
  const ev2 = evaluatePotion(com, measureParticles(plain, tapSelection(plain, com.bottleN)));
  assert.ok(ev2.quality < ev.quality, 'the same brew not boiled down falls short');
});

test('one reading is never presented as exact; more rabbits narrow the margin; levels name the evidence', () => {
  const one = summarize({ vitality: [{ v: 12, r: 'a', rec: 't1', e: 1 }] });
  assert.equal(one.level.vitality, 'preliminary');
  assert.equal(one.spread.vitality, 0, 'no spread is seen in one reading…');
  assert.ok(one.unc.vitality >= 4, `…but its margin is that of one dose (±${one.unc.vitality})`);
  const sameRabbit = summarize({ vitality: [12, 12.2, 11.9, 12.1].map((v, i) => ({ v, r: 'a', rec: 't' + i, e: 1 })) });
  assert.equal(sameRabbit.level.vitality, 'repeated');
  const manyRabbits = summarize({ vitality: [12, 12.2, 11.9, 12.1].map((v, i) => ({ v, r: 'r' + i, rec: 't' + i, e: 1 })) });
  assert.ok(evidenceRank(manyRabbits.level.vitality) >= evidenceRank('corroborated'));
  assert.ok(manyRabbits.unc.vitality < sameRabbit.unc.vitality, 'other rabbits average out each one’s bias; one rabbit never does');
  assert.ok(sameRabbit.unc.vitality < one.unc.vitality, 'repeats still help');
  // the margin never uses the truth: identical readings give identical margins whatever the potion really is
  const a = summarize({ love: [{ v: 9, r: 'a', rec: 'x', e: 1 }, { v: 10, r: 'b', rec: 'y', e: 1 }] });
  const b = summarize({ love: [{ v: 9, r: 'a', rec: 'x', e: 1 }, { v: 10, r: 'b', rec: 'y', e: 1 }] });
  assert.deepEqual(a, b);
});

test('a hurt rabbit reads less steadily; a healthy adult is the steadiest', () => {
  const st = GameState.create('steady', { tutorial: false });
  const r = st.colony.rabbits[0];
  const full = readingSteadiness(r, st.day);
  const hurt = { ...r, health: 2 };
  assert.ok(readingSteadiness(hurt, st.day) > full, 'injured: noisier readings');
});

test('customers weigh evidence: corroborated readings earn more trust and a better price than one', () => {
  const com = {
    id: 'q-ev', tier: 1, budget: 80, bottleMl: 100, potionName: 'Healing Draught', effectOrder: true,
    customer: { name: 'Ada Brook', title: 'Healer', archetype: 'healer', portrait: {}, persona: { haggle: 0.3, patience: 3, honesty: 1, proof: 0.85 } },
    requirements: [{ key: 'vitality', kind: 'min', target: 10, tol: 0, zero: 6, label: 'at least 10%', effect: true }],
  };
  const m = { effects: Object.assign(new Array(NE).fill(0), { [EFFECT_INDEX.vitality]: 14 }), ml: 100, lab: [0.6, 0, 0], color: [0.5, 0.5, 0.5], temperature: 20, density: 1, viscosity: 1, stability: 100, volatility: 10 };
  const once = draftLabel({ cert: { vitality: 14 }, certRecords: { vitality: 't1' }, samples: { vitality: [{ v: 14, r: 'a', rec: 't1' }] } }, null, 1);
  const twice = draftLabel({ cert: { vitality: 14 }, certRecords: { vitality: 't2' }, samples: { vitality: [{ v: 14, r: 'a', rec: 't1' }, { v: 14.4, r: 'b', rec: 't2' }] } }, null, 1);
  assert.ok(labelTrust(com, twice, 1) > labelTrust(com, once, 1));
  assert.deepEqual(proofGaps(com, once).map((g) => g.key), ['vitality'], 'a demanding healer wants more than one reading');
  assert.deepEqual(proofGaps(com, twice), []);
  const n1 = openNegotiation(com, { id: 'v', ml: 100, m }, once, 1), n2 = openNegotiation(com, { id: 'v', ml: 100, m }, twice, 1);
  assert.ok(n2.reservation > n1.reservation, 'and is worth more to them');
  assert.ok(n2.reasons.some((r) => r.k === 'trust'), 'the customer says what they weigh');
});

test('bottles of one batch share its trials, each checked against its own contents', () => {
  const st = GameState.create('siblings', { tutorial: false });
  const sim = simFor(st);
  const water = st.world.roles.water;
  sim.emitter.start(st.lookup(water), { x: 0, amount: 30, rate: 110 });
  for (let g = 0; g < 20000 && sim.emitter.pouring; g++) sim.step();
  sim.emitter.start(st.lookup('wild-silverleaf'), { x: 0.3, amount: 12, rate: 70, ground: true });
  for (let g = 0; g < 20000 && sim.emitter.pouring; g++) sim.step();
  for (let s = 0; s < 120 * 30; s++) { sim.furnace.setting = 0.5; sim.step(); }
  sim.furnace.setting = 0;
  st.newBatch(); st.touchBatch();
  const bottle = () => {
    const sel = tapSelection(sim, 8);
    const v = makeVial(sim, sel, { batchId: st.batch.id, rev: st.batch.rev, day: st.day });
    for (const i of sel.sort((a, b) => b - a)) sim.removeParticle(i);
    return v;
  };
  // two bottles drawn from the same batch (their contents as the counter would measure them)
  const b1 = bottle(), b2 = bottle();
  for (const b of [b1, b2]) b.m = { effects: new Array(NE).fill(0).map((_, k) => (k === EFFECT_INDEX.vitality ? 6 : 0)) };
  st.bottles.push(b1, b2);
  // a trial of the batch (from the cauldron) …
  st.recordTrial('rabbit', { effects: b1.m.effects }, { ml: 10, source: 'cauldron', batchId: st.batch.id, rev: st.batch.rev, theory: new Array(NE).fill(0) });
  st.shareEvidence(st.batch.id);
  assert.ok(b1.cert.vitality !== undefined && b2.cert.vitality !== undefined, 'both bottles of the batch carry the reading');
  // … a bottle from another batch does not
  const other = { ...b2, id: 'other', batchId: 'elsewhere', cert: {}, samples: {} };
  st.bottles.push(other);
  st.shareEvidence();
  assert.equal(other.cert.vitality, undefined);
  // a bottle whose own contents differ from what was tested reads stale (no evidence)
  const drifted = { ...b2, id: 'drifted', cert: {}, samples: {}, m: { effects: new Array(NE).fill(0).map((_, k) => (k === EFFECT_INDEX.vitality ? 30 : 0)) } };
  st.bottles.push(drifted);
  st.shareEvidence(st.batch.id);
  assert.equal(drifted.cert.vitality, undefined, 'a bottle unlike the tested brew gets no borrowed evidence');
});

/** Brew a plan while recording the brew log as the lab does (pours, a trace each second). */
function brewRecorded(st, plan) {
  const sim = simFor(st);
  const log = [];
  const ab = new AutoBrewer(sim, plan, st.lookup, { onPoured: (id, n) => log.push({ type: 'pour', id, ml: n * 5, t: Math.round(sim.time) }) });
  let next = 0, stir = false, crush = false;
  for (let g = 0; !ab.done && g < 120 * 400; g++) {
    ab.tick();
    sim.step();
    // like the lab: a sample notes any stirring or crushing since the last one
    stir ||= sim.tool.active && sim.tool.type === 'spoon';
    crush ||= sim.tool.active && sim.tool.type === 'pestle';
    if (sim.time >= next) {
      next = sim.time + 1;
      let T = 0, n = 0;
      for (let i = 0; i < sim.p.count; i++) if (sim.p.phase[i] !== PHASE.GAS) { T += sim.p.temp[i]; n++; }
      if (n) traceSample(log, { t: sim.time, T: T / n, stir, crush, lid: sim.cauldron.lidClosed, ml: n * 5 });
      stir = crush = false;
    }
  }
  let T = 0, n = 0;
  for (let i = 0; i < sim.p.count; i++) if (sim.p.phase[i] !== PHASE.GAS) { T += sim.p.temp[i]; n++; }
  return { sim, log, serveT: T / Math.max(1, n) };
}

test('a recipe records the procedure in order, and the homunculus replays it to the same potion', () => {
  const st = GameState.create('replay', { tutorial: false });
  const com = generateCommission(st.commissionContext(), new Rng('rp'), { tier: 0, request: 'healing', techniques: [] });
  assert.ok(com);
  const { sim, log, serveT } = brewRecorded(st, com.reference);
  const steps = buildProcedure(log, serveT);
  const ops = steps.map((s) => s.op);
  assert.ok(ops.indexOf('pour') === 0, 'it starts by pouring');
  assert.ok(steps.some((s) => s.op === 'temp' && s.T > 40 && s.hold >= 10), `the steep is recorded as a held temperature (${JSON.stringify(steps)})`);
  assert.ok(ops.lastIndexOf('pour') < ops.indexOf('temp'), 'in order: the herbs go in before the heat');
  assert.equal(ops[ops.length - 1], 'serve');
  const a = measureParticles(sim, tapSelection(sim, com.bottleN));
  // the homunculus follows the steps in a fresh cauldron
  const sim2 = simFor(st);
  const ab = new AutoBrewer(sim2, /** @type {any} */ ({ ingredients: [], heatTo: 20, coolTo: 20, serveTemp: 20, steps }), st.lookup);
  for (let g = 0; !ab.done && g < 120 * 900; g++) { ab.tick(); sim2.step(); }
  assert.ok(!ab.failed, 'the replay completes');
  const b = measureParticles(sim2, tapSelection(sim2, com.bottleN));
  const k = EFFECT_INDEX.vitality;
  assert.ok(Math.abs(a.effects[k] - b.effects[k]) <= Math.max(2, 0.2 * a.effects[k]), `replayed vitality ${b.effects[k].toFixed(1)} vs original ${a.effects[k].toFixed(1)}`);
  assert.ok(evaluatePotion(com, b).quality >= 0.85, 'and it still fills the order');
  // the same ingredients without the steep are not the same recipe
  const recipe = { ingredients: steps.filter((s) => s.op === 'pour').map((s) => ({ id: s.id, ml: s.ml, ground: s.ground })), steps, verified: { vitality: a.effects[k] } };
  const parts = recipe.ingredients.map((i) => ({ id: i.id, ml: i.ml }));
  assert.equal(matchRecipe(recipe, parts, steps), 'procedure');
  assert.equal(matchRecipe(recipe, parts, steps.filter((s) => s.op !== 'temp')), 'formulation', 'unheated, it only shares the formulation');
});

test('recipes earn confidence by repeating; old recipes become approximate procedures', () => {
  const r = { verified: { vitality: 12 }, evidence: { vitality: { u: 2 } } };
  assert.equal(recipeConfidence(r), 'tested');
  assert.equal(checkReproduction(r, { values: { vitality: 12.5 }, unc: { vitality: 2 } }, 'b1:1'), 'agree');
  assert.equal(checkReproduction(r, { values: { vitality: 12.5 } }, 'b1:1'), null, 'each batch counts once');
  assert.equal(recipeConfidence(r), 'reproduced');
  checkReproduction(r, { values: { vitality: 30 } }, 'b2:1');
  checkReproduction(r, { values: { vitality: 30 } }, 'b3:1');
  assert.equal(recipeConfidence(r), 'unreliable');
  const old = migrateRecipe({ name: 'Old', ingredients: [{ id: 'water', ml: 100 }, { id: 'wild-silverleaf', ml: 50, ground: true }], maxTemp: 62, minTemp: 20, serveTemp: 45, stirSeconds: 20, crushed: false });
  assert.ok(old.approx);
  assert.deepEqual(old.steps.map((s) => s.op), ['pour', 'pour', 'stir', 'temp', 'serve']);
});

test('patrons remember: trust after good potions, proof after bad ones; easy repeats earn less', () => {
  const st = /** @type {any} */ ({ patrons: {}, day: 3, rank: 1 });
  const com = { potionName: 'Healing Draught', customer: { name: 'Bryn Oakhart', archetype: 'healer', title: 'Healer', portrait: {}, persona: { haggle: 0.4, patience: 3, honesty: 0.9, proof: 0.6 } } };
  notePatron(st, com);
  patronVerdict(st, { customer: com.customer, kind: 'complaint', legit: true }, 'dismiss');
  const back = welcomePatron({ customer: { name: 'x', persona: { haggle: 0.4, patience: 3, honesty: 0.9, proof: 0.6 } }, budget: 50, dialogue: 'Hello.' }, st.patrons['Bryn Oakhart'], st);
  assert.ok(back.customer.persona.proof > 0.6, 'burned once, they want more proof');
  assert.match(back.dialogue, /let me down/);
  patronVerdict(st, { customer: com.customer, kind: 'praise', legit: true }, 'thank');
  patronVerdict(st, { customer: com.customer, kind: 'praise', legit: true }, 'thank');
  patronVerdict(st, { customer: com.customer, kind: 'praise', legit: true }, 'thank');
  const happy = welcomePatron({ customer: { name: 'x', persona: { haggle: 0.4, patience: 3, honesty: 0.9, proof: 0.6 } }, budget: 50, dialogue: 'Hello.' }, st.patrons['Bryn Oakhart'], st);
  assert.ok(happy.customer.persona.proof < 0.6 && happy.budget >= 50, 'won back: less proof, a bigger purse');
  assert.equal(noveltyFactor('healing', [], 0, 0), 1, 'an apprentice is never punished for what customers ask');
  assert.ok(noveltyFactor('healing', ['healing', 'healing', 'healing'], 0, 0) < 1, 'the same order again and again earns a little less');
  assert.ok(noveltyFactor('healing', [], 0, 3) < 0.5, 'an easy order far below the shop’s rank teaches the guild little');
});

test('an older (version 4) save migrates: the day clock, patrons and recipes as approximate procedures', () => {
  const st = GameState.create('migrate5', { tutorial: false });
  st.nextCustomer();
  const raw = JSON.parse(JSON.stringify(st.toJSON()));
  raw.version = 4;
  delete raw.opened;
  delete raw.patrons;
  raw.recipes = [{ id: 'r1', name: 'Old tonic', ingredients: [{ id: st.world.roles.water, ml: 100 }], maxTemp: 50, minTemp: 20, serveTemp: 30, stirSeconds: 5, result: { color: [0.5, 0.5, 0.5], density: 1, viscosity: 1 }, verified: {} }];
  const back = GameState.fromJSON(raw);
  assert.equal(back.version, SAVE_VERSION);
  assert.equal(back.opened, true, 'a customer was in: the shop was open');
  assert.deepEqual(back.patrons, {});
  assert.ok(back.recipes[0].approx && back.recipes[0].steps.length >= 2);
  assert.ok(back.current, 'the waiting customer is still there');
});
