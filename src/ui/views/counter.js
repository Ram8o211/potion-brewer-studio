// The shop counter: yesterday's customers coming back with their verdict,
// the current customer and their full order (with which effects you have
// verified), the sealed vial — labelled, then bargained over — and the
// potion shelves, where sealed bottles wait until they are needed.

import { h, btn, clear, coins, confirmDialog, starsText, toast } from '../dom.js';
import { serviceStatus, ORDERS } from '../../game/orders.js';
import { icon } from '../icons.js';
import { drawPortrait } from '../../rendering/portraits.js';
import { drawBottle } from '../../rendering/renderer.js';
import { PROPERTY_LABELS, scoreRequirement } from '../../game/evaluate.js';
import { techniqueById } from '../../game/commissions.js';
import { EFFECT_INDEX, NE } from '../../alchemy/effects.js';
import { EFFECT_BY_KEY } from '../../alchemy/effects.js';
import { missingEffects, summarize, requirementEvidence } from '../../game/experiments.js';
import { labelStars, MAX_STARS } from '../../game/commerce.js';
import * as trade from '../trade.js';
import { describeColor, rgbToHex } from '../../core/color.js';
import { viscosityClass } from '../../game/measure.js';
import * as panels from '../panels.js';
import { shortName } from '../../game/customers.js';

export class CounterView {
  /** @param {import('../lab.js').LabScreen} lab */
  constructor(lab) {
    this.lab = lab;
    this.el = h('section', { class: 'view view-counter', 'data-view': 'counter' });
  }

  build() {
    this.refresh();
  }

  refresh() {
    const lab = this.lab, st = lab.state;
    const el = clear(this.el);
    if (lab.sandbox) {
      el.append(h('div', { class: 'card parch' }, h('h3', { text: 'Free Experiment' }), h('div', { class: 'small', text: 'No customers here: every reagent, tool and subject is yours to play with. Bottle what you like, test everything.' })));
      this.vialCard(el);
      return;
    }
    for (const f of st.dueFollowUps()) el.append(trade.followUpCard(lab, f));
    this.specialBoard(el);
    const com = st.current;
    if (!com) {
      el.append(h('div', { class: 'card parch counter-empty' },
        h('div', { text: st.dayOver ? `The last customer has left. Day ${st.day} is over.` : st.opened ? 'The shop is quiet.' : `Dawn of day ${st.day}. The shop is still closed.` }),
        h('div', { class: 'small muted', text: st.dayOver ? 'Dusk: the twilight plants are open in the wilds until you close for the night.' : st.opened ? '' : 'Dawn flowers are open in the wilds only until you open the door. Brew ahead for the shelves, or open up when you are ready.' }),
        h('div', { class: 'row wrap' },
          st.dayOver ? btn('Close shop for the night', () => lab.endDay(), { cls: 'gold', icon: 'sun', act: 'end-day' })
            : btn(st.opened ? 'Next customer' : 'Open the door', () => lab.bringCustomer(true), { cls: 'gold', icon: 'door', act: 'next-customer' }))));
      this.vialCard(el);
      this.shelfCard(el);
      return;
    }
    const portrait = /** @type {HTMLCanvasElement} */ (h('canvas', { class: 'portrait big' }));
    drawPortrait(portrait, com.customer.portrait, 'neutral');
    // with a vial waiting, only its own trials count: that is what will be sold
    const sum = st.vial ? summarize(st.vial.samples || seedSamples(st.vial)) : lab.currentCert();
    const list = h('ul', { class: 'reqs full' });
    for (const req of com.requirements) {
      const isFx = !!EFFECT_BY_KEY[req.key];
      const label = PROPERTY_LABELS[req.key] || req.key;
      const status = isFx || req.key === 'purity' ? reqStatus(req, sum) : null;
      const target = h('span', { text: req.label });
      list.appendChild(h('li', { class: 'req' + (req.limit || req.key === 'purity' ? ' limit' : '') }, icon(isFx ? EFFECT_BY_KEY[req.key].icon : lab.reqIcon(req.key)), h('span', {}, h('span', { class: 'lbl-k', text: (req.limit ? 'Limit: ' : '') + label + ' ' }), target), status));
    }
    list.appendChild(h('li', { class: 'req' }, icon('flask'), h('span', {}, h('span', { class: 'lbl-k', text: 'Quantity ' }), `${com.bottleMl} ml`)));
    el.append(h('div', { class: 'card parch customer-card' },
      h('div', { class: 'cust-top' }, portrait, h('div', {},
        h('div', { class: 'cust-name', text: `${com.customer.name}` }),
        h('div', { class: 'small muted', text: `${com.customer.title}${com.contract ? ' · Guild contract' : ''}${com.grand ? ' · Grand Commission' : ''}` }),
        h('div', { class: 'budget' }, icon('coin', 'sm'), ` up to ${coins(com.budget)}`))),
      com.patron ? h('div', { class: 'small patron ' + (com.patron.trust > 0.2 ? 'ok' : com.patron.trust < -0.2 ? 'warn' : 'muted'), text: `A returning customer (${com.patron.visits} earlier visit${com.patron.visits === 1 ? '' : 's'}): ${com.patron.trust > 0.2 ? 'they trust your shop — less haggling, a bigger purse' : com.patron.trust < -0.2 ? 'they were let down before and want proof this time' : 'they know your shop'}.` }) : null,
      h('div', { class: 'speech', text: '“' + com.dialogue + '”' }),
      h('div', { class: 'potion-name', text: com.potionName }),
      com.service ? h('div', { class: 'customer-patience row', title: 'Patience counts visible active play only; it pauses while suspended or in a dialog.' },
        icon('clock', 'sm'), h('progress', { max: 1, value: serviceStatus(com).fraction, 'aria-label': 'Customer patience' }),
        h('span', { class: 'small', text: 'Service patience' })) : null,
      list,
      this.techCard(com),
      this.supplyCard(com),
      this.shelfMatches(com),
      h('div', { class: 'row wrap cust-actions' },
        btn('Brew it', () => lab.showView('brew'), { icon: 'cauldron', cls: 'primary', act: 'go-brew', title: 'Go to the cauldron' }),
        btn(com.hintCost ? `Advice · ${com.hintCost}` : 'Advice', () => panels.openHint(lab), { icon: 'bulb', act: 'hint', title: com.hintCost ? `A guild alchemist suggests an approach for ${com.hintCost} coins` : 'A guild alchemist suggests an approach' }),
        com.tutorial ? null : btn('Decline', () => lab.decline(), { icon: 'door', act: 'decline', title: 'Send this customer away (no penalty)' }))));
    this.vialCard(el);
    this.shelfCard(el);
  }

  specialBoard(el) {
    const lab = this.lab, st = lab.state, offer = st.offerSpecial();
    if (!offer && !st.specialOrders.length) return;
    const board = h('details', { class: 'card parch special-board', open: true }, h('summary', { text: `Special commissions · ${st.specialOrders.length}/${st.specialCapacity}` }));
    const act = (fn) => { const r = fn(); if (r && !r.ok) toast('Commission', r.reason, 'scroll'); lab.save(); lab.refreshHud(true); this.refresh(); };
    const card = (o, offered) => {
      const com = o.request;
      const box = h('article', { class: 'special-order', 'data-order': o.id }, h('b', { text: com.potionName }),
        h('p', { class: 'small', text: `${com.customer.name} · ${com.bottleMl} ml · ${o.reward} coins · pickup day ${o.pickupDay}–${o.pickupDay + ORDERS.pickupGraceDays}` }),
        h('ul', { class: 'small' }, ...com.requirements.map((r) => h('li', { text: `${PROPERTY_LABELS[r.key] || r.key}: ${r.label}` }))),
        h('p', { class: 'small muted', text: 'Keep one complete sealed bottle on the potion shelves. Refusal has no penalty.' }));
      if (offered) box.append(h('div', { class: 'row wrap' },
        btn('Accept commission', () => act(() => st.acceptSpecial(o.id)), { act: 'special-accept', cls: 'gold' }),
        btn('Decline', () => act(() => st.declineSpecial(o.id)), { act: 'special-decline' })));
      else {
        const select = h('select', { 'aria-label': 'Commission bottle' }, ...st.bottles.map((b) => h('option', { value: b.id, text: `${Math.round(b.ml)} ml · Stored potion` })));
        box.append(select, btn(st.day < o.pickupDay ? `Returns day ${o.pickupDay}` : 'Deliver stored potion', () => act(() => st.deliverSpecial(o.id, select.value)),
          { act: 'special-deliver', cls: 'primary', disabled: st.day < o.pickupDay || !st.bottles.length }));
      }
      return box;
    };
    if (offer) board.append(card(offer, true));
    for (const o of st.specialOrders) board.append(card(o, false));
    el.append(board);
  }

  /** What the order's techniques ask of the alchemist (one line each). @param {any} com */
  techCard(com) {
    const ts = (com.techniques || []).map(techniqueById).filter(Boolean);
    if (!ts.length) return null;
    const st = this.lab.state;
    return h('div', { class: 'small tech-card' }, h('b', { text: 'What it takes: ' }),
      ...ts.map((t) => h('div', { class: 'tech', 'data-tech': t.id }, h('span', { class: st.journal['technique:' + t.id] ? 'ok' : '', text: `${t.name}${st.journal['technique:' + t.id] ? ' ✓' : ''}: ` }), t.lesson)));
  }

  /**
   * How much to brew and where the wanted effects can be had today — from
   * what the shop knows of its ingredients, never the hidden plan.
   * @param {any} com
   */
  supplyCard(com) {
    const sup = com.supplies;
    if (!sup || com.tutorial) return null;
    const st = this.lab.state;
    const where = { shelf: 'on the shelf', wilds: 'in the wilds', market: 'in the Shop' };
    return h('details', { class: 'small supply-card' }, h('summary', { text: `Plan for about ${sup.brewMl} ml of brew (the bottle and a few test doses)` }),
      ...sup.carriers.map((c) => h('div', {}, h('b', { text: `${EFFECT_BY_KEY[c.key].label}${c.sign < 0 ? ' (alkaline)' : ''}: ` }),
        c.carriers.length ? c.carriers.map((x) => `${st.lookup(x.id).name} (${where[x.where] || x.where})`).join(', ') : 'nothing you can get today carries it')),
      h('div', { class: 'muted', text: 'Every one of them brings side effects: plan what will cancel them. Long-press a jar on the shelf to see its effects.' }));
  }

  /**
   * Shelved bottles whose own evidence and visible qualities already meet
   * this order (judged on their trials, never on hidden truth).
   * @param {any} com
   */
  shelfMatches(com) {
    const st = this.lab.state;
    if (!st.bottles.length) return null;
    const fits = [];
    for (const b of st.bottles) {
      if (!b.m) continue;
      const cert = b.cert || {};
      const fx = new Array(NE).fill(0);
      let untested = 0;
      for (const r of com.requirements) {
        if (r.key === 'purity') { for (const e of Object.keys(EFFECT_INDEX)) if (!(r.exclude || []).includes(e) && cert[e] === undefined) untested++; continue; }
        if (EFFECT_BY_KEY[r.key] && cert[r.key] === undefined) untested++;
      }
      for (const [k, v] of Object.entries(cert)) fx[EFFECT_INDEX[k]] = v;
      const m = { ...b.m, effects: fx, ml: b.ml };
      const ok = com.requirements.every((r) => scoreRequirement(r, /** @type {any} */ (m)).score >= 0.999) && b.ml >= com.bottleMl;
      if (ok || (untested && com.requirements.filter((r) => !EFFECT_BY_KEY[r.key] && r.key !== 'purity').every((r) => scoreRequirement(r, /** @type {any} */ (m)).score >= 0.999))) fits.push({ b, ok: ok && !untested });
    }
    if (!fits.length) return null;
    const sure = fits.filter((f) => f.ok).length;
    return h('div', { class: 'small shelf-match ' + (sure ? 'ok' : 'muted'), text: sure ? `On your shelves: ${sure} tested bottle${sure === 1 ? '' : 's'} already meet${sure === 1 ? 's' : ''} this order — take it down and offer it.` : `On your shelves: ${fits.length} bottle${fits.length === 1 ? '' : 's'} look${fits.length === 1 ? 's' : ''} right but ${fits.length === 1 ? 'is' : 'are'} not fully tested for this order.` });
  }

  /** @param {HTMLElement} el */
  vialCard(el) {
    const lab = this.lab, st = lab.state;
    const v = st.vial;
    if (!v) {
      if (st.current) el.append(h('div', { class: 'card parch small muted next-step' }, h('b', { text: 'Next: ' }), 'brew it, test a dose in Trials, then Bottle it — the vial appears here.'));
      return;
    }
    const com = st.current;
    const m = v.m;
    const cv = /** @type {HTMLCanvasElement} */ (h('canvas', { width: '24', height: '32', class: 'vial-art' }));
    const ctx = cv.getContext('2d');
    drawBottle(ctx, 2, 3, 20, 29, m.color, Math.min(1, v.ml / Math.max(1, com ? com.bottleMl : v.ml)));
    const need = com ? missingEffects(com, v.cert || {}) : [];
    const first = com ? shortName(com.customer.name) : '';
    const serve = com ? btn(`Sell to ${first}`, () => lab.serveVial(), { cls: 'primary', icon: 'deal', disabled: v.ml < 5, act: 'serve', title: `Offer the vial to ${first} and agree on a price` }) : null;
    const labelB = btn(v.label ? 'Edit label' : 'Write label', () => lab.identifyVial(), { icon: 'tag', act: 'label', title: 'What the label claims the potion does' });
    const testB = btn('Test it', () => { lab.trialSource = 'vial'; lab.showView('trials'); }, { icon: 'dropper', act: 'test-vial', title: 'Give a dose from this vial to a rabbit' });
    const back = btn('Pour back', () => lab.pourBackVial(), { icon: 'pour', act: 'pour-back', title: 'Return the vial to the cauldron to keep working on it' });
    const store = lab.sandbox ? null : btn('To shelf', () => lab.shelveVial(), { icon: 'shelf2', act: 'shelve-vial', disabled: st.bottleRoom <= 0, title: st.bottleRoom <= 0 ? 'The potion shelves are full' : 'Keep this bottle on the potion shelves' });
    const discard = btn('Discard', async () => { if (await confirmDialog('Discard the vial?', 'The potion is poured away. Ingredients are not refunded.', 'Discard', 'danger')) lab.discardVial(); }, { icon: 'trash', cls: 'danger', act: 'discard', title: 'Pour the vial away' });
    el.append(h('div', { class: 'card parch vial-card' },
      h('div', { class: 'row' }, cv, h('div', {},
        h('b', { text: `Sealed vial · ${Math.round(v.ml)} ml` }),
        h('div', { class: 'small' }, h('span', { class: 'swatch', style: { background: rgbToHex(m.color) } }), ` ${describeColor(m.color)} · ${Math.round(m.temperature)}°C · ${viscosityClass(m.viscosity)}`),
        verifiedLine(v.cert),
        v.label ? h('div', { class: 'small label-line' }, icon('tag', 'sm'), ` ${trade.labelLine(v.label)}`) : null)),
      need.length && com ? h('div', { class: 'warn small', text: `Not yet tested: ${need.map((k) => EFFECT_BY_KEY[k].label).join(', ')}. ${first} trusts an untested label less${com.customer.persona && com.customer.persona.proof >= 0.8 ? ' — and insists on proof' : ''}.` }) : null,
      com && v.ml < com.bottleMl ? h('div', { class: 'small muted', text: `Short of the ${com.bottleMl} ml ordered; the customer pays less.` }) : null,
      h('div', { class: 'row wrap' }, serve, labelB, testB, store, back, discard)));
  }

  /**
   * The potion shelves: sealed bottles kept for later, each with its exact
   * contents. Tap a bottle to see it; take it down to the counter to serve
   * or test it (a bottle already there goes up in its place).
   * @param {HTMLElement} el
   */
  shelfCard(el) {
    const lab = this.lab, st = lab.state;
    if (lab.sandbox) return;
    lab.freshBottles();
    const cap = st.cap.bottles;
    if (this.sel && !st.bottles.some((b) => b.id === this.sel)) this.sel = null;
    const grid = h('div', { class: 'bottle-shelf', role: 'listbox', 'aria-label': 'Potion shelves' });
    const rows = Math.ceil(cap / 6);
    for (let i = 0; i < rows * 6; i++) {
      const b = st.bottles[i];
      if (!b) {
        grid.appendChild(h('div', { class: 'bottle-slot' + (i < cap ? ' empty' : ' locked'), 'aria-hidden': 'true' }));
        continue;
      }
      const cv = /** @type {HTMLCanvasElement} */ (h('canvas', { width: '16', height: '22', class: 'vial-art' }));
      drawBottle(/** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')), 2, 2, 12, 19, b.m ? b.m.color : [0.5, 0.5, 0.5], Math.min(1, b.ml / Math.max(1, b.bottledMl || b.ml)));
      // a labelled bottle tells what it does without opening it
      const fxText = b.label ? trade.labelLine(b.label) : '';
      const acc = b.label ? labelStars(b.label) : null;
      const slot = h('button', { class: 'bottle-slot' + (this.sel === b.id ? ' active' : '') + (b.label ? ' labelled' : ''), role: 'option', 'aria-selected': this.sel === b.id ? 'true' : 'false', 'aria-label': `${b.label && b.label.name ? b.label.name : 'Bottle'}, ${Math.round(b.ml)} ml${fxText ? `: ${fxText}` : ''}`, ...(fxText ? { title: fxText } : {}), 'data-act': 'bottle-slot', 'data-id': b.id },
        cv, h('span', { class: 'bml', text: `${Math.round(b.ml)}` }), b.label ? h('span', { class: 'btag' }, icon('tag', 'sm')) : null,
        acc === null ? null : h('span', { class: 'bstars', 'data-stars': String(acc), text: starsText(acc, MAX_STARS) }));
      slot.addEventListener('click', () => { this.sel = this.sel === b.id ? null : b.id; this.refresh(); });
      grid.appendChild(slot);
    }
    const b = this.sel ? st.bottles.find((x) => x.id === this.sel) : null;
    let detail = null;
    if (b) {
      const m = b.m || {};
      detail = h('div', { class: 'bottle-detail' },
        h('div', { class: 'small' }, h('span', { class: 'swatch', style: { background: rgbToHex(m.color || [0.5, 0.5, 0.5]) } }), ` ${describeColor(m.color || [0.5, 0.5, 0.5])} · ${Math.round(b.ml)} ml · ${Math.round(m.temperature ?? 20)}°C · bottled on day ${b.day || st.day}`),
        verifiedLine(b.cert),
        b.label ? h('div', { class: 'small label-line' }, icon('tag', 'sm'), ` ${trade.labelLine(b.label)}`) : null,
        h('div', { class: 'row wrap' },
          btn(st.vial ? 'Swap with the vial' : 'To the counter', () => lab.takeBottle(b.id), { icon: 'deal', cls: 'primary', act: 'take-bottle', title: 'Put this bottle on the counter to sell or test it' }),
          btn('Pour back', () => lab.pourBackBottle(b.id), { icon: 'pour', act: 'pour-back-bottle' }),
          btn('Discard', async () => { if (await confirmDialog('Discard the bottle?', 'The potion is poured away. Ingredients are not refunded.', 'Discard', 'danger')) lab.discardBottle(b.id); }, { icon: 'trash', cls: 'danger', act: 'discard-bottle' })));
    }
    el.append(h('div', { class: 'card parch shelf-card' },
      h('div', { class: 'row' }, icon('shelf2'), h('b', { text: `Potion shelves · ${st.bottles.length}/${cap}` })),
      st.bottles.length ? null : h('div', { class: 'small muted', text: 'Empty. When you bottle a brew, choose “To the potion shelves” to keep it for a later customer. Tap a bottle here to use it. More shelving is sold in the Shop.' }),
      grid, detail));
  }
}

/** A vial bottled before readings were kept: its certificate counts as one reading per effect. @param {any} v */
function seedSamples(v) {
  /** @type {Record<string, {v:number, r:string, rec:string}[]>} */
  const out = {};
  for (const [k, x] of Object.entries(v.cert || {})) out[k] = [{ v: Number(x) || 0, r: 'bottled', rec: (v.certRecords || {})[k] || '' }];
  return out;
}

/** A requirement's status from the trials (experiments.js requirementEvidence). @param {any} req @param {any} sum */
function reqStatus(req, sum) {
  const r = requirementEvidence(req, sum);
  const cls = r.evidence === 'untested' ? 'unknown' : r.within === true ? 'known' : r.within === false ? 'miss' : 'open';
  return h('span', { class: 'fx-status ' + cls, 'data-evidence': r.evidence, title: r.title, text: `${r.mark} ${r.text}` });
}

/**
 * What the trials of a bottle found: the effects seen, and how many were
 * tested but not detected (not proof of absence — the label says how sure).
 * @param {Record<string, number>|undefined} cert
 */
function verifiedLine(cert) {
  const all = Object.entries(cert || {});
  if (!all.length) return h('div', { class: 'small' }, 'Tested: ', h('span', { class: 'muted', text: 'nothing — effects unknown' }));
  const seen = all.filter(([, x]) => Math.abs(x) >= 0.5), unseen = all.length - seen.length;
  return h('div', { class: 'small' }, 'Tested: ', ...seen.map(([k, x]) => h('span', { class: 'fx-chip' }, icon(EFFECT_BY_KEY[k].icon, 'sm'), ` ${Math.round(x)}`)),
    unseen ? h('span', { class: 'muted', text: ` ${seen.length ? '· ' : ''}${unseen} not detected` }) : null);
}
