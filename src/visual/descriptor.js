// The canonical visual descriptor of a species: everything its pictures are
// drawn from, derived (purely and deterministically) from its identity
// (identity.js). The same descriptor drives the plant on the ground at every
// growth stage, its icon, its pieces in the cauldron and the colour of the
// powder it grinds into.
//
// Separate random streams (morphology, palette, surface) are drawn from the
// identity's variation seed, so adding a new kind of detail to one never
// changes another — a species keeps its shape when its colours are refined.
//
// The alchemical profile leaves clues, never numbers: strength thickens
// stems and roots, transformation makes a species asymmetric and
// iridescent, frost sharpens and pales it, fire warms its edges, death
// greys it and draws dark veins, poison spots it, acid blotches it, arcana
// lends it a violet glimmer, love softens and blushes it, vitality makes it
// lush. The habitat tints its light, wetness and wear.

import { directDescriptor, artRevision } from '../studio/direction.js';

import { Rng } from '../core/rng.js';
import { familyOf, isBotanical, habitatOf, EFFECT_TINT } from './taxonomy.js';
import { ramp, toLch, fromLch, hueToward, shift } from './color.js';
import { identityKey } from './identity.js';
import { FAMILIES } from './families/index.js';

/** @typedef {import('./identity.js').VisualIdentity} VisualIdentity */

/**
 * @typedef {Object} Descriptor
 * @property {VisualIdentity} id
 * @property {string} family
 * @property {string} form          the identity's shape (a sub-form of the family)
 * @property {boolean} botanical
 * @property {import('./taxonomy.js').Habitat} hab
 * @property {Record<string, number>} tr   traits 0..1 (thick, asym, sharp, droop, lush, round, spots, glow, corrode, chalky, warm, pale, irid)
 * @property {string} main          the strongest effect
 * @property {string|null} side     the strongest side effect (its tint marks the species)
 * @property {Record<string, number[]>} pal  material ramps
 * @property {Record<string, any>} m  family morphology parameters
 * @property {{w:number, h:number}} size  mature size on the ground (scene pixels)
 * @property {{morph:number, palette:number, surface:number}} seeds
 */

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** @type {Map<string, Descriptor>} */
const cache = new Map();
const CACHE_MAX = 400;

/** The descriptor of an identity (cached). @param {VisualIdentity} id @returns {Descriptor} */
export function describe(id) {
  const k = artRevision() + ":" + identityKey(id);
  let d = cache.get(k);
  if (d) return d;
  d = directDescriptor(build(id));
  if (cache.size >= CACHE_MAX) cache.delete(/** @type {string} */ (cache.keys().next().value));
  cache.set(k, d);
  return d;
}

/** @param {VisualIdentity} id @returns {Descriptor} */
/** Each family's size on the ground relative to the others (a crystal or a shell is smaller than a flowering stem). */
const FAMILY_SCALE = { crystal: 0.8, shell: 0.85, mineral: 0.9, moss: 0.9, bark: 0.9, fruit: 0.88, fungus: 0.95 };

function build(id) {
  const family = familyOf(id.shape), hab = habitatOf(id.region);
  const seeds = { morph: (id.seed ^ 0x5a17) >>> 0, palette: (id.seed ^ 0xc01d) >>> 0, surface: (id.seed ^ 0x7e57) >>> 0 };
  const fx = id.fx || {};
  const a = (/** @type {string} */ k) => clamp01(Math.abs(fx[k] || 0) / 28);
  const tr = {
    thick: a('strength'), asym: a('transformation'), irid: a('transformation'), sharp: Math.max(a('frost'), a('fire') * 0.6),
    droop: a('death'), lush: a('vitality'), round: a('love'), spots: a('toxicity'), glow: Math.max(a('arcana') * 0.6, clamp01(id.glow || 0)),
    corrode: (fx.acidity || 0) > 0 ? a('acidity') : 0, chalky: (fx.acidity || 0) < 0 ? a('acidity') : 0, warm: a('fire'), pale: a('frost'),
  };
  const ranked = Object.entries(fx).filter(([, v]) => Math.abs(v) > 0).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]));
  const main = ranked.length ? ranked[0][0] : 'vitality';
  const side = ranked.length > 1 ? ranked[1][0] : null;
  const pal = palette(id, family, hab, tr, side, new Rng(seeds.palette));
  const F = FAMILIES[family];
  const mrng = new Rng(seeds.morph);
  /** @type {Descriptor} */
  const d = { id, family, form: id.shape, botanical: isBotanical(id.shape), hab, tr, main, side, pal, m: {}, size: { w: 24, h: 24 }, seeds };
  d.m = F.params(mrng, d);
  const base = F.size(d);
  // (scaled to the scene's trees and rocks: a herb or a flower knee-high to an oak, about a tenth of the scene's height,
  // a stone or a shell a hand across, a crystal cluster no bigger than a bush — and still big enough to read and tap)
  const k = 0.68 * (FAMILY_SCALE[family] ?? 1) * (id.rare ? 1.12 : 1) * (0.92 + mrng.next() * 0.16) * (1 + tr.thick * 0.08 + tr.lush * 0.06);
  d.size = { w: Math.round(base.w * k), h: Math.round(base.h * k) };
  return d;
}

/**
 * The species' ramps. Its own colour (the material's) is the heart of it,
 * nudged by the world's variation and the habitat's light; its foliage,
 * wood and stone come from the habitat, bent by what it carries.
 */
function palette(id, family, hab, tr, side, rng) {
  // the world's variation on the archetype's colour
  let base = shift(id.color, { dh: (rng.next() - 0.5) * 22, cK: 0.9 + rng.next() * 0.25, dL: (rng.next() - 0.5) * 0.06 });
  // habitat light and saturation
  base = shift(base, { cK: hab.sat, dL: hab.dark * 0.5 });
  const [bL, bC, bh] = toLch(base);
  const lightH = toLch(hab.light)[2];
  const lit = fromLch(bL, bC, hueToward(bh, lightH, hab.lightK * 0.5));
  // effect cues on the body colour itself
  let body = lit;
  if (tr.droop > 0.3) body = shift(body, { cK: 1 - tr.droop * 0.45, dL: -tr.droop * 0.05 });
  if (tr.pale > 0.3) body = shift(body, { dL: tr.pale * 0.06, h: 230, hT: tr.pale * 0.15 });
  if (tr.warm > 0.3) body = shift(body, { h: 40, hT: tr.warm * 0.12 });
  const sideT = side ? EFFECT_TINT[side] : null;
  const acc = sideT ? fromLch(sideT.L, sideT.c * hab.sat, hueToward(sideT.h, bh, 0.15)) : shift(body, { dL: 0.15, dh: 30 });
  // foliage: the habitat's green, yellowed by poison, greyed by death, cooled by frost, deepened by life
  let leaf = shift(hab.leaf, { dh: (rng.next() - 0.5) * 18, cK: 0.9 + rng.next() * 0.25 });
  if (tr.spots > 0.25) leaf = shift(leaf, { h: 100, hT: tr.spots * 0.3 });
  if (tr.droop > 0.25) leaf = shift(leaf, { cK: 1 - tr.droop * 0.5 });
  if (tr.pale > 0.25) leaf = shift(leaf, { h: 190, hT: tr.pale * 0.25, dL: 0.04 });
  if (tr.lush > 0.25) leaf = shift(leaf, { cK: 1 + tr.lush * 0.25 });
  if (family === 'fungus' || family === 'moss') leaf = shift(leaf, { cK: 0.8 });
  const stem = shift(leaf, { dL: -0.06, cK: 0.85, h: 80, hT: 0.15 });
  const wood = shift(family === 'bark' ? body : [0.36, 0.25, 0.16], family === 'bark' ? {} : { h: bh, hT: 0.1 });
  const rock = shift(hab.rock, { dh: (rng.next() - 0.5) * 10 });
  const center = rng.next() < 0.6 ? shift(acc, { dL: 0.05 }) : fromLch(0.8, 0.14, 85);
  const glowC = fromLch(0.86, 0.13, sideT && side === 'arcana' ? 295 : hueToward(bh, 200, 0.3));
  const cr = tr.irid > 0.3 ? 0.18 : 0.1;
  return {
    main: ramp(body, { spread: 0.52 }),
    main2: ramp(shift(body, { dL: 0.05, cK: 0.8, dh: (rng.next() - 0.5) * 20 }), { spread: 0.48 }),
    accent: ramp(acc, { spread: 0.42, n: 5 }),
    mark: ramp(shift(acc, { dL: -0.12 }), { spread: 0.3, n: 4 }),
    center: ramp(center, { spread: 0.45, n: 5 }),
    leaf: ramp(leaf, { spread: 0.5 }),
    stem: ramp(stem, { spread: 0.42, n: 5 }),
    wood: ramp(wood, { spread: 0.45 }),
    rock: ramp(rock, { spread: 0.5, sat: 0.9 }),
    soil: ramp(hab.soil, { spread: 0.3, n: 4 }),
    pale: ramp(shift(body, { dL: 0.25, cK: 0.35 }), { spread: 0.25, n: 4 }),
    gill: ramp(shift(body, { dL: 0.12, cK: 0.45, h: 70, hT: 0.3 }), { spread: 0.4, n: 5 }),
    glow: ramp(glowC, { spread: 0.25, n: 4, cool: 0, warm: 0 }),
    crystal: ramp(body, { spread: 0.7, sat: 1.15, n: 7 }),
    iris: ramp(fromLch(0.75, cr, (bh + 120) % 360), { spread: 0.35, n: 4 }),
  };
}
