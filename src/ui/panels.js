// Modal panels: shop & guild, recipe book, journal, ingredient inspector,
// guild advice, potion result, day summary, analysis, pause menu, settings.

import { recipeConfidence, CONFIDENCE_TEXT, describeStep } from '../game/recipes.js';
import { MECHANIC_BY_ID } from '../game/mechanics.js';
import { evidenceRank } from '../game/experiments.js';
import { h, btn, modal, toast, coins, starsText, confirmDialog, clear, keepScroll } from './dom.js';
import { icon } from './icons.js';
import { drawPortrait } from '../rendering/portraits.js';
import { drawJar } from '../rendering/art.js';
import { EQUIPMENT, RANKS } from '../game/equipment.js';
import { ACHIEVEMENTS } from '../game/state.js';
import { viscosityClass, densityWord, evennessWord } from '../game/measure.js';
import { EFFECTS, EFFECT_BY_KEY, EFFECT_KEYS, dominantEffect } from '../alchemy/effects.js';
import { ingredientSprite } from '../rendering/species-sprites.js';
import { compatFactor } from '../reactions/compatibility.js';
import { describeColor, rgbToHex } from '../core/color.js';
import { SIM } from '../simulation/constants.js';
import { exportSave, parseImport, saveGame } from '../game/persistence.js';
import { audio } from '../audio/audio.js';
import { isMagical } from '../alchemy/arcane.js';
import { RARITIES } from '../materials/rarity.js';
import { causeWord } from '../game/colony.js';

const CAT_LABEL = { heat: 'Fire', cold: 'Cooling', vessel: 'Cauldrons', tool: 'Tools', instrument: 'Instruments', trials: 'Trials room', gathering: 'Foraging', storage: 'Potion storage', guild: 'Guild' };

/**
 * An ingredient's picture in a list: a raw ingredient's icon (the same one
 * on the shelf, in the shop, in the book and on its deposit card), else its jar.
 * @param {any} m material @param {number} [w] @param {number} [hh]
 */
export function jarCanvas(m, w = 22, hh = 30) {
  if (m.wild || m.remains) {
    const cv = ingredientSprite(m);
    cv.style.width = w * 2 + 'px';
    cv.style.height = w * 2 + 'px';
    return cv;
  }
  const cv = /** @type {HTMLCanvasElement} */ (h('canvas', { width: String(w), height: String(hh), style: { width: w * 2 + 'px', height: hh * 2 + 'px' } }));
  drawJar(cv.getContext('2d'), 2, 0, w - 4, hh, m.look || m.color, m.form);
  return cv;
}

/** Effect chips for a known effect record. @param {Record<string, number>} fx */
export function fxChips(fx, min = 1) {
  const list = EFFECT_KEYS.map((k) => /** @type {[string, number]} */ ([k, (fx && fx[k]) || 0])).filter(([, v]) => Math.abs(v) >= min).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (!list.length) return [h('span', { class: 'muted', text: 'none' })];
  return list.map(([k, v]) => h('span', { class: 'fx-chip', title: EFFECT_BY_KEY[k].label }, icon(EFFECT_BY_KEY[k].icon, 'sm'), ` ${Math.round(v)}`));
}

function swatch(rgb) {
  return h('span', { class: 'swatch', style: { background: rgbToHex(rgb), display: 'inline-block', width: '18px', height: '12px', boxShadow: '0 0 0 1px #2b1d14', verticalAlign: 'middle' } });
}

// ------------------------------------------------------------------ shop
export function openShop(lab, tab = 'reagents') {
  const st = lab.state;
  const body = h('div');
  const tabs = h('div', { class: 'tabs' });
  let current = tab;
  const m = modal({ title: 'Shop', body: [tabs, body], wide: true, onClose: () => lab.refreshHud(true) });
  m.el.insertBefore(tabs, m.body);
  const coinLine = h('div', { class: 'row', style: { justifyContent: 'flex-end', padding: '0 12px' } });
  m.el.insertBefore(coinLine, m.body);
  const renderTabs = () => keepScroll(tabs, () => {
    clear(tabs);
    for (const [k, label, ic] of [['reagents', 'Buy', 'jar'], ['equipment', 'Equipment', 'gear'], ['sell', 'Sell', 'coin']]) {
      tabs.appendChild(btn(label, () => { current = k; render(); }, { icon: ic, cls: current === k ? 'active' : '', act: 'shop-tab-' + k }));
    }
  });
  const render = () => {
    renderTabs();
    clear(coinLine).append(icon('coin'), h('span', { text: coins(st.coins) + ' coins' }), ...(st.marketEvent.key !== 'none' ? [h('span', { class: 'muted small', text: ` · today: ${st.marketEvent.name}` })] : []));
    clear(m.body);
    if (current === 'reagents') renderReagents(lab, m.body, render);
    else if (current === 'equipment') renderEquipment(lab, m.body, render);
    else renderSell(lab, m.body, render);
  };
  render();
  audio.play('page');
  return m;
}

function renderReagents(lab, body, rerender) {
  const st = lab.state;
  body.appendChild(h('div', { class: 'muted small', text: `Prices per 100 ml · room for ${st.cap.storage} ml of each. Water is free; oil and spirit carry no magic. Herbs and minerals are free in the Wilds — from Journeyman on, the common ones are sold here too.` }));
  const list = h('div', { class: 'list' });
  for (const id of st.world.ingredients) {
    const mt = st.lookup(id);
    if (mt.wild && mt.wild.gatherOnly) continue; // only found in the wilds
    if (!st.knows(id)) continue; // a wild ingredient never gathered is unknown
    if (mt.remains) continue; // recovered from a rabbit, never sold
    const locked = mt.tier > st.rank;
    const price = st.priceOf(id);
    const stock = st.stock(id);
    const buyRow = h('div', { class: 'row buy-row', style: { flexWrap: 'wrap', justifyContent: 'flex-end' } });
    if (!locked && id !== st.world.roles.water) {
      for (const ml of [100, 250, 500]) {
        const cost = Math.round((ml / 100) * price * 10) / 10;
        const b = btn(`+${ml} ml`, () => {
          const r = st.buy(id, ml);
          if (r.ok) { audio.play('purchase'); lab.updateShelf(); } else { audio.play('error'); toast('Cannot buy', r.reason, 'lock'); }
          rerender();
        }, { cls: 'small', disabled: st.coins < cost || stock >= st.cap.storage, act: `buy-${id}-${ml}`, title: `Buy ${ml} ml for ${coins(cost)} coins` });
        b.appendChild(h('span', { class: 'price' }, icon('coin'), coins(cost)));
        buyRow.appendChild(b);
      }
    }
    list.appendChild(h('div', { class: 'item parch' + (locked ? ' locked' : '') },
      jarCanvas(mt, 18, 24),
      h('div', {},
        h('div', { class: 'title', text: mt.name }),
        h('div', { class: 'meta', text: locked ? `${mt.wild ? 'The herbalist sells it' : 'Unlocks'} at the rank of ${(RANKS[mt.tier] || RANKS[RANKS.length - 1]).name}.${mt.wild ? ' Until then, gather it in the wilds.' : ''}` : mt.description }),
        h('div', { class: 'meta', text: locked ? '' : `${mt.form} · ${coins(price)} per 100 ml · in stock: ${isFinite(stock) ? Math.round(stock) + ' ml' : 'unlimited'}` }),
      ),
      locked ? icon('lock') : buyRow,
    ));
  }
  body.appendChild(list);
}

function renderEquipment(lab, body, rerender) {
  const st = lab.state;
  for (const cat of Object.keys(CAT_LABEL)) {
    const items = EQUIPMENT.filter((e) => e.category === cat);
    if (!items.length) continue;
    body.appendChild(h('h3', { class: 'muted', style: { margin: '10px 0 2px', fontWeight: 'normal' }, text: CAT_LABEL[cat] }));
    const list = h('div', { class: 'list' });
    for (const e of items) {
      const owned = st.has(e.id);
      const rankOk = e.rank <= st.rank;
      const reqOk = !e.requires || e.requires.every((r) => st.has(r));
      let action;
      if (owned) action = h('span', { class: 'row' }, icon('check'), h('span', { class: 'small', text: 'Owned' }));
      else if (!rankOk) action = h('span', { class: 'small muted', text: RANKS[e.rank].name });
      else action = btn(`${coins(e.price)}`, async () => {
        const ok = await confirmDialog(`Buy ${e.name}?`, `${e.desc}\n\nCost: ${e.price} coins.`, 'Buy');
        if (!ok) return;
        const r = st.buyEquipment(e.id);
        if (r.ok) {
          audio.play('purchase');
          toast(`${e.name} installed`, e.desc, e.icon);
          lab.buildActions();
          lab.refreshCapabilities();
          lab.save();
        } else { audio.play('error'); toast('Cannot buy', r.reason, 'lock'); }
        rerender();
      }, { icon: 'coin', cls: 'gold', disabled: st.coins < e.price || !reqOk, act: 'equip-' + e.id });
      list.appendChild(h('div', { class: 'item parch' + (owned || rankOk ? '' : ' locked') },
        h('img', { src: icon(e.icon).src, class: 'ico lg', alt: '' }),
        h('div', {}, h('div', { class: 'title', text: e.name }), h('div', { class: 'meta', text: e.desc + (!reqOk && !owned ? ' (requires the previous upgrade)' : '') }),
          h('div', { class: 'meta muted mech', 'data-mechanics': e.mechanics.join(' '), text: 'For: ' + e.mechanics.map((id) => (MECHANIC_BY_ID[id] ? MECHANIC_BY_ID[id].name.toLowerCase() : id)).join(' · ') })),
        action,
      ));
    }
    body.appendChild(list);
  }
}

function renderSell(lab, body, rerender) {
  const st = lab.state;
  body.appendChild(h('div', { class: 'muted small', text: 'Ingredients you have 100 ml or more of, bought back at 40% of today’s price.' }));
  const list = h('div', { class: 'list' });
  for (const id of st.world.ingredients) {
    const s = st.stock(id);
    if (!isFinite(s) || s < 100) continue;
    const mt = st.lookup(id);
    const val = Math.round(st.priceOf(id) * 0.4 * 10) / 10;
    list.appendChild(h('div', { class: 'item parch' }, jarCanvas(mt, 18, 24),
      h('div', {}, h('div', { class: 'title', text: mt.name }), h('div', { class: 'meta', text: `${Math.round(s)} ml in stock · ${coins(val)} per 100 ml` })),
      btn('Sell 100 ml', () => { const r = st.sellBack(id, 100); if (r.ok) { audio.play('coin'); lab.updateShelf(); } rerender(); }, { act: 'sell-' + id }),
    ));
  }
  if (!list.children.length) list.appendChild(h('div', { class: 'card parch', text: 'Nothing worth selling right now.' }));
  body.appendChild(list);
}

// ------------------------------------------------------------------ ingredient inspector
export function openIngredient(lab, id) {
  const st = lab.state;
  const m = st.lookup(id);
  if (!m) return;
  const k = st.knowledge[id] || {};
  const tags = [];
  if (m.rarity) tags.push(RARITIES[m.rarity].label, m.arcaneVariant ? 'Arcane variant' : 'ordinary', `${st.garden.seeds[id] || 0} propagation materials`);
  tags.push(m.form);
  if (m.form === 'powder') tags.push(m.friction > 0.68 ? 'piles steeply' : 'pours like sand');
  else if (m.form === 'liquid') tags.push(m.viscosity < 3 ? 'thin' : m.viscosity < 300 ? 'syrupy' : 'very thick');
  if (m.binder > 0.3) tags.push('forms dough');
  if (m.solubility > 0.05) tags.push('soluble');
  if (k.flammable || m.flammability > 0.3) tags.push(k.flammable ? 'flammable (seen)' : 'smells flammable');
  if (m.glow > 0.2) tags.push('glows');
  const water = st.lookup(st.world.roles.water);
  const mixWater = compatFactor(m.compat[0], m.compat[1], water.compat[0], water.compat[1]) > 0.5;
  tags.push(mixWater ? 'mixes with water' : 'does not mix with water');
  const facts = h('div', { class: 'kv' },
    h('span', { class: 'k', text: 'Colour' }), h('span', {}, swatch(m.look || m.color), ' ' + describeColor(m.look || m.color)),
    h('span', { class: 'k', text: 'Weight' }), h('span', { text: lab.sandbox ? `${m.density.toFixed(2)} g/ml` : densityWord(m.density) }),
    h('span', { class: 'k', text: m.form === 'powder' ? 'Grains' : 'Thickness' }), h('span', { text: m.form === 'powder' ? `piles at ≈${Math.round(Math.atan(m.friction) * 180 / Math.PI)}°` + (m.solubility > 0.05 ? ', dissolves in water' : '') : lab.sandbox ? `${m.viscosity} cP` : viscosityClass(m.viscosity) }),
    h('span', { class: 'k', text: 'Melts' }), h('span', { text: k.melt !== undefined ? `≈${k.melt}°C (observed)` : m.form === 'liquid' ? 'unknown (freeze it to find out)' : 'unknown' }),
    h('span', { class: 'k', text: 'Boils' }), h('span', { text: k.boil !== undefined ? `≈${k.boil}°C (observed)` : isFinite(m.boil) ? 'unknown (heat it to find out)' : 'does not boil' }),
    h('span', { class: 'k', text: 'Magic' }), h('span', { text: !isMagical(m) ? 'none to awaken' : k.awaken !== undefined ? `awoke near ${k.awaken}°C in your brew (observed)` : 'can awaken — its threshold is unknown (heat or chill it to find out)' }),
    h('span', { class: 'k', text: 'Price' }), h('span', { text: `${coins(st.priceOf(id))} / 100 ml` }),
  );
  const asp = h('div', { class: 'aspect-bars' });
  for (const e of m.remains ? [] : EFFECTS) {
    const v = (m.effects && m.effects[e.key]) || 0;
    if (Math.abs(v) < 1) continue;
    asp.append(h('span', {}, icon(e.icon, 'sm'), ' ' + e.label), h('div', { class: 'bar' }, h('i', { style: { width: Math.min(100, Math.abs(v)) + '%', background: `rgb(${e.color.map((c) => Math.round(c * 255)).join(',')})` } })), h('span', { text: e.key === 'acidity' && v < 0 ? `${Math.round(v)} (alkaline)` : String(Math.round(v)) }));
  }
  if (m.remains) asp.append(h('span', { class: 'muted', text: `Unknown: recovered from ${m.remains.rabbitName}. Whatever it absorbed in life may linger — test it in the Trials room.` }));
  else if (!asp.children.length) asp.append(h('span', { class: 'muted', text: 'No magical or chemical effect.' }));
  const reactions = st.world.reactions.filter((r) => (r.a === id || r.b === id) && st.journal['reaction:' + r.id]);
  const balance = m.wild ? balanceHints(st, m) : [];
  modal({
    title: m.name,
    body: [
      h('div', { class: 'card parch ing-card' }, jarCanvas(m, 22, 30), h('div', {}, h('div', { text: m.description }), h('div', {}, ...tags.map((t) => h('span', { class: 'tag', text: t }))))),
      h('div', { class: 'card parch' }, facts),
      h('div', { class: 'card parch' }, h('div', { class: 'small muted', text: m.remains ? 'Effects' : m.product ? 'Effects of this pure substance (as the guild knows it)' : 'Known effects of the pure ingredient (mixtures must be tested)' }), asp,
        (m.wild || m.remains) && m.form === 'solid' ? h('div', { class: 'small', text: 'Supplied whole: crush it in the pot with the pestle (Crush). Only what dissolves takes effect.' }) : null),
      balance.length ? h('div', { class: 'card parch' }, h('div', { class: 'small muted', text: 'This species carries secondary effects. Cancel them with their opposites:' }), ...balance.map((t) => h('div', { class: 'small', text: '• ' + t }))) : null,
      reactions.length ? h('div', { class: 'card parch' }, h('div', { class: 'small muted', text: 'Known reactions' }), ...reactions.map((r) => h('div', { class: 'small', text: `• ${r.name}: ${r.hint || ''}` }))) : null,
    ],
  });
}

/** The guild primer's opposing pairs, as advice for a natural ingredient's side effects. */
const OPPOSITE = {
  fire: ['frost', 'frost cancels fire'], frost: ['fire', 'fire cancels frost'], death: ['vitality', 'life cancels death'],
  toxicity: ['vitality', 'life mends poison, two parts of life to one of poison'], vitality: ['death', 'death (or poison) cancels life'],
  acid: ['alkali', 'an alkali neutralises acid'], alkali: ['acid', 'an acid neutralises alkali'],
};

/** "Frost: fire cancels frost (Sunthistle, Emberbark…)" for each side effect of a natural ingredient. @param {any} st @param {any} m */
function balanceHints(st, m) {
  const fx = Object.entries(m.effects || {}).filter(([, v]) => Math.abs(Number(v)) >= 1);
  if (fx.length < 2) return [];
  const main = fx.reduce((a, b) => (Math.abs(Number(b[1])) > Math.abs(Number(a[1])) ? b : a))[0];
  const key = (k, v) => (k === 'acidity' ? (v < 0 ? 'alkali' : 'acid') : k);
  /** the strength of an opposing channel in another ingredient */
  const carries = (x, ch) => (ch === 'acid' ? Math.max(0, x.effects.acidity || 0) : ch === 'alkali' ? Math.max(0, -(x.effects.acidity || 0)) : x.effects[ch] || 0);
  const out = [];
  for (const [k, v] of fx) {
    if (k === main) continue;
    const opp = OPPOSITE[key(k, Number(v))];
    if (!opp) continue;
    const names = (st.world.wild || []).map(st.lookup).filter((x) => x && x.id !== m.id && x.effects && carries(x, opp[0]) >= 6 && x.wild.rank <= Math.max(st.rank, 1))
      .sort((a, b) => carries(b, opp[0]) - carries(a, opp[0])).slice(0, 3).map((x) => x.name);
    const label = k === 'acidity' ? (Number(v) < 0 ? 'Alkali' : 'Acid') : EFFECTS.find((e) => e.key === k).label;
    out.push(`${label}: ${opp[1]}${names.length ? ` — e.g. ${names.join(', ')}` : ''}.`);
  }
  return out;
}

// ------------------------------------------------------------------ advice / hint
export function openHint(lab) {
  const st = lab.state;
  const com = st.current;
  if (!com) return;
  const show = () => {
    const ref = com.reference;
    // a clue, never the recipe — the player must experiment
    const main = ref.ingredients.slice().sort((a, b) => b.n - a.n).map((i) => st.lookup(i.id)).find((x) => x && x.effects && Object.values(x.effects).some((v) => Math.abs(v) >= 12));
    const tips = [];
    if (main) tips.push(`A guild alchemist would start from ${main.name}${main.wild ? ` (it grows in the ${main.wild.region === 'forest' ? 'Whisperwood' : main.wild.region === 'netherwood' ? 'Netherwood' : main.wild.region === 'meadow' ? 'Sunlit Meadow' : main.wild.region === 'river' ? 'Willow Bank' : main.wild.region === 'quarry' ? 'Ironstone Quarry' : main.wild.region === 'moonfen' ? 'Moonfen' : 'Ember Crags'})` : ''}.`);
    if (ref.ingredients.some((i) => i.ground)) tips.push('Crush what is whole with the pestle — only what dissolves takes effect.');
    if (ref.steep && ref.steep.T < 15) tips.push('Part of this wants ice-cold water, not heat — cold, but not frozen.');
    else if ((ref.heatTo ?? 20) > 40 && !com.activation) tips.push('Patience and gentle heat draw out more than stirring alone.');
    if (ref.reduce) tips.push('It must be stronger than the herbs give plainly: boil some water off with the lid open — and cancel the side effects harder, for they grow too.');
    if (com.activation) {
      const cold = com.predicted && com.predicted.threshold !== null && com.predicted.threshold < 0;
      tips.push(`This strength is out of reach for sleeping magic: it must be awakened. Mix everything first at room temperature, then ${cold ? 'chill' : 'heat'} the whole brew until it glows — and hold it there until the glow is even.`);
    }
    if (com.requirements.some((r) => r.key === 'purity')) tips.push('“No other effect above 1.2 %” is strict. Choose ingredients that do one thing, and test for the effects you did not ask for, too — “not detected” after one small dose is not yet proof.');
    tips.push('How much, and with what? That you must find out. Test small doses before you bottle.');
    modal({ title: 'Guild advice', body: [h('div', { class: 'card parch' }, ...tips.map((t) => h('div', { class: 'small', text: '• ' + t })))] });
  };
  if (com.hintBought || !com.hintCost) { com.hintBought = true; show(); return; }
  confirmDialog('Ask the guild?', `A guild alchemist will suggest an approach for ${com.hintCost} coins.`, 'Pay').then((ok) => {
    if (!ok) return;
    if (st.coins < com.hintCost) { toast('Not enough coins', '', 'coin'); return; }
    st.coins = Math.round((st.coins - com.hintCost) * 10) / 10;
    com.hintBought = true;
    audio.play('coin');
    lab.refreshHud();
    show();
  });
}

// ------------------------------------------------------------------ bottling
/**
 * Choose a measured quantity to bottle into a sealed vial, and where it goes:
 * onto the counter (to serve or test) or onto the potion shelves (to keep).
 * @param {any} lab @param {number} avail particles at the tap @param {(n:number, dest:'counter'|'shelf')=>void} onPick
 * @param {{counterFree?:boolean, shelfRoom?:number, shelves?:boolean}} [o]
 */
export function openBottleSize(lab, avail, onPick, o = {}) {
  const st = lab.state;
  const com = lab.sandbox ? null : st.current;
  const per = SIM.ML_PER_PARTICLE;
  const counterFree = o.counterFree !== false, shelfRoom = o.shelfRoom || 0;
  // the counter first while it is free; the shelves otherwise
  let dest = /** @type {'counter'|'shelf'} */ (counterFree ? 'counter' : 'shelf');
  const sizes = new Set([25, 50, 100, 150, 200, 300]);
  if (com) sizes.add(com.bottleMl);
  const list = [...sizes].sort((a, b) => a - b);
  let m;
  const pick = (ml) => { m.close(); onPick(Math.max(1, Math.round(ml / per)), dest); };
  const btns = list.map((ml) => btn(`${ml} ml${com && ml === com.bottleMl ? ' · ordered' : ''}`, () => pick(ml), {
    cls: com && ml === com.bottleMl ? 'primary' : '', disabled: ml / per > avail, act: 'bottle-' + ml,
  }));
  btns.push(btn(`All · ${avail * per} ml`, () => pick(avail * per), { act: 'bottle-all', title: 'Everything that can run out of the tap' }));
  /** @type {HTMLElement|null} */
  let destRow = null;
  if (o.shelves) {
    const opts = /** @type {[string, string, boolean][]} */ ([
      ['counter', counterFree ? 'To the counter (sell or test)' : 'Counter is taken', counterFree],
      ['shelf', shelfRoom > 0 ? `To the potion shelves · ${shelfRoom} free` : 'Potion shelves are full', shelfRoom > 0],
    ]);
    const bs = opts.map(([k, label, ok]) => btn(label, () => { dest = /** @type {any} */ (k); sync(); }, { icon: k === 'shelf' ? 'shelf2' : 'deal', disabled: !ok, act: 'bottle-dest-' + k }));
    const sync = () => bs.forEach((b, i) => b.classList.toggle('active', opts[i][0] === dest));
    sync();
    destRow = h('div', { class: 'row wrap bottle-dest' }, ...bs);
  }
  m = modal({
    title: 'Bottle the potion',
    body: [h('div', { class: 'card parch' },
      h('div', { class: 'small', text: `It fills from the tap at the bottom (the lowest layer first): ${avail * per} ml can be drawn. A sealed bottle keeps its exact contents.` }),
      destRow ? h('div', { class: 'small muted step-k', text: '1. Where to?' }) : null,
      destRow,
      h('div', { class: 'small muted step-k', text: destRow ? '2. How much?' : 'How much?' }),
      h('div', { class: 'row wrap bottle-sizes' }, ...btns))],
  });
  return m;
}

export function showDaySummary(lab, summary, onDone) {
  const st = lab.state;
  const net = summary.earned - summary.spent;
  modal({
    title: `Day ${summary.day} is over`,
    onClose: onDone,
    body: [
      h('div', { class: 'card parch' },
        h('div', { class: 'kv' },
          h('span', { class: 'k', text: 'Customers served' }), h('span', { text: String(summary.served) }),
          h('span', { class: 'k', text: 'Earned' }), h('span', { text: coins(summary.earned) }),
          h('span', { class: 'k', text: 'Spent' }), h('span', { text: coins(summary.spent) }),
          h('span', { class: 'k', text: 'Net' }), h('span', { text: (net >= 0 ? '+' : '') + coins(net) }),
          h('span', { class: 'k', text: 'Rank' }), h('span', { text: `${st.rankName} (${st.reputation} rep)` }),
        )),
      hutchSummary(summary.colony),
      h('div', { class: 'card parch' }, h('b', { text: `Tomorrow: ${st.marketEvent.name}` }), h('div', { class: 'small', text: st.marketEvent.text })),
      st.nextRank() ? h('div', { class: 'small muted', text: `Next rank: ${st.nextRank().name} at ${st.nextRank().rep} reputation.` }) : null,
    ],
    foot: [btn('Start the new day', () => document.querySelector('.overlay .modal-head .btn').dispatchEvent(new MouseEvent('click')), { cls: 'primary', icon: 'sun', act: 'next-day', title: 'Dawn: gather in the Wilds, then open the door at the Counter' })],
  });
}

/** The night in the hutch, for the day summary. @param {any} col colony day report */
function hutchSummary(col) {
  if (!col || !(col.born.length || col.grown.length || col.died.length || col.lost || col.conceived)) return null;
  const rows = [];
  if (col.born.length) rows.push(h('span', { class: 'k', text: 'Kits born' }), h('span', { text: `${col.born.length} (${[...new Set(col.born.map((b) => b.mother))].join(', ')})` }));
  if (col.grown.length) rows.push(h('span', { class: 'k', text: 'Grown up' }), h('span', { text: col.grown.map((g) => g.name).join(', ') }));
  if (col.died.length) rows.push(h('span', { class: 'k', text: 'Died' }), h('span', { text: col.died.map((d) => `${d.name} (${causeWord(d.cause)})`).join(', ') }));
  if (col.conceived) rows.push(h('span', { class: 'k', text: 'Expecting' }), h('span', { text: `${col.conceived} doe${col.conceived > 1 ? 's' : ''}` }));
  return h('div', { class: 'card parch hutch-summary', 'data-summary': 'hutch' },
    h('div', { class: 'row' }, icon('rabbit'), h('b', { text: 'The hutch' })),
    h('div', { class: 'kv' }, ...rows),
    col.lost ? h('div', { class: 'small muted', text: `The hutch was too full for ${col.lost} more kit${col.lost > 1 ? 's' : ''}; the breeder took them.` }) : null);
}

export function showAnalysis(lab, m, recipe, title = 'Analysis of the brew') {
  const st = lab.state;
  const comp = Object.entries(m.composition).sort((a, b) => b[1] - a[1]);
  // the campaign shows what the eye and the arcanometer tell; the Free
  // Experiment shows the simulation's numbers
  const sand = lab.sandbox;
  const aura = sand || st.has('arcanometer') ? EFFECTS.filter((e, k) => Math.abs(m.effects[k]) >= 3).map((e) => e.label).join(', ') || 'no aura' : null;
  const kv = (k, v) => [h('span', { class: 'k', text: k }), h('span', { text: v })];
  modal({
    title,
    body: [
      h('div', { class: 'card parch' }, h('div', { class: 'kv' },
        h('span', { class: 'k', text: 'Colour' }), h('span', {}, swatch(m.color), ' ' + describeColor(m.color)),
        ...kv('Volume', `${m.ml} ml`),
        ...kv('Temperature', `${Math.round(m.temperature)}°C`),
        ...kv('Mixed', sand ? `stability ${Math.round(m.stability)}` : evennessWord(m.stability)),
        ...kv('Weight', sand ? `${m.density.toFixed(3)} g/ml` : densityWord(m.density)),
        ...kv('Thickness', sand ? `${viscosityClass(m.viscosity)} (${m.viscosity < 100 ? m.viscosity.toFixed(1) : Math.round(m.viscosity)} cP)` : viscosityClass(m.viscosity)),
        ...(sand ? [...kv('Volatility', String(Math.round(m.volatility))), ...kv('Charge', `${m.charge >= 0 ? '+' : ''}${m.charge.toFixed(2)}`)] : []),
        ...kv('Effects', 'unknown — test a dose in Trials'),
        ...(aura ? kv('Aura', aura) : []),
      )),
      h('div', { class: 'card parch' }, h('div', { class: 'small muted', text: 'Composition' }), ...comp.map(([id, f]) => h('div', { class: 'small', text: `${(f * 100).toFixed(1)}%  ${st.lookup(id) ? st.lookup(id).name : id}` }))),
      lab.sandbox ? null : h('div', { class: 'row' }, btn('Save as recipe', () => { const ev = st.addRecipe({ ...recipe, name: 'Experiment ' + (st.recipes.length + 1) }); for (const e of ev) lab.announce(e); toast('Recipe saved', '', 'book'); }, { icon: 'book' })),
    ],
  });
}

// ------------------------------------------------------------------ recipes
export function openRecipes(lab) {
  if (lab.showView) { lab.showView('book'); lab.views.book.open('recipes'); return; }
}

/** Render the recipe book into a container. */
export function renderRecipes(lab, container, rerender) {
  const st = lab.state;
  const m = { body: container, close: () => {} };
  const render = () => {
    clear(m.body);
    if (!st.recipes.length) {
      m.body.appendChild(h('div', { class: 'card parch', text: 'Your recipe book is empty. After bottling a potion you can save how you made it here, then prepare it again later.' }));
      return;
    }
    for (const r of st.recipes) {
      const ing = r.ingredients.map((i) => `${i.ml} ml ${st.lookup(i.id) ? st.lookup(i.id).name : '?'}${i.ground ? ' (ground)' : ''}`).join(', ');
      const steps = r.steps || [];
      const conf = recipeConfidence(r);
      const canAfford = r.ingredients.every((i) => lab.sandbox || st.stock(i.id) >= i.ml);
      const actions = h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        btn('Prepare', () => { prepareRecipe(lab, r); if (lab.showView) lab.showView('brew'); }, { icon: 'pour', disabled: !canAfford, title: canAfford ? 'Pour the ingredients in order; you follow the steps' : 'Not enough stock', act: 'prepare' }),
        st.has('homunculus') ? btn('Homunculus', () => { if (lab.startHomunculus(r) !== false && lab.showView) lab.showView('brew'); }, { icon: 'homunculus', disabled: !canAfford, act: 'homunculus', title: 'The homunculus follows every recorded step in the real cauldron' }) : null,
        btn('', async () => { const name = prompt('Rename recipe', r.name); if (name) { r.name = name.slice(0, 40); render(); } }, { icon: 'scroll', cls: 'icon', title: 'Rename' }),
        btn('', async () => { if (await confirmDialog('Delete recipe?', r.name, 'Delete', 'danger')) { st.recipes.splice(st.recipes.indexOf(r), 1); render(); } }, { icon: 'trash', cls: 'icon danger', title: 'Delete' }),
      );
      const verified = r.verified && Object.keys(r.verified).length;
      const ev = r.evidence || {};
      const weakest = Object.values(ev).reduce((w, e) => (w === null || evidenceRank(e.level) < evidenceRank(w) ? e.level : w), null);
      const stepList = h('ol', { class: 'recipe-steps' }, ...steps.map((x) => h('li', { class: 'small' + (x.op === 'skim' || x.op === 'distil' ? ' manual' : ''), text: describeStep(x, st.lookup) })));
      const limits = r.limits && r.limits.length ? r.limits : [];
      m.body.appendChild(h('div', { class: 'item parch recipe', 'data-recipe': r.id || '', 'data-confidence': conf, 'data-procedure': r.approx ? 'approximate' : 'recorded' },
        swatch(r.result.color),
        h('div', {},
          h('div', { class: 'title', text: r.name }),
          h('div', { class: 'meta' }, h('b', { text: 'Formulation: ' }), ing),
          steps.length ? h('details', { class: 'meta steps' }, h('summary', {}, h('b', { text: 'Procedure: ' }), `${steps.length} steps${r.approx ? ` — approximate (${r.approxWhy || 'saved before procedures were kept'}): a replay may not give the same potion` : ' — recorded as it was brewed'}`), stepList) : null,
          limits.length ? h('div', { class: 'meta muted', text: `The homunculus cannot do the ${limits.join(' or ')}: it skips ${limits.length > 1 ? 'those steps' : 'that step'}.` }) : null,
          h('div', { class: 'meta', text: `Result: ${describeColor(r.result.color)}${r.quality !== null && r.quality !== undefined ? ` · sold at ${Math.round(r.quality * 100)}% quality` : ''}` }),
          h('div', { class: 'meta' }, h('span', { class: verified ? 'ok' : 'muted', text: verified ? 'Tested: ' : 'Untested formula — effects unknown' }), ...(verified ? fxChips(r.verified, 0.5) : []),
            weakest ? h('span', { class: 'muted', text: ` · ${weakest === 'preliminary' ? 'one reading' : weakest}` }) : null),
          h('div', { class: 'meta conf conf-' + conf }, h('b', { text: 'Reproduction: ' }), `${CONF_LABEL[conf]} — ${CONFIDENCE_TEXT[conf]}${r.brews ? ` (brewed ${r.brews}×, reproduced ${r.reproduced | 0}×${r.mismatched ? `, differed ${r.mismatched}×` : ''})` : ''}`),
        ),
        actions,
      ));
    }
  };
  render();
  void rerender;
}

const CONF_LABEL = { untested: 'Untested', tested: 'Tested once', reproduced: 'Reproduced', unreliable: 'Unreliable' };

/**
 * Pour a recipe's ingredients in order (the player still does the rest).
 * With a recorded procedure, only the ingredients before its first other
 * step are poured; the book lists what comes next.
 */
function prepareRecipe(lab, r) {
  const steps = r.steps || [];
  const firstOther = steps.findIndex((x) => x.op !== 'pour');
  const lead = steps.length ? steps.slice(0, firstOther < 0 ? steps.length : firstOther).filter((x) => x.op === 'pour').map((x) => ({ id: x.id, ml: x.ml })) : r.ingredients.slice();
  const queue = lead.length ? lead : r.ingredients.slice();
  const rest = steps.slice(firstOther < 0 ? steps.length : firstOther);
  const next = () => {
    if (!queue.length) {
      toast('Ingredients poured', rest.length ? `Next: ${rest.slice(0, 3).map((x) => describeStep(x, lab.state.lookup)).join('; ')}${rest.length > 3 ? '… (see the book)' : ''}.` : `Now ${r.stirSeconds ? 'stir' : 'mix'} and serve at ${r.serveTemp}°C.`, 'book', 7000);
      return;
    }
    if (lab.sim.emitter.pouring) { setTimeout(next, 200); return; }
    const i = queue.shift();
    lab.selectIngredient(i.id);
    lab.startPour(lab.pourX, Math.round(i.ml / SIM.ML_PER_PARTICLE));
    setTimeout(next, 250);
  };
  next();
}

// ------------------------------------------------------------------ journal
export function openJournal(lab, tab = 'journal') {
  if (lab.showView) { lab.showView('book'); lab.views.book.open(tab === 'discoveries' ? 'journal' : tab); }
}

/** Render a journal tab (journal | achievements | history) into a container. */
export function renderJournal(lab, container, tab = 'journal') {
  const st = lab.state;
  const m = { body: container };
  const current = tab === 'journal' ? 'discoveries' : tab;
  const render = () => {
    clear(m.body);
    if (current === 'discoveries') {
      const entries = Object.values(st.journal).filter((e) => e.kind !== 'ingredient').sort((a, b) => b.day - a.day);
      const total = st.world.reactions.length;
      m.body.appendChild(h('div', { class: 'small muted', text: `Reactions discovered: ${st.reactionsDiscovered()} of ${total}. Keep experimenting — heat, cold, stirring and new combinations all reveal secrets.` }));
      if (!entries.length) m.body.appendChild(h('div', { class: 'card parch', text: 'Nothing recorded yet. Watch closely as you brew: boiling, freezing, dough, dissolving and reactions are all noted here.' }));
      for (const e of entries) {
        m.body.appendChild(h('div', { class: 'card parch' }, h('div', { class: 'row' }, icon(e.kind === 'reaction' ? 'eye' : e.kind === 'fire' ? 'flame' : e.kind === 'phase' ? 'thermo' : e.kind === 'arcane' ? 'awaken' : 'scroll'), h('b', { text: e.title }), h('span', { class: 'spacer' }), h('span', { class: 'small muted', text: `Day ${e.day}` })), h('div', { class: 'small', text: e.text })));
      }
    } else if (current === 'ingredients') {
      const list = h('div', { class: 'list' });
      const ids = st.world.ingredients.concat(st.world.materials.filter((x) => x.product && (st.knowledge[x.id] || {}).seen).map((x) => x.id));
      for (const id of ids) {
        const mt = st.lookup(id);
        const known = (mt.tier <= st.rank && st.knows(id)) || (st.knowledge[id] || {}).seen;
        list.appendChild(h('div', { class: 'item parch' + (known ? '' : ' locked') }, jarCanvas(mt, 14, 18),
          h('div', {}, h('div', { class: 'title', text: known ? mt.name : '???' }), h('div', { class: 'meta', text: known ? mt.description : 'Not yet available.' })),
          known ? btn('', () => openIngredient(lab, id), { icon: 'lens', cls: 'icon', title: 'Inspect' }) : icon('lock'),
        ));
      }
      m.body.appendChild(list);
    } else if (current === 'achievements') {
      const list = h('div', { class: 'list' });
      for (const a of ACHIEVEMENTS) {
        const got = !!st.achievements[a.id];
        list.appendChild(h('div', { class: 'item parch' + (got ? '' : ' locked') }, icon(got ? 'star' : 'lock'), h('div', {}, h('div', { class: 'title', text: a.name }), h('div', { class: 'meta', text: a.desc })), h('span', { class: 'price' }, icon('coin', 'sm'), String(a.reward))));
      }
      m.body.appendChild(list);
    } else {
      if (!st.history.length) m.body.appendChild(h('div', { class: 'card parch', text: 'No sales yet.' }));
      for (const s of st.history) {
        m.body.appendChild(h('div', { class: 'item parch' }, s.color ? swatch(s.color) : icon('flask'), h('div', {}, h('div', { class: 'title', text: s.potion }), h('div', { class: 'meta', text: `Day ${s.day} · ${s.customer} (${s.title}) · ${s.quality === null || s.quality === undefined ? 'awaiting their verdict' : Math.round(s.quality * 100) + '%'}` })), h('span', {}, h('span', { class: 'stars', text: s.stars === null || s.stars === undefined ? '…' : starsText(s.stars) }), h('div', { class: 'small', text: `+${coins(s.paid)}` }))));
      }
    }
  };
  render();
}

// ------------------------------------------------------------------ pause / settings
export function openPause(lab) {
  const app = lab.app;
  let m;
  const items = [
    btn('Back to the game', () => m.close(), { cls: 'primary', icon: 'speed', act: 'resume' }),
    btn('How to play', () => { m.close(); openHelp(); }, { icon: 'help', act: 'help' }),
  ];
  if (!lab.sandbox) items.push(btn('Guided tour', () => { m.close(); if (lab.tutorial) { lab.tutorial.start(true); lab.showView('brew'); } }, { icon: 'bulb', act: 'tour', title: 'Walk through every part of the shop again' }));
  items.push(btn('Recent notes', () => { m.close(); lab.openNotes(); }, { icon: 'scroll', act: 'notes-log', title: 'Everything the game has told you lately, in full' }));
  items.push(btn('Settings & saves', () => { m.close(); openSettings(app, lab); }, { icon: 'gear', act: 'settings' }));
  if (lab.sandbox && lab.receiver && lab.receiver.count) items.push(btn('Pour back distillate', () => { lab.pourReceiver(); m.close(); }, { icon: 'alembic' }));
  items.push(btn(lab.sandbox ? 'Leave the experiment' : 'Save & quit to title', () => { m.close(); app.showMenu(); }, { icon: 'door', act: 'quit' }));
  m = modal({ title: lab.sandbox ? 'Free Experiment' : 'Menu', body: h('div', { class: 'list' }, items) });
}

/** The Free Experiment's alembic receiver flask: pour the distillate back, or away. @param {any} lab */
export function openReceiver(lab) {
  const st = lab.state, rec = lab.receiver;
  if (!rec || !rec.count) return;
  const tot = Object.values(rec.comp).reduce((a, b) => /** @type {number} */ (a) + /** @type {number} */ (b), 0) || 1;
  const parts = Object.entries(rec.comp).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, f]) => `${st.lookup(id) ? st.lookup(id).name : id} ${Math.round((f / tot) * 100)}%`).join(', ');
  let m;
  m = modal({
    title: `Receiver flask · ${rec.count * SIM.ML_PER_PARTICLE} ml`,
    body: h('div', { class: 'card parch' }, h('div', { class: 'small', text: `What the alembic drew off: ${parts}.` }),
      h('div', { class: 'small muted', text: 'Water and spirit boil off together: a distillate is rarely one thing.' })),
    foot: [
      btn('Pour into the cauldron', () => { lab.pourReceiver(); m.close(); }, { icon: 'pour', act: 'receiver-pour' }),
      btn('Pour away', () => { lab.receiver = null; m.close(); }, { icon: 'trash', cls: 'danger', act: 'receiver-away' }),
    ],
  });
}

export function openHelp() {
  // one section open at a time keeps the sheet short; the quick start is open first
  const sec = (title, ic, lines, open = false) => h('details', { class: 'card parch help-sec', ...(open ? { open: true } : {}) },
    h('summary', {}, icon(ic), h('span', { text: title })),
    ...lines.map((l) => h('div', { class: 'small', text: '• ' + l })));
  const body = h('div', { class: 'help' },
    h('div', { class: 'card parch help-day' }, h('h3', { text: 'A day in the shop' }),
      h('ol', { class: 'small' }, ...[
        'Dawn: gather herbs and minerals in the Wilds (dawn flowers close once the shop opens).',
        'Open the door at the Counter and read the customer’s order.',
        'Brew: pour, crush, stir, heat or chill in the cauldron.',
        'Test a dose on a rabbit in Trials: only a test shows what a mixture does.',
        'Bottle it, check the label and sell it at the Counter — agree on a price.',
        'When the last customer has gone (dusk), close the shop for the night.',
      ].map((t) => h('li', { text: t })))),
    sec('Orders and selling', 'stall', ['Customers ask for an effect — healing, strength, love, fire… — at a strength in percent (everyday orders want about 8–15 %).', 'Most orders forbid side effects: “no other effect above 1.2 %”. Every other kind of magic in the bottle must stay that faint.', 'Before a sale you write the label — tested values, the guild theory’s estimates, “none” or unknown — and bargain over the price. The customer comes back the next day: pleased, or with a complaint. Refund them, dispute it with your trial records, or turn them away.', 'Bottle onto the potion shelves whenever there is room (3 bottles; more with a Bottle Shelf, Potion Cabinet or Bottle Cellar). Bottles of one batch share its trials.', 'Honest, well-tested potions earn reputation. Reputation raises your rank, which opens regions, ingredients, equipment and harder orders.'], true),
    sec('Ingredients and side effects', 'leaf', ['The Shop sells no prepared reagents — only free well water and two plain solvents, oil and spirit. Every effect comes from what you gather.', 'Common and Uncommon ingredients bring side effects; Rare ingredients carry one faint secondary effect. Unique and Legendary species are naturally pure. Cancel them with their opposites — fire and frost, life and death (life also mends poison, two parts to one), acid and alkali.', 'Long-press (or right-click) a jar to see what it does and what cancels its side effects.', 'You know what each plain ingredient does. You do NOT know what a mixture does: extraction, heat, reactions and hidden laws change it.']),
    sec('Brewing', 'cauldron', ['Pour: tap a jar, then a dose button (25–250 ml) — or hold your finger in the cauldron, or drag a jar onto it.', 'Crush: whole roots, leaves and stones go into the pot whole and give up almost nothing until you break them up with Crush (the pestle).', 'Steep at the right heat: most herbs give two to three times as much held warm in their steeping window (see the herb’s card and your journal). Some want ice-cold water: Frostcap near 9 °C gives about three times as much — but frozen solid gives less. Heartpetal wilts above about 85 °C.', 'Stir after every addition: an unstirred brew pours unevenly, so later bottles may not match the tested dose. Auto stirs for you (the Clockwork Stirrer about three times as fast).', 'The fire control: right heats, left cools; tap Off beside it (or press 0) to put it out at once. The lid keeps steam in; boiling with the lid off makes a brew smaller and stronger — side effects too. Add water to weaken it.', 'Tap the ml · °C readout over the cauldron to see what is in it; Inspect reads one spot; Sample measures what a bottle would hold.']),
    sec('Arcane awakening', 'awaken', ['Only Arcane variants carry an activation threshold; ordinary ingredients can never awaken. Heat the brew past it (or, for cold magic, chill it below) and the magic awakens: it glows and acts two to three times stronger — side effects too.', 'In a blend the threshold is the mix of its Arcane ingredients’ thresholds, by volume. Mix first at room temperature, then heat or chill; a half-mixed brew awakens unevenly.', 'Awakened magic stays awake when it cools, is bottled or kept. Only dilution and reactions undo it. The Arcanometer reads a brew’s threshold.']),
    sec('Trials and rabbits', 'rabbit', ['Choose a rabbit and give it a dose (5, 10 or 25 ml) from the cauldron tap or the sealed vial. One trial reads every effect at once.', 'Each reading is uncertain: the ± margin is how far the truth may lie. One reading is a rough guess; repeating it on the same rabbit helps a little; other rabbits help most (detected once → repeated → corroborated).', '“Not detected” is not proof of absence: a faint effect can hide below the noise. Cautious customers want readings repeated or corroborated, and every customer pays more for a well-tested label.', 'Effects pile up in a rabbit and fade slowly. Past its own hidden limit an effect runs out of control and can kill it; fire and acid burn; strength and vitality can make it attack; love makes it mate. A purging draught washes everything out. Rabbits can be fed, bred, bought and put down; a body’s remains can be recovered once as an ingredient.', 'When a trial surprises you, a hidden law may be at work. Confirm it twice and your theory learns it.']),
    sec('Wilds and cultivation', 'tree', ['Whisperwood is your first biome. Each environment has one native creature and a dominant magical effect. Further biomes unlock through successful sales and guild rank.', 'Wild specimens are finite: they do not regrow with waiting, rain, shop days or watering. Spend one Traveller Coin to create new terrain, resources and wildlife; collected items stay yours.', 'Up to three Traveller Coins recharge, one every 25 minutes including time away. Excellent customers sometimes bring an extra coin.', 'Harvesting may drop a species-specific seed, spore or mineral propagule. The personal garden opens after your first harvest. Plant, water and harvest there; Arcane seeds preserve their variant, and rare crops need more time and specialist beds.', 'A garden harvest consumes its crop. Moist soil accelerates botanical growth; offline growth is capped at eight hours.']),
    sec('Customer patience and commissions', 'clock', ['Immediate customers have a visible patience bar. Waiting during active play lowers their offer; eventually they leave. Suspended time and dialogs do not count.', 'From Adept onward, special commissions appear on the counter. Accept or decline without a penalty. Prepare a complete bottle, keep it on your potion shelves and deliver it during the displayed pickup days for a larger reward.', 'Several commissions can be active at once. Game-day scheduling, crop progress, remaining wild resources and seed identities are saved.']),
    sec('Recipes and the Book', 'book', ['After a sale you can save the brew as a recipe: what went in, and every step in order. Prepare pours it again; the Brass Homunculus replays every step.', 'The Book also keeps every trial, the laws you discovered, all ingredients, your journal, awards and sales.']),
    sec('Keys and tips', 'bulb', ['Keys: 1 pour · 2 stir · 3 crush · 5 inspect · L lid · B bottle · F speed · A auto-stir · arrows fire · 0 fire off · S shop · R recipes · C/V/W/T/J rooms · Esc menu.', 'Advice at the Counter buys a hint for a hard order.', 'Orders far below your rank earn little reputation; a technique sold well for the first time earns a bonus.', 'Out of money? The guild helps a struggling apprentice once a day — and well water is always free.', 'The Free Experiment has every tool, the skimmer, the alembic, a heat map and exact physical readings.']),
  );
  // opening one section closes the others
  body.addEventListener('toggle', (e) => {
    const t = /** @type {HTMLDetailsElement} */ (e.target);
    if (t.open) for (const d of body.querySelectorAll('details[open]')) if (d !== t) /** @type {HTMLDetailsElement} */ (d).open = false;
  }, true);
  modal({ title: 'How to play', wide: true, body: [body] });
}

export function openSettings(app, lab) {
  const s = app.settings;
  const vol = (key, label) => {
    const inp = /** @type {HTMLInputElement} */ (h('input', { type: 'range', class: 'vol', min: '0', max: '100', value: String(Math.round(s[key] * 100)), 'aria-label': label }));
    inp.addEventListener('input', () => {
      s[key] = Number(inp.value) / 100;
      app.applySettings();
      // the music slider at zero is music off
      if (key === 'music' && s.musicOn !== s.music > 0) { s.musicOn = s.music > 0; audio.music(s.musicOn); }
    });
    return h('div', { class: 'toggle-row' }, h('span', { text: label }), inp);
  };
  const check = (key, label, after) => {
    const inp = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', 'aria-label': label }));
    inp.checked = !!s[key];
    inp.addEventListener('change', () => { s[key] = inp.checked; app.applySettings(); after && after(); });
    return h('div', { class: 'toggle-row' }, h('span', { text: label }), inp);
  };
  const quality = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': 'Graphics quality', style: { width: '55%' } }, ...[['auto', 'Automatic'], ['high', 'Best looking'], ['medium', 'Balanced'], ['low', 'Battery saver']].map(([q, t]) => h('option', { value: q, text: t }))));
  quality.value = s.quality;
  const resolution = /** @type {HTMLSelectElement} */ (h('select', { 'aria-label': 'Wilds resolution', 'data-act': 'resolution', style: { width: '55%' } }, ...[['1', 'Standard (1×)'], ['2', 'High (2×)'], ['3', 'Very high (3×)'], ['4', 'Ultra (4×)']].map(([q, t]) => h('option', { value: q, text: t }))));
  resolution.value = String(s.resolution ?? 3);
  resolution.addEventListener('change', () => { s.resolution = Number(resolution.value); app.applySettings(); });
  quality.addEventListener('change', () => { s.quality = /** @type {any} */ (quality.value); app.applySettings(); if (lab) lab.resize(true); });
  const fileIn = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: '.json,application/json', class: 'hidden' }));
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    try {
      const st = parseImport(await f.text());
      if (await confirmDialog('Import this save?', `World "${st.seed}", day ${st.day}, ${coins(st.coins)} coins. Your current game will be replaced.`, 'Import')) {
        saveGame(st);
        toast('Save imported', '', 'check');
        app.startGame(st);
      }
    } catch (e) {
      toast('Import failed', e.message, 'close', 5000);
    }
  });
  const saveSection = lab && !lab.sandbox ? h('div', { class: 'card parch' },
    h('h3', { text: 'Saves' }),
    h('div', { class: 'small', text: 'Saved automatically on this device. Export a file to back it up or move it to another device.' }),
    h('div', { class: 'row', style: { flexWrap: 'wrap', marginTop: '6px' } },
      btn('Export save', () => { lab.save(); exportSave(lab.state); }, { icon: 'scroll', act: 'export' }),
      btn('Import save', () => fileIn.click(), { icon: 'plus', act: 'import' }),
      fileIn,
    )) : h('div', { class: 'card parch' }, h('h3', { text: 'Saves' }), h('div', { class: 'row', style: { flexWrap: 'wrap' } }, btn('Import save', () => fileIn.click(), { icon: 'plus', act: 'import' }), fileIn));
  modal({
    title: 'Settings',
    onClose: () => app.saveSettings(),
    body: [
      h('div', { class: 'card parch' }, h('h3', { text: 'Sound' }), vol('master', 'Volume'), vol('sfx', 'Effects'), vol('music', 'Music'), check('muted', 'Mute everything')),
      h('div', { class: 'card parch' }, h('h3', { text: 'Display' }), h('div', { class: 'toggle-row' }, h('span', { text: 'Graphics' }), quality),
        h('div', { class: 'small muted', text: 'Automatic lowers the detail when the game runs slowly. Battery saver draws 30 frames a second without lighting. The brewing itself is identical in every mode.' }),
        h('div', { class: 'toggle-row' }, h('span', { text: 'Wilds resolution' }), resolution),
        h('div', { class: 'small muted', text: 'Draws the wilds and the enclosures at a higher resolution: diagonal and curved edges come out finer and cleaner, every pixel stays sharp (nothing is blurred). Standard shows the art pixels as they are, and is the fastest.' }),
        check('showFps', 'Show frame rate')),
      saveSection,
      h('div', { class: 'small muted credits', text: 'The Alchemist’s Shop — all art, sound, font and code made for this game. Runs fully offline.' }),
    ],
  });
}
