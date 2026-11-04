// Wild raw ingredients, their per-world reactions and the world's hidden
// resonance laws.
//
// Wild materials are gathered (or, for common ones, bought at a premium from
// the herbalist). Most are supplied *whole* — a rigid root, leaf bundle,
// mushroom or stone that the pestle (in the cauldron) or the mortar (before
// pouring) must break into powder before anything can dissolve. Their
// effects reach a potion only through extraction (see alchemy/effects.js).
//
// Everything here is generated from separate RNG streams ("wild:", "laws:")
// so adding it never changes the reagents an existing seed already had.

import { Rng } from '../core/rng.js';
import { hslToRgb } from '../core/color.js';
import { completeMaterial } from './schema.js';
import { EFFECT_INDEX } from '../alchemy/effects.js';
import { arcaneProfile } from './profiles.js';
import { identityOf } from '../visual/identity.js';
import { CATALOG_SPECS, fixedProfile } from './catalog.js';
import { RARITIES } from './rarity.js';

/** @typedef {import('./schema.js').MaterialDef} MaterialDef */

/**
 * Wild archetypes. `shape` is the sprite (and the surface texture of the
 * whole ingredient in the cauldron), `region` where it grows, `rank` the
 * guild rank needed to reach its deposits, `buy` the herbalist's market tier
 * (null = gather only).
 *
 * Nothing in nature is pure: every ingredient carries a main effect and one
 * or two side effects. The side effects always sit on the guild's opposing
 * pairs — fire and frost, life and death (life also mends poison), acid and
 * alkali — so they can be neutralised by mixing ingredients whose side
 * effects oppose them. No ingredient carries both halves of a pair.
 * `steep` is how its magic is drawn into a liquid (the extract keeps every
 * effect of the raw ingredient, in the same proportions).
 */
export const WILD_SPECS = /** @type {any[]} */ ([
  // Whisperwood (forest)
  { key: 'ironroot', noun: 'Ironroot', shape: 'root', region: 'forest', rank: 0, buy: 1, hue: [28, 0.45, 0.42], form: 'solid', density: 1.05, hardness: 0.5, sol: 0.12, solT: 0.0022,
    fx: { strength: 26, frost: 9 }, arc: [560, 3], price: 9, gather: 'dig', lore: 'A knotted woodland root that carries strength — and a cold, earthy chill that needs something fiery to cancel it. Crush or grind it; it gives up far more when steeped in hot water.' },
  { key: 'silverleaf', noun: 'Silverleaf', shape: 'leaf', region: 'forest', rank: 0, buy: 1, hue: [150, 0.25, 0.7], form: 'solid', density: 0.72, hardness: 0.22, sol: 0.18, solT: 0.0015,
    fx: { vitality: 24, frost: 8 }, arc: [550, 3], price: 9, gather: 'pick', lore: 'Soft silvery leaves prized by healers. They heal, but leave a frosty bite that a warming herb must cancel. Gentle warmth draws out their healing.' },
  { key: 'nightshade', noun: 'Nightshade', shape: 'leaf', region: 'forest', rank: 0, buy: null, hue: [285, 0.45, 0.42], form: 'solid', density: 1.12, hardness: 0.25, sol: 0.16, solT: 0.001, compat: [0.55, 0.22],
    fx: { toxicity: 28, death: 12, acidity: 5 }, arc: [350, 2.5], price: 12, gather: 'pick', dusk: true,
    steep: { name: 'Nightshade Tincture', into: 'spirit', lo: [20, 25], hi: [60, 65] },
    lore: 'A poisonous leaf, gathered at dusk. Its oily extract dissolves in spirits rather than water. Test tiny doses before you trust it.' },
  { key: 'emberbark', noun: 'Emberbark', shape: 'bark', region: 'forest', rank: 0, buy: 1, hue: [12, 0.55, 0.36], form: 'solid', density: 0.88, hardness: 0.4, sol: 0.12, solT: 0.002,
    fx: { fire: 22, toxicity: 7 }, arc: [560, 2.8], price: 8, gather: 'scrape',
    steep: { name: 'Emberbark Tea', into: 'water', lo: [45, 50], hi: [85, 90] },
    lore: 'Resinous red bark that smoulders in the mouth. It warms, but its sap is a little poisonous: something healing must mend the bite.' },
  { key: 'owlberry', noun: 'Owlberry', shape: 'berry', region: 'forest', rank: 0, buy: null, hue: [330, 0.55, 0.38], form: 'solid', density: 0.98, hardness: 0.12, sol: 0.22, solT: 0.0012,
    fx: { love: 20, toxicity: 6, fire: 5 }, arc: [380, 3], price: 9, gather: 'pick',
    steep: { name: 'Owlberry Cordial', into: 'water', lo: [30, 35], hi: [65, 70] },
    lore: 'Dark berries the owls guard jealously. Sweet with affection, warm on the tongue and faintly poisonous.' },
  // Netherwood (the cavern forest under the Whisperwood, guild rank 1)
  { key: 'witchear', noun: 'Witch’s Ear', shape: 'bracket', region: 'netherwood', rank: 1, buy: 2, hue: [32, 0.35, 0.3], form: 'solid', density: 0.8, hardness: 0.3, sol: 0.15, solT: 0.0012,
    fx: { arcana: 20, death: 7 }, arc: [420, 3], price: 14, gather: 'scrape',
    steep: { name: 'Witch’s Ear Broth', into: 'water', lo: [25, 30], hi: [60, 65] },
    lore: 'A leathery shelf fungus that grows on dead oaks. It sharpens the mind but carries the dead tree’s chill of decay; life cancels it.' },
  { key: 'mandrake', noun: 'Mandrake', shape: 'root', region: 'netherwood', rank: 2, buy: null, hue: [38, 0.5, 0.6], form: 'solid', density: 1.15, hardness: 0.45, sol: 0.12, solT: 0.0015, rare: true,
    fx: { transformation: 34, strength: 12, toxicity: 7 }, arc: [420, 3], price: 30, gather: 'dig', lore: 'A rare screaming root of transformation, with strength in it and a poisonous skin. Old grimoires say it wakes fully only in warm spirits.' },
  // Sunlit Meadow
  { key: 'heartpetal', noun: 'Heartpetal', shape: 'petal', region: 'meadow', rank: 0, buy: 1, hue: [335, 0.6, 0.72], form: 'solid', density: 0.6, hardness: 0.15, sol: 0.2, solT: 0.001,
    fx: { love: 26, fire: 6 }, arc: null, price: 10, gather: 'pick',
    steep: { name: 'Heartpetal Infusion', into: 'water', lo: [30, 35], hi: [60, 65] },
    lore: 'Soft meadow petals carrying affection — and the flush of passion, a little fire that something cool must cancel. Warm water draws out their love; strong heat spoils them. Too delicate to hold awakened magic.' },
  { key: 'sunthistle', noun: 'Sunthistle', shape: 'flower', region: 'meadow', rank: 0, buy: 1, hue: [45, 0.8, 0.55], form: 'solid', density: 0.8, hardness: 0.3, sol: 0.15, solT: 0.0015,
    fx: { fire: 16, vitality: 8 }, arc: [520, 2.8], price: 9, gather: 'pick',
    steep: { name: 'Sunthistle Tea', into: 'water', lo: [40, 45], hi: [80, 85] },
    lore: 'A prickly golden flower that warms the blood and lifts the spirits. It brews into a fiery, restoring tea.' },
  { key: 'nettle', noun: 'Nettle', shape: 'sprig', region: 'meadow', rank: 0, buy: 1, hue: [105, 0.5, 0.4], form: 'solid', density: 0.74, hardness: 0.2, sol: 0.17, solT: 0.0015,
    fx: { strength: 16, acidity: 10 }, arc: [560, 3], price: 7, gather: 'pick',
    steep: { name: 'Nettle Tea', into: 'water', lo: [45, 50], hi: [85, 90] },
    lore: 'Stinging hedgerow nettles. Steeped hot they give strength, and the sting of their acid — chalk or another alkali settles it.' },
  { key: 'dreamclover', noun: 'Dreamclover', shape: 'clover', region: 'meadow', rank: 1, buy: null, hue: [205, 0.45, 0.62], form: 'solid', density: 0.7, hardness: 0.18, sol: 0.16, solT: 0.0012, rare: true,
    fx: { arcana: 16, frost: 7, vitality: 4 }, arc: [250, 3], price: 18, gather: 'pick', dawn: true,
    steep: { name: 'Dreamclover Tea', into: 'water', lo: [30, 35], hi: [60, 65] },
    lore: 'A rare blue clover, open only at dawn, that brings vivid dreams and clear insight, with a cool and gently healing aftertaste.' },
  { key: 'beebalm', noun: 'Bee Balm', shape: 'spike', region: 'meadow', rank: 1, buy: 2, hue: [300, 0.5, 0.6], form: 'solid', density: 0.66, hardness: 0.15, sol: 0.19, solT: 0.0012,
    fx: { vitality: 14, love: 10, acidity: -6 }, arc: [480, 3], price: 12, gather: 'pick',
    steep: { name: 'Balm Tea', into: 'water', lo: [35, 40], hi: [70, 75] },
    lore: 'Shaggy purple flower-spikes humming with bees: a gentle balm for body and heart, with a soft alkaline aftertaste.' },
  { key: 'hemlock', noun: 'Hemlock Seed', shape: 'seed', region: 'meadow', rank: 1, buy: null, hue: [70, 0.25, 0.5], form: 'solid', density: 1.1, hardness: 0.35, sol: 0.14, solT: 0.0015,
    fx: { death: 20, frost: 8, toxicity: 6 }, arc: [450, 2.6], price: 14, gather: 'pick', dusk: true,
    steep: { name: 'Hemlock Draught', into: 'water', lo: [20, 25], hi: [50, 55] },
    lore: 'Ribbed grey seeds of the spotted hemlock, gathered at dusk. A cold, creeping death with a little poison in it.' },
  // Willow Bank (river)
  { key: 'riverchalk', noun: 'River Chalk', shape: 'stone', region: 'river', rank: 0, buy: 1, hue: [48, 0.22, 0.82], form: 'solid', density: 1.32, hardness: 0.35, sol: 0.06, solT: 0.0005, binder: 0.55, friction: 0.7,
    fx: { acidity: -24, frost: 6 }, arc: [350, 2.5], price: 6, gather: 'dig',
    steep: { name: 'Chalk Milk', into: 'water', lo: [15, 20], hi: [60, 65] },
    lore: 'Soft, cold alkaline chalk from the bank. It neutralises acids. Ground and stirred into water it clouds into chalk milk; a little water kneads it into a paste.' },
  { key: 'frostcap', noun: 'Frostcap', shape: 'cap', region: 'river', rank: 0, buy: 1, hue: [196, 0.5, 0.72], form: 'solid', density: 0.95, hardness: 0.25, sol: 0.17, solT: 0.0012,
    fx: { frost: 24, death: 6 }, arc: [520, 2.8], price: 10, gather: 'pick',
    steep: { name: 'Frostcap Brine', into: 'water', lo: [1, 2], hi: [12, 14] },
    lore: 'A cool mushroom growing beneath the willows, with a breath of the grave about it. It steeps only in ice-cold water, giving a freezing brine.' },
  { key: 'bogbean', noun: 'Bogbean', shape: 'bean', region: 'river', rank: 0, buy: null, hue: [95, 0.4, 0.42], form: 'solid', density: 1.0, hardness: 0.3, sol: 0.2, solT: 0.0015,
    fx: { vitality: 14, acidity: 8 }, arc: [400, 2.5], price: 7, gather: 'pick',
    steep: { name: 'Bogbean Broth', into: 'water', lo: [40, 45], hi: [80, 85] },
    lore: 'A marsh bean: restorative, though sour with bog acid unless something alkaline settles it.' },
  { key: 'willowbark', noun: 'Willow Bark', shape: 'bark', region: 'river', rank: 0, buy: 1, hue: [60, 0.18, 0.55], form: 'solid', density: 0.85, hardness: 0.4, sol: 0.12, solT: 0.002,
    fx: { frost: 14, vitality: 6, acidity: 7 }, arc: [560, 2.6], price: 7, gather: 'scrape',
    steep: { name: 'Willow Tea', into: 'water', lo: [40, 45], hi: [80, 85] },
    lore: 'Pale grey bark that cools fevers and soothes, bitter with acid.' },
  { key: 'reedmace', noun: 'Reedmace', shape: 'reed', region: 'river', rank: 0, buy: null, hue: [26, 0.5, 0.3], form: 'solid', density: 0.7, hardness: 0.25, sol: 0.16, solT: 0.0015,
    fx: { strength: 13, acidity: -7, frost: 5 }, arc: [520, 2.8], price: 7, gather: 'scrape',
    steep: { name: 'Reed Pith Broth', into: 'water', lo: [35, 40], hi: [80, 85] },
    lore: 'Brown velvet heads on tall stems. The pith gives a steady strength, chalky and cool.' },
  { key: 'riverpearl', noun: 'River Pearl', shape: 'shell', region: 'river', rank: 1, buy: 2, hue: [210, 0.15, 0.85], form: 'solid', density: 1.6, hardness: 0.55, sol: 0.08, solT: 0.002,
    fx: { arcana: 14, acidity: -12 }, arc: [560, 3], price: 16, gather: 'pick',
    steep: { name: 'Nacre Milk', into: 'water', lo: [50, 55], hi: [85, 90] },
    lore: 'Mussel shells lined with mother-of-pearl. Ground and simmered, the nacre gives insight — and a strongly alkaline milk.' },
  // Ironstone Quarry (minerals)
  { key: 'emberflint', noun: 'Ember Flint', shape: 'stone', region: 'quarry', rank: 0, buy: 1, hue: [16, 0.62, 0.55], form: 'solid', density: 1.6, hardness: 0.7, sol: 0.05, solT: 0.003,
    fx: { fire: 26, acidity: 12 }, arc: [820, 2.5], price: 11, gather: 'mine',
    steep: { name: 'Flint Fire-Water', into: 'water', lo: [80, 85], hi: [160, 170] },
    lore: 'A warm flint that releases fire, and a sharp acid with it, when ground. It barely dissolves unless the water is near boiling.' },
  { key: 'mica', noun: 'Mica Dust', shape: 'powder', region: 'quarry', rank: 0, buy: 1, hue: [270, 0.25, 0.75], form: 'powder', density: 1.22, hardness: 0.3, sol: 0.16, solT: 0.001, binder: 0.4, friction: 0.66,
    fx: { transformation: 18, acidity: -6 }, arc: [500, 3], price: 7, gather: 'sweep',
    steep: { name: 'Mica Shimmer', into: 'water', lo: [40, 45], hi: [85, 90] },
    lore: 'Naturally loose glittering grains of change, faintly alkaline. Knead with a little water for dough; warm plenty of water with it for a shimmering infusion.' },
  { key: 'saltpetre', noun: 'Saltpetre', shape: 'crust', region: 'quarry', rank: 0, buy: 1, hue: [190, 0.12, 0.88], form: 'powder', density: 1.9, hardness: 0.3, sol: 0.3, solT: 0.004, friction: 0.6,
    fx: { frost: 16, acidity: 7 }, arc: [540, 2.6], price: 6, gather: 'sweep',
    lore: 'Cold white crystals that bloom on cave walls. They dissolve readily and chill whatever they touch, with a sour edge.' },
  { key: 'sulfur', noun: 'Sulphur Crust', shape: 'powder', region: 'quarry', rank: 1, buy: 2, hue: [56, 0.85, 0.6], form: 'powder', density: 1.4, hardness: 0.3, sol: 0.22, solT: 0.0015, friction: 0.6,
    fx: { acidity: 26, fire: 7, toxicity: 5 }, arc: [500, 2.5], price: 10, gather: 'mine',
    steep: { name: 'Sulphur Water', into: 'water', lo: [50, 55], hi: [95, 100] },
    lore: 'A crumbly yellow crust. Strongly acidic, it etches stone and stings flesh. Hot water dissolves it into a biting acid.' },
  { key: 'lodestone', noun: 'Lodestone', shape: 'nugget', region: 'quarry', rank: 1, buy: 2, hue: [220, 0.08, 0.3], form: 'solid', density: 2.4, hardness: 0.75, sol: 0.06, solT: 0.003,
    fx: { strength: 20, toxicity: 6, frost: 5 }, arc: [760, 2.6], price: 13, gather: 'mine',
    steep: { name: 'Rust Water', into: 'water', lo: [70, 75], hi: [150, 160] },
    lore: 'A heavy, magnetic black nugget. Its iron gives great strength but rusts into a cold, faintly poisonous water.' },
  { key: 'cinnabar', noun: 'Cinnabar', shape: 'crystal', region: 'quarry', rank: 1, buy: null, hue: [358, 0.7, 0.42], form: 'solid', density: 2.2, hardness: 0.5, sol: 0.08, solT: 0.002,
    fx: { transformation: 18, toxicity: 10, fire: 4 }, arc: [620, 2.8], price: 15, gather: 'mine',
    steep: { name: 'Cinnabar Tincture', into: 'spirit', lo: [30, 35], hi: [60, 65] },
    lore: 'Blood-red crystals of quicksilver ore. Powerfully transforming and poisonous; it dissolves in warm spirits.' },
  { key: 'stormglass', noun: 'Storm Glass', shape: 'shard', region: 'quarry', rank: 2, buy: null, hue: [222, 0.55, 0.7], form: 'solid', density: 1.9, hardness: 0.65, sol: 0.08, solT: 0.0015, rare: true,
    fx: { arcana: 12, transformation: 6, fire: 6 }, arc: [-600, 3], econd: 0.6, charge: 1, glow: 0.3, price: 28, gather: 'mine', lore: 'Glass struck by lightning: insight, change and a crackle of fire. It still holds a charge that flows into anything that conducts.' },
  // Moonfen (magical bog, guild rank 2): cold magic, awakened by chill
  { key: 'gravemoss', noun: 'Grave Moss', shape: 'moss', region: 'moonfen', rank: 2, buy: null, hue: [150, 0.12, 0.45], form: 'solid', density: 0.85, hardness: 0.2, sol: 0.16, solT: 0.0012,
    fx: { death: 34, frost: 8, toxicity: 12 }, arc: [-700, 2.5], price: 26, gather: 'scrape', dusk: true,
    steep: { name: 'Barrow Draught', into: 'water', lo: [-5, 0], hi: [10, 12] },
    lore: 'Moss from old barrows, heavy with death magic, scraped at dusk. It steeps only in near-freezing water. Dilute generously and test carefully.' },
  { key: 'starquartz', noun: 'Star Quartz', shape: 'crystal', region: 'moonfen', rank: 2, buy: null, hue: [280, 0.45, 0.78], form: 'solid', density: 1.5, hardness: 0.65, sol: 0.1, solT: 0.002, glow: 0.5,
    fx: { arcana: 26, love: 14, frost: 5 }, arc: [-400, 3], price: 30, gather: 'mine', lore: 'A luminous crystal of love and insight, cool to the touch. Crush it, then warm it in spirits.' },
  { key: 'wisplichen', noun: 'Wisp Lichen', shape: 'moss', region: 'moonfen', rank: 2, buy: null, hue: [172, 0.6, 0.6], form: 'solid', density: 0.7, hardness: 0.15, sol: 0.18, solT: 0.001, glow: 0.7,
    fx: { arcana: 28, frost: 7, toxicity: 4 }, arc: [-250, 3], price: 24, gather: 'scrape',
    steep: { name: 'Lichen Glow', into: 'water', lo: [15, 20], hi: [45, 50] },
    lore: 'A faintly glowing lichen that the wisps feed on, cold and a little poisonous. Lukewarm water draws out its light.' },
  { key: 'moonlily', noun: 'Moonlily', shape: 'lily', region: 'moonfen', rank: 2, buy: null, hue: [240, 0.3, 0.86], form: 'solid', density: 0.62, hardness: 0.12, sol: 0.2, solT: 0.001, glow: 0.4,
    fx: { vitality: 30, frost: 12, acidity: -4 }, arc: [-300, 3], price: 22, gather: 'pick', dawn: true,
    steep: { name: 'Moonlily Dew', into: 'water', lo: [10, 15], hi: [40, 45] },
    lore: 'A pale lily that opens to the moon and closes at sunrise; gather it at dawn. Deeply healing, and cold as a winter night.' },
  { key: 'toadstool', noun: 'Toadstool', shape: 'toadstool', region: 'moonfen', rank: 2, buy: null, hue: [5, 0.75, 0.48], form: 'solid', density: 0.9, hardness: 0.2, sol: 0.18, solT: 0.0012,
    fx: { transformation: 28, toxicity: 9, death: 5 }, arc: [-350, 2.8], price: 20, gather: 'pick',
    steep: { name: 'Toadstool Broth', into: 'water', lo: [20, 25], hi: [50, 55] },
    lore: 'A red, white-spotted toadstool from the fairy rings. It changes whoever eats it — and poisons them a little.' },
  { key: 'sirenreed', noun: 'Siren Reed', shape: 'reed', region: 'moonfen', rank: 2, buy: null, hue: [180, 0.35, 0.5], form: 'solid', density: 0.66, hardness: 0.2, sol: 0.18, solT: 0.0012,
    fx: { love: 28, frost: 8, toxicity: 6 }, arc: [-200, 3], price: 20, gather: 'scrape', dusk: true,
    steep: { name: 'Siren Water', into: 'water', lo: [15, 20], hi: [45, 50] },
    lore: 'Reeds that sing to travellers at dusk. Their pith enchants the heart, coldly, and with a trace of poison.' },
  // Ember Crags (volcanic, guild rank 3)
  { key: 'dragonpepper', noun: 'Dragon Pepper', shape: 'pepper', region: 'crags', rank: 3, buy: null, hue: [4, 0.8, 0.5], form: 'solid', density: 0.9, hardness: 0.3, sol: 0.18, solT: 0.0015,
    fx: { fire: 34, strength: 14, toxicity: 4 }, arc: [850, 2.6], price: 32, gather: 'pick', lore: 'A furious red pepper from the crags, with strength in its heat and a poisonous sting. Its fire loves oil.' },
  { key: 'cinderscale', noun: 'Cinder Scale', shape: 'scale', region: 'crags', rank: 3, buy: null, hue: [24, 0.7, 0.4], form: 'solid', density: 1.45, hardness: 0.6, sol: 0.07, solT: 0.003, rare: true,
    fx: { fire: 22, transformation: 18, vitality: 6 }, arc: [1000, 2.6], econd: 0.3, charge: 0.4, price: 40, gather: 'mine',
    steep: { name: 'Salamander Essence', into: 'oil', lo: [140, 150], hi: [300, 320] },
    lore: 'A shed salamander scale, warm to the touch. Only fierce heat — hot oil, not water — dissolves it.' },
  { key: 'ashbloom', noun: 'Ashbloom', shape: 'lily', region: 'crags', rank: 3, buy: null, hue: [20, 0.85, 0.6], form: 'solid', density: 0.7, hardness: 0.15, sol: 0.18, solT: 0.0015, glow: 0.3,
    fx: { vitality: 30, fire: 12, acidity: 6 }, arc: [560, 2.8], price: 30, gather: 'pick',
    steep: { name: 'Ashbloom Tea', into: 'water', lo: [45, 50], hi: [85, 90] },
    lore: 'A flower that blooms in warm ash after an eruption. It heals and burns, with a smoky acid note.' },
  { key: 'obsidian', noun: 'Obsidian', shape: 'shard', region: 'crags', rank: 3, buy: null, hue: [265, 0.3, 0.16], form: 'solid', density: 2.35, hardness: 0.8, sol: 0.06, solT: 0.002,
    fx: { strength: 32, death: 8, fire: 6 }, arc: [900, 2.6], price: 34, gather: 'mine',
    steep: { name: 'Obsidian Water', into: 'water', lo: [75, 80], hi: [150, 160] },
    lore: 'Black volcanic glass with an edge like a razor: unyielding strength, a smouldering heat and a whisper of death. It gives itself up only to water near the boil.' },
  // Hanging vines (regions with a roof or boughs): glowing pendants on threads from the ceiling
  { key: 'glimmerdrop', noun: 'Glimmerdrop', shape: 'icicle', region: 'river', rank: 0, buy: null, hue: [190, 0.7, 0.62], late: true, rare: true, form: 'solid', density: 1.3, hardness: 0.55, sol: 0.1, solT: 0.002, glow: 0.9,
    fx: { frost: 22, arcana: 10, toxicity: 5 }, arc: [480, 3], price: 16, gather: 'pick',
    steep: { name: 'Glimmerdrop Tincture', into: 'spirit', lo: [20, 25], hi: [55, 60] },
    lore: 'Pale blue crystal drops that grow on threads from the riverbank cave’s roof. Cold and clear-minded, with a faint poison; warmth and life cancel the chill and the bite.' },
  { key: 'rosebell', noun: 'Rosebell', shape: 'bellbloom', region: 'netherwood', rank: 1, buy: null, hue: [330, 0.6, 0.6], late: true, rare: true, form: 'solid', density: 0.62, hardness: 0.15, sol: 0.2, solT: 0.001, glow: 0.9,
    fx: { love: 24, vitality: 8, fire: 5 }, arc: null, price: 14, gather: 'pick',
    steep: { name: 'Rosebell Infusion', into: 'water', lo: [30, 35], hi: [65, 70] },
    lore: 'Pink bells that nod from the roots above the Netherwood. They stir affection and mend a little, with a faint warmth; too delicate to hold any awakening magic.' },
  { key: 'dewglobe', noun: 'Dewglobe', shape: 'orb', region: 'netherwood', rank: 1, buy: null, hue: [125, 0.5, 0.6], late: true, rare: true, form: 'solid', density: 0.95, hardness: 0.1, sol: 0.2, solT: 0.0015, glow: 0.9,
    fx: { vitality: 22, transformation: 8, frost: 5 }, arc: [420, 3], price: 13, gather: 'pick',
    steep: { name: 'Dewglobe Cordial', into: 'water', lo: [25, 30], hi: [55, 60] },
    lore: 'Green bubbles of living dew, hanging in pairs from slender vines. They heal and quietly shift whatever they touch, leaving a cool film.' },
  { key: 'embertear', noun: 'Embertear', shape: 'teardrop', region: 'netherwood', rank: 2, buy: null, hue: [28, 0.9, 0.55], late: true, rare: true, form: 'solid', density: 1.05, hardness: 0.2, sol: 0.18, solT: 0.0015, glow: 0.9,
    fx: { fire: 28, strength: 10, acidity: 6 }, arc: [520, 3], price: 24, gather: 'pick',
    steep: { name: 'Embertear Draught', into: 'spirit', lo: [40, 45], hi: [75, 80] },
    lore: 'Amber teardrops of molten sap that never quite fall from the Netherwood’s roof. Fierce warmth and might, with a sour bite that alkali tames.' },
  { key: 'duskbell', noun: 'Duskbell', shape: 'bluebell', region: 'moonfen', rank: 2, buy: null, hue: [255, 0.4, 0.72], late: true, rare: true, form: 'solid', density: 0.6, hardness: 0.12, sol: 0.22, solT: 0.001, glow: 0.9, dusk: true,
    fx: { arcana: 20, love: 8, frost: 6 }, arc: [-500, 2.5], price: 20, gather: 'pick',
    steep: { name: 'Duskbell Tea', into: 'water', lo: [10, 15], hi: [40, 45] },
    lore: 'Lavender bells that ring only at dusk, trailing from the fen’s overhangs. They sharpen the mind and soften the heart, with a cold breath.' },
  { key: 'bloodnet', noun: 'Bloodnet', shape: 'netpod', region: 'netherwood', rank: 2, buy: null, hue: [355, 0.6, 0.52], late: true, rare: true, form: 'solid', density: 1.1, hardness: 0.2, sol: 0.2, solT: 0.0012, glow: 0.9,
    fx: { strength: 20, toxicity: 12, fire: 6 }, arc: [380, 3], price: 17, gather: 'pick',
    steep: { name: 'Bloodnet Tincture', into: 'spirit', lo: [30, 35], hi: [60, 65] },
    lore: 'Red netted pods, heavy and warm, that sweat a bitter sap. They lend strength and poison in equal measure; something healing must mend the bite.' },
  { key: 'driftjelly', noun: 'Drift Jelly', shape: 'jelly', region: 'moonfen', rank: 2, buy: null, hue: [205, 0.75, 0.6], late: true, rare: true, form: 'solid', density: 0.9, hardness: 0.08, sol: 0.18, solT: 0.0015, glow: 0.9, dusk: true,
    fx: { transformation: 22, frost: 12, death: 6 }, arc: [-450, 2.5], price: 22, gather: 'scrape',
    steep: { name: 'Drift Jelly Broth', into: 'water', lo: [0, 5], hi: [30, 35] },
    lore: 'Blue bells of living jelly that drift on their threads in the fen’s dark. They change what they touch and chill it, with a grave taint.' },
  { key: 'pearlpuff', noun: 'Pearlpuff', shape: 'puffbloom', region: 'meadow', rank: 0, buy: null, hue: [48, 0.25, 0.86], late: true, rare: true, form: 'solid', density: 0.5, hardness: 0.1, sol: 0.2, solT: 0.001, glow: 0.9,
    fx: { vitality: 16, love: 10, acidity: -5 }, arc: [430, 3], price: 15, gather: 'pick',
    steep: { name: 'Pearlpuff Milk', into: 'water', lo: [25, 30], hi: [55, 60] },
    lore: 'Creamy blossoms that cluster in puffs in the vines over the meadow cave’s mouth. Gently healing and soothing, faintly alkaline.' },
  { key: 'streamorb', noun: 'Streamorb', shape: 'orb', region: 'river', rank: 0, buy: null, hue: [165, 0.6, 0.55], late: true, rare: true, form: 'solid', density: 0.95, hardness: 0.1, sol: 0.2, solT: 0.0015, glow: 0.9,
    fx: { vitality: 18, frost: 9, transformation: 6 }, arc: [420, 3], price: 11, gather: 'pick',
    steep: { name: 'Streamorb Cordial', into: 'water', lo: [25, 30], hi: [55, 60] },
    lore: 'Glowing teal bubbles on the vines over the river cave. They heal, with a cool bite that warmth cancels.' },
  { key: 'pondjelly', noun: 'Pond Jelly', shape: 'jelly', region: 'river', rank: 1, buy: null, hue: [195, 0.8, 0.58], late: true, rare: true, form: 'solid', density: 0.9, hardness: 0.08, sol: 0.2, solT: 0.0015, glow: 0.9,
    fx: { transformation: 20, frost: 10, toxicity: 6 }, arc: [440, 3], price: 14, gather: 'scrape',
    steep: { name: 'Pond Jelly Broth', into: 'water', lo: [10, 15], hi: [40, 45] },
    lore: 'Pale blue jellies that drift on threads above the river, glowing softly. They change what they touch and chill it.' },
  { key: 'sunbell', noun: 'Sunbell', shape: 'bellbloom', region: 'meadow', rank: 1, buy: null, hue: [42, 0.85, 0.6], late: true, rare: true, form: 'solid', density: 0.6, hardness: 0.12, sol: 0.2, solT: 0.001, glow: 0.9,
    fx: { fire: 20, vitality: 10, acidity: 5 }, arc: [420, 3], price: 13, gather: 'pick',
    steep: { name: 'Sunbell Tea', into: 'water', lo: [35, 40], hi: [65, 70] },
    lore: 'Golden bells that glow in the meadow cave’s dark vines. Warming and mending, a little sour.' },
  { key: 'honeydrop', noun: 'Honeydrop', shape: 'teardrop', region: 'meadow', rank: 1, buy: null, hue: [50, 0.8, 0.62], late: true, rare: true, form: 'solid', density: 1.1, hardness: 0.15, sol: 0.22, solT: 0.0012, glow: 0.9,
    fx: { love: 20, strength: 8, acidity: -6 }, arc: [400, 3], price: 14, gather: 'pick',
    steep: { name: 'Honeydrop Syrup', into: 'water', lo: [30, 35], hi: [60, 65] },
    lore: 'Sticky glowing drops of honey-sap hanging from the cave roof. Sweet with affection and strength, faintly alkaline.' },
  { key: 'dawnshard', noun: 'Dawnshard', shape: 'icicle', region: 'meadow', rank: 2, buy: null, hue: [320, 0.5, 0.78], late: true, rare: true, form: 'solid', density: 1.3, hardness: 0.55, sol: 0.1, solT: 0.002, glow: 0.9,
    fx: { arcana: 18, love: 8, frost: 7 }, arc: [480, 3], price: 18, gather: 'pick',
    steep: { name: 'Dawnshard Tincture', into: 'spirit', lo: [20, 25], hi: [55, 60] },
    lore: 'Rose-white crystal drops that glimmer from the roof where the sun reaches. Insight and tenderness, with a thin chill.' },
  { key: 'moonpuff', noun: 'Moonpuff', shape: 'puffbloom', region: 'moonfen', rank: 2, buy: null, hue: [215, 0.3, 0.88], late: true, rare: true, form: 'solid', density: 0.5, hardness: 0.1, sol: 0.2, solT: 0.001, glow: 0.9, dusk: true,
    fx: { arcana: 18, vitality: 10, frost: 6 }, arc: [-480, 2.5], price: 20, gather: 'pick',
    steep: { name: 'Moonpuff Milk', into: 'water', lo: [10, 15], hi: [40, 45] },
    lore: 'Silver-white blossoms puffing in the fen’s hanging vines, bright at dusk. They sharpen the mind and mend gently, with a cold breath.' },
  { key: 'wispnet', noun: 'Wispnet', shape: 'netpod', region: 'moonfen', rank: 2, buy: null, hue: [285, 0.55, 0.58], late: true, rare: true, form: 'solid', density: 1.05, hardness: 0.2, sol: 0.2, solT: 0.0012, glow: 0.9,
    fx: { transformation: 18, death: 10, frost: 6 }, arc: [-450, 2.5], price: 18, gather: 'pick',
    steep: { name: 'Wispnet Tincture', into: 'spirit', lo: [25, 30], hi: [55, 60] },
    lore: 'Violet netted pods that shimmer over the bog. They change and chill, with a grave taint.' },
  { key: 'umbercrystal', noun: 'Umber Crystal', shape: 'icicle', region: 'netherwood', rank: 2, buy: null, hue: [275, 0.5, 0.6], late: true, rare: true, form: 'solid', density: 1.35, hardness: 0.55, sol: 0.1, solT: 0.002, glow: 0.9,
    fx: { arcana: 20, death: 8, frost: 5 }, arc: [470, 3], price: 19, gather: 'pick',
    steep: { name: 'Umber Tincture', into: 'spirit', lo: [20, 25], hi: [55, 60] },
    lore: 'Violet crystals glowing from the Netherwood’s roots. Insight and a grave chill; life cancels the rest.' },
  // Orchard fruit (they hang among the leaves of the trees): round apples, pears and plums on short stalks
  { key: 'emberapple', noun: 'Ember Apple', shape: 'apple', region: 'forest', rank: 0, buy: null, hue: [8, 0.75, 0.48], late: true, form: 'solid', density: 1.0, hardness: 0.12, sol: 0.22, solT: 0.0012,
    fx: { fire: 20, vitality: 10, acidity: 5 }, arc: [400, 3], price: 11, gather: 'pick',
    steep: { name: 'Ember Apple Cider', into: 'water', lo: [35, 40], hi: [65, 70] },
    lore: 'Red apples that warm the hand, hanging among the oak leaves. They heal and warm, with a sour tang that alkali tames.' },
  { key: 'goldpear', noun: 'Gold Pear', shape: 'pear', region: 'forest', rank: 0, buy: null, hue: [52, 0.7, 0.58], late: true, form: 'solid', density: 1.0, hardness: 0.12, sol: 0.22, solT: 0.0012,
    fx: { vitality: 20, love: 8, frost: 6 }, arc: [420, 3], price: 11, gather: 'pick',
    steep: { name: 'Gold Pear Nectar', into: 'water', lo: [30, 35], hi: [60, 65] },
    lore: 'Heavy golden pears on thin stalks. Gentle healing and a little affection, with a cool bite that warmth cancels.' },
  { key: 'duskplum', noun: 'Dusk Plum', shape: 'plum', region: 'forest', rank: 0, buy: null, hue: [285, 0.45, 0.4], late: true, form: 'solid', density: 1.0, hardness: 0.12, sol: 0.22, solT: 0.0012,
    fx: { strength: 18, toxicity: 8, fire: 5 }, arc: [380, 3], price: 12, gather: 'pick',
    steep: { name: 'Dusk Plum Syrup', into: 'water', lo: [30, 35], hi: [60, 65] },
    lore: 'Dark plums with a pale bloom, in pairs and threes. They give strength and a faint poison that life mends.' },
  { key: 'honeyapple', noun: 'Honey Apple', shape: 'apple', region: 'meadow', rank: 0, buy: null, hue: [44, 0.8, 0.6], late: true, rare: true, form: 'solid', density: 1.0, hardness: 0.12, sol: 0.22, solT: 0.0012,
    fx: { love: 20, vitality: 10, acidity: -5 }, arc: [420, 3], price: 14, gather: 'pick',
    steep: { name: 'Honey Apple Cordial', into: 'water', lo: [30, 35], hi: [60, 65] },
    lore: 'Sweet golden apples of the meadow orchards. They stir affection and mend, faintly alkaline.' },
  { key: 'gloompear', noun: 'Gloom Pear', shape: 'pear', region: 'netherwood', rank: 2, buy: null, hue: [250, 0.4, 0.68], late: true, rare: true, form: 'solid', density: 1.0, hardness: 0.12, sol: 0.22, solT: 0.0012, glow: 0.6,
    fx: { arcana: 18, frost: 8, death: 5 }, arc: [450, 3], price: 18, gather: 'pick',
    steep: { name: 'Gloom Pear Nectar', into: 'water', lo: [20, 25], hi: [50, 55] },
    lore: 'Pale pears that glow among the black leaves of the Netherwood. Insight and cold, with a grave taint that life mends.' },
  { key: 'ghostplum', noun: 'Ghost Plum', shape: 'plum', region: 'netherwood', rank: 2, buy: null, hue: [200, 0.5, 0.74], late: true, rare: true, form: 'solid', density: 1.0, hardness: 0.12, sol: 0.22, solT: 0.0012, glow: 0.6,
    fx: { transformation: 18, vitality: 8, frost: 6 }, arc: [450, 3], price: 18, gather: 'pick',
    steep: { name: 'Ghost Plum Syrup', into: 'water', lo: [20, 25], hi: [50, 55] },
    lore: 'Small blue-white plums glowing in the Netherwood’s boughs. They change what they touch and mend a little, with a chill.' },
]);

// Preserve historic IDs, but give every current species a fixed quality.
// Old saved definitions are archived by the v7 migration before this catalog
// is installed, so an existing bottle keeps its exact source properties.
for (const s of CATALOG_SPECS) {
  const old = WILD_SPECS.find((x) => x.key === s.key);
  if (old) { const fx = old.fx; Object.assign(old, s, { fx }); } else WILD_SPECS.push(s);
}
for (const s of WILD_SPECS) {
  s.rarity ||= s.rare ? 'uncommon' : 'common';
  s.dominant ||= Object.entries(s.fx).sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])))[0][0];
  if (!['moonfen', 'skyshard', 'morphgrove', 'veil', 'ghostglass', 'chronoglass'].includes(s.region) && s.dominant === 'transformation') s.dominant = 'swiftness';
  const original = s.fx;
  const source = Object.fromEntries(Object.entries(original).map(([k, v]) => [k === 'transformation' && s.dominant === 'swiftness' ? 'swiftness' : k, v]));
  s.fx = fixedProfile(s.key, s.rarity, s.dominant, source);
  s.rare = ['rare', 'unique', 'legendary'].includes(s.rarity);
}
const NORMAL_SPECS = WILD_SPECS.slice();
for (const s of NORMAL_SPECS) WILD_SPECS.push({ ...s, key: s.key + '@arcane', baseKey: s.key, noun: 'Arcane ' + s.noun, arcaneVariant: true });

/** @type {Record<string, typeof WILD_SPECS[number]>} */
export const WILD_BY_KEY = Object.fromEntries(WILD_SPECS.map((s) => [s.key, s]));

const PREFIX = ['Moss', 'Moon', 'Dusk', 'Ember', 'Witch', 'Frost', 'Star', 'Thorn', 'Dew', 'Raven', 'Old', 'Hollow'];

const r2 = (v) => Math.round(v * 100) / 100;

/** Version of the wild profiles (effects, thresholds, extracts). */
export const WILD_FX_VERSION = 5;

/**
 * Generate this world's wild materials, their reactions and the resonance laws.
 * @param {string} seed
 * @param {{materials: MaterialDef[], roles: Record<string,string>}} base existing world (water/spirit/oil ids)
 */
export function generateWild(seed, base) {
  const mainRng = new Rng('wild:' + seed);
  // the hanging vines (`late`) draw from a stream of their own, so adding them never shifts what the older ingredients drew
  const lateRng = new Rng('wild+:' + seed);
  let rng = mainRng;
  // names never depend on wild materials already in the world, so an old
  // save regenerates exactly the names a fresh world of its seed gets
  const used = new Set(base.materials.filter((m) => !m.id.startsWith('wild-')).map((m) => m.name));
  /** @type {MaterialDef[]} */
  const materials = [];
  /** @type {Record<string, string>} */
  const ids = {};
  for (const s of WILD_SPECS) {
    rng = new Rng('species-v1:' + (s.baseKey || s.key));
    const id = 'wild-' + s.key;
    const [h, sat, l] = s.hue;
    const color = hslToRgb((h + rng.range(-8, 8) + 360) % 360, Math.min(1, sat * rng.range(0.9, 1.1)), Math.min(0.92, l * rng.range(0.94, 1.06)));
    let name = '';
    const prefixes = PREFIX.filter((w) => !s.noun.includes(w));
    for (let tries = 0; tries < 12 && (!name || used.has(name)); tries++) name = `${rng.pick(prefixes)} ${s.noun}`;
    name = s.noun;
    used.add(name);
    /** @type {Record<string, number>} */
    const fx = {};
    for (const [k, v] of Object.entries(s.fx)) fx[k] = Number(v);
    const m = completeMaterial({
      id, name, archetype: 'wild', form: /** @type {any} */ (s.form), color, tint: 0.75, opacity: 1,
      density: r2(s.density * rng.range(0.97, 1.03)), compat: s.compat ? s.compat.slice() : [r2(rng.range(0.8, 0.84)), r2(rng.range(0.12, 0.16))],
      friction: s.friction ?? r2(rng.range(0.62, 0.72)), binder: s.binder ?? 0, hardness: s.hardness,
      solubility: r2(s.sol * rng.range(0.9, 1.1)), solubilityTemp: s.solT, melt: 1500, boil: Infinity,
      heatCapacity: 1.7, conductivity: 0.35, flammability: s.region === 'quarry' ? 0 : 0.45, ignition: Math.round(rng.range(260, 320)), combustionHeat: 500,
      ash: base.roles.soot, smoke: base.roles.smoke, glow: s.glow || 0, reactivity: 0.3,
      price: s.price, tier: s.buy === null ? 99 : s.buy, product: false, description: s.lore,
    });
    const mm = /** @type {any} */ (m);
    mm.effects = fx;
    // a few delicate ingredients carry no magic that can awaken (arc: null)
    mm.arcaneVariant = !!s.arcaneVariant;
    mm.speciesId = s.baseKey || s.key;
    mm.rarity = s.rarity;
    mm.dominant = s.dominant;
    mm.cultivation = s.cultivation || (['crystal', 'shard', 'stone', 'nugget', 'shell', 'icicle'].includes(s.shape) ? 'mineral' : ['mushroom', 'bracket', 'truffle'].includes(s.shape) ? 'fungal' : 'soil');
    if (s.arcaneVariant) mm.arcane = { thr: s.arc?.[0] ?? 300, gain: s.arc?.[1] ?? 2.5 };
    mm.fxv = WILD_FX_VERSION;
    mm.econd = s.econd ?? 0.04;
    mm.charge = s.charge ?? 0;
    mm.wild = { key: s.key, shape: s.shape, region: s.region, rank: s.rank, rare: !!s.rare, gatherOnly: s.buy === null, gather: s.gather || 'pick', dusk: !!s.dusk, dawn: !!s.dawn };
    if (s.form === 'solid') mm.crushable = true;
    // its visual identity in this world: what its plant, icon and pieces are drawn from (visual/)
    mm.vis = identityOf(mm, 'catalog-v1');
    materials.push(m);
    ids[s.key] = id;
  }

  // ---- reactions of wild ingredients (they start where the reagents meet)
  /** @type {import('../reactions/reactions.js').ReactionRule[]} */
  const reactions = [];
  rng = mainRng;
  const t5 = (lo, hi) => Math.round(rng.range(lo, hi) / 5) * 5;
  /**
   * A product of a wild ingredient: its awakening profile follows its source.
   * An extract keeps every effect of the raw ingredient in the same
   * proportions (fully dissolved, a little stronger): steeping never
   * purifies an ingredient, only mixing with its opposites does.
   */
  const product = (key, from, props, fx) => {
    const src = materials.find((m) => m.id === ids[from]);
    if (!fx) {
      const k = 1.08 * rng.range(0.97, 1.03);
      fx = Object.fromEntries(Object.entries(/** @type {any} */ (src).effects).map(([e, v]) => [e, Math.round(Number(v) * k * 10) / 10]));
    }
    const m = completeMaterial({
      id: 'wild-p-' + key, archetype: 'product', tint: 0.85, opacity: 0.85, heatCapacity: 3.6, boil: Infinity, melt: -20,
      viscosity: 2.5, compat: src.compat.slice(), price: 0, tier: 99, product: true, density: src.density,
      form: 'liquid', color: src.color.map((c) => r2(c * 0.85)), ...props,
    });
    const mm = /** @type {any} */ (m);
    mm.econd = 0.12;
    mm.charge = 0;
    mm.effects = fx;
    mm.arcaneVariant = !!src.arcaneVariant;
    mm.speciesId = src.speciesId;
    mm.rarity = src.rarity;
    mm.arcane = src.arcaneVariant ? { ...src.arcane } : undefined;
    mm.fxv = WILD_FX_VERSION;
    materials.push(m);
    return m;
  };
  const water = base.roles.water, spirit = base.roles.spirit, oil = base.roles.oil;
  const nm = (k) => materials.find((m) => m.id === ids[k]).name;
  const short = (k) => nm(k).split(' ').slice(-1)[0];

  // steeping: hot water turns ground root/leaf into a true liquid extract
  const steepedRoot = product('steeped-ironroot', 'ironroot', { name: `Steeped ${nm('ironroot')}`, description: 'A dark root extract: all of the root’s strength, and its chill, fully in solution.' });
  reactions.push({ id: 'rw_steep_root', name: steepedRoot.name, kind: 'decompose', a: ids.ironroot, b: null, ra: 1, rb: 0, products: [{ id: steepedRoot.id, frac: 1 }],
    minT: t5(60, 70), maxT: 160, rate: 0.09, heat: -5, stir: 0.3, wet: true, hint: `Ground ${nm('ironroot')} steeps into a liquid extract in hot water.` });
  const infusion = product('silver-infusion', 'silverleaf', { name: `${nm('silverleaf')} Infusion`, description: 'A pale, fragrant healing infusion with a frosty edge.' });
  reactions.push({ id: 'rw_infuse_leaf', name: infusion.name, kind: 'decompose', a: ids.silverleaf, b: null, ra: 1, rb: 0, products: [{ id: infusion.id, frac: 1 }],
    minT: t5(45, 55), maxT: t5(85, 95), rate: 0.1, heat: -5, stir: 0.3, wet: true, hint: `${nm('silverleaf')} infuses in warm (not boiling) water.` });
  // heat spoils delicate petals into something bitter
  const wilted = product('wilted-petal', 'heartpetal', { name: `Wilted ${nm('heartpetal')}`, color: [0.45, 0.32, 0.3], description: 'Scorched petals: the love is gone and bitterness remains.' }, { love: 6, toxicity: 9 });
  // spoiled matter has lost its magic: it no longer awakens
  delete /** @type {any} */ (wilted).arcane;
  reactions.push({ id: 'rw_wilt_petal', name: wilted.name, kind: 'decompose', a: ids.heartpetal, b: null, ra: 1, rb: 0, products: [{ id: wilted.id, frac: 1 }],
    minT: t5(78, 88), maxT: 400, rate: 0.12, heat: 0, stir: 0.2, hint: `Strong heat spoils ${nm('heartpetal')}.` });
  // warm spirit wakes mandrake and quartz
  const mandrakeT = product('mandrake-tincture', 'mandrake', { name: `${nm('mandrake')} Tincture`, compat: [0.62, 0.16], description: 'The waking root dissolved in warm spirit.' });
  reactions.push({ id: 'rw_mandrake', name: mandrakeT.name, kind: 'mix', a: ids.mandrake, b: spirit, ra: 1, rb: 2, products: [{ id: mandrakeT.id, frac: 1 }],
    minT: t5(35, 45), maxT: t5(70, 75), rate: 0.25, heat: 10, stir: 0.8, hint: `${nm('mandrake')} wakes in warm spirit.` });
  const starT = product('starlit-tincture', 'starquartz', { name: `Starlit ${short('starquartz')} Tincture`, compat: [0.62, 0.16], glow: 0.7, description: 'Crushed quartz dissolved in warm spirit; it glimmers.' });
  reactions.push({ id: 'rw_starquartz', name: starT.name, kind: 'mix', a: ids.starquartz, b: spirit, ra: 1, rb: 2, products: [{ id: starT.id, frac: 1 }],
    minT: t5(35, 45), maxT: t5(70, 80), rate: 0.25, heat: 8, stir: 0.8, hint: `Crushed ${nm('starquartz')} dissolves in warm spirit.` });
  // fire loves oil
  const dragonOil = product('dragonfire-oil', 'dragonpepper', { name: 'Dragonfire Oil', compat: [0.16, 0.11], color: [0.85, 0.25, 0.08], flammability: 0.7, ignition: 240, combustionHeat: 900,
    ash: base.roles.soot, smoke: base.roles.smoke, description: 'Pepper fire carried in oil.' });
  reactions.push({ id: 'rw_dragonoil', name: dragonOil.name, kind: 'contact', a: ids.dragonpepper, b: oil, ra: 1, rb: 1, products: [{ id: dragonOil.id, frac: 1 }],
    minT: t5(30, 40), maxT: 220, rate: 0.4, heat: 20, stir: 1, hint: `Ground ${nm('dragonpepper')} pours its fire into warm oil.` });
  // acid meets alkali: neutral gypsum and heat
  const gypsum = product('gypsum', 'riverchalk', { name: 'Gypsum Grit', form: 'powder', color: [0.9, 0.88, 0.82], friction: 0.68, solubility: 0.02, melt: 1500, viscosity: 1,
    description: 'The neutral grit left where acid met chalk: whatever either carried is spent.' }, {});
  reactions.push({ id: 'rw_neutralise', name: 'Neutralisation', kind: 'contact', a: ids.riverchalk, b: ids.sulfur, ra: 1, rb: 1, products: [{ id: gypsum.id, frac: 1 }],
    minT: -10, maxT: 400, rate: 0.5, heat: 60, stir: 1, wet: true, hint: `${nm('riverchalk')} fizzes where it meets ${nm('sulfur')} and both turn to neutral grit.` });

  // generic extraction: each remaining herb or mineral gives up its magic to
  // the right solvent inside its own temperature window
  for (const s of WILD_SPECS) {
    if (!s.steep) continue;
    rng = s.late ? lateRng : mainRng;
    const st = s.steep;
    const solvent = st.into === 'spirit' ? spirit : st.into === 'oil' ? oil : water;
    const solv = base.materials.find((m) => m.id === solvent);
    const ext = product(`extract-${s.key}`, s.key, {
      name: st.name, ...(solv ? { compat: solv.compat.slice() } : {}),
      description: `The magic of ${nm(s.key)} drawn into ${st.into === 'water' ? 'water' : st.into}.`,
    });
    const lo = t5(st.lo[0], st.lo[1]), hi = t5(st.hi[0], st.hi[1]);
    const where = st.into === 'water' ? '' : ` in ${st.into}`;
    const window = lo <= 15 ? `only when chilled below ${hi}°C` : `between about ${lo} and ${hi}°C`;
    if (st.into === 'water') {
      reactions.push({ id: `rw_extract_${s.key}`, name: ext.name, kind: 'decompose', a: ids[s.key], b: null, ra: 1, rb: 0, products: [{ id: ext.id, frac: 1 }],
        minT: lo, maxT: hi, rate: 0.1, heat: -4, stir: 0.4, wet: true, hint: `Ground ${nm(s.key)} steeps into water ${window}.` });
    } else {
      // oil never blends with watery matter: it extracts where the grains touch it
      reactions.push({ id: `rw_extract_${s.key}`, name: ext.name, kind: st.into === 'oil' ? 'contact' : 'mix', a: ids[s.key], b: solvent, ra: 1, rb: 1, products: [{ id: ext.id, frac: 1 }],
        minT: lo, maxT: hi, rate: 0.25, heat: 4, stir: 0.8, hint: `${nm(s.key)} dissolves${where} ${window}.` });
    }
  }

  return { materials, reactions, ids, laws: generateLaws(seed) };
}

/** Resonance templates (a acted on, b partner, c product). */
const LAW_TEMPLATES = [
  { id: 'forged', name: 'Forged Vigour', kind: 'catalyse', a: 'strength', b: 'fire', k: [0.45, 0.7], lore: 'A touch of fire tempers strength and makes it stronger.' },
  { id: 'blessed', name: 'Blessed Life', kind: 'catalyse', a: 'vitality', b: 'arcana', k: [0.4, 0.6], lore: 'Arcana amplifies healing.' },
  { id: 'enchant', name: 'Enchantment', kind: 'transmute', a: 'love', b: 'arcana', c: 'transformation', k: [0.5, 0.75], lore: 'Love and arcana together become transformation.' },
  { id: 'venom', name: 'Burning Venom', kind: 'transmute', a: 'toxicity', b: 'fire', c: 'death', k: [0.45, 0.65], lore: 'Fire turns poison into death.' },
  { id: 'bitter', name: 'Bitter Heart', kind: 'suppress', a: 'love', b: 'toxicity', k: [1.0, 1.5], lore: 'Poison sours love.' },
  { id: 'quicken', name: 'Quickening', kind: 'transmute', a: 'vitality', b: 'transformation', c: 'strength', k: [0.45, 0.6], lore: 'Life and change together build strength.' },
  { id: 'glacial', name: 'Glacial Insight', kind: 'catalyse', a: 'arcana', b: 'frost', k: [0.35, 0.55], lore: 'Cold sharpens arcane insight.' },
  { id: 'corrode', name: 'Corroding Change', kind: 'transmute', a: 'acidity', b: 'strength', c: 'transformation', k: [0.4, 0.55], lore: 'Acid gnaws strength into change.' },
  { id: 'heartfire', name: 'Heartfire', kind: 'transmute', a: 'love', b: 'fire', c: 'vitality', k: [0.45, 0.6], lore: 'Passion’s warmth becomes life.' },
  { id: 'gravechill', name: 'Grave Chill', kind: 'catalyse', a: 'death', b: 'frost', k: [0.4, 0.6], lore: 'Cold feeds death.' },
  { id: 'dulling', name: 'Dulling', kind: 'suppress', a: 'arcana', b: 'toxicity', k: [0.7, 1.0], lore: 'Poison clouds arcane potency.' },
  { id: 'wildgrowth', name: 'Wild Growth', kind: 'catalyse', a: 'transformation', b: 'vitality', k: [0.35, 0.55], lore: 'Life drives change wild.' },
  { id: 'kindling', name: 'Kindling', kind: 'catalyse', a: 'fire', b: 'acidity', k: [0.3, 0.45], lore: 'Acid feeds the flame.' },
];

/**
 * Pick this world's resonance laws. Each world has six, on distinct effect
 * pairs, with jittered strengths and thresholds.
 * @param {string} seed
 * @returns {import('../alchemy/effects.js').Resonance[]}
 */
export function generateLaws(seed) {
  const rng = new Rng('laws:' + seed);
  const pool = rng.shuffle(LAW_TEMPLATES);
  const out = [];
  const pairs = new Set();
  for (const t of pool) {
    if (out.length >= 6) break;
    const key = [t.a, t.b].sort().join('+');
    if (pairs.has(key)) continue;
    pairs.add(key);
    out.push({
      id: t.id, name: t.name, kind: /** @type {any} */ (t.kind),
      a: EFFECT_INDEX[t.a], b: EFFECT_INDEX[t.b], c: t.c ? EFFECT_INDEX[t.c] : -1,
      k: Math.round(rng.range(t.k[0], t.k[1]) * 100) / 100,
      min: Math.round(rng.range(2, 4.5) * 10) / 10,
      lore: t.lore,
    });
  }
  return out;
}
