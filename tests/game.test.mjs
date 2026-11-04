// Game-logic tests: procedural worlds, commission achievability (brewed in
// the real simulation), scoring, economy, the no-softlock safety net and
// save / load / migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, makeLookup } from '../src/materials/generator.js';
import { generateCommission } from '../src/game/commissions.js';
import { capabilities, EQUIPMENT } from '../src/game/equipment.js';
import { Simulation } from '../src/simulation/world.js';
import { runPlanHeadless } from '../src/game/autobrew.js';
import { tapSelection, measureParticles } from '../src/game/measure.js';
import { evaluatePotion, scoreRequirement } from '../src/game/evaluate.js';
import { GameState, migrate, SAVE_VERSION } from '../src/game/state.js';
import { parseImport } from '../src/game/persistence.js';
import { Rng } from '../src/core/rng.js';
import { EFFECT_INDEX, NE } from '../src/alchemy/effects.js';
import { validateRarity } from '../src/materials/rarity.js';

test('worlds are deterministic per seed and differ between seeds', () => {
  const a = generateWorld('alpha-1'), b = generateWorld('alpha-1'), c = generateWorld('beta-2');
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b), 'same seed → identical world');
  const names = (w) => w.ingredients.map((id) => makeLookup(w)(id).name).join('|');
  assert.notEqual(names(a), names(c), 'different seeds → different reagents');
  assert.notDeepEqual(a.reactions.map((r) => r.name), c.reactions.map((r) => r.name));
});

test('the shop stocks plain solvents and ingredients with valid fixed rarity and purity', () => {
  const PAIRS = new Set(['fire', 'frost', 'vitality', 'death', 'toxicity', 'acidity']);
  for (let k = 0; k < 25; k++) {
    const w = generateWorld('start-' + k);
    const lk = makeLookup(w);
    const solvents = [w.roles.water, w.roles.oil, w.roles.spirit];
    assert.deepEqual(w.starting, solvents, `seed start-${k}: only solvents to start`);
    for (const id of w.ingredients) {
      const m = lk(id);
      if (solvents.includes(id)) {
        assert.equal(Object.values(m.effects || {}).filter((v) => Math.abs(Number(v)) >= 1).length, 0, `${m.name} is a plain solvent`);
        continue;
      }
      assert.ok(m.wild, `${m.name} is a natural ingredient`);
      const fx = Object.entries(m.effects).filter(([, v]) => Math.abs(Number(v)) >= 1);
      assert.deepEqual(validateRarity(m), [], `${m.name}: quality follows its tier`);
      // the main effect may be anything; every side effect sits on an opposing pair
      const main = fx.reduce((a, b) => (Math.abs(Number(b[1])) > Math.abs(Number(a[1])) ? b : a));
      for (const [e] of fx) if (e !== main[0] && !PAIRS.has(e)) assert.ok(['strength', 'love', 'arcana', 'transformation', 'swiftness', 'levitation', 'invisibility', 'phasing', 'temporal'].includes(e), `${m.name}: registered secondary channel`);
      // and never both halves of one pair (it would cancel itself)
      const has = (e) => fx.some(([x]) => x === e);
      assert.ok(!(has('fire') && has('frost')) && !(has('vitality') && has('death')), `${m.name} does not carry both halves of a direct opposition`);
      assert.ok(m.density > 0.3 && m.density < 15, `${m.name} density ${m.density}`);
      assert.ok(m.price > 0);
    }
    assert.ok(w.wild.length >= 30, `a wide variety of natural ingredients (${w.wild.length})`);
    assert.equal(new Set(w.ingredients.map((id) => lk(id).name)).size, w.ingredients.length, 'names are unique');
  }
});

test('a fresh shop only asks for what the apprentice can actually brew', () => {
  for (let k = 0; k < 12; k++) {
    const st = GameState.create('fresh-' + k, { tutorial: k % 2 === 0 });
    const com = st.nextCustomer();
    assert.ok(com, 'a customer arrives');
    const avail = st.availableSet();
    const wild = st.gatherableSet();
    for (const ing of com.reference.ingredients) assert.ok(avail.has(ing.id) || wild.has(ing.id), `${ing.id} is purchasable or gatherable on day one`);
    assert.ok(com.reference.heatTo <= st.cap.maxFlame - 20, 'reachable with the starting hearth');
    assert.ok(com.reference.coolTo >= st.cap.minCool - 2, 'reachable with the starting basin');
    const cost = com.reference.ingredients.reduce((s, ing) => s + (wild.has(ing.id) || (isFinite(st.stock(ing.id)) && st.stock(ing.id) >= ing.n * 5) ? 0 : st.priceOf(ing.id) * ing.n * 5 / 100), 0);
    assert.ok(cost <= st.coins + 1e-6, `ingredients affordable (${cost.toFixed(1)} of ${st.coins} coins)`);
  }
});

test('generated commissions are achievable: their hidden reference plans brew to high quality in the real simulation', () => {
  const qualities = [];
  const styles = new Set();
  for (let k = 0; k < 20; k++) {
    const world = generateWorld('achv-' + k);
    const lookup = makeLookup(world);
    const cap = capabilities(EQUIPMENT.map((e) => e.id));
    cap.size = 'small';
    const ctx = { world, lookup, available: new Set(world.ingredients), cap, rank: 4, priceOf: (id) => lookup(id).price || 1 };
    const com = generateCommission(ctx, new Rng('achv-c' + k), { tier: k % 5 });
    assert.ok(com, 'commission generated');
    styles.add(com.style);
    const sim = new Simulation({ size: 'small', lookup, reactions: world.reactions });
    Object.assign(sim.furnace, { maxFlame: cap.maxFlame, heatPower: cap.heatPower, minCool: cap.minCool, coolPower: cap.coolPower });
    const ab = runPlanHeadless(sim, com.reference, lookup);
    assert.ok(!ab.failed, `reference plan for ${com.style} completes`);
    const ev = evaluatePotion(com, measureParticles(sim, tapSelection(sim, com.bottleN)));
    qualities.push(ev.quality);
    assert.ok(ev.quality >= 0.75, `${com.style} (tier ${com.tier}) brewed to quality ${ev.quality.toFixed(2)}`);
  }
  const mean = qualities.reduce((a, b) => a + b, 0) / qualities.length;
  assert.ok(mean >= 0.95, `mean quality ${mean.toFixed(3)}`);
  assert.ok(styles.size >= 5, `variety of styles covered (${[...styles].join(', ')})`);
});

test('scoring rewards accuracy and tolerates small deviations', () => {
  /** @type {any} */
  const req = { key: 'temperature', kind: 'target', target: 45, tol: 5, zero: 15, label: '40–50°C' };
  const at = (t) => scoreRequirement(req, /** @type {any} */ ({ temperature: t, ml: 100 })).score;
  assert.equal(at(45), 1);
  assert.equal(at(49), 1, 'inside the tolerance band scores full marks');
  assert.ok(at(52) < 1 && at(52) > at(58), 'score falls off outside the band');
  assert.equal(at(80), 0, 'far off scores nothing');
  // perfect potion pays the most and earns five stars
  /** @type {any} */
  const com = { requirements: [req], bottleMl: 100, budget: 40, tier: 0, contract: false };
  const good = evaluatePotion(com, /** @type {any} */ ({ temperature: 45, ml: 100 }));
  const short = evaluatePotion(com, /** @type {any} */ ({ temperature: 45, ml: 50 }));
  const off = evaluatePotion(com, /** @type {any} */ ({ temperature: 60, ml: 100 }));
  assert.equal(good.stars, 5);
  assert.ok(good.payment > off.payment && good.payment > short.payment);
  assert.ok(short.quality < good.quality, 'a half-empty bottle is penalised');
  assert.ok(off.repDelta < good.repDelta, 'a poor potion costs reputation relative to a good one');
});

test('the market: buying, storage limits and selling back', () => {
  const st = GameState.create('market-1', { tutorial: false });
  const id = st.world.roles.spirit;
  const c0 = st.coins, s0 = st.stock(id);
  const r = st.buy(id, 100);
  assert.ok(r.ok);
  assert.equal(st.stock(id), s0 + 100);
  assert.ok(Math.abs(st.coins - (c0 - st.priceOf(id))) < 0.11, 'price deducted');
  st.coins = 0;
  assert.equal(st.buy(id, 100).ok, false, 'cannot buy without coins');
  st.coins = 10000;
  let guard = 0;
  while (st.buy(id, 500).ok && guard++ < 50);
  assert.ok(st.stock(id) <= st.cap.storage, 'storage limit holds');
  const before = st.coins;
  assert.ok(st.sellBack(id, 100).ok);
  assert.ok(st.coins > before && st.coins - before <= st.priceOf(id) * 0.41, 'sell-back pays 40%');
  assert.equal(st.buy(st.world.roles.water, 100).ok === false || isFinite(st.stock(st.world.roles.water)) === false, true, 'water is free and unlimited');
});

test('the economy cannot be farmed: buy-and-sell loses money, and a sale pays once', () => {
  const st = GameState.create('exploit-1', { tutorial: false });
  const id = st.world.roles.oil;
  st.coins = 500;
  for (let k = 0; k < 5; k++) { st.buy(id, 100); st.sellBack(id, 100); }
  assert.ok(st.coins < 500, `buying and selling back loses coins (${st.coins})`);
  const com = st.nextCustomer();
  const ev = evaluatePotion(com, perfectMeasurement(com));
  st.completeSale(ev, { ml: com.bottleMl });
  const after = st.coins;
  assert.deepEqual(st.completeSale(ev, { ml: com.bottleMl }), [], 'no second payment without a customer');
  assert.equal(st.coins, after);
  assert.equal(st.stock(st.world.roles.water), Infinity);
});

test('no soft-lock: a broke apprentice gets a daily stipend and water stays free', () => {
  const st = GameState.create('broke-1', { tutorial: false });
  for (const k of Object.keys(st.inventory)) if (isFinite(st.inventory[k])) st.inventory[k] = 0;
  st.coins = 0;
  const g = st.claimRelief();
  assert.ok(g > 0, 'stipend granted');
  assert.equal(st.claimRelief(), 0, 'only once per day');
  const cheapest = Math.min(...st.purchasable().filter((id) => id !== st.world.roles.water).map((id) => st.priceOf(id)));
  assert.ok(st.coins >= cheapest * 2, 'enough to buy reagents for a simple brew');
  assert.equal(st.stock(st.world.roles.water), Infinity);
  st.endDay();
  st.coins = 0;
  assert.ok(st.claimRelief() > 0, 'available again the next day');
});

test('sales, reputation and ranks progress', () => {
  const st = GameState.create('rank-1', { tutorial: false });
  const events = [];
  for (let k = 0; k < 40 && st.rank < 2; k++) {
    const com = st.nextCustomer() || (st.endDay(), st.nextCustomer());
    assert.ok(com);
    events.push(...st.completeSale(evaluatePotion(com, perfectMeasurement(com)), { ml: com.bottleMl }));
  }
  assert.ok(st.rank >= 2, `rank ${st.rank} after perfect sales`);
  assert.ok(events.some((e) => e.type === 'rank'));
  assert.ok(events.some((e) => e.type === 'achievement' && e.id === 'first_sale'));
  assert.ok(st.stats.perfect > 0 && st.stats.served === st.history.length || st.history.length === 60);
});

test('save → JSON → load round-trips the whole game', () => {
  const st = GameState.create('save-1');
  st.coins = 123.4; st.reputation = 17; st.day = 4;
  st.buy(st.world.roles.spirit, 100);
  st.discover(/** @type {any} */ ({ key: 'phase:boil', kind: 'phase', title: 'Boiling', text: 'x' }));
  st.addRecipe({ name: 'Test', steps: [] });
  const json = JSON.stringify(st.toJSON());
  const back = parseImport(json);
  assert.equal(back.coins, st.coins);
  assert.equal(back.day, 4);
  assert.equal(back.stock(st.world.roles.water), Infinity, 'unlimited water survives JSON');
  assert.equal(back.stock(st.world.roles.spirit), st.stock(st.world.roles.spirit));
  assert.deepEqual(back.world.ingredients, st.world.ingredients);
  assert.equal(back.lookup(st.world.roles.oil).name, st.lookup(st.world.roles.oil).name);
  assert.ok(back.journal['phase:boil']);
  assert.equal(back.recipes.length, 1);
});

test('old saves migrate and bad files are rejected with a readable message', () => {
  const st = GameState.create('mig-1');
  const v1 = st.toJSON();
  v1.version = 1;
  delete v1.market; delete v1.receiver; delete v1.grandDone; delete v1.reliefDay; delete v1.knowledge;
  const up = GameState.fromJSON(JSON.parse(JSON.stringify(v1)));
  assert.equal(up.version, SAVE_VERSION);
  assert.ok(up.market && up.knowledge);
  // a save with no embedded world regenerates it from the seed
  const bare = JSON.parse(JSON.stringify(st.toJSON()));
  delete bare.world;
  const regen = GameState.fromJSON(bare);
  assert.deepEqual(regen.world.ingredients, st.world.ingredients);
  // prepared reagents an older shop still held are bought back by the guild
  const held = JSON.parse(JSON.stringify(st.toJSON()));
  held.inventory[st.world.roles.essenceA] = 300;
  held.inventory[st.world.roles.salt] = 100;
  const sold = GameState.fromJSON(held);
  assert.equal(sold.stock(st.world.roles.essenceA), 0);
  assert.ok(sold.coins > st.coins, `paid for the reagents (${st.coins} → ${sold.coins})`);
  assert.ok(sold.journal['note:buyback']);
  assert.ok(!sold.world.ingredients.includes(st.world.roles.essenceA), 'and never stocked again');
  assert.throws(() => parseImport('not json'), /not a valid save/);
  assert.throws(() => migrate({ version: SAVE_VERSION + 1 }), /newer version/);
  assert.throws(() => migrate(null), /Not a save/);
});

/** A measurement that hits every requirement dead centre. @returns {any} */
function perfectMeasurement(com) {
  const m = { ml: com.bottleMl, lab: [0.7, 0, 0], effects: new Array(NE).fill(0), density: 1, viscosity: 1, temperature: 20, stability: 100, volatility: 0 };
  for (const r of com.requirements) {
    if (r.key === 'color') m.lab = r.target;
    else if (r.key === 'viscosity') m.viscosity = Math.exp(r.target);
    else if (EFFECT_INDEX[r.key] !== undefined) m.effects[EFFECT_INDEX[r.key]] = r.target;
    else m[r.key] = r.target;
  }
  return m;
}
