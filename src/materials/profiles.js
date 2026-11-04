// Magical, chemical and electrical profiles of the generated reagents.
//
// The world generator assigns every material an effect vector (see
// alchemy/effects.js) and electrical properties from its *role* (the stable
// part of its id, e.g. "ember-b" → "ember"). Values are jittered with a hash
// of the world seed and the id rather than the generator's RNG stream, so:
//   • existing seeds keep exactly the reagents they always had;
//   • an old save's embedded world is upgraded to precisely the values a
//     freshly generated world of the same seed would get.

import { hashString } from '../core/rng.js';

/** @typedef {Record<string, number>} Fx */

/**
 * Native effect potencies by role: percent effective concentration of the
 * pure, fully extracted, *unawakened* material (alchemy/arcane.js). Plain
 * ingredients are deliberately weak; awakening multiplies them by the gain
 * in ROLE_ARCANE. Solvents carry nothing so they can carry anything.
 * @type {Record<string, Fx>}
 */
export const ROLE_EFFECTS = {
  soot: { toxicity: 3, acidity: -6 },
  smoke: { toxicity: 8 },
  water: {},
  oil: {},
  syrup: { vitality: 4 },
  spirit: {},
  essenceA: { vitality: 18 },
  essenceB: { fire: 17 },
  essenceC: { arcana: 18 },
  binder: { strength: 6 },
  salt: {},
  ember: { fire: 30, acidity: 8 },
  frost: { frost: 30 },
  metal: { strength: 10, toxicity: 24 },
  crystal: { arcana: 28, transformation: 4 },
  wax: { strength: 5 },
  fizz: { acidity: 24, transformation: 5 },
  spores: { arcana: 14, transformation: 10, vitality: 3 },
  resin: { fire: 14, strength: 12 },
  starlight: { arcana: 32, love: 6 },
  moss: { strength: 26, vitality: 3 },
  vapor: { arcana: 8, toxicity: 16 },
  phoenix: { fire: 36, vitality: 16, transformation: 10 },
  void: { death: 28, arcana: 22, transformation: 10 },
  p_elixir: { vitality: 40, strength: 2 },
  p_ardent: { fire: 42, love: 4 },
  p_arcane: { arcana: 44, transformation: 4 },
  p_salve: { strength: 38, vitality: 6 },
  p_fizzgas: { transformation: 6, acidity: 4 },
  p_spent: { acidity: 6 },
  p_caramel: { vitality: 8, fire: 8, love: 8, strength: 5 },
  p_panacea: { vitality: 48, arcana: 34, strength: 4 },
  p_amalgam: { strength: 36, arcana: 16, toxicity: 10 },
  p_phoenix: { vitality: 36, fire: 40, transformation: 12 },
  p_varnish: { strength: 34, fire: 12, toxicity: 8 },
  p_frostbloom: { frost: 30, arcana: 18, transformation: 6 },
  p_lumen: { arcana: 50, vitality: 4, love: 4 },
};

/**
 * Arcane threshold (−1000…+1000; T = 20 °C + 0.1·thr) and awakening gain by
 * role. Thresholds sit away from each material's natural preparation
 * temperatures, so awakening is a deliberate extra step.
 * @type {Record<string, [number, number]>}
 */
export const ROLE_ARCANE = {
  soot: [800, 2], smoke: [100, 2], syrup: [380, 2.4],
  essenceA: [300, 3.2], essenceB: [450, 3], essenceC: [-150, 3], binder: [200, 2.5],
  ember: [600, 2.5], frost: [-650, 2.6], metal: [700, 2.4], crystal: [500, 3], wax: [350, 2.2], fizz: [-100, 2.5],
  spores: [250, 3], resin: [900, 2.8], starlight: [-400, 2.8], moss: [550, 3], vapor: [-300, 2.5],
  phoenix: [950, 2.4], void: [-900, 2.6],
  p_elixir: [260, 2.2], p_ardent: [500, 2], p_arcane: [450, 2], p_salve: [250, 2], p_fizzgas: [-100, 2], p_spent: [-100, 2],
  p_caramel: [400, 2], p_panacea: [350, 1.8], p_amalgam: [650, 2], p_phoenix: [900, 2], p_varnish: [700, 2],
  p_frostbloom: [-500, 2.2], p_lumen: [100, 1.8],
};

/** Version of the effect / arcane profiles. Older embedded worlds are upgraded to it. */
export const FX_VERSION = 2;

/** Electrical conductance (0..1) and intrinsic charge per unit volume (−1..1). */
export const ROLE_ELECTRIC = {
  water: [0.08, 0], oil: [0, 0], syrup: [0.04, 0], spirit: [0.03, 0], essenceA: [0.1, 0], essenceB: [0.1, 0], essenceC: [0.12, 0],
  binder: [0.02, 0], salt: [0.6, 0], ember: [0.35, 0.25], frost: [0.06, 0], metal: [1, 0], crystal: [0.2, 0], wax: [0, 0], fizz: [0.3, 0],
  spores: [0.05, 0], resin: [0, 0], starlight: [0.3, 0.2], moss: [0.05, 0], vapor: [0.02, 0], phoenix: [0.4, 0.5], void: [0.25, -0.6],
  soot: [0.5, 0], smoke: [0, 0], p_amalgam: [0.9, 0], p_elixir: [0.2, 0], p_arcane: [0.25, 0], p_lumen: [0.35, 0.15], p_phoenix: [0.4, 0.3],
};

/** Stable role of a generated id ("p_elixir-1a" → "p_elixir", "wild-ironroot" → "wild-ironroot"). @param {string} id */
export function roleOf(id) {
  if (id.startsWith('wild-')) return id;
  const k = id.lastIndexOf('-');
  return k > 0 ? id.slice(0, k) : id;
}

/** Deterministic jitter in [1-amp, 1+amp] from seed and id. */
export function jitter(seed, id, salt, amp) {
  const h = hashString(`${seed}|${id}|${salt}`);
  return 1 - amp + ((h % 10007) / 10006) * 2 * amp;
}

/**
 * Give a material its effect vector, arcane profile and electrical
 * properties (in place). A material from an older profile version is
 * upgraded to exactly what a fresh world of the same seed gets. Wild
 * materials carry their own profiles (materials/wild.js).
 * @param {any} m material definition
 * @param {string} seed
 */
export function applyProfile(m, seed) {
  if (m.legacy || m.speciesId) return m;
  const role = roleOf(m.id);
  const known = ROLE_EFFECTS[role];
  if (!m.effects || (known && m.fxv !== FX_VERSION && !m.wild && !role.startsWith('wild-'))) {
    /** @type {Fx} */
    const fx = {};
    if (known) {
      for (const [k, v] of Object.entries(known)) fx[k] = Math.round(v * jitter(seed, m.id, k, 0.1) * 10) / 10;
    } else if (m.aspects) {
      // unknown role (e.g. a custom material): map the old aspects
      const keys = ['vitality', 'fire', 'arcana', 'strength'];
      m.aspects.forEach((v, i) => { if (v) fx[keys[i]] = v; });
    }
    m.effects = fx;
    if (known) {
      const arc = ROLE_ARCANE[role];
      m.arcane = arc ? arcaneProfile(seed, m.id, arc[0], arc[1]) : undefined;
      if (!arc) delete m.arcane;
      m.fxv = FX_VERSION;
    }
  }
  if (!m.arcane && m.effects && Object.values(m.effects).some((v) => Math.abs(Number(v)) >= 1) && !role.startsWith('wild-')) {
    // any other effectful material gets a mild default threshold
    m.arcane = arcaneProfile(seed, m.id, 400, 2.2);
  }
  if (m.econd === undefined) {
    const el = ROLE_ELECTRIC[role] || [m.form === 'liquid' ? 0.06 : 0.03, 0];
    m.econd = el[0];
    m.charge = el[1];
  }
  // Prepared laboratory reagents are explicit Arcane materials. The campaign
  // uses the separate ordinary/Arcane wild catalog instead of these reagents.
  if (!m.wild && m.arcane && m.arcaneVariant === undefined) m.arcaneVariant = true;
  return m;
}

/**
 * A material's arcane threshold and gain, jittered per world (±60 units,
 * ±8 % gain) so every world has to be learned afresh.
 * @param {string} seed @param {string} id @param {number} thr @param {number} gain
 */
export function arcaneProfile(seed, id, thr, gain) {
  const t = Math.round((thr + (jitter(seed, id, 'arc', 1) - 1) * 60) / 5) * 5;
  return { thr: Math.max(-1000, Math.min(1000, t)), gain: Math.round(gain * jitter(seed, id, 'gain', 0.08) * 100) / 100 };
}
