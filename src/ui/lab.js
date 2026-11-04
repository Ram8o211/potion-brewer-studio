// The shop — the game's main screen.
//
// A mobile-first shell with a bottom tab bar (a left rail in landscape and on
// desktop) around five rooms:
//   Counter  the customer, the full order, the sealed vial and serving
//   Brew     the cauldron: the live simulation, tools, fire, shelf
//   Wilds    gathering raw ingredients from plants that grow, mature and sprout again
//   Trials   giving measured doses to test subjects to learn effects
//   Book     recipes, trial log, laws, journal, ingredients, awards
// The cauldron simulation keeps running whichever room is open (a fire left
// burning keeps burning), but it is only drawn while the Brew room is shown.
// This class owns the simulation, the renderer and input, the brew log and
// batch identity, and the bottling → vial → serving flow.

import { Simulation } from '../simulation/world.js';
import { PHASE, SIM } from '../simulation/constants.js';
import { snapshotSim, applySnapshot } from '../simulation/snapshot.js';
import { clampToInterior } from '../simulation/tools.js';
import { MAX_SPECIES } from '../reactions/species.js';
import { compatFactor } from '../reactions/compatibility.js';
import { Renderer } from '../rendering/renderer.js';
import { drawPortrait } from '../rendering/portraits.js';
import { drawJar } from '../rendering/art.js';
import { ingredientSprite } from '../rendering/species-sprites.js';
import { measureParticles, tapSelection, probeSelection, viscosityClass, densityWord } from '../game/measure.js';
import { scoreRequirement, PROPERTY_LABELS } from '../game/evaluate.js';
import { processEvent } from '../game/journal.js';
import { saveGame, saveJSON, KEYS } from '../game/persistence.js';
import { AutoBrewer, condensedCount } from '../game/autobrew.js';
import { traceSample, buildProcedure, procedureLimits, matchRecipe, compareRecipe, checkReproduction, TRACE_DT } from '../game/recipes.js';
import { proofGaps, draftLabel, applyTrials, evidenceOf } from '../game/commerce.js';
import { RANKS } from '../game/equipment.js';
import { certification, missingEffects, requirementEvidence } from '../game/experiments.js';
import { sandboxIngredients } from '../materials/generator.js';
import { makeVial, appendParticles, updateVial, takeDose, pourBack, pourBackParts, relaxVial } from '../game/vial.js';
import { theoryOf, EFFECTS, EFFECT_BY_KEY, EFFECT_INDEX, dominantEffect, NE } from '../alchemy/effects.js';
import { awakenParts, describeThreshold } from '../alchemy/arcane.js';
import { ARC_NONE } from '../simulation/particles.js';
import { describeColor, rgbToHex } from '../core/color.js';
import { h, btn, clear, keepScroll, toast, coins, confirmDialog, modal, setNoteDock, recentNotes } from './dom.js';
import { icon } from './icons.js';
import { audio } from '../audio/audio.js';
import * as panels from './panels.js';
import * as trade from './trade.js';
import { Tutorial } from './tutorial.js';
import { CounterView } from './views/counter.js';
import { WildsView } from './views/wilds.js';
import { TrialsView } from './views/trials.js';
import { BookView } from './views/book.js';
import { GardenView } from './views/garden.js';
import { shortName } from '../game/customers.js';

const REQ_ICON = { temperature: 'thermo', quantity: 'flask', purity: 'pure' };
const TOOL_DEFS = [
  { id: 'spoon', label: 'Stir', icon: 'spoon', key: '2', title: 'Spoon: drag in the brew to stir' },
  { id: 'pestle', label: 'Crush', icon: 'pestle', key: '3', needs: 'pestle', title: 'Pestle: drag over whole herbs, stones or ice to crush them' },
  // the skimmer only demonstrates layering in the Free Experiment
  { id: 'skimmer', label: 'Skim', icon: 'ladle', key: '4', sandbox: true, title: 'Skimmer: lift off the top layer' },
  { id: 'probe', label: 'Inspect', icon: 'lens', key: '5', title: 'Inspect: tap a spot to read its colour, heat and contents' },
  { id: 'pour', label: 'Pour', icon: 'pour', key: '1' },
];
export const VIEWS = [
  { id: 'counter', label: 'Counter', icon: 'stall', key: 'c' },
  { id: 'brew', label: 'Brew', icon: 'cauldron', key: 'v' },
  { id: 'wilds', label: 'Wilds', icon: 'tree', key: 'w' },
  { id: 'garden', label: 'Garden', icon: 'leaf', key: 'g' },
  { id: 'trials', label: 'Trials', icon: 'dropper', key: 't' },
  { id: 'book', label: 'Book', icon: 'book', key: 'j' },
];

export class LabScreen {
  /**
   * @param {import('./app.js').App} app
   * @param {import('../game/state.js').GameState} state
   * @param {{sandbox?: boolean, artPreview?: boolean}} [opts]
   */
  constructor(app, state, opts = {}) {
    this.app = app;
    this.state = state;
    this.sandbox = !!opts.sandbox;
    this.artPreview = !!opts.artPreview;
    this.tool = 'spoon';
    this.selected = null;
    this.speed = 1;
    this.pointer = { down: false, x: 0, y: 0, id: -1, wx: 0, wy: 0 };
    this.pourX = 0.3;
    this.lastPoured = {};
    this.bottling = null;
    this.probe = null;
    this.thermal = false;
    this.autoStir = false;
    /** @type {(() => void) | null} */
    this._autoScroll = null;
    this.alembicOpen = false;
    /** the Free Experiment's alembic receiver flask (distillate), or null */
    this.receiver = null;
    this.autoBrewer = null;
    this.time = 0;
    this.hudTimer = 0;
    this.assayTimer = 0;
    this.saveTimer = 0;
    this.layerTimer = 0;
    this.assay = null;
    this.cert = { values: {}, records: {}, stale: [], changed: false };
    this.running = false;
    this.fpsAcc = { t: 0, n: 0, fps: 0 };
    /** frame timing for the performance overlay and the benchmark (ring of recent frames) */
    this.perf = { intervals: new Float32Array(600), work: new Float32Array(600), n: 0, physMs: 0, renderMs: 0 };
    this.stirLevel = 0;
    this.lastBoil = 0;
    this._raf = 0;
    this.view = 'brew';
    this.trialSource = 'cauldron';
    this.trialDose = 10;
    this.awayWarned = 0;
  }

  // ------------------------------------------------------------------ setup
  mount(root) {
    this.root = root;
    const st = this.state;
    const cap = st.cap;
    this.cap = cap;
    this.sim = this.makeSim(cap.size);
    this._applyFurnaceCaps();
    if (st.cauldron) {
      try {
        applySnapshot(this.sim, st.cauldron, { lookup: st.lookup });
      } catch (e) {
        console.warn('Could not restore cauldron', e);
      }
    }
    this.buildDom();
    this.renderer = new Renderer(this.canvas);
    /** effective render quality: the setting, or — on 'auto' — what this device sustains */
    this.autoQuality = /** @type {'high'|'medium'|'low'} */ ('high');
    this.qualityCheck = { t: 0, slow: 0, frames: 0 };
    this.renderer.quality = this.effectiveQuality();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resizeObs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    if (this.resizeObs) this.resizeObs.observe(this.stageEl);
    this.resize();
    this.bindInput();
    this.selectTool('spoon', true);
    if (!this.sandbox) {
      // the shop opens when the player opens the door (dawn lasts until then);
      // a shop that was already open, or the tutorial's first visit, carries on
      const tutorialVisit = st.tutorial.active && !st.tutorial.done && st.stats.served === 0;
      if (!st.current && !st.dayOver && (st.opened || tutorialVisit)) this.bringCustomer(false);
      // a resumed order (or a shop still closed at dawn) fills the strip too
      else this.refreshCustomer();
      this.tutorial = new Tutorial(this);
      if (st.tutorial.active && !st.tutorial.done) this.tutorial.start();
    }
    this.autoLabel();
    this.showView(this.sandbox ? 'brew' : st.vial ? 'counter' : 'brew', true);
    this.refreshHud(true);
    this.running = true;
    this.lastT = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this.frame(t);
    };
    this._raf = requestAnimationFrame(loop);
    this.onVis = () => {
      if (document.hidden) this.save();
      else this.lastT = performance.now();
    };
    document.addEventListener('visibilitychange', this.onVis);
    this.onUnload = () => this.save();
    window.addEventListener('pagehide', this.onUnload);
    // Another tab (or the other copy of the game on the same site) saved the
    // shop: this tab's state is now stale, so stop saving and go back to the
    // menu, where Continue loads the newer save instead of overwriting it.
    this.saveBlocked = false;
    this.onStorage = (/** @type {StorageEvent} */ e) => {
      if (this.sandbox || e.key !== KEYS.save || this.saveBlocked) return;
      this.saveBlocked = true;
      this.app.showMenu();
      toast('Shop opened elsewhere', 'Your shop was saved from another tab, so this one stepped back to keep that progress. Press Continue to carry on here.', 'scroll', 7000);
    };
    window.addEventListener('storage', this.onStorage);
    audio.music(this.app.settings.music > 0 && this.app.settings.musicOn);
  }

  /** @param {string} size */
  makeSim(size) {
    const st = this.state;
    return new Simulation({ size, lookup: st.lookup, reactions: st.world.reactions, laws: st.world.laws });
  }

  /** The recent notes, newest first, to read at leisure. */
  openNotes() {
    const list = recentNotes();
    const body = list.length
      ? h('ul', { class: 'note-log' }, ...list.map((n) => h('li', { class: 'card parch' }, icon(n.icon, 'sm'), h('div', {}, h('b', { text: n.title }), n.text ? h('div', { class: 'small', text: n.text }) : null))))
      : h('div', { class: 'card parch', text: 'Nothing to tell yet.' });
    modal({ title: 'Recent notes', body });
  }

  unmount() {
    setNoteDock(null);
    this.save();
    this.running = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('pagehide', this.onUnload);
    window.removeEventListener('storage', this.onStorage);
    if (this.resizeObs) this.resizeObs.disconnect();
    if (this.tutorial) this.tutorial.stop();
    audio.update({ fire: 0, stir: 0, pour: 0, boil: 0, cold: 0 }, 0);
    this.el.remove();
  }

  _applyFurnaceCaps() {
    const cap = this.state.cap;
    // the Free Experiment keeps the old furnace's full heat for demonstrations (melting, fire)
    const fire = this.sandbox ? SANDBOX_FIRE : cap;
    Object.assign(this.sim.furnace, { maxFlame: fire.maxFlame, heatPower: fire.heatPower, minCool: cap.minCool, coolPower: cap.coolPower });
  }

  /** Re-read capabilities after a purchase (and install a bigger cauldron). */
  refreshCapabilities() {
    const cap = this.state.cap;
    if (cap.size !== this.cap.size) {
      const snap = snapshotSim(this.sim, this.cap.size);
      const sim = this.makeSim(cap.size);
      applySnapshot(sim, snap, { lookup: this.state.lookup });
      this.sim = sim;
      toast('New cauldron installed', `Your ${sim.cauldron.spec.label} is ready.`, 'cauldron');
    }
    this.cap = cap;
    this._applyFurnaceCaps();
    this.buildTools();
    this.buildShelf();
    this.resize(true);
    this.refreshHud(true);
    for (const v of Object.values(this.views)) v.build();
  }

  // ------------------------------------------------------------------ DOM
  buildDom() {
    const st = this.state;
    this.el = h('div', { class: 'screen lab', 'data-mode': this.sandbox ? 'sandbox' : 'game', 'data-view': 'brew' });
    // ---- top bar
    this.coinEl = h('span', { class: 'coins-val' });
    this.rankName = h('div', { class: 'rankname' });
    this.rankBar = h('i');
    this.dayEl = h('div', { class: 'day' });
    // the game's notes have a place of their own in the top bar (a line under it on narrow screens):
    // they never cover a control, and the last one stays readable until the next
    // (it shows, it takes no taps: the full list of recent notes is in the menu, and N opens it)
    this.noteDock = h('div', { class: 'note-dock idle', role: 'status', 'data-note': 'dock', 'aria-live': 'polite', title: 'The latest note (all recent notes: Menu → Recent notes, or N)' });
    setNoteDock(this.noteDock);
    this.topbar = h('header', { class: 'topbar frame' },
      this.artPreview ? btn('Return to Art Studio', () => this.app.showMenu(), { act: 'art-return' }) : null,
      btn('', () => panels.openPause(this), { icon: 'menu', cls: 'icon', title: 'Menu: help, settings, tour (Esc)', act: 'menu' }),
      this.sandbox
        ? h('div', { class: 'stat' }, icon('flask'), h('span', { text: 'Free Experiment' }))
        : h('div', { class: 'stat', title: 'Coins' }, icon('coin'), this.coinEl),
      this.sandbox ? null : h('div', { class: 'rankrow' }, h('div', { class: 'stat rankbox' }, this.rankName, h('div', { class: 'bar' }, this.rankBar))),
      this.sandbox ? null : this.dayEl,
      this.noteDock,
      this.sandbox ? null : btn('Shop', () => panels.openShop(this), { icon: 'bag', cls: 'shop-btn', title: 'Shop: ingredients and equipment (S)', act: 'shop' }),
    );
    // ---- brew room
    this.strip = h('div', { class: 'order-strip parch', role: 'button', tabindex: '0', 'aria-label': 'Order: open the counter' });
    this.strip.addEventListener('click', (e) => { if (!(/** @type {HTMLElement} */ (e.target)).closest('.btn')) this.showView('counter'); });
    this.canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { class: 'view-canvas', 'aria-label': 'Cauldron: drag to stir, hold to pour the selected reagent' }));
    this.readout = h('div', { class: 'readout parch hidden' });
    // the cauldron's volume and temperature: tap it to see what is inside
    this.infoText = h('span');
    this.infoBtn = h('button', { class: 'chip chip-btn info-chip', 'data-act': 'brew-info', title: 'What is in the cauldron', 'aria-label': 'What is in the cauldron' }, icon('scroll', 'sm'), this.infoText);
    this.infoBtn.addEventListener('click', () => { audio.play('click'); this.toggleBrewInfo(); });
    this.chipList = h('div', { class: 'chip-list' });
    this.chips = h('div', { class: 'hud-chips' }, this.infoBtn, this.chipList);
    this.pourHint = h('div', { class: 'pour-hint chip hidden' });
    this.bottleFab = btn('Bottle', () => this.startBottling(), { icon: 'bottle', cls: 'fab primary', title: 'Bottle the potion from the tap (B)', act: 'bottle' });
    this.brewPanel = h('div', { class: 'brew-panel parch hidden' });
    this.stageEl = h('main', { class: 'stage' }, this.canvas, this.readout, this.chips, this.pourHint, this.brewPanel, this.bottleFab);
    this.furnaceInput = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: '-100', max: '100', step: '1', value: '0', 'aria-label': 'Fire and frost control' }));
    this.furnaceInput.addEventListener('input', () => {
      const v = Number(this.furnaceInput.value) / 100;
      // a wide notch at the middle: easy to land on "off" by sliding
      this.setFurnace(Math.abs(v) < 0.12 ? 0 : v);
    });
    // one tap puts the fire (or the frost) out
    this.furnaceOff = btn('Off', () => { this.setFurnace(0); audio.play('select'); }, { cls: 'foff', title: 'Put the fire or frost out (0)', act: 'furnace-off' });
    this.furnaceLabel = h('span', { class: 'flabel' });
    this.lidBtn = btn('Lid', () => this.toggleLid(), { icon: 'lid', cls: 'lid-btn', title: 'Lid on/off (L)', act: 'lid' });
    this.controls = h('section', { class: 'controls frame' },
      this.lidBtn,
      // left cools (the basin), right heats (the fire)
      h('div', { class: 'furnace', title: 'Slide left to cool, right to heat (arrow keys, 0 for off)' }, icon('snow', 'sm'), h('div', { class: 'frange' }, this.furnaceInput), icon('flame', 'sm'), this.furnaceLabel, this.furnaceOff),
    );
    this.toolsEl = h('div', { class: 'tools', role: 'toolbar', 'aria-label': 'Tools' });
    this.toolbar = h('nav', { class: 'toolbar frame' }, this.toolsEl);
    this.shelfEl = h('div', { class: 'shelf', role: 'listbox', 'aria-label': 'Ingredient shelf' });
    this.doseEl = h('div', { class: 'dose' });
    this.shelfWrap = h('div', { class: 'shelf-wrap frame' }, this.doseEl, this.shelfEl);
    this.brewView = h('section', { class: 'view view-brew', 'data-view': 'brew' },
      this.sandbox ? null : this.strip, this.stageEl, this.controls, this.toolbar, this.shelfWrap);
    // ---- other rooms
    this.views = { counter: new CounterView(this), wilds: new WildsView(this), garden: new GardenView(this), trials: new TrialsView(this), book: new BookView(this) };
    this.viewsEl = h('div', { class: 'views' }, this.views.counter.el, this.brewView, this.views.wilds.el, this.views.garden.el, this.views.trials.el, this.views.book.el);
    // ---- tab bar
    this.tabEls = {};
    this.tabbar = h('nav', { class: 'tabbar frame', 'aria-label': 'Rooms' });
    for (const v of VIEWS) {
      if (this.sandbox && v.id === 'counter') continue;
      const badge = h('span', { class: 'badge hidden' });
      const b = h('button', { class: 'tab', 'data-act': 'tab-' + v.id, 'aria-label': v.label, title: `${v.label} (${v.key.toUpperCase()})` }, icon(v.icon), h('span', { class: 'tab-lbl', text: v.label }), badge);
      b.addEventListener('click', () => { audio.play('select'); this.showView(v.id); });
      this.tabEls[v.id] = { b, badge };
      this.tabbar.appendChild(b);
    }
    // the guided tour docks here, between the top bar and the rooms, so it never covers a control
    this.tutorSlot = h('div', { class: 'tutor-slot', 'aria-live': 'polite' });
    this.el.append(this.topbar, this.tutorSlot, this.viewsEl, this.tabbar);
    this.root.appendChild(this.el);
    this.buildTools();
    this.buildShelf();
    this.buildDose();
    for (const v of Object.values(this.views)) v.build();
    void st;
  }

  /** Switch rooms. @param {string} id */
  showView(id, silent = false) {
    if (this.sandbox && id === 'counter') id = 'brew';
    this.view = id;
    this.el.setAttribute('data-view', id);
    for (const [k, t] of Object.entries(this.tabEls)) {
      t.b.classList.toggle('active', k === id);
      t.b.setAttribute('aria-current', k === id ? 'page' : 'false');
    }
    if (id !== 'brew') {
      if (this.sim.emitter.pouring && !(this.sim.emitter.active && this.sim.emitter.active.dose)) this.sim.emitter.stop();
      this.pointer.down = false;
      const t = this.sim.tool;
      if (t.active && !t.auto) t.setTarget(t.x, t.y, false);
    }
    const v = this.views[id];
    if (v) v.refresh();
    if (id === 'trials' && !this.sandbox && !(this.tutorial && this.tutorial.active) && this.state.firstTip('farm')) toast('The rabbit farm', 'One reading is a rough guess: test again, ideally on another rabbit. Too much of an effect in one rabbit can make it sick, wild or dead.', 'rabbit', 6000);
    if (id === 'brew') requestAnimationFrame(() => this.resize());
    if (!silent) this.updateBadges();
    if (this.tutorial) this.tutorial.notify('view', id);
  }

  updateBadges() {
    const st = this.state;
    const set = (id, text) => {
      const t = this.tabEls[id];
      if (!t) return;
      t.badge.textContent = text || '';
      t.badge.classList.toggle('hidden', !text);
    };
    set('counter', st.vial ? '1' : st.current && !this.sandbox && this.view !== 'counter' && !this._seenCustomer ? '!' : '');
    const com = st.current;
    const need = com ? missingEffects(com, this.cert.values) : [];
    set('trials', com && com.effectOrder && need.length && this.tapAvailable() >= 5 ? '?' : '');
    if (this.view === 'counter') this._seenCustomer = true;
  }

  /** @param {string} key */
  reqIcon(key) {
    return REQ_ICON[key] || (EFFECT_BY_KEY[key] ? EFFECT_BY_KEY[key].icon : 'star');
  }

  /** The dose buttons sit above the shelf. */
  placeDose() {
    this.doseEl.classList.toggle('collapsed', this.tool !== 'pour' || !this.selected);
  }

  buildActions() {
    const a = this.actionsEl;
    if (!a) return;
    clear(a);
    const set = {};
    set.stir = btn('Auto', () => {}, { icon: 'swirl', title: this.state.has('stirrer') ? 'Clockwork stirrer on/off (A)' : 'Hold to stir automatically (A)', act: 'autostir' });
    // The tool row scrolls sideways under a finger: a swipe that starts on
    // Auto must not switch it on. Holding starts only once the finger has
    // stayed put for a moment; the clockwork stirrer toggles on a clean tap.
    const press = { id: -1, x: 0, y: 0, timer: 0, moved: false };
    const SLOP = 8, HOLD_MS = 180;
    const cancelPress = () => { clearTimeout(press.timer); press.timer = 0; press.id = -1; };
    const startAuto = (e) => {
      if (e.button > 0) return;
      cancelPress();
      press.id = e.pointerId; press.x = e.clientX; press.y = e.clientY; press.moved = false;
      if (!this.state.has('stirrer')) press.timer = setTimeout(() => { press.timer = 0; if (press.id >= 0 && !press.moved) this.setAutoStir(true); }, e.pointerType === 'mouse' ? 0 : HOLD_MS);
    };
    const moveAuto = (e) => {
      if (e.pointerId !== press.id || press.moved) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) {
        press.moved = true;
        clearTimeout(press.timer); press.timer = 0;
        if (!this.state.has('stirrer')) this.setAutoStir(false);
      }
    };
    const endAuto = (e) => {
      if (e.pointerId !== press.id) return;
      const tap = !press.moved;
      cancelPress();
      if (this.state.has('stirrer')) { if (tap) this.setAutoStir(!this.autoStir); } else this.setAutoStir(false);
    };
    const abortAuto = (e) => {
      if (e.pointerId !== press.id) return;
      cancelPress();
      if (!this.state.has('stirrer')) this.setAutoStir(false);
    };
    set.stir.addEventListener('pointerdown', startAuto);
    set.stir.addEventListener('pointermove', moveAuto);
    set.stir.addEventListener('pointerup', endAuto);
    set.stir.addEventListener('pointerleave', abortAuto);
    // the browser takes the pointer over when the row starts scrolling
    set.stir.addEventListener('pointercancel', abortAuto);
    set.stir.addEventListener('contextmenu', (e) => e.preventDefault());
    if (this._autoScroll) this.toolsEl.removeEventListener('scroll', this._autoScroll);
    this._autoScroll = () => { if (press.id >= 0) { press.moved = true; clearTimeout(press.timer); press.timer = 0; if (!this.state.has('stirrer')) this.setAutoStir(false); } };
    this.toolsEl.addEventListener('scroll', this._autoScroll, { passive: true });
    set.speed = btn('1×', () => this.cycleSpeed(), { icon: 'speed', title: 'Time speed: 1×, 2×, 4× (F)', act: 'speed' });
    a.append(set.stir, set.speed);
    // physics demonstrations of the Free Experiment: the heat map and the alembic
    if (this.sandbox) {
      set.thermal = btn('Heat', () => this.toggleThermal(), { icon: 'monocle', title: 'Heat map (H)', act: 'thermal' });
      a.append(set.thermal);
      set.alembic = btn('Still', () => this.toggleAlembic(), { icon: 'alembic', title: 'Alembic valve: draw off the vapour', act: 'alembic' });
      a.append(set.alembic);
    }
    a.append(btn('Empty', () => this.emptyCauldron(), { icon: 'trash', cls: 'danger', title: 'Empty the cauldron', act: 'empty' }));
    this.actionSet = set;
    this.syncActions();
  }

  /** Reflect toggle states on the action buttons. */
  syncActions() {
    const lidOpen = !this.sim.cauldron.lidClosed;
    this.lidBtn.classList.toggle('active', !lidOpen);
    this.lidBtn.title = lidOpen ? 'The lid is off: steam escapes — tap to put it on (L)' : 'The lid is on: steam stays in — tap to take it off (L)';
    const ll = this.lidBtn.querySelector('.lbl');
    if (ll) ll.textContent = lidOpen ? 'Lid off' : 'Lid on';
    const set = this.actionSet;
    if (!set) return;
    set.stir.classList.toggle('active', this.autoStir);
    set.speed.classList.toggle('active', this.speed > 1);
    const l = set.speed.querySelector('.lbl');
    if (l) l.textContent = this.speed + '×';
    if (set.thermal) set.thermal.classList.toggle('active', this.thermal);
    if (set.alembic) set.alembic.classList.toggle('active', this.alembicOpen);
  }

  toggleThermal() {
    this.thermal = !this.thermal;
    this.syncActions();
  }

  buildTools() {
    keepScroll(this.toolsEl, () => this.fillTools());
  }

  fillTools() {
    const t = clear(this.toolsEl);
    this.toolBtns = {};
    for (const d of TOOL_DEFS) {
      if (!this.sandbox && (d.sandbox || (d.needs && !this.state.has(d.needs)))) continue;
      if (d.id === 'pour') continue; // pouring starts from the shelf
      const b = btn(d.label, () => this.selectTool(d.id), { icon: d.icon, title: `${d.title || d.label} (${d.key})`, act: 'tool-' + d.id });
      this.toolBtns[d.id] = b;
      t.appendChild(b);
    }
    t.appendChild(btn('Sample', () => this.sampleVial(), { icon: 'jar', title: 'Sample: measure what a bottle drawn from the tap would hold', act: 'sample' }));
    t.appendChild(h('div', { class: 'sep' }));
    this.actionsEl = h('div', { class: 'acts' });
    t.appendChild(this.actionsEl);
    this.buildActions();
    if (this.tool) this.selectTool(this.tool, true);
  }

  /** The ingredient shelf, rebuilt where it was scrolled to (a jar gathered in the wilds or bought does not send it back to its start). */
  buildShelf() {
    keepScroll(this.shelfEl, () => this.fillShelf());
  }

  fillShelf() {
    const sh = clear(this.shelfEl);
    this.jarEls = {};
    const st = this.state;
    const ids = this.sandbox ? sandboxIngredients(st.world) : st.world.ingredients.filter((id) => st.knows(id) && (st.lookup(id).tier <= st.rank || st.stock(id) > 0));
    const labels = shelfLabels(ids.map((id) => st.lookup(id).name));
    for (const [n, id] of ids.entries()) {
      const m = st.lookup(id);
      let cv;
      if ((m.wild || m.remains) && m.form === 'solid') {
        cv = ingredientSprite(m);
        cv.classList.add('raw');
      } else {
        cv = /** @type {HTMLCanvasElement} */ (h('canvas', { width: '15', height: '20' }));
        drawJar(cv.getContext('2d'), 1, 0, 13, 20, m.look || m.color, m.form);
      }
      const stock = h('span', { class: 'jstock' });
      const el = h('button', { class: 'jar' + (m.wild ? ' wild' : '') + (m.remains ? ' remains' : ''), title: m.name, 'aria-label': m.name, 'data-id': id, role: 'option' }, stock, cv, h('span', { class: 'jname', text: m.remains ? m.remains.short : labels[n] }));
      this.bindJar(el, id);
      this.jarEls[id] = { el, stock };
      sh.appendChild(el);
    }
    this.updateShelf();
  }

  /**
   * A jar: tap to pick it up, long-press to inspect, or drag it straight
   * onto the cauldron to pour where you let the stream fall.
   * @param {HTMLElement} el @param {string} id
   */
  bindJar(el, id) {
    let pressTimer = 0, sx = 0, sy = 0, dragging = false, ghost = null, pid = -1, columns = false;
    const clearTimer = () => { if (pressTimer > 0) clearTimeout(pressTimer); };
    el.addEventListener('pointerdown', (e) => {
      sx = e.clientX; sy = e.clientY; dragging = false; pid = e.pointerId;
      columns = getComputedStyle(this.shelfEl).flexWrap === 'wrap';
      // a mouse must be captured to keep reporting once it leaves the jar
      // (touch pointers are captured implicitly, and keep native shelf scrolling)
      if (e.pointerType === 'mouse') { try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
      pressTimer = /** @type {any} */ (setTimeout(() => { pressTimer = -1; panels.openIngredient(this, id); }, 550));
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid || pressTimer === -1) return;
      const dy = sy - e.clientY, dx = Math.abs(e.clientX - sx);
      // Lift the jar with a drag across the shelf's scrolling direction: up
      // off a shelf that scrolls sideways (portrait), sideways off one that
      // scrolls up and down (landscape and desktop side panels), or any drag
      // that leaves the shelf. Along the shelf, the drag scrolls it.
      const sr = this.shelfEl.getBoundingClientRect();
      const outside = e.clientX < sr.left || e.clientX > sr.right || e.clientY < sr.top || e.clientY > sr.bottom;
      const across = columns ? dx > 14 && dx > Math.abs(dy) * 0.9 : dy > 14 && dy > dx * 0.9;
      if (!dragging && Math.hypot(dx, dy) > 16 && (across || outside)) {
        clearTimer(); pressTimer = 0;
        dragging = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        this.selectIngredient(id);
        ghost = h('div', { class: 'drag-ghost jar-ghost' }, el.querySelector('canvas').cloneNode(true));
        const c2 = ghost.querySelector('canvas');
        const src = el.querySelector('canvas');
        if (c2 && src) /** @type {CanvasRenderingContext2D} */ (/** @type {HTMLCanvasElement} */ (c2).getContext('2d')).drawImage(/** @type {HTMLCanvasElement} */ (src), 0, 0);
        document.body.appendChild(ghost);
      }
      if (dragging && ghost) {
        ghost.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 48}px)`;
        const r = this.canvas.getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (over) {
          const [wx] = this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
          if (!this.sim.emitter.pouring) this.startPour(wx);
          else { this.pourX = this.clampPourX(wx); this.sim.emitter.setX(this.pourX); }
        } else if (this.sim.emitter.pouring && !this.sim.emitter.active.dose) this.sim.emitter.stop();
      }
    });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      clearTimer();
      if (dragging) {
        dragging = false;
        if (ghost) ghost.remove();
        ghost = null;
        if (this.sim.emitter.pouring && !this.sim.emitter.active.dose) this.sim.emitter.stop();
        pressTimer = -2;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => { if (!dragging) clearTimer(); });
    el.addEventListener('click', () => {
      if (pressTimer === -1 || pressTimer === -2) { pressTimer = 0; return; }
      this.selectIngredient(id);
    });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); panels.openIngredient(this, id); });
  }

  buildDose() {
    const d = clear(this.doseEl);
    this.selName = h('span', { class: 'sel-name' });
    d.append(icon('pour', 'sm'), this.selName);
    for (const ml of [25, 50, 100, 250]) d.append(btn(`${ml}`, () => this.pourDose(ml), { title: `Pour exactly ${ml} ml`, act: 'dose-' + ml }));
    d.append(h('span', { class: 'muted dose-note', text: 'ml' }));
    this.syncSelName();
  }

  syncSelName() {
    const m = this.selected ? this.state.lookup(this.selected) : null;
    if (this.selName) this.selName.textContent = m ? m.name : 'Pick a jar';
  }

  // ------------------------------------------------------------------ layout
  resize(force = false) {
    this.placeDose();
    const r = this.stageEl.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const st = this.state;
    const jars = st.world.ingredients.slice(0, 14).map((id) => ({ color: st.lookup(id).look || st.lookup(id).color, form: st.lookup(id).form }));
    if (force) this.renderer._key = '';
    this.renderer.resize(Math.floor(r.width), Math.floor(r.height), this.sim.cauldron, jars, this.effectiveQuality());
  }

  /** @returns {'high'|'medium'|'low'} */
  /** The resolution the wilds and the enclosures are shown at (rendering/crisp.js): the setting, at most ×2 in battery saver. */
  resolution() {
    const r = Math.max(1, Math.min(4, Math.round(Number(this.app.settings.resolution) || 3)));
    return this.effectiveQuality() === 'low' ? Math.min(2, r) : r;
  }

  effectiveQuality() {
    const q = this.app.settings.quality;
    return q === 'auto' || !q ? this.autoQuality : q;
  }

  /**
   * Automatic quality: if frames keep running over budget, step the
   * renderer down (high → medium → low). Checked about once a second.
   * @param {number} dt @param {number} workMs
   */
  adaptQuality(dt, workMs) {
    const qc = this.qualityCheck;
    qc.t += dt; qc.frames++;
    if (workMs > 15) qc.slow++;
    if (qc.t < 1.2) return;
    const slowShare = qc.slow / Math.max(1, qc.frames);
    qc.t = 0; qc.slow = 0; qc.frames = 0;
    if (this.app.settings.quality !== 'auto' || slowShare < 0.5 || this.autoQuality === 'low') return;
    this.autoQuality = this.autoQuality === 'high' ? 'medium' : 'low';
    this.resize(true);
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    const cv = this.canvas;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    cv.addEventListener('pointerdown', (e) => {
      if (this.pointer.down) return; // a second finger never fights the first
      audio.unlock();
      cv.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      this.pointer = { down: true, x, y, id: e.pointerId, wx: 0, wy: 0 };
      this.pointerWorld();
      this.onPointerStart();
      e.preventDefault();
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = pos(e);
      if (this.pointer.down && e.pointerId !== this.pointer.id) return;
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointerWorld();
      this.hover = !this.pointer.down && e.pointerType === 'mouse';
      if (this.pointer.down) this.onPointerMove();
      else if (this.hover) this.onHover();
    });
    const end = (e) => {
      if (!this.pointer.down || e.pointerId !== this.pointer.id) return;
      this.pointer.down = false;
      this.onPointerEnd();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { this.hover = false; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    // no pinch-zoom, double-tap zoom or scroll bounce over the cauldron
    this.stageEl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    this.stageEl.addEventListener('gesturestart', (e) => e.preventDefault());
    this.onKey = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKey);
  }

  pointerWorld() {
    const [wx, wy] = this.renderer.toWorld(this.pointer.x, this.pointer.y);
    this.pointer.wx = wx;
    this.pointer.wy = wy;
  }

  onPointerStart() {
    const { wx, wy } = this.pointer;
    if (this.tool === 'pour') {
      if (!this.selected) { toast('Choose a reagent', 'Tap a jar on the shelf first, or drag one onto the cauldron.', 'jar'); return; }
      this.startPour(wx);
    } else if (this.tool === 'probe') {
      this.probe = { x: wx, y: wy, r: 0.22 };
      this.updateProbe();
    } else {
      this.setAutoStir(false);
      const [x, y] = clampToInterior(this.sim, wx, wy, 0.1);
      this.sim.tool.type = /** @type {any} */ (this.tool);
      this.sim.tool.setTarget(x, y, true);
    }
  }

  onPointerMove() {
    const { wx, wy } = this.pointer;
    if (this.tool === 'pour') {
      this.pourX = this.clampPourX(wx);
      this.sim.emitter.setX(this.pourX);
    } else if (this.tool === 'probe') {
      this.probe = { x: wx, y: wy, r: 0.22 };
    } else {
      const [x, y] = clampToInterior(this.sim, wx, wy, 0.1);
      this.sim.tool.setTarget(x, y, true);
    }
  }

  onHover() {
    if (this.tool === 'spoon' || this.tool === 'pestle' || this.tool === 'skimmer') {
      const [x, y] = clampToInterior(this.sim, this.pointer.wx, this.pointer.wy, 0.1);
      if (!this.sim.tool.active) { this.sim.tool.x = x; this.sim.tool.y = y; this.sim.tool.tx = x; this.sim.tool.ty = y; }
    }
  }

  onPointerEnd() {
    if (this.tool === 'pour') {
      if (this.sim.emitter.pouring && !this.sim.emitter.active.dose) this.sim.emitter.stop();
    } else if (this.tool === 'probe') {
      // keep the last reading visible
    } else {
      const t = this.sim.tool;
      t.setTarget(t.x, t.y, false);
    }
  }

  handleKey(e) {
    if (e.target && /** @type {HTMLElement} */ (e.target).tagName === 'INPUT' && /** @type {any} */ (e.target).type !== 'range') return;
    if (document.querySelector('.overlay')) {
      if (e.key === 'Escape') { const x = /** @type {HTMLElement} */ (document.querySelector('.overlay .modal-head .btn')); if (x) x.click(); }
      return;
    }
    const k = e.key.toLowerCase();
    const view = VIEWS.find((v) => v.key === k);
    if (view && this.tabEls[view.id]) { this.showView(view.id); return; }
    const def = TOOL_DEFS.find((d) => d.key === k);
    if (def && (this.toolBtns[def.id] || def.id === 'pour')) { if (def.id === 'pour' && !this.selected) return; this.selectTool(def.id); return; }
    if (k === 'l') this.toggleLid();
    else if (k === 'f') this.cycleSpeed();
    else if (k === 'b') this.startBottling();
    else if (k === 's' && !this.sandbox) panels.openShop(this);
    else if (k === 'r' && !this.sandbox) { this.showView('book'); this.views.book.open('recipes'); }
    else if (k === 'a') this.setAutoStir(!this.autoStir);
    else if (k === 'n') this.openNotes();
    else if (k === 'h' && this.sandbox) this.toggleThermal();
    else if (k === 'escape') panels.openPause(this);
    else if (k === 'arrowup' || k === 'arrowright') { this.setFurnace(Math.min(1, this.sim.furnace.setting + 0.1)); }
    else if (k === 'arrowdown' || k === 'arrowleft') { this.setFurnace(Math.max(-1, this.sim.furnace.setting - 0.1)); }
    else if (k === '0') this.setFurnace(0);
  }

  // ------------------------------------------------------------------ actions
  selectTool(id, silent = false) {
    this.tool = id;
    for (const [k, b] of Object.entries(this.toolBtns || {})) b.classList.toggle('active', k === id);
    if (id !== 'probe') { this.probe = null; this.readout.classList.add('hidden'); }
    if (id === 'spoon' || id === 'pestle' || id === 'skimmer') this.sim.tool.type = /** @type {any} */ (id);
    if (id !== 'pour') {
      if (this.sim.emitter.pouring && !(this.sim.emitter.active && this.sim.emitter.active.dose)) this.sim.emitter.stop();
      for (const j of Object.values(this.jarEls || {})) j.el.classList.remove('selected');
      this.selected = id === 'pour' ? this.selected : null;
    }
    this.pourHint.classList.toggle('hidden', id !== 'pour');
    this.updatePourHint();
    this.placeDose();
    this.syncSelName();
    if (!silent) audio.play('select');
    if (this.tutorial) this.tutorial.notify('tool', id);
  }

  selectIngredient(id) {
    this.selected = id;
    this.selectTool('pour', true);
    this.selected = id;
    for (const [k, j] of Object.entries(this.jarEls)) j.el.classList.toggle('selected', k === id);
    audio.play('select');
    this.updatePourHint();
    this.placeDose();
    this.syncSelName();
    if (this.tutorial) this.tutorial.notify('select', id);
  }

  updatePourHint() {
    if (this.tool !== 'pour') return;
    const m = this.selected ? this.state.lookup(this.selected) : null;
    this.pourHint.textContent = m ? `Hold in the cauldron to ${m.form === 'solid' ? 'drop it in' : 'pour'}` : 'Tap a jar on the shelf';
  }

  clampPourX(x) {
    const m = this.sim.cauldron.mouth - 0.15;
    return Math.max(-m, Math.min(m, x));
  }

  canPour(id) {
    if (this.sandbox) return Infinity;
    return Math.floor(this.state.stock(id) / SIM.ML_PER_PARTICLE);
  }

  /** Solids always go in whole: only the pestle breaks them up. @param {number} x @param {number} [amount] particles */
  startPour(x, amount) {
    const id = this.selected;
    if (!id) return;
    const avail = this.canPour(id);
    if (avail <= 0) {
      audio.play('error');
      const m = this.state.lookup(id);
      toast('Out of stock', m.remains ? 'A rabbit’s remains are recovered only once.' : m.wild && m.tier > this.state.rank ? `Gather more ${m.name} in the Wilds.` : `Buy more ${m.name} in the Shop${m.wild ? ' or gather it in the Wilds' : ''}.`, m.remains ? 'bone' : m.wild ? 'tree' : 'bag');
      return;
    }
    if (this.sim.p.count >= this.sim.maxParticles - 2) {
      toast('The cauldron is full', 'Bottle or empty it first.', 'cauldron');
      return;
    }
    this.pourX = this.clampPourX(x);
    const def = this.state.lookup(id);
    const n = Math.min(avail, amount ?? Infinity);
    this.sim.emitter.start(def, { x: this.pourX, amount: n });
    this.sim.emitter.active.dose = amount !== undefined;
    this.lastPoured[id] = this.sim.emitter.poured[id] || 0;
    if (this.tutorial) this.tutorial.notify('pour', id);
  }

  pourDose(ml) {
    if (!this.selected) { toast('Choose a reagent', 'Tap a jar on the shelf first.', 'jar'); return; }
    if (this.tool !== 'pour') this.selectTool('pour', true);
    this.startPour(this.pourX, Math.round(ml / SIM.ML_PER_PARTICLE));
  }

  /** Charge inventory for particles the emitter actually spawned. */
  accountPours() {
    const em = this.sim.emitter;
    for (const [id, total] of Object.entries(em.poured)) {
      const prev = this.lastPoured[id] || 0;
      const d = total - prev;
      if (d <= 0) continue;
      this.lastPoured[id] = total;
      const ml = d * SIM.ML_PER_PARTICLE;
      if (!this.sandbox) {
        this.state.consume(id, ml);
        if (this.state.stock(id) < SIM.ML_PER_PARTICLE && em.active && em.active.def.id === id) em.stop();
      }
      this.logPour(id, ml);
    }
  }

  logPour(id, ml) {
    const log = this.state.brewLog;
    if (this.sim.p.count <= Math.round(ml / SIM.ML_PER_PARTICLE) + 1 && !log.some((e) => e.type === 'pour')) this.state.newBatch();
    const last = log[log.length - 1];
    if (last && last.type === 'pour' && last.id === id && !last.ground) last.ml += ml;
    else log.push({ type: 'pour', id, ml, t: Math.round(this.sim.time) });
    // something was added: earlier trials no longer describe this brew
    this.state.touchBatch();
    this.state.stats.brews = this.state.stats.brews || 0;
  }

  setFurnace(v) {
    this.sim.furnace.setting = v;
    this.furnaceInput.value = String(Math.round(v * 100));
    if (this.tutorial) this.tutorial.notify('furnace', v);
  }

  toggleLid() {
    const c = this.sim.cauldron;
    c.lidClosed = !c.lidClosed;
    audio.play('lid');
    this.state.brewLog.push({ type: 'lid', closed: c.lidClosed, t: Math.round(this.sim.time) });
    this.refreshHud();
  }

  toggleAlembic() {
    this.alembicOpen = !this.alembicOpen;
    this.syncActions();
    toast(this.alembicOpen ? 'Alembic valve open' : 'Alembic valve closed', this.alembicOpen ? 'Vapour under the lid is drawn into the receiver flask.' : '', 'alembic', 2000);
  }

  cycleSpeed() {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
    this.syncActions();
  }

  setAutoStir(on) {
    if (this.autoStir === on) return;
    this.autoStir = on;
    const t = this.sim.tool;
    const upgraded = this.state.has('stirrer');
    t.auto = on;
    if (on) {
      t.type = 'spoon';
      const c = this.sim.cauldron;
      t.autoCenterX = 0;
      t.autoCenterY = c.depth - Math.min(0.75, c.depth * 0.3);
      t.autoRadius = upgraded ? c.belly * 0.55 : c.belly * 0.32;
      t.autoPhase = 0;
      t.autoSpan = 0;
      if (upgraded) this.aimStirrer();
    } else {
      t.setTarget(t.x, t.y, false);
    }
    this.syncActions();
  }

  /**
   * The clockwork paddle works the whole brew: centred on the contents and
   * travelling up and down through them, so layers and pockets mix
   * throughout (the hand-held stir only circles near the bottom).
   */
  aimStirrer() {
    const t = this.sim.tool, c = this.sim.cauldron, p = this.sim.p;
    if (!t.auto || !this.state.has('stirrer') && !this.sandbox) return;
    let top = c.depth;
    for (let i = 0; i < p.count; i += 3) if (p.phase[i] !== PHASE.GAS) top = Math.min(top, p.y[i]);
    t.autoCenterY = (top + c.depth) / 2;
    t.autoSpan = Math.max(0, (c.depth - top) / 2 - 0.2);
  }

  async emptyCauldron() {
    if (this.sim.p.count === 0) return;
    const ok = await confirmDialog('Empty the cauldron?', 'Everything in the cauldron will be poured away. Ingredients are not refunded.', 'Empty it', 'danger');
    if (!ok) return;
    this.sim.clear();
    this.state.brewLog = [];
    this.state.newBatch();
    this.lastPoured = {};
    audio.play('splash');
    this.save();
  }

  // ------------------------------------------------------------------ customers
  bringCustomer(withSound = true) {
    const st = this.state;
    if (this.sandbox) return;
    const c = st.nextCustomer();
    if (c && withSound) audio.play('bell');
    if (c && !c.tutorial && !(this.tutorial && this.tutorial.active)) {
      // the first order of a new kind explains itself once (never over the guided tour)
      if (c.activation && st.firstTip('activation')) toast('Awakened magic wanted', 'This order is stronger than sleeping magic can reach: the brew must be awakened past its arcane threshold. See How to play → Arcane awakening, or ask the guild.', 'awaken', 8000);
      else if (c.requirements.some((r) => r.key === 'purity') && st.firstTip('purity')) toast('A pure potion', '“No other effect above 1.2 %”: every effect the customer did not ask for must stay that faint. Test for them too.', 'pure', 7000);
    }
    this._seenCustomer = false;
    this.refreshCustomer();
    if (this.views) this.views.counter.refresh();
    this.updateBadges();
  }

  /** The compact order strip above the cauldron. */
  refreshCustomer() {
    if (this.sandbox) return;
    const st = this.state;
    const el = clear(this.strip);
    const com = st.current;
    this.reqEls = [];
    el.classList.toggle('empty', !com);
    if (!com) {
      el.append(h('div', { class: 'strip-empty small', text: st.dayOver ? `Day ${st.day} is over — close the shop at the Counter.` : 'No customer yet — open the door at the Counter.' }));
      return;
    }
    const portrait = /** @type {HTMLCanvasElement} */ (h('canvas', { class: 'portrait' }));
    drawPortrait(portrait, com.customer.portrait, 'neutral');
    this.portraitEl = portrait;
    const chips = h('div', { class: 'req-chips' });
    for (const req of com.requirements) {
      const now = h('span', { class: 'now' });
      const meter = h('i');
      const fx = !!EFFECT_BY_KEY[req.key] || req.key === 'purity';
      const li = h('div', { class: 'req-chip' + (fx ? ' fx' : '') + (req.limit ? ' limit' : ''), title: `${req.limit ? 'Limit — ' : ''}${PROPERTY_LABELS[req.key]}: ${req.label}` },
        icon(this.reqIcon(req.key), 'sm'),
        req.key === 'color' ? h('span', { class: 'swatch', style: { background: rgbToHex(req.rgb) } }) : h('span', { class: 'tgt', text: shortTarget(req) }),
        now, h('div', { class: 'meter' }, meter));
      chips.appendChild(li);
      this.reqEls.push({ req, li, now, meter });
    }
    const qNow = h('span', { class: 'now' });
    const qMeter = h('i');
    const qli = h('div', { class: 'req-chip' }, icon('flask', 'sm'), h('span', { class: 'tgt', text: `${com.bottleMl}` }), qNow, h('div', { class: 'meter' }, qMeter));
    chips.appendChild(qli);
    this.reqEls.push({ req: { key: 'quantity' }, li: qli, now: qNow, meter: qMeter });
    el.append(portrait, h('div', { class: 'strip-main' }, h('div', { class: 'potion-name', text: com.potionName }), chips));
    this.updateAssay(true);
  }

  async decline() {
    const ok = await confirmDialog('Decline this order?', 'The customer will leave without paying. Your reputation is not affected.', 'Decline', 'danger');
    if (!ok) return;
    this.state.declineCustomer();
    this.refreshCustomer();
    this.views.counter.refresh();
    setTimeout(() => this.bringCustomer(true), 900);
  }

  endDay() {
    const summary = this.state.endDay();
    this.save();
    const col = summary.colony;
    if (col) {
      if (col.born.length) setTimeout(() => audio.play('birth'), 600);
      else if (col.died.length) setTimeout(() => audio.play('toll'), 600);
      for (const e of col.events || []) this.announce(e);
    }
    panels.showDaySummary(this, summary, () => {
      this.views.trials.build();
      const relief = this.state.claimRelief();
      if (relief) toast('Guild stipend', `The guild lends a struggling apprentice ${relief} coins.`, 'coin', 4000);
      this.buildShelf();
      // a new day dawns with the shop still closed: gather dawn flowers, then open the door
      this.refreshCustomer();
      this.views.counter.refresh();
      this.updateBadges();
      this.refreshHud(true);
      this.views.wilds.refresh();
    });
  }

  // ------------------------------------------------------------------ bottling → vial → serving
  /**
   * Choose how much to bottle and where it goes — the counter, or a place on
   * the potion shelves — then bottle it into a sealed vial.
   */
  startBottling() {
    if (this.bottling) return;
    const st = this.state;
    const counterFree = !st.vial && !this.sandbox;
    if (!counterFree && !this.sandbox && st.bottleRoom <= 0) {
      toast('Nowhere to put it', `The counter holds a vial and the potion shelves are full (${st.cap.bottles}). Serve, pour back or discard a bottle first — or buy more shelving.`, 'bottle', 4500);
      this.showView('counter');
      return;
    }
    if (this.sandbox && st.vial) { toast('A vial is waiting', 'Pour back or discard the sealed vial first.', 'bottle'); return; }
    const avail = Math.floor(this.tapAvailable() / SIM.ML_PER_PARTICLE);
    if (avail < 1) { toast('Nothing to bottle', 'There is no liquid at the tap.', 'flask'); audio.play('error'); return; }
    panels.openBottleSize(this, avail, (n, dest) => this.beginBottling(n, dest), { counterFree: counterFree || this.sandbox, shelfRoom: this.sandbox ? 0 : st.bottleRoom, shelves: !this.sandbox });
  }

  /**
   * Draw `n` particles from the tap into a new vial (animated).
   * @param {number} n @param {'counter'|'shelf'} [dest] where the sealed bottle goes
   */
  beginBottling(n, dest = 'counter') {
    if (this.bottling) return;
    const st = this.state;
    const sel = tapSelection(this.sim, n);
    if (sel.length < 1) return;
    const m = measureParticles(this.sim, sel);
    this.sim.emitter.stop();
    this.setAutoStir(false);
    // the trials of this batch that still describe exactly what is bottled
    const cert = certification(st.trials, st.batch, m.effects);
    const vial = makeVial(this.sim, [], {
      batchId: st.batch.id, rev: st.batch.rev, cert: cert.values, certRecords: cert.records, samples: cert.samples, parts: this.batchParts(),
      day: st.day, commissionId: st.current ? st.current.id : null,
    });
    // a poured-back bottle bottled again keeps its label, while nothing has drifted
    const carried = st.batch.carried;
    if (carried && carried.label && !cert.stale.length && Object.keys(cert.values).length) {
      vial.label = JSON.parse(JSON.stringify(carried.label));
      applyTrials(vial.label, cert.values, Object.values(cert.records)[0] || '', evidenceOf(vial));
    }
    this.bottling = { total: sel.length, removed: 0, progress: 0, color: m.color, t: 0, vial, dest };
    audio.play('glass');
    if (this.tutorial) this.tutorial.notify('bottle');
  }

  stepBottling(dt) {
    const b = this.bottling;
    if (!b) return;
    b.t += dt;
    const target = Math.min(b.total, Math.ceil(b.total * Math.min(1, b.t / 1.4)));
    const k = target - b.removed;
    if (k > 0) {
      // the particles that run out of the tap go into the vial, exactly
      const sel = tapSelection(this.sim, k).sort((a, c) => c - a);
      appendParticles(b.vial, this.sim, sel);
      for (const i of sel) this.sim.removeParticle(i);
      b.removed += sel.length;
      if (!sel.length) b.total = b.removed;
    }
    b.progress = b.removed / Math.max(1, b.total);
    if (b.t > 1.8) this.finishBottling();
  }

  finishBottling() {
    const b = this.bottling;
    this.bottling = null;
    const st = this.state;
    const vial = b.vial;
    updateVial(vial, st.lookup, st.world.laws);
    vial.recipe = this.recipeDraft(vial.m, null, st.current);
    this.autoLabel(vial);
    vial.commissionId = b.dest === 'shelf' ? null : vial.commissionId;
    if (b.dest === 'shelf' && st.shelveBottle(vial).ok) {
      if (this.sim.p.count === 0) { st.brewLog = []; st.newBatch(); this.lastPoured = {}; }
      audio.play('glass');
      this.save();
      toast('Bottle shelved', `${vial.ml} ml sealed and put on the potion shelves (${st.bottles.length}/${st.cap.bottles}). Take it down at the Counter whenever you need it.`, 'bottle', 3600);
      if (this.view === 'counter') this.views.counter.refresh();
      this.updateBadges();
      return;
    }
    st.vial = vial;
    if (this.sim.p.count === 0) { st.brewLog = []; st.newBatch(); this.lastPoured = {}; }
    audio.play('glass');
    this.save();
    if (this.sandbox || !st.current) toast('Vial sealed', `${vial.ml} ml bottled. Test it in the Trials room, or pour it back to keep working on it.`, 'bottle', 3600);
    this.showView(this.sandbox ? 'trials' : 'counter');
    this.updateBadges();
  }

  /** Put the counter's vial on the potion shelves. */
  shelveVial() {
    const st = this.state;
    const r = st.shelveBottle();
    if (!r.ok) { toast('The shelves are full', r.reason, 'bottle', 4000); audio.play('error'); return; }
    audio.play('glass');
    this.save();
    this.views.counter.refresh();
    this.updateBadges();
  }

  /** Take a shelved bottle down to the counter (swapping with the vial there). @param {string} id */
  takeBottle(id) {
    const r = this.state.takeBottle(id);
    if (!r.ok) return;
    updateVial(r.bottle, this.state.lookup, this.state.world.laws);
    this.shareEvidence(r.bottle.batchId);
    audio.play('glass');
    this.save();
    this.views.counter.refresh();
    this.updateBadges();
  }

  /** Pour a shelved bottle away. @param {string} id */
  discardBottle(id) {
    if (!this.state.removeBottle(id)) return;
    audio.play('splash');
    this.save();
    this.views.counter.refresh();
  }

  /** Pour a shelved bottle back into the cauldron. @param {string} id */
  pourBackBottle(id) {
    const b = this.state.bottles.find((x) => x.id === id);
    if (!b) return;
    if (!this.pourVialIntoCauldron(b)) return;
    this.state.removeBottle(id);
    this.save();
    this.views.counter.refresh();
    this.showView('brew');
  }

  /**
   * Offer the sealed vial to the customer: label it (if not yet), then
   * bargain. The agreed price is paid; the customer's verdict on the real
   * potion comes back the next day.
   */
  serveVial() {
    const st = this.state;
    const v = st.vial, com = st.current;
    if (!v || !com) return;
    if (!v.label) { this.identifyVial(() => this.serveVial()); return; }
    const gaps = proofGaps(com, v.label);
    if (gaps.length) {
      const untested = gaps.filter((g) => g.have === 'untested');
      const weak = gaps.filter((g) => g.have !== 'untested');
      const remeasured = untested.filter((g) => v.label.claims[g.key] && v.label.claims[g.key].measured !== undefined);
      const names = (l) => l.map((g) => EFFECT_BY_KEY[g.key].label).join(', ');
      toast(`${shortName(com.customer.name)} wants proof`, remeasured.length
        ? `This customer only buys on trial evidence of this batch: put the tested reading of ${names(remeasured)} back on the label (✓).`
        : untested.length ? `This customer only buys on trial evidence of this batch: test ${names(untested)} first${com.requirements.some((r) => r.key === 'purity') ? ' — one trial reads every effect at once' : ''}.`
          : `One reading is not enough for this customer: ${names(weak)} must be ${weak[0].need === 'corroborated' ? 'read on a second rabbit' : 'tested again'}.`, 'dropper', 6000);
      return;
    }
    trade.openNegotiation(this, com, v, (n) => {
      this.save();
      if (!n) return;
      if (n.state === 'left') { this.customerLeft(); return; }
      if (n.state === 'deal') this.completeDeal(n.price, n.log.find((l) => l.who === 'them' && l.coins)?.coins || 0);
    });
  }

  /** Write or revise the vial's label. @param {()=>void} [after] */
  identifyVial(after) {
    const v = this.state.vial;
    if (!v) return;
    trade.openIdentify(this, v, (label) => {
      v.label = label;
      this.save();
      this.views.counter.refresh();
      if (after) after();
    });
  }

  /** @param {number} price @param {number} firstOffer */
  completeDeal(price, firstOffer) {
    const st = this.state;
    const v = st.vial, com = st.current;
    if (!v || !com) return;
    const truth = { ...v.m, ml: Math.floor(v.ml / SIM.ML_PER_PARTICLE) * SIM.ML_PER_PARTICLE };
    const recipe = { ...(v.recipe || this.recipeDraft(truth, null, com)), verified: v.cert || {} };
    const { events, sale } = st.completeDeal(v, v.label, price, truth, firstOffer);
    st.vial = null;
    if (com.effectOrder && Object.values(v.label.claims).some((c) => c.source === 'trial')) events.push(...st.unlock('certified'));
    for (const e of events) this.announce(e);
    this.save();
    trade.showDeal(this, com, sale, recipe, () => {
      this.refreshCustomer();
      this.views.counter.refresh();
      this.refreshHud(true);
      if (this.tutorial) this.tutorial.notify('sold');
      if (!st.dayOver) setTimeout(() => this.bringCustomer(true), 1400);
    });
  }

  /** The customer would not agree on a price and left; the vial stays. */
  customerLeft() {
    const st = this.state;
    toast('The customer left', 'No sale. Your vial is still on the counter.', 'door');
    if (st.current && st.current.tutorial) return;
    st.declineCustomer();
    this.save();
    this.refreshCustomer();
    this.views.counter.refresh();
    setTimeout(() => this.bringCustomer(true), 1200);
  }

  discardVial() {
    this.state.vial = null;
    audio.play('splash');
    this.save();
    this.views.counter.refresh();
    this.updateBadges();
  }

  /** Return the vial's potion to the cauldron: exactly the matter it holds. */
  pourBackVial() {
    const st = this.state;
    const v = st.vial;
    if (!v) return;
    if (!this.pourVialIntoCauldron(v)) return;
    st.vial = null;
    this.save();
    this.views.counter.refresh();
    this.showView('brew');
  }

  /** Pour a sealed bottle's exact matter into the cauldron. Returns false if there is no room. @param {any} v */
  pourVialIntoCauldron(v) {
    const st = this.state;
    const empty = this.sim.p.count === 0;
    const made = pourBack(v, this.sim);
    if (!made) { toast('No room', 'The cauldron is too full to pour the bottle back.', 'cauldron'); return false; }
    // provenance: the batch now also holds its share of what the vial's batch was made of
    st.brewLog.push({ type: 'vial', ml: made * SIM.ML_PER_PARTICLE, t: Math.round(this.sim.time), parts: pourBackParts(v, made * SIM.ML_PER_PARTICLE), from: v.id });
    // into an empty cauldron, or back into the unchanged batch it came from,
    // the bottle stays what it was: its trials and label still hold
    const kept = !!v.batchId && (empty || (st.batch.id === v.batchId && st.batch.rev === v.rev));
    if (kept) st.resumeBatch(v);
    else {
      if (st.batch.id !== v.batchId) st.newBatch();
      st.touchBatch();
    }
    audio.play('splash');
    toast('Poured back', `${made * SIM.ML_PER_PARTICLE} ml returned to the cauldron. ${kept ? 'It is the same tested potion: its trials and label still hold.' : 'Earlier trials no longer describe the brew.'}`, 'pour');
    return true;
  }

  /** Build a recipe description from the brew log + the measured result. */
  recipeDraft(m, ev, com) {
    const st = this.state;
    const ing = [];
    for (const e of st.brewLog) if (e.type === 'pour') ing.push({ id: e.id, ml: e.ml, ground: e.ground || undefined });
    const agg = [];
    for (const i of ing) {
      const last = agg[agg.length - 1];
      if (last && last.id === i.id && !!last.ground === !!i.ground) last.ml += i.ml;
      else agg.push({ ...i });
    }
    const stats = st.brewLog.find((e) => e.type === 'stats') || {};
    const steps = buildProcedure(st.brewLog, m.temperature);
    return {
      name: com ? com.potionName : 'Experiment',
      request: com ? com.request : null,
      techniques: com ? com.techniques || [] : [],
      ingredients: agg,
      limits: procedureLimits(steps),
      maxTemp: Math.round(stats.maxT ?? m.temperature),
      minTemp: Math.round(stats.minT ?? m.temperature),
      serveTemp: Math.round(m.temperature),
      stirSeconds: Math.round(stats.stir || 0),
      crushed: !!stats.crushed,
      lid: this.sim.cauldron.lidClosed,
      result: { color: m.color, ml: m.ml },
      verified: { ...this.cert.values },
      // the ordered procedure, and how well the trials behind it know it
      steps,
      evidence: Object.fromEntries(Object.keys(this.cert.values || {}).map((k) => [k, { level: (this.cert.level || {})[k] || 'preliminary', n: (this.cert.n || {})[k] || 1, r: (this.cert.rabbits || {})[k] || 1, u: (this.cert.unc || {})[k] || 0 }])),
      brews: 1, reproduced: 0, mismatched: 0,
      quality: ev ? ev.quality : null,
      customer: com ? com.customer.title : null,
      day: st.day,
    };
  }

  /** Track temperatures / stirring for the recipe log. */
  trackBrew(dt) {
    const log = this.state.brewLog;
    let s = log.find((e) => e.type === 'stats');
    if (!s) { s = { type: 'stats', maxT: -1e9, minT: 1e9, stir: 0, crushed: false }; log.push(s); }
    const p = this.sim.p;
    if (p.count === 0) return;
    let T = 0, n = 0;
    for (let i = 0; i < p.count; i += 3) if (p.phase[i] !== PHASE.GAS) { T += p.temp[i]; n++; }
    if (n) {
      T /= n;
      s.maxT = Math.max(s.maxT, T);
      s.minT = Math.min(s.minT, T);
    }
    const t = this.sim.tool;
    const stirring = t.active && t.type === 'spoon' && (t.speed > 0.2 || this.autoStir);
    if (stirring) s.stir += dt;
    if (t.active && t.type === 'pestle') s.crushed = true;
    // the procedure trace (recipes.js): one sample a second of brewing time
    this._tr = this._tr || { t: 0, stir: false, crush: false };
    this._tr.stir ||= stirring;
    this._tr.crush ||= t.active && t.type === 'pestle';
    if (n && this.sim.time - this._tr.t >= TRACE_DT) {
      traceSample(log, { t: this.sim.time, T, stir: this._tr.stir, crush: this._tr.crush, lid: this.sim.cauldron.lidClosed, ml: condensedCount(this.sim) * SIM.ML_PER_PARTICLE });
      this._tr = { t: this.sim.time, stir: false, crush: false };
    }
  }

  /** Measuring vial: exactly what bottling would draw from the tap right now. */
  sampleVial() {
    const n = this.state.current ? this.state.current.bottleN : 20;
    const m = measureParticles(this.sim, tapSelection(this.sim, n));
    if (!m) { toast('Nothing to sample', 'The cauldron is empty.', 'flask'); return; }
    audio.play('glass');
    panels.showAnalysis(this, m, this.recipeDraft(m, null, null), `Measuring vial · ${m.ml} ml from the tap`);
  }

  announce(e) {
    if (e.type === 'traveller-gift') {
      this.views.wilds.refresh();
    } else if (e.type === 'achievement') {
      toast(`Achievement: ${e.name}`, `${e.desc} (+${e.reward} coins)`, 'star', 4200);
      audio.play('fanfare');
    } else if (e.type === 'technique') {
      toast(`Technique mastered: ${e.name}`, `${e.text} (+4 reputation)`, 'star', 5200);
      audio.play('fanfare');
    } else if (e.type === 'rank') {
      toast(`Promoted to ${e.name}!`, RANK_NEWS[e.rank] || 'New customers, reagents, regions and equipment are available.', 'charter', 7000);
      audio.play('fanfare');
      this.buildShelf();
      this.views.wilds.refresh();
    }
  }

  // ------------------------------------------------------------------ trials support
  /** Millilitres the tap could deliver now. */
  tapAvailable() {
    const p = this.sim.p;
    let n = 0;
    for (let i = 0; i < p.count; i++) if (p.phase[i] !== PHASE.GAS && p.phase[i] !== PHASE.SOLID) n++;
    return n * SIM.ML_PER_PARTICLE;
  }

  /** What has been poured into this batch. */
  batchParts() {
    const out = [];
    const add = (id, ml) => {
      const last = out.find((x) => x.id === id);
      if (last) last.ml += ml; else out.push({ id, ml });
    };
    for (const e of this.state.brewLog) {
      if (e.type === 'pour') add(e.id, e.ml);
      else if (e.type === 'vial') for (const p of e.parts || []) add(p.id, p.ml);
    }
    return out;
  }

  /**
   * A saved recipe this batch follows — the same formulation prepared by the
   * same procedure (recipes.js compareRecipe) — whose effects were verified
   * when it was first brewed: the middle tier between theory and a trial of
   * this very batch.
   */
  knownRecipe() {
    const parts = this.batchParts();
    if (!parts.length || this.sandbox) return null;
    const steps = buildProcedure(this.state.brewLog);
    for (const r of this.state.recipes) {
      if (!r.verified || !Object.keys(r.verified).length || !r.ingredients) continue;
      if (matchRecipe(r, parts, steps, this.state.lookup) === 'procedure') return r;
    }
    return null;
  }

  /**
   * What the brew needs, read from the cauldron itself (never the hidden
   * effects): whole solids that will not give anything up, herbs outside the
   * steeping window the alchemist has discovered for them (or a hint that
   * some herbs want warmth), an uneven brew, steam leaving with the lid off,
   * awakening reached. At most three lines.
   * @returns {{key:string, text:string}[]}
   */
  brewAdvice() {
    // read off the cauldron at most once a second (it scans every particle)
    if (this._advice && this.time - this._advice.t < 1) return this._advice.list;
    const list = this.computeAdvice();
    this._advice = { t: this.time, list };
    return list;
  }

  /** @returns {{key:string, text:string}[]} */
  computeAdvice() {
    const sim = this.sim, p = sim.p, st = this.state, sp = sim.species, S = MAX_SPECIES;
    const out = [];
    if (!p.count) return out;
    let whole = 0, gas = 0, T = 0, n = 0;
    /** @type {Map<number, number>} raw wild ingredient slots still in the brew */
    const raw = new Map();
    for (let i = 0; i < p.count; i++) {
      const ph = p.phase[i];
      if (ph === PHASE.GAS) { gas++; continue; }
      T += p.temp[i]; n++;
      for (let s = 0; s < sp.count; s++) {
        const f = p.comp[i * S + s];
        const d = sp.defs[s];
        if (f < 0.3 || !d || !d.wild) continue;
        if (ph === PHASE.SOLID && d.crushable) whole++;
        raw.set(s, (raw.get(s) || 0) + f);
      }
    }
    T = n ? T / n : 20;
    if (whole >= 3) out.push({ key: 'whole', text: 'Whole herbs and stones give up almost nothing: crush them with the pestle (Crush).' });
    // the steeping windows the alchemist has seen work, for what is still undissolved
    const windows = [];
    for (const [s, f] of raw) {
      if (f < 1.5) continue;
      const d = sp.defs[s];
      const r = st.world.reactions.find((x) => x.a === d.id && x.products.length === 1 && /^rw_(extract|infuse|steep)/.test(x.id));
      if (!r) continue;
      const knownR = this.sandbox || st.journal['reaction:' + r.id];
      if (knownR && (T < r.minT - 2 || T > r.maxT + 2)) windows.push(`${d.name.split(' ').slice(-1)[0]} steeps at ${r.minT}–${r.maxT}°C`);
      else if (!knownR && T < 30 && r.minT > 25) windows.push('');
    }
    const named = windows.filter(Boolean);
    if (named.length) out.push({ key: 'window', text: `${named.slice(0, 2).join('; ')} — the brew is at ${Math.round(T)}°C.` });
    else if (windows.length) out.push({ key: 'warm', text: 'Some of these herbs have not given up their magic yet: most steep only when warmed (a few only ice-cold).' });
    if (gas >= 3 && !sim.cauldron.lidClosed) out.push({ key: 'steam', text: 'Boiling with the lid off: steam is leaving, so the brew grows smaller and stronger — side effects too.' });
    else if (this.assay && this.assay.stability < 70 && !sim.emitter.pouring && !this.autoStir) out.push({ key: 'stir', text: 'The brew is uneven — pockets and layers. Stir it through before you test or bottle.' });
    return out.slice(0, 3);
  }

  /**
   * A saved recipe with this batch's formulation but not (yet) its procedure,
   * with what differs.
   * @returns {{recipe:any, differences:string[], approx:boolean}|null}
   */
  similarRecipe() {
    const parts = this.batchParts();
    if (!parts.length || this.sandbox) return null;
    const steps = buildProcedure(this.state.brewLog);
    for (const r of this.state.recipes) {
      if (!r.verified || !Object.keys(r.verified).length) continue;
      const c = compareRecipe(r, parts, steps, this.state.lookup);
      if (c.formulation && !c.procedure) return { recipe: r, differences: c.differences, approx: c.procedure === null };
    }
    return null;
  }

  /**
   * A batch that follows a saved recipe has been tested: do the trials agree
   * with what the recipe recorded? Each batch counts once.
   */
  checkRecipeRepeat() {
    const r = this.knownRecipe();
    if (!r || !this.cert || !Object.keys(this.cert.values || {}).length) return;
    const keys = Object.keys(r.verified);
    if (!keys.every((k) => this.cert.values[k] !== undefined)) return;
    const res = checkReproduction(r, this.cert, `${this.state.batch.id}:${this.state.batch.rev}`);
    if (res === 'agree') toast('Recipe reproduced', `“${r.name}” brewed again and tested the same: a reliable recipe.`, 'book', 4200);
    else if (res === 'differ') toast('The recipe did not repeat', `This batch of “${r.name}” tested differently from the recorded one. Something in the procedure matters that the recipe does not hold.`, 'book', 6000);
  }

  /** The guild's naive theory for this batch, with the laws you have found (and the awakening you can see). */
  theory() {
    const parts = awakenParts(this.batchParts(), this.sim.inventory(), this.state.lookup);
    return theoryOf(parts, this.state.lookup, this.sandbox ? this.state.world.laws : this.state.knownLaws);
  }

  /** Theory for the sealed vial (its provenance, with its visible awakening). @param {any} v */
  vialTheory(v) {
    const comp = v && v.m ? v.m.composition : {};
    return theoryOf(awakenParts(v.parts || [], comp, this.state.lookup), this.state.lookup, this.sandbox ? this.state.world.laws : this.state.knownLaws);
  }

  /**
   * Draw a dose from the cauldron tap: the particles leave the cauldron.
   * @param {number} ml
   */
  drawDose(ml) {
    const n = Math.max(1, Math.round(ml / SIM.ML_PER_PARTICLE));
    const sel = tapSelection(this.sim, n);
    if (!sel.length) return null;
    const m = measureParticles(this.sim, sel);
    for (const i of sel.slice().sort((a, b) => b - a)) this.sim.removeParticle(i);
    if (this.sim.p.count === 0) { this.state.brewLog = []; this.lastPoured = {}; }
    audio.play('glass');
    return { dose: m, ml: sel.length * SIM.ML_PER_PARTICLE };
  }

  /** Take a dose out of the sealed vial: real particles that never return. @param {number} ml */
  vialDose(ml) {
    const st = this.state;
    const v = st.vial;
    if (!v || v.particles.length < 1) return null;
    const r = takeDose(v, ml, st.lookup, st.world.laws, st.day);
    if (!r) return null;
    const out = { dose: r.dose, ml: r.ml, batchId: v.batchId, rev: v.rev, theory: this.vialTheory(v), parts: v.parts || [] };
    if (v.particles.length < 1) {
      st.vial = null;
      toast('The vial is empty', 'All of it went to the trials.', 'bottle');
    }
    return out;
  }

  /** Certification of the batch as it would be bottled now (cached each assay). */
  currentCert() {
    return this.cert;
  }

  // ------------------------------------------------------------------ live analysis
  updateAssay(force = false) {
    const st = this.state;
    const com = st.current;
    const n = com ? com.bottleN : 20;
    const sel = tapSelection(this.sim, n);
    const m = sel.length ? measureParticles(this.sim, sel) : null;
    this.assay = m;
    this.cert = m ? certification(st.trials, st.batch, m.effects) : { values: {}, records: {}, stale: [], changed: false };
    if (!this.sandbox && st.trials.records.length !== this._recCount) { this._recCount = st.trials.records.length; this.checkRecipeRepeat(); }
    if (!com || !this.reqEls || !this.reqEls.length) return;
    for (const r of this.reqEls) {
      let score = 0, text = '—', unknown = false;
      if (m) {
        if (r.req.key === 'quantity') {
          const f = Math.min(1, m.ml / com.bottleMl);
          score = f >= 0.98 ? 1 : f * f;
          text = `${m.ml}`;
        } else if (r.req.key === 'purity' || EFFECT_BY_KEY[r.req.key]) {
          // never read from the brew: only trials of this batch can show it, with their margin —
          // ✓ reliably met, ~ not settled (an undetected effect may still be there), ✗ missed
          const ev = requirementEvidence(r.req, /** @type {any} */ (this.cert));
          const v = this.cert.values[r.req.key];
          if (ev.evidence === 'untested') {
            unknown = true; score = 0;
            if (r.req.key === 'purity') { const keys = EFFECTS.map((e) => e.key).filter((k) => !(r.req.exclude || []).includes(k)); const known = keys.filter((k) => this.cert.values[k] !== undefined).length; text = known ? `${known}/${keys.length}` : '?'; }
            else text = '?';
          } else {
            score = ev.within === true ? 1 : ev.within === false ? 0.2 : 0.7;
            text = r.req.key === 'purity' ? ev.mark : ev.evidence === 'not-detected' ? `${ev.mark}nd` : `${ev.mark}${Math.round(v)}`;
          }
          r.li.title = `${PROPERTY_LABELS[r.req.key]}: ${r.req.label} — ${ev.text}${ev.title ? ` (${ev.title})` : ''}`;
        } else {
          // any other measured requirement
          const s = scoreRequirement(r.req, m);
          score = s.score;
          text = `${Math.round(s.value)}°`;
        }
      }
      r.now.textContent = text;
      r.meter.style.width = unknown ? '0%' : Math.round(score * 100) + '%';
      r.meter.style.background = score >= 0.999 ? '#4c8a2a' : score > 0.6 ? '#c08a2a' : '#a83a2a';
      r.li.classList.toggle('ok', score >= 0.999 && !unknown);
      r.li.classList.toggle('unknown', unknown);
    }
    if (this.bottleFab) this.bottleFab.disabled = !m;
    this.updateBadges();
    void force;
  }

  toggleBrewInfo() {
    this.brewPanel.classList.toggle('hidden');
    const open = !this.brewPanel.classList.contains('hidden');
    this.stageEl.classList.toggle('info-open', open);
    this.infoBtn.classList.toggle('active', open);
    this.updateBrewPanel(true);
  }

  /** What is in the cauldron, and what is known about it. */
  updateBrewPanel(force = false) {
    const el = this.brewPanel;
    if (!el || (el.classList.contains('hidden') && !force)) return;
    const sim = this.sim, p = sim.p, st = this.state;
    const n = p.count;
    clear(el);
    el.append(h('div', { class: 'row' }, icon('cauldron'), h('b', { text: 'In the cauldron' }), h('span', { class: 'spacer' }), btn('', () => this.toggleBrewInfo(), { icon: 'close', cls: 'icon', title: 'Close' })));
    if (!n) { el.append(h('div', { class: 'small muted', text: 'Empty. Pick a reagent and pour.' })); return; }
    let tmin = 1e9, tmax = -1e9, tsum = 0, tn = 0;
    const phases = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      phases[p.phase[i]]++;
      if (p.phase[i] === PHASE.GAS) continue;
      const T = p.temp[i];
      tmin = Math.min(tmin, T); tmax = Math.max(tmax, T); tsum += T; tn++;
    }
    const inv = sim.inventory();
    const tot = Object.values(inv).reduce((a, b) => a + b, 0) || 1;
    const comp = Object.entries(inv).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const theory = this.theory();
    const cert = this.cert;
    const known = this.knownRecipe();
    const similar = known ? null : this.similarRecipe();
    const thList = EFFECTS.map((e, k) => /** @type {[import('../alchemy/effects.js').EffectDef, number]} */ ([e, theory[k]])).filter(([, v]) => Math.abs(v) >= 1);
    el.append(...[
      h('div', { class: 'small', text: `${n * SIM.ML_PER_PARTICLE} ml · ${tn ? Math.round(tsum / tn) : '—'}°C${tn ? ` (${Math.round(tmin)}–${Math.round(tmax)})` : ''} · lid ${sim.cauldron.lidClosed ? 'on' : 'off'}` }),
      ...this.brewAdvice().map((a) => h('div', { class: 'small advice', 'data-advice': a.key, text: a.text })),
      h('div', { class: 'phase-bar' }, ...['liquid', 'powder', 'paste', 'solid', 'gas'].map((name, k) => phases[k] ? h('i', { class: 'ph-' + name, title: name, style: { flexGrow: String(phases[k]) } }) : null)),
      h('div', { class: 'small muted', text: ['liquid', 'powder', 'paste', 'solid', 'vapour'].map((name, k) => (phases[k] ? `${name} ${Math.round((phases[k] / n) * 100)}%` : '')).filter(Boolean).join(' · ') }),
      ...comp.map(([id, v]) => {
        const m = st.lookup(id);
        return h('div', { class: 'row small' }, h('span', { class: 'swatch', style: { background: rgbToHex(m ? m.look || m.color : [0.5, 0.5, 0.5]) } }), h('span', { text: `${Math.round((v / tot) * 100)}% ${m ? m.name : id}` }));
      }),
      h('div', { class: 'small know' }, h('b', { text: 'Theory ' }), thList.length ? thList.map(([e, v]) => h('span', { class: 'fx-chip dim', title: e.label }, icon(e.icon, 'sm'), ` ≈${Math.round(v)}`)) : h('span', { class: 'muted', text: 'no effects expected' })),
      known ? h('div', { class: 'small know' }, h('b', { text: 'Recipe ' }), ...Object.entries(known.verified).map(([k, v]) => h('span', { class: 'fx-chip dim', title: `${EFFECT_BY_KEY[k].label}, as verified when “${known.name}” was first brewed` }, icon(EFFECT_BY_KEY[k].icon, 'sm'), ` ~${Math.round(/** @type {number} */ (v))}`))) : null,
      similar ? h('div', { class: 'small warn recipe-partial', text: similar.approx
        ? `Recipe “${similar.recipe.name}”: the same ingredients, but its procedure is only approximate — test this batch rather than rely on what it recorded.`
        : `Recipe “${similar.recipe.name}”: the same ingredients, but not yet prepared the same way (${similar.differences.slice(0, 2).join('; ')}) — follow its steps before you rely on what it recorded.` }) : null,
      h('div', { class: 'small know' }, h('b', { text: 'Verified ' }), Object.keys(cert.values).length ? Object.entries(cert.values).map(([k, v]) => h('span', { class: 'fx-chip', title: EFFECT_BY_KEY[k].label }, icon(EFFECT_BY_KEY[k].icon, 'sm'), ` ${Math.round(v)}`)) : h('span', { class: 'muted', text: cert.changed ? 'outdated — retest' : 'nothing yet' })),
      h('div', { class: 'small muted', text: `Theory: what the ingredients do on paper.${known ? ' Recipe: what this recipe did when tested.' : ''} Verified: trials of this batch — the only proof.` }),
    ].filter(Boolean));
    void force;
  }

  updateProbe() {
    if (!this.probe) return;
    const sel = probeSelection(this.sim, this.probe.x, this.probe.y, this.probe.r);
    const el = clear(this.readout);
    el.classList.remove('hidden');
    if (!sel.length) {
      const c = this.sim.cauldron;
      const wall = c.wallCellAt(this.probe.x, this.probe.y);
      el.append(h('div', { text: wall >= 0 ? `Iron wall: ${Math.round(c.cellT[wall])}°C` : 'Empty space' }));
      return;
    }
    const m = measureParticles(this.sim, sel);
    const st = this.state;
    const comp = Object.entries(m.composition).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const phase = Object.entries(m.phases).sort((a, b) => b[1] - a[1])[0][0];
    // the arcanometer shows the aura of strong magic and reads the threshold
    const arc = this.sandbox || st.has('arcanometer');
    const aura = arc ? EFFECTS.filter((e, k) => Math.abs(m.effects[k]) >= 3) : [];
    el.append(
      h('div', { class: 'rrow' }, h('span', { class: 'swatch', style: { background: rgbToHex(m.color) } }), h('b', { text: `${describeColor(m.color)} ${phase}` })),
      // what the eye tells in the shop; the simulation's numbers in the Free Experiment
      this.sandbox
        ? h('div', { text: `${Math.round(m.temperature)}°C · ${m.viscosity < 100 ? m.viscosity.toFixed(1) : Math.round(m.viscosity)} cP · ${m.density.toFixed(2)} g/ml · charge ${m.charge.toFixed(2)}` })
        : h('div', { text: `${Math.round(m.temperature)}°C · ${viscosityClass(m.viscosity)} · ${densityWord(m.density)}` }),
      ...comp.map(([id, f]) => h('div', { text: `${Math.round(f * 100)}% ${st.lookup(id) ? st.lookup(id).name : id}` })),
      arc ? h('div', { class: 'aura' }, h('span', { text: 'Aura: ' }), aura.length ? aura.map((e) => icon(e.icon, 'sm')) : h('span', { text: 'none' })) : h('div', { class: 'muted', text: 'Effects: unknown (test in Trials)' }),
    );
    if (arc) el.append(this.arcaneReading(sel, m));
  }

  /**
   * The arcanometer: the mean arcane threshold of the probed matter, read to
   * the nearest 50, and how much of its magic has awakened.
   * @param {number[]} sel @param {any} m
   */
  arcaneReading(sel, m) {
    const p = this.sim.p;
    let w = 0, t = 0;
    for (const i of sel) if (p.arcT[i] < ARC_NONE) { w++; t += p.arcT[i]; }
    let awake = 0, magic = 0;
    for (const [id, f] of Object.entries(m.composition)) {
      const d = this.state.lookup(id);
      if (!d) continue;
      if (d.awakened) { awake += f; magic += f; } else if (d.arcane && Number.isFinite(d.arcane.thr)) magic += f;
    }
    if (!magic) return h('div', { class: 'muted', text: 'Arcanometer: no magic here' });
    const share = Math.round((awake / magic) * 100);
    const thr = w ? Math.round(t / w / 50) * 50 : null;
    return h('div', { class: 'arcane-read' }, icon('awaken', 'sm'), ` ${thr === null ? 'all awakened' : 'threshold ' + describeThreshold(thr)}${share ? ` · ${share}% awake` : ''}`);
  }

  // ------------------------------------------------------------------ HUD
  refreshHud(full = false) {
    const st = this.state;
    if (!this.sandbox) {
      this.coinEl.textContent = coins(st.coins);
      const r = st.rank, next = RANKS[r + 1];
      this.rankName.textContent = RANKS[r].name;
      const prog = next ? (st.reputation - RANKS[r].rep) / (next.rep - RANKS[r].rep) : 1;
      this.rankBar.style.width = Math.round(Math.max(0, Math.min(1, prog)) * 100) + '%';
      this.rankBar.parentElement.parentElement.title = `Rank: ${RANKS[r].name} · reputation ${st.reputation}${next ? ` of ${next.rep} for ${next.name}` : ''}`;
      const guest = Math.min(st.customerIndex + (st.current ? 1 : 0), st.customersPerDay);
      this.dayEl.title = `Day ${st.day}: customer ${guest} of ${st.customersPerDay} today${st.marketEvent.key !== 'none' ? ` · ${st.marketEvent.name}` : ''}`;
      clear(this.dayEl).append(h('span', { text: `Day ${st.day}` }), h('span', { class: 'guests', text: `Customer ${guest}/${st.customersPerDay}` }), ...(st.marketEvent.key !== 'none' ? [h('span', { class: 'event', text: st.marketEvent.name })] : []));
    }
    this.syncActions();
    const f = this.sim.furnace.setting;
    const c = this.sim.cauldron;
    const label = f > 0.02 ? `Heat ${Math.round(f * 100)}%` : f < -0.02 ? `Cool ${Math.round(-f * 100)}%` : 'Off';
    this.furnaceLabel.textContent = `${label} · ${Math.round(c.bottomTemperature())}°C`;
    this.furnaceLabel.title = 'Setting, and the temperature of the cauldron floor';
    const on = Math.abs(f) > 0.02;
    this.furnaceOff.disabled = !on;
    this.furnaceOff.classList.toggle('hot', f > 0.02);
    this.furnaceOff.classList.toggle('cold', f < -0.02);
    if (full) this.updateShelf();
    this.updateChips();
  }

  updateShelf() {
    if (!this.jarEls) return;
    for (const [id, j] of Object.entries(this.jarEls)) {
      const s = this.sandbox ? Infinity : this.state.stock(id);
      j.stock.textContent = isFinite(s) ? (s >= 1000 ? (s / 1000).toFixed(1) + 'L' : String(Math.round(s))) : '∞';
      j.el.classList.toggle('empty', s < SIM.ML_PER_PARTICLE);
    }
  }

  updateChips() {
    const sim = this.sim;
    const p = sim.p;
    let T = 0, n = 0, gas = 0;
    for (let i = 0; i < p.count; i++) { if (p.phase[i] === PHASE.GAS) gas++; else { T += p.temp[i]; n++; } }
    const info = `${p.count * SIM.ML_PER_PARTICLE} / ${sim.maxParticles * SIM.ML_PER_PARTICLE} ml${n ? ` · ${Math.round(T / n)}°C` : ''}`;
    if (this.infoText.textContent !== info) this.infoText.textContent = info;
    /** @type {{text:string, act?:string, cls?:string, title?:string, on?:()=>void, key?:string}[]} */
    const list = [];
    if (gas > 0) list.push({ text: `Vapour ${gas * SIM.ML_PER_PARTICLE} ml${sim.cauldron.lidClosed ? '' : ' (escaping!)'}` });
    if (this.autoBrewer) list.push({ text: `Homunculus: ${this.autoBrewer.status}` });
    else if (!this.bottling) {
      const a = this.brewAdvice()[0];
      if (a) list.push({ text: ADVICE_SHORT[a.key] || 'Advice', act: 'advice-chip', cls: 'advice', title: a.text, key: a.key, on: () => toast('At the cauldron', a.text, 'bulb', 5000) });
    }
    if (this.receiver && this.receiver.count) list.push({ text: `Receiver ${this.receiver.count * SIM.ML_PER_PARTICLE} ml`, act: 'receiver', title: 'The alembic’s receiver flask', on: () => panels.openReceiver(this) });
    if (this.app.settings.showFps) list.push({ text: `${this.fpsAcc.fps} fps · ${sim.stats.stepMs.toFixed(1)} ms/step · ${p.count} p` });
    // rebuilt only when something changed, so a chip can be tapped reliably
    const sig = list.map((x) => x.text + '|' + (x.title || '')).join('/');
    if (sig === this._chipSig) return;
    this._chipSig = sig;
    const c = clear(this.chipList);
    for (const x of list) {
      c.append(x.act ? h('button', { class: 'chip chip-btn' + (x.cls ? ' ' + x.cls : ''), 'data-act': x.act, ...(x.key ? { 'data-advice': x.key } : {}), title: x.title || '', onclick: x.on }, x.text) : h('div', { class: 'chip', text: x.text }));
    }
  }

  // ------------------------------------------------------------------ frame loop
  frame(t) {
    const tw0 = performance.now();
    const pf = this.perf;
    pf.intervals[pf.n % 600] = t - this.lastT;
    let dt = (t - this.lastT) / 1000;
    // battery saver: draw at 30 fps (physics still integrates real time)
    const battery = this.effectiveQuality() === 'low' && this.app.settings.quality === 'low';
    if (battery && dt < 1 / 34) return;
    this.lastT = t;
    if (dt > 0.1) dt = 0.1;
    this.time += dt;
    const fa = this.fpsAcc;
    fa.t += dt; fa.n++;
    if (fa.t >= 1) { fa.fps = Math.round(fa.n / fa.t); fa.t = 0; fa.n = 0; }
    const modalOpen = !!document.querySelector('.overlay');
    const sim = this.sim;
    const brewing = this.view === 'brew';
    // the hutch lives in real time, whichever room is open
    this._colonyAcc = (this._colonyAcc || 0) + dt;
    if (this._colonyAcc >= 0.5) { this.tickColony(this._colonyAcc); this._colonyAcc = 0; }
    // physics (keeps running in every room so brews keep evolving)
    if (this.autoBrewer) {
      // the homunculus decides once per physics step
      const n = Math.min(12, Math.round((dt * this.speed) / SIM.DT));
      for (let k = 0; k < n; k++) {
        this.autoBrewer.tick();
        sim.step();
        if (this.autoBrewer.done) { toast('Homunculus finished', this.autoBrewer.failed ? 'It stopped — check your stock.' : 'The brew is ready to test and bottle.', 'homunculus'); this.autoBrewer = null; this.setFurnace(0); break; }
      }
      this.accountPours();
    } else {
      // physics gets what is left of a ~30 fps frame after rendering (8–22 ms):
      // fast devices run in real time at 60 fps, slow ones keep a playable
      // frame rate and let the brew run in slow motion rather than stall
      const cap = this.speed > 1 ? 10 : 6;
      const budget = Math.max(8, Math.min(22, 30 - (brewing ? this.perf.renderMs : 2)));
      const maxSteps = Math.max(1, Math.min(cap, Math.floor(budget / Math.max(0.3, sim.stats.stepMs || 1))));
      sim.advance(dt, this.speed, maxSteps);
      this.accountPours();
    }
    const tw1 = performance.now();
    if (this.alembicOpen) this.collectVapour();
    this.stepBottling(dt);
    this.stepVial(dt);
    this.trackBrew(dt);
    // events
    if (sim.events.length) {
      const evs = sim.events.splice(0);
      for (const e of evs) this.handleSimEvent(e);
    }
    // periodic UI
    this.hudTimer += dt;
    this.assayTimer += dt;
    this.saveTimer += dt;
    this.layerTimer += dt;
    if (this.hudTimer > 0.25) { this.hudTimer = 0; if (this.autoStir) this.aimStirrer(); this.refreshHud(); this.updateShelf(); if (this.probe) this.updateProbe(); this.updateBrewPanel(); this.checkAway(); }
    if (this.assayTimer > 0.4 && !this.bottling) { this.assayTimer = 0; this.updateAssay(); }
    if (this.layerTimer > 2) { this.layerTimer = 0; this.detectLayers(); }
    if (this.saveTimer > 15) { this.saveTimer = 0; this.save(); }
    if (this.tutorial) this.tutorial.update();
    // audio levels
    const tool = sim.tool;
    const stirTarget = tool.active && tool.type !== 'skimmer' ? Math.min(1, tool.speed / 2.5) : 0;
    this.stirLevel += (stirTarget - this.stirLevel) * Math.min(1, dt * 10);
    let boiling = 0;
    if (sim.steps % 30 === 0) { for (let i = 0; i < sim.p.count; i++) if (sim.p.phase[i] === PHASE.GAS && sim.nCond[i] >= 3) boiling++; this.lastBoil = boiling; }
    const audible = brewing ? 1 : 0.35;
    audio.update({ fire: Math.max(0, sim.furnace.setting) * audible, cold: Math.max(0, -sim.furnace.setting) * audible, stir: this.stirLevel, pour: sim.emitter.pouring ? 1 : 0, boil: Math.min(1, this.lastBoil / 30) * audible }, dt);
    // render only the room that is visible
    const tw2 = performance.now();
    if (brewing) {
      const em = sim.emitter;
      this.renderer.render({
        sim,
        time: this.time,
        dt: modalOpen ? dt * 0.5 : dt,
        pour: { active: em.pouring, x: em.active ? em.active.x : this.pourX, def: em.active ? em.active.def : null },
        tool: { type: tool.type, x: tool.x, y: tool.y, active: tool.active },
        toolHover: this.hover && (this.tool === 'spoon' || this.tool === 'pestle' || this.tool === 'skimmer'),
        bottling: this.bottling ? { progress: this.bottling.progress, color: this.bottling.color } : null,
        showBottle: true,
        probe: this.tool === 'probe' ? this.probe : null,
        thermal: this.thermal,
        alembic: this.sandbox,
        receiver: this.receiver,
        stirrer: this.state.has('stirrer') && this.autoStir,
        aura: this.sandbox || this.state.has('arcanometer'),
      });
    } else if (this.views[this.view] && this.views[this.view].frame) {
      this.views[this.view].frame(dt);
    }
    const tw3 = performance.now();
    pf.work[pf.n % 600] = tw3 - tw0;
    if (brewing) this.adaptQuality(dt, tw3 - tw0);
    pf.n++;
    pf.physMs = pf.physMs * 0.95 + (tw1 - tw0) * 0.05;
    if (brewing) pf.renderMs = pf.renderMs * 0.95 + (tw3 - tw2) * 0.05;
  }

  /**
   * Let the rabbits live `dt` seconds; after a break (the game was closed or
   * hidden) catch up on up to ten minutes of what happened meanwhile.
   * @param {number} dt
   */
  tickColony(dt) {
    const c = this.state.colony;
    const now = Date.now();
    const away = c.clock > 0 ? Math.min(600, Math.max(0, (now - c.clock) / 1000 - dt)) : 0;
    c.clock = now;
    /** @type {any[]} */
    const events = [];
    let left = away > 2 ? away + dt : dt;
    while (left > 1e-6) {
      const step = Math.min(1, left);
      left -= step;
      events.push(...this.state.tickColony(step).events);
    }
    if (events.length) {
      this.views.trials.colonyEvents(events);
      this.updateBadges();
      if (this.view !== 'trials') {
        const att = events.filter((e) => e.type === 'attack');
        if (att.length && this.time - (this._feralWarned || -99) > 20) { this._feralWarned = this.time; toast('Trouble in the hutch', `${att[0].fromName} has turned aggressive and is attacking ${att[0].toName}!`, 'claw', 4500); }
      }
    }
  }

  /** The sealed vial drifts toward room temperature; re-measure it now and then. @param {number} dt */
  stepVial(dt) {
    const st = this.state;
    // shelved bottles cool too; they are re-measured when the shelves are shown
    for (const b of st.bottles) this._shelfDrift = (this._shelfDrift || 0) + relaxVial(b, dt * this.speed);
    const v = st.vial;
    if (!v) return;
    this._vialDrift = (this._vialDrift || 0) + relaxVial(v, dt * this.speed);
    this._vialT = (this._vialT || 0) + dt;
    if (this._vialT > 2 && this._vialDrift > 0.5) {
      this._vialT = 0;
      this._vialDrift = 0;
      updateVial(v, st.lookup, st.world.laws);
      if (this.view === 'counter') this.views.counter.refresh();
    }
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
    if (!this.sandbox) this.state.shareEvidence(batchId);
    this.autoLabel();
  }

  /**
   * A bottle whose batch has been tested labels itself: the tested readings,
   * the guild's theory (marked as estimates) for the rest. Later trials of
   * the batch keep updating it (applyTrials); the player can still revise it.
   * @param {any} [only] just this vial
   */
  autoLabel(only) {
    const st = this.state;
    for (const v of only ? [only] : [st.vial, ...st.bottles]) {
      if (!v || v.label || !v.cert || !Object.keys(v.cert).length) continue;
      if (!v.m) updateVial(v, st.lookup, st.world.laws);
      v.label = draftLabel(v, this.vialTheory(v), st.day);
      v.label.auto = true;
    }
  }

  /** Re-measure the shelved bottles if they have cooled noticeably since last shown. */
  freshBottles() {
    if ((this._shelfDrift || 0) < 0.5) return;
    this._shelfDrift = 0;
    for (const b of this.state.bottles) updateVial(b, this.state.lookup, this.state.world.laws);
  }

  /** Warn when the brew boils or burns while the player is in another room. */
  checkAway() {
    if (this.view === 'brew') return;
    const sim = this.sim;
    if (this.time - this.awayWarned < 20) return;
    let gas = 0, burn = 0;
    for (let i = 0; i < sim.p.count; i++) { if (sim.p.phase[i] === PHASE.GAS) gas++; if (sim.p.burn[i] > 0.3) burn++; }
    if (burn > 2 || (gas > 6 && sim.furnace.setting > 0.05)) {
      this.awayWarned = this.time;
      toast(burn > 2 ? 'Something is burning!' : 'The cauldron is boiling', 'The fire is still lit while you are away.', 'flame', 4000);
    }
  }

  /** Frame-time statistics over the last (up to) 600 frames. */
  perfReport() {
    const pf = this.perf;
    const m = Math.min(pf.n, 600);
    const iv = Array.from(pf.intervals.slice(0, m)).sort((a, b) => a - b);
    const wk = Array.from(pf.work.slice(0, m)).sort((a, b) => a - b);
    const q = (a, f) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : 0);
    const mean = iv.reduce((a, b) => a + b, 0) / Math.max(1, m);
    return {
      frames: m,
      fps: mean > 0 ? 1000 / mean : 0,
      intervalP50: q(iv, 0.5), intervalP95: q(iv, 0.95), intervalP99: q(iv, 0.99),
      workP50: q(wk, 0.5), workP95: q(wk, 0.95),
      physMs: pf.physMs, renderMs: pf.renderMs, stepMs: this.sim.stats.stepMs,
      particles: this.sim.p.count,
    };
  }

  handleSimEvent(e) {
    if (this.view === 'brew') this.renderer.onEvent(e);
    switch (e.type) {
      case 'reaction': audio.play('reaction'); break;
      case 'crush': if (Math.random() < 0.5) audio.play('crush'); break;
      case 'ignite': audio.play('ignite'); break;
      case 'awaken': audio.play('awaken'); break;
      case 'crack': audio.play('crack'); break;
      case 'spark': if (Math.random() < 0.3) audio.play('crush'); break;
      case 'phase': if (e.to === 'solid' && Math.random() < 0.15) audio.play('freeze'); break;
      case 'full': toast('The cauldron is full', 'Bottle or empty it before adding more.', 'cauldron'); break;
    }
    if (this.sandbox) return;
    const r = processEvent(this.state, e);
    for (const entry of r.entries) {
      if (entry.kind === 'ingredient') continue;
      toast(entry.kind === 'reaction' ? 'New reaction discovered!' : entry.kind === 'arcane' ? 'Arcane awakening!' : 'Discovery', entry.title, entry.kind === 'reaction' ? 'eye' : entry.kind === 'arcane' ? 'awaken' : 'scroll', 3800);
      audio.play('discover');
    }
    for (const a of r.achievements) this.announce(a);
  }

  /** Notice immiscible liquids sitting in separate layers (journal). */
  detectLayers() {
    if (this.sandbox) return;
    const sim = this.sim, p = sim.p, sp = sim.species;
    const counts = new Map();
    for (let i = 0; i < p.count; i++) {
      if (p.phase[i] !== PHASE.LIQUID) continue;
      let best = -1, bf = 0.8;
      for (let s = 0; s < sp.count; s++) if (p.comp[i * MAX_SPECIES + s] > bf) { bf = p.comp[i * MAX_SPECIES + s]; best = s; }
      if (best >= 0) counts.set(best, (counts.get(best) || 0) + 1);
    }
    const slots = [...counts.entries()].filter(([, c]) => c >= 15).map(([s]) => s);
    for (let a = 0; a < slots.length; a++) for (let b = a + 1; b < slots.length; b++) {
      const A = slots[a], B = slots[b];
      if (compatFactor(sp.compatA[A], sp.compatB[A], sp.compatA[B], sp.compatB[B]) < 0.2) {
        const ids = [sp.defs[A].id, sp.defs[B].id].sort();
        this.handleSimEvent({ type: 'layers', a: ids[0], b: ids[1] });
      }
    }
  }

  /** The Free Experiment's alembic: draw vapour from under the closed lid into the receiver flask. */
  collectVapour() {
    const sim = this.sim, p = sim.p, c = sim.cauldron;
    if (!c.lidClosed || !this.sandbox) return;
    this.receiver = this.receiver || { count: 0, comp: {}, color: [0.7, 0.8, 0.9] };
    const rec = this.receiver;
    let took = 0;
    for (let i = p.count - 1; i >= 0 && took < 3; i--) {
      if (p.phase[i] !== PHASE.GAS || p.y[i] > 0.25 || p.x[i] < c.mouth * 0.3) continue;
      for (let s = 0; s < sim.species.count; s++) {
        const f = p.comp[i * MAX_SPECIES + s];
        if (f > 0 && sim.species.defs[s]) rec.comp[sim.species.defs[s].id] = (rec.comp[sim.species.defs[s].id] || 0) + f;
      }
      rec.color = [sim.colR[i], sim.colG[i], sim.colB[i]];
      rec.count++;
      sim.removeParticle(i);
      took++;
    }
  }

  /** Pour the receiver's distillate back into the cauldron (as liquid). */
  pourReceiver() {
    const rec = this.receiver;
    if (!rec || !rec.count) return;
    const sim = this.sim;
    const total = Object.values(rec.comp).reduce((a, b) => a + b, 0) || 1;
    const ids = Object.keys(rec.comp);
    let made = 0;
    for (let k = 0; k < rec.count; k++) {
      const x = (Math.random() - 0.5) * sim.cauldron.mouth;
      const i = sim.addParticle(this.state.lookup(ids[0]), x, 0.2 + Math.random() * 0.2, PHASE.LIQUID, 20);
      if (i < 0) break;
      sim.p.comp.fill(0, i * MAX_SPECIES, (i + 1) * MAX_SPECIES);
      for (const id of ids) {
        const s = sim.slotFor(this.state.lookup(id));
        if (s >= 0) sim.p.comp[i * MAX_SPECIES + s] += rec.comp[id] / total;
      }
      sim.p.dirty[i] = 1;
      made++;
    }
    this.receiver = null;
    this.state.touchBatch();
    toast('Distillate poured back', `${made * SIM.ML_PER_PARTICLE} ml returned to the cauldron.`, 'alembic');
  }

  /**
   * Run a saved recipe with the homunculus: it follows the recorded steps
   * one by one in the real cauldron (pours, grinding, stirring, each heat
   * and chill held as long as it was, each boil-down to the share that boiled
   * away, the lid), paying for every ingredient. An approximate recipe is
   * replayed as well as it can be, and says so; the skimming and distilling
   * of old recipes it skips.
   */
  startHomunculus(recipe) {
    const steps = recipe.steps && recipe.steps.length ? recipe.steps : null;
    const plan = steps ? { ingredients: [], heatTo: recipe.maxTemp, coolTo: recipe.minTemp, serveTemp: recipe.serveTemp, steps } : {
      ingredients: recipe.ingredients.map((i) => ({ id: i.id, n: Math.round(i.ml / SIM.ML_PER_PARTICLE), ground: i.ground })),
      heatTo: recipe.maxTemp, coolTo: recipe.minTemp, serveTemp: recipe.serveTemp, knead: recipe.stirSeconds > 12, crush: recipe.crushed || recipe.ingredients.some((i) => i.ground), hold: 12,
    };
    // check the whole stock first, so it never stops half-way through
    /** @type {Map<string, number>} */
    const need = new Map();
    for (const s of steps || []) if (s.op === 'pour') need.set(s.id, (need.get(s.id) || 0) + s.ml);
    if (!steps) for (const i of recipe.ingredients) need.set(i.id, (need.get(i.id) || 0) + i.ml);
    const short = this.sandbox ? [] : [...need].filter(([id, ml]) => this.state.stock(id) + 1e-6 < ml);
    if (short.length) { toast('Not enough on the shelf', `The homunculus needs ${short.map(([id, ml]) => `${Math.round(ml - this.state.stock(id))} ml more ${this.state.lookup(id).name}`).join(', ')}.`, 'homunculus', 5000); return false; }
    this.autoBrewer = new AutoBrewer(this.sim, /** @type {any} */ (plan), this.state.lookup, {
      onPour: (id, n) => {
        const ml = n * SIM.ML_PER_PARTICLE;
        if (!this.sandbox && this.state.stock(id) < ml) return false;
        return true;
      },
    });
    recipe.brews = (recipe.brews | 0) + 1;
    const lim = procedureLimits(steps || []);
    const limits = lim.length ? ` It cannot do the ${lim.join(' or ')} and skips ${lim.length > 1 ? 'those steps' : 'that step'}.` : '';
    toast('The homunculus gets to work', `${recipe.name}${recipe.approx ? ` — an approximate recipe (${recipe.approxWhy || 'saved before procedures were kept'}): the result may differ, so test it.` : ''}${limits}`, 'homunculus', 5200);
    return true;
  }

  save() {
    if (this.artPreview) return;
    if (this.saveBlocked) return;
    this.views?.wilds.checkpointWildlife();
    if (this.sandbox) {
      saveJSON(KEYS.sandbox, { seed: this.state.seed, cauldron: snapshotSim(this.sim, this.cap.size), trials: this.state.trials });
      return;
    }
    this.state.cauldron = snapshotSim(this.sim, this.cap.size);
    saveGame(this.state);
  }
}

/** The Free Experiment's furnace: hotter than any campaign fire, to show what heat does. */
const SANDBOX_FIRE = { maxFlame: 800, heatPower: 8 };

/** Short labels of the brew advice (lab.brewAdvice) for the chip row. */
const ADVICE_SHORT = { whole: 'Whole herbs: crush', window: 'Outside the steep', warm: 'Not steeped yet', steam: 'Steam escaping', stir: 'Uneven: stir' };

/** What each promotion brings (the difficulty curve, in the guild's words). */
const RANK_NEWS = [
  '',
  'Journeyman: cooling and insight orders arrive, the herbalist sells the common herbs, and the guild offers the Frost Rune (deep cold), the Clockwork Stirrer and the Arcanometer.',
  'Adept: strong orders need awakened magic, or a brew boiled down with the lid open, and customers combine two effects. The Moonfen opens, its magic woken by cold; larger cauldrons and the Guild Charter are for sale.',
  'Expert: customers combine several effects and techniques in one order. The Ember Crags open; the Glacial Sigil reaches the deepest cold, and the Brass Homunculus brews your recipes.',
  'Master: the grandest commissions — several effects, awakened, in exact measure. The Queen’s herald may call.',
  'Grand Alchemist: the guild has nothing left to teach you.',
];

/** A requirement's target in a few characters (order strip). @param {any} req */
function shortTarget(req) {
  if (req.key === 'purity') return `<${req.target}`;
  if (req.key === 'temperature') return `${Math.round(req.target)}°`;
  if (req.kind === 'min') return `≥${Math.round(req.target)}`;
  if (req.kind === 'max') return `≤${Math.round(req.target)}`;
  if (EFFECT_BY_KEY[req.key]) return `${Math.max(0, Math.round(req.target - req.tol))}–${Math.round(req.target + req.tol)}`;
  return req.label.split(' ')[0];
}

/** An effect vector with one known value (to score a verified reading). */
function fromValue(key, v) {
  const e = new Array(NE).fill(0);
  e[EFFECT_INDEX[key]] = v;
  return e;
}

/**
 * Short jar labels: the last word of each name ("Water", "Ichor"), or the
 * first word where two reagents would otherwise share a label.
 * @param {string[]} names
 */
function shelfLabels(names) {
  const last = names.map((nm) => nm.split(' ').slice(-1)[0]);
  return names.map((nm, i) => {
    if (last.filter((l) => l === last[i]).length < 2) return last[i];
    const words = nm.split(' ');
    return words.length > 1 ? words[0] : nm;
  });
}

void dominantEffect;
