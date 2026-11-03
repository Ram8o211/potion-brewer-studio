import test from 'node:test';
import assert from 'node:assert/strict';
import { fillSolid, blob } from '../src/visual/env/side.js';
import { Canvas } from '../src/visual/env/paint.js';
import { RARITIES, validateRarity } from '../src/materials/rarity.js';
import { validateAtlas } from '../src/visual/atlas-contract.js';

test('terrain follows every art pixel instead of snapping to texture cells', () => {
  const cv = new Canvas(1, 32, 32), top = Float32Array.from({ length: 32 }, (_, x) => 4 + x * 0.5);
  fillSolid(cv, top);
  for (let x = 0; x < 32; x++) assert.equal(top[x], Math.round(4 + x * 0.5));
  const a = new Canvas(7, 64, 64), b = new Canvas(7, 64, 64);
  blob(a, 31, 32, 24, 20, 42); blob(b, 31, 32, 24, 20, 42);
  assert.deepEqual(a.solid, b.solid);
  assert.ok(a.solid.some((v, k) => v && !a.solid[k + 1]), 'pixel boundaries are retained');
});

test('rarity rejects incorrect purity, missing side effects and overlapping legendary magnitude', () => {
  for (const [rarity, effects] of Object.entries({ common: { vitality: 18, frost: 11, toxicity: 8 }, uncommon: { vitality: 32, frost: 7, love: 4 }, rare: { vitality: 55, death: 3 }, unique: { fire: 85 }, legendary: { fire: 180 } })) assert.deepEqual(validateRarity({ rarity, effects }), []);
  for (const [rarity, effects] of [['rare', { fire: 55 }], ['rare', { fire: 55, frost: 30 }], ['unique', { fire: 85, love: 1 }], ['legendary', { fire: 95 }]]) assert.ok(validateRarity({ rarity, effects }).length);
  assert.ok(RARITIES.legendary.magnitude[0] > RARITIES.unique.magnitude[1] * 1.5);
});

test('atlas contract rejects overlap and invalid identity', () => {
  const f = { species: 'silverleaf', rarity: 'common', arcane: false, stage: 'mature', rect: [4, 4, 64, 64], pivot: [0.5, 1] };
  const atlas = { version: 1, width: 256, height: 256, frames: { silverleaf: f } };
  assert.deepEqual(validateAtlas(atlas), []);
  atlas.frames.arcane = { ...f, arcane: true, rect: [40, 40, 64, 64] };
  assert.ok(validateAtlas(atlas).some((e) => e.includes('overlap')));
});
