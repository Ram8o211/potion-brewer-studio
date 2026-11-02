// Executable attachment hierarchy, sharing the game's material rasterizer.
import { Rng, hashString } from '../core/rng.js';
import { Model } from '../visual/geometry.js';
import { rasterize } from '../visual/raster.js';
import { ramp, hex } from '../visual/color.js';
import { Pixels } from '../visual/pixels.js';
import { composite } from './pixels.js';
/** Geometry, procedural texture and pixel corrections remain separate. */
export function componentPixels(component, stage = 2, variant = 0) {
  const m = new Model();
  /** @type {Record<string, number[]>} */
  const pal = {};
  for (const [i, g] of component.geometry.entries()) {
    const x = g.x, y = g.y, w = g.width / 2, h = g.height / 2, mat = 'g' + i;
    pal[mat] = ramp(hex(g.color));
    /** @type {import('../visual/geometry.js').Pt[]} */
    let pts;
    if (g.shape === 'stem') { m.stroke([[x, y + h], [x - 1, y], [x, y - h]], Math.max(1, w / 2), mat); continue; }
    if (g.shape === 'leaf') pts = [[x, y + h], [x - w, y + h / 3], [x - w * 0.7, y - h / 2], [x, y - h], [x + w, y - h / 3], [x + w * 0.6, y + h / 2]];
    else if (g.shape === 'crystal') pts = [[x - w, y + h], [x - w, y - h / 2], [x, y - h], [x + w, y - h / 2], [x + w * 0.7, y + h]];
    else if (g.shape === 'ellipse') pts = Array.from({ length: 24 }, (_, j) => [x + Math.cos(j / 12 * Math.PI) * w, y + Math.sin(j / 12 * Math.PI) * h]);
    else pts = [[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]];
    m.poly(pts, mat, { shade: g.shape === 'crystal' ? 'facet' : 'round', lum: 0.7 });
  }
  const base = rasterize(m, 32, 32, pal, { seed: hashString(component.id + ':surface') }).pix;
  return composite(base, component.layers, stage, variant);
}
const transform = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const multiply = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
/** Seed streams are addressed by node + instance path, never shared mutable RNG. */
export function generate(asset, seed = asset.seed, stage = 2) {
  const pix = new Pixels(asset.width, asset.height), owners = new Int16Array(pix.px.length).fill(-1), instances = [], warnings = [];
  const byParent = new Map();
  for (const n of asset.nodes) { if (!byParent.has(n.parent)) byParent.set(n.parent, []); byParent.get(n.parent).push(n); }
  const sprites = new Map(); let emitted = 0;
  const visit = (parent, matrix, path, depth) => {
    if (depth > 32) { warnings.push('Hierarchy depth limit reached'); return; }
    const children = byParent.get(parent) || [], chosen = new Map();
    for (const n of children) if (n.choice && !chosen.has(n.choice)) {
      const group = children.filter((c) => c.choice === n.choice && stage >= c.minStage && stage <= c.maxStage);
      const rng = new Rng(`${seed}:choice:${path}:${n.choice}`);
      if (group.reduce((s, g) => s + g.weight, 0) > 0) chosen.set(n.choice, rng.weighted(group, group.map((g) => g.weight)).id);
    }
    for (const n of children) {
      if (stage < n.minStage || stage > n.maxStage || n.choice && chosen.get(n.choice) !== n.id) continue;
      const c = asset.components.find((p) => p.id === n.component); if (!c) continue;
      if (!sprites.has(c.id)) sprites.set(c.id, componentPixels(c, stage, seed));
      const sprite = sprites.get(c.id);
      for (let i = 0; i < n.count; i++) {
        if (++emitted > 512) { warnings.push('512 instance limit reached'); return; }
        const key = `${path}/${n.id}:${i}`, rng = new Rng(`${n.locked ? n.lockSeed : seed}:morph:${key}`);
        if (rng.next() >= n.probability) continue;
        const growth = asset.stages[stage], r = (n.angle + rng.range(-n.jitter, n.jitter)) * Math.PI / 180;
        const s = n.scale * (n.locked ? 1 : growth), flip = n.mirror && i % 2 ? -1 : 1;
        const m = multiply(matrix, [Math.cos(r) * s * flip, Math.sin(r) * s * flip, -Math.sin(r) * s, Math.cos(r) * s, n.x + (i - (n.count - 1) / 2) * n.spread, n.y]);
        const paint = multiply(m, [1, 0, 0, 1, -c.anchor[0], -c.anchor[1]]);
        const det = paint[0] * paint[3] - paint[1] * paint[2];
        const cells = [];
        // Inverse mapping prevents holes in scaled/rotated components.
        const corners = [[0, 0], [32, 0], [32, 32], [0, 32]].map(([x, y]) => transform(paint, x, y));
        const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0])))), x1 = Math.min(pix.w, Math.ceil(Math.max(...corners.map((p) => p[0]))));
        const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1])))), y1 = Math.min(pix.h, Math.ceil(Math.max(...corners.map((p) => p[1]))));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const dx = x + 0.5 - paint[4], dy = y + 0.5 - paint[5];
          const col = sprite.get(Math.floor((paint[3] * dx - paint[2] * dy) / det), Math.floor((-paint[1] * dx + paint[0] * dy) / det));
          if (col >>> 24) cells.push([y * pix.w + x, col]);
        }
        if (n.avoidOverlap && cells.some(([k]) => pix.px[k] >>> 24)) continue;
        const index = instances.length;
        for (const [k, col] of cells) { pix.px[k] = col; owners[k] = index; }
        instances.push({ node: n.id, component: c.id, matrix: paint, parentMatrix: matrix.slice(), path: key, pixels: cells.length });
        const at = n.anchor === 'tip' ? c.tip : c.anchor;
        const endpoint = transform(paint, at[0], at[1]);
        visit(n.id, [m[0], m[1], m[2], m[3], endpoint[0], endpoint[1]], key, depth + 1);
      }
    }
  };
  visit('', [1, 0, 0, 1, 0, 0], '', 0);
  return { pix, owners, instances, warnings: [...new Set(warnings)] };
}
