// Species sprites for the interface: every wild ingredient's plant at each
// growth stage and its icon, rasterized once from its visual identity
// (visual/render.js) and cached. The same descriptor drives the plant in the
// wilds, its icon on the shelf, in the shop, the book and on its deposit
// card, and its pieces in the cauldron (visual/pieces.js), so an ingredient
// is recognisable wherever it appears.
//
// Frames and silhouettes are plain pixel buffers (usable in Node); canvases
// are made only where there is a DOM.

import { artRevision } from '../studio/direction.js';
import { describe } from '../visual/descriptor.js';
import { plantFrame, iconFrame, ICON_PX } from '../visual/render.js';
import { identityKey, validIdentity } from '../visual/identity.js';
import { archetypeIdentity } from '../visual/pieces.js';
import { Pixels } from '../visual/pixels.js';
import { isBotanical } from '../visual/taxonomy.js';
import { rawSprite } from './scenes.js';
import { mountsOfForm, frameMount, growthParams } from '../visual/growth.js';
import { hashString } from '../core/rng.js';
import { INK } from '../visual/style.js';

export { ICON_PX };

/** Smallest tap target around a plant, in scene pixels (≈ 30 CSS px on a phone). */
export const MIN_HIT = 26;

/** The growth stages and their frame index. */
const STAGE = { sprout: 0, ripe: 1, mature: 2 };

/** The visual identity of a material: its own, else its archetype's. @param {any} m */
export function identityOfMaterial(m) {
  if (m && validIdentity(m.vis)) return m.vis;
  return m && m.wild ? archetypeIdentity(m.wild.key) : null;
}

/** The descriptor a material is drawn from, or null for one that is not wild. @param {any} m */
export function speciesOf(m) {
  const id = identityOfMaterial(m);
  return id ? describe(id) : null;
}

/** @type {Map<string, any>} */
const cache = new Map();
const CACHE_MAX = 500;
function cached(k, make) {
  k = artRevision() + ":" + k;
  let v = cache.get(k);
  if (v) return v;
  v = make();
  if (cache.size >= CACHE_MAX) cache.delete(/** @type {string} */ (cache.keys().next().value));
  cache.set(k, v);
  return v;
}

/** A frame with a one-pixel glowing rim round its silhouette (the plant under the pointer). @param {import('../visual/render.js').Frame} f */
function rimmed(f) {
  const w = f.pix.w + 2, h = f.pix.h + 2, p = new Pixels(w, h), src = f.pix;
  const op = (x, y) => x >= 0 && y >= 0 && x < src.w && y < src.h && src.px[y * src.w + x] >>> 24;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (op(x - 1, y - 1)) continue;
    if (op(x - 2, y - 1) || op(x, y - 1) || op(x - 1, y - 2) || op(x - 1, y)) p.px[y * w + x] = 0xffa8f0ff;
  }
  p.draw(src, 1, 1);
  return { pix: p, ax: f.ax + 1, ay: f.ay + 1, glints: f.glints.map(([x, y]) => [x + 1, y + 1]), glows: (f.glows || []).map(([x, y]) => [x + 1, y + 1]) };
}

/**
 * A frame lit by its surroundings: every colour multiplied by the light
 * where it stands (`light`: the tint and brightness of the scene round it,
 * so a plant under the lava's glow is warm, one in a dark cave dim), and
 * shaded where it meets what holds it (its foot in the soil, the point it
 * hangs from, the side against a rock face or a trunk). What gives light of
 * its own (the glow ramp) is left as it is.
 * @param {import('../visual/render.js').Frame} f @param {number[]} light @param {string} mount @param {number[]} own colours that glow
 */
function lit(f, light, mount, own) {
  const src = f.pix, p = new Pixels(src.w, src.h), glow = new Set(own);
  // the outline takes on the shadows of where it stands (a little), so it sits in the painting rather than on it
  const ink = light.length >= 6 ? (0xff000000 | [0, 1, 2].reduce((a, i) => a | (Math.round(((INK >>> (i * 8)) & 255) * 0.55 + light[3 + i] * 255 * 0.5 * 0.45) << (i * 8)), 0)) >>> 0 : INK;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.px[y * src.w + x];
    if (!(c >>> 24)) continue;
    if (glow.has(c)) { p.px[y * src.w + x] = c; continue; }
    if (c === INK) { p.px[y * src.w + x] = ink; continue; }
    // occlusion: a step darker within two pixels of the hold
    const near = mount === 'hang' ? y - f.ay < 3 : mount === 'wall' || mount === 'trunk' ? Math.abs(x - f.ax) < 3 : y > f.ay - 3;
    const k = near ? 0.82 : 1;
    p.px[y * src.w + x] = (c & 0xff000000) | (Math.min(255, Math.round(((c >>> 16) & 255) * light[2] * k)) << 16) | (Math.min(255, Math.round(((c >>> 8) & 255) * light[1] * k)) << 8) | Math.min(255, Math.round((c & 255) * light[0] * k));
  }
  return { pix: p, ax: f.ax, ay: f.ay, glints: f.glints, glows: f.glows || [] };
}

/** Which of its species' four variants a plant grows as (from its id: a plant keeps its look). @param {string} id */
export const variantOf = (id) => hashString('variant:' + id) & 3;

/** Where a material is found: its mounts with their weights, the ground last (visual/growth.js). @param {any} m @returns {[string, number][]} */
export function mountsOf(m) {
  const id = identityOfMaterial(m);
  return id ? mountsOfForm(id.shape) : [['ground', 1]];
}

/**
 * @typedef {{closed?:boolean, hover?:boolean, mount?:string, variant?:number, flip?:boolean, light?:number[]|null, k?:number}} FrameOpts
 *   k: the definition, pixels to a scene pixel (2: for the wilds' detail layer)
 */

/**
 * A plant's frame at a stage (pure pixels), on its mount (the ground,
 * hanging, a rock face or a trunk; mirrored for a face on its right), as
 * one of its variants, optionally closed (a dawn or dusk plant out of its
 * hour) or rimmed (under the pointer).
 * @param {any} m material @param {string} stage @param {FrameOpts} [o]
 * @returns {import('../visual/render.js').Frame|null}
 */
export function plantFrameOf(m, stage, o = {}) {
  const id = identityOfMaterial(m);
  if (!id) return null;
  // stones and shells do not grow: one picture, whole, at every stage (a crystal
  // grows: a seed, an elongated point split in two, then its full habit)
  const st = isBotanical(id.shape) || id.shape === 'crystal' || id.shape === 'shard' ? STAGE[stage] ?? 2 : 2, closed = !!o.closed && st === 2;
  const mount = frameMount(o.mount), variant = (o.variant ?? 0) & 3, flip = !!o.flip && mount === 'wall';
  const light = o.light && (o.light.length > 3 || o.light.some((v) => Math.abs(v - 1) > 0.02)) ? o.light : null;
  const def = o.k ?? 1;
  const k = `${identityKey(id)}|${st}|${closed ? 1 : 0}|${mount}|${variant}|${flip ? 1 : 0}|${light ? light.join(',') : ''}|${def}`;
  const base = cached('p|' + k, () => {
    const d = describe(id), f = plantFrame(d, st, { closed, mount, variant, flip, k: def });
    return light ? lit(f, light, mount, d.pal.glow) : f;
  });
  const out = o.hover ? cached('h|' + k, () => rimmed(base)) : base;
  /** @type {any} */ (out).k = def;
  return out;
}

/** The canvas of a plant frame (browser), cached with it. @param {any} m @param {string} stage @param {FrameOpts} [o] */
export function plantCanvas(m, stage, o = {}) {
  const f = plantFrameOf(m, stage, o);
  if (!f) return null;
  const any = /** @type {any} */ (f);
  if (!any.cv) any.cv = f.pix.toCanvas();
  return { cv: /** @type {HTMLCanvasElement} */ (any.cv), ax: f.ax, ay: f.ay, w: f.pix.w, h: f.pix.h, glints: f.glints, glows: f.glows || [], k: any.k || 1 };
}

/**
 * The colour a plant glows in the wilds: a pale tint of its own body
 * colour (cached per species).
 * @param {any} m @returns {string|null}
 */
export function plantGlow(m) {
  const id = identityOfMaterial(m);
  if (!id) return null;
  return cached(`g|${identityKey(id)}`, () => {
    const ramp = describe(id).pal.main || [0xffc0c0c0], c = ramp[Math.max(0, ramp.length - 2)];
    const rgb = [c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((v) => Math.round(v + (255 - v) * 0.4));
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  });
}

/**
 * The colour a glowing plant lights its surroundings with (cached per species), or null if it does not glow.
 * @param {any} m @returns {string|null}
 */
export function emitColour(m) {
  const id = identityOfMaterial(m);
  if (!id) return null;
  return cached(`e|${identityKey(id)}`, () => {
    const d = describe(id);
    if (!growthParams(d).glow) return null;
    const c = d.pal.glow[d.pal.glow.length - 1];
    return `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`;
  });
}

/**
 * Everything a plant may ever cover (all its stages, rimmed) on a mount, as
 * one of its variants, relative to the point it is attached at: what the
 * scene keeps clear for it.
 * @param {any} m @param {{mount?:string, variant?:number, flip?:boolean}} [o]
 * @returns {{w:number, h:number, ax:number, ay:number, m:Uint8Array}|null}
 */
export function silhouetteOf(m, o = {}) {
  const id = identityOfMaterial(m);
  if (!id) return null;
  const mount = frameMount(o.mount), variant = (o.variant ?? 0) & 3, flip = !!o.flip && mount === 'wall';
  return cached(`s|${identityKey(id)}|${mount}|${variant}|${flip ? 1 : 0}`, () => {
    const frames = ['sprout', 'ripe', 'mature'].flatMap((s) => [false, true].map((closed) => plantFrameOf(m, s, { hover: true, closed, mount, variant, flip }))).filter(Boolean);
    let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
    for (const f of frames) { x0 = Math.min(x0, -f.ax); y0 = Math.min(y0, -f.ay); x1 = Math.max(x1, f.pix.w - f.ax); y1 = Math.max(y1, f.pix.h - f.ay); }
    const w = x1 - x0, h = y1 - y0, mask = new Uint8Array(w * h);
    for (const f of frames) for (let y = 0; y < f.pix.h; y++) for (let x = 0; x < f.pix.w; x++) if (f.pix.px[y * f.pix.w + x] >>> 24) mask[(y - f.ay - y0) * w + x - f.ax - x0] = 1;
    return { w, h, ax: -x0, ay: -y0, m: mask };
  });
}

/** An ingredient's icon (pure pixels). @param {any} m */
export function iconFrameOf(m) {
  const id = identityOfMaterial(m);
  return id ? cached(`i|${identityKey(id)}`, () => iconFrame(describe(id))) : null;
}

/**
 * A square picture of a raw ingredient for every list it appears in (the
 * shelf, the shop, the book, recipes and its deposit card): the grown
 * plant exactly as it stands in the wilds, the same pixels — or, for
 * a rabbit's remains, its little sprite. A new canvas each call (it goes
 * into the page).
 * @param {any} m material @param {number} [fill] 0..1 (unused by icons; remains shrink with it)
 */
export function ingredientSprite(m, fill = 1) {
  const f = m && m.wild ? iconFrameOf(m) : null;
  if (!f) return rawSprite(m.shape || 'stone', m.look || m.color, fill);
  // the very picture it has in the wilds: the grown plant (or crystal, stone, shell) on the mount its species is found on
  // first, whole, in a square canvas just round it (the lists show it at their own size, so it fills their slot)
  const mount = mountsOf(m)[0][0];
  const sp = plantCanvas(m, 'mature', { mount, variant: 0 });
  const cv = /** @type {HTMLCanvasElement} */ (document.createElement('canvas'));
  cv.style.imageRendering = 'pixelated';
  if (!sp) { const g = f.pix.toCanvas(); cv.width = g.width; cv.height = g.height; /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')).drawImage(g, 0, 0); return cv; }
  const S = Math.max(16, sp.w, sp.h) + 2;
  cv.width = S; cv.height = S;
  const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  // (what hangs from its hold hangs from the top of the box; the rest stands on its floor)
  ctx.drawImage(sp.cv, Math.round((S - sp.w) / 2), frameMount(mount) === 'hang' ? 1 : S - 1 - sp.h);
  return cv;
}
