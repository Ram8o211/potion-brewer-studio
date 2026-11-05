// Domain documents are visual-only. No densities, viscosities, reactions or saves.
import { BIOMES } from '../game/biomes.js';
import { EFFECT_KEYS } from '../alchemy/effects.js';
import { KIND_IDS } from '../game/kinds.js';
export const REGIONS = [...BIOMES.map((b) => b.id), 'garden'];
export const MATERIALS = ['liquid', 'powder', 'paste', 'solid', 'gas', 'frozen'];
export const EFFECT_NAMES = EFFECT_KEYS;
export const CREATURES = KIND_IDS;
export const visualStyle = () => ({ tint: '#ffffff', mix: 0, opacity: 1, grain: 1, emission: 0, speed: 1 });
export const creatureStyle = () => ({ body: 1, head: 1, ears: 1, legs: 1, tail: 1, coat: '#b19a7b', coat2: '#e7dfcd', recolor: false, pattern: '', speed: 1, poses: {} });
export const environmentStyle = () => ({ strokes: [], objects: [], lights: [], tint: '#253f4c', mix: 0, density: 1, light: 1, atmosphere: 1, interaction: { stiffness: 30, damping: 6, particles: 18 } });
export function newDomains() {
  return { ingredients: {}, environments: {}, creatures: {}, materials: {}, effects: {}, interface: { enabled: false, accent: '#aebf8d', panel: '#2c2429', ink: '#f5e8cc', border: 2, duration: 140, frame: '', button: '', icons: {} } };
}
const check = (ok, name) => { if (!ok) throw new Error('Invalid art domain: ' + name); };
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const color = (v) => typeof v === 'string' && /^#[a-f\d]{6}$/i.test(v);
export function validateDomains(d, assets) {
  check(object(d), 'document');
  const ids = new Set(assets.map((a) => a.id));
  for (const section of ['ingredients', 'environments', 'creatures', 'materials', 'effects']) {
    check(object(d[section]) && Object.keys(d[section]).length <= 128, section);
    for (const [key, v] of Object.entries(d[section])) {
      check(key.length <= 120 && !['__proto__', 'constructor', 'prototype'].includes(key) && object(v), section + ' key');
      if (section === 'ingredients') {
        check(!v.asset || ids.has(v.asset), 'ingredient asset');
        for (const type of ['morph', 'growth']) {
          check(object(v[type]) && Object.keys(v[type]).length <= 120, 'native parameters');
          for (const [k, value] of Object.entries(v[type])) check(k.length < 80 && (typeof value === 'boolean' || typeof value === 'string' && value.length < 80 || number(value, -1000, 1000)), 'native value');
        }
      } else if (section === 'environments') {
        check(REGIONS.includes(key) && color(v.tint) && number(v.mix, 0, 1) && number(v.density, 0, 2) && number(v.light, 0.1, 2) && number(v.atmosphere, 0, 3), 'environment settings');
        if (v.interaction) check(object(v.interaction) && number(v.interaction.stiffness, 5, 60) && number(v.interaction.damping, 2, 16) && number(v.interaction.particles, 4, 32), 'interaction physics');
        check(Array.isArray(v.strokes) && v.strokes.length <= 512 && Array.isArray(v.objects) && v.objects.length <= 128, 'environment count');
        for (const s of v.strokes) {
          check(['rock', 'soil', 'erase', 'water', 'lava'].includes(s.kind) && color(s.color) && number(s.radius, 1, 32) && Array.isArray(s.points) && s.points.length > 0 && s.points.length <= 1024, 'terrain stroke');
          for (const p of s.points) check(Array.isArray(p) && p.length === 2 && number(p[0], 0, 383) && number(p[1], 0, 215), 'terrain point');
        }
        check(Array.isArray(v.lights || []) && (v.lights || []).length <= 64, 'light count');
        for (const l of v.lights || []) check(number(l.x, 0, 383) && number(l.y, 0, 215) && number(l.radius, 2, 120) && number(l.strength, 0, 2) && color(l.color), 'localized light');
        for (const p of v.objects) check(ids.has(p.asset) && typeof p.locked === 'boolean' && number(p.x, 0, 383) && number(p.y, 0, 215) && number(p.scale, 0.1, 2) && number(p.seed, 0, 4294967295), 'scene object');
      } else if (section === 'creatures') {
        check(CREATURES.includes(key) && color(v.coat) && color(v.coat2) && typeof v.recolor === 'boolean' && typeof v.pattern === 'string' && v.pattern.length < 40, 'creature look');
        for (const k of ['body', 'head', 'ears', 'legs', 'tail']) check(number(v[k], 0.65, 1.3), 'anatomy');
        check(number(v.speed, 0.1, 3) && object(v.poses), 'animation');
        for (const pose of Object.values(v.poses)) for (const n of Object.values(pose)) check(number(n, -5, 5), 'pose key');
      } else {
        check((section === 'materials' ? MATERIALS : EFFECT_NAMES).includes(key), 'visual target');
        check(color(v.tint) && number(v.mix, 0, 1) && number(v.opacity, 0.1, 1) && number(v.grain, 0, 3) && number(v.emission, 0, 2) && number(v.speed, 0.1, 3), 'visual parameters');
        if (section === 'effects') check(number(v.density, 0.1, 3) && number(v.size, 0.5, 3) && ['native', 'square', 'spark', 'cross'].includes(v.shape), 'effect parameters');
      }
    }
  }
  const ui = d.interface;
  check(object(ui) && typeof ui.enabled === 'boolean' && color(ui.accent) && color(ui.panel) && color(ui.ink) && number(ui.border, 0, 8) && number(ui.duration, 0, 1000) && (!ui.frame || ids.has(ui.frame)) && (!ui.button || ids.has(ui.button)) && object(ui.icons), 'interface');
  for (const id of Object.values(ui.icons)) check(ids.has(id), 'icon binding');
}
