import { EXOTIC_EFFECTS } from '../alchemy/effects.js';
// Stable world identities; generation instances live in the save, never here.
export const BIOMES = [
  { id: 'forest', name: 'Whisperwood', category: 'natural', dominant: 'vitality', creature: 'fox', rank: 0, sales: 0, sky: [0.36, 0.52, 0.42], desc: 'Old oaks, healing herbs and silver leaves.' },
  { id: 'meadow', name: 'Sunlit Meadow', category: 'natural', dominant: 'love', creature: 'hare', rank: 0, sales: 1, sky: [0.55, 0.72, 0.9], desc: 'Warm meadows, flowers and affectionate magic.' },
  { id: 'river', name: 'Willow Bank', category: 'natural', dominant: 'frost', creature: 'otter', rank: 1, sales: 3, sky: [0.5, 0.66, 0.78], desc: 'Cool water, willow roots and winter pearls.' },
  { id: 'quarry', name: 'Ironstone Quarry', category: 'natural', dominant: 'strength', creature: 'beetle', rank: 1, sales: 5, sky: [0.62, 0.6, 0.58], desc: 'Mineral seams and hardy stone-borne life.' },
  { id: 'netherwood', name: 'Netherwood', category: 'natural', dominant: 'toxicity', creature: 'cavemoth', rank: 2, sales: 8, sky: [0.1, 0.12, 0.18], desc: 'A deep fungal forest, rich with poisonous spores.' },
  { id: 'crags', name: 'Ember Crags', category: 'natural', dominant: 'fire', creature: 'salamander', rank: 2, sales: 12, sky: [0.42, 0.2, 0.16], desc: 'Volcanic ledges and heat-blooming ingredients.' },
  { id: 'moonfen', name: 'Moonfen', category: 'exotic', dominant: 'arcana', creature: 'wisp', rank: 3, sales: 16, sky: [0.16, 0.18, 0.32], desc: 'Luminous marshes and spectral ripples.', interaction: 'ripple' },
  { id: 'skyshard', name: 'Skyshard Archipelago', category: 'exotic', dominant: 'levitation', creature: 'cloudray', rank: 3, sales: 19, sky: [0.4, 0.72, 0.92], desc: 'Floating islands anchored by springing sky crystals.', interaction: 'spring' },
  { id: 'morphgrove', name: 'Morphgrove', category: 'exotic', dominant: 'transformation', creature: 'mimiclizard', rank: 3, sales: 22, sky: [0.32, 0.52, 0.48], desc: 'Living terrain and plants that change their shape.', interaction: 'morph' },
  { id: 'veil', name: 'Veil Hollow', category: 'exotic', dominant: 'invisibility', creature: 'shroudmoth', rank: 4, sales: 26, sky: [0.24, 0.28, 0.38], desc: 'Disturb the mist to uncover hidden ruins.', interaction: 'mist' },
  { id: 'ghostglass', name: 'Ghostglass Reef', category: 'exotic', dominant: 'phasing', creature: 'axolotl', rank: 4, sales: 30, sky: [0.08, 0.24, 0.34], desc: 'Spectral coral and crystals that drift between states.', interaction: 'phase' },
  { id: 'chronoglass', name: 'Chronoglass Wastes', category: 'exotic', dominant: 'temporal', creature: 'scarab', rank: 4, sales: 36, sky: [0.56, 0.35, 0.5], desc: 'Broken arches and sandfalls outside ordinary time.', interaction: 'time' },
].map((b) => Object.freeze({ ...b, magical: b.category === 'exotic' }));
export const BIOME_BY_ID = Object.fromEntries(BIOMES.map((b) => [b.id, b]));
/** Minority exotic channels in Natural ecology belong to late exploration.
 * Keep their fixed profiles, including older owned finds, instead of rerolling
 * effects when the player gains rank. */
export function ingredientRank(m) {
  const base = m?.wild?.rank || 0;
  const exotic = EXOTIC_EFFECTS.some((k) => Math.abs(m?.effects?.[k] || 0) > 0);
  return Math.max(base, exotic ? 3 : 0);
}
export function biomeUnlocked(st, id) {
  const b = BIOME_BY_ID[id];
  return !!b && (id === 'forest' || !!st.unlockedBiomes?.includes(id) || (st.rank >= b.rank && (st.stats?.served || 0) >= b.sales));
}
export function refreshBiomeUnlocks(st) {
  st.unlockedBiomes = [...new Set(['forest', ...(st.unlockedBiomes || []), ...BIOMES.filter((b) => biomeUnlocked(st, b.id)).map((b) => b.id)])];
  return st.unlockedBiomes;
}
