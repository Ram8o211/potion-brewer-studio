import { Rng } from '../core/rng.js';
import { RARITIES, RARITY_KEYS, validateRarity } from './rarity.js';

// Permanent ecology. Array order is content authoring order, never a sprite index.
// Each pair introduces genuinely different species at one intrinsic rarity.
export const BIOME_SPECIES = {
  forest: ['Silverleaf|leaf', 'Honeycup Mushroom|mushroom', 'Dawnblossom|flower', 'Dewpear|pear', 'Heartwood Mandrake|root', 'Sylvashard Bark|bark', 'Crown of the Grove|fern', 'Elderheart Truffle|truffle', 'Worldroot Heart|root', 'Evergreen Chalice|clover'],
  meadow: ['Meadow Daisy|flower', 'Sungrass|sprig', 'Brightberry|berry', 'Honeyclover|clover', 'Suncrown Flower|flower', 'Meadowcrystal|crystal', 'Rainbow Petal|petal', 'Queenbee Orchid|bluebell', 'Aurelian Sunwheel|spike', 'Everlasting Heartrose|flower'],
  river: ['Willowleaf|leaf', 'Reedcap Mushroom|mushroom', 'Riverlotus|flower', 'Bubbleberry|orb', 'Tidebloom|flower', 'Streampearl Oyster|shell', 'Glacial Waterlily|petal', 'Winterglass Reed|reed', 'Stillwater Crown|crystal', 'Pearl of Deepwinter|shell'],
  quarry: ['Stonewort|sprig', 'Quarrycap|mushroom', 'Ironbloom|spike', 'Stoneberry|berry', 'Orebud|nugget', 'Ferric Crystal|crystal', 'Titan Truffle|truffle', 'Adamant Rosette|shard', 'Mountainheart Geode|stone', 'Atlas Root|root'],
  netherwood: ['Nethercap Mushroom|mushroom', 'Gloommoss|moss', 'Umbrabloom|bluebell', 'Shadefruit|plum', 'Sporelantern|bellbloom', 'Wraithvine|netpod', 'Nightbloom Core|orb', 'Widowglass|crystal', 'Black Mycelial Crown|bracket', 'Venom Queen Orchid|flower'],
  crags: ['Emberleaf|leaf', 'Cindershroom|mushroom', 'Fireberry|berry', 'Sulfurvine|teardrop', 'Flamecrest|flower', 'Blazestone Crystal|crystal', 'Phoenix Heartseed|seed', 'Cinderheart Cactus|spike', 'Everburning Sunheart|orb', 'Dragon Kilnstone|stone'],
  moonfen: ['Moonreed|reed', 'Fenmilk Mushroom|mushroom', 'Luneblue|flower', 'Dreamberry|berry', 'Moonveil Bloom|petal', 'Sleepglass Shard|shard', 'Astral Lotus|flower', 'Oracle Shell|shell', 'Celestial Mindseed|seed', 'Night Sovereign|fern'],
  skyshard: ['Skyspray|sprig', 'Cloudcap Mushroom|mushroom', 'Airstar|flower', 'Skyberry|berry', 'Updraft Seedpod|seed', 'Skyshard Bloom|crystal', 'Nimbus Orchid|bluebell', 'Weightless Geode|stone', 'Heavensail Fern|fern', 'Zenith Prism|shard'],
  morphgrove: ['Morphleaf|leaf', 'Shapecup Mushroom|mushroom', 'Twinsprout|sprig', 'Graftberry|berry', 'Formblossom|flower', 'Adaptive Core|orb', 'Chameleon Crown|fern', 'Polyhedral Root|root', 'Genesis Seed|seed', 'Thousandform Lotus|petal'],
  veil: ['Veilfern|fern', 'Hollowcap Mushroom|mushroom', 'Phasingbud|spike', 'Veilberry|berry', 'Hollowbloom|flower', 'Veilglass Crystal|crystal', 'Shroud Orchid|bluebell', 'Unseen Truffle|truffle', 'Eclipse Heart|orb', 'Absent Crown|moss'],
  ghostglass: ['Reefmoss|moss', 'Glasscap Mushroom|mushroom', 'Coralberry|berry', 'Shellfruit|teardrop', 'Ghostglass Coral|crystal', 'Pearlshell Oyster|shell', 'Threshold Anemone|flower', 'Spectral Spine|shard', 'Betweenworld Pearl|orb', 'Ghost Sovereign Coral|spike'],
  chronoglass: ['Timeweed|sprig', 'Sandshirt Mushroom|mushroom', 'Hourberry|berry', 'Chronovine|bellbloom', 'Epochbloom|flower', 'Chronoglass Shard|shard', 'Pendulum Root|root', 'Sundial Geode|stone', 'Paradox Crown|fern', 'Eternal Hourglass|crystal'],
};
export const BIOME_DOMINANT = { forest: 'vitality', meadow: 'love', river: 'frost', quarry: 'strength', netherwood: 'toxicity', crags: 'fire', moonfen: 'arcana', skyshard: 'levitation', morphgrove: 'transformation', veil: 'invisibility', ghostglass: 'phasing', chronoglass: 'temporal' };
const HUE = { forest: 96, meadow: 42, river: 177, quarry: 34, netherwood: 280, crags: 18, moonfen: 226, skyshard: 195, morphgrove: 310, veil: 263, ghostglass: 184, chronoglass: 46 };
export const speciesKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Build an immutable potency profile from species identity, never a biome instance.
 * @param {string} key @param {string} rarity @param {string} dominant
 * @param {string[]|Record<string, number>} [secondary]
 */
export function fixedProfile(key, rarity, dominant, secondary = []) {
  const r = RARITIES[rarity], rng = new Rng('quality-v1:' + key);
  const primary = Math.round(rng.range(r.magnitude[0], r.magnitude[1]) * 10) / 10;
  const effects = { [dominant]: primary };
  const original = Array.isArray(secondary) ? null : secondary;
  const sourceKeys = Array.isArray(secondary) ? secondary : Object.keys(secondary);
  const count = r.secondaryCount[0] === 0 ? 0 : Math.max(r.secondaryCount[0], Math.min(r.secondaryCount[1], sourceKeys.length ? sourceKeys.filter((k) => k !== dominant).length : 2));
  const opposite = { fire: 'frost', frost: 'fire', vitality: 'death', death: 'vitality' };
  const candidates = [];
  for (const k of [...new Set([...sourceKeys, 'frost', 'fire', 'acidity', 'death', 'toxicity'])]) {
    if (k !== dominant && k !== opposite[dominant] && !candidates.includes(opposite[k])) candidates.push(k);
  }
  for (let i = 0; i < count; i++) {
    // Keep rounding away from a tier's mathematical boundaries.
    const k = candidates[i], previous = original?.[k] / Math.abs(original?.[dominant]);
    const ratio = Number.isFinite(previous) && previous !== 0
      ? Math.max(r.secondaryRatio[0] + 0.005, Math.min(r.secondaryRatio[1] - 0.005, Math.abs(previous)))
      : rng.range(r.secondaryRatio[0] + 0.005, r.secondaryRatio[1] - 0.005);
    effects[k] = Math.round(primary * ratio * 100) / 100 * (previous < 0 ? -1 : 1);
  }
  const errors = validateRarity({ rarity, dominant, effects });
  if (errors.length) throw new Error(`${key}: ${errors.join(', ')}`);
  return effects;
}

/** Shared physical families; species select these without bespoke engine branches. */
export const CATALOG_SPECS = Object.entries(BIOME_SPECIES).flatMap(([region, rows]) => rows.map((entry, i) => {
  const [noun, shape] = entry.split('|'), key = speciesKey(noun), rarity = RARITY_KEYS[Math.floor(i / 2)];
  const botanical = !['stone', 'crystal', 'shard', 'shell', 'nugget'].includes(shape);
  const dominant = i === 1 && region === 'forest' ? 'swiftness' : i === 1 && region === 'netherwood' ? 'death' : i === 1 && region === 'quarry' ? 'acidity' : BIOME_DOMINANT[region];
  return { key, noun, shape, region, rarity, dominant, catalog: true, rank: RARITIES[rarity].rank,
    buy: rarity === 'common' ? 1 : null, hue: [HUE[region] + i * 5, 0.52 + i % 3 * 0.08, 0.46 + i % 2 * 0.12],
    form: 'solid', density: botanical ? 0.85 : 1.5, hardness: botanical ? 0.2 : 0.58, sol: botanical ? 0.22 : 0.12, solT: 0.0015,
    fx: fixedProfile(key, rarity, dominant), arc: [region === 'moonfen' || region === 'river' || region === 'ghostglass' ? -180 - i * 20 : 250 + i * 25, 2.5],
    price: Math.round(8 * RARITIES[rarity].value), gather: botanical ? 'pick' : 'chip',
    cultivation: botanical ? shape === 'mushroom' || shape === 'truffle' || shape === 'bracket' ? 'fungal' : 'soil' : 'mineral',
    steep: { name: noun + ' Extract', into: 'water', lo: [25, 25], hi: [75, 75] },
    lore: `${noun} belongs to ${region}. Its ${rarity} magical quality and effect composition are permanent. Only its Arcane counterpart can awaken.`,
  };
}));
