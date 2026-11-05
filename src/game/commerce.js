// The commercial side of a potion: what you claim it does, what the
// customer will pay for that claim, and what happens once they drink it.
//
//   identification — before selling, the alchemist writes a label: for each
//     effect, a value measured in a trial of this very batch, an estimate
//     from the guild's theory (with its uncertainty), "none", or nothing.
//     The game never fills in hidden truths; it only offers what the
//     player's own trials and theory say.
//   negotiation — the customer weighs the label against the order (with the
//     counter's own scoring), how far they trust it (trial evidence,
//     reputation, unknowns, how much proof this customer needs), the volume
//     and their temperament, and bargains over several rounds. The agreed
//     price is what is paid.
//   delivery — the customer then drinks the real potion. A day later they
//     come back: pleased (reputation, a tip, sometimes a friend with an
//     order), or with a complaint. A complaint is legitimate when the potion
//     or its label failed them, and sometimes dishonest from a customer who
//     simply wants money back. The player refunds, disputes (trial records of
//     the batch are the evidence) or turns them away.
// All of it is plain data on the game state, so it survives saving.

import { Rng, hashString } from '../core/rng.js';
import { EFFECT_KEYS, EFFECT_INDEX, NE, EFFECT_BY_KEY } from '../alchemy/effects.js';
import { evaluatePotion, strongestUnwanted, PROPERTY_LABELS } from './evaluate.js';
import { PURITY_LIMIT } from './requests.js';
import { serviceStatus } from './orders.js';
import { summarize, evidenceRank, EVIDENCE_TEXT } from './experiments.js';

/**
 * A claim about one effect.
 * @typedef {Object} Claim
 * @property {'value'|'none'|'unknown'} kind
 * @property {number} [value]      claimed concentration (percent; acidity signed)
 * @property {'trial'|'estimate'|'player'} source
 * @property {number} [spread]     uncertainty of an estimate (plus or minus)
 * @property {string} [record]     the trial record backing it
 * @property {number} [measured]   the tested reading of this batch, kept when the player edits the claim
 * @property {{level:string, n:number, r:number, u:number, s?:number}} [evidence] how well the trials back it (experiments.js summarize): u the ~95 % margin, s the standard deviation of the estimate
 */

/**
 * @typedef {Object} Label
 * @property {Record<string, Claim>} claims
 * @property {number} day
 * @property {boolean} [auto]  drafted by itself once the batch was tested (lab.js autoLabel)
 */

/**
 * Draft a label from what the player knows: trial readings of this vial or
 * batch where there are any, the guild theory elsewhere (marked as an
 * estimate), unknown where neither exists.
 * @param {{cert?:Record<string, number>, certRecords?:Record<string, string>, samples?:Record<string, any[]>}} vial
 * @param {ArrayLike<number>|null} theory naive theory for the batch (alchemy/effects.js theoryOf)
 * @param {number} day
 * @returns {Label}
 */
export function draftLabel(vial, theory, day) {
  /** @type {Record<string, Claim>} */
  const claims = {};
  const cert = vial.cert || {}, recs = vial.certRecords || {};
  const ev = evidenceOf(vial);
  for (let k = 0; k < NE; k++) {
    const key = EFFECT_KEYS[k];
    if (cert[key] !== undefined) {
      claims[key] = trialClaim(cert[key], recs[key], ev[key]);
    } else if (theory) {
      const v = theory[k];
      claims[key] = Math.abs(v) < 0.6 ? { kind: 'none', source: 'estimate', spread: 1 } : { kind: 'value', value: Math.round(v), source: 'estimate', spread: Math.round(2 + 0.3 * Math.abs(v)) };
    } else claims[key] = { kind: 'unknown', source: 'estimate' };
  }
  return { claims, day };
}

/**
 * New trial readings of the vial fill in its label: every claim the player
 * did not write themselves takes the measured value.
 * @param {Label} label @param {Record<string, number>} values @param {string} record trial record id
 */
export function applyTrials(label, values, record, evidence = {}) {
  for (const [key, v] of Object.entries(values)) {
    const c = label.claims[key];
    const t = trialClaim(v, record, evidence[key]);
    if (c && c.source === 'player' && !sameClaim(c, t)) {
      // the player's own claim stays, but the label now knows the reading
      c.measured = t.measured;
      c.record = record;
      if (t.evidence) c.evidence = t.evidence;
      continue;
    }
    label.claims[key] = t;
  }
  return label;
}

/**
 * The evidence behind each tested effect of a vial (or bottle): level,
 * readings, rabbits and margin, from its own samples.
 * @param {{samples?:Record<string, any[]>, cert?:Record<string, number>}} vial
 * @returns {Record<string, {level:string, n:number, r:number, u:number, s?:number}>}
 */
export function evidenceOf(vial) {
  /** @type {Record<string, {level:string, n:number, r:number, u:number, s?:number}>} */
  const out = {};
  if (!vial || !vial.samples) {
    for (const k of Object.keys((vial && vial.cert) || {})) out[k] = { level: 'preliminary', n: 1, r: 1, u: 0 };
    return out;
  }
  const s = summarize(vial.samples);
  for (const k of Object.keys(s.values)) out[k] = { level: s.level[k], n: s.n[k], r: s.rabbits[k], u: s.unc[k], s: sigmaOfMargin(s.unc[k]) };
  return out;
}

/** The standard deviation behind a ~95 % margin (summarize's unc is 1.96 σ). @param {number} u */
const sigmaOfMargin = (u) => Math.round((u / 1.96) * 10) / 10;

/**
 * Accuracy stars: 0 to 3 as the standard deviation of a tested reading
 * narrows against the reading itself (small readings count against 5 %, so
 * "none" earns its stars like any other value). One reading never earns a
 * star; two earn one, three or four on more than one rabbit two, and about
 * six on two or three rabbits all three.
 */
export const STAR_STEPS = [0.26, 0.19, 0.14];
export const MAX_STARS = STAR_STEPS.length;

/** Stars for a relative standard deviation. @param {number} rel */
const starsOf = (rel) => STAR_STEPS.filter((t) => rel <= t).length;

/** The standard deviation of a value relative to the value itself (at least 5 %). @param {number} value @param {number} sigma */
const relSigma = (value, sigma) => sigma / Math.max(5, Math.abs(value));

/** Stars for a value read with standard deviation `sigma`. @param {number} value @param {number} sigma */
export function accuracyStars(value, sigma) {
  return starsOf(relSigma(value, sigma));
}

/** The standard deviation of a claim's tested reading, or null if it has none. @param {Claim} c */
export function claimSigma(c) {
  if (!c || !c.evidence) return null;
  if (c.evidence.s !== undefined) return c.evidence.s;
  // older evidence without its readings has no margin to go by
  return c.evidence.u ? sigmaOfMargin(c.evidence.u) : null;
}

/** Is this a claim backed by several readings of the batch? @param {Claim} c */
const wellTested = (c) => c.source === 'trial' && claimSigma(c) !== null && !(c.evidence && c.evidence.n < 2);

/**
 * How accurate a claim is (0…3 stars): a tested claim by its standard
 * deviation; anything else — an estimate, or the player's own figure —
 * none. Null for "no claim".
 * @param {Claim} c
 */
export function claimStars(c) {
  if (!c || c.kind === 'unknown') return null;
  if (!wellTested(c)) return 0;
  return accuracyStars(c.measured ?? c.value ?? 0, /** @type {number} */ (claimSigma(c)));
}

/**
 * How accurate a whole label is: the mean of the relative standard
 * deviations of its tested effects, each weighted by its measured mean (so
 * a strong effect counts for more than a trace, and "none" barely at all).
 * A label with no effect tested more than once earns none; null when it
 * claims nothing at all.
 * @param {Label} label
 */
export function labelStars(label) {
  let any = false, num = 0, den = 0;
  for (const c of Object.values((label && label.claims) || {})) {
    if (!c || c.kind === 'unknown') continue;
    any = true;
    if (!wellTested(c)) continue;
    const v = c.measured ?? c.value ?? 0;
    const w = Math.max(1, Math.abs(v));
    num += w * relSigma(v, /** @type {number} */ (claimSigma(c)));
    den += w;
  }
  if (!any) return null;
  return den > 0 ? starsOf(num / den) : 0;
}

/** A claim made from a trial reading. @param {number} v @param {string} [record] @param {{level:string, n:number, r:number, u:number, s?:number}} [evidence] @returns {Claim} */
export function trialClaim(v, record, evidence) {
  const measured = Math.round(v * 10) / 10;
  const ev = evidence ? { evidence } : {};
  return Math.abs(v) < PURITY_LIMIT ? { kind: 'none', source: 'trial', record, measured, ...ev } : { kind: 'value', value: measured, source: 'trial', record, measured, ...ev };
}

/** Do two claims say the same thing? @param {Claim} a @param {Claim} b */
export function sameClaim(a, b) {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'value' || Math.abs((a.value || 0) - (b.value || 0)) < 0.05;
}

/**
 * The player edits a claim: step it up or down, declare it absent, or make
 * no claim. A claim that ends where this batch was measured is a tested
 * claim again. Stepping up from "none" jumps past the purity line; only
 * acidity can be claimed below zero (alkaline).
 * @param {Claim} c @param {string} key @param {'up'|'down'|'none'|'unknown'|'tested'} op
 * @returns {Claim}
 */
export function editClaim(c, key, op) {
  const keep = { record: c.record, measured: c.measured, ...(c.evidence ? { evidence: c.evidence } : {}) };
  const tested = c.measured !== undefined ? trialClaim(c.measured, c.record, c.evidence) : null;
  if (op === 'tested') return tested || c;
  if (op === 'unknown') return { kind: 'unknown', source: 'player', ...keep };
  /** @type {Claim} */
  let next;
  if (op === 'none') next = { kind: 'none', source: 'player', ...keep };
  else {
    const d = op === 'up' ? 1 : -1;
    const signed = key === 'acidity';
    let nv = Math.round(((c.kind === 'value' ? c.value || 0 : 0) + d) * 10) / 10;
    if (c.kind !== 'value' && Math.abs(nv) < PURITY_LIMIT) nv = d > 0 ? 2 : signed ? -2 : 0;
    if (!signed) nv = Math.max(0, nv);
    next = Math.abs(nv) < PURITY_LIMIT ? { kind: 'none', source: 'player', ...keep } : { kind: 'value', value: nv, source: 'player', ...keep };
  }
  return tested && sameClaim(next, tested) ? tested : next;
}

/** The effects a label claims (unknown counts as nothing claimed). @param {Label} label */
export function claimedEffects(label) {
  const e = new Array(NE).fill(0);
  for (let k = 0; k < NE; k++) {
    const c = label.claims[EFFECT_KEYS[k]];
    if (c && c.kind === 'value') e[k] = c.value || 0;
  }
  return e;
}

/**
 * The effects that matter for an order: those it asks for and, with a purity
 * rule, every other one too.
 * @param {any} com
 */
export function relevantEffects(com) {
  const keys = new Set();
  for (const r of com.requirements) {
    if (EFFECT_INDEX[r.key] !== undefined) keys.add(r.key);
    if (r.key === 'purity') for (const k of EFFECT_KEYS) if (!(r.exclude || []).includes(k)) keys.add(k);
  }
  return [...keys];
}

/** How much a tested claim is worth to a customer, by the evidence behind it (an untested one is worth nothing). */
export const EVIDENCE_WEIGHT = { preliminary: 0.45, repeated: 0.7, corroborated: 0.9, certified: 1 };

/** @param {Claim|undefined} c */
function claimWeight(c) {
  if (!c || c.source !== 'trial') return 0;
  return EVIDENCE_WEIGHT[(c.evidence && c.evidence.level) || 'preliminary'] ?? 0.45;
}

/**
 * How far a customer trusts a label for their order (0.3…1.05), and why.
 * Tested claims count by the evidence behind them: a single reading is
 * worth less than readings repeated, and those less than readings
 * corroborated on several rabbits.
 * @param {any} com @param {Label} label @param {number} rank
 */
export function trustReport(com, label, rank) {
  const keys = relevantEffects(com);
  const proof = com.customer.persona ? com.customer.persona.proof : 0.5;
  if (!keys.length) return { trust: Math.min(1.05, 0.85 + 0.04 * rank), evidence: 1, unknown: 0, proof, reasons: ['nothing magical to prove'] };
  let proven = 0, unknown = 0, weak = 0;
  for (const k of keys) {
    const c = label.claims[k];
    if (!c || c.kind === 'unknown') unknown++;
    const w = claimWeight(c);
    proven += w;
    if (w > 0 && w < 0.7) weak++;
  }
  const evidence = proven / keys.length;
  const t = 0.5 + 0.05 * rank + evidence * (0.25 + 0.3 * proof) - (unknown / keys.length) * (0.2 + 0.4 * proof) - (1 - evidence) * 0.15 * proof;
  const reasons = [];
  if (evidence >= 0.85) reasons.push('your trials back the label well');
  else if (evidence > 0) reasons.push(weak ? `${weak} of the claims rest on a single reading` : 'only part of the label is tested');
  else reasons.push('nothing on the label is tested');
  if (unknown) reasons.push(`${unknown} effect${unknown > 1 ? 's' : ''} left unknown`);
  if (proof >= 0.8) reasons.push('this customer wants proof');
  if (rank >= 2) reasons.push('your guild rank speaks for you');
  return { trust: Math.max(0.3, Math.min(1.05, t)), evidence, unknown, proof, reasons };
}

/** @param {any} com @param {Label} label @param {number} rank */
export function labelTrust(com, label, rank) {
  return trustReport(com, label, rank).trust;
}

/**
 * The order's wanted effects that a demanding customer will only take on
 * trial evidence of this batch — strong enough evidence: a customer who
 * insists on proof wants readings repeated (not one dose), and the most
 * exacting want them corroborated on more than one rabbit. With a purity
 * rule they also want the absence of everything else tested (one trial on
 * a rabbit reads every effect at once).
 * @param {any} com @param {Label} label
 * @returns {string[]}
 */
export function unprovenWanted(com, label) {
  return proofGaps(com, label).map((g) => g.key);
}

/**
 * What a demanding customer still lacks, effect by effect, with what would
 * satisfy them.
 * @param {any} com @param {Label} label
 * @returns {{key:string, need:string, have:string}[]}
 */
export function proofGaps(com, label) {
  const proof = com.customer.persona ? com.customer.persona.proof : 0.5;
  if (proof < 0.8) return [];
  const need = proof >= 0.92 ? 'corroborated' : 'repeated';
  const out = [];
  for (const r of com.requirements) {
    if (!r.effect || r.key === 'purity') continue;
    const c = label.claims[r.key];
    const have = c && c.source === 'trial' ? (c.evidence && c.evidence.level) || 'preliminary' : 'untested';
    if (have === 'untested' || evidenceRank(have) < evidenceRank(need)) out.push({ key: r.key, need, have });
  }
  const purity = com.requirements.find((r) => r.key === 'purity');
  if (purity) {
    for (const k of EFFECT_KEYS) {
      if ((purity.exclude || []).includes(k)) continue;
      const c = label.claims[k];
      if (!c || c.source !== 'trial') { out.push({ key: k, need: 'preliminary', have: 'untested' }); }
    }
  }
  return out;
}

export { EVIDENCE_TEXT };

/**
 * The bottle as the customer understands it: what they can see, taste and
 * feel (colour, temperature, thickness…) is real; the effects are the label's.
 * @param {any} m measurement of the vial @param {Label} label
 */
export function claimedMeasurement(m, label) {
  return { ...m, effects: claimedEffects(label) };
}

/**
 * @typedef {Object} Negotiation
 * @property {number} round
 * @property {number} patience
 * @property {number} reservation  most this customer will pay (hidden)
 * @property {number} offer        their current offer
 * @property {number} fit          how well the claims meet the order (0..1)
 * @property {number} trust
 * @property {{k:string, v:number, text:string}[]} [reasons]  what their valuation rests on (shown to the player)
 * @property {'open'|'deal'|'left'} state
 * @property {number} [price]
 * @property {{who:'you'|'them', text:string, coins?:number}[]} log
 * @property {string} [vialId]     the bottle being bargained over (talks resume on it)
 * @property {string} [labelKey]   the label it was offered with
 */

/**
 * Open the bargaining over a vial for the current order.
 * @param {any} com @param {any} vial (with .m measurement and .ml) @param {Label} label @param {number} rank
 * @returns {Negotiation}
 */
export function openNegotiation(com, vial, label, rank) {
  const persona = com.customer.persona || { haggle: 0.5, patience: 3, honesty: 0.85, proof: 0.5 };
  const rng = new Rng(hashString(`${com.id}:${vial.id}:haggle`));
  const fitEv = evaluatePotion(com, /** @type {any} */ (claimedMeasurement({ ...vial.m, ml: vial.ml }, label)));
  const fit = fitEv.quality;
  const tr = trustReport(com, label, rank);
  const trust = tr.trust;
  const qty = Math.min(1, vial.ml / com.bottleMl);
  const reservation = Math.round(com.budget * serviceStatus(com).payment * Math.pow(fit, 1.3) * trust * Math.pow(qty, 1.4) * rng.range(0.92, 1.08) * 10) / 10;
  const offer = Math.round(reservation * (0.58 + 0.27 * (1 - persona.haggle)) * 10) / 10;
  // why they value it as they do, in their terms (never the hidden price)
  const misses = fitEv.rows.filter((r) => r.score < 0.999).map((r) => r.req.key);
  const reasons = [
    { k: 'fit', v: Math.round(fit * 100), text: fit >= 0.999 ? 'the label and what they see meet the whole order' : `short on ${misses.map((m) => String(PROPERTY_LABELS[m] || m).toLowerCase()).join(', ')}` },
    { k: 'trust', v: Math.round(trust * 100), text: tr.reasons.join('; ') },
    { k: 'quantity', v: Math.round(qty * 100), text: qty >= 0.98 ? 'the full measure' : `only ${vial.ml} of ${com.bottleMl} ml` },
    { k: 'temper', v: Math.round((1 - persona.haggle) * 100), text: persona.haggle > 0.6 ? 'a hard bargainer' : persona.haggle < 0.3 ? 'easy-going' : 'a fair trader' },
  ];
  if (com.patron) reasons.push({ k: 'history', v: Math.round(50 + 50 * com.patron.trust), text: com.patron.trust > 0.2 ? 'they trust you from past visits' : com.patron.trust < -0.2 ? 'they remember being let down' : 'they have been here before' });
  const n = { round: 0, patience: persona.patience, reservation, offer, fit, trust, reasons, state: /** @type {'open'} */ ('open'), log: [] };
  const opening = fit < 0.35 ? 'That is not what I asked for.' : trust < 0.55 ? 'How do I know it does what your label says?' : fit < 0.8 ? 'Not quite what I wanted, but let’s talk.' : 'This looks right.';
  n.log.push({ who: 'them', text: `${opening} I can offer ${fmt(offer)} coins.`, coins: offer });
  return n;
}

/**
 * The player names a price. The customer accepts, counters or walks out.
 * @param {Negotiation} n @param {any} com @param {number} ask
 */
export function proposePrice(n, com, ask) {
  if (n.state !== 'open') return n;
  const persona = com.customer.persona || { haggle: 0.5 };
  ask = Math.max(0, Math.round(ask * 10) / 10);
  n.round++;
  n.log.push({ who: 'you', text: `I want ${fmt(ask)} coins.`, coins: ask });
  if (ask <= n.offer + 0.05) return close(n, ask, 'Done! A fair price.');
  // a soft bargainer accepts any ask within reach; a hard one keeps a margin
  if (ask <= n.reservation * (1 - 0.12 * persona.haggle)) return close(n, ask, 'Very well — agreed.');
  n.patience -= ask > n.reservation * 1.4 ? 2 : 1;
  if (n.patience <= 0) {
    n.state = 'left';
    n.log.push({ who: 'them', text: ask > n.reservation * 1.4 ? 'That is robbery! Good day.' : 'We will not agree. I will find another alchemist.' });
    return n;
  }
  // concede part of the way toward what they would really pay
  const step = (0.3 + 0.35 * (1 - persona.haggle)) * (n.reservation - n.offer);
  n.offer = Math.round(Math.min(n.reservation, Math.max(n.offer, n.offer + step)) * 10) / 10;
  const mood = ask > n.reservation * 1.4 ? 'Absurd.' : persona.haggle > 0.6 ? 'Hah! No.' : 'Too much for me.';
  n.log.push({ who: 'them', text: `${mood} ${fmt(n.offer)} coins, and that is generous.${n.patience <= 1 ? ' Last offer.' : ''}`, coins: n.offer });
  return n;
}

/** Take the customer's current offer. @param {Negotiation} n */
export function acceptOffer(n) {
  if (n.state !== 'open') return n;
  n.log.push({ who: 'you', text: `Agreed: ${fmt(n.offer)} coins.` });
  return close(n, n.offer, 'Pleasure doing business.');
}

function close(n, price, text) {
  n.state = 'deal';
  n.price = price;
  n.log.push({ who: 'them', text });
  return n;
}

/**
 * Record a sale and decide (deterministically) how the customer will react
 * once they have drunk the real potion. The reaction arrives the next day.
 * @param {any} st GameState
 * @param {any} com @param {any} vial @param {Label} label @param {number} price
 * @param {any} truth the true measurement of the bottled potion
 */
export function recordSale(st, com, vial, label, price, truth) {
  const ev = evaluatePotion(com, truth);
  const rng = new Rng(hashString(`${com.id}:${vial.id}:after`));
  const persona = com.customer.persona || { honesty: 0.85 };
  // was the label honest? (beyond the reading noise a customer would notice)
  const wrong = [];
  for (const k of EFFECT_KEYS) {
    const c = label.claims[k];
    const v = truth.effects[EFFECT_INDEX[k]];
    if (!c || c.kind === 'unknown') continue;
    if (c.kind === 'none' && Math.abs(v) >= PURITY_LIMIT) wrong.push(k);
    // a tested claim states its margin: a fair customer forgives what lies within it
    const margin = c.source === 'trial' && c.evidence ? c.evidence.u || 0 : 0;
    if (c.kind === 'value' && Math.abs(v - (c.value || 0)) > Math.max(3, 0.25 * Math.abs(c.value || 0), margin)) wrong.push(k);
  }
  const purity = com.requirements.find((r) => r.key === 'purity');
  const side = purity ? strongestUnwanted(truth.effects, purity.exclude || []) : { value: 0, key: '' };
  const harmful = side.value >= 3 && ['toxicity', 'death', 'acidity'].includes(side.key);
  const failed = ev.rows.filter((r) => r.score < 0.7 && r.req.key !== 'quantity').map((r) => r.req.key);
  const evidence = [...new Set(Object.values(label.claims).filter((c) => c.source === 'trial' && c.record).map((c) => c.record))];
  const sale = {
    id: 's' + hashString(`${com.id}:${vial.id}`).toString(36), day: st.day, customer: { name: com.customer.name, title: com.customer.title, archetype: com.customer.archetype, portrait: com.customer.portrait },
    potion: com.potionName, price, quality: Math.round(ev.quality * 1000) / 1000, repDelta: ev.repDelta, wrong, failed, side: side.value >= PURITY_LIMIT ? side : null,
    claims: label.claims, truth: Array.from(truth.effects, (v) => Math.round(v * 10) / 10), evidence, batchId: vial.batchId, rev: vial.rev, ml: vial.ml,
  };
  /** @type {any} */
  let follow = null;
  const due = st.day + 1;
  if (ev.quality >= 0.85 && !wrong.length && !harmful) {
    if (rng.next() > persona.honesty) {
      // a satisfied customer who wants their money back anyway
      const key = rng.pick(com.requirements.filter((r) => r.effect && r.key !== 'purity').map((r) => r.key).concat(['quality']));
      follow = { kind: 'complaint', legit: false, demand: Math.round(price * rng.range(0.5, 1) * 10) / 10, cites: [key],
        text: key === 'quality' ? 'It did nothing at all. I want my money back.' : `The ${EFFECT_BY_KEY[key] ? EFFECT_BY_KEY[key].label.toLowerCase() : key} was much weaker than you claimed. Refund me.` };
    } else {
      const referral = rng.chance(0.35);
      follow = { kind: 'praise', legit: true, tip: Math.round(price * rng.range(0.05, 0.15) * 10) / 10, referral,
        text: referral ? 'It worked wonders! I told a friend about your shop — expect them.' : 'It worked exactly as promised. Thank you!' };
    }
  } else if (ev.quality < 0.6 || wrong.length || harmful) {
    const share = harmful ? 1 : wrong.length ? Math.max(0.5, 1 - ev.quality) : Math.max(0.3, 1 - ev.quality);
    const cites = [...new Set([...wrong, ...failed])];
    follow = { kind: 'complaint', legit: true, demand: Math.round(price * share * 10) / 10, cites, harmful,
      text: harmful ? `Your potion made me ill — ${EFFECT_BY_KEY[side.key].label.toLowerCase()}! You never said.` : wrong.length ? `Your label lied: ${wrong.map((k) => EFFECT_BY_KEY[k].label.toLowerCase()).join(', ')} was nothing like you wrote.` : 'It barely worked. I paid for a proper potion.' };
  } else {
    follow = { kind: 'quiet', legit: true, text: 'Seemed content enough.' };
  }
  follow = { id: 'f' + sale.id.slice(1), saleId: sale.id, day: due, customer: sale.customer, ...follow, resolved: false };
  return { sale, follow, ev };
}

/**
 * Settle a follow-up visit. Returns the coins and reputation it cost or
 * earned, and what was said.
 * @param {any} st GameState
 * @param {any} f follow-up @param {'thank'|'refund'|'dispute'|'dismiss'} action
 */
export function resolveFollowUp(st, f, action) {
  const sale = (st.sales || []).find((s) => s.id === f.saleId);
  const rng = new Rng(hashString(`${f.id}:${action}`));
  let coins = 0, rep = 0, text = '';
  const base = sale ? sale.repDelta : 0;
  if (f.kind === 'praise') {
    coins = f.tip || 0;
    rep = Math.max(2, base);
    text = f.referral ? 'They leave a tip and promise to send a friend.' : 'They leave a small tip.';
  } else if (f.kind === 'quiet') {
    rep = base;
    text = 'No news is good news.';
  } else if (action === 'refund') {
    coins = -f.demand; // the state refuses a refund the shop cannot pay in full
    rep = f.legit ? Math.min(-1, Math.round(base / 2)) : 1;
    text = f.legit ? 'You refund them. They leave mollified.' : 'You refund them. They leave smirking — but people saw you were fair.';
  } else if (action === 'dispute') {
    // the evidence: trials of the very batch that back the disputed claims
    const covered = sale && (f.cites || []).every((k) => k === 'quality' ? sale.evidence.length > 0 : sale.claims[k] && sale.claims[k].source === 'trial');
    if (f.legit) {
      const paid = Math.min(f.demand, st.coins);
      coins = -paid || 0; // never "-0"
      rep = Math.min(-6, base - 4) - Math.round(6 * (1 - paid / Math.max(1e-9, f.demand)));
      text = paid + 1e-9 >= f.demand ? 'Your records do not hold up: the complaint was fair. You refund them, and the story spreads.' : 'Your records do not hold up, and you cannot pay them back in full. The story spreads.';
    } else if (covered || rng.chance(0.35 + 0.08 * st.rank)) {
      rep = 2;
      text = covered ? 'You show the trial records of that very batch. They mumble and leave empty-handed.' : 'You stand your ground and they back down.';
    } else {
      const half = Math.round(f.demand * 0.5 * 10) / 10;
      const paid = Math.min(half, st.coins);
      coins = -paid || 0; // never "-0"
      rep = -3 - Math.round(3 * (1 - paid / Math.max(1e-9, half)));
      text = 'With no trial records to show, you settle for half.';
    }
  } else {
    rep = f.legit ? Math.min(-6, base - 3) : -2;
    text = 'You turn them away. They grumble to everyone in the square.';
  }
  return { coins, rep, text };
}

/** @param {number} v */
function fmt(v) {
  return (Math.round(v * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
}
