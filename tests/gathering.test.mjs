// Gathering depth: methods and tools, the hour, the weather, careful or
// thorough harvests; plants that sprout, ripen and mature, harvests that
// leave nothing behind and the stands growing back to saturation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../src/game/state.js';
import { gatherPlan, dayPart, weatherOn, WEATHERS, depositStatus, normalizeGathering, SCAR_SLOWDOWN, weatherRegrowth, harvestable, standOf, plantStage, SPROUT_SHARE, REGIONS, growthOf, checkpoint, moistureEnv, water, matureIn, GATHER_VERSION, GROW_FLOOR, WATER_DOSE, migrateGathering, sandboxWilds, SANDBOX_PACE } from '../src/game/gathering.js';

import { growthSandbox } from './game-fixtures.mjs';
const fresh = growthSandbox;
const depositOf = (st, key) => st.deposits.find((d) => st.lookup(d.materialId).wild.key === key);

test('the Forager’s Kit doubles every harvest that is not simply picked; picking needs nothing', () => {
  const st = fresh();
  const leaf = depositOf(st, 'silverleaf');
  const kinds = ['riverchalk', 'emberflint', 'emberbark', 'mica'].map((k) => depositOf(st, k)).filter(Boolean);
  assert.ok(kinds.length >= 3, 'deposits of roots, seams, bark and dust');
  const byHand = kinds.map((d) => gatherPlan(st, d, st.lookup(d.materialId)));
  for (const p of byHand) { assert.equal(p.method.tool, 'kit'); assert.equal(p.hasTool, false); }
  st.equipment.push('kit');
  kinds.forEach((d, k) => assert.equal(gatherPlan(st, d, st.lookup(d.materialId)).take, byHand[k].take * 2, `${d.materialId}: one kit serves every method`));
  assert.equal(gatherPlan(st, leaf, st.lookup(leaf.materialId)).hasTool, true, 'leaves are picked by hand');
});

test('the shop door is the clock: dawn before opening, dusk after the last customer; twilight plants give a few sprigs out of their hour', () => {
  const st = fresh();
  st.opened = false;
  assert.equal(dayPart(st), 'dawn', 'before the door opens');
  st.nextCustomer();
  assert.ok(st.opened, 'letting the first customer in opens the shop');
  assert.equal(dayPart(st), 'day');
  st.current = null; st.customerIndex = st.customersPerDay;
  assert.equal(dayPart(st), 'dusk', 'once the last customer has gone');
  st.endDay();
  assert.equal(dayPart(st), 'dawn', 'a new day starts closed');
  st.current = null; st.customerIndex = st.customersPerDay;
  const shade = depositOf(st, 'nightshade');
  const m = st.lookup(shade.materialId);
  assert.ok(m.wild.dusk);
  const atDusk = gatherPlan(st, shade, m);
  st.customerIndex = 1; st.opened = true;
  const atNoon = gatherPlan(st, shade, m);
  assert.ok(atDusk.open && !atNoon.open);
  assert.ok(atNoon.take >= 5, 'never completely out of reach');
  assert.ok(atNoon.take < atDusk.take);
});

test('weather is deterministic per world and day, and acts on regrowth', () => {
  assert.equal(weatherOn('w', 1).id, 'clear', 'the first day is always fair');
  const seen = new Set();
  for (let d = 2; d < 80; d++) {
    assert.equal(weatherOn('w', d).id, weatherOn('w', d).id);
    seen.add(weatherOn('w', d).id);
  }
  assert.ok(seen.size >= 5, `varied weather (${[...seen]})`);
  const st = fresh();
  const leaf = depositOf(st, 'silverleaf');
  const stone = depositOf(st, 'emberflint');
  const now = Date.now();
  for (const d of [leaf, stone]) st.gathering.nodes[d.id] = { plants: [], due: now + d.spawnMs, seq: d.slots };
  weatherRegrowth(st.gathering, st.deposits, WEATHERS.find((w) => w.id === 'rain'), st.lookup, now);
  const wet = depositStatus(st.gathering, leaf, now);
  assert.equal(wet.plants.length, leaf.slots, 'rain brings up every empty slot');
  assert.ok(wet.plants.every((p) => p.stage === 'ripe' && p.moisture >= 0.999), 'half-grown, in soaked soil');
  assert.equal(depositStatus(st.gathering, stone, now).plants.length, 0, 'but not the stones');
});

test('a thorough harvest digs the plant out for twice as much and scars the stand until it is saturated', () => {
  const st = fresh();
  st.equipment.push('trowel');
  st.customerIndex = 1; st.opened = true;
  const root = depositOf(st, 'ironroot');
  const careful = gatherPlan(st, root, st.lookup(root.materialId)).take;
  const now = Date.now() + 60 * 60000;
  const r = st.gather(root.id, { thorough: true, now });
  assert.ok(r.ok);
  assert.equal(r.amount, careful * 2);
  const s = depositStatus(st.gathering, root, now);
  assert.ok(s.scarred);
  // the next sprout comes at half pace
  assert.equal(st.gathering.nodes[root.id].due, now + root.spawnMs * SCAR_SLOWDOWN);
  assert.equal(standOf(st.gathering, root, now + root.spawnMs * 1.5).plants.length, s.plants.length, 'not yet');
  assert.equal(standOf(st.gathering, root, now + root.spawnMs * SCAR_SLOWDOWN).plants.length, s.plants.length + 1);
  // the scar is saved
  const g = normalizeGathering(JSON.parse(JSON.stringify(st.gathering)), now);
  assert.equal(g.nodes[root.id].scar, true);
  // saturated again, the scar is gone
  assert.equal(depositStatus(st.gathering, root, now + root.spawnMs * SCAR_SLOWDOWN * root.slots).scarred, false);
});

test('plants sprout, ripen and mature; only a mature one can be harvested', () => {
  const st = fresh('gather-2');
  st.reputation = 60; // the river's ordinary gathering rank
  st.customerIndex = 1; st.opened = true;
  st.equipment.push('kit');
  const chalk = depositOf(st, 'riverchalk');
  const t0 = Date.now() + 60 * 60000;
  const s0 = depositStatus(st.gathering, chalk, t0);
  assert.equal(s0.plants.length, chalk.slots, 'an untouched stand is saturated');
  assert.ok(s0.mature >= 1, 'and something in it is mature');
  const plan = gatherPlan(st, chalk, st.lookup(chalk.materialId));
  assert.equal(plan.eff, 1, 'with the Forager’s Kit nothing is spoiled');
  // harvest every mature plant: each gives what the button promised
  let got = 0, last;
  for (let k = 0; k < 20; k++) {
    const can = harvestable(st.gathering, chalk, plan, t0);
    last = st.gather(chalk.id, { now: t0 });
    if (!last.ok) { assert.equal(can, 0, 'the button agreed nothing was mature'); break; }
    assert.equal(last.amount, can);
    got += last.amount;
  }
  assert.equal(last.ok, false);
  assert.equal(last.reason, 'depleted');
  assert.equal(got, s0.mature * plan.take, 'one harvest per mature plant');
  // a sprout comes up after spawnMs at a random spot, and cannot be taken until it matures
  const t1 = t0 + chalk.spawnMs;
  const s1 = standOf(st.gathering, chalk, t1);
  const kid = s1.plants.find((p) => p.born === t1);
  assert.ok(kid, 'a new sprout');
  assert.equal(plantStage(chalk, kid, t1).stage, 'sprout');
  assert.equal(plantStage(chalk, kid, t1 + chalk.growMs * SPROUT_SHARE + 1).stage, 'ripe');
  assert.equal(plantStage(chalk, kid, t1 + chalk.growMs).stage, 'mature');
  const early = st.gather(chalk.id, { now: t1 + chalk.growMs / 2, plant: kid.id });
  assert.equal(early.reason, 'growing', 'a ripe plant is not ready');
  assert.ok(Math.abs(early.nextIn - chalk.growMs / 2) < 2);
  const ok = st.gather(chalk.id, { now: t1 + chalk.growMs, plant: kid.id });
  assert.ok(ok.ok, 'a mature one is');
  assert.equal(ok.plant, kid.id);
  assert.equal(st.gather(chalk.id, { now: t1 + chalk.growMs, plant: kid.id }).reason, 'gone');
});

test('a harvest leaves nothing on the ground; new sprouts grow back at random spots until the region is saturated', () => {
  const st = fresh('gather-3');
  st.customerIndex = 1; st.opened = true;
  const t0 = Date.now() + 60 * 60000;
  const forest = st.deposits.filter((d) => d.region === 'forest' && d.rank <= st.rank);
  const d = forest[0];
  const before = standOf(st.gathering, d, t0);
  const r = st.gather(d.id, { now: t0 });
  assert.ok(r.ok);
  const gone = before.plants.find((p) => p.id === r.plant);
  assert.ok(gone, 'the plant was taken');
  assert.equal(/** @type {any} */ (st.gathering).marks, undefined, 'and no mark of it is kept on the ground');
  // strip the stand, then let it grow back: never past its slots, at new spots
  while (st.gather(d.id, { now: t0 }).ok);
  const later = standOf(st.gathering, d, t0 + d.spawnMs * (d.slots + 5));
  assert.equal(later.plants.length, d.slots, 'saturated, and no further');
  assert.equal(later.due, null, 'it stops sprouting');
  const spots = new Set(later.plants.map((p) => `${p.x},${p.y}`));
  assert.equal(spots.size, d.slots, 'each sprout at its own spot');
  for (const p of later.plants) {
    assert.ok(!before.plants.some((q) => q.x === p.x && q.y === p.y), 'not where the old plants stood');
    assert.ok(p.x > 0 && p.x < 1 && p.y >= 0.5 && p.y <= 0.92, 'on the ground');
  }
  // the region's saturation is the sum of its stands' slots, with every ingredient represented
  for (const region of REGIONS) {
    const ds = st.deposits.filter((x) => x.region === region.id);
    const total = ds.reduce((a, x) => a + standOf(st.gathering, x, t0 + 1e9).plants.length, 0);
    assert.equal(total, ds.reduce((a, x) => a + x.slots, 0), `${region.id} saturates`);
    assert.ok(ds.every((d) => d.slots <= 3), `${region.id}: the sandbox bounds each species stand`);
  }
  // harvested again, it starts growing back again
  const again = st.gather(d.id, { now: t0 + d.spawnMs * (d.slots + 5) + d.growMs * 2 });
  assert.ok(again.ok);
  assert.ok(st.gathering.nodes[d.id].due !== null, 'sprouting again');
  // plants survive a save
  const back = normalizeGathering(JSON.parse(JSON.stringify(st.gathering)), t0 + 1e9);
  assert.deepEqual(back.nodes[d.id].plants, st.gathering.nodes[d.id].plants);
  assert.equal(back.created, st.gathering.created);
});

test('an old save’s stock-in-ml stands start afresh, saturated', () => {
  const g = normalizeGathering({ nodes: { 'forest:ironroot:0': { stock: 10, at: 5 } }, created: 100 }, 1000);
  assert.deepEqual(g.nodes, {});
  assert.equal(g.created, 100);
  assert.equal(/** @type {any} */ (g).marks, undefined, 'marks an old save kept are dropped');
});

test('the night after a rainy day regrows the plants', () => {
  const st = fresh('gather-rain');
  let day = 1;
  while (day < 200 && weatherOn(st.seed, day).id !== 'rain') day++;
  assert.ok(day < 200);
  st.day = day;
  const leaf = depositOf(st, 'silverleaf');
  st.gathering.nodes[leaf.id] = { plants: [], due: Date.now() + leaf.spawnMs, seq: leaf.slots };
  st.current = null;
  const t = Date.now();
  st.endDay();
  const s = depositStatus(st.gathering, leaf, t + 1000);
  assert.equal(s.plants.length, leaf.slots, 'the rain that fell today fills the stand tonight');
  assert.ok(s.plants.every((p) => p.grown >= 0.89), 'and grows every plant well on (soaked, then the new day)');
  assert.ok(s.mature >= 1 || s.plants.every((p) => p.matureIn < leaf.growMs * 0.3), 'nearly ready');
});

// ------------------------------------------------------------------ moisture and growth

/** A stand of one fresh sprout at t0, in soil at the habitat's level. */
function seedling(st, key, t0) {
  const d = depositOf(st, key);
  const base = moistureEnv(d, st.gathering.sky).base;
  st.gathering.nodes[d.id] = { plants: [{ id: d.id + '#x', x: 0.5, y: 0.7, born: t0, g: 0, t: t0, w: base }], due: null, seq: 99 };
  return d;
}

test('living plants drink: watering wets their soil, damp soil grows them faster, dry soil slows them, and more water never helps beyond full', () => {
  const t0 = Date.now();
  const a = fresh('drink-1'), b = fresh('drink-1');
  a.gathering.sky = b.gathering.sky = 'clear';
  const da = seedling(a, 'sunthistle', t0), db = seedling(b, 'sunthistle', t0);
  assert.ok(da.botanical);
  assert.equal(a.water(da.id, null, t0), 1, 'the sprout drinks');
  const pa = a.gathering.nodes[da.id].plants[0];
  assert.ok(pa.w > moistureEnv(da, 'clear').base + WATER_DOSE * 0.99 - 1e-9 || pa.w === 1, 'its soil is wetter');
  const t1 = t0 + da.growMs * 0.4;
  const ga = growthOf(da, pa, t1, 'clear').g, gb = growthOf(db, b.gathering.nodes[db.id].plants[0], t1, 'clear').g;
  assert.ok(ga > gb * 1.3, `watered grows faster (${ga.toFixed(3)} vs ${gb.toFixed(3)})`);
  // a dry plant still grows, slowly — never stuck
  assert.ok(gb >= GROW_FLOOR * 0.4 * 0.99, 'dry soil slows but never stops it');
  // watering again and again: moisture is capped, growth no faster than at full
  for (let k = 0; k < 5; k++) a.water(da.id, null, t0);
  const capped = a.gathering.nodes[da.id].plants[0];
  assert.ok(capped.w <= 1);
  assert.ok(growthOf(da, capped, t1, 'clear').g <= 1.5 * 0.4 + 1e-6, 'never beyond the full pace');
  // watering never matures a plant at once
  assert.equal(plantStage(da, capped, t0 + 1000, 'clear').stage, 'sprout');
  // its soil dries back toward the habitat's level
  const later = growthOf(da, capped, t0 + 48 * 3600000, 'clear');
  assert.ok(Math.abs(later.w - moistureEnv(da, 'clear').base) < 0.01);
});

test('growth resolves the same however often it is checked, never runs backwards, and survives a save', () => {
  const st = fresh('drink-2');
  const t0 = Date.now(), d = seedling(st, 'frostcap', t0);
  st.water(d.id, null, t0);
  const p = st.gathering.nodes[d.id].plants[0];
  const direct = growthOf(d, p, t0 + d.growMs, 'clear');
  let q = p;
  for (let k = 1; k <= 10; k++) q = checkpoint(d, q, t0 + (d.growMs * k) / 10, 'clear');
  const stepped = growthOf(d, q, t0 + d.growMs, 'clear');
  assert.ok(Math.abs(direct.g - stepped.g) < 1e-5 && Math.abs(direct.w - stepped.w) < 1e-5, 'no growth counted twice');
  // a clock set back neither grows nor shrinks it
  assert.equal(growthOf(d, p, t0 - 3600000, 'clear').g, p.g);
  // the time it says it needs is the time it takes
  const left = matureIn(d, p, t0, 'clear');
  assert.equal(plantStage(d, p, t0 + left + 1, 'clear').stage, 'mature');
  assert.notEqual(plantStage(d, p, t0 + left * 0.9, 'clear').stage, 'mature');
  // the checkpoint is saved
  const back = normalizeGathering(JSON.parse(JSON.stringify(st.gathering)), t0 + 1);
  assert.deepEqual(back.nodes[d.id].plants, st.gathering.nodes[d.id].plants);
  assert.equal(back.v, GATHER_VERSION);
});

test('wet habitats keep their soil damp; stones, crystals and shells do not drink', () => {
  const st = fresh('drink-3');
  const fen = st.deposits.find((x) => x.region === 'moonfen' && x.botanical), crag = st.deposits.find((x) => x.region === 'crags' && x.botanical);
  const meadow = st.deposits.find((x) => x.region === 'meadow' && x.botanical), river = st.deposits.find((x) => x.region === 'river' && x.botanical);
  assert.ok(moistureEnv(fen).base > moistureEnv(meadow).base && moistureEnv(river).base > moistureEnv(meadow).base);
  assert.ok(moistureEnv(fen).tau > moistureEnv(crag).tau, 'a bog holds water longer than the crags');
  assert.ok(moistureEnv(meadow, 'rain').base > 0.9 && moistureEnv(meadow, 'heat').base < moistureEnv(meadow).base, 'rain wets it, a heatwave dries it');
  for (const key of ['riverchalk', 'emberflint', 'cinnabar', 'riverpearl', 'mica']) {
    const d = depositOf(st, key);
    assert.equal(d.botanical, false, `${key} is not a plant`);
    assert.equal(water(st.gathering, d, null), 0, `${key} takes no water`);
    const p = { id: 'x', x: 0.5, y: 0.7, born: 1000 };
    assert.equal(growthOf(d, p, 1000 + d.growMs / 2).g, 0.5, `${key} comes back with time alone`);
  }
});

test('an old save’s plants keep every bit of their growth when they start to drink', () => {
  const st = fresh('drink-4');
  const d = depositOf(st, 'silverleaf'), now = Date.now();
  const raw = JSON.parse(JSON.stringify(st.toJSON()));
  // gathering as saved before plants drank: plants by age only, no version
  raw.gathering = { nodes: { [d.id]: { plants: [{ id: d.id + '#0', x: 0.3, y: 0.7, born: now - d.growMs * 2 }, { id: d.id + '#1', x: 0.6, y: 0.7, born: now - d.growMs * 0.5 }], due: null, seq: 2 } }, marks: [], total: 40, trips: 1, created: now - 1e7 };
  const gathering = normalizeGathering(raw.gathering, now);
  migrateGathering(gathering, st.deposits, now);
  const back = { gathering };
  const s = depositStatus(back.gathering, d, now);
  assert.equal(s.mature, 1, 'the ripe plant is still ripe');
  assert.ok(Math.abs(s.plants.find((p) => p.id === d.id + '#1').grown - 0.5) < 0.02, 'the half-grown one still half-grown');
  assert.equal(back.gathering.total, 40, 'the record kept');
  assert.equal(back.gathering.v, GATHER_VERSION);
});

test('the Netherwood, the cavern under the Whisperwood, grows Witch’s Ear and Mandrake — also in a world saved before it was found', async () => {
  const { addAlchemy } = await import('../src/materials/generator.js');
  const st = fresh();
  const nether = REGIONS.find((r) => r.id === 'netherwood');
  assert.ok(nether && nether.rank === 2, 'a region of its own, gated by its progression rank');
  for (const key of ['witchear', 'mandrake']) assert.equal(depositOf(st, key).region, 'netherwood', `${key} grows in the Netherwood`);
  assert.ok(st.deposits.some((d) => d.region === 'forest' && d.rank === 0), 'the Whisperwood keeps its everyday plants');
  // a save whose world still has them in the Whisperwood finds them in the Netherwood
  const w = JSON.parse(JSON.stringify(st.world));
  for (const m of w.materials) if (m.wild && (m.wild.key === 'witchear' || m.wild.key === 'mandrake')) m.wild.region = 'forest';
  addAlchemy(w);
  for (const m of w.materials) if (m.wild && (m.wild.key === 'witchear' || m.wild.key === 'mandrake')) assert.equal(m.wild.region, 'netherwood');
});

test('the Free Experiment’s wilds start grown, and a harvest there takes the plant: it sprouts again at a random spot and grows back quickly, drinking', () => {
  const t0 = Date.now();
  const st = fresh('sandbox-wilds-1'), ref = fresh('sandbox-wilds-1');
  sandboxWilds(st.gathering, st.deposits, t0);
  const d = depositOf(st, 'silverleaf'), d0 = depositOf(ref, 'silverleaf');
  assert.equal(d.growMs, Math.round(d0.growMs / SANDBOX_PACE), 'it grows faster');
  assert.equal(d.spawnMs, Math.round(d0.spawnMs / SANDBOX_PACE), 'and sprouts faster');
  for (const x of st.deposits) assert.equal(depositStatus(st.gathering, x, t0).mature, x.slots, `${x.id}: every plant stands grown`);
  // bottomless stores: nothing is stored or counted, and no rank is asked
  st.inventory[d.materialId] = Infinity;
  const far = st.deposits.find((x) => x.rank > st.rank);
  if (far) assert.equal(st.gather(far.id, { free: true, now: t0 }).ok, true, 'every region is open');
  const stand0 = depositStatus(st.gathering, d, t0).plants, before = stand0.map((p) => p.id);
  const r = st.gather(d.id, { free: true, now: t0 });
  const taken = /** @type {any} */ (stand0.find((p) => p.id === r.plant));
  assert.equal(r.ok, true);
  assert.equal(r.amount, d.take);
  assert.equal(st.inventory[d.materialId], Infinity);
  assert.equal(st.found[d.materialId], undefined, 'nothing is recorded in the shop');
  assert.ok(before.includes(r.plant));
  const after = depositStatus(st.gathering, d, t0);
  assert.equal(after.plants.length, d.slots - 1, 'the plant is gone');
  assert.ok(!after.plants.some((p) => p.id === r.plant));
  // a new sprout comes up at a spot of its own and grows up within a few minutes
  const later = depositStatus(st.gathering, d, t0 + d.spawnMs + 1);
  assert.equal(later.plants.length, d.slots, 'a new sprout came up');
  const fresh1 = later.plants.find((p) => !before.includes(p.id));
  assert.ok(fresh1 && fresh1.stage === 'sprout');
  assert.notDeepEqual([fresh1.x, fresh1.y], [taken.x, taken.y], 'somewhere new');
  assert.ok(depositStatus(st.gathering, d, t0 + d.spawnMs + d.growMs / GROW_FLOOR + 1).mature === d.slots, 'grown back in minutes, not hours');
  // the sprout drinks, and watered it grows faster
  const tw = t0 + d.spawnMs + 1;
  const dry = growthOf(d, depositStatus(st.gathering, d, tw).plants.find((p) => p.id === fresh1.id), tw + d.growMs * 0.3, 'clear').g;
  assert.equal(st.water(d.id, [fresh1.id], tw), 1);
  const wet = growthOf(d, st.gathering.nodes[d.id].plants.find((p) => p.id === fresh1.id), tw + d.growMs * 0.3, 'clear').g;
  assert.ok(wet > dry, `watered grows faster (${wet.toFixed(3)} vs ${dry.toFixed(3)})`);
  assert.equal(st.water(d.id, [r.plant], tw), 0, 'a plant taken drinks nothing');
});
