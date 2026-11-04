// Arcane activation.
//
// Every magical material has an *arcane threshold* on an abstract scale from
// −1000 to +1000, independent of its melting, boiling and ignition points,
// and a *gain*. The scale maps linearly onto the simulation's Celsius
// temperatures around room temperature:
//
//     T = 20 °C + 0.1 · threshold        (+800 → 100 °C, −1000 → −80 °C)
//
// A positive threshold is reached by heating, a negative one by cooling.
// Matter whose temperature passes its threshold *awakens*: its magical
// effects grow by the gain. The threshold of a blend is the volume-weighted
// mean of the thresholds of the unawakened magical substances in it, so
// opposing ingredients pull each other's threshold toward room temperature
// (one part at −1000 with two parts at +800 → +200 → 40 °C).
//
// Awakening is modelled as chemistry rather than a flag: an awakened material
// is its own species, `id~a`, with the same physical properties and stronger
// effects. The simulation converts `A → A~a` where a particle is past its
// threshold (simulation/arcane.js), so mixing, reactions, bottling and saves
// carry the awakened state like any other composition, and it never reverts
// by itself — only dilution, reactions or losing the matter change it.

import { EFFECT_KEYS } from './effects.js';

/** °C per threshold unit, and the temperature of threshold 0. */
export const ARCANE_SCALE = 0.1;
export const ARCANE_ZERO = 20;
export const AWAKE_SUFFIX = '~a';

/** @param {number} thr abstract threshold @returns {number} °C */
export function thresholdToCelsius(thr) {
  return ARCANE_ZERO + ARCANE_SCALE * thr;
}

/** @param {number} T °C @returns {number} abstract threshold */
export function celsiusToThreshold(T) {
  return (T - ARCANE_ZERO) / ARCANE_SCALE;
}

/** @param {string} id */
export function isAwakenedId(id) {
  return typeof id === 'string' && id.endsWith(AWAKE_SUFFIX);
}

/** @param {string} id */
export function awakenedId(id) {
  return isAwakenedId(id) ? id : id + AWAKE_SUFFIX;
}

/** @param {string} id */
export function baseIdOf(id) {
  return isAwakenedId(id) ? id.slice(0, -AWAKE_SUFFIX.length) : id;
}

/**
 * Does a material take part in arcane activation (has a threshold and is not
 * already awakened)?
 * @param {any} def
 */
export function isMagical(def) {
  return !!(def && def.arcaneVariant === true && def.arcane && Number.isFinite(def.arcane.thr) && !def.awakened);
}

/**
 * The awakened form of a material: same physical substance, effects × gain,
 * a brighter glow. Pure function of the base definition.
 * @param {any} base
 */
export function awakenedDef(base) {
  const gain = base.arcane && base.arcane.gain > 0 ? base.arcane.gain : 3;
  /** @type {Record<string, number>} */
  const effects = {};
  for (const k of EFFECT_KEYS) {
    const v = base.effects ? Number(base.effects[k]) || 0 : 0;
    if (v) effects[k] = Math.round(v * gain * 10) / 10;
  }
  return {
    ...base,
    id: awakenedId(base.id),
    name: `Awakened ${base.name}`,
    effects,
    awakened: true,
    base: base.id,
    arcane: { thr: base.arcane ? base.arcane.thr : 0, gain, awake: true },
    glow: Math.min(1, (base.glow || 0) * 0.5 + 0.35),
    product: true,
    tier: 99,
    price: 0,
    wild: undefined,
    crushable: base.crushable,
    description: `${base.name}, awakened past its arcane threshold. Its magic runs ${gain.toFixed(1)}× stronger and no longer fades with temperature.`,
  };
}

/**
 * Wrap a lookup so that `id~a` resolves to the awakened form of `id`
 * (memoised, so every caller sees the same object).
 * @param {(id:string)=>any} lookup
 */
export function withAwakened(lookup) {
  /** @type {Map<string, any>} */
  const cache = new Map();
  return (id) => {
    if (!isAwakenedId(id)) return lookup(id);
    let d = cache.get(id);
    if (d === undefined) {
      const base = lookup(baseIdOf(id));
      d = isMagical(base) ? awakenedDef(base) : null;
      // a base that does not exist yet (remains registered later) is asked again
      if (base) cache.set(id, d);
    }
    return d || undefined;
  };
}

/**
 * Effective threshold of a blend (volume-weighted over its unawakened magical
 * parts), or null when nothing in it can awaken.
 * @param {{id:string, ml:number}[]} parts @param {(id:string)=>any} lookup
 */
export function blendThreshold(parts, lookup) {
  let w = 0, t = 0;
  for (const p of parts) {
    const d = lookup(p.id);
    if (!isMagical(d) || !(p.ml > 0)) continue;
    w += p.ml;
    t += p.ml * d.arcane.thr;
  }
  return w > 0 ? t / w : null;
}

/**
 * Has a temperature passed a threshold (in the direction it opens)?
 * @param {number} thr @param {number} T °C
 */
export function pastThreshold(thr, T) {
  const Ta = thresholdToCelsius(thr);
  return thr >= 0 ? T >= Ta : T <= Ta;
}

/** Text for a threshold, e.g. "+300 (heat past 50 °C)". @param {number} thr */
export function describeThreshold(thr) {
  const T = Math.round(thresholdToCelsius(thr));
  const sign = thr > 0 ? '+' : '';
  return `${sign}${Math.round(thr)} (${thr >= 0 ? 'heat past' : 'chill below'} ${T}°C)`;
}

/**
 * Split poured parts into plain and awakened shares, using the awakened
 * share of the magic actually in the brew (which the alchemist can see: the
 * glow, and the awakened substances in the cauldron's contents). The guild's
 * theory then predicts with the stronger, awakened effects for that share.
 * @param {{id:string, ml:number}[]} parts
 * @param {Record<string, number>} composition species id → amount in the brew
 * @param {(id:string)=>any} lookup
 */
export function awakenParts(parts, composition, lookup) {
  let awake = 0, magic = 0;
  for (const [id, v] of Object.entries(composition)) {
    const d = lookup(id);
    if (!d) continue;
    if (d.awakened) { awake += v; magic += v; } else if (isMagical(d)) magic += v;
  }
  const share = magic > 0 ? awake / magic : 0;
  if (share < 0.01) return parts;
  const out = [];
  for (const p of parts) {
    const d = lookup(p.id);
    if (!isMagical(d)) { out.push(p); continue; }
    if (share < 0.99) out.push({ id: p.id, ml: p.ml * (1 - share) });
    out.push({ id: awakenedId(p.id), ml: p.ml * share });
  }
  return out;
}
