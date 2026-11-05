// The guided tour: the first brew, step by step, and a visit to every room
// and control of the shop. Each step outlines the control it talks about;
// an action step waits for the player to really do it (in the simulation),
// an info step waits for "Next". The tour docks in its own strip between the
// top bar and the rooms (lab.tutorSlot), so it never covers a control.

import { h, btn, placeToasts } from './dom.js';
import { PHASE } from '../simulation/constants.js';
import { TUTORIAL_HERBS } from '../game/commissions.js';
import { shortName } from '../game/customers.js';

export class Tutorial {
  /** @param {import('./lab.js').LabScreen} lab */
  constructor(lab) {
    this.lab = lab;
    this.active = false;
    this.index = 0;
    this.box = null;
    this.target = null;
    this.flags = {};
    this.replay = !!lab.state.tutorial.replay;
  }

  /**
   * The steps. `text` says what to look at or do; `target` is the control to
   * outline; `done` (action steps) advances once the player has done it;
   * `button` (info steps) labels the button that moves on.
   * @returns {{text:string, target?:()=>any, done?:()=>boolean, button?:string}[]}
   */
  get steps() {
    const lab = this.lab;
    const st = lab.state;
    const R = st.world.roles;
    const water = st.lookup(R.water);
    const H = TUTORIAL_HERBS, leaf = st.lookup(H.healer), sun = st.lookup(H.warmer);
    /** ml of an ingredient poured into this batch */
    const poured = (id) => st.brewLog.reduce((a, e) => a + (e.type === 'pour' && e.id === id ? e.ml : 0), 0);
    const brewT = () => {
      const p = lab.sim.p;
      let T = 0, n = 0;
      for (let i = 0; i < p.count; i++) if (p.phase[i] !== PHASE.GAS) { T += p.temp[i]; n++; }
      return n ? T / n : 20;
    };
    /** whole herbs and stones still in the pot */
    const wholeSolids = () => {
      const p = lab.sim.p;
      let n = 0;
      for (let i = 0; i < p.count; i++) if (p.phase[i] === PHASE.SOLID) n++;
      return n;
    };
    const tab = (id) => () => lab.tabEls[id] && lab.tabEls[id].b;
    const q = (sel) => () => /** @type {HTMLElement|null} */ (lab.el.querySelector(sel));
    const inView = (id) => () => lab.view === id;
    const rabbitTested = () => st.trials.records.some((r) => r.subjectId === 'rabbit' && r.batchId === st.batch.id);
    const who = st.current && st.current.customer ? shortName(st.current.customer.name) : 'the customer';
    const arcaneId = H.healer + '@arcane';
    const hasFox = () => st.colony.rabbits.some((r) => r.look?.kind === 'fox' && r.alive !== false);
    const steps = [
      { text: 'Welcome to Potion Brewer Studio. Explore, cultivate, experiment and run your own shop. This tour is skippable and can be replayed from the menu.', button: 'Let’s begin' },
      { text: 'The rooms share one world: Counter, Brew, Wilds, Garden, Trials and Book. Your first customer waits patiently during this tour.', target: () => lab.tabbar, button: 'Next' },
      { text: 'Start in Whisperwood. Open the Wilds.', target: tab('wilds'), done: inView('wilds') },
      { text: 'Gather Silverleaf: swipe a mature plant, then tap what falls, or use its Gather control. Your first harvest guarantees a garden seed.', target: q('.view-wilds .deposits'), done: () => st.garden.unlocked },
      { text: 'The fox is Whisperwood’s native animal. Use “Welcome fox” for this first encounter; it goes to its own woodland pen.', target: q('[data-act=tutorial-fox]'), done: hasFox },
      { text: 'Open your personal Garden. Wild plants do not grow back: seeds let you cultivate selected discoveries at home.', target: tab('garden'), done: inView('garden') },
      { text: 'Select an empty soil bed, choose Silverleaf and Plant. A seed always preserves its species, rarity and Arcane status.', target: q('[data-act=garden-plant]'), done: () => st.garden.plots.some((p) => p.crop) },
      { text: 'Water the crop. Moist soil speeds growth. This demonstration crop matures quickly; you never have to wait through a normal growing cycle in the tour.', target: q('[data-act=garden-water]'), done: () => st.garden.plots.some((p) => p.crop && p.crop.w > 0.5) },
      { text: 'Your crop will continue growing while you brew. Higher rarities take longer and fungi, minerals, exotic and Arcane species need suitable beds.', target: q('.garden-plots'), button: 'Next' },
      { text: 'Open Brew for an Arcane practice batch. Only ingredients marked Arcane can awaken; ordinary ingredients keep their normal effects at every temperature.', target: tab('brew'), done: inView('brew') },
      { text: 'Select water and add 100 ml. The dose buttons are below the shelf; dragging a jar or holding inside the cauldron also pours.', target: () => lab.doseEl, done: () => poured(R.water) >= 95 },
      { text: 'Select Arcane Silverleaf and pour 25 ml. This introductory portion is guaranteed; Arcane is a variant, not a sixth rarity.', target: () => lab.jarEls[arcaneId]?.el, done: () => poured(arcaneId) >= 20 && !lab.sim.emitter.pouring },
      { text: 'Crush the leaves, stir and heat to 60 °C. Only the effects carried by the Arcane material amplify. Ordinary matter in a mixture does not gain eligibility.', target: () => lab.controls, done: () => { const awake = Object.keys(lab.sim.inventory()).some((id) => id.endsWith('~a') && st.lookup(id)?.speciesId === 'silverleaf'); if (awake) { st.tutorial.arcane = true; return true; } return false; } },
      { text: 'Awakening persists after cooling and bottling. Cold Arcane ingredients use negative thresholds; a blend weights only its Arcane ingredients. Empty this practice batch before the customer’s tonic.', target: q('[data-act=empty]'), done: () => lab.sim.p.count === 0 },
      { text: 'Open the Counter and read the first order: healing, a small bottle, and a reasonable limit on unwanted effects.', target: tab('counter'), done: inView('counter') },
      { text: 'Return to Brew. Add 125 ml water, 50 ml Silverleaf and 25 ml Sunthistle. Common herbs have side effects: fire and frost cancel one another.', target: tab('brew'), done: () => lab.view === 'brew' && poured(H.healer) >= 45 && poured(H.warmer) >= 20 && poured(R.water) >= 120 },
      { text: 'Crush the herbs with the pestle, stir and warm the tonic to about 60 °C to extract their magic. Whole solids release almost nothing.', target: () => lab.controls, done: () => brewT() >= 50 && wholeSolids() <= 3 },
      { text: 'Open Trials. Select a rabbit and Give a measured dose from the tap. The existing rabbit colony is your first testing habitat.', target: tab('trials'), done: rabbitTested },
      { text: 'Every effect has a reading and uncertainty. Testing a second rabbit improves confidence. Feed and rest your animals between trials.', target: q('.estimate-card'), button: 'Next' },
      { text: 'Return to Brew and Bottle 100 ml. The bottle and its control remain separate and accessible below the cauldron.', target: () => lab.bottleFab, done: () => !!st.vial || this.flags.bottled },
      { text: `At the Counter, label the vial from your trials and sell it to ${who}. Agree on a price, then keep the recipe in your Book.`, target: q('[data-act=serve]'), done: () => this.flags.sold || st.stats.served > 0 },
      { text: 'Excellent. Traveller Coins regenerate depleted biomes: one coin makes new scenery, specimens and creatures without changing your stored items, seeds or crops. Up to three coins recharge, one every 25 minutes.', target: tab('wilds'), button: 'Next' },
      { text: 'Successful sales and guild rank unlock more Natural biomes, then Exotic worlds. Later customers have visible patience. Special commissions return on saved game days: accept or decline, then store a finished bottle for pickup.', target: tab('counter'), button: 'Next' },
      { text: 'Explore → harvest → cultivate → experiment → test → sell. Your Book keeps ingredients, recipes, trials and discoveries. Revisit the garden to harvest your demonstration crop.', target: tab('book'), button: 'Run my shop!' },
    ];
    // Replays teach the same controls without requiring a second practice
    // batch, granting items or asking the player to empty an existing brew.
    return this.replay ? steps.map(({ done, ...s }) => ({ ...s, button: 'Next' })) : steps;
  }

  start(restart = false) {
    if (restart) {
      this.lab.state.tutorial.done = false;
    }
    this.replay = restart || !!this.lab.state.tutorial.replay;
    this.lab.state.tutorial.replay = this.replay;
    this.active = true;
    this.index = restart ? 0 : Math.max(0, Math.min(this.steps.length - 1, this.lab.state.tutorial.step || 0));
    this.flags = {};
    this.lab.state.tutorial.active = true;
    this.lab.state.tutorial.version = 2;
    this.show();
  }

  stop() {
    this.active = false;
    this.clearUi();
  }

  finish() {
    this.stop();
    this.lab.state.tutorial.active = false;
    this.lab.state.tutorial.done = true;
    this.lab.state.tutorial.replay = false;
    this.replay = false;
    this.lab.save();
  }

  clearUi() {
    if (this.box) this.box.remove();
    this.box = null;
    this.lab.el.classList.remove('touring');
    if (this.target) this.target.classList.remove('highlight');
    this.target = null;
    placeToasts();
  }

  show() {
    this.clearUi();
    const steps = this.steps;
    const s = steps[this.index];
    if (!s) { this.finish(); return; }
    const lab = this.lab;
    const actions = h('div', { class: 'tutor-actions' },
      h('span', { class: 'tutor-step', text: `${this.index + 1}/${steps.length}` }),
      btn('End tour', () => this.finish(), { act: 'tutorial-skip', title: 'End the guided tour (restart it from ☰ Menu)' }),
      s.button
        ? btn(s.button, () => this.advance(), { cls: 'primary', act: 'tutorial-next' })
        : btn('Skip step', () => this.advance(), { act: 'tutorial-skip-step', title: 'Move on without doing this step' }),
    );
    this.box = h('div', { class: 'tutor parch' + (s.button ? '' : ' waiting'), role: 'note' }, h('div', { class: 'tutor-text', text: s.text }), actions);
    lab.tutorSlot.appendChild(this.box);
    lab.el.classList.add('touring');
    const t = s.target ? s.target() : null;
    if (t) { t.classList.add('highlight'); this.target = t; }
    placeToasts();
  }

  advance() {
    this.index++;
    this.lab.state.tutorial.step = this.index;
    this.lab.save();
    this.show();
  }

  /** @param {string} kind @param {any} [data] */
  notify(kind, data) {
    if (!this.active) return;
    if (kind === 'bottle') this.flags.bottled = true;
    if (kind === 'view') {
      // the closing note never blocks a room the player has moved on to
      if (this.index === this.steps.length - 1) { this.finish(); return; }
      this.show();
    }
    if (kind === 'sold') { this.flags.sold = true; }
    void data;
  }

  update() {
    if (!this.active) return;
    const s = this.steps[this.index];
    if (!s) return;
    if (s.done && s.done()) this.advance();
    else if (this.box && Math.random() < 0.05) {
      // targets can be rebuilt (room refreshes): re-attach the highlight
      const t = s.target ? s.target() : null;
      if (t && t !== this.target) { if (this.target) this.target.classList.remove('highlight'); t.classList.add('highlight'); this.target = t; }
    }
  }
}
