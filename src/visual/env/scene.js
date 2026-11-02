// A wild region's environment, generated from the world seed: the painted
// scene (SCENE_W × SCENE_H art pixels) and the map of open ground where
// plants may grow. Pure and deterministic — the same world seed always
// yields the same pixels — and cached, since a region is composed once and
// then only drawn.

import { directEnvironment } from '../../studio/environment-runtime.js';
import { artRevision, artDomain } from '../../studio/direction.js';
import { Canvas, SCENE_W, SCENE_H } from './paint.js';
import { hashString } from '../../core/rng.js';
import { finish } from './cave.js';
import { legible } from './legible.js';
import { flourish } from './flourish.js';
import { grade } from './grade.js';
import * as meadow from './meadow.js';
import * as forest from './forest.js';
import * as river from './river.js';
import * as quarry from './quarry.js';
import * as moonfen from './moonfen.js';
import * as crags from './crags.js';
import * as netherwood from './netherwood.js';

/** Version of the environment generator (scenes are not saved; this only names caches). */
export const ENV_VERSION = 12;

const COMPOSERS = { meadow, forest, netherwood, river, quarry, moonfen, crags };

/**
 * @typedef {Object} Scene
 * @property {import('../pixels.js').Pixels} pix
 * @property {Uint8Array} open     1 where a plant's foot may rest
 * @property {Uint16Array} depth  foot row of the scenery covering each pixel (0: none)
 * @property {Uint8Array} solid    1 where there is ground (nothing grows into it)
 * @property {Uint8Array} liquid   1 where there is water or lava
 * @property {Uint8Array} grass    1 on the surface where grass grows (where an animal may graze)
 * @property {Uint8Array} rock     1 where the cave's roof and walls are
 * @property {Uint8Array} trees    1 where a tree standing on the terrain is
 * @property {Uint16Array} props   the piece of scenery covering each pixel (0: none)
 * @property {number} top          first row with open ground
 * @property {Record<string, any>} meta  what the animation needs (horizon, vents, pools…)
 * @property {ReturnType<import('./paint.js').Canvas['swayData']>} sway  the foliage the wind moves (wild-scene.js), apart from the painting
 */

/** @type {Map<string, Scene>} */
const cache = new Map();

/**
 * Compose a region's scene afresh (uncached).
 * @param {string} region @param {string} seed @returns {Scene}
 */
export function composeScene(region, seed) {
  const id = COMPOSERS[region] ? region : 'forest';
  const cv = new Canvas(hashString(`scene:${seed}:${id}`));
  cv.meta.artDensity = artDomain('environments', id)?.density ?? 1;
  COMPOSERS[id].compose(cv, String(seed));
  // what stands in it told apart from what is behind it, and the ground given detail
  directEnvironment(cv, id, seed);
  legible(cv, id);
  // the ground's own flora and creepers on the rock faces
  flourish(cv, id);
  finish(cv, cv.meta.vignette ?? 0.55);
  // crisp and vivid: contrast, colour and the rock's inked silhouette
  grade(cv, id);
  // a gap the composition left (a dip below its sky) takes the colour above it
  for (const px of cv.sw ? [cv.pix.px, cv.sw.bare] : [cv.pix.px]) {
    for (let y = 1; y < SCENE_H; y++) for (let x = 0; x < SCENE_W; x++) if (!(px[y * SCENE_W + x] >>> 24)) px[y * SCENE_W + x] = px[(y - 1) * SCENE_W + x] | 0xff000000;
  }
  // no plant at the very edges of the painting
  for (let x = 0; x < SCENE_W; x++) { cv.open[x] = 0; cv.open[(SCENE_H - 1) * SCENE_W + x] = 0; cv.open[(SCENE_H - 2) * SCENE_W + x] = 0; }
  let top = SCENE_H;
  for (let k = 0; k < cv.open.length; k++) if (cv.open[k]) { top = Math.floor(k / SCENE_W); break; }
  return { pix: cv.pix, open: cv.open, depth: cv.depth, solid: cv.solid, liquid: cv.liquid, grass: cv.grass, rock: cv.rock, trees: cv.trees, props: cv.props, top, meta: cv.meta, sway: cv.swayData() };
}

/**
 * The scene of a region in a world.
 * @param {string} region @param {string} seed @returns {Scene}
 */
export function sceneOf(region, seed) {
  const id = COMPOSERS[region] ? region : 'forest';
  const key = `${ENV_VERSION}:${artRevision()}:${id}:${seed}`;
  let s = cache.get(key);
  if (s) return s;
  s = composeScene(id, seed);
  // a handful of worlds' regions at most: keep the last dozen
  if (cache.size >= 12) cache.delete(/** @type {string} */ (cache.keys().next().value));
  cache.set(key, s);
  return s;
}

export { SCENE_W, SCENE_H };
