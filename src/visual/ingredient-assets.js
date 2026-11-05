// Runtime source of shipped ingredient artwork. PNGs are loaded per biome;
// this module has no DOM dependency so validation tools use exactly the same data.
import { Pixels } from './pixels.js';
import { validateAtlas } from './atlas-contract.js';

const frames = new Map();
const manifests = new Map();
let revision = 0;
export const ingredientArtRevision = () => revision;
export const ingredientAssetId = (key, stage = 'icon') => `${key}:${stage}`;
export function ingredientAssetInfo(key, stage = 'icon') { return frames.get(ingredientAssetId(key, stage))?.meta || null; }

/** Decode once, then share immutable source pixels across all uses. */
export function registerIngredientAtlas(atlas, rgba) {
  const errors = validateAtlas(atlas);
  if (errors.length) throw new Error(errors.join('; '));
  if (rgba.length !== atlas.width * atlas.height * 4) throw new Error('Ingredient atlas pixel dimensions do not match metadata');
  const pixels = new Uint32Array(new Uint8Array(rgba).buffer);
  for (const [id, meta] of Object.entries(atlas.frames)) {
    const f = /** @type {any} */ (meta), [x, y, w, h] = f.rect;
    const pix = new Pixels(w, h);
    for (let j = 0; j < h; j++) pix.px.set(pixels.subarray((y + j) * atlas.width + x, (y + j) * atlas.width + x + w), j * w);
    frames.set(id, { pix, meta: f });
  }
  manifests.set(atlas.biome, atlas); revision++;
}
export const ingredientAtlasLoaded = (biome) => manifests.has(biome);

/** Nearest sampling of the same master for menus, fragments and world plants.
 * Only physical size, mount and orientation vary; never the source texture. */
export function ingredientAssetFrame(key, stage = 'icon', size = 32, mount = 'ground', flip = false) {
  const f = frames.get(ingredientAssetId(key, stage));
  if (!f) return null;
  const p = new Pixels(size, size), src = f.pix;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let u = flip ? size - 1 - x : x, v = y;
    if (mount === 'hang') v = size - 1 - y;
    if (mount === 'wall') { u = y; v = flip ? x : size - 1 - x; }
    p.set(x, y, src.get(Math.min(src.w - 1, Math.floor(u * src.w / size)), Math.min(src.h - 1, Math.floor(v * src.h / size))));
  }
  return { pix: p, ax: mount === 'wall' ? (flip ? size - 2 : 1) : size / 2,
    ay: mount === 'hang' ? 1 : mount === 'wall' ? size / 2 : size - 2, glints: [], glows: [] };
}
