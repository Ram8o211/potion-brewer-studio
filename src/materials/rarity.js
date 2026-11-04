// Intrinsic magical quality. These intervals are in the simulation's native
// potency units before extraction, dilution, opposition and saturation.
export const RARITY_KEYS = Object.freeze(['common', 'uncommon', 'rare', 'unique', 'legendary']);
export const RARITIES = Object.freeze({
  common: Object.freeze({ label: 'Common', magnitude: [16, 26], secondaryCount: [1, 2], secondaryRatio: [0.3, 0.75], spawnWeight: 70, specimens: [2, 3], seedChance: 0.35, value: 1, visual: 'natural', growthMs: 300000, rank: 0 }),
  uncommon: Object.freeze({ label: 'Uncommon', magnitude: [30, 40], secondaryCount: [1, 2], secondaryRatio: [0.08, 0.25], spawnWeight: 24, specimens: [2, 3], seedChance: 0.22, value: 1.8, visual: 'distinctive', growthMs: 720000, rank: 1 }),
  rare: Object.freeze({ label: 'Rare', magnitude: [50, 65], secondaryCount: [1, 1], secondaryRatio: [0.02, 0.06], spawnWeight: 5, specimens: [1, 2], seedChance: 0.1, value: 4, visual: 'complex', growthMs: 1800000, rank: 2 }),
  unique: Object.freeze({ label: 'Unique', magnitude: [80, 95], secondaryCount: [0, 0], secondaryRatio: [0, 0], spawnWeight: 0.9, specimens: [1, 1], seedChance: 0.04, value: 10, visual: 'singular', growthMs: 7200000, rank: 3 }),
  legendary: Object.freeze({ label: 'Legendary', magnitude: [160, 200], secondaryCount: [0, 0], secondaryRatio: [0, 0], spawnWeight: 0.1, specimens: [1, 1], seedChance: 0.01, value: 30, visual: 'signature', growthMs: 21600000, rank: 4 }),
});

/** @param {Record<string,number>} effects */
export function effectQuality(effects) {
  const entries = Object.entries(effects || {}).filter(([, v]) => Number.isFinite(v) && Math.abs(v) > 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const magnitude = Math.abs(entries[0]?.[1] || 0), secondaries = entries.slice(1);
  return { dominant: entries[0]?.[0] || null, magnitude, secondaryCount: secondaries.length,
    ratios: secondaries.map(([, v]) => Math.abs(v) / magnitude),
    purity: magnitude ? magnitude / (magnitude + secondaries.reduce((n, [, v]) => n + Math.abs(v), 0)) : 0 };
}

/** All errors, rather than a permissive best-fit classification. @param {{rarity:string, effects:Record<string,number>, dominant?:string}} species */
export function validateRarity(species) {
  const rule = RARITIES[species.rarity], errors = [];
  if (!rule) return ['Unknown rarity: ' + species.rarity];
  const q = effectQuality(species.effects);
  if (Object.values(species.effects || {}).some((v) => !Number.isFinite(v))) errors.push('Non-finite effect');
  if (q.magnitude < rule.magnitude[0] || q.magnitude > rule.magnitude[1]) errors.push('Dominant magnitude outside rarity interval');
  if (species.dominant && q.dominant !== species.dominant) errors.push('Dominant effect does not match identity');
  if (q.secondaryCount < rule.secondaryCount[0] || q.secondaryCount > rule.secondaryCount[1]) errors.push('Invalid secondary effect count');
  if (q.ratios.some((r) => r < rule.secondaryRatio[0] - 1e-9 || r > rule.secondaryRatio[1] + 1e-9)) errors.push('Invalid secondary-to-primary ratio');
  return errors;
}
