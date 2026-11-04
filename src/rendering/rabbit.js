// Moon Rabbits in pixel art: one rabbit in a 48×40 frame (trial cards,
// roster tiles, the hutch), drawn only from its RabbitLook and its quantised
// RabbitSnap. The renderer never receives a hidden number: every visible
// state is one of four levels, a permanent mark, a trait or a pose.
//
// The approach: rabbitAnchors() turns look + snap into pure geometry (body
// ellipses, ear bases, face points, the tail, the back line) for one pose.
// Each of the eleven channels, each scar and each trait is then its own
// layer placed on those anchors, so levels, kits, giants, poses and any mix
// of effects combine without special cases. Static layers (auras, far
// appendages, outline, coat and pattern with its tints, surface marks and
// scars, near appendages and trait art, the face) are painted once into a
// cached 48×40 sprite; animated overlays (hearts, flames, bubbles, sparkles
// and runes, frost motes, steam, chalk, wisps, gleams) are a few rects per
// frame placed from the anchors and t only.
//
// The look follows the Moon Rabbit sheet: a round haunch and a big round
// head with a muzzle, a large dark eye with a glint and a blush below it,
// thick ears lined in pink, outlined paws and a tuft of a tail; spotted
// coats in big blotches with dark ear backs, Dutch coats dark behind a pale
// band and blaze. Its poses: standing (idle), sitting up (rear), leaping
// (hop, while off the ground), grazing with a tuft of grass (eat), startled
// with crossed eyes (hurt: badly hurt, or flinching from a harmful dose)
// and lying stretched out with crossed eyes (dead).
//
// Pixel style as in scenes.js: integer rects only (one clipped painter, P),
// 1px '#1a1218' outlines drawn as every ellipse 1px larger first, shading
// css(c,.82)/css(c,.68), highlights mixed toward white by .4, and no
// Math.random: seeded Rng streams from look.seed place spots and marks.

import { directLook, directAnatomy, creatureClock } from '../studio/creature-runtime.js';
import { artRevision } from '../studio/direction.js';
import { Rng, hashString } from '../core/rng.js';
import { PAL, makeCanvas } from './art.js';
import { RABBIT_MARKS } from '../game/colony.js';
import { KINDS } from '../game/kinds.js';
import { punchSprite } from './punch.js';
import { nativeBody } from './native-creatures.js';

export const RABBIT_W = 48;
export const RABBIT_H = 40;

/** 4×4 ordered-dither matrix (the one renderCauldron uses in art.js). */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** @param {number} x @param {number} y */
const bayer = (x, y) => BAYER4[(x & 3) + (y & 3) * 4];

const K = '#1a1218';
const WHITE = [1, 1, 1];
const TEAL = [0.4, 0.9, 0.79], SICK = [0.55, 0.62, 0.3], ICE = [0.75, 0.9, 1], ASH = [0.54, 0.51, 0.59];
const EMBER = [1, 0.6, 0.3], CHAR = [0.23, 0.14, 0.09], GREY = [0.66, 0.64, 0.68];
const C_PINK = '#ffc7dd', C_NOSE = '#ff5aa8', C_HEART = '#ff5aa8', C_BLUSH = '#ff9fc7', C_RUBY = '#e0402c';
const C_RIME = PAL.frost3, C_ICE = '#8fd0ff';
const C_CHALK = '#e6dcc8', C_CHALK2 = '#c9c0b0', C_CRUST = '#a8a090';
const C_SINGE = '#3a2416', C_SINGE2 = '#5a3a20', C_SOOT = '#2a1a12';
const C_BURN = '#ffc7dd', C_BURN_RIM = '#c0506a', C_RAW = '#ff8fa0', C_ACID = '#d8e86a';
const C_SLIME = '#92cc71', C_SLIME2 = '#6f8a3a', C_DRIP = '#b6e08a';
const C_GOLD = PAL.brassHi, C_GLEAM = '#fff0b0', C_CREAM = '#fff6e0';
const C_RUNE = PAL.magic, C_RUNE_HI = PAL.magicHi, C_SHIM = '#5fd4b4', C_GREY = '#a8a2b0';
const BADGER_FACE = '#f2f0ea';
const FOX_LEG = { body: '#3a2418', shade: '#2a1810', dark: '#1a1210', hi: '#5a3a28', rgb: [0.23, 0.14, 0.09] };
const C_BEAK = '#c8a8a0', C_FOOT = '#e07a8a', C_SHELL_LINE = 'rgba(40,20,8,0.55)', C_NECK = ['#6ac0a0', '#a080c8'];
const C_EAR = '#f08aa8', C_GRASS = '#6aa84f', C_GRASS2 = '#3f7a3a', C_GRASS3 = '#9ccc65';
/** Channels whose dose makes a rabbit flinch into the hurt pose. */
const HARM = ['fire', 'acid', 'toxicity', 'frost', 'death', 'alkali'];

// ------------------------------------------------------------------ small helpers

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** @param {number} v @param {number} m */
const mod = (v, m) => ((v % m) + m) % m;
/** @param {any} v */
const lvl = (v) => (v >= 3 ? 3 : v >= 2 ? 2 : v >= 1 ? 1 : 0);
/** @param {number[]} rgb 0..1 @param {number} [k] brightness */
function css(rgb, k = 1) {
  return `rgb(${Math.round(clamp(rgb[0] * 255 * k, 0, 255))},${Math.round(clamp(rgb[1] * 255 * k, 0, 255))},${Math.round(clamp(rgb[2] * 255 * k, 0, 255))})`;
}
/** @param {number[]} a @param {number[]} b @param {number} t */
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
/** @param {any} v @param {number[]} fallback @returns {number[]} */
function rgbOf(v, fallback) {
  return Array.isArray(v) && v.length >= 3 ? [clamp(+v[0] || 0, 0, 1), clamp(+v[1] || 0, 0, 1), clamp(+v[2] || 0, 0, 1)] : fallback;
}

/**
 * @typedef {((x:number, y:number, w:number, h:number, c:string) => void) & {k?:number, f?:(x:number, y:number, w:number, h:number, c:string) => void, clip?:(rows:number[][]) => void, unclip?:() => void}} Pen
 *   k: the definition (pixels to a frame pixel); f: a rect on the fine grid (fine pixels, frame-relative);
 *   clip/unclip: confine what is painted to fine rows [y, x0, x1) (the body's smooth silhouette), and release
 */

/**
 * The one rect painter: rounds to integers (minimum size 1), adds the motion
 * offset, clips to the 48×40 frame (unless clip is false) and mirrors inside
 * it, so a rabbit facing left is the same drawing flipped.
 * @param {CanvasRenderingContext2D} ctx @param {number} fx @param {number} fy frame origin
 * @param {number} dx @param {number} dy motion offset @param {boolean} mirror @param {boolean} [clip]
 * @returns {Pen}
 */
function pen(ctx, fx, fy, dx, dy, mirror, clip = true, k = 1) {
  /** @type {Pen} */
  const P = (x, y, w, h, c) => {
    let X = Math.round(x) + dx, Y = Math.round(y) + dy;
    let W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
    if (clip) {
      if (X < 0) { W += X; X = 0; }
      if (Y < 0) { H += Y; Y = 0; }
      if (X + W > RABBIT_W) W = RABBIT_W - X;
      if (Y + H > RABBIT_H) H = RABBIT_H - Y;
      if (W <= 0 || H <= 0) return;
    }
    ctx.fillStyle = c;
    ctx.fillRect(fx + (mirror ? RABBIT_W - X - W : X) * k, fy + Y * k, W * k, H * k);
  };
  P.k = k;
  if (k > 1) {
    // a rect of the fine grid, in fine pixels from the frame's corner
    P.f = (x, y, w, h, c) => {
      let X = Math.round(x) + dx * k, Y = Math.round(y) + dy * k, W = Math.round(w), H = Math.round(h);
      if (clip) {
        if (X < 0) { W += X; X = 0; }
        if (Y < 0) { H += Y; Y = 0; }
        if (X + W > RABBIT_W * k) W = RABBIT_W * k - X;
        if (Y + H > RABBIT_H * k) H = RABBIT_H * k - Y;
      }
      if (W <= 0 || H <= 0) return;
      ctx.fillStyle = c;
      ctx.fillRect(fx + (mirror ? RABBIT_W * k - X - W : X), fy + Y, W, H);
    };
    P.clip = (rows) => {
      const path = new Path2D();
      for (const [y, x0, x1] of rows) { const X = x0 + dx * k; path.rect(fx + (mirror ? RABBIT_W * k - X - (x1 - x0) : X), fy + y + dy * k, x1 - x0, 1); }
      ctx.save();
      ctx.clip(path);
    };
    P.unclip = () => ctx.restore();
  }
  return P;
}

/**
 * An ellipse's rows on the fine grid (k pixels to a frame pixel): [y, x0, x1) in fine pixels, the
 * ellipse grown by `grow` frame pixels — the same extent as its frame-pixel rows, its curve smooth.
 * @param {Ell} e @param {number} grow @param {number} k
 */
function fineRows(e, grow, k) {
  const Rx = e.rx + 0.5 + grow, Ry = e.ry + 0.5 + grow, cx = e.cx + 0.5, cy = e.cy + 0.5, out = [];
  for (let fy = Math.floor((cy - Ry) * k); fy < Math.ceil((cy + Ry) * k); fy++) {
    const t = ((fy + 0.5) / k - cy) / Ry;
    if (t * t >= 1) continue;
    const hw = Rx * Math.sqrt(1 - t * t), x0 = Math.round((cx - hw) * k), x1 = Math.round((cx + hw) * k);
    if (x1 > x0) out.push([fy, x0, x1]);
  }
  return out;
}

/** @typedef {{cx:number, cy:number, rx:number, ry:number}} Ell */
/** @returns {Ell} */
const E = (cx, cy, rx, ry) => ({ cx: Math.round(cx), cy: Math.round(cy), rx: Math.max(1, Math.round(rx)), ry: Math.max(1, Math.round(ry)) });
/** Half width of an ellipse's rasterised row dy (as ell draws it). @param {{rx:number, ry:number}} e @param {number} dy */
const half = (e, dy) => Math.round(e.rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (e.ry * e.ry))));

/** A filled pixel ellipse, row by row, grown by `grow` (the outline pass uses 1). @param {Pen} P @param {Ell} e @param {number} grow @param {string} col */
function ell(P, e, grow, col) {
  // on a fine grid: the ellipse's own smooth rows; an outline (grow) a single fine pixel thick
  if (P.f && P.k) { for (const [y, x0, x1] of fineRows(e, grow ? grow * 0.5 : 0, P.k)) P.f(x0, y, x1 - x0, 1, col); return; }
  const g = { rx: e.rx + grow, ry: e.ry + grow };
  for (let yy = -g.ry; yy <= g.ry; yy++) {
    const w = half(g, yy);
    P(e.cx - w, e.cy + yy, w * 2 + 1, 1, col);
  }
}
/** [x0, x1] of an ellipse's row y, or null. @param {Ell} e @param {number} y @param {number} [grow] */
function spanOf(e, y, grow = 0) {
  const g = { rx: e.rx + grow, ry: e.ry + grow }, yy = y - e.cy;
  if (yy < -g.ry || yy > g.ry) return null;
  const w = half(g, yy);
  return [e.cx - w, e.cx + w];
}
/** Per-row union [y, x0, x1] of several ellipses. @param {Ell[]} parts @param {number} [grow] */
function rowsOf(parts, grow = 0) {
  let y0 = Infinity, y1 = -Infinity;
  for (const e of parts) { y0 = Math.min(y0, e.cy - e.ry - grow); y1 = Math.max(y1, e.cy + e.ry + grow); }
  /** @type {number[][]} */
  const out = [];
  for (let y = y0; y <= y1; y++) {
    let x0 = Infinity, x1 = -Infinity;
    for (const e of parts) {
      const s = spanOf(e, y, grow);
      if (s) { x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[1]); }
    }
    if (x1 >= x0) out.push([y, x0, x1]);
  }
  return out;
}
/** Topmost (dir -1) or lowest (dir 1) filled row at column x, or null. @param {Ell[]} parts @param {number} x @param {number} [dir] */
function colEdge(parts, x, dir = -1) {
  let best = null;
  for (const e of parts) {
    const dx = Math.abs(x - e.cx);
    if (dx > e.rx) continue;
    for (let i = 0; i <= e.ry; i++) {
      const yy = dir < 0 ? i - e.ry : e.ry - i;
      if (half(e, yy) >= dx) { const y = e.cy + yy; if (best === null || (dir < 0 ? y < best : y > best)) best = y; break; }
    }
  }
  return best;
}
/** @param {Ell[]} parts @returns {[number, number]} */
function xRange(parts) {
  let x0 = Infinity, x1 = -Infinity;
  for (const e of parts) { x0 = Math.min(x0, e.cx - e.rx); x1 = Math.max(x1, e.cx + e.rx); }
  return [x0, x1];
}

/**
 * Stamp a letter grid (like icons.js): '.' is transparent, every other
 * letter a colour from `pal`; runs of one letter become one rect.
 * @param {Pen} P @param {string[]} grid @param {number} x @param {number} y @param {Record<string, string>} pal
 */
function stamp(P, grid, x, y, pal) {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let i = 0; i < row.length;) {
      const ch = row[i];
      let j = i + 1;
      while (j < row.length && row[j] === ch) j++;
      const col = pal[ch];
      if (col) P(x + i, y + r, j - i, 1, col);
      i = j;
    }
  }
}

// Trait and mark art as letter grids (k is the outline).
const HORNS = ['kk...', 'khk..', '.khk.', '.khHk', '..kHk'];
const ANTLERS = ['.k...k.', 'kak.kak', 'kak.kak', '.kakak.', '..kak..', '..kAk..', '..kAk..'];
const UNIHORN = ['..k..', '.kwk.', '.kyk.', '.kwk.', 'kyywk', 'kwyyk'];
const WING = ['k.....', 'kk....', 'kmk...', 'kmmkk.', 'kmMmmk', '.kkkkk'];
const WING_FOLD = ['kkkkk.', 'kmmMmk', '.kkkkk'];
const SPIKE = ['.k.', 'kik', 'kIk'];
const CRYSTAL = ['.k.', 'kik', 'ktk', 'kTk'];
const RUNES = [['x.x', '.x.', 'x.x'], ['xxx', '.x.', '.x.'], ['x..', 'xxx', '..x'], ['.x.', 'x.x', '.x.']];
const HORN_H = { horns: 5, antlers: 7, unihorn: 6 };

/** @param {Pen} P @param {number} x @param {number} y @param {string} c 3×3 heart */
function heart(P, x, y, c) {
  P(x, y, 1, 1, c); P(x + 2, y, 1, 1, c); P(x, y + 1, 3, 1, c); P(x + 1, y + 2, 1, 1, c);
}
/** @param {Pen} P @param {number} x @param {number} y @param {string} c 3×3 plus centred on x,y */
function plus(P, x, y, c) {
  P(x - 1, y, 3, 1, c); P(x, y - 1, 1, 3, c);
}

// ------------------------------------------------------------------ levels and poses

/** Level 0..3 of every channel by name (RABBIT_MARKS order in snap.lv). @param {any} snap @returns {Record<string, number>} */
export function rabbitLevels(snap) {
  const lv = (snap && snap.lv) || [];
  /** @type {Record<string, number>} */
  const o = {};
  for (let i = 0; i < RABBIT_MARKS.length; i++) o[RABBIT_MARKS[i]] = lvl(lv[i]);
  return o;
}
/** Permanent marks [singe, acid burns, frostbite, grey, rune], 0..3. @param {any} snap */
const scarsOf = (snap) => { const s = (snap && snap.sc) || []; return [lvl(s[0]), lvl(s[1]), lvl(s[2]), lvl(s[3]), lvl(s[4])]; };
/** @param {any} snap @returns {Set<string>} */
const traitsOf = (snap) => new Set(snap && Array.isArray(snap.traits) ? snap.traits : []);

/**
 * The pose a snapshot is drawn in. Death and collapse always win; a caller
 * may ask for 'loaf', 'rear', 'flop', 'eat' (the hutch's behaviours),
 * 'hop' (off the ground) or 'hurt' (a flinch). Poisoned rabbits slump, badly
 * hurt ones sit startled.
 * @param {any} snap @param {string} [want]
 * @returns {RabbitPose}
 */
export function rabbitPose(snap, want) {
  if (!snap || snap.alive === false) return 'dead';
  const L = rabbitLevels(snap);
  if (L.death === 3 || snap.hp >= 3) return 'collapse';
  if (want === 'loaf' || want === 'rear' || want === 'flop' || want === 'eat' || want === 'hop' || want === 'hurt' || want === 'walk1' || want === 'walk2' || want === 'walk3' || want === 'walk4' || want === 'fly1' || want === 'fly2') return want;
  if (L.toxicity >= 2) return 'sick';
  if (snap.hp >= 2) return 'hurt';
  return 'idle';
}
/** @typedef {'idle'|'sick'|'hurt'|'loaf'|'rear'|'flop'|'eat'|'hop'|'walk1'|'walk2'|'walk3'|'walk4'|'fly1'|'fly2'|'collapse'|'dead'} RabbitPose */

/** How fast a rabbit lives (bob, hops, behaviours): slowed by death, poison and age, quickened by vitality or fire. @param {any} snap */
export function rabbitPace(snap) {
  const L = rabbitLevels(snap);
  return (L.death >= 2 ? 0.5 : L.death === 1 ? 0.8 : 1) * (L.toxicity === 3 ? 0.6 : 1) * (snap && snap.stage === 'elder' ? 0.7 : 1) * (L.vitality === 3 || L.fire === 3 ? 1.6 : 1) * (1 + (L.swiftness || 0) * 0.35) / (1 + (L.temporal || 0) * 0.2);
}

// ------------------------------------------------------------------ anchors (pure geometry)

const STAGE_G = { kit: 0.62, young: 0.82, adult: 1, elder: 0.97 };

/**
 * An ear. 'up': y is its base row and it rises len rows, leaning back one
 * pixel every `lean` rows; 'lop': y is its top row and it hangs len rows;
 * 'flat' (lying poses): x is the tip and it lies len px to the right.
 * 'cat': a pointed ear, x its left base column, y its base row, rising len rows.
 * 'round': a small round ear of radius len, x its centre column, y its base row.
 * 'stalk': a snail's eye stalk, 1px wide, len rows tall, leaning one pixel every `lean` rows (negative: forward).
 * @typedef {{kind:'up'|'lop'|'flat'|'cat'|'round'|'stalk', far:boolean, x:number, y:number, len:number, w:number, lean:number}} Ear
 */
/**
 * @typedef {Object} RabbitAnchors
 * @property {import('../game/kinds.js').AnimalKind} kind
 * @property {RabbitPose} pose
 * @property {boolean} lying   lying poses (flop, collapse, dead)
 * @property {boolean} [bare]  grazing bare ground: no tuft of grass at its mouth
 * @property {number} g        body scale (stage × size × traits × muscle)
 * @property {number} hs       head scale
 * @property {Ell} haunch
 * @property {Ell} chest
 * @property {Ell} head
 * @property {Ell} muzzle
 * @property {Ell[]} bulges    strength musculature (forearm, shoulder, thigh, neck)
 * @property {Ell[]} parts     every body ellipse, back to front
 * @property {Ear[]} ears      far first
 * @property {{x:number,y:number,w:number,h:number,seg?:boolean,foot?:boolean}[]} legs  legs off the ground: leaping, a raised paw, a hind leg kicked out
 * @property {{x:number,y:number}} eye
 * @property {{x:number,y:number}} eye3
 * @property {{x:number,y:number}} nose
 * @property {{x:number,y:number}} cheek
 * @property {{x:number,y:number}} brow     horn root
 * @property {{x:number,y:number,r:number,len:number}} tail
 * @property {Ell} plume
 * @property {{x:number,y:number}} wing     top-left of the wing grid
 * @property {{x0:number,x1:number,y:number}} back
 * @property {{x:number,y:number}} belly
 * @property {number} feetY
 * @property {number} cx       body centre column
 * @property {number} top      topmost drawn row (ears, horns)
 * @property {{x0:number,y0:number,x1:number,y1:number}} box  everything static, in frame pixels
 */

/** How high a cat's tail curls above its root. */
const CAT_TAIL_RISE = 6;
/** How far a dove's raised wing reaches above its back. */
const DOVE_WING = 9;
/** Kinds whose tail reaches out well behind them. */
const LONG_TAIL = new Set(['cat', 'salamander', 'fox', 'rat', 'ermine', 'dove']);

/** @param {any} look @returns {import('../game/kinds.js').AnimalKind} */
const kindOfLook = (look) => (look && look.kind && Object.prototype.hasOwnProperty.call(KINDS, look.kind) ? look.kind : 'rabbit');

/** Overall scale of each kind against a rabbit (a toad, a rat, a snail are small beasts). */
const KIND_G = { toad: 0.8, rat: 0.78, snail: 0.82, dove: 0.82, ermine: 0.85 };

/**
 * The build of the four-legged kinds, in body units (×g; the head ×hs):
 * leg length, haunch and chest (centre column from the frame's left, half
 * width and height), the head (column, height above the back, half sizes),
 * the snout (offset, half sizes; 0 none) and whether it sits up on its
 * haunches ('sit') or stands up on its hind legs ('stand') when rearing.
 * @type {Record<string, {leg:number, hx:number, hrx:number, hry:number, cx:number, crx:number, cry:number, hdx:number, hdy:number, hrxH:number, hryH:number, sn:[number, number, number], rear:'sit'|'stand'|'alert'}>}
 */
const QUAD = {
  cat: { leg: 6, hx: 11, hrx: 6.5, hry: 4, cx: 19, crx: 5, cry: 4, hdx: 25, hdy: 9, hrxH: 4.8, hryH: 4.2, sn: [0, 0, 0], rear: 'sit' },
  fox: { leg: 6, hx: 11, hrx: 7, hry: 3.8, cx: 19.5, crx: 5, cry: 4, hdx: 25.5, hdy: 8, hrxH: 4.2, hryH: 3.6, sn: [3.6, 2.6, 1.4], rear: 'sit' },
  badger: { leg: 3, hx: 11, hrx: 8.5, hry: 5, cx: 19, crx: 6, cry: 4.6, hdx: 25, hdy: 3, hrxH: 4.2, hryH: 3.6, sn: [3.4, 2.4, 1.6], rear: 'alert' },
  rat: { leg: 2, hx: 12, hrx: 6.5, hry: 4.5, cx: 18, crx: 4, cry: 3.5, hdx: 23, hdy: 3.5, hrxH: 3.6, hryH: 3, sn: [3, 2.2, 1.4], rear: 'stand' },
  deer: { leg: 11, hx: 12, hrx: 6.5, hry: 4, cx: 20, crx: 4.8, cry: 4.2, hdx: 27, hdy: 11, hrxH: 3.6, hryH: 3.2, sn: [3, 2.2, 1.6], rear: 'alert' },
  ermine: { leg: 3, hx: 12, hrx: 7.5, hry: 3, cx: 20, crx: 5, cry: 3, hdx: 26, hdy: 4, hrxH: 3.6, hryH: 3, sn: [2.6, 1.6, 1.2], rear: 'stand' },
};

/**
 * Each kind's build lying on its side (dead, collapsed, flopped), in body
 * units like QUAD's: haunch, chest and head, and how long its legs are.
 */
const LIE = {
  rabbit: { hx: 11, hrx: 9.5, hry: 5.6, cx: 20, crx: 5.2, cry: 4.6, hdx: 27, hrxH: 4.8, hryH: 4, leg: 5 },
  toad: { hx: 11, hrx: 8.5, hry: 4.6, cx: 18, crx: 6, cry: 4.2, hdx: 23.5, hrxH: 5, hryH: 3.4, leg: 4 },
  salamander: { hx: 12, hrx: 7, hry: 2.8, cx: 20, crx: 5.5, cry: 2.8, hdx: 27, hrxH: 3.6, hryH: 2.6, leg: 2 },
  dove: { hx: 14, hrx: 7.5, hry: 4.2, cx: 20, crx: 4.6, cry: 4, hdx: 25, hrxH: 2.8, hryH: 2.6, leg: 2 },
  ...Object.fromEntries(Object.entries(QUAD).map(([k, q]) => [k, { hx: q.hx, hrx: q.hrx + 0.5, hry: q.hry + 0.8, cx: q.cx, crx: q.crx, cry: q.cry + 0.4, hdx: q.hdx + 1.5, hrxH: q.hrxH, hryH: q.hryH, leg: q.leg }])),
};

/**
 * Where a walker is in its stride: 'walk1'…'walk4' are the four beats of a
 * walk (-1 standing). In each beat one leg is lifted and swung forward
 * while the other three are planted and push back.
 * @param {string} pose
 */
function walkBeat(pose) {
  const m = /^walk([1-4])$/.exec(pose);
  return m ? Number(m[1]) - 1 : -1;
}

/**
 * A leg's place in the stride: 0 planted forward, 1 under its hip, 2 pushed
 * back, 3 lifted and swinging forward. The legs take turns as a walking
 * animal's do — far hind, far fore, near hind, near fore.
 * @param {number} beat @param {number} leg 0 far hind, 1 far fore, 2 near hind, 3 near fore
 */
const legPhase = (beat, leg) => (beat + 3 - leg) % 4;

/**
 * A leg from its hip down to its foot as a column of pixel runs: slanting
 * forward or back with the stride, the knee (a fore leg's) or the hock (a
 * hind leg's) bending as it lifts. The last run is the foot.
 * @param {number} x hip @param {number} y0 top @param {number} y1 the ground row it stands on
 * @param {number} w @param {number} phase legPhase (-1 standing) @param {number} s stride (px) @param {boolean} fore
 * @returns {{x:number,y:number,w:number,h:number,seg?:boolean,foot?:boolean}[]}
 */
function strideLeg(x, y0, y1, w, phase, s, fore) {
  if (phase < 0) return [{ x, y: y0, w, h: y1 - y0 + 1 }];
  const dx = phase === 0 ? s : phase === 2 ? -s : phase === 3 ? (fore ? 1 : -1) : 0;
  const lift = phase === 3 ? Math.max(1, Math.round(s * 0.75)) : 0;
  const bend = phase === 3 ? (fore ? 1.5 : -1.5) : phase === 2 && !fore ? -0.6 : 0;
  const end = y1 - lift, n = Math.max(1, end - y0);
  /** @type {{x:number,y:number,w:number,h:number,seg?:boolean,foot?:boolean}[]} */
  const out = [];
  for (let y = y0; y <= end; y++) {
    const t = (y - y0) / n, lx = Math.round(x + dx * t + bend * Math.sin(Math.PI * Math.min(1, t * 1.15)));
    const last = out[out.length - 1];
    if (last && last.x === lx && y !== end) last.h++;
    else out.push({ x: lx, y, w, h: 1, seg: true });
  }
  out[out.length - 1].foot = true;
  return out;
}

/**
 * The build of every kind but the rabbit in a pose: body, chest and head,
 * its snout, its legs (striding through 'walk1'/'walk2') and extra parts
 * (a deer's neck, a toad's folded leg and bulging eye).
 * @param {string} kind @param {RabbitPose} pose @param {number} ox @param {number} oy
 * @param {number} g @param {number} hs @param {number} bulk @param {number} preg
 * @returns {{haunch:Ell, chest:Ell, head:Ell, snout:Ell|null, legs:{x:number,y:number,w:number,h:number,seg?:boolean,foot?:boolean}[], extra:Ell[]}}
 */
function kindBody(kind, pose, ox, oy, g, hs, bulk, preg) {
  /** @type {{x:number,y:number,w:number,h:number,seg?:boolean,foot?:boolean}[]} */
  const legs = [];
  /** @type {Ell[]} */
  const extra = [];
  const beat = walkBeat(pose), walk = beat < 0 ? 0 : beat < 2 ? 1 : -1;
  /** @type {Ell} */ let haunch;
  /** @type {Ell} */ let chest;
  /** @type {Ell} */ let head;
  /** @type {Ell|null} */ let snout = null;
  const Q = QUAD[kind];
  if (Q) {
    const sit = pose === 'rear' && Q.rear !== 'alert';
    if (sit && Q.rear === 'sit') {
      // sitting upright on its haunches, forelegs straight
      haunch = E(ox + 11 * g, oy - 5 * g, 6.5 * g, 5 * g + preg);
      chest = E(ox + 16 * g, oy - 10 * g, 4.5 * g + bulk, 6 * g);
      head = E(ox + 18 * g, oy - 17 * g, Q.hrxH * hs, Q.hryH * hs);
      legs.push({ x: Math.round(chest.cx + 1), y: chest.cy + 2, w: 2, h: Math.max(1, oy - 1 - chest.cy - 2) });
    } else if (sit) {
      // up on its hind legs, forepaws tucked to its chest, looking about
      haunch = E(ox + 12 * g, oy - 4 * g, 5.5 * g, 4 * g + preg);
      chest = E(ox + 15 * g, oy - 10 * g, 3.8 * g + bulk, 5.5 * g);
      head = E(ox + 17 * g, oy - 16.5 * g, Q.hrxH * hs, Q.hryH * hs);
      legs.push({ x: Math.round(chest.cx + chest.rx - 1), y: chest.cy - 1, w: 2, h: 2 });
    } else if (pose === 'loaf' || pose === 'sick') {
      // lying tucked, legs folded under it
      haunch = E(ox + Q.hx * g, oy - 0.95 * Q.hry * g, Q.hrx * g + 1, Q.hry * g + preg);
      chest = E(ox + Q.cx * g, oy - 0.95 * Q.cry * g, Q.crx * g + bulk, Q.cry * g);
      head = E(ox + (Q.hdx - 1) * g, oy - Q.cry * g - Math.max(2, Q.hdy * 0.45) * g + (pose === 'sick' ? 2 : 0), Q.hrxH * hs, Q.hryH * hs);
      if (kind === 'deer') legs.push({ x: Math.round(chest.cx + chest.rx - 3), y: oy - 2, w: 4, h: 1 }); // a folded foreleg
    } else {
      // on four legs: the back level, the head up (down to the ground when it eats, pulled back when hurt, raised when alert)
      const lh = Math.max(2, Math.round(Q.leg * g));
      // the back rises a pixel as the planted legs pass under it
      const by = oy - lh - (beat === 1 || beat === 3 ? (lh >= 5 ? 1 : 0) : 0);
      const alert = pose === 'rear' ? 1 : 0, hurt = pose === 'hurt' ? 1 : 0;
      haunch = E(ox + Q.hx * g, by - 0.85 * Q.hry * g, Q.hrx * g, Q.hry * g + preg);
      chest = E(ox + Q.cx * g, by - 0.9 * Q.cry * g - hurt * g, Q.crx * g + bulk, Q.cry * g + bulk * 0.5);
      head = pose === 'eat'
        ? E(ox + (Q.hdx + 1) * g, oy - Q.hryH * hs - (kind === 'deer' ? 0 : 0.5), Q.hrxH * hs, Q.hryH * hs)
        : E(ox + (Q.hdx - hurt - alert) * g, by - (Q.hdy + 2 * hurt + 3 * alert) * g + (beat === 0 || beat === 2 ? 0.6 : 0), Q.hrxH * hs, Q.hryH * hs);
      const s = Math.max(1, Math.round((Q.leg >= 6 ? 2 : 1.4) * g));
      const hx = Math.round(haunch.cx - 2 * g), fx = Math.round(chest.cx + 1 * g);
      const top = (/** @type {Ell} */ e) => Math.round(e.cy + e.ry - 2);
      // four legs, each in its own place in the stride (a deer's slender); the far pair first, behind
      const lw = kind === 'deer' ? 1 : 2, ph = (/** @type {number} */ k) => (beat < 0 ? -1 : legPhase(beat, k));
      if (pose === 'hop') {
        // in mid-leap: stretched out, fore legs reaching ahead, hind legs flung back
        const r = Math.max(2, Math.round(lh * 0.8)), y1 = oy - 1 - Math.max(1, Math.round(lh * 0.35));
        legs.push(...strideLeg(hx - 1, top(haunch), y1, lw, 2, r, false));
        legs.push(...strideLeg(fx, top(chest), y1, lw, 0, r, true));
        legs.push(...strideLeg(hx + 2, top(haunch), y1, lw, 2, r + 1, false));
        legs.push(...strideLeg(fx + 3, top(chest), y1, lw, 0, r + 1, true));
      } else {
        legs.push(...strideLeg(hx, top(haunch), oy - 1, lw, ph(0), s, false));
        legs.push(...strideLeg(fx, top(chest), oy - 1, lw, ph(1), s, true));
        legs.push(...strideLeg(hx + 3, top(haunch), oy - 1, lw, ph(2), s, false));
        legs.push(...strideLeg(fx + 3, top(chest), oy - 1, lw, ph(3), s, true));
      }
    }
    // (room above the head for its ears, inside the frame)
    if (head.cy - head.ry < 7) head = E(head.cx, head.ry + 7, head.rx, head.ry);
    if (Q.sn[0]) snout = E(Math.min(head.cx + Q.sn[0] * hs, RABBIT_W - 2 - Q.sn[1] * hs), head.cy + 1, Q.sn[1] * hs, Q.sn[2] * hs);
    // a deer's long neck, from its shoulders up to its head
    if (kind === 'deer' && head.cy < chest.cy - 3) extra.push(E((chest.cx + head.cx) / 2 + 0.5, (chest.cy - chest.ry * 0.3 + head.cy) / 2 + 1, 2.2 * g, Math.max(2, (chest.cy - head.cy) / 2)));
  } else if (kind === 'toad') {
    if (pose === 'rear') {
      haunch = E(ox + 11 * g, oy - 5 * g, 7 * g, 5 * g + preg);
      chest = E(ox + 17 * g, oy - 8 * g, 5 * g + bulk, 5.5 * g);
      head = E(ox + 21 * g, oy - 13 * g, 5 * hs, 3.5 * hs);
    } else {
      const low = pose === 'loaf' || pose === 'sick' ? 1 : 0;
      haunch = E(ox + 11 * g, oy - 5 * g + low, 8.5 * g, 5 * g + preg - low);
      chest = E(ox + 18 * g, oy - 4.5 * g + low, 6 * g + bulk, 4.5 * g - low);
      head = E(ox + 23 * g, oy - (pose === 'eat' ? 4 : 6) * g + low, 5 * hs, 3.5 * hs);
    }
    // a splayed forelimb
    legs.push({ x: Math.round(chest.cx + chest.rx - 3), y: oy - 3, w: 2, h: 2 });
    extra.push(E(haunch.cx + 2 * g, haunch.cy + 1, 3.6 * g, 2.6 * g)); // the folded hind leg
    extra.push(E(head.cx + 1, head.cy - head.ry + 1, 1.6 * hs + 0.4, 1.6 * hs + 0.4)); // the bulging eye
  } else if (kind === 'dove') {
    // a plump bird: an oval body, a puffed breast, a small round head on a short neck, thin legs
    const fly = pose === 'hop' || pose === 'fly1' || pose === 'fly2';
    const lh = fly ? 0 : pose === 'loaf' || pose === 'sick' ? 0 : Math.max(2, Math.round(3 * g));
    const by = oy - lh - (fly ? 6 * g : 0);
    const bob = beat === 0 || beat === 2 ? 1 : 0;
    haunch = E(ox + 14 * g, by - 4 * g, 7.5 * g, 4.2 * g + preg);
    chest = E(ox + 20 * g, by - 4.6 * g - (pose === 'rear' ? 1 : 0), (pose === 'rear' ? 5.5 : 4.6) * g + bulk * 0.5, (pose === 'rear' ? 5 : 4.2) * g);
    head = pose === 'eat'
      ? E(ox + 25 * g, oy - 3 * hs, 2.8 * hs, 2.6 * hs)
      : E(ox + (24 + bob) * g, by - 10.5 * g + (fly ? 3 * g : 0), 2.8 * hs, 2.6 * hs);
    snout = E(head.cx + head.rx + 0.5, head.cy + 0.5, 1.2, 1);
    if (!fly && lh) {
      // a bird's walk: one foot lifted and set down ahead of the other, the head bobbing
      const st = (/** @type {number} */ k) => (beat < 0 ? 0 : [1, 0, -1, 0][(beat + k * 2) % 4]), up = (/** @type {number} */ k) => (beat >= 0 && (beat + k * 2) % 4 === 3 ? 1 : 0);
      legs.push({ x: Math.round(haunch.cx + 2 * g) + st(0), y: by, w: 1, h: lh - 1 - up(0) });
      legs.push({ x: Math.round(chest.cx - 1 * g) + st(1), y: by, w: 1, h: lh - 1 - up(1) });
    }
  } else if (kind === 'snail') {
    // a banded shell riding on a long flat foot; withdrawn, only the shell and a lip of foot show
    const hid = pose === 'loaf' || pose === 'sick' || pose === 'hurt' || pose === 'dead' || pose === 'collapse' || pose === 'flop';
    const wave = walk;
    haunch = E(ox + 15 * g, oy - 6.5 * g, 5.8 * g + preg, 5.8 * g);
    chest = E(ox + (hid ? 16 : 19 + wave * 0.5) * g, oy - 1.6 * g, (hid ? 7 : 11) * g, 1.6 * g);
    head = hid ? E(ox + 20 * g, oy - 2 * g, 1, 1)
      : E(ox + (29 + wave * 0.5) * g, oy - (pose === 'rear' ? 5 : pose === 'eat' ? 2 : 3.2) * g, 2.6 * hs, 2.2 * hs);
  } else {
    // salamander: long and low, belly near the ground, head raised a little when rearing
    const rise = pose === 'rear' ? 3 : pose === 'hurt' ? 2 : 0;
    haunch = E(ox + 12 * g, oy - 3 * g - 3, 7 * g, 2.8 * g + preg);
    chest = E(ox + 20 * g, oy - 3 * g - 3 - rise * 0.5, 5.5 * g + bulk, 2.8 * g);
    head = E(ox + 27 * g, oy - (pose === 'eat' ? 2.5 : 3.5) * g - 3 - rise, 3.6 * hs, 2.6 * hs);
    // four short splayed legs, walking in diagonal pairs
    // four short splayed legs, in a sprawling diagonal walk: each reaches forward, plants, pushes back
    const s = Math.max(1, Math.round(1.5 * g)), ly = Math.min(haunch.cy + haunch.ry - 1, oy - 3);
    const leg = (/** @type {number} */ x, /** @type {number} */ k) => {
      const p = beat < 0 ? -1 : legPhase(beat, k), dx = p === 0 ? s : p === 2 ? -s : 0, up = p === 3 ? 1 : 0;
      legs.push({ x: Math.round(x) + dx, y: ly - up, w: 2, h: oy - 1 - ly });
    };
    leg(haunch.cx - 3 * g, 0); leg(haunch.cx + 1 * g, 2); leg(chest.cx - 1 * g, 3); leg(chest.cx + 3 * g, 1);
    // the body sways from side to side as it goes: the tail end and head swing a pixel
    if (beat === 1 || beat === 3) head = E(head.cx, head.cy + (beat === 1 ? -0.6 : 0.6), head.rx, head.ry);
  }
  return { haunch, chest, head, snout, legs, extra };
}

/**
 * Pure geometry of a rabbit facing right in a 48×40 frame (feet on row 33,
 * straw at 34..37). Every combination of stage, size, traits, strength and
 * pose stays inside the frame.
 * @param {any} look RabbitLook @param {any} snap RabbitSnap @param {string} [want] pose asked for (see rabbitPose)
 * @returns {RabbitAnchors}
 */
export function rabbitAnchors(look, snap, want) {
  look = look || {};
  const L = rabbitLevels(snap), tr = traitsOf(snap);
  const pose = rabbitPose(snap, want);
  const stage = snap && STAGE_G[snap.stage] ? snap.stage : 'adult';
  const kit = stage === 'kit', elder = stage === 'elder';
  const mus = L.strength;
  const size = clamp(Number(look.size) || 1, 0.85, 1.15);
  // (a toad, a rat or a snail is a smaller beast than a rabbit or a cat)
  const kindG = KIND_G[kindOfLook(look)] || 1;
  const g = clamp(size * STAGE_G[stage] * kindG * (1 + 0.04 * mus) * (tr.has('giant') ? 1.18 : tr.has('tiny') ? 0.8 : 1), 0.5, 1.3);
  const hs = kit ? 0.95 * Math.max(g, 0.8) : 0.25 + 0.75 * g;
  const lying = pose === 'dead' || pose === 'collapse' || pose === 'flop';
  const preg = snap && snap.preg ? 1 : 0;
  const oy = 34;
  const ox = Math.round(24 - (lying ? 15 : 14) * g);
  const bulk = [0, 1, 1, 2][mus];
  const earK = (look.ear === 'short' ? 0.6 : 1) * (kit ? 0.7 : 1);
  const hornH = tr.has('antlers') ? HORN_H.antlers : tr.has('unihorn') ? HORN_H.unihorn : tr.has('horns') ? HORN_H.horns : 0;
  const headRy = Math.round((lying ? 3.8 : 4.5) * hs);
  let haunch, chest, head;
  /** legs: stretched hind legs and reaching paws (hop), a raised paw (hurt, rear), a hind leg kicked out (flop, dead) */
  const legs = [];
  const kind = kindOfLook(look);
  /** @type {Ell|null} */
  let snout = null;
  if (lying) {
    // lying on its side: as deep in the body as it stands (never squashed flat), the head
    // resting on the ground in front, the legs stiff and stretched out behind and ahead
    const D = LIE[kind] || LIE.rabbit, Q = QUAD[kind];
    const hry = Math.round(D.hry * g) + preg, cry = Math.round(D.cry * g + bulk * 0.5);
    haunch = E(ox + D.hx * g, oy - hry, D.hrx * g, hry);
    chest = E(ox + D.cx * g, oy - cry, D.crx * g + bulk, cry);
    const hry2 = Math.max(2, Math.round(D.hryH * hs)), hrx2 = D.hrxH * hs;
    // the head on the ground just ahead of the chest, its own round shape rather than the body's end
    head = E(Math.min(RABBIT_W - 3 - hrx2 - (QUAD[kind]?.sn[0] ? 3 : 0), Math.max(ox + D.hdx * g, chest.cx + chest.rx + hrx2 * 0.3)), oy - hry2, hrx2, hry2);
    if (Q && Q.sn[0]) snout = E(Math.min(head.cx + Q.sn[0] * hs, RABBIT_W - 2 - Q.sn[1] * hs), head.cy + 1, Q.sn[1] * hs, Q.sn[2] * hs);
    if (kind === 'dove') snout = E(head.cx + head.rx + 0.5, head.cy + 0.5, 1.2, 1);
    const ll = Math.max(2, Math.round(D.leg * g)), lw = kind === 'deer' ? 1 : 2;
    if (pose === 'dead' && kind !== 'dove' && kind !== 'snail' && kind !== 'salamander') {
      // dead: rolled onto its back, its legs stiff in the air, splayed a little
      const up = Math.max(4, Math.round(ll * 0.75)) + 1;
      const leg = (/** @type {number} */ x, /** @type {number} */ base, /** @type {number} */ len, /** @type {number} */ lean) => {
        for (let i = 0; i < len; i++) {
          const lx = Math.round(x + (lean * i) / len), last = legs[legs.length - 1];
          if (i && last && last.x === lx) { last.y--; last.h++; } else legs.push({ x: lx, y: base - i, w: lw, h: 1, seg: true });
        }
      };
      const ht = haunch.cy - haunch.ry + 2, ct = chest.cy - chest.ry + 2;
      leg(haunch.cx - Math.round(haunch.rx * 0.2), ht, up + 1, -2);
      leg(haunch.cx + Math.round(haunch.rx * 0.25), ht, up, -1);
      leg(chest.cx - 1, ct, up, 1);
      leg(chest.cx + Math.round(chest.rx * 0.5), ct, up + 1, 2);
    } else {
    // the hind legs kicked out behind, one over the other
    legs.push({ x: haunch.cx - haunch.rx - Math.round(ll * 0.55), y: oy - 3, w: Math.round(ll * 0.55) + 3, h: lw });
    if (kind !== 'dove' && kind !== 'snail') legs.push({ x: haunch.cx - haunch.rx - Math.round(ll * 0.35), y: oy - 3 - lw - 1, w: Math.round(ll * 0.35) + 3, h: lw });
    // the forelegs reaching out ahead of the chest (the long-legged kinds' past the muzzle)
    if (kind !== 'dove' && kind !== 'snail' && kind !== 'rabbit') {
      const fx = chest.cx + Math.round(chest.rx * 0.3), fw = Math.min(RABBIT_W - 2 - fx, Math.round(chest.rx * 0.7 + ll));
      legs.push({ x: fx, y: oy - 2, w: fw, h: lw });
      legs.push({ x: fx - 1, y: oy - 2 - lw - 1, w: Math.max(2, fw - 2), h: lw });
    }
    }
  } else if (pose === 'hop') {
    // mid-leap: the back arched, the haunch round and lifted, hind legs thrown back, forepaws reaching
    haunch = E(ox + 10 * g, oy - 9 * g, 8 * g, 6 * g + preg);
    chest = E(ox + 18 * g, oy - 10 * g, 5.5 * g + bulk, 5 * g + bulk * 0.5);
    head = E(ox + 24 * g, oy - 15 * g, 5 * hs, headRy);
    legs.push({ x: haunch.cx - haunch.rx - Math.round(3 * g), y: haunch.cy + Math.round(3 * g), w: Math.max(3, Math.round(6 * g)), h: 2 });
    legs.push({ x: chest.cx + chest.rx - 2, y: chest.cy + chest.ry - 1, w: Math.max(2, Math.round(4 * g)), h: 2 });
  } else if (pose === 'rear') {
    // sitting up: as high as the frame allows above the ears or horns
    const earLen = look.ear === 'lop' ? 0 : Math.round(10 * hs * earK);
    haunch = E(ox + 10 * g, 0, 8 * g, 6.5 * g + preg);
    haunch.cy = oy - haunch.ry;
    chest = E(ox + 16 * g, oy - 10 * g, 5 * g + bulk, 6.5 * g + bulk * 0.5);
    const hcy = Math.max(oy - 18 * g, headRy + 1 + Math.max(Math.ceil(earLen * 0.7), hornH));
    head = E(ox + 19 * g, hcy, 5 * hs, headRy);
    legs.push({ x: chest.cx + chest.rx - 2, y: chest.cy - 1, w: 2, h: 3 });
  } else {
    let hrx = 9.5 * g, hry = 6.5 * g + preg, ccx = ox + 18 * g, ccy = oy - 6 * g, crx = 6 * g + bulk, cry = 5.5 * g + bulk * 0.5;
    let hcx = ox + 24 * g, hcy = oy - 13 * g;
    if (pose === 'sick') { hrx -= 1; hry += 1; hcy += 2; } // hunched, head hanging
    else if (pose === 'loaf') { hrx -= 1; hry -= 1; ccx -= 1; ccy += 1; hcx -= 1; hcy += 2; } // tucked into a loaf
    else if (pose === 'hurt') { hrx -= 1; ccx -= g; ccy -= 2 * g; cry += 1; hcx -= g; hcy -= 2 * g; } // startled up
    else if (pose === 'eat') { ccx += g; ccy += g; hcx += 2 * g; hcy = oy - headRy - 1; } // head down to the grass
    if (elder) { hry += 1; hcy += 1; } // a rounder back, the head a little lower
    haunch = E(ox + 9 * g, 0, hrx, hry);
    haunch.cy = oy - haunch.ry;
    chest = E(ccx, ccy, crx, cry);
    head = E(hcx, hcy, 5 * hs, headRy);
    if (pose === 'hurt') legs.push({ x: chest.cx + chest.rx - 1, y: chest.cy, w: Math.max(2, Math.round(3 * g)), h: 2 });
  }
  // the other kinds (game/kinds.js) stand, squat, creep or fly in their own build
  // (a snail lies as it withdraws; a dove in the air is a bird in flight, not a leaping rabbit)
  /** @type {Ell[]} */
  let kindExtra = [];
  if (kind !== 'rabbit' && (!lying || kind === 'snail') && (pose !== 'hop' || kind === 'dove' || kind === 'snail' || kind in QUAD)) {
    const kb = kindBody(kind, pose, ox, oy, g, hs, bulk, preg);
    haunch = kb.haunch; chest = kb.chest; head = kb.head; snout = kb.snout; kindExtra = kb.extra;
    legs.length = 0;
    legs.push(...kb.legs);
  }
  // the muzzle: a round snout at the front of the head (a cat's is small, a fox's or a rat's long, a toad's and a salamander's hardly there)
  const mr = kind === 'rabbit' ? Math.max(1, Math.round(2.4 * hs)) : kind === 'cat' ? Math.max(1, Math.round(1.7 * hs)) : 1;
  const muzzle = snout || (kind === 'rabbit' || kind === 'cat'
    ? E(Math.min(head.cx + (kind === 'cat' ? 3.4 : 3) * hs, RABBIT_W - 2 - mr), Math.min(head.cy + (kind === 'cat' ? 1.2 : 1.5) * hs, oy - mr), mr, mr)
    : E(Math.min(head.cx + head.rx - 1, RABBIT_W - 3), head.cy + 1, 1, 1));
  /** @type {Ell[]} */
  const bulges = [];
  if (mus >= 2) bulges.push(E(chest.cx + chest.rx - 1, chest.cy + chest.ry - 2, 2 * g + 0.4, 2 * g + 0.4)); // forearm
  if (mus >= 3) {
    bulges.push(E(chest.cx - 1, chest.cy - chest.ry + 2, 3.2 * g, 2.2 * g)); // shoulder
    bulges.push(E(haunch.cx + 3 * g, haunch.cy - haunch.ry + 2.5 * g, 4.2 * g, 3 * g)); // thigh
    bulges.push(E((chest.cx + head.cx) / 2, (chest.cy - chest.ry + head.cy + head.ry) / 2 + 1, 2.4 * g, 2 * g)); // neck
  }
  bulges.push(...kindExtra);
  const parts = [haunch, chest, ...bulges, head, muzzle];

  // ears: thick, rising from the back of the crown
  const top = head.cy - head.ry;
  const ew = hs >= 0.9 ? 5 : 4;
  const droop = lying ? 0 : pose === 'sick' || (snap && snap.hp >= 2) || L.frost === 2 ? 3 : pose === 'loaf' ? 2 : 0;
  const shift = tr.has('eye3') ? 1 : 0;
  /** @type {Ear[]} */
  const ears = [];
  if (kind === 'toad' || kind === 'salamander' || kind === 'dove') {
    // no ears at all
  } else if (kind === 'snail') {
    // two eye stalks, drawn in when it withdraws
    if (head.rx >= 2) {
      const len = clamp(Math.round(6 * hs) - (droop ? 2 : 0), 3, 8);
      ears.push({ kind: 'stalk', far: true, x: head.cx - 1, y: top + 1, len, w: 1, lean: 3 });
      ears.push({ kind: 'stalk', far: false, x: head.cx + 1, y: top + 1, len: len + 1, w: 1, lean: -4 });
    }
  } else if (kind === 'badger' || kind === 'rat' || kind === 'ermine') {
    // small round ears; a rat's big, pink and thin
    const r = kind === 'rat' ? 2 : 1;
    ears.push({ kind: 'round', far: true, x: head.cx - 3 - shift, y: top + 1, len: r, w: r, lean: 0 });
    ears.push({ kind: 'round', far: false, x: head.cx - 1 - shift, y: top + 1, len: r, w: r, lean: 0 });
  } else if (kind === 'deer') {
    // long leaf-shaped ears, swept back from the crown
    const len = lying ? 3 : clamp(Math.round(5 * hs) - droop, 2, 6);
    ears.push({ kind: 'up', far: true, x: head.cx - 3 - shift, y: top + 1, len, w: 3, lean: lying ? 1 : 2 });
    ears.push({ kind: 'up', far: false, x: head.cx - 1 - shift, y: top + 1, len, w: 4, lean: lying ? 1 : 2 });
  } else if (kind === 'cat' || kind === 'fox') {
    // short pointed ears on the crown (a fox's tall); laid back flat when lying, hurt or sick
    const len = clamp(Math.round((kind === 'fox' ? 5.2 : 4) * hs) - (droop ? 1 : 0), 2, 7), w = hs >= 0.9 ? 5 : 4;
    if (lying) {
      ears.push({ kind: 'cat', far: true, x: head.cx - 4 - shift, y: top + 1, len: 2, w: 4, lean: 0 });
      ears.push({ kind: 'cat', far: false, x: head.cx - 1 - shift, y: top + 1, len: 2, w: 4, lean: 0 });
    } else {
      ears.push({ kind: 'cat', far: true, x: head.cx - 4 - shift, y: top + 1, len, w, lean: 0 });
      ears.push({ kind: 'cat', far: false, x: head.cx - 1 - shift, y: top + 1, len, w, lean: 0 });
    }
  } else if (lying) {
    const len = Math.max(3, Math.round(8 * hs * earK));
    ears.push({ kind: 'flat', far: true, x: head.cx - 2 - len, y: top - 1, len, w: 2, lean: 0 });
    ears.push({ kind: 'flat', far: false, x: head.cx - 1 - len, y: top + 1, len, w: 2, lean: 0 });
  } else {
    const kinds = look.ear === 'lop' ? ['lop', 'lop'] : look.ear === 'half' ? ['lop', 'up'] : ['up', 'up'];
    const swept = pose === 'hop' || pose === 'eat';
    for (let i = 0; i < 2; i++) {
      const far = i === 0;
      if (kinds[i] === 'lop') {
        const y = top - 1;
        ears.push({ kind: 'lop', far, x: head.cx - (far ? 5 : 3) - shift, y, len: head.cy + 4 - y, w: ew - 1, lean: 0 });
      } else {
        const base = top + 1;
        const len = clamp(Math.round((far ? 9 : 10) * hs * earK) - droop, 2, base);
        ears.push({ kind: 'up', far, x: head.cx - (far ? 5 : 2) - shift, y: base, len, w: ew, lean: droop || swept ? 2 : 4 });
      }
    }
  }

  // face and appendage anchors
  const eye = kind === 'toad' && !lying ? { x: head.cx + 1, y: head.cy - head.ry + 1 }
    : kind === 'dove' || kind === 'rat' || kind === 'ermine' || kind === 'badger' || kind === 'deer' || kind === 'fox' ? { x: head.cx + Math.max(1, Math.round(1.2 * hs)), y: head.cy - 1 }
    : kind === 'salamander' ? { x: head.cx + Math.max(1, Math.round(1.2 * hs)), y: head.cy - 1 }
      : { x: head.cx + Math.max(1, Math.round(1.6 * hs)), y: head.cy - 1 };
  const nose = { x: muzzle.cx + muzzle.rx, y: muzzle.cy - 1 };
  const tailR = Math.max(1, Math.round([1, 2, 3][look.tail === 0 || look.tail === 2 ? look.tail : 1] * Math.min(1, g + 0.25)));
  const tx = haunch.cx - haunch.rx;
  const tail = kind === 'cat' ? { x: tx + 1, y: haunch.cy - Math.max(1, haunch.ry - 2), r: 1, len: clamp(Math.round(12 * g), 4, tx - 1) }
    : kind === 'fox' ? { x: tx + 1, y: haunch.cy - 1, r: 2, len: clamp(Math.round(11 * g), 4, tx - 2) }
      : kind === 'rat' ? { x: tx + 1, y: haunch.cy + 1, r: 1, len: clamp(Math.round(14 * g), 4, tx - 1) }
        : kind === 'ermine' ? { x: tx + 1, y: haunch.cy - 1, r: 1, len: clamp(Math.round(8 * g), 3, tx - 1) }
          : kind === 'dove' ? { x: tx + 1, y: haunch.cy - 1, r: 1, len: clamp(Math.round(7 * g), 3, tx - 1) }
    : kind === 'salamander' ? { x: tx + 1, y: haunch.cy, r: 1, len: clamp(Math.round(13 * g), 4, tx - 1) }
      : { x: tx, y: haunch.cy - (lying ? 1 : 2), r: kind === 'toad' || kind === 'snail' ? 0 : kind === 'deer' || kind === 'badger' ? 1 : tailR, len: clamp(Math.round(9 * g), 3, tx - 1) };
  const prx = Math.max(2, Math.round(3 * Math.min(g, 1.1)));
  const plume = E(Math.max(prx + 2, tx - 1), tail.y - Math.max(2, Math.round(2.5 * g)), prx, Math.max(2, Math.round(2.2 * Math.min(g, 1.1))));
  const wing = lying ? { x: haunch.cx - 2, y: haunch.cy - haunch.ry - 2 } : { x: chest.cx - chest.rx - 3, y: chest.cy - chest.ry - 4 };

  // bounding box of everything static (tests and the hutch's hit boxes)
  let x0 = Math.min(haunch.cx - haunch.rx, tx - tailR) - 1;
  if (tr.has('tail-lizard') || LONG_TAIL.has(kind)) x0 = Math.min(x0, tail.x - tail.len - 1);
  if (tr.has('tail-plume')) x0 = Math.min(x0, plume.cx - plume.rx - 1);
  for (const l of legs) x0 = Math.min(x0, l.x - 1);
  let x1 = 0;
  for (const e of parts) x1 = Math.max(x1, e.cx + e.rx + 1);
  for (const l of legs) x1 = Math.max(x1, l.x + l.w);
  let y0 = top - 1;
  for (const e of ears) y0 = Math.min(y0, e.kind === 'up' || e.kind === 'cat' || e.kind === 'stalk' ? e.y - e.len : e.kind === 'round' ? e.y - 2 * e.len - 1 : e.y - 1);
  if (kind === 'dove' && pose === 'fly1') y0 = Math.min(y0, haunch.cy - haunch.ry - DOVE_WING);
  for (const e of kindExtra) y0 = Math.min(y0, e.cy - e.ry - 1);
  if (kind === 'cat' && !lying) y0 = Math.min(y0, tail.y - CAT_TAIL_RISE - 1);
  if (tr.has('ears2')) y0 = Math.min(y0, ...ears.map((e) => (e.kind === 'flat' ? e.y - 3 : y0)));
  if (hornH) y0 = Math.min(y0, top + 1 - hornH);
  if (tr.has('wings')) y0 = Math.min(y0, wing.y - 1);
  for (const l of legs) y0 = Math.min(y0, l.y - 1);
  if (tr.has('spines')) y0 = Math.min(y0, Math.min(haunch.cy - haunch.ry, chest.cy - chest.ry) - 5);

  return directAnatomy({
    kind, pose, lying, g, hs, haunch, chest, head, muzzle, bulges, parts, ears, legs,
    eye, eye3: { x: head.cx + 1, y: top + 1 }, nose, cheek: { x: eye.x, y: eye.y + 3 },
    brow: { x: head.cx - 1 - shift, y: top }, tail, plume, wing,
    back: { x0: haunch.cx - haunch.rx + 2, x1: chest.cx, y: haunch.cy - haunch.ry },
    belly: { x: chest.cx + 1, y: chest.cy + chest.ry - 2 },
    feetY: oy - 1,
    cx: Math.round((haunch.cx - haunch.rx + head.cx + head.rx) / 2),
    top: Math.max(0, y0 + 1),
    box: { x0, y0, x1, y1: oy + 1 },
  });
}

// ------------------------------------------------------------------ static body (the cached sprite)

/**
 * @typedef {{body:string, shade:string, dark:string, hi:string, rgb:number[]}} Shades
 * @typedef {Object} Paint everything a static layer needs, built once per sprite
 * @property {Pen} P
 * @property {RabbitAnchors} a
 * @property {Record<string, number>} L
 * @property {number[]} sc
 * @property {Set<string>} tr
 * @property {boolean} dead
 * @property {string|null} cause
 * @property {string} pattern
 * @property {string} eyeCol  look.eye
 * @property {number} seed
 * @property {number[]} fur   tinted coat
 * @property {Shades} C       coat
 * @property {Shades} C2      pattern colour
 */

/** @param {number[]} c */
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
/** @param {number[]} c @returns {Shades} */
const shades = (c) => ({ body: css(c), shade: css(c, 0.82), dark: css(c, 0.68), hi: css(mix(c, WHITE, 0.4)), rgb: c });

/**
 * The coat colour after every visible state (mixed in a fixed order so the
 * channels stack): teal change, sickly green, frost, death's grey, vitality's
 * warmth, a fire-3 glow; the dead are greyer, and charred by a fire death.
 * @param {number[]} c @param {Record<string, number>} L @param {number[]} sc @param {boolean} dead @param {string|null} cause
 */
function tintCoat(c, L, sc, dead, cause) {
  let o = mix(c, TEAL, [0, 0.12, 0.25, 0.4][L.transformation]);
  o = mix(o, SICK, [0, 0.22, 0.4, 0.58][L.toxicity]);
  o = mix(o, ICE, [0, 0.15, 0.35, 0.55][L.frost]);
  o = mix(o, ASH, Math.min(0.85, [0, 0.22, 0.45, 0.7][L.death] + [0, 0.1, 0.2, 0.35][sc[3]]));
  const v = [1, 1.04, 1.08, 1.12][L.vitality];
  o = [Math.min(1, o[0] * v), Math.min(1, o[1] * v), Math.min(1, o[2] * v)];
  if (L.fire === 3) o = mix(o, EMBER, 0.15);
  if (dead) {
    o = mix(o, ASH, 0.12).map((x) => x * 0.95);
    if (cause === 'fire') o = mix(o, CHAR, 0.65);
  }
  return o;
}

/** Up to n seeded points inside the body (the upper half for `upper`), stable per look.seed and pose. @param {RabbitAnchors} a @param {number} seed @param {string} label @param {number} n @param {boolean} [upper] */
function spotsOn(a, seed, label, n, upper = false) {
  const r = new Rng(hashString(`${seed}:${label}`));
  const out = [];
  for (let i = 0; i < n; i++) {
    const e = r.next() < 0.68 ? a.haunch : a.chest;
    const ang = upper ? r.range(Math.PI * 1.08, Math.PI * 1.92) : r.range(0, Math.PI * 2), rad = Math.sqrt(r.next()) * 0.72;
    out.push({ x: Math.round(e.cx + Math.cos(ang) * (e.rx - 1) * rad), y: Math.round(e.cy + Math.sin(ang) * (e.ry - 1) * rad) });
  }
  return out;
}

/**
 * Paint the static body: auras, far appendages, outline, coat, pattern,
 * marks and scars, near appendages, face, and a cause-of-death detail.
 * @param {Pen} P @param {any} look @param {any} snap @param {RabbitAnchors} a @param {boolean} low quality 'low' skips the auras
 */
function drawBody(P, look, snap, a, low) {
  if (nativeBody(P, look, snap, a)) return;
  const L = rabbitLevels(snap), sc = scarsOf(snap);
  const dead = !snap || snap.alive === false, cause = dead ? (snap && snap.cause) || 'unknown' : null;
  let coat = rgbOf(look.coat, [0.93, 0.89, 0.82]);
  let coat2 = rgbOf(look.coat2, [0.36, 0.24, 0.18]);
  // a Dutch rabbit is the darker colour, with the band and blaze in the paler
  if (look.pattern === 'dutch' && lum(coat) > lum(coat2)) [coat, coat2] = [coat2, coat];
  const kit = snap && snap.stage === 'kit';
  const fur = tintCoat(coat, L, sc, dead, cause);
  const fur2 = tintCoat(kit ? mix(coat2, coat, 0.5) : coat2, L, sc, dead, cause);
  /** @type {Paint} */
  const S = {
    P, a, L, sc, tr: traitsOf(snap), dead, cause, pattern: look.pattern || 'solid', eyeCol: look.eye || 'dark',
    seed: (look.seed >>> 0) || 1, fur, C: shades(fur), C2: shades(fur2),
  };
  if (!low && !dead) auraLayer(S);
  farLayer(S);
  for (const e of a.parts) ell(P, e, 1, K); // outline pass
  // on a fine grid, the coat keeps to the body's smooth silhouette (its patterns and shading are laid in frame pixels)
  if (P.clip && P.k) P.clip(a.parts.flatMap((e) => fineRows(e, 0, /** @type {number} */ (P.k))));
  fillLayer(S);
  patternLayer(S);
  shadeLayer(S);
  if (P.unclip) P.unclip();
  strengthMarks(S);
  if (S.tr.has('scales')) scaleMarks(S);
  coatMarks(S);
  burnMarks(S);
  acidMarks(S);
  alkaliMarks(S);
  frostMarks(S);
  sickMarks(S);
  pawLayer(S);
  nearLayer(S);
  faceLayer(S);
  if (dead) causeLayer(S);
}

/** Auras behind the body: warm vitality, violet arcana, orange heat; larger and stronger with the level. */
const AURAS = /** @type {[string, string, number[], number][]} */ ([
  ['vitality', '255,214,120', [0, 0.12, 0.22, 0.32], 2],
  ['arcana', '166,120,255', [0, 0.15, 0.3, 0.45], 1],
  ['fire', '255,122,28', [0, 0.1, 0.2, 0.35], 0],
]);
/** @param {Paint} S */
function auraLayer(S) {
  for (const [ch, rgb, alpha, grow] of AURAS) {
    const v = S.L[ch];
    if (!v) continue;
    const col = `rgba(${rgb},${alpha[v]})`;
    for (const [y, x0, x1] of rowsOf(S.a.parts, grow + v + 1)) S.P(x0, y, x1 - x0 + 1, 1, col);
  }
}

/** Behind the body: stiff legs, the far wing, the tail, the second pair of ears, the far ear and horn. @param {Paint} S */
function farLayer(S) {
  const { P, a, tr, C, C2 } = S;
  // (a fox's legs are black-stockinged, a badger's dark; a dove's are drawn with its feet)
  const legCol = a.kind === 'fox' ? FOX_LEG : S.pattern === 'points' || a.kind === 'badger' ? C2 : C;
  if (a.kind !== 'dove') {
    // (a leg drawn as runs of pixels down a slant: every outline first, so none covers the leg above it)
    for (const l of a.legs) {
      const k = P.k || 1;
      if (P.f) P.f((l.x - 0.5) * k, (l.y - 0.5) * k, (l.w + 1) * k, (l.h + 1) * k, K);
      else P(l.x - 1, l.y - 1, l.w + 2, l.h + 2, K);
    }
    for (const l of a.legs) {
      P(l.x, l.y, l.w, l.h, legCol.body);
      if (!l.seg || l.foot) P(l.x, l.y + l.h - 1, l.w, 1, legCol.shade);
    }
  }
  if (tr.has('wings')) wingArt(S, true);
  tailLayer(S);
  if (tr.has('ears2')) for (const e of a.ears) {
    const x = { ...e, x: e.kind === 'flat' ? e.x + 1 : e.x - 2, y: e.kind === 'flat' ? e.y - 2 : e.y, len: Math.max(2, e.len - 2) };
    earArt(S, x, 'extra');
  }
  for (const e of a.ears) if (e.far) earArt(S, e, 'far');
  hornArt(S, true);
}

/** @param {Paint} S */
function tailLayer(S) {
  const { P, a, tr, C2 } = S, t = a.tail;
  if ((a.kind === 'toad' || a.kind === 'snail') && !tr.has('tail-lizard') && !tr.has('tail-plume')) return;
  const own = !tr.has('tail-lizard') && !tr.has('tail-plume');
  if (own && a.kind === 'fox') {
    // a full brush: thick, drooping a little, white at the tip
    const n = t.len;
    const pts = [];
    for (let i = 0; i < n; i++) { const u = i / Math.max(1, n - 1); pts.push([t.x - i, t.y + Math.round(u * u * 3) - (a.lying ? 0 : 1), Math.max(2, Math.round(4 - Math.abs(u - 0.55) * 3))]); }
    for (const [x, y, th] of pts) P(x, y - 1 - (th >> 1), 1, th + 2, K);
    pts.forEach(([x, y, th], i) => { P(x, y - (th >> 1), 1, th, i >= n - 3 ? C2.body : S.C.body); if (i < n - 3) P(x, y - (th >> 1) + th - 1, 1, 1, S.C.shade); });
    return;
  }
  if (own && (a.kind === 'rat' || a.kind === 'ermine')) {
    // a rat's long bare pink tail curving down to the ground; an ermine's short one, black at the tip
    const n = t.len, rat = a.kind === 'rat', drop = rat ? Math.max(0, a.feetY - t.y) : 0;
    const pts = [];
    for (let i = 0; i < n; i++) { const u = i / Math.max(1, n - 1); pts.push([t.x - i, t.y + (rat ? Math.round(Math.min(1, u * 1.6) * drop) : -Math.round(u * 2))]); }
    const th = rat ? 1 : 2;
    for (const [x, y] of pts) P(x, y - 1, 1, th + 2, K);
    pts.forEach(([x, y], i) => P(x, y, 1, th, rat ? (i < 2 ? S.C.body : '#e8a8a8') : i >= n - 2 ? '#1a1218' : S.C.body));
    return;
  }
  if (own && a.kind === 'dove') {
    // tail feathers fanning back from the rump, barred dark at their ends
    const n = t.len;
    for (let i = 0; i < n; i++) {
      const th = Math.max(1, 3 - Math.floor(i / 3)), y = t.y - (th >> 1) + Math.round(i * 0.3);
      P(t.x - i, y - 1, 1, th + 2, K);
      P(t.x - i, y, 1, th, i >= n - 2 ? C2.body : S.C.shade);
    }
    return;
  }
  if (a.kind === 'cat' && !tr.has('tail-lizard') && !tr.has('tail-plume')) {
    // a long tail: out behind, curling up at its end (lying along the straw when lying down)
    const n = t.len, pts = [];
    for (let i = 0; i < n; i++) {
      const u = i / Math.max(1, n - 1);
      const dy = a.lying ? Math.round(u * 2) : -Math.round(CAT_TAIL_RISE * Math.max(0, (u - 0.35) / 0.65) ** 1.4) + Math.round(Math.sin(u * Math.PI) * 1.5);
      pts.push([t.x - i, t.y + dy]);
    }
    for (const [x, y] of pts) P(x - 1, y - 1, 3, 4, K);
    const tip = S.pattern === 'tabby' ? C2.body : S.pattern === 'points' ? C2.body : S.C.body;
    pts.forEach(([x, y], i) => {
      const ring = S.pattern === 'tabby' && i % 3 === 2;
      P(x, y, 1, 2, i >= n - 2 ? tip : ring ? C2.body : S.C.body);
      if (!ring && i < n - 2) P(x, y + 1, 1, 1, S.C.shade);
    });
    return;
  }
  if (tr.has('tail-lizard') || a.kind === 'salamander') {
    const scaly = tr.has('tail-lizard');
    // a tapering scaly tail, 3px at the root to 1px, sloping down to the straw
    const n = t.len, drop = Math.max(0, a.feetY - 2 - t.y) * (a.kind === 'salamander' ? 0.3 : 1);
    // (a salamander's own tail is its body's colour, blotched like its back)
    const body = scaly ? css(mix(S.fur, [0.42, 0.58, 0.38], 0.45), 0.8) : S.C.body, dark = scaly ? css(mix(S.fur, [0.42, 0.58, 0.38], 0.45), 0.6) : S.C.dark;
    const cols = [];
    for (let i = 0; i < n; i++) cols.push([t.x - i, t.y - 1 + Math.round((drop * i) / n), i < n / 3 ? 3 : i < (2 * n) / 3 ? 2 : 1]);
    for (const [x, y, th] of cols) P(x, y - 1, 1, th + 2, K);
    P(t.x - n, cols[n - 1][1], 1, 1, K);
    const r = new Rng(hashString(`${S.seed}:tailspots`));
    for (const [x, y, th] of cols) {
      P(x, y, 1, th, body);
      if (!scaly && S.pattern === 'blotched' && r.chance(0.35)) P(x, y, 1, Math.max(1, th - 1), C2.body);
      else if ((x + y) & 1) P(x, y + th - 1, 1, 1, dark);
    }
    return;
  }
  if (tr.has('tail-plume')) {
    // a plume raised over the back, pale-tipped
    const e = a.plume;
    ell(P, e, 1, K);
    ell(P, e, 0, C2.body);
    P(e.cx - e.rx + 1, e.cy - e.ry, 2, 1, C_CREAM); P(e.cx - e.rx, e.cy - 1, 1, 2, C_CREAM); P(e.cx, e.cy - e.ry, 1, 1, C2.hi);
    return;
  }
  const e = { cx: t.x, cy: t.y, rx: t.r, ry: t.r };
  ell(P, e, 1, K);
  const p = S.pattern;
  ell(P, e, 0, p === 'points' || p === 'spotted' || p === 'dapple' ? C2.body : p === 'agouti' || p === 'dutch' || p === 'badger' ? S.C.dark : css(mix(S.fur, WHITE, 0.6)));
  if (e.rx > 1) P(e.cx - 1, e.cy - e.rx + 1, 1, 1, 'rgba(255,255,255,0.35)');
}

/**
 * One ear. Tips carry rime (live frost) over the marks: blackened by old
 * burns, blue with frostbite.
 * @param {Paint} S @param {Ear} e @param {'near'|'far'|'extra'} side
 */
function earArt(S, e, side) {
  const { P, L, sc } = S;
  const base = S.pattern === 'hooded' || S.pattern === 'points' || S.pattern === 'spotted' ? S.C2 : S.C;
  const rgb = sc[3] >= 2 ? mix(base.rgb, GREY, 0.5) : base.rgb;
  const fill = css(rgb, side === 'near' ? 1 : side === 'far' ? 0.82 : 0.68);
  const inner = side !== 'near' ? null : S.dead ? '#c8a0b0' : C_PINK, inner2 = S.dead ? '#b08898' : C_EAR;
  /** colours of the rows from the tip down */
  const tips = [];
  if (!S.dead) for (let i = 0; i < L.frost; i++) tips.push(C_RIME);
  const markN = sc[0] >= 2 ? sc[0] : sc[2];
  for (let i = 0; i < markN; i++) tips.push(sc[0] >= 2 ? C_SOOT : PAL.frost0);
  if (e.kind === 'round') {
    // a small round ear above the crown, pink inside (a rat's thin and pink all through)
    const r = e.len, cy = e.y - r;
    ell(P, { cx: e.x, cy, rx: r, ry: r }, 1, K);
    ell(P, { cx: e.x, cy, rx: r, ry: r }, 0, S.a.kind === 'rat' ? '#e8a8b0' : fill);
    if (inner && r > 1) P(e.x, cy, 1, 1, inner2);
    else if (inner && S.a.kind !== 'badger') P(e.x, cy, 1, 1, inner);
    if (S.a.kind === 'badger') P(e.x - r, cy - r, 2 * r + 1, 1, css([0.95, 0.94, 0.9]));
    return;
  }
  if (e.kind === 'stalk') {
    // a snail's eye stalk, an eye bead at its tip
    let x = e.x;
    for (let i = 0; i < e.len; i++) {
      if (i && i % Math.abs(e.lean) === 0) x += e.lean < 0 ? 1 : -1;
      P(x - 1, e.y - i, 3, 1, K);
    }
    x = e.x;
    for (let i = 0; i < e.len; i++) {
      if (i && i % Math.abs(e.lean) === 0) x += e.lean < 0 ? 1 : -1;
      P(x, e.y - i, 1, 1, css(S.fur, side === 'near' ? 1 : 0.82));
    }
    P(x - 1, e.y - e.len, 2, 2, S.L.arcana >= 2 ? C_RUNE_HI : K);
    return;
  }
  if (e.kind === 'cat') {
    // a pointed ear: narrowing to its tip, the near one lined in pink
    for (let i = 0; i < e.len; i++) {
      const y = e.y - i, w = Math.max(1, Math.round(e.w * (1 - i / e.len))), x = e.x + Math.floor((e.w - w) / 2);
      P(x - 1, y, w + 2, 1, K);
      if (i === e.len - 1) { P(x - 1, y - 1, w + 2, 1, K); }
      P(x, y, w, 1, tips[e.len - 1 - i] || fill);
      if (inner && w >= 3 && i < e.len - 1 && !tips[e.len - 1 - i]) P(x + 1, y, w - 2, 1, inner);
    }
    return;
  }
  if (e.kind === 'up') {
    // a rounded tip; the near ear lined in pink from its base to below the tip
    for (let i = 0; i < e.len; i++) {
      const y = e.y - i, x = e.x - Math.floor(i / e.lean), fromTip = e.len - 1 - i;
      if (fromTip === 0) { P(x + 1, y, e.w - 2, 1, K); continue; }
      P(x, y, e.w, 1, K);
      const tip = tips[fromTip - 1];
      P(x + 1, y, e.w - 2, 1, tip || fill);
      if (tip) continue;
      if (fromTip === 1 && e.w > 4) { P(x + 1, y, 1, 1, K); P(x + e.w - 2, y, 1, 1, K); continue; }
      if (inner && i > 0 && fromTip > 1) {
        P(x + e.w - 3, y, e.w > 4 ? 2 : 1, 1, inner);
        if (e.w > 4 && fromTip > 2 && i > 1) P(x + e.w - 3, y, 1, 1, inner2);
      } else if (side === 'far' && e.w > 4 && fromTip > 1) P(x + e.w - 2, y, 1, 1, css(rgb, 0.68));
    }
  } else if (e.kind === 'lop') {
    P(e.x, e.y, e.w, e.len - 1, K);
    P(e.x + 1, e.y + e.len - 1, e.w - 2, 1, K);
    P(e.x + 1, e.y + 1, e.w - 2, e.len - 2, fill);
    if (side === 'near') P(e.x + 1, e.y + 1, 1, Math.max(1, e.len - 3), base.shade);
    for (let i = 0; i < tips.length && i < e.len - 2; i++) P(e.x + 1, e.y + e.len - 2 - i, e.w - 2, 1, tips[i]);
  } else {
    // lying back along the neck, tip to the left: tapered, and open where it
    // joins the head so it reads as an ear, not a box
    P(e.x + 1, e.y - 1, e.len, 1, K);
    P(e.x, e.y, 1, e.w, K);
    P(e.x - 1, e.y + e.w - 1, 1, 1, K);
    P(e.x, e.y + e.w, e.len + 1, 1, K);
    P(e.x + 1, e.y, e.len, e.w, fill);
    P(e.x + 1, e.y, 1, 1, css(rgb, 0.68));
    if (inner && e.len > 4) P(e.x + 3, e.y + e.w - 1, Math.max(1, e.len - 6), 1, inner);
    for (let i = 0; i < tips.length && i < e.len - 1; i++) P(e.x + 1 + i, e.y, 1, e.w, tips[i]);
  }
}

/** Horns, antlers or a spiral horn at the crown; the far one darker and further back. @param {Paint} S @param {boolean} far */
function hornArt(S, far) {
  const { P, a, tr } = S;
  if (tr.has('unihorn')) {
    if (!far) stamp(P, UNIHORN, a.head.cx - 1, a.brow.y + 2 - UNIHORN.length, { k: K, w: C_CREAM, y: C_GOLD });
    return;
  }
  const grid = tr.has('antlers') ? ANTLERS : tr.has('horns') ? HORNS : null;
  if (!grid) return;
  const pal = grid === ANTLERS
    ? (far ? { k: K, a: '#a8743f', A: '#6d4527' } : { k: K, a: '#c48a5c', A: '#8a5a31' })
    : (far ? { k: K, h: PAL.parch1, H: PAL.parch0 } : { k: K, h: PAL.parch2, H: '#a8743f' });
  // the root (column 3 of either grid) sits on the crown, the bottom row sunk into the head
  stamp(P, grid, a.brow.x - 3 - (far ? 3 : 0), a.brow.y + (far ? 1 : 2) - grid.length, pal);
}

/** Membrane wings on the shoulders, folded flat when lying. @param {Paint} S @param {boolean} far */
function wingArt(S, far) {
  const pal = far ? { k: K, m: '#7a5ac8', M: '#5a3aa8' } : { k: K, m: '#b491ee', M: PAL.magic };
  stamp(S.P, S.a.lying ? WING_FOLD : WING, S.a.wing.x - (far ? 2 : 0), S.a.wing.y - (far ? 1 : 0), pal);
}

/** Coat fill: haunch, chest, muscles, shade, belly, head and feet. @param {Paint} S */
function fillLayer(S) {
  const { P, a, C, C2 } = S, h = a.haunch;
  if (a.kind === 'snail') {
    // the foot, the head, then the shell over them
    ell(P, a.chest, 0, C.body);
    ell(P, a.head, 0, C.body);
    for (const b of a.bulges) ell(P, b, 0, C.body);
    ell(P, h, 1, K);
    ell(P, h, 0, C2.body);
    return;
  }
  ell(P, h, 0, C.body);
  ell(P, a.chest, 0, C.body);
  for (const b of a.bulges) ell(P, b, 0, C.body);
  ell(P, { cx: h.cx, cy: h.cy + Math.round(h.ry / 2), rx: Math.max(1, h.rx - 2), ry: Math.max(1, Math.round(h.ry / 3)) }, 0, C.shade);
  if (a.kind === 'rabbit') ell(P, { cx: a.belly.x, cy: a.belly.y, rx: Math.max(1, Math.round(3 * a.g)), ry: Math.max(1, Math.round(2 * a.g)) }, 0, C.hi);
  ell(P, a.head, 0, S.pattern === 'hooded' ? C2.body : S.pattern === 'badger' ? BADGER_FACE : C.body);
  // the muzzle: the Dutch blaze, paler on agouti and plain coats, the points' dark nose
  const m = a.muzzle;
  ell(P, m, 0, S.pattern === 'dutch' || S.pattern === 'hooded' || S.pattern === 'fox' || S.pattern === 'ermine' ? C2.body : S.pattern === 'badger' ? BADGER_FACE : a.kind === 'dove' ? C_BEAK : C.body);
  if ((S.pattern === 'agouti' || S.pattern === 'solid') && a.kind === 'rabbit') ell(P, { cx: m.cx, cy: m.cy + 1, rx: Math.max(1, m.rx - 1), ry: Math.max(1, m.ry - 1) }, 0, C.hi);
  if (S.pattern === 'spotted' && (S.seed % 3) === 0) ell(P, { cx: a.eye.x, cy: a.eye.y, rx: 2, ry: 2 }, 0, C2.body); // an eye patch
}

/** Outlined paws on the straw: the long hind foot under the haunch and a forepaw under the chest. @param {Paint} S */
function pawLayer(S) {
  const { P, a, C, C2 } = S;
  if (a.lying || a.pose === 'hop') return;
  if (a.kind === 'snail') return;
  if (a.kind === 'dove') {
    // thin pink legs and spread toes
    for (const l of a.legs) {
      P(l.x, l.y, 1, l.h + 1, C_FOOT);
      P(l.x - 1, a.feetY, 3, 1, C_FOOT); P(l.x + 2, a.feetY, 1, 1, '#b05060');
    }
    return;
  }
  if (a.kind !== 'rabbit' && a.kind !== 'toad') {
    // a little paw (a deer's dark hoof) at the foot of each leg (the loaf's are tucked under it)
    const col = a.kind === 'fox' ? FOX_LEG : a.kind === 'badger' ? C2 : S.pattern === 'points' || S.pattern === 'dutch' ? C2 : C;
    // a salamander's splayed legs show in front of its low belly
    if (a.kind === 'salamander') a.legs.forEach((l, i) => { if (i & 1) { P(l.x - 1, l.y, l.w + 2, l.h + 1, K); P(l.x, l.y, l.w, l.h, C.body); } });
    for (const l of a.legs) {
      if (l.seg && !l.foot) continue;
      // a planted paw on the ground; a lifted one where its leg ends
      const fy = Math.min(a.feetY, l.y + l.h);
      if (fy < a.feetY - 3) continue;
      const w = a.kind === 'salamander' ? 4 : a.kind === 'deer' ? 2 : 3, x = a.kind === 'salamander' ? l.x - 1 : a.kind === 'deer' ? l.x : l.x;
      P(x - 1, fy, w + 2, 2, K);
      P(x, fy, w, 1, a.kind === 'deer' ? '#3a2a20' : col.shade);
      if (a.kind === 'badger') P(x + w, fy, 1, 1, C_CREAM); // claws
      if (a.kind === 'salamander') P(x + (w >> 1), fy, 1, 1, K); // splayed toes
    }
    if (a.kind !== 'salamander' && a.kind !== 'deer' && (a.pose === 'loaf' || a.pose === 'sick')) { P(a.chest.cx + 2, a.feetY, 4, 1, K); P(a.chest.cx + 2, a.feetY - 1, 3, 1, col.shade); }
    return;
  }
  if (a.kind === 'toad') {
    // the big webbed hind foot under the folded leg, the forefoot splayed in front
    const y = a.feetY;
    const hx = a.haunch.cx - 1;
    P(hx - 1, y - 1, 8, 3, K); P(hx, y, 6, 1, C.shade); P(hx + 1, y - 1, 1, 1, K); P(hx + 4, y - 1, 1, 1, K);
    const fx = a.legs.length ? a.legs[0].x : a.chest.cx + 2;
    P(fx - 1, y, 5, 2, K); P(fx, y, 3, 1, C.shade);
    return;
  }
  const foot = S.pattern === 'points' ? C2 : S.pattern === 'dutch' ? C2 : C, y = a.feetY - 1;
  const paw = (x, w) => { P(x - 1, y, 1, 2, K); P(x, y - 1, w, 1, K); P(x + w, y, 1, 2, K); P(x, y, w, 1, foot.shade); P(x, y + 1, w, 1, foot.dark); };
  const hw = Math.max(3, Math.round(6 * a.g)), hx = a.haunch.cx - Math.round(a.g);
  paw(hx, hw);
  P(hx - 1, y + 2, hw + 2, 1, K);
  if (a.pose === 'rear' || a.pose === 'hurt') return;
  const fw = Math.max(2, Math.round(3 * a.g)), fx = Math.min(a.chest.cx + Math.round(a.chest.rx * 0.3), a.head.cx + a.head.rx - fw);
  paw(fx, fw);
  P(fx - 1, y + 2, fw + 2, 1, K);
}

/**
 * Volume and fur: each body part lit from the upper left — a dithered
 * sheen on its crown, shade on its underside and rim, and a sparse fur
 * texture — laid as translucent rects over coat and pattern alike.
 * @param {Paint} S
 */
function shadeLayer(S) {
  const { P, a } = S;
  const lit = 'rgba(255,250,235,0.28)', fur = 'rgba(40,24,16,0.14)', shade = 'rgba(40,22,12,0.22)', deep = 'rgba(30,16,8,0.32)';
  for (const e of [a.haunch, a.chest, a.head]) {
    for (let yy = -e.ry; yy <= e.ry; yy++) {
      const w = half(e, yy), y = e.cy + yy, t = (yy + e.ry) / Math.max(1, 2 * e.ry);
      for (let x = e.cx - w; x <= e.cx + w; x++) {
        const b = bayer(x, y), u = (x - (e.cx - w)) / Math.max(1, 2 * w);
        if (t < 0.32 && u > 0.25 && u < 0.8 && b < 9 - t * 20) P(x, y, 1, 1, lit);
        else if (t > 0.72 && b < (t - 0.62) * 34) P(x, y, 1, 1, t > 0.88 ? deep : shade);
        else if (u < 0.12 && b < 8) P(x, y, 1, 1, shade);
        else if (b === 3 && (y & 1)) P(x, y, 1, 1, fur);
      }
    }
  }
}

/** Dutch band, spots and agouti ticking (hooded and points colour their parts as they are drawn). @param {Paint} S */
function patternLayer(S) {
  const { P, a, C2 } = S, body = [a.haunch, a.chest];
  if (S.pattern === 'tabby') {
    // a cat's stripes: dark bars down from the spine, a striped brow, a paler belly
    const [x0, x1] = xRange(body);
    for (let x = x0 + 1; x <= x1; x++) {
      if (mod(x + (S.seed & 3), 4) > 1) continue;
      const y0 = colEdge(body, x, -1), y1 = colEdge(body, x, 1);
      if (y0 === null || y1 === null) continue;
      const len = Math.max(1, Math.round((y1 - y0) * 0.55));
      P(x, y0, 1, len, C2.body);
    }
    for (const [y, l, r] of rowsOf(body)) if (y >= a.chest.cy + 2) P(l + 1, y, Math.max(0, r - l - 1), 1, css(mix(S.fur, [1, 0.95, 0.85], 0.35)));
    const h = a.head;
    P(h.cx - 1, h.cy - h.ry + 1, 1, 2, C2.body); P(h.cx + 1, h.cy - h.ry + 1, 1, 1, C2.body);
    return;
  }
  if (S.pattern === 'dapple') {
    // a fawn's white spots in rows along its back, and a pale belly
    const [x0, x1] = xRange(body);
    for (let x = x0 + 2; x <= x1 - 1; x += 3) {
      const y0 = colEdge(body, x, -1);
      if (y0 === null) continue;
      P(x, y0 + 1, 1, 1, C2.body);
      if (((x / 3) | 0) & 1) P(x + 1, y0 + 3, 1, 1, C2.body);
    }
    for (const [y, l, r] of rowsOf(body)) if (y >= a.chest.cy + 2) P(l + 1, y, Math.max(0, r - l - 1), 1, css(mix(S.fur, [1, 0.95, 0.88], 0.5)));
    return;
  }
  if (S.pattern === 'badger') {
    // a dark underside; the white face with a black stripe back through each eye
    for (const [y, l, r] of rowsOf(body)) if (y >= a.haunch.cy + 1) P(l, y, r - l + 1, 1, C2.shade);
    const h = a.head, ey = a.eye.y;
    for (let y = ey - 1; y <= ey + 1; y++) { const s = spanOf(h, y); if (s) P(s[0], y, Math.max(1, a.eye.x + 1 - s[0]), 1, C2.body); }
    return;
  }
  if (S.pattern === 'fox' || S.pattern === 'ermine' || (a.kind === 'rat' && S.pattern === 'solid')) {
    // a white throat, chest and belly (a rat's only paler)
    for (const [y, l, r] of rowsOf([a.chest])) if (y >= a.chest.cy) P(l + 1, y, Math.max(0, r - l - 1), 1, C2.body);
    for (const [y, l, r] of rowsOf([a.haunch])) if (y >= a.haunch.cy + Math.max(1, a.haunch.ry - 2)) P(l + 2, y, Math.max(0, r - l - 3), 1, C2.body);
    const h = a.head;
    for (let y = h.cy + 1; y <= h.cy + h.ry; y++) { const s = spanOf(h, y); if (s) P(Math.max(s[0], h.cx), y, s[1] - Math.max(s[0], h.cx) + 1, 1, C2.body); }
    return;
  }
  if (S.pattern === 'dove') {
    // the folded wing over its side, two dark bars across it; a shimmer on the neck
    const h = a.haunch;
    if (a.pose !== 'fly1' && a.pose !== 'fly2' && a.pose !== 'hop') {
      const w = { cx: h.cx + 1, cy: h.cy - 1, rx: Math.max(2, h.rx - 1), ry: Math.max(1, h.ry - 2) };
      ell(P, w, 0, S.C.shade);
      P(w.cx - 1, w.cy - 1, 1, w.ry + 1, C2.body); P(w.cx + 2, w.cy - 1, 1, w.ry + 1, C2.body);
    }
    const nx = Math.round((a.chest.cx + a.head.cx) / 2), ny = a.head.cy + a.head.ry;
    P(nx, ny, 1, 1, C_NECK[0]); P(nx + 1, ny + 1, 1, 1, C_NECK[1]);
    return;
  }
  if (S.pattern === 'spiral') {
    // the shell's whorl: a ring and a darker eye in its middle, and growth lines
    const h = a.haunch, r2x = Math.max(1, Math.round(h.rx * 0.55)), r2y = Math.max(1, Math.round(h.ry * 0.55));
    for (let yy = -r2y; yy <= r2y; yy++) {
      const w = half({ rx: r2x, ry: r2y }, yy);
      P(h.cx - w, h.cy + yy, 1, 1, C_SHELL_LINE); P(h.cx + w, h.cy + yy, 1, 1, C_SHELL_LINE);
    }
    P(h.cx - r2x, h.cy - r2y, 2 * r2x + 1, 1, C_SHELL_LINE);
    P(h.cx, h.cy, 1, 1, C2.dark); P(h.cx - 1, h.cy, 1, 1, C_SHELL_LINE);
    P(h.cx - h.rx + 1, h.cy + 1, 1, Math.max(1, h.ry - 2), C2.hi);
    return;
  }
  if (S.pattern === 'warts' || S.pattern === 'blotched') {
    // a toad's warts (dark, each with a pale glint) or a salamander's bright blotches, on the head too
    const warts = S.pattern === 'warts';
    const r = new Rng(hashString(`${S.seed}:${S.pattern}`)), n = warts ? 12 : 6;
    const parts = [a.haunch, a.chest, a.head];
    for (let i = 0; i < n; i++) {
      const e = parts[i % 3 === 2 && !warts ? 2 : i % 2];
      const ang = r.range(0, Math.PI * 2), rad = Math.sqrt(r.next()) * 0.7;
      const px = Math.round(e.cx + Math.cos(ang) * e.rx * rad), py = Math.round(e.cy + Math.sin(ang) * e.ry * rad);
      if (warts) { P(px, py, 1, 1, C2.body); if (r.chance(0.5)) P(px - 1, py - 1, 1, 1, S.C.hi); continue; }
      const w = 1 + r.int(1, 2), hh = 1 + r.int(0, 1);
      for (let yy = 0; yy < hh; yy++) {
        const s = spanOf(e, py + yy);
        if (!s) continue;
        const l = Math.max(s[0], px), rr = Math.min(s[1], px + w - 1);
        if (rr >= l) P(l, py + yy, rr - l + 1, 1, C2.body);
      }
    }
    if (warts) for (const [y, l, rr] of rowsOf(body)) if (y >= a.chest.cy + 2) P(l + 1, y, Math.max(0, rr - l - 1), 1, css(mix(S.fur, [0.95, 0.9, 0.7], 0.4)));
    return;
  }
  if (S.pattern === 'dutch') {
    // the pale band: the chest and shoulders forward of a seam slanting back toward the belly
    const seam = a.chest.cx - Math.round(a.chest.rx * 0.5), y0 = a.chest.cy - a.chest.ry;
    for (const [y, x0, x1] of rowsOf(body)) {
      const l = Math.max(x0, seam - Math.round((y - y0) * 0.4));
      if (x1 >= l) P(l, y, x1 - l + 1, 1, C2.body);
    }
  } else if (S.pattern === 'spotted') {
    // a few big blotches, mostly on the haunch
    const r = new Rng(hashString(`${S.seed}:spots`)), n = 3 + r.int(0, 1);
    for (let i = 0; i < n; i++) {
      const e = i === 0 ? a.chest : a.haunch;
      const ang = r.range(0, Math.PI * 2), rad = Math.sqrt(r.next()) * 0.55;
      const px = Math.round(e.cx + Math.cos(ang) * e.rx * rad), py = Math.round(e.cy + Math.sin(ang) * e.ry * rad);
      const b = { rx: Math.max(1, Math.round(r.range(2.2, 3.6) * a.g)), ry: Math.max(1, Math.round(r.range(1.6, 2.6) * a.g)) };
      for (let yy = -b.ry; yy <= b.ry; yy++) {
        const s = spanOf(e, py + yy);
        if (!s) continue;
        const w = half(b, yy), l = Math.max(s[0], px - w), rr = Math.min(s[1], px + w);
        if (rr >= l) P(l, py + yy, rr - l + 1, 1, C2.body);
      }
    }
  } else if (S.pattern === 'agouti') {
    // a cream underside, and ticking along the back
    for (const [y, x0, x1] of rowsOf(body)) if (y >= a.chest.cy + 1) {
      const l = Math.max(x0, a.chest.cx - a.chest.rx), r = x1 - 1;
      if (r >= l) P(l, y, r - l + 1, 1, css(mix(S.fur, [1, 0.94, 0.82], 0.45)));
    }
    const tick = css(S.fur, 1.15), dark = css(S.fur, 0.8);
    const [x0, x1] = xRange(body);
    for (let x = x0; x <= x1; x++) {
      const y0 = colEdge(body, x, -1);
      if (y0 === null) continue;
      for (let y = y0; y < y0 + 3; y++) { const b = bayer(x, y); if (b < 5) P(x, y, 1, 1, tick); else if (b > 13) P(x, y, 1, 1, dark); }
    }
  }
}

/** Strength: the thigh line (1), quads, shoulder light and forearm (2), veins and cuts on a hulking frame (3). @param {Paint} S */
function strengthMarks(S) {
  const { P, a, C } = S, s = S.L.strength, h = a.haunch, c = a.chest;
  if (!s) return;
  const ry = Math.max(2, h.ry - 1), rx = Math.max(2, h.rx - 3);
  for (let yy = -ry + 1; yy <= ry - 2; yy++) P(h.cx + Math.round(rx * 0.6 * Math.sqrt(1 - (yy * yy) / (ry * ry))), h.cy + yy, 1, 1, C.dark);
  if (s < 2) return;
  for (let i = 0; i < 3; i++) { P(h.cx - 4 + i, h.cy - 1 + i, 1, 1, C.dark); P(h.cx - 1 + i, h.cy - 3 + i, 1, 1, C.dark); }
  P(c.cx - 2, c.cy - c.ry + 1, 4, 1, C.hi);
  const f = a.bulges[0];
  if (f) P(f.cx, f.cy - f.ry + 1, 1, 1, C.hi);
  if (s < 3) return;
  const vein = css(S.fur, 0.6);
  P(c.cx + 1, c.cy, 1, 2, vein); P(c.cx + 2, c.cy + 2, 1, 1, vein);
  for (let i = 0; i < 3; i++) P(h.cx - 5 + i * 3, h.cy - h.ry + 2, 1, 2, C.dark);
  if (a.bulges[1]) P(a.bulges[1].cx - 1, a.bulges[1].cy - a.bulges[1].ry + 1, 3, 1, C.hi);
}

/** Scaly haunches: staggered scale arcs over the rear of the haunch. @param {Paint} S */
function scaleMarks(S) {
  const { P, a } = S, h = a.haunch;
  const dk = css(mix(S.fur, [0.35, 0.55, 0.4], 0.35), 0.72), hi = css(mix(S.fur, [0.6, 0.85, 0.6], 0.3), 1.12);
  for (let y = h.cy - h.ry + 2, row = 0; y <= h.cy + h.ry - 2; y += 2, row++) {
    const s = spanOf(h, y);
    if (!s) continue;
    for (let x = s[0] + 1 + (row & 1) * 2; x <= Math.min(s[1] - 2, h.cx + Math.round(h.rx / 2)); x += 4) { P(x, y, 2, 1, dk); P(x, y - 1, 1, 1, hi); }
  }
}

/** Vitality's gleam and golden rim, transformation's teal flecks, rune tattoos, grey hairs. @param {Paint} S */
function coatMarks(S) {
  const { P, a, L, sc } = S, body = [a.haunch, a.chest];
  if (!S.dead && L.vitality >= 1) for (let x = a.back.x0 + 1; x < a.back.x1; x++) {
    const y = colEdge(body, x, -1);
    if (y !== null) P(x, y + 1, 1, 1, S.C.hi);
  }
  if (!S.dead && L.vitality >= 3) for (const [y, , x1] of rowsOf([a.haunch, a.chest, ...a.bulges])) {
    const hs = spanOf(a.head, y, 1);
    if (!hs || x1 < hs[0]) P(x1, y, 1, 1, C_GOLD);
  }
  if (L.transformation >= 2) for (const p of spotsOn(a, S.seed, 'teal', L.transformation === 3 ? 6 : 3)) P(p.x, p.y, 1, 1, C_SHIM);
  if (sc[4] >= 1) {
    const r = new Rng(hashString(`${S.seed}:rune`)), h = a.haunch;
    stamp(P, RUNES[r.int(0, 3)], h.cx - 1 - Math.round(h.rx / 3), h.cy - 1, { x: C_RUNE });
    if (sc[4] >= 2) stamp(P, RUNES[r.int(0, 3)], a.chest.cx - 2, a.chest.cy - 1, { x: C_RUNE });
    if (sc[4] >= 3) for (const p of spotsOn(a, S.seed, 'stars', 5)) P(p.x, p.y, 1, 1, C_RUNE_HI);
  }
  if (sc[3] >= 3) for (const p of spotsOn(a, S.seed, 'grey', 6, true)) P(p.x, p.y, 2, 1, '#c8c2cc');
}

/** Old burns (singe clusters, a charred patch) and live embers in the fur. @param {Paint} S */
function burnMarks(S) {
  const { P, a, sc } = S;
  for (const p of spotsOn(a, S.seed, 'singe', [0, 3, 7, 12][sc[0]], true)) { P(p.x, p.y, 1, 1, C_SINGE); P(p.x + 1, p.y, 1, 1, C_SINGE2); }
  if (sc[0] >= 3) { const h = a.haunch; P(h.cx - 2, h.cy - h.ry + 1, 4, 3, C_SOOT); P(h.cx - 2, h.cy - h.ry + 1, 4, 1, C_SINGE); }
  const f = S.dead ? 0 : S.L.fire;
  if (f >= 2) for (const p of spotsOn(a, S.seed, 'embers', f === 3 ? 5 : 3, true)) { P(p.x, p.y, 1, 1, '#ff7a1c'); if (f === 3) P(p.x, p.y - 1, 1, 1, '#ffb444'); }
}

/** The raw spots live acid has opened (shared with the steam overlay). @param {number} seed @param {RabbitAnchors} a */
const acidSpots = (seed, a) => spotsOn(a, seed, 'acid', 5);

/** Bald pink acid scars, and raw blisters while acid is acting. @param {Paint} S */
function acidMarks(S) {
  const { P, a } = S;
  for (const p of spotsOn(a, S.seed, 'burns', [0, 2, 4, 7][S.sc[1]])) { const w = 2 + (p.x & 1); P(p.x, p.y, w + 1, 3, C_BURN_RIM); P(p.x, p.y, w, 2, C_BURN); }
  const v = S.dead ? 0 : S.L.acid;
  for (const p of acidSpots(S.seed, a).slice(0, [0, 1, 3, 5][v])) {
    P(p.x - 1, p.y - 1, 3, 3, C_BURN_RIM); P(p.x, p.y, 1, 1, v === 3 ? C_RUBY : C_RAW); P(p.x - 1, p.y - 1, 1, 1, C_ACID);
  }
}

/** Alkali: chalk specks (1), a chalky bloom on the back and paws (2), crust plates (3). @param {Paint} S */
function alkaliMarks(S) {
  const { P, a } = S, v = S.dead ? 0 : S.L.alkali, body = [a.haunch, a.chest];
  if (!v) return;
  for (const p of spotsOn(a, S.seed, 'chalk', 4)) P(p.x, p.y, 1, 1, C_CHALK);
  if (v >= 2) {
    const [x0, x1] = xRange(body);
    for (let x = x0; x <= x1; x++) {
      const y0 = colEdge(body, x, -1);
      if (y0 === null) continue;
      for (let y = y0; y < y0 + 3; y++) { const b = bayer(x, y); if (b < 3) P(x, y, 1, 1, C_CHALK); else if (b > 13) P(x, y, 1, 1, C_CHALK2); }
    }
    if (!a.lying) { P(a.chest.cx - Math.round(5 * a.g), a.feetY, 3, 1, C_CHALK); P(a.haunch.cx - Math.round(6 * a.g), a.feetY, 3, 1, C_CHALK); }
  }
  if (v >= 3) for (const p of spotsOn(a, S.seed, 'crust', 4, true)) { P(p.x, p.y, 2, 2, C_CHALK); P(p.x, p.y + 2, 2, 1, C_CRUST); }
}

/** Frost: rime on the top edge (1), icicles (2), ice spikes and a glaze (3). @param {Paint} S */
function frostMarks(S) {
  const { P, a } = S, v = S.dead ? 0 : S.L.frost, parts = a.parts;
  if (!v) return;
  const [x0, x1] = xRange(parts);
  for (let x = x0; x <= x1; x++) {
    if (v === 1 && (x & 1)) continue;
    const y = colEdge(parts, x, -1);
    if (y !== null) P(x, y, 1, 1, C_RIME);
  }
  if (v < 2) return;
  const icicle = (x, len) => { const y = colEdge(parts, x, 1); if (y !== null) { P(x, y + 1, 1, len, C_ICE); P(x, y + 1, 1, 1, C_RIME); } };
  icicle(a.nose.x - 1, 2); icicle(a.nose.x - 2, 3); icicle(a.chest.cx + 1, 2);
  if (v < 3) return;
  icicle(a.chest.cx + 3, 2); icicle(a.nose.x - 3, 2);
  for (let i = 0; i < 3; i++) {
    const x = a.back.x0 + 3 + Math.round((i * (a.back.x1 - a.back.x0)) / 3), y = colEdge(parts, x, -1);
    if (y === null) continue;
    P(x, y - 1, 1, 1, C_RIME); P(x - 1, y - 2, 1, 1, C_RIME); P(x - 2, y - 3, 1, 1, '#ffffff');
  }
  const rows = rowsOf(parts), lim = rows[0][0] + Math.round(rows.length * 0.4);
  for (const [y, rx0, rx1] of rows) if (y <= lim) P(rx0, y, rx1 - rx0 + 1, 1, 'rgba(223,244,255,0.3)');
}

/** Toxicity's blotches and death's ribs. @param {Paint} S */
function sickMarks(S) {
  const { P, a, L } = S;
  if (S.dead) return;
  if (L.toxicity >= 2) for (const p of spotsOn(a, S.seed, 'blotch', L.toxicity === 3 ? 3 : 2)) { P(p.x, p.y, 2, 1, C_SLIME2); P(p.x, p.y + 1, 1, 1, C_SLIME2); }
  if (L.death >= 3) for (let i = 0; i < 3; i++) P(a.chest.cx - 3 + i * 2, a.chest.cy - 1, 1, 2, S.C.dark);
}

/** In front of the body: near ear, horn, spines, near wing. @param {Paint} S */
function nearLayer(S) {
  const { P, a, tr } = S;
  if (a.kind === 'dove' && (a.pose === 'fly1' || a.pose === 'fly2' || a.pose === 'hop')) doveWing(S);
  for (const e of a.ears) if (!e.far) earArt(S, e, 'near');
  hornArt(S, false);
  if (tr.has('spines')) {
    const body = [a.haunch, a.chest];
    for (let i = 0; i < 5; i++) {
      const x = a.back.x0 + 1 + Math.round((i * (a.back.x1 - a.back.x0 - 1)) / 4), y = colEdge(body, x, -1);
      if (y !== null) stamp(P, SPIKE, x - 1, y - 3 - (i & 1), { k: K, i: C_RIME, I: C_ICE });
    }
  }
  if (tr.has('wings')) wingArt(S, false);
}

/**
 * A dove's near wing spread in flight: raised high over its back on the
 * downstroke's start (fly1), swept down below its body (fly2 and gliding).
 * @param {Paint} S
 */
function doveWing(S) {
  const { P, a, C, C2 } = S, h = a.haunch, up = a.pose === 'fly1';
  const root = { x: h.cx + 1, y: h.cy - h.ry + 1 };
  for (let i = 0; i < DOVE_WING; i++) {
    const w = Math.max(1, Math.round((h.rx + 2) * (1 - i / DOVE_WING))), x = root.x - Math.round(w * 0.6) - (up ? Math.round(i * 0.5) : 0);
    const y = up ? root.y - 1 - i : root.y + 2 + Math.round(i * 0.7);
    P(x - 1, y, w + 2, 1, K);
  }
  for (let i = 0; i < DOVE_WING - 1; i++) {
    const w = Math.max(1, Math.round((h.rx + 2) * (1 - i / DOVE_WING)) - 1), x = root.x - Math.round(w * 0.6) - (up ? Math.round(i * 0.5) : 0);
    const y = up ? root.y - 1 - i : root.y + 2 + Math.round(i * 0.7);
    P(x, y, w, 1, i > DOVE_WING - 4 ? C2.body : i & 1 ? C.body : C.hi);
  }
}

/** Eyes, nose, muzzle, blush, drool, whiskers and the third eye. @param {Paint} S */
function faceLayer(S) {
  const { P, a, L, sc, dead, C, C2 } = S, e = a.eye, n = a.nose, big = a.hs >= 0.95;
  if (S.pattern === 'points') P(n.x - 2, n.y - 1, 3, 3, C2.body);
  if (sc[3] >= 1) P(n.x - 2, n.y - 1, 3, 2, C_GREY);
  if (!dead && L.death >= 1) P(e.x - 1, e.y + 1, 3, 1, L.death >= 2 ? PAL.stone2 : C.dark);
  if (!dead && L.death >= 2) { P(e.x - 1, e.y - 1, 3, 1, PAL.stone2); P(e.x - 1, e.y + 2, 2, 1, C.dark); }
  const cross = () => { P(e.x - 1, e.y - 1, 1, 1, K); P(e.x + 1, e.y - 1, 1, 1, K); P(e.x, e.y, 1, 1, K); P(e.x - 1, e.y + 1, 1, 1, K); P(e.x + 1, e.y + 1, 1, 1, K); };
  if (dead || a.pose === 'hurt') cross();
  else if (a.pose === 'flop') { P(e.x - 1, e.y - 1, 1, 1, K); P(e.x, e.y, 1, 1, K); P(e.x + 1, e.y - 1, 1, 1, K); }
  else if (L.love === 3) heart(P, e.x - 1, e.y - 1, C_HEART);
  else if (a.pose === 'collapse' || a.pose === 'loaf' || L.toxicity === 3) { P(e.x - 1, e.y - 1, 3, 1, C.dark); P(e.x - 1, e.y, 2, 1, K); }
  else if (L.love === 2) { P(e.x - 1, e.y, 1, 1, K); P(e.x, e.y - 1, 1, 1, K); P(e.x + 1, e.y, 1, 1, K); }
  else if (a.kind !== 'rabbit') {
    // a cat's eye: green or amber with a slit pupil; a toad's: a gold bulb with a bar of a pupil; a salamander's: small and black
    const arc = L.arcana >= 2 || sc[4] >= 2;
    const iris = arc ? C_RUNE_HI : S.eyeCol === 'green' ? '#8fd14f' : S.eyeCol === 'amber' ? '#f0b84a' : K;
    if (a.kind === 'snail') { /* its eyes are on its stalks */ }
    else if (a.kind === 'cat' || a.kind === 'fox') { P(e.x, e.y - 1, 2, 2, iris); P(e.x + (arc ? 0 : 1), e.y - 1, 1, 2, K); }
    else if (a.kind === 'deer') { P(e.x, e.y - 1, 2, 2, arc ? C_RUNE_HI : K); P(e.x + 1, e.y - 1, 1, 1, arc ? '#ffffff' : C_CREAM); }
    else if (a.kind === 'dove') { P(e.x - 1, e.y - 1, 3, 3, '#f0d8d0'); P(e.x, e.y, 1, 1, arc ? C_RUNE_HI : K); }
    else if (a.kind === 'toad') { P(e.x - 1, e.y - 1, 3, 2, iris); P(e.x - 1, e.y, 3, 1, K); P(e.x + 1, e.y - 1, 1, 1, C_CREAM); }
    else { P(e.x, e.y, 2, 1, arc ? C_RUNE_HI : K); P(e.x + 1, e.y, 1, 1, arc ? '#ffffff' : '#5a5050'); }
    if (arc) P(e.x - 2, e.y, 1, 1, C_RUNE);
    else if (L.arcana === 1) P(e.x, e.y - 2, 1, 1, C_RUNE);
  } else {
    // a big round eye with a glint
    const arc = L.arcana >= 2 || sc[4] >= 2, col = arc ? C_RUNE_HI : S.eyeCol === 'ruby' ? C_RUBY : K;
    if (big) { P(e.x, e.y - 1, 2, 3, col); P(e.x + 1, e.y - 1, 1, 1, arc ? '#ffffff' : C_CREAM); }
    else { P(e.x, e.y - 1, 2, 2, col); P(e.x + 1, e.y - 1, 1, 1, arc ? '#ffffff' : C_CREAM); }
    if (arc) P(e.x - 2, e.y, 1, 1, C_RUNE);
    else if (L.arcana === 1) P(e.x, e.y - 2, 1, 1, C_RUNE);
  }
  if (a.kind === 'toad' || a.kind === 'salamander') {
    // a nostril and the wide lipless mouth
    P(n.x, n.y, 1, 1, K);
    P(a.head.cx - 1, a.head.cy + Math.max(1, a.head.ry - 1), a.head.rx + 1, 1, C.dark);
  } else if (a.kind === 'dove') {
    // the beak: a short pale wedge with a dark tip
    P(n.x - 1, n.y, 2, 1, C_BEAK); P(n.x + 1, n.y, 1, 1, '#6a5a58'); P(n.x - 1, n.y + 1, 1, 1, '#f0e0e0');
  } else if (a.kind === 'snail') {
    // a mouth under its head
    if (a.head.rx >= 2) P(a.head.cx + 1, a.head.cy + a.head.ry - 1, 2, 1, C.dark);
  } else if (a.kind === 'fox' || a.kind === 'badger' || a.kind === 'deer' || a.kind === 'ermine') {
    // a black nose at the tip of the snout, and whiskers
    P(n.x - 1, n.y, 2, 2, dead ? '#5a4a48' : K);
    if (!dead && a.kind !== 'deer') { P(n.x - 2, n.y + 2, 2, 1, 'rgba(255,255,255,0.5)'); }
  } else {
    P(n.x, n.y, 1, 1, dead ? '#b07890' : C_NOSE);
    if (!dead) P(n.x - 1, n.y + 2, 1, 1, C.dark); // the mouth
    // a cat's whiskers
    if ((a.kind === 'cat' || a.kind === 'rat') && !dead) { P(n.x + 1, n.y + 1, 2, 1, 'rgba(255,255,255,0.7)'); P(n.x, n.y + 2, 2, 1, 'rgba(255,255,255,0.5)'); }
  }
  if (a.pose === 'eat' && !a.bare) grassTuft(P, n.x - 2, a.feetY);
  if (dead) { if (S.tr.has('eye3')) P(a.eye3.x, a.eye3.y, 2, 1, K); return; }
  if (L.vitality >= 2) P(n.x - 1, n.y, 1, 1, '#ff8fb8');
  // a blush below the eye, deeper and wider with love (a cold-blooded hide only blushes for love)
  if (((a.kind === 'rabbit' || a.kind === 'cat') || L.love >= 1) && a.kind !== 'snail') P(a.cheek.x, a.cheek.y, L.love >= 1 ? (L.love === 3 ? 3 : 2) + 1 : 2, 1, L.love >= 2 ? C_HEART : C_BLUSH);
  if (L.love >= 1) P(a.cheek.x + 1, a.cheek.y - 1, 1, 1, C_BLUSH);
  if (L.toxicity === 3) { P(n.x - 1, n.y + 1, 1, 1, C_BLUSH); P(n.x, n.y + 1, 1, 2, C_SLIME); }
  if (L.alkali === 3) { P(n.x + 1, n.y - 1, 2, 1, C_CREAM); P(n.x + 1, n.y + 1, 2, 1, C_CREAM); }
  if (S.tr.has('eye3')) { P(a.eye3.x, a.eye3.y, 2, 1, C_RUNE); P(a.eye3.x + 1, a.eye3.y, 1, 1, C_RUNE_HI); }
}

/** A tuft of grass at the mouth of a grazing rabbit, its roots at row y. @param {Pen} P @param {number} x @param {number} y */
function grassTuft(P, x, y) {
  P(x - 1, y, 7, 1, C_GRASS2);
  P(x, y - 1, 5, 1, C_GRASS);
  P(x, y - 2, 1, 1, C_GRASS); P(x + 2, y - 3, 1, 2, C_GRASS3); P(x + 4, y - 2, 1, 1, C_GRASS); P(x + 5, y - 3, 1, 1, C_GRASS3);
}

/** A detail that tells how it died. @param {Paint} S */
function causeLayer(S) {
  const { P, a } = S;
  switch (S.cause) {
    case 'frost': { // frozen into a block of ice
      const rows = rowsOf(a.parts, 2);
      for (const [y, x0, x1] of rows) P(x0, y, x1 - x0 + 1, 1, 'rgba(223,244,255,0.35)');
      P(rows[0][1], rows[0][0], rows[0][2] - rows[0][1] + 1, 1, C_RIME);
      for (const [y, x0] of rows) P(x0, y, 1, 1, C_RIME);
      const h = a.haunch;
      P(h.cx - 2, h.cy - 2, 1, 1, '#ffffff'); P(h.cx - 1, h.cy - 1, 2, 1, '#ffffff'); P(a.chest.cx, a.chest.cy - 1, 1, 2, '#ffffff');
      break;
    }
    case 'fire':
      for (const p of spotsOn(a, S.seed, 'char', 3, true)) { P(p.x, p.y, 2, 1, '#c2410f'); P(p.x, p.y, 1, 1, '#ff7a1c'); }
      break;
    case 'poison':
      P(a.nose.x - 1, a.nose.y + 1, 1, 1, C_BLUSH);
      P(a.nose.x - 3, a.feetY + 1, 5, 1, 'rgba(146,204,113,0.7)');
      break;
    case 'acid':
      for (const p of spotsOn(a, S.seed, 'acid-death', 3)) { P(p.x - 1, p.y - 1, 3, 3, C_BURN_RIM); P(p.x, p.y, 1, 1, C_RUBY); }
      P(a.cx - 3, a.feetY + 1, 6, 1, 'rgba(216,232,106,0.6)');
      break;
    case 'alkali':
      for (const p of spotsOn(a, S.seed, 'crust-death', 4, true)) { P(p.x, p.y, 2, 2, C_CHALK); P(p.x, p.y + 2, 2, 1, C_CRUST); }
      break;
    case 'change': { // crystals grown out of the back
      const body = [a.haunch, a.chest];
      for (let i = 0; i < 3; i++) {
        const x = a.back.x0 + 2 + Math.round((i * (a.back.x1 - a.back.x0)) / 3), y = colEdge(body, x, -1);
        if (y !== null) stamp(P, CRYSTAL, x - 1, y - 3, { k: K, i: C_RIME, t: C_SHIM, T: '#2f8a78' });
      }
      break;
    }
    case 'arcana':
      stamp(P, RUNES[S.seed & 3], a.haunch.cx - 1, a.haunch.cy - 1, { x: C_RUNE_HI });
      stamp(P, RUNES[(S.seed + 1) & 3], a.chest.cx - 1, a.chest.cy - 1, { x: C_RUNE_HI });
      break;
    case 'death':
      for (const [y, x0, x1] of rowsOf(a.parts)) P(x0, y, x1 - x0 + 1, 1, 'rgba(180,145,238,0.18)');
      break;
    default: // age, frailty, unknown: nothing more to see
  }
}

// ------------------------------------------------------------------ animated overlays (per frame)

/**
 * Overlays drawn every frame from the anchors and t: a handful of rects per
 * active channel. A channel that just acted (opts.react) shows at least
 * level 1 and twice its particles, scaled by react.
 * @param {Pen} P @param {any} look @param {any} snap @param {RabbitAnchors} a @param {number} t
 * @param {number} react @param {string[]} acted @param {boolean} low
 */
function drawFx(P, look, snap, a, t, react, acted, low) {
  const L = rabbitLevels(snap);
  const seed = (look.seed >>> 0) % 997, tt = t + seed * 0.37;
  if (!snap.alive) { deadFx(P, a, snap.cause, tt); return; }
  const q = low ? 0.5 : 1;
  /** @param {string} ch */
  const lv = (ch) => (acted.includes(ch) ? Math.max(1, L[ch]) : L[ch]);
  /** @param {string} ch @param {number} base */
  const cnt = (ch, base) => (base > 0 ? Math.max(1, Math.round(base * q * (acted.includes(ch) ? 1 + react : 1))) : 0);
  const body = [a.haunch, a.chest, ...a.bulges];
  const [bx0, bx1] = xRange(a.parts);
  const headTop = a.head.cy - a.head.ry, midY = Math.round((a.haunch.cy + a.head.cy) / 2);
  const backTop = (x) => colEdge(body, x, -1) ?? a.back.y;
  if (a.pose === 'hurt' && (react > 0 || mod(tt, 2.4) < 0.9)) { // startled: shock lines flick out from the crown
    const x = a.head.cx + a.head.rx, y = headTop - 1, o = (tt * 6) & 1;
    P(x - 1, y - 3 - o, 1, 2, K); P(x + 1, y - 1 - o, 1, 1, K); P(x + 2, y - 2 - o, 1, 1, K); P(x + 2 + o, y + 1, 2, 1, K);
  }

  let v = lv('vitality');
  if (v) { // a twinkle running along the back, rising gold pluses, a gleam
    const x = a.back.x0 + Math.floor(mod(tt * 9, Math.max(1, a.back.x1 - a.back.x0)));
    P(x, backTop(x), 1, 1, C_CREAM);
    if (v >= 2) for (let i = 0, n = cnt('vitality', 2); i < n; i++) {
      const age = mod(tt + i * 0.7, 1.4);
      if (age > 1.2) continue;
      const k = Math.floor((tt + i * 0.7) / 1.4);
      const px = a.cx - 8 + ((k * 7 + i * 5) & 15), py = headTop + 2 - Math.round((age / 1.2) * 8);
      plus(P, px, py, C_GOLD); P(px, py, 1, 1, C_CREAM);
    }
    if (v >= 3 && Math.sin(tt * 3.1) > 0.3) plus(P, a.chest.cx - 2, a.chest.cy - 2, C_GLEAM);
  }
  v = lv('strength');
  if (v >= 2 && mod(tt, 2.2) < 0.25) { // a flex, kicking up dust at level 3
    P(a.chest.cx - 2, a.chest.cy - a.chest.ry, 4, 1, 'rgba(255,240,200,0.75)');
    if (v >= 3) for (let i = 0; i < 3; i++) P(a.haunch.cx - 6 + i * 4, a.feetY + (i & 1) - 1, 1, 1, PAL.parch1);
  }
  v = lv('love');
  if (v) for (let i = 0, n = cnt('love', [0, 1, 2, 3][v]); i < n; i++) { // hearts drifting up in front of the ears
    const p = mod(tt / 1.6 + i / n, 1);
    heart(P, a.head.cx + 2 + ((i * 5) % 7) - 2 + Math.round(Math.sin(tt * 3 + i * 2)), headTop - 3 - Math.round(p * 10), v === 3 && i & 1 ? C_PINK : C_HEART);
  }
  v = lv('arcana');
  if (v) { // twinkling stars, orbiting runes, a ring on the floor and a glowing eye
    for (let i = 0, n = cnt('arcana', 2); i < n; i++) {
      if (Math.sin(tt * 3 + i * 2.1) < 0) continue;
      const sx = a.cx + [-12, 11, -5, 15][i & 3], sy = headTop + [3, -2, -4, 7][i & 3];
      plus(P, sx, sy, C_RUNE_HI); P(sx, sy, 1, 1, '#ffffff');
    }
    if (v >= 2) for (let i = 0, n = cnt('arcana', 3); i < n; i++) {
      const ang = tt * 1.2 + i * 2.09;
      stamp(P, RUNES[(i + seed) & 3], a.cx - 1 + Math.round(Math.cos(ang) * 14), midY - 1 + Math.round(Math.sin(ang) * 5), { x: Math.sin(ang) > 0 ? C_RUNE_HI : C_RUNE });
    }
    if (v >= 3) {
      for (let i = 0, n = Math.round(6 * q); i < n; i++) { const ang = tt * 1.5 + (i * Math.PI * 2) / n; P(a.cx + Math.round(Math.cos(ang) * 12), a.feetY + 2 + Math.round(Math.sin(ang) * 2), 1, 1, C_RUNE); }
      if (Math.sin(tt * 4) > 0) P(a.eye.x, a.eye.y - 1, 1, 1, '#ffffff');
    }
  }
  v = lv('transformation');
  if (v) { // a teal shimmer sweeping the coat, motes spiralling in, a glitch
    const p = mod(tt, 3);
    if (p < 0.9) {
      const rows = rowsOf(a.parts), y0 = rows[0][0], sx = bx0 - 6 + Math.round((p / 0.9) * (bx1 - bx0 + 12));
      for (let i = 0; i < rows.length; i += 2) {
        const [y, x0, x1] = rows[i], x = sx - ((y - y0) >> 1);
        if (x >= x0 && x <= x1 - 1) P(x, y, 2, 1, 'rgba(95,212,180,0.55)');
      }
    }
    if (v >= 2) for (let i = 0, n = cnt('transformation', 4); i < n; i++) {
      const r = 14 - mod(tt * 6 + i * 3, 12), ang = tt * 3 + i * (Math.PI / 2);
      P(a.cx + Math.round(Math.cos(ang) * r), midY + Math.round(Math.sin(ang) * r * 0.5), 1, 1, C_SHIM);
    }
    if (v >= 3 && mod(tt, 2.5) < 0.12) for (let i = 0; i < 3; i++) P(bx0 + ((seed + i * 11) % Math.max(1, bx1 - bx0 - 4)), headTop + 4 + i * 4, 5, 1, C_SHIM);
  }
  v = lv('fire');
  if (v) { // smoulder (1), flames along the back (2), more flames, sparks and burning ear tips (3)
    if (v === 1 && Math.sin(tt * 5) > -0.2) P(a.back.x0 + 4, backTop(a.back.x0 + 4) + 1, 1, 1, '#ffb444');
    const nf = cnt('fire', [0, 0, 3, 6][v]), span = a.back.x1 + 2 - a.back.x0;
    for (let i = 0; i < nf; i++) {
      const x = a.back.x0 + Math.round(((i + 0.5) * span) / nf), y = backTop(x);
      const h = 2 + (((tt * 10 + i * 3) | 0) % 3) + (v === 3 ? 1 : 0);
      P(x, y - h, 1, h, '#ff7a1c'); P(x, y - 2, 1, 2, '#ffb444');
      if (v === 3 && i & 1) P(x, y - 1, 1, 1, PAL.fire5);
    }
    for (let i = 0, n = cnt('fire', 1); i < n; i++) {
      const age = mod(tt * 0.8 + i * 0.5, 1);
      P(a.back.x0 + 3 + i * 6 + Math.round(Math.sin(tt * 2 + i) * 1.5), a.back.y - 2 - Math.round(age * 10), 1, 1, '#8a8296');
    }
    if (v === 3) {
      for (let i = 0, n = cnt('fire', 2); i < n; i++) P(a.back.x0 + 5 + ((i * 9 + seed) % 14) + Math.round(Math.sin(tt * 6 + i)), a.back.y - 3 - Math.round(mod(tt * 1.7 + i * 0.5, 1) * 14), 1, 1, '#ffd75a');
      const e = a.ears[a.ears.length - 1];
      if (e && e.kind === 'up') { const tx = e.x + 1 - Math.floor((e.len - 1) / e.lean), ty = e.y - e.len; P(tx, ty - 1 - (((tt * 8) | 0) & 1), 1, 2, '#ff7a1c'); }
    }
  }
  v = lv('frost');
  if (v) { // breath puffs (1-2), falling snow (2), frozen still with glints on the ice (3)
    if (v < 3 && mod(tt, 1.6) < 0.45) P(a.nose.x + 1 + Math.round(mod(tt, 1.6) * 6), a.nose.y - 1, 2, 1, 'rgba(223,244,255,0.8)');
    if (v >= 2) for (let i = 0, n = cnt('frost', v === 3 ? 5 : 2); i < n; i++) {
      P(bx0 - 2 + ((i * 13 + seed) % (bx1 - bx0 + 4)) + Math.round(Math.sin(tt * 1.3 + i) * 1.5), 2 + Math.round(mod(tt * 5 + i * 9, 32)), 1, 1, C_RIME);
    }
    if (v === 3) for (let i = 0; i < 2; i++) if (Math.sin(tt * 5 + i * 2.5) > 0.6) { const x = a.back.x0 + 2 + i * 7; P(x, backTop(x) + 1, 1, 1, '#ffffff'); }
  }
  v = lv('acid');
  if (v) { // a droplet on a raw spot and steam rising from them
    const pts = acidSpots(look.seed >>> 0 || 1, a);
    if (Math.sin(tt * 4) > 0) P(pts[0].x, pts[0].y + 1, 1, 1, C_ACID);
    for (let i = 0, n = cnt('acid', v); i < n; i++) {
      const p = pts[i % pts.length];
      P(p.x + Math.round(Math.sin(tt * 3 + i)), p.y - 2 - Math.round(mod(tt * 0.9 + i * 0.37, 1) * 7), 1, 1, 'rgba(230,240,220,0.7)');
    }
  }
  v = lv('alkali');
  if (v) { // chalk dust drifting down, a sneeze at level 3
    for (let i = 0, n = cnt('alkali', v === 1 ? 1 : 2); i < n; i++) {
      const x = bx0 + 2 + ((i * 11 + seed) % Math.max(1, bx1 - bx0 - 4));
      P(x, backTop(x) + Math.round(mod(tt * 4 + i * 5, 12)), 1, 1, C_CHALK);
    }
    if (v === 3 && mod(tt, 4) > 3.8) P(a.nose.x + 1, a.nose.y - 1, 3, 2, C_CREAM);
  }
  v = lv('toxicity');
  if (v) { // bubbles off the back, then a drool drip and a purple bubble
    for (let i = 0, n = cnt('toxicity', v); i < n; i++) {
      const p = mod(tt / 2 + i / n, 1);
      P(a.back.x0 + 3 + i * 4 + Math.round(Math.sin(tt * 2 + i)), a.back.y - 2 - Math.round(p * 8), 2, 2, v === 3 && i === 2 ? '#a678ff' : C_SLIME);
    }
    if (v === 3) P(a.nose.x - 1, a.nose.y + 3 + Math.round(mod(tt / 1.5, 1) * Math.max(0, a.feetY - a.nose.y - 3)), 1, 1, C_DRIP);
  }
  v = lv('death');
  if (v) for (let i = 0, n = cnt('death', [0, 1, 1, 3][v]); i < n; i++) { // slow violet-grey wisps
    if (v === 2 && i === 0 && mod(tt, 4) > 2.6) continue;
    const x = bx0 + 4 + ((i * 9 + seed) % Math.max(1, bx1 - bx0 - 8)) + Math.round(Math.sin(tt * 1.4 + i * 2) * 2);
    const y = a.back.y - 1 - Math.round(mod(tt * 0.35 + i * 0.33, 1) * 12), c = v === 1 ? 'rgba(180,145,238,0.35)' : 'rgba(180,145,238,0.6)';
    P(x, y, 1, 2, c); P(x + (Math.sin(tt * 2 + i) > 0 ? 1 : -1), y - 1, 1, 1, c);
  }
}

/** The dead are still, but for a smoking char, a glint of rime or flies. @param {Pen} P @param {RabbitAnchors} a @param {string|null} cause @param {number} t */
function deadFx(P, a, cause, t) {
  if (cause === 'fire') {
    const x = a.cx - 2 + Math.round(Math.sin(t * 1.1) * 2), y = a.back.y - 2 - Math.round(mod(t * 0.3, 1) * 12);
    P(x, y, 1, 2, 'rgba(138,130,150,0.7)'); P(x + 1, y - 2, 1, 1, 'rgba(138,130,150,0.45)');
  } else if (cause === 'frost') {
    if (Math.sin(t * 2.3) > 0.7) P(a.haunch.cx - 3, a.haunch.cy - a.haunch.ry - 2, 1, 1, '#ffffff');
    if (Math.sin(t * 1.7 + 2) > 0.7) P(a.head.cx, a.head.cy - a.head.ry - 2, 1, 1, '#ffffff');
  } else if (cause === 'poison') {
    for (let i = 0; i < 2; i++) {
      const x = a.cx + Math.round(Math.cos(t * 6.3 + i * 2.8) * 7), y = a.back.y - 4 + Math.round(Math.sin(t * 9.1 + i * 1.3) * 2);
      P(x, y, 1, 1, K); P(x, y - 1, 1, 1, 'rgba(255,255,255,0.6)');
    }
  }
}

// ------------------------------------------------------------------ motion

/**
 * Whole-body motion: the idle hop and bob, a sick sway, shivers, flinches,
 * a sneeze, a glitch, levitation; frozen, collapsed and dead are still
 * (but for a reaction's shake).
 * @param {any} look @param {any} snap @param {RabbitAnchors} a @param {number} t @param {number} react @param {boolean} hop
 */
function motion(look, snap, a, t, react, hop) {
  const shake = react > 0 ? Math.round(Math.sin(t * 40) * react * 1.5) : 0;
  const L = rabbitLevels(snap);
  if (a.lying || L.frost === 3) return { dx: shake, dy: 0 };
  const seed = (look.seed >>> 0) || 1, ts = t * rabbitPace(snap);
  const slumped = a.pose === 'sick' || a.pose === 'loaf' || a.pose === 'hurt';
  let dx = 0, dy = 0;
  if (hop && a.pose === 'idle' && (a.kind === 'rabbit' || a.kind === 'toad')) {
    const per = (4 + (seed % 300) / 100) * (snap.stage === 'kit' ? 0.6 : 1), ph = mod(ts + (seed % 7), per);
    if (ph < 0.4) dy = -Math.round(Math.min(4, Math.max(1, a.top)) * Math.sin((Math.PI * ph) / 0.4));
  }
  if (dy === 0) dy = Math.round(Math.sin(ts * 2.2 + (seed % 11)) * (slumped ? 0.5 : L.vitality === 3 ? 1.5 : 0.8));
  if (L.frost) { const per = L.frost === 2 ? 1.3 : 2.6; if (mod(t, per) < (L.frost === 2 ? 0.35 : 0.2)) dx += Math.sin(t * 88) > 0 ? 1 : -1; }
  if (L.toxicity >= 2) dx += Math.round(Math.sin(t * 1.6));
  if (L.acid === 3 && mod(t, 3.1) < 0.1) dx -= 1;
  if (L.alkali === 3 && mod(t, 4) > 3.8) dx -= 1;
  if (L.transformation === 3 && mod(t, 2.5) < 0.12) dx += 1;
  if (L.love === 3) dx += Math.round(Math.sin(t * 0.9) * 0.6);
  if (L.arcana === 3) dy -= 2 + (Math.sin(t * 1.5) > 0 ? 1 : 0);
  if (L.levitation) dy -= 2 + L.levitation * 2 + Math.round(Math.sin(t * 2) * L.levitation);
  return { dx: dx + shake, dy };
}

// ------------------------------------------------------------------ sprite cache and the public drawing call

const SPRITES = new Map();
const SPRITE_MAX = 64;

/**
 * Cache key of a rabbit's static sprite: every look field and the whole
 * quantised snapshot (as encodeSnap writes it), plus the pose.
 * @param {any} look @param {any} snap @param {string} [want] pose asked for
 */
export function rabbitSpriteKey(look, snap, want) {
  const c = (v) => (Array.isArray(v) ? v.map((x) => Math.round(x * 255)).join(',') : '');
  const s = snap || {};
  const lv = Array.isArray(s.lv) ? s.lv.join('') : '', sc = Array.isArray(s.sc) ? s.sc.join('') : '';
  const tr = Array.isArray(s.traits) ? s.traits.join(',') : '';
  return `${artRevision()}|${look.kind || ''}|${c(look.coat)}|${c(look.coat2)}|${look.pattern}|${look.ear}|${look.size}|${look.eye}|${look.tail}|${look.seed}|${s.stage}${s.hp}${s.alive === false ? 0 : 1}${s.preg ? 1 : 0}|${lv}|${sc}|${tr}|${s.cause || ''}|${rabbitPose(snap, want)}`;
}

/**
 * Paint a rabbit's static body into a new 48×40 canvas.
 * @param {any} look @param {any} snap
 * @param {(w:number, h:number) => any} [factory] canvas maker (makeCanvas in the browser)
 * @param {{pose?:string, quality?:'low'|'high', grass?:boolean, k?:number}} [opts] grass: false when it grazes bare ground;
 *   k: its definition, pixels to a frame pixel (2: a 96×80 sprite, its body's curves and outline on the finer grid)
 */
export function drawRabbitSprite(look, snap, factory = makeCanvas, opts = {}) {
  look = directLook(look);
  const k = opts.k || 1, cv = factory(RABBIT_W * k, RABBIT_H * k);
  const ctx = cv.getContext('2d');
  const a = rabbitAnchors(look, snap, opts.pose);
  if (opts.grass === false) a.bare = true;
  drawBody(pen(ctx, 0, 0, 0, 0, false, true, k), look, snap, a, opts.quality === 'low');
  return cv;
}

/** Forget every cached sprite (e.g. after a theme or palette change). */
export function clearRabbitSprites() {
  SPRITES.clear();
}

/** @param {any} look @param {any} snap @param {string} pose @param {boolean} low @param {(w:number, h:number) => any} factory @param {boolean} [grass] */
function spriteFor(look, snap, pose, low, factory, grass = true, k = 1) {
  const key = rabbitSpriteKey(look, snap, pose) + (low ? '|lo' : '') + (grass ? '' : '|bare') + (k > 1 ? '|k' + k : '');
  let cv = SPRITES.get(key);
  if (cv) { SPRITES.delete(key); SPRITES.set(key, cv); return cv; }
  cv = drawRabbitSprite(look, snap, factory, { pose, quality: low ? 'low' : 'high', grass, k });
  gradeSprite(cv);
  SPRITES.set(key, cv);
  if (SPRITES.size > SPRITE_MAX) SPRITES.delete(SPRITES.keys().next().value);
  return cv;
}

/**
 * Give a sprite the game's one look for animals (rendering/punch.js): its
 * tones spread and its colours deepened, as the wilds show them. Canvases
 * that cannot be read back (tests' stand-ins) are left as drawn.
 * @param {any} cv
 */
function gradeSprite(cv) {
  try {
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (!g || typeof g.getImageData !== 'function') return;
    const img = g.getImageData(0, 0, cv.width, cv.height);
    if (!img || !img.data) return;
    punchSprite(img.data, cv.width, cv.height, { ink: false });
    g.putImageData(img, 0, 0);
  } catch { /* not readable */ }
}

/** The straw floor of a subject card (a straw strip). @param {CanvasRenderingContext2D} ctx @param {number} fx @param {number} fy */
function drawFloor(ctx, fx, fy) {
  ctx.fillStyle = '#8b5a31';
  ctx.fillRect(fx + 4, fy + 35, 40, 3);
  ctx.fillStyle = '#c2a678';
  for (let x = 5; x < 44; x += 3) ctx.fillRect(fx + x, fy + 34, 2, 1);
}

/**
 * Draw one rabbit into a 48×40 frame at (opts.x, opts.y).
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} look RabbitLook
 * @param {any} snap RabbitSnap
 * @param {number} t seconds (animation)
 * @param {number} [react] 0..1 strength of a reaction just played (shake, flash, doubled overlays)
 * @param {Object} [opts]
 * @param {number} [opts.x] frame origin
 * @param {number} [opts.y]
 * @param {boolean} [opts.clear] clear the frame first (default true)
 * @param {boolean} [opts.floor] draw the straw floor (default true)
 * @param {'low'|'high'} [opts.quality] low: no auras, half the particles
 * @param {boolean} [opts.cache] use the sprite cache (default: when a canvas can be made)
 * @param {(w:number, h:number) => any} [opts.factory] canvas maker for sprites (default makeCanvas when a DOM exists)
 * @param {boolean} [opts.mirror] face left
 * @param {string[]} [opts.react] RABBIT_MARKS channels that just acted
 * @param {string} [opts.pose] 'loaf' | 'rear' | 'flop' | 'eat' | 'hop' | 'hurt' (death and collapse always win)
 * @param {boolean} [opts.hop] the idle hop (default true; the hutch moves its rabbits itself)
 * @param {number} [opts.lift] px the body is raised off the ground (a hop arc); the shadow stays
 * @param {boolean} [opts.flash] the white reaction flash over the frame (default true)
 * @param {boolean} [opts.clip] clip to the frame (default true; the hutch lets ears pass its top)
 * @param {boolean} [opts.shadow] its shadow on the ground under it (default true; drawn only while it touches the ground)
 * @param {number} [opts.k] the sprite's definition (2: drawn from a 96×80 sprite into a context scaled ×2, its curves finer)
 * @param {boolean} [opts.grass] a tuft of grass at its mouth while it grazes (default true; false on bare ground)
 */
export function drawRabbit(ctx, look, snap, t, react = 0, opts = {}) {
  look = directLook(look); t = creatureClock(look, t);
  const fx = Math.round(opts.x || 0), fy = Math.round(opts.y || 0);
  if (opts.clear !== false) ctx.clearRect(fx, fy, RABBIT_W, RABBIT_H);
  if (opts.floor !== false) drawFloor(ctx, fx, fy);
  if (!look || !snap) return;
  const low = opts.quality === 'low', mirror = !!opts.mirror, clip = opts.clip !== false;
  const rx = clamp(Number(react) || 0, 0, 1);
  const acted = rx > 0 && Array.isArray(opts.react) ? opts.react : [];
  const time = Number(t) || 0;
  // a harmful dose landing makes it flinch; off the ground it leaps
  let a = rabbitAnchors(look, snap, opts.pose || (rx > 0.25 && acted.some((c) => HARM.includes(c)) ? 'hurt' : undefined));
  const m = motion(look, snap, a, time, rx, opts.hop !== false);
  if ((a.pose === 'idle' || a.pose === 'sick') && ((opts.lift || 0) > 0 || m.dy < -1)) a = rabbitAnchors(look, snap, 'hop');
  const grass = opts.grass !== false;
  if (!grass) a.bare = true;
  const dy = m.dy - Math.round(opts.lift || 0);
  // its shadow on the ground, only while it stands on it: none in a hop or in flight (never floating under it)
  const grounded = dy >= 0 && a.pose !== 'hop' && a.pose !== 'fly1' && a.pose !== 'fly2';
  if (opts.shadow !== false && grounded) {
    const shadowP = pen(ctx, fx, fy, m.dx, 0, mirror, clip);
    const sx0 = a.haunch.cx - a.haunch.rx + 1, sx1 = Math.max(a.chest.cx + a.chest.rx, a.lying ? a.head.cx + a.head.rx : 0);
    shadowP(sx0, a.feetY + 1, sx1 - sx0, 1, 'rgba(0,0,0,0.18)');
    shadowP(sx0 + 2, a.feetY + 2, sx1 - sx0 - 4, 1, 'rgba(0,0,0,0.12)');
  }
  const factory = opts.factory || (typeof document !== 'undefined' ? makeCanvas : null);
  const extraLevels = rabbitLevels(snap);
  ctx.save();
  if (snap.alive !== false && extraLevels.invisibility) ctx.globalAlpha *= Math.max(0.16, 1 - extraLevels.invisibility * 0.24 + Math.sin(time * 2) * 0.06);
  if (snap.alive !== false && extraLevels.phasing) ctx.globalAlpha *= 0.65 + Math.sin(time * 4) * 0.22;
  if (opts.cache !== false && factory) {
    const sprite = spriteFor(look, snap, a.pose, low, factory, grass, opts.k || 1);
    if (mirror) {
      ctx.save();
      ctx.translate(fx + RABBIT_W - m.dx, fy + dy);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0, RABBIT_W, RABBIT_H);
      ctx.restore();
    } else ctx.drawImage(sprite, fx + m.dx, fy + dy, RABBIT_W, RABBIT_H);
  } else drawBody(pen(ctx, fx, fy, m.dx, dy, mirror, clip), look, snap, a, low);
  ctx.restore();
  drawFx(pen(ctx, fx, fy, m.dx, dy, mirror, clip), look, snap, a, time, rx, acted, low);
  const extra = ['swiftness', 'levitation', 'invisibility', 'phasing', 'temporal'];
  const colors = ['#d4ef78', '#8ce6ff', '#cdb9ef', '#63f5d2', '#ffd480'];
  const P = pen(ctx, fx, fy, m.dx, dy, mirror, clip);
  for (let k = 0; k < extra.length; k++) {
    const level = snap.alive === false ? 0 : snap.lv?.[RABBIT_MARKS.indexOf(extra[k])] || 0;
    for (let j = 0; j < level * 3; j++) {
      const phase = time * (k === 4 ? -5 : k === 0 ? 18 : 4);
      const x = 5 + mod(j * 7 + k * 3 + (k === 0 ? phase : Math.sin(phase + j) * 2), 35), y = 6 + mod(j * 5 + k * 4 - phase, 25);
      P(x, y, k === 0 || k === 4 ? 2 + level : 1, 1, colors[k]);
      if (k === 1) P(x, y + 1, 1, 2, colors[k]);
      if (k === 2 || k === 3) P(x + level, y + 2, 1, 1, colors[k]);
    }
  }
  if (rx > 0 && opts.flash !== false) {
    ctx.fillStyle = `rgba(255,255,255,${(rx * 0.35).toFixed(3)})`;
    ctx.fillRect(fx, fy, RABBIT_W, RABBIT_H);
  }
}
