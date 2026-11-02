import { reviewProposal } from './proposals.js';
import { DomainWorkspace } from './workspaces.js';
import { h, btn, clear, modal, confirmDialog } from '../ui/dom.js';
import { newProject, newAsset, newComponent, newNode, newLayer, clone, uid, validateProject, parseProject, History, STAGES, compileProfile } from './model.js';
import { componentPixels, generate } from './engine.js';
import { Pixels } from '../visual/pixels.js';
import { colorWord, wordColor, line, region, inPolygon, transformed, validatePNGHeader } from './pixels.js';
import { saveProject, loadProject, listProjects, deleteProject, getSetting, putSetting } from './storage.js';
import { artDirection, setArtDirection, artRevision } from './direction.js';
import { archetypeIdentity } from '../visual/pieces.js';
import { describe } from '../visual/descriptor.js';
import { plantFrame, iconFrame, pieceArt } from '../visual/render.js';
import { WILD_SPECS } from '../materials/wild.js';
import { FAMILIES } from '../visual/families/index.js';

const TOOLS = ['pencil', 'eraser', 'line', 'rectangle', 'ellipse', 'fill', 'eyedropper', 'select', 'lasso', 'contiguous', 'move', 'anchor', 'tip', 'vertex', 'pan'];
function named(title, initial = '') {
  return new Promise((resolve) => {
    const input = h('input', { value: initial, maxlength: 100, 'aria-label': title }); let accepted = false;
    const m = modal({ title, body: [input], foot: [btn('Confirm', () => { if (!input.value.trim()) return; accepted = true; resolve(input.value.trim()); m.close(); }, { cls: 'primary' })], onClose: () => { if (!accepted) resolve(null); } });
    input.focus();
  });
}
function download(name, blob) {
  const url = URL.createObjectURL(blob), a = h('a', { href: url, download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export class StudioScreen {
  constructor(app) {
    this.workspace = 'components'; this.app = app; this.project = newProject(); this.history = new History(); this.assetId = this.project.assets[0].id;
    this.componentId = this.project.assets[0].components[0].id; this.nodeId = this.project.assets[0].nodes[0].id; this.layerId = '';
    this.tool = 'pencil'; this.color = '#76b98a'; this.brush = 1; this.round = false; this.grid = true; this.guides = true;
    this.zoom = 10; this.pan = [0, 0]; this.stage = 2; this.seed = 1; this.tab = 'rules'; this.mode = 'component';
    this.selection = null; this.clipboard = null; this.dirty = false; this.loaded = false; this.mounted = false; this.background = '#17212b'; this.hiddenPanels = []; this.compare = null; this.renderMs = 0;
  }
  get asset() { return this.project.assets.find((a) => a.id === this.assetId) || this.project.assets[0]; }
  get component() { return this.asset.components.find((c) => c.id === this.componentId) || this.asset.components[0]; }
  get layer() { return this.component.layers.find((l) => l.id === this.layerId) || this.component.layers[this.component.layers.length - 1]; }
  get node() { return this.asset.nodes.find((n) => n.id === this.nodeId); }
  async mount(root) {
    this.mounted = true; this.root = root; this.build(root);
    this.keyHandler = (e) => this.key(e); window.addEventListener('keydown', this.keyHandler);
    this.keyUpHandler = (e) => { if (e.code === 'Space') this.space = false; };
    this.blurHandler = () => { this.space = false; };
    window.addEventListener('keyup', this.keyUpHandler); window.addEventListener('blur', this.blurHandler);
    this.unload = (e) => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', this.unload);
    if (!this.loaded) {
      this.loaded = true;
      try {
        const id = await getSetting('last-project'), saved = id && await loadProject(id);
        if (!this.mounted) return;
        if (saved && !this.dirty) this.setProject(saved);
        const panels = await getSetting('hidden-panels');
        if (Array.isArray(panels)) this.hiddenPanels = panels.filter((p) => ['library', 'inspector'].includes(p));
        if (this.mounted) for (const p of this.hiddenPanels) this.el.classList.add('art-hide-' + p);
        const layout = await getSetting('layout');
        if (layout && this.mounted) { for (const [key, value] of Object.entries(layout)) if (['--art-left', '--art-right', '--art-bottom'].includes(key) && /^\d+px$/.test(String(value))) this.el.style.setProperty(key, String(value)); }
      } catch (e) { this.message('Storage unavailable. Export a project file to keep your work. ' + e.message, true); }
    }
    if (this.mounted) this.refresh();
  }
  build(root) {
    this.el = h('section', { class: 'screen art-studio', 'data-screen': 'studio', 'aria-label': 'Procedural Art Studio' });
    const action = (label, fn, act) => btn(label, () => this.run(fn), { act: 'art-' + act });
    this.status = h('span', { class: 'art-status', role: 'status', 'aria-live': 'polite' });
    this.title = h('strong');
    const header = h('header', { class: 'art-header' }, h('div', {}, h('span', { class: 'art-kicker', text: 'POTION BREWER / AUTHORING' }), this.title),
      this.select('Editor workspace', this.workspace, [['components','Components & rules'],['ingredients','Ingredients & growth'],['environments','Environments & terrain'],['creatures','Creatures & animation'],['materials','Materials & phases'],['effects','Magical effects'],['interface','Interface & icons']], (v) => { this.workspace = v; this.domainEditor?.destroy(); this.domainEditor = null; this.refresh(); }),
      action('Projects', () => this.projects(), 'projects'), action('Save Draft', () => this.save(), 'save'),
      action('Export Project', () => this.exportProject(), 'export'), action('Import Project', () => this.projectFile.click(), 'import'),
      action('Preview in Game', () => this.preview(), 'preview'), action('Apply Art Profile', () => this.apply(), 'apply'), action('Revert', () => this.revert(), 'revert'),
      action('Back to Game', () => this.exit(), 'exit'));
    this.library = h('aside', { class: 'art-library art-panel', 'aria-label': 'Asset library' });
    this.inspector = h('aside', { class: 'art-inspector art-panel', 'aria-label': 'Properties' });
    this.bottom = h('section', { class: 'art-bottom art-panel', 'aria-label': 'Procedural workspace' });
    this.canvas = h('canvas', { class: 'art-canvas', 'aria-label': 'Pixel editing canvas', tabindex: 0 });
    this.previewCanvas = h('canvas', { width: 96, height: 96, class: 'art-generated', 'aria-label': 'Generated asset preview', tabindex: 0 });
    this.previewCanvas.addEventListener('pointerdown', (e) => {
      const b = this.previewCanvas.getBoundingClientRect(), x = Math.floor((e.clientX - b.left) * 96 / b.width), y = Math.floor((e.clientY - b.top) * 96 / b.height);
      const hit = this.generated?.owners[y * 96 + x], instance = this.generated?.instances[hit];
      if (instance) {
        this.nodeId = instance.node; this.componentId = instance.component; this.selection = null;
        const n = this.node; this.nodeDrag = { before: clone(this.project), x, y, nx: n.x, ny: n.y, parent: instance.parentMatrix };
        this.previewCanvas.setPointerCapture(e.pointerId); this.refresh();
      }
    });
    this.previewCanvas.addEventListener('pointermove', (e) => {
      const d = this.nodeDrag; if (!d) return; const b = this.previewCanvas.getBoundingClientRect();
      const dx = (e.clientX - b.left) * 96 / b.width - d.x, dy = (e.clientY - b.top) * 96 / b.height - d.y, m = d.parent, det = m[0] * m[3] - m[1] * m[2];
      this.node.x = Math.max(-192, Math.min(192, Math.round(d.nx + (m[3] * dx - m[2] * dy) / det)));
      this.node.y = Math.max(-192, Math.min(192, Math.round(d.ny + (-m[1] * dx + m[0] * dy) / det))); this.draw();
    });
    this.previewCanvas.addEventListener('pointerup', () => { if (!this.nodeDrag) return; const d = this.nodeDrag; this.nodeDrag = null; if (JSON.stringify(d.before) !== JSON.stringify(this.project)) this.commitGesture(d.before, 'Move procedural attachment'); this.refresh(); });
    this.previewCanvas.addEventListener('pointercancel', () => { if (this.nodeDrag) this.project = this.nodeDrag.before; this.nodeDrag = null; this.refresh(); });
    this.previewCanvas.addEventListener('dragover', (e) => e.preventDefault());
    this.previewCanvas.addEventListener('drop', (e) => { e.preventDefault(); const id = e.dataTransfer.getData('application/x-potion-component'); if (!this.asset.components.some((c) => c.id === id)) return; const b = this.previewCanvas.getBoundingClientRect(); this.edit('Place procedural component', () => { const n = newNode(id); n.x = Math.round((e.clientX - b.left) * 96 / b.width); n.y = Math.round((e.clientY - b.top) * 96 / b.height); this.asset.nodes.push(n); this.nodeId = n.id; this.componentId = id; }); });
    const tools = h('div', { class: 'art-tools', role: 'toolbar', 'aria-label': 'Pixel tools' });
    for (const t of TOOLS) tools.append(btn(t[0].toUpperCase() + t.slice(1), () => { this.tool = t; this.refreshTools(); }, { act: 'art-tool-' + t }));
    tools.append(action('Undo', () => this.undo(), 'undo'), action('Redo', () => this.redo(), 'redo'), action('Fit', () => { this.pan = [0, 0]; this.zoom = Math.max(2, Math.floor(Math.min(this.canvas.clientWidth, this.canvas.clientHeight) / 40)); this.draw(); }, 'fit'),
      this.check('Pixel grid', this.grid, (v) => { this.grid = v; this.draw(); }), this.check('Guides', this.guides, (v) => { this.guides = v; this.draw(); }));
    this.tools = tools;
    const center = h('main', { class: 'art-center' }, tools,
      h('div', { class: 'art-canvases' }, h('div', { class: 'art-edit-area' }, this.canvas),
        h('section', { class: 'art-preview-pane' }, h('h2', { text: 'Live construction' }), this.previewCanvas,
          h('p', { class: 'muted small', text: 'Select a part here to edit its component and attachment rules.' }),
          action('Capture comparison', () => { this.compare = this.generated.pix.toCanvas(); this.drawGenerated(); }, 'compare'),
          this.check('Before / after', false, (v) => { this.showCompare = v; this.drawGenerated(); }),
          h('p', { class: 'muted small', text: 'Pencil B · Eraser E · Select M · Pan Space/drag · Zoom wheel · Ctrl/Cmd Z / Shift Z' }))));
    const foot = h('footer', { class: 'art-footer' }, this.status, action('Toggle library', () => this.togglePanel('library'), 'toggle-library'), action('Toggle properties', () => this.togglePanel('inspector'), 'toggle-inspector'));
    this.projectFile = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => this.run(() => this.importProject(e.target.files[0])) });
    this.pngFile = h('input', { type: 'file', accept: 'image/png', hidden: true, onchange: (e) => this.run(() => this.importPNG(e.target.files[0])) });
    this.center = center; this.componentChildren = [...center.children];
    this.el.append(header, this.library, center, this.inspector, this.bottom, foot, this.projectFile, this.pngFile); root.append(this.el);
    for (const p of this.hiddenPanels) this.el.classList.add('art-hide-' + p);
    if (!this.origin) this.zoom = Math.max(2, Math.min(16, Math.floor(Math.min(this.canvas.clientWidth, this.canvas.clientHeight) / 40)));
    this.bindCanvas();
    this.observer = new ResizeObserver(() => { this.draw(); clearTimeout(this.layoutTimer); this.layoutTimer = setTimeout(() => this.saveLayout(), 500); });
    this.observer.observe(this.canvas); this.observer.observe(this.library); this.observer.observe(this.inspector); this.observer.observe(this.bottom);
    this.refresh();
  }
  async run(fn) { try { await fn(); } catch (e) { this.message(e.message || String(e), true); } }
  message(text, error = false) { if (!this.mounted) return; this.status.textContent = text; this.status.classList.toggle('error', error); }
  edit(label, fn, refresh = true) {
    const before = clone(this.project);
    try { fn(); validateProject(this.project); }
    catch (e) { this.project = before; this.refresh(); this.message(e.message, true); return; }
    try { this.history.push(before, label); } catch (e) { this.project = before; this.refresh(); this.message(e.message, true); return; } this.dirty = true;
    if (refresh) this.refresh(); else this.draw();
  }
  setProject(p) { this.project = p; this.assetId = p.assets[0].id; this.componentId = p.assets[0].components[0].id; this.nodeId = p.assets[0].nodes[0]?.id; this.layerId = ''; this.selection = null; this.compare = null; this.history = new History(); this.dirty = false; this.seed = this.asset.seed; }
  undo() { this.project = this.history.undo(this.project); this.dirty = true; this.selection = null; this.refresh(); }
  redo() { this.project = this.history.redo(this.project); this.dirty = true; this.selection = null; this.refresh(); }
  refresh() {
    if (!this.mounted) return;
    const workspaceControl = this.el.querySelector('[aria-label="Editor workspace"]'); if (workspaceControl) workspaceControl.value = this.workspace;
    this.title.textContent = this.project.name + (this.dirty ? ' •' : '');
    if (this.workspace !== 'components') {
      this.renderLibrary();
      if (!this.domainEditor) this.domainEditor = new DomainWorkspace(this);
      this.domainEditor.render(); return;
    }
    if (this.center.querySelector('.art-domain')) { this.domainEditor?.destroy(); this.domainEditor = null; this.center.replaceChildren(...this.componentChildren); }
    this.renderLibrary(); this.renderInspector(); this.renderBottom(); this.refreshTools(); this.draw();
  }
  refreshTools() { for (const b of this.tools.querySelectorAll('[data-act^="art-tool-"]')) { const on = b.dataset.act === 'art-tool-' + this.tool; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); } }
  check(label, checked, change) {
    const input = h('input', { type: 'checkbox', 'aria-label': label, onchange: () => change(input.checked) }); input.checked = checked;
    return h('label', { class: 'art-check' }, input, label);
  }
  field(label, value, change, type = 'text', attrs = {}) {
    const input = h('input', { type, value, 'aria-label': label, ...attrs, onchange: () => change(type === 'number' || type === 'range' ? +input.value : input.value) });
    return h('label', { class: 'art-field' }, h('span', { text: label }), input);
  }
  select(label, value, options, change) {
    const s = h('select', { 'aria-label': label, onchange: () => change(s.value) }, options.map(([id, name]) => h('option', { value: id, text: name, selected: id === value })));
    return h('label', { class: 'art-field' }, label, s);
  }
  renderLibrary() {
    clear(this.library).append(h('h2', { text: 'Asset library' }));
    const search = h('input', { type: 'search', placeholder: 'Search names, tags…', 'aria-label': 'Search assets', value: this.search || '', oninput: () => { this.search = search.value; this.renderAssetList(list); } });
    const list = h('div'); this.library.append(search, btn('+ New plant', () => this.run(async () => {
      const name = await named('Asset name', 'New plant'); if (!name) return;
      this.edit('Create plant', () => { const a = newAsset(name); this.project.assets.push(a); this.assetId = a.id; this.componentId = a.components[0].id; this.nodeId = a.nodes[0].id; this.seed = a.seed; this.selection = null; });
    }), { act: 'art-new-asset' }), list);
    this.renderAssetList(list);
    this.library.append(h('h2', { text: 'Reusable components' }));
    for (const c of this.asset.components) {
      const b = btn(c.name, () => { this.componentId = c.id; this.selection = null; this.layerId = ''; this.refresh(); }, { cls: c.id === this.component.id ? 'active' : '', act: 'art-component-' + c.id });
      b.draggable = true; b.addEventListener('dragstart', (e) => e.dataTransfer.setData('application/x-potion-component', c.id));
      const thumb = componentPixels(c, this.stage, this.seed).toCanvas(); b.prepend(thumb); this.library.append(b);
    }
    this.library.append(btn('+ Draw component', () => this.run(async () => {
      const name = await named('Component name', 'Hand-drawn leaf'); if (!name) return;
      this.edit('Create component', () => { const c = newComponent(name, 'blank'); this.asset.components.push(c); this.componentId = c.id; this.layerId = ''; this.selection = null; });
    }), { act: 'art-new-component' }), btn('Extract selection as component', () => this.run(() => this.extract()), { act: 'art-extract' }));
  }
  renderAssetList(list) {
    clear(list); const q = (this.search || '').toLowerCase();
    const assets = this.project.assets.filter((a) => `${a.name} ${a.tags} ${a.category} ${a.folder}`.toLowerCase().includes(q));
    for (const category of [...new Set(assets.map((a) => a.category))]) {
      const details = h('details', { open: true }, h('summary', { text: category }));
      for (const folder of [...new Set(assets.filter((a) => a.category === category).map((a) => a.folder))]) {
        details.append(h('div', { class: 'art-folder', text: folder || 'Unfiled' }));
        for (const a of assets.filter((a) => a.category === category && a.folder === folder)) details.append(btn(a.name, () => { this.assetId = a.id; this.componentId = a.components[0].id; this.nodeId = a.nodes[0]?.id; this.seed = a.seed; this.layerId = ''; this.selection = null; this.compare = null; this.refresh(); }, { cls: a.id === this.asset.id ? 'active' : '', act: 'art-asset-' + a.id }));
      }
      list.append(details);
    }
  }
  renderInspector() {
    const a = this.asset, c = this.component; clear(this.inspector);
    const editField = (label, obj, key, type = 'text', attrs = {}) => this.field(label, obj[key], (v) => this.edit(label, () => { obj[key] = v; }), type, attrs);
    this.inspector.append(h('h2', { text: 'Asset & component' }), editField('Asset name', a, 'name'), editField('Category', a, 'category'), editField('Folder', a, 'folder'), editField('Tags', a, 'tags'),
      btn('Duplicate asset', () => this.edit('Duplicate asset', () => { const copy = clone(a); copy.id = uid(); copy.name += ' copy'; this.project.assets.push(copy); this.assetId = copy.id; }), { act: 'art-duplicate-asset' }),
      btn('Delete asset', () => this.run(async () => { if (this.project.assets.length < 2) throw new Error('Keep at least one asset'); if (await confirmDialog('Delete asset?', a.name, 'Delete', 'danger')) this.edit('Delete asset', () => { this.project.assets = this.project.assets.filter((x) => x.id !== a.id); this.assetId = this.project.assets[0].id; this.componentId = this.asset.components[0].id; }); }), { act: 'art-delete-asset' }),
      editField('Component name', c, 'name'), editField('Component tags', c, 'tags'));
    this.inspector.append(btn('Duplicate component', () => this.edit('Duplicate component', () => { const copy = clone(c); copy.id = uid(); copy.name += ' copy'; this.asset.components.push(copy); this.componentId = copy.id; })),
      btn('Delete unattached component', () => this.run(() => { if (this.asset.components.length < 2 || this.asset.nodes.some((n) => n.component === c.id)) throw new Error('Remove rules referencing this component before deleting it.'); this.edit('Delete component', () => { this.asset.components = this.asset.components.filter((p) => p.id !== c.id); this.componentId = this.asset.components[0].id; }); })));
    this.inspector.append(this.field('Brush size', this.brush, (v) => { this.brush = Math.max(1, Math.min(16, v)); }, 'number', { min: 1, max: 16 }), this.check('Round brush', this.round, (v) => { this.round = v; }),
      this.field('Paint color', this.color, (v) => { this.color = v; }, 'color'), h('div', { class: 'art-palette' }, this.project.palette.map((color) => btn(' ', () => { this.color = color; this.paletteIndex = this.project.palette.indexOf(color); this.renderInspector(); }, { title: color, act: 'art-color-' + color.slice(1) })).map((b, i) => { b.style.background = this.project.palette[i]; return b; })),
      btn('Add paint color to palette', () => this.edit('Palette color', () => { if (!this.project.palette.includes(this.color)) this.project.palette.push(this.color); })),
      btn('Replace selected palette color', () => this.edit('Edit palette', () => { this.project.palette[this.paletteIndex || 0] = this.color; })),
      h('h3', { text: 'Source geometry' }));
    for (const [index, g] of c.geometry.entries()) this.inspector.append(this.select('Shape ' + (index + 1), g.shape, ['leaf', 'stem', 'ellipse', 'rectangle', 'crystal', 'polygon'].map((s) => [s, s]), (v) => this.edit('Geometry shape', () => { g.shape = v; if (v === 'polygon' && !g.points) g.points = [[16, 2], [30, 28], [2, 28]]; })),
      editField('Geometry color ' + (index + 1), g, 'color', 'color'), editField('Geometry width ' + (index + 1), g, 'width', 'number', { min: 1, max: 32 }), editField('Geometry height ' + (index + 1), g, 'height', 'number', { min: 1, max: 32 }),
      editField('Geometry X ' + (index + 1), g, 'x', 'number', { min: 0, max: 32 }), editField('Geometry Y ' + (index + 1), g, 'y', 'number', { min: 0, max: 32 }), btn('Remove geometry ' + (index + 1), () => this.edit('Remove geometry', () => c.geometry.splice(index, 1))));
    for (const [key, label] of [['texture', 'Procedural texture'], ['lighting', 'Material lighting'], ['irregularity', 'Organic deformation'], ['paletteVariation', 'Seeded palette variation']]) this.inspector.append(this.field(label, c[key] ?? (key === 'texture' || key === 'lighting' ? 1 : 0), (v) => this.edit(label, () => { c[key] = v; }), 'number', { min: 0, max: 2, step: 0.1 }));
    this.inspector.append(btn('Add geometry', () => this.edit('Add geometry', () => c.geometry.push({ shape: 'leaf', color: this.color, width: 12, height: 24, x: 16, y: 16 }))),
      h('p', { class: 'small muted', text: `Anchors: base ${c.anchor.join(', ')} · tip ${c.tip.join(', ')}. Use Anchor / Tip tools to place them.` }), h('h3', { text: 'Pixel correction layers' }));
    for (const [index, l] of c.layers.entries()) this.inspector.append(h('div', { class: 'art-layer' }, btn(l.name, () => { this.layerId = l.id; this.renderInspector(); }, { cls: l === this.layer ? 'active' : '' }), this.check('Visible ' + l.name, l.visible, (v) => this.edit('Layer visibility', () => { l.visible = v; })),
      this.field('Layer name ' + (index + 1), l.name, (v) => this.edit('Layer name', () => { l.name = v; })), this.field('Opacity ' + (index + 1), l.opacity, (v) => this.edit('Layer opacity', () => { l.opacity = v; }), 'number', { min: 0, max: 1, step: 0.1 }),
      this.select('Correction scope ' + (index + 1), l.scope, ['all', 'variant', 'stage'].map((s) => [s, s]), (v) => this.edit('Correction scope', () => { l.scope = v; l.variant = this.seed; l.stage = this.stage; })),
      h('small', { class: 'muted', text: l.scope === 'variant' ? 'Only seed ' + l.variant : l.scope === 'stage' ? 'Only ' + STAGES[l.stage] : 'Every use of this component' }),
      btn('Raise layer ' + (index + 1), () => this.edit('Layer order', () => { if (index < c.layers.length - 1) [c.layers[index], c.layers[index + 1]] = [c.layers[index + 1], c.layers[index]]; })),
      btn('Delete layer ' + (index + 1), () => this.edit('Delete layer', () => { c.layers.splice(index, 1); this.layerId = ''; }))));
    this.inspector.append(btn('+ Layer', () => this.edit('Add layer', () => { const l = newLayer(); c.layers.push(l); this.layerId = l.id; }), { act: 'art-add-layer' }),
      h('div', { class: 'art-row' }, btn('Copy', () => this.copy()), btn('Paste', () => this.paste()), btn('Flip', () => this.transform(0, 1, true)), btn('Rotate 90°', () => this.transform(90)), btn('Scale 2×', () => this.transform(0, 2)), btn('Scale ½', () => this.transform(0, 0.5))),
      btn('Import PNG', () => this.pngFile.click(), { act: 'art-import-png' }), btn('Export transparent PNG', () => this.exportPNG(), { act: 'art-export-png' }), this.field('Preview background', this.background, (v) => { this.background = v; this.draw(); }, 'color'));
    this.renderDirection();
  }
  renderDirection() {
    const d = this.project.direction;
    this.directionScope ??= 'global'; this.directionKey ??= 'herb';
    const scope = this.directionScope, key = this.directionKey;
    const style = scope === 'global' ? d.global : d[scope][key] || d.global;
    const section = h('details', {}, h('summary', { text: 'Game art direction — ingredient ramps' }));
    const targets = scope === 'biomes' ? ['meadow', 'forest', 'river', 'moonfen', 'quarry', 'crags', 'netherwood'] : scope === 'families' ? Object.keys(FAMILIES) : WILD_SPECS.map((s) => s.key);
    section.append(this.select('Style scope', scope, ['global', 'biomes', 'families', 'species'].map((s) => [s, s]), (v) => { this.directionScope = v; this.directionKey = v === 'biomes' ? 'forest' : v === 'families' ? 'herb' : WILD_SPECS[0].key; this.renderInspector(); }));
    if (scope !== 'global') section.append(this.select('Style target', key, targets.map((s) => [s, s]), (v) => { this.directionKey = v; this.renderInspector(); }));
    for (const [name, label, type, attrs] of [['tint', 'Tint', 'color', {}], ['mix', 'Tint strength', 'number', { min: 0, max: 1, step: 0.05 }], ['saturation', 'Saturation', 'number', { min: 0, max: 2, step: 0.1 }], ['contrast', 'Contrast', 'number', { min: 0.2, max: 2, step: 0.1 }]]) {
      section.append(this.field(String(label), style[String(name)], (v) => this.edit('Art direction', () => { if (scope !== 'global' && !d[scope][key]) d[scope][key] = clone(d.global); (scope === 'global' ? d.global : d[scope][key])[String(name)] = v; }), String(type), attrs));
    }
    if (scope !== 'global') section.append(btn('Remove override', () => this.edit('Remove override', () => { delete d[scope][key]; })));
    section.append(this.select('Saved style preset', '', [['', 'Choose preset'], ...(this.project.presets || []).map((p, i) => [String(i), p.name])], (v) => { if (v !== '') this.edit('Load art-direction preset', () => { this.project.direction = clone(this.project.presets[+v].style); }); }), btn('Save named style preset', () => this.run(async () => { const name = await named('Style preset name', 'My art direction'); if (name) this.edit('Save art-direction preset', () => { this.project.presets ??= []; this.project.presets.push({ name, style: clone(this.project.direction) }); }); })));
    section.append(btn('Preset: Cavern', () => this.edit('Cavern palette', () => { d.global = { tint: '#668b9e', mix: 0.2, saturation: 0.7, contrast: 1.15 }; })), btn('Preset: Original ramps', () => this.edit('Original ramps', () => { d.global = { tint: '#ffffff', mix: 0, saturation: 1, contrast: 1 }; })),
      btn('Preview linked ingredient', () => this.linkedPreview(), { act: 'art-linked-preview' }), h('p', { class: 'small muted', text: 'Global → biome → family → species. Profiles apply the native ingredient, custom graph, environment, creature, material, effect and interface adapters.' }));
    this.inspector.append(section);
  }
  renderBottom() {
    clear(this.bottom); const tabs = h('nav', { class: 'art-tabs', 'aria-label': 'Workspace tabs' });
    for (const tab of ['growth', 'variants', 'rules', 'history', 'validation']) tabs.append(btn(tab[0].toUpperCase() + tab.slice(1), () => { this.tab = tab; this.renderBottom(); }, { cls: this.tab === tab ? 'active' : '', act: 'art-tab-' + tab }));
    this.bottom.append(tabs); const content = h('div', { class: 'art-bottom-content' }); this.bottom.append(content);
    if (this.tab === 'growth') {
      for (let s = 0; s < 3; s++) { const cv = generate(this.asset, this.seed, s).pix.toCanvas(); content.append(h('div', { class: 'art-stage-card' }, btn(STAGES[s], () => { this.stage = s; this.refresh(); }, { cls: this.stage === s ? 'active' : '', act: 'art-stage-' + s }), cv,
        this.field(STAGES[s] + ' scale', this.asset.stages[s], (v) => this.edit('Growth stage', () => { this.asset.stages[s] = v; }), 'number', { min: 0.1, max: 2, step: 0.1 }))); }
      content.append(btn(this.playTimer ? 'Stop stages' : 'Play stages', () => { if (this.playTimer) { clearInterval(this.playTimer); this.playTimer = null; } else this.playTimer = setInterval(() => { this.stage = (this.stage + 1) % 3; this.draw(); }, 800); this.renderBottom(); }, { act: 'art-play-stages' }));
    } else if (this.tab === 'variants') {
      content.append(this.field('Variant seed', this.seed, (v) => { this.seed = Math.max(0, Math.min(4294967295, Math.floor(v))); this.edit('Variant seed', () => { this.asset.seed = this.seed; }); }, 'number', { min: 0, max: 4294967295 }), btn('Regenerate', () => { this.seed = (this.seed + 1) >>> 0; this.edit('Regenerate', () => { this.asset.seed = this.seed; }); }, { act: 'art-regenerate' }));
      for (let i = 0; i < 6; i++) { const seed = (this.seed + i) >>> 0, cv = generate(this.asset, seed, this.stage).pix.toCanvas(); const b = btn('Seed ' + seed, () => { this.seed = seed; this.edit('Choose variant', () => { this.asset.seed = seed; }); }); b.prepend(cv); content.append(b); }
    } else if (this.tab === 'rules') this.renderRules(content);
    else if (this.tab === 'history') { content.append(btn('Undo', () => this.undo()), btn('Redo', () => this.redo()), h('p', { text: 'Snapshots bounded to 60 steps / 8 MB. One gesture is one history step.' })); for (const entry of [...this.history.undoStack].reverse()) content.append(h('div', { text: entry.label })); }
    else { const result = generate(this.asset, this.seed, this.stage); content.append(h('p', { text: `${result.instances.length} component instances · ${this.renderMs.toFixed(1)} ms last regeneration · art cache revision ${artRevision()}` }), h('p', { text: result.warnings.join(' · ') || 'Graph valid. No instance/depth limits reached.' }), h('p', { text: 'Runtime editors: ingredients and graph bindings, structural terrain, native creature anchors and animation, material/effect rendering and interface artwork. Use Editor workspace to switch; all are stored in this project.' })); }
  }
  renderRules(content) {
    const a = this.asset; const list = h('div', { class: 'art-rule-list' });
    for (const n of a.nodes) {
      let depth = 0, parent = n.parent; const seen = new Set(); while (parent && !seen.has(parent)) { seen.add(parent); depth++; parent = a.nodes.find((p) => p.id === parent)?.parent; }
      list.append(btn('↳ '.repeat(depth) + n.name + (n.locked ? ' 🔒' : ''), () => { this.nodeId = n.id; this.componentId = n.component; this.selection = null; this.refresh(); }, { cls: this.nodeId === n.id ? 'active' : '', act: 'art-node-' + n.id }));
    }
    list.append(btn('Attach selected component', () => this.edit('Attach component', () => { const n = newNode(this.component.id, this.node?.id || ''); this.asset.nodes.push(n); this.nodeId = n.id; }), { act: 'art-attach' })); content.append(list);
    const n = this.node; if (!n) return;
    const form = h('div', { class: 'art-rule-properties' });
    const set = (label, key, type = 'number', attrs = {}) => this.field(label, n[key], (v) => this.edit(label, () => { n[key] = v; }), type, attrs);
    form.append(set('Rule name', 'name', 'text'), this.select('Parent', n.parent, [['', 'Scene root'], ...a.nodes.filter((p) => p.id !== n.id).map((p) => [p.id, p.name])], (v) => this.edit('Change parent', () => { n.parent = v; })),
      this.select('Component', n.component, a.components.map((c) => [c.id, c.name]), (v) => this.edit('Choose component', () => { n.component = v; this.componentId = v; })),
      this.select('Child attachment', n.anchor, [['tip', 'Tip anchor'], ['anchor', 'Base anchor']], (v) => this.edit('Attachment surface', () => { n.anchor = v; })));
    for (const [label, key, min, max, step] of [['Count', 'count', 1, 16, 1], ['Offset X', 'x', -192, 192, 1], ['Offset Y', 'y', -192, 192, 1], ['Angle', 'angle', -360, 360, 1], ['Scale', 'scale', 0.1, 4, 0.1], ['Angle variation', 'jitter', 0, 90, 1], ['Distribution spacing', 'spread', 0, 64, 1], ['Probability', 'probability', 0, 1, 0.1], ['Choice weight', 'weight', 0, 100, 1]]) form.append(set(String(label), String(key), 'number', { min, max, step }));
    form.append(set('Choice group (optional)', 'choice', 'text'), this.select('First stage', String(n.minStage), STAGES.map((s, i) => [String(i), s]), (v) => this.edit('Emergence', () => { n.minStage = +v; })), this.select('Last stage', String(n.maxStage), STAGES.map((s, i) => [String(i), s]), (v) => this.edit('Maturation', () => { n.maxStage = +v; })),
      this.check('Alternate mirrored instances', n.mirror, (v) => this.edit('Symmetry', () => { n.mirror = v; })), this.check('Avoid occupied pixels', n.avoidOverlap, (v) => this.edit('Collision exclusion', () => { n.avoidOverlap = v; })), this.check('Lock local variation', n.locked, (v) => this.edit('Lock local variation', () => { n.locked = v; n.lockSeed = this.seed; })),
      btn('Delete rule and descendants', () => this.edit('Delete branch', () => { const gone = new Set([n.id]); let old; do { old = gone.size; for (const x of a.nodes) if (gone.has(x.parent)) gone.add(x.id); } while (gone.size !== old); a.nodes = a.nodes.filter((x) => !gone.has(x.id)); this.nodeId = a.nodes[0]?.id; })),
      h('p', { class: 'small muted', text: 'Rules execute top to bottom. Children follow parent anchors and transforms. Matching choice groups select one weighted alternative per parent. Lock preserves local variation; moving a parent still moves its children.' }));
    content.append(form);
  }
  draw() {
    if (this.workspace !== 'components') { this.domainEditor?.draw(); return; }
    if (!this.mounted || this.drawRequest) return;
    this.drawRequest = requestAnimationFrame(() => { this.drawRequest = 0; if (this.mounted) this.paint(); });
  }
  paint() {
    const t = performance.now(), key = JSON.stringify([this.asset, this.seed, this.stage]);
    if (key !== this.generatedKey) { this.generatedKey = key; this.generated = generate(this.asset, this.seed, this.stage); this.renderMs = performance.now() - t; }
    const componentKey = JSON.stringify([this.component, this.seed, this.stage]);
    if (componentKey !== this.componentKey) { this.componentKey = componentKey; this.bitmap = componentPixels(this.component, this.stage, this.seed); this.bitmapCanvas = this.bitmap.toCanvas(); }
    const cv = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, height = cv.clientHeight;
    if (!w || !height) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(height * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(height * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.background; ctx.fillRect(0, 0, w, height);
    const ox = Math.round((w - 32 * this.zoom) / 2 + this.pan[0]), oy = Math.round((height - 32 * this.zoom) / 2 + this.pan[1]);
    this.origin = [ox, oy];
    ctx.save(); ctx.translate(ox, oy); ctx.scale(this.zoom, this.zoom);
    for (let y = 0; y < 32; y += 4) for (let x = 0; x < 32; x += 4) { ctx.fillStyle = (x + y) % 8 ? '#33414b' : '#28353e'; ctx.fillRect(x, y, 4, 4); }
    ctx.drawImage(this.bitmapCanvas, 0, 0);
    if (this.selection) { ctx.fillStyle = '#95dcea60'; for (const i of this.selection) ctx.fillRect(i % 32, Math.floor(i / 32), 1, 1); }
    ctx.restore();
    if (this.grid && this.zoom >= 5) { ctx.strokeStyle = '#d2e6e326'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= 32; i++) { ctx.moveTo(ox + i * this.zoom + 0.5, oy); ctx.lineTo(ox + i * this.zoom + 0.5, oy + 32 * this.zoom); ctx.moveTo(ox, oy + i * this.zoom + 0.5); ctx.lineTo(ox + 32 * this.zoom, oy + i * this.zoom + 0.5); } ctx.stroke(); }
    if (this.guides) {
      ctx.font = '10px monospace'; ctx.fillStyle = '#b8cbd5';
      for (let i = 0; i <= 32; i += 4) { ctx.fillText(String(i), ox + i * this.zoom, oy - 6); ctx.fillText(String(i), ox - 20, oy + i * this.zoom + 4); }
      /** @type {[number[], string, string][]} */
      const markers = [[this.component.anchor, '#ffd38a', 'B'], [this.component.tip, '#8ce0cc', 'T']];
      for (const [point, color, label] of markers) { const x = ox + point[0] * this.zoom, y = oy + point[1] * this.zoom; ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke(); ctx.fillText(label, x + 7, y - 7); }
    }
    if (this.tool === 'vertex') { ctx.fillStyle = '#ffcc66'; for (const g of this.component.geometry) for (const p of g.points || []) ctx.fillRect(ox + (g.x + (p[0] - 16) * g.width / 32) * this.zoom - 3, oy + (g.y + (p[1] - 16) * g.height / 32) * this.zoom - 3, 6, 6); }
    this.drawGenerated();
  }
  drawGenerated() {
    if (!this.generated) return;
    this.previewCanvas.dataset.hash = String(this.generated.pix.hash());
    const ctx = this.previewCanvas.getContext('2d'); ctx.clearRect(0, 0, 96, 96); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.generated.pix.toCanvas(), 0, 0);
    if (this.showCompare && this.compare) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 48, 96); ctx.clip(); ctx.clearRect(0, 0, 48, 96); ctx.drawImage(this.compare, 0, 0); ctx.restore(); ctx.fillStyle = '#e5d4a1'; ctx.fillRect(48, 0, 1, 96); }
  }
  point(e) {
    const b = this.canvas.getBoundingClientRect(); return [Math.floor((e.clientX - b.left - this.origin[0]) / this.zoom), Math.floor((e.clientY - b.top - this.origin[1]) / this.zoom)];
  }
  bindCanvas() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => {
      e.preventDefault(); const b = cv.getBoundingClientRect(), x = e.clientX - b.left - b.width / 2, y = e.clientY - b.top - b.height / 2;
      const next = Math.min(40, Math.max(2, this.zoom * Math.exp(-e.deltaY * 0.001))), k = next / this.zoom;
      this.pan = [x - (x - this.pan[0]) * k, y - (y - this.pan[1]) * k]; this.zoom = next; this.draw();
    }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      if (this.stroke) return;
      cv.focus(); e.preventDefault(); cv.setPointerCapture(e.pointerId);
      if (!this.origin) this.paint();
      const p = this.point(e), tool = this.space || e.button === 1 ? 'pan' : this.tool;
      if (tool !== 'pan' && (p[0] < 0 || p[0] >= 32 || p[1] < 0 || p[1] >= 32)) return;
      if (tool === 'eyedropper') { this.color = wordColor(this.bitmap.get(p[0], p[1])); this.renderInspector(); return; }
      if (tool === 'fill' || tool === 'contiguous') {
        const pixels = region(this.bitmap.px, 32, 32, p[0], p[1]);
        if (tool === 'contiguous') { this.selection = new Set(pixels); this.draw(); }
        else this.edit('Fill', () => { this.ensureLayer(); for (const i of pixels) if (!this.selection || this.selection.has(i)) this.layer.pixels[i] = colorWord(this.color); }); return;
      }
      this.stroke = { before: clone(this.project), start: p, last: p, screen: [e.clientX, e.clientY], pan: this.pan.slice(), pixels: this.layer?.pixels.slice(), lasso: [p], tool };
      if (tool === 'vertex') {
        const vertices = this.component.geometry.flatMap((g, gi) => (g.points || []).map((v, vi) => ({ gi, vi, distance: Math.hypot(g.x + (v[0] - 16) * g.width / 32 - p[0], g.y + (v[1] - 16) * g.height / 32 - p[1]) }))).sort((a, b) => a.distance - b.distance);
        this.stroke.vertex = vertices[0];
      }
      if (tool === 'pencil' || tool === 'eraser') this.strokeAt(p, p, tool);
      if (tool === 'anchor' || tool === 'tip') this.component[tool] = p;
      this.draw();
    });
    cv.addEventListener('pointermove', (e) => {
      const s = this.stroke; if (!s) return;
      const p = this.point(e).map((v) => Math.max(0, Math.min(31, v)));
      if (s.tool === 'pan') { this.pan = [s.pan[0] + e.clientX - s.screen[0], s.pan[1] + e.clientY - s.screen[1]]; this.draw(); return; }
      if (s.tool === 'pencil' || s.tool === 'eraser') this.strokeAt(s.last, p, s.tool);
      else if (s.tool === 'line' || s.tool === 'rectangle' || s.tool === 'ellipse') {
        this.ensureLayer(); this.layer.pixels = (s.pixels || Array(1024).fill(0)).slice(); this.shape(s.start, p, s.tool);
      } else if (s.tool === 'select') this.selectRect(s.start, p);
      else if (s.tool === 'lasso') s.lasso.push(p);
      else if (s.tool === 'move') {
        this.ensureLayer(); const dx = p[0] - s.start[0], dy = p[1] - s.start[1], src = s.pixels || Array(1024).fill(0), indices = this.selection || new Set(Array.from({ length: 1024 }, (_, i) => i));
        this.layer.pixels = src.slice(); for (const i of indices) this.layer.pixels[i] = 0;
        for (const i of indices) { const x = i % 32 + dx, y = Math.floor(i / 32) + dy; if (x >= 0 && x < 32 && y >= 0 && y < 32) this.layer.pixels[y * 32 + x] = src[i]; }
      } else if (s.tool === 'vertex' && s.vertex) { const g = this.component.geometry[s.vertex.gi]; g.points[s.vertex.vi] = [Math.max(0, Math.min(32, (p[0] - g.x) * 32 / g.width + 16)), Math.max(0, Math.min(32, (p[1] - g.y) * 32 / g.height + 16))]; } else if (s.tool === 'anchor' || s.tool === 'tip') this.component[s.tool] = p;
      s.last = p; this.draw();
    });
    cv.addEventListener('pointerup', () => this.endStroke());
    cv.addEventListener('pointercancel', () => { if (this.stroke) this.project = this.stroke.before; this.stroke = null; this.draw(); });
    cv.addEventListener('lostpointercapture', () => this.endStroke());
  }
  commitGesture(before, label) {
    try { validateProject(this.project); this.history.push(before, label); this.dirty = true; }
    catch (e) { this.project = before; this.message(e.message, true); }
  }
  ensureLayer() { if (!this.layer) { const l = newLayer(); this.component.layers.push(l); this.layerId = l.id; } }
  strokeAt(a, b, tool) {
    this.ensureLayer(); const radius = Math.floor(this.brush / 2);
    line(a[0], a[1], b[0], b[1], (x, y) => { for (let j = 0; j < this.brush; j++) for (let i = 0; i < this.brush; i++) {
      const xx = x + i - radius, yy = y + j - radius, idx = yy * 32 + xx;
      if (xx < 0 || yy < 0 || xx >= 32 || yy >= 32 || this.selection && !this.selection.has(idx) || this.round && Math.hypot(i - (this.brush - 1) / 2, j - (this.brush - 1) / 2) > this.brush / 2) continue;
      this.layer.pixels[idx] = tool === 'eraser' ? -1 : colorWord(this.color);
    } });
  }
  shape(a, b, tool) {
    if (tool === 'line') { this.strokeAt(a, b, 'pencil'); return; }
    const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
    if (tool === 'rectangle') for (const [p, q] of [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]]) this.strokeAt(p, q, 'pencil');
    else { const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, cx = x0 + rx, cy = y0 + ry; let prev = [Math.round(cx + rx), Math.round(cy)]; for (let i = 1; i <= 128; i++) { const r = i / 128 * Math.PI * 2, p = [Math.round(cx + Math.cos(r) * rx), Math.round(cy + Math.sin(r) * ry)]; this.strokeAt(prev, p, 'pencil'); prev = p; } }
  }
  selectRect(a, b) { this.selection = new Set(); for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) this.selection.add(y * 32 + x); }
  endStroke() {
    const s = this.stroke; if (!s) return; this.stroke = null;
    if (s.tool === 'lasso') { this.selection = new Set(); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (inPolygon(x + 0.5, y + 0.5, s.lasso)) this.selection.add(y * 32 + x); }
    if (s.tool === 'select' && !this.selection) this.selectRect(s.start, s.last);
    if (!['pan', 'select', 'lasso'].includes(s.tool) && JSON.stringify(this.project) !== JSON.stringify(s.before)) this.commitGesture(s.before, 'Canvas ' + s.tool);
    this.refresh();
  }
  copy() { const pix = componentPixels(this.component, this.stage, this.seed); this.clipboard = Array.from(pix.px, (c, i) => !this.selection || this.selection.has(i) ? c : 0); this.message('Copied component pixels' + (this.selection ? ' in selection' : '')); }
  paste() { if (!this.clipboard) return; this.edit('Paste pixels', () => { this.ensureLayer(); for (let i = 0; i < 1024; i++) if (this.clipboard[i]) this.layer.pixels[i] = this.clipboard[i]; }); }
  transform(angle, scale = 1, flip = false) {
    this.edit('Transform correction pixels', () => {
      this.ensureLayer(); const src = new Pixels(32, 32), indices = this.selection || new Set(Array.from({ length: 1024 }, (_, i) => i));
      for (const i of indices) src.px[i] = this.layer.pixels[i] === -1 ? 0x00ffffff : this.layer.pixels[i];
      const out = transformed(src, angle, scale, flip); for (const i of indices) this.layer.pixels[i] = 0;
      for (let i = 0; i < 1024; i++) if (out.px[i]) this.layer.pixels[i] = out.px[i] === 0x00ffffff ? -1 : out.px[i];
      this.selection = null;
    });
  }
  async extract() {
    if (!this.selection?.size) throw new Error('Select pixels with Select, Lasso or Contiguous first.');
    const name = await named('Extracted component name', 'Extracted leaf'); if (!name) return;
    this.edit('Extract reusable component', () => {
      const c = newComponent(name, 'blank'), source = componentPixels(this.component, this.stage, this.seed); let x0 = 32, y0 = 32, x1 = 0, y1 = 0;
      for (const i of this.selection) { c.layers[0].pixels[i] = source.px[i]; if (source.px[i] >>> 24) { x0 = Math.min(x0, i % 32); y0 = Math.min(y0, Math.floor(i / 32)); x1 = Math.max(x1, i % 32); y1 = Math.max(y1, Math.floor(i / 32)); } }
      if (x0 <= x1) { c.anchor = [Math.floor((x0 + x1) / 2), y1]; c.tip = [Math.floor((x0 + x1) / 2), y0]; }
      this.asset.components.push(c); this.componentId = c.id; this.layerId = ''; this.selection = null; this.tab = 'rules';
    });
    this.message('Component extracted. Position Base/Tip anchors, select a parent rule, then Attach selected component.');
  }
  key(e) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); this.copy(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); this.paste(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.run(() => this.save()); }
    else if (e.code === 'Space') { e.preventDefault(); this.space = true; }
    else if (e.key === 'Escape') { this.selection = null; this.draw(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.edit('Clear selected pixels', () => { this.ensureLayer(); for (const i of this.selection || Array.from({ length: 1024 }, (_, j) => j)) this.layer.pixels[i] = -1; }); }
    else if ({ b: 'pencil', e: 'eraser', m: 'select', i: 'eyedropper', g: 'fill' }[e.key.toLowerCase()]) { this.tool = { b: 'pencil', e: 'eraser', m: 'select', i: 'eyedropper', g: 'fill' }[e.key.toLowerCase()]; this.refreshTools(); }
  }
  exportProject() { validateProject(this.project); download(this.project.name + '.potion-art.json', new Blob([JSON.stringify(this.project)], { type: 'application/json' })); this.message('Project exported, including all editable layers and rules.'); }
  async importProject(file) {
    if (!file) return; if (file.size > 16 * 1024 * 1024) throw new Error('Project files must be below 16 MB');
    const text = await file.text();
    const header = JSON.parse(text);
    if (header?.format === 'potion-art-proposal') {
      const review = await reviewProposal(this.project, header);
      const before = generate(this.asset, this.seed, this.stage).pix.toCanvas(), after = generate(review.candidate.assets[0], this.seed, this.stage).pix.toCanvas();
      const list = h('div', {}, h('div', { class: 'art-linked-previews' }, before, after), review.changes.map((c) => h('p', { text: c.path + ': ' + c.before + ' → ' + c.after })));
      const dialog = modal({ title: 'Review proposed art changes', body: [list], foot: [btn('Apply proposed changes', () => { this.edit('Accept structured art proposal', () => { this.project = review.candidate; }); dialog.close(); })] });
      this.projectFile.value = ''; return;
    }
    const p = parseProject(text);
    if (this.dirty && !await confirmDialog('Replace unsaved work?', 'Export or save your current draft first.', 'Import')) return;
    p.id = uid(); this.setProject(p); this.dirty = true; this.refresh(); this.message('Project imported as a separate draft.'); this.projectFile.value = '';
  }
  exportPNG() { componentPixels(this.component, this.stage, this.seed).toCanvas().toBlob((b) => { if (b) download(this.component.name + '.png', b); }, 'image/png'); }
  async importPNG(file) {
    if (!file) return; if (file.type !== 'image/png' || file.size > 8 * 1024 * 1024) throw new Error('Choose a PNG under 8 MB');
    validatePNGHeader(new Uint8Array(await file.slice(0, 24).arrayBuffer()));
    const image = await createImageBitmap(file);
    try {
      if (image.width > 4096 || image.height > 4096) throw new Error('PNG dimensions must be below 4096 pixels');
      const cv = h('canvas', { width: 32, height: 32 }), ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
      const k = Math.min(32 / image.width, 32 / image.height); ctx.drawImage(image, Math.floor((32 - image.width * k) / 2), Math.floor((32 - image.height * k) / 2), Math.max(1, Math.round(image.width * k)), Math.max(1, Math.round(image.height * k)));
      const pixels = Array.from(new Uint32Array(ctx.getImageData(0, 0, 32, 32).data.buffer));
      this.edit('Import PNG component layer', () => { const l = newLayer(file.name.slice(0, 100)); l.pixels = pixels; this.component.layers.push(l); this.layerId = l.id; });
    } finally { image.close(); this.pngFile.value = ''; }
  }
  async save() { await saveProject(this.project); await putSetting('last-project', this.project.id); this.dirty = false; this.title.textContent = this.project.name; this.message('Draft saved on this device. Export a project file for a portable backup.'); }
  async projects() {
    const rows = await listProjects(); const content = h('div', { class: 'list' });
    const m = modal({ title: 'Art projects', body: [content], foot: [btn('Rename current', () => this.run(async () => { const name = await named('Project name', this.project.name); if (name) this.edit('Rename project', () => { this.project.name = name; }); m.close(); })), btn('New project', () => this.run(async () => {
      const name = await named('Project name', 'New art project'); if (!name) return;
      if (this.dirty) await this.save(); this.setProject(newProject(name)); await this.save(); this.refresh(); m.close();
    })), btn('Duplicate current', () => this.run(async () => { const p = clone(this.project); p.id = uid(); p.name += ' copy'; await saveProject(p); if (this.dirty) await this.save(); this.setProject(p); await this.save(); this.refresh(); m.close(); }))] });
    for (const row of rows.sort((a, b) => b.updated - a.updated)) content.append(h('div', { class: 'row' }, btn(row.name, () => this.run(async () => { if (this.dirty) await this.save(); const p = await loadProject(row.id); if (!p) throw new Error('Project no longer exists'); this.setProject(p); await putSetting('last-project', p.id); this.refresh(); m.close(); })), btn('Delete', () => this.run(async () => { if (await confirmDialog('Delete saved art project?', row.name + '. Export a backup first.', 'Delete', 'danger')) { await deleteProject(row.id); m.close(); } }))));
  }
  async apply() { await this.save(); await putSetting('active-direction', { version: 1, direction: compileProfile(this.project) }); setArtDirection(compileProfile(this.project)); this.message('Art profile applied to ingredient generators. Gameplay and save data are unchanged.'); }
  async revert() { await putSetting('active-direction', null); setArtDirection(null); this.message('Original game visuals restored. Your draft is retained.'); }
  async preview() { await this.save(); this.app.previewStudio(this); }
  async exit() { await this.save(); this.app.showMenu(); }
  linkedPreview() {
    const before = artDirection(), key = this.directionScope === 'species' ? this.directionKey : WILD_SPECS.find((s) => this.directionScope === 'biomes' ? s.region === this.directionKey : this.directionScope === 'families' ? describe(archetypeIdentity(s.key)).family === this.directionKey : true)?.key || WILD_SPECS[0].key;
    const body = h('div', { class: 'art-linked-previews' });
    try {
      setArtDirection(compileProfile(this.project)); const d = describe(archetypeIdentity(key));
      for (let stage = 0; stage < 3; stage++) body.append(h('figure', {}, plantFrame(d, stage).pix.toCanvas(), h('figcaption', { text: STAGES[stage] })));
      body.append(h('figure', {}, iconFrame(d).pix.toCanvas(), h('figcaption', { text: 'Inventory icon' })), h('figure', {}, pieceArt(d, 0, 40).toCanvas(), h('figcaption', { text: 'Physical fragment' })));
    } finally { setArtDirection(before); }
    modal({ title: 'Linked ingredient — ' + key, body: [body, h('p', { text: 'The actual game generators, using the draft palette. Physical parameters and identity data are preserved.' })] });
  }
  async togglePanel(panel) {
    const hidden = this.el.classList.toggle('art-hide-' + panel);
    this.hiddenPanels = hidden ? [...new Set([...this.hiddenPanels, panel])] : this.hiddenPanels.filter((p) => p !== panel);
    try { await putSetting('hidden-panels', this.hiddenPanels); } catch { /* Authoring works without persistent layout. */ }
  }
  async saveLayout() {
    if (!this.mounted) return;
    const layout = {}; for (const [key, el] of [['--art-left', this.library], ['--art-right', this.inspector], ['--art-bottom', this.bottom]]) { const n = key === '--art-bottom' ? el.clientHeight : el.clientWidth; if (n > 0) { layout[key] = Math.round(n) + 'px'; this.el.style.setProperty(key, layout[key]); } }
    try { await putSetting('layout', layout); } catch { /* Layout persistence must not interrupt authoring. */ }
  }
  unmount() {
    this.domainEditor?.destroy(); this.domainEditor = null;
    this.mounted = false; this.stroke = null; this.nodeDrag = null; this.space = false; cancelAnimationFrame(this.drawRequest); clearInterval(this.playTimer); this.playTimer = null; clearTimeout(this.layoutTimer);
    window.removeEventListener('keyup', this.keyUpHandler); window.removeEventListener('blur', this.blurHandler);
    window.removeEventListener('keydown', this.keyHandler); window.removeEventListener('beforeunload', this.unload); this.observer?.disconnect();
    this.bitmapCanvas = null; this.componentKey = ''; this.el.remove();
  }
}
