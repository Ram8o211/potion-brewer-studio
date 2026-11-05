import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { WILD_SPECS } from '../src/materials/wild.js';
import { BIOMES } from '../src/game/biomes.js';
import { validateAtlas } from '../src/visual/atlas-contract.js';
import { registerIngredientAtlas, ingredientAssetFrame, ingredientAssetInfo } from '../src/visual/ingredient-assets.js';
import { describe } from '../src/visual/descriptor.js';
import { archetypeIdentity, pieceSprite } from '../src/visual/pieces.js';
import { iconFrame } from '../src/visual/render.js';

const ROOT = new URL('../assets/ingredients/', import.meta.url);
function png(file) {
  const b = readFileSync(file), idats = []; let w = 0, h = 0;
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  for (let off = 8; off < b.length;) {
    const len = b.readUInt32BE(off), type = b.toString('ascii', off + 4, off + 8), data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); assert.equal(data[8], 8); assert.equal(data[9], 6); }
    if (type === 'IDAT') idats.push(data);
    off += len + 12;
  }
  const raw = inflateSync(Buffer.concat(idats)), rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) { assert.equal(raw[y * (w * 4 + 1)], 0); rgba.set(raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)), y * w * 4); }
  return { w, h, rgba };
}
test('shipped biome PNGs cover every fixed species, variant and growth stage with native pixels', () => {
  const library = JSON.parse(readFileSync(new URL('manifest.json', ROOT), 'utf8'));
  const stages = ['icon', 'seed', 'sprout', 'young', 'developing', 'mature'];
  assert.equal(library.frames, WILD_SPECS.length * stages.length);
  for (const biome of BIOMES) {
    const atlas = JSON.parse(readFileSync(new URL(library.biomes[biome.id].metadata, ROOT), 'utf8'));
    const img = png(new URL(library.biomes[biome.id].image, ROOT));
    assert.deepEqual(validateAtlas(atlas), []);
    assert.equal(img.w, atlas.width); assert.equal(img.h, atlas.height);
    registerIngredientAtlas(atlas, img.rgba);
    for (const spec of WILD_SPECS.filter((s) => s.region === biome.id)) {
      const hashes = new Set();
      for (const stage of stages) {
        const f = ingredientAssetFrame(spec.key, stage, 64), meta = ingredientAssetInfo(spec.key, stage);
        assert.ok(f, spec.key + ':' + stage);
        assert.equal(meta.rarity, spec.rarity); assert.equal(meta.arcane, !!spec.arcaneVariant);
        assert.ok(f.pix.px.some((c) => c >>> 24), 'nonempty artwork');
        assert.ok(f.pix.px.some((c) => !(c >>> 24)), 'transparent background');
        hashes.add(f.pix.hash());
      }
      assert.equal(hashes.size, stages.length, 'each growth stage is visibly distinct: ' + spec.key);
      if (!spec.arcaneVariant) {
        const normal = ingredientAssetFrame(spec.key, 'icon', 64).pix, arc = ingredientAssetFrame(spec.key + '@arcane', 'icon', 64).pix;
        assert.notEqual(normal.hash(), arc.hash());
        assert.deepEqual(normal.mask(), arc.mask(), 'Arcane markings preserve species anatomy');
      }
    }
  }
});

test('runtime icons and physical fragments sample the shipped master, never a newly generated texture', () => {
  const key = 'silverleaf', id = archetypeIdentity(key), d = describe(id);
  assert.equal(iconFrame(d).pix.hash(), ingredientAssetFrame(key, 'icon', 32).pix.hash());
  const sprite = pieceSprite(1, 40);
  assert.ok(sprite?.px.some((c) => c >>> 24));
});
