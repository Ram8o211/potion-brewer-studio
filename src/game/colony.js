// The rabbit colony: a hutch of individual Moon Rabbits.
//
// Every rabbit is a persistent individual — a name, a sex, a coat rolled
// from a seed (kits inherit their parents'), an age that takes it from kit
// to elder, health, and what potions have done to it:
//   • marks      transient visible states on eleven channels (the ten
//                effects, acidity split into acid and alkali) that fade a
//                little every day;
//   • exposure   lifetime totals per channel that never fade (hidden: they
//                shape scars, muscle, transformations and, after death,
//                what its remains carry);
//   • scar       permanent harm that lowers the health it can recover to;
//   • traits     permanent anatomy grown from transformation magic;
//   • bonus      extra maximum health grown from vitality given to a rabbit
//                that was already at full health;
//   • degen      channels that went past the rabbit's own hidden
//                threshold for that channel (degenAt: every rabbit, every
//                channel its own) and now run out of control: the mark
//                climbs on its own, at the rabbit's own pace (degenRate),
//                until it reaches the top and the rabbit dies of it (the
//                lethal ones — poison, death, acid, lye, fire, frost — eat
//                its health along the way). Only a purging draught (or the
//                knife) stops it.
// Aggression is a separate matter: strength, vitality, arcana and
// transformation make a rabbit attack the others once the mark itself is
// past the rabbit's own aggression threshold (aggroAt, independent of the
// degeneration threshold) — degenerating or not. Love never makes it
// aggressive: past LOVE_MATE it mates with the others, faster the higher it
// is, wearing itself out — too much love kills it.
// Several effects show at once, each at one of four levels, and a dead
// rabbit keeps its body, traits and scars until the alchemist recovers its
// remains (once) or buries it.
//
// Between days the hutch lives in real time (colonyTick): marks fade slowly,
// fire and acid burn for as long as they are active (harder the higher they
// are), health creeps back otherwise, degenerations climb, aggressive rabbits attack and
// lovestruck ones mate. The
// model is pure and deterministic (Rng streams seeded by the world seed, the
// rabbit, the day and the tick counter). The player sees every channel's
// accumulated level as a status bar; a dose's exact effect comes only from
// trial readings, which differ a little from rabbit to rabbit
// (rabbitSensitivity) and from dose to dose.

import { EFFECT_INDEX } from '../alchemy/effects.js';
import { Rng, hashString } from '../core/rng.js';
import { kindOf, biasSpread, kindLook, RABBIT_SPREAD } from './kinds.js';

/** Visible / exposure channels: the ten effects with acidity split by sign. */
export const RABBIT_MARKS = ['vitality', 'strength', 'love', 'arcana', 'transformation', 'fire', 'frost', 'acid', 'alkali', 'toxicity', 'death', 'swiftness', 'levitation', 'invisibility', 'phasing', 'temporal'];
/** @type {Record<string, number>} */
export const MARK_INDEX = Object.fromEntries(RABBIT_MARKS.map((k, i) => [k, i]));

/** Days spent as a kit and as a youngster, the age of an elder, and the natural lifespan. */
export const KIT_DAYS = 4;
export const ADULT_DAYS = 8;
export const ELDER_DAYS = 40;
export const LIFESPAN_DAYS = 56;
export const FOUNDER_BORN = -9;
export const GESTATION_DAYS = 3;
export const DOSE_LIMIT = 40;
/** Buried bodies remembered (processed ones are always kept). */
export const MEMORIAL_LIMIT = 24;
/** Transient-mark levels (0..3) start at these values. */
export const LEVEL_AT = [8, 30, 60];
/** Lifetime transformation exposure at which each new trait grows. */
export const TRAIT_AT = [20, 50, 90, 140, 200];
/** The usual mark at which a channel runs out of control (each rabbit has its own, per channel: degenAt). */
export const DEGEN_AT = 70;
/** The top of a mark: a channel that reaches it kills the rabbit. */
export const MARK_MAX = 100;
/** Channels whose degeneration eats the rabbit's health on the way up. */
export const LETHAL = ['toxicity', 'death', 'acid', 'alkali', 'fire', 'frost'];
/** Channels that make a rabbit attack the others once past its own aggression threshold (aggroAt). */
export const AGGRO = ['vitality', 'strength', 'arcana', 'transformation'];
/** @deprecated the old name of AGGRO */
export const FERAL = AGGRO;
/** The usual aggression threshold (each rabbit has its own, per channel, independent of degenAt). */
export const AGGRO_AT = 60;
/** Love from which a rabbit starts mating with the others in real time. */
export const LOVE_MATE = 25;
/** Seconds between matings at LOVE_MATE and at the top of the mark. */
export const MATE_EVERY = [60, 3];
/** Seconds for an ordinary mark to fade to 1/e in real time (≈7 min half-life). */
export const MARK_TAU = 600;
/** Channels that keep hurting a rabbit for as long as they are active, harder the higher they are. */
export const BURNS = ['fire', 'acid'];
/** Health lost per second by a burning channel at the top of its mark (it scales as (mark/100)^1.5). */
export const BURN_RATE = 0.3;
/** Most extra maximum health vitality can grow. */
export const MAX_BONUS = 150;
/** How fast a degenerating mark usually climbs (per second; each rabbit its own: degenRate) and how often an aggressive rabbit strikes. */
export const DEGEN_RISE = 0.25;
export const ATTACK_EVERY = [9, 4];
export const TRAITS = ['ears2', 'horns', 'antlers', 'unihorn', 'scales', 'spines', 'tail-lizard', 'tail-plume', 'giant', 'tiny', 'eye3', 'wings'];
/** Traits that cannot grow together. */
export const TRAIT_EXCLUSIVE = [['giant', 'tiny'], ['horns', 'antlers', 'unihorn'], ['tail-lizard', 'tail-plume']];
/** Words for each trait (the UI never shows ids). */
export const TRAIT_WORDS = {
  ears2: 'a second pair of ears', horns: 'two curling horns', antlers: 'small antlers', unihorn: 'a single spiral horn',
  scales: 'scaly haunches', spines: 'icy spines along its back', 'tail-lizard': 'a scaly lizard tail', 'tail-plume': 'a plumed tail',
  giant: 'a giant frame', tiny: 'a shrunken body', eye3: 'a third eye', wings: 'little membrane wings',
};

/**
 * @typedef {'kit'|'young'|'adult'|'elder'} Stage
 */

/**
 * The look of a rabbit: rolled once, stored, inherited field by field.
 * @typedef {Object} RabbitLook
 * @property {number[]} coat    sRGB 0..1
 * @property {number[]} coat2   sRGB 0..1 (pattern colour)
 * @property {'solid'|'dutch'|'spotted'|'hooded'|'points'|'agouti'|'tabby'|'warts'|'blotched'|'dapple'|'badger'|'dove'|'fox'|'ermine'|'spiral'} pattern
 * @property {'upright'|'lop'|'half'|'short'|'cat'|'none'|'deer'|'round'|'fox'|'stalk'} ear
 * @property {number} size      0.85..1.15
 * @property {'dark'|'ruby'|'green'|'amber'} eye
 * @property {0|1|2} tail       fluff size
 * @property {number} seed      1..2^31-1 (spot layout, hop rhythm, mark placement)
 * @property {import('./kinds.js').AnimalKind} [kind]  absent: a rabbit (kinds.js)
 */

/**
 * The visible state of a rabbit, quantised (no hidden numbers): what the
 * renderer draws and what a trial's replay stores.
 * @typedef {Object} RabbitSnap
 * @property {Stage} stage
 * @property {0|1|2|3} hp       health band: 0 healthy … 3 near death
 * @property {boolean} alive
 * @property {boolean} preg     expecting kits
 * @property {number[]} lv      0..3 per RABBIT_MARKS (strength includes lasting muscle)
 * @property {number[]} sc      0..3 permanent marks [singe, acid burns, frostbite, grey, rune]
 * @property {string[]} traits
 * @property {string|null} cause  cause of death (dead rabbits)
 * @property {string[]} [dg]   degenerating channels
 * @property {boolean} [ag]    aggressive: attacking the colony
 */

// ------------------------------------------------------------------ looks

/** Natural coats [rgb, weight]. @type {[number[], number][]} */
export const COATS = [
  [[0.93, 0.89, 0.82], 3], // cream
  [[0.97, 0.96, 0.94], 2], // white
  [[0.6, 0.58, 0.62], 2], // grey
  [[0.55, 0.42, 0.3], 3], // agouti brown
  [[0.36, 0.24, 0.18], 1], // chocolate
  [[0.2, 0.18, 0.2], 1], // black
  [[0.82, 0.55, 0.3], 2], // ginger
  [[0.78, 0.78, 0.8], 1], // silver
];
const PATTERNS = /** @type {const} */ (['solid', 'dutch', 'spotted', 'hooded', 'points', 'agouti']);
/** Patterns of the other kinds (kinds.js kindLook): a cat's stripes, a toad's warts, a salamander's blotches. */
const KIND_PATTERNS = ['tabby', 'warts', 'blotched', 'dapple', 'badger', 'dove', 'fox', 'ermine', 'spiral'];
const KIND_EARS = ['cat', 'none', 'deer', 'round', 'fox', 'stalk'];
const KIND_EYES = ['green', 'amber'];
const PATTERN_W = [4, 2, 2, 1, 1, 2];
const EARS = /** @type {const} */ (['upright', 'lop', 'half', 'short']);
const EAR_W = [5, 2, 1, 1];
const WHITE = [0.97, 0.96, 0.94], CREAM = [0.93, 0.89, 0.82], CHOC = [0.36, 0.24, 0.18], BLACK = [0.2, 0.18, 0.2];

const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const r2 = (v) => Math.round(v * 100) / 100;

/** A random natural look. @param {Rng} rng @returns {RabbitLook} */
export function rollLook(rng) {
  const coat = COATS[rng.weighted(COATS.map((_, i) => i), COATS.map((c) => c[1]))][0].slice();
  const dark = lum(coat) < 0.5;
  const coat2 = (dark ? (rng.chance(0.5) ? WHITE : CREAM) : (rng.chance(0.5) ? CHOC : BLACK)).slice();
  const white = coat[0] > 0.95;
  return {
    coat, coat2,
    pattern: PATTERNS[rng.weighted([0, 1, 2, 3, 4, 5], PATTERN_W)],
    ear: EARS[rng.weighted([0, 1, 2, 3], EAR_W)],
    size: r2(Math.max(0.85, Math.min(1.15, 1 + 0.06 * rng.gauss()))),
    eye: /** @type {'dark'|'ruby'} */ (white && rng.chance(0.5) ? 'ruby' : 'dark'),
    tail: /** @type {0|1|2} */ (rng.int(0, 2)),
    seed: 1 + rng.int(0, 2147483000),
  };
}

/** A kit's look from its parents, with rare mutations. @param {RabbitLook} a mother @param {RabbitLook} b father @param {Rng} rng */
export function inheritLook(a, b, rng) {
  const kind = kindOf(a);
  const from = rng.chance(0.5) ? a : b;
  // a mutation draws from the mother's own kind
  const fresh = kind === 'rabbit' ? rollLook(rng) : /** @type {any} */ (kindLook(kind, rng));
  const coatFrom = rng.chance(0.1) ? fresh : from;
  const pick = (k) => (rng.chance(0.08) ? fresh[k] : (rng.chance(0.5) ? a[k] : b[k]));
  const coat = coatFrom.coat.slice();
  const white = coat[0] > 0.95;
  return {
    coat, coat2: coatFrom.coat2.slice(),
    pattern: pick('pattern'), ear: pick('ear'),
    size: r2(Math.max(0.85, Math.min(1.15, (a.size + b.size) / 2 + rng.range(-0.05, 0.05)))),
    eye: /** @type {any} */ (kind !== 'rabbit' ? pick('eye') : white && (a.eye === 'ruby' || b.eye === 'ruby' || rng.chance(0.25)) ? 'ruby' : 'dark'),
    tail: pick('tail'),
    seed: 1 + rng.int(0, 2147483000),
    ...(kind !== 'rabbit' ? { kind } : {}),
  };
}

/** A stable look for an id when nothing else is known (replays of lost rabbits). @param {string} str */
export function lookFromSeed(str) {
  return rollLook(new Rng(hashString('look:' + str)));
}

// ------------------------------------------------------------------ levels and snapshots

/** Level 0..3 of a transient mark value. @param {number} v */
export function visibleLevel(v) {
  return v >= LEVEL_AT[2] ? 3 : v >= LEVEL_AT[1] ? 2 : v >= LEVEL_AT[0] ? 1 : 0;
}

/** @param {number} v @param {number} a @param {number} b @param {number} c */
const q3 = (v, a, b, c) => (v >= c ? 3 : v >= b ? 2 : v >= a ? 1 : 0);

/**
 * Stage of a rabbit on a day (no day → adult).
 * @param {{born:number}} r @param {number} [day] @returns {Stage}
 */
export function stageOf(r, day) {
  if (day === undefined || !Number.isFinite(day)) return 'adult';
  const age = day - (r.born ?? FOUNDER_BORN);
  return age < KIT_DAYS ? 'kit' : age < ADULT_DAYS ? 'young' : age < ELDER_DAYS ? 'adult' : 'elder';
}

/** Health band 0 (healthy) … 3 (near death). @param {number} h percent of the maximum */
const hpBand = (h) => (h >= 75 ? 0 : h >= 40 ? 1 : h >= 10 ? 2 : 3);

/** The health a rabbit can recover to. @param {any} r @param {number} [day] */
export function maxHealthOf(r, day) {
  const base = Math.max(20, 100 + (r.bonus || 0) - (r.scar || 0));
  return Math.round(base * (stageOf(r, day) === 'elder' && Number.isFinite(day) ? 0.9 : 1) * 10) / 10;
}

/** Degenerating channels of a rabbit. @param {any} r @returns {string[]} */
export function degenOf(r) {
  return Array.isArray(r && r.degen) ? r.degen : [];
}

/** A hidden, lifelong number of one rabbit for one channel. @param {any} r @param {string} salt @param {string} key */
const trait = (r, salt, key) => new Rng(hashString(`${salt}:${r.id}:${r.look ? r.look.seed : 0}:${key}`)).gauss();

/**
 * The mark at which one channel of one rabbit runs out of control: hidden,
 * lifelong, its own for every rabbit and every channel (about 45–95).
 * @param {any} r @param {string} key channel (RABBIT_MARKS)
 */
export function degenAt(r, key) {
  return Math.round(clamp(DEGEN_AT + 13 * trait(r, 'degen', key), 42, 95));
}

/** How fast a degenerating channel of one rabbit climbs (per second): hidden, lifelong. @param {any} r @param {string} key */
export function degenRate(r, key) {
  return Math.round(DEGEN_RISE * clamp(Math.exp(0.55 * trait(r, 'rise', key)), 0.3, 3) * 1000) / 1000;
}

/**
 * The mark of an aggressive channel past which one rabbit attacks the
 * others: hidden, lifelong, independent of its degeneration threshold
 * (about 30–95; Infinity for channels that never make it aggressive).
 * @param {any} r @param {string} key
 */
export function aggroAt(r, key) {
  if (!AGGRO.includes(key)) return Infinity;
  return Math.round(clamp(AGGRO_AT + 16 * trait(r, 'aggro', key), 30, 95));
}

/** The aggressive channels driving a rabbit, strongest first. @param {any} r @returns {string[]} */
export function aggroOf(r) {
  if (!r || r.alive === false || !r.marks) return [];
  return AGGRO.filter((k) => (r.marks[k] || 0) >= aggroAt(r, k)).sort((p, q) => (r.marks[q] - aggroAt(r, q)) - (r.marks[p] - aggroAt(r, p)));
}

/** Is a rabbit aggressive (an aggressive channel past its own threshold)? @param {any} r */
export function isFeral(r) {
  return aggroOf(r).length > 0;
}

/** Health a burning channel (fire, acid) takes per second at this mark. @param {number} v */
export function burnRate(v) {
  return v > 0 ? BURN_RATE * Math.min(1, v / MARK_MAX) ** 1.5 : 0;
}

/** Seconds between two matings of a rabbit this much in love (Infinity below LOVE_MATE). @param {number} love */
export function mateEvery(love) {
  if (!(love >= LOVE_MATE)) return Infinity;
  const t = clamp((love - LOVE_MATE) / (MARK_MAX - LOVE_MATE), 0, 1);
  return MATE_EVERY[0] * (MATE_EVERY[1] / MATE_EVERY[0]) ** t;
}

/** Health one mating costs a rabbit this much in love. @param {number} love */
export function mateCost(love) {
  const t = clamp((love - LOVE_MATE) / (MARK_MAX - LOVE_MATE), 0, 1);
  return 0.5 + 6 * t * t;
}

/** Relative spread of the rabbits' lifelong sensitivity (one sigma). */
export const RABBIT_BIAS = RABBIT_SPREAD;

/**
 * How strongly one rabbit shows one effect, relative to the potion's real
 * strength: a hidden, lifelong trait of the individual (about ±10 %), so
 * repeated readings on one rabbit settle on its own slightly biased value
 * and only several rabbits average that out.
 * @param {{id:string, look:{seed:number}}} r @param {string} key effect key
 */
export function rabbitSensitivity(r, key) {
  const rng = new Rng(hashString(`sens:${r.id}:${r.look ? r.look.seed : 0}:${key}`));
  // each kind has its own spread per channel (kinds.js): a cat's arcana barely varies
  return Math.round(clamp(Math.exp(biasSpread(r.look, key) * rng.gauss()), 0.6, 1.6) * 1000) / 1000;
}

/**
 * The quantised visible state of a rabbit.
 * @param {any} r rabbit (or memorial entry) @param {number} [day] @returns {RabbitSnap}
 */
export function rabbitSnap(r, day) {
  const mk = r.marks || {}, ex = r.exposure || {};
  const lv = RABBIT_MARKS.map((k) => {
    if (k === 'strength') return visibleLevel(Math.min(100, (mk.strength || 0) + 0.2 * (ex.strength || 0)));
    return visibleLevel(mk[k] || 0);
  });
  const sc = [
    q3(ex.fire || 0, 30, 80, 150), q3(ex.acid || 0, 25, 60, 120), q3(ex.frost || 0, 30, 80, 150),
    Math.max(q3(ex.death || 0, 15, 40, 80), stageOf(r, day) === 'elder' ? 1 : 0), q3(ex.arcana || 0, 40, 100, 180),
  ];
  const alive = r.alive !== false;
  const dg = alive ? degenOf(r).filter((k) => MARK_INDEX[k] !== undefined) : [];
  return {
    stage: r.stage || stageOf(r, day),
    hp: !alive ? 3 : /** @type {0|1|2|3} */ (hpBand(100 * (r.health ?? 100) / Math.max(1, maxHealthOf(r, day)))),
    alive,
    preg: !!r.pregnant && alive,
    lv, sc,
    traits: Array.isArray(r.traits) ? r.traits.slice() : [],
    cause: !alive ? (r.cause || 'unknown') : null,
    dg, ag: alive && isFeral(r),
  };
}

const STAGE_CH = { kit: 'k', young: 'y', adult: 'a', elder: 'e' };
const CH_STAGE = { k: 'kit', y: 'young', a: 'adult', e: 'elder' };

/** Compact string form of a snapshot (cache keys, replays in trial records). @param {RabbitSnap} s */
export function encodeSnap(s) {
  // the last field marks aggression ('a') apart from degeneration; older replays have no such field
  const dg = (s.dg && s.dg.length) || s.ag ? `|${(s.dg || []).join(',')}|${s.ag ? 'a' : '0'}` : '';
  return `${STAGE_CH[s.stage] || 'a'}${s.hp}${s.alive ? 1 : 0}${s.preg ? 1 : 0}|${s.lv.join('')}|${s.sc.join('')}|${s.traits.join(',')}|${s.cause || ''}${dg}`;
}

/** @returns {RabbitSnap} */
export function defaultSnap() {
  return { stage: 'adult', hp: 0, alive: true, preg: false, lv: new Array(RABBIT_MARKS.length).fill(0), sc: [0, 0, 0, 0, 0], traits: [], cause: null, dg: [], ag: false };
}

/** Inverse of encodeSnap; anything malformed gives a healthy adult. @param {any} str @returns {RabbitSnap} */
export function decodeSnap(str) {
  if (typeof str !== 'string') return defaultSnap();
  const p = str.split('|');
  if (p.length < 5 || p[0].length !== 4) return defaultSnap();
  const stage = CH_STAGE[p[0][0]];
  const lv = p[1].split('').map(Number);
  const sc = p[2].split('').map(Number);
  if (!stage || ![11, RABBIT_MARKS.length].includes(lv.length) || lv.some((v) => !(v >= 0 && v <= 3)) || sc.some((v) => !(v >= 0 && v <= 3))) return defaultSnap();
  while (lv.length < RABBIT_MARKS.length) lv.push(0);
  while (sc.length < 5) sc.push(0);
  const hp = Number(p[0][1]);
  const dg = p[5] ? p[5].split(',').filter((k) => MARK_INDEX[k] !== undefined) : [];
  return {
    stage, hp: /** @type {0|1|2|3} */ (hp >= 0 && hp <= 3 ? hp : 0), alive: p[0][2] === '1', preg: p[0][3] === '1', lv, sc: sc.slice(0, 5),
    traits: p[3] ? p[3].split(',').filter((t) => TRAITS.includes(t)) : [], cause: p[4] || null,
    dg, ag: p[6] !== undefined ? p[6] === 'a' : dg.some((k) => LEGACY_FERAL.includes(k)),
  };
}

/** Before aggression had its own thresholds, any of these degenerating meant a feral rabbit. */
const LEGACY_FERAL = ['vitality', 'strength', 'love', 'arcana', 'transformation'];

// ------------------------------------------------------------------ individuals

/**
 * One dose in a rabbit's own log (the dose's hidden effect vector is not kept).
 * @typedef {Object} DoseEntry
 * @property {string} rec    trial record id
 * @property {number} day
 * @property {number} ml
 * @property {'cauldron'|'vial'} src
 * @property {string} obs    observed channels with tone, e.g. 'vitality+,toxicity-,fire'
 * @property {1} [died]
 */

/**
 * @typedef {Object} Rabbit
 * @property {string} id            'r'+serial, never reused
 * @property {string} name
 * @property {'f'|'m'} sex
 * @property {number} born          game day
 * @property {RabbitLook} look
 * @property {string[]|null} parents [mother, father]
 * @property {number} health        0..maxHealthOf (max(20, 100 + bonus − scar))
 * @property {number} bonus         0..MAX_BONUS extra maximum health from vitality
 * @property {boolean} alive
 * @property {number} trials        lifetime doses
 * @property {Record<string, number>} marks     transient visible states 0..100 (fade daily)
 * @property {Record<string, number>} exposure  lifetime totals (hidden; never fade)
 * @property {number} scar          0..80 permanent harm
 * @property {string[]} traits      permanent anatomy, in the order grown (≤ 5)
 * @property {string[]} degen       channels running out of control
 * @property {number} cd            seconds until an aggressive rabbit strikes again
 * @property {number} mc            seconds until a lovestruck rabbit mates again
 * @property {DoseEntry[]} doses    oldest first, ≤ DOSE_LIMIT
 * @property {number} dosesDropped
 * @property {{sire:string, due:number}|null} pregnant
 * @property {number|null} diedDay
 * @property {string|null} cause
 */

/**
 * A processed or buried body: what replays and remains need, nothing more.
 * @typedef {Object} MemorialEntry
 * @property {string} id
 * @property {string} name
 * @property {'f'|'m'} sex
 * @property {RabbitLook} look
 * @property {number} born
 * @property {number|null} diedDay
 * @property {string|null} cause
 * @property {Stage} stage
 * @property {string[]} traits
 * @property {Record<string, number>} exposure
 * @property {'processed'|'buried'} how
 * @property {string[]} parts   material ids made from it
 * @property {string[]|null} [parents]
 */

/**
 * @typedef {Object} Colony
 * @property {string} seed
 * @property {number} serial
 * @property {string|null} focus   the selected rabbit (dose target)
 * @property {boolean} breed
 * @property {number} fedDay
 * @property {number} day          last day the colony ticked
 * @property {Rabbit[]} rabbits    living rabbits and unprocessed bodies, in hutch order
 * @property {MemorialEntry[]} memorial newest first
 * @property {number} purges       purging draughts on the shelf
 * @property {number|null} still   seconds left on the purge brewing in the still
 * @property {number} ticks        real-time ticks run (seeds their Rng)
 * @property {number} clock        wall-clock ms of the last tick (catch-up after a break)
 */

export const NAMES = ['Clover', 'Bramble', 'Hazel', 'Juniper', 'Pip', 'Thistle', 'Willow', 'Sorrel', 'Barley', 'Fennel', 'Nettle', 'Poppy', 'Rowan', 'Sage',
  'Tansy', 'Teasel', 'Bryony', 'Campion', 'Dill', 'Elder', 'Flax', 'Gorse', 'Heather', 'Ivy', 'Kale', 'Lovage', 'Mallow', 'Nutmeg', 'Oats', 'Parsley', 'Quince',
  'Radish', 'Saffron', 'Tarragon', 'Umber', 'Vetch', 'Wren', 'Yarrow', 'Acorn', 'Basil', 'Cobnut', 'Dandelion', 'Eyebright', 'Foxglove', 'Ginger', 'Hops', 'Iris', 'Jasmine'];

const emptyMarks = () => Object.fromEntries(RABBIT_MARKS.map((k) => [k, 0]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round1 = (v) => Math.round(v * 10) / 10;
const round4 = (v) => Math.round(v * 1e4) / 1e4;

/** The two founders every new hutch starts with (identical in every game). */
function founders() {
  /** @type {RabbitLook} */
  const clover = { coat: [0.93, 0.89, 0.82], coat2: [0.36, 0.24, 0.18], pattern: 'solid', ear: 'upright', size: 1, eye: 'dark', tail: 1, seed: 1 };
  /** @type {RabbitLook} */
  const bramble = { coat: [0.55, 0.42, 0.3], coat2: [0.93, 0.89, 0.82], pattern: 'agouti', ear: 'lop', size: 1.05, eye: 'dark', tail: 1, seed: 2 };
  return [
    newRabbit({ id: 'r1', name: 'Clover', sex: 'f', born: FOUNDER_BORN, look: clover }),
    newRabbit({ id: 'r2', name: 'Bramble', sex: 'm', born: FOUNDER_BORN, look: bramble }),
  ];
}

/** @param {{id:string, name:string, sex:'f'|'m', born:number, look:RabbitLook, parents?:string[]|null}} o @returns {Rabbit} */
function newRabbit(o) {
  return {
    id: o.id, name: o.name, sex: o.sex, born: o.born, look: o.look, parents: o.parents || null,
    health: 100, bonus: 0, alive: true, trials: 0, marks: emptyMarks(), exposure: emptyMarks(), scar: 0, traits: [], degen: [], cd: 0, mc: 0,
    doses: [], dosesDropped: 0, pregnant: null, diedDay: null, cause: null,
  };
}

/** A fresh hutch. @param {string} [seed] @returns {Colony} */
export function createColony(seed = '') {
  return { seed, serial: 2, focus: 'r1', breed: true, fedDay: 0, day: 0, rabbits: founders(), memorial: [], purges: 2, still: null, ticks: 0, clock: 0 };
}

/** @param {Colony} c @param {string} id */
export function findRabbit(c, id) {
  return c.rabbits.find((r) => r.id === id) || null;
}

/** @param {Colony} c */
/** The most animals one enclosure holds: its living and its dead together. */
export const PEN_MAX = 10;

/** How many animals of a kind are kept, living and dead (bodies stay until their remains are recovered). @param {Colony} c @param {string} kind */
export function penCount(c, kind) {
  return c.rabbits.filter((r) => kindOf(r.look) === kind).length;
}

/** Living animals of a kind (the Shop's places count per enclosure). @param {Colony} c @param {string} kind */
export function livingOf(c, kind) {
  return c.rabbits.filter((r) => r.alive && kindOf(r.look) === kind).length;
}

/** Young on the way in a kind's enclosure (two counted for each expecting female). @param {Colony} c @param {string} kind */
function penPending(c, kind) {
  return 2 * c.rabbits.filter((r) => r.alive && r.pregnant && kindOf(r.look) === kind).length;
}

/** Whether a kind's enclosure has room for `n` more. @param {Colony} c @param {string} kind */
export function penHasRoom(c, kind, n = 1) {
  return penCount(c, kind) + n <= PEN_MAX;
}

export function livingRabbits(c) {
  return c.rabbits.filter((r) => r.alive);
}

/** @param {Colony} c */
export function bodies(c) {
  return c.rabbits.filter((r) => !r.alive);
}

/** The selected rabbit (even if dead), else the first living one, else the first. @param {Colony} c */
export function focusRabbit(c) {
  return (c.focus && findRabbit(c, c.focus)) || c.rabbits.find((r) => r.alive) || c.rabbits[0] || null;
}

/** A name nobody in the hutch or the memorial has. @param {Colony} c @param {Rng} rng */
export function pickName(c, rng) {
  const used = new Set([...c.rabbits.map((r) => r.name), ...c.memorial.map((m) => m.name)]);
  const free = NAMES.filter((n) => !used.has(n));
  if (free.length) return rng.pick(free);
  const base = rng.pick(NAMES);
  for (let k = 2; ; k++) {
    const n = `${base} ${['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][k] || k}`;
    if (!used.has(n)) return n;
  }
}

/**
 * Add a rabbit to the hutch.
 * @param {Colony} c @param {{born:number, sex:'f'|'m', look:RabbitLook, name?:string, parents?:string[]|null}} o @param {Rng} rng
 */
export function makeRabbit(c, o, rng) {
  c.serial++;
  const r = newRabbit({ id: 'r' + c.serial, name: o.name || pickName(c, rng), sex: o.sex, born: o.born, look: o.look, parents: o.parents || null });
  c.rabbits.push(r);
  return r;
}

/**
 * An adult rabbit from the breeder (no coins change hands here). Does and
 * bucks are kept roughly balanced.
 * @param {Colony} c @param {{day:number}} o
 */
export function addBoughtRabbit(c, o) {
  const rng = new Rng(hashString(`${c.seed}:buy:${c.serial}`));
  const live = livingRabbits(c);
  const does = live.filter((r) => r.sex === 'f').length, bucks = live.length - does;
  const sex = does === bucks ? (rng.chance(0.5) ? 'f' : 'm') : does < bucks ? 'f' : 'm';
  return makeRabbit(c, { born: o.day - (ADULT_DAYS + 2), sex, look: rollLook(rng) }, rng);
}

/**
 * A rabbit brought home from the wilds: caught alive, weak from its wounds
 * (`health`), or killed there — its body, for its remains or burial.
 * @param {Colony} c @param {{day:number, look:RabbitLook, sex:'f'|'m', dead?:boolean, health?:number}} o
 */
export function addWildRabbit(c, o) {
  const rng = new Rng(hashString(`${c.seed}:wild:${c.serial}`));
  const r = makeRabbit(c, { born: o.day - (ADULT_DAYS + rng.int(0, 12)), sex: o.sex, look: o.look }, rng);
  if (o.dead) { r.alive = false; r.health = 0; r.cause = 'hunted'; r.diedDay = o.day; }
  else r.health = round1(clamp(fin(o.health, 40), 5, 100));
  return r;
}

/** Append a dose to a rabbit's log (capped). @param {Rabbit} r @param {DoseEntry} d */
export function recordDose(r, d) {
  r.doses.push(d);
  if (r.doses.length > DOSE_LIMIT) {
    r.dosesDropped += r.doses.length - DOSE_LIMIT;
    r.doses.splice(0, r.doses.length - DOSE_LIMIT);
  }
}

/** Are two rabbits close kin (parent and child, or siblings)? @param {Rabbit} a @param {Rabbit} b */
export function related(a, b) {
  const pa = a.parents || [], pb = b.parents || [];
  if (pa.includes(b.id) || pb.includes(a.id)) return true;
  return pa.some((p) => p && pb.includes(p));
}

// ------------------------------------------------------------------ physiology

/** How strongly a stage feels a dose. */
const STAGE_SENS = { kit: 1.6, young: 1.25, adult: 1, elder: 1.15 };
/** Reading uncertainty grows for small and frail subjects. */
export const STAGE_ERR = { kit: 1.4, young: 1.15, adult: 1, elder: 1.1 };
/** Daily fading of each transient mark. */
export const MARK_DECAY = { vitality: 0.5, strength: 0.8, love: 0.6, arcana: 0.7, transformation: 0.75, fire: 0.4, frost: 0.4, acid: 0.7, alkali: 0.6, toxicity: 0.75, death: 0.85, swiftness: 0.7, levitation: 0.65, invisibility: 0.6, phasing: 0.75, temporal: 0.55 };
/** What a trait favours: weights by the other effects in the same dose. */
const TRAIT_AFF = {
  ears2: { love: 1 }, horns: { fire: 1, strength: 1 }, antlers: { vitality: 1, arcana: 0.5 }, unihorn: { vitality: 0.8, arcana: 1 },
  scales: { frost: 0.6, acid: 0.7, toxicity: 0.5 }, spines: { frost: 1.2, toxicity: 0.3 }, 'tail-lizard': { toxicity: 1, fire: 0.5 },
  'tail-plume': { love: 0.7, vitality: 0.7 }, giant: { strength: 1.2, vitality: 0.5 }, tiny: { death: 1, frost: 0.6 }, eye3: { arcana: 1.5 }, wings: { arcana: 0.8, love: 0.6 },
};
const TRAIT_LINES = {
  ears2: 'A second pair of ears unfurls behind the first!', horns: 'Two little horns push up between its ears!', antlers: 'Tiny velvet antlers sprout from its brow!',
  unihorn: 'A single spiral horn grows from its forehead!', scales: 'Its haunches harden into glinting scales!', spines: 'Icy spines rise along its back!',
  'tail-lizard': 'Its tail stretches into a scaly lizard tail!', 'tail-plume': 'Its tail blooms into a long feathery plume!', giant: 'It swells to twice its size!',
  tiny: 'It shrinks to the size of a kitten!', eye3: 'A third eye opens on its forehead!', wings: 'Little membrane wings unfold from its shoulders!',
};
const CAUSE_OF = { toxicity: 'poison', death: 'death', fire: 'fire', frost: 'frost', acid: 'acid', alkali: 'alkali', transformation: 'change', arcana: 'arcana', vitality: 'growth', strength: 'strain', love: 'love' };
/** What the player sees when a channel goes out of control. */
const DEGEN_LINES = {
  toxicity: 'The poison has taken hold: it is spreading through its blood on its own!',
  death: 'The grey pallor deepens by itself — death magic is eating it from within!',
  acid: 'The burns keep spreading: its own body is turning to acid!',
  alkali: 'The lye crust keeps growing, cracking deeper into its skin!',
  fire: 'It is smouldering from the inside — the heat keeps rising!',
  frost: 'The cold has reached its heart and keeps spreading!',
  vitality: 'Wild growth: it keeps swelling on its own, ravenous and restless!',
  strength: 'Its muscles keep swelling on their own, straining its heart!',
  love: 'Its passion will not cool: it chases the others to mate, faster and faster!',
  arcana: 'The magic in it runs wild and keeps building!',
  transformation: 'The change will not stop — it keeps twisting into something new!',
};
/** What the player sees when an effect makes a rabbit turn on the others. */
const AGGRO_LINES = {
  vitality: 'Bursting with wild vigour, it bares its teeth at the others!',
  strength: 'Swollen with strength, it starts shoving and biting the others!',
  arcana: 'Sparks lash out of it at the other rabbits!',
  transformation: 'Something feral wakes in it — it goes for the others!',
};

/** Exclusive partners of a trait. @param {string} t */
const partners = (t) => TRAIT_EXCLUSIVE.filter((g) => g.includes(t)).flat().filter((x) => x !== t);

/**
 * Grow the traits whose transformation thresholds were crossed.
 * @param {Rabbit} r @param {number} e0 transformation exposure before @param {number} e1 after
 * @param {Record<string, number>} applied the dose's channels (weights the kind of change)
 */
function growTraits(r, e0, e1, applied) {
  const grown = [];
  for (let n = 0; n < TRAIT_AT.length && r.traits.length < 5; n++) {
    const T = TRAIT_AT[n];
    if (!(e0 < T && T <= e1)) continue;
    const banned = new Set(r.traits.flatMap((t) => [t, ...partners(t)]));
    const cands = TRAITS.filter((t) => !banned.has(t));
    if (!cands.length) break;
    const rng = new Rng(hashString(`${r.id}:${r.look.seed}:trait:${n}`));
    const w = cands.map((t) => 1 + Object.entries(TRAIT_AFF[t] || {}).reduce((a, [k, f]) => a + f * Math.min(40, applied[k] || 0) / 10, 0));
    const t = rng.weighted(cands, w);
    r.traits.push(t);
    grown.push(t);
  }
  return grown;
}

/**
 * What a dose does to a rabbit (pure: `before` is not changed). Every one
 * of the eleven channels acts and shows; opposites cancel (fire and frost,
 * acid and alkali; vitality eases poison and pallor). Readings are not made
 * here — a trial reads only the species' revealed channels.
 * @param {any} before rabbit (or a legacy single-subject state)
 * @param {ArrayLike<number>} effects dose effect vector (NE)
 * @param {number} ml
 * @param {{day?:number}} [o]
 */
export function rabbitResponse(before, effects, ml, o = {}) {
  const r = normalizeRabbit(JSON.parse(JSON.stringify(before || {})), before && before.id);
  /** @type {{key:string, tone:'good'|'bad'|'neutral', text:string}[]} */
  const obs = [];
  const say = (key, tone, text) => obs.push({ key, tone, text });
  if (!r.alive) return { after: r, observations: [{ key: '', tone: /** @type {'neutral'} */ ('neutral'), text: `${r.name || 'The rabbit'} is dead. Choose or buy another rabbit.` }], harm: 0, applied: {}, react: [], newTraits: [], cause: r.cause };
  const wasAggro = aggroOf(r);
  const stage = stageOf(r, o.day);
  const x = Math.min(2.5, Math.max(0, ml) / 10);
  const s = (STAGE_SENS[stage] || 1) / (r.look.size || 1) * (r.traits.includes('giant') ? 0.85 : 1) * (r.traits.includes('tiny') ? 1.2 : 1);
  const e = (k) => (Number(effects[EFFECT_INDEX[k]]) || 0) * x * s;
  const acidity = e('acidity');
  /** @type {Record<string, number>} */
  const a = {
    vitality: Math.max(0, e('vitality')), strength: Math.max(0, e('strength')), love: Math.max(0, e('love')), arcana: Math.max(0, e('arcana')),
    transformation: Math.max(0, e('transformation')), fire: Math.max(0, e('fire')), frost: Math.max(0, e('frost')),
    acid: Math.max(0, acidity), alkali: Math.max(0, -acidity), toxicity: Math.max(0, e('toxicity')), death: Math.max(0, e('death')),
    ...Object.fromEntries(['swiftness', 'levitation', 'invisibility', 'phasing', 'temporal'].map((k) => [k, Math.max(0, e(k))])),
  };
  const m = r.marks;
  const add = (k, v) => { m[k] = clamp(m[k] + v, 0, 100); };
  add('vitality', 0.8 * a.vitality);
  add('strength', a.strength);
  add('love', 1.2 * a.love);
  add('arcana', 1.2 * a.arcana);
  add('transformation', 1.3 * a.transformation);
  add('fire', 1.2 * a.fire - 0.6 * a.frost);
  add('frost', 1.2 * a.frost - 0.6 * a.fire);
  add('acid', 0.9 * a.acid - 0.5 * a.alkali);
  add('alkali', 0.9 * a.alkali - 0.5 * a.acid);
  add('toxicity', a.toxicity - 0.5 * a.vitality);
  add('death', 1.5 * a.death - 0.3 * a.vitality);
  for (const k of ['swiftness', 'levitation', 'invisibility', 'phasing', 'temporal']) add(k, a[k]);
  const e0 = r.exposure.transformation;
  for (const k of RABBIT_MARKS) r.exposure[k] = round1(r.exposure[k] + a[k]);
  // harm, by channel (the largest one names the cause of a death)
  /** @type {Record<string, number>} */
  const hurt = {
    toxicity: a.toxicity * 1.1, death: a.death * 1.8,
    fire: a.fire > 18 ? (a.fire - 18) * 0.8 : 0, frost: a.frost > 18 ? (a.frost - 18) * 0.7 : 0,
    acid: a.acid > 12 ? (a.acid - 12) * 0.8 : 0, alkali: a.alkali > 20 ? (a.alkali - 20) * 0.5 : 0,
    transformation: a.transformation > 30 ? (a.transformation - 30) * 0.3 : 0, arcana: a.arcana > 40 ? (a.arcana - 40) * 0.3 : 0,
  };
  const harm = Object.values(hurt).reduce((p, v) => p + v, 0);
  r.scar = Math.min(80, round1(r.scar + 0.2 * Math.max(0, harm - 5)));
  // vitality heals what is missing; at full health it raises the maximum
  const heal = 0.9 * a.vitality;
  let maxHealth = maxHealthOf(r, o.day);
  let health = r.health - harm;
  const room = Math.max(0, maxHealth - health);
  const grow = Math.max(0, heal - room) * 0.5;
  if (grow > 0 && health > 0.5) {
    r.bonus = round1(Math.min(MAX_BONUS, (r.bonus || 0) + grow));
    maxHealth = maxHealthOf(r, o.day);
  }
  r.health = round1(clamp(health + heal, 0, maxHealth));
  r.alive = r.health > 0.5;
  // a mark driven to the top kills, whatever the effect
  const topped = RABBIT_MARKS.filter((k) => m[k] >= MARK_MAX).sort((p, q) => a[q] - a[p])[0];
  if (r.alive && topped) { r.alive = false; r.health = 0; hurt[topped] = (hurt[topped] || 0) + 1000; }
  // what it looks like (all channels; intensity words)
  const big = (v) => v > 20;
  if (a.vitality > 1) say('vitality', 'good', grow > 0.5 ? 'Already in full health, it grows hardier still.' : big(a.vitality) ? 'Its coat gleams; it bounds about full of life.' : 'It looks refreshed.');
  if (a.strength > 1) say('strength', 'good', big(a.strength) ? 'Its haunches swell with muscle; it shoves at the bars.' : 'It moves with new strength.');
  if (a.love > 1) say('love', 'good', big(a.love) ? 'It nuzzles your hand, utterly devoted; little hearts seem to hang in the air.' : 'It nuzzles your hand.');
  if (a.arcana > 1) say('arcana', 'neutral', big(a.arcana) ? 'Violet sparks crawl through its fur; faint runes glimmer.' : 'Its eyes catch a strange glimmer.');
  if (a.transformation > 1) say('transformation', 'neutral', 'Its fur ripples and its shape shifts.');
  const extraLines = { swiftness: 'It darts about, leaving quick streaks behind it.', levitation: 'Its paws rise above the ground.', invisibility: 'Its coat fades into a wavering outline.', phasing: 'A spectral double flickers through its body.', temporal: 'Its movements repeat in slow and fast echoes.' };
  for (const [k, line] of Object.entries(extraLines)) if (a[k] > 1) say(k, 'neutral', line);
  if (a.fire > 1) say('fire', a.fire > 18 ? 'bad' : 'neutral', a.fire > 18 ? 'It yelps; its fur smoulders and singes.' : 'It pants in a warm glow.');
  if (a.frost > 1) say('frost', a.frost > 18 ? 'bad' : 'neutral', a.frost > 18 ? 'Frost rimes its whiskers; icicles hang from its chin and it shivers.' : 'It shivers; frost feathers its whiskers.');
  if (a.acid > 1) say('acidity', a.acid > 12 ? 'bad' : 'neutral', a.acid > 12 ? 'It squeals: the fur burns away in raw patches.' : 'It scratches at a stinging patch of fur.');
  if (a.alkali > 1) say('acidity', a.alkali > 20 ? 'bad' : 'neutral', a.alkali > 20 ? 'A chalky crust cakes its fur and cracks its skin.' : 'A chalky film dulls its coat.');
  if (a.toxicity > 1) say('toxicity', 'bad', a.toxicity > 15 ? 'It staggers, sick and trembling.' : 'It looks queasy.');
  if (a.death > 1) say('death', 'bad', a.death > 15 ? 'A grey pallor creeps over it.' : 'It grows still and cold for a moment.');
  const newTraits = growTraits(r, e0, r.exposure.transformation, a);
  for (const t of newTraits) say('transformation', 'neutral', TRAIT_LINES[t]);
  const degen = r.alive ? startDegeneration(r) : [];
  for (const k of degen) say(k === 'acid' || k === 'alkali' ? 'acidity' : k, 'bad', DEGEN_LINES[k]);
  const angry = r.alive ? aggroOf(r).filter((k) => !wasAggro.includes(k)) : [];
  if (angry.length && !wasAggro.length) { say(angry[0], 'bad', AGGRO_LINES[angry[0]]); if (!(r.cd > 0)) r.cd = 3; }
  if (r.alive && a.love > 1 && m.love >= LOVE_MATE && !(r.mc > 0)) r.mc = Math.min(mateEvery(m.love), 8);
  if (!r.alive) {
    const worst = Object.entries(hurt).sort((p, q) => q[1] - p[1])[0];
    r.cause = worst && worst[1] > 0 ? CAUSE_OF[worst[0]] : 'frail';
    r.diedDay = Number.isFinite(o.day) ? o.day : null;
    r.pregnant = null;
    say('', 'bad', r.cause === 'fire' ? 'It collapses in a smouldering heap.' : r.cause === 'frost' ? 'It freezes stiff and topples over.' : r.cause === 'poison' ? 'It convulses, then lies still.' : r.cause === 'love' ? 'Its heart gives out in a frenzy of passion.' : 'It collapses and does not get up.');
  }
  if (!obs.length) say('', 'neutral', 'No visible change.');
  r.trials++;
  const react = RABBIT_MARKS.filter((k) => a[k] > 1);
  return { after: r, observations: obs, harm, applied: a, react, newTraits, degen, cause: r.alive ? null : r.cause };
}

/** Channels that crossed the rabbit's own threshold start degenerating. @param {Rabbit} r @returns {string[]} new ones */
function startDegeneration(r) {
  const out = [];
  for (const k of RABBIT_MARKS) {
    if (r.marks[k] >= degenAt(r, k) && !r.degen.includes(k)) { r.degen.push(k); out.push(k); }
  }
  return out;
}

// ------------------------------------------------------------------ real time

/**
 * @typedef {{died:{id:string, name:string, cause:string, by?:string}[], attacks:{from:string, to:string, fromName:string, toName:string, dmg:number, killed:boolean}[],
 *   degen:{id:string, name:string, key:string}[], traits:{id:string, name:string, trait:string}[],
 *   mates:{from:string, to:string, fromName:string, toName:string, conceived:boolean}[]}} TickReport
 */

/**
 * The hutch in real time, `dt` seconds (call with steps of a second or so):
 * ordinary marks fade slowly and health creeps back; degenerating marks
 * climb at the rabbit's own pace until they reach the top and kill it
 * (lethal ones eat its health on the way; vitality keeps swelling it,
 * transformation keeps changing it); a rabbit whose aggressive marks are
 * past its own aggression threshold strikes the others; a lovestruck one
 * mates with them, faster the more it is in love, and every mating wears
 * it out. Deterministic for the same colony and calls.
 * @param {Colony} c @param {number} dt @param {{day?:number, seed?:string, cap?:number}} [o]
 * @returns {TickReport}
 */
export function colonyTick(c, dt, o = {}) {
  /** @type {TickReport} */
  const rep = { died: [], attacks: [], degen: [], traits: [], mates: [] };
  if (!(dt > 0)) return rep;
  const rng = new Rng(hashString(`${o.seed ?? c.seed}:tick:${c.ticks || 0}`));
  c.ticks = (c.ticks || 0) + 1;
  const day = o.day;
  const fade = Math.exp(-dt / MARK_TAU);
  const die = (r, cause, by) => {
    r.alive = false; r.health = 0; r.cause = cause; r.diedDay = Number.isFinite(day) ? day : null; r.pregnant = null; r.degen = [];
    rep.died.push({ id: r.id, name: r.name, cause, ...(by ? { by } : {}) });
  };
  for (const r of c.rabbits) {
    if (!r.alive) continue;
    const dg = degenOf(r);
    let drain = 0, topped = null;
    /** @type {Record<string, number>} what each channel takes from its health this step */
    const hurts = {};
    for (const k of RABBIT_MARKS) {
      if (dg.includes(k)) {
        // it does not stop: faster the further it has gone
        const v = r.marks[k];
        r.marks[k] = round1(Math.min(MARK_MAX, v + degenRate(r, k) * (0.6 + 0.8 * v / MARK_MAX) * dt));
        if (r.marks[k] >= MARK_MAX && !topped) topped = k;
        if (LETHAL.includes(k)) hurts[k] = (0.4 + 1.6 * r.marks[k] / 100) * dt;
      } else {
        // kept to a ten-thousandth: rounding to a hundredth froze small marks (a step's fade is smaller than that)
        const v = r.marks[k] * fade;
        r.marks[k] = v < 0.3 ? 0 : Math.round(v * 1e4) / 1e4;
      }
    }
    if (topped) { die(r, CAUSE_OF[topped] || 'poison'); continue; }
    // fire and acid burn slowly for as long as they are active, faster the higher they are
    for (const k of BURNS) if (r.marks[k] > 0) hurts[k] = (hurts[k] || 0) + burnRate(r.marks[k]) * dt;
    for (const v of Object.values(hurts)) drain += v;
    if (dg.includes('vitality')) r.bonus = round1(Math.min(MAX_BONUS, (r.bonus || 0) + 0.25 * dt));
    if (dg.includes('transformation')) {
      const e0 = r.exposure.transformation;
      r.exposure.transformation = round1(e0 + 0.8 * dt);
      for (const t of growTraits(r, e0, r.exposure.transformation, r.marks)) rep.traits.push({ id: r.id, name: r.name, trait: t });
    }
    const max = maxHealthOf(r, day);
    if (drain > 0) {
      // kept to a ten-thousandth: a slow burn must not round away
      r.health = round4(r.health - drain);
      const burned = BURNS.reduce((a, k) => a + (dg.includes(k) ? 0 : burnRate(r.marks[k]) * dt), 0);
      if (burned > 0) r.scar = Math.min(80, round4((r.scar || 0) + 0.05 * burned));
      if (r.health <= 0.5) {
        const worst = Object.entries(hurts).sort((p, q) => q[1] - p[1])[0];
        die(r, (worst && CAUSE_OF[worst[0]]) || 'poison');
        continue;
      }
    } else r.health = round4(Math.min(max, r.health + 0.05 * dt)); // a tenth would round a 0.05 step away
    if (r.health > max) r.health = max;
  }
  // aggressive rabbits strike
  for (const r of c.rabbits) {
    const angry = aggroOf(r);
    if (!angry.length) { if (r.alive) r.cd = 0; continue; }
    r.cd = (r.cd || 0) - dt;
    if (r.cd > 0) continue;
    const fury = Math.max(...angry.map((k) => r.marks[k]));
    const t = clamp(Math.max(...angry.map((k) => (r.marks[k] - aggroAt(r, k)) / Math.max(1, MARK_MAX - aggroAt(r, k)))), 0, 1);
    r.cd = round1((ATTACK_EVERY[0] + (ATTACK_EVERY[1] - ATTACK_EVERY[0]) * t) * rng.range(0.8, 1.25));
    // each kind has its own enclosure: only those penned with it are in reach
    const prey = c.rabbits.filter((x) => x.alive && x.id !== r.id && kindOf(x.look) === kindOf(r.look));
    if (!prey.length) continue;
    const v = rng.pick(prey);
    const dmg = round1((8 + 14 * fury / 100 + 0.1 * (r.marks.strength || 0)) * rng.range(0.8, 1.2) * (r.traits.includes('giant') ? 1.3 : 1));
    v.health = round1(v.health - dmg);
    v.scar = Math.min(80, round1((v.scar || 0) + 0.15 * dmg));
    const killed = v.health <= 0.5;
    rep.attacks.push({ from: r.id, to: v.id, fromName: r.name, toName: v.name, dmg, killed });
    if (killed) die(v, 'mauled', r.name);
  }
  // lovestruck rabbits mate, faster and faster as love rises, and wear themselves out
  let living = c.rabbits.filter((x) => x.alive).length;
  let pending = 2 * c.rabbits.filter((x) => x.alive && x.pregnant).length;
  for (const r of c.rabbits) {
    if (!r.alive) continue;
    const love = r.marks.love || 0;
    if (love < LOVE_MATE) { r.mc = 0; continue; }
    r.mc = (r.mc || mateEvery(love)) - dt;
    if (r.mc > 0) continue;
    r.mc = round1(Math.max(0.5, mateEvery(love) * rng.range(0.8, 1.2)));
    // only those penned with it (its own kind) are in reach
    const others = c.rabbits.filter((x) => x.alive && x.id !== r.id && stageOf(x, day) !== 'kit' && kindOf(x.look) === kindOf(r.look));
    if (!others.length) continue;
    const mates = others.filter((x) => x.sex !== r.sex);
    const p = rng.pick(mates.length ? mates : others);
    let conceived = false;
    if (p.sex !== r.sex && kindOf(p.look) === kindOf(r.look)) {
      const doe = r.sex === 'f' ? r : p, buck = r.sex === 'f' ? p : r;
      const kd = kindOf(doe.look);
      const room = (!Number.isFinite(o.cap) || livingOf(c, kd) + penPending(c, kd) < /** @type {number} */ (o.cap)) && penCount(c, kd) + penPending(c, kd) < PEN_MAX;
      if (!doe.pregnant && stageOf(doe, day) !== 'kit' && room && rng.chance(0.35)) {
        doe.pregnant = { sire: buck.id, due: (Number.isFinite(day) ? /** @type {number} */ (day) : c.day || 0) + GESTATION_DAYS };
        pending += 2;
        conceived = true;
      }
    }
    r.health = round1(r.health - mateCost(love) * rng.range(0.8, 1.2));
    p.health = round1(p.health - 0.5);
    rep.mates.push({ from: r.id, to: p.id, fromName: r.name, toName: p.name, conceived });
    if (r.health <= 0.5) { die(r, 'love'); living--; }
    if (p.alive && p.health <= 0.5) { die(p, 'love'); living--; }
  }
  return rep;
}

/**
 * A purging draught: every mark is washed out and any degeneration stops.
 * What is permanent stays (traits, scars, grown health, lifetime exposure).
 * @param {Rabbit} r
 */
export function purgeRabbit(r) {
  if (!r || !r.alive) return false;
  for (const k of RABBIT_MARKS) r.marks[k] = 0;
  r.degen = [];
  r.cd = 0;
  r.mc = 0;
  return true;
}

/**
 * The alchemist ends a rabbit's life on purpose (a feral one, or one past
 * saving). The body stays for remains or burial.
 * @param {Rabbit} r @param {number} [day]
 */
export function cullRabbit(r, day) {
  if (!r || !r.alive) return false;
  r.alive = false; r.health = 0; r.cause = 'culled'; r.diedDay = Number.isFinite(day) ? day : null; r.pregnant = null; r.degen = []; r.cd = 0; r.mc = 0;
  return true;
}

// ------------------------------------------------------------------ the day

/**
 * @typedef {{day:number, born:{id:string, name:string, mother:string}[], grown:{id:string, name:string}[],
 *   died:{id:string, name:string, cause:string}[], lost:number, conceived:number}} ColonyDayReport
 */

/**
 * A night in the hutch: marks fade, lingering poison works, the healthy
 * recover, kits grow, the old may die, kits are born and healthy unrelated
 * adults pair up — never beyond the hutch's room. Deterministic per day.
 * @param {Colony} c @param {{seed?:string, day:number, cap:number}} o
 * @returns {ColonyDayReport}
 */
export function colonyDay(c, o) {
  const day = o.day;
  const rng = new Rng(hashString(`${o.seed ?? c.seed}:colony:${day}`));
  /** @type {ColonyDayReport} */
  const rep = { day, born: [], grown: [], died: [], lost: 0, conceived: 0 };
  const fed = c.fedDay === day - 1;
  const die = (r, cause) => {
    r.alive = false; r.health = 0; r.cause = cause; r.diedDay = day; r.pregnant = null;
    rep.died.push({ id: r.id, name: r.name, cause });
  };
  // 1. every living rabbit
  for (const r of c.rabbits) {
    if (!r.alive) continue;
    for (const k of RABBIT_MARKS) {
      if (degenOf(r).includes(k)) continue;
      const v = r.marks[k] * MARK_DECAY[k];
      r.marks[k] = v < 0.5 ? 0 : round1(v);
    }
    const poison = Math.max(0, r.marks.toxicity - 40) * 0.5 + Math.max(0, r.marks.death - 40) * 0.4;
    if (poison > 0) {
      r.health = round1(r.health - poison);
      r.scar = Math.min(80, round1(r.scar + 0.2 * poison));
    }
    if (r.health <= 0.5) { die(r, r.marks.death > r.marks.toxicity ? 'death' : 'poison'); continue; }
    const age = day - r.born;
    if (age > LIFESPAN_DAYS && rng.chance(Math.min(0.5, (age - LIFESPAN_DAYS) / 24))) { die(r, 'age'); continue; }
    const maxHealth = maxHealthOf(r, day);
    if (!degenOf(r).some((k) => LETHAL.includes(k))) r.health = round1(Math.min(maxHealth, r.health + 10 + (fed ? 6 : 0)));
    if (stageOf(r, day - 1) !== 'adult' && stageOf(r, day - 1) !== 'elder' && stageOf(r, day) === 'adult') rep.grown.push({ id: r.id, name: r.name });
  }
  let living = c.rabbits.filter((r) => r.alive).length;
  // 2. births
  for (const doe of c.rabbits.slice()) {
    if (!doe.pregnant) continue;
    if (!doe.alive) { doe.pregnant = null; continue; }
    if (doe.pregnant.due > day) continue;
    const sireId = doe.pregnant.sire;
    const sire = findRabbit(c, sireId) || c.memorial.find((x) => x.id === sireId) || doe;
    const litter = rng.int(1, 3);
    const n = Math.max(0, Math.min(litter, o.cap - livingOf(c, kindOf(doe.look)), PEN_MAX - penCount(c, kindOf(doe.look))));
    rep.lost += litter - n;
    for (let k = 0; k < n; k++) {
      const kit = makeRabbit(c, { born: day, sex: rng.chance(0.5) ? 'f' : 'm', look: inheritLook(doe.look, sire.look, rng), parents: [doe.id, sireId] }, rng);
      rep.born.push({ id: kit.id, name: kit.name, mother: doe.name });
      living++;
    }
    doe.pregnant = null;
  }
  // 3. pairing
  if (c.breed !== false) {
    const eligible = (r) => r.alive && stageOf(r, day) === 'adult' && r.health >= 60 && r.marks.toxicity < 30 && r.marks.death < 20 && !degenOf(r).length;
    const bucks = c.rabbits.filter((r) => r.sex === 'm' && eligible(r)).sort((p, q) => q.marks.love - p.marks.love || (p.id < q.id ? -1 : 1));
    let pending = 2 * c.rabbits.filter((r) => r.alive && r.pregnant).length;
    for (const doe of c.rabbits) {
      if (doe.sex !== 'f' || doe.pregnant || !eligible(doe)) continue;
      const kd = kindOf(doe.look);
      if (livingOf(c, kd) + penPending(c, kd) >= o.cap) continue;
      const buck = bucks.find((b) => !related(doe, b) && kindOf(b.look) === kd);
      if (!buck) continue;
      if (penCount(c, kd) + penPending(c, kd) >= PEN_MAX) continue;
      const p = 0.3 + 0.4 * Math.min(1, Math.max(doe.marks.love, buck.marks.love) / 50) + (fed ? 0.1 : 0);
      if (rng.chance(p)) {
        doe.pregnant = { sire: buck.id, due: day + GESTATION_DAYS };
        pending += 2;
        rep.conceived++;
      }
    }
  }
  c.day = day;
  return rep;
}

/**
 * Move a body (or, for compatibility, any rabbit) out of the hutch into the
 * memorial; the focus moves on.
 * @param {Colony} c @param {string} id @param {'processed'|'buried'} how @param {string[]} parts @param {number} day
 * @returns {MemorialEntry|null}
 */
export function retireRabbit(c, id, how, parts, day) {
  const i = c.rabbits.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const r = c.rabbits[i];
  /** @type {MemorialEntry} */
  const entry = {
    id: r.id, name: r.name, sex: r.sex, look: r.look, born: r.born, diedDay: r.diedDay, cause: r.cause, stage: stageOf(r, r.diedDay ?? day),
    traits: r.traits.slice(), exposure: Object.fromEntries(RABBIT_MARKS.map((k) => [k, round1(r.exposure[k] || 0)])), how, parts: parts.slice(), parents: r.parents,
  };
  c.rabbits.splice(i, 1);
  c.memorial.unshift(entry);
  c.memorial = trimMemorial(c.memorial);
  if (c.focus === id) { const f = c.rabbits.find((x) => x.alive) || c.rabbits[0]; c.focus = f ? f.id : null; }
  return entry;
}

/**
 * The memorial keeps every processed body (its remains are materials of the
 * world, rebuilt from it in the sandbox, and its name must not be reused),
 * but only the newest MEMORIAL_LIMIT buried ones. Newest first.
 * @param {MemorialEntry[]} list
 */
export function trimMemorial(list) {
  let buried = 0;
  return list.filter((m) => m.how === 'processed' || ++buried <= MEMORIAL_LIMIT);
}

/**
 * @typedef {Object} RemainsSource
 * @property {string} id
 * @property {string} name
 * @property {'f'|'m'} sex
 * @property {RabbitLook} look
 * @property {Record<string, number>} exposure
 * @property {string|null} cause
 * @property {Stage} stage
 * @property {string[]} traits
 * @property {number|null} diedDay
 */

/** What remains derivation needs to know about a body. @param {Rabbit|MemorialEntry} r @param {number} day @returns {RemainsSource} */
export function remainsSource(r, day) {
  return {
    id: r.id, name: r.name, sex: r.sex, look: r.look, exposure: { ...r.exposure }, cause: r.cause || null,
    stage: /** @type {any} */ (r).stage || stageOf(r, r.diedDay ?? day), traits: r.traits.slice(), diedDay: r.diedDay ?? null,
  };
}

// ------------------------------------------------------------------ words (never numbers)

const CAUSE_WORDS = { culled: 'put down', hunted: 'killed in the wilds', mauled: 'mauled by an aggressive rabbit', love: 'worn out by love', growth: 'burst with wild growth', strain: 'its heart gave out from the strain', poison: 'poisoned', death: 'withered by death magic', fire: 'burned', frost: 'frozen', acid: 'eaten by acid', alkali: 'scalded by lye', change: 'torn apart by change', arcana: 'overwhelmed by magic', age: 'died of old age', frail: 'too frail', unknown: 'died' };

/** @param {string|null} cause */
export function causeWord(cause) {
  return CAUSE_WORDS[cause || 'unknown'] || 'died';
}

/**
 * How a rabbit looks, in words (for the UI and screen readers). No numbers
 * except the day of death.
 * @param {Rabbit} r @param {number} day
 */
export function rabbitCondition(r, day) {
  const w = [];
  if (!r.alive) {
    w.push(`dead — ${causeWord(r.cause)}${Number.isFinite(r.diedDay) ? ` (day ${r.diedDay})` : ''}`);
  } else {
    const h = 100 * r.health / Math.max(1, maxHealthOf(r, day));
    w.push(h >= 75 ? 'healthy' : h >= 40 ? 'weakened' : h >= 10 ? 'very weak' : 'near death');
    if (isFeral(r)) w.push('AGGRESSIVE');
    else if (degenOf(r).length) w.push('degenerating');
    if ((r.bonus || 0) >= 10) w.push(r.bonus >= 60 ? 'hale beyond nature' : 'extra hardy');
    if (r.scar >= 20) w.push(r.scar >= 50 ? 'badly scarred' : 'scarred');
  }
  const s = rabbitSnap(r, day);
  const L = (k) => s.lv[MARK_INDEX[k]];
  // a body is described by how it died and what it bore for good, not by passing moods
  const pick = (k, words) => { const l = L(k); if (l && r.alive) w.push(words[l - 1]); };
  pick('vitality', ['bright-eyed', 'glowing with health', 'radiant']);
  pick('strength', ['sturdy', 'muscular', 'hulking']);
  pick('love', ['affectionate', 'lovestruck', 'besotted']);
  pick('arcana', ['glimmering', 'sparkling', 'crackling with magic']);
  pick('transformation', ['shimmering', 'shifting', 'changing before your eyes']);
  pick('fire', ['warm', 'smouldering', 'aflame']);
  pick('frost', ['chilly', 'frosted', 'frozen stiff']);
  pick('acid', ['itchy', 'burned in patches', 'raw with acid burns']);
  pick('alkali', ['dusty', 'crusted', 'caked in lye']);
  pick('toxicity', ['queasy', 'sick', 'poisoned']);
  pick('death', ['pale', 'grey and cold', 'barely clinging on']);
  if (r.alive && r.pregnant) w.push('expecting kits');
  if (r.traits.length) w.push(r.traits.map((t) => TRAIT_WORDS[t] || t).join(', '));
  return w;
}

// ------------------------------------------------------------------ persistence

/** @param {any} d @returns {RabbitLook} */
function normalizeLook(d, id) {
  const fb = lookFromSeed(String(id || 'x'));
  if (!d || typeof d !== 'object') return fb;
  const col = (v, f) => (Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(x)) ? v.map((x) => clamp(x, 0, 1)) : f);
  const kind = kindOf(d);
  const other = kind !== 'rabbit';
  return {
    coat: col(d.coat, fb.coat), coat2: col(d.coat2, fb.coat2),
    pattern: PATTERNS.includes(d.pattern) || (other && KIND_PATTERNS.includes(d.pattern)) ? d.pattern : fb.pattern,
    ear: EARS.includes(d.ear) || (other && KIND_EARS.includes(d.ear)) ? d.ear : fb.ear,
    size: clamp(fin(d.size, 1), 0.85, 1.15),
    eye: /** @type {any} */ (d.eye === 'ruby' ? 'ruby' : other && KIND_EYES.includes(d.eye) ? d.eye : 'dark'),
    tail: /** @type {0|1|2} */ ([0, 1, 2].includes(d.tail) ? d.tail : 1),
    seed: Number.isFinite(d.seed) && d.seed > 0 ? Math.floor(d.seed) : fb.seed,
    ...(other ? { kind } : {}),
  };
}

/** @param {any} m */
function normalizeMarks(m) {
  const out = emptyMarks();
  if (m && typeof m === 'object') for (const k of RABBIT_MARKS) out[k] = Math.max(0, fin(m[k], 0));
  return out;
}

/** Sanitise one rabbit (also accepts a legacy single-subject state). @param {any} r @param {string} [fallbackId] @returns {Rabbit} */
export function normalizeRabbit(r, fallbackId) {
  const d = r && typeof r === 'object' ? r : {};
  const id = typeof d.id === 'string' && d.id ? d.id : fallbackId || 'r1';
  const traits = [];
  for (const t of Array.isArray(d.traits) ? d.traits : []) {
    if (!TRAITS.includes(t) || traits.includes(t) || traits.some((x) => partners(x).includes(t))) continue;
    if (traits.length < 5) traits.push(t);
  }
  const scar = clamp(fin(d.scar, 0), 0, 80);
  const alive = d.alive !== false;
  const rb = /** @type {Rabbit} */ ({
    id, name: typeof d.name === 'string' && d.name ? d.name : 'Clover', sex: d.sex === 'm' ? 'm' : 'f',
    born: fin(d.born, FOUNDER_BORN), look: normalizeLook(d.look, id), parents: Array.isArray(d.parents) ? d.parents.filter((p) => typeof p === 'string').slice(0, 2) : null,
    health: clamp(fin(d.health, 100), 0, 100 + MAX_BONUS), bonus: clamp(fin(d.bonus, 0), 0, MAX_BONUS), alive, trials: Math.max(0, fin(d.trials, 0) | 0),
    marks: normalizeMarks(d.marks), exposure: normalizeMarks(d.exposure), scar, traits,
    degen: alive && Array.isArray(d.degen) ? [...new Set(d.degen.filter((k) => MARK_INDEX[k] !== undefined))] : [], cd: Math.max(0, fin(d.cd, 0)), mc: Math.max(0, fin(d.mc, 0)),
    doses: (Array.isArray(d.doses) ? d.doses : []).filter((x) => x && typeof x.rec === 'string').map((x) => ({
      rec: x.rec, day: fin(x.day, 0) | 0, ml: Math.max(0, fin(x.ml, 0)), src: x.src === 'vial' ? 'vial' : 'cauldron', obs: typeof x.obs === 'string' ? x.obs : '', ...(x.died ? { died: 1 } : {}),
    })).slice(-DOSE_LIMIT),
    dosesDropped: Math.max(0, fin(d.dosesDropped, 0) | 0),
    pregnant: alive && d.pregnant && typeof d.pregnant.sire === 'string' && Number.isFinite(d.pregnant.due) ? { sire: d.pregnant.sire, due: d.pregnant.due } : null,
    diedDay: alive ? null : Number.isFinite(d.diedDay) ? d.diedDay : null,
    cause: alive ? null : typeof d.cause === 'string' && d.cause ? d.cause : 'unknown',
  });
  return rb;
}

/** Old single-subject marks → colony channels. */
const LEGACY_MARKS = { glow: 'arcana', burn: 'fire', frost: 'frost', love: 'love', change: 'transformation', sick: 'toxicity', etch: 'acid' };

/**
 * Bring any stored colony into shape. With no valid colony but an old
 * single Moon Rabbit (saves before version 4, the sandbox), that rabbit
 * becomes the founder Clover — health, marks, life or death and its trial
 * history kept — joined by Bramble. Idempotent.
 * @param {any} c stored colony @param {any} [legacy] old trials.subjects.rabbit @param {any[]} [records] trial records (rabbit ones gain their rabbit)
 * @returns {Colony}
 */
export function normalizeColony(c, legacy, records = []) {
  if (c && typeof c === 'object' && Array.isArray(c.rabbits)) {
    const seen = new Set();
    const rabbits = [];
    for (const r of c.rabbits) {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || seen.has(r.id)) continue;
      seen.add(r.id);
      rabbits.push(normalizeRabbit(r));
    }
    const memorial = trimMemorial((Array.isArray(c.memorial) ? c.memorial : []).filter((m) => m && typeof m.id === 'string' && !seen.has(m.id)).map((m) => ({
      id: m.id, name: typeof m.name === 'string' ? m.name : 'Rabbit', sex: m.sex === 'm' ? 'm' : 'f', look: normalizeLook(m.look, m.id), born: fin(m.born, FOUNDER_BORN),
      diedDay: Number.isFinite(m.diedDay) ? m.diedDay : null, cause: typeof m.cause === 'string' ? m.cause : 'unknown',
      stage: ['kit', 'young', 'adult', 'elder'].includes(m.stage) ? m.stage : 'adult', traits: (Array.isArray(m.traits) ? m.traits : []).filter((t) => TRAITS.includes(t)).slice(0, 5),
      exposure: normalizeMarks(m.exposure), how: m.how === 'buried' ? 'buried' : 'processed', parts: (Array.isArray(m.parts) ? m.parts : []).filter((p) => typeof p === 'string'),
      parents: Array.isArray(m.parents) ? m.parents.filter((p) => typeof p === 'string').slice(0, 2) : null,
    })));
    const nums = [...rabbits, ...memorial].map((r) => Number(String(r.id).replace(/^r/, ''))).filter(Number.isFinite);
    const out = /** @type {Colony} */ ({
      seed: typeof c.seed === 'string' ? c.seed : '', serial: Math.max(fin(c.serial, 0) | 0, ...nums, 0),
      focus: null, breed: c.breed !== false, fedDay: fin(c.fedDay, 0) | 0, day: fin(c.day, 0) | 0, rabbits, memorial,
      purges: Math.max(0, fin(c.purges, 2) | 0), still: Number.isFinite(c.still) && c.still > 0 ? c.still : null,
      ticks: Math.max(0, fin(c.ticks, 0) | 0), clock: Math.max(0, fin(c.clock, 0)),
    });
    out.focus = typeof c.focus === 'string' && findRabbit(out, c.focus) ? c.focus : (focusRabbit(out) || { id: null }).id;
    return out;
  }
  const col = createColony();
  if (legacy && typeof legacy === 'object') {
    const f = col.rabbits[0];
    const h = Number(legacy.health);
    f.health = Number.isFinite(h) ? clamp(h, 0, 100) : 100;
    f.alive = legacy.alive !== false;
    f.trials = Math.max(0, fin(legacy.trials, 0) | 0);
    const lm = legacy.marks && typeof legacy.marks === 'object' ? legacy.marks : {};
    for (const [old, k] of Object.entries(LEGACY_MARKS)) f.marks[k] = clamp(Math.max(f.marks[k], fin(lm[old], 0)), 0, 100);
    const vig = clamp(fin(lm.vigor, 0), 0, 100);
    f.marks.strength = Math.max(f.marks.strength, vig);
    f.marks.vitality = Math.max(f.marks.vitality, 0.5 * vig);
    // the old rabbit's trial history becomes Clover's
    const mine = (records || []).filter((r) => r && r.subjectId === 'rabbit' && !r.rabbitId).slice().reverse();
    for (const r of mine) {
      r.rabbitId = f.id;
      r.rabbitName = f.name;
      const k = Math.min(2.5, (Number(r.ml) || 0) / 10);
      for (const [key, v] of Object.entries(r.values || {})) {
        const ch = key === 'acidity' ? (v >= 0 ? 'acid' : 'alkali') : key;
        if (MARK_INDEX[ch] !== undefined) f.exposure[ch] = round1(f.exposure[ch] + Math.abs(Number(v) || 0) * k);
      }
      recordDose(f, { rec: r.id, day: fin(r.day, 0) | 0, ml: fin(r.ml, 0), src: r.source === 'vial' ? 'vial' : 'cauldron',
        obs: (r.observations || []).filter((x) => x && x.key).map((x) => x.key + (x.tone === 'good' ? '+' : x.tone === 'bad' ? '-' : '')).join(','), ...(r.died ? { died: 1 } : {}) });
    }
    for (const k of RABBIT_MARKS) f.exposure[k] = Math.max(f.exposure[k], f.marks[k]);
    growTraits(f, 0, f.exposure.transformation, {});
    if (!f.alive) { f.health = 0; f.cause = 'unknown'; f.diedDay = null; }
    col.focus = f.alive ? f.id : 'r2';
  }
  return col;
}

/**
 * `trials.subjects.rabbit` stays a handle on the selected rabbit, so code
 * written for the single Moon Rabbit keeps working. It is not enumerable:
 * saves never store the rabbit twice.
 * @param {{subjects:Record<string, any>, colony:Colony}} trials
 */
export function installRabbitAlias(trials) {
  Object.defineProperty(trials.subjects, 'rabbit', {
    enumerable: false,
    configurable: true,
    get() {
      return focusRabbit(trials.colony) || { id: '', name: '', health: 0, alive: false, trials: 0, marks: emptyMarks() };
    },
    set(v) {
      const f = focusRabbit(trials.colony);
      if (!f || !v || typeof v !== 'object') return;
      if (v.id === f.id) { Object.assign(f, normalizeRabbit(v, f.id)); return; }
      if (Number.isFinite(Number(v.health))) f.health = clamp(Number(v.health), 0, 100);
      if (typeof v.alive === 'boolean') f.alive = v.alive;
      if (Number.isFinite(v.trials)) f.trials = v.trials;
      if (v.marks && typeof v.marks === 'object') {
        for (const [k, x] of Object.entries(v.marks)) {
          const ch = LEGACY_MARKS[k] || (MARK_INDEX[k] !== undefined ? k : k === 'vigor' ? 'strength' : null);
          if (ch && Number.isFinite(x)) f.marks[ch] = clamp(x, 0, 100);
        }
      }
      if (!f.alive) { f.pregnant = null; f.cause = f.cause || 'unknown'; if (f.diedDay === undefined) f.diedDay = null; }
    },
  });
  return trials;
}
