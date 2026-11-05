import { h, btn, clear, toast, keepScroll } from '../dom.js';
import { ingredientSprite, growthSprite } from '../../rendering/species-sprites.js';
import { sceneCanvas } from '../../rendering/wild-scene.js';
import { gardenStatus, canCultivate, FACILITIES } from '../../game/garden.js';
import { RARITIES } from '../../materials/rarity.js';

export class GardenView {
  constructor(lab) { this.lab = lab; this.selected = 'plot-0'; this.el = h('section', { class: 'view view-garden', 'data-view': 'garden' }); this.elapsed = 0; }
  build() { this.refresh(); }
  act(fn, event) {
    const r = fn();
    if (!r.ok) toast('Garden', r.reason || 'That action is unavailable.', 'leaf');
    else { this.lab.save(); this.lab.buildShelf(); this.lab.refreshHud(true); this.lab.tutorial?.notify(event); }
    this.refresh(); return r;
  }
  refresh() { keepScroll(this.el, () => this.render()); }
  render() {
    const st = this.lab.state, g = st.garden, root = clear(this.el);
    const bg = sceneCanvas('garden', st.seed), canvas = h('canvas', { class: 'garden-scene', width: 384, height: 216, 'aria-label': 'Personal garden beside the shop' });
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(bg, 0, 0);
    for (const [i, plot] of g.plots.slice(0, 5).entries()) {
      const crop = gardenStatus(g, plot, st.lookup), x = 55 + i * 65;
      ctx.fillStyle = crop.moisture > 0.5 ? '#30291f' : '#68482f'; ctx.fillRect(x + 4, 159, 41, 6);
      if (crop.material) ctx.drawImage(growthSprite(crop.material, crop.stage), x, 115, 50, 50);
    }
    root.append(canvas);
    root.append(h('div', { class: 'garden-heading row wrap' }, h('h2', { text: 'Personal garden' }), h('span', { class: 'spacer' }),
      btn('Water all', () => this.act(() => { let watered = 0; for (const p of g.plots) if (st.waterPlot(p.id).ok) watered++; return { ok: watered > 0, reason: 'No planted beds need water.' }; }, 'garden-water'), { icon: 'drop', act: 'garden-water-all', disabled: !g.unlocked })));
    if (!g.unlocked) { root.append(h('p', { class: 'card parch', text: 'Gather your first ingredient in Whisperwood to receive a propagation material and open these three beds.' })); return; }
    const grid = h('div', { class: 'garden-plots' });
    for (const p of g.plots) {
      const s = gardenStatus(g, p, st.lookup), selected = p.id === this.selected;
      const card = h('button', { class: 'garden-plot parch' + (selected ? ' selected' : ''), 'data-act': 'select-' + p.id, 'aria-pressed': selected, 'data-stage': s.stage, 'data-moisture': s.moisture > 0.5 ? 'wet' : 'dry', onclick: () => { this.selected = p.id; this.refresh(); } },
        h('b', { text: `${Number(p.id.split('-')[1]) + 1} · ${FACILITIES[p.facility].label}` }),
        s.material ? growthSprite(s.material, s.stage) : h('span', { class: 'plot-empty', text: 'Empty bed' }),
        h('span', { text: s.material ? `${s.material.name} · ${s.stage}` : 'Choose a propagation material' }),
        h('progress', { max: 1, value: s.growth, 'aria-label': 'Growth' }),
        h('span', { class: 'small', text: s.material ? `${Math.round(s.growth * 100)}% grown · ${Math.round(s.moisture * 100)}% moisture` : 'Ready to plant' }));
      grid.append(card);
    }
    root.append(grid);
    const p = g.plots.find((p) => p.id === this.selected) || g.plots[0], s = gardenStatus(g, p, st.lookup);
    const panel = h('div', { class: 'garden-controls card parch' });
    if (p.crop) panel.append(h('b', { text: s.material.name }), h('p', { class: 'small', text: `${RARITIES[s.material.rarity].label}${s.material.arcaneVariant ? ' · Arcane' : ''} · harvest consumes this crop` }),
      h('div', { class: 'row wrap' }, btn('Water', () => this.act(() => st.waterPlot(p.id), 'garden-water'), { icon: 'drop', act: 'garden-water', disabled: s.mature || s.material.cultivation === 'mineral' }),
        btn('Harvest 50 ml', () => this.act(() => st.harvestGarden(p.id), 'garden-harvest'), { cls: 'gold', icon: 'leaf', act: 'garden-harvest', disabled: !s.mature })));
    else {
      const seeds = Object.entries(g.seeds).filter(([id, n]) => n > 0 && st.lookup(id));
      const select = h('select', { 'aria-label': 'Propagation material', 'data-act': 'garden-seed' }, ...seeds.map(([id, n]) => {
        const m = st.lookup(id); return h('option', { value: id, disabled: !canCultivate(p, m), text: `${m.name} · ${RARITIES[m.rarity].label} ×${n}${canCultivate(p, m) ? '' : ' · specialist bed needed'}` });
      }));
      if (seeds.length) {
        const preview = h('div', { class: 'garden-seed-preview' });
        const showSeed = () => { clear(preview); const m = st.lookup(select.value); if (m) preview.append(growthSprite(m, 'seed')); };
        select.addEventListener('change', showSeed); showSeed();
        panel.append(preview, select, btn('Plant', () => this.act(() => st.plantSeed(p.id, select.value), 'garden-plant'), { cls: 'gold', act: 'garden-plant', icon: 'leaf' }));
      }
      else panel.append(h('p', { text: 'No seeds yet. Wild harvesting is the main source of propagation materials.' }));
      const facility = h('select', { 'aria-label': 'Growing structure' }, ...Object.entries(FACILITIES).filter(([id]) => id !== p.facility).map(([id, f]) => h('option', { value: id, text: `${f.label} · ${f.price} coins · rank ${f.rank}` })));
      panel.append(h('div', { class: 'row wrap' }, facility, btn('Install', () => this.act(() => st.upgradeGarden(p.id, facility.value), 'garden-upgrade'), { act: 'garden-upgrade' })));
    }
    panel.append(btn(`Add plot · ${60 + g.plots.length * 10} coins`, () => this.act(() => st.expandGarden(), 'garden-expand'), { act: 'garden-expand', icon: 'plus' }));
    root.append(panel, h('p', { class: 'small muted', text: 'Soil grows faster when watered. Offline growth is bounded to eight hours. Seeds preserve their exact species and Arcane identity.' }));
  }
  frame(dt) { this.elapsed += dt; if (this.elapsed > 2) { this.elapsed = 0; if (!this.el.contains(document.activeElement) || document.activeElement?.tagName !== 'SELECT') this.refresh(); } }
}
