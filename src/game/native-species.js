// One native species per biome. Rendering, gait, tests and pens share this data.
export const NATIVE_SPECIES = {
  fox: { label: 'Fox', plural: 'foxes', biome: 'forest', effect: 'vitality', anatomy: 'fox', gait: 'fox', color: [0.84, 0.44, 0.18] },
  hare: { label: 'Hare', plural: 'hares', biome: 'meadow', effect: 'love', anatomy: 'hare', gait: 'rabbit', color: [0.65, 0.51, 0.33] },
  otter: { label: 'River Otter', plural: 'river otters', biome: 'river', effect: 'frost', anatomy: 'otter', gait: 'ermine', color: [0.47, 0.33, 0.23] },
  beetle: { label: 'Rock Beetle', plural: 'rock beetles', biome: 'quarry', effect: 'strength', anatomy: 'beetle', gait: 'badger', color: [0.55, 0.47, 0.34] },
  cavemoth: { label: 'Cave Moth', plural: 'cave moths', biome: 'netherwood', effect: 'toxicity', anatomy: 'moth', gait: 'dove', color: [0.48, 0.52, 0.34] },
  salamander: { label: 'Salamander', plural: 'salamanders', biome: 'crags', effect: 'fire', anatomy: 'salamander', gait: 'salamander', color: [0.2, 0.23, 0.19] },
  wisp: { label: "Will-o'-Wisp", plural: 'wisps', biome: 'moonfen', effect: 'arcana', anatomy: 'wisp', gait: 'dove', color: [0.35, 0.8, 0.85] },
  cloudray: { label: 'Cloud Ray', plural: 'cloud rays', biome: 'skyshard', effect: 'levitation', anatomy: 'ray', gait: 'dove', color: [0.55, 0.8, 0.9] },
  mimiclizard: { label: 'Mimic Lizard', plural: 'mimic lizards', biome: 'morphgrove', effect: 'transformation', anatomy: 'lizard', gait: 'salamander', color: [0.43, 0.7, 0.42] },
  shroudmoth: { label: 'Shroud Moth', plural: 'shroud moths', biome: 'veil', effect: 'invisibility', anatomy: 'moth', gait: 'dove', color: [0.57, 0.46, 0.71] },
  axolotl: { label: 'Spectral Axolotl', plural: 'spectral axolotls', biome: 'ghostglass', effect: 'phasing', anatomy: 'axolotl', gait: 'salamander', color: [0.58, 0.81, 0.84] },
  scarab: { label: 'Hourglass Scarab', plural: 'hourglass scarabs', biome: 'chronoglass', effect: 'temporal', anatomy: 'scarab', gait: 'badger', color: [0.7, 0.52, 0.23] },
};
