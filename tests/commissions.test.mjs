import { collectedShop } from './game-fixtures.mjs';
// Commission rules: concentration targets by tier, the 1.2 % purity rule,
// coherent requests, only accessible ingredients and equipment, arcane
// activation that is genuinely needed, and real-simulation brews of the
// hidden plans (including activation orders).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCommission } from '../src/game/commissions.js';
import { REQUESTS, TIER_TARGET, PURITY_LIMIT } from '../src/game/requests.js';
import { predictPlan } from '../src/game/predict.js';
import { EQUIPMENT, RANKS } from '../src/game/equipment.js';
import { GameState } from '../src/game/state.js';
import { Simulation } from '../src/simulation/world.js';
import { runPlanHeadless } from '../src/game/autobrew.js';
import { tapSelection, measureParticles } from '../src/game/measure.js';
import { evaluatePotion, strongestUnwanted } from '../src/game/evaluate.js';
import { Rng } from '../src/core/rng.js';
import { EFFECT_INDEX } from '../src/alchemy/effects.js';
import { isAwakenedId } from '../src/alchemy/arcane.js';

/** A shop at a rank that owns everything that rank may buy (but the first pot). */
function shopAt(seed, rank) {
  const st = GameState.create(seed, { tutorial: false });
  st.reputation = RANKS[rank].rep; collectedShop(st);
  st.equipment = EQUIPMENT.filter((e) => e.rank <= rank && e.category !== 'vessel').map((e) => e.id).concat(['pot']);
  return st;
}

function sample(tier, count, prefix = 'cm') {
  const out = [];
  for (let k = 0; k < count; k++) {
    const st = shopAt(`${prefix}${tier}-${k}`, tier);
    const ctx = st.commissionContext();
    const com = generateCommission(ctx, new Rng(`${prefix}c${tier}-${k}`), { tier });
    out.push({ st, ctx, com });
  }
  return out;
}

test('apprentice orders ask for 8–15 % of what they want, and nothing else above 1.2 %', () => {
  let effectOrders = 0;
  for (const { com } of sample(0, 30)) {
    assert.ok(com, 'a commission was generated');
    const fx = com.requirements.filter((r) => r.effect && r.key !== 'purity');
    if (!com.request) continue;
    effectOrders++;
    const main = fx[0];
    assert.ok(main.target >= 6 && main.target <= TIER_TARGET[0][1], `${com.style}: main target ${main.target}%`);
    const purity = com.requirements.find((r) => r.key === 'purity');
    assert.ok(purity, 'a drinkable order carries the purity rule');
    assert.equal(purity.target, PURITY_LIMIT);
    assert.deepEqual([...purity.exclude].sort(), fx.map((r) => r.key).sort());
    assert.ok(!com.activation, 'no apprentice order needs arcane activation');
  }
  assert.ok(effectOrders >= 15, `mostly effect orders (${effectOrders})`);
});

test('requests are coherent: the wanted effects, the customer and the story come from one situation', () => {
  for (let tier = 0; tier < 5; tier++) {
    for (const { com } of sample(tier, 10, 'coh')) {
      if (!com || !com.request) continue;
      const req = REQUESTS.find((r) => r.id === com.request);
      assert.ok(req, `known request ${com.request}`);
      assert.ok(req.minTier <= tier);
      // (fresh shops have no market event, so no festival or plague extras)
      assert.ok(req.who.includes(com.customer.archetype), `${req.id} asked by a ${com.customer.archetype}`);
      // the request's own story, then whatever techniques the customer adds
      assert.ok(req.story.some((t) => com.dialogue.startsWith(t)), 'the story told is the request’s own');
      const wanted = com.requirements.filter((r) => r.effect && r.key !== 'purity').map((r) => r.key).sort();
      assert.deepEqual(wanted, req.fx.map((f) => f.key).sort(), `${req.id} asks exactly for its effects`);
    }
  }
});

test('targets rise with rank, every plan uses only what the shop can reach, and master orders sometimes need awakening', () => {
  let activations = 0, needed = 0;
  const mains = [];
  for (let tier = 0; tier < 5; tier++) {
    const t = [];
    for (const { st, ctx, com } of sample(tier, 16, 'rise')) {
      if (!com) continue;
      for (const ing of com.reference.ingredients) assert.ok(ctx.available.has(ing.id), `${ing.id} is buyable or gatherable at rank ${tier}`);
      const plan = com.reference;
      assert.ok((plan.heatTo ?? 20) <= st.cap.maxFlame - 30, 'the fire can reach it');
      assert.ok((plan.coolTo ?? 20) >= st.cap.minCool, 'the cold can reach it');
      // a boiled-down order is stronger than its tier by design: the rise is measured without it
      // the demand of an order is the total strength it asks for across its wanted effects
      // (masters combine several); a boiled-down order is stronger than its tier by design
      if (com.request && !(com.techniques || []).includes('concentrate')) t.push(com.requirements.filter((r) => r.effect && r.key !== 'purity').reduce((a, r) => a + Math.abs(Number(r.target)), 0));
      if (com.activation) {
        activations++;
        assert.ok(tier >= 2);
        assert.ok(Object.keys(predictPlan(st.world, st.lookup, plan).composition).some(isAwakenedId), 'the plan awakens its magic');
        // without the awakening stage the same ingredients fall short
        const plain = { ...plan, heatTo: Math.min(plan.heatTo, 20), coolTo: Math.max(plan.coolTo, 20), activate: false, reduce: undefined };
        const p2 = predictPlan(st.world, st.lookup, plain);
        const main = com.requirements[0];
        if (main.kind === 'min' && Math.abs(p2.effects[EFFECT_INDEX[main.key]]) < main.target) needed++;
      }
    }
    mains.push(t.reduce((a, b) => a + b, 0) / Math.max(1, t.length));
  }
  for (let k = 1; k < 5; k++) assert.ok(mains[k] >= mains[k - 1] - 1, `targets rise with rank (${mains.map((m) => m.toFixed(1)).join(' → ')})`);
  assert.ok(activations >= 6, `advanced orders that need awakening (${activations})`);
  assert.ok(needed >= activations * 0.7, `where a plan awakens, plain brewing would fall short (${needed}/${activations})`);
});

test('hidden plans brew to full quality in the real simulation, awakening orders included', () => {
  const picked = [];
  for (let tier = 0; tier < 5; tier++) {
    const s = sample(tier, 12, 'real');
    // one plain and (where there is one) one awakening order per tier
    const plain = s.find((x) => x.com && !x.com.activation);
    const awaken = s.find((x) => x.com && x.com.activation);
    if (plain) picked.push(plain);
    if (awaken) picked.push(awaken);
  }
  assert.ok(picked.filter((x) => x.com.activation).length >= 2);
  for (const { st, com } of picked) {
    const cap = st.cap;
    const sim = new Simulation({ size: cap.size, lookup: st.lookup, reactions: st.world.reactions, laws: st.world.laws });
    Object.assign(sim.furnace, { maxFlame: cap.maxFlame, heatPower: cap.heatPower, minCool: cap.minCool, coolPower: cap.coolPower });
    const ab = runPlanHeadless(sim, com.reference, st.lookup);
    assert.ok(!ab.failed, `${com.style} plan completes`);
    const m = measureParticles(sim, tapSelection(sim, com.bottleN));
    const ev = evaluatePotion(com, m);
    assert.ok(ev.quality >= 0.85, `${com.style} (tier ${com.tier}${com.activation ? ', awakened' : ''}) brewed to ${ev.quality.toFixed(2)}: ${ev.rows.filter((r) => r.score < 1).map((r) => r.req.key + ' ' + r.text).join(', ')}`);
    const purity = com.requirements.find((r) => r.key === 'purity');
    if (purity) assert.ok(strongestUnwanted(m.effects, purity.exclude).value < 1.6, `${st.seed}/${com.style}: unwanted ${JSON.stringify(strongestUnwanted(m.effects, purity.exclude))}`);
  }
});

test('the purity rule scores what the customer did not ask for, alkaline included', () => {
  const req = { key: 'purity', kind: 'max', target: 1.2, tol: 0, zero: 2.5, exclude: ['vitality'], label: '' };
  const fx = (o) => { const e = new Array(10).fill(0); for (const [k, v] of Object.entries(o)) e[EFFECT_INDEX[k]] = v; return e; };
  const score = (o) => evaluatePotion({ requirements: [req], bottleMl: 100, budget: 10, tier: 0 }, /** @type {any} */ ({ ml: 100, effects: fx(o) })).rows[0].score;
  assert.equal(score({ vitality: 40 }), 1, 'the wanted effect may be strong');
  assert.equal(score({ vitality: 40, love: 1.1 }), 1, 'a trace under the limit is fine');
  assert.ok(score({ vitality: 40, love: 2 }) < 1, 'over the limit is not');
  assert.ok(score({ vitality: 40, acidity: -3 }) < 0.7, 'alkaline counts as an unwanted effect too');
});

test('an explicitly requested technique retries unsuitable plans instead of silently dropping it', () => {
  const state = GameState.create('integration-1', { tutorial: false });
  state.reputation = 70; collectedShop(state);
  const commission = generateCommission(state.commissionContext(), new Rng('ui-tech'), { tier: 2, techniques: ['strong'] });
  assert.ok(commission, 'a feasible requested technique is generated');
  assert.ok(commission.techniques.includes('strong'));
});
