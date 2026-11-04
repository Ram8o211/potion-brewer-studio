import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { validateAtlas } from '../src/visual/atlas-contract.js';
import { WILD_SPECS } from '../src/materials/wild.js';

const ROOT = new URL('../assets/ingredients/', import.meta.url);
const SPECIES = WILD_SPECS.filter((s) => !s.arcaneVariant);
const COUNT = WILD_SPECS.length;

function decodePNG(buffer) {
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let offset = 8, width, height, colorType, bitDepth;
  const idat = [];
  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset), name = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + len);
    if (name === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    if (name === 'IDAT') idat.push(data);
    offset += len + 12;
    if (name === 'IEND') break;
  }
  assert.equal(bitDepth, 8);
  assert.equal(colorType, 6); // RGBA, not RGB or opaque palette
  const inflated = inflateSync(Buffer.concat(idat));
  assert.equal(inflated.length, height * (width * 4 + 1));
  for (let y = 0; y < height; y++) assert.equal(inflated[y * (width * 4 + 1)], 0);
  const alpha = (x, y) => inflated[y * (width * 4 + 1) + 1 + x * 4 + 3];
  return { width, height, alpha };
}

test('exported ingredient atlases use real transparent PNGs and complete species coverage', () => {
  assert.equal(SPECIES.length * 2, COUNT);
  assert.ok(COUNT > 300);
  const manifests = [];
  for (const kind of ['wilds', 'icons']) {
    const a = JSON.parse(readFileSync(new URL(kind + '-atlas.json', ROOT), 'utf8'));
    const png = decodePNG(readFileSync(new URL(kind + '-atlas.png', ROOT)));
    assert.deepEqual(validateAtlas(a), []);
    assert.equal(a.count, COUNT);
    assert.equal(Object.keys(a.frames).length, COUNT);
    assert.equal(a.width, png.width);
    assert.equal(a.height, png.height);
    assert.equal(a.width, 3456);
    assert.equal(a.height, 3840);
    for (const [id, f] of Object.entries(a.frames)) {
      const [x, y, w, h] = f.rect;
      assert.equal(w, 192); assert.equal(h, 192);
      assert.equal(png.alpha(x, y), 0, id + ' has a nontransparent cell corner');
      assert.equal(png.alpha(x + w - 1, y + h - 1), 0, id + ' has a nontransparent cell corner');
      const [dx, dy, aw, ah] = f.artRect;
      assert.ok(dx >= 0 && dy >= 0 && dx + aw <= w && dy + ah <= h);
      let opaque = 0;
      for (let yy = y + dy; yy < y + dy + ah; yy++) {
        for (let xx = x + dx; xx < x + dx + aw; xx++) if (png.alpha(xx, yy)) opaque++;
      }
      assert.ok(opaque > 5, id + ' is empty');
      assert.equal(f.stage, kind === 'wilds' ? 'mature' : 'icon');
    }
    for (const s of SPECIES) {
      const normal = a.frames['wild-' + s.key], arcane = a.frames['wild-' + s.key + '@arcane'];
      assert.ok(normal && arcane, 'normal/Arcane pair missing: ' + s.key);
      assert.equal(normal.species, arcane.species);
      assert.equal(normal.arcane, false);
      assert.equal(arcane.arcane, true);
    }
    manifests.push(a);
  }
  assert.deepEqual(Object.keys(manifests[0].frames), Object.keys(manifests[1].frames));
});
