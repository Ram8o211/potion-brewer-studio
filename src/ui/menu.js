// Main menu with a live, bubbling cauldron behind it (the real simulation).

import { h, btn } from './dom.js';
import { Renderer } from '../rendering/renderer.js';
import { Simulation } from '../simulation/world.js';
import { REF, refLookup } from '../materials/reference.js';
import { hasSave, loadGame } from '../game/persistence.js';
import { audio } from '../audio/audio.js';

export class MenuScreen {
  /** @param {import('./app.js').App} app */
  constructor(app) {
    this.app = app;
    this.running = false;
  }

  mount(root) {
    const app = this.app;
    this.canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { class: 'menu-bg', 'aria-hidden': 'true' }));
    const save = hasSave() ? loadGame().state : null;
    const panel = h('div', { class: 'menu-panel frame' },
      h('h1', { text: 'The Alchemist’s Shop' }),
      h('div', { class: 'subtitle', text: 'Brew. Experiment. Prosper.' }),
      save ? btn(`Continue — Day ${save.day}, ${save.rankName}`, () => app.continueGame(), { cls: 'primary', icon: 'door', act: 'continue' }) : null,
      btn('New Shop', () => app.newGameDialog(), { cls: save ? '' : 'primary', icon: 'plus', act: 'new-game' }),
      btn('Procedural Art Studio', () => app.showStudio(), { icon: 'book', act: 'art-studio' }),
      btn('Free Experiment', () => app.startSandbox(), { icon: 'flask', act: 'sandbox' }),
      h('div', { class: 'row' }, btn('How to play', () => app.openHelp(), { icon: 'help', act: 'help' }), btn('Settings', () => app.openSettings(), { icon: 'gear', act: 'menu-settings' })),
      h('div', { class: 'footer', text: 'Works offline · progress saves on this device' }),
    );
    this.el = h('div', { class: 'screen menu' }, this.canvas, panel);
    root.appendChild(this.el);
    // a small demo brew
    this.sim = new Simulation({ size: 'small', lookup: refLookup });
    this.sim.cauldron.lidClosed = false;
    this.sim.furnace.setting = 0.55;
    this.renderer = new Renderer(this.canvas);
    this.renderer.quality = 'medium';
    this.resize = () => {
      const r = this.el.getBoundingClientRect();
      const jars = Object.values(REF).slice(0, 12).map((m) => ({ color: m.look || m.color, form: m.form }));
      this.renderer.resize(Math.floor(r.width), Math.floor(r.height), this.sim.cauldron, jars, 'medium');
    };
    window.addEventListener('resize', this.resize);
    this.resize();
    this.t = 0;
    this.script = 0;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.t += dt;
      this.demo();
      this.sim.advance(dt, 1, 3);
      this.sim.events.length = 0;
      this.renderer.render({ sim: this.sim, time: this.t, dt, pour: { active: this.sim.emitter.pouring, x: this.sim.emitter.active ? this.sim.emitter.active.x : 0, def: this.sim.emitter.active ? this.sim.emitter.active.def : null }, tool: { type: 'spoon', x: this.sim.tool.x, y: this.sim.tool.y, active: this.sim.tool.active } });
    };
    this.raf = requestAnimationFrame(loop);
    audio.music(app.settings.musicOn && app.settings.music > 0);
  }

  /** Scripted demo: pour colourful liquids and stir now and then. */
  demo() {
    const sim = this.sim;
    /** @type {[number, () => void][]} */
    const steps = [
      [0.3, () => sim.emitter.start(REF.water, { x: -0.4, amount: 120 })],
      [2.5, () => sim.emitter.start(REF.red, { x: 0.6, amount: 30 })],
      [4.5, () => sim.emitter.start(REF.blue, { x: -0.7, amount: 30 })],
      [7, () => { sim.tool.auto = true; sim.tool.autoCenterY = sim.cauldron.depth - 0.5; sim.tool.autoRadius = 0.7; }],
      [12, () => { sim.tool.auto = false; sim.tool.setTarget(0, 2, false); }],
      [13, () => sim.emitter.start(REF.sand, { x: 0.8, amount: 40 })],
      [16, () => sim.emitter.start(REF.oil, { x: 0, amount: 40 })],
    ];
    while (this.script < steps.length && this.t >= steps[this.script][0]) steps[this.script++][1]();
    if (this.t > 24 && sim.p.count > 0) {
      // drain slowly and loop
      for (let k = 0; k < 3 && sim.p.count > 0; k++) sim.removeParticle(sim.p.count - 1);
      if (sim.p.count === 0) { this.t = 0; this.script = 0; sim.clear(); }
    }
  }

  unmount() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.el.remove();
  }
}
