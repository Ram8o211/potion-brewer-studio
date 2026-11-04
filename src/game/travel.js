import { Rng, hashString } from '../core/rng.js';
import { RARITIES } from '../materials/rarity.js';
import { BIOME_BY_ID } from './biomes.js';

export const TRAVEL = Object.freeze({ capacity: 3, initial: 3, rechargeMs: 25 * 60000, excellentGiftChance: 0.18, arcaneSeedFactor: 0.35 });
export const ARCANE_FREQUENCY = Object.freeze({ common: 0.06, uncommon: 0.04, rare: 0.025, unique: 0.01, legendary: 0.004 });
const validTime = (now) => Number.isFinite(now) && now >= 0;
export function createTraveller(now = Date.now()) { return { balance: Number(TRAVEL.initial), last: validTime(now) ? now : 0 }; }
export function normalizeTraveller(raw, now = Date.now()) {
  const t = createTraveller(now);
  if (raw && Number.isFinite(raw.balance)) t.balance = Math.max(0, Math.min(TRAVEL.capacity, Math.floor(raw.balance)));
  if (validTime(raw?.last)) t.last = raw.last;
  return t;
}
export function settleTraveller(t, now = Date.now()) {
  if (!validTime(now) || now < t.last) return t.balance;
  if (t.balance >= TRAVEL.capacity) { t.last = now; return t.balance; }
  const gained = Math.min(TRAVEL.capacity - t.balance, Math.floor((now - t.last) / TRAVEL.rechargeMs));
  t.balance += gained;
  if (t.balance === TRAVEL.capacity) t.last = now; else t.last += gained * TRAVEL.rechargeMs;
  return t.balance;
}
export function spendTraveller(t, now = Date.now()) {
  settleTraveller(t, now);
  if (t.balance < 1) return false;
  if (t.balance === TRAVEL.capacity) t.last = Math.max(t.last, Number.isFinite(now) ? now : t.last);
  t.balance--; return true;
}

/** A saved roster is immutable for its generation, including on later rank-ups. */
export function makeBiomeInstance(world, lookup, region, revision, rank) {
  const seed = `${world.seed}:biome-v1:${region}:${revision}`, rng = new Rng(seed), biome = BIOME_BY_ID[region];
  const pool = (world.wild || []).map(lookup).filter((m) => m?.wild?.region === region && !m.arcaneVariant && (m.wild.rank || 0) <= rank);
  const chosen = [], candidates = pool.slice();
  while (chosen.length < Math.min(6, pool.length) && candidates.length) {
    const m = rng.weighted(candidates, candidates.map((m) => RARITIES[m.rarity]?.spawnWeight * (m.dominant === biome.dominant ? 8 : 1) || 1));
    candidates.splice(candidates.indexOf(m), 1); chosen.push(m);
  }
  if (region === 'forest' && revision === 0) {
    const leaf = lookup('wild-silverleaf');
    if (leaf && !chosen.includes(leaf)) { if (chosen.length === 6) chosen.pop(); chosen.unshift(leaf); }
  }
  const roster = [];
  for (const m of chosen) {
    const r = RARITIES[m.rarity] || RARITIES.common;
    roster.push({ id: m.id, count: rng.int(r.specimens[0], r.specimens[1]) });
    const chance = ARCANE_FREQUENCY[m.rarity] * (biome.category === 'exotic' ? 1.5 : 1);
    if (rng.chance(chance) && lookup(m.id + '@arcane')) roster.push({ id: m.id + '@arcane', count: 1 });
  }
  // Demonstration material is guaranteed, rather than a rare tutorial lottery.
  if (region === 'forest' && revision === 0 && !roster.some((r) => r.id === 'wild-silverleaf@arcane')) roster.push({ id: 'wild-silverleaf@arcane', count: 1 });
  return { version: 1, seed, revision, roster, captured: [] };
}
export function seedDrop(worldSeed, event, material, garden = false) {
  const p = (RARITIES[material.rarity]?.seedChance || 0) * (material.arcaneVariant ? TRAVEL.arcaneSeedFactor : 1) * (garden ? 0.5 : 1);
  return hashString(`${worldSeed}:seed-v1:${event}:${material.id}`) / 4294967296 < p;
}
