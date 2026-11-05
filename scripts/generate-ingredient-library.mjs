// Offline pixel-art authoring/export. The game consumes the resulting PNGs;
// it never runs this authoring pipeline when an ingredient is poured.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/materials/generator.js';
import { WILD_SPECS } from '../src/materials/wild.js';
import { BIOMES } from '../src/game/biomes.js';
import { describe } from '../src/visual/descriptor.js';
import { FAMILIES } from '../src/visual/families/index.js';
import { rasterize } from '../src/visual/raster.js';
import { plantFrame } from '../src/visual/render.js';
import { Pixels } from '../src/visual/pixels.js';
import { inked } from '../src/visual/style.js';
import { validateAtlas } from '../src/visual/atlas-contract.js';
import { encodePng } from './lib/png.mjs';
import { hashString } from '../src/core/rng.js';

const OUT = new URL('../assets/ingredients/biomes/', import.meta.url);
const SOURCE = new URL('../art/ingredients/', import.meta.url);
const N = 64, PAD = 4, CELL = N + PAD * 2, COLS = 12;
const STAGES = ['icon', 'seed', 'sprout', 'young', 'developing', 'mature'];
const world = generateWorld('ingredient-library-v2');
const materials = new Map(world.materials.map((m) => [m.id, m]));
mkdirSync(OUT, { recursive: true }); mkdirSync(SOURCE, { recursive: true });

function fit(src, fraction = 1) {
  const out = new Pixels(N, N), scale = Math.min((N - 4) / src.w, (N - 4) / src.h) * fraction;
  const w = Math.max(1, Math.round(src.w * scale)), h = Math.max(1, Math.round(src.h * scale));
  const ox = Math.round((N - w) / 2), oy = N - 2 - h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.set(x + ox, y + oy, src.get(Math.floor(x / scale), Math.floor(y / scale)));
  return out;
}
function masterIcon(d) {
  const model = FAMILIES[d.family].icon(d);
  model.fit(N - 4, N - 4, { margin: 1 });
  // Rasterize geometry at native resolution, rather than enlarging a 32px icon.
  return fit(inked(rasterize(model, N - 4, N - 4, d.pal, { seed: d.seeds.surface, outline: false }).pix));
}
function propagation(d, spec) {
  const p = new Pixels(N, N), seed = hashString(spec.key), mineral = ['stone', 'shard', 'crystal', 'nugget', 'crust', 'shell'].includes(spec.shape);
  const fungal = ['mushroom', 'cap', 'truffle', 'bracket', 'toadstool'].includes(spec.shape);
  const colors = d.pal.main, mid = colors[Math.floor(colors.length / 2)], light = colors[colors.length - 1], dark = colors[0];
  const count = 2 + seed % 3;
  for (let i = 0; i < count; i++) {
    const cx = 19 + i * 9, cy = 44 + (i % 2) * 8, rx = 5 + (seed >>> (i + 3)) % 4, ry = mineral ? 11 : fungal ? 5 : 8;
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const q = mineral ? Math.abs(x / rx) + Math.abs(y / ry) : (x / rx) ** 2 + (y / ry) ** 2;
      if (q > 1) continue;
      const edge = q > 0.75;
      p.set(cx + x, cy + y, edge ? dark : x + y < -2 ? light : mid);
      if (!edge && x === (seed % 3) - 1) p.set(cx + x, cy + y, dark);
    }
    // Hilum/vein, mineral facet or spore pore gives each propagation form anatomy.
    p.rect(cx - 1, cy - 3, 2, 4, light);
  }
  return inked(p).w === N ? p : fit(inked(p));
}
function arcane(p, seed) {
  const out = new Pixels(p.w, p.h); out.px.set(p.px);
  // Sparse anatomical runes and one luminous inner vein; preserve the mask.
  const paint = (x, y, c) => { if (p.get(x, y) >>> 24) out.set(x, y, c); };
  for (let y = 5; y < p.h - 4; y++) {
    const x = Math.round(p.w / 2 + Math.sin(y * 0.13 + seed % 5) * 8);
    if (y % 3 !== 0) paint(x, y, 0xffffdfb3);
    if (y % 13 === 0) { paint(x - 1, y - 1, 0xffefad87); paint(x + 1, y - 1, 0xfffff3e6); paint(x + 2, y, 0xffffdfb3); }
  }
  // Small, connected four-stroke marks, chosen from existing opaque pixels.
  const points = [];
  for (let y = 8; y < p.h - 5; y += 2) for (let x = 6; x < p.w - 5; x += 2) if (p.get(x, y) >>> 24 && p.get(x + 2, y + 2) >>> 24) points.push([x, y]);
  for (let i = 0; i < Math.min(4, points.length); i++) {
    const [x, y] = points[(seed + i * 37) % points.length];
    for (const [dx, dy] of [[0, 0], [1, -1], [2, 0], [1, 1], [1, 2]]) paint(x + dx, y + dy, dy === 0 ? 0xfffff3e6 : 0xffeaa069);
  }
  return out;
}
function restore(source) {
  const p = new Pixels(source.width, source.height); let offset = 0;
  for (let i = 0; i < source.runs.length; i += 2) {
    const index = source.runs[i], count = source.runs[i + 1];
    if (!Number.isInteger(count) || count <= 0 || offset + count > p.px.length || !Number.isInteger(source.palette[index])) throw new Error('Invalid editable source');
    p.px.fill(source.palette[index], offset, offset + count); offset += count;
  }
  if (offset !== p.px.length || p.w !== N || p.h !== N) throw new Error('Invalid master size');
  return p;
}
function editable(p) {
  const palette = [0], ids = new Map([[0, 0]]), runs = []; let last = -1, count = 0;
  for (const c of p.px) {
    if (!ids.has(c)) { ids.set(c, palette.length); palette.push(c); }
    const i = ids.get(c);
    if (i === last && count < 65535) count++;
    else { if (count) runs.push(last, count); last = i; count = 1; }
  }
  if (count) runs.push(last, count);
  return { width: p.w, height: p.h, palette, runs };
}

const library = { version: 2, nativeResolution: N, stages: STAGES, biomes: {}, species: 0, frames: 0 };
for (const biome of BIOMES) {
  const sourceFile = new URL(biome.id + '.json', SOURCE);
  const authored = !process.argv.includes('--reauthor') && existsSync(sourceFile) ? JSON.parse(readFileSync(sourceFile, 'utf8')) : null;
  const specs = WILD_SPECS.filter((s) => !s.arcaneVariant && s.region === biome.id);
  const count = specs.length * 2 * STAGES.length;
  const width = COLS * CELL, height = Math.ceil(count / COLS) * CELL;
  const pixels = new Pixels(width, height), frames = {}, sources = { version: 1, biome: biome.id, nativeResolution: N, species: {} };
  let index = 0;
  for (const spec of specs) {
    const d = describe((/** @type {any} */ (materials.get('wild-' + spec.key))).vis), seed = hashString(spec.key);
    const icon = masterIcon(d);
    const masters = { icon, seed: propagation(d, spec),
      sprout: fit(plantFrame(d, 0, { k: 2, mount: 'ground' }).pix, 0.48),
      young: fit(plantFrame(d, 1, { k: 2, mount: 'ground' }).pix, 0.68),
      developing: fit(plantFrame(d, 2, { k: 2, mount: 'ground' }).pix, 0.85),
      mature: fit(plantFrame(d, 2, { k: 2, mount: 'ground' }).pix) };
    for (const stage of STAGES) if (authored?.species[spec.key]?.[stage]) masters[stage] = restore(authored.species[spec.key][stage]);
    sources.species[spec.key] = Object.fromEntries(STAGES.map((stage) => [stage, editable(masters[stage])]));
    for (const magic of [false, true]) for (const stage of STAGES) {
      const key = spec.key + (magic ? '@arcane' : ''), id = `${key}:${stage}`;
      const art = magic ? (authored?.species[key]?.[stage] ? restore(authored.species[key][stage]) : arcane(masters[stage], seed)) : masters[stage];
      sources.species[key] ??= {}; sources.species[key][stage] = editable(art);
      const x = index % COLS * CELL + PAD, y = Math.floor(index / COLS) * CELL + PAD;
      pixels.draw(art, x, y);
      frames[id] = { asset: id, species: spec.key, material: 'wild-' + key, rarity: spec.rarity, arcane: magic, biome: biome.id,
        stage, atlas: biome.id + '.png', rect: [x, y, N, N], pivot: stage === 'icon' ? [0.5, 0.5] : [0.5, 0.97], nativeResolution: [N, N], shape: spec.shape, name: (magic ? 'Arcane ' : '') + spec.noun };
      index++;
    }
  }
  const atlas = { version: 1, libraryVersion: 2, biome: biome.id, width, height, image: biome.id + '.png', padding: PAD, count, frames };
  const errors = validateAtlas(atlas); if (errors.length) throw new Error(errors.join('; '));
  writeFileSync(new URL(biome.id + '.png', OUT), encodePng(width, height, pixels.data));
  writeFileSync(new URL(biome.id + '.json', OUT), JSON.stringify(atlas) + '\n');
  writeFileSync(new URL(biome.id + '.json', SOURCE), JSON.stringify(sources) + '\n');
  library.biomes[biome.id] = { metadata: 'biomes/' + biome.id + '.json', image: 'biomes/' + biome.id + '.png', species: specs.length, frames: count };
  library.species += specs.length; library.frames += count;
  console.log(`${biome.name}: ${specs.length} species, ${count} native ${N}px frames, ${width} × ${height}`);
}
writeFileSync(new URL('../manifest.json', OUT), JSON.stringify(library, null, 2) + '\n');
