import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newComponent, newNode, newLayer, clone, validateProject, parseProject, History } from '../src/studio/model.js';
import { generate, componentPixels } from '../src/studio/engine.js';
import { composite, transformed, region, colorWord } from '../src/studio/pixels.js';
import { Pixels } from '../src/visual/pixels.js';
import { setArtDirection, artRevision } from '../src/studio/direction.js';
import { archetypeIdentity, pieceMask, piecePalette } from '../src/visual/pieces.js';
import { describe } from '../src/visual/descriptor.js';
import { iconFrame, pieceFrame } from '../src/visual/render.js';
import { GameState } from '../src/game/state.js';

test('projects round-trip editable data, reject malicious and resource-exhausting documents, migrate only v0', () => {
  const p = newProject(); assert.deepEqual(parseProject(JSON.stringify(p)), p);
  const old = clone(p); old.version = 0; delete old.assets[0].folder; assert.equal(parseProject(JSON.stringify(old)).version, 1);
  for (const mutate of [
    (x) => { x.version = 900; }, (x) => { x.assets[0].nodes[0].parent = x.assets[0].nodes[1].id; },
    (x) => { x.assets[0].nodes[0].component = 'missing'; }, (x) => { x.assets[0].components[0].layers[0].pixels[2] = NaN; },
    (x) => { x.assets[0].nodes[0].count = 100000; }, (x) => { x.direction.global.mix = 2; },
    (x) => { x.assets[0].components[0].layers[0].scope = 'invalid'; },
  ]) { const bad = clone(p); mutate(bad); assert.throws(() => validateProject(bad)); }
  assert.throws(() => parseProject(JSON.stringify(p).replace('"name":', '"__proto__":{},"name":')), /unsafe key/);
});
test('a drawn component actually constructs seeded plants and can be extracted/reused', () => {
  const a = newProject().assets[0], leaf = newComponent('Drawn leaf', 'blank');
  for (let y = 8; y < 27; y++) for (let x = 12; x < 21; x++) leaf.layers[0].pixels[y * 32 + x] = colorWord('#bb4466');
  a.components.push(leaf); const n = newNode(leaf.id, a.nodes[0].id); n.count = 4; n.jitter = 45; n.spread = 10; n.mirror = true; a.nodes.push(n);
  const first = generate(a, 10); assert.equal(first.pix.hash(), generate(clone(a), 10).pix.hash());
  assert.notEqual(first.pix.hash(), generate(a, 11).pix.hash()); assert.ok(first.instances.filter((i) => i.component === leaf.id).length === 4);
  const noLeaf = clone(a); noLeaf.nodes.pop(); assert.notEqual(first.pix.hash(), generate(noLeaf, 10).pix.hash());
});
test('anchors propagate transforms, growth filters branches, locks preserve local variation', () => {
  const a = newProject().assets[0]; a.nodes[1].locked = true; a.nodes[1].lockSeed = 7;
  const before = generate(a, 1), later = generate(a, 123);
  assert.deepEqual(before.instances.map((i) => i.matrix), later.instances.map((i) => i.matrix));
  assert.equal(generate(a, 1, 0).instances.length, 1); assert.equal(generate(a, 1, 2).instances.length, 4);
  a.components[0].tip[0] += 4; assert.notDeepEqual(generate(a, 1).instances[1].matrix, before.instances[1].matrix);
  a.nodes[0].angle = 90; assert.notDeepEqual(generate(a, 1).instances[1].matrix, before.instances[1].matrix);
});
test('weighted choices, collision exclusion and instance budgets execute rather than decorate', () => {
  const a = newProject().assets[0]; a.nodes[1].choice = 'leaf'; a.nodes[1].weight = 0;
  const alt = clone(a.nodes[1]); alt.id = 'alternative'; alt.weight = 1; a.nodes.push(alt);
  let g = generate(a); assert.ok(!g.instances.some((i) => i.node === a.nodes[1].id)); assert.ok(g.instances.some((i) => i.node === alt.id));
  alt.choice = ''; alt.avoidOverlap = true; alt.x = 0; alt.y = 20; alt.angle = 0; alt.jitter = 0; alt.spread = 0; alt.count = 16;
  g = generate(a); assert.ok(g.instances.filter((i) => i.node === alt.id).length <= 1);
  a.nodes[0].count = 16; a.nodes[1].count = 16; alt.count = 16; g = generate(a); assert.ok(g.instances.length <= 512);
});
test('corrections survive regeneration and geometry edits, honoring scope, alpha, visibility and explicit erase', () => {
  const c = newComponent(), l = c.layers[0]; l.pixels[10 * 32 + 16] = colorWord('#ff1122');
  const expected = l.pixels.slice(); c.geometry[0].width = 20; componentPixels(c, 2, 99); assert.deepEqual(l.pixels, expected);
  assert.equal(componentPixels(c).get(16, 10), colorWord('#ff1122'));
  l.scope = 'variant'; l.variant = 4; assert.notEqual(componentPixels(c, 2, 3).get(16, 10), colorWord('#ff1122')); assert.equal(componentPixels(c, 2, 4).get(16, 10), colorWord('#ff1122'));
  l.scope = 'stage'; l.stage = 1; assert.notEqual(componentPixels(c, 2, 4).get(16, 10), colorWord('#ff1122'));
  l.scope = 'all'; l.pixels[10 * 32 + 16] = -1; assert.equal(componentPixels(c).get(16, 10), 0);
  l.visible = false; assert.notEqual(componentPixels(c).get(16, 10), 0);
  const base = new Pixels(1, 1); const layer = newLayer(); layer.pixels = [colorWord('#ff0000')]; layer.opacity = 0.5;
  assert.equal(composite(base, [layer], 2, 0).get(0, 0) >>> 24, 128);
});
test('pixel region and inverse transforms retain nearest pixels and transparent areas', () => {
  const p = new Pixels(4, 4); p.rect(0, 0, 2, 2, 0xff123456);
  assert.equal(region(p.px, 4, 4, 0, 0).length, 4); assert.equal(region(p.px, 4, 4, 3, 3).length, 12);
  assert.deepEqual(transformed(p, 360).px, p.px); const flip = transformed(p, 0, 1, true); assert.equal(flip.get(3, 0), p.get(0, 0));
});
test('bounded undo/redo preserves components and discards abandoned redo history', () => {
  const p = newProject(), h = new History(100000); h.push(p, 'Rename'); const edit = clone(p); edit.name = 'Edited';
  assert.equal(h.undo(edit).name, p.name); assert.equal(h.redo(p).name, 'Edited'); h.push(edit, 'Branch'); assert.equal(h.redoStack.length, 0);
  for (let i = 0; i < 100; i++) h.push(edit, 'Stroke'); assert.ok(h.undoStack.length <= 60); assert.ok(h.undoStack.reduce((sum, x) => sum + x.json.length * 2, 0) <= 100000);
});
test('runtime palettes change linked images and powder colors, preserve physical masks and old saves, revert exactly', () => {
  setArtDirection(null); const id = archetypeIdentity('silverleaf'), d = describe(id), hash = iconFrame(d).pix.hash();
  const state = GameState.create('studio-old-save', { tutorial: false }); const serialized = JSON.stringify(state.world);
  const masks = [0, 1, 2, 3].map((v) => Array.from(pieceFrame(d, v).mask)); const physical = Array.from(pieceMask('silverleaf', 0)); const palette = Array.from(piecePalette(1) || []);
  const profile = newProject().direction; profile.global = { tint: '#ff1144', mix: 0.8, saturation: 0.7, contrast: 1.1 }; const rev = artRevision();
  setArtDirection(profile); assert.ok(artRevision() > rev); const changed = describe(id);
  assert.notEqual(iconFrame(changed).pix.hash(), hash);
  for (let v = 0; v < 4; v++) assert.deepEqual(Array.from(pieceFrame(changed, v).mask), masks[v]);
  assert.deepEqual(Array.from(pieceMask('silverleaf', 0)), physical); assert.notDeepEqual(Array.from(piecePalette(1) || []), palette);
  assert.equal(JSON.stringify(state.world), serialized);
  const normal = clone(profile.global); profile.species.silverleaf = { ...normal, tint: '#4488ff', mix: 1 }; setArtDirection(profile); assert.notDeepEqual(describe(id).pal.main, changed.pal.main);
  setArtDirection(null); assert.equal(iconFrame(describe(id)).pix.hash(), hash);
});
