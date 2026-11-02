import { Pixels } from '../visual/pixels.js';
import { hex, pack } from '../visual/color.js';
export const colorWord = (color) => pack(hex(color));
export const wordColor = (c) => '#' + [c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((n) => n.toString(16).padStart(2, '0')).join('');
export function line(x0, y0, x1, y1, put) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) { put(x0, y0); if (x0 === x1 && y0 === y1) break; const e = err * 2; if (e >= dy) { err += dy; x0 += sx; } if (e <= dx) { err += dx; y0 += sy; } }
}
/** Flood region returns its indices; each pixel visited at most once. */
export function region(pixels, w, h, x, y) {
  if (x < 0 || y < 0 || x >= w || y >= h) return [];
  const seed = y * w + x, target = pixels[seed], seen = new Uint8Array(w * h), stack = [seed], out = [];
  seen[seed] = 1;
  while (stack.length) {
    const i = stack.pop(); out.push(i); const xx = i % w, yy = Math.floor(i / w);
    for (const [a, b] of [[xx - 1, yy], [xx + 1, yy], [xx, yy - 1], [xx, yy + 1]]) {
      const j = b * w + a;
      if (a >= 0 && b >= 0 && a < w && b < h && !seen[j] && pixels[j] === target) { seen[j] = 1; stack.push(j); }
    }
  }
  return out;
}
export function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Pixel correction layers distinguish untouched (0) and explicit cutout (-1). */
export function composite(base, layers, stage, variant) {
  const out = new Pixels(base.w, base.h); out.px.set(base.px);
  for (const l of layers) {
    if (!l.visible || l.scope === 'stage' && l.stage !== stage || l.scope === 'variant' && l.variant !== variant) continue;
    for (let i = 0; i < out.px.length; i++) {
      const c = l.pixels[i]; if (!c) continue;
      const alpha = (c === -1 ? 1 : (c >>> 24) / 255) * l.opacity;
      const old = out.px[i], oa = (old >>> 24) / 255;
      if (c === -1) { out.px[i] = alpha >= 1 ? 0 : ((old & 0xffffff) | (Math.round(oa * (1 - alpha) * 255) << 24)) >>> 0; continue; }
      const a = alpha + oa * (1 - alpha);
      let word = Math.round(a * 255) << 24;
      for (let k = 0; k < 3; k++) word |= Math.round((((c >>> (k * 8)) & 255) * alpha + ((old >>> (k * 8)) & 255) * oa * (1 - alpha)) / (a || 1)) << (k * 8);
      out.px[i] = word >>> 0;
    }
  }
  return out;
}
/** Transform a bitmap around its centre, with nearest-neighbour inverse sampling. */
export function transformed(src, angle = 0, scale = 1, flip = false) {
  const out = new Pixels(src.w, src.h), r = angle * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), cx = src.w / 2, cy = src.h / 2;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    let u = ((x + 0.5 - cx) * c + (y + 0.5 - cy) * s) / scale;
    const v = (-(x + 0.5 - cx) * s + (y + 0.5 - cy) * c) / scale;
    if (flip) u = -u;
    out.set(x, y, src.get(Math.floor(u + cx), Math.floor(v + cy)));
  }
  return out;
}

/** Inspect PNG IHDR before allocating a decoded bitmap. @param {Uint8Array} bytes */
export function validatePNGHeader(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((v, i) => bytes[i] === v) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('Not a valid PNG header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), w = view.getUint32(16), h = view.getUint32(20);
  if (!w || !h || w > 4096 || h > 4096) throw new Error('PNG dimensions must be between 1 and 4096 pixels');
  return { w, h };
}
