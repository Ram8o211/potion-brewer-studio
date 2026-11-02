// The look of each effect inside a brew: particles. Every effect a potion
// carries keeps a swarm of tiny pixel particles in the liquid where it is,
// as many as its share of the magic there (awakening, several times the
// magic, packs them denser and draws them bolder). No icons: each effect is
// a swarm of 1–2 px motes in a palette of its own, moving its own way, so it
// reads at a glance by colour and motion:
//   vitality        crimson-to-rose motes of life rising, swelling and
//                   brightening together on a double heartbeat, quick white
//                   sparks darting up with a trail
//   strength        chunky gold and bronze nuggets heaving up and thumping
//                   down, flashing white on each thump, gold glints
//   love            rose and pink motes swaying upward, pulsing with a soft
//                   glow and leaving a pale trail
//   arcana          violet and indigo specks that twinkle into cyan-white
//                   sparkles, the odd shooting streak
//   transformation  comets circling, their colour sliding through the
//                   spectrum along their tails
//   fire            embers licking up from the depths, white-hot to yellow,
//                   orange, red and smoke, sparks flying out of the surface
//   frost           ice-blue and white crystals drifting down, glinting
//   acidity         a fast lime-to-yellow fizz rising, popping into droplets
//                   at the surface
//   toxicity        murky green globs swelling until they burst, sickly
//                   green and violet motes drifting
//   death           dark smoke sinking in loose clumps and pale lavender
//                   wisps wavering up
// Particles live in screen pixels (so they stay crisp pixel art) and are
// carried by the liquid they swim in: each frame the brew's own velocity
// where a particle is moves it by as far as the simulation ran, so they swirl
// with the stirring, slosh with the pour and ride the convection, on top of
// their own drift. They are drawn only over the liquid (sparks and droplets
// may leave it for a moment) and never change the colour of the brew around
// them. fluid.js gives them the liquid's pixels, velocity and per-effect
// magic each frame (PotionParticles.step).

import { artDomain } from '../studio/direction.js';
import { hex } from '../visual/color.js';
import { EFFECTS, NE } from '../alchemy/effects.js';

const K = Object.fromEntries(EFFECTS.map((e, k) => [e.key, k]));
const MAX = 2400;
/** Particles per 1000 px of liquid at full strength, by effect. */
const DENSITY = {
  vitality: 22, strength: 12, love: 30, arcana: 34, transformation: 18,
  fire: 34, frost: 32, acidity: 40, toxicity: 12, death: 22,
};
/** Most particles of one effect. */
const CAP = 360;

const WHITE = [1, 1, 0.96];
/** Each effect's palette, darkest to brightest. */
const RAMP = {
  vitality: [[0.42, 0.04, 0.1], [0.78, 0.1, 0.18], [0.97, 0.3, 0.32], [1, 0.62, 0.6], [1, 0.9, 0.86]],
  strength: [[0.45, 0.26, 0.06], [0.78, 0.52, 0.12], [0.98, 0.76, 0.28], [1, 0.9, 0.55], [1, 0.98, 0.84]],
  love: [[0.62, 0.1, 0.38], [0.92, 0.28, 0.56], [1, 0.5, 0.74], [1, 0.74, 0.88], [1, 0.93, 0.97]],
  arcana: [[0.22, 0.1, 0.55], [0.42, 0.28, 0.9], [0.62, 0.52, 1], [0.7, 0.86, 1], [0.95, 0.98, 1]],
  fire: [[0.35, 0.3, 0.32], [0.86, 0.22, 0.1], [1, 0.56, 0.2], [1, 0.88, 0.35], [1, 0.98, 0.8]],
  frost: [[0.24, 0.46, 0.8], [0.4, 0.7, 0.98], [0.55, 0.87, 1], [0.8, 0.96, 1], [0.97, 1, 1]],
  acidity: [[0.34, 0.5, 0.06], [0.58, 0.8, 0.12], [0.8, 0.95, 0.3], [0.94, 1, 0.55], [1, 1, 0.85]],
  toxicity: [[0.12, 0.26, 0.07], [0.26, 0.5, 0.12], [0.45, 0.76, 0.22], [0.66, 0.92, 0.36], [0.6, 0.32, 0.7]],
  death: [[0.06, 0.03, 0.1], [0.2, 0.1, 0.3], [0.42, 0.3, 0.6], [0.7, 0.6, 0.92], [0.9, 0.88, 1]],
};
const P = EFFECTS.map((e) => RAMP[e.key] || [e.color, e.color, e.color, e.color, WHITE]);
const FIRE_RAMP = RAMP.fire.slice().reverse(); // white-hot first, smoke last

/** Hue h (0..1) at full saturation, brightness l, as rgb 0..1. */
const hue = (h, l = 1) => {
  h = ((h % 1) + 1) % 1;
  const f = (n) => { const k = (n + h * 6) % 6; return l * (1 - 0.75 * Math.max(0, Math.min(k, 4 - k, 1))); };
  return [f(5), f(3), f(1)];
};

/** The liquid's displacement at a particle (PotionParticles._carry). */
let FX = 0, FY = 0;

/** The double heartbeat: two quick swells every 1.2 s, 0..~1. */
const heartbeat = (t) => {
  const p = (t / 1.2) % 1;
  return Math.exp(-Math.pow((p - 0.1) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((p - 0.3) / 0.05, 2));
};

/**
 * The magic effects' particles in a brew. One per FluidRenderer; it keeps
 * its swarm from frame to frame.
 */
export class PotionParticles {
  constructor() {
    this.x = new Float32Array(MAX);
    this.y = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.age = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.v = new Float32Array(MAX); // the particle's own random value: variant, phase
    this.amp = new Float32Array(MAX); // strength of its effect where it was born
    this.ox = new Float32Array(MAX); // a centre it sways or circles around
    this.oy = new Float32Array(MAX);
    this.k = new Uint8Array(MAX);
    this.free = new Uint8Array(MAX); // a spark or droplet that may leave the liquid
    this.n = 0;
    this.count = new Int32Array(NE);
    this.credit = new Float32Array(NE);
    this.warm = new Uint8Array(NE);
    this.last = -1;
    this.seed = 0;
    /** pixels of the last image a particle was drawn on (1), for tests */
    this.cover = new Uint8Array(0);
  }

  rand() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Forget every particle (a new brew). */
  clear() {
    this.n = 0;
    this.count.fill(0);
    this.credit.fill(0);
    this.warm.fill(0);
  }

  /**
   * Spawn, move and draw the particles over a rendered brew.
   * @param {number} time seconds
   * @param {{w:number, h:number, bx:number, by:number, data:Uint8ClampedArray, liquid:Uint8Array,
   *   pix:Int32Array, npix:number, mfx:Float32Array, emit:Float32Array, mask:number,
   *   flow?:Float32Array, weight?:Float32Array, stride?:number, simDt?:number}} f
   *   the image (w × h at screen bx, by), which of its pixels are liquid
   *   (and the list of them), the per-effect magic and its kernel weight per
   *   pixel, and the liquid's weighted velocity per pixel (flow, screen px
   *   per simulated second; its weight every `stride` floats of `weight`)
   *   with the simulated time since the last frame
   */
  step(time, f) {
    if (this.last < 0) this.seed = (Math.floor(time * 1000) ^ 0x5bd1e995) >>> 0;
    const dt = this.last < 0 || time < this.last ? 0 : Math.min(0.1, time - this.last);
    this.last = time;
    const N = f.w * f.h;
    if (this.cover.length < N) this.cover = new Uint8Array(N);
    else this.cover.fill(0, 0, N);
    this._spawn(dt, f);
    this._move(time, dt, f);
    for (let i = 0; i < this.n; i++) this._draw(i, time, f);
  }

  /** The strength (0..1.6) of effect e at image pixel q. */
  static strength(f, q, e) {
    const ew = f.emit[q * 4 + 3];
    if (ew <= 0.02) return 0;
    return Math.min(1.6, Math.sqrt(f.mfx[q * NE + e] / Math.max(ew, 0.6)) * 1.5);
  }

  /** Is image pixel q liquid with liquid two pixels out on every side? */
  static inner(f, q) {
    const { w, liquid } = f, x = q % w;
    return x >= 2 && x < w - 2 && q >= 2 * w && q < liquid.length - 2 * w &&
      liquid[q - 2] === 1 && liquid[q + 2] === 1 && liquid[q - 2 * w] === 1 && liquid[q + 2 * w] === 1;
  }

  /** Keep each effect's swarm at its size: its density times its strength over the liquid. */
  _spawn(dt, f) {
    const npix = f.npix;
    for (let e = 0; e < NE; e++) {
      if (!(f.mask & (1 << e)) || npix === 0) { this.warm[e] = 0; this.credit[e] = 0; continue; }
      // how much of the brew carries it, and how strongly: a sample of the liquid
      const S = Math.min(240, npix);
      let sum = 0;
      for (let s = 0; s < S; s++) sum += PotionParticles.strength(f, f.pix[(this.rand() * npix) | 0], e);
      const target = Math.min(CAP, Math.round((sum / S) * npix * DENSITY[EFFECTS[e].key] * (artDomain('effects', EFFECTS[e].key)?.density || 1) / 1000));
      const deficit = target - this.count[e];
      if (deficit <= 0) { this.warm[e] = 1; continue; }
      let make;
      const first = !this.warm[e];
      if (first) { make = deficit; this.warm[e] = 1; }
      else {
        this.credit[e] += deficit * dt * 12;
        make = Math.floor(this.credit[e]);
        this.credit[e] -= make;
      }
      for (let m = 0; m < make && this.n < MAX; m++) {
        // a liquid pixel where the effect is, more likely where it is strong
        for (let tries = 0; tries < 16; tries++) {
          const q = f.pix[(this.rand() * npix) | 0], A = PotionParticles.strength(f, q, e);
          if (A <= 0.03 || this.rand() * 1.6 > A) continue;
          // not on the brew's very rim, where it would be gone at once
          if (!PotionParticles.inner(f, q)) continue;
          this._add(e, (q % f.w) + f.bx, ((q / f.w) | 0) + f.by, A, first);
          break;
        }
      }
    }
  }

  /** @param {number} e @param {number} x @param {number} y @param {number} A @param {boolean} aged */
  _add(e, x, y, A, aged) {
    const i = this.n++, r = this.rand();
    this.k[i] = e; this.x[i] = x; this.y[i] = y; this.ox[i] = x; this.oy[i] = y;
    this.v[i] = r; this.amp[i] = A; this.free[i] = 0; this.vx[i] = 0; this.vy[i] = 0;
    let life = 3;
    switch (e) {
      case K.vitality: life = 3 + r * 2; this.vy[i] = r < 0.35 ? -14 - r * 10 : -5 - r * 3; break;
      case K.strength: life = 3.5 + r * 2; this.vy[i] = r < 0.3 ? -12 : -2.5 - r * 1.5; break;
      case K.love: life = 3.5 + r * 2; this.vy[i] = r > 0.55 ? -4.5 : -8 - r * 4; break;
      case K.arcana:
        if (r < 0.06) { life = 0.55; this.vx[i] = 70; this.vy[i] = 26; }
        else { life = 2.5 + r * 2.5; this.vx[i] = (this.rand() - 0.5) * 6; this.vy[i] = (this.rand() - 0.5) * 6; }
        break;
      case K.transformation: life = 3 + r * 2; this.vy[i] = -2.5; this.vx[i] = (this.rand() - 0.5) * 3; break;
      case K.fire: life = 0.7 + r * 0.6; this.vy[i] = -20 - r * 14; break;
      case K.frost: life = 4 + r * 3; this.vy[i] = r < 0.3 ? 0.5 : 4 + r * 4; break;
      case K.acidity: life = 1.2 + r * 1.2; this.vy[i] = -22 - r * 18; break;
      case K.toxicity: life = 2.5 + r * 2; this.vy[i] = r < 0.25 ? -3 : -5 - r * 4; break;
      case K.death: life = 3 + r * 2; this.vy[i] = r < 0.4 ? -4 - r * 3 : 3 + r * 2; break;
    }
    this.life[i] = life;
    // the first swarm of a brew is already under way
    this.age[i] = aged ? this.rand() * life * 0.8 : 0;
    if (this.age[i] > 0 && e !== K.transformation) { this.x[i] += this.vx[i] * this.age[i] * 0.5; this.y[i] += this.vy[i] * this.age[i] * 0.5; }
    this.count[e]++;
  }

  /** @param {number} i */
  _kill(i) {
    this.count[this.k[i]]--;
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
    this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.v[i] = this.v[j]; this.amp[i] = this.amp[j];
    this.ox[i] = this.ox[j]; this.oy[i] = this.oy[j]; this.k[i] = this.k[j]; this.free[i] = this.free[j];
  }

  /** A spark or droplet leaving the brew. @param {number} e */
  _fling(e, x, y, vx, vy, life) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.k[i] = e; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.age[i] = 0; this.life[i] = life; this.v[i] = this.rand(); this.amp[i] = 1; this.free[i] = 1;
    this.ox[i] = x; this.oy[i] = y;
    this.count[e]++;
  }

  /**
   * How far the liquid at screen point (x, y) moved since the last frame
   * (into FX, FY): its velocity, bilinear between the four pixels around,
   * times the simulated time.
   */
  _carry(f, x, y) {
    FX = 0; FY = 0;
    const { flow, weight, stride, simDt } = f;
    if (!flow || !weight || !simDt) return;
    const gx = x - f.bx - 0.5, gy = y - f.by - 0.5, ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy;
    let vx = 0, vy = 0, ws = 0;
    for (let c = 0; c < 4; c++) {
      const px = ix + (c & 1), py = iy + (c >> 1);
      if (px < 0 || py < 0 || px >= f.w || py >= f.h) continue;
      const q = py * f.w + px, W = weight[q * (stride || 1)];
      if (W < 1e-4) continue;
      const k = ((c & 1) ? tx : 1 - tx) * ((c >> 1) ? ty : 1 - ty);
      vx += (flow[q * 2] / W) * k; vy += (flow[q * 2 + 1] / W) * k; ws += k;
    }
    if (ws < 1e-3) return;
    FX = (vx / ws) * simDt; FY = (vy / ws) * simDt;
  }

  _move(time, dt, f) {
    const { w, h, bx, by, liquid } = f;
    for (let i = this.n - 1; i >= 0; i--) {
      const e = this.k[i], v = this.v[i];
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        if (e === K.toxicity && !this.free[i] && v >= 0.25) this._burst(i);
        this._kill(i);
        continue;
      }
      if (this.free[i]) {
        // sparks rise and drift; droplets fall back
        if (e !== K.fire) this.vy[i] += 90 * dt;
        this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
        const lx = Math.round(this.x[i]) - bx, ly = Math.round(this.y[i]) - by;
        if (lx < 0 || ly < 0 || lx >= w || ly >= h) this._kill(i);
        else if (this.vy[i] > 0 && liquid[ly * w + lx]) this._kill(i);
        continue;
      }
      const a = this.age[i];
      // carried along by the brew
      this._carry(f, this.x[i], this.y[i]);
      this.ox[i] += FX; this.oy[i] += FY;
      switch (e) {
        case K.transformation: {
          // circling a centre that drifts up
          this.ox[i] += this.vx[i] * dt; this.oy[i] += this.vy[i] * dt;
          const R = 3 + v * 6, ang = a * (1.2 + v) * (v < 0.5 ? 1 : -1) + v * 20;
          this.x[i] = this.ox[i] + Math.cos(ang) * R; this.y[i] = this.oy[i] + Math.sin(ang) * R * 0.6;
          break;
        }
        case K.strength: {
          // heaving up, then a thump down
          this.oy[i] += this.vy[i] * dt;
          this.x[i] = this.ox[i];
          this.y[i] = this.oy[i] - (v < 0.3 ? 0 : Math.abs(Math.sin(time * 2.4 + v * 9)) * 4);
          break;
        }
        default: {
          this.oy[i] += this.vy[i] * dt; this.ox[i] += this.vx[i] * dt;
          let sx = 0;
          if (e === K.love) sx = Math.sin(time * 2.2 + v * 30) * 2.2;
          else if (e === K.vitality) sx = Math.sin(time * 1.7 + v * 30) * 1.5;
          else if (e === K.frost) sx = Math.sin(time * 1.3 + v * 30) * 3;
          else if (e === K.fire) sx = Math.sin(time * 9 + v * 30) * 0.8 + Math.sin(time * 0.9) * a * 4;
          else if (e === K.acidity) sx = Math.sin(time * 14 + v * 30) * 0.7;
          else if (e === K.toxicity) sx = Math.sin(time * 1.1 + v * 30) * 1.5;
          else if (e === K.death) sx = v < 0.4 ? Math.sin(time * 2 + v * 30) * 2.5 : Math.cos(time * 0.8 + v * 30) * 2;
          this.x[i] = this.ox[i] + sx; this.y[i] = this.oy[i];
        }
      }
      const lx = Math.round(this.x[i]) - bx, ly = Math.round(this.y[i]) - by;
      const inside = lx >= 0 && ly >= 0 && lx < w && ly < h && liquid[ly * w + lx];
      if (!inside) {
        // out of the brew: at the surface fire throws sparks, acid pops, poison bursts
        if (this.vy[i] < 0 && lx >= 0 && lx < w) {
          if (e === K.fire && this.age[i] < this.life[i] * 0.6 && this.rand() < 0.6) this._fling(e, this.x[i], this.y[i], (this.rand() - 0.5) * 10, -18 - this.rand() * 14, 0.35 + this.rand() * 0.3);
          else if (e === K.acidity) for (let d = 0; d < 2; d++) this._fling(e, this.x[i], this.y[i] - 1, (this.rand() - 0.5) * 30, -20 - this.rand() * 15, 0.4);
          else if (e === K.toxicity && v >= 0.25) this._burst(i);
        }
        this._kill(i);
      }
    }
  }

  /** A poison bubble bursts into droplets. @param {number} i */
  _burst(i) {
    for (let d = 0; d < 4; d++) {
      const ang = -Math.PI * (0.15 + 0.7 * (d / 3));
      this._fling(this.k[i], this.x[i], this.y[i] - 1, Math.cos(ang) * 22, Math.sin(ang) * 28, 0.4);
    }
  }

  /** Draw particle i into the image. */
  _draw(i, time, f) {
    const { w, h, bx, by, data, liquid } = f;
    const e = this.k[i], v = this.v[i], free = this.free[i] === 1;
    const style = artDomain('effects', EFFECTS[e].key);
    if (style && i % 100 >= style.density * 100) return;
    const tint = style ? hex(style.tint) : null;
    if (style) time *= style.speed;
    const t = this.age[i] / this.life[i];
    // fade in and out, stronger where the effect is stronger
    const fade = Math.min(1, t * 6, (1 - t) * 5) * Math.min(1, 0.6 + this.amp[i] * 0.5);
    const X = Math.round(this.x[i]) - bx, Y = Math.round(this.y[i]) - by;
    const cover = this.cover;
    /** @param {number} x @param {number} y @param {number[]} c @param {number} a */
    const px = (x, y, c, a) => {
      if (style) {
        x = Math.round(x * style.size); y = Math.round(y * style.size);
        a *= style.opacity; c = c.map((v, ch) => v * (1 - style.mix) + tint[ch] * style.mix + style.emission * 0.1 + Math.sin(x * 7 + y * 13 + time) * (style.grain - 1) * 0.03);
      }
      x += X; y += Y;
      if (x < 0 || y < 0 || x >= w || y >= h || a <= 0.01) return;
      const q = y * w + x, o = q * 4;
      if (!liquid[q]) {
        if (!free) return;
        // a spark or droplet in the air
        const al = data[o + 3] / 255, na = a + al * (1 - a);
        for (let ch = 0; ch < 3; ch++) data[o + ch] = Math.round(((c[ch] * 255) * a + data[o + ch] * al * (1 - a)) / Math.max(na, 1e-3));
        data[o + 3] = Math.round(na * 255);
      } else {
        if (a > 1) a = 1;
        for (let ch = 0; ch < 3; ch++) data[o + ch] = Math.round(data[o + ch] + (c[ch] * 255 - data[o + ch]) * a);
      }
      cover[q] = 1;
    };
    if (style && style.shape !== 'native') {
      const c = tint, a = fade * style.opacity;
      px(0, 0, c, a);
      if (style.shape === 'square') { px(1, 0, c, a); px(0, 1, c, a); px(1, 1, c, a); }
      else { px(-1, 0, c, a); px(1, 0, c, a); px(0, -1, c, a); if (style.shape === 'cross') px(0, 1, c, a); }
      return;
    }
    /** a mote: a core pixel and, at strength g, a soft glow on its four sides @param {number} x @param {number} y @param {number[]} core @param {number[]} rim @param {number} a @param {number} g */
    const mote = (x, y, core, rim, a, g) => {
      if (g > 0.05) { px(x - 1, y, rim, a * g); px(x + 1, y, rim, a * g); px(x, y - 1, rim, a * g); px(x, y + 1, rim, a * g); }
      px(x, y, core, a);
    };
    /** a square blob of n×n pixels around (0, 0): its core, a brighter corner lit from the upper left and, at strength g, a soft rim of glow @param {number} n @param {number[]} core @param {number[]} hi @param {number[]} rim @param {number} a @param {number} g */
    const blob = (n, core, hi, rim, a, g) => {
      const o = -((n - 1) >> 1);
      if (g > 0.05) for (let s = 0; s < n; s++) {
        px(o + s, o - 1, rim, a * g); px(o + s, o + n, rim, a * g);
        px(o - 1, o + s, rim, a * g); px(o + n, o + s, rim, a * g);
      }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px(o + x, o + y, x + y === 0 && n > 1 ? hi : core, a);
    };
    /** a 2×2 nugget lit from the upper left @param {number} x @param {number} y @param {number[][]} c [dark, mid, light] @param {number} a */
    const nug = (x, y, c, a) => { px(x, y, c[2], a); px(x + 1, y, c[1], a); px(x, y + 1, c[1], a); px(x + 1, y + 1, c[0], a); };
    /** a trail of n pixels behind a mote moving (dx, dy) per pixel, fading through the palette @param {number} dx @param {number} dy @param {number} n @param {number[][]} cols @param {number} a */
    const trail = (dx, dy, n, cols, a) => {
      for (let s = 1; s <= n; s++) px(Math.round(-dx * s), Math.round(-dy * s), cols[Math.min(cols.length - 1, s - 1)], a * (1 - s / (n + 1)));
    };
    const C = P[e];
    if (free) {
      // sparks glow yellow to red; droplets in the effect's colours
      const col = e === K.fire ? FIRE_RAMP[Math.min(3, Math.floor(t * 4))] : C[t < 0.5 ? 3 : 2];
      px(0, 0, col, 1 - t * 0.6);
      return;
    }
    // a slow shimmer of its own
    const sh = Math.sin(time * (2 + v * 3) + v * 60);
    switch (e) {
      case K.vitality: {
        if (v < 0.35) {
          // a quick spark of life darting up
          px(0, 0, sh > 0 ? WHITE : C[4], fade);
          trail(0, -1, 3, [C[3], C[2], C[1]], fade);
          break;
        }
        // motes of life swelling and brightening together on the heartbeat
        const beat = Math.min(1, heartbeat(time + v * 0.15));
        const lv = 1 + Math.round(beat * 2);
        const n = v > 0.8 ? (beat > 0.5 ? 3 : 2) : v > 0.5 ? 2 : beat > 0.5 ? 2 : 1;
        blob(n, C[Math.min(4, lv + (v > 0.7 ? 1 : 0))], C[4], C[lv - 1], fade, 0.4 + beat * 0.5);
        if (v > 0.6) trail(0, -1, 1, [C[1]], fade);
        break;
      }
      case K.strength: {
        if (v < 0.3) {
          // a gold glint, flaring into a small cross
          mote(0, 0, sh > 0.3 ? WHITE : C[3], C[2], fade, sh > 0.6 ? 0.9 : 0.4);
          if (sh > 0.6) { px(-2, 0, C[1], fade * 0.5); px(2, 0, C[1], fade * 0.5); px(0, -2, C[1], fade * 0.5); px(0, 2, C[1], fade * 0.5); }
          break;
        }
        // a nugget heaving up and thumping down: it flashes as it lands
        const lift = Math.abs(Math.sin(time * 2.4 + v * 9));
        const land = lift < 0.18;
        const n = v > 0.45 ? 3 : 2;
        blob(n, land ? C[3] : v > 0.65 ? C[1] : C[2], land ? WHITE : C[3], land ? C[3] : C[1], fade, land ? 0.9 : 0.6);
        if (land) { px(-2, n, C[3], fade * 0.6); px(n, n, C[3], fade * 0.6); px(-3, n, C[2], fade * 0.4); px(n + 1, n, C[2], fade * 0.4); }
        else for (let s = 0; s < n; s++) px(s - ((n - 1) >> 1), -((n - 1) >> 1) - 2, C[1], fade * lift * 0.7);
        break;
      }
      case K.love: {
        // rose motes pulsing as they sway up, a pale trail beneath
        const beat = Math.sin(time * 5 + v * 20) > 0.2 ? 1 : 0;
        const big = v > 0.55;
        if (big) blob(2 + (beat && v > 0.8 ? 1 : 0), beat ? C[3] : C[2], C[4], C[1], fade, 0.5 + 0.4 * beat);
        else mote(0, 0, beat ? C[4] : C[3], C[1], fade, 0.3 + 0.4 * beat);
        trail(Math.cos(time * 2.2 + v * 30) * 0.5, -1, 2, [C[2], C[1]], fade * 0.8);
        break;
      }
      case K.arcana: {
        if (v < 0.06) {
          // a shooting streak and its tail
          for (let s = 0; s < 7; s++) px(-Math.round(s * 0.94), -Math.round(s * 0.35), s === 0 ? WHITE : s < 3 ? C[3] : C[2], fade * (1 - s / 8));
          break;
        }
        // specks that twinkle up into sparkles
        const tw = 0.5 + 0.5 * Math.sin(time * (1.6 + v * 2.4) + v * 40);
        if (tw > 0.75) {
          const L = tw > 0.92 && v > 0.5 ? 2 : 1, diag = v > 0.8;
          px(0, 0, WHITE, fade);
          for (let s = 1; s <= L; s++) {
            const c = s === 1 ? C[3] : C[2], a = fade * (s === 1 ? 0.9 : 0.55);
            if (diag) { px(s, s, c, a); px(-s, s, c, a); px(s, -s, c, a); px(-s, -s, c, a); }
            else { px(s, 0, c, a); px(-s, 0, c, a); px(0, s, c, a); px(0, -s, c, a); }
          }
        } else if (v > 0.45) blob(2, tw > 0.4 ? C[2] : C[1], C[3], C[0], fade * (0.6 + tw * 0.5), 0.3);
        else mote(0, 0, tw > 0.4 ? C[3] : C[2], C[0], fade * (0.6 + tw * 0.5), 0.4);
        break;
      }
      case K.transformation: {
        // a comet circling, its colour sliding through the spectrum down its tail
        const R = 3 + v * 6, dir = v < 0.5 ? 1 : -1, sp = (1.2 + v) * dir;
        const ang = this.age[i] * sp + v * 20, h0 = time * 0.35 + v;
        blob(2, hue(h0, 1), WHITE, hue(h0 - 0.1, 0.7), fade, 0.35);
        for (let s = 1; s <= 6; s++) {
          const a2 = ang - s * 0.3 * dir;
          const dx = Math.round(Math.cos(a2) * R - Math.cos(ang) * R), dy = Math.round((Math.sin(a2) - Math.sin(ang)) * R * 0.6);
          const c = hue(h0 + s * 0.1, 1 - s * 0.06), a = fade * (1 - s * 0.13);
          px(dx, dy, c, a);
          if (s < 4) px(dx + 1, dy, c, a * 0.8);
        }
        break;
      }
      case K.fire: {
        // an ember licking up, cooling as it rises: white-hot, yellow, orange,
        // red, then a wisp of smoke; it flickers
        const lv = Math.min(4, Math.floor(t * 4.2 + (sh > 0.7 ? 1 : 0)));
        const col = FIRE_RAMP[lv], tail = FIRE_RAMP[Math.min(4, lv + 1)];
        if (t < 0.5 && v > 0.25) blob(t < 0.2 && v > 0.6 ? 3 : 2, FIRE_RAMP[Math.min(4, lv + 1)], col, FIRE_RAMP[Math.min(4, lv + 2)], fade, 0.4);
        else mote(0, 0, col, tail, fade, 0.3);
        trail(Math.sin(time * 15 + v * 30) > 0 ? 0.5 : -0.5, -1, t < 0.6 ? 2 : 1, [tail, FIRE_RAMP[Math.min(4, lv + 2)]], fade * 0.85);
        break;
      }
      case K.frost: {
        // ice crystals drifting down, glinting white now and then
        const gl = Math.sin(time * 4 + v * 70);
        if (gl > 0.8 && v > 0.5) {
          px(0, 0, WHITE, fade);
          for (const [x, y] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) px(x, y, C[3], fade * 0.7);
        } else if (v > 0.45) blob(v > 0.85 ? 3 : 2, C[2], C[4], C[0], fade, 0.35);
        else mote(0, 0, gl > 0.3 ? C[4] : C[3], C[1], fade, 0.35);
        trail(0, 1, 1, [C[1]], fade * 0.6);
        break;
      }
      case K.acidity: {
        // a fast fizz: a bright bead with a streak below, swelling as it rises
        const col = v < 0.2 ? C[4] : v < 0.6 ? C[3] : C[2];
        if (v > 0.5) blob(t > 0.5 ? 2 : 1 + (v > 0.8 ? 1 : 0), C[2], C[4], C[1], fade, 0.4);
        else mote(0, 0, col, C[1], fade, 0.3);
        trail(Math.sin(time * 14 + v * 30) * 0.4, -1, 2, [C[2], C[1]], fade * 0.7);
        break;
      }
      case K.toxicity: {
        if (v < 0.25) {
          // sickly motes: green with a violet tinge
          px(0, 0, (v * 37) % 1 < 0.4 ? C[4] : C[3], fade);
          px(1, 1, C[1], fade * 0.6);
          break;
        }
        // a murky glob swelling until it bursts, dithered greens with a glint
        const R = 0.9 + t * 2.6 + sh * 0.25, Ri = Math.ceil(R);
        for (let y = -Ri; y <= Ri; y++) for (let x = -Ri; x <= Ri; x++) {
          const d = Math.hypot(x, y);
          if (d > R + 0.3) continue;
          const c = d > R - 0.8 ? C[0] : ((x + y) & 1) ? C[1] : C[2];
          px(x, y, c, fade * (d > R - 0.8 ? 0.85 : 0.6));
        }
        px(-Math.max(0, Ri - 1), -Math.max(0, Ri - 1), C[3], fade);
        break;
      }
      case K.death: {
        if (v < 0.4) {
          // a pale wisp wavering up
          mote(0, 0, sh > 0.5 ? C[4] : C[3], C[2], fade * 0.9, 0.35);
          trail(Math.sin(time * 3 + v * 40) * 0.8, -1, 3, [C[3], C[2], C[1]], fade * 0.75);
          break;
        }
        // a loose clump of dark smoke sinking, spreading and thinning
        const R = 1 + t * 2.2;
        for (let s = 0; s < 10; s++) {
          const h1 = (v * 7919 + s * 0.618) % 1, an = h1 * 6.2832, d = R * ((s * 0.37 + v) % 1);
          px(Math.round(Math.cos(an) * d), Math.round(Math.sin(an) * d * 0.8), s < 2 ? C[0] : C[1], fade * (0.85 - t * 0.4));
        }
        if ((v * 97) % 1 < 0.3) px(0, 0, C[2], fade * 0.7);
        break;
      }
    }
  }
}
