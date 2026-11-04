// Commission generation.
//
// Each request is derived from a hidden *reference plan* assembled only from
// reagents the player can currently buy or gather and equipment they own.
// The plan's outcome is predicted with the simulation's own mixture laws,
// extraction, reaction stoichiometry, arcane activation and effect laws
// (predict.js), the customer's targets are placed just below that outcome,
// and the predicted bottle must score full marks under the very evaluation
// used at the counter (evaluate.js) before the customer may ask. Every
// commission is therefore achievable by construction; the test-suite brews
// samples of these plans in the real simulation.
//
// Effect requests come from narrative templates (requests.js). Their wanted
// effects follow concentration targets that rise with tier (8–15 % for an
// apprentice, beyond what plain ingredients can reach for a master, which
// needs arcane activation), and every effect the customer did not ask for
// must stay below 1.2 %.
//
// Customers judge outcomes, never procedures, and only outcomes a customer
// can fairly check: the effects (and the absence of every other effect),
// and the quantity — never the temperature it is served at. On top of the
// plain request they may ask for a *technique* (TECHNIQUES): a draught
// stronger than plain brewing gives (boiling water off concentrates it — so
// does using more herb). Each technique is
// applied to the hidden plan, re-predicted and re-checked, so it is only
// asked for when the natural ingredients at hand can deliver it. Physical
// properties the simulation computes but no customer can reasonably want
// (density, viscosity, stability, volatility, charge, an exact colour) are
// never asked for (docs/GAMEPLAY_PURPOSE_AUDIT.md).
//
// Feasibility is practical, not only theoretical: every ingredient of the
// plan must be on the shelf, gatherable today (careful harvests of reachable
// deposits) or legally buyable within the shop's coins, with room for test
// doses; otherwise the plan is searched again without it.

import { Rng } from '../core/rng.js';
import { describeColor } from '../core/color.js';
import { predictPlan, planCost, arcaneRegime, ACTIVATION_MARGIN } from './predict.js';
import { ARCHETYPES, makeCustomer, archetypeOf } from './customers.js';
import { evaluatePotion } from './evaluate.js';
import { SIM } from '../simulation/constants.js';
import { EFFECT_INDEX, EFFECT_BY_KEY, EFFECT_KEYS, NE, interact } from '../alchemy/effects.js';
import { thresholdToCelsius, isMagical } from '../alchemy/arcane.js';
import { compatFactor } from '../reactions/compatibility.js';
import { REQUESTS, TIER_TARGET, PURITY_LIMIT, requestById } from './requests.js';

/**
 * @typedef {Object} Requirement
 * @property {string} key        purity | an effect key (alchemy/effects.js)
 * @property {'target'|'min'|'max'} kind
 * @property {number} target
 * @property {number} tol        perfect-match tolerance
 * @property {number} zero       distance at which the score reaches zero
 * @property {string} label
 * @property {boolean} [effect]   an effect requirement (needs a verified trial)
 * @property {boolean} [limit]    a safety limit on an unwanted effect
 * @property {string[]} [exclude] purity: the effects that are wanted (or tolerated)
 * @property {string} [name]
 */


/**
 * @typedef {Object} CommissionContext
 * @property {import('../materials/generator.js').World} world
 * @property {(id:string)=>any} lookup
 * @property {Set<string>} available     purchasable/owned ingredient ids
 * @property {ReturnType<import('./equipment.js').capabilities>} cap
 * @property {number} rank
 * @property {(id:string)=>number} priceOf coins per 100 ml
 * @property {string} [event]           active market event key
 * @property {number} [coins]           the shop's purse (purchases a plan needs must fit it)
 * @property {(id:string)=>number} [supply]   ml on the shelf plus what can be gathered today
 * @property {(id:string)=>boolean} [buyable] may it be bought at the market now
 * @property {(id:string)=>number} [stock]    ml on the shelf
 * @property {Set<string>} [avoid]      ingredients the plan must do without
 */

/**
 * Requirement on a wanted effect: at least `min` percent (or, for some
 * advanced customers, a measured band around it).
 * @param {string} key @param {number} sign @param {number} min
 */
function effectRequirement(key, sign, min) {
  if (sign < 0) {
    const max = -Math.max(3, Math.round(min));
    return { key, kind: /** @type {'max'} */ ('max'), target: max, tol: 0, zero: 14, label: `alkaline, ${max} or lower`, effect: true };
  }
  const t = Math.max(3, Math.round(min));
  return { key, kind: /** @type {'min'} */ ('min'), target: t, tol: 0, zero: Math.max(6, t * 0.6), label: `at least ${t}%`, effect: true, name: EFFECT_BY_KEY[key].label.toLowerCase() };
}

/** The purity rule: nothing the customer did not ask for above the limit. @param {string[]} exclude */
export function purityRequirement(exclude, limit = PURITY_LIMIT) {
  return { key: 'purity', kind: /** @type {'max'} */ ('max'), target: limit, tol: 0, zero: 2.5, exclude: exclude.slice(), label: `no other effect above ${limit}%`, effect: true };
}

/** Effects that must count as unwanted for a set of wanted keys. @param {string[]} exclude */
function unwantedMax(effects, exclude) {
  let m = 0, key = '';
  for (let k = 0; k < NE; k++) {
    if (exclude.includes(EFFECT_KEYS[k])) continue;
    const v = Math.abs(effects[k]);
    if (v > m) { m = v; key = EFFECT_KEYS[k]; }
  }
  return { value: m, key };
}

// ------------------------------------------------------------------ effect requests: the feasibility search

/** Liquids that dissolve or carry other reagents. */
function solventsOf(ctx) {
  const R = ctx.world.roles;
  return [R.water, R.spirit, R.oil].filter((id) => id && ctx.available.has(id)).map(ctx.lookup);
}

/**
 * Preparation for one reagent: how hot (or cold) and how long to brew so
 * that its magic reaches the liquid. Uses the reagent's own extraction
 * reaction where it has one.
 * @returns {{solvent:any, heatTo:number, coolTo:number, hold:number, ground?:boolean, lo?:number, hi?:number}|null}
 */
export function prepFor(m, ctx, solvents) {
  const water = solvents.find((x) => x.id === ctx.world.roles.water) || solvents[0];
  if (m.form === 'liquid') {
    const compat = solvents.find((l) => compatFactor(m.compat[0], m.compat[1], l.compat[0], l.compat[1]) > 0.6);
    return { solvent: compat || null, heatTo: 20, coolTo: 20, hold: 6 };
  }
  if (m.form === 'gas') return null;
  if (m.form === 'solid' && m.melt < 15 && m.boil > 60) {
    // frozen stock (rime chunks): it simply melts into the brew
    const compat = solvents.find((l) => compatFactor(m.compat[0], m.compat[1], l.compat[0], l.compat[1]) > 0.6);
    return { solvent: compat || null, heatTo: 20, coolTo: 20, hold: 12 };
  }
  // a whole solid is crushed in the pot with the pestle (every kit has one)
  const ground = m.form === 'solid';
  // its own extraction (steeping, infusing, a tincture in spirit, fire into oil)
  const rx = ctx.world.reactions.find((r) => r.a === m.id && (r.wet || r.kind === 'mix' || r.kind === 'contact') && r.products.length === 1 && /^rw_(extract|steep|infuse|mandrake|starquartz|dragonoil)/.test(r.id));
  if (rx) {
    const solvent = rx.b ? solvents.find((l) => l.id === rx.b) : water;
    if (!solvent) return null;
    const boil = isFinite(solvent.boil) ? solvent.boil : 400;
    if (rx.maxT <= 20) {
      // an ice-cold steep (Frostcap, Grave Moss): the basin holds a watery
      // brew near 9 °C at best, the frost rune well below — but never so cold
      // that the brew freezes (docs/GAMEPLAY_PURPOSE_AUDIT.md)
      const floor = coldFloor(ctx.cap);
      const T = Math.max(Math.round((rx.minT + rx.maxT) / 2), floor + 1);
      if (T > rx.maxT - 3) return null;
      return { solvent, heatTo: 20, coolTo: T, hold: 22, ground, lo: Math.max(rx.minT + 1, floor + 1), hi: rx.maxT - 3 };
    }
    // well inside the window: the furnace holds the mean to ±4 °C and the cooler edges of the
    // brew lag behind, so a steep at the window's very edge extracts only part of a slow herb
    const lo = rx.minT + 7, hi = Math.min(rx.maxT - 4, boil - 8, ctx.cap.maxFlame - 40);
    if (hi < lo) return null;
    if (lo <= 15) {
      // a cold steep (below room temperature)
      const T = Math.max(lo, Math.min(hi, ctx.cap.minCool + 3));
      if (T > hi || T < ctx.cap.minCool + 2) return null;
      return { solvent, heatTo: 20, coolTo: T, hold: 22, ground };
    }
    return { solvent, heatTo: Math.round((lo + hi) / 2), coolTo: 20, hold: 22, ground, lo, hi };
  }
  // no extraction: it dissolves only as far as its solubility allows
  const compat = solvents.find((l) => compatFactor(m.compat[0], m.compat[1], l.compat[0], l.compat[1]) > 0.6);
  if (!compat || (m.solubility || 0) < 0.03) return null;
  return { solvent: compat, heatTo: 20, coolTo: 20, hold: 10, ground };
}

/**
 * The coldest a watery brew can be held at with this equipment (°C): the
 * basin's cool water stops near 9 °C; a cold plate holds it just above
 * freezing (colder, it freezes, and frozen herbs give up less).
 * @param {{minCool:number}} cap
 */
export function coldFloor(cap) {
  return cap.minCool > 0 ? 9 : 3;
}

/**
 * Effects the guild's universal oppositions can neutralise: fire and frost,
 * life and death (life also mends poison), acid and alkali. Every natural
 * ingredient carries side effects only on these, so an order for any effect
 * can be brewed by balancing ingredients against each other.
 */
const NEUTRALISABLE = new Set(['fire', 'frost', 'vitality', 'death', 'toxicity', 'acidity']);

/**
 * Search for a hidden plan that delivers the wanted effects at (at least)
 * the targets, with every other effect under the purity limit. Natural
 * ingredients are never pure, so a plan is a balance: carriers of the
 * wanted effects plus helpers whose own effects oppose the carriers' side
 * effects, proportioned so that the unwanted ones cancel out.
 * @param {{key:string, sign:number, target:number}[]} wanted
 * @param {string[]} exclude  effects that may be present (wanted + tolerated)
 * @param {CommissionContext} ctx @param {Rng} rng @param {number} n total particles
 * @param {{activation:boolean, serve:number}} o
 */
function searchPlan(wanted, exclude, ctx, rng, n, o) {
  const solvents = solventsOf(ctx);
  if (!solvents.length) return null;
  const pot = (m, w) => w.sign * (((m.effects || {})[w.key]) || 0);
  // an ingredient may go in only if all it carries is wanted, tolerated or neutralisable
  const admissible = (m) => Object.entries(m.effects).every(([k, v]) => Math.abs(Number(v) || 0) < 1 || exclude.includes(k) || NEUTRALISABLE.has(k));
  // an awakening plan can only use what wakes within the fire's (or the frost's) reach in a
  // watery brew; ingredients that wake by cold and by heat never mix in one
  const water = ctx.lookup(ctx.world.roles.water);
  const hot = Math.min(ctx.cap.maxFlame - 40, (water && isFinite(water.boil) ? water.boil : 100) - 6), cold = 20 + 0.55 * (ctx.cap.minCool - 20);
  const wakes = (m) => isMagical(m) && (m.arcane.thr >= 0 ? thresholdToCelsius(m.arcane.thr) + ACTIVATION_MARGIN + 4 <= hot : thresholdToCelsius(m.arcane.thr) - ACTIVATION_MARGIN - 4 >= cold);
  const pool = [...ctx.available].map(ctx.lookup)
    .filter((m) => m && m.effects && m.form !== 'gas' && !m.awakened && !m.remains && !m.product && Object.keys(m.effects).length && admissible(m) && (!o.activation || wakes(m))
      && !(ctx.avoid && ctx.avoid.has(m.id)) && obtainable(ctx, m.id, 40));
  /** carriers for each wanted effect, cleanest first (with some variety) */
  const carriers = wanted.map((w) => pool.filter((m) => pot(m, w) >= 4)
    .map((m) => {
      let side = 0;
      for (const [k, v] of Object.entries(m.effects)) if (!exclude.includes(k)) side += Math.abs(Number(v) || 0);
      return { m, score: pot(m, w) / (1 + side * 0.04) * (0.8 + 0.4 * rng.next()) };
    })
    .sort((a, b) => b.score - a.score).slice(0, 4).map((c) => c.m));
  if (carriers.some((c) => !c.length)) return null;
  const tries = [];
  for (let a = 0; a < 3; a++) {
    const pick = wanted.map((w, k) => carriers[k][Math.min(carriers[k].length - 1, a === 0 ? 0 : rng.int(0, carriers[k].length - 1))]);
    // awakening needs one direction: all by heat or all by cold
    if (o.activation && new Set(pick.map((m) => m.arcane.thr >= 0)).size > 1) continue;
    if (!tries.some((t) => t.every((m, k) => m === pick[k]))) tries.push(pick);
  }
  for (const pick of tries) {
    const sign = pick[0].arcane ? pick[0].arcane.thr >= 0 : true;
    const plan = composePlan(pick, wanted, exclude, ctx, solvents, n, o, o.activation ? pool.filter((m) => (m.arcane.thr >= 0) === sign) : pool);
    if (plan) return plan;
  }
  return null;
}

/**
 * Balance a set of carriers (one per wanted effect, possibly repeated) with
 * helpers that cancel their side effects. The proportions are solved on a
 * linear model of what each ingredient gives up under this brew's
 * preparation (probed with the predictor), with the world's laws and the
 * universal oppositions applied on top; the predictor then checks the real
 * plan and the model is refined until both agree.
 */
function composePlan(pick, wanted, exclude, ctx, solvents, n, o, pool) {
  const uniq = [...new Set(pick)];
  const preps = uniq.map((m) => prepFor(m, ctx, solvents));
  if (preps.some((p) => !p)) return null;
  // one solvent and one extraction stage for the whole brew: the main
  // carrier sets them, the others join where their windows overlap and
  // otherwise go in unsteeped (they still dissolve as far as they can)
  let solvent = null, win = null, chill = false, hold = 8;
  for (const p of preps) {
    if (p.solvent && solvent && p.solvent.id !== solvent.id) continue;
    const pw = p.lo !== undefined ? [p.lo, p.hi] : p.coolTo < 20 ? [Math.max(ctx.cap.minCool + 2, p.coolTo - 3), p.coolTo + 3] : null;
    if (pw) {
      const isCold = p.coolTo < 20;
      if (win && isCold !== chill) continue;
      const nw = win ? [Math.max(win[0], pw[0]), Math.min(win[1], pw[1])] : pw;
      if (nw[0] > nw[1]) continue;
      win = nw;
      chill = isCold;
    }
    solvent = solvent || p.solvent;
    hold = Math.max(hold, p.hold);
  }
  solvent = solvent || solvents.find((x) => x.id === ctx.world.roles.water) || solvents[0];
  const quietServe = o.activation ? [] : [o.serve];
  // the steep temperature nearest the middle of the window that wakes none of the carriers
  let stageT = null;
  if (win) {
    const mid = (win[0] + win[1]) / 2;
    for (let T = Math.ceil(win[0]); T <= win[1]; T++) {
      if (arcaneRegime(uniq.map((m) => m.id), ctx.lookup, [T, ...quietServe]) !== 'quiet') continue;
      if (stageT === null || Math.abs(T - mid) < Math.abs(stageT - mid)) stageT = T;
    }
    if (stageT === null) return null;
  }
  const temps = stageT === null ? quietServe : [stageT, ...quietServe];
  // helpers: anything that keeps this stage quiet and is not a carrier
  const helpers = pool.filter((m) => !uniq.includes(m) && arcaneRegime([...uniq.map((c) => c.id), m.id], ctx.lookup, temps) === 'quiet');
  // A larger catalogue must not make every customer probe hundreds of nearly
  // equivalent herbs. Keep three useful neutralisers per signed dominant
  // channel, preserving solvent and temperature diversity within the shortlist.
  const groups = new Map();
  for (const m of helpers) {
    const entries = Object.entries(m.effects).filter(([k]) => NEUTRALISABLE.has(k)).sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])));
    const main = entries[0];
    if (!main) continue;
    const key = main[0] + ':' + Math.sign(Number(main[1]));
    const side = Object.entries(m.effects).reduce((n, [k, v]) => n + (k === main[0] || exclude.includes(k) ? 0 : Math.abs(Number(v))), 0);
    const score = Math.abs(Number(main[1])) / (1 + side);
    const list = groups.get(key) || [];
    list.push({ m, score }); list.sort((a, b) => b.score - a.score); groups.set(key, list.slice(0, 3));
  }
  helpers.splice(0, helpers.length, ...[...groups.values()].flatMap((list) => list.map((x) => x.m)));
  const solidFrac = (id) => ctx.lookup(id).form !== 'liquid';

  /** the plain plan for a list of ingredients (finish() adds the stages) */
  const plainPlan = (ing) => /** @type {import('./predict.js').BrewPlan} */ ({ ingredients: ing, heatTo: Math.max(20, o.serve), coolTo: Math.min(20, o.serve), serveTemp: o.serve, knead: ing.some((i) => solidFrac(i.id)), crush: ing.some((i) => solidFrac(i.id) && ctx.lookup(i.id).form === 'solid'), hold: 8 });
  /** a plan from shares of the brew per ingredient (the solvent fills the rest) */
  const build = (x) => {
    let used = 0, solids = 0;
    for (const [id, f] of x) { used += f; if (solidFrac(id)) solids += f; }
    // at least half of the brew must be liquid, or the grains form a paste that cannot steep
    if (used > 0.97 || solids > 0.5) return null;
    const ing = [];
    const ns = Math.round(n * (1 - used));
    if (ns >= 2) ing.push({ id: solvent.id, n: ns });
    for (const [id, f] of x) {
      const c = Math.round(n * f);
      if (c < 1) continue;
      ing.push({ id, n: c });
    }
    if (ing.length < 2) return null;
    return plainPlan(ing);
  };
  /**
   * No ingredient may be steeped only at the very edge of its window: in the
   * real cauldron the cooler edges of the brew lag behind the mean, and a
   * slow herb held there extracts only in part. An ingredient is fine when
   * some held stage (the steep, or the awakening hold) lies well inside its
   * window — or when none comes near it (then it is not counted on).
   */
  const edgeOk = (plan, ids) => {
    const held = [plan.steep ? plan.steep.T : null, plan.activate ? plan.heatTo : null, plan.activate ? plan.coolTo : null].filter((t) => t !== null);
    if (!held.length) return true;
    for (const id of ids) {
      const rx = ctx.world.reactions.find((r) => r.a === id && r.wet && r.products.length === 1 && /^rw_(extract|steep|infuse)/.test(r.id));
      if (!rx) continue;
      // a cold window's lagging edge is its warm end; a hot window's its cool end
      const cold = rx.maxT <= 20;
      const inside = held.some((t) => (cold ? t >= rx.minT + 1 && t <= rx.maxT - 2 : t >= rx.minT + 7 && t <= rx.maxT - 2));
      const edge = held.some((t) => (cold ? t > rx.maxT - 2 && t <= rx.maxT + 3 : t >= rx.minT - 3 && t < rx.minT + 7));
      if (edge && !inside) return false;
    }
    return true;
  };
  /** stage temperatures: preparation stays arcane-quiet; activation awakens the blend in a stage of its own */
  const finish = (plan) => {
    const ids = plan.ingredients.map((i) => i.id);
    if (stageT !== null) {
      plan.steep = { T: stageT, hold };
      plan.heatTo = Math.max(plan.heatTo, stageT);
      plan.coolTo = Math.min(plan.coolTo, stageT);
    }
    if (!edgeOk(plan, ids)) return null;
    const pre = predictPlan(ctx.world, ctx.lookup, plan);
    if (arcaneRegime([...ids, ...Object.keys(pre.composition)], ctx.lookup, temps) !== 'quiet') return null;
    if (plan.heatTo > ctx.cap.maxFlame - 40 || plan.coolTo < ctx.cap.minCool + 2) return null;
    if (!o.activation) return pre.awakened ? null : pre;
    // activation stage: past the threshold of the mixed blend, reachable both ways
    if (pre.threshold === null) return null;
    const Ta = thresholdToCelsius(pre.threshold);
    if (pre.threshold >= 0) {
      const T = Math.ceil(Ta + ACTIVATION_MARGIN + 4);
      const boil = Math.min(...plan.ingredients.map((i) => ctx.lookup(i.id).boil).filter((b) => isFinite(b)), 400);
      if (T > Math.min(ctx.cap.maxFlame - 40, boil - 6)) return null;
      plan.heatTo = Math.max(plan.heatTo, T);
    } else {
      const T = Math.floor(Ta - ACTIVATION_MARGIN - 4);
      // the bulk of a brew lags far behind the frost plate (freezing water
      // gives up a lot of latent heat), so stay well inside its reach
      if (T < 20 + 0.55 * (ctx.cap.minCool - 20)) return null;
      plan.coolTo = Math.min(plan.coolTo, T);
    }
    plan.hold = 18;
    plan.activate = true;
    if (!edgeOk(plan, ids)) return null;
    const pred = predictPlan(ctx.world, ctx.lookup, plan);
    return pred.awakened ? pred : null;
  };

  // ---- the linear model: raw (pre-law) effects per unit share of the brew
  /** @type {Map<string, number[]>} */
  const model = new Map();
  const probe = (m, f) => {
    const plan = build(new Map([[m.id, f]]));
    if (!plan) return null;
    if (stageT !== null) {
      plan.steep = { T: stageT, hold };
      plan.heatTo = Math.max(plan.heatTo, stageT);
      plan.coolTo = Math.min(plan.coolTo, stageT);
    }
    const pr = predictPlan(ctx.world, ctx.lookup, plan);
    const share = (plan.ingredients.find((i) => i.id === m.id)?.n || 0) / pr.totalParticles;
    if (share <= 0) return null;
    const g = o.activation && isMagical(m) ? m.arcane.gain : 1;
    return pr.raw.map((v) => (v / share) * g);
  };
  const vecOf = (m, f = 0.2) => {
    if (!model.has(m.id)) model.set(m.id, probe(m, f) || new Array(NE).fill(0));
    return /** @type {number[]} */ (model.get(m.id));
  };
  const laws = ctx.world.laws || [];
  const tmp = new Float64Array(NE);
  /** what the model says a set of shares gives (laws, oppositions, saturation) */
  const outcome = (ids, xs) => {
    tmp.fill(0);
    for (let j = 0; j < ids.length; j++) {
      const v = /** @type {number[]} */ (model.get(ids[j]));
      for (let k = 0; k < NE; k++) tmp[k] += xs[j] * v[k];
    }
    return interact(tmp, laws);
  };
  const wIdx = wanted.map((w) => EFFECT_INDEX[w.key]);
  const free = EFFECT_KEYS.map((k) => exclude.includes(k));
  /** how far a modelled outcome is from the order (0 = ideal) */
  const badness = (e) => {
    let b = 0;
    wanted.forEach((w, j) => {
      const v = w.sign * e[wIdx[j]];
      const lo = w.target * 1.15, hi = w.target * 1.45;
      if (v < lo) b += 40 * ((lo - v) / w.target) ** 2;
      else if (v > hi) b += 8 * ((v - hi) / w.target) ** 2;
    });
    for (let k = 0; k < NE; k++) {
      if (free[k]) continue;
      const a = Math.abs(e[k]);
      b += 0.05 * a * a + (a > 0.3 ? 6 * (a - 0.3) ** 2 : 0);
    }
    return b;
  };
  /** proportion a set of ingredients on the model (coordinate descent with projection) */
  const solve = (ids, start) => {
    const xs = start.slice();
    const solid = ids.map(solidFrac);
    const feasible = () => {
      let used = 0, sol = 0;
      for (let j = 0; j < xs.length; j++) { if (xs[j] < 0) return false; used += xs[j]; if (solid[j]) sol += xs[j]; }
      return used <= 0.92 && sol <= 0.48;
    };
    const cost = () => badness(outcome(ids, xs)) + 0.02 * xs.reduce((a, v) => a + v, 0);
    let best = cost(), step = 0.08;
    for (let it = 0; it < 220 && step > 0.0015; it++) {
      let moved = false;
      for (let j = 0; j < xs.length; j++) {
        for (const d of [step, -step]) {
          const old = xs[j];
          xs[j] = Math.max(0, old + d);
          if (xs[j] !== old && feasible()) {
            const c = cost();
            if (c < best - 1e-9) { best = c; moved = true; continue; }
          }
          xs[j] = old;
        }
      }
      if (!moved) step *= 0.5;
    }
    return { xs, cost: best };
  };
  const good = (e) => wanted.every((w, j) => w.sign * e[wIdx[j]] >= w.target * 1.04) && EFFECT_KEYS.every((k, i) => free[i] || Math.abs(e[i]) <= PURITY_LIMIT * 0.45);

  // ---- first guess on the guild's opposing pairs, where the problem is
  // convex: fire − frost, life − death − 2·poison (life mends poison two to
  // one) and signed acidity are each a single linear channel, as are the
  // effects nothing opposes. Every candidate goes in at once; least squares
  // with exact coordinate steps picks the carriers' and helpers' shares.
  for (const m of uniq) vecOf(m);
  if (uniq.some((m) => model.get(m.id).every((v) => v === 0))) return null;
  const E_ = EFFECT_INDEX;
  const singles = EFFECT_KEYS.filter((k) => !['fire', 'frost', 'vitality', 'death', 'toxicity', 'acidity'].includes(k));
  const net = (v) => [v[E_.fire] - v[E_.frost], v[E_.vitality] - v[E_.death] - 2 * v[E_.toxicity], v[E_.acidity], ...singles.map((k) => v[E_[k]])];
  const NC = 3 + singles.length;
  const tgt = new Array(NC).fill(0), wt = new Array(NC).fill(6);
  const chan = { fire: [0, 1], frost: [0, -1], vitality: [1, 1], acidity: [2, 1], ...Object.fromEntries(singles.map((k, i) => [k, [i + 3, 1]])) };
  const convex = wanted.every((w) => chan[w.key]);
  for (const w of wanted) {
    if (!chan[w.key]) continue;
    const [c, sg] = chan[w.key];
    tgt[c] = sg * w.sign * w.target * 1.25;
    wt[c] = 40 / (w.target * w.target);
  }
  let ids = uniq.map((m) => m.id);
  let xs0 = ids.map(() => 0.25);
  if (convex) {
    const cand = [...uniq, ...helpers];
    for (const m of helpers) vecOf(m);
    const M = cand.map((m) => net(model.get(m.id)));
    const solid = cand.map((m) => solidFrac(m.id));
    const x = /** @type {number[]} */ (cand.map((m) => (uniq.includes(m) ? 0.15 : 0)));
    const r = tgt.map((t, c) => cand.reduce((acc, m, j) => acc + M[j][c] * x[j], 0) - t);
    for (let sweep = 0; sweep < 300; sweep++) {
      let change = 0;
      let totalUsed = x.reduce((n, v) => n + v, 0), totalSolid = x.reduce((n, v, j) => n + (solid[j] ? v : 0), 0);
      for (let j = 0; j < cand.length; j++) {
        let g = 0.02, hh = 0;
        for (let c = 0; c < NC; c++) { g += 2 * wt[c] * M[j][c] * r[c]; hh += 2 * wt[c] * M[j][c] * M[j][c]; }
        if (hh <= 1e-12) continue;
        let nx = Math.max(0, x[j] - g / hh);
        // keep within the brew: at most 92 % ingredients, at most 48 % grains
        const used = totalUsed - x[j], sol = totalSolid - (solid[j] ? x[j] : 0);
        nx = Math.min(nx, 0.92 - used, solid[j] ? 0.48 - sol : 1);
        nx = Math.max(0, nx);
        const d = nx - x[j];
        if (d === 0) continue;
        for (let c = 0; c < NC; c++) r[c] += M[j][c] * d;
        x[j] = nx;
        totalUsed += d; if (solid[j]) totalSolid += d;
        change = Math.max(change, Math.abs(d));
      }
      if (change < 1e-5) break;
    }
    // the carriers and the strongest few helpers
    const keep = cand.map((m, j) => ({ m, f: x[j], c: uniq.includes(m) })).filter((k) => k.c || k.f * n >= 0.6)
      .sort((p, q) => (q.c ? 1 : 0) - (p.c ? 1 : 0) || q.f - p.f).slice(0, Math.max(uniq.length + 1, 5));
    ids = keep.map((k) => k.m.id);
    xs0 = keep.map((k) => Math.max(k.f, 0.01));
  }
  // then the full model: the world's laws, saturation and what may be tolerated
  let sol = solve(ids, xs0);
  if (!good(outcome(ids, sol.xs)) && !convex) {
    // effects the pairs cannot express (poison or death wanted): add the best single helper
    const cands = helpers.filter((m) => !ids.includes(m.id)).slice(0, 12);
    let bestTry = null;
    for (const m of cands) {
      vecOf(m);
      const ids2 = [...ids, m.id];
      const t = solve(ids2, [...sol.xs, 0.05]);
      if (!bestTry || t.cost < bestTry.sol.cost) bestTry = { ids: ids2, sol: t };
    }
    if (bestTry && bestTry.sol.cost < sol.cost * 0.95) { ids = bestTry.ids; sol = bestTry.sol; }
  }

  // ---- build the real plan, check it with the predictor and refine the model
  const accept = (pred) => wanted.every((w, j) => {
    const v = w.sign * pred.effects[wIdx[j]];
    return v >= w.target * 1.02 && v <= w.target * 1.7;
  }) && unwantedMax(pred.effects, exclude).value <= PURITY_LIMIT * 0.6;
  const toMap = (xs) => new Map(/** @type {[string, number][]} */ (ids.map((id, j) => [id, xs[j]])).filter(([, f]) => f * n >= 0.5));
  let best = null;
  for (let it = 0; it < 3; it++) {
    const plan = build(toMap(sol.xs));
    if (!plan) break;
    const pred = finish(plan);
    if (!pred) break;
    if (accept(pred)) return { plan, pred };
    const err = planError(pred, wanted, wIdx, exclude);
    if (!best || err < best.err) best = { plan, pred, err };
    // refine the model where the brew actually is, and solve again
    for (const id of ids) {
      const f = sol.xs[ids.indexOf(id)];
      const v = probe(ctx.lookup(id), Math.max(0.03, f));
      if (v) model.set(id, v);
    }
    sol = solve(ids, sol.xs);
  }
  // close enough: particle by particle, one more or one less of each ingredient
  if (!best || best.err > 2) return null;
  let cur = best;
  for (let step = 0; step < 5; step++) {
    let better = null;
    for (let j = 0; j < cur.plan.ingredients.length; j++) {
      for (const d of [1, -1]) {
        const ing = cur.plan.ingredients.map((i) => ({ ...i }));
        ing[j].n += d;
        if (ing[j].n < 1) continue;
        const p2 = plainPlan(ing);
        const r2 = finish(p2);
        if (!r2) continue;
        const err = planError(r2, wanted, wIdx, exclude);
        if (err < (better ? better.err : cur.err) - 1e-6) better = { plan: p2, pred: r2, err };
      }
    }
    if (!better) break;
    cur = better;
    if (accept(cur.pred)) return { plan: cur.plan, pred: cur.pred };
  }
  return null;
}

/** How far a predicted brew misses the order (for particle-level tuning). */
function planError(pred, wanted, wIdx, exclude) {
  let e = 0;
  wanted.forEach((w, j) => {
    const v = w.sign * pred.effects[wIdx[j]];
    if (v < w.target * 1.08) e += 4 * (w.target * 1.08 - v) / w.target;
    else if (v > w.target * 1.6) e += (v - w.target * 1.6) / w.target;
  });
  for (let k = 0; k < NE; k++) {
    if (exclude.includes(EFFECT_KEYS[k])) continue;
    const a = Math.abs(pred.effects[k]);
    if (a > PURITY_LIMIT * 0.5) e += a - PURITY_LIMIT * 0.5;
  }
  return e;
}

// ------------------------------------------------------------------ generation

/** Requests a customer may bring at a tier (recently sold ones only when there is nothing else). */
function requestsFor(arch, tier, event, recent = []) {
  let list = REQUESTS.filter((r) => r.minTier <= tier && r.who.includes(arch.key));
  const bonus = { winter: ['warming', 'hearth', 'forgefire'], plague: ['healing', 'recovery', 'fevercure'], conclave: ['insight', 'meditation', 'shapeshift'], festival: ['love', 'blessing', 'hearth'] }[event];
  if (bonus) list = list.concat(REQUESTS.filter((r) => bonus.includes(r.id) && r.minTier <= tier));
  const fresh = list.filter((r) => !recent.slice(0, 4).some((s) => s && s.split('+')[0] === r.id));
  return fresh.length ? fresh : list;
}

// ------------------------------------------------------------------ practical feasibility

/**
 * Can the shop lay hands on `ml` of an ingredient today: on the shelf,
 * gatherable, or legally buyable? (Without supply information — tests, the
 * sandbox — everything available counts.)
 * @param {CommissionContext} ctx @param {string} id @param {number} ml
 */
function obtainable(ctx, id, ml) {
  if (!ctx.supply) return true;
  if (id === ctx.world.roles.water) return true;
  return ctx.supply(id) >= ml || (!!ctx.buyable && ctx.buyable(id));
}

/** Extra the shop needs beyond the bottle: about three test doses and what sticks to the pot. */
export const TEST_MARGIN = 1.15;

/**
 * Check a plan against what the shop can really get: every ingredient on
 * the shelf, gathered today, or bought (gather-only ones cannot be), and the
 * purchases affordable.
 * @param {import('./predict.js').BrewPlan} plan @param {CommissionContext} ctx
 * @returns {{ok:boolean, cost:number, short:string[], gather:{id:string, ml:number}[], buy:{id:string, ml:number}[]}}
 */
export function checkSupply(plan, ctx) {
  const out = { ok: true, cost: 0, short: /** @type {string[]} */ ([]), gather: /** @type {{id:string, ml:number}[]} */ ([]), buy: /** @type {{id:string, ml:number}[]} */ ([]) };
  if (!ctx.supply) return out;
  /** @type {Map<string, number>} */
  const need = new Map();
  for (const ing of plan.ingredients) need.set(ing.id, (need.get(ing.id) || 0) + ing.n * SIM.ML_PER_PARTICLE * TEST_MARGIN);
  for (const [id, ml] of need) {
    if (id === ctx.world.roles.water) continue;
    const free = ctx.supply(id);
    const stock = ctx.stock ? ctx.stock(id) : 0;
    if (free >= ml) { if (ml > stock) out.gather.push({ id, ml: Math.ceil((ml - stock) / 5) * 5 }); continue; }
    if (free > stock) out.gather.push({ id, ml: Math.ceil((free - stock) / 5) * 5 });
    if (ctx.buyable && ctx.buyable(id)) {
      const ml2 = Math.ceil((ml - free) / 100) * 100;
      out.buy.push({ id, ml: ml2 });
      out.cost += (ml2 / 100) * ctx.priceOf(id);
    } else out.short.push(id);
  }
  // a little stipend is always within reach (state.js claimRelief)
  if (out.short.length || out.cost > (ctx.coins ?? Infinity) + 20) out.ok = false;
  return out;
}

// ------------------------------------------------------------------ techniques

/**
 * What customers can ask for beyond the plain request. Each technique is an
 * outcome the counter can judge, tied to a campaign mechanic (mechanics.js);
 * it is applied to the hidden plan and its prediction and returns
 * requirements (and possibly a changed plan), or null when it cannot honestly
 * be asked of this brew.
 * @typedef {Object} Technique
 * @property {string} id
 * @property {string} name        what the player learns to do
 * @property {string} mechanic    the campaign mechanic it exercises
 * @property {number} minTier
 * @property {string[]} who       archetypes who care about it
 * @property {string} lesson      one line: why it matters and what can achieve it, shown with the order
 * @property {(c:any)=>any} apply
 */

/** @type {Technique[]} */
export const TECHNIQUES = [
  {
    id: 'strong', name: 'Strong and compact', mechanic: 'concentration', minTier: 2, who: ['hunter', 'traveler', 'knight', 'healer', 'wizard', 'witch', 'blacksmith'],
    lesson: 'Stronger than a plain brew of these herbs gives. Boil water off with the lid open — the magic stays, but its side effects grow with it and must be cancelled harder — or brew with more herb and less water.',
    apply: ({ plan, pred, ctx, rng, wanted, exclude }) => {
      const water = ctx.world.roles.water;
      const nW = plan.ingredients.filter((i) => i.id === water).reduce((a, i) => a + i.n, 0);
      const tot = plan.ingredients.reduce((a, i) => a + i.n, 0);
      if (nW < tot * 0.35 || plan.ingredients.some((i) => i.id === ctx.world.roles.spirit)) return null;
      const frac = Math.round(rng.range(0.2, 0.3) * 100) / 100;
      const p2 = { ...plan, reduce: { frac } };
      const r2 = predictPlan(ctx.world, ctx.lookup, p2);
      // only where the prediction is trustworthy: boiling must not start a reaction of its own,
      // and the awakening state must be what the plain plan already had
      if (r2.reactions.length !== pred.reactions.length || r2.awakened !== pred.awakened) return null;
      if (unwantedMax(r2.effects, exclude).value > PURITY_LIMIT * 0.6) return null;
      if (!wanted.every((w) => w.sign * r2.effects[EFFECT_INDEX[w.key]] >= w.sign * pred.effects[EFFECT_INDEX[w.key]] * 1.25)) return null;
      return { plan: p2, pred: r2, strengthen: true, reqs: [], say: 'Make it strong and compact — a little goes a long way where I am going.' };
    },
  },
];

/** @param {string} id */
export function techniqueById(id) {
  return TECHNIQUES.find((t) => t.id === id);
}

/** Techniques of older orders under their current names (retired ones dropped). @param {string[]} ids */
export function migrateTechniques(ids) {
  return [...new Set(ids.map((t) => (t === 'concentrate' ? 'strong' : t)).filter((t) => techniqueById(t)))];
}

/**
 * Generate a commission.
 * @param {CommissionContext} ctx
 * @param {Rng} rng
 * @param {{tier?: number, archetype?: string, request?: string, contract?: boolean, techniques?: string[], simple?: boolean, patron?: any, recent?: string[]}} [opts]
 */
export function generateCommission(ctx, rng, opts = {}) {
  const tier = Math.max(0, Math.min(4, opts.tier ?? Math.min(4, ctx.rank)));
  const archetypes = ARCHETYPES.filter((a) => a.minRank <= ctx.rank);
  const archKey = opts.archetype || (opts.patron && opts.patron.archetype);
  for (let attempt = 0; attempt < (opts.simple ? 12 : 30); attempt++) {
    const arch = archKey ? archetypeOf(archKey) : rng.pick(archetypes);
    const bottleMl = [100, 150, 200, 250, 300][tier] * (opts.contract ? 1.5 : 1);
    const bottleN = Math.round(bottleMl / SIM.ML_PER_PARTICLE);
    const vessel = { pot: 310, copper: 440, grand: 600, small: 1400, medium: 2000, large: 2700 }[ctx.cap.size] || 310;
    const totalN = Math.min(Math.round(bottleN * rng.range(1.7, 2.3)), Math.floor(vessel * 0.45));
    let requests = opts.request ? [requestById(opts.request)].filter(Boolean) : requestsFor(arch, tier, ctx.event, opts.recent);
    if (opts.simple) requests = REQUESTS.filter((r) => r.minTier === 0 && r.fx.length === 1);
    if (!requests.length) continue;
    const com = effectCommission(rng.pick(requests), arch, tier, ctx, rng, totalN, bottleMl, bottleN, opts);
    if (com) return com;
  }
  return null;
}

/**
 * An effect request: pick targets for the tier, find a feasible hidden plan
 * (plain at low tiers; awakened when the targets are beyond what plain
 * ingredients reach) that the shop can actually supply, add the customer's
 * techniques, then verify the predicted bottle earns full marks.
 */
function effectCommission(req, arch, tier, ctx, rng, totalN, bottleMl, bottleN, opts) {
  const [lo, hi] = TIER_TARGET[tier];
  // customers never ask for a serving temperature: the plan is bottled at room temperature
  const serve = 20;
  let found = null, activation = false, wanted = [], exclude = [], supply = null;
  // ingredients the shop cannot get today are left out and the search runs again
  const local = { ...ctx, avoid: new Set(ctx.avoid || []) };
  // the sampled strength first, then the tier's mildest, then (for masters,
  // whose orders combine several balanced effects) a gentler one, before giving up
  const mains = opts.simple ? [lo] : [Math.round(rng.range(lo, hi)), lo];
  if (tier >= 3) mains.push(TIER_TARGET[tier - 1][0], TIER_TARGET[tier - 2][0]);
  outer: for (const main of mains) {
    wanted = req.fx.map((f, k) => ({ key: f.key, sign: f.sign || 1, target: k === 0 ? main : Math.max(4, Math.round(main * (f.share || 0.6) * rng.range(0.9, 1.1))) }));
    exclude = [...wanted.map((w) => w.key), ...(req.tolerate || [])];
    for (let tries = 0; tries < 3; tries++) {
      // plain first; awakening only when plain cannot reach it (never for apprentices)
      found = searchPlan(wanted, exclude, local, rng, totalN, { activation: false, serve });
      activation = false;
      if (!found && tier >= 2) {
        found = searchPlan(wanted, exclude, local, rng, totalN, { activation: true, serve });
        activation = !!found;
      }
      if (!found) break;
      supply = checkSupply(found.plan, local);
      if (supply.ok) break outer;
      // leave out what cannot be had (or the dearest purchase) and search again
      const drop = supply.short.length ? supply.short : supply.buy.sort((a, b) => b.ml * ctx.priceOf(b.id) - a.ml * ctx.priceOf(a.id)).slice(0, 1).map((x) => x.id);
      for (const id of drop) local.avoid.add(id);
      found = null;
    }
  }
  if (!found) return null;
  let { plan, pred } = found;
  const strict = arch.strict * (opts.contract ? 0.8 : 1) * (opts.simple ? 1.4 : 1);
  // ---- techniques: what this customer wants besides the effects
  const chosen = [];
  /** @type {Requirement[]} */
  const techReqs = [];
  let say = [];
  if (!opts.simple) {
    // a plain request is the rule; techniques add to it, more often as the customers grow demanding
    const n = tier <= 1 ? (rng.chance(0.35) ? 1 : 0) : tier === 2 ? (rng.chance(0.65) ? 1 : 0) : 1 + (rng.chance(0.4) ? 1 : 0);
    const forced = (opts.techniques || []).map(techniqueById).filter(Boolean);
    const pool = TECHNIQUES.filter((t) => t.minTier <= tier && !forced.includes(t));
    const weighted = rng.shuffle(pool).sort((a, b) => (b.who.includes(arch.key) ? 1 : 0) - (a.who.includes(arch.key) ? 1 : 0));
    for (const t of [...forced, ...weighted]) {
      if (chosen.length >= Math.max(n, forced.length)) break;
      const r = t.apply({ plan, pred, ctx: local, rng, tier, strict, wanted, exclude, request: req });
      if (!r) continue;
      if (r.plan) { plan = r.plan; pred = r.pred || predictPlan(ctx.world, ctx.lookup, plan); }
      // a technique that changes the brew must not break the order's purity
      if (unwantedMax(pred.effects, exclude).value > PURITY_LIMIT * 0.6) return null;
      techReqs.push(...r.reqs);
      chosen.push(t.id);
      if (r.say) say.push(r.say);
    }
    // a changed plan may need more of something, and must still be as strong as asked
    if (chosen.length && !checkSupply(plan, local).ok) return null;
    if (!wanted.every((w) => w.sign * pred.effects[EFFECT_INDEX[w.key]] >= w.target * 1.0)) return null;
  }
  // A requested technique is a constraint, not a suggestion: retry another
  // feasible plan when this candidate cannot support it.
  if ((opts.techniques || []).some((id) => !chosen.includes(id))) return null;
  /** @type {Requirement[]} */
  const reqs = [];
  for (const w of wanted) {
    const v = w.sign * pred.effects[EFFECT_INDEX[w.key]];
    reqs.push(effectRequirement(w.key, w.sign, Math.min(chosen.includes('strong') ? v * 0.85 : w.target, Math.max(w.target, v * 0.88))));
  }
  // an exacting master sometimes wants a measured dose, not just "enough"
  if (tier >= 3 && strict < 1 && rng.chance(0.4)) {
    const r0 = reqs[0], v = wanted[0].sign * pred.effects[EFFECT_INDEX[wanted[0].key]];
    if (wanted[0].sign > 0) {
      const tol = Math.max(3, Math.round(v * 0.2));
      Object.assign(r0, { kind: 'target', target: Math.round(v), tol, zero: tol * 3, label: `${Math.round(v) - tol}–${Math.round(v) + tol}%` });
    }
  }
  if (req.drunk !== false || (req.tolerate && req.tolerate.length < 9)) reqs.push(purityRequirement(exclude, opts.simple ? 3 : PURITY_LIMIT));
  reqs.push(...techReqs);
  const com = finalize({ style: req.id, request: req, title: req.title, arch, tier, ctx, rng, plan, pred, reqs, bottleMl, bottleN, opts, activation, techniques: chosen, say });
  if (com) com.supplies = supplyBrief(plan, local, wanted, exclude, supply);
  return com;
}

/**
 * What the order will take, as the shop can know it — never the hidden
 * plan: how much brew to make (bottle plus test doses), and for each wanted
 * effect the ingredients that carry it with where they can be had today.
 * @param {import('./predict.js').BrewPlan} plan @param {CommissionContext} ctx @param {{key:string, sign:number}[]} wanted @param {string[]} exclude @param {any} supply
 */
function supplyBrief(plan, ctx, wanted, exclude, supply) {
  const total = plan.ingredients.reduce((a, i) => a + i.n, 0) * SIM.ML_PER_PARTICLE;
  const carriers = wanted.map((w) => {
    const list = [...ctx.available].map(ctx.lookup).filter((m) => m && m.effects && !m.product && !m.remains && w.sign * ((m.effects || {})[w.key] || 0) >= 8)
      .map((m) => ({ id: m.id, where: ctx.supply ? (ctx.stock && ctx.stock(m.id) >= 40 ? 'shelf' : ctx.supply(m.id) >= 40 ? 'wilds' : ctx.buyable && ctx.buyable(m.id) ? 'market' : 'none') : 'shelf' }))
      .filter((c) => c.where !== 'none')
      .slice(0, 5);
    return { key: w.key, sign: w.sign, carriers: list };
  });
  return { brewMl: Math.round((total * TEST_MARGIN) / 10) * 10, carriers, purchases: supply ? Math.round(supply.cost * 10) / 10 : 0 };
}

/** The predicted bottle as the counter would measure it. */
function predictedMeasurement(pred, plan, ml) {
  return { ml, count: Math.round(ml / SIM.ML_PER_PARTICLE), lab: pred.lab, color: pred.color, temperature: plan.serveTemp ?? 20, effects: Array.from(pred.effects) };
}

/** Assemble, verify and price a commission. */
function finalize({ style, request, title, arch, tier, ctx, rng, plan, pred, reqs, bottleMl, bottleN, opts, activation, techniques = [], say = [] }) {
  const com = {
    id: 'q' + Math.floor(rng.next() * 1e9).toString(36),
    tier, style: [style, ...techniques.slice().sort()].join('+'), request: request ? request.id : null, contract: !!opts.contract, potionName: '', customer: null, dialogue: '',
    requirements: reqs, bottleMl, bottleN, budget: 0, reference: plan, techniques,
    predicted: { effects: Array.from(pred.effects), color: pred.color, reactions: pred.reactions, threshold: pred.threshold, awakened: pred.awakened },
    effectOrder: reqs.some((r) => r.effect), activation, hintCost: 0,
  };
  // the hidden plan must satisfy the customer by the counter's own rules
  const check = evaluatePotion(com, /** @type {any} */ (predictedMeasurement(pred, plan, bottleMl)));
  if (check.quality < 0.999) return null;
  const customer = makeCustomer(rng, arch);
  const cost = planCost(plan, ctx.priceOf) * (bottleN / pred.totalParticles) * 1.6;
  const eventBonus = ctx.event && ['winter', 'plague', 'conclave', 'festival'].includes(ctx.event) ? 1.15 : 1;
  // techniques pay: each is extra work, a stronger brew most of all
  const techPay = techniques.reduce((a, t) => a + (t === 'strong' ? 18 + 4 * tier : 5), 0);
  const budget = Math.round((14 + cost * (2.6 + 0.45 * tier) + 9 * tier + reqs.length * 5 + (com.effectOrder ? 10 : 0) + techPay + (activation ? 30 + 12 * tier : 0)) * arch.budget * eventBonus * (opts.contract ? 2.2 : 1));
  const potionName = (techniques.includes('strong') ? 'Concentrated ' : '') + (title || 'Potion');
  let greet = request ? rng.pick(request.story) : rng.pick(arch.greet).replace('{potion}', aOrAn(potionName.toLowerCase()) + ' ' + potionName.toLowerCase());
  if (say.length) greet += ' ' + say.join(' ');
  Object.assign(com, { potionName, customer, dialogue: greet, budget: Math.max(12, budget), hintCost: Math.max(3, Math.round(budget * 0.12)) });
  return com;
}

/** The two herbs of the tutorial's healing tonic: a healer that leaves frost, and a warming one that cancels it. */
export const TUTORIAL_HERBS = { healer: 'wild-silverleaf', warmer: 'wild-sunthistle' };

/**
 * Fixed, gentle first commission used by the tutorial: a warm healing tonic
 * of Silverleaf (healing with a frosty bite) balanced by Sunthistle (whose
 * fire cancels the frost and adds a little more healing).
 */
export function tutorialCommission(ctx, rng) {
  const R = ctx.world.roles;
  const { healer, warmer } = TUTORIAL_HERBS;
  const plan = { ingredients: [{ id: R.water, n: 22 }, { id: healer, n: 10 }, { id: warmer, n: 5 }], heatTo: 62, coolTo: 20, serveTemp: 20, steep: { T: 62, hold: 22 }, knead: true, crush: true, hold: 8 };
  const pred = predictPlan(ctx.world, ctx.lookup, plan);
  const vit = Math.max(4, Math.round(pred.effects[EFFECT_INDEX.vitality] * 0.7));
  const arch = archetypeOf('farmer');
  const customer = makeCustomer(rng, arch);
  customer.name = 'Old Mabry Hollins';
  const colorWord = describeColor(pred.color);
  const leaf = ctx.lookup(healer).name, sun = ctx.lookup(warmer).name;
  return {
    id: 'q-tutorial',
    tier: 0,
    style: 'healing',
    contract: false,
    tutorial: true,
    potionName: `${capitalize(colorWord)} Healing Tonic`,
    customer,
    dialogue: `Ah, a new alchemist! My old joints ache. Could you brew me a healing tonic? ${leaf} heals, they say, but it leaves a frosty bite — a little ${sun} should warm that away. Test that it truly heals, and that nothing else is in it!`,
    requirements: [
      { key: 'vitality', kind: 'min', target: vit, tol: 0, zero: Math.max(6, vit * 0.6), label: `at least ${vit}%`, effect: true },
      purityRequirement(['vitality'], 3),
    ],
    bottleMl: 100,
    bottleN: 20,
    budget: 30,
    reference: plan,
    predicted: { effects: Array.from(pred.effects), color: pred.color, reactions: pred.reactions, threshold: pred.threshold, awakened: pred.awakened },
    effectOrder: true,
    activation: false,
    hintCost: 0,
    techniques: [],
  };
}

/** @param {string} s */
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
/** @param {string} w */
function aOrAn(w) {
  return /^[aeiou]/i.test(w) ? 'an' : 'a';
}

export { unwantedMax };
