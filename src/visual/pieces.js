// The whole pieces wild ingredients are poured into the cauldron as, drawn
// procedurally from each species' visual identity (render.js pieceFrame):
// four related pieces per species, laid out as cells of one readable pixel
// atlas that the cauldron renderer samples (rendering/fluid.js) and whose
// silhouettes the physics fits its particles to (materials/shapes.js).
//
// The atlas keeps the layout skins have always had — species in key order,
// four PIECE_CELL cells each — so a saved cauldron's particles keep their
// skins. Which world's look a species' cells show is set by registering
// the material being poured (its `vis`); until one is, a species is drawn
// from the identity of its archetype, so tests and tools need no world.

import { artRevision, onArtChanged } from '../studio/direction.js';
import { WILD_SPECS } from '../materials/wild.js';
import { hslToRgb } from '../core/color.js';
import { identityOf, identityKey, validIdentity } from './identity.js';
import { describe } from './descriptor.js';
import { pieceFrame, pieceArt, PIECE_PX, PIECE_GRID } from './render.js';
import { ingredientArtRevision } from './ingredient-assets.js';

/** Cell size in the atlas (art pixels) and the silhouette grid of a piece. */
export const PIECE_CELL = PIECE_PX;
export const PIECE_MASK = PIECE_GRID;

/** Species with pieces, in skin order. */
export const PIECE_KEYS = WILD_SPECS.map((s) => s.key).sort();
const INDEX = Object.fromEntries(PIECE_KEYS.map((k, i) => [k, i]));

export const PIECE_ART = {
  ready: true,
  width: PIECE_CELL * 4,
  height: PIECE_CELL * PIECE_KEYS.length,
  /** packed ABGR pixels (little-endian RGBA bytes) */
  px: new Uint32Array(PIECE_CELL * 4 * PIECE_CELL * PIECE_KEYS.length),
};

/** key → the identity its cells are drawn from @type {Record<string, any>} */
const shown = {};
/** key → identity cache key of what is painted now @type {Record<string, string>} */
const painted = {};
/** key → its four silhouettes @type {Record<string, Uint8Array[]>} */
const masks = {};
/** @type {((key:string)=>void)[]} */
const listeners = [];

/** Be told when a species' pieces are redrawn (to drop what was fitted to the old ones). @param {(key:string)=>void} fn */
export function onPiecesChanged(fn) { listeners.push(fn); }

/** The identity of a species' archetype (no world). @param {string} key */
export function archetypeIdentity(key) {
  const s = WILD_SPECS.find((x) => x.key === key);
  if (!s) return null;
  const [h, sat, l] = s.hue;
  return identityOf({ id: 'wild-' + key, color: hslToRgb(h, sat, l), effects: s.fx, glow: s.glow || 0, wild: { key, shape: s.shape, region: s.region, rare: !!s.rare } }, '');
}

/**
 * Show this material's look on its species' pieces (the material about to
 * be poured, or one already in the brew). Cheap when nothing changes.
 * @param {any} def
 */
export function registerSpecies(def) {
  if (!def || !def.wild || !(def.wild.key in INDEX) || !validIdentity(def.vis)) return;
  const key = def.wild.key;
  if (shown[key] === def.vis) return;
  shown[key] = def.vis;
}

/** Paint a species' cells for the identity it should show (once per change). @param {string} key */
export function ensurePieces(key) {
  if (!(key in INDEX)) return null;
  const id = shown[key] || (shown[key] = archetypeIdentity(key));
  const ik = ingredientArtRevision() + ':' + artRevision() + ":" + identityKey(id);
  if (painted[key] === ik) return masks[key];
  const d = describe(id), row = INDEX[key] * PIECE_CELL, W = PIECE_ART.width;
  const out = [];
  for (let v = 0; v < 4; v++) {
    const f = pieceFrame(d, v);
    for (let y = 0; y < PIECE_CELL; y++) for (let x = 0; x < PIECE_CELL; x++) PIECE_ART.px[(row + y) * W + v * PIECE_CELL + x] = f.pix.px[y * PIECE_CELL + x];
    out.push(f.mask);
  }
  masks[key] = out;
  const changed = painted[key] !== undefined;
  painted[key] = ik;
  palettes.clear();
  if (changed) for (const fn of listeners) fn(key);
  return out;
}

/** skin|size → a piece drawn at that size @type {Map<string, {px:Uint32Array, size:number}>} */
const sized = new Map();

/**
 * Piece `skin` drawn at `size` art pixels (square), as the menus' icons
 * and the wilds' plants are drawn: one art pixel to one screen pixel at the
 * size the cauldron shows it (cached; redrawn when the species' look changes).
 * @param {number} skin @param {number} size
 */
export function pieceSprite(skin, size) {
  const c = skinCell(skin);
  if (!c) return null;
  ensurePieces(c.key);
  const k = `${skin}|${size}|${painted[c.key]}`;
  let got = sized.get(k);
  if (!got) {
    if (sized.size > 256) sized.clear();
    const f = pieceArt(describe(shown[c.key]), c.v, size);
    got = { px: f.px, size: f.w };
    sized.set(k, got);
  }
  return got;
}

/** The silhouette of piece v of a species (PIECE_MASK square, 1 = solid). @param {string} key @param {number} v */
export function pieceMask(key, v) {
  const m = ensurePieces(key);
  return m ? m[v & 3] : null;
}

/** The species and variant of a skin id (1..), and its cell. @param {number} skin */
export function skinCell(skin) {
  const n = skin - 1, key = PIECE_KEYS[n >> 2];
  if (!key) return null;
  return { key, v: n & 3, cx: (n & 3) * PIECE_CELL, cy: (n >> 2) * PIECE_CELL };
}

/** @type {Map<number, Uint32Array>} */
const palettes = new Map();

/** Drop every palette and fitted piece read from the atlas (after its pixels were replaced, e.g. by a test's stand-in). */
export function forgetPieces() {
  palettes.clear();
  for (const fn of listeners) fn('');
}

/**
 * Every opaque pixel of a piece, the palette for grains whose own spot in
 * it falls outside the drawing.
 * @param {number} skin
 */
export function piecePalette(skin) {
  let pal = palettes.get(skin);
  if (pal) return pal;
  const c = skinCell(skin);
  if (!c) return null;
  ensurePieces(c.key);
  const out = [];
  for (let y = c.cy; y < c.cy + PIECE_CELL; y++) for (let x = c.cx; x < c.cx + PIECE_CELL; x++) {
    const p = PIECE_ART.px[y * PIECE_ART.width + x];
    if (p >>> 31) out.push(p);
  }
  pal = Uint32Array.from(out.length ? out : [0xff808080]);
  palettes.set(skin, pal);
  return pal;
}

// Palette reads must also refresh when no new ingredient was poured.
onArtChanged(() => { palettes.clear(); sized.clear(); });
