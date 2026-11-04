// Magical and chemical effects.
//
// An effect is a property of each *species* (water has none, troll moss
// carries strength, nightshade carries toxicity…), stored as a 10-channel
// vector on the 0..100 potency scale of the pure material. What a potion
// does is never looked up from a recipe: it is computed from the matter the
// customer actually drinks, particle by particle:
//
//   1. extraction   — a species only acts if it is in solution. Undissolved
//                     grains (above their solubility) leach a little, dry
//                     powder even less, so grinding, stirring and hot water
//                     all change the result (solubility rises with heat);
//   2. resonances   — per-world hidden laws: two effects meeting *inside one
//                     particle* can transmute into a third, catalyse or
//                     suppress one another. They act where the substances
//                     actually meet, so a layered brew and a stirred one
//                     differ, and a player can only learn them by testing;
//   3. oppositions  — universal laws every guild alchemist knows: fire and
//                     frost cancel, life and death cancel, vitality
//                     neutralises toxicity, acids and alkalis neutralise
//                     (acidity is signed: negative means alkaline);
//   4. saturation   — very strong values are compressed (diminishing returns);
//   5. cut-off      — anything under 1% potency (|v| < 1) is switched to zero.
//
// Reactions, evaporation and dilution change the composition itself, so they
// change effects through the same function. The commission generator uses
// the very same law on its hidden plans, so every order is achievable.

/**
 * @typedef {Object} EffectDef
 * @property {string} key
 * @property {string} label
 * @property {string} icon     UI icon name
 * @property {number[]} color  sRGB 0..1 (aura / bars)
 * @property {'magic'|'chemical'} kind
 * @property {boolean} [signed]
 * @property {string} desc
 * @property {boolean} [harmful]
 */

/** @type {EffectDef[]} */
export const EFFECTS = [
  { key: 'vitality', label: 'Vitality', icon: 'heart', color: [0.92, 0.3, 0.32], kind: 'magic', desc: 'Healing and life: mends wounds, restores energy.' },
  { key: 'strength', label: 'Strength', icon: 'fist', color: [0.96, 0.76, 0.36], kind: 'magic', desc: 'Might and toughness of body (or of stone).' },
  { key: 'love', label: 'Love', icon: 'rose', color: [1, 0.5, 0.74], kind: 'magic', desc: 'Attraction, affection and calm.' },
  { key: 'arcana', label: 'Arcana', icon: 'eye', color: [0.62, 0.52, 1], kind: 'magic', desc: 'Insight and raw magical potency; makes things shine.' },
  { key: 'transformation', label: 'Transformation', icon: 'swirl', color: [0.4, 0.9, 0.79], kind: 'magic', desc: 'Change of shape, colour or nature.' },
  { key: 'fire', label: 'Fire', icon: 'flame', color: [1, 0.56, 0.3], kind: 'magic', desc: 'Burning warmth. Opposes frost.' },
  { key: 'frost', label: 'Frost', icon: 'snow', color: [0.55, 0.87, 1], kind: 'magic', desc: 'Freezing cold. Opposes fire.' },
  { key: 'acidity', label: 'Acidity', icon: 'acid', color: [0.84, 0.91, 0.45], kind: 'chemical', signed: true, harmful: true, desc: 'Corrosive acid. Negative values are alkaline; acids and alkalis neutralise.' },
  { key: 'toxicity', label: 'Toxicity', icon: 'skull', color: [0.57, 0.8, 0.44], kind: 'chemical', harmful: true, desc: 'Poison. Vitality neutralises it.' },
  { key: 'death', label: 'Death', icon: 'death', color: [0.71, 0.57, 0.93], kind: 'magic', harmful: true, desc: 'Necromantic decay. Opposes vitality.' },
  // Append only: the first ten positions are part of the historical save format.
  { key: 'swiftness', label: 'Swiftness', icon: 'speed', color: [0.78, 0.95, 0.45], kind: 'magic', desc: 'Quickens movement and reactions.' },
  { key: 'levitation', label: 'Levitation', icon: 'feather', color: [0.53, 0.88, 1], kind: 'magic', desc: 'Lifts the body above the ground.' },
  { key: 'invisibility', label: 'Invisibility', icon: 'eye', color: [0.74, 0.65, 0.94], kind: 'magic', desc: 'Veils the body from sight.' },
  { key: 'phasing', label: 'Phasing', icon: 'crystal', color: [0.45, 1, 0.9], kind: 'magic', desc: 'Shifts the body toward a spectral state.' },
  { key: 'temporal', label: 'Temporal Distortion', icon: 'clock', color: [1, 0.82, 0.4], kind: 'magic', desc: 'Distorts the pace of a creature’s local time.' },
];

export const NATURAL_EFFECTS = Object.freeze(['vitality', 'strength', 'love', 'fire', 'frost', 'acidity', 'toxicity', 'death', 'swiftness']);
export const EXOTIC_EFFECTS = Object.freeze(['arcana', 'levitation', 'transformation', 'invisibility', 'phasing', 'temporal']);

export const NE = EFFECTS.length;
export const EFFECT_KEYS = EFFECTS.map((e) => e.key);
/** @type {Record<string, number>} */
export const EFFECT_INDEX = Object.fromEntries(EFFECT_KEYS.map((k, i) => [k, i]));
/** @type {Record<string, EffectDef>} */
export const EFFECT_BY_KEY = Object.fromEntries(EFFECTS.map((e) => [e.key, e]));
export const E = Object.freeze({ VIT: 0, STR: 1, LOVE: 2, ARC: 3, TRANS: 4, FIRE: 5, FROST: 6, ACID: 7, TOX: 8, DEATH: 9 });

/** Old four-aspect model → effect channels (save migration and generator). */
export const ASPECT_TO_EFFECT = ['vitality', 'fire', 'arcana', 'strength'];

import { compatFactor } from '../reactions/compatibility.js';

/** Leaching from undissolved grains that sit in liquid, and from dry powder. */
const LEACH_WET = 0.12;
const LEACH_DRY = 0.05;
/** Above this a value is compressed (diminishing returns). */
const KNEE = 40;
/** Effects weaker than this (1% potency, either sign) are switched to zero. */
export const EFFECT_CUTOFF = 1;

/**
 * Switch every channel under the 1% cut-off to zero, in place.
 * @param {Float64Array|number[]} e
 */
export function cutoffEffects(e) {
  for (let k = 0; k < NE; k++) if (Math.abs(e[k]) < EFFECT_CUTOFF) e[k] = 0;
  return e;
}

/**
 * Effect vector of a material definition as an array of NE numbers.
 * @param {{effects?: Record<string, number>, aspects?: number[]}} def
 * @returns {number[]}
 */
export function effectVector(def) {
  const v = new Array(NE).fill(0);
  if (def && def.effects) {
    for (let k = 0; k < NE; k++) v[k] = Number(def.effects[EFFECT_KEYS[k]]) || 0;
  } else if (def && def.aspects) {
    for (let a = 0; a < 4; a++) v[EFFECT_INDEX[ASPECT_TO_EFFECT[a]]] += def.aspects[a] || 0;
  }
  return v;
}

/** @param {ArrayLike<number>} vec @returns {Record<string, number>} */
export function toRecord(vec) {
  /** @type {Record<string, number>} */
  const o = {};
  for (let k = 0; k < NE; k++) o[EFFECT_KEYS[k]] = Math.round(vec[k] * 10) / 10;
  return o;
}

/** @param {Record<string, number>|undefined} rec @returns {number[]} */
export function fromRecord(rec) {
  const v = new Array(NE).fill(0);
  if (rec) for (let k = 0; k < NE; k++) v[k] = Number(rec[EFFECT_KEYS[k]]) || 0;
  return v;
}

/**
 * Switch to zero every channel of `e` whose *dormant* strength — what it
 * would be with nothing awakened — is under the cut-off, in place. A trace
 * that was already cut off cannot come back by being awakened: awakening
 * multiplies a substance's magic, and nothing multiplied from nothing is
 * still nothing.
 * @param {Float64Array|number[]} e @param {ArrayLike<number>} dormant
 */
export function cutoffDormant(e, dormant) {
  for (let k = 0; k < NE; k++) if (Math.abs(dormant[k]) < EFFECT_CUTOFF) e[k] = 0;
  return e;
}

/**
 * Raw (pre-interaction) effect vector of one composition at temperature T,
 * counting only what is extracted into solution. With `dormant`, also the
 * same vector with every awakened substance counted at its dormant strength
 * (its effects divided by its gain).
 * @param {import('../reactions/species.js').SpeciesTable} sp
 * @param {ArrayLike<number>} comp @param {number} off
 * @param {number} T @param {Float64Array|number[]} out length NE (overwritten)
 * @param {Float64Array|number[]} [dormant] length NE (overwritten)
 */
export function extractedEffects(sp, comp, off, T, out, dormant) {
  for (let k = 0; k < NE; k++) out[k] = 0;
  if (dormant) for (let k = 0; k < NE; k++) dormant[k] = 0;
  const n = sp.count;
  let tot = 0, liquid = 0, nl = 0;
  for (let s = 0; s < n; s++) {
    const f = comp[off + s];
    if (f <= 0) continue;
    tot += f;
    if (!sp.isPowder[s] || T >= sp.melt[s]) { liquid += f; liqIdx[nl++] = s; }
  }
  if (tot <= 1e-9) return 0;
  for (let s = 0; s < n; s++) {
    const f = comp[off + s];
    if (f <= 0) continue;
    let avail = f;
    if (sp.isPowder[s] && T < sp.melt[s]) {
      // grains dissolve only into liquid they can mix with (oil does not
      // take up salt, liquid metal does not take up crystal)
      let solvent = 0;
      for (let q = 0; q < nl; q++) {
        const l = liqIdx[q];
        if (compatFactor(sp.compatA[s], sp.compatB[s], sp.compatA[l], sp.compatB[l]) > 0.5) solvent += comp[off + l];
      }
      const sol = Math.min(0.9, Math.max(0, sp.solubility[s] + sp.solTemp[s] * (T - 20)));
      const dissolved = Math.min(f, sol * solvent * 1.2);
      avail = dissolved + (solvent / tot > 0.05 ? LEACH_WET : LEACH_DRY) * (f - dissolved);
    }
    const base = s * NE;
    const dg = dormant ? 1 / (sp.arcGain[s] || 1) : 0;
    for (let k = 0; k < NE; k++) {
      const e = sp.eff[base + k];
      if (e === 0) continue;
      out[k] += avail * e;
      if (dormant) dormant[k] += avail * e * dg;
    }
  }
  const inv = 1 / tot;
  for (let k = 0; k < NE; k++) out[k] *= inv;
  if (dormant) for (let k = 0; k < NE; k++) dormant[k] *= inv;
  return liquid / tot;
}
/** scratch: liquid slots of the composition being extracted */
const liqIdx = new Int16Array(64);

/**
 * @typedef {Object} Resonance
 * @property {string} id
 * @property {string} name
 * @property {'transmute'|'catalyse'|'suppress'} kind
 * @property {number} a        effect index acted on (consumed / amplified / suppressed)
 * @property {number} b        partner effect index
 * @property {number} c        product effect index (transmute only, else -1)
 * @property {number} k        strength
 * @property {number} min      threshold of both effects before anything happens
 * @property {string} lore     what a player is told once it is discovered
 */

/** Scratch for interaction bookkeeping (amount each resonance contributed). */
const contrib = new Float64Array(32);

/**
 * Apply resonances, oppositions and saturation in place. When `trace` is
 * given, the amount each resonance moved is added to trace[index].
 * @param {Float64Array|number[]} e
 * @param {Resonance[]} laws
 * @param {Float64Array|number[]} [trace]
 */
export function interact(e, laws, trace) {
  // 1. world resonances (computed on the raw values, applied together)
  const nl = Math.min(laws ? laws.length : 0, contrib.length);
  for (let r = 0; r < nl; r++) {
    const L = laws[r];
    const a = e[L.a], b = L.kind === 'suppress' ? Math.abs(e[L.b]) : e[L.b];
    contrib[r] = 0;
    if (a <= L.min || b <= L.min) continue;
    if (L.kind === 'transmute') {
      const amt = Math.min(L.k * Math.sqrt((a - L.min) * (b - L.min)), 0.8 * Math.min(a, b));
      contrib[r] = amt;
    } else if (L.kind === 'catalyse') {
      contrib[r] = Math.min(1, (b - L.min) / Math.max(1, 3 * L.min)) * L.k * a;
    } else {
      contrib[r] = Math.min(a, L.k * b);
    }
  }
  for (let r = 0; r < nl; r++) {
    const amt = contrib[r];
    if (amt <= 0) continue;
    const L = laws[r];
    if (L.kind === 'transmute') {
      e[L.a] -= amt * 0.5;
      e[L.b] -= amt * 0.5;
      e[L.c] += amt * 1.15;
    } else if (L.kind === 'catalyse') {
      e[L.a] += amt;
    } else {
      e[L.a] -= amt;
    }
    if (trace) trace[r] += amt;
  }
  // 2. universal oppositions
  let m = Math.min(e[E.FIRE], e[E.FROST]);
  if (m > 0) { e[E.FIRE] -= m; e[E.FROST] -= m; }
  m = Math.min(e[E.VIT], e[E.DEATH]);
  if (m > 0) { e[E.VIT] -= m; e[E.DEATH] -= m; }
  m = Math.min(e[E.VIT] * 0.5, e[E.TOX]);
  if (m > 0) { e[E.TOX] -= m; e[E.VIT] -= 2 * m; }
  // 3. saturation (acidity is signed and saturates both ways)
  for (let k = 0; k < NE; k++) {
    let v = e[k];
    if (k !== E.ACID && v < 0) v = 0;
    const s = v < 0 ? -1 : 1, av = Math.abs(v);
    e[k] = av <= KNEE ? v : s * (KNEE + 60 * (1 - Math.exp(-(av - KNEE) / 60)));
  }
  // 4. cut-off: traces under 1% do nothing
  return cutoffEffects(e);
}

const scratch = new Float64Array(NE);
const dormantScratch = new Float64Array(NE);

/**
 * Full effect vector of a composition (one particle, or a homogeneous bulk).
 * A channel under the cut-off before anything awakened stays at zero after.
 * @param {import('../reactions/species.js').SpeciesTable} sp
 * @param {ArrayLike<number>} comp @param {number} off @param {number} T
 * @param {Resonance[]} laws @param {Float64Array|number[]} out
 * @param {Float64Array|number[]} [trace]
 * @param {Float64Array|number[]} [dormant] receives the dormant raw vector (see extractedEffects)
 */
export function compositionEffects(sp, comp, off, T, laws, out, trace, dormant) {
  const d = dormant || dormantScratch;
  extractedEffects(sp, comp, off, T, scratch, d);
  for (let k = 0; k < NE; k++) out[k] = scratch[k];
  interact(out, laws, trace);
  return cutoffDormant(out, d);
}

/**
 * The guild's naive *theory*: what a mixture would do if every ingredient's
 * known effect simply added up in proportion to the poured volumes (full
 * extraction, no reactions). Laws the player has discovered are applied too.
 * This is the player's prediction tool, never the truth.
 * @param {{id:string, ml:number}[]} parts
 * @param {(id:string)=>any} lookup
 * @param {Resonance[]} knownLaws
 */
export function theoryOf(parts, lookup, knownLaws = []) {
  const v = new Float64Array(NE);
  let tot = 0;
  for (const p of parts) tot += p.ml;
  if (tot <= 0) return v;
  const dormant = new Float64Array(NE);
  for (const p of parts) {
    const d = lookup(p.id);
    // a rabbit's remains are unknown to the guild: they only dilute the theory
    if (!d || d.remains) continue;
    const ev = effectVector(d);
    const dg = d.awakened && d.arcane && d.arcane.gain > 0 ? 1 / d.arcane.gain : 1;
    for (let k = 0; k < NE; k++) { v[k] += (ev[k] * p.ml) / tot; dormant[k] += (ev[k] * dg * p.ml) / tot; }
  }
  return cutoffDormant(interact(v, knownLaws), dormant);
}

/**
 * Mean effects of a set of particles in a simulation (what the customer
 * drinks). Also returns how much each resonance contributed, for discovery.
 * @param {import('../simulation/world.js').Simulation} sim
 * @param {ArrayLike<number>} indices
 */
export function sampleEffects(sim, indices) {
  const p = sim.p, sp = sim.species, laws = sim.laws || [], S = p.S;
  const sum = new Float64Array(NE);
  const trace = new Float64Array(laws.length);
  const one = new Float64Array(NE), dorm = new Float64Array(NE), dsum = new Float64Array(NE);
  const n = indices.length;
  for (let q = 0; q < n; q++) {
    const i = indices[q];
    compositionEffects(sp, p.comp, i * S, p.temp[i], laws, one, trace, dorm);
    for (let k = 0; k < NE; k++) { sum[k] += one[k]; dsum[k] += dorm[k]; }
  }
  if (n) {
    for (let k = 0; k < NE; k++) { sum[k] /= n; dsum[k] /= n; }
    for (let r = 0; r < trace.length; r++) trace[r] /= n;
  }
  // a sip may average traces below the cut-off, dormant or awakened: those do nothing either
  cutoffDormant(cutoffEffects(sum), dsum);
  return { effects: sum, resonance: trace };
}

/** Largest positive channel (for aura colours), or -1. @param {ArrayLike<number>} v */
export function dominantEffect(v, min = 2) {
  let best = -1, bv = min;
  for (let k = 0; k < NE; k++) {
    const x = k === E.ACID ? Math.abs(v[k]) : v[k];
    if (x > bv) { bv = x; best = k; }
  }
  return best;
}

/** Text for a potency value. @param {number} v @param {string} key */
export function potencyWord(v, key) {
  if (key === 'acidity' && v < -2) return v < -25 ? 'strongly alkaline' : 'alkaline';
  const a = Math.abs(v);
  if (a < 2) return 'none';
  if (a < 8) return 'trace';
  if (a < 20) return 'mild';
  if (a < 40) return 'strong';
  return 'intense';
}
