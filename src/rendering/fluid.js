// Fine-pixel material renderer.
//
// Physics particles are ~5 screen pixels apart, but matter is drawn at
// 1–2 pixel detail:
//   • liquids & pastes are splatted into a continuous weight/colour field and
//     thresholded, so pools look continuous and diffusion shows as smooth
//     colour gradients; each particle also carries a texture value so pastes
//     look grainy and the texture moves with the material (no screen-space
//     "swimming" noise); liquid on its way to freezing turns to slush;
//   • powders are drawn as clusters of small, irregular chips (darker when
//     damp), an ingredient's in the colours of its procedural pieces;
//   • frozen blocks get a compact, crisp icy body with a frosty rim that
//     clears as they melt;
//   • whole solid ingredients (roots, stones, crystals…) are drawn as their
//     own material — fibres, speckles, facets, veins — with cracks where the
//     pestle has damaged them, so they break down as the simulation does; a
//     wild ingredient's object is painted from the piece it was poured as
//     (one of its four procedural pieces, visual/pieces.js), turning
//     with it and eaten away particle by particle;
//   • a brew takes the dominant colour of the painted ingredients in it,
//     blending into gradients as it diffuses (brew-palette.js);
//   • every effect a brew carries keeps a swarm of particles in it, as
//     many as its share there, tiny pixel motes in the effect's own
//     palette and motion: rose motes for love, embers for fire, ice
//     crystals for frost, a lime fizz for acid… (potion-fx.js);
//   • liquid reads as pixel particles: it is drawn in droplet-sized cells,
//     one flat colour each, and every particle gives its cell its own
//     speck of lighter or darker brew (a few twinkle), and depth shading
//     falls in ordered-dither bands;
//   • liquids have depth: light crosses more of the brew the deeper it is,
//     so the colour deepens and saturates downward, channel by channel
//     (Beer–Lambert), under a bright thin surface layer and its meniscus;
//     depth is measured from the pool's level, so a stream being poured or
//     drops falling in don't cast dark columns down through the brew;
//   • vapour is a swarm of fine droplets rising, swaying and fading in and
//     out around its particles, over a faint haze;
//   • magic never recolours a brew: the effects it carries show only as
//     their particles, and awakening makes those denser and bolder, not
//     the brew a different colour; matter that is luminous of itself,
//     or burning, still glows and spills light into a soft pixel halo;
// Rendering resolution is independent of the physics resolution.

import { directMaterialImage } from '../studio/material-runtime.js';
import { PHASE, SIM } from '../simulation/constants.js';
import { LOOK, piece } from '../materials/shapes.js';
import { PIECE_ART, PIECE_CELL, piecePalette, pieceSprite } from '../visual/pieces.js';
import { NE } from '../alchemy/effects.js';
import { MAX_SPECIES } from '../reactions/species.js';
import { PotionParticles } from './potion-fx.js';
import { preparePalettes, paletteColour, pc as palCol } from './brew-palette.js';

const { LIQUID, POWDER, PASTE, SOLID, GAS } = PHASE;
/** Interleaved liquid accumulator stride: weight, r, g, b, opacity, paste, texture, temperature, slush. */
const LS = 9;
/** channels of the softened liquid colour field */
const LC = 6;

/**
 * Side, in screen pixels, of the cells a brew is drawn in: one cell about
 * one droplet, a little under half the particles' spacing.
 * @param {number} scale screen pixels per world unit
 */
export function dropletCell(scale) {
  return Math.max(2, Math.round(SIM.SPACING * scale * 0.42));
}

/** Small integer hash → [0,1). */
function hash01(n) {
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}

/**
 * Light emitted by one particle: its own glow and flames in `em` (rgb), and
 * its magic split by effect into chK/chV (nc channels: effect index and
 * strength, its shares of the particle's magic) — the magic draws the
 * effects' patterns, it adds no light or colour of its own.
 */
const em = [0, 0, 0];
const chK = new Int32Array(NE), chV = new Float32Array(NE);
let nc = 0;
function emission(p, i, r, g, b, glow) {
  const a = p.auraI[i];
  // faint for plain ingredients, strong once awakened (strongly non-linear)
  const s = a > 0.002 ? (1 - Math.exp(-Math.pow(a, 1.4) * 6)) * 0.75 : 0;
  nc = 0;
  if (s > 0) {
    const fx = p.auraFx, o = i * NE, k0 = s / a;
    for (let k = 0; k < NE; k++) {
      const v = fx[o + k];
      if (v > 0) { chK[nc] = k; chV[nc] = v * k0; nc++; }
    }
  }
  const gl = glow * 0.42, bu = p.burn[i];
  em[0] = gl * (0.45 + r * 0.55) + bu;
  em[1] = gl * (0.45 + g * 0.55) + bu * 0.55;
  em[2] = gl * (0.45 + b * 0.55) + bu * 0.18;
  return s + em[0] + em[1] + em[2];
}

/**
 * Glow of a particle as drawn: an awakened form shines no brighter than the
 * ingredient it woke from (awakening shows in the patterns, not as light).
 * `vis` holds each species slot's drawn glow, or is null when none differs.
 */
export function drawnGlow(p, sp, i, vis) {
  if (!vis) return p.glow[i];
  const off = i * MAX_SPECIES;
  let g = 0, t = 0;
  for (let s = 0; s < sp.count; s++) { const f = p.comp[off + s]; if (f > 0) { g += f * vis[s]; t += f; } }
  return t > 0 ? g / t : 0;
}
/** @type {Float32Array} */
const glowVis = new Float32Array(MAX_SPECIES);

/**
 * Each species slot's drawn glow for drawnGlow, or null when every one
 * shines as it is. @param {import('../simulation/world.js').Simulation} sim
 */
export function drawnGlowTable(sim) {
  const sp = sim.species;
  let vis = null;
  for (let s = 0; s < sp.count; s++) {
    const d = sp.defs[s];
    const base = d && d.awakened && d.base ? sim.lookup(d.base) : null;
    glowVis[s] = base ? base.glow || 0 : sp.glow[s];
    if (glowVis[s] !== sp.glow[s]) vis = glowVis;
  }
  return vis;
}

/** Scale2x (EPX) of a w×h pixel image: edges stay crisp and diagonals smooth. @param {Uint32Array} a @param {number} w @param {number} h */
function scale2x(a, w, h) {
  const o = new Uint32Array(w * h * 4), W = w * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = a[y * w + x], A = y > 0 ? a[(y - 1) * w + x] : P, B = x < w - 1 ? a[y * w + x + 1] : P;
    const C = x > 0 ? a[y * w + x - 1] : P, D = y < h - 1 ? a[(y + 1) * w + x] : P;
    const k = y * 2 * W + x * 2;
    o[k] = C === A && C !== D && A !== B ? A : P;
    o[k + 1] = A === B && A !== C && B !== D ? B : P;
    o[k + W] = D === C && D !== B && C !== A ? C : P;
    o[k + W + 1] = B === D && B !== A && D !== C ? D : P;
  }
  return o;
}
/** a piece's sprite upscaled 4× by Scale2x twice, for turning it without breaking its lines (as RotSprite does) */
const SMOOTH = new WeakMap();
/** @param {number} skin @param {{px:Uint32Array, size:number}} spr */
function smoothSprite(skin, spr) {
  let got = SMOOTH.get(spr);
  if (got) return got;
  const S = spr.size, cell = new Uint32Array(S * S);
  for (let k = 0; k < S * S; k++) { const c = spr.px[k]; cell[k] = c >>> 31 ? c : 0; }
  got = scale2x(scale2x(cell, S, S), S * 2, S * 2);
  SMOOTH.set(spr, got);
  return got;
}

/** Add the current particle's magic, weight q, to pixel `px` of a per-effect field. */
function addMagic(mfx, px, q) {
  const o = px * NE;
  for (let c = 0; c < nc; c++) mfx[o + chK[c]] += q * chV[c];
}

export class FluidRenderer {
  constructor() {
    this.cap = 0;
    this.w = 0;
    this.h = 0;
    /** @type {HTMLCanvasElement|OffscreenCanvas|null} */
    this.canvas = null;
    this.ctx = null;
    this.image = null;
    this.thermal = false;
    /** draw the light halo around glowing matter */
    this.halo = true;
    this.haloCanvas = null;
    this.haloCtx = null;
    this.haloImage = null;
    this.hw = 0;
    this.hh = 0;
    /** the effects' particles, kept from frame to frame */
    this.fx = new PotionParticles();
    /** the simulation's clock at the last frame */
    this.simT = -1;
    // Every buffer is declared here, empty, with its final type, and only
    // ever replaced by a bigger one of the same type: the renderer keeps
    // one shape from its first frame, so the JIT never has to throw its
    // optimised code away when a buffer first appears (as it did when a
    // brew first boiled or burned).
    const F = () => new Float32Array(0), I = () => new Int32Array(0);
    this.liq = F(); this.sol = F(); this.emit = F(); this.mfx = F(); this.solBest = F(); this.solIdx = I();
    this.pieceCol = new Uint32Array(0); this.pieceIdx = I();
    this.wb = F(); this.wt = F(); this.lc = F(); this.lct = F();
    this.grain = new Uint32Array(0); this.fxLiq = new Uint8Array(0); this.fxPix = I(); this.flow = F(); this.dot = F();
    this.haloAcc = F(); this.haloTmp = F();
    this.gas = F(); this.mote = F(); this.gasTmp = F();
    this.surf = I(); this.surfTmp = I(); this.surfF = F(); this.surfG = F();
    this.cellSt = new Uint8Array(0); this.cellCol = F();
    this.colCell = I(); this.colQ = I(); this.rowCell = I(); this.rowQ = I();
    this.gK = F(); this.gExt = I();
    this.hMark = I(); this.hTok = 0;
    this.px4 = new Float64Array(4);
    /** this frame's values, for the per-phase splatting (one shape, filled every frame) */
    this.fc = {
      /** @type {any} */ p: null, s: 0, bx: 0, by: 0, w: 0, h: 0,
      liq: F(), sol: F(), grain: new Uint32Array(0), emit: F(), mfx: F(), solBest: F(), solIdx: I(),
      dot: F(), flow: F(), fxMask: 0, /** @type {Uint32Array|null} */ art: null, artW: 0,
      rl: 0, rs: 0, rgas: 0, rgrain: 0, RL: 0, RS: 0, RG: 0, T: F(), GD: 0, gK: F(), gExt: I(), time: 0,
      /** @type {any} */ sim: null, /** @type {any} */ view: null, lc: F(), wb: F(), cellSt: new Uint8Array(0), cellCol: F(),
      thr: 0, PQ: 0, PW: 0, sf: F(), depthScale: 0, twinkle: 0, thermal: false,
    };
  }

  /**
   * One liquid or paste particle into the liquid fields (and its droplet cell's grain).
   * @param {number} i @param {number} ph @param {number} fx @param {number} fy its spot in the region
   * @param {number} r @param {number} g @param {number} b its colour @param {number} seed
   * @param {boolean} lit @param {number} eR @param {number} eG @param {number} eB its emitted light
   */
  _splatLiquid(i, ph, fx, fy, r, g, b, seed, lit, eR, eG, eB) {
    const { p, s, bx, by, w, h, liq, sol, grain, emit, mfx, solBest, solIdx, dot, flow, fxMask, art, artW, rl, rs, rgas, rgrain, RL, RS, RG, T, GD, gK, gExt, time } = this.fc;
    const isPaste = ph === PASTE ? 1 : 0;
    const tex = hash01(seed) * 2 - 1;
    const o = Math.max(0.35, p.opacity[i]);
    const Ti = T[i];
    // progress toward freezing (latent heat already given up)
    const slush = p.lat[i] < 0 && p.latF[i] > 0 ? Math.min(1, -p.lat[i] / p.latF[i]) : 0;
    const cy = fy | 0;
    const inv = 1 / (rl * rl), rl2 = rl * rl;
    // its velocity on screen, which carries the effects' particles along
    const fvx = p.vx[i] * s, fvy = p.vy[i] * s;
    // its own grain: a 1–2 px speck of lighter or darker liquid that
    // travels with it, so the brew reads as a swarm of pixel particles;
    // a few catch the light and twinkle
    if (!isPaste) {
      const hd = hash01(seed * 7 + 3), hs = hash01(seed * 13 + 5);
      const tone = hd < 0.07 ? 2 : hd < 0.5 ? -1 + hd * 1.6 : (hd - 0.5) * 2;
      // its cell's centre, where the compose pass reads the cell from
      const PQ = dropletCell(s);
      const qx = Math.floor((fx + bx) / PQ) * PQ - bx + (PQ >> 1), qy = Math.floor((fy + by) / PQ) * PQ - by + (PQ >> 1);
      if (qx >= 0 && qx < w && qy >= 0 && qy < h) dot[qy * w + qx] = 3 + tone + (tone === 2 ? hs * 0.5 : 0);
    }
    for (let dy = -RL; dy <= RL; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= h) continue;
      const ddy = yy + 0.5 - fy;
      const rem = rl2 - ddy * ddy;
      if (rem <= 0) continue;
      // only the kernel's chord on this row (one pixel of slack each side)
      const half = Math.sqrt(rem);
      const x0 = Math.max(0, Math.floor(fx - 0.5 - half)), x1 = Math.min(w - 1, Math.ceil(fx - 0.5 + half));
      const row = yy * w;
      for (let xx = x0; xx <= x1; xx++) {
        const ddx = xx + 0.5 - fx;
        let q = 1 - (ddx * ddx + ddy * ddy) * inv;
        if (q <= 0) continue;
        q *= q;
        const k = (row + xx) * LS;
        liq[k] += q; liq[k + 1] += q * r; liq[k + 2] += q * g; liq[k + 3] += q * b;
        liq[k + 4] += q * o; liq[k + 5] += q * isPaste; liq[k + 6] += q * tex; liq[k + 7] += q * Ti; liq[k + 8] += q * slush;
        if (lit) { const e = (row + xx) * 4; emit[e] += q * eR; emit[e + 1] += q * eG; emit[e + 2] += q * eB; emit[e + 3] += q; if (nc) addMagic(mfx, row + xx, q); }
        if (fxMask) { const v2 = (row + xx) * 2; flow[v2] += q * fvx; flow[v2 + 1] += q * fvy; }
      }
    }
  }

  /**
   * One grain of powder: its chips, into the grain layer.
   * @param {number} i @param {number} ph @param {number} fx @param {number} fy its spot in the region
   * @param {number} r @param {number} g @param {number} b its colour @param {number} seed
   * @param {boolean} lit @param {number} eR @param {number} eG @param {number} eB its emitted light
   */
  _splatPowder(i, ph, fx, fy, r, g, b, seed, lit, eR, eG, eB) {
    const { p, s, bx, by, w, h, liq, sol, grain, emit, mfx, solBest, solIdx, dot, flow, fxMask, art, artW, rl, rs, rgas, rgrain, RL, RS, RG, T, GD, gK, gExt, time } = this.fc;
    // a few small, irregular chips and a stray speck or two: each chip a
    // lobed blob with a ragged edge, lit from the upper left. A grain of
    // an ingredient with procedural pieces takes its chips' colours from its
    // spot in its piece (a crushed object's grains carry the colours of
    // the part they broke from), blending toward the brew's colour as it
    // dissolves away.
    const frozen = p.gran[i] < 0.5;
    const damp = !frozen && p.gran[i] < 0.96 ? Math.min(0.45, (0.97 - p.gran[i]) * 1.6) : 0;
    const burnL = p.burn[i] > 0.1 ? 1 + p.burn[i] : 1;
    const pc = art && p.skin[i] ? piece(p.skin[i]) : null;
    const pal = pc ? piecePalette(p.skin[i]) : null;
    const wArt = pc ? Math.max(0, Math.min(1, (p.whole[i] - 0.3) * 2)) : 0;
    const rx = Math.round(fx), ry = Math.round(fy);
    // an ingredient ground with the pestle (or a powder of one) is sand:
    // many grains in the colours of its piece, not a few chips. Each grain
    // is a chunky 2–3 px fleck spread a little past the particle, so a heap
    // reads as solid, full-bodied sand while every grain stays distinct.
    const sand = !!pc && !frozen;
    const chips = sand ? 14 + (seed & 3) : 6 + (seed & 1);
    const specks = sand ? 5 : 3;
    for (let c = 0; c < chips + specks; c++) {
      const h1 = hash01(seed + c * 7919), h2 = hash01(seed * 3 + c * 104729 + 1), h3 = hash01(seed * 7 + c * 1299709 + 2);
      const speck = c >= chips;
      const an = h1 * 6.2832;
      const dist = speck ? rgrain * ((sand ? 1 : 0.85) + 0.45 * h2) : c === 0 ? 0 : Math.sqrt(h2) * rgrain * (sand ? 1.15 : 0.75);
      const rc = speck ? 0.5 : sand ? (h3 < 0.55 ? 0.95 : h3 < 0.9 ? 1.2 : 1.45) : Math.max(0.8, rgrain * (0.3 + 0.18 * h3));
      const ccx = fx + Math.cos(an) * dist, ccy = fy + Math.sin(an) * dist;
      // a second, smaller lobe makes the chip irregular rather than round
      const lcx = ccx + Math.cos(h3 * 6.2832) * rc * 0.65, lcy = ccy + Math.sin(h3 * 6.2832) * rc * 0.65;
      let cr = r, cg = g, cb = b;
      if (pc && wArt > 0) {
        const u = p.skinU[i] + (ccx - fx) / (s * SIM.SPACING) + (h1 - 0.5) * 0.5, v = p.skinV[i] + (ccy - fy) / (s * SIM.SPACING) + (h3 - 0.5) * 0.5;
        const tx = Math.floor(pc.ax + u * pc.ppu), ty = Math.floor(pc.ay + v * pc.ppu);
        let t = tx >= pc.cx && ty >= pc.cy && tx < pc.cx + PIECE_CELL && ty < pc.cy + PIECE_CELL ? /** @type {Uint32Array} */ (art)[ty * artW + tx] : 0;
        if (!(t >>> 31) && pal) t = pal[Math.floor(h2 * pal.length)];
        if (t >>> 31) {
          cr = ((t & 255) / 255) * wArt + r * (1 - wArt);
          cg = (((t >>> 8) & 255) / 255) * wArt + g * (1 - wArt);
          cb = (((t >>> 16) & 255) / 255) * wArt + b * (1 - wArt);
        }
      } else {
        // no painting: chips of the grain's own colour, each a shade apart
        const k = 0.8 + 0.34 * h3;
        cr = r * k; cg = g * (k + (h1 - 0.5) * 0.06); cb = b * (k + (h2 - 0.5) * 0.06);
      }
      const R2 = rc * rc, L2 = R2 * 0.5;
      const x0 = Math.max(0, Math.floor(Math.min(ccx, lcx) - rc)), x1 = Math.min(w - 1, Math.ceil(Math.max(ccx, lcx) + rc));
      const y0 = Math.max(0, Math.floor(Math.min(ccy, lcy) - rc)), y1 = Math.min(h - 1, Math.ceil(Math.max(ccy, lcy) + rc));
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const hv = hash01(seed + (xx - rx + 15) * 31 + (yy - ry + 15) * 977 + c * 65537);
          const dx = xx + 0.5 - ccx, dy = yy + 0.5 - ccy, ex = xx + 0.5 - lcx, ey = yy + 0.5 - lcy;
          // a ragged edge: border pixels come and go with the hash
          const edge = 0.62 + 0.5 * hv;
          const inside = speck ? (xx === Math.floor(ccx) && yy === Math.floor(ccy)) : (dx * dx + dy * dy < R2 * edge || ex * ex + ey * ey < L2 * edge);
          if (!inside) continue;
          let lum = speck ? 0.9 + hv * 0.2 : 1 + 0.24 * Math.max(-1, Math.min(1, -(dx + dy) / (rc * 1.4))) + (hv - 0.5) * 0.12;
          if (frozen) lum = 0.95 + hv * 0.12;
          lum *= (1 - damp) * burnL;
          const R8 = clamp255(cr * lum * 255), G8 = clamp255(cg * lum * 255), B8 = clamp255(cb * lum * 255);
          grain[yy * w + xx] = 0xff000000 | (B8 << 16) | (G8 << 8) | R8;
          if (lit) { const e = (yy * w + xx) * 4; emit[e] += eR; emit[e + 1] += eG; emit[e + 2] += eB; emit[e + 3] += 1; if (nc) addMagic(mfx, yy * w + xx, 1); }
        }
      }
    }
  }

  /**
   * One particle of a solid body, into the solid field.
   * @param {number} i @param {number} ph @param {number} fx @param {number} fy its spot in the region
   * @param {number} r @param {number} g @param {number} b its colour @param {number} seed
   * @param {boolean} lit @param {number} eR @param {number} eG @param {number} eB its emitted light
   */
  _splatSolid(i, ph, fx, fy, r, g, b, seed, lit, eR, eG, eB) {
    const { p, s, bx, by, w, h, liq, sol, grain, emit, mfx, solBest, solIdx, dot, flow, fxMask, art, artW, rl, rs, rgas, rgrain, RL, RS, RG, T, GD, gK, gExt, time } = this.fc;
    const cx = fx | 0, cy = fy | 0;
    const inv = 1 / (rs * rs);
    for (let dy = -RS; dy <= RS; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= h) continue;
      const ddy = yy + 0.5 - fy;
      for (let dx = -RS; dx <= RS; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= w) continue;
        const ddx = xx + 0.5 - fx;
        const q = 1 - (ddx * ddx + ddy * ddy) * inv;
        if (q <= 0) continue;
        const k = yy * w + xx;
        const k4 = k * 4;
        sol[k4] += q; sol[k4 + 1] += q * r; sol[k4 + 2] += q * g; sol[k4 + 3] += q * b;
        if (q > solBest[k]) { solBest[k] = q; solIdx[k] = i; }
        if (lit) { emit[k4] += q * eR; emit[k4 + 1] += q * eG; emit[k4 + 2] += q * eB; emit[k4 + 3] += q; if (nc) addMagic(mfx, k, q); }
      }
    }
  }

  /**
   * One vapour particle: its share of the half-resolution cloud, and its droplets.
   * @param {number} i @param {number} ph @param {number} fx @param {number} fy its spot in the region
   * @param {number} r @param {number} g @param {number} b its colour @param {number} seed
   * @param {boolean} lit @param {number} eR @param {number} eG @param {number} eB its emitted light
   */
  _splatGas(i, ph, fx, fy, r, g, b, seed, lit, eR, eG, eB) {
    const { p, s, bx, by, w, h, liq, sol, grain, emit, mfx, solBest, solIdx, dot, flow, fxMask, art, artW, rl, rs, rgas, rgrain, RL, RS, RG, T, GD, gK, gExt, time } = this.fc;
    // vapour is splatted at half resolution with a wide kernel and then
    // blurred, so it reads as one continuous cloud, not separate puffs
    // (the kernel is stamped whole, centred on the particle's
    // half-resolution pixel: the blur after hides the rounding)
    const cx = (fx * 0.5) | 0, cy = (fy * 0.5) | 0;
    const hw = this.hw, hh = this.hh, gas = this.gas;
    // gas is pale: blend its colour toward white
    const gr0 = r * 0.5 + 0.5, gg0 = g * 0.5 + 0.5, gb0 = b * 0.5 + 0.5;
    for (let dy = -RG; dy <= RG; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= hh) continue;
      const ext = gExt[dy + RG];
      if (ext < 0) continue;
      const x0 = Math.max(0, cx - ext), x1 = Math.min(hw - 1, cx + ext), ko = (dy + RG) * GD + RG - cx;
      for (let xx = x0; xx <= x1; xx++) {
        const q = gK[ko + xx];
        const k = (yy * hw + xx) * 4;
        gas[k] += q; gas[k + 1] += q * gr0; gas[k + 2] += q * gg0; gas[k + 3] += q * gb0;
      }
    }
    // the droplets: each rises a little, sways, and fades in and out on
    // its own cycle, then appears again elsewhere around its particle
    const mote = this.mote, R0 = rgas * 1.7, rise = 0.07 * s;
    const mr = r * 0.6 + 0.4, mg = g * 0.6 + 0.4, mb = b * 0.6 + 0.4;
    const nm = 12 + (seed & 7);
    for (let m = 0; m < nm; m++) {
      const h1 = hash01(seed + m * 7919), h2 = hash01(seed * 3 + m * 104729 + 1), h3 = hash01(seed * 7 + m * 1299709 + 2);
      const t = time * (0.3 + 0.35 * h2) + h1;
      const cyc = Math.floor(t), ph = t - cyc;
      // a new spot every cycle
      const h4 = hash01(seed + m * 31 + cyc * 65537);
      const dist = Math.sqrt(hash01(seed * 5 + m * 17 + cyc * 92821)) * R0;
      // (sines from the table: a 1/1024 turn is plenty for a pixel)
      const ai = (h4 * 1024) | 0;
      const mx = fx + SIN[(ai + 256) & 1023] * dist + SIN[((time * 0.27056 + h3) * 1024) & 1023] * 1.2;
      const my = fy + SIN[ai & 1023] * dist * 0.8 - ph * rise;
      const a = Math.min(1, SIN[(ph * 512) | 0] * 1.4) * (0.55 + 0.45 * h3);
      const sz = h2 > 0.7 ? 2 : 1;
      const x0 = Math.floor(mx), y0 = Math.floor(my);
      for (let yy = y0; yy < y0 + sz; yy++) {
        if (yy < 0 || yy >= h) continue;
        for (let xx = x0; xx < x0 + sz; xx++) {
          if (xx < 0 || xx >= w) continue;
          const k = (yy * w + xx) * 4;
          mote[k] += a; mote[k + 1] += a * mr; mote[k + 2] += a * mg; mote[k + 3] += a * mb;
        }
      }
    }
    if (lit) {
      const px = Math.min(h - 1, Math.max(0, fy | 0)) * w + Math.min(w - 1, Math.max(0, fx | 0)), k = px * 4;
      emit[k] += eR * 0.35; emit[k + 1] += eG * 0.35; emit[k + 2] += eB * 0.35; emit[k + 3] += 0.35;
      if (nc) addMagic(mfx, px, 0.35);
    }
  }

  /**
   * A pixel of a solid body (frozen ice, or a whole ingredient drawn from
   * its own material): its colour times its light, and opacity, in the
   * returned scratch.
   * @param {number} x @param {number} y @param {number} k its pixel @param {number} sw the solid weight there
   * @returns {Float64Array} r, g, b (lit), a
   */
  _solidPixel(x, y, k, sw) {
    const { sim, p, s, view, bx, by, w, h, sol, solIdx, art, artW } = this.fc;
    const bi = solIdx[k];
    const up = y > 0 ? sol[(k - w) * 4] : 0, left = x > 0 ? sol[(k - 1) * 4] : 0, down = y < h - 1 ? sol[(k + w) * 4] : 0, right = x < w - 1 ? sol[(k + 1) * 4] : 0;
    const edgeHi = up < 0.45 || left < 0.45, edgeLo = down < 0.45 || right < 0.45;
    const inv = 1 / sw;
    let r = sol[k * 4 + 1] * inv, g = sol[k * 4 + 2] * inv, b = sol[k * 4 + 3] * inv;
    let l = 1, a = 0.97;
    if (p.whole[bi] > 0.5) {
      // a whole ingredient: its own surface, shaded, with pestle cracks.
      // The pattern is laid out in the body's own frame (rest shape and
      // rotation), so it is continuous across the object and tumbles
      // with it; a loose fragment carries the piece it broke off with.
      const gi = p.group[bi];
      const th = gi >= 0 ? sim.rigid.angle[gi] : 0;
      const ddx = (x + 0.5 - (p.x[bi] * s + view.ox - bx)) / s, ddy = (y + 0.5 - (p.y[bi] * s + view.oy - by)) / s;
      const ct = Math.cos(th), st = Math.sin(th);
      const ox = ct * ddx + st * ddy, oy = -st * ddx + ct * ddy;
      const lx = p.restX[bi] + ox, ly = p.restY[bi] + oy;
      const u = Math.floor(lx * s * 0.75), v = Math.floor(ly * s * 0.75);
      const sd = gi >= 0 ? gi * 7919 + 13 : p.seed[bi];
      const hv = hash01(sd + (u + 4096) * 37 + (v + 4096) * 1013);
      const pc = art && p.skin[bi] ? piece(p.skin[bi]) : null;
      if (pc) {
        // its piece, read where this pixel falls in it (each
        // particle knows its own spot, so broken-off bits keep theirs);
        // the blob around the piece's outline stays clear
        const tx = Math.floor(pc.ax + (p.skinU[bi] + ox / SIM.SPACING) * pc.ppu);
        const ty = Math.floor(pc.ay + (p.skinV[bi] + oy / SIM.SPACING) * pc.ppu);
        const c = tx >= pc.cx && ty >= pc.cy && tx < pc.cx + PIECE_CELL && ty < pc.cy + PIECE_CELL ? /** @type {Uint32Array} */ (art)[ty * artW + tx] : 0;
        if (c >>> 31) {
          r = (c & 255) / 255; g = ((c >>> 8) & 255) / 255; b = ((c >>> 16) & 255) / 255;
          a = 1;
        } else a = 0;
      } else switch (p.look[bi]) {
        case LOOK.FIBRE: { // fibres along the root, the odd knot
          const band = Math.floor(ly * s * 0.55);
          l = (band & 1) ? 0.8 + hv * 0.08 : 0.97 + hv * 0.08;
          if (hash01(sd + Math.floor(lx * s * 0.25) * 53 + band * 7) < 0.05) l = 0.66;
          break;
        }
        case LOOK.LEAF: { // a bright midrib and paired veins
          const av = Math.abs(ly * s);
          l = av < 0.7 ? 1.16 : ((Math.floor(Math.abs(lx) * s * 0.5) + Math.floor(av * 0.5)) % 3 === 0 ? 1.06 : 0.9 + hv * 0.06);
          break;
        }
        case LOOK.STONE: l = hv < 0.13 ? 0.7 : hv > 0.93 ? 1.16 : 0.9 + hv * 0.1; break;
        case LOOK.CRYSTAL: { // long facets down the prism
          const f = Math.floor((ly * 0.9 - lx * 0.35) * s * 0.4);
          l = (f % 3 + 3) % 3 === 0 ? 1.14 : (f % 3 + 3) % 3 === 1 ? 0.84 : 0.97;
          a = 0.9;
          break;
        }
        case LOOK.CAP: l = (ly < 0 && hv < 0.08) ? 1.45 : ly > 0.05 ? 1.08 : 0.94 + hv * 0.06; break;
        case LOOK.GLOSSY: l = Math.abs(lx * 0.7 + ly * 0.7 + 0.06) * s < 0.6 ? 1.3 : 0.92 + hv * 0.06; break;
        case LOOK.BONE: l = hv < 0.05 ? 0.8 : Math.abs(ly * s) < 0.6 ? 0.96 : 1.04; break;
        case LOOK.FUR: l = 0.78 + hash01(sd + (u + 4096) * 37 + Math.floor(ly * s * 0.4 + 4096) * 1013) * 0.42; break;
        case LOOK.LUMP: l = Math.abs(lx * 0.7 + ly * 0.7 + 0.05) * s < 0.6 ? 1.32 : 0.88 + hv * 0.06; a = 0.94; break;
        case LOOK.BARK: { // rough plates split by deep, wandering fissures
          const col = Math.floor(lx * s * 0.35);
          const f = ly * s * 0.4 + hash01(sd + (col + 4096) * 97) * 0.9;
          l = f - Math.floor(f) < 0.24 ? 0.58 : 0.9 + hv * 0.14;
          break;
        }
        case LOOK.BERRY: { // round, glossy berries with dark gaps and a bright dot each
          const fx = lx * s * 0.4, fy = ly * s * 0.4, dx = fx - Math.round(fx), dy = fy - Math.round(fy);
          const r2 = dx * dx + dy * dy;
          l = r2 > 0.2 ? 0.55 : dx < -0.08 && dy < -0.08 && r2 < 0.1 ? 1.55 : 1.02 - r2;
          break;
        }
        case LOOK.GILLS: { // fine lamellae fanning out from the stalk
          const ang = Math.atan2(ly + 1.5, lx);
          l = (Math.floor(ang * 14 / Math.PI + 64) & 1) ? 0.78 : 1.04 + hv * 0.05;
          break;
        }
        case LOOK.SEED: { // diagonal ribs
          const rb = Math.floor((lx * 0.8 + ly * 0.6) * s * 0.55);
          l = (rb & 1) ? 0.74 : 1.06 + hv * 0.05;
          break;
        }
        case LOOK.SHELL: { // concentric growth rings with a pearly sheen
          const ring = Math.floor(Math.hypot(lx, ly - 1.2) * s * 0.45);
          l = (ring & 1) ? 0.86 : 1.08;
          if (hv > 0.9) { l = 1.35; r = r * 0.7 + 0.3; g = g * 0.7 + 0.28; b = b * 0.7 + 0.32; }
          break;
        }
        case LOOK.METAL: // bands of metallic sheen and the odd bright fleck
          l = 0.7 + 0.5 * Math.abs(Math.sin(ly * s * 0.22 + lx * s * 0.05)) + (hv > 0.96 ? 0.35 : 0);
          break;
        case LOOK.GLASS: { // dark glass with sharp, curving glints
          const c = Math.sin((lx * 1.3 + ly * ly * 0.6) * s * 0.3);
          l = c > 0.9 ? 1.7 : 0.72 + hv * 0.06;
          a = 0.95;
          break;
        }
        case LOOK.SPOTS: { // white warts scattered over the cap
          const fx = lx * s * 0.28, fy = ly * s * 0.28, cx = Math.floor(fx), cy = Math.floor(fy);
          const dx = fx - cx - 0.5, dy = fy - cy - 0.5;
          if (hash01(sd + (cx + 4096) * 131 + (cy + 4096) * 977) < 0.4 && dx * dx + dy * dy < 0.08) { r = 0.95; g = 0.93; b = 0.88; l = 1; }
          else l = 0.95 + hv * 0.08;
          break;
        }
        case LOOK.REED: // fine velvet striations along the stem
          l = (Math.floor(lx * s * 0.9) & 1 ? 0.86 : 1.0) + hv * 0.08;
          break;
        case LOOK.FLORET: // a froth of tiny florets
          l = hv > 0.72 ? 1.32 : hv < 0.16 ? 0.72 : 0.98;
          break;
        default: l = 0.92 + hv * 0.1;
      }
      if (!pc) { if (edgeHi) l *= 1.16; else if (edgeLo) l *= 0.64; }
      // cracks open up as the pestle damages it
      const dmg = sim.dmg[bi] / (0.25 + p.hardness[bi] * 1.5);
      if (dmg > 0.12 && hash01(p.seed[bi] * 3 + (u + 4096) * 7 + (v + 4096) * 131) < dmg * 0.4) l *= 0.42;
    } else {
      // frozen liquid: frosty, lighter body with a bright rim and a few
      // facets; melting clears the frost back toward the liquid colour
      const melt = p.lat[bi] > 0 && p.latF[bi] > 0 ? Math.min(1, p.lat[bi] / p.latF[bi]) : 0;
      const frost = 1 - melt * 0.8;
      r = r * (1 - 0.45 * frost) + 0.42 * frost; g = g * (1 - 0.45 * frost) + 0.45 * frost; b = b * (1 - 0.45 * frost) + 0.5 * frost;
      l = 0.78 + 0.22 * Math.min(1, sw / 1.6);
      if (edgeHi) l = 1.18 - 0.2 * melt; else if (edgeLo) l = 0.72;
      else if (((x * 7 + y * 13) % 23) === 0) l = 1.12;
      a = 0.92 - 0.12 * melt;
    }
    const px = this.px4;
    px[0] = r * l; px[1] = g * l; px[2] = b * l; px[3] = a;
    return px;
  }

  /**
   * Work out a droplet cell of brew once a frame, from its centre (qx, qy):
   * its colour, shading and grain, and opacity, into cellCol (cellSt 2),
   * or none (cellSt 1).
   * @param {number} ci @param {number} qx @param {number} qy
   */
  _liquidCell(ci, qx, qy) {
    const { w, h, bx, by, liq, lc, wb, dot, cellSt, cellCol, thr, PQ, PW, sf, depthScale, twinkle, thermal } = this.fc;
    cellSt[ci] = 1;
    if (!(wb[qy * w + qx] > thr)) return;
    const x = qx, y = qy, k = qy * w + qx;
    // colour from this pixel, or from the strongest neighbour in the
    // small gaps the smoothing fills in
    let kc = k, lw = liq[k * LS];
    if (lw < 0.06) {
      if (x > 0 && liq[(k - 1) * LS] > lw) { kc = k - 1; lw = liq[kc * LS]; }
      if (x < w - 1 && liq[(k + 1) * LS] > lw) { kc = k + 1; lw = liq[kc * LS]; }
      if (y < h - 1 && liq[(k + w) * LS] > lw) { kc = k + w; lw = liq[kc * LS]; }
      if (y > 0 && liq[(k - w) * LS] > lw) { kc = k - w; lw = liq[kc * LS]; }
      if (lw < 1e-4) return;
    }
    const inv = 1 / lw;
    // (the softened colour is only worked out at cell centres)
    const c9 = kc * LS, c6 = k * LC, lcw = lc[c6];
    if (lcw < 1e-5) return;
    const ic = 1 / lcw;
    let r = lc[c6 + 1] * ic, g = lc[c6 + 2] * ic, b = lc[c6 + 3] * ic;
    const paste = lc[c6 + 5] * ic;
    const opac = lc[c6 + 4] * ic;
    let a = Math.min(0.96, 0.7 + 0.3 * opac);
    const tex = liq[c9 + 6] * inv;
    const up = y >= PQ ? wb[k - PW] : 0;
    const down = y < h - PQ ? wb[k + PW] : 0;
    let l = 1;
    // Liquid and paste are shaded their own ways, blended by how much
    // of the pixel is paste: a stirred brew interleaves the two, and
    // a hard switch between them would draw sharp colour edges.
    const tP = paste <= 0.2 ? 0 : paste >= 0.8 ? 1 : ((paste - 0.2) / 0.6) * ((paste - 0.2) / 0.6) * (3 - 2 * ((paste - 0.2) / 0.6));
    const depth = Math.max(0, (y - sf[x]) * depthScale);
    // ordered dither threshold of this pixel (4×4 Bayer), for pixel-art bands
    const bay = BAYER[(Math.floor((y + by) / PQ) & 3) * 4 + (Math.floor((x + bx) / PQ) & 3)];
    let rL = r, gL = g, bL = b, lL = 1, rP = r, gP = g, bP = b, lP = 1;
    if (tP < 1) {
      // light crosses more of the brew the deeper it is: each channel
      // is absorbed by its own amount (Beer–Lambert on the brew's
      // transmitted colour), so the colour deepens and saturates
      // downward from a bright, thin surface layer to a rich, dark
      // heart. Clear liquids deepen faster (the dark iron shows
      // through); opaque ones keep more of their colour.
      const clear = Math.max(0, 1 - opac);
      // in dithered steps, so the colour deepens in pixel-art bands
      const path = Math.min(4.5, Math.floor((0.75 + depth * (0.9 + 2 * clear)) * 5 + bay) / 5);
      rL = Math.pow(Math.max(0.02, r), path); gL = Math.pow(Math.max(0.02, g), path); bL = Math.pow(Math.max(0.02, b), path);
      // texture carried by the particles: currents show as soft light
      // and shade moving with the brew
      lL = (1 + Math.floor(tex * 1.5 + bay) * 0.035) * (1 - clear * 0.18) * (1 - Math.min(0.3, depth * 0.1));
      // each particle's own speck of grain
      const dv = dot[k];
      // (fading out where the brew thickens into paste)
      if (dv > 0 && paste < 0.25) {
        const tone = dv - 3, gr = 1 - paste * 4;
        lL *= 1 + gr * (tone >= 2 ? 0.12 + 0.18 * Math.max(0, Math.sin(twinkle * 1.3 + tone * 40)) : tone * 0.15);
      }
      if (up <= thr) lL = 1.32; // meniscus highlight
      else if (y >= 2 * PQ && wb[k - 2 * PW] <= thr) lL = 1.16; // sheen just under the surface
      else if (y >= 3 * PQ && wb[k - 3 * PW] <= thr) lL *= 1.07;
      // the lower edge against the iron gets a thin shadow line
      if (down <= thr) lL *= 0.7;
    }
    if (tP > 0) {
      // thick, opaque, grainy paste with a soft dark outline; it
      // deepens a little with depth too, so it sits in the brew
      const path = Math.min(2, 1 + depth * 0.3);
      rP = Math.pow(Math.max(0.02, r), path); gP = Math.pow(Math.max(0.02, g), path); bP = Math.pow(Math.max(0.02, b), path);
      lP = (0.92 + tex * 0.09) * (1 - Math.min(0.2, depth * 0.06));
      if (up <= thr) lP = 1.12;
      else if (down <= thr || (x >= PQ && wb[k - PQ] <= thr) || (x < w - PQ && wb[k + PQ] <= thr)) lP = 0.7;
    }
    r = rL + (rP - rL) * tP; g = gL + (gP - gL) * tP; b = bL + (bP - bL) * tP;
    l = lL + (lP - lL) * tP;
    a = a + (1 - a) * tP;
    // slush: liquid giving up its latent heat clouds over with ice crystals
    const slush = liq[c9 + 8] * inv;
    if (slush > 0.04) {
      const f = Math.min(0.75, slush * 0.85);
      r = r * (1 - f) + 0.82 * f; g = g * (1 - f) + 0.9 * f; b = b * (1 - f) + 0.98 * f;
      if (((x * 5 + y * 3) % 7) === 0 && slush > 0.3) l *= 1.15;
      a = Math.max(a, 0.9);
    }
    const temp = liq[c9 + 7] * inv;
    if (thermal) {
      const tt = Math.max(0, Math.min(1, (temp + 20) / 140));
      r = tt; g = 0.25 + 0.3 * (1 - Math.abs(tt - 0.5) * 2); b = 1 - tt;
      a = 0.9;
    } else if (temp > 70) {
      const hh = Math.min(0.25, (temp - 70) / 400);
      r += hh; g += hh * 0.3;
    }
    r *= l; g *= l; b *= l;
    const c4 = ci * 4;
    cellCol[c4] = r; cellCol[c4 + 1] = g; cellCol[c4 + 2] = b; cellCol[c4 + 3] = a;
    cellSt[ci] = 2;
  }

  /**
   * Lay every pixel of the region: grains, solid bodies, the brew's droplet
   * cells, vapour, and the light of glowing matter, into the image.
   * @param {boolean} anyGrain @param {boolean} anySolid @param {boolean} anyGas @param {boolean} anyGlow
   * @param {boolean} pieces whether whole ingredients were painted @param {number} fxMask
   * @returns {number} how many pixels the effects' particles may swim in
   */
  _compose(anyGrain, anySolid, anyGas, anyGlow, pieces, fxMask) {
    const { sim, p, w, h, sol, solIdx, emit, cellSt, cellCol, thermal, twinkle } = this.fc;
    const grain = this.grain, gas = this.gas, pieceCol = this.pieceCol, pieceIdx = this.pieceIdx, data = this.image.data;
    const colCell = this.colCell, colQ = this.colQ, rowCell = this.rowCell, rowQ = this.rowQ;
    let fxN = 0;
    const hw = this.hw;
    for (let y = 0; y < h; y++) {
      const row = y * w, hrow = (y >> 1) * hw, rc = rowCell[y], qy = rowQ[y];
      for (let x = 0; x < w; x++) {
        const k = row + x;
        let R = 0, G = 0, B = 0, A = 0, fxLiq = false;
        // grains (opaque)
        const gp = anyGrain ? grain[k] : 0;
        if (gp) {
          R = (gp & 255) / 255; G = ((gp >>> 8) & 255) / 255; B = ((gp >>> 16) & 255) / 255; A = 1;
        }
        // solid bodies: frozen ice or a whole ingredient
        const sw = anySolid ? sol[k * 4] : 0;
        const pcol = pieces ? pieceCol[k] : 0;
        if (pcol) {
          // a whole ingredient's own sprite pixel, cracked by the pestle
          const bi = pieceIdx[k];
          let l = 1;
          const dmg = sim.dmg[bi] / (0.25 + p.hardness[bi] * 1.5);
          // worn, not shattered: a few soft scuffs where the pestle grinds it
          if (dmg > 0.2 && hash01(p.seed[bi] * 3 + (x >> 1) * 7 + (y >> 1) * 131) < (dmg - 0.2) * 0.25) l = 0.78;
          R = (pcol & 255) / 255 * l; G = ((pcol >>> 8) & 255) / 255 * l; B = ((pcol >>> 16) & 255) / 255 * l; A = 1;
        } else if (sw > 0.45 && !(pieces && p.whole[solIdx[k]] > 0.5 && p.group[solIdx[k]] >= 0 && p.skin[solIdx[k]])) {
          const px = this._solidPixel(x, y, k, sw), a = px[3];
          R = R * (1 - a) + px[0] * a; G = G * (1 - a) + px[1] * a; B = B * (1 - a) + px[2] * a; A = A + (1 - A) * a;
        }
        // liquid / paste, drawn in droplet-sized pixel cells: the whole
        // cell takes the colour, shading and grain read at its centre
        const qx = colQ[x], ci = rc >= 0 && colCell[x] >= 0 ? rc + colCell[x] : -1;
        if (ci >= 0 && cellSt[ci] === 0) this._liquidCell(ci, qx, qy);
        if (ci >= 0 && cellSt[ci] === 2) {
          const c4 = ci * 4, a = cellCol[c4 + 3];
          R = R * (1 - a) + cellCol[c4] * a; G = G * (1 - a) + cellCol[c4 + 1] * a; B = B * (1 - a) + cellCol[c4 + 2] * a;
          A = A + (1 - A) * a;
          // the effects' particles swim in it (below)
          if (fxMask && !thermal) fxLiq = true;
        }
        // vapour: the blurred half-resolution haze, in 2×2 pixel blocks
        if (anyGas) {
          const g4 = (hrow + (x >> 1)) * 4, a = gas[g4];
          if (a > 0) {
            R = R * (1 - a) + gas[g4 + 1] * a; G = G * (1 - a) + gas[g4 + 2] * a; B = B * (1 - a) + gas[g4 + 3] * a;
            A = A + (1 - A) * a;
          }
          const mote = this.mote, m4 = k * 4, ma = mote[m4];
          if (ma > 0.02) {
            const a = Math.min(0.9, ma), inv = 1.12 / ma;
            R = R * (1 - a) + mote[m4 + 1] * inv * a; G = G * (1 - a) + mote[m4 + 2] * inv * a; B = B * (1 - a) + mote[m4 + 3] * inv * a;
            A = A + (1 - A) * a;
          }
        }
        // emitted light: luminous or burning matter glows (magic adds none)
        if (anyGlow && !thermal) {
          const e4 = k * 4, ew = emit[e4 + 3];
          if (ew > 0.02 && A > 0.05) {
            const inv = 1 / Math.max(ew, 0.6);
            // a few sparkling pixels where it is strong
            const sp = ((x * 13 + y * 7) % 31 === 0) ? 1.6 + 0.8 * Math.max(0, Math.sin(twinkle + x * 0.7 + y)) : 1;
            const e0 = emit[e4] * inv * sp, e1 = emit[e4 + 1] * inv * sp, e2 = emit[e4 + 2] * inv * sp;
            // the matter first takes on the light's hue at its own brightness,
            // then the light is screened on top without washing out to white
            const eM = Math.max(e0, e1, e2);
            if (eM > 0.01) {
              const t = Math.min(0.6, eM * 0.7), lum = Math.max(R, G, B) / eM;
              R += (e0 * lum - R) * t; G += (e1 * lum - G) * t; B += (e2 * lum - B) * t;
            }
            const er = Math.min(1, e0 * 0.6), eg = Math.min(1, e1 * 0.6), eb = Math.min(1, e2 * 0.6);
            R = 1 - (1 - R) * (1 - er); G = 1 - (1 - G) * (1 - eg); B = 1 - (1 - B) * (1 - eb);
          }
        }
        // where magic is in the liquid, the effects' particles may swim
        if (fxLiq && emit[k * 4 + 3] > 0.02 && A > 0.05) { this.fxLiq[k] = 1; this.fxPix[fxN++] = k; }
        const o = k * 4;
        if (A <= 0.003) {
          data[o + 3] = 0;
          continue;
        }
        data[o] = clamp255(R * 255);
        data[o + 1] = clamp255(G * 255);
        data[o + 2] = clamp255(B * 255);
        data[o + 3] = clamp255(A * 255);
      }
    }
    return fxN;
  }

  /** (Re)allocate buffers for a pixel region. */
  _alloc(w, h) {
    const n = w * h;
    if (n > this.cap) {
      this.cap = n;
      // Accumulators are interleaved per pixel (one cache line instead of
      // separate arrays).
      this.liq = new Float32Array(n * LS);
      this.sol = new Float32Array(n * 4);
      this.emit = new Float32Array(n * 4); // emitted light r, g, b and kernel weight
      this.mfx = new Float32Array(n * NE); // emitted magic, per effect
      this.solBest = new Float32Array(n); // strongest solid particle at a pixel…
      this.solIdx = new Int32Array(n); // …and its index
      this.pieceCol = new Uint32Array(n); // a whole ingredient's painted pixel (0 = none)…
      this.pieceIdx = new Int32Array(n); // …and a particle of its body (for the pestle's cracks)
      this.wb = new Float32Array(n); // smoothed liquid weight (surface shape)
      this.wt = new Float32Array(n); // blur scratch
      this.lc = new Float32Array(n * LC); // softened liquid colour: weight, r, g, b, opacity, paste
      this.lct = new Float32Array(n * LC); // its blur scratch
      this.grain = new Uint32Array(n); // packed grain colour (0 = none)
      this.fxLiq = new Uint8Array(n); // liquid the effects' particles may swim in…
      this.fxPix = new Int32Array(n); // …and the list of those pixels
      this.flow = new Float32Array(n * 2); // the liquid's velocity (screen px per simulated second), weighted
      this.dot = new Float32Array(n); // a liquid particle's own pixel grain (0 none, else 3 + its tone)
    }
    if (w !== this.w || h !== this.h || !this.canvas) {
      this.w = w;
      this.h = h;
      this.canvas = makeCanvas(w, h);
      this.ctx = /** @type {any} */ (this.canvas).getContext('2d');
      this.image = this.ctx.createImageData(w, h);
      const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
      this.hw = hw; this.hh = hh;
      this.haloCanvas = makeCanvas(hw, hh);
      this.haloCtx = /** @type {any} */ (this.haloCanvas).getContext('2d');
      this.haloImage = this.haloCtx.createImageData(hw, hh);
      this.haloAcc = new Float32Array(hw * hh * 3);
      this.haloTmp = new Float32Array(hw * hh * 3);
      this.gas = new Float32Array(hw * hh * 4); // vapour weight + colour at half resolution
      this.mote = new Float32Array(w * h * 4); // vapour droplets: alpha + colour, full resolution
      this.gasTmp = new Float32Array(hw * hh * 4);
    }
  }

  /**
   * Render all particles into an offscreen image.
   * @param {import('../simulation/world.js').Simulation} sim
   * @param {{scale:number, ox:number, oy:number}} view  screen = world*scale + offset
   * @param {number} time seconds (for subtle animation)
   * @returns {{canvas:any, x:number, y:number, halo:any}|null}
   */
  render(sim, view, time) {
    const p = sim.p, n = p.count;
    if (n === 0) return null;
    const s = view.scale;
    // bounding box in screen pixels
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    let anySolid = false, anyGas = false, anyGrain = false, anyLight = false, anyGlow = false, fxMask = 0;
    for (let i = 0; i < n; i++) {
      const x = p.x[i] * s + view.ox, y = p.y[i] * s + view.oy;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const ph = p.phase[i];
      if (ph === SOLID) anySolid = true; else if (ph === GAS) anyGas = true; else if (ph === POWDER) anyGrain = true;
      if (p.auraI[i] > 0.002 || p.glow[i] > 0.02 || p.burn[i] > 0.02) anyLight = true;
      if (p.glow[i] > 0.02 || p.burn[i] > 0.02) anyGlow = true;
      if (p.auraI[i] > 0.002) for (let k = 0, o = i * NE; k < NE; k++) if (p.auraFx[o + k] > 0) fxMask |= 1 << k;
    }
    // the pieces' atlas also holds the palettes brews take from their ingredients
    const painted = preparePalettes(sim);
    // awakened forms are drawn with the glow of what they woke from
    const vis = anyGlow ? drawnGlowTable(sim) : null;
    const art = PIECE_ART.ready ? PIECE_ART.px : null, artW = PIECE_ART.width;
    const pad = Math.ceil(0.16 * s) + 8;
    const bx = Math.floor(minX) - pad, by = Math.floor(minY) - pad;
    // the region's size goes up in steps of 8 px, so a brew being stirred
    // or boiling (its extent changing every frame) doesn't make a new
    // canvas and image every frame
    const w = Math.ceil((Math.ceil(maxX) + pad - bx) / 8) * 8, h = Math.ceil((Math.ceil(maxY) + pad - by) / 8) * 8;
    if (w <= 0 || h <= 0 || w * h > 4e6) return null;
    this._alloc(w, h);
    const N = w * h;
    const { liq, sol, gas, grain, emit, mfx, solBest, solIdx } = this;
    // only the fields of phases that are present need clearing and reading
    liq.fill(0, 0, N * LS);
    this.dot.fill(0, 0, N);
    const dot = this.dot;
    if (anySolid) { sol.fill(0, 0, N * 4); solBest.fill(0, 0, N); }
    if (anyGas) { gas.fill(0, 0, this.hw * this.hh * 4); this.mote.fill(0, 0, N * 4); }
    if (anyGrain) grain.fill(0, 0, N);
    if (anyLight) emit.fill(0, 0, N * 4);
    if (fxMask) { mfx.fill(0, 0, N * NE); this.fxLiq.fill(0, 0, N); this.flow.fill(0, 0, N * 2); }
    const flow = this.flow;

    const rl = 0.092 * s; // liquid kernel radius (px), ~1.85 particle radii
    const rs = 0.085 * s; // solid
    const rgas = 0.13 * s; // gas, in half-resolution pixels (wide, soft kernel so vapour reads as fog)
    const rgrain = Math.max(1.2, 0.05 * s * 1.02);
    const RL = Math.ceil(rl), RS = Math.ceil(rs), RG = Math.ceil(rgas);
    const colR = sim.colR, colG = sim.colG, colB = sim.colB;
    const T = p.temp;
    // the vapour's kernel, worked out once: weights by offset from the
    // centre pixel, and how far each row of it reaches
    const GD = 2 * RG + 1;
    // the rows the liquid reaches (vapour rising above it needs none of its passes)
    let lyMin = 1e9, lyMax = -1e9;
    if (anyGas) {
      if (!this.gK || this.gK.length < GD * GD) { this.gK = new Float32Array(GD * GD); this.gExt = new Int32Array(GD); }
      const rg2 = rgas * rgas;
      for (let dy = -RG; dy <= RG; dy++) {
        let ext = -1;
        for (let dx = -RG; dx <= RG; dx++) {
          let q = 1 - (dx * dx + dy * dy) / rg2;
          q = q > 0 ? q * q : 0;
          this.gK[(dy + RG) * GD + dx + RG] = q;
          if (q > 0) ext = Math.max(ext, Math.abs(dx));
        }
        this.gExt[dy + RG] = ext;
      }
    }
    const gK = this.gK, gExt = this.gExt;
    // what the per-phase splatting needs of this frame
    const fc = this.fc;
    fc.p = p; fc.s = s; fc.bx = bx; fc.by = by; fc.w = w; fc.h = h;
    fc.liq = liq; fc.sol = sol; fc.grain = grain; fc.emit = emit; fc.mfx = mfx; fc.solBest = solBest; fc.solIdx = solIdx;
    fc.dot = dot; fc.flow = flow; fc.fxMask = fxMask; fc.art = art; fc.artW = artW;
    fc.rl = rl; fc.rs = rs; fc.rgas = rgas; fc.rgrain = rgrain; fc.RL = RL; fc.RS = RS; fc.RG = RG;
    fc.T = T; fc.GD = GD; fc.gK = gK; fc.gExt = gExt; fc.time = time;

    for (let i = 0; i < n; i++) {
      const ph = p.phase[i];
      const fx = p.x[i] * s + view.ox - bx, fy = p.y[i] * s + view.oy - by;
      let r = colR[i], g = colG[i], b = colB[i];
      // dyed by the dominant colour of the painting of what went into it (brew-palette.js)
      if (painted && p.whole[i] < 0.5 && paletteColour(sim, i)) { r = palCol[0]; g = palCol[1]; b = palCol[2]; }
      const seed = p.seed[i];
      const lit = anyLight && emission(p, i, r, g, b, drawnGlow(p, sim.species, i, vis)) > 0.004;
      const eR = em[0], eG = em[1], eB = em[2];
      if (ph === LIQUID || ph === PASTE) {
        if (fy < lyMin) lyMin = fy;
        if (fy > lyMax) lyMax = fy;
        this._splatLiquid(i, ph, fx, fy, r, g, b, seed, lit, eR, eG, eB);
      } else if (ph === POWDER) this._splatPowder(i, ph, fx, fy, r, g, b, seed, lit, eR, eG, eB);
      else if (ph === SOLID) this._splatSolid(i, ph, fx, fy, r, g, b, seed, lit, eR, eG, eB);
      else if (ph === GAS) this._splatGas(i, ph, fx, fy, r, g, b, seed, lit, eR, eG, eB);
    }
    if (anyGas) this._blurGas();

    // ------------------------------------------------------------ smooth surface
    // The surface is taken from a lightly blurred copy of the liquid field so
    // single particles riding the surface don't read as spikes.
    const wb = this.wb, wt = this.wt;
    // one droplet, one pixel: the brew is drawn in cells about a particle
    // across, aligned to the screen, and each cell is read at its centre —
    // so the fields below are only worked out on the centres' columns
    const thr = 0.3; // liquid surface threshold
    const PQ = dropletCell(s), PW = PQ * w;
    // (offsets kept positive before the %: a negative multiple of PQ gives -0, which de-optimises)
    const OFF = PQ * 8192;
    const cx0 = ((PQ >> 1) - bx + OFF) % PQ, cy0 = ((PQ >> 1) - by + OFF) % PQ;
    const ncx = Math.max(0, Math.ceil((w - cx0) / PQ)), ncy = Math.max(0, Math.ceil((h - cy0) / PQ));
    // the surface's shape: the liquid weight, lightly blurred so single
    // particles riding the surface don't read as spikes
    const ly0 = Math.max(0, Math.floor(lyMin) - RL - 1), ly1 = Math.min(h - 1, Math.ceil(lyMax) + RL + 1);
    for (let x = cx0; x < w; x += PQ) {
      for (let y = 0; y < h; y++) {
        const k = y * w + x, q = k * LS;
        if (y < ly0 || y > ly1) { wt[k] = 0; continue; }
        const l = x > 0 ? liq[q - LS] : 0, r = x < w - 1 ? liq[q + LS] : 0;
        const l2 = x > 1 ? liq[q - 2 * LS] : 0, r2 = x < w - 2 ? liq[q + 2 * LS] : 0;
        const l3 = x > 2 ? liq[q - 3 * LS] : 0, r3 = x < w - 3 ? liq[q + 3 * LS] : 0;
        wt[k] = (liq[q] * 4 + (l + r) * 3 + (l2 + r2) * 2 + (l3 + r3)) * (1 / 16);
      }
      for (let y = 0; y < h; y++) {
        const k = y * w + x;
        const u = y > 0 ? wt[k - w] : 0, d = y < h - 1 ? wt[k + w] : 0;
        wb[k] = (wt[k] * 2 + u + d) * 0.25;
      }
    }
    // the colour is softened over a few pixels more than the particles'
    // own kernels: a brew half stirred holds parcels of different colours
    // side by side, and they should meet in gradients, not hard edges
    // (spread in steps of most of a droplet cell, so colours meet across
    // several cells, not inside one)
    this._softenColour(w, h, Math.max(1, Math.round(PQ * 0.75)), PQ, cx0, cy0, thr);

    // whole ingredients: each body painted as its piece's sprite
    const pieces = anySolid && art ? this._paintPieces(sim, view, bx, by, w, h, art, artW) : false;
    const pieceCol = this.pieceCol, pieceIdx = this.pieceIdx;

    // ------------------------------------------------------------ compose
    const data = this.image.data;
    const lc = this.lc;
    // first liquid pixel of every column → depth below the surface (Beer–Lambert style darkening)
    if (!this.surf || this.surf.length < w) this.surf = new Int32Array(w);
    const surf = this.surf;
    if (!this.surfTmp || this.surfTmp.length < w) this.surfTmp = new Int32Array(w);
    const top = this.surfTmp;
    // a run of liquid this thick above a gap is brew, not drops falling in
    const bodyRun = Math.max(6, Math.round(0.35 * s));
    top.fill(h, 0, w);
    for (let x = cx0; x < w; x += PQ) {
      // the top of the lowest body of liquid in the column: drops falling
      // above it (pouring, condensation) are separate runs and don't count
      let y = h - 1;
      while (y >= 0 && wb[y * w + x] <= thr) y--;
      if (y < 0) { top[x] = h; continue; }
      for (;;) {
        while (y > 0 && wb[(y - 1) * w + x] > thr) y--;
        // bridge a pixel or two of gap (a bubble), not the air above
        let g = y - 1;
        while (g >= 0 && wb[g * w + x] <= thr) g--;
        if (g < 0) break;
        if (y - g <= 3) { y = g; continue; }
        // a wider gap under a thick body of liquid is a hole in the brew
        // (the spoon stirring): the pool's level is still above it, or the
        // whole column under the hole would be shaded as shallow brew
        let t = 0;
        while (g - t >= 0 && t < bodyRun && wb[(g - t) * w + x] > thr) t++;
        if (t >= bodyRun) y = g; else break;
      }
      top[x] = y;
    }
    // the pool's level: a stream being poured, drops falling in or a gap
    // around a floating ingredient are narrow spikes in the first liquid
    // pixel of each column — a median over the neighbouring columns keeps
    // the surface's waves and drops them, so they don't darken whole columns
    const SR = Math.max(4, Math.round(0.3 * s));
    /** @type {number[]} */
    const win = [];
    surf.fill(h, 0, w);
    for (let x = cx0; x < w; x += PQ) {
      win.length = 0;
      for (let xx = x - Math.floor(SR / PQ) * PQ, xe = Math.min(w - 1, x + SR); xx <= xe; xx += PQ) if (xx >= 0 && top[xx] < h) win.push(top[xx]);
      if (!win.length) { surf[x] = h; continue; }
      win.sort((a, b) => a - b);
      surf[x] = win[win.length >> 1];
    }
    // the depth shading is measured down from it, so it must not jump from
    // one column to the next: a wave stirred up steep, or the spoon's
    // vortex, would draw straight walls of darker and lighter brew down
    // through the pool. Two wide box passes ease the level across columns
    // (columns with no brew are left out).
    if (!this.surfF || this.surfF.length < w) { this.surfF = new Float32Array(w); this.surfG = new Float32Array(w); }
    const sf = this.surfF, sg = this.surfG, SB = Math.max(3, Math.round(0.35 * s));
    for (let x = 0; x < w; x++) sf[x] = surf[x];
    for (let pass = 0; pass < 2; pass++) {
      const src = pass ? sg : sf, dst = pass ? sf : sg;
      for (let x = cx0; x < w; x += PQ) {
        if (surf[x] >= h) { dst[x] = h; continue; }
        let sum = 0, cnt = 0;
        for (let xx = x - Math.floor(SB / PQ) * PQ, xe = Math.min(w - 1, x + SB); xx <= xe; xx += PQ) if (xx >= 0 && surf[xx] < h) { sum += src[xx]; cnt++; }
        dst[x] = sum / cnt;
      }
    }
    const depthScale = 1 / Math.max(6, 0.9 * s);
    // each cell's liquid, worked out once (at its first pixel) and reused
    const ncell = ncx * ncy;
    if (!this.cellSt || this.cellSt.length < ncell) { this.cellSt = new Uint8Array(ncell); this.cellCol = new Float32Array(ncell * 4); }
    const cellSt = this.cellSt, cellCol = this.cellCol;
    cellSt.fill(0, 0, ncell);
    Object.assign(fc, { sim, view, sol, solIdx, emit, lc, wb, cellSt, cellCol, thr, PQ, PW, sf, depthScale, twinkle: time * 3.1, thermal: this.thermal });
    const thermal = this.thermal;
    // which cell every column and row falls in (and that cell's centre)
    if (!this.colCell || this.colCell.length < w) { this.colCell = new Int32Array(w); this.colQ = new Int32Array(w); }
    if (!this.rowCell || this.rowCell.length < h) { this.rowCell = new Int32Array(h); this.rowQ = new Int32Array(h); }
    const colCell = this.colCell, colQ = this.colQ, rowCell = this.rowCell, rowQ = this.rowQ;
    for (let x = 0; x < w; x++) { const q = x - (x + bx + OFF) % PQ + (PQ >> 1); colQ[x] = q; colCell[x] = q >= 0 && q < w ? (q - cx0) / PQ : -1; }
    for (let y = 0; y < h; y++) { const q = y - (y + by + OFF) % PQ + (PQ >> 1); rowQ[y] = q; rowCell[y] = q >= 0 && q < h ? ((q - cy0) / PQ) * ncx : -1; }
    const fxN = this._compose(anyGrain, anySolid, anyGas, anyGlow, pieces, fxMask);
    return this._finish(sim, time, fxN, fxMask, anyGlow);
  }

  /**
   * The effects' particles over the brew, the image out to the canvas, and
   * the halo of glowing matter. (Kept apart from render(): these run only
   * on some frames, and the JIT keeps both optimised that way.)
   * @param {import('../simulation/world.js').Simulation} sim @param {number} time
   * @param {number} fxN @param {number} fxMask @param {boolean} anyGlow
   */
  _finish(sim, time, fxN, fxMask, anyGlow) {
    const { w, h, bx, by, mfx, emit, flow, liq, thermal } = this.fc;
    // each effect the brew carries: its particles, drawn over the liquid (potion-fx.js)
    // the brew has moved by what the simulation ran since the last frame
    const simDt = this.simT < 0 || sim.time < this.simT ? 0 : Math.min(0.25, sim.time - this.simT);
    this.simT = sim.time;
    if (fxN) this.fx.step(time, { w, h, bx, by, data: this.image.data, liquid: this.fxLiq, pix: this.fxPix, npix: fxN, mfx, emit, mask: fxMask, flow, weight: liq, stride: LS, simDt });
    else if (this.fx.n) this.fx.clear();
    if (!thermal) directMaterialImage(this.image.data, w, (k) => {
      if (fxN && this.fx.cover[k]) return 'effect';
      const i = this.pieceCol[k] ? this.pieceIdx[k] : this.solIdx[k];
      if (i >= 0 && (this.sol[k * 4] > 0.45 || this.pieceCol[k])) return sim.p.temp[i] < 0 ? 'frozen' : sim.p.phase[i];
      if (this.grain[k] >>> 24 && liq[k * LS] < 0.3) return POWDER;
      const x = k % w, y = Math.floor(k / w), gas = this.gas[((y >> 1) * this.hw + (x >> 1)) * 4];
      if (gas > 0.01 && liq[k * LS] < 0.1) return GAS;
      return liq[k * LS + 5] / Math.max(0.001, liq[k * LS]) > 0.2 ? PASTE : LIQUID;
    }, time);
    this.ctx.putImageData(this.image, 0, 0);
    const halo = anyGlow && this.halo && !thermal ? this._halo(w, h) : null;
    return { canvas: this.canvas, x: bx, y: by, halo };
  }

  /**
   * Paint every whole ingredient (a rigid body of a poured piece) as its
   * piece's sprite, as the menus' icons and the plants in the wilds are
   * drawn: rasterized at the size the physics gives it, one of its pixels
   * to one screen pixel, its ink outline, shading and texture intact, laid
   * out in the body's own frame so it tumbles with it, and only where the
   * body still has particles (the pestle and dissolving eat it away).
   * Fills pieceCol/pieceIdx; false when nothing was painted.
   * @param {import('../simulation/world.js').Simulation} sim @param {{scale:number, ox:number, oy:number}} view
   * @param {number} bx @param {number} by @param {number} w @param {number} h @param {Uint32Array} art @param {number} artW
   */
  _paintPieces(sim, view, bx, by, w, h, art, artW) {
    const p = sim.p, n = p.count, s = view.scale, SP = SIM.SPACING;
    // gather each body: its centre (rho-weighted, as its rest shape is), and
    // the offset between its particles' spots in the piece and their rest places
    const G = this._pg || (this._pg = { used: [], cx: new Float64Array(2048), cy: new Float64Array(2048), m: new Float64Array(2048), u: new Float64Array(2048), v: new Float64Array(2048), k: new Int32Array(2048), skin: new Int32Array(2048), first: new Int32Array(2048), seen: new Uint8Array(2048) });
    const used = G.used;
    used.length = 0;
    for (let i = 0; i < n; i++) {
      if (p.phase[i] !== SOLID || p.whole[i] <= 0.5 || !p.skin[i]) continue;
      const g = p.group[i];
      if (g < 0 || g >= 2048) continue;
      if (!G.seen[g]) { G.seen[g] = 1; used.push(g); G.cx[g] = 0; G.cy[g] = 0; G.m[g] = 0; G.u[g] = 0; G.v[g] = 0; G.k[g] = 0; G.skin[g] = p.skin[i]; G.first[g] = i; }
      const r = p.rho[i];
      G.cx[g] += p.x[i] * r; G.cy[g] += p.y[i] * r; G.m[g] += r;
      if (p.skin[i] === G.skin[g]) { G.u[g] += p.skinU[i] - p.restX[i] / SP; G.v[g] += p.skinV[i] - p.restY[i] / SP; G.k[g]++; }
    }
    if (!used.length) return false;
    const N = w * h;
    this.pieceCol.fill(0, 0, N);
    // which art pixels of the piece are still held by a particle
    const C = PIECE_CELL;
    const held = this._held || (this._held = new Int32Array(C * C));
    let painted = false;
    for (const g of used) {
      G.seen[g] = 0;
      const pc = piece(G.skin[g]);
      if (!pc || !G.k[g] || G.m[g] <= 0) continue;
      const gen = (this._gen = ((this._gen || 0) + 1) & 0x3fffffff);
      // drawn at the size it is shown at: one of its pixels to one screen pixel
      const size = Math.max(8, Math.round(C * (s * SP) / pc.ppu));
      const spr = pieceSprite(G.skin[g], size);
      if (!spr) continue;
      const q = spr.size / C; // sprite pixels per atlas pixel
      const U0 = G.u[g] / G.k[g], V0 = G.v[g] / G.k[g];
      const cx = (G.cx[g] / G.m[g]) * s + view.ox - bx, cy = (G.cy[g] / G.m[g]) * s + view.oy - by;
      const th = sim.rigid.angle[g], ct = Math.cos(th), st = Math.sin(th);
      // mark the art around each particle of the body (its share of the piece)
      const rr = Math.max(1.5, 0.78 * pc.ppu), r2 = rr * rr;
      for (let i = G.first[g]; i < n; i++) {
        if (p.group[i] !== g || p.skin[i] !== G.skin[g] || p.phase[i] !== SOLID) continue;
        const ax = pc.ax + p.skinU[i] * pc.ppu - pc.cx, ay = pc.ay + p.skinV[i] * pc.ppu - pc.cy;
        const x0 = Math.max(0, Math.floor(ax - rr)), x1 = Math.min(C - 1, Math.ceil(ax + rr));
        const y0 = Math.max(0, Math.floor(ay - rr)), y1 = Math.min(C - 1, Math.ceil(ay + rr));
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
          const dx = xx + 0.5 - ax, dy = yy + 0.5 - ay;
          if (dx * dx + dy * dy <= r2) held[yy * C + xx] = gen;
        }
      }
      // the art origin of the body's centre, then every screen pixel the piece may cover
      const ox0 = pc.ax + U0 * pc.ppu, oy0 = pc.ay + V0 * pc.ppu;
      const R = Math.ceil(spr.size * 0.75) + 1;
      const xa = Math.max(0, Math.floor(cx - R)), xb = Math.min(w - 1, Math.ceil(cx + R));
      const ya = Math.max(0, Math.floor(cy - R)), yb = Math.min(h - 1, Math.ceil(cy + R));
      const fi = G.first[g], S0 = spr.size, sx0 = (ox0 - pc.cx) * q, sy0 = (oy0 - pc.cy) * q, iq = 1 / q;
      // upright (as in the menus and the wilds) it is read straight from its
      // sprite; turned, from a smoothed 4× copy so its lines stay whole
      const turned = Math.abs(Math.sin(th * 2)) > 0.02 || ct < 0;
      const sm = turned ? smoothSprite(G.skin[g], spr) : null, S4 = S0 * 4;
      for (let y = ya; y <= yb; y++) {
        const dy = y + 0.5 - cy;
        for (let x = xa; x <= xb; x++) {
          const dx = x + 0.5 - cx;
          // into the body's rest frame (undo its rotation), in sprite pixels
          const fx = sx0 + (ct * dx + st * dy), fy = sy0 + (-st * dx + ct * dy);
          if (fx < 0 || fy < 0 || fx >= S0 || fy >= S0) continue;
          const lx = Math.floor(fx * iq), ly = Math.floor(fy * iq);
          if (lx >= C || ly >= C || held[ly * C + lx] !== gen) continue;
          const c = sm ? sm[Math.floor(fy * 4) * S4 + Math.floor(fx * 4)] : spr.px[Math.floor(fy) * S0 + Math.floor(fx)];
          if (!(c >>> 31)) continue;
          const k = y * w + x;
          this.pieceCol[k] = c | 0xff000000; this.pieceIdx[k] = fi;
          painted = true;
        }
      }
    }
    return painted;
  }

  /**
   * Soften the liquid's colour: a separable binomial blur (radius 4) of its
   * weighted colour sums, so colours average by how much liquid carries
   * them and the empty space around the brew adds nothing. Worked out
   * only where it is read: at the centres of the droplet cells that hold
   * brew, and the horizontal pass only at the pixels their vertical
   * kernels take in.
   * @param {number} w @param {number} h @param {number} st the kernel's step in pixels
   * @param {number} PQ cell size @param {number} cx0 @param {number} cy0 the first centre column and row
   * @param {number} thr the surface threshold
   */
  _softenColour(w, h, st, PQ, cx0, cy0, thr) {
    const liq = this.liq, b = this.lct, a = this.lc, wb = this.wb;
    const K = [1, 8, 28, 56, 70, 56, 28, 8, 1], R = 4, norm = 1 / 256;
    // which rows of the current column already have their horizontal pass
    // (a fresh token per column, so the marks never need clearing)
    if (!this.hMark || this.hMark.length < h) { this.hMark = new Int32Array(h); this.hTok = 0; }
    const mark = this.hMark;
    for (let x = cx0; x < w; x += PQ) {
      const tok = ++this.hTok;
      for (let y = cy0; y < h; y += PQ) {
        const o = (y * w + x) * LC;
        if (!(wb[y * w + x] > thr)) { a[o] = 0; continue; }
        let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0;
        for (let d = -R; d <= R; d++) {
          const yy = y + d * st;
          if (yy < 0 || yy >= h) continue;
          const q = (yy * w + x) * LC;
          if (mark[yy] !== tok) {
            // the horizontal pass at this pixel, the first time it is needed: liquid → b
            mark[yy] = tok;
            const row = yy * w;
            let h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0;
            for (let e = -R; e <= R; e++) {
              const xx = x + e * st;
              if (xx < 0 || xx >= w) continue;
              const l = (row + xx) * LS;
              if (liq[l] <= 0) continue;
              const kw = K[e + R];
              h0 += liq[l] * kw; h1 += liq[l + 1] * kw; h2 += liq[l + 2] * kw; h3 += liq[l + 3] * kw; h4 += liq[l + 4] * kw; h5 += liq[l + 5] * kw;
            }
            b[q] = h0 * norm; b[q + 1] = h1 * norm; b[q + 2] = h2 * norm; b[q + 3] = h3 * norm; b[q + 4] = h4 * norm; b[q + 5] = h5 * norm;
          }
          if (b[q] <= 0) continue;
          const kw = K[d + R];
          s0 += b[q] * kw; s1 += b[q + 1] * kw; s2 += b[q + 2] * kw; s3 += b[q + 3] * kw; s4 += b[q + 4] * kw; s5 += b[q + 5] * kw;
        }
        a[o] = s0 * norm; a[o + 1] = s1 * norm; a[o + 2] = s2 * norm; a[o + 3] = s3 * norm; a[o + 4] = s4 * norm; a[o + 5] = s5 * norm;
      }
    }
  }

  /** Separable box blur (radius 2) of the half-resolution vapour field, turned into its haze. */
  _blurGas() {
    const hw = this.hw, hh = this.hh;
    blurBox4(this.gas, this.gasTmp, hw, hh, 4, hw * 4);
    blurBox4(this.gasTmp, this.gas, hw, hh, hw * 4, 4);
    this._haze();
  }

  /**
   * The blurred cloud, straight to the haze each half-resolution pixel lays
   * over the scene: a faint veil (the vapour reads as its droplets), its
   * opacity in a, its colour in r, g, b.
   */
  _haze() {
    const a = this.gas, n = this.hw * this.hh * 4;
    for (let o = 0; o < n; o += 4) {
      const gw = a[o];
      if (gw > 0.03) {
        const inv = 1 / gw;
        a[o] = Math.min(0.42, 0.5 * (1 - Math.exp(-gw * 0.6))); a[o + 1] *= inv; a[o + 2] *= inv; a[o + 3] *= inv;
      } else a[o] = 0;
    }
  }

  /**
   * Soft light around glowing matter: the emission field at half resolution,
   * blurred and drawn additively in 2-pixel blocks (it stays pixel art).
   * @param {number} w @param {number} h
   */
  _halo(w, h) {
    const hw = this.hw, hh = this.hh, acc = this.haloAcc, tmp = this.haloTmp, emit = this.emit;
    acc.fill(0, 0, hw * hh * 3);
    for (let y = 0; y < h; y++) {
      const hy = (y >> 1) * hw;
      for (let x = 0; x < w; x++) {
        const e4 = (y * w + x) * 4;
        if (emit[e4 + 3] <= 0.01) continue;
        const k = (hy + (x >> 1)) * 3;
        acc[k] += emit[e4]; acc[k + 1] += emit[e4 + 1]; acc[k + 2] += emit[e4 + 2];
      }
    }
    // two box blurs (separable, radius 2) ≈ a soft falloff
    for (let pass = 0; pass < 2; pass++) {
      blur5(acc, tmp, hw, hh, 3, 1, hw);
      blur5(tmp, acc, hw, hh, 3, hw, 1);
    }
    const d = this.haloImage.data;
    for (let k = 0, o = 0; k < hw * hh; k++, o += 4) {
      const a = k * 3;
      // quantised levels keep the light banded like the rest of the pixel art
      d[o] = clamp255(Math.round(acc[a] * 0.09 * 16) * 16);
      d[o + 1] = clamp255(Math.round(acc[a + 1] * 0.09 * 16) * 16);
      d[o + 2] = clamp255(Math.round(acc[a + 2] * 0.09 * 16) * 16);
      d[o + 3] = 255;
    }
    this.haloCtx.putImageData(this.haloImage, 0, 0);
    return this.haloCanvas;
  }
}

/**
 * Box blur (radius 2) of a C-channel field along one axis: `step` is the
 * cell stride along the axis, `cross` across it.
 * @param {Float32Array} src @param {Float32Array} dst
 * @param {number} hw @param {number} hh @param {number} C @param {number} step @param {number} cross
 */
function blur5(src, dst, hw, hh, C, step, cross) {
  const n = step === 1 ? hw : hh, lines = step === 1 ? hh : hw;
  for (let l = 0; l < lines; l++) {
    const base = l * cross;
    for (let i = 0; i < n; i++) {
      const o = (base + i * step) * C;
      for (let c = 0; c < C; c++) {
        let v = 0;
        for (let dd = -2; dd <= 2; dd++) {
          const j = i + dd;
          if (j < 0 || j >= n) continue;
          v += src[(base + j * step) * C + c];
        }
        dst[o + c] = v * 0.2;
      }
    }
  }
}

/** @param {number} w @param {number} h */
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** @param {number} v */
/** 4×4 Bayer ordered-dither thresholds, 0..1. */
/**
 * Box blur (radius 2) of a 4-channel field along one axis: `step` is the
 * stride between neighbours along it, `line` between lines across it.
 * @param {Float32Array} a source @param {Float32Array} t destination
 * @param {number} hw @param {number} hh the field's size
 * @param {number} step @param {number} line
 */
function blurBox4(a, t, hw, hh, step, line) {
  const along = step === 4 ? hw : hh, across = step === 4 ? hh : hw;
  for (let j = 0; j < across; j++) {
    const base = j * line;
    for (let i = 0; i < along; i++) {
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      const i0 = Math.max(0, i - 2), i1 = Math.min(along - 1, i + 2);
      for (let d = i0; d <= i1; d++) {
        const k = base + d * step;
        s0 += a[k]; s1 += a[k + 1]; s2 += a[k + 2]; s3 += a[k + 3];
      }
      const o = base + i * step;
      t[o] = s0 * 0.2; t[o + 1] = s1 * 0.2; t[o + 2] = s2 * 0.2; t[o + 3] = s3 * 0.2;
    }
  }
}

/** One turn of sine in 1024 steps. */
const SIN = Float32Array.from({ length: 1024 }, (_, i) => Math.sin((i / 1024) * Math.PI * 2));

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}
