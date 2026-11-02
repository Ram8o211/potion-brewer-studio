// One executable graph is consumed by editor previews and game frames.
import { artDomain, artAssets, artRevision } from './direction.js';
import { generate } from './engine.js';
import { Pixels } from '../visual/pixels.js';
const cache = new Map();
export function fitPixels(src, width, height) {
  const out = new Pixels(width, height);
  let x0 = src.w, y0 = src.h, x1 = 0, y1 = 0;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.get(x, y) >>> 24) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  if (x0 >= x1) return out;
  const scale = Math.min((width - 2) / (x1 - x0), (height - 2) / (y1 - y0)), ox = (width - (x1 - x0) * scale) / 2, oy = height - 1 - (y1 - y0) * scale;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.set(x, y, src.get(x0 + Math.floor((x - ox) / scale), y0 + Math.floor((y - oy) / scale)));
  return out;
}
export function boundPixels(key, seed, stage, width, height) {
  const id = artDomain('ingredients', key)?.asset;
  return id ? assetPixels(id, seed, stage, width, height) : null;
}
export function assetPixels(id, seed, stage, width = 32, height = 32) {
  const asset = artAssets().find((a) => a.id === id); if (!asset) return null;
  const key = `${artRevision()}:${id}:${seed}:${stage}:${width}:${height}`;
  if (cache.has(key)) return cache.get(key);
  const out = fitPixels(generate(asset, seed, stage).pix, width, height);
  if (cache.size > 160) cache.clear(); cache.set(key, out); return out;
}
