// Runtime art data never mutates identities, materials, or simulation fields.
import { hex, pack, unpack } from '../visual/color.js';
import { validateStyle, clone } from './model.js';
let active = null, revision = 0;
const listeners = new Set();
export const artRevision = () => revision;
export const artDirection = () => active ? clone(active) : null;
export function setArtDirection(profile) {
  if (profile) {
    validateStyle(profile.global);
    for (const type of ['biomes', 'families', 'species']) for (const s of Object.values(profile[type] || {})) validateStyle(s);
  }
  active = profile ? clone(profile) : null; revision++;
  for (const fn of listeners) fn();
}
export const onArtChanged = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
/** Explicit precedence: global → biome → family → species. Ramps enter the real generators. */
export function directDescriptor(d) {
  if (!active) return d;
  const style = { ...active.global, ...active.biomes[d.id.region], ...active.families[d.family], ...active.species[d.id.key] };
  const tint = hex(style.tint), pal = {};
  for (const [name, values] of Object.entries(d.pal)) pal[name] = values.map((value) => {
    const rgb = unpack(value), l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    return pack(rgb.map((v, i) => {
      const saturated = l + (v - l) * style.saturation;
      const contrasted = (saturated - 0.5) * style.contrast + 0.5;
      return contrasted * (1 - style.mix) + tint[i] * style.mix;
    }), (value >>> 24) / 255);
  });
  return { ...d, pal };
}
