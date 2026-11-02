// Domain editors share the Studio document, transactions, history and runtime profile.
import { h, btn, clear } from '../ui/dom.js';
import { compileProfile, newComponent, newNode, clone, newLayer } from './model.js';
import { REGIONS, MATERIALS, EFFECT_NAMES, CREATURES, visualStyle, creatureStyle, environmentStyle } from './domain-model.js';
import { withArtProfile } from './direction.js';
import { describe } from '../visual/descriptor.js';
import { archetypeIdentity } from '../visual/pieces.js';
import { WILD_SPECS } from '../materials/wild.js';
import { growthParams } from '../visual/growth.js';
import { plantFrame, iconFrame, pieceArt } from '../visual/render.js';
import { FAMILIES } from '../visual/families/index.js';
import { sceneOf } from '../visual/env/scene.js';
import { animateRegion } from '../rendering/wild-scene.js';
import { drawRabbit } from '../rendering/rabbit.js';
import { kindLook } from '../game/kinds.js';
import { rollLook } from '../game/colony.js';
import { Rng } from '../core/rng.js';
import { Simulation } from '../simulation/world.js';
import { Renderer } from '../rendering/renderer.js';
import { REF, refLookup } from '../materials/reference.js';
import { PHASE } from '../simulation/constants.js';
import { NE } from '../alchemy/effects.js';
import { ICON_NAMES, iconUrl } from '../ui/icons.js';
import { interfaceDecoration } from './interface-runtime.js';
import { wordColor } from './pixels.js';
let nextToken = -1;
const POSES = ['idle', 'hop', 'rear', 'eat', 'loaf', 'hurt', 'sick', 'flop', 'collapse', 'dead'];
const TRAITS = ['', 'horns', 'antlers', 'unihorn', 'wings', 'scales', 'eye3', 'spines', 'tail-lizard', 'giant', 'tiny'];
export class DomainWorkspace {
  constructor(studio) {
    this.studio = studio; this.kind = studio.workspace; this.target = this.targets()[0]; this.seed = 1;
    this.stage = 2; this.pose = 'idle'; this.trait = ''; this.level = 0; this.effect = 'vitality'; this.hp = 0; this.play = this.kind !== 'ingredients' && this.kind !== 'interface';
    this.terrainTool = 'rock'; this.terrainColor = '#5e665f'; this.radius = 8; this.mask = false; this.time = 0; this.last = 0;
    this.render(); this.frame = requestAnimationFrame((t) => this.loop(t));
  }
  targets() { return this.kind === 'ingredients' ? WILD_SPECS.map((s) => s.key) : this.kind === 'environments' ? REGIONS : this.kind === 'creatures' ? CREATURES : this.kind === 'materials' ? MATERIALS : this.kind === 'effects' ? EFFECT_NAMES : ICON_NAMES; }
  config() {
    const d = this.studio.project.domains;
    if (this.kind === 'interface') return d.interface;
    if (!d[this.kind][this.target]) d[this.kind][this.target] = this.kind === 'ingredients' ? { morph: {}, growth: {}, asset: '' } : this.kind === 'environments' ? environmentStyle() : this.kind === 'creatures' ? creatureStyle() : { ...visualStyle(), ...(this.kind === 'effects' ? { density: 1, size: 1, shape: 'native' } : {}) };
    return d[this.kind][this.target];
  }
  scope(fn) {
    const key = this.profileKey || JSON.stringify(this.studio.project);
    if (!this.profileKey) { this.profileKey = key; this.profile = compileProfile(this.studio.project); this.token = nextToken--; }
    return withArtProfile(this.profile, this.token, fn);
  }
  change(label, fn) { this.studio.edit(label, fn); }
  field(label, obj, key, min, max, step = 0.1) { return this.studio.field(label, obj[key], (v) => this.change(label, () => { obj[key] = v; }), 'number', { min, max, step }); }
  color(label, obj, key) { return this.studio.field(label, obj[key], (v) => this.change(label, () => { obj[key] = v; }), 'color'); }
  select(label, value, choices, fn) { return this.studio.select(label, value, choices.map((v) => Array.isArray(v) ? v : [v, v]), fn); }
  render() {
    const s = this.studio; if (!s.mounted) return;
    this.profileKey = null;
    clear(s.center); clear(s.inspector); clear(s.bottom);
    this.el = h('div', { class: 'art-domain', 'data-domain': this.kind });
    this.canvas = h('canvas', { width: 384, height: 216, class: 'art-domain-canvas', 'aria-label': this.kind + ' live preview' });
    const cfg = this.config(), toolbar = h('div', { class: 'art-domain-toolbar' },
      this.select('Domain target', this.target, this.targets(), (v) => { this.target = v; this.sim = null; this.render(); }),
      this.kind === 'interface' ? null : s.field('Preview seed', this.seed, (v) => { this.seed = Math.max(0, Math.floor(v)) >>> 0; this.sim = null; this.render(); }, 'number', { min: 0, max: 4294967295 }),
      this.kind === 'interface' ? null : btn(this.play ? 'Pause animation' : 'Play animation', () => { this.play = !this.play; this.render(); }, { act: 'domain-play' }),
      this.kind === 'interface' ? null : btn('Regenerate unlocked', () => { this.seed = (this.seed + 1) >>> 0; this.sim = null; this.render(); }, { act: 'domain-regenerate' }));
    this.el.append(toolbar, this.canvas); s.center.append(this.el);
    s.inspector.append(h('h2', { text: this.kind + ' properties' }));
    this.messages = h('div', { class: 'art-domain-messages', role: 'status' }); s.bottom.append(this.messages);
    if (this.kind === 'ingredients') this.ingredients(cfg);
    if (this.kind === 'environments') this.environments(cfg);
    if (this.kind === 'creatures') this.creatures(cfg);
    if (this.kind === 'materials' || this.kind === 'effects') this.materials(cfg);
    if (this.kind === 'interface') this.interface(cfg);
    this.draw();
  }
  ingredients(cfg) {
    const s = this.studio, inspector = s.inspector;
    const id = archetypeIdentity(this.target); id.seed = this.seed;
    const d = this.scope(() => describe(id)), growth = this.scope(() => growthParams(d));
    inspector.append(this.select('Growth stage', String(this.stage), [['0', 'Sprout'], ['1', 'Ripe'], ['2', 'Mature']], (v) => { this.stage = +v; this.render(); }),
      this.select('Game construction', cfg.asset, [['', 'Native family grammar'], ...s.project.assets.map((a) => [a.id, a.name])], (v) => this.change('Bind species construction', () => { cfg.asset = v; })),
      btn('Use current component graph for this species', () => this.change('Bind graph to species', () => { cfg.asset = s.asset.id; }), { act: 'domain-bind-species' }),
      btn('Use current graph for this native family', () => this.change('Bind procedural family', () => { for (const spec of WILD_SPECS) if (describe(archetypeIdentity(spec.key)).family === d.family) s.project.domains.ingredients[spec.key] = { ...(s.project.domains.ingredients[spec.key] || { morph: {}, growth: {} }), asset: s.asset.id }; }), { act: 'domain-bind-family' }),
      h('p', { text: `Native family: ${d.family}. Its geometry, growth, icons and shards use the same identity. Parameter edits change the native generator; graph binding replaces the shared construction.` }));
    for (const [name, source, target] of [['Morphology', d.m, cfg.morph], ['Growth grammar', growth, cfg.growth]]) {
      const details = h('details', { open: true }, h('summary', { text: name }));
      for (const [key, value] of Object.entries(source)) {
        if (typeof value === 'number') details.append(s.field(name + ': ' + key, target[key] ?? value, (v) => this.change('Native ' + key, () => { target[key] = v; }), 'number', { min: 0, max: 120, step: 0.1 }));
        else if (typeof value === 'boolean') details.append(s.check(name + ': ' + key, target[key] ?? value, (v) => this.change('Native ' + key, () => { target[key] = v; })));
        else if (typeof value === 'string') details.append(s.field(name + ': ' + key, target[key] ?? value, (v) => this.change('Native ' + key, () => { target[key] = v; })));
      }
      inspector.append(details);
    }
    inspector.append(btn('Extract native icon geometry', () => this.extractNative(d), { act: 'domain-extract-native' }), btn('Reset native overrides', () => this.change('Reset native', () => { cfg.morph = {}; cfg.growth = {}; cfg.asset = ''; })));
    this.messages.textContent = 'Linked views: selected growth stage, icon and four physical fragments. Growth stage and variant seed are visual previews; game progression is unchanged.';
  }
  extractNative(d) {
    const model = FAMILIES[d.family].icon(d); model.fit(30, 30, { margin: 1 });
    const c = newComponent(d.id.key + ' native geometry', 'blank'); c.tags = d.family; c.geometry = [];
    for (const p of model.parts.slice(0, 32)) {
      if (!p.pts || p.pts.length < 3 || c.geometry.length >= 32) continue;
      const ramp = d.pal[p.mat], color = wordColor(ramp[Math.floor(ramp.length / 2)]);
      c.geometry.push({ shape: 'polygon', x: 16, y: 16, width: 32, height: 32, color, points: p.pts.slice(0, 64).map(([x, y]) => [Math.max(0, Math.min(32, x)), Math.max(0, Math.min(32, y))]) });
    }
    if (!c.geometry.length) { const p = iconFrame(d).pix; c.layers[0].pixels = Array.from(p.px); }
    this.change('Extract native reusable geometry', () => { this.studio.asset.components.push(c); this.studio.componentId = c.id; });
    this.studio.workspace = 'components'; this.destroy(); this.studio.domainEditor = null; this.studio.refresh();
  }
  environments(cfg) {
    const s = this.studio, i = s.inspector; cfg.lights ??= [];
    i.append(this.select('Terrain tool', this.terrainTool, ['rock', 'soil', 'erase', 'water', 'lava', 'place', 'light'], (v) => { this.terrainTool = v; this.render(); }),
      s.field('Terrain brush radius', this.radius, (v) => { this.radius = v; }, 'number', { min: 1, max: 32 }),
      s.field('Terrain material color', this.terrainColor, (v) => { this.terrainColor = v; }, 'color'),
      s.check('Show structural masks', this.mask, (v) => { this.mask = v; this.draw(); }),
      this.color('Background tint', cfg, 'tint'), this.field('Background tint strength', cfg, 'mix', 0, 1), this.field('Vegetation density', cfg, 'density', 0, 2), this.field('Environment lighting', cfg, 'light', 0.1, 2), this.field('Atmospheric density', cfg, 'atmosphere', 0, 3),
      this.select('Placement asset', this.placeAsset || s.asset.id, s.project.assets.map((a) => [a.id, a.name]), (v) => { this.placeAsset = v; }),
      btn('Clear terrain edits', () => this.change('Clear terrain', () => { cfg.strokes = []; }), { act: 'domain-clear-terrain' }));
    for (const [index, o] of cfg.objects.entries()) {
      i.append(h('h3', { text: `Object ${index + 1}` }), this.field('Object X ' + index, o, 'x', 0, 383, 1), this.field('Object Y ' + index, o, 'y', 0, 215, 1), this.field('Object scale ' + index, o, 'scale', 0.1, 2),
        s.check('Lock object ' + index, o.locked, (v) => this.change('Lock scene object', () => { o.locked = v; })), btn('Remove object ' + index, () => this.change('Remove scene object', () => cfg.objects.splice(index, 1))));
    }
    for (const [index, l] of cfg.lights.entries()) i.append(h('h3', { text: 'Light ' + (index + 1) }), this.field('Light X ' + index, l, 'x', 0, 383, 1), this.field('Light Y ' + index, l, 'y', 0, 215, 1), this.field('Light radius ' + index, l, 'radius', 2, 120, 1), this.field('Light strength ' + index, l, 'strength', 0, 2), this.color('Light color ' + index, l, 'color'), btn('Remove light ' + index, () => this.change('Remove localized light', () => cfg.lights.splice(index, 1))));
    const point = (e) => { const b = this.canvas.getBoundingClientRect(); return [Math.max(0, Math.min(383, Math.round((e.clientX - b.left) * 384 / b.width))), Math.max(0, Math.min(215, Math.round((e.clientY - b.top) * 216 / b.height)))]; };
    this.canvas.onpointerdown = (e) => {
      e.preventDefault(); this.canvas.setPointerCapture(e.pointerId); const p = point(e);
      if (this.terrainTool === 'light') { this.change('Place localized light', () => cfg.lights.push({ x: p[0], y: p[1], radius: 35, color: this.terrainColor, strength: 0.8 })); return; }
      if (this.terrainTool === 'place') { this.change('Place scene object', () => cfg.objects.push({ asset: this.placeAsset || s.asset.id, x: p[0], y: p[1], scale: 1, seed: this.seed, locked: true })); return; }
      this.stroke = { kind: this.terrainTool, color: this.terrainColor, radius: this.radius, points: [p] }; this.draw();
    };
    this.canvas.onpointermove = (e) => { if (this.stroke && this.stroke.points.length < 1024) { this.stroke.points.push(point(e)); this.draw(); } };
    this.canvas.onpointerup = () => { if (!this.stroke) return; const stroke = this.stroke; this.stroke = null; this.change('Sculpt ' + stroke.kind, () => cfg.strokes.push(stroke)); };
    this.canvas.onpointercancel = () => { this.stroke = null; this.draw(); };
    this.messages.textContent = 'Paint changes solid/liquid/rock/open masks. Place snaps to a dry free surface and rejects overlap with terrain or existing props. Locked objects retain their generation seed.';
  }
  creatures(cfg) {
    const s = this.studio, i = s.inspector;
    for (const part of ['body', 'head', 'ears', 'legs', 'tail']) i.append(this.field('Anatomy: ' + part, cfg, part, 0.65, 1.3, 0.05));
    i.append(s.check('Override fur colors', cfg.recolor, (v) => this.change('Fur override', () => { cfg.recolor = v; })), this.color('Fur color', cfg, 'coat'), this.color('Fur markings', cfg, 'coat2'),
      this.select('Fur pattern', cfg.pattern, ['', 'solid', 'spotted', 'dutch', 'points', 'dapple', 'tabby', 'warts', 'blotched', 'badger', 'fox', 'ermine', 'spiral'], (v) => this.change('Fur pattern', () => { cfg.pattern = v; })),
      this.select('Animation pose', this.pose, POSES, (v) => { this.pose = v; this.render(); }), this.field('Animation speed', cfg, 'speed', 0.1, 3),
      this.select('Mutation preview', this.trait, TRAITS, (v) => { this.trait = v; this.draw(); }), this.select('Effect preview', this.effect, EFFECT_NAMES, (v) => { this.effect = v; }),
      s.field('Effect visual stage', this.level, (v) => { this.level = v; this.draw(); }, 'number', { min: 0, max: 3, step: 1 }), s.field('Injury preview', this.hp, (v) => { this.hp = v; this.draw(); }, 'number', { min: 0, max: 3, step: 1 }));
    const pose = cfg.poses[this.pose] || { headX: 0, headY: 0, ear: 0 };
    for (const key of ['headX', 'headY', 'ear']) i.append(s.field('Pose key: ' + key, pose[key], (v) => this.change('Pose keyframe', () => { cfg.poses[this.pose] = { ...pose, [key]: v }; }), 'number', { min: -5, max: 5, step: 0.5 }));
    const timeline = h('div', { class: 'art-animation-timeline' }); for (const pose of POSES) timeline.append(btn(pose, () => { this.pose = pose; this.render(); }, { cls: this.pose === pose ? 'active' : '' }));
    s.bottom.append(timeline); this.messages.textContent = 'The actual anchor-based renderer, including poses, effects, injuries and permanent mutations. Anatomy stays within its 48×40 visual frame; collision and health rules are unchanged.';
  }
  materials(cfg) {
    const i = this.studio.inspector;
    i.append(this.color('Material/effect tint', cfg, 'tint'));
    for (const [label, key, min, max] of [['Tint strength', 'mix', 0, 1], ['Opacity', 'opacity', 0.1, 1], ['Texture granularity', 'grain', 0, 3], ['Emission', 'emission', 0, 2], ['Visual animation speed', 'speed', 0.1, 3]]) i.append(this.field(label, cfg, key, min, max));
    if (this.kind === 'effects') i.append(this.field('Particle density', cfg, 'density', 0.1, 3), this.field('Particle size', cfg, 'size', 0.5, 3), this.select('Particle shape', cfg.shape, ['native', 'square', 'spark', 'cross'], (v) => this.change('Particle shape', () => { cfg.shape = v; })));
    i.append(btn('Heat sample', () => { this.ensureSimulation(); this.sim.furnace.setting = 1; }), btn('Freeze sample', () => { this.ensureSimulation(); this.sim.furnace.setting = -1; }), btn('Crush sample', () => { this.ensureSimulation(); this.sim.tool.type = 'pestle'; this.sim.tool.auto = true; }), btn('Reset preview', () => { this.sim = null; this.draw(); }));
    this.messages.textContent = 'Isolated real simulation and renderer preview. These settings change pixels, not densities, viscosity, reaction constants, temperatures or magical effect strengths in the game.';
  }
  interface(cfg) {
    const s = this.studio, i = s.inspector;
    i.append(s.check('Enable interface profile', cfg.enabled, (v) => this.change('Interface profile', () => { cfg.enabled = v; })), this.color('Interface accent', cfg, 'accent'), this.color('Panel background', cfg, 'panel'), this.color('Interface text', cfg, 'ink'), this.field('Border / nine-slice width', cfg, 'border', 0, 8, 1), this.field('Transition duration (ms)', cfg, 'duration', 0, 1000, 10));
    for (const type of ['frame', 'button']) i.append(this.select(type + ' artwork', cfg[type], [['', 'Native decoration'], ...s.project.assets.map((a) => [a.id, a.name])], (v) => this.change('Bind ' + type, () => { cfg[type] = v; cfg.enabled = true; })));
    i.append(this.select('Icon artwork', cfg.icons[this.target] || '', [['', 'Native icon'], ...s.project.assets.map((a) => [a.id, a.name])], (v) => this.change('Bind UI icon', () => { if (v) cfg.icons[this.target] = v; else delete cfg.icons[this.target]; cfg.enabled = true; })),
      this.select('Responsive preview width', String(this.uiWidth || 390), ['320', '390', '820'], (v) => { this.uiWidth = +v; this.render(); }));
    this.example = h('section', { class: 'art-ui-example', style: { width: (this.uiWidth || 390) + 'px', maxWidth: '100%' } }, h('h2', { text: 'Potion inventory' }), h('p', { text: 'Responsive nine-slice frame and live button states' }), h('div', { class: 'row' }, ...['Brew', 'Gather', 'Disabled'].map((label) => btn(label, () => { this.messages.textContent = label + ' button state preview'; }, { disabled: label === 'Disabled' }))));
    this.canvas.hidden = true; this.el.append(this.example);
    this.messages.textContent = 'Artwork and decorative borders are separate from game layout and event handlers. Hover, pressed and disabled states are live.';
  }
  ensureSimulation() {
    if (this.sim) {
      if (this.renderer?.canvas !== this.canvas) { this.renderer = new Renderer(this.canvas); this.renderer.quality = 'low'; this.renderer.resize(384, 216, this.sim.cauldron, [], 'low'); }
      return;
    }
    this.sim = new Simulation({ size: 'small', lookup: refLookup });
    const sample = this.kind === 'effects' ? 'water' : ({ liquid: 'water', powder: 'sand', paste: 'honey', solid: 'crystal', gas: 'smoke', frozen: 'water' }[this.target]);
    this.sim.emitter.start(REF[sample], { x: ((this.seed % 7) - 3) * 0.08, amount: 100, rate: 1000 });
    for (let i = 0; i < 150; i++) this.sim.step();
    if (this.target === 'paste') this.sim.p.phase.fill(PHASE.PASTE, 0, this.sim.p.count);
    if (this.target === 'frozen') { this.sim.p.temp.fill(-30); this.sim.furnace.setting = -1; }
    this.renderer = new Renderer(this.canvas); this.renderer.quality = 'low'; this.renderer.resize(384, 216, this.sim.cauldron, [], 'low');
  }
  requestScene() {
    const key = this.token + ':' + this.target + ':' + this.seed;
    if (this.sceneKey === key) return;
    if (this.workerFailed || typeof Worker === 'undefined') { this.scene = sceneOf(this.target, String(this.seed)); this.sceneKey = key; this.sceneCanvas = this.scene.pix.toCanvas(); return; }
    if (!this.worker) {
      const bundled = !!document.querySelector('script[src*="app."]');
      this.worker = new Worker(new URL(bundled ? 'studio-worker.js' : 'src/studio/worker.js', document.baseURI), { type: 'module' });
      this.worker.onmessage = ({ data }) => {
        this.workerBusy = false;
        if (data.error) { this.workerFailed = true; this.worker.terminate(); this.worker = null; this.draw(); return; }
        if (data.key === this.token + ':' + this.target + ':' + this.seed) {
          const cv = document.createElement('canvas'); cv.width = data.w; cv.height = data.h;
          cv.getContext('2d').putImageData(new ImageData(data.data, data.w, data.h), 0, 0);
          this.scene = data; this.sceneKey = data.key; this.sceneCanvas = cv; this.draw();
        }
        if (this.nextScene) { const next = this.nextScene; this.nextScene = null; this.workerBusy = true; this.worker.postMessage(next); }
      };
      this.worker.onerror = () => { this.workerFailed = true; this.worker.terminate(); this.worker = null; this.workerBusy = false; this.draw(); };
    }
    const job = { key, region: this.target, seed: this.seed, profile: this.profile };
    if (this.requestedKey === key) return;
    this.requestedKey = key;
    if (this.workerBusy) this.nextScene = job;
    else { this.workerBusy = true; this.worker.postMessage(job); }
  }
  loop(t) { if (!this.studio.mounted) return; const dt = Math.min(0.04, this.last ? (t - this.last) / 1000 : 0); this.last = t; if (this.play) { this.time += dt; if (this.kind === 'ingredients') { const stage = Math.floor(this.time / 1.2) % 3; if (stage !== this.stage) { this.stage = stage; const control = this.studio.inspector.querySelector('[aria-label="Growth stage"]'); if (control) control.value = String(stage); this.draw(); } } else if (['creatures', 'materials', 'effects', 'environments'].includes(this.kind)) this.draw(dt); } this.frame = requestAnimationFrame((t) => this.loop(t)); }
  draw(dt = 0) {
    if (!this.canvas || !this.studio.mounted) return;
    this.scope(() => {
      const ctx = this.canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 384, 216); ctx.fillStyle = '#16232e'; ctx.fillRect(0, 0, 384, 216);
      if (this.kind === 'ingredients') {
        const id = archetypeIdentity(this.target); id.seed = this.seed; const d = describe(id);
        const frames = [plantFrame(d, this.stage), iconFrame(d), ...[0, 1, 2, 3].map((v) => ({ pix: pieceArt(d, v, 40) }))];
        for (const [i, frame] of frames.entries()) { const size = i === 0 ? 100 : 42, x = i === 0 ? 20 : 140 + (i - 1) * 46; ctx.drawImage(frame.pix.toCanvas(), x, 120 - size, size, size); }
        ctx.fillStyle = '#d7e4ce'; ctx.font = '9px sans-serif'; ctx.fillText('Growth stage        Icon           Four physical fragments', 20, 150);
      } else if (this.kind === 'environments') {
        this.requestScene(); const sc = this.scene;
        if (!sc || !this.sceneCanvas) return;
        ctx.drawImage(this.sceneCanvas, 0, 0); if (this.play) animateRegion(ctx, this.target, this.time, String(this.seed), sc);
        if (this.mask) { ctx.fillStyle = '#ff606060'; for (let k = 0; k < sc.solid.length; k++) if (sc.solid[k]) ctx.fillRect(k % 384, Math.floor(k / 384), 1, 1); ctx.fillStyle = '#44ffbb'; for (let k = 0; k < sc.open.length; k++) if (sc.open[k]) ctx.fillRect(k % 384, Math.floor(k / 384), 1, 1); }
        if (this.stroke) { ctx.fillStyle = this.stroke.kind === 'erase' ? '#101f2b88' : this.stroke.color; for (const [x, y] of this.stroke.points) { ctx.beginPath(); ctx.arc(x, y, this.stroke.radius, 0, Math.PI * 2); ctx.fill(); } }
        if (sc.meta.artWarnings?.length) this.messages.textContent = sc.meta.artWarnings.join(' · ');
      } else if (this.kind === 'creatures') {
        const rng = new Rng(this.seed), look = this.target === 'rabbit' ? rollLook(rng) : kindLook(/** @type {import('../game/kinds.js').AnimalKind} */ (this.target), rng);
        const snap = { alive: this.pose !== 'dead', stage: 'adult', hp: this.hp, lv: EFFECT_NAMES.map((e) => e === this.effect ? this.level : 0), sc: Array(11).fill(this.hp), traits: this.trait ? [this.trait] : [] };
        ctx.save(); ctx.translate(90, 20); ctx.scale(4, 4); drawRabbit(ctx, look, snap, this.time, 0, { pose: this.pose, floor: true }); ctx.restore();
      } else if (this.kind === 'materials' || this.kind === 'effects') {
        this.ensureSimulation(); if (dt) this.sim.advance(dt, 1, 4);
        if (this.kind === 'effects') for (let i = 0; i < this.sim.p.count; i++) { this.sim.p.auraI[i] = 1; for (let k = 0; k < NE; k++) this.sim.p.auraFx[i * NE + k] = EFFECT_NAMES[k] === this.target ? 1 : 0; }
        this.renderer.render({ sim: this.sim, time: this.time, dt, pour: { active: false, x: 0, def: null }, tool: { type: 'spoon', x: 0, y: 0, active: false } });
      } else if (this.example) {
        const cfg = this.config(); Object.assign(this.example.style, { color: cfg.ink, background: cfg.panel, border: `${cfg.border}px solid ${cfg.accent}`, borderImage: interfaceDecoration(cfg, 'frame') });
        for (const b of this.example.querySelectorAll('button')) Object.assign(b.style, { background: cfg.accent, color: cfg.ink, borderImage: interfaceDecoration(cfg, 'button'), transitionDuration: cfg.duration + 'ms' });
        if (!this.example.querySelector('img')) { const image = h('img', { width: 24, height: 24, src: iconUrl(this.target, 2), alt: this.target }); this.example.prepend(image); }
      }
    });
  }
  destroy() { this.worker?.terminate(); this.worker = null; this.nextScene = null; cancelAnimationFrame(this.frame); this.frame = null; this.sim = null; this.renderer = null; }
}
