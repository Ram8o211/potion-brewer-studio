import { BIOME_BY_ID } from '../game/biomes.js';
import { artDomain } from '../studio/direction.js';
import { Pixels } from '../visual/pixels.js';
import { ingredientAssetFrame } from '../visual/ingredient-assets.js';

export const FEATURE_HINTS = Object.freeze({
  ripple: 'Touch the water to send moonlit ripples across it.',
  spring: 'Push the small floating islands: they swing back into place.',
  morph: 'Touch the living sprouts to change their shape.',
  mist: 'Sweep the mist aside to reveal the ruins behind it.',
  phase: 'Touch a ghostglass crystal to shift it out of phase.',
  time: 'Swipe down to reverse the sandfalls, or up to accelerate them.',
});

function segmentDistance(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, n = dx * dx + dy * dy;
  const t = n ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / n)) : 0;
  return Math.hypot(x - x0 - dx * t, y - y0 - dy * t);
}

// Decorative physics only. Nothing here changes harvesting or brew physics.
export class ExoticInteractions {
  constructor(region, scene) {
    this.kind = BIOME_BY_ID[region]?.interaction;
    const cfg = artDomain('environments', region)?.interaction;
    this.stiffness = cfg?.stiffness ?? 30; this.damping = cfg?.damping ?? 6; this.particleCount = cfg?.particles ?? 18;
    this.points = (scene.meta.interactionPoints || (scene.meta.glows || []).slice(0, 6)).map(([x, y]) => ({ x, y, dx: 0, dy: 0, vx: 0, vy: 0, touched: 0 }));
    if (!this.points.length) this.points = [{ x: 190, y: 125, dx: 0, dy: 0, vx: 0, vy: 0, touched: 0 }];
    this.ripples = []; this.clock = 0; this.reverse = 0; this.rate = 1;
    this.islands = typeof document === 'undefined' || this.kind !== 'spring' ? [] : this.points.map((p, i) => islandPixels(Math.round(p.x * 31 + p.y * 17 + i)).toCanvas());
    this.morphArt = typeof document === 'undefined' || this.kind !== 'morph' ? [] : ['morphleaf', 'formblossom'].map((key) => ingredientAssetFrame(key, 'mature', 30)?.pix.toCanvas());
    this.phaseArt = typeof document === 'undefined' || this.kind !== 'phase' ? null : ingredientAssetFrame('ghostglass-coral', 'icon', 24)?.pix.toCanvas();
    this.mist = null;
    if (typeof document !== 'undefined' && this.kind === 'mist') {
      const base = mistPixels().toCanvas(), layer = document.createElement('canvas');
      layer.width = base.width; layer.height = base.height;
      this.mist = { base, layer, ctx: layer.getContext('2d') };
    }
  }
  push(x0, y0, x1, y1) {
    if (!this.kind) return;
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    const dx = Math.max(-35, Math.min(35, x1 - x0)), dy = Math.max(-35, Math.min(35, y1 - y0));
    for (const p of this.points) if (segmentDistance(p.x + p.dx, p.y + p.dy, x0, y0, x1, y1) < 23) {
      p.vx = Math.max(-140, Math.min(140, p.vx + (dx || 3) * 4)); p.vy = Math.max(-140, Math.min(140, p.vy + (dy || -5) * 4)); p.touched = 4;
    }
    if (this.kind === 'ripple' || this.kind === 'mist') { if (this.ripples.length >= 16) this.ripples.shift(); this.ripples.push({ x: x1, y: y1, age: 0 }); }
    if (this.kind === 'time') { this.reverse = 4; this.rate = dy < -2 ? 3 : -2; }
  }
  /** Same interaction for a keyboard or assistive-technology user. */
  activate() { const p = this.points[0]; this.push(p.x, p.y + 1, p.x, p.y); }
  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(0.05, dt); this.clock += dt * (this.reverse > 0 ? this.rate : 1); this.reverse = Math.max(0, this.reverse - dt);
    for (const p of this.points) {
      p.vx += (-this.stiffness * p.dx - this.damping * p.vx) * dt; p.vy += (-this.stiffness * p.dy - this.damping * p.vy) * dt;
      p.dx = Math.max(-24, Math.min(24, p.dx + p.vx * dt)); p.dy = Math.max(-18, Math.min(18, p.dy + p.vy * dt));
      p.touched = Math.max(0, p.touched - dt);
    }
    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < 3);
  }
  draw(ctx) {
    if (!this.kind) return;
    ctx.save();
    const pixel = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i], x = p.x + p.dx, y = p.y + p.dy;
      if (this.kind === 'spring') {
        if (this.islands[i]) { ctx.drawImage(this.islands[i], Math.round(x - 20), Math.round(y - 5)); continue; }
        for (let j = 0; j < 18; j++) {
          const w = Math.max(1, Math.round(25 * (1 - j / 18)));
          pixel(x - Math.floor(w / 2), y + j, w, 1, j < 2 ? '#71a34c' : j % 4 ? '#55607b' : '#8b95ac');
          if (j > 3 && j % 3 === 0) pixel(x - w / 3, y + j, Math.max(1, w / 4 | 0), 1, '#41465c');
        }
        pixel(x - 12, y - 2, 24, 2, '#a4d56e'); pixel(x + 2, y - 7, 2, 5, '#8de3f8');
      } else if (this.kind === 'morph') {
        const changed = p.touched > 0;
        if (this.morphArt[+changed]) { ctx.drawImage(this.morphArt[+changed], Math.round(x - 15), Math.round(y - 28)); continue; }
        for (let j = 0; j < 7; j++) pixel(x + Math.sin(j * (changed ? 2.4 : 0.9)) * (changed ? 8 : 4), y - j * 2, changed ? 5 : 3, 2, j % 2 ? '#d59aaf' : '#6fba87');
      } else if (this.kind === 'phase') {
        ctx.globalAlpha = p.touched > 0 ? 0.15 : 0.4 + 0.5 * Math.sin(this.clock * 0.7 + i) ** 2;
        if (this.phaseArt) { ctx.drawImage(this.phaseArt, Math.round(x - 12), Math.round(y - 20)); ctx.globalAlpha = 1; continue; }
        for (let j = 0; j < 15; j++) pixel(x - Math.min(j / 3, (15 - j) / 2), y - 15 + j, Math.max(1, Math.min(j / 1.5, 15 - j)), 1, j % 3 ? '#91e4f0' : '#d7f4ff');
        ctx.globalAlpha = 1;
      } else if (this.kind === 'time') {
        for (let j = 0; j < this.particleCount; j++) pixel(x + Math.sin(j + i) * 2, y + ((j * 5 + this.clock * 24) % 55 + 55) % 55, 1, 2, this.reverse > 0 ? '#d0a4ef' : '#f5d18b');
      }
    }
    if (this.mist) {
      const m = this.mist, c = m.ctx;
      c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, 96, 54);
      const drift = Math.floor(this.clock * 0.4) % 96;
      c.drawImage(m.base, drift, 0); c.drawImage(m.base, drift - 96, 0);
      c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
      for (const r of this.ripples) {
        const radius = 9.5 * (1 - r.age / 3), cx = Math.round(r.x / 4), cy = Math.round(r.y / 4);
        for (let y = -Math.floor(radius); y <= Math.floor(radius); y++) {
          const half = Math.floor(Math.sqrt(Math.max(0, radius * radius - y * y)));
          c.fillRect(cx - half, cy + y, half * 2 + 1, 1);
        }
      }
      ctx.imageSmoothingEnabled = false; ctx.drawImage(m.layer, 0, 0, 384, 216);
    }
    for (const r of this.ripples) if (this.kind === 'ripple') {
      ctx.globalAlpha = 1 - r.age / 3;
      for (let i = 0; i < 36; i++) { const a = i * Math.PI * 2 / 36; pixel(r.x + Math.cos(a) * r.age * 20, r.y + Math.sin(a) * r.age * 6, 2, 1, '#b2eaf4'); }
    }
    ctx.restore();
  }
}

// Continuous alpha coverage avoids the dark gutters of a repeated rectangle
// grid. Native pixel clouds are cached once; touches only erase small circles.
function mistPixels() {
  const p = new Pixels(96, 54);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const cloud = Math.sin(x * 0.08 + Math.sin(y * 0.1)) * 0.5 + Math.sin(y * 0.18 - x * 0.025) * 0.3;
    const fade = Math.max(0, Math.min(1, (y - 5) / 8, (54 - y) / 6));
    const alpha = Math.round((46 + cloud * 28) * fade);
    p.set(x, y, ((alpha << 24) | 0x00bdB8a9) >>> 0);
  }
  return p;
}

// Native pixel stone clusters for moving islands, cached once instead of
// repainting flat triangular stripes every frame. No filtered image scaling.
function islandPixels(seed) {
  const p = new Pixels(40, 32), stone = [0xff514a40, 0xff73625a, 0xff97857c, 0xffc4b4a5];
  const hash = (x, y) => (Math.imul(x + seed, 374761393) ^ Math.imul(y + 17, 668265263)) >>> 0;
  for (let y = 3; y < 29; y++) {
    const u = (y - 3) / 26, half = Math.max(1, Math.round(16 * (1 - u ** 0.75) + Math.sin(y * 0.7 + seed) * 1.5));
    for (let x = 20 - half; x <= 20 + half; x++) {
      const hx = Math.floor((x + (Math.floor(y / 4) % 2) * 2) / 5), hy = Math.floor(y / 4);
      const rim = x === 20 - half || x === 20 + half;
      const c = y < 5 ? (y === 3 ? 0xff80c6a4 : 0xff4e9265) : rim ? stone[0] : y % 4 === 0 || x % 5 === hy % 2 * 2 ? 0xff29262c : stone[1 + hash(hx, hy) % 3];
      p.set(x, y, c);
    }
  }
  for (let j = 0; j < 7; j++) { p.set(23, j, 0xffeada8a); p.set(24, j + 1, 0xffac9a54); }
  return p;
}
