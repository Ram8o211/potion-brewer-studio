// Application shell: settings, screen switching (menu ↔ laboratory ↔ free
// experiment), first-gesture audio unlock and error recovery.

import { compileProfile } from '../studio/model.js';
import { StudioScreen } from '../studio/screen.js';
import { getSetting } from '../studio/storage.js';
import { artDirection, setArtDirection } from '../studio/direction.js';
import { h, btn, modal, toast, setOverlayRoot, setToastRoot, confirmDialog, clear } from './dom.js';
import { icon } from './icons.js';
import { audio } from '../audio/audio.js';
import { GameState } from '../game/state.js';
import { sandboxIngredients } from '../materials/generator.js';
import { EQUIPMENT } from '../game/equipment.js';
import { loadGame, saveGame, hasSave, deleteSave, loadJSON, saveJSON, KEYS, storageAvailable } from '../game/persistence.js';
import { LabScreen } from './lab.js';
import { MenuScreen } from './menu.js';
import { openSettings, openHelp } from './panels.js';
import { Rng } from '../core/rng.js';
import { normalizeTrials } from '../game/experiments.js';
import { sandboxWilds } from '../game/gathering.js';
import { BIOMES } from '../game/biomes.js';
import { loadGameIngredients } from '../rendering/ingredient-loader.js';

const DEFAULT_SETTINGS = { master: 0.8, sfx: 0.8, music: 0.35, musicOn: true, muted: false, quality: 'auto', showFps: false, resolution: 3 };
const SEED_WORDS = ['amber', 'ashen', 'brine', 'copper', 'dusk', 'elder', 'fen', 'gloam', 'hollow', 'iron', 'juniper', 'kelp', 'lantern', 'moon', 'nettle', 'oak', 'pewter', 'quill', 'raven', 'sage', 'thorn', 'umber', 'vale', 'willow', 'wyrm', 'yarrow'];

export class App {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.settings = loadJSON(KEYS.settings, { ...DEFAULT_SETTINGS });
    // music is on whenever its volume is above zero (an old "music off" switch becomes volume 0)
    if (this.settings.musicOn === false) this.settings.music = 0;
    this.settings.musicOn = this.settings.music > 0;
    // (the old "smooth pixel art" switch is gone: the wilds are shown at a chosen resolution instead)
    delete this.settings.smoothPixels;
    if (!(this.settings.resolution >= 1 && this.settings.resolution <= 4)) this.settings.resolution = DEFAULT_SETTINGS.resolution;
    this.screen = null;
    setOverlayRoot(root);
    setToastRoot(root);
    this.applySettings();
    const unlock = () => {
      audio.unlock();
      audio.music(this.settings.musicOn && this.settings.music > 0);
    };
    root.addEventListener('pointerdown', unlock, { capture: true });
    root.addEventListener('keydown', unlock, { capture: true });
  }

  applySettings() {
    const s = this.settings;
    audio.setVolumes({ master: s.master, sfx: s.sfx, music: s.music, muted: s.muted });
  }

  saveSettings() {
    saveJSON(KEYS.settings, this.settings);
  }

  _swap(screen) {
    if (this.screen && this.screen.unmount) this.screen.unmount();
    clear(this.root);
    setToastRoot(this.root);
    this.screen = screen;
    screen.mount(this.root);
  }

  async start() {
    try { const saved = await getSetting('active-direction'); if (saved?.version === 1) setArtDirection(saved.direction); } catch { /* The game also works with no editor storage. */ }
    this.showMenu();
    if (!storageAvailable()) toast('Saving unavailable', 'This browser mode blocks local storage, so progress cannot be saved.', 'lock', 6000);
  }

  showMenu() {
    if (this.studioPreview) {
      const { studio, before } = this.studioPreview; this.studioPreview = null;
      setArtDirection(before); this._swap(studio); return;
    }
    this._swap(new MenuScreen(this));
  }

  async continueGame() {
    const { state, error } = loadGame();
    if (state) await this.startGame(state);
    // after the screen swap, which clears the root (and any toast in it)
    if (error) toast('Save problem', error, 'scroll', 6000);
  }

  /** @param {GameState} state */
  async startGame(state) {
    try {
      await loadGameIngredients(state);
      this._swap(new LabScreen(this, state));
    } catch (e) {
      console.error(e);
      this.showMenu();
      toast('Could not start', String(e && e.message), 'close', 6000);
    }
  }

  newGameDialog() {
    const rng = new Rng(Date.now() >>> 0);
    const seedIn = /** @type {HTMLInputElement} */ (h('input', { type: 'text', value: `${rng.pick(SEED_WORDS)}-${rng.pick(SEED_WORDS)}-${rng.int(10, 99)}`, maxlength: '32', 'aria-label': 'World seed' }));
    const tut = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', 'aria-label': 'Guided tour' }));
    tut.checked = true;
    let m;
    const go = async () => {
      if (hasSave()) {
        const ok = await confirmDialog('Start a new shop?', 'Your current saved game will be replaced. Export it first from Settings if you want to keep it.', 'Start anew', 'danger');
        if (!ok) return;
      }
      const seed = seedIn.value.trim() || 'alchemy';
      const st = GameState.create(seed, { tutorial: tut.checked });
      deleteSave();
      saveGame(st);
      m.close();
      await this.startGame(st);
    };
    m = modal({
      title: 'A New Shop',
      body: [
        h('div', { class: 'card parch' },
          h('div', { class: 'small', text: 'The seed generates the world: its ingredients, reactions and customers. The same seed gives the same world.' }),
          h('label', { class: 'field' }, 'World seed', seedIn),
          h('div', { class: 'toggle-row' }, h('span', { text: 'Guided tour of the shop (recommended)' }), tut)),
      ],
      foot: [btn('Open my shop', go, { cls: 'primary', icon: 'door', act: 'start-game' })],
    });
  }

  showStudio() { this._swap(new StudioScreen(this)); }

  previewStudio(studio) {
    this.studioPreview = { studio, before: artDirection() };
    setArtDirection(compileProfile(studio.project)); this.startSandbox(true);
  }

  async startSandbox(preview = false) {
    const saved = preview ? null : loadJSON(KEYS.sandbox, null);
    const existing = loadGame().state;
    const seed = existing ? existing.seed : saved && saved.seed ? saved.seed : 'experiment';
    const st = GameState.create(seed, { tutorial: false });
    for (const id of sandboxIngredients(st.world)) st.inventory[id] = Infinity;
    st.equipment = EQUIPMENT.map((e) => e.id);
    st.reputation = 99999;
    st.unlockedBiomes = BIOMES.map((b) => b.id);
    st.current = null;
    // its wilds stand fully grown and grow back quickly after every harvest
    sandboxWilds(st.gathering, st.deposits);
    if (saved && saved.seed === seed && saved.cauldron) st.cauldron = saved.cauldron;
    // the sandbox keeps its own trial history, separate from the shop's
    if (saved && saved.seed === seed && saved.trials) {
      st.trials = normalizeTrials(saved.trials);
      // the sandbox's hutch keeps its own days; its rabbits' remains are rebuilt
      st.day = Math.max(st.day, st.colony.day || 1);
      st.colony.seed = st.colony.seed || String(seed);
      st.restoreRemains();
      for (const id of sandboxIngredients(st.world)) st.inventory[id] = Infinity;
    }
    try { await loadGameIngredients(st, true); }
    catch (e) { toast('Could not load ingredient artwork', String(e.message), 'close', 6000); return; }
    this._swap(new LabScreen(this, st, { sandbox: true, artPreview: preview }));
    toast('Free Experiment', 'Unlimited reagents, wild ingredients, tools and test subjects. Nothing here affects your shop.', 'flask', 4500);
  }

  openSettings() {
    openSettings(this, null);
  }
  openHelp() {
    openHelp();
  }
}

export { icon };
