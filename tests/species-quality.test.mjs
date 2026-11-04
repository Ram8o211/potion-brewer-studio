import test from 'node:test';
import assert from 'node:assert/strict';
import { WILD_SPECS } from '../src/materials/wild.js';
import { CATALOG_SPECS } from '../src/materials/catalog.js';
import { RARITY_KEYS, validateRarity } from '../src/materials/rarity.js';
import { generateWorld, makeLookup } from '../src/materials/generator.js';
import { blendThreshold, isMagical, awakenedDef, pastThreshold } from '../src/alchemy/arcane.js';
import { archiveLegacyMaterials } from '../src/game/legacy-materials.js';
import { GameState } from '../src/game/state.js';

test('all species have fixed valid quality and one Arcane counterpart', () => {
  const a = generateWorld('quality-a'), b = generateWorld('quality-b'), A = makeLookup(a), B = makeLookup(b);
  for (const s of WILD_SPECS.filter((s) => !s.arcaneVariant)) {
    const normal = A('wild-' + s.key), arcane = A('wild-' + s.key + '@arcane');
    assert.deepEqual(validateRarity(normal), [], s.key);
    assert.equal(normal.rarity, arcane.rarity);
    assert.deepEqual(normal.effects, arcane.effects);
    assert.deepEqual(normal.effects, B(normal.id).effects, 'world regeneration cannot reroll quality');
    assert.equal(normal.name, B(normal.id).name);
    assert.equal(normal.vis.seed, B(normal.id).vis.seed, 'permanent visual identity');
    assert.equal(isMagical(normal), false);
    assert.equal(isMagical(arcane), true);
    assert.equal(arcane.speciesId, normal.speciesId);
  }
  for (const region of new Set(CATALOG_SPECS.map((s) => s.region))) for (const rarity of RARITY_KEYS) assert.ok(CATALOG_SPECS.filter((s) => s.region === region && s.rarity === rarity).length >= 2, `${region}/${rarity}`);
});

test('only Arcane contributions set thresholds and only their own effects amplify', () => {
  const ordinary = { arcaneVariant: false, effects: { strength: 50 }, arcane: { thr: 999, gain: 4 } };
  const cold = { id: 'cold', name: 'Cold', arcaneVariant: true, effects: { vitality: 18, frost: 11 }, arcane: { thr: -1000, gain: 3 } };
  const hot = { id: 'hot', name: 'Hot', arcaneVariant: true, effects: { love: 32 }, arcane: { thr: 800, gain: 2.5 } };
  const lookup = (id) => ({ ordinary, cold, hot })[id];
  assert.equal(blendThreshold([{ id: 'ordinary', ml: 999 }], lookup), null);
  assert.equal(blendThreshold([{ id: 'cold', ml: 50 }, { id: 'hot', ml: 100 }, { id: 'ordinary', ml: 999 }], lookup), 200);
  assert.deepEqual(awakenedDef(cold).effects, { vitality: 54, frost: 33 });
  assert.ok(pastThreshold(-1000, -81));
  assert.equal(awakenedDef(cold).effects.strength, undefined);
});

test('legacy migration preserves old effects, referenced identities and awakened composition without mutating the input', () => {
  const old = { version: 6, inventory: { 'wild-old': 50 }, world: { materials: [{ id: 'wild-old', name: 'Old', effects: { fire: 11 }, arcane: { thr: -400, gain: 3 } }] },
    cauldron: { species: ['wild-old', 'wild-old~a'] }, recipes: [{ ingredients: [{ id: 'wild-old', n: 10 }] }] };
  const back = archiveLegacyMaterials(old);
  assert.equal(back.inventory['legacy:wild-old'], 50);
  assert.deepEqual(back.world.materials[0].effects, { fire: 11 });
  assert.equal(back.world.materials[0].arcaneVariant, true);
  assert.equal(back.cauldron.species[1], 'legacy:wild-old~a');
  assert.equal(back.recipes[0].ingredients[0].id, 'legacy:wild-old');
  assert.equal(old.world.materials[0].id, 'wild-old');
  assert.deepEqual(archiveLegacyMaterials(back), back, 'idempotent');
});

test('migrated legacy stock remains on the brewing shelf without becoming market stock', () => {
  const st = GameState.create('legacy-shelf', { tutorial: false }), raw = JSON.parse(JSON.stringify(st.toJSON()));
  raw.version = 6;
  const leaf = raw.world.materials.find((m) => m.id === 'wild-silverleaf');
  delete leaf.speciesId; leaf.effects = { vitality: 37, frost: 4 }; leaf.arcane = { thr: 300, gain: 3 };
  const back = GameState.fromJSON(raw), id = 'legacy:wild-silverleaf';
  assert.equal(back.stock(id), st.stock('wild-silverleaf'));
  assert.ok(back.world.ingredients.includes(id), 'the shelf enumerates the preserved item');
  assert.deepEqual(back.lookup(id).effects, leaf.effects);
  assert.equal(back.canBuy(id).ok, false);
  assert.ok(!back.purchasable().includes(id));
  assert.equal(back.lookup(id + '~a').effects.vitality, 111, 'previous awakening behaviour is preserved');
});
