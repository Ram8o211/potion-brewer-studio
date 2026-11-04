// The wilds: regions where raw ingredients grow, plant by plant.
//
// The layout (which ingredients grow in each region, how many plants of
// each the ground holds, how fast they grow) is generated from the world
// seed, so it never needs saving or migrating. Each ingredient has a stand
// of plants (crystals, stones, shells...) that come up as sprouts at random
// spots, ripen and mature; only a mature plant can be harvested. Harvesting
// one takes it whole, leaving nothing on the ground, and the stand sprouts
// again until it is back to its share of the region's saturation. Only each
// stand's plants (where and when each sprouted) are saved;
// what has grown since is resolved lazily from elapsed wall-clock time
// whenever a stand is shown or gathered — there are no timers and nothing
// runs per frame, so the wilds cost nothing while the player brews (and
// grow while the game is closed). A new shop day also brings every stand on.
//
// Living plants drink. Each keeps the moisture of the soil round it: the
// habitat's own wetness (a riverbank or a bog stays damp, a meadow dries out,
// the crags are parched), raised by rain and fog and lowered by a heatwave;
// watering lifts it, and it then dries back toward the habitat's level over
// hours (a wet habitat keeps it longer). How fast a plant grows follows how
// moist its soil is for its kind — slowly when dry, never stopping
// completely, up to half again its usual pace when well watered, and no
// faster however much it is watered. Growth and moisture are saved as a
// checkpoint and resolved in closed form, so resolving at any moments in
// any order gives the same plant. Stones, crystals, crusts and shells do not
// drink: they come back with time and the weather, as they always have.
//
// How much one harvest brings depends on what the player does and when:
//   • the method each ingredient needs (pick, dig, chip, scrape, sweep) and
//     whether the right tool is in the satchel — by hand, half as much;
//   • the part of the day: some plants open only at dawn (before the shop
//     opens) or at dusk (after the last customer); out of their hour only a
//     few sprigs are worth taking, so nothing is ever completely out of reach;
//   • the day's weather (from the world seed and the day number): rain makes
//     plants regrow overnight, frost closes the meadow flowers, a storm
//     recharges the crystal seams, fog keeps the twilight plants open;
//   • careful or thorough harvesting: thorough digs the whole plant out for
//     twice as much but scars the stand, which then sprouts at half pace
//     until it is saturated again.

import { Rng, hashString } from '../core/rng.js';
import { isBotanical, familyOf, habitatOf } from '../visual/taxonomy.js';
import { BIOMES } from './biomes.js';

/**
 * @typedef {Object} Region
 * @property {string} id
 * @property {string} name
 * @property {number} rank       guild rank needed to travel there
 * @property {boolean} magical
 * @property {string} desc
 * @property {number[]} sky      palette seeds for the scene renderer
 * @property {string} category
 * @property {string} dominant
 * @property {string} creature
 * @property {number} sales
 * @property {string} [interaction]
 */

/** @type {Region[]} */
export const REGIONS = BIOMES;
/** @type {Record<string, Region>} */
export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

/**
 * @typedef {Object} Deposit
 * @property {string} id
 * @property {string} region
 * @property {string} materialId
 * @property {number} x          0..1 where the stand was first found in the region scene
 * @property {number} y          0..1
 * @property {number} slots      plants the stand grows to (its share of the region's saturation)
 * @property {number} capacity   ml the stand holds when every plant is mature (slots × take)
 * @property {number} growMs     time a sprout takes to mature
 * @property {number} spawnMs    time between new sprouts while the stand is below its slots
 * @property {number} regrowMs   time to grow back from bare ground to every plant mature
 * @property {number} take       ml one mature plant gives (before the hour, weather and tools)
 * @property {number} rank       guild rank needed
 * @property {boolean} rare
 * @property {string} [place]    a name for the spot
 * @property {boolean} botanical a living plant that drinks (else a mineral or shell that comes back with time)
 * @property {number} thirst     how much moisture it needs to grow at full pace (0..1)
 * @property {boolean} [finite] a Traveller generation: no watering or regrowth
 * @property {string} [generationSeed] saved generation identity
 */

/**
 * @typedef {Object} Plant
 * @property {string} id
 * @property {number} x      0..1 where it sprouted in the region scene
 * @property {number} y      0..1
 * @property {number} born   wall-clock time it sprouted
 * @property {number} [g]    a living plant's growth (0..1) at its checkpoint `t`
 * @property {number} [t]    its checkpoint time
 * @property {number} [w]    the moisture of its soil (0..1) at `t`
 */

/** Names of spots within each region (so two deposits read apart). */
const PLACES = {
  forest: ['by the old oak', 'in the fern hollow', 'under the beeches', 'at the mossy stump', 'by the woodcutter’s path', 'in the deep shade', 'along the brook'],
  netherwood: ['under the hanging roots', 'by the giant toadstool', 'in the glowing hollow', 'at the black pool', 'on the root stair'],
  meadow: ['by the stile', 'on the sunny slope', 'near the beehives', 'along the hedgerow', 'in the long grass', 'by the well'],
  river: ['under the willow', 'on the chalk bank', 'by the ford', 'in the reeds', 'at the mill race', 'on the gravel bar'],
  quarry: ['on the east face', 'in the spoil heap', 'by the cart track', 'in the old cutting', 'under the crane', 'at the seam', 'by the powder store'],
  moonfen: ['on the barrow', 'by the will-o’-pool', 'in the drowned grove', 'on the stepping stones', 'by the sunken cross', 'in the reed beds'],
  crags: ['on the ash slope', 'by the steam vent', 'in the lava cave', 'on the black ridge'],
};

/** The growth stages a plant passes through; only a mature one can be harvested. */
export const STAGES = /** @type {const} */ (['sprout', 'ripe', 'mature']);
/** The share of its growing time a plant spends as a sprout. */
export const SPROUT_SHARE = 0.4;

/**
 * Deterministic deposits for a world: one stand of each wild ingredient in
 * its region. A stand grows up to `slots` plants; the slots of a region's
 * stands are its saturation.
 * @param {{seed:string, wild?:string[]}} world
 * @param {(id:string)=>any} lookup
 * @returns {Deposit[]}
 */
export function generateDeposits(world, lookup, instances = null) {
  const rng = new Rng('deposits:' + world.seed);
  /** @type {Deposit[]} */
  const out = [];
  for (const region of REGIONS) {
    const instance = instances?.[region.id];
    if (instances && !instance) continue;
    const mats = (instance ? instance.roster.map((r) => r.id) : (world.wild || [])).map(lookup).filter((m) => m && m.wild && m.wild.region === region.id);
    mats.forEach((m, k) => {
      const rare = !!m.wild.rare;
      // a crowded region grows fewer of each ingredient, so its ground does not overflow
      const slots = instance ? instance.roster.find((r) => r.id === m.id).count : rare ? 1 : Math.max(1, Math.min(3, Math.floor(18 / mats.length)));
      const take = rare ? rng.int(3, 4) * 10 : rng.int(5, 8) * 10;
      const growMs = Math.round((rare ? rng.range(18, 30) : rng.range(4, 8)) * 60000);
      const spawnMs = Math.round((rare ? rng.range(15, 25) : rng.range(3, 5)) * 60000);
      out.push({
        id: `${region.id}:${m.wild.key}:${instance?.revision || 0}`,
        place: (PLACES[region.id] || ['along the ancient path'])[k % (PLACES[region.id]?.length || 1)],
        region: region.id,
        materialId: m.id,
        x: Math.round(rng.range(0.1, 0.9) * 1000) / 1000,
        y: Math.round(rng.range(0.56, 0.88) * 1000) / 1000,
        slots,
        capacity: slots * take,
        growMs,
        spawnMs,
        regrowMs: spawnMs * (slots - 1) + growMs,
        take,
        rank: Math.max(region.rank, m.wild.rank || 0),
        rare,
        botanical: isBotanical(m.wild.shape),
        thirst: thirstOf(m.wild.shape, region.id),
        ...(instance ? { finite: true, generationSeed: instance.seed } : {}),
      });
    });
  }
  return out;
}

/** How much moisture a kind of plant needs to grow at full pace (0..1): mosses, reeds and fungi most, wood least; crag plants are hardy. */
export function thirstOf(shape, region) {
  const f = familyOf(shape);
  const base = f === 'moss' || f === 'reed' || f === 'fungus' ? 0.62 : f === 'bark' ? 0.36 : f === 'root' ? 0.42 : 0.48;
  return Math.round(Math.max(0.15, Math.min(0.8, base + (region === 'crags' ? -0.25 : region === 'river' || region === 'moonfen' || region === 'netherwood' ? 0.08 : 0))) * 100) / 100;
}

/**
 * @typedef {Object} Stand  a deposit's saved plants
 * @property {Plant[]} plants
 * @property {number|null} due   when the next sprout appears (null: the stand is saturated)
 * @property {number} seq        sprouts so far (names the next one and seeds where it grows)
 * @property {boolean} [scar]    dug out thoroughly: sprouts come at half pace until it is saturated again
 */

/** Fresh gathering state: every stand saturated, some of it already mature. */
export function createGathering(now = Date.now()) {
  return { v: GATHER_VERSION, nodes: /** @type {Record<string, Stand>} */ ({}), instances: /** @type {Record<string, any>} */ ({}), total: 0, trips: 0, created: now, sky: 'clear', watered: 0 };
}

/** Version of the gathering state: 2 adds the moisture and growth checkpoints of living plants. */
export const GATHER_VERSION = 3;

const finite = (/** @type {any} */ v) => typeof v === 'number' && Number.isFinite(v);

/** @param {any} g */
export function normalizeGathering(g, now = Date.now()) {
  const out = createGathering(now);
  if (!g || typeof g !== 'object') return out;
  if (g.instances && typeof g.instances === 'object') for (const [id, raw] of Object.entries(g.instances)) {
    const i = /** @type {any} */ (raw);
    if (REGION_BY_ID[id] && typeof i?.seed === 'string' && Number.isInteger(i.revision) && i.revision >= 0 && Array.isArray(i.roster)) out.instances[id] = { version: 1, seed: i.seed, revision: i.revision,
      roster: i.roster.filter((r) => r && typeof r.id === 'string' && Number.isInteger(r.count) && r.count > 0 && r.count <= 6), captured: Array.isArray(i.captured) ? i.captured.filter((x) => typeof x === 'string') : [],
      ...(i.wildlife?.version === 1 ? { wildlife: structuredClone(i.wildlife) } : {}) };
  }
  if (finite(g.created)) out.created = Math.min(g.created, now);
  if (g.nodes && typeof g.nodes === 'object') {
    for (const [id, v] of Object.entries(g.nodes)) {
      // a stand saved before plants grew one by one (stock in ml) starts afresh, saturated
      if (!v || typeof v !== 'object' || !Array.isArray(v.plants)) continue;
      const plants = v.plants.filter((p) => p && typeof p.id === 'string' && finite(p.x) && finite(p.y) && finite(p.born))
        .map((p) => ({ id: p.id, x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)), born: Math.min(p.born, now),
          ...(finite(p.g) && finite(p.t) ? { g: Math.min(1, Math.max(0, p.g)), t: Math.min(p.t, now), w: finite(p.w) ? Math.min(1, Math.max(0, p.w)) : 0.5 } : {}) }));
      out.nodes[id] = { plants, due: finite(v.due) ? v.due : null, seq: finite(v.seq) ? v.seq : plants.length, ...(v.scar ? { scar: true } : {}) };
    }
  }
  // (the marks harvests once left on the ground are dropped: a harvest leaves nothing behind)
  out.total = Number.isFinite(g.total) ? g.total : 0;
  out.trips = Number.isFinite(g.trips) ? g.trips : 0;
  out.watered = Number.isFinite(g.watered) ? g.watered : 0;
  // a save from before plants drank (v1) is brought up to date by migrateGathering, which knows the deposits
  out.v = Number.isFinite(g.v) ? g.v : 1;
  if (typeof g.sky === 'string') out.sky = g.sky;
  return out;
}

// ------------------------------------------------------------------ moisture and growth

/** A dry plant still grows at this share of its usual pace; a well-watered one at most at GROW_MAX. */
export const GROW_FLOOR = 0.2;
export const GROW_MAX = 1.5;
/** How much one watering raises the moisture of a plant's soil. */
export const WATER_DOSE = 0.5;

/**
 * The moisture conditions of a deposit under the day's weather: the level
 * its soil settles at (base), how long watered soil takes to dry back
 * (tau, ms), the moisture below which it grows at its slowest (lo) and from
 * which at its fastest (hi), and a pace factor for the cold (k).
 * @param {Deposit} d @param {string} [sky] weather id
 */
export function moistureEnv(d, sky = 'clear') {
  const hab = habitatOf(d.region);
  let base = hab.wet, tau = hab.retain * 3600000, k = 1;
  if (sky === 'rain' || sky === 'storm') base = Math.max(base, 0.92);
  else if (sky === 'fog') base = Math.min(1, base + 0.1);
  else if (sky === 'heat') { base = Math.max(0.05, base - 0.15); tau *= 0.6; }
  else if (sky === 'frost') k = 0.6;
  const lo = (d.thirst ?? 0.45) * 0.6;
  return { base, tau, lo, hi: lo + 0.35, k };
}

/** ∫₀^S clamp((w(s) − lo)/(hi − lo), 0, 1) ds for w(s) = b + (w0 − b)·e^(−s/τ), in closed form. */
function wetIntegral(w0, b, tau, lo, hi, S) {
  if (S <= 0) return 0;
  const wAt = (s) => b + (w0 - b) * Math.exp(-s / tau);
  const cuts = [0, S];
  if (Math.abs(w0 - b) > 1e-9) for (const x of [lo, hi]) {
    const r = (x - b) / (w0 - b);
    if (r > 0 && r < 1) { const sx = -tau * Math.log(r); if (sx > 0 && sx < S) cuts.push(sx); }
  }
  cuts.sort((p, q) => p - q);
  let tot = 0;
  for (let i = 0; i < cuts.length - 1; i++) {
    const sa = cuts[i], sb = cuts[i + 1], wm = wAt((sa + sb) / 2);
    if (wm <= lo) continue;
    if (wm >= hi) { tot += sb - sa; continue; }
    tot += ((b - lo) * (sb - sa) + tau * (w0 - b) * (Math.exp(-sa / tau) - Math.exp(-sb / tau))) / (hi - lo);
  }
  return tot;
}

/**
 * A plant's growth (0..1) and the moisture of its soil now: a living plant
 * from its checkpoint (or, never checkpointed, from when it sprouted, in
 * soil at the habitat's level); a mineral or shell simply by time.
 * @param {Deposit} d @param {Plant} p @param {number} now @param {string} [sky]
 */
export function growthOf(d, p, now, sky = 'clear') {
  if (!d.botanical) return { g: Math.max(0, Math.min(1, (now - p.born) / d.growMs)), w: null };
  const e = moistureEnv(d, sky);
  const t0 = p.t ?? p.born, g0 = p.g ?? 0, w0 = p.w ?? e.base;
  // a clock set back never undoes growth, nor grows anything
  const S = Math.max(0, now - t0);
  const w = e.base + (w0 - e.base) * Math.exp(-S / e.tau);
  const grown = (e.k / d.growMs) * (GROW_FLOOR * S + (GROW_MAX - GROW_FLOOR) * wetIntegral(w0, e.base, e.tau, e.lo, e.hi, S));
  return { g: Math.min(1, g0 + grown), w };
}

/** Time until a plant is mature (0 if it is), under today's weather. @param {Deposit} d @param {Plant} p @param {number} now @param {string} [sky] */
export function matureIn(d, p, now, sky = 'clear') {
  if (!d.botanical) return Math.max(0, p.born + d.growMs - now);
  if (growthOf(d, p, now, sky).g >= 1) return 0;
  let lo = 0, hi = d.growMs / (GROW_FLOOR * moistureEnv(d, sky).k) + 1;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (growthOf(d, p, now + mid, sky).g >= 1) hi = mid; else lo = mid; }
  return Math.ceil(hi);
}

/** The plant with its state written down at `now` (a checkpoint): what is saved when anything changes it. @param {Deposit} d @param {Plant} p @param {number} now @param {string} [sky] */
export function checkpoint(d, p, now, sky = 'clear') {
  if (!d.botanical) return { id: p.id, x: p.x, y: p.y, born: p.born };
  const { g, w } = growthOf(d, p, now, sky);
  return { id: p.id, x: p.x, y: p.y, born: p.born, g: Math.round(g * 1e6) / 1e6, t: Math.max(now, p.t ?? -Infinity), w: Math.round(/** @type {number} */ (w) * 1e6) / 1e6 };
}

/** A new sprout of a stand, somewhere random in its region (a living one in soil at the habitat's level). @param {ReturnType<typeof createGathering>} g @param {Deposit} d @param {number} seq @param {number} born @param {number} [grown] @returns {Plant} */
function sprout(g, d, seq, born, grown = 0) {
  const rng = new Rng(hashString(`sprout:${d.generationSeed || g.created}:${d.id}:${seq}`));
  const p = { id: `${d.id}#${seq}`, x: Math.round(rng.range(0.06, 0.94) * 1000) / 1000, y: Math.round(rng.range(0.56, 0.9) * 1000) / 1000, born: Math.round(born) };
  return d.botanical ? { ...p, g: grown, t: p.born, w: moistureEnv(d, g.sky).base } : p;
}

/**
 * A stand nobody has touched: saturated when the wilds were first walked,
 * its first plant mature and the others at every stage of growing.
 * @param {ReturnType<typeof createGathering>} g @param {Deposit} d @param {number} now @returns {Stand}
 */
function untouched(g, d, now) {
  const t0 = Math.min(g.created, now), rng = new Rng(hashString(`stand:${g.created}:${d.id}`));
  const plants = [];
  for (let k = 0; k < d.slots; k++) {
    const age = d.growMs * (k === 0 ? 1.2 : rng.range(0.1, 1.6));
    const p = sprout(g, d, k, t0 - age, d.finite ? 1 : 0);
    // a living plant's growth so far is written at the moment the wilds were first walked
    plants.push(d.botanical ? { ...p, g: d.finite ? 1 : Math.min(1, age / d.growMs), t: t0 } : p);
  }
  return { plants, due: null, seq: d.slots };
}

/** Time between sprouts of a stand (a scarred one, slower). @param {Deposit} d @param {{scar?:boolean}} s */
const every = (d, s) => d.spawnMs * (s.scar ? SCAR_SLOWDOWN : 1);

/**
 * A deposit's stand as it is now (pure): the saved plants plus every sprout
 * that has come up since, at random spots, until the stand is saturated.
 * @param {ReturnType<typeof createGathering>} g @param {Deposit} d @param {number} [now] @returns {Stand}
 */
export function standOf(g, d, now = Date.now()) {
  const saved = g.nodes[d.id] || untouched(g, d, now);
  /** @type {Stand} */
  const s = { plants: saved.plants.slice(), due: saved.due, seq: saved.seq, ...(saved.scar ? { scar: true } : {}) };
  if (d.finite) { s.due = null; return s; }
  while (s.due !== null && s.due <= now && s.plants.length < d.slots) {
    s.plants.push(sprout(g, d, s.seq++, s.due));
    s.due += every(d, s);
  }
  if (s.plants.length >= d.slots) { s.due = null; delete s.scar; }
  return s;
}

/**
 * A plant's stage, how far it has grown (0..1), how moist its soil is and
 * when it will be mature.
 * @param {Deposit} d @param {Plant} p @param {number} [now] @param {string} [sky]
 */
export function plantStage(d, p, now = Date.now(), sky = 'clear') {
  if (d.finite) return { stage: 'mature', grown: 1, matureIn: 0, moisture: null, thirsty: false };
  const { g: grown, w } = growthOf(d, p, now, sky);
  const e = d.botanical ? moistureEnv(d, sky) : null;
  return {
    stage: grown >= 1 ? 'mature' : grown >= SPROUT_SHARE ? 'ripe' : 'sprout', grown, matureIn: matureIn(d, p, now, sky),
    moisture: w, thirsty: !!e && grown < 1 && /** @type {number} */ (w) < e.lo + (e.hi - e.lo) * 0.25,
  };
}

/**
 * How a deposit is doing now (pure): its plants and their stages, how much
 * its mature plants hold, how far the stand has grown back, when the next
 * plant matures and when every slot holds a mature plant again.
 * @param {ReturnType<typeof createGathering>} g @param {Deposit} d @param {number} [now]
 */
export function depositStatus(g, d, now = Date.now()) {
  const s = standOf(g, d, now), sky = g.sky || 'clear';
  const plants = s.plants.map((p) => ({ ...p, ...plantStage(d, p, now, sky) }));
  const mature = plants.filter((p) => p.stage === 'mature').length;
  // the sprouts still to come, then the last of them growing up (in soil at the habitat's level)
  const missing = d.slots - plants.length;
  const fresh = missing > 0 && s.due !== null ? matureIn(d, sprout(g, d, s.seq, s.due), s.due, sky) : 0;
  const lastSprout = missing > 0 && s.due !== null ? s.due + (missing - 1) * every(d, s) : now;
  const fullAt = Math.max(now, lastSprout + fresh, ...plants.map((p) => now + p.matureIn));
  const nextAt = mature ? now : Math.min(...plants.map((p) => now + p.matureIn), s.due !== null ? s.due + fresh : Infinity);
  const stock = mature * d.take;
  const growing = plants.filter((p) => p.stage !== 'mature');
  return {
    plants, mature, stock, available: stock,
    fraction: plants.reduce((a, p) => a + p.grown, 0) / d.slots,
    fullIn: fullAt - now, nextIn: Math.max(0, nextAt - now), scarred: !!s.scar,
    // how damp the growing plants' soil is (null for minerals), and how many of them are thirsty
    moisture: d.botanical && growing.length ? growing.reduce((a, p) => a + /** @type {number} */ (p.moisture), 0) / growing.length : null,
    thirsty: growing.filter((p) => p.thirsty).length,
  };
}

/**
 * Water living plants: the moisture of each one's soil rises by WATER_DOSE
 * (to at most 1). Their state is checkpointed first, so nothing grows twice.
 * Returns how many plants drank (0 for a mineral deposit).
 * @param {ReturnType<typeof createGathering>} g @param {Deposit} d @param {string[]|null} ids the plants to water (null: every growing one) @param {number} [now]
 */
export function water(g, d, ids = null, now = Date.now()) {
  if (d.finite || !d.botanical) return 0;
  const s = standOf(g, d, now), sky = g.sky || 'clear';
  let n = 0;
  const plants = s.plants.map((p) => {
    const q = checkpoint(d, p, now, sky);
    if ((ids ? ids.includes(p.id) : /** @type {number} */ (q.g) < 1) && /** @type {number} */ (q.w) < 0.999) { q.w = Math.min(1, /** @type {number} */ (q.w) + WATER_DOSE); n++; }
    return q;
  });
  g.nodes[d.id] = { plants, due: s.due, seq: s.seq, ...(s.scar ? { scar: true } : {}) };
  if (n) g.watered = (g.watered || 0) + n;
  return n;
}

/**
 * Write every living plant's state down now and change the weather it
 * grows under (the day has changed). Minerals need nothing.
 * @param {ReturnType<typeof createGathering>} g @param {Deposit[]} deposits @param {string} sky @param {number} [now]
 */
export function setSky(g, deposits, sky, now = Date.now()) {
  if ((g.sky || 'clear') !== sky) for (const d of deposits) {
    if (!d.botanical) continue;
    const s = standOf(g, d, now);
    g.nodes[d.id] = { plants: s.plants.map((p) => checkpoint(d, p, now, g.sky || 'clear')), due: s.due, seq: s.seq, ...(s.scar ? { scar: true } : {}) };
  }
  g.sky = sky;
}

/**
 * Bring a save from before plants drank (gathering v1) up to date: every
 * saved living plant keeps exactly the growth it had (by its age), written
 * as a checkpoint now in soil at the habitat's level, so nothing ripe is
 * lost and nothing grows twice.
 * @param {ReturnType<typeof createGathering>} g @param {Deposit[]} deposits @param {number} [now]
 */
export function migrateGathering(g, deposits, now = Date.now()) {
  if ((g.v || 1) >= GATHER_VERSION) return g;
  for (const d of deposits) {
    const node = g.nodes[d.id];
    if (!node || !d.botanical) continue;
    const base = moistureEnv(d, g.sky).base;
    node.plants = node.plants.map((p) => (p.t !== undefined ? p : { ...p, g: Math.max(0, Math.min(1, (now - p.born) / d.growMs)), t: now, w: base }));
  }
  g.v = GATHER_VERSION;
  return g;
}

/** A thoroughly dug stand sprouts this many times slower until it is saturated again. */
export const SCAR_SLOWDOWN = 2;

// ------------------------------------------------------------------ methods, tools, hours and weather

/**
 * How each kind of ingredient is gathered. Everything but picking needs the
 * Forager's Kit for a full harvest.
 * @type {Record<string, {verb:string, tool:string|null, sound:string, icon:string, hand:string}>}
 */
export const METHODS = {
  pick: { verb: 'Pick', tool: null, sound: 'snip', icon: 'rose', hand: '' },
  dig: { verb: 'Dig up', tool: 'kit', sound: 'dig', icon: 'trowel', hand: 'by hand, half as much — the Forager’s Kit’s trowel digs it out whole' },
  mine: { verb: 'Chip out', tool: 'kit', sound: 'crack', icon: 'pick', hand: 'prised out by hand, half as much — the Forager’s Kit’s hammer would split the seam' },
  scrape: { verb: 'Scrape', tool: 'kit', sound: 'snip', icon: 'sickle', hand: 'torn off by hand, half as much — the Forager’s Kit’s sickle cuts it clean' },
  sweep: { verb: 'Sweep up', tool: 'kit', sound: 'dig', icon: 'brush', hand: 'scooped by hand, half as much — the Forager’s Kit’s brush gathers the fine dust' },
};

/** The method an ingredient needs. @param {any} m material */
export function methodOf(m) {
  return METHODS[(m && m.wild && m.wild.gather) || 'pick'] || METHODS.pick;
}

/**
 * The part of the shop day. The day has one clock, the shop door:
 *   dawn — before the shop opens (the first customer has not been let in);
 *   day  — while the shop is open;
 *   dusk — once the last customer has gone, until the shop closes for the night.
 * Dawn flowers are therefore gathered before opening, dusk plants after the
 * day's trade — or in fog, which keeps twilight all day. (A state without an
 * `opened` flag, as in old tests, counts as open once a customer was served.)
 * @param {{customerIndex:number, customersPerDay:number, dayOver?:boolean, opened?:boolean, current?:any}} st
 * @returns {'dawn'|'day'|'dusk'}
 */
export function dayPart(st) {
  if (st.dayOver) return 'dusk';
  const opened = st.opened !== undefined ? st.opened : st.customerIndex > 0;
  return opened ? 'day' : 'dawn';
}

export const DAY_PART_NAME = { dawn: 'Dawn', day: 'Midday', dusk: 'Dusk' };
/** What each part of the day means for the shop. */
export const DAY_PART_HINT = { dawn: 'The shop is still closed: dawn flowers are open.', day: 'The shop is open.', dusk: 'The shop has closed: dusk plants are open until you close for the night.' };

/**
 * @typedef {Object} Weather
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string} desc
 */

/** @type {Weather[]} */
export const WEATHERS = [
  { id: 'clear', name: 'Clear skies', icon: 'sun', desc: 'A fair day for foraging.' },
  { id: 'rain', name: 'Soft rain', icon: 'drop', desc: 'Plants drink deep: tonight every herb, root and moss grows back in full.' },
  { id: 'frost', name: 'Hoarfrost', icon: 'snow', desc: 'The meadow flowers stay shut (half the harvest); frost-loving caps swell (half again).' },
  { id: 'storm', name: 'Thunderstorm', icon: 'bolt', desc: 'Lightning recharges the crystal seams — they are full again tonight. Wind scatters a quarter of every outdoor harvest.' },
  { id: 'fog', name: 'Fog', icon: 'wisp', desc: 'Twilight lingers all day: dawn and dusk plants stay open from morning to night.' },
  { id: 'heat', name: 'Heatwave', icon: 'flame', desc: 'Sun-loving flowers are lush (a quarter more); mosses dry out (half as much).' },
];

/** The weather of a day (deterministic from the world seed). @param {string} seed @param {number} day */
export function weatherOn(seed, day) {
  if (day <= 1) return WEATHERS[0];
  const r = new Rng(hashString(`weather:${seed}:${day}`)).next();
  // clear 40 %, rain 18 %, fog 12 %, frost 10 %, storm 10 %, heat 10 %
  const cut = [0.4, 0.58, 0.7, 0.8, 0.9, 1];
  const ids = ['clear', 'rain', 'fog', 'frost', 'storm', 'heat'];
  const id = ids[cut.findIndex((c) => r < c)];
  return WEATHERS.find((w) => w.id === id) || WEATHERS[0];
}

const FLOWER_SHAPES = new Set(['petal', 'flower', 'clover', 'spike', 'lily']);

/**
 * Everything that decides one harvest of a deposit right now: the method,
 * the tool, the hour, the weather and the chosen care. Pure.
 * @param {{has:(id:string)=>boolean, customerIndex:number, customersPerDay:number, dayOver?:boolean, seed:string, day:number}} st
 * @param {Deposit} d @param {any} m material @param {{thorough?:boolean}} [opts]
 */
export function gatherPlan(st, d, m, opts = {}) {
  const method = methodOf(m);
  const hasTool = !method.tool || st.has(method.tool);
  const part = dayPart(st);
  const weather = weatherOn(st.seed, st.day);
  const w = m && m.wild ? m.wild : {};
  const hour = w.dawn ? 'dawn' : w.dusk ? 'dusk' : null;
  const open = !hour || hour === part || weather.id === 'fog';
  /** @type {{why:string, f:number}[]} */
  const factors = [];
  if (st.has('satchel')) factors.push({ why: 'satchel', f: 1.5 });
  if (!hasTool) factors.push({ why: method.hand, f: 0.5 });
  if (!open) factors.push({ why: `closed until ${hour} — only a few sprigs`, f: 0.25 });
  const shape = w.shape || '';
  if (weather.id === 'frost' && FLOWER_SHAPES.has(shape)) factors.push({ why: 'shut by the frost', f: 0.5 });
  if (weather.id === 'frost' && (shape === 'cap' || shape === 'toadstool' || shape === 'bracket')) factors.push({ why: 'swollen in the frost', f: 1.5 });
  if (weather.id === 'heat' && (FLOWER_SHAPES.has(shape))) factors.push({ why: 'lush in the heat', f: 1.25 });
  if (weather.id === 'heat' && shape === 'moss') factors.push({ why: 'dried out in the heat', f: 0.5 });
  if (weather.id === 'storm') factors.push({ why: 'wind scatters it', f: 0.75 });
  if (opts.thorough) factors.push({ why: d.finite ? 'thorough: takes the whole specimen' : 'thorough: the stand will sprout slowly', f: 2 });
  const f = factors.reduce((a, x) => a * x.f, 1);
  const take = Math.max(5, Math.floor((d.take * f) / 5) * 5);
  // how much of what is cut becomes usable (the rest is spoiled by hand, out
  // of hours or by the weather); the satchel and a thorough harvest change how
  // much is taken per trip, not how well
  const eff = factors.filter((x) => x.why !== 'satchel' && !x.why.startsWith('thorough')).reduce((a, x) => a * x.f, 1);
  return { method, hasTool, part, weather, hour, open, factors, take, eff, thorough: !!opts.thorough };
}

/**
 * How much one harvest can bring right now (ignoring shelf space): one
 * mature plant's yield, or nothing while every plant is still growing.
 * @param {ReturnType<typeof createGathering>} g @param {Deposit} d @param {{take:number}} plan @param {number} [now]
 */
export function harvestable(g, d, plan, now = Date.now()) {
  return depositStatus(g, d, now).mature ? plan.take : 0;
}

/**
 * A mineral seam grown back at once: its pieces all formed, its empty slots
 * filled with formed pieces at new spots.
 * @param {ReturnType<typeof createGathering>} g @param {Deposit} d @param {number} now
 */
function ripen(g, d, now) {
  const s = standOf(g, d, now);
  const born = now - d.growMs;
  s.plants = s.plants.map((p) => ({ ...p, born: Math.min(p.born, born) }));
  while (s.plants.length < d.slots) s.plants.push(sprout(g, d, s.seq++, born));
  g.nodes[d.id] = { plants: s.plants, due: null, seq: s.seq };
}

/**
 * A night of rain soaks the living plants: their soil is wet through, each
 * grows on by half its growing time, and an empty slot comes up already
 * half-grown — a bounty, but not every plant ripe at once.
 * @param {ReturnType<typeof createGathering>} g @param {Deposit} d @param {number} now
 */
function soak(g, d, now) {
  const s = standOf(g, d, now), sky = g.sky || 'clear';
  /** @type {Plant[]} */
  const plants = s.plants.map((p) => { const q = checkpoint(d, p, now, sky); return { ...q, g: Math.min(1, /** @type {number} */ (q.g) + 0.5), w: 1 }; });
  while (plants.length < d.slots) plants.push({ ...sprout(g, d, s.seq++, now), g: SPROUT_SHARE, w: 1 });
  g.nodes[d.id] = { plants, due: null, seq: s.seq };
}

/**
 * A night's weather acts on the deposits: rain soaks the living plants
 * (their soil, their growth), a storm recharges the crystal seams.
 * @param {ReturnType<typeof createGathering>} g @param {Deposit[]} deposits @param {Weather} weather @param {(id:string)=>any} lookup @param {number} [now]
 */
export function weatherRegrowth(g, deposits, weather, lookup, now = Date.now()) {
  for (const d of deposits) {
    if (d.finite) continue;
    const m = lookup(d.materialId);
    const shape = m && m.wild ? m.wild.shape : '';
    if (weather.id === 'rain' && d.botanical) soak(g, d, now);
    else if (weather.id === 'storm' && (shape === 'crystal' || shape === 'shard')) ripen(g, d, now);
  }
}

/**
 * Harvest one mature plant of a deposit into the shop inventory: the plant
 * given (`plant`, a plant id) or else the oldest mature one. Only a mature
 * plant can be taken; it is taken whole, leaving nothing on the ground, and
 * the stand starts sprouting again (at random spots) until it is saturated.
 * Respects shelf storage; returns what was gathered (0 if nothing could be).
 * `free` (the Free Experiment) takes the plant all the same — the stand grows
 * back as it would — but its shelves are bottomless: nothing is stored, no
 * rank is asked for and the plant gives its full `take`.
 * @param {{rank:number, inventory:Record<string,number>, cap:{storage:number}, gathering:any}} st
 * @param {Deposit} d `take` is what the plant gives (gatherPlan)
 * @param {{now?:number, unlimited?:boolean, free?:boolean, thorough?:boolean, plant?:string}} [opts]
 */
export function harvest(st, d, opts = {}) {
  const now = opts.now ?? Date.now();
  if (d.rank > st.rank && !opts.unlimited && !opts.free) return { ok: false, amount: 0, reason: 'locked' };
  if (opts.unlimited) return { ok: true, amount: d.take, remaining: d.capacity };
  const g = st.gathering;
  const s = standOf(g, d, now);
  const have = st.inventory[d.materialId] ?? 0;
  const room = isFinite(have) ? Math.max(0, st.cap.storage - have) : 0;
  const sky = g.sky || 'clear';
  const ripe = s.plants.filter((p) => plantStage(d, p, now, sky).stage === 'mature').sort((a, b) => a.born - b.born);
  const p = opts.plant ? s.plants.find((q) => q.id === opts.plant) : ripe[0];
  if (!p || !ripe.includes(p)) {
    const status = depositStatus(g, d, now);
    return { ok: false, amount: 0, reason: p ? 'growing' : opts.plant ? 'gone' : 'depleted', nextIn: p ? matureIn(d, p, now, sky) : status.nextIn };
  }
  const amount = opts.free ? d.take : Math.floor(Math.min(d.take, room) / 5) * 5;
  if (amount <= 0) return { ok: false, amount: 0, reason: 'full' };
  const plants = s.plants.filter((q) => q !== p).map((q) => checkpoint(d, q, now, sky));
  const scar = !!(opts.thorough || s.scar);
  g.nodes[d.id] = { plants, due: d.finite ? null : s.due ?? now + every(d, { scar }), seq: s.seq, ...(scar && !d.finite ? { scar: true } : {}) };
  if (!opts.free) { st.inventory[d.materialId] = have + amount; g.total += amount; }
  return { ok: true, amount, plant: p.id, remaining: (ripe.length - 1) * d.take };
}

/**
 * A new shop day: every plant grows on by half its growing time and a stand
 * below its slots puts up half of its missing sprouts (a scarred one, a
 * quarter), on top of wall-clock growth, so a quick player is never stuck
 * waiting. (Living plants are checkpointed first, so their growth so far is
 * kept under the weather it happened in.)
 * @param {ReturnType<typeof createGathering>} g @param {Deposit[]} deposits @param {number} [now]
 */
export function newDayRegrowth(g, deposits, now = Date.now()) {
  const sky = g.sky || 'clear';
  for (const d of deposits) {
    if (d.finite) continue;
    if (!g.nodes[d.id] && !d.botanical) continue;
    const s = standOf(g, d, now);
    const plants = s.plants.map((p) => {
      if (!d.botanical) return { ...p, born: p.born - d.growMs / 2 };
      const q = checkpoint(d, p, now, sky);
      return { ...q, g: Math.min(1, /** @type {number} */ (q.g) + 0.5) };
    });
    const add = Math.ceil((d.slots - plants.length) * (s.scar ? 0.25 : 0.5));
    for (let k = 0; k < add; k++) plants.push(sprout(g, d, s.seq++, now));
    const full = plants.length >= d.slots;
    g.nodes[d.id] = { plants, due: full ? null : s.due, seq: s.seq, ...(s.scar && !full ? { scar: true } : {}) };
  }
}

/** How many times faster the Free Experiment's wilds grow: a harvested plant is back within a minute or two, not an hour. */
export const SANDBOX_PACE = 8;

/**
 * Make a gathering state the Free Experiment's wilds: every stand grows and
 * sprouts SANDBOX_PACE times faster, under a clear sky (the sandbox has no
 * weather), and is found saturated and fully grown. A harvest there takes
 * the plant (harvest `free`), so new sprouts come up at random spots and
 * grow, drinking, as they do in the shop's wilds. Changes the deposits given
 * (the sandbox's own, never saved).
 * @param {ReturnType<typeof createGathering>} g @param {Deposit[]} deposits @param {number} [now]
 */
export function sandboxWilds(g, deposits, now = Date.now()) {
  for (const d of deposits) sandboxDeposit(d);
  // walked long enough ago that every untouched plant has grown up
  g.nodes = {};
  g.created = now - 3600000;
  g.sky = 'clear';
  return g;
}

/** Apply only to newly generated sandbox deposits; keeps other visited stands. */
export function sandboxDeposit(d) {
  d.finite = false;
  d.growMs = Math.round(d.growMs / SANDBOX_PACE);
  d.spawnMs = Math.round(d.spawnMs / SANDBOX_PACE);
  d.regrowMs = d.spawnMs * (d.slots - 1) + d.growMs;
}

/** Human readable duration. @param {number} ms */
export function formatWait(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
