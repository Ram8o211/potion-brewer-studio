import test from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/visual/env/paint.js';
import { illuminate, litColour } from '../src/visual/env/lighting.js';
import { col } from '../src/visual/env/side.js';
import { composeScene, SCENE_W, SCENE_H } from '../src/visual/env/scene.js';
import { swayPixels } from '../src/rendering/wild-scene.js';

test('overlapping lights preserve a material\'s painted contrast and transparency', () => {
  const body = litColour(col('#303040'), 2, 1.2, 3, true);
  const facet = litColour(col('#8890a0'), 2, 1.2, 3, true);
  for (const bit of [0, 8, 16]) assert.ok(((facet >>> bit) & 255) - ((body >>> bit) & 255) > 20, 'facets remain distinct in strong coloured light');
  assert.equal(litColour(0, 1, 1, 1, false) >>> 24, 0, 'a transparent foreground stays transparent');
  assert.equal(litColour(col('#445566'), 0, 0, 0, true), col('#445566'), 'unlit artwork stays exact');
});

test('a solid slab catches local light and shades what lies behind it without changing collision maps', () => {
  const draw = (wall) => {
    const cv = new Canvas(7, 48, 32); cv.pix.px.fill(col('#303040'));
    if (wall) for (let y = 0; y < cv.H; y++) for (let x = 20; x <= 24; x++) cv.solid[y * cv.W + x] = 1;
    const mask = cv.solid.slice();
    illuminate(cv, [[8, 16, 40, [1, 0.6, 0.2], 1]]);
    assert.deepEqual(cv.solid, mask);
    return cv;
  };
  const wall = draw(true), open = draw(false), red = (cv, x) => cv.pix.get(x, 16) & 255;
  assert.ok(red(wall, 20) > 65, 'the face toward the lamp is lit');
  assert.ok(red(wall, 32) < red(open, 32) - 5, 'the slab blocks the spill behind it');
});

test('a painted-over hanging strand leaves no lighting ghost when the wind layer is reconstructed', () => {
  const cv = new Canvas(9, 16, 16); cv.pix.px.fill(col('#182434'));
  const g = cv.swayGroup(0, 1); cv.swaySet(8, 8, col('#68b03a'), g);
  cv.set(8, 8, col('#182434'));
  illuminate(cv, [[8, 5, 12, [0.3, 0.8, 1], 0.8]]);
  assert.equal(cv.pix.get(8, 8), cv.sw.bare[8 * 16 + 8], 'hidden foliage does not turn background air into an illuminated leaf');
});

test('lit leaves overlapping a terrain edge match the still painting in a calm', () => {
  const scene = composeScene('netherwood', 'experiment');
  const frame = new Uint32Array(SCENE_W * SCENE_H);
  swayPixels(scene.sway, frame, 5, 0);
  assert.deepEqual(frame, scene.pix.px, 'terrain edge shading is consistent in the still and animated layers');
});
