import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../src/game/state.js';
import { BIOMES } from '../src/game/biomes.js';
import { createTraveller, settleTraveller, spendTraveller, awardTravellerGift, TRAVEL, seedDrop, makeBiomeInstance } from '../src/game/travel.js';
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

test('excellent customer gifts use a deterministic roll, preserve recharge progress and respect capacity', () => {
  let gifts = 0, eligible = '';
  for (let i = 0; i < 2000; i++) {
    const t = { balance: 0, last: 1000 };
    const won = awardTravellerGift(t, 'gift-shop', 'sale-' + i, 2000);
    assert.equal(won, awardTravellerGift({ balance: 0, last: 1000 }, 'gift-shop', 'sale-' + i, 2000));
    assert.equal(t.balance, won ? 1 : 0);
    assert.equal(t.last, 1000, 'partial recharge progress survives a gift');
    if (won) { gifts++; eligible = 'sale-' + i; }
  }
  assert.ok(Math.abs(gifts / 2000 - TRAVEL.excellentGiftChance) < 0.03);
  const full = createTraveller(1000);
  assert.equal(awardTravellerGift(full, 'gift-shop', eligible, 2000), false);
  assert.equal(full.balance, TRAVEL.capacity);
});

test('praise grants a Traveller gift once and cannot grant it again after reloading', () => {
  const st = GameState.create('gift-shop', { tutorial: false });
  let saleId = '';
  for (let i = 0; !saleId && i < 100; i++) if (awardTravellerGift({ balance: 0, last: Date.now() }, st.seed, 'sale-' + i)) saleId = 'sale-' + i;
  assert.ok(saleId, 'fixture has a successful gift roll');
  st.traveller.balance = 0;
  st.sales.push({ id: saleId, quality: 0.95, repDelta: 0, techniques: [] });
  st.followUps.push({ id: 'praise-gift', saleId, kind: 'praise', day: st.day, resolved: false, tip: 0 });
  const result = st.settleFollowUp('praise-gift', 'thank');
  assert.equal(st.traveller.balance, 1);
  assert.match(result.text, /Traveller Coin/);
  assert.ok(result.events.some((e) => e.type === 'traveller-gift'));
  const back = GameState.fromJSON(JSON.parse(JSON.stringify(st.toJSON())));
  assert.equal(back.settleFollowUp('praise-gift', 'thank'), null);
  assert.equal(back.traveller.balance, 1);
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


test('regeneration follows rarity weights without forcing rare species into small pools', () => {
  const st = GameState.create('weighted-ecology', { tutorial: false });
  const hits = Object.fromEntries(Object.keys(RARITIES).map((r) => [r, 0]));
  const n = 2000;
  for (let i = 1; i <= n; i++) {
    const roster = makeBiomeInstance(st.world, st.lookup, 'skyshard', i, 4).roster.filter((x) => !st.lookup(x.id).arcaneVariant);
    for (const r of Object.keys(hits)) if (roster.some((x) => st.lookup(x.id).rarity === r)) hits[r]++;
  }
  for (const [r, rule] of Object.entries(RARITIES)) {
    const expected = 1 - (1 - rule.spawnWeight / 100) ** 6;
    assert.ok(Math.abs(hits[r] / n - expected) < 0.04, r + ' tracks independent weighted draws');
  }
  assert.ok(hits.legendary < n * 0.015, 'a six-slot biome does not force a Legendary find');
});

test('only the first Common tutorial crop gets accelerated growth', () => {
  const st = GameState.create('demo-crop', { tutorial: true });
  st.garden.unlocked = true; st.garden.seeds['wild-silverleaf'] = 2;
  assert.ok(st.plantSeed('plot-0', 'wild-silverleaf').ok);
  assert.equal(st.garden.plots[0].crop.tutorial, true);
  assert.ok(st.plantSeed('plot-1', 'wild-silverleaf').ok);
  assert.equal(st.garden.plots[1].crop.tutorial, false);
  const back = GameState.fromJSON(JSON.parse(JSON.stringify(st.toJSON())));
  assert.equal(back.garden.demoUsed, true);
});

test('new apprentice populations do not introduce Exotic effect channels early', () => {
  const st = GameState.create('natural-progression', { tutorial: false });
  for (let i = 0; i < 30; i++) {
    const roster = makeBiomeInstance(st.world, st.lookup, 'forest', i, 0).roster;
    for (const x of roster) for (const key of ['arcana', 'transformation', 'levitation', 'invisibility', 'phasing', 'temporal']) assert.equal(st.lookup(x.id).effects[key] || 0, 0);
  }
});
