// Persistent game state and the rules that change it: economy, inventory,
// days and customers, progression, discoveries, recipes and achievements.
// Pure data + logic (no DOM), so it is fully testable headlessly.

import { Rng, hashString } from '../core/rng.js';
import { generateWorld, makeLookup, addAlchemy, LAB_ROLES } from '../materials/generator.js';
import { serializeMaterial, deserializeMaterial } from '../materials/schema.js';
import { generateCommission, tutorialCommission } from './commissions.js';
import { EQUIPMENT, STARTING_EQUIPMENT, RANKS, rankIndex, capabilities, equipmentById, RETIRED_EQUIPMENT } from './equipment.js';
import { SIM } from '../simulation/constants.js';
import { createTrials, normalizeTrials, runTrial, SUBJECT_BY_ID, knownLaws, certification, summarize } from './experiments.js';
import { createGathering, normalizeGathering, generateDeposits, harvest, gatherPlan, weatherOn, weatherRegrowth, newDayRegrowth, depositStatus, migrateGathering, setSky, water } from './gathering.js';
import { predictPlan } from './predict.js';
import { EFFECT_INDEX, EFFECT_KEYS } from '../alchemy/effects.js';
import { migrateVial } from './vial.js';
import { recordSale, resolveFollowUp, applyTrials, evidenceOf } from './commerce.js';
import { colonyDay, colonyTick, livingRabbits, livingOf, findRabbit, addBoughtRabbit, addWildRabbit, penHasRoom, PEN_MAX, retireRabbit, remainsSource, purgeRabbit, cullRabbit, maxHealthOf, FOUNDER_BORN } from './colony.js';
import { kindOf } from './kinds.js';
import { remainsMaterials, remainsPlan, isRemains } from '../materials/remains.js';
import { returningPatron, welcomePatron, recentStyles, notePatron, patronVerdict, noveltyFactor } from './patrons.js';
import { techniqueById, migrateTechniques } from './commissions.js';
import { migrateRecipe } from './recipes.js';
import { archiveLegacyMaterials } from './legacy-materials.js';
import { BIOMES, biomeUnlocked, refreshBiomeUnlocks } from './biomes.js';
import { normalizeTraveller, settleTraveller, spendTraveller, awardTravellerGift, makeBiomeInstance, seedDrop } from './travel.js';
import { normalizeGarden, settleGarden, plantSeed as gardenPlant, waterPlot, harvestGarden, FACILITIES, GARDEN } from './garden.js';

export const SAVE_VERSION = 8;
/** A purging draught at the apothecary, and brewed in the still. */
export const PURGE_PRICE = 8;
export const PURGE_BREW_COST = 1;
export const PURGE_BREW_TIME = 40;
export const WORLD_GEN_VERSION = 2;

/** What a new shop's shelves hold (ml): a healer's and a hedge-witch's basics. */
export const STARTER_HERBS = { silverleaf: 200, sunthistle: 150, heartpetal: 150, ironroot: 150, emberbark: 100, frostcap: 100, riverchalk: 100, nettle: 100 };
/** old aspect requirement keys → effect keys (v2 saves) */
const ASPECT_KEY_MAP = { vitality: 'vitality', ardor: 'fire', arcana: 'arcana', fortitude: 'strength' };

export const MARKET_EVENTS = [
  { key: 'none', name: 'An ordinary day', text: 'Business as usual in the market square.' },
  { key: 'winter', name: 'Bitter Frost', text: 'A cold snap grips the valley — warming draughts pay extra.' },
  { key: 'plague', name: 'Coughing Sickness', text: 'Healers buy restoratives and salves at a premium.' },
  { key: 'conclave', name: 'Mages’ Conclave', text: 'Wizards fill the inns, hungry for arcane brews.' },
  { key: 'festival', name: 'Harvest Festival', text: 'Revellers want colourful tonics and fizzing brews.' },
  { key: 'caravan', name: 'Spice Caravan', text: 'A caravan floods the market — reagents are cheaper today.' },
  { key: 'shortage', name: 'Road Bandits', text: 'Supply wagons were raided — reagents cost more today.' },
];

export const ACHIEVEMENTS = [
  { id: 'first_sale', name: 'Open for Business', desc: 'Sell your first potion.', reward: 10 },
  { id: 'perfect', name: 'Flawless', desc: 'Brew a perfect five-star potion.', reward: 25 },
  { id: 'perfect5', name: 'Master of Precision', desc: 'Brew five perfect potions.', reward: 80 },
  { id: 'dough', name: 'Kneaded It', desc: 'Knead a dough from powder and liquid.', reward: 10 },
  { id: 'frozen', name: 'Cold Hands', desc: 'Freeze a liquid solid.', reward: 15 },
  { id: 'crush', name: 'Grind Stone', desc: 'Crush a solid into grains with the pestle.', reward: 10 },
  { id: 'boil', name: 'Rolling Boil', desc: 'Boil a liquid into vapour.', reward: 10 },
  { id: 'condense', name: 'What Goes Up', desc: 'Condense vapour back into liquid.', reward: 15 },
  { id: 'fire', name: 'Singed Eyebrows', desc: 'Set something alight in the cauldron.', reward: 10 },
  { id: 'react1', name: 'Transmutation', desc: 'Discover your first reaction.', reward: 15 },
  { id: 'react5', name: 'Natural Philosopher', desc: 'Discover five reactions.', reward: 60 },
  { id: 'react10', name: 'Chymist Supreme', desc: 'Discover ten reactions.', reward: 150 },
  { id: 'served10', name: 'Regulars', desc: 'Serve ten customers.', reward: 30 },
  { id: 'served50', name: 'Talk of the Town', desc: 'Serve fifty customers.', reward: 120 },
  { id: 'rich', name: 'Gold in the Coffers', desc: 'Hold 1000 coins at once.', reward: 50 },
  { id: 'journeyman', name: 'Journeyman', desc: 'Reach the rank of Journeyman.', reward: 20 },
  { id: 'adept', name: 'Adept', desc: 'Reach the rank of Adept.', reward: 40 },
  { id: 'expert', name: 'Expert', desc: 'Reach the rank of Expert.', reward: 80 },
  { id: 'master', name: 'Master Alchemist', desc: 'Reach the rank of Master.', reward: 150 },
  { id: 'grand', name: 'Grand Alchemist', desc: 'Complete the Grand Commission.', reward: 500 },
  { id: 'recipe', name: 'Written Down', desc: 'Save a recipe to your book.', reward: 10 },
  { id: 'layers', name: 'Oil and Water', desc: 'Observe immiscible liquids separating into layers.', reward: 10 },
  { id: 'trial1', name: 'First Trial', desc: 'Test a potion on a subject.', reward: 10 },
  { id: 'trial25', name: 'Empiricist', desc: 'Run 25 trials.', reward: 60 },
  { id: 'law1', name: 'Hidden Harmony', desc: 'Discover a resonance law through repeated trials.', reward: 40 },
  { id: 'law4', name: 'Natural Philosopher of Magic', desc: 'Discover four resonance laws.', reward: 150 },
  { id: 'forage1', name: 'Into the Wilds', desc: 'Gather your first wild ingredient.', reward: 10 },
  { id: 'forage1k', name: 'Seasoned Forager', desc: 'Gather 1000 ml of wild ingredients.', reward: 50 },
  { id: 'certified', name: 'Proven Remedy', desc: 'Serve a potion whose effects you verified by experiment.', reward: 15 },
  { id: 'steep', name: 'Patience of the Steep', desc: 'Steep a herb into a liquid extract with heat.', reward: 15 },
  { id: 'awaken', name: 'Awakening', desc: 'Awaken a magical ingredient past its arcane threshold.', reward: 20 },
  { id: 'deal', name: 'Silver Tongue', desc: 'Sell a potion for more than the customer first offered.', reward: 15 },
  { id: 'dispute', name: 'The Records Speak', desc: 'Win a dispute with trial records of the batch.', reward: 30 },
  { id: 'referral', name: 'Word of Mouth', desc: 'Serve a customer sent by a satisfied one.', reward: 25 },
  { id: 'kit1', name: 'New Arrivals', desc: 'Kits are born in your hutch.', reward: 15 },
  { id: 'colony8', name: 'Thriving Warren', desc: 'Keep eight living rabbits.', reward: 40 },
  { id: 'survivor', name: 'Iron Constitution', desc: 'A rabbit survives ten trials.', reward: 30 },
  { id: 'remains1', name: 'Nothing Wasted', desc: 'Recover the remains of a rabbit as ingredients.', reward: 15 },
];

/**
 * @typedef {Object} JournalEntry
 * @property {string} key
 * @property {string} title
 * @property {string} text
 * @property {string} kind    ingredient | phase | reaction | mixing | fire | tool
 * @property {number} [day]
 * @property {string} [material]
 */

export class GameState {
  /** @param {any} data */
  constructor(data) {
    /** @type {number} */ this.version = data.version;
    /** @type {number} */ this.genVersion = data.genVersion;
    /** @type {string} */ this.seed = data.seed;
    /** @type {import('../materials/generator.js').World} */ this.world = data.world;
    /** @type {number} */ this.coins = data.coins;
    /** @type {number} */ this.reputation = data.reputation;
    /** @type {number} */ this.day = data.day;
    /** @type {number} */ this.customerIndex = data.customerIndex;
    /** @type {number} */ this.customersPerDay = data.customersPerDay;
    /** @type {number} */ this.servedToday = data.servedToday;
    /** @type {number} */ this.dayEarnings = data.dayEarnings;
    /** @type {number} */ this.daySpending = data.daySpending;
    /** @type {Record<string, number>} */ this.inventory = data.inventory;
    /** @type {string[]} */ this.equipment = data.equipment;
    /** @type {Record<string, JournalEntry>} */ this.journal = data.journal;
    /** @type {Record<string, any>} */ this.knowledge = data.knowledge;
    /** @type {any[]} */ this.recipes = data.recipes;
    /** @type {any[]} */ this.history = data.history;
    /** @type {Record<string, number>} */ this.achievements = data.achievements;
    /** @type {any} */ this.current = data.current;
    /** @type {{served:number, perfect:number, earned:number, spent:number, brews:number, declined:number, bestQuality:number, gathered?:number, trials?:number, refunds?:number, disputesWon?:number, bred?:number, recovered?:number, culled?:number, hunted?:number, caught?:number}} */
    /** wild ingredients gathered at least once (material id → 1): only these are listed in the Wilds; saves from before it keep what they already hold @type {Record<string, number>} */
    this.found = data.found || Object.fromEntries(Object.entries(data.inventory || {}).filter(([id, n]) => id.startsWith('wild-') && Number(n) > 0).map(([id]) => [id, 1]));
    this.stats = { served: 0, perfect: 0, earned: 0, spent: 0, brews: 0, declined: 0, bestQuality: 0, ...(data.stats || {}) };
    /** @type {{active:boolean, step:number, done:boolean, tips?:Record<string, boolean>}} */ this.tutorial = { active: false, step: 0, done: true, ...(data.tutorial || {}) };
    /** @type {{event:string, mods:Record<string, number>}} */ this.market = data.market || { event: 'none', mods: {} };
    /** @type {any} */ this.cauldron = data.cauldron || null;
    /** @type {any[]} */ this.brewLog = data.brewLog || [];
    /** @type {number} */ this.reliefDay = data.reliefDay || 0;
    /** @type {boolean} */ this.grandDone = !!data.grandDone;
    /** @type {number} */ this.createdAt = data.createdAt || Date.now();
    /** @type {ReturnType<typeof createTrials>} */ this.trials = normalizeTrials(data.trials);
    /** @type {ReturnType<typeof createGathering>} */ this.gathering = normalizeGathering(data.gathering);
    /** the sealed vial (game/vial.js): exact bottled particles, or null */
    this.vial = migrateVial(data.vial);
    /** sealed bottles kept on the potion shelves (vials, each with its exact particles) */
    /** @type {import('./vial.js').Vial[]} */
    this.bottles = Array.isArray(data.bottles) ? data.bottles.map(migrateVial).filter(Boolean) : [];
    /** sales ledger (commerce.js): price, label, the true potion and the evidence */
    /** @type {any[]} */ this.sales = Array.isArray(data.sales) ? data.sales : [];
    /** customers coming back after drinking (praise, complaints) */
    /** @type {any[]} */ this.followUps = Array.isArray(data.followUps) ? data.followUps : [];
    /** friends sent by satisfied customers, still to arrive */
    /** @type {number} */ this.referrals = data.referrals | 0;
    /** the shop door has been opened today (dawn ends; gathering.js dayPart) */
    /** @type {boolean} */ this.opened = data.opened !== undefined ? !!data.opened : (data.customerIndex | 0) > 0 || !!data.current;
    /** customers who have been here before: what they bought and how it went (customers.js) */
    /** @type {Record<string, any>} */ this.patrons = data.patrons && typeof data.patrons === 'object' ? data.patrons : {};
    /** identity of the brew in the cauldron: a new id when it is emptied, rev++ on every addition; `carried` what a poured-back bottle brought (resumeBatch) */
    /** @type {{id:string, rev:number, carried?:{samples:Record<string, any[]>, ref?:number[], label?:any}}} */
    this.batch = data.batch && typeof data.batch.id === 'string' ? { id: data.batch.id, rev: data.batch.rev | 0, ...(data.batch.carried && typeof data.batch.carried === 'object' ? { carried: data.batch.carried } : {}) } : newBatch();
    this.lookup = makeLookup(this.world);
    /** @type {string[]} */ this.unlockedBiomes = Array.isArray(data.unlockedBiomes) ? data.unlockedBiomes.filter((id) => BIOMES.some((b) => b.id === id)) : ['forest'];
    this.traveller = normalizeTraveller(data.traveller);
    this.garden = normalizeGarden(data.garden, this.lookup);
    settleTraveller(this.traveller); settleGarden(this.garden);
    /** @type {import('./gathering.js').Deposit[]|null} */
    this._deposits = null;
    // plants that drink: an older save's plants keep their growth, and grow under today's weather
    migrateGathering(this.gathering, this.deposits);
    setSky(this.gathering, this.deposits, weatherOn(this.seed, this.day).id);
    const col = this.trials.colony;
    if (!col.seed) col.seed = String(this.seed);
    if (!col.day) {
      // a hutch just made (a new game, or an older save's rabbit turned
      // founder): its founders are young adults on today's date
      for (const r of col.rabbits) if (r.born === FOUNDER_BORN && !r.parents) r.born = this.day - 1 + FOUNDER_BORN;
      col.day = this.day;
    }
  }

  /**
   * Fresh game for a seed.
   * @param {string} seed
   * @param {{tutorial?: boolean}} [opts]
   */
  static create(seed, opts = {}) {
    const world = generateWorld(seed);
    const inventory = {};
    for (const id of world.starting) inventory[id] = 0;
    const R = world.roles;
    inventory[R.water] = Infinity;
    inventory[R.oil] = 200;
    inventory[R.spirit] = 200;
    for (const id of world.wild || []) inventory[id] = 0;
    // a first satchel of common herbs and minerals; everything else is gathered
    for (const [key, ml] of Object.entries(STARTER_HERBS)) if (world.wild.includes('wild-' + key)) inventory['wild-' + key] = ml;
    const st = new GameState({
      version: SAVE_VERSION,
      genVersion: WORLD_GEN_VERSION,
      seed,
      world,
      coins: 60,
      reputation: 0,
      day: 1,
      customerIndex: 0,
      customersPerDay: 3,
      servedToday: 0,
      dayEarnings: 0,
      daySpending: 0,
      inventory,
      equipment: STARTING_EQUIPMENT.slice(),
      journal: /** @type {Record<string, JournalEntry>} */ ({}),
      knowledge: /** @type {Record<string, any>} */ ({}),
      recipes: [],
      history: [],
      achievements: {},
      current: null,
      found: {},
      stats: { served: 0, perfect: 0, earned: 0, spent: 0, brews: 0, declined: 0, bestQuality: 0 },
      tutorial: { active: opts.tutorial !== false, step: 0, done: opts.tutorial === false },
      market: { event: 'none', mods: {} },
      cauldron: null,
      brewLog: [],
      reliefDay: 0,
      grandDone: false,
      createdAt: Date.now(),
    });
    st.rollMarket();
    return st;
  }

  // ------------------------------------------------------------ derived
  get rank() {
    return rankIndex(this.reputation);
  }
  get rankName() {
    return RANKS[this.rank].name;
  }
  nextRank() {
    return RANKS[this.rank + 1] || null;
  }
  get cap() {
    return capabilities(this.equipment);
  }
  has(id) {
    return this.equipment.includes(id);
  }

  /** Ingredients the player may buy now (unlocked by rank). */
  purchasable() {
    return this.world.ingredients.filter((id) => { const m = this.lookup(id); return m && !m.legacy && !isRemains(m) && (!m.wild || (!m.arcaneVariant && biomeUnlocked(this, m.wild.region))) && !(m.wild && m.wild.gatherOnly) && !m.product && (m.tier || 0) <= this.rank; });
  }

  /** Ingredient ids that are buyable or in stock. */
  availableSet() {
    const s = new Set(this.purchasable());
    for (const [id, v] of Object.entries(this.inventory)) if (v > 0) s.add(id);
    return s;
  }

  // ------------------------------------------------------------ the wilds
  /** Deposits of this world (deterministic from the seed). */
  get deposits() {
    refreshBiomeUnlocks(this);
    for (const b of BIOMES) if (biomeUnlocked(this, b.id) && !this.gathering.instances[b.id]) {
      this.gathering.instances[b.id] = makeBiomeInstance(this.world, this.lookup, b.id, 0, this.rank); this._deposits = null;
    }
    if (!this._deposits) this._deposits = generateDeposits(this.world, this.lookup, this.gathering.instances);
    return this._deposits;
  }

  /**
   * Whether an ingredient is known: everything the market deals in is, but
   * a wild ingredient is unknown in every world until it is first gathered
   * (or is already in the stores, as the first satchel of herbs is).
   * @param {string} id
   */
  knows(id) {
    const m = this.lookup(id);
    if (!m || !m.wild) return true;
    return !!this.found[id] || this.stock(id) > 0;
  }

  /** Wild ingredient ids with a deposit the player can reach. */
  gatherableSet() {
    const s = new Set();
    for (const d of this.deposits) if (d.rank <= this.rank) s.add(d.materialId);
    return s;
  }

  /**
   * Harvest a mature plant of a deposit (the one given, else the oldest)
   * into the inventory. The yield follows the method and tool, the hour, the
   * weather and the care taken (gathering.js). `free`: the Free
   * Experiment's harvest, which takes the plant (its stand grows back) but
   * stores, records and earns nothing.
   * @param {string} depositId @param {{now?:number, unlimited?:boolean, free?:boolean, thorough?:boolean, plant?:string}} [opts]
   */
  gather(depositId, opts = {}) {
    const d = this.deposits.find((x) => x.id === depositId);
    if (!d) return { ok: false, amount: 0, reason: 'unknown' };
    if (!opts.free && !opts.unlimited && !biomeUnlocked(this, d.region)) return { ok: false, amount: 0, reason: 'locked' };
    const m = this.lookup(d.materialId);
    const { take } = opts.free ? d : gatherPlan(this, d, m, { thorough: opts.thorough });
    const r = harvest(this, { ...d, take }, opts);
    if (r.ok && !opts.unlimited && !opts.free) {
      const introductory = !this.garden.unlocked;
      this.garden.unlocked = true;
      const dropped = seedDrop(this.seed, r.plant, m);
      if (dropped) this.garden.seeds[m.id] = Math.min(999, (this.garden.seeds[m.id] || 0) + 1);
      // A compatible common starter opens cultivation without converting a
      // player's first rare/Arcane find into a guaranteed rare seed drop.
      if (introductory && !(this.garden.seeds['wild-silverleaf'] > 0)) this.garden.seeds['wild-silverleaf'] = 1;
      /** @type {any} */ (r).seed = dropped || (introductory && m.id === 'wild-silverleaf');
      this.found[d.materialId] = 1;
      this.stats.gathered = (this.stats.gathered || 0) + r.amount;
      /** @type {any} */ (r).events = [...this.unlock('forage1')];
      if (this.stats.gathered >= 1000) /** @type {any} */ (r).events.push(...this.unlock('forage1k'));
    }
    return r;
  }

  biomeUnlocked(id) { return biomeUnlocked(this, id); }
  sceneSeed(id) { return this.gathering.instances[id]?.seed || `${this.seed}:biome-v1:${id}:0`; }
  regenerateBiome(id, now = Date.now(), free = false) {
    if (!biomeUnlocked(this, id)) return { ok: false, reason: 'This biome is locked.' };
    if (!free && !spendTraveller(this.traveller, now)) return { ok: false, reason: 'No Traveller Coins. One recharges every 25 minutes.' };
    const revision = (this.gathering.instances[id]?.revision || 0) + 1;
    this.gathering.instances[id] = makeBiomeInstance(this.world, this.lookup, id, revision, this.rank);
    for (const key of Object.keys(this.gathering.nodes)) if (key.startsWith(id + ':')) delete this.gathering.nodes[key];
    this._deposits = null;
    return { ok: true, seed: this.sceneSeed(id), revision };
  }
  plantSeed(plotId, materialId, now = Date.now()) { return gardenPlant(this, plotId, materialId, now); }
  waterPlot(plotId, now = Date.now()) { return waterPlot(this, plotId, now); }
  harvestGarden(plotId, now = Date.now()) { return harvestGarden(this, plotId, now); }
  upgradeGarden(plotId, facility) {
    const plot = this.garden.plots.find((p) => p.id === plotId), rule = FACILITIES[facility];
    if (!this.garden.unlocked || !plot || plot.crop || !rule || facility === plot.facility || this.rank < rule.rank || this.coins < rule.price) return { ok: false, reason: 'An empty plot, the required rank and enough coins are needed.' };
    this.coins -= rule.price; plot.facility = facility; return { ok: true };
  }
  expandGarden() {
    const cost = 60 + this.garden.plots.length * 10;
    if (!this.garden.unlocked || this.garden.plots.length >= Math.min(GARDEN.maxPlots, 3 + this.rank * 3) || this.coins < cost) return { ok: false, reason: 'Gain a guild rank or more coins to expand the garden.' };
    this.coins -= cost;
    this.garden.plots.push({ id: 'plot-' + this.garden.plots.length, facility: 'soil', crop: null });
    return { ok: true };
  }

  /**
   * Water living plants of a deposit (the ones given, else every growing
   * one): the moisture of their soil rises and they grow faster for hours.
   * Returns how many drank.
   * @param {string} depositId @param {string[]|null} [plants] @param {number} [now]
   */
  water(depositId, plants = null, now = Date.now()) {
    const d = this.deposits.find((x) => x.id === depositId);
    return d ? water(this.gathering, d, plants, now) : 0;
  }

  // ------------------------------------------------------------ trials
  /** A new batch identity (the cauldron was emptied). */
  newBatch() {
    this.batch = newBatch();
    return this.batch;
  }

  /** Something was added to the brew: earlier trials no longer describe it. */
  touchBatch() {
    this.batch.rev++;
    delete this.batch.carried;
  }

  /**
   * A sealed bottle poured back where nothing changes it — into an empty
   * cauldron, or into the unchanged batch it was drawn from — is still that
   * batch: the cauldron takes its identity, its readings (even those the
   * trial log has forgotten), what it measured then (to notice drift) and
   * its label, so bottling it again bottles the same tested potion.
   * @param {any} v the vial poured back
   */
  resumeBatch(v) {
    const same = this.batch.id === v.batchId && this.batch.rev === v.rev;
    const prev = /** @type {any} */ ((same && this.batch.carried) || {});
    /** @type {Record<string, any[]>} */
    const samples = JSON.parse(JSON.stringify(prev.samples || {}));
    for (const [k, list] of Object.entries(v.samples || {})) for (const x of list) if (!(samples[k] ||= []).some((y) => y.rec === x.rec)) samples[k].push(x);
    const label = v.label || prev.label;
    this.batch = { id: v.batchId, rev: v.rev, carried: {
      samples,
      ref: v.m && v.m.effects ? Array.from(v.m.effects) : prev.ref,
      ...(label ? { label: JSON.parse(JSON.stringify(label)) } : {}),
    } };
    return this.batch;
  }

  /** Resonance laws the player has confirmed by experiment. */
  get knownLaws() {
    return knownLaws(this.trials, this.world.laws || []);
  }

  /**
   * Record a trial (the caller has already removed the dose from the
   * cauldron or the vial). Returns the record plus any events.
   * @param {string} subjectId @param {any} dose @param {any} ctx
   */
  recordTrial(subjectId, dose, ctx) {
    const rec = runTrial(this.trials, subjectId, dose, { ...ctx, day: this.day, laws: this.world.laws || [] });
    this.stats.trials = (this.stats.trials || 0) + 1;
    /** @type {any[]} */
    const events = [...this.unlock('trial1')];
    if (this.stats.trials >= 25) events.push(...this.unlock('trial25'));
    for (const id of rec.lawsFound) {
      const L = (this.world.laws || []).find((l) => l.id === id);
      if (!L) continue;
      const entry = this.discover({ key: 'law:' + id, title: L.name, text: L.lore, kind: 'law' });
      if (entry) events.push({ type: 'law', id, name: L.name, lore: L.lore });
      events.push(...this.unlock('law1'));
      if (this.knownLaws.length >= 4) events.push(...this.unlock('law4'));
    }
    if (rec.rabbitId) {
      const r = findRabbit(this.trials.colony, rec.rabbitId);
      if (r && !r.alive) events.push({ type: 'rabbit-died', id: r.id, name: r.name, cause: r.cause });
      if (r && r.alive && r.trials >= 10) events.push(...this.unlock('survivor'));
    }
    return { record: rec, events };
  }

  // ------------------------------------------------------------ the rabbit colony
  get colony() {
    return this.trials.colony;
  }

  /** What a new rabbit costs (half with the kennel). */
  rabbitPrice() {
    return Math.ceil(SUBJECT_BY_ID.rabbit.cost * (this.has('kennel') ? 0.5 : 1));
  }

  /**
   * Buy an adult rabbit from the breeder (selected at once). The hutch must
   * have room.
   * @param {boolean} [free]
   */
  buyRabbit(free = false) {
    const c = this.colony;
    const cap = this.cap.hutch;
    if (livingOf(c, 'rabbit') >= cap) return { ok: false, reason: `The hutch is full (${cap} places for rabbits). More places are sold in the Shop.` };
    if (!penHasRoom(c, 'rabbit')) return { ok: false, reason: `The rabbits' enclosure is full (${PEN_MAX} animals, living and dead): recover the remains of a body to make room.` };
    const cost = free ? 0 : this.rabbitPrice();
    if (cost > this.coins + 1e-9) return { ok: false, reason: `A new rabbit costs ${cost} coins.` };
    this.coins = round1(this.coins - cost);
    this.stats.spent += cost;
    this.daySpending += cost;
    const rabbit = addBoughtRabbit(c, { day: this.day });
    c.focus = rabbit.id;
    return { ok: true, cost, rabbit };
  }

  /**
   * A wild animal brought home from the wilds: caught alive, or its body,
   * which is kept for its remains. All it needs is room in its own
   * enclosure (PEN_MAX, living and dead together): the Shop's places are
   * for animals bought and bred.
   * @param {{look:any, sex:'f'|'m', dead?:boolean, health?:number}} o
   */
  bringWildRabbit(o) {
    const c = this.colony;
    if (!penHasRoom(c, kindOf(o.look))) return { ok: false, full: 'pen', reason: `Its enclosure is full (${PEN_MAX} animals, living and dead): recover the remains of a body to make room.` };
    const rabbit = addWildRabbit(c, { day: this.day, look: o.look, sex: o.sex, dead: !!o.dead, health: o.health });
    if (o.dead) this.stats.hunted = (this.stats.hunted || 0) + 1;
    else this.stats.caught = (this.stats.caught || 0) + 1;
    return { ok: true, rabbit };
  }

  /** Choose the rabbit the next dose goes to. @param {string} id */
  selectRabbit(id) {
    if (!findRabbit(this.colony, id)) return false;
    this.colony.focus = id;
    return true;
  }

  /** The cost of a day's hay and greens for the hutch. */
  feedCost() {
    return livingRabbits(this.colony).length ? 1 : 0;
  }

  /**
   * Feed the hutch for today: everyone perks up, poison eases, and tonight
   * they recover faster and pair up more readily.
   */
  feedRabbits() {
    const c = this.colony;
    const live = livingRabbits(c);
    if (!live.length) return { ok: false, reason: 'There is nobody to feed.' };
    if (c.fedDay === this.day) return { ok: false, reason: 'They have eaten today.' };
    const cost = this.feedCost();
    if (cost > this.coins + 1e-9) return { ok: false, reason: `Hay and greens cost ${cost} coin.` };
    this.coins = round1(this.coins - cost);
    this.stats.spent += cost;
    this.daySpending += cost;
    c.fedDay = this.day;
    for (const r of live) {
      r.health = round1(Math.min(maxHealthOf(r, this.day), r.health + 6));
      r.marks.toxicity = Math.max(0, round1(r.marks.toxicity - 5));
    }
    return { ok: true, cost };
  }

  /** Let healthy pairs breed overnight, or not. @param {boolean} on */
  setBreeding(on) {
    this.colony.breed = !!on;
  }

  /**
   * Make a material known to this world (remains): in the material list and
   * on the shelf, once.
   * @param {any} def
   */
  registerMaterial(def) {
    if (!this.world.materials.some((m) => m.id === def.id)) this.world.materials.push(def);
    if (!this.world.ingredients.includes(def.id)) this.world.ingredients.push(def.id);
    return this.lookup(def.id);
  }

  /**
   * Recover a dead rabbit's remains — once. Its bones, pelt or ash and any
   * residue become ingredients whose effects come from its life; the body
   * goes to the memorial.
   * @param {string} id
   */
  processRemains(id) {
    const c = this.colony;
    const r = findRabbit(c, id);
    if (!r) return { ok: false, reason: 'There is no such body in the hutch.' };
    if (r.alive) return { ok: false, reason: `${r.name} is alive.` };
    const src = remainsSource(r, this.day);
    const defs = remainsMaterials(src, this.world);
    const plan = remainsPlan(src);
    const parts = [];
    for (const d of defs) {
      this.registerMaterial(d);
      const ml = (plan.find((p) => p.part === d.remains.part) || { ml: 0 }).ml;
      const have = this.inventory[d.id] || 0;
      this.inventory[d.id] = Math.min(this.cap.storage, have + ml);
      parts.push({ id: d.id, name: d.name, ml });
    }
    retireRabbit(c, id, 'processed', defs.map((d) => d.id), this.day);
    this.stats.recovered = (this.stats.recovered || 0) + 1;
    /** @type {any[]} */
    const events = [];
    const entry = this.discover({ key: 'remains:' + id, title: `The remains of ${r.name}`, text: `You recovered ${parts.map((p) => p.name.split('’s ')[1] || p.name).join(', ')} from ${r.name}. What ${r.sex === 'f' ? 'she' : 'he'} absorbed in life may linger in them — only trials will tell.`, kind: 'colony' });
    if (entry) events.push({ type: 'journal', entry });
    events.push(...this.unlock('remains1'));
    return { ok: true, parts, events };
  }

  /** Bury a body (nothing is recovered). @param {string} id */
  buryRabbit(id) {
    const r = findRabbit(this.colony, id);
    if (!r || r.alive) return { ok: false, reason: r ? `${r.name} is alive.` : 'There is no such body.' };
    retireRabbit(this.colony, id, 'buried', [], this.day);
    return { ok: true };
  }

  /**
   * Re-register the remains materials of processed rabbits that this world
   * does not hold (the sandbox's world is not saved), with no stock.
   */
  restoreRemains() {
    for (const m of this.colony.memorial) {
      if (m.how !== 'processed' || !m.parts.length) continue;
      if (m.parts.every((id) => this.world.materials.some((x) => x.id === id))) continue;
      for (const d of remainsMaterials(remainsSource(/** @type {any} */ (m), this.day), this.world)) this.registerMaterial(d);
    }
  }

  /** A new rabbit when the chosen one is dead (or, with a full hutch, the next living one). @param {string} id */
  replaceSubject(id, free = false) {
    if (id !== 'rabbit') return { ok: false, reason: 'Only rabbits are tested now.' };
    const r = this.buyRabbit(free);
    if (r.ok) return r;
    const alive = livingRabbits(this.colony)[0];
    if (alive && (livingOf(this.colony, 'rabbit') >= this.cap.hutch || !penHasRoom(this.colony, 'rabbit'))) { this.colony.focus = alive.id; return { ok: true, cost: 0, reselected: true }; }
    return r;
  }

  /** Subjects the player can use: the rabbits. */
  subjectAvailable(id) {
    return id === 'rabbit';
  }

  // ------------------------------------------------------------ purging draughts, culling, the hutch in real time
  /** A purging draught at the apothecary. */
  purgePrice() {
    return PURGE_PRICE;
  }

  /** @param {boolean} [free] */
  buyPurge(free = false) {
    const cost = free ? 0 : this.purgePrice();
    if (cost > this.coins + 1e-9) return { ok: false, reason: `A purging draught costs ${cost} coins.` };
    this.coins = round1(this.coins - cost);
    this.stats.spent += cost;
    this.daySpending += cost;
    this.colony.purges = (this.colony.purges || 0) + 1;
    return { ok: true, cost };
  }

  /** Start brewing a purging draught in the still (needs the Purging Still). @param {boolean} [free] */
  brewPurge(free = false) {
    if (!free && !this.has('still')) return { ok: false, reason: 'Buy the Purging Still in the Shop to brew your own.' };
    if (this.colony.still) return { ok: false, reason: 'The still is already working.' };
    const cost = free ? 0 : PURGE_BREW_COST;
    if (cost > this.coins + 1e-9) return { ok: false, reason: `The salts cost ${cost} coin.` };
    this.coins = round1(this.coins - cost);
    this.stats.spent += cost;
    this.daySpending += cost;
    this.colony.still = PURGE_BREW_TIME;
    return { ok: true, cost };
  }

  /** Give a rabbit a purging draught. @param {string} id @param {boolean} [free] */
  purgeRabbit(id, free = false) {
    const r = findRabbit(this.colony, id);
    if (!r || !r.alive) return { ok: false, reason: 'Choose a living rabbit.' };
    if (!free && !(this.colony.purges > 0)) return { ok: false, reason: 'You have no purging draught: buy one, or brew it in the still.' };
    if (!free) this.colony.purges--;
    purgeRabbit(r);
    return { ok: true, rabbit: r };
  }

  /** Put a rabbit down (the body stays). @param {string} id */
  cullRabbit(id) {
    const r = findRabbit(this.colony, id);
    if (!r || !r.alive) return { ok: false, reason: 'Choose a living rabbit.' };
    cullRabbit(r, this.day);
    this.stats.culled = (this.stats.culled || 0) + 1;
    return { ok: true, rabbit: r };
  }

  /**
   * Let the hutch live for `dt` seconds of real time (the still brews too).
   * @param {number} dt
   */
  tickColony(dt) {
    const c = this.colony;
    /** @type {any[]} */
    const events = [];
    if (c.still) {
      c.still = round1(c.still - dt);
      if (c.still <= 0) { c.still = null; c.purges = (c.purges || 0) + 1; events.push({ type: 'purge-brewed' }); }
    }
    const rep = colonyTick(c, dt, { day: this.day, seed: this.seed, cap: this.cap.hutch });
    for (const d of rep.died) events.push({ type: 'rabbit-died', ...d });
    for (const a of rep.attacks) events.push({ type: 'attack', ...a });
    for (const m of rep.mates) events.push({ type: 'mate', ...m });
    for (const t of rep.traits) events.push({ type: 'trait', ...t });
    return { rep, events };
  }

  /** Price per 100 ml today. @param {string} id */
  priceOf(id) {
    const m = this.lookup(id);
    if (!m) return 0;
    if (id === this.world.roles.water) return 0;
    const mod = this.market.mods[id] ?? 1;
    const ev = this.market.event === 'caravan' ? 0.8 : this.market.event === 'shortage' ? 1.3 : 1;
    return Math.max(1, Math.round(m.price * mod * ev * (1 - this.cap.discount) * 10) / 10);
  }

  stock(id) {
    return this.inventory[id] ?? 0;
  }

  /**
   * May this ingredient be bought at the market now? The same rules as the
   * market panel: only ingredients the market stocks (solvents, and the
   * herbalist's common wild ones from their rank on), never gather-only
   * finds, rabbit remains, reaction products or the retired prepared reagents.
   * @param {string} id
   * @returns {{ok:boolean, reason?:string}}
   */
  canBuy(id) {
    const m = this.lookup(id);
    if (!m) return { ok: false, reason: 'Unknown ingredient.' };
    if (id === this.world.roles.water) return { ok: false, reason: 'Well water is free.' };
    if (isRemains(m)) return { ok: false, reason: 'Remains are never sold.' };
    if (m.legacy) return { ok: false, reason: 'Legacy finds can be used from your stores, but are no longer traded.' };
    if (m.wild && (m.arcaneVariant || !biomeUnlocked(this, m.wild.region))) return { ok: false, reason: m.arcaneVariant ? 'Arcane ingredients must be discovered in the wilds or cultivated.' : 'Discover this biome before trading its ingredients.' };
    if (m.wild && m.wild.gatherOnly) return { ok: false, reason: `${m.name} is only found in the wilds.` };
    if (!this.world.ingredients.includes(id) || m.product) return { ok: false, reason: 'The market does not sell that.' };
    if ((m.tier || 0) > this.rank) return { ok: false, reason: `The herbalist sells ${m.name} from the rank of ${(RANKS[m.tier] || RANKS[RANKS.length - 1]).name}.` };
    return { ok: true };
  }

  /** @param {string} id @param {number} ml */
  buy(id, ml) {
    const legal = this.canBuy(id);
    if (!legal.ok) return { ok: false, reason: legal.reason };
    const room = this.cap.storage - this.stock(id);
    const amount = Math.min(ml, room);
    if (amount <= 0) return { ok: false, reason: 'Your shelves are full for that reagent.' };
    const cost = Math.round((amount / 100) * this.priceOf(id) * 10) / 10;
    if (cost > this.coins + 1e-9) return { ok: false, reason: 'Not enough coins.' };
    this.coins = round1(this.coins - cost);
    this.inventory[id] = this.stock(id) + amount;
    this.stats.spent += cost;
    this.daySpending += cost;
    return { ok: true, amount, cost };
  }

  /** Sell surplus back to the merchant at 40%. */
  sellBack(id, ml) {
    const amount = Math.min(ml, this.stock(id));
    if (amount <= 0 || !isFinite(this.stock(id))) return { ok: false };
    const value = Math.round((amount / 100) * this.priceOf(id) * 0.4 * 10) / 10;
    this.inventory[id] -= amount;
    this.coins = round1(this.coins + value);
    return { ok: true, value };
  }

  /** Remove ingredients when poured. Returns false if not enough. */
  consume(id, ml) {
    const s = this.stock(id);
    if (!isFinite(s)) return true;
    if (s + 1e-6 < ml) return false;
    this.inventory[id] = round1(s - ml);
    return true;
  }

  buyEquipment(id) {
    const e = equipmentById(id);
    if (!e) return { ok: false, reason: 'Unknown item.' };
    if (this.has(id)) return { ok: false, reason: 'Already owned.' };
    if (e.rank > this.rank) return { ok: false, reason: `Requires the rank of ${RANKS[e.rank].name}.` };
    if (e.requires && !e.requires.every((r) => this.has(r))) return { ok: false, reason: 'Requires the previous upgrade.' };
    if (this.coins < e.price) return { ok: false, reason: 'Not enough coins.' };
    this.coins = round1(this.coins - e.price);
    this.equipment.push(id);
    this.stats.spent += e.price;
    this.daySpending += e.price;
    return { ok: true, item: e };
  }

  /**
   * The shop no longer stocks prepared reagents (essences, salts, crystals…):
   * whatever an older save still held of them, the guild buys back at the
   * usual 40 %. Returns the coins paid.
   */
  buyBackPrepared() {
    let paid = 0;
    for (const role of LAB_ROLES) {
      const id = this.world.roles[role];
      const ml = id ? this.inventory[id] : 0;
      if (!id || !(ml > 0) || !isFinite(ml)) continue;
      const m = this.lookup(id);
      paid += (ml / 100) * ((m && m.price) || 0) * 0.4;
      this.inventory[id] = 0;
    }
    paid = round1(paid);
    if (paid > 0) {
      this.coins = round1(this.coins + paid);
      // a note in the journal (not a discovery: it earns no reputation)
      this.journal['note:buyback'] = { key: 'note:buyback', kind: 'note', title: 'The guild bought back your reagents', day: this.day,
        text: `The market no longer sells prepared reagents: every effect must now come from what you gather. The guild paid ${paid} coins for the essences, salts and crystals left on your shelves.` };
    }
    return paid;
  }

  // ------------------------------------------------------------ potion shelves
  /** Free places on the potion shelves. */
  get bottleRoom() {
    return Math.max(0, this.cap.bottles - this.bottles.length);
  }

  /**
   * Put a sealed bottle on the potion shelves (the counter's vial when none
   * is given). Fails when the shelves are full.
   * @param {import('./vial.js').Vial} [v]
   */
  shelveBottle(v) {
    const fromCounter = !v;
    const b = v || this.vial;
    if (!b) return { ok: false, reason: 'There is no bottle to put away.' };
    if (this.bottleRoom <= 0) return { ok: false, reason: `The potion shelves are full (${this.cap.bottles} bottles). Sell, pour back or discard one, or buy more shelving.` };
    this.bottles.push(b);
    if (fromCounter) this.vial = null;
    return { ok: true, bottle: b };
  }

  /**
   * Take a bottle down to the counter. A bottle already on the counter goes
   * up in its place.
   * @param {string} id
   */
  takeBottle(id) {
    const k = this.bottles.findIndex((b) => b.id === id);
    if (k < 0) return { ok: false, reason: 'No such bottle.' };
    const b = this.bottles[k];
    if (this.vial) this.bottles[k] = this.vial;
    else this.bottles.splice(k, 1);
    this.vial = b;
    return { ok: true, bottle: b };
  }

  /**
   * Bottles of one batch share its evidence: every trial of that batch and
   * revision — from the cauldron, the counter's vial or any shelved bottle —
   * counts for each of them, checked against each bottle's own contents (a
   * bottle drawn from a different layer reads stale instead). Readings a
   * bottle already held stay, even once the trial log has forgotten them.
   * @param {string} [batchId] only bottles of this batch
   */
  shareEvidence(batchId) {
    const known = new Set(this.trials.records.map((r) => r.id));
    for (const v of [this.vial, ...this.bottles]) {
      if (!v || !v.batchId || (batchId && v.batchId !== batchId) || !v.m) continue;
      const cert = certification(this.trials, { id: v.batchId, rev: v.rev }, v.m.effects);
      /** @type {Record<string, any[]>} */
      const merged = {};
      for (const [k, list] of Object.entries(v.samples || {})) merged[k] = list.filter((x) => !known.has(x.rec) || (cert.samples[k] || []).some((y) => y.rec === x.rec));
      for (const [k, list] of Object.entries(cert.samples)) for (const x of list) if (!(merged[k] ||= []).some((y) => y.rec === x.rec)) merged[k].push(x);
      for (const k of Object.keys(merged)) if (!merged[k].length) delete merged[k];
      const count = (o) => Object.values(o || {}).reduce((a, l) => a + l.length, 0);
      const sum = summarize(merged);
      const changed = JSON.stringify(sum.values) !== JSON.stringify(v.cert || {}) || count(merged) !== count(v.samples);
      v.samples = merged;
      v.cert = sum.values;
      v.certRecords = sum.records;
      if (changed && v.label) applyTrials(v.label, sum.values, Object.values(sum.records)[0] || '', evidenceOf(v));
    }
  }

  /** Remove a bottle from the shelves (it is poured away or back). @param {string} id */
  removeBottle(id) {
    const k = this.bottles.findIndex((b) => b.id === id);
    if (k < 0) return null;
    return this.bottles.splice(k, 1)[0];
  }

  // ------------------------------------------------------------ customers
  /**
   * How much of an ingredient the shop can lay hands on today without
   * buying it: the stock on the shelf plus what careful harvests of every
   * mature plant within reach would bring right now (method, tool, hour and weather
   * included). Purchases come on top (canBuy).
   * @param {string} id @param {number} [now]
   */
  supplyOf(id, now = Date.now()) {
    const stock = this.stock(id);
    if (!isFinite(stock)) return Infinity;
    let wild = 0;
    for (const d of this.deposits) {
      if (d.materialId !== id || d.rank > this.rank) continue;
      const plan = gatherPlan(this, d, this.lookup(id));
      // a careful harvest of every mature plant
      wild += depositStatus(this.gathering, d, now).mature * plan.take;
    }
    return stock + wild;
  }

  commissionContext() {
    const available = this.availableSet();
    for (const id of this.gatherableSet()) available.add(id);
    // orders are never planned around a rabbit's remains (their effects are unknown)
    for (const id of [...available]) if (isRemains(this.lookup(id))) available.delete(id);
    const now = Date.now();
    /** @type {Map<string, number>} */
    const supplies = new Map();
    return {
      world: this.world,
      lookup: this.lookup,
      available,
      cap: this.cap,
      rank: this.rank,
      priceOf: (id) => this.priceOf(id),
      event: this.market.event,
      coins: this.coins,
      // what the shop can gather or holds today, and what it may buy
      supply: (id) => { if (!supplies.has(id)) supplies.set(id, this.supplyOf(id, now)); return /** @type {number} */ (supplies.get(id)); },
      buyable: (id) => this.canBuy(id).ok,
      stock: (id) => this.stock(id),
    };
  }

  /** Bring in the next customer for today (or null if the day is over). */
  nextCustomer() {
    if (this.current) return this.current;
    if (this.customerIndex >= this.customersPerDay) return null;
    this.opened = true;
    // a customer the shop cannot serve with anything it can gather, hold or
    // buy today never comes in: the next one does (the day can never stall)
    for (let guard = 0; guard < 4 && this.customerIndex < this.customersPerDay; guard++) {
      const com = this._makeCustomer();
      if (com) { this.current = com; return com; }
      this.customerIndex++;
    }
    return null;
  }

  /** Generate the customer at the current index (null if nothing feasible could be asked). */
  _makeCustomer() {
    const rng = new Rng(hashString(`${this.seed}:${this.day}:${this.customerIndex}`));
    const ctx = this.commissionContext();
    let com;
    if (this.tutorial.active && !this.tutorial.done && this.stats.served === 0) {
      com = tutorialCommission(ctx, rng);
    } else if (this.rank >= 4 && !this.grandDone && this.customerIndex === 0 && this.day % 2 === 0) {
      com = this.grandCommission(rng);
    }
    if (!com) {
      const contract = this.has('charter') && this.rank >= 2 && this.customerIndex === this.customersPerDay - 1;
      // difficulty follows rank, with some easier and harder requests mixed in
      const tier = Math.max(0, Math.min(4, this.rank + (rng.chance(0.25) ? -1 : 0) + (rng.chance(0.15) ? 1 : 0)));
      const patron = returningPatron(this, rng);
      const opts = { tier: Math.min(tier, this.rank + 1), contract, patron, recent: recentStyles(this) };
      com = generateCommission(ctx, rng, opts);
      // fallback: the same customer with an easier need, then the plainest order of all
      for (let t = opts.tier - 1; !com && t >= 0; t--) com = generateCommission(ctx, rng, { ...opts, tier: t, contract: false });
      if (!com) com = generateCommission(ctx, rng, { tier: 0, simple: true });
      if (com && patron) welcomePatron(com, patron, this);
      if (com && this.referrals > 0) {
        // a friend of a satisfied customer: they come with a better budget
        this.referrals--;
        com.referral = true;
        com.budget = Math.round(com.budget * 1.3);
        com.dialogue = `A friend told me your potions really work. ${com.dialogue}`;
      }
    }
    return com || null;
  }

  grandCommission(rng) {
    const ctx = this.commissionContext();
    const com = generateCommission(ctx, rng, { tier: 4, request: rng.pick(['warpath', 'starseer']), contract: true, techniques: ['strong'] }) ||
      generateCommission(ctx, rng, { tier: 4, contract: true });
    if (com) {
      com.grand = true;
      com.customer.name = 'Queen Isolde’s Herald';
      com.dialogue = 'By royal decree: the Queen requires a masterwork. Brew it, and the guild shall name you Grand Alchemist.';
      com.budget = Math.round(com.budget * 2.5);
    }
    return com;
  }

  /** Customer leaves without buying. */
  declineCustomer() {
    if (!this.current) return;
    if (this.current.tutorial) return;
    this.current = null;
    this.customerIndex++;
    this.stats.declined++;
  }

  /**
   * Record a sale. Returns events (rank-ups, achievements).
   * @param {ReturnType<import('./evaluate.js').evaluatePotion>} ev
   * @param {any} measurement
   */
  completeSale(ev, measurement) {
    const com = this.current;
    if (!com) return [];
    return this._bookSale(com, ev, measurement, ev.payment, ev.repDelta);
  }

  /**
   * Shared bookkeeping of a sale: coins, history, statistics, achievements.
   * @param {any} com @param {any} ev true evaluation @param {any} measurement @param {number} paid @param {number} rep reputation now
   */
  _bookSale(com, ev, measurement, paid, rep, saleId = null) {
    /** @type {any[]} */
    const events = [];
    this.coins = round1(this.coins + paid);
    events.push(...this.adjustReputation(rep));
    this.stats.served++;
    this.stats.earned += paid;
    this.dayEarnings += paid;
    this.servedToday++;
    // a labelled sale's true quality is only known once the customer reports back
    this.history.unshift({
      day: this.day, customer: com.customer.name, title: com.customer.title, potion: com.potionName, quality: saleId ? null : ev.quality, stars: saleId ? null : ev.stars,
      paid, color: measurement?.color, ml: measurement?.ml, ...(saleId ? { saleId } : {}),
    });
    if (this.history.length > 60) this.history.length = 60;
    if (com.tutorial) { this.tutorial.done = true; this.tutorial.active = false; }
    if (!saleId) events.push(...this._verdict(ev.quality, ev.perfect, !!com.grand));
    this.current = null;
    this.customerIndex++;
    events.push(...this.unlock('first_sale'));
    if (this.stats.served >= 10) events.push(...this.unlock('served10'));
    if (this.stats.served >= 50) events.push(...this.unlock('served50'));
    if (this.coins >= 1000) events.push(...this.unlock('rich'));
    return events;
  }

  /**
   * A deal struck at the counter: the agreed price is paid now, and the
   * customer's verdict on the real potion arrives the next day.
   * @param {any} vial @param {any} label @param {number} price @param {any} truth measurement of the bottled potion
   * @param {number} [firstOffer] what the customer opened with
   */
  /**
   * What a potion's true quality earns, once it is known: best quality,
   * perfect potions and the grand commission.
   * @param {number} quality @param {boolean} perfect @param {boolean} grand
   */
  _verdict(quality, perfect, grand) {
    /** @type {any[]} */
    const events = [];
    this.stats.bestQuality = Math.max(this.stats.bestQuality, quality);
    if (perfect) { this.stats.perfect++; events.push(...this.unlock('perfect')); }
    if (this.stats.perfect >= 5) events.push(...this.unlock('perfect5'));
    if (grand && quality >= 0.85) { this.grandDone = true; events.push(...this.unlock('grand')); }
    return events;
  }

  completeDeal(vial, label, price, truth, firstOffer = 0) {
    const com = this.current;
    if (!com) return { events: [], sale: null, follow: null, ev: null };
    const { sale, follow, ev } = recordSale(this, com, vial, label, price, truth);
    sale.perfect = ev.perfect;
    sale.stars = ev.stars;
    sale.grand = !!com.grand;
    sale.style = com.style || null;
    sale.techniques = com.techniques || [];
    // orders well below the shop's rank (and the same one over and over) teach the guild little
    const novelty = noveltyFactor(sale.style, recentStyles(this), com.tier || 0, this.rank);
    if (sale.repDelta > 0 && novelty < 1) { sale.repDelta = Math.round(sale.repDelta * novelty); sale.novelty = novelty; }
    notePatron(this, com);
    const events = this._bookSale(com, ev, truth, price, 1, sale.id);
    this.sales.unshift(sale);
    if (this.sales.length > 80) this.sales.length = 80;
    this.followUps.push(follow);
    if (price > firstOffer + 0.5 && firstOffer > 0) events.push(...this.unlock('deal'));
    if (com.referral) events.push(...this.unlock('referral'));
    return { events, sale, follow, ev };
  }

  /** Follow-up visits waiting at the counter today. */
  dueFollowUps() {
    return this.followUps.filter((f) => !f.resolved && f.day <= this.day && f.kind !== 'quiet');
  }

  /**
   * Settle a follow-up visit (thank, refund, dispute or dismiss).
   * @param {string} id @param {'thank'|'refund'|'dispute'|'dismiss'} action
   */
  settleFollowUp(id, action) {
    const f = this.followUps.find((x) => x.id === id);
    if (!f || f.resolved) return null;
    // a refund is paid in full or not at all
    if (action === 'refund' && f.kind === 'complaint' && this.coins + 1e-9 < (f.demand || 0)) return { refused: true, coins: 0, rep: 0, text: `You do not have ${f.demand} coins to refund.`, events: [] };
    const r = resolveFollowUp(this, f, action);
    f.resolved = true;
    f.action = action;
    f.outcome = r;
    this.coins = round1(this.coins + r.coins);
    if (r.coins < 0) { this.stats.refunds = (this.stats.refunds || 0) + 1; this.daySpending -= r.coins; }
    else this.dayEarnings += r.coins;
    if (f.kind === 'praise' && f.referral) this.referrals++;
    const events = this.adjustReputation(r.rep);
    if (action === 'dispute' && r.rep > 0) { this.stats.disputesWon = (this.stats.disputesWon || 0) + 1; events.push(...this.unlock('dispute')); }
    const sale = this.sales.find((s) => s.id === f.saleId);
    if (sale) {
      sale.outcome = { kind: f.kind, action, ...r };
      // the verdict is in: the sale's true quality joins the history
      const hist = this.history.find((x) => x.saleId === sale.id);
      if (hist && hist.quality === null) { hist.quality = sale.quality; hist.stars = sale.stars ?? null; }
      events.push(...this._verdict(sale.quality, !!sale.perfect, !!sale.grand));
      if (f.kind === 'praise' && sale.quality >= 0.85 && awardTravellerGift(this.traveller, this.seed, sale.id)) {
        r.text += ' They also give you a Traveller Coin.';
        events.push({ type: 'traveller-gift' });
      }
      // a technique that worked for a paying customer is mastered: the guild takes note
      if (sale.quality >= 0.85) for (const t of sale.techniques || []) {
        const T = techniqueById(t);
        if (!T) continue;
        const entry = this.discover({ key: 'technique:' + t, title: `Technique: ${T.name}`, text: T.lesson, kind: 'technique' });
        if (entry) { events.push({ type: 'technique', id: t, name: T.name, text: T.lesson }); events.push(...this.adjustReputation(4)); }
      }
    }
    patronVerdict(this, f, action);
    return { ...r, events };
  }

  /**
   * Change reputation; returns rank-up events (and their achievements).
   * @param {number} delta
   */
  adjustReputation(delta) {
    const oldRank = this.rank;
    // a bad name is not forgotten at zero: lies cost even an apprentice
    this.reputation = Math.max(-100, this.reputation + delta);
    /** @type {any[]} */
    const events = [];
    const nr = this.rank;
    if (nr > oldRank) {
      events.push({ type: 'rank', rank: nr, name: RANKS[nr].name });
      const ach = ['', 'journeyman', 'adept', 'expert', 'master'][nr];
      if (ach) events.push(...this.unlock(ach));
      this.customersPerDay = 3 + Math.floor(nr / 2);
    }
    return events;
  }

  get dayOver() {
    return !this.current && this.customerIndex >= this.customersPerDay;
  }

  /** Advance to the next day. Returns a summary of the finished day. */
  endDay() {
    // quiet customers simply carry on; visitors left waiting a whole day go away unhappy
    const settled = [];
    for (const f of this.followUps) {
      if (f.resolved || f.day > this.day) continue;
      if (f.kind === 'quiet') { this.settleFollowUp(f.id, 'thank'); continue; }
      if (f.day < this.day) settled.push({ f, r: this.settleFollowUp(f.id, f.kind === 'praise' ? 'thank' : 'dismiss') });
    }
    this.followUps = this.followUps.filter((f) => !f.resolved || f.day >= this.day - 6);
    const summary = { day: this.day, earned: this.dayEarnings, spent: this.daySpending, served: this.servedToday, settled: settled.length };
    // tonight's weather is the weather of the day now ending (as forecast)
    weatherRegrowth(this.gathering, this.deposits, weatherOn(this.seed, this.day), this.lookup);
    this.day++;
    this.customerIndex = 0;
    this.servedToday = 0;
    this.dayEarnings = 0;
    this.daySpending = 0;
    this.current = null;
    this.opened = false;
    this.customersPerDay = 3 + Math.floor(this.rank / 2);
    this.rollMarket();
    newDayRegrowth(this.gathering, this.deposits);
    setSky(this.gathering, this.deposits, weatherOn(this.seed, this.day).id);
    // a night in the hutch: marks fade, the sick get worse or better, kits are born
    const colony = colonyDay(this.colony, { seed: this.seed, day: this.day, cap: this.cap.hutch });
    /** @type {any[]} */
    const events = [];
    this.stats.bred = (this.stats.bred || 0) + colony.born.length;
    if (colony.born.length) events.push(...this.unlock('kit1'));
    if (livingRabbits(this.colony).length >= 8) events.push(...this.unlock('colony8'));
    return { ...summary, colony: { ...colony, events } };
  }

  rollMarket() {
    const rng = new Rng(hashString(`${this.seed}:market:${this.day}`));
    const ev = this.day <= 2 ? MARKET_EVENTS[0] : rng.weighted(MARKET_EVENTS, [5, 1, 1, 1, 1, 1, 1]);
    /** @type {Record<string, number>} */
    const mods = {};
    for (const id of this.world.ingredients) mods[id] = Math.round(rng.range(0.88, 1.12) * 100) / 100;
    this.market = { event: ev.key, mods };
  }

  get marketEvent() {
    return MARKET_EVENTS.find((e) => e.key === this.market.event) || MARKET_EVENTS[0];
  }

  /**
   * Safety net: an apprentice who cannot afford anything gets a small guild
   * stipend once per day, so a run can never become unwinnable.
   */
  claimRelief() {
    if (this.reliefDay === this.day) return 0;
    const cheapest = Math.min(...this.purchasable().filter((id) => id !== this.world.roles.water).map((id) => this.priceOf(id)));
    if (this.coins >= cheapest * 2) return 0;
    this.reliefDay = this.day;
    const grant = 25;
    this.coins = round1(this.coins + grant);
    return grant;
  }

  // ------------------------------------------------------------ journal / knowledge
  /**
   * Add a journal entry if new. Returns the entry or null.
   * @param {JournalEntry} e
   */
  discover(e) {
    if (this.journal[e.key]) return null;
    const entry = { ...e, day: this.day };
    this.journal[e.key] = entry;
    this.reputation += 1;
    return entry;
  }

  /** Show a one-time explanation? (true the first time only) @param {string} key */
  firstTip(key) {
    const t = (this.tutorial.tips ||= {});
    if (t[key]) return false;
    t[key] = true;
    return true;
  }

  /** @param {string} id @param {string} fact @param {any} value */
  learn(id, fact, value) {
    const k = (this.knowledge[id] ||= {});
    if (k[fact] !== undefined) return false;
    k[fact] = value;
    return true;
  }

  reactionsDiscovered() {
    return Object.values(this.journal).filter((e) => e.kind === 'reaction').length;
  }

  /** @param {string} id */
  unlock(id) {
    if (this.achievements[id]) return [];
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return [];
    this.achievements[id] = Date.now();
    this.coins = round1(this.coins + a.reward);
    return [{ type: 'achievement', id, name: a.name, desc: a.desc, reward: a.reward }];
  }

  // ------------------------------------------------------------ recipes
  /** @param {any} recipe */
  addRecipe(recipe) {
    this.recipes.unshift({ ...recipe, id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36) });
    return this.unlock('recipe');
  }

  // ------------------------------------------------------------ persistence
  toJSON() {
    return {
      version: SAVE_VERSION,
      genVersion: this.genVersion,
      seed: this.seed,
      world: {
        seed: this.world.seed,
        catalogVersion: this.world.catalogVersion,
        materials: this.world.materials.map(serializeMaterial),
        ingredients: this.world.ingredients,
        starting: this.world.starting,
        reactions: this.world.reactions,
        roles: this.world.roles,
        laws: this.world.laws,
        wild: this.world.wild,
      },
      coins: this.coins,
      reputation: this.reputation,
      day: this.day,
      customerIndex: this.customerIndex,
      customersPerDay: this.customersPerDay,
      servedToday: this.servedToday,
      dayEarnings: this.dayEarnings,
      daySpending: this.daySpending,
      inventory: Object.fromEntries(Object.entries(this.inventory).map(([k, v]) => [k, isFinite(v) ? v : 'inf'])),
      equipment: this.equipment,
      journal: this.journal,
      knowledge: this.knowledge,
      recipes: this.recipes,
      history: this.history,
      achievements: this.achievements,
      current: this.current,
      found: this.found,
      stats: this.stats,
      tutorial: this.tutorial,
      market: this.market,
      cauldron: this.cauldron,
      brewLog: this.brewLog,
      reliefDay: this.reliefDay,
      grandDone: this.grandDone,
      createdAt: this.createdAt,
      trials: this.trials,
      gathering: this.gathering,
      unlockedBiomes: this.unlockedBiomes,
      traveller: this.traveller,
      garden: this.garden,
      vial: this.vial,
      bottles: this.bottles,
      batch: this.batch,
      sales: this.sales,
      followUps: this.followUps,
      referrals: this.referrals,
      opened: this.opened,
      patrons: this.patrons,
      savedAt: Date.now(),
    };
  }

  /** @param {any} raw */
  static fromJSON(raw) {
    const data = migrate(raw);
    const world = {
      ...data.world,
      materials: data.world.materials.map(deserializeMaterial),
    };
    // effects, wild ingredients, their reactions and the resonance laws
    // (idempotent; upgrades a v2 world exactly to what its seed now yields)
    addAlchemy(world);
    const inventory = Object.fromEntries(Object.entries(data.inventory).map(([k, v]) => [k, v === 'inf' ? Infinity : Number(v)]));
    for (const id of world.wild || []) if (!(id in inventory)) inventory[id] = 0;
    for (const [k, v] of Object.entries(inventory)) if (!Number.isFinite(v) && v !== Infinity) inventory[k] = 0;
    const st = new GameState({ ...data, world, inventory });
    if (data._migratedFrom !== undefined && data._migratedFrom < 3) st.genVersion = WORLD_GEN_VERSION;
    st.buyBackPrepared();
    if (st.current) migrateCommission(st.current, st.world, st.lookup);
    // customers no longer ask for a serving temperature: an order taken before keeps the rest
    if (st.current) retireRequirements(st.current);
    return st;
  }
}

/** @returns {{id:string, rev:number}} */
function newBatch() {
  return { id: 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), rev: 0 };
}

/**
 * Bring an in-progress commission from a v2 save into the effect model:
 * aspect requirements (vitality, ardor, arcana, fortitude) become effect
 * requirements with their thresholds rescaled by the same factor the old
 * one had relative to its plan's predicted outcome, so the order stays as
 * demanding as it was — and now needs a trial, like every effect order.
 * @param {any} com @param {any} world @param {(id:string)=>any} lookup
 */
export function migrateCommission(com, world, lookup) {
  if (!com || !Array.isArray(com.requirements)) return com;
  const old = com.requirements.filter((r) => ASPECT_KEY_MAP[r.key] && r.effect === undefined && com.predicted && com.predicted.aspects);
  if (!old.length) return com;
  let pred = null;
  try { pred = com.reference ? predictPlan(world, lookup, com.reference) : null; } catch { pred = null; }
  const OLD = ['vitality', 'ardor', 'arcana', 'fortitude'];
  for (const r of old) {
    const key = ASPECT_KEY_MAP[r.key];
    const oldPred = com.predicted.aspects[OLD.indexOf(r.key)] || 0;
    const newPred = pred ? pred.effects[EFFECT_INDEX[key]] : oldPred;
    const ratio = oldPred > 0 ? Number(r.target) / oldPred : 0.65;
    const target = Math.max(3, Math.round(newPred * ratio));
    Object.assign(r, { key, target, zero: Math.max(8, target * 0.6), label: `at least ${target}`, effect: true });
  }
  if (pred) com.predicted.effects = pred.effects;
  com.effectOrder = true;
  return com;
}

/**
 * Upgrade older save formats in place.
 * @param {any} raw
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a save file');
  const d = { ...raw };
  if (!d.version) throw new Error('Missing save version');
  if (d.version > SAVE_VERSION) throw new Error('This save comes from a newer version of the game');
  d._migratedFrom = d.version;
  // the Wisp Lantern left with the wisp (rabbits are the only subjects): its owners get the Purging Still
  if (Array.isArray(d.equipment) && d.equipment.includes('lantern')) d.equipment = [...new Set(d.equipment.map((id) => (id === 'lantern' ? 'still' : id)))];
  if (d.version < 2) {
    // v1 had no market or grand-commission fields
    d.market = d.market || { event: 'none', mods: {} };
    d.grandDone = !!d.grandDone;
    d.reliefDay = d.reliefDay || 0;
    d.knowledge = d.knowledge || {};
    d.version = 2;
  }
  if (!d.world || !Array.isArray(d.world.materials)) {
    // a save without an embedded world: regenerate from the seed
    const w = generateWorld(d.seed);
    d.world = { ...w, materials: w.materials.map(serializeMaterial) };
  }
  for (const k of ['journal', 'achievements', 'stats', 'tutorial']) d[k] = d[k] || {};
  d.recipes = d.recipes || [];
  d.history = d.history || [];
  d.brewLog = d.brewLog || [];
  d.equipment = d.equipment && d.equipment.length ? d.equipment : STARTING_EQUIPMENT.slice();
  if (d.version < 3) {
    // v3: effects and experiments, the wilds, sealed vials, batch identity.
    // Everything the player had is kept; the new systems start fresh.
    d.trials = d.trials || null;
    d.gathering = d.gathering || null;
    d.vial = null;
    d.batch = null;
    d.version = 3;
  }
  if (d.version < 4) {
    // v4: the Moon Rabbit becomes the founder of a colony (normalizeTrials
    // converts the old single rabbit by its shape, as it does for the
    // sandbox). Fields that arrived during version 3 get their defaults.
    d.trials = d.trials || null;
    d.sales = Array.isArray(d.sales) ? d.sales : [];
    d.followUps = Array.isArray(d.followUps) ? d.followUps : [];
    d.referrals = d.referrals | 0;
    d.version = 4;
  }
  if (d.version < 5) {
    // v5: the shop door is the day's clock, customers remember the shop,
    // and recipes record their procedure (older ones are marked approximate)
    d.opened = (d.customerIndex | 0) > 0 || !!d.current;
    d.patrons = d.patrons && typeof d.patrons === 'object' ? d.patrons : {};
    d.recipes = (d.recipes || []).map(migrateRecipe);
    d.version = 5;
  }
  if (d.version < 6) {
    // v6: the gameplay refactor. Equipment without a campaign purpose is
    // retired (refunded, or replaced by the item that took over its job),
    // customers no longer ask for density, stability, volatility, viscosity,
    // charge or colour, recipes are matched on their procedure, and the
    // alembic's receiver is gone with the alembic.
    const refit = retireEquipment(d.equipment);
    d.equipment = refit.equipment;
    d.coins = round1((Number(d.coins) || 0) + refit.refund);
    if (refit.lines.length) {
      d.journal['note:refit'] = { key: 'note:refit', kind: 'note', title: 'The guild refitted your workshop', day: d.day | 0,
        text: `Some instruments and tools no longer serve the trade, and the guild has taken them back: ${refit.lines.join('; ')}. ${refit.refund > 0 ? `${refit.refund} coins were paid back in all.` : ''}`.trim() };
    }
    // (an order in progress is brought up to date in fromJSON, after its v2 aspects)
    d.recipes = (d.recipes || []).map(migrateRecipe);
    delete d.receiver;
    d.version = 6;
  }
  if (d.version < 7) {
    Object.assign(d, archiveLegacyMaterials(d));
    d.version = 7;
  }
  if (d.version < 8) {
    // Keep passage to the seven old environments for existing shops. A new
    // v8 shop starts in Whisperwood alone. Old deposit stocks stay saved;
    // all newly generated populations are finite Traveller generations.
    const rank = rankIndex(d.reputation || 0);
    d.unlockedBiomes ||= ['forest', 'meadow', 'river', 'quarry', ...(rank >= 1 ? ['netherwood'] : []), ...(rank >= 2 ? ['moonfen'] : []), ...(rank >= 3 ? ['crags'] : [])];
    d.version = 8;
  }
  // every shop owns the starting kit (the pestle joined it in v6)
  for (const id of STARTING_EQUIPMENT) if (!d.equipment.includes(id)) d.equipment = [...d.equipment, id];
  // the free starter mortar is retired: solids go in whole and the pestle crushes them
  d.equipment = d.equipment.filter((id) => id !== 'mortar');
  if (d.world && Array.isArray(d.world.materials) && d.world.materials.length === 0) throw new Error('The save has no reagents');
  if (!d.inventory || typeof d.inventory !== 'object') throw new Error('The save has no inventory');
  return d;
}

/**
 * Retire equipment the campaign no longer uses (equipment.js
 * RETIRED_EQUIPMENT). Owners get the item that took over its purpose, or
 * their coins back: the four gathering tools become the Forager's Kit (any
 * paid beyond the kit's price is refunded), the Aether Lens becomes the
 * Arcanometer (refunded if they already own one), the pestle — now part of
 * every starting kit — is refunded, everything else is refunded in full.
 * Pure; applied once, by the save migration.
 * @param {string[]} list
 * @returns {{equipment:string[], refund:number, lines:string[]}}
 */
export function retireEquipment(list) {
  const owned = [...new Set(list || [])];
  const out = owned.filter((id) => !RETIRED_EQUIPMENT[id] && id !== 'pestle');
  let refund = 0;
  const lines = [];
  /** @type {Record<string, number>} paid for items that now become another */
  const into = {};
  for (const id of owned) {
    const r = RETIRED_EQUIPMENT[id];
    if (!r) continue;
    if (r.into) { into[r.into] = (into[r.into] || 0) + r.price; continue; }
    refund += r.price;
    lines.push(`${r.name} (${r.price} coins: ${r.why})`);
  }
  for (const [target, paid] of Object.entries(into)) {
    const e = equipmentById(target);
    const names = owned.filter((id) => RETIRED_EQUIPMENT[id] && RETIRED_EQUIPMENT[id].into === target).map((id) => RETIRED_EQUIPMENT[id].name);
    if (!e) continue;
    if (out.includes(target)) {
      refund += paid;
      lines.push(`${names.join(', ')} (${paid} coins: you already own the ${e.name})`);
    } else {
      out.push(target);
      const back = Math.max(0, paid - e.price);
      refund += back;
      lines.push(`${names.join(', ')} → the ${e.name}${back ? ` and ${back} coins` : ''}`);
    }
  }
  if (owned.includes('pestle')) { refund += 35; lines.push('Granite Pestle (35 coins: every workshop now has one)'); }
  return { equipment: out, refund: round1(refund), lines };
}

/**
 * An order taken earlier keeps its customer, story and budget; the
 * requirements customers no longer make (old physical targets, the serving
 * temperature) are dropped — they only made it harder — and its techniques
 * are renamed to the current ones (retired ones dropped).
 * @param {any} com
 */
export function retireRequirements(com) {
  if (!com || !Array.isArray(com.requirements)) return com;
  const keep = (r) => r.key === 'purity' || EFFECT_KEYS.includes(r.key);
  com.requirements = com.requirements.filter(keep);
  com.techniques = migrateTechniques(com.techniques || []);
  if (typeof com.style === 'string') com.style = [com.style.split('+')[0], ...com.techniques.slice().sort()].join('+');
  com.effectOrder = com.requirements.some((r) => r.effect);
  return com;
}

/** @param {number} v */
function round1(v) {
  return Math.round(v * 10) / 10;
}

export { EQUIPMENT, SIM };
