// The alchemist's book: recipes, the trial log, the laws of magic (the
// universal ones every guild alchemist knows and the hidden ones you have
// confirmed by experiment), the journal, the ingredient encyclopedia with
// each plain ingredient's known effects, achievements and sales.

import { KINDS } from '../../game/kinds.js';
import { h, btn, clear } from '../dom.js';
import { icon } from '../icons.js';
import { audio } from '../../audio/audio.js';
import * as panels from '../panels.js';
import { SUBJECT_BY_ID } from '../../game/experiments.js';
import { EFFECTS, EFFECT_BY_KEY, EFFECT_KEYS } from '../../alchemy/effects.js';
import { rgbToHex } from '../../core/color.js';
import { RARITIES } from '../../materials/rarity.js';

const TABS = [
  ['recipes', 'Recipes', 'book'], ['trials', 'Trials', 'dropper'], ['laws', 'Laws', 'eye'], ['ingredients', 'Ingredients', 'leaf'],
  ['journal', 'Journal', 'scroll'], ['achievements', 'Awards', 'trophy'], ['history', 'Sales', 'coin'],
];

export class BookView {
  /** @param {import('../lab.js').LabScreen} lab */
  constructor(lab) {
    this.lab = lab;
    this.el = h('section', { class: 'view view-book', 'data-view': 'book' });
    this.tab = 'recipes';
  }

  build() {
    const el = clear(this.el);
    this.tabs = h('div', { class: 'book-tabs', role: 'tablist' });
    this.body = h('div', { class: 'book-body' });
    el.append(this.tabs, this.body);
    this.refresh();
  }

  /** @param {string} t */
  open(t) {
    this.tab = t;
    this.refresh();
  }

  refresh() {
    if (!this.tabs) return;
    const tabs = clear(this.tabs);
    for (const [k, label, ic] of TABS) {
      if (this.lab.sandbox && (k === 'history' || k === 'achievements')) continue;
      tabs.appendChild(btn(label, () => { this.tab = k; audio.play('page'); this.refresh(); }, { icon: ic, cls: this.tab === k ? 'active' : '', act: 'book-' + k }));
    }
    const body = clear(this.body);
    const lab = this.lab;
    switch (this.tab) {
      case 'recipes': panels.renderRecipes(lab, body, () => this.refresh()); break;
      case 'trials': this.renderTrials(body); break;
      case 'laws': this.renderLaws(body); break;
      case 'ingredients': this.renderIngredients(body); break;
      default: panels.renderJournal(lab, body, this.tab);
    }
  }

  /** @param {HTMLElement} body */
  renderTrials(body) {
    const st = this.lab.state;
    const recs = st.trials.records;
    body.appendChild(h('div', { class: 'small muted', text: `${st.stats.trials || 0} trials run. Each records exactly what it revealed and what the guild theory expected.` }));
    if (!recs.length) { body.appendChild(h('div', { class: 'card parch', text: 'No trials yet. In the Trials room, give a measured dose to one of your rabbits.' })); return; }
    for (const r of recs.slice(0, 40)) {
      const s = SUBJECT_BY_ID[r.subjectId];
      body.appendChild(h('div', { class: 'item parch' },
        h('span', { class: 'swatch big', style: { background: rgbToHex(r.look.color) } }),
        h('div', {},
          h('div', { class: 'title', text: `#${r.serial} ${r.rabbitName ? `${r.rabbitName} the ${s ? s.name : 'rabbit'}` : s ? s.name : r.subjectId} · ${r.ml} ml` }),
          h('div', { class: 'meta' }, ...r.revealed.filter((k) => r.values[k] !== 0 || r.anomalies.includes(k)).map((k) => h('span', { class: 'fx-chip' + (r.anomalies.includes(k) ? ' anomaly' : ''), title: `${EFFECT_BY_KEY[k].label}: observed ${r.values[k]}${r.err && r.err[k] !== undefined ? ` ±${r.err[k]}` : ''}, theory ${r.theory[k]}` }, icon(EFFECT_BY_KEY[k].icon, 'sm'), ` ${Math.round(r.values[k])}`))),
          h('div', { class: 'meta', text: r.observations.map((o) => o.text).join(' ') }),
          r.parts && r.parts.length ? h('div', { class: 'meta muted', text: 'Batch: ' + r.parts.map((p) => `${p.ml} ml ${st.lookup(p.id) ? st.lookup(p.id).name : '?'}`).join(', ') }) : null),
        h('span', { class: 'small muted', text: `Day ${r.day}` })));
    }
  }

  /** @param {HTMLElement} body */
  renderLaws(body) {
    const st = this.lab.state;
    body.appendChild(h('div', { class: 'card parch' }, h('h3', { text: 'The Guild Primer' }),
      ...['Fire and frost cancel each other where they meet.', 'Life (vitality) and death cancel each other.', 'Vitality neutralises toxicity: two parts of healing cure one part of poison.', 'Acids and alkalis neutralise. Acidity below zero means alkaline.', 'Only what dissolves takes effect: whole roots and stones do nothing until crushed or ground, and grains beyond what the liquid can hold barely count. Heat helps many things dissolve.', 'Effects act where substances meet. Layers that never mix never interact — stir!', 'Strong effects show diminishing returns.', ...Object.values(KINDS).map((k) => k.lore)]
        .map((t) => h('div', { class: 'small', text: '• ' + t }))));
    const laws = st.world.laws || [];
    const found = laws.filter((L) => st.trials.laws[L.id] && st.trials.laws[L.id].found !== null);
    const hinted = laws.filter((L) => st.trials.laws[L.id] && st.trials.laws[L.id].found === null);
    body.appendChild(h('div', { class: 'small muted', text: `This world hides ${laws.length} laws of resonance between effects. Discovered: ${found.length}. A law shows itself in trials where its effects meet; two observations confirm it.` }));
    for (const L of found) {
      body.appendChild(h('div', { class: 'item parch' }, icon('star'),
        h('div', {}, h('div', { class: 'title', text: L.name }), h('div', { class: 'meta', text: L.lore }),
          h('div', { class: 'meta muted', text: `${EFFECTS[L.a].label} with ${EFFECTS[L.b].label}${L.c >= 0 ? ` → ${EFFECTS[L.c].label}` : ''} · confirmed on day ${st.trials.laws[L.id].found}` }))));
    }
    for (const L of hinted) {
      body.appendChild(h('div', { class: 'item parch locked' }, icon('help'),
        h('div', {}, h('div', { class: 'title', text: 'An unexplained anomaly' }), h('div', { class: 'meta', text: `Something changed ${EFFECTS[L.a].label.toLowerCase()} in one of your trials. Repeat similar mixtures to confirm what.` }))));
    }
  }

  /** @param {HTMLElement} body */
  renderIngredients(body) {
    const lab = this.lab, st = lab.state;
    body.appendChild(h('div', { class: 'small muted', text: 'The effects of every plain ingredient are known to the guild. Mixtures are not — that is what the trials are for.' }));
    const list = h('div', { class: 'list' });
    for (const id of st.world.ingredients) {
      const m = st.lookup(id);
      // a wild ingredient is unknown until it is first gathered
      const seen = lab.sandbox || (st.knows(id) && (m.tier <= st.rank || st.stock(id) > 0 || !!m.wild));
      const fx = m.remains ? [] : EFFECT_KEYS.map((k) => [k, (m.effects && m.effects[k]) || 0]).filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      list.appendChild(h('div', { class: 'item parch' + (seen ? '' : ' locked') },
        seen ? panels.jarCanvas(m, 18, 24) : icon('help'),
        h('div', {},
          h('div', { class: 'title', text: seen ? m.name : '???' }),
          seen && m.rarity ? h('div', { class: 'meta', text: `${RARITIES[m.rarity].label}${m.arcaneVariant ? ' · Arcane' : ' · Ordinary'} · ${st.garden.seeds[id] || 0} seeds` }) : null,
          seen ? h('div', { class: 'meta' }, m.remains ? h('span', { class: 'muted', text: 'effects unknown — test it' }) : fx.length ? fx.map(([k, v]) => h('span', { class: 'fx-chip', title: EFFECT_BY_KEY[k].label }, icon(EFFECT_BY_KEY[k].icon, 'sm'), ` ${Math.round(v)}`)) : h('span', { class: 'muted', text: 'no magical effect' })) : h('div', { class: 'meta', text: m.wild && !st.knows(id) ? 'Not yet gathered.' : 'Not yet available.' }),
          seen ? h('div', { class: 'meta muted', text: `${m.remains ? `remains of ${m.remains.rabbitName}` : m.wild ? `wild · ${m.wild.region}` : m.form}${m.solubility > 0.03 ? ' · dissolves' : ''}${m.binder > 0.3 ? ' · forms dough' : ''}` }) : null),
        seen ? btn('', () => panels.openIngredient(lab, id), { icon: 'lens', cls: 'icon', title: 'Inspect', act: 'inspect-' + id }) : icon('lock')));
    }
    body.appendChild(list);
  }
}
