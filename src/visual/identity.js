// The visual identity of an ingredient: the small, self-contained record its
// whole appearance is generated from — on the ground, as an icon, as pieces
// in the cauldron — wherever it is shown.
//
// It carries everything the generator reads (schema version, world of origin,
// species key and family shape, habitat, rarity, colour and alchemical
// profile, and a dedicated variation seed), so the same pixels can be
// rebuilt on another device from the record alone, without the world it
// came from or any image file. That is what a future cross-world trade would
// send. The record is a description, not a proof of ownership: anyone can
// write one, so trading will need its own authority.
//
// `v` is the visual schema: a record keeps the schema it was made with, so a
// later generator can add new looks for new records without changing the
// ones players already have.

import { hashString } from '../core/rng.js';

/** The current visual-generation schema. */
export const VISUAL_SCHEMA = 1;

/**
 * @typedef {Object} VisualIdentity
 * @property {number} v          schema
 * @property {string} key        species (wild key)
 * @property {string} shape      family shape (materials/wild.js)
 * @property {string} region     habitat
 * @property {string} origin     world seed it was found in
 * @property {number} seed       variation seed (uint32)
 * @property {boolean} rare
 * @property {number[]} color    base colour, sRGB 0..1 (3 decimals)
 * @property {Record<string, number>} fx  alchemical effects (rounded)
 * @property {number|null} arc   arcane awakening threshold, or null
 * @property {number} glow       luminosity of the material (0..1)
 */

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * The identity of a wild material found in a world.
 * @param {any} m material (with m.wild) @param {string} origin world seed
 * @returns {VisualIdentity}
 */
export function identityOf(m, origin) {
  const w = m.wild || {};
  /** @type {Record<string, number>} */
  const fx = {};
  for (const [k, v] of Object.entries(m.effects || {})) if (Math.abs(Number(v)) >= 0.5) fx[k] = Math.round(Number(v));
  return {
    v: VISUAL_SCHEMA,
    key: String(w.key || m.id),
    shape: String(w.shape || m.shape || 'stone'),
    region: String(w.region || 'forest'),
    origin: String(origin),
    seed: hashString(`vis:${origin}:${w.key || m.id}`),
    rare: !!w.rare,
    color: (m.color || [0.5, 0.5, 0.5]).map(r3),
    fx,
    arc: m.arcane && Number.isFinite(m.arcane.thr) ? Math.round(m.arcane.thr) : null,
    glow: r3(m.glow || 0),
  };
}

/**
 * Give every wild material of a world its visual identity, keeping one it
 * already has (so a save's ingredients look as they always did).
 * @param {{seed:string, materials:any[]}} world
 */
export function attachVisuals(world) {
  for (const m of world.materials) {
    if (!m.wild || m.product) continue;
    if (!validIdentity(m.vis)) m.vis = identityOf(m, m.speciesId ? 'catalog-v1' : world.seed);
  }
  return world;
}

/** @param {any} v @returns {v is VisualIdentity} */
export function validIdentity(v) {
  return !!v && typeof v === 'object' && Number.isInteger(v.v) && v.v >= 1 && typeof v.key === 'string' && typeof v.shape === 'string'
    && typeof v.region === 'string' && Number.isFinite(v.seed) && Array.isArray(v.color) && v.color.length === 3 && v.fx && typeof v.fx === 'object';
}

/** A stable cache key for an identity. @param {VisualIdentity} v */
export const identityKey = (v) => `${v.v}|${v.key}|${v.shape}|${v.region}|${v.seed}|${v.rare ? 1 : 0}|${v.color.join(',')}|${Object.entries(v.fx).sort().map(([k, x]) => k + x).join(',')}|${v.arc}|${v.glow}`;

/**
 * A compact, portable form of an identity (for sharing between devices):
 * versioned JSON in URL-safe base64.
 * @param {VisualIdentity} v
 */
export function encodeIdentity(v) {
  const json = JSON.stringify([v.v, v.key, v.shape, v.region, v.origin, v.seed, v.rare ? 1 : 0, v.color, v.fx, v.arc, v.glow]);
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : /** @type {any} */ (globalThis).Buffer.from(json, 'utf8').toString('base64');
  return 'pv' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Read an encoded identity back (null if it is not one).
 * @param {string} s @returns {VisualIdentity|null}
 */
export function decodeIdentity(s) {
  if (typeof s !== 'string' || !s.startsWith('pv')) return null;
  try {
    const b64 = s.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : /** @type {any} */ (globalThis).Buffer.from(b64, 'base64').toString('utf8');
    const [v, key, shape, region, origin, seed, rare, color, fx, arc, glow] = JSON.parse(json);
    const id = { v, key, shape, region, origin, seed, rare: !!rare, color, fx, arc, glow: glow || 0 };
    return validIdentity(id) ? id : null;
  } catch {
    return null;
  }
}
