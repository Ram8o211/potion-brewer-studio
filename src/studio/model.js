// Versioned, bounded authoring documents. No DOM, eval, URLs or gameplay data.
import { newDomains, validateDomains } from './domain-model.js';
export const FORMAT = 'potion-art-studio';
export const VERSION = 2;
export const CATEGORIES = ['Ingredients and plants', 'Crystals and minerals', 'Trees and vegetation', 'Terrain and environments', 'Creatures and rabbits', 'Buildings and props', 'Liquids, powders and vapours', 'Magical and physical effects', 'UI and icons'];
export const STAGES = ['Sprout', 'Ripe', 'Mature'];
export const clone = (value) => JSON.parse(JSON.stringify(value));
/** @returns {string} */
export const uid = () => globalThis.crypto?.randomUUID?.() || `art-${Date.now()}-${Math.random().toString(36).slice(2)}`;
/** @param {string} [name] */
export function newLayer(name = 'Pixel corrections') {
  return { id: uid(), name, visible: true, opacity: 1, scope: 'all', variant: 0, stage: 2, pixels: Array(32 * 32).fill(0) };
}
export function newComponent(name = 'Component', shape = 'leaf') {
  return { id: uid(), name, tags: '', width: 32, height: 32, anchor: [16, 28], tip: [16, 4],
    geometry: shape === 'blank' ? [] : [{ shape, color: '#76b98a', width: 12, height: 24, x: 16, y: 16 }], layers: [newLayer()] };
}
export function newNode(component, parent = '') {
  return { id: uid(), component, parent, name: 'Attach component', count: 1, x: 0, y: 0, angle: 0, scale: 1, jitter: 0, spread: 0, probability: 1, minStage: 0, maxStage: 2, mirror: false, locked: false, lockSeed: 1, avoidOverlap: false, weight: 1, choice: '', anchor: 'tip' };
}
export function newAsset(name = 'Untitled plant') {
  const stem = newComponent('Stem', 'stem'), leaf = newComponent('Leaf');
  stem.geometry[0].color = '#497c56';
  const root = newNode(stem.id); root.name = 'Stem'; root.x = 48; root.y = 86;
  const leaves = newNode(leaf.id, root.id); leaves.name = 'Leaves'; leaves.count = 3; leaves.spread = 12; leaves.angle = -45; leaves.jitter = 8; leaves.mirror = true; leaves.scale = 0.7; leaves.minStage = 1;
  return { id: uid(), name, category: CATEGORIES[0], folder: 'My collection', tags: '', seed: 1, width: 96, height: 96, components: [stem, leaf], nodes: [root, leaves], stages: [0.5, 0.8, 1] };
}
export function newProject(name = 'Untitled art project') {
  return { format: FORMAT, version: VERSION, id: uid(), name, assets: [newAsset()], palette: ['#172331', '#35594a', '#76b98a', '#e5d4a1', '#ad718d', '#77b7ce'],
    presets: [], domains: newDomains(), direction: { global: { tint: '#ffffff', mix: 0, saturation: 1, contrast: 1 }, biomes: {}, families: {}, species: {} }, updated: Date.now() };
}
const fail = (message) => { throw new Error(`Invalid art project: ${message}`); };
const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, n = 120) => typeof v === 'string' && v.length <= n;
const num = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const color = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
/** Validate untrusted input before cloning it into application state. @param {any} input */
export function validateProject(input) {
  if (!obj(input) || input.format !== FORMAT) fail('not a Potion Art Studio file');
  if (input.version !== VERSION) fail(`unsupported version ${input.version}`);
  if (!text(input.id) || !text(input.name) || !Array.isArray(input.assets) || input.assets.length < 1 || input.assets.length > 64) fail('project metadata or asset count');
  if (!Array.isArray(input.palette) || input.palette.length < 1 || input.palette.length > 64 || !input.palette.every(color)) fail('palette');
  const ids = new Set(); let budget = 0;
  for (const a of input.assets) {
    if (!obj(a) || (!text(a.id) || !a.id) || ids.has(a.id) || !text(a.name) || !text(a.category) || !text(a.folder) || !text(a.tags, 500) || !num(a.seed, 0, 4294967295) || a.width !== 96 || a.height !== 96) fail('asset metadata');
    ids.add(a.id);
    if (!Array.isArray(a.components) || !a.components.length || a.components.length > 64 || !Array.isArray(a.nodes) || a.nodes.length > 128) fail('component/node count');
    if (!Array.isArray(a.stages) || a.stages.length !== 3 || !a.stages.every((s) => num(s, 0.1, 2))) fail('growth stages');
    const components = new Set(), nodes = new Map();
    for (const c of a.components) {
      if (!obj(c) || (!text(c.id) || !c.id) || components.has(c.id) || !text(c.name) || !text(c.tags, 500) || c.width !== 32 || c.height !== 32) fail('component metadata');
      components.add(c.id);
      for (const p of [c.anchor, c.tip]) if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => num(n, 0, 32))) fail('anchors');
      if (!Array.isArray(c.geometry) || c.geometry.length > 32 || !Array.isArray(c.layers) || c.layers.length > 16) fail('geometry/layer count');
      for (const g of c.geometry) if (!obj(g) || !['leaf', 'stem', 'ellipse', 'rectangle', 'crystal', 'polygon'].includes(g.shape) || !color(g.color) || !num(g.width, 1, 32) || !num(g.height, 1, 32) || !num(g.x, 0, 32) || !num(g.y, 0, 32)) fail('geometry');
      for (const g of c.geometry) if (g.shape === 'polygon' && (!Array.isArray(g.points) || g.points.length < 3 || g.points.length > 64 || !g.points.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => num(n, 0, 32))))) fail('polygon points');
      for (const k of ['texture', 'lighting', 'irregularity', 'paletteVariation']) if (c[k] !== undefined && !num(c[k], 0, 2)) fail('component material');
      const layerIds = new Set();
      for (const l of c.layers) {
        if (!obj(l) || (!text(l.id) || !l.id) || layerIds.has(l.id) || !text(l.name) || typeof l.visible !== 'boolean' || !num(l.opacity, 0, 1) || !['all', 'variant', 'stage'].includes(l.scope) || !num(l.variant, 0, 4294967295) || !Number.isInteger(l.stage) || !num(l.stage, 0, 2)) fail('layer metadata');
        layerIds.add(l.id);
        if (!Array.isArray(l.pixels) || l.pixels.length !== 1024 || !l.pixels.every((p) => Number.isInteger(p) && p >= -1 && p <= 4294967295)) fail('pixel data');
        budget += 1024;
      }
    }
    for (const n of a.nodes) {
      if (!obj(n) || (!text(n.id) || !n.id) || nodes.has(n.id) || !components.has(n.component) || !text(n.name) || !text(n.parent) || !text(n.choice) || !['tip', 'anchor'].includes(n.anchor)) fail('graph references');
      for (const [k, lo, hi] of [['count', 1, 16], ['x', -192, 192], ['y', -192, 192], ['angle', -360, 360], ['scale', 0.1, 4], ['jitter', 0, 90], ['spread', 0, 64], ['probability', 0, 1], ['weight', 0, 100], ['minStage', 0, 2], ['maxStage', 0, 2], ['lockSeed', 0, 4294967295]]) if (!num(n[k], lo, hi)) fail(`rule ${k}`);
      if (!Number.isInteger(n.count) || !Number.isInteger(n.minStage) || !Number.isInteger(n.maxStage) || n.minStage > n.maxStage) fail('rule range');
      for (const k of ['mirror', 'locked', 'avoidOverlap']) if (typeof n[k] !== 'boolean') fail(k);
      nodes.set(n.id, n);
    }
    for (const n of a.nodes) {
      const path = new Set([n.id]); let p = n.parent;
      while (p) { if (path.has(p) || !nodes.has(p)) fail('cyclic or missing parent'); path.add(p); p = nodes.get(p).parent; }
    }
  }
  if (input.presets !== undefined) {
    if (!Array.isArray(input.presets) || input.presets.length > 32) fail('style presets');
    for (const preset of input.presets) {
      if (!text(preset.name) || !obj(preset.style)) fail('preset name');
      validateStyle(preset.style.global);
      for (const type of ['biomes', 'families', 'species']) {
        if (!obj(preset.style[type]) || Object.keys(preset.style[type]).length > 100) fail('preset overrides');
        for (const style of Object.values(preset.style[type])) validateStyle(style);
      }
    }
  }
  validateDomains(input.domains, input.assets);
  if (budget > 1048576) fail('pixel memory limit (1M pixels)');
  if (!obj(input.direction)) fail('art direction');
  validateStyle(input.direction.global);
  for (const k of ['biomes', 'families', 'species']) {
    const entries = input.direction[k];
    if (!obj(entries) || Object.keys(entries).length > 100) fail('style overrides');
    for (const [key, v] of Object.entries(entries)) { if (!text(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe key'); validateStyle(v); }
  }
  // Disallow prototype-bearing keys at every depth, including future extension data.
  JSON.stringify(input, (k, v) => { if (['__proto__', 'constructor', 'prototype'].includes(k)) fail('unsafe key'); return v; });
  return input;
}
export function validateStyle(s) {
  if (!obj(s) || !color(s.tint) || !num(s.mix, 0, 1) || !num(s.saturation, 0, 2) || !num(s.contrast, 0.2, 2)) fail('style values');
}
/** Explicit migration for the pre-release v0 document; no guesses for future schemas. */
export function parseProject(json) {
  if (typeof json !== 'string' || json.length > 16 * 1024 * 1024) fail('file exceeds 16 MB');
  const p = JSON.parse(json);
  if (p?.format === FORMAT && p.version === 0) { p.version = 1; for (const a of p.assets || []) { a.folder ??= ''; a.tags ??= ''; } }
  return upgradeProject(p);
}

export function upgradeProject(input) {
  const p = clone(input);
  if (p?.format === FORMAT && p.version === 1) { p.version = 2; p.domains = newDomains(); }
  return clone(validateProject(p));
}
export function compileProfile(project) {
  validateProject(project);
  return clone({ ...project.direction, domains: project.domains, assets: project.assets });
}

/** Full snapshots, bounded by both entries and serialized bytes. */
export class History {
  constructor(maxBytes = 8 * 1024 * 1024) { this.maxBytes = maxBytes; this.undoStack = []; this.redoStack = []; }
  push(project, label) {
    const json = JSON.stringify(project);
    if (json.length * 2 > this.maxBytes) throw new Error('Project exceeds the undo memory budget. Split it into smaller projects before editing.');
    this.undoStack.push({ json, label }); this.redoStack = [];
    while (this.undoStack.length > 1 && (this.undoStack.length > 60 || this.undoStack.reduce((n, s) => n + s.json.length * 2, 0) > this.maxBytes)) this.undoStack.shift();
  }
  undo(project) { return this.travel(this.undoStack, this.redoStack, project); }
  redo(project) { return this.travel(this.redoStack, this.undoStack, project); }
  travel(from, to, project) {
    const s = from.pop(); if (!s) return project;
    const current = JSON.stringify(project);
    if (current.length * 2 <= this.maxBytes) to.push({ json: current, label: s.label });
    while (this.undoStack.length + this.redoStack.length > 60 || [...this.undoStack, ...this.redoStack].reduce((sum, entry) => sum + entry.json.length * 2, 0) > this.maxBytes) {
      const oldest = this.undoStack.length ? this.undoStack : this.redoStack; oldest.shift();
    }
    return JSON.parse(s.json);
  }
}
