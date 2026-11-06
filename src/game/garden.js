import { RARITIES } from '../materials/rarity.js';
import { checkpoint, growthOf } from './gathering.js';
import { seedDrop } from './travel.js';

export const GARDEN = Object.freeze({ initialPlots: 3, maxPlots: 18, offlineCapMs: 8 * 3600000, harvestMl: 50 });
export const FACILITIES = Object.freeze({ soil: { label: 'Soil plot', price: 0, rank: 0 }, fungal: { label: 'Fungal chamber', price: 80, rank: 1 }, mineral: { label: 'Mineral bed', price: 90, rank: 1 }, exotic: { label: 'Exotic planter', price: 240, rank: 3 }, arcane: { label: 'Arcane chamber', price: 180, rank: 2 } });
export function createGarden(now = Date.now()) {
  return { version: 1, seeds: /** @type {Record<string, number>} */ ({}), plots: /** @type {any[]} */ (Array.from({ length: GARDEN.initialPlots }, (_, i) => ({ id: 'plot-' + i, facility: 'soil', crop: null }))), serial: 0, time: 0, wall: now, unlocked: false, demoUsed: false };
}
export function normalizeGarden(raw, lookup, now = Date.now()) {
  const g = createGarden(now);
  if (!raw || typeof raw !== 'object') return g;
  g.unlocked = !!raw.unlocked;
  g.demoUsed = !!raw.demoUsed || (Array.isArray(raw.plots) && raw.plots.some((p) => p?.crop?.tutorial));
  if (Number.isFinite(raw.wall) && raw.wall >= 0) g.wall = raw.wall;
  if (Number.isFinite(raw.time) && raw.time >= 0) g.time = raw.time;
  if (Number.isSafeInteger(raw.serial) && raw.serial >= 0) g.serial = raw.serial;
  for (const [id, count] of Object.entries(raw.seeds || {})) if (lookup(id)?.speciesId && Number.isSafeInteger(count) && Number(count) >= 0) g.seeds[id] = Math.min(999, Number(count));
  if (Array.isArray(raw.plots)) g.plots = raw.plots.slice(0, GARDEN.maxPlots).map((p, i) => {
    const c = p?.crop;
    return { id: 'plot-' + i, facility: FACILITIES[p?.facility] ? p.facility : 'soil', crop: c && typeof c.id === 'string' && lookup(c.materialId)?.speciesId ? {
      id: c.id, materialId: c.materialId, x: 0, y: 0, born: Math.max(0, Number(c.born) || 0),
      g: Math.max(0, Math.min(1, Number(c.g) || 0)), t: Math.min(g.time, Math.max(0, Number(c.t) || 0)), w: Math.max(0, Math.min(1, Number(c.w) || 0)), tutorial: !!c.tutorial,
    } : null };
  });
  while (g.plots.length < GARDEN.initialPlots) g.plots.push({ id: 'plot-' + g.plots.length, facility: 'soil', crop: null });
  return g;
}
export function settleGarden(g, now = Date.now()) {
  if (!Number.isFinite(now) || now < g.wall || now < 0) return g.time;
  g.time += Math.min(GARDEN.offlineCapMs, now - g.wall); g.wall = now;
  return g.time;
}
function growthDeposit(m, crop) {
  return /** @type {any} */ ({ growMs: crop.tutorial ? 15000 : RARITIES[m.rarity].growthMs, botanical: m.cultivation !== 'mineral', thirst: 0.45, region: 'forest' });
}
export function gardenStatus(g, plot, lookup, now = Date.now()) {
  settleGarden(g, now);
  const c = plot.crop, m = c && lookup(c.materialId);
  if (!m) return { stage: 'empty', growth: 0, moisture: 0, mature: false, material: null };
  const q = growthOf(growthDeposit(m, c), c, g.time);
  return { stage: q.g >= 1 ? 'mature' : q.g >= 0.7 ? 'developing' : q.g >= 0.35 ? 'young' : q.g >= 0.08 ? 'sprout' : 'seed', growth: q.g, moisture: q.w || 0, mature: q.g >= 1, material: m };
}
export function canCultivate(plot, m) {
  if (m.arcaneVariant) return plot.facility === 'arcane';
  if (['moonfen', 'skyshard', 'morphgrove', 'veil', 'ghostglass', 'chronoglass'].includes(m.wild?.region)) return plot.facility === 'exotic' || plot.facility === 'arcane';
  return plot.facility === m.cultivation || plot.facility === 'exotic' || plot.facility === 'arcane';
}
export function plantSeed(st, plotId, id, now = Date.now()) {
  const g = st.garden, p = g.plots.find((p) => p.id === plotId), m = st.lookup(id);
  settleGarden(g, now);
  if (!g.unlocked || !p || p.crop || !(g.seeds[id] > 0) || !m || !canCultivate(p, m)) return { ok: false, reason: 'Choose an empty compatible plot and an available propagation material.' };
  g.seeds[id]--;
  const demo = !g.demoUsed && id === 'wild-silverleaf' && st.tutorial.active && !st.tutorial.done && st.stats.served === 0;
  if (demo) g.demoUsed = true;
  p.crop = { id: `${st.seed}:crop:${g.serial++}`, materialId: id, x: 0, y: 0, born: g.time, g: 0, t: g.time, w: 0.25, tutorial: demo };
  return { ok: true };
}
export function waterPlot(st, plotId, now = Date.now()) {
  const g = st.garden, p = g.plots.find((p) => p.id === plotId);
  settleGarden(g, now);
  const c = p?.crop, m = c && st.lookup(c.materialId);
  if (!m || m.cultivation === 'mineral') return { ok: false, reason: 'This bed does not need water.' };
  const q = checkpoint(growthDeposit(m, c), c, g.time);
  p.crop = { ...c, ...q, w: Math.min(1, q.w + 0.6) };
  return { ok: true };
}
export function harvestGarden(st, plotId, now = Date.now()) {
  const g = st.garden, p = g.plots.find((p) => p.id === plotId);
  if (!p?.crop) return { ok: false, reason: 'Empty plot.' };
  const status = gardenStatus(g, p, st.lookup, now), m = status.material;
  if (!status.mature) return { ok: false, reason: 'Still growing.' };
  const have = st.stock(m.id);
  if (!Number.isFinite(have) || st.cap.storage - have < GARDEN.harvestMl) return { ok: false, reason: 'Make room in the inventory.' };
  const seed = seedDrop(st.seed, p.crop.id, m, true);
  st.inventory[m.id] = have + GARDEN.harvestMl; st.found[m.id] = 1;
  if (seed) g.seeds[m.id] = Math.min(999, (g.seeds[m.id] || 0) + 1);
  p.crop = null;
  return { ok: true, amount: GARDEN.harvestMl, seed };
}
