// The trials room is the rabbit farm: every test is a real, measured dose of
// the brew (or of a sealed vial) given to one of the colony's Moon Rabbits,
// right where they live. Every dose reads a little differently and each
// rabbit feels a potion a little more or less than the next, so one reading
// is only a rough guess. One section shows what the brew is expected to do:
// every effect as a percentage — the mean of every trial of the batch, the
// margin of that mean (a single reading carries the full margin of one
// dose, never ±0) and the level of the evidence. Trials on the same rabbit keep the others
// clean but pile the effect up in it towards a degeneration threshold that
// is hidden and its own; trials on others average out each rabbit's bias. Any trial can be replayed on the chosen rabbit's
// portrait without spending a drop.

import { h, btn, clear, toast } from '../dom.js';
import { icon } from '../icons.js';
import { audio } from '../../audio/audio.js';
import { SUBJECT_BY_ID, DOSES, missingEffects } from '../../game/experiments.js';
import { EFFECTS, EFFECT_BY_KEY, EFFECT_INDEX, EFFECT_KEYS, potencyWord } from '../../alchemy/effects.js';
import { SIM } from '../../simulation/constants.js';
import { applyTrials } from '../../game/commerce.js';
import { summarize, addSamples, EVIDENCE_TEXT, evidenceRank, requirementEvidence } from '../../game/experiments.js';
import { evidenceOf } from '../../game/commerce.js';
import { shortName } from '../../game/customers.js';

/** A short word for each evidence level (experiments.js). */
const LEVEL_SHORT = { preliminary: '1 reading', repeated: 'repeated', corroborated: 'corroborated', certified: 'certified' };
import { drawRabbit } from '../../rendering/rabbit.js';
import { focusRabbit, findRabbit, rabbitSnap, decodeSnap, lookFromSeed, RABBIT_MARKS } from '../../game/colony.js';
import { HutchPanel } from './hutch.js';

/** how long a replay runs (s) */
const REPLAY_T = 3.2;

export class TrialsView {
  /** @param {import('../lab.js').LabScreen} lab */
  constructor(lab) {
    this.lab = lab;
    this.el = h('section', { class: 'view view-trials', 'data-view': 'trials' });
    this.time = 0;
    this.last = null;
    this.drag = null;
    /** per-rabbit reaction flash (by rabbit id) */
    /** @type {Record<string, number>} */
    this.rreact = {};
    /** a trial being replayed on the rabbit's portrait: no state changes, no doses */
    /** @type {{rec:any, t:number}|null} */
    this.replay = null;
    this.hutch = new HutchPanel(this);
    /** kept for the tutorial: the card to point at */
    /** @type {Record<string, {card:HTMLElement}>} */
    this.cards = {};
  }

  get source() {
    const lab = this.lab;
    if (lab.trialSource === 'vial' && lab.state.vial) return 'vial';
    return 'cauldron';
  }

  available() {
    const lab = this.lab;
    if (this.source === 'vial') return lab.state.vial ? lab.state.vial.ml : 0;
    return lab.tapAvailable();
  }

  /** The dose the next test gives (what is available, in whole particles). */
  doseMl() {
    const d = Math.min(this.lab.trialDose, this.available());
    return d < SIM.ML_PER_PARTICLE ? this.lab.trialDose : Math.floor(d / SIM.ML_PER_PARTICLE) * SIM.ML_PER_PARTICLE;
  }

  dispose() { this.hutch.crisp?.dispose(); }

  build() {
    const lab = this.lab, st = lab.state;
    const el = clear(this.el);
    this.expect = h('div', { class: 'card parch estimate-card', 'data-role': 'estimate' });
    this.status = h('div', { class: 'trials-status small' });
    this.dropper = h('div', { class: 'dropper', role: 'button', tabindex: '0', 'aria-label': 'Dropper: drag onto a rabbit to give it the dose' }, icon('dropper', 'lg'), h('span', { class: 'small', text: 'Drag' }));
    this.bindDropper();
    this.report = h('div', { class: 'trial-report' });
    el.append(this.expect, this.status, this.hutch.el, this.report);
    this.cards = { rabbit: { card: this.hutch.el } };
    void st;
    this.refresh();
  }

  /** Choose the rabbit the next dose goes to. @param {string} id */
  select(id) {
    const st = this.lab.state;
    if (!st.selectRabbit(id)) return;
    const r = findRabbit(st.colony, id);
    audio.play(r && r.alive ? 'squeak' : 'click');
    this.replay = null;
    this.lab.save();
    this.refresh();
  }

  /** Replay a rabbit trial on the portrait (nothing is consumed or changed). @param {any} rec */
  startReplay(rec) {
    if (!rec || !rec.replay) return;
    if (rec.rabbitId && findRabbit(this.lab.state.colony, rec.rabbitId)) {
      this.lab.state.selectRabbit(rec.rabbitId);
      this.refresh();
    }
    this.replay = { rec, t: 0 };
    this.last = rec;
    this.renderReport();
    const ol = this.report.querySelector('.obs-list');
    if (ol) ol.classList.add('replaying');
    audio.play(rec.died ? 'toll' : 'squeak');
    const p = this.hutch.el.querySelector('.rabbit-detail');
    if (p && p.scrollIntoView) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /**
   * Where the dose comes from and how much: shown beside the Give button.
   * @returns {HTMLElement[]}
   */
  doseControls() {
    const lab = this.lab, st = lab.state;
    const src = this.source;
    const from = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Dose from' }, h('span', { class: 'small seg-k', text: 'From' }),
      btn(`Cauldron · ${Math.round(lab.tapAvailable())} ml`, () => { lab.trialSource = 'cauldron'; this.refresh(); }, { cls: src === 'cauldron' ? 'active' : '', act: 'src-cauldron', title: 'Draw the dose from the cauldron’s tap' }),
      st.vial ? btn(`Vial · ${Math.round(st.vial.ml)} ml`, () => { lab.trialSource = 'vial'; this.refresh(); }, { cls: src === 'vial' ? 'active' : '', act: 'src-vial', title: `The sealed vial: ${Math.round(st.vial.ml)} of ${Math.round(st.vial.bottledMl || st.vial.ml)} ml left` }) : null,
      // the iterate loop: test the vial, pour the rest back, improve, bottle again
      st.vial && src === 'vial' ? btn('Pour back', () => lab.pourBackVial(), { icon: 'pour', act: 'trials-pour-back', title: 'Return the rest of the vial to the cauldron' }) : null,
      st.vial && src === 'vial' && lab.sandbox ? btn('Discard', () => { lab.discardVial(); this.refresh(); }, { icon: 'trash', cls: 'danger', act: 'trials-discard' }) : null);
    const doses = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Dose' }, h('span', { class: 'small seg-k', text: 'Dose' }),
      ...DOSES.map((ml) => btn(`${ml} ml`, () => { lab.trialDose = ml; this.refresh(); }, { cls: lab.trialDose === ml ? 'active' : '', act: 'dose-' + ml })));
    return [from, doses];
  }

  refresh() {
    const lab = this.lab, st = lab.state;
    if (!this.expect) return;
    const src = this.source;
    // ---- what this batch is expected to do (the one estimate section)
    const cert = this.estimate();
    const com = st.current;
    const need = com ? missingEffects(com, cert.values) : [];
    this.renderExpected(cert);
    const status = clear(this.status);
    if (cert.changed && src === 'cauldron') status.append(h('div', { class: 'warn small', text: 'Earlier trials of this batch are outdated: you added ingredients since.' }));
    if (cert.stale.length) status.append(h('div', { class: 'warn small', text: `The brew has changed since it was tested (${cert.stale.map((k) => EFFECT_BY_KEY[k].label).join(', ')}): reactions, heat or settling. Test again.` }));
    if (com && need.length) {
      status.append(h('div', { class: 'small' }, h('span', { text: 'Not yet tested for the order: ' }), ...need.map((k) => h('span', { class: 'fx-chip need' }, icon(EFFECT_BY_KEY[k].icon, 'sm'), ' ' + EFFECT_BY_KEY[k].label))));
    } else if (com && com.effectOrder) {
      status.append(h('div', { class: 'ok small', text: 'Every effect the order asks about has been tested for this ' + (src === 'vial' ? 'vial.' : 'batch.') }));
    }
    this.hutch.render();
    this.renderReport();
  }

  /** What the guild's theory predicts for the source, by effect key (or null). */
  theoryOf() {
    const lab = this.lab, st = lab.state;
    try {
      const t = this.source === 'vial' && st.vial ? lab.vialTheory(st.vial) : lab.theory();
      return t ? Object.fromEntries(EFFECT_KEYS.map((k) => [k, Number(t[EFFECT_INDEX[k]]) || 0])) : null;
    } catch { return null; }
  }

  /**
   * The one section that says what the brew does: each effect's expected
   * strength (the mean of every trial of it), the margin within which the
   * true strength lies (never ±0: one reading carries the margin of a single
   * dose) and how strong the evidence is (one reading, repeated on one
   * rabbit, corroborated on several, certified).
   * @param {any} cert
   */
  renderExpected(cert) {
    const el = clear(this.expect);
    const vial = this.source === 'vial';
    const th = this.theoryOf();
    const tested = EFFECT_KEYS.filter((k) => cert.values[k] !== undefined);
    // every rabbit showed nothing: not detected (which is not proof of absence)
    const unseen = tested.filter((k) => cert.unseen ? cert.unseen[k] : cert.values[k] === 0 && (cert.spread[k] || 0) <= 1);
    const shown = tested.filter((k) => !unseen.includes(k));
    const firsts = shown.filter((k) => (cert.n[k] || 0) === 1);
    const trials = tested.length ? Math.max(...tested.map((k) => cert.n[k] || 0)) : 0;
    const rabbits = tested.length ? Math.max(...tested.map((k) => cert.rabbits[k] || 0)) : 0;
    el.append(h('div', { class: 'row', title: 'Each value is the mean of every trial; ± is how far the true strength may lie from it. Other rabbits average out each rabbit’s own bias.' }, icon('scales'), h('b', { text: vial ? 'Expected effects of this vial' : 'Expected effects of this batch' }), h('span', { class: 'spacer' }),
      trials ? h('span', { class: 'small muted', text: `${trials} trial${trials === 1 ? '' : 's'} · ${rabbits} rabbit${rabbits === 1 ? '' : 's'}` }) : null));
    if (!tested.length) {
      el.append(h('div', { class: 'small muted', text: 'Unknown — nothing tested yet. Give a rabbit a dose below to start the estimate.' }));
      return;
    }
    const rows = h('div', { class: 'reading-rows' });
    for (const k of shown) {
      const e = EFFECT_BY_KEY[k], v = cert.values[k], one = (cert.n[k] || 0) === 1;
      const u = sdRound((cert.unc || {})[k] ?? (cert.spread[k] || 0)), sd = sdRound(cert.spread[k] || 0);
      const lvl = (cert.level || {})[k] || (one ? 'preliminary' : 'repeated');
      const lo = Math.max(0, Math.abs(v) - u), hi = Math.min(100, Math.abs(v) + u);
      const t = th ? th[k] : undefined;
      rows.appendChild(h('div', { class: 'reading lvl-' + lvl + (one ? ' first' : ''), 'data-effect': k, 'data-level': lvl, title: `${e.label}: ${cert.n[k]} reading${cert.n[k] === 1 ? '' : 's'} on ${cert.rabbits[k]} rabbit${cert.rabbits[k] === 1 ? '' : 's'}${one ? '' : `, which differ by about ±${sd} from each other`} · ${EVIDENCE_TEXT[lvl]}${t !== undefined ? ` · theory ${Math.round(t)}%` : ''}` },
        icon(e.icon, 'sm'), h('span', { class: 'rk', text: e.label }),
        h('div', { class: 'rbar' },
          u > 0 ? h('i', { class: 'range', style: { left: lo + '%', width: (hi - lo) + '%', background: rgb(e.color) } }) : null,
          t !== undefined && Math.abs(t) >= 0.5 ? h('i', { class: 'th theory', style: { left: Math.min(100, Math.abs(t)) + '%' } }) : null,
          h('i', { class: 'th mean', style: { left: Math.min(100, Math.abs(v)) + '%' } })),
        h('span', { class: 'rv', text: `${fmtPct(v)}% ±${u} · ${LEVEL_SHORT[lvl]}` })));
    }
    if (shown.length) el.append(rows);
    if (unseen.length) {
      const bound = Math.max(...unseen.map((k) => (cert.unc || {})[k] || 0));
      el.append(h('div', { class: 'small muted quiet', 'data-undetected': unseen.join(' '), title: 'No rabbit showed these. A faint effect can hide below the reading noise: more readings, and larger doses, narrow how strong it could be.' },
        'Not detected: ', ...unseen.map((k) => icon(EFFECT_BY_KEY[k].icon, 'sm')), ` — each could still be up to ${sdRound(bound)}%`));
    }
    if (firsts.length) el.append(h('div', { class: 'warn small first-flag', text: `One reading only${firsts.length === shown.length ? '' : ` (${firsts.map((k) => EFFECT_BY_KEY[k].label).join(', ')})`}: a rough guess with a wide margin. Test again — a second rabbit narrows it most.` }));
    if (rabbits <= 1 && trials >= 2) el.append(h('div', { class: 'warn small', text: 'All on one rabbit: its own bias stays in the estimate, and the effect piles up in it towards a limit nobody can see. Try another rabbit.' }));
    // what the order's customer will make of this evidence
    const com = this.lab.state.current;
    if (com && !this.lab.sandbox) {
      // each requirement against the margin: reliably met, missed, or not yet settled
      const reqs = com.requirements.filter((r) => r.effect);
      if (reqs.length) el.append(h('div', { class: 'within', 'data-section': 'within' }, h('b', { text: 'Against the order: ' }),
        ...reqs.map((r) => { const x = requirementEvidence(r, cert); return h('span', { class: 'w ' + (x.within === true ? 'ok' : x.within === false ? 'miss' : 'open'), 'data-req': r.key, 'data-evidence': x.evidence, title: x.title, text: ` ${r.key === 'purity' ? 'purity' : EFFECT_BY_KEY[r.key].label} ${x.mark} ${x.text}` }); })));
      const proof = com.customer.persona ? com.customer.persona.proof : 0.5;
      const need = proof >= 0.92 ? 'corroborated' : proof >= 0.8 ? 'repeated' : null;
      const keys = com.requirements.filter((r) => r.effect && r.key !== 'purity').map((r) => r.key);
      const short = need ? keys.filter((k) => cert.level && (cert.level[k] === undefined || evidenceRank(cert.level[k]) < evidenceRank(need))) : [];
      if (need && short.length) el.append(h('div', { class: 'small proof-need', text: `${shortName(com.customer.name)} insists on proof: ${short.map((k) => EFFECT_BY_KEY[k].label).join(', ')} must be ${need === 'corroborated' ? 'read on at least two rabbits' : 'tested more than once'}.` }));
      else if (keys.length && keys.every((k) => cert.level && cert.level[k])) el.append(h('div', { class: 'small ok', text: need ? `Enough proof for ${shortName(com.customer.name)}.` : 'Stronger evidence (more rabbits) makes customers trust your label — and pay — more.' }));
    }
  }

  /** The pooled estimate of the source being tested (batch or vial). */
  estimate() {
    const lab = this.lab, st = lab.state;
    if (this.source === 'vial' && st.vial) return { ...summarize(st.vial.samples || {}), ...vialFallback(st.vial), stale: [], changed: false };
    return { spread: {}, n: {}, rabbits: {}, ...lab.currentCert() };
  }

  renderReport() {
    const lab = this.lab, st = lab.state;
    const r = this.last || st.trials.records[0];
    const el = clear(this.report);
    if (!r) {
      el.append(h('div', { class: 'card parch small', text: 'No trial yet. A mixture’s effects are unknown until it is tested: choose a rabbit above and give it a dose.' }));
      return;
    }
    const subj = SUBJECT_BY_ID[r.subjectId] || SUBJECT_BY_ID.rabbit;
    const laws = r.lawsFound.map((id) => (st.world.laws || []).find((l) => l.id === id)).filter(Boolean);
    const who = r.rabbitName ? r.rabbitName : subj.name;
    const body = r.rabbitId ? findRabbit(st.colony, r.rabbitId) : null;
    el.append(h('div', { class: 'card parch report' },
      h('div', { class: 'row' }, icon('dropper'), h('b', { text: `Trial ${r.serial}: ${who}` }), h('span', { class: 'spacer' }), h('span', { class: 'small muted', text: `${r.ml} ml from the ${r.source === 'vial' ? 'vial' : 'tap'}` })),
      h('ul', { class: 'obs-list' }, ...r.observations.map((o) => h('li', { class: 'tone-' + o.tone, text: o.text }))),
      r.anomalies.length ? h('div', { class: 'warn small', text: `Unexpected: ${r.anomalies.map((k) => EFFECT_BY_KEY[k].label).join(', ')} differs from theory. Something in this mixture interacts — repeat with variations to find out what.` }) : null,
      ...laws.map((L) => h('div', { class: 'law-found' }, icon('star'), h('div', {}, h('b', { text: `Law discovered: ${L.name}` }), h('div', { class: 'small', text: L.lore + ' Your theory now accounts for it.' })))),
      r.died ? h('div', { class: 'bad small', text: `${who} did not survive. ${body ? 'The body stays in the hutch: recover its remains or bury it.' : ''} A potion that kills a rabbit should not be sold as a remedy.` }) : null,
      r.replay ? h('div', { class: 'row' }, btn('Replay', () => this.startReplay(r), { icon: 'eye', act: 'replay-trial', title: 'Watch this trial again — nothing is used up' })) : null,
    ));
  }

  /** @param {string} [id] always the chosen rabbit */
  test(id = 'rabbit') {
    void id;
    const lab = this.lab, st = lab.state;
    const rabbit = focusRabbit(st.colony);
    if (!rabbit || !rabbit.alive) {
      toast('Choose a living rabbit', 'The chosen rabbit is dead: pick another in the hutch, or buy one.', 'rabbit');
      this.refresh();
      return;
    }
    const want = lab.trialDose;
    let dose, ml, ctx;
    try {
      if (this.source === 'vial') {
        const r = lab.vialDose(want);
        if (!r) { toast('Not enough potion', 'The vial is empty.', 'bottle'); return; }
        ({ dose, ml } = r);
        ctx = { ml, source: 'vial', batchId: r.batchId, rev: r.rev, theory: r.theory, parts: r.parts };
      } else {
        const r = lab.drawDose(want);
        if (!r) { toast('Nothing to test', 'Pour and mix a brew first; the dose is drawn from the tap at the bottom.', 'flask'); return; }
        ({ dose, ml } = r);
        ctx = { ml, source: 'cauldron', batchId: st.batch.id, rev: st.batch.rev, theory: lab.theory(), parts: lab.batchParts() };
      }
      /** @type {any} */ (ctx).rabbitId = rabbit.id;
      const vial = this.source === 'vial' ? st.vial : null;
      const { record, events } = st.recordTrial('rabbit', dose, ctx);
      if (vial) {
        // the vial is sealed: its estimate pools every trial of it
        vial.samples = addSamples(vial.samples || seedSamples(vial), record);
        const sum = summarize(vial.samples);
        vial.cert = sum.values;
        vial.certRecords = sum.records;
        if (vial.label) applyTrials(vial.label, Object.fromEntries(Object.keys(record.values).map((k) => [k, sum.values[k]])), record.id, evidenceOf(vial));
      }
      // every bottle of this batch shares the new reading (each checked against its own contents)
      lab.shareEvidence(record.batchId);
      this.last = record;
      this.replay = null;
      this.rreact[rabbit.id] = 1;
      this.hutch.poke(rabbit.id, record.replay && record.replay.rx ? record.replay.rx.split(',') : []);
      audio.play(record.died ? 'toll' : record.observations.some((o) => o.tone === 'bad') ? 'thump' : 'squeak');
      if (record.degen && record.degen.length && !record.died) toast(`${rabbit.name} is degenerating!`, 'An effect has piled up past what its body can hold and keeps rising on its own until it kills it. Purge it — or put it down.', 'skull', 6000);
      for (const e of events) {
        if (e.type === 'law') { toast(`Law discovered: ${e.name}`, e.lore, 'star', 6000); audio.play('fanfare'); }
        else if (e.type === 'rabbit-died') toast(`${e.name} died`, 'The body stays in the hutch. Recover its remains — once — or bury it.', 'skull', 5000);
        else lab.announce(e);
      }
      if (lab.tutorial) lab.tutorial.notify('trial', 'rabbit');
      lab.save();
    } catch (e) {
      toast('Cannot test', String(e && e.message), 'close');
    }
    // re-measure now so the estimate this trial earned shows at once
    lab.updateAssay(true);
    this.refresh();
    lab.refreshCustomer();
    lab.views.counter.refresh();
    lab.updateBadges();
  }

  /** @param {string} id */
  replace(id) {
    const lab = this.lab;
    const r = lab.state.replaceSubject(id, lab.sandbox);
    if (!r.ok) { toast('Cannot replace', r.reason, 'coin'); audio.play('error'); return; }
    audio.play(r.cost ? 'coin' : 'click');
    lab.refreshHud();
    lab.save();
    this.refresh();
  }

  /**
   * Things that happened in the hutch in real time (the lab ticks the
   * colony every frame, whichever room is open).
   * @param {any[]} events
   */
  colonyEvents(events) {
    if (!events.length) return;
    let rebuild = false;
    for (const e of events) {
      if (e.type === 'mate') {
        this.hutch.scene.mate && this.hutch.scene.mate(e.from, e.to);
        if (e.conceived) rebuild = true;
      } else if (e.type === 'attack') {
        this.hutch.scene.attack && this.hutch.scene.attack(e.from, e.to);
        this.rreact[e.to] = 1;
        if (this.lab.view === 'trials') audio.play('thump');
        if (e.killed) rebuild = true;
      } else if (e.type === 'rabbit-died') {
        rebuild = true;
        toast(`${e.name} died`, e.by ? `${e.by} mauled ${e.name} to death. Put the aggressive rabbit down or purge it before it kills again.` : e.cause === 'love' ? `${e.name} wore itself out with love. The body stays in the hutch.` : `The degeneration ran its course. The body stays in the hutch.`, 'skull', 5000);
        audio.play('toll');
      } else if (e.type === 'trait') rebuild = true;
      else if (e.type === 'purge-brewed') { toast('A purging draught is ready', 'The still has finished brewing.', 'purge', 2500); rebuild = true; }
    }
    if (rebuild && this.expect) this.refresh();
    else if (this.expect) this.hutch.syncScene();
  }

  bindDropper() {
    const d = this.dropper;
    let ghost = null;
    const target = (x, y) => {
      const el = document.elementFromPoint(x, y);
      if (el && el === this.hutch.canvas) {
        const id = this.hutch.hitAt(/** @type {any} */ ({ clientX: x, clientY: y }));
        return id || null;
      }
      const tile = el && /** @type {HTMLElement} */ (el).closest ? /** @type {HTMLElement} */ (el).closest('[data-rabbit]') : null;
      if (tile) return tile.getAttribute('data-rabbit');
      const det = el && /** @type {HTMLElement} */ (el).closest ? /** @type {HTMLElement} */ (el).closest('.rabbit-detail') : null;
      return det ? this.lab.state.colony.focus : null;
    };
    const targets = () => Object.entries(this.hutch.tiles).map(([k, t]) => /** @type {[string, HTMLElement]} */ ([k, t.tile]));
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      d.setPointerCapture(e.pointerId);
      ghost = h('div', { class: 'drag-ghost' }, icon('dropper', 'lg'));
      document.body.appendChild(ghost);
      this.drag = { id: e.pointerId };
      move(e);
    });
    const move = (e) => {
      if (!this.drag || !ghost) return;
      ghost.style.transform = `translate(${e.clientX - 18}px, ${e.clientY - 34}px)`;
      const id = target(e.clientX, e.clientY);
      for (const [k, el] of targets()) el.classList.toggle('drop-hover', k === id);
      this.hutch.hover = id;
    };
    const end = (e) => {
      if (!this.drag) return;
      this.drag = null;
      if (ghost) ghost.remove();
      ghost = null;
      for (const [, el] of targets()) el.classList.remove('drop-hover');
      const id = target(e.clientX, e.clientY);
      if (!id) return;
      const r = findRabbit(this.lab.state.colony, id);
      if (r && !r.alive) { this.select(r.id); toast(`${r.name} is dead`, 'Choose a living rabbit to dose.', 'skull'); return; }
      this.lab.state.selectRabbit(id);
      this.test('rabbit');
    };
    d.addEventListener('pointermove', move);
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', () => { this.drag = null; if (ghost) ghost.remove(); ghost = null; });
    d.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.test('rabbit'); });
  }

  /** Animate the farm (only while visible). @param {number} dt */
  frame(dt) {
    this.time += dt;
    const low = this.lab.effectiveQuality() === 'low';
    for (const [rid, r] of Object.entries(this.rreact)) if (r > 0) this.rreact[rid] = Math.max(0, r - dt * 1.4);
    this.hutch.frame(dt, this.time);
    this.drawPortrait(dt, low);
  }

  /**
   * The chosen rabbit's portrait, or a replay — the rabbit as it was before
   * the dose, then the change, from the trial's own snapshots.
   * @param {number} dt @param {boolean} low
   */
  drawPortrait(dt, low) {
    const ctx = this.hutch.d.portrait;
    if (!ctx) return;
    const st = this.lab.state;
    const quality = low ? 'low' : 'high';
    if (this.replay) {
      const rp = this.replay;
      rp.t += dt;
      const rec = rp.rec;
      const who = findRabbit(st.colony, rec.rabbitId) || st.colony.memorial.find((m) => m.id === rec.rabbitId);
      const look = who ? who.look : lookFromSeed(rec.rabbitId || 'x');
      const before = decodeSnap(rec.replay.b), after = decodeSnap(rec.replay.a);
      const react = rec.replay.rx ? rec.replay.rx.split(',').filter((k) => RABBIT_MARKS.includes(k)) : [];
      if (rp.t < 0.6) drawRabbit(ctx, look, before, this.time, 0, { quality });
      else {
        // a death plays out: collapse first, then the body
        const dying = before.alive && !after.alive && rp.t < 1.3;
        const snap = dying ? { ...after, alive: true, hp: /** @type {3} */ (3) } : after;
        drawRabbit(ctx, look, snap, this.time, Math.max(0, 1 - (rp.t - 0.6) * 1.2), { quality, react });
      }
      if (rp.t > REPLAY_T) {
        this.replay = null;
        const ol = this.report && this.report.querySelector('.obs-list');
        if (ol) ol.classList.remove('replaying');
      }
      return;
    }
    const r = this.hutch.d.id ? findRabbit(st.colony, this.hutch.d.id) : focusRabbit(st.colony);
    if (!r) { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); return; }
    const react = this.rreact[r.id] || 0;
    const last = react > 0 && this.last && this.last.rabbitId === r.id && this.last.replay ? this.last.replay.rx.split(',').filter((k) => RABBIT_MARKS.includes(k)) : [];
    drawRabbit(ctx, r.look, rabbitSnap(r, st.day), this.time, react, { quality, react: last });
  }
}

/** A vial bottled before samples existed: its certificate counts as one reading per effect. @param {any} v */
function seedSamples(v) {
  /** @type {Record<string, {v:number, r:string, rec:string}[]>} */
  const s = {};
  for (const [k, x] of Object.entries(v.cert || {})) s[k] = [{ v: Number(x) || 0, r: 'bottled', rec: (v.certRecords || {})[k] || '' }];
  return s;
}

/** Estimate fields for a vial with a certificate but no samples. @param {any} v */
function vialFallback(v) {
  if (v.samples) return {};
  return summarize(seedSamples(v));
}

/** A standard deviation as shown: one decimal below 10. @param {number} s */
function sdRound(s) {
  return s < 10 ? Math.round(s * 10) / 10 : Math.round(s);
}

/** A mean as shown: one decimal below 10. @param {number} v */
function fmtPct(v) {
  return Math.abs(v) < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v));
}

/** @param {number[]} c */
function rgb(c) {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}

export { EFFECTS, EFFECT_INDEX };
