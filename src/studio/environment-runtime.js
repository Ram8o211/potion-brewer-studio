import { artDomain, artAssets } from './direction.js';
import { generate } from './engine.js';
import { fitPixels } from './asset-runtime.js';
import { hex, pack, mixPacked } from '../visual/color.js';
import { hashString } from '../core/rng.js';
/** Edits update the same solid/liquid/open/occlusion maps used by placement and wildlife. */
export function directEnvironment(cv, region, seed) {
  const cfg = artDomain('environments', region); if (!cfg) return;
  const W = cv.W, H = cv.H;
  const touched = new Uint8Array(W * H);
  for (const stroke of cfg.strokes) for (const [cx, cy] of stroke.points) {
    for (let y = Math.max(0, Math.floor(cy - stroke.radius)); y <= Math.min(H - 1, cy + stroke.radius); y++) for (let x = Math.max(0, Math.floor(cx - stroke.radius)); x <= Math.min(W - 1, cx + stroke.radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > stroke.radius ** 2) continue;
      const k = y * W + x, erase = stroke.kind === 'erase', liquid = stroke.kind === 'water' || stroke.kind === 'lava';
      touched[k] = 1; cv.solid[k] = erase || liquid ? 0 : 1; cv.liquid[k] = liquid ? 1 : 0;
      cv.cave[k] = erase ? 1 : 0; cv.stratum[k] = stroke.kind === 'soil' ? 1 : 0;
      cv.rock[k] = stroke.kind === 'rock' ? 1 : 0; cv.props[k] = 0; cv.trees[k] = 0; cv.grass[k] = 0; cv.depth[k] = erase || liquid ? 0 : y + 1;
      // Material noise is anchored to world coordinates, not the pointer samples.
      const noise = ((Math.imul(x + y * W, 2654435761) >>> 0) % 17) / 255;
      const rgb = erase ? hex(cfg.tint) : hex(stroke.color).map((v) => Math.min(1, v + noise));
      cv.paint(k, pack(rgb));
    }
  }
  if (cfg.strokes.length) for (let y = 1; y < H - 2; y++) for (let x = 1; x < W - 1; x++) {
    const k = y * W + x;
    cv.open[k] = !cv.solid[k] && !cv.liquid[k] && !cv.rock[k] && !cv.trees[k] && !cv.props[k] && cv.solid[k + W] && !cv.liquid[k + W] ? 1 : 0;
    if (cv.open[k]) cv.grass[k] = 1;
  }
  // Locked scene objects keep their own seed while the surrounding world changes.
  const warnings = [];
  for (const o of cfg.objects) {
    const asset = artAssets().find((a) => a.id === o.asset); if (!asset) continue;
    const size = Math.max(8, Math.round(64 * o.scale)), image = fitPixels(generate(asset, o.locked ? o.seed : (o.seed ^ hashString(seed)) >>> 0, 2).pix, size, size);
    let foot = -1;
    for (let delta = 0; delta < H; delta++) for (const y of [Math.round(o.y) + delta, Math.round(o.y) - delta]) {
      if (foot >= 0 || y < size || y >= H - 2) continue;
      const x0 = Math.round(o.x - size / 2); let valid = !!cv.open[y * W + Math.round(o.x)];
      if (!valid) continue;
      for (let iy = 0; valid && iy < size; iy++) for (let ix = 0; ix < size; ix++) if (image.get(ix, iy) >>> 24) {
        const x = x0 + ix, yy = y - size + 1 + iy, k = yy * W + x;
        if (x < 1 || x >= W - 1 || cv.solid[k] || cv.liquid[k] || cv.rock[k] || cv.props[k]) { valid = false; break; }
      }
      if (valid) foot = y;
    }
    if (foot < 0) { warnings.push('No free attachment surface for ' + asset.name); continue; }
    const claim = ++cv.nprops;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const col = image.get(x, y); if (!(col >>> 24)) continue;
      const k = (foot - size + 1 + y) * W + Math.round(o.x - size / 2) + x;
      cv.paint(k, col); cv.props[k] = claim; cv.trees[k] = 1; cv.depth[k] = foot; cv.open[k] = 0;
    }
  }
  const tint = pack(hex(cfg.tint));
  if (cfg.mix || cfg.light !== 1) for (let k = 0; k < cv.pix.px.length; k++) {
    const c = mixPacked(cv.pix.px[k], tint, cfg.mix);
    cv.paint(k, pack([c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((v) => v / 255 * cfg.light)));
  }
  for (const l of cfg.lights || []) cv.pending.push([l.x, l.y, l.radius, hex(l.color), l.strength]);
  cv.meta.artWarnings = warnings; cv.meta.artAtmosphere = cfg.atmosphere;
}
