import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../src/game/state.js';
import { BIOMES } from '../src/game/biomes.js';
import { createTraveller, settleTraveller, spendTraveller, TRAVEL, seedDrop, makeBiomeInstance } from '../src/game/travel.js';
import { createGarden, gardenStatus, plantSeed, waterPlot, harvestGarden, settleGarden } from '../src/game/garden.js';
import { createGathering, depositStatus, weatherRegrowth, newDayRegrowth, WEATHERS } from '../src/game/gathering.js';
import { RARITIES } from '../src/materials/rarity.js';

test('twelve stable biomes; a new shop starts in Whisperwood only', () => {
  const st = GameState.create('travel-start', { tutorial: false });
  assert.equal(BIOMES.length, 12);
  assert.equal(BIOMES.filter((b) => b.category === 'natural').length, 6);
  assert.deepEqual(st.unlockedBiomes, ['forest']);
  assert.ok(st.deposits.every((d) => d.region === 'forest'));
  assert.ok(st.deposits.some((d) => d.materialId === 'wild-silverleaf@arcane'), 'guaranteed Arcane introduction');
  assert.equal(st.regenerateBiome('moonfen').ok, false);
  assert.equal(st.traveller.balance, 3);
  assert.equal(st.canBuy('wild-silverleaf@arcane').ok, false, 'Arcane stock cannot bypass exploration through the market');
  const intro = st.deposits.find((d) => d.materialId === 'wild-silverleaf@arcane');
  assert.ok(st.gather(intro.id).ok);
  assert.ok(st.garden.seeds['wild-silverleaf'] > 0, 'even an Arcane first find gives a compatible common garden starter');
});

test('Traveller recharge is capped and cannot be repeated by clock rollback', () => {
  const t = createTraveller(1000);
  assert.ok(spendTraveller(t, 1000)); assert.ok(spendTraveller(t, 1000)); assert.ok(spendTraveller(t, 1000));
  assert.equal(spendTraveller(t, 1000), false);
  assert.equal(settleTraveller(t, 1000 + TRAVEL.rechargeMs), 1);
  assert.equal(settleTraveller(t, 1000), 1);
  assert.equal(settleTraveller(t, NaN), 1);
  assert.equal(settleTraveller(t, 1000 + TRAVEL.rechargeMs * 10000), 3);
  assert.equal(settleTraveller(t, Infinity), 3);
});

test('regeneration spends exactly one coin and preserves inventory, seeds, garden and intrinsic quality', () => {
  const st = GameState.create('travel-change', { tutorial: false }), before = st.sceneSeed('forest');
  const d = st.deposits.find((d) => d.materialId === 'wild-silverleaf');
  assert.ok(st.gather(d.id).ok);
  const inventory = { ...st.inventory }, seeds = { ...st.garden.seeds }, profile = structuredClone(st.lookup(d.materialId).effects);
  assert.ok(st.regenerateBiome('forest').ok);
  assert.equal(st.traveller.balance, 2); assert.notEqual(st.sceneSeed('forest'), before);
  assert.deepEqual(st.inventory, inventory); assert.deepEqual(st.garden.seeds, seeds);
  assert.deepEqual(st.lookup(d.materialId).effects, profile);
  const a = makeBiomeInstance(st.world, st.lookup, 'forest', 12, 4), b = makeBiomeInstance(st.world, st.lookup, 'forest', 12, 4);
  assert.deepEqual(a, b); assert.notDeepEqual(a.roster, st.gathering.instances.forest.roster);
});

test('finite wild plants never regrow through waiting, rain, shop days or watering', () => {
  const st = GameState.create('no-regrowth', { tutorial: false }), d = st.deposits.find((d) => d.materialId === 'wild-silverleaf');
  for (let i = 0; i < d.slots; i++) assert.ok(st.gather(d.id).ok);
  const future = Date.now() + 365 * 86400000;
  assert.equal(depositStatus(st.gathering, d, future).mature, 0);
  weatherRegrowth(st.gathering, st.deposits, WEATHERS.find((w) => w.id === 'rain'), st.lookup, future);
  newDayRegrowth(st.gathering, st.deposits, future);
  assert.equal(st.water(d.id, null, future), 0);
  assert.equal(depositStatus(st.gathering, d, future).mature, 0);
});

function farm(arcane = false) {
  const st = GameState.create('cultivation', { tutorial: false }), id = 'wild-silverleaf' + (arcane ? '@arcane' : '');
  st.garden = createGarden(1000); st.garden.unlocked = true; st.garden.seeds[id] = 1;
  if (arcane) st.garden.plots[0].facility = 'arcane';
  assert.ok(plantSeed(st, 'plot-0', id, 1000).ok);
  return { st, id, p: st.garden.plots[0] };
}

test('watering improves growth; harvest consumes the crop exactly once and preserves Arcane identity', () => {
  for (const arcane of [false, true]) {
    const { st, id, p } = farm(arcane), dry = structuredClone(st.garden), m = st.lookup(id);
    assert.ok(waterPlot(st, p.id, 1000).ok);
    assert.ok(gardenStatus(st.garden, p, st.lookup, 61000).growth > gardenStatus(dry, dry.plots[0], st.lookup, 61000).growth);
    const before = st.stock(id);
    assert.ok(harvestGarden(st, p.id, 1000 + RARITIES[m.rarity].growthMs * 8).ok);
    assert.equal(st.stock(id), before + 50); assert.equal(p.crop, null);
    assert.equal(harvestGarden(st, p.id, 9999999).ok, false);
    assert.equal(st.lookup(id).arcaneVariant, arcane);
  }
});

test('garden save/load preserves species, crop identity, seed count and bounded offline progress', () => {
  const { st, id } = farm(true), now = Date.now();
  st.garden.wall = now; st.garden.plots[0].crop.g = 0.3;
  const json = JSON.parse(JSON.stringify(st.toJSON())), back = GameState.fromJSON(json);
  assert.equal(back.garden.plots[0].crop.materialId, id);
  assert.equal(back.garden.plots[0].crop.id, st.garden.plots[0].crop.id);
  assert.equal(back.garden.seeds[id], 0);
  const g = createGarden(1000); settleGarden(g, 1000 + 50 * 86400000);
  assert.equal(g.time, 8 * 3600000);
  settleGarden(g, 1000); assert.equal(g.time, 8 * 3600000);
});

test('seed rolls are deterministic and rarity-aware; Arcane drops are less frequent', () => {
  const st = GameState.create('seed-statistics', { tutorial: false });
  for (const [rarity, r] of Object.entries(RARITIES)) {
    const m = { id: 'sample', rarity, arcaneVariant: false }, counts = [0, 0];
    for (let i = 0; i < 20000; i++) { counts[0] += +seedDrop(st.seed, 'event-' + i, m); counts[1] += +seedDrop(st.seed, 'event-' + i, { ...m, arcaneVariant: true }); }
    assert.ok(Math.abs(counts[0] / 20000 - r.seedChance) < 0.012, rarity);
    assert.ok(counts[1] < counts[0]);
    assert.equal(seedDrop(st.seed, 'same-event', m), seedDrop(st.seed, 'same-event', m));
  }
});
