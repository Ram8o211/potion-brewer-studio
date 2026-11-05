// Authored ingredient asset contract, independent of the terrain generator.
import { RARITY_KEYS } from '../materials/rarity.js';

export const ATLAS_VERSION = 1;
export const GROWTH_STAGES = Object.freeze(['seed', 'sprout', 'young', 'developing', 'mature']);

/** @param {any} atlas */
export function validateAtlas(atlas) {
  const errors = [];
  if (atlas?.version !== ATLAS_VERSION) errors.push('Unsupported atlas version');
  if (!Number.isInteger(atlas?.width) || !Number.isInteger(atlas?.height) || atlas.width <= 0 || atlas.height <= 0 || atlas.width > 4096 || atlas.height > 4096) errors.push('Invalid atlas dimensions');
  const seen = new Set(), frames = Object.entries(atlas?.frames || {});
  for (const [id, raw] of frames) {
    const f = /** @type {any} */ (raw), r = f.rect || [];
    if (!f.species || !RARITY_KEYS.includes(f.rarity) || typeof f.arcane !== 'boolean') errors.push(id + ': invalid identity');
    if (!GROWTH_STAGES.includes(f.stage) && f.stage !== 'icon') errors.push(id + ': invalid stage');
    if (r.length !== 4 || !r.every(Number.isInteger) || r[0] < 0 || r[1] < 0 || r[2] <= 0 || r[3] <= 0 || r[0] + r[2] > atlas.width || r[1] + r[3] > atlas.height) errors.push(id + ': frame out of bounds');
    if (!Array.isArray(f.pivot) || f.pivot.length !== 2 || f.pivot.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) errors.push(id + ': invalid pivot');
    if (atlas.libraryVersion >= 2) {
      if (f.asset !== id || !f.biome || !f.material || f.atlas !== atlas.image) errors.push(id + ': broken asset reference');
      if (!Array.isArray(f.nativeResolution) || f.nativeResolution[0] !== r[2] || f.nativeResolution[1] !== r[3]) errors.push(id + ': invalid native resolution');
    }
    const key = `${f.species}:${f.arcane}:${f.stage}`;
    if (seen.has(key)) errors.push(id + ': duplicate identity');
    seen.add(key);
  }
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
    const a = /** @type {any} */ (frames[i][1]).rect, b = /** @type {any} */ (frames[j][1]).rect;
    if (a?.length === 4 && b?.length === 4 && a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]) errors.push(`${frames[i][0]} overlaps ${frames[j][0]}`);
  }
  return errors;
}
