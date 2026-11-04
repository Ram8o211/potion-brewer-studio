// Finite Traveller generations share the seeded terrain, resource attachment
// maps and native animal populations. Campaign resources never regrow here;
// propagation and watering belong to the personal garden. Sandbox growth,
// touch harvesting, ragdolls, mining and the existing hunting mechanics remain.

import { UpscaledCanvas } from '../../rendering/crisp.js';
import { h, btn, clear, toast, keepScroll } from '../dom.js';
import { icon } from '../icons.js';
import { audio } from '../../audio/audio.js';
import { REGIONS, sandboxDeposit, depositStatus, formatWait, gatherPlan, harvestable, dayPart, weatherOn, moistureEnv, DAY_PART_NAME } from '../../game/gathering.js';
import { equipmentById } from '../../game/equipment.js';
import { RANKS } from '../../game/equipment.js';
import { sceneCanvas, sceneFrame, animateRegion, PlantGround, hitPlant, windAt, sceneTouch, crosses, SCENE_W, SCENE_H } from '../../rendering/wild-scene.js';
import { Ragdoll } from '../../rendering/ragdoll.js';
import { sceneOf } from '../../visual/env/scene.js';
import { plantCanvas, plantFrameOf, plantGlow, emitColour, silhouetteOf, ingredientSprite, speciesOf, mountsOf, variantOf, MIN_HIT } from '../../rendering/species-sprites.js';
import { EFFECT_BY_KEY } from '../../alchemy/effects.js';
import { hashString } from '../../core/rng.js';
import { Warren, warrenSpots, BLOOD, WILD_HP } from '../../game/wild-rabbits.js';
import { drawRabbit, rabbitSpriteKey, RABBIT_W, RABBIT_H } from '../../rendering/rabbit.js';
import { defaultSnap, penHasRoom, PEN_MAX } from '../../game/colony.js';
import { KINDS } from '../../game/kinds.js';
import { settleTraveller, TRAVEL } from '../../game/travel.js';
import { RARITIES } from '../../materials/rarity.js';
import { ExoticInteractions, FEATURE_HINTS } from '../../rendering/exotic-interactions.js';

/** The shadow a plant casts on its ground, by region (the crags' is warm and deep, the fens' cold). */
const SHADOW = { forest: 'rgba(8,16,10,0.32)', netherwood: 'rgba(6,4,16,0.4)', meadow: 'rgba(24,30,10,0.26)', river: 'rgba(4,14,16,0.34)', quarry: 'rgba(26,18,10,0.3)', moonfen: 'rgba(2,6,18,0.42)', crags: 'rgba(30,6,4,0.4)' };

/**
 * An animal's sprite lit like the plants beside it (species-sprites.js lit):
 * its colours multiplied by the light where it stands, and its dark outline
 * mixed half way toward the colour of the shadows round it, so it belongs
 * to the painting instead of lying on it like a sticker.
 * @param {Uint8ClampedArray} d RGBA, modified in place @param {number[]} light [r, g, b, shadow r, g, b] (PlantGround.lightAt)
 */
function litSprite(d, light) {
  const dark = light.length >= 6 ? [light[3] * 255, light[4] * 255, light[5] * 255] : null;
  // (an animal takes the brightness where it stands and only a little of its colour: a grey coat stays grey in a green wood)
  const m = (light[0] + light[1] + light[2]) / 3;
  light = [m + (light[0] - m) * 0.35, m + (light[1] - m) * 0.35, m + (light[2] - m) * 0.35];
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] < 8) continue;
    const r = d[p], g = d[p + 1], b = d[p + 2];
    if (dark && r + g + b < 120) { d[p] = r * 0.55 + dark[0] * 0.45; d[p + 1] = g * 0.55 + dark[1] * 0.45; d[p + 2] = b * 0.55 + dark[2] * 0.45; continue; }
    d[p] = r * light[0]; d[p + 1] = g * light[1]; d[p + 2] = b * light[2];
  }
}

/** How far (CSS pixels) a press may wander and still be a tap: a finger rolls further than a mouse. */
const TAP_SLOP = { mouse: 6, pen: 8, touch: 14 };

/** How far the scene can be zoomed in, and how close it starts (a little closer than the whole region). */
const ZOOM_MIN = 1, ZOOM_MAX = 3, ZOOM_START = 1.35, ZOOM_STEP = 1.25;
const ZOOM_KEY = 'alchemist.wildsZoom';

/** How far apart (scene pixels) a finger dragged in watering mode waters along its path. */
const WATER_STEP = 12;

/** The shapes that are hard things (besides crystals): broken loose, they fall whole and stiff. */
const STIFF = new Set(['crystal', 'shard', 'stone', 'nugget', 'shell', 'icicle', 'scale']);

/** How many blows a crystal fused into its rock takes to break free (the Forager's Kit's hammer saves one): a few more for some. */
const STRIKES = [4, 5, 6];
/** How fast a swipe must go (scene pixels per move) to strike a crystal, and how soon after a blow another lands. */
const STRIKE_SPEED = 2.5, STRIKE_GAP = 0.18;

/** How strongly what glows lights its surroundings in each region: little in the open meadow, fully in the dark fens and caves. */
const GLOW_IN = { forest: 0.85, netherwood: 1.3, meadow: 0.45, river: 0.9, quarry: 0.7, moonfen: 1.4, crags: 0.7 };

/**
 * A four-pointed sparkle on a crystal's edge or a magical glimmer: thin
 * arms (the long ones up and down) that grow out of a white point and draw
 * back in over its life `u` (0..1).
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} u
 */
function sparkle(ctx, x, y, u) {
  const q = 1, L = [0, 1, 2, 3, 2, 1, 0][Math.min(6, Math.floor(u * 7))] * q;
  const cx = Math.round(x / q) * q, cy = Math.round(y / q) * q;
  ctx.fillStyle = 'rgba(255,250,225,0.75)';
  ctx.fillRect(cx, cy - L * 1.5, q, L * 1.5);
  ctx.fillRect(cx, cy + q, q, L * 1.5);
  ctx.fillRect(cx - L, cy, L, q);
  ctx.fillRect(cx + q, cy, L, q);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx, cy, q, q);
}

/** A material's colour as CSS. @param {any} m */
function colourOf(m) {
  const c = m ? m.look || m.color : null;
  return c ? `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})` : '#cde';
}

/** A #rrggbb colour lightened (k > 0) or darkened (k < 0). @param {string} hex @param {number} k */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), ch = (/** @type {number} */ v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export class WildsView {
  /** @param {import('../lab.js').LabScreen} lab */
  constructor(lab) {
    this.lab = lab;
    this.el = h('section', { class: 'view view-wilds', 'data-view': 'wilds' });
    this.region = 'forest';
    this.time = 0;
    this.floaters = [];
    this.bg = null;
    this.bgKey = '';
    /** where the plants stand in the painted scene */
    this.ground = null;
    /** the plants of the region now, each at its spot and stage (refreshed about once a second) @type {any[]} */
    this.field = [];
    /** dig plants out for twice the yield (the stand then sprouts at half pace) */
    this.thorough = false;
    this.rain = [];
    /** the plant under the pointer (or the deposit whose card is hovered) */
    this.hover = null;
    /** plant id → scene time it was first seen at its stage (it springs up as it grows) */
    this.grewAt = {};
    /** deposit id → whether it can be harvested now (refreshed with the list) */
    this.can = {};
    /** deposit id → whether it is a dawn or dusk plant out of its hour */
    this.closed = {};
    /** what a tap in the scene does: harvest a mature plant, or water the plants round it */
    this.mode = 'harvest';
    /** drops of water and splashes in flight @type {{x:number, y:number, vx:number, vy:number, t:number, life:number, gy:number}[]} */
    this.drops = [];
    /** what a swipe has shaken loose: plant id → the fruit, bloom or piece as a ragdoll cut from the very sprite it grew as (`sp`), falling, then lying there to be tapped (`landed` once it has come to rest) @type {Record<string, {doll:Ragdoll, sp:{cv:HTMLCanvasElement, ax:number, ay:number, w:number, h:number}, landed:boolean, rung:number}>} */
    this.fallen = {};
    /** plant id → the push it was given (signed strength, scene time): it bends and rings for a few seconds @type {Record<string, {a:number, t0:number}>} */
    this.shakes = {};
    /** plant id → how much it has been shaken; a ripe one lets go at 1 @type {Record<string, number>} */
    this.energy = {};
    /** crystal id → the blows it has taken and when the last one landed (scene time) @type {Record<string, {n:number, t:number}>} */
    this.hits = {};
    /** the ground fringe over each plant's foot, by region, plant and spot @type {Map<string, any[]>} */
    this.soilCache = new Map();
    /** bits of leaf and pulp in flight @type {{x:number, y:number, vx:number, vy:number, t:number, c:string}[]} */
    this.bits = [];
    /** pieces of rock struck off a crystal's seam, bouncing on the terrain until they settle and fade @type {{x:number, y:number, vx:number, vy:number, t:number, life:number, s:number, c:string, hi:string, spin:number, rest:boolean}[]} */
    this.rubble = [];
    /** puffs of dust where a blow lands @type {{x:number, y:number, t:number, r:number, c:string}[]} */
    this.puffs = [];
    /** what was just gathered: its sprite springing up and shrinking away, a ring of its colour spreading round it @type {{cv:HTMLCanvasElement, w:number, h:number, x:number, y:number, t:number, c:string}[]} */
    this.pops = [];
    /** the flash of a blow on rock @type {{x:number, y:number, t:number}[]} */
    this.flashes = [];
    /** whether wild rabbits are about (tests aimed at the plants alone turn them off) */
    this.wildlife = true;
    /** the wild rabbits of each region visited (kept while the game is open) @type {Map<string, Warren>} */
    this.warrens = new Map();
    /** each region's blood: a layer over its painting that the stains are painted into @type {Map<string, HTMLCanvasElement>} */
    this.gore = new Map();
    /** the frame a rabbit is drawn in before it is set into the scene @type {HTMLCanvasElement|null} */
    this.bunny = null;
    /** that frame at half size, read back to make it stand out (once per look and pose) @type {HTMLCanvasElement|null} */
    this.bunnyHalf = null;
    /** wild animals as set into the scene, by look, state, pose and facing @type {Map<string, HTMLCanvasElement>|null} */
    this.wildSprites = null;
    /** hints given once a session (a rabbit down, the hutch full) @type {Set<string>} */
    this.told = new Set();
    /** the pointer pressed on the scene: where it is, where it came down (sx, sy), how far it has gone (CSS px), and in watering mode where it last watered and how many drank @type {{id:number, type:string, x:number, y:number, cx:number, cy:number, sx:number, sy:number, dist:number, water:boolean, wx:number, wy:number, drank:number, near:boolean, pours:number}|null} */
    this.drag = null;
  }

  build() {
    const el = clear(this.el);
    this.tabs = h('div', { class: 'region-tabs', role: 'tablist' });
    this.sky = h('div', { class: 'wilds-sky small' });
    // the scene, its plants and their effects share one pixel size
    this.canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { width: String(SCENE_W), height: String(SCENE_H), class: 'scene', 'aria-label': 'Wilds: shake plants, tap fallen ingredients, strike minerals, or touch the scenery' }));
    this.ctx = /** @type {CanvasRenderingContext2D} */ (this.canvas.getContext('2d'));
    this.ctx.imageSmoothingEnabled = false;
    // a finger sliding over the scene shakes what grows in it; a tap picks what has fallen
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => this.pressScene(e));
    this.canvas.addEventListener('pointermove', (e) => this.moveScene(e));
    this.canvas.addEventListener('pointerup', (e) => this.releaseScene(e));
    // a gesture taken away (the browser's, or capture lost) ends quietly, keeping what was watered
    const drop = (/** @type {PointerEvent} */ e) => { this.endTouch(e); const d = this.drag; if (d && d.id === e.pointerId) { this.drag = null; if (d.water && d.drank) this.lab.save(); } };
    this.canvas.addEventListener('pointercancel', drop);
    this.canvas.addEventListener('lostpointercapture', drop);
    this.canvas.addEventListener('pointerleave', () => { this.setHover(null); });
    // a long press is not a menu or a text selection
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // the scene is seen through a window that can be zoomed into and panned:
    // the − / + / fit buttons, a trackpad pinch or Ctrl and the wheel, two fingers pinching and dragging
    this.view = h('div', { class: 'scene-view' }, this.canvas);
    this.zoom = ZOOM_START;
    try { const z = Number(localStorage.getItem(ZOOM_KEY)); if (z >= ZOOM_MIN && z <= ZOOM_MAX) this.zoom = z; } catch { /* no storage */ }
    this.zoomPlaced = false;
    /** the fingers on the scene (pointer id → where) and a pinch under way @type {Map<number, {x:number, y:number}>} */
    this.touches = new Map();
    /** @type {{d0:number, z0:number, mx:number, my:number}|null} */
    this.pinch = null;
    this.view.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
    }, { passive: false });
    const zbtn = (t, ic, act, fn) => btn('', fn, { cls: 'icon', icon: ic, act, title: t });
    this.zoomCtl = h('div', { class: 'zoom-ctl' },
      zbtn('Zoom out', 'minus', 'zoom-out', () => this.setZoom(this.zoom / ZOOM_STEP)),
      zbtn('Zoom in', 'plus', 'zoom-in', () => this.setZoom(this.zoom * ZOOM_STEP)),
      zbtn('See the whole region', 'fit', 'zoom-fit', () => this.setZoom(ZOOM_MIN)));
    this.applyZoom();
    this.info = h('div', { class: 'region-info small' });
    this.list = h('div', { class: 'deposits' });
    this.foot = h('div', { class: 'small muted wilds-foot' });
    // the scene and its caption form one column, so a landscape phone can
    // keep the scene in view beside the deposit list
    const wrap = h('div', { class: 'scene-wrap' }, this.view);
    el.append(this.tabs, h('div', { class: 'wilds-scene' }, wrap, h('div', { class: 'scene-bar' }, this.info, this.zoomCtl)), h('div', { class: 'wilds-list' }, this.sky, this.list, this.foot));
    // shown at the chosen resolution, its edges kept hard (rendering/crisp.js)
    this.crisp = new UpscaledCanvas(this.canvas, wrap, this.view);
    // the last moment the player touched this room (pre-generation waits for a pause)
    this.lastInput = 0;
    this.warmTimer = 0;
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) el.addEventListener(ev, () => { this.lastInput = performance.now(); }, { passive: true });
    this.refresh();
  }

  /** Size the scene to the zoom (the window shows a part of it, scrolled). */
  applyZoom() {
    this.canvas.style.width = `${(this.zoom * 100).toFixed(2)}%`;
    if (this.zoomCtl) {
      const [out, inn] = this.zoomCtl.querySelectorAll('button');
      /** @type {HTMLButtonElement} */ (out).disabled = this.zoom <= ZOOM_MIN + 1e-3;
      /** @type {HTMLButtonElement} */ (inn).disabled = this.zoom >= ZOOM_MAX - 1e-3;
    }
  }

  /**
   * Zoom the scene to `z`, keeping the point under (cx, cy) (client
   * pixels; the middle of the window by default) where it is.
   * @param {number} z @param {number} [cx] @param {number} [cy]
   */
  setZoom(z, cx, cy) {
    z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    const v = this.view, r = v.getBoundingClientRect();
    const ox = (cx ?? r.left + r.width / 2) - r.left, oy = (cy ?? r.top + r.height / 2) - r.top;
    const w0 = Math.max(1, v.scrollWidth), h0 = Math.max(1, v.scrollHeight);
    const fx = (v.scrollLeft + ox) / w0, fy = (v.scrollTop + oy) / h0;
    this.zoom = z;
    this.applyZoom();
    v.scrollLeft = fx * v.scrollWidth - ox;
    v.scrollTop = fy * v.scrollHeight - oy;
    try { localStorage.setItem(ZOOM_KEY, String(Math.round(z * 1000) / 1000)); } catch { /* no storage */ }
  }

  /** A finger lifted: a pinch ends once both are off (the one left does nothing). Whether it was part of a pinch. @param {PointerEvent} e */
  endTouch(e) {
    if (!this.touches.delete(e.pointerId)) return false;
    if (!this.pinch) return false;
    if (!this.touches.size) this.pinch = null;
    return true;
  }

  /** A pinch: two fingers on the scene zoom by how far apart they are and pan by where their middle goes. */
  pinchMove() {
    const pts = [...this.touches.values()];
    if (!this.pinch || pts.length < 2) return;
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    this.view.scrollLeft -= mx - this.pinch.mx; this.view.scrollTop -= my - this.pinch.my;
    this.pinch.mx = mx; this.pinch.my = my;
    this.setZoom(this.pinch.z0 * d / Math.max(10, this.pinch.d0), mx, my);
  }

  /**
   * Generate the other regions the player can travel to, and their plants'
   * sprites, while the Wilds room is open and the player has paused — one
   * region per idle moment, never during input or in another room — so
   * travelling to them later only draws what is already made.
   */
  prewarm() {
    if (this.warmTimer) return;
    const st = this.lab.state, seed = st.seed;
    const todo = REGIONS.filter((r) => this.unlocked(r) && r.id !== this.region).map((r) => r.id);
    const idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn) : (fn) => setTimeout(fn, 50);
    const tick = () => {
      this.warmTimer = 0;
      if (this.lab.state !== st || !todo.length) return;
      // only while this room is shown and nobody is touching it
      if (this.lab.view !== 'wilds' || performance.now() - this.lastInput < 1500) { this.warmTimer = setTimeout(tick, 1500); return; }
      idle(() => {
        if (this.lab.view !== 'wilds' || performance.now() - this.lastInput < 1500) { this.warmTimer = setTimeout(tick, 1500); return; }
        const region = /** @type {string} */ (todo.shift());
        sceneCanvas(region, st.sceneSeed(region));
        for (const d of st.deposits.filter((x) => x.region === region)) silhouetteOf(st.lookup(d.materialId));
        if (todo.length) this.warmTimer = setTimeout(tick, 400);
      });
    };
    this.warmTimer = setTimeout(tick, 1500);
  }

  unlocked(r) {
    return this.lab.sandbox || this.lab.state.biomeUnlocked(r.id);
  }

  /** Rebuild the tabs, the caption and the deposit list (the rows and the page keep where they were scrolled to). */
  refresh() {
    if (!this.tabs) return;
    keepScroll(this.el, () => this.rebuild());
  }

  rebuild() {
    const lab = this.lab, st = lab.state;
    if (!this.tabs) return;
    const tabs = clear(this.tabs);
    for (const r of REGIONS) {
      const ok = this.unlocked(r);
      tabs.appendChild(btn(r.name, () => {
        if (!ok) { toast(r.name, `${RANKS[r.rank].name} · ${r.sales} successful sales unlock passage.`, 'lock'); return; }
        this.region = r.id; this.bgKey = ''; this.fallen = {}; this.shakes = {}; this.energy = {}; this.hits = {}; this.rubble = []; this.puffs = []; this.pops = []; this.flashes = []; this.drag = null; audio.play('page'); this.refresh();
      }, { cls: (this.region === r.id ? 'active ' : '') + (ok ? '' : 'locked'), icon: ok ? (r.magical ? 'wisp' : r.id === 'quarry' ? 'pick' : r.id === 'river' ? 'drop' : r.id === 'meadow' ? 'rose' : r.id === 'netherwood' ? 'shroom' : 'tree') : 'lock', act: 'region-' + r.id }));
    }
    const region = REGIONS.find((r) => r.id === this.region);
    settleTraveller(st.traveller);
    clear(this.info).append(h('b', { text: region.name }), ` · ${region.category} · ${EFFECT_BY_KEY[region.dominant].label} · ${region.creature}`,
      btn(lab.sandbox ? 'Regenerate sandbox' : `Regenerate · 1 Traveller Coin (${st.traveller.balance}/${TRAVEL.capacity})`, () => {
        const r = st.regenerateBiome(this.region, Date.now(), lab.sandbox);
        if (!r.ok) { toast('Travel', r.reason, 'coin'); return; }
        this.bgKey = ''; this.fallen = {}; this.shakes = {}; this.energy = {}; this.hits = {}; this.warrens.delete(this.region);
        if (lab.sandbox) for (const d of st.deposits) sandboxDeposit(d);
        this.interaction = null; this.refresh(); lab.save(); lab.tutorial?.notify('regenerate');
      }, { act: 'regenerate-biome', icon: 'coin', disabled: !lab.sandbox && st.traveller.balance < 1 }));
    if (region.interaction) this.info.append(btn('Touch scenery', () => this.interaction?.activate(), { act: 'biome-feature', title: FEATURE_HINTS[region.interaction], icon: 'wisp' }), h('span', { class: 'feature-hint', text: FEATURE_HINTS[region.interaction] }));
    const list = clear(this.list);
    const now = Date.now();
    // the hour, the weather and how hard to harvest
    const weather = weatherOn(st.seed, st.day), part = dayPart(st);
    const mode = (t, on, act) => btn(t, () => { this.thorough = on; audio.play('click'); this.refresh(); }, { cls: 'small' + (this.thorough === on ? ' active' : ''), act });
    clear(this.sky).append(...[
      h('div', { class: 'row wrap sky-row' },
        icon(part === 'dawn' ? 'sun' : part === 'dusk' ? 'wisp' : 'sun', 'sm'), h('b', { text: lab.sandbox ? 'Any hour' : DAY_PART_NAME[part] }),
        lab.sandbox ? null : h('span', { class: 'muted', text: part === 'dawn' ? '(until you open the shop)' : part === 'dusk' ? '(after the last customer, until you close)' : '(the shop is open)' }),
        h('span', { class: 'spacer' }), icon(weather.icon, 'sm'), h('b', { text: lab.sandbox ? '' : weather.name })),
      lab.sandbox || weather.id === 'clear' ? null : h('div', { class: 'muted', text: !lab.sandbox && weather.id === 'rain' ? 'Rain wets the living growth. Harvested specimens stay depleted until this biome is regenerated.' : !lab.sandbox && weather.id === 'storm' ? 'Wind scatters a quarter of every outdoor harvest. Depleted mineral seams remain empty.' : weather.desc }),
      h('div', { class: 'row wrap seg tap-mode' }, h('span', { text: 'Tap to:' }),
        btn('Harvest', () => { this.mode = 'harvest'; audio.play('click'); this.refresh(); }, { cls: 'small' + (this.mode === 'harvest' ? ' active' : ''), icon: 'rose', act: 'mode-harvest' }),
        lab.sandbox ? btn('Water', () => { this.mode = 'water'; audio.play('click'); this.refresh(); }, { cls: 'small' + (this.mode === 'water' ? ' active' : ''), icon: 'drop', act: 'mode-water' }) : null,
        this.mode === 'water' ? h('span', { class: 'muted', text: 'tap or drag across the scene to water the plants there' }) : null),
      // (the Free Experiment's bottomless stores have no use for digging plants out whole)
      this.mode === 'harvest' && !lab.sandbox ? h('div', { class: 'row wrap seg harvest-mode' }, h('span', { text: 'Harvest:' }), mode('Careful', false, 'harvest-careful'), mode('Thorough ×2', true, 'harvest-thorough'),
        this.thorough ? h('span', { class: 'muted', text: 'takes the whole specimen for twice the yield' }) : null) : null].filter(Boolean));
    this.rows = {};
    for (const d of this.deposits()) {
      const m = st.lookup(d.materialId);
      const s = depositStatus(st.gathering, d, now);
      const locked = !lab.sandbox && d.rank > st.rank;
      const plan = gatherPlan(st, d, m, { thorough: this.thorough });
      // (the Free Experiment's plants give their full yield whatever the hour or the weather)
      const can = harvestable(st.gathering, d, lab.sandbox ? d : plan, now);
      const take = lab.sandbox ? d.take : can || plan.take;
      const fx = Object.entries(m.effects || {}).filter(([, v]) => Math.abs(v) >= 5).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3);
      const stock = this.stockText(d, s);
      const when = this.when(s, can, d);
      this.can[d.id] = locked || can >= 5;
      this.closed[d.id] = !lab.sandbox && !plan.open;
      // an ingredient is listed once it has been gathered for the first time (its plants still grow in the scene)
      if (!lab.sandbox && !st.found[d.materialId]) continue;
      const g = btn(locked ? RANKS[d.rank].name : `${plan.method.verb} +${take} ml`, () => this.gather(d), { cls: 'gold', icon: locked ? 'lock' : plan.method.icon, disabled: locked || can < 5, act: 'gather-' + d.id });
      const barI = h('i', { style: { width: Math.round(s.fraction * 100) + '%' } });
      const meta = h('div', { class: 'meta', text: `${stock} · ${when}` });
      const soil = lab.sandbox && d.botanical ? h('div', { class: 'meta soil', text: this.soilText(d, s) }) : null;
      const wbtn = lab.sandbox && d.botanical && !locked ? btn('Water', () => this.waterStand(d), { cls: 'small water', icon: 'drop', disabled: s.plants.every((p) => p.stage === 'mature'), act: 'water-' + d.id, title: 'Water every growing plant of this stand' }) : null;
      this.rows[d.id] = { barI, meta, g, locked, take, soil, wbtn, card: /** @type {HTMLElement | null} */ (null) };
      const notes = lab.sandbox ? [] : plan.factors.filter((f) => f.why !== 'satchel' && !f.why.startsWith('thorough')).map((f) => f.why);
      const tool = plan.method.tool ? equipmentById(plan.method.tool) : null;
      const card = h('div', { class: 'deposit parch' + (locked ? ' locked' : '') + (s.scarred ? ' scarred' : '') + (this.can[d.id] ? '' : ' spent'), 'data-deposit': d.id },
        // the same picture of the ingredient as on the shelf, in the shop and in the book
        ingredientSprite(m, s.fraction),
        h('div', { class: 'dep-info' },
          h('div', { class: 'title' }, m.name, h('span', { class: 'tag rarity-' + m.rarity, text: RARITIES[m.rarity]?.label || 'Legacy' }), m.arcaneVariant ? h('span', { class: 'tag arcane', text: 'Arcane' }) : null, plan.hour ? h('span', { class: 'tag hour', text: plan.hour }) : null),
          d.place ? h('div', { class: 'meta place', text: d.place }) : null,
          h('div', { class: 'bar' }, barI),
          meta,
          soil,
          notes.length ? h('div', { class: 'meta note', text: notes.join(' · ') }) : null,
          !lab.sandbox && tool && !plan.hasTool ? h('div', { class: 'meta muted', text: `${tool.name}: ${tool.price} coins at the shop` }) : null,
          h('div', { class: 'meta fx' }, ...fx.map(([k, v]) => h('span', { class: 'fx-chip', title: EFFECT_BY_KEY[k].label }, icon(EFFECT_BY_KEY[k].icon, 'sm'), ` ${Math.round(v)}`)),
            h('span', { class: 'muted', text: ` · in stores: ${Number.isFinite(st.stock(m.id)) ? Math.round(st.stock(m.id)) + ' ml' : '∞'}` }))),
        wbtn ? h('div', { class: 'dep-acts' }, wbtn, g) : g);
      this.rows[d.id].card = card;
      // pointing at a card picks out its deposit in the scene
      card.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.setHover(d.id); });
      card.addEventListener('pointerleave', () => { if (this.hover === d.id) this.setHover(null); });
      list.appendChild(card);
    }
    if (!list.childElementCount) list.appendChild(h('div', { class: 'muted small empty-list', text: 'Nothing gathered here yet. Slide a finger across a ripe plant to shake its fruit loose, then tap what falls. Each ingredient is listed here once you have gathered it for the first time.' }));
    clear(this.foot).append(lab.sandbox
      ? 'Sandbox plants regrow and can be watered. Campaign populations are finite.'
      : `Room for ${st.cap.storage} ml of each ingredient. This generation never regrows. Gather propagation materials for your garden, or spend a Traveller Coin for a new population. Coins recharge over time and may be gifted by delighted customers.`);
    this.paintBg();
    this.grow();
    this.prewarm();
  }

  /** What a stand holds, in words. @param {any} d @param {any} s status */
  stockText(d, s) {
    if (d.finite) return `${s.mature} of ${d.slots} remaining · ${d.take} ml each`;
    if (!d.botanical) return `${s.mature} of ${d.slots} found · ${d.take} ml each`;
    return `${s.mature} of ${d.slots} mature${s.plants.length > s.mature ? ` · ${s.plants.length - s.mature} growing` : ''} · ${d.take} ml each`;
  }

  /** How damp a stand's soil is, in words. @param {any} d @param {any} s status */
  soilText(d, s) {
    // a stand with nothing growing has nothing to say about its soil
    if (s.moisture === null) return '';
    const e = moistureEnv(d, this.lab.state.gathering.sky);
    const w = s.moisture, word = w < e.lo ? 'dry — growing slowly' : w < e.hi ? 'damp' : 'well watered — growing fast';
    return `soil ${word}${s.thirsty ? ` · ${s.thirsty} thirsty` : ''}`;
  }

  deposits() {
    return this.lab.state.deposits.filter((d) => d.region === this.region);
  }

  paintBg() {
    const key = this.region + ':' + this.lab.state.sceneSeed(this.region);
    if (key === this.bgKey) return;
    this.bgKey = key;
    this.bg = sceneCanvas(this.region, this.lab.state.sceneSeed(this.region));
    this.ground = new PlantGround(this.region, this.lab.state.sceneSeed(this.region));
    this.interaction = new ExoticInteractions(this.region, sceneOf(this.region, this.lab.state.sceneSeed(this.region)));
    this.field = [];
  }

  /** The deposits whose plants grow in the scene: one beyond the guild rank is left out (its card says so). */
  shown() {
    const lab = this.lab;
    return this.deposits().filter((d) => lab.sandbox || d.rank <= lab.state.rank);
  }

  /** The silhouette a plant grows into (every stage of it) on a mount. @param {{id:string, m:any}} p @param {string} [mount] @param {boolean} [flip] */
  shapeOf(p, mount = 'ground', flip = false) {
    return p.m && p.m.wild ? silhouetteOf(p.m, { mount, variant: variantOf(p.id), flip }) : null;
  }

  /** The plants of the region now: each at its spot in the scene and its stage. */
  grow() {
    if (!this.ground) return;
    const lab = this.lab, st = lab.state, now = Date.now();
    /** @type {any[]} */
    const plants = [];
    for (const d of this.shown()) {
      const m = st.lookup(d.materialId);
      const key = m && m.wild ? m.wild.key : null;
      const s = depositStatus(st.gathering, d, now);
      // a stone or shell does not grow: it is simply there once it has formed again; a crystal grows from its seed
      const grows = d.botanical || (m && m.wild && (m.wild.shape === 'crystal' || m.wild.shape === 'shard'));
      for (const p of s.plants) if (grows || p.stage === 'mature') plants.push({ ...p, dep: d, m, key });
    }
    plants.sort((a, b) => a.born - b.born || (a.id < b.id ? -1 : 1));
    // each plant on the ground, hanging from a bough or the rock, or jutting from a rock face or a trunk, as its species is found
    const spots = this.ground.place(plants, (p, mount, flip) => this.shapeOf(p, mount, flip), (p) => mountsOf(p.m));
    /** @type {Record<string, number>} */
    const grewAt = {};
    for (const p of plants) {
      Object.assign(p, spots[p.id], { variant: variantOf(p.id) });
      // what was already growing when the scene was painted stands still; what sprouts or grows since springs up
      const tag = p.id + ':' + p.stage;
      grewAt[tag] = this.grewAt[tag] ?? (this.field.length ? this.time : -9);
    }
    this.grewAt = grewAt;
    this.field = plants;
  }

  /** @param {string | null} id a plant's id, or a deposit's (its card) */
  setHover(id) {
    if (this.hover === id) return;
    this.hover = id;
    const p = id && this.field.find((q) => q.id === id);
    if (this.canvas) this.canvas.style.cursor = p ? (p.stage === 'mature' ? 'pointer' : 'help') : 'default';
  }

  /** How a plant is drawn now: its mount and variant, closed out of its hour, rimmed under the pointer. @param {any} p */
  look(p) {
    return { closed: p.stage === 'mature' && !!this.closed[p.dep.id], hover: this.hover === p.id || this.hover === p.dep.id, mount: p.mount, variant: p.variant, flip: p.flip, light: p.light };
  }

  /** The frame a plant shows now, as a box for hit testing. @param {any} p */
  frameOf(p) {
    const f = p.key ? plantFrameOf(p.m, p.stage, this.look(p)) : null;
    return f ? { w: f.pix.w, h: f.pix.h, ax: f.ax, ay: f.ay } : null;
  }

  /** The plant under a pointer event, if any. @param {{clientX:number, clientY:number}} e */
  plantAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SCENE_W, y = ((e.clientY - r.top) / r.height) * SCENE_H;
    // a mature plant before a growing one in front of it
    const here = this.field.filter((p) => !this.fallen[p.id]), ripe = here.filter((p) => p.stage === 'mature');
    return hitPlant(ripe, (p) => this.frameOf(p), x, y) || hitPlant(here, (p) => this.frameOf(p), x, y);
  }

  /** @param {PointerEvent} e */
  depositAt(e) {
    const p = this.plantAt(e);
    return p ? p.id : null;
  }

  /** Harvest a deposit: the plant given (tapped in the scene), else its oldest mature one. @param {any} d @param {any} [plant] */
  gather(d, plant = null) {
    const lab = this.lab, st = lab.state;
    const m = st.lookup(d.materialId);
    const plan = gatherPlan(st, d, m, { thorough: this.thorough });
    // the Free Experiment takes the plant too (its stand grows back), but stores nothing
    const r = st.gather(d.id, { thorough: this.thorough && !lab.sandbox, ...(lab.sandbox ? { free: true } : {}), ...(plant ? { plant: plant.id } : {}) });
    if (!r.ok) {
      audio.play('error');
      const why = r.reason === 'full' ? `Your shelves are full of ${m.name}.` : r.reason === 'locked' ? 'You may not gather here yet.'
        : d.finite && r.reason === 'depleted' ? 'This generation is depleted. Spend a Traveller Coin to regenerate the biome, or cultivate propagation materials in your garden.'
        : r.reason === 'growing' ? `Still growing — only a mature plant can be harvested. This one matures in ${formatWait(r.nextIn || 60000)}.`
        : d.botanical ? `Nothing is mature yet. The next plant matures in ${formatWait(r.nextIn || 60000)}.`
        : `Nothing to be found here yet. The next one turns up in ${formatWait(r.nextIn || 60000)}.`;
      toast(r.reason === 'growing' ? 'Not ripe yet' : 'Nothing to gather', why, 'satchel');
      return false;
    }
    audio.play(plan.method.sound);
    setTimeout(() => audio.play('select'), 140);
    const at = this.field.find((p) => p.id === r.plant) || { x: d.x, y: d.y, key: null, stage: 'mature' };
    const f = at.key ? plantFrameOf(m, 'mature', { mount: at.mount, variant: at.variant, flip: at.flip }) : null;
    // where it was taken: what lies fallen where it came to rest, else the middle of the plant
    const it = r.plant ? this.fallen[r.plant] : null;
    const c = it ? it.doll.centre() : { x: at.x * SCENE_W, y: f ? at.y * SCENE_H - f.ay + f.pix.h * 0.5 : at.y * SCENE_H };
    this.collect(c.x, c.y, m, it ? it.sp : at.key ? plantCanvas(m, 'mature', { mount: at.mount, variant: at.variant, flip: at.flip }) : null);
    // the count rises from what was picked
    this.floaters.push({ x: c.x, y: Math.max(20, c.y), t: 0, text: `+${r.amount}`, color: m.look || m.color });
    for (const e of r.events || []) lab.announce(e);
    if (lab.tutorial) lab.tutorial.notify('gather', d.materialId);
    // a first find gets its own place on the shelf
    if (!lab.jarEls[d.materialId]) lab.buildShelf(); else lab.updateShelf();
    if (r.plant) { delete this.fallen[r.plant]; delete this.shakes[r.plant]; delete this.energy[r.plant]; delete this.hits[r.plant]; }
    lab.save();
    this.refresh();
    return true;
  }

  /**
   * The moment of gathering at (x, y): what was taken springs up and shrinks
   * away into the satchel, a ring of its colour spreads, and sparks of it
   * and of light fly up and twinkle.
   * @param {number} x @param {number} y @param {any} m @param {{cv:HTMLCanvasElement, w:number, h:number}|null} sp
   */
  collect(x, y, m, sp) {
    const c = colourOf(m);
    if (sp) this.pops.push({ cv: sp.cv, w: sp.w, h: sp.h, x, y, t: 0, c });
    else this.pops.push({ cv: /** @type {any} */ (null), w: 0, h: 0, x, y, t: 0, c });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3, v = 22 + Math.random() * 30;
      this.bits.push({ x: x + Math.cos(a) * 2, y: y + Math.sin(a) * 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0, c: i % 3 ? c : '#fff6d0' });
    }
    for (let i = 0; i < 3; i++) this.flashes.push({ x: x + (Math.random() - 0.5) * 14, y: y - 4 - Math.random() * 10, t: -i * 0.12 });
  }

  /** The scene position of a pointer event. @param {{clientX:number, clientY:number}} e */
  scenePoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SCENE_W, y: ((e.clientY - r.top) / r.height) * SCENE_H };
  }

  /**
   * The fallen thing under a point, if any: the box of its sprite, grown to
   * a fingertip's size (it is small), the nearest one where boxes overlap.
   * @param {number} x @param {number} y
   */
  itemAt(x, y) {
    let best = null, bestD = Infinity;
    for (const [id, it] of Object.entries(this.fallen)) {
      const b = it.doll.box(2), c = it.doll.centre();
      // (grown to a fingertip round its middle where it is small)
      const hw = Math.max((b.x1 - b.x0) / 2, MIN_HIT * 0.4), hh = Math.max((b.y1 - b.y0) / 2, MIN_HIT * 0.4);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      if (Math.abs(x - cx) > hw || Math.abs(y - cy) > hh) continue;
      const dd = (x - c.x) ** 2 + (y - c.y) ** 2;
      if (dd < bestD) { bestD = dd; best = id; }
    }
    return best ? this.field.find((p) => p.id === best) || null : null;
  }

  /** Where a fallen thing lies now (its middle, scene pixels), or null. @param {string} id */
  itemCentre(id) {
    const it = this.fallen[id];
    return it ? it.doll.centre() : null;
  }

  /** @param {PointerEvent} e */
  pressScene(e) {
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // a second finger: the gesture becomes a pinch (zoom and pan) and the first finger's stroke ends
      if (this.touches.size === 2) {
        const d = this.drag;
        this.drag = null;
        if (d && d.water && d.drank) this.lab.save();
        const [a, b] = [...this.touches.values()];
        this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: this.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        try { this.canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (this.pinch) return;
    }
    // one finger at a time: a second one resting on the scene does nothing
    // (a first finger always starts afresh, should a gesture's end have been lost)
    if (this.drag && this.drag.id !== e.pointerId && !e.isPrimary) return;
    if (e.cancelable) e.preventDefault();
    const q = this.scenePoint(e);
    this.interaction?.push(q.x, q.y, q.x, q.y);
    this.drag = { id: e.pointerId, type: e.pointerType || 'mouse', x: q.x, y: q.y, cx: e.clientX, cy: e.clientY, sx: e.clientX, sy: e.clientY, dist: 0, water: this.mode === 'water', wx: q.x, wy: q.y, drank: 0, near: false, pours: 0 };
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    // the watering can pours at once where the finger comes down
    if (this.drag.water) this.pourAt(q.x, q.y, this.drag);
  }

  /** @param {PointerEvent} e */
  moveScene(e) {
    if (this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch) { this.pinchMove(); return; }
    }
    const d = this.drag;
    if (d) {
      if (e.pointerId !== d.id) return;
      // every point the finger passed through since the last frame, not just the last (a fast swipe skips over a plant otherwise)
      const pts = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      for (const c of pts.length ? pts : [e]) {
        const q = this.scenePoint(c);
        d.dist += Math.hypot(c.clientX - d.cx, c.clientY - d.cy);
        d.cx = c.clientX; d.cy = c.clientY;
        if (d.water) {
          // pour along the path, a splash every few pixels
          if (Math.hypot(q.x - d.wx, q.y - d.wy) >= WATER_STEP) this.pourAt(q.x, q.y, d);
        } else if (Math.hypot(q.x - d.x, q.y - d.y) > 0.8) this.sweep(d.x, d.y, q.x, q.y);
        d.x = q.x; d.y = q.y;
      }
      return;
    }
    if (e.pointerType === 'mouse') {
      const q = this.scenePoint(e);
      this.setHover(this.depositAt(e));
      if (this.itemAt(q.x, q.y)) this.canvas.style.cursor = 'pointer';
      const w = this.wildlife ? this.warrens.get(this.region) : null, rb = w ? w.at(q.x, q.y) : null;
      if (rb) this.canvas.style.cursor = rb.running ? 'crosshair' : 'pointer';
    }
  }

  /** @param {PointerEvent} e */
  releaseScene(e) {
    if (this.endTouch(e)) return;
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (d.water) { this.endPour(d); return; }
    // a tap is where the finger came down (a fingertip rolls a little as it lifts)
    if (d.dist <= (TAP_SLOP[d.type] ?? TAP_SLOP.mouse)) this.tapScene({ clientX: d.sx, clientY: d.sy });
  }

  /**
   * A finger slid from (x0, y0) to (x1, y1), pushing what it passes: the
   * scenery's hanging strands are knocked its way and swing, every plant it brushes bends and rings
   * (further the faster the slide), what lies fallen is flicked along, and
   * a ripe plant shaken hard enough lets go of what it bears.
   */
  sweep(x0, y0, x1, y1) {
    this.interaction?.push(x0, y0, x1, y1);
    const dx = x1 - x0, speed = Math.hypot(dx, y1 - y0), dir = dx === 0 ? (this.time * 7 % 2 < 1 ? 1 : -1) : Math.sign(dx);
    const a = dir * Math.min(3.2, 0.5 + speed * 0.45);
    const touch = sceneTouch(this.region, this.lab.state.sceneSeed(this.region));
    if (touch) touch.push(x0, y0, x1, y1);
    for (const it of Object.values(this.fallen)) it.doll.kick(x0, y0, x1, y1, 3);
    // a rabbit the finger sweeps across bolts
    const warren = this.wildlife ? this.warrens.get(this.region) : null;
    if (warren) for (const r of warren.rabbits) { const b = r.box(2); if (r.running && crosses(x0, y0, x1, y1, b.x0, b.y0, b.x1, b.y1)) warren.scare(r, x0); }
    for (const p of this.field) {
      if (this.fallen[p.id]) continue;
      const f = this.frameOf(p);
      if (!f) continue;
      const left = p.x * SCENE_W - f.ax - 5, top = p.y * SCENE_H - f.ay - 5, right = left + f.w + 10, bottom = top + f.h + 10;
      if (!crosses(x0, y0, x1, y1, left, top, right, bottom)) continue;
      const cur = this.shakes[p.id];
      if (!cur || Math.abs(a) >= Math.abs(cur.a) * Math.exp(-(this.time - cur.t0) * 1.5)) this.shakes[p.id] = { a, t0: this.time };
      // a crystal fused into its rock is not shaken loose: a hard swipe strikes it
      if (this.fused(p)) { if (speed >= STRIKE_SPEED) this.strike(p, dx); continue; }
      // (a slow drag shakes too, only it takes longer)
      this.energy[p.id] = (this.energy[p.id] || 0) + Math.max(0.08, speed / 7);
      if (p.stage === 'mature' && !this.closed[p.dep.id] && this.energy[p.id] >= 1) this.detach(p, dx, y1 - y0);
    }
  }

  /**
   * A plant's sprite cut down to what shows of it (its frame keeps room
   * round it): the body a ragdoll is made of, so it rests on its own
   * pixels. Cached with the sprite's canvas.
   * @param {{cv:HTMLCanvasElement, ax:number, ay:number, w:number, h:number}} sp
   */
  static trimmed(sp) {
    const any = /** @type {any} */ (sp.cv);
    if (any.trim) return { ...any.trim };
    const data = /** @type {CanvasRenderingContext2D} */ (sp.cv.getContext('2d')).getImageData(0, 0, sp.w, sp.h).data;
    let x0 = sp.w, y0 = sp.h, x1 = -1, y1 = -1;
    for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) if (data[(y * sp.w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === sp.w - 1 && y1 === sp.h - 1)) { any.trim = sp; return { ...sp }; }
    const cv = document.createElement('canvas');
    cv.width = x1 - x0 + 1; cv.height = y1 - y0 + 1;
    /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')).drawImage(sp.cv, -x0, -y0);
    any.trim = { cv, w: cv.width, h: cv.height, ax: sp.ax - x0, ay: sp.ay - y0 };
    return { ...any.trim };
  }

  /** Whether a scene pixel is something a fallen thing rests on: the ground, rock, or the surface of water or lava. @param {number} x @param {number} y */
  solidAt(x, y) {
    if (x < 0 || x >= SCENE_W || y < 0) return false;
    if (y >= SCENE_H) return true;
    const sc = sceneOf(this.region, this.lab.state.sceneSeed(this.region)), k = y * SCENE_W + x;
    return !!(sc.solid[k] || sc.rock[k] || sc.liquid[k]);
  }

  /**
   * A ripe plant lets go of what it bears: a ragdoll cut from the very
   * sprite it grew as — the same pixels, lit as they were where it grew —
   * thrown the way the finger went (dx, dy: its last stroke, scene pixels),
   * a ground plant pulled up, a hanging one dropping from its hold.
   * @param {any} p @param {number} [dx] @param {number} [dy]
   */
  detach(p, dx = 0, dy = 0) {
    if (this.fallen[p.id]) return;
    const whole = plantCanvas(p.m, p.stage, { ...this.look(p), hover: false });
    if (!whole) return;
    const sp = WildsView.trimmed(whole);
    const hangs = p.mount === 'hang' || p.mount === 'bough' || p.mount === 'ceiling', juts = p.mount === 'wall' || p.mount === 'trunk';
    const x = Math.round(p.x * SCENE_W), y = Math.round(p.y * SCENE_H);
    const fling = Math.max(-1, Math.min(1, dx / 10)), up = Math.max(-1, Math.min(1, dy / 10));
    const away = juts ? (p.flip ? -1 : 1) : 0;
    // a crystal is rock: broken free, it falls and lands as one stiff piece, it never goes limp
    const doll = new Ragdoll(sp, x, y, {
      W: SCENE_W, H: SCENE_H, rigid: WildsView.stiff(p),
      vx: fling * 72 + away * 28 + (Math.random() - 0.5) * 16,
      // (a fruit snaps off its hold and drops at once; a ground plant is pulled up with a jerk)
      vy: hangs ? 45 + up * 30 : juts ? -20 + up * 30 : -75 + Math.min(0, up) * 45,
      // (the top flies out further than the foot: it tumbles — a plant pulled up always keels over one way or the other)
      spin: hangs ? fling * 45 : juts ? fling * 90 : (fling || (Math.random() < 0.5 ? -1 : 1)) * 110 + (Math.random() - 0.5) * 30,
    });
    // clear of the face it juts from, and of whatever else it overlapped (the terrain is never passed through)
    if (juts) for (let k = 0; k < 8 && !doll.clear((xx, yy) => this.solidAt(xx, yy)); k++) doll.shift(away, 0);
    doll.settle((xx, yy) => this.solidAt(xx, yy));
    this.fallen[p.id] = { doll, sp, landed: false, rung: 0 };
    this.shakes[p.id] = { a: (this.shakes[p.id] ? Math.sign(this.shakes[p.id].a) : 1) * 3.4, t0: this.time };
    const m = p.m, c = m ? `rgb(${Math.round((m.look || m.color)[0] * 255)},${Math.round((m.look || m.color)[1] * 255)},${Math.round((m.look || m.color)[2] * 255)})` : '#8c8';
    const bx = x - sp.ax + sp.w / 2, by = y - sp.ay + sp.h * (hangs ? 0.2 : 0.8);
    for (let i = 0; i < 7; i++) this.bits.push({ x: bx + (Math.random() - 0.5) * 8, y: by + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 30, vy: -10 + Math.random() * 14, t: 0, c: i % 2 ? c : '#6fa84a' });
    audio.play('click');
  }

  /** Whether a plant is a crystal still fused into its rock (struck free, not shaken). @param {any} p */
  fused(p) {
    return p.stage === 'mature' && !this.fallen[p.id] && WildsView.gem(p);
  }

  /** Whether what a plant lets go of is hard — a crystal, a stone, a shell, an icicle: it falls as one stiff piece and never bends. @param {any} p */
  static stiff(p) {
    const sh = p.m && p.m.wild ? p.m.wild.shape : '';
    return WildsView.gem(p) || STIFF.has(sh);
  }

  /** Whether a plant is a crystal grown out of rock (not a crystal drop on a vine): rigid, it neither bends nor swings. @param {any} p */
  static gem(p) {
    const sh = p.m && p.m.wild ? p.m.wild.shape : '';
    return sh === 'crystal' || sh === 'shard';
  }

  /** How many blows a crystal takes to break free. @param {any} p */
  strikesFor(p) {
    const n = STRIKES[hashString(p.id) % STRIKES.length];
    return this.lab.sandbox || this.lab.state.has('kit') ? n - 1 : n;
  }

  /**
   * A blow on a crystal fused into its rock: the rock cracks further and
   * chips of it fly; the blow that finishes the cracks breaks it free, and
   * it falls like anything shaken loose. `dir`: the way the blow went.
   * @param {any} p @param {number} dir
   */
  strike(p, dir) {
    const hit = this.hits[p.id] || (this.hits[p.id] = { n: 0, t: -9 });
    if (this.time - hit.t < STRIKE_GAP) return;
    hit.n++; hit.t = this.time;
    const side = Math.sign(dir) || 1;
    this.shakes[p.id] = { a: 0.7 * side, t0: this.time };
    const sp = plantCanvas(p.m, p.stage, { ...this.look(p), hover: false });
    const x = Math.round(p.x * SCENE_W), y = Math.round(p.y * SCENE_H);
    const rock = this.rockColour();
    const c = colourOf(p.m);
    const by = sp ? y - Math.round(sp.ay * 0.25) : y - 2;
    const last = hit.n >= this.strikesFor(p);
    // the blow flashes, dust puffs out, and pieces of the rock (and a splinter or two of the crystal) jump off and bounce about
    this.flashes.push({ x: x - side * 2, y: by, t: 0 });
    this.puffs.push({ x, y: by + 1, t: 0, r: last ? 16 : 9, c: rock });
    this.chips(x, by, side, last ? 14 : 5, rock, c, last);
    if (last) {
      delete this.hits[p.id];
      this.energy[p.id] = 1;
      this.detach(p, side * 3, -4);
      audio.play('crack');
      return;
    }
    audio.play('click');
  }

  /**
   * Pieces of rock knocked off at (x, y), thrown away from the blow (`side`)
   * and up: some big, some grains, a few of the crystal's own colour; they
   * fall, bounce on whatever is solid, roll to a stop and fade.
   * @param {number} x @param {number} y @param {number} side @param {number} n @param {string} rock @param {string} gem @param {boolean} burst the blow that breaks it free throws them every way, higher
   */
  chips(x, y, side, n, rock, gem, burst) {
    for (let i = 0; i < n; i++) {
      const dir = burst ? (Math.random() < 0.5 ? -1 : 1) : -side * (Math.random() < 0.8 ? 1 : -1);
      const q = Math.random(), s = q < (burst ? 0.35 : 0.2) ? 3 : q < 0.75 ? 2 : 1, isGem = i % 4 === 3;
      this.rubble.push({
        x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 3,
        vx: dir * (14 + Math.random() * (burst ? 46 : 32)), vy: -(30 + Math.random() * (burst ? 70 : 45)),
        t: 0, life: 1.6 + Math.random() * 1.2, s, c: isGem ? gem : shade(rock, Math.random() * 0.3 - 0.15), hi: isGem ? '#ffffff' : shade(rock, 0.35),
        spin: 6 + Math.random() * 10, rest: false,
      });
      // (out of the rock face it was struck from, never inside it)
      const b = this.rubble[this.rubble.length - 1];
      for (let k = 0; k < 24 && this.solidAt(Math.round(b.x), Math.round(b.y)); k++) b.y--;
    }
  }

  /** The wild rabbits of the region shown, made the first time it is seen. */
  warren() {
    if (!this.wildlife) return null;
    let w = this.warrens.get(this.region);
    if (w) return w;
    const sc = sceneOf(this.region, this.lab.state.sceneSeed(this.region)), W = SCENE_W, H = SCENE_H;
    const inside = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && x < W && y >= 0 && y < H;
    w = new Warren(this.region, this.lab.state.sceneSeed(this.region), {
      W, H,
      solid: (x, y) => (y >= H ? true : inside(x, y) && !!(sc.solid[y * W + x] || sc.rock[y * W + x])),
      liquid: (x, y) => inside(x, y) && !!sc.liquid[y * W + x],
      spots: warrenSpots(sc, W, H),
      finite: !this.lab.sandbox,
    });
    w.restore(this.lab.state.gathering.instances[this.region]?.wildlife);
    const captured = this.lab.state.gathering.instances[this.region]?.captured || [];
    w.rabbits = w.rabbits.filter((r) => !captured.includes(r.id));
    this.warrens.set(this.region, w);
    return w;
  }

  checkpointWildlife() {
    if (this.lab.sandbox) return;
    for (const [region, w] of this.warrens) {
      const instance = this.lab.state.gathering.instances[region];
      if (instance) instance.wildlife = w.snapshot();
    }
  }

  /**
   * The region's blood layer, with what has been spilt since the last frame
   * painted into it: each stained pixel of ground or rock darkens red, the
   * more so where blood has fallen on it again.
   * @param {Warren|null} w
   */
  goreLayer(w) {
    if (!w) return null;
    let cv = this.gore.get(this.region);
    const fresh = w.takeStains();
    if (!cv) {
      if (!fresh.length) return null;
      cv = document.createElement('canvas');
      cv.width = SCENE_W; cv.height = SCENE_H;
      this.gore.set(this.region, cv);
    }
    if (fresh.length) {
      const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
      g.globalAlpha = 0.8;
      for (const st of fresh) { g.fillStyle = st.c; g.fillRect(st.x, st.y, 1, 1); }
      g.globalAlpha = 1;
    }
    return cv;
  }

  /**
   * A tap on a wild animal: a blow while it runs (it bleeds and bolts,
   * frantic, bleeding out fast); the third tap catches it alive and carries
   * it home (or, with no place for it, finishes it); its body carried home
   * with a tap.
   * @param {Warren} w @param {import('../../game/wild-rabbits.js').WildRabbit} r @param {number} x @param {number} y
   */
  hunt(w, r, x, y) {
    const lab = this.lab, st = lab.state, kd = KINDS[r.kind] || KINDS.rabbit;
    if (r.dead) { this.takeHome(w, r); return; }
    if (r.down) { this.takeHome(w, r); return; }
    const was = r.hits;
    const out = w.strike(r, x, y);
    audio.play('squeak');
    audio.play(out === 'caught' ? 'thump' : 'crush');
    if (out === 'caught') {
      if (!penHasRoom(st.colony, r.kind)) {
        // no place for it at all: it is let die where it lies (said every time, so it is never a surprise)
        w.kill(r);
        audio.play('error');
        toast('The enclosure is full', `The ${kd.plural}' enclosure holds ${PEN_MAX} animals, living and dead, so this one could not be kept alive. Recover the remains of a body in the hutch to make room.`, 'rabbit', 5000);
        return;
      }
      // caught alive: carried straight home
      this.takeHome(w, r);
      return;
    }
    if (!was) this.tell('hurt', 'Quick — it is bleeding out!', `Wounded, it flees and bleeds out in a few seconds. Tap it ${WILD_HP - 1} more times before it dies to catch it alive.`, 'rabbit');
  }

  /**
   * Carry a caught animal (or a body) home to its enclosure, if there is room.
   * @param {Warren} w @param {import('../../game/wild-rabbits.js').WildRabbit} r
   */
  takeHome(w, r) {
    const lab = this.lab, st = lab.state, kd = KINDS[r.kind] || KINDS.rabbit;
    const res = st.bringWildRabbit({ look: r.look, sex: r.sex, dead: r.dead, health: Math.max(10, Math.round(50 * r.blood) - r.hits * 4) });
    if (!res.ok) {
      if (!r.dead) w.kill(r);
      audio.play('error'); toast(res.full === 'pen' ? 'The enclosure is full' : 'No room', res.reason, 'rabbit');
      return;
    }
    w.remove(r);
    const instance = st.gathering.instances[this.region];
    if (instance && !instance.captured.includes(r.id)) instance.captured.push(r.id);
    lab.tutorial?.notify('creature');
    const name = res.rabbit.name;
    this.pops.push({ cv: /** @type {any} */ (null), w: 0, h: 0, x: r.x, y: r.y - 6, t: 0, c: r.dead ? BLOOD[1] : '#f0e0c0' });
    audio.play(r.dead ? 'dig' : 'squeak');
    setTimeout(() => audio.play('select'), 140);
    toast(r.dead ? 'A body for the hutch' : 'Caught!', r.dead
      ? `The ${kd.noun} is carried home. You named it ${name}: its body waits in the hutch, where its remains can be recovered.`
      : `${name} the ${kd.noun} is carried home to the hutch, weak from its wounds — it will mend there.${kd.steady ? ` ${kd.lore}` : ''}`, 'rabbit');
    lab.save();
  }

  /** A hint, once a session. @param {string} key @param {string} title @param {string} text @param {string} ic */
  tell(key, title, text, ic) {
    if (this.told.has(key)) return;
    this.told.add(key);
    toast(title, text, ic, 5000);
  }

  /**
   * A wild animal as it is set into the scene (cached): drawn as in the hutch
   * into a frame of its own — at its full size for the scene's detail layer
   * (shown at twice the scene's resolution, rendering/crisp.js), or at half
   * that size into the scene itself — and lit by the light where it stands
   * like the plants are (its colours multiplied by the scene's tint and
   * brightness round it, its outline taking on the colour of the shadows
   * there), so it sits in the painting rather than on it: no extra ring of
   * ink, no halo. Its shadow is not in it: that is cast on the ground only
   * when it stands there (drawWarren). Its pixels are read back once per
   * look, state, pose, facing and light, never in the frame.
   * @param {any} look @param {any} snap @param {string|undefined} pose @param {boolean} mirror
   * @param {boolean} [grass] grazing where grass grows (a tuft at its mouth), or on bare ground
   * @param {number[]|null} [light] the light where it stands (PlantGround.lightAt)
   * @param {boolean} [full] at its full size (the detail layer) rather than half
   * @returns {HTMLCanvasElement}
   */
  wildSprite(look, snap, pose, mirror, grass = true, light = null, full = false) {
    const key = rabbitSpriteKey(look, snap, pose) + (mirror ? '|m' : '') + (grass ? '' : '|bare') + (light ? '|' + light.join(',') : '') + (full ? '|f' : '');
    const cache = this.wildSprites || (this.wildSprites = new Map());
    let cv = cache.get(key);
    if (cv) return cv;
    if (cache.size > 400) cache.clear();
    if (!this.bunny) { this.bunny = document.createElement('canvas'); this.bunny.width = RABBIT_W; this.bunny.height = RABBIT_H; }
    const b = /** @type {CanvasRenderingContext2D} */ (this.bunny.getContext('2d'));
    b.imageSmoothingEnabled = false;
    b.clearRect(0, 0, RABBIT_W, RABBIT_H);
    drawRabbit(b, look, snap, 0, 0, { x: 0, y: 0, clear: false, floor: false, hop: false, mirror, pose, flash: false, grass, shadow: false });
    const w = full ? RABBIT_W : RABBIT_W / 2 + 4, h = full ? RABBIT_H : RABBIT_H / 2 + 4;
    // (read back on a scratch canvas kept for reading; the sprite itself is a plain canvas, cheap to draw)
    if (!this.bunnyRead || this.bunnyRead.width !== w) { this.bunnyRead = document.createElement('canvas'); this.bunnyRead.width = w; this.bunnyRead.height = h; }
    const hb = /** @type {CanvasRenderingContext2D} */ (this.bunnyRead.getContext('2d', { willReadFrequently: true }));
    hb.imageSmoothingEnabled = false;
    hb.clearRect(0, 0, w, h);
    if (full) hb.drawImage(this.bunny, 0, 0);
    else hb.drawImage(this.bunny, 0, 0, RABBIT_W, RABBIT_H, 2, 2, RABBIT_W / 2, RABBIT_H / 2);
    const img = hb.getImageData(0, 0, w, h);
    if (light) litSprite(img.data, light);
    cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d')).putImageData(img, 0, 0);
    cache.set(key, cv);
    return cv;
  }

  /**
   * The light an animal stands in at (x, y) (PlantGround.lightAt over the box its body covers), cached by 4-pixel cell.
   * @param {number} x @param {number} y @returns {number[]|null}
   */
  animalLight(x, y) {
    if (!this.ground) return null;
    const k = `${this.region}:${x >> 2}:${y >> 2}`, c = this.lights || (this.lights = new Map());
    let l = c.get(k);
    if (!l) {
      if (c.size > 2000) c.clear();
      l = this.ground.lightAt((x & ~3) + 2, (y & ~3) + 2, 'ground', /** @type {any} */ ({ ax: 10, ay: 14, w: 20, h: 14 }));
      c.set(k, l);
    }
    return l;
  }

  /**
   * Whether grass grows on the ground round (x, y) (an animal's mouth as it grazes): blades or a tuft on the surface within a few pixels.
   * @param {number} x @param {number} y
   */
  grassAt(x, y) {
    const sc = sceneOf(this.region, this.lab.state.sceneSeed(this.region)), W = SCENE_W, H = SCENE_H;
    if (!sc.grass) return true;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && sc.grass[yy * W + xx]) return true;
    }
    return false;
  }

  /**
   * The shadow an animal casts where it stands: a soft dark band on the
   * ground under its body, the light being above and to the left, as wide
   * as it is long (a lying body's longer), darkest under its middle.
   * @param {CanvasRenderingContext2D} ctx @param {any} r @param {number} x @param {number} y
   */
  castShadow(ctx, r, x, y) {
    const b = r.box(), hw = Math.max(3, Math.round((b.x1 - b.x0) / 2) - 1), ox = 1;
    ctx.fillStyle = SHADOW[this.region] || SHADOW.forest;
    ctx.fillRect(x - hw + ox, y, hw * 2, 1);
    ctx.fillRect(x - hw + ox + 2, y + 1, Math.max(2, hw * 2 - 4), 1);
  }

  /**
   * The rabbits, the far ones first: each in its pose (hopping off the
   * ground, grazing, rearing, lying down), facing the way it goes, its
   * wounds red on its coat; then the blood in flight and the clouds of it
   * in the water.
   * @param {CanvasRenderingContext2D} ctx @param {Warren} w
   */
  drawWarren(ctx, w, full = false) {
    for (const r of w.rabbits.slice().sort((a, c) => a.y - c.y)) {
      const snap = { ...defaultSnap(), hp: r.band, alive: !r.dead, cause: r.dead ? 'hunted' : null };
      const pose = r.drawPose;
      const x = Math.round(r.x), y = Math.round(r.y);
      // its shadow on the ground, only while it touches the ground (never under it in the air)
      if (!r.air && !r.flying) this.castShadow(ctx, r, x, y);
      // lit by the light where it stands; made once for each look, state, pose, facing and light, then only copied
      // grazing: a tuft of grass at its mouth only where grass grows under it
      const spr = this.wildSprite(r.look, snap, pose, r.face < 0, pose !== 'eat' || this.grassAt(x + r.face * 8, y), this.animalLight(x, y), full);
      const sx = x - RABBIT_W / 4 - 2, sy = y - 18;
      // (at full size into the detail layer, its frame half a scene pixel to one of its own)
      const put = () => full ? ctx.drawImage(spr, sx + 2, sy + 2, RABBIT_W / 2, RABBIT_H / 2) : ctx.drawImage(spr, sx, sy);
      put();
      if (r.react > 0) {
        // the flash of a blow: the sprite added over itself, brightening it
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, r.react) * 0.5;
        put();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      // its wounds: dark red where it was struck, wet and bright at the middle, running down its coat
      const lying = r.dead || r.down;
      r.wounds.forEach(([wx, wy], i) => {
        const px = Math.round(x + wx * r.face), py = Math.round(y + (lying ? Math.max(-4, wy * 0.5) : wy));
        ctx.fillStyle = BLOOD[2]; ctx.fillRect(px - 1, py, 2, 2);
        ctx.fillStyle = BLOOD[0]; ctx.fillRect(px, py, 1, 1);
        if (!lying) { ctx.fillStyle = BLOOD[1]; ctx.fillRect(px - (i % 2), py + 2, 1, 1 + ((i + r.hits) % 3)); }
      });
      // wounded and still alive: the blood it has left, and the taps landed of the three that catch it
      if (r.hits && r.running) {
        const bw = 14, bx = x - bw / 2, by = sy - 4, left = Math.ceil(r.blood * (bw - 2));
        ctx.fillStyle = '#100810'; ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = BLOOD[2]; ctx.fillRect(bx + 1, by + 1, bw - 2, 1);
        ctx.fillStyle = r.blood < 0.35 && (Math.floor(r.t * 8) & 1) ? '#ff6a5a' : BLOOD[3];
        ctx.fillRect(bx + 1, by + 1, left, 1);
        for (let k = 0; k < WILD_HP; k++) {
          ctx.fillStyle = '#100810'; ctx.fillRect(bx + 2 + k * 4, by - 4, 3, 3);
          ctx.fillStyle = k < r.hits ? '#f6d26a' : '#5a4a50'; ctx.fillRect(bx + 3 + k * 4, by - 3, 1, 1);
        }
      }
    }
    for (const d of w.drops) { ctx.fillStyle = d.c; ctx.fillRect(Math.round(d.x), Math.round(d.y), d.s, d.s); }
    for (const c of w.clouds) {
      const u = c.t / 4, rr = c.r + u * 6;
      ctx.globalAlpha = 0.35 * (1 - u);
      ctx.fillStyle = BLOOD[0];
      ctx.fillRect(Math.round(c.x - rr), Math.round(c.y), Math.round(rr * 2), 1);
      ctx.fillRect(Math.round(c.x - rr * 0.6), Math.round(c.y + 1), Math.round(rr * 1.2), 1);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * The effects in flight: rock pieces bouncing on the terrain, puffs of
   * dust, the flashes of blows and what was just gathered springing away.
   * @param {CanvasRenderingContext2D} ctx @param {number} dt
   */
  drawEffects(ctx, dt) {
    const solid = (/** @type {number} */ x, /** @type {number} */ y) => this.solidAt(Math.round(x), Math.round(y));
    for (const b of this.rubble) {
      b.t += dt;
      if (!b.rest) {
        b.vy += 220 * dt;
        const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
        // a wall turns it back; the ground bounces it, lower each time, until it rolls to a stop
        if (solid(nx, b.y)) b.vx = -b.vx * 0.5; else b.x = nx;
        if (b.vy > 0 && solid(b.x, ny)) {
          if (b.vy > 40 && Math.random() < 0.15) audio.play('click');
          b.vy = -b.vy * 0.42; b.vx *= 0.7;
          if (Math.abs(b.vy) < 14) { b.vy = 0; b.rest = true; }
        } else if (b.vy < 0 && solid(b.x, ny)) b.vy = 0;
        else b.y = ny;
        if (b.x < -4 || b.x > SCENE_W + 4 || b.y > SCENE_H + 4) b.t = b.life;
      } else {
        b.vx *= Math.max(0, 1 - dt * 8);
        if (Math.abs(b.vx) > 1 && !solid(b.x + b.vx * dt, b.y)) b.x += b.vx * dt;
        // (the ground dropping away under a rolling piece: it falls again)
        if (!solid(b.x, b.y + 1)) b.rest = false;
      }
      const fade = Math.max(0, Math.min(1, (b.life - b.t) / 0.5));
      ctx.globalAlpha = Math.ceil(fade * 3) / 3;
      // it tumbles: a piece lies long one way, then the other, until it settles
      const flip = !b.rest && Math.floor(b.t * b.spin) % 2 === 1;
      const w = b.s === 1 ? 1 : flip ? b.s - 1 : b.s, h = b.s === 1 ? 1 : flip ? b.s : b.s - 1;
      const px = Math.round(b.x), py = Math.round(b.y) - h + 1;
      if (b.s > 1) {
        // a dark edge below and to the right, so it reads against sky and stone alike, and a lit corner
        ctx.fillStyle = 'rgba(16,10,8,0.85)'; ctx.fillRect(px, py, w + 1, h + 1);
        ctx.fillStyle = b.c; ctx.fillRect(px, py, w, h);
        ctx.fillStyle = b.hi; ctx.fillRect(px, py, 1, 1);
      } else { ctx.fillStyle = b.c; ctx.fillRect(px, py, 1, 1); }
    }
    ctx.globalAlpha = 1;
    this.rubble = this.rubble.filter((b) => b.t < b.life);
    for (const d of this.puffs) {
      d.t += dt;
      const u = d.t / 0.55, rr = 2 + u * d.r;
      ctx.globalAlpha = Math.max(0, 0.55 * (1 - u));
      ctx.fillStyle = shade(d.c, 0.35);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + d.x;
        ctx.fillRect(Math.round(d.x + Math.cos(a) * rr), Math.round(d.y + Math.sin(a) * rr * 0.45 - u * 4), u < 0.5 ? 2 : 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    this.puffs = this.puffs.filter((d) => d.t < 0.55);
    for (const f of this.flashes) {
      f.t += dt;
      if (f.t >= 0 && f.t < 0.25) sparkle(ctx, f.x, f.y, f.t / 0.25);
    }
    this.flashes = this.flashes.filter((f) => f.t < 0.25);
    for (const p of this.pops) {
      p.t += dt;
      const u = Math.min(1, p.t / 0.5);
      // a ring of its colour spreading out
      const rr = 3 + u * 16;
      ctx.globalAlpha = Math.ceil((1 - u) * 3) / 3;
      ctx.fillStyle = p.c;
      for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; ctx.fillRect(Math.round(p.x + Math.cos(a) * rr), Math.round(p.y + Math.sin(a) * rr * 0.6), 1, 1); }
      // the thing itself: it springs up, then shrinks away
      if (p.cv) {
        const sc = u < 0.2 ? 1 + u * 1.2 : 1.24 * (1 - (u - 0.2) / 0.8), rise = Math.round(u * 18);
        const w = Math.max(1, Math.round(p.w * sc)), h = Math.max(1, Math.round(p.h * sc));
        ctx.globalAlpha = u < 0.6 ? 1 : Math.ceil((1 - u) / 0.4 * 3) / 3;
        if (sc > 0.05) ctx.drawImage(p.cv, Math.round(p.x - w / 2), Math.round(p.y - h / 2 - rise), w, h);
      }
      ctx.globalAlpha = 1;
    }
    this.pops = this.pops.filter((p) => p.t < 0.5);
  }

  /** The colour of the region's rock (chips struck off a crystal's seam). */
  rockColour() {
    const stone = this.region === 'quarry' || this.region === 'crags';
    return this.region === 'crags' ? '#4a3c40' : stone ? '#8c8072' : this.region === 'moonfen' || this.region === 'netherwood' ? '#4c4a58' : '#7c7c78';
  }

  /** @param {{clientX:number, clientY:number}} e where the tap came down */
  tapScene(e) {
    const q = this.scenePoint(e);
    // a rabbit is struck (or, once it is down, caught; its body carried home); one close by bolts
    const warren = this.warren(), rb = warren ? warren.at(q.x, q.y) : null;
    if (rb) { this.hunt(warren, rb, q.x, q.y); return; }
    if (warren) for (const r of warren.near(q.x, q.y)) warren.scare(r, q.x);
    // what lies fallen on the ground (or is still falling) is gathered by tapping it
    const fallenAt = this.itemAt(q.x, q.y);
    if (fallenAt) { this.gather(fallenAt.dep, fallenAt); return; }
    const p = this.plantAt(e);
    if (!p) return;
    // a crystal is struck: it breaks free of its rock after several blows
    if (this.fused(p)) { this.strike(p, q.x < p.x * SCENE_W ? 1 : -1); return; }
    // a ripe plant tapped is shaken: what it bears falls, and is tapped in turn
    if (p.stage === 'mature' && !this.closed[p.dep.id]) { const side = q.x < p.x * SCENE_W ? 1 : -1; this.shakes[p.id] = { a: 2.6 * side, t0: this.time }; this.energy[p.id] = 1; this.detach(p, side * 3, 0); return; }
    this.gather(p.dep, p);
  }

  /**
   * The growing living plants a splash at (x, y) reaches: any whose sprite
   * the point falls on (a finger lands on the plant, not its foot), or whose
   * foot is close by. By deposit.
   * @param {number} x @param {number} y
   */
  wateredBy(x, y) {
    const reach = 22;
    /** @type {Map<any, string[]>} */
    const by = new Map();
    let near = false;
    for (const p of this.field) {
      const px = p.x * SCENE_W, py = p.y * SCENE_H, f = this.frameOf(p);
      const on = !!f && x >= px - f.ax - 4 && x <= px - f.ax + f.w + 4 && y >= py - f.ay - 4 && y <= py - f.ay + f.h + 4;
      if (!on && Math.hypot(px - x, (py - y) * 1.4) > reach) continue;
      near = true;
      if (!p.dep.botanical || p.stage === 'mature') continue;
      if (!by.has(p.dep)) by.set(p.dep, []);
      by.get(p.dep).push(p.id);
    }
    return { by, near };
  }

  /**
   * Pour water at a scene point (a tap, or a step of a drag in watering
   * mode): drops fall and splash, and every growing plant there drinks.
   * @param {number} x @param {number} y @param {{wx:number, wy:number, drank:number, near:boolean, pours:number}} d the gesture
   */
  pourAt(x, y, d) {
    d.wx = x; d.wy = y; d.pours++;
    this.splash(x, y, 10);
    const { by, near } = this.wateredBy(x, y);
    d.near = d.near || near;
    let n = 0;
    for (const [dep, ids] of by) n += this.lab.state.water(dep.id, ids);
    // (a sound as the can tips, then for each splash that waters something)
    if (n || d.pours === 1) audio.play('pour');
    if (n) { d.drank += n; this.tick(); }
    return n;
  }

  /** The watering gesture is over: keep what drank, or say why nothing did. @param {{drank:number, near:boolean}} d */
  endPour(d) {
    if (d.drank) { this.lab.save(); this.tick(); return; }
    toast('Nothing to water here', d.near ? 'Only growing plants drink — mature ones are ready to harvest, stones, crystals and shells need no water, and soil already soaked takes no more.' : 'Tap or drag close to a growing plant to water it.', 'drop');
  }

  /** Splash water at a pointer event: every growing plant within reach drinks. @param {{clientX:number, clientY:number}} e */
  waterAt(e) {
    const q = this.scenePoint(e), d = { wx: q.x, wy: q.y, drank: 0, near: false, pours: 0 };
    this.pourAt(q.x, q.y, d);
    this.endPour(d);
    return d.drank;
  }

  /** Water every growing plant of a stand (its card's button). @param {any} d */
  waterStand(d) {
    const lab = this.lab;
    const n = lab.state.water(d.id, null);
    for (const p of this.field) if (p.dep === d && p.stage !== 'mature') this.splash(p.x * SCENE_W, p.y * SCENE_H, 6);
    audio.play(n ? 'pour' : 'error');
    if (!n) { toast('Already watered', 'Its soil is as wet as it gets — more water would not make it grow any faster.', 'drop'); return; }
    lab.save();
    this.refresh();
  }

  /** Drops of water falling onto (x, y) and splashing. */
  splash(x, y, n) {
    for (let i = 0; i < n; i++) this.drops.push({ x: x + (Math.random() - 0.5) * 16, y: y - 18 - Math.random() * 10, vx: (Math.random() - 0.5) * 6, vy: 30 + Math.random() * 20, t: 0, life: 0.5 + Math.random() * 0.2, gy: y + (Math.random() - 0.5) * 6 });
  }

  /** @param {number} dt */
  frame(dt) {
    if (!this.ctx || !this.bg) return;
    this.time += dt;
    // (the first time the window has a size, it looks at the middle of the region, a little toward its ground)
    if (!this.zoomPlaced && this.view.clientWidth) {
      this.zoomPlaced = true;
      this.view.scrollLeft = (this.view.scrollWidth - this.view.clientWidth) / 2;
      this.view.scrollTop = (this.view.scrollHeight - this.view.clientHeight) * 0.65;
    }
    const ctx = this.ctx, st = this.lab.state, now = Date.now();
    // the painting, its leaves swaying in the wind
    const touch = sceneTouch(this.region, st.sceneSeed(this.region));
    if (touch) touch.step(dt);
    ctx.drawImage(sceneFrame(this.region, st.sceneSeed(this.region), this.time), 0, 0);
    animateRegion(ctx, this.region, this.time, st.sceneSeed(this.region));
    this.interaction?.step(dt); this.interaction?.draw(ctx);
    // the blood spilt here, on the ground and the rock
    const warren = this.warren();
    if (warren) warren.step(dt);
    const gore = this.goreLayer(warren);
    if (gore) ctx.drawImage(gore, 0, 0);
    // the plants and the animals: at the higher resolutions, at twice the scene's definition into the detail
    // layer laid over it (rendering/crisp.js) — the plants grown at k = 2, the animals at their own full
    // size; otherwise into the scene itself (the animals at half size)
    if (this.crisp) this.crisp.factor = this.lab.resolution();
    const dc = this.crisp && this.crisp.ready() ? this.detailContext() : null;
    if (this.crisp) this.crisp.detail = dc ? dc.canvas : null;
    if (dc) {
      dc.setTransform(1, 0, 0, 1, 0, 0);
      dc.clearRect(0, 0, dc.canvas.width, dc.canvas.height);
      dc.setTransform(2, 0, 0, 2, 0, 0);
    }
    // the plants, the far ones first
    for (const p of this.field.slice().sort((a, b) => a.y - b.y)) if (p.key && !this.fallen[p.id]) this.drawPlant(ctx, p, dc);
    this.drawFallen(ctx, dt);
    if (dc && warren) this.drawWarren(dc, warren, true);
    else if (warren) this.drawWarren(ctx, warren);
    this.drawEffects(ctx, dt);
    this.paintSky(ctx, dt);
    // (the hour's light falls on the animals in the detail layer too)
    if (dc) { dc.globalCompositeOperation = 'source-atop'; this.skyTint(dc); dc.globalCompositeOperation = 'source-over'; }
    this.drawDrops(ctx, dt);
    for (const f of this.floaters) {
      f.t += dt;
      const a = Math.max(0, 1 - f.t / 1.2);
      ctx.globalAlpha = a;
      for (let k = 0; k < 4; k++) {
        const px = f.x + Math.cos(k * 1.7 + f.t * 3) * f.t * 14, py = f.y - f.t * 18 - k * 2;
        ctx.fillStyle = `rgb(${Math.round(f.color[0] * 255)},${Math.round(f.color[1] * 255)},${Math.round(f.color[2] * 255)})`;
        ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
      }
      ctx.fillStyle = '#ffe39a';
      ctx.font = '8px "Alchemist Pixel", monospace';
      ctx.fillText(f.text, Math.round(f.x - 6), Math.round(f.y - 16 - f.t * 12));
      ctx.globalAlpha = 1;
    }
    this.floaters = this.floaters.filter((f) => f.t < 1.2);
    if (this.crisp) this.crisp.present();
    // live stock and timers, updated in place about once a second
    this._acc = (this._acc || 0) + dt;
    if (this._acc > 1) { this._acc = 0; this.tick(); }
  }

  /**
   * A plant at its stage: damp soil darkening round its foot when it has
   * been watered, a ground shadow, a slight glow of its own colour, then
   * its sprite, springing up a pixel as
   * it reaches a new stage; a thirsty growing plant carries a little drop
   * (always in watering mode, now and then otherwise); a mature crystal or
   * a magical plant glimmers now and then at its bright spots.
   * @param {CanvasRenderingContext2D} ctx @param {any} p
   */
  drawPlant(ctx, p, dc = null) {
    const look = this.look(p), { closed, hover } = look;
    const sp = plantCanvas(p.m, p.stage, look);
    if (!sp) return;
    // (the plant itself, and what is drawn over it, into the detail layer at twice the definition when there is one)
    const tc = dc || ctx, spd = dc ? plantCanvas(p.m, p.stage, { ...look, k: 2 }) || sp : sp;
    const x = Math.round(p.x * SCENE_W), y = Math.round(p.y * SCENE_H), onGround = !p.mount || p.mount === 'ground';
    const since = this.time - (this.grewAt[p.id + ':' + p.stage] ?? -9);
    const sw = Math.max(4, Math.round(sp.w * (p.stage === 'sprout' ? 0.5 : 0.6)));
    if (onGround && p.moisture !== null && p.moisture !== undefined) {
      // damp earth: a dark patch, wider and darker the wetter it is above the habitat's own level
      const e = moistureEnv(p.dep, this.lab.state.gathering.sky), wet = Math.max(0, Math.min(1, (p.moisture - e.base) / Math.max(0.05, 1 - e.base)));
      if (wet > 0.05) {
        ctx.fillStyle = `rgba(20,14,30,${(0.12 + wet * 0.25).toFixed(3)})`;
        const ww = Math.round(sw * (1 + wet * 0.8));
        ctx.fillRect(x - (ww >> 1), y - 1, ww, 3);
        ctx.fillRect(x - (ww >> 1) + 2, y + 2, Math.max(2, ww - 4), 1);
      }
    }
    if (onGround) {
      // the shadow it casts: the light comes from the upper left, so it lies to the right, as wide as the plant
      // is (a sprout casts a small one), darkest under its foot, dimmer where it is thin
      const hw = Math.max(3, Math.round(sp.w * 0.34)), ox = Math.round(hw * 0.3) + 1;
      ctx.fillStyle = SHADOW[this.region] || SHADOW.forest;
      ctx.fillRect(x - hw + ox, y - 1, hw * 2, 1);
      ctx.fillRect(x - hw + ox + 1, y, hw * 2 - 2, 1);
      ctx.fillRect(x - Math.floor(hw / 2) + ox, y + 1, hw, 1);
      ctx.fillRect(x - Math.floor(hw / 2), y - 2, hw, 1);
    }
    // a slight glow of its own colour about it, breathing, so it reads in the scene without standing out of it
    const tint = plantGlow(p.m), lift = since < 0.3 ? 1 : 0;
    if (tint && !hover) {
      const cx = x - sp.ax + sp.w / 2, cy = y - sp.ay + sp.h * 0.5, r = Math.max(sp.w, sp.h) * 0.6 + 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, tint); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.13 + 0.04 * Math.sin(this.time * 1.6 + p.x * 17);
      ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // a vine hangs and sways; the rest stands, juts or lies still
    const dxAt = this.drawBent(tc, p, sp, x, y, lift, spd);
    if (!dxAt) tc.drawImage(spd.cv, x - spd.ax / spd.k, y - spd.ay / spd.k - lift, spd.w / spd.k, spd.h / spd.k);
    if (onGround) this.drawSoil(tc, p, sp, x, y);
    if (this.fused(p)) this.drawFusion(tc, p, sp, x, y);
    // what glows lights its surroundings, breathing, the more so the darker the region
    const emit = emitColour(p.m);
    if (emit && !closed && sp.glows.length) {
      const dark = GLOW_IN[this.region] ?? 0.6, shown = sp.glows.length > 8 ? sp.glows.filter((_, i) => i % Math.ceil(sp.glows.length / 8) === 0) : sp.glows;
      ctx.globalCompositeOperation = 'lighter';
      shown.forEach(([gx, gy], i) => {
        const r = 4 + Math.min(4, sp.glows.length * 0.5), cx = x - sp.ax + gx + (dxAt ? dxAt(gy) : 0), cy = y - sp.ay + gy - lift;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, emit); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = Math.min(0.4, 0.13 * dark * (0.75 + 0.25 * Math.sin(this.time * 1.4 + i * 1.9 + p.x * 11)) * (p.stage === 'sprout' ? 0.6 : 1));
        ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (p.thirsty && (this.mode === 'water' || Math.sin(this.time * 2 + p.x * 9) > 0.6)) {
      // a drop over its head asks for water
      const dx = x + Math.round(sp.w / 2 - sp.ax) - 1, dy = y - sp.ay - 5 + Math.round(Math.sin(this.time * 4 + p.x * 5));
      tc.fillStyle = '#1a2a48'; tc.fillRect(dx - 1, dy, 4, 4); tc.fillRect(dx, dy - 1, 2, 1);
      tc.fillStyle = '#6ab8f0'; tc.fillRect(dx, dy, 2, 3); tc.fillStyle = '#d8f0ff'; tc.fillRect(dx, dy, 1, 1);
    }
    const d = speciesOf(p.m);
    if (p.stage === 'mature' && d && sp.glints.length && (d.family === 'crystal' || d.family === 'mineral' || d.tr.glow > 0.3) && !hover && !closed) {
      const cycle = this.time * 0.6 + p.x * 7.3 + p.y * 3.1, phase = cycle % 2;
      if (phase < 0.5) {
        const [gx, gy] = sp.glints[Math.floor(cycle / 2) % sp.glints.length];
        sparkle(tc, x - sp.ax + gx, y - sp.ay + gy, phase / 0.5);
      }
    }
  }

  /**
   * The ground a plant stands in, over its foot: the crust of the painting
   * just under it (grass, moss, gravel, ash — whatever the region's ground
   * is there) brought up a pixel or two in an uneven fringe, so what grows
   * there comes up out of the ground rather than standing on it. Cached per
   * plant and spot.
   * @param {CanvasRenderingContext2D} ctx @param {any} p @param {{w:number}} sp @param {number} x @param {number} y
   */
  drawSoil(ctx, p, sp, x, y) {
    const key = `${this.region}|${p.id}|${x}|${y}|${sp.w}`;
    let cells = this.soilCache.get(key);
    if (!cells) {
      const sc = sceneOf(this.region, this.lab.state.sceneSeed(this.region)), px = sc.pix.px, seed = hashString(p.id);
      const hw = Math.max(2, Math.round(sp.w * (WildsView.gem(p) ? 0.45 : 0.3)));
      cells = [];
      for (let dx = -hw; dx <= hw; dx++) {
        const X = x + dx;
        if (X < 0 || X >= SCENE_W) continue;
        // the top of the ground in this column, at or just below the foot
        let G = -1;
        for (let k = 0; k <= 3 && y + k < SCENE_H; k++) if (sc.solid[(y + k) * SCENE_W + X] || sc.rock[(y + k) * SCENE_W + X]) { G = y + k; break; }
        if (G < 0) continue;
        const hgt = Math.abs(dx) >= hw - 1 ? 1 : 1 + (((seed >>> ((dx + hw) % 27)) & 3) === 0 ? 1 : 0) + (((seed >>> ((dx + hw + 5) % 27)) & 7) === 0 ? 1 : 0);
        // the crust's own colours, from the column itself and, higher up, a neighbour's (the painting's grain carries over)
        for (let k = 1; k <= hgt; k++) {
          const c = px[G * SCENE_W + Math.max(0, Math.min(SCENE_W - 1, X + (k > 1 ? (dx < 0 ? -1 : 1) : 0)))];
          if (!(c >>> 24)) continue;
          cells.push([X, G - k, `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`]);
        }
      }
      if (this.soilCache.size > 400) this.soilCache.clear();
      this.soilCache.set(key, cells);
    }
    for (const [cx, cy, c] of cells) { ctx.fillStyle = c; ctx.fillRect(cx, cy, 1, 1); }
  }

  /**
   * A crystal fused into its rock (the rock is part of its own picture): a
   * crack for every blow it has taken, running from the rock into the
   * crystal, longer the closer it is to breaking free.
   * @param {CanvasRenderingContext2D} ctx @param {any} p @param {{w:number, h:number, ax:number, ay:number}} sp @param {number} x @param {number} y
   */
  drawFusion(ctx, p, sp, x, y) {
    const seed = hashString(p.id);
    const hw = Math.max(4, Math.round(sp.w * 0.32)), hits = this.hits[p.id] ? this.hits[p.id].n : 0, need = this.strikesFor(p);
    // a crystal hanging from a roof is held by rock above it: its cracks run down
    const hangs = p.mount === 'hang' || p.mount === 'ceiling', dir = hangs ? 1 : -1;
    // the cracks of the blows so far
    ctx.fillStyle = 'rgba(14,10,12,0.85)';
    const reach = Math.round((hangs ? sp.h - sp.ay : sp.ay) * 0.5 * (hits / need)) + 3;
    for (let k = 0; k < hits; k++) {
      let cx = x + (((seed >> (k * 3)) & 7) - 3.5) * hw / 4, cy = y + dir;
      const lean = ((seed >> (k * 2 + 5)) & 1) ? 1 : -1;
      for (let s = 0; s < reach; s++) {
        ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1);
        cy += dir;
        if (((seed >> ((k * 5 + s) % 28)) & 3) === 0) cx += lean;
      }
    }
  }

  /**
   * A plant moved by wind and by fingers. Something hanging (from a bough, a
   * ledge or the roof) swings about where it holds on, each row of it moved
   * sideways the further the lower it hangs, so it bends rather than slides;
   * something standing bends from its foot, its top furthest. A swipe's push
   * rings in it for a few seconds. A plant on rock or a trunk stays rigid.
   * Returns how far each row of the sprite was moved, or null if it was not
   * (and so has still to be drawn).
   * @param {CanvasRenderingContext2D} ctx @param {any} p @param {{cv:HTMLCanvasElement, ax:number, ay:number, w:number, h:number, k?:number}} sp @param {number} x @param {number} y @param {number} lift @param {{cv:HTMLCanvasElement, ax:number, ay:number, w:number, h:number, k?:number}} [spd] the frame drawn (at a finer definition k)
   * @returns {((row:number)=>number)|null}
   */
  drawBent(ctx, p, sp, x, y, lift, spd = sp) {
    // (spd: the frame drawn, perhaps at a finer definition k; its rows are fractions of a scene row)
    const k = spd.k || 1, rows = (/** @type {(r:number) => number} */ dxAt, /** @type {number} */ ly) => {
      for (let r = 0; r < spd.h; r++) ctx.drawImage(spd.cv, 0, r, spd.w, 1, x - spd.ax / k + dxAt(Math.round(sp.ay + (r - spd.ay) / k)), y - spd.ay / k + r / k - ly, spd.w / k, 1 / k);
    };
    const hangs = p.mount === 'hang' || p.mount === 'bough' || p.mount === 'ceiling';
    // a crystal is rock: fingers and wind leave it standing (or hanging) still
    if (WildsView.gem(p) || (!hangs && p.mount && p.mount !== 'ground')) return null;
    let ring = 0;
    const sh = this.shakes[p.id];
    if (sh) {
      const u = this.time - sh.t0;
      if (u > 3.2) delete this.shakes[p.id]; else ring = sh.a * Math.exp(-u * 1.5) * Math.sin(u * 11) * 1.7;
    }
    if (!hangs) {
      if (Math.abs(ring) < 0.3) return null;
      const dxAt = (/** @type {number} */ r) => (r > sp.ay ? 0 : Math.round(ring * 2.2 * ((sp.ay - r) / Math.max(1, sp.ay)) ** 2));
      rows(dxAt, lift);
      return dxAt;
    }
    const st = this.lab.state, wind = windAt(x, this.time, (hashString(st.seed) % 1000) / 100) * 0.8;
    const swing = wind + 0.35 * Math.sin(this.time * 1.7 + p.x * 23) + ring, below = sp.h - sp.ay;
    const dxAt = (/** @type {number} */ r) => Math.round(swing * 2.2 * (Math.max(0, r - sp.ay) / Math.max(1, below)) ** 2);
    rows(dxAt, 0);
    return dxAt;
  }

  /**
   * What has been shaken loose: ragdolls tumbling down, knocking against the
   * ground, then lying there with a glint, waiting to be tapped. Bits of
   * leaf and pulp fly from where it let go.
   * @param {CanvasRenderingContext2D} ctx @param {number} dt
   */
  drawFallen(ctx, dt) {
    for (const id of Object.keys(this.fallen)) if (!this.field.some((p) => p.id === id)) delete this.fallen[id];
    const solid = (/** @type {number} */ x, /** @type {number} */ y) => this.solidAt(x, y);
    for (const [id, it] of Object.entries(this.fallen)) {
      const p = this.field.find((q) => q.id === id);
      if (!p) continue;
      const { doll, sp } = it;
      doll.step(dt, solid);
      // a knock against the ground is heard (not every little one)
      if (doll.knock > 110 && this.time - it.rung > 0.18) { audio.play('click'); it.rung = this.time; }
      doll.knock = 0;
      it.landed = doll.asleep;
      // its shadow on the ground below it
      const c = doll.centre(), b = doll.box();
      let gy = Math.round(b.y1);
      while (gy < SCENE_H - 1 && !this.solidAt(Math.round(c.x), gy + 1)) gy++;
      const sh = Math.max(3, Math.round((b.x1 - b.x0) * 0.7) - Math.round((gy - b.y1) / 5));
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(Math.round(c.x - sh / 2), gy, sh, 1);
      // the same pixels it grew as, each piece turned as it lies, never smoothed: its texture stays as it was on the plant
      doll.draw(ctx, sp.cv);
      if (it.landed) {
        const u = (this.time * 0.9 + p.x * 5) % 2;
        if (u < 0.6) sparkle(ctx, b.x1 - 3, b.y0 + 2, u / 0.6);
      }
    }
    for (const b of this.bits) {
      b.t += dt; b.vy += 120 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      ctx.fillStyle = b.c; ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
    }
    this.bits = this.bits.filter((b) => b.t < 0.9);
  }

  /** The water drops in flight: falling, then a little splash where each lands. @param {CanvasRenderingContext2D} ctx @param {number} dt */
  drawDrops(ctx, dt) {
    for (const d of this.drops) {
      d.t += dt;
      if (d.y < d.gy) { d.vy += 120 * dt; d.x += d.vx * dt; d.y += d.vy * dt; ctx.fillStyle = '#9ad4ff'; ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 2); }
      else {
        const k = Math.min(3, Math.floor((d.t - 0.3) * 12));
        ctx.fillStyle = 'rgba(200,236,255,0.85)';
        ctx.fillRect(Math.round(d.x) - k, Math.round(d.gy) - 1, 1, 1); ctx.fillRect(Math.round(d.x) + k, Math.round(d.gy) - 1, 1, 1);
        ctx.fillRect(Math.round(d.x), Math.round(d.gy) - 1 - Math.max(0, 2 - k), 1, 1);
      }
    }
    this.drops = this.drops.filter((d) => d.t < d.life + 0.3);
  }

  /** Light of the hour and the day's weather over the scene. @param {CanvasRenderingContext2D} ctx @param {number} dt */
  /** A canvas twice the scene's size for the detail layer (the animals at full size), made once. */
  detailContext() {
    if (!this.detailCv) {
      this.detailCv = document.createElement('canvas');
      this.detailCv.width = SCENE_W * 2; this.detailCv.height = SCENE_H * 2;
    }
    const c = /** @type {CanvasRenderingContext2D} */ (this.detailCv.getContext('2d'));
    c.imageSmoothingEnabled = false;
    return c;
  }

  /** The tint of the hour and of the weather over the whole scene. @param {CanvasRenderingContext2D} ctx */
  skyTint(ctx) {
    const st = this.lab.state;
    if (this.lab.sandbox) return;
    const part = dayPart(st), weather = weatherOn(st.seed, st.day);
    if (part !== 'day') {
      ctx.fillStyle = part === 'dawn' ? 'rgba(255,170,190,0.16)' : 'rgba(90,50,120,0.28)';
      ctx.fillRect(0, 0, SCENE_W, SCENE_H);
      if (part === 'dusk') { ctx.fillStyle = 'rgba(255,140,60,0.12)'; ctx.fillRect(0, Math.round(SCENE_H * 0.35), SCENE_W, Math.round(SCENE_H * 0.2)); }
    }
    if (weather.id === 'heat') { ctx.fillStyle = 'rgba(255,200,90,0.1)'; ctx.fillRect(0, 0, SCENE_W, SCENE_H); }
  }

  paintSky(ctx, dt) {
    const st = this.lab.state;
    if (this.lab.sandbox) return;
    const weather = weatherOn(st.seed, st.day);
    this.skyTint(ctx);
    if (weather.id === 'fog') {
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = `rgba(225,225,235,${0.12 + 0.04 * k})`;
        const y = Math.round(SCENE_H * (0.45 + 0.12 * k) + Math.sin(this.time * 0.4 + k) * 2);
        ctx.fillRect(0, y, SCENE_W, 5 + k);
      }
    } else if (weather.id === 'rain' || weather.id === 'storm' || weather.id === 'frost') {
      const snow = weather.id === 'frost';
      while (this.rain.length < (snow ? 40 : 70)) this.rain.push({ x: Math.random() * SCENE_W, y: Math.random() * SCENE_H, v: 0.6 + Math.random() * 0.4 });
      ctx.fillStyle = snow ? 'rgba(245,250,255,0.85)' : 'rgba(170,200,235,0.55)';
      for (const r of this.rain) {
        r.y += dt * (snow ? 14 : weather.id === 'storm' ? 150 : 110) * r.v;
        r.x += dt * (snow ? Math.sin(this.time + r.v * 9) * 6 : weather.id === 'storm' ? -40 : -8);
        if (r.y > SCENE_H) { r.y -= SCENE_H; r.x = Math.random() * SCENE_W; }
        if (r.x < 0) r.x += SCENE_W;
        ctx.fillRect(Math.round(r.x), Math.round(r.y), 1, snow ? 1 : 3);
      }
      if (weather.id === 'storm' && Math.sin(this.time * 0.9) > 0.995) { ctx.fillStyle = 'rgba(255,255,240,0.35)'; ctx.fillRect(0, 0, SCENE_W, SCENE_H); }
    }
  }

  /** How a deposit is doing, in words (stones, crystals and shells turn up again rather than grow). @param {any} s status @param {number} can @param {any} d */
  when(s, can, d) {
    if (d.finite) return s.mature ? `${s.mature} left in this generation` : 'Depleted · spend a Traveller Coin to regenerate';
    const living = d.botanical;
    if (s.fullIn <= 0) return living ? 'fully grown' : 'all found';
    const growing = `${living ? 'growing back' : 'turning up again'}${s.scarred ? ' slowly' : ''} · full in ${formatWait(s.fullIn)}`;
    if (can >= 5) return growing;
    return `next ${living ? 'ripe' : 'one'} in ${formatWait(s.nextIn)} · ${growing}`;
  }

  tick() {
    const lab = this.lab, st = lab.state;
    if (!this.rows) return;
    const now = Date.now();
    const balance = st.traveller.balance;
    settleTraveller(st.traveller, now);
    if (balance !== st.traveller.balance) { this.refresh(); return; }
    for (const d of this.deposits()) {
      const row = this.rows[d.id];
      const plan = gatherPlan(st, d, st.lookup(d.materialId), { thorough: this.thorough });
      if (!row) { this.closed[d.id] = !lab.sandbox && !plan.open; continue; }
      const s = depositStatus(st.gathering, d, now);
      const can = harvestable(st.gathering, d, lab.sandbox ? d : plan, now);
      row.barI.style.width = Math.round(s.fraction * 100) + '%';
      row.meta.textContent = `${this.stockText(d, s)} · ${this.when(s, can, d)}`;
      if (row.soil) row.soil.textContent = this.soilText(d, s);
      if (row.wbtn) row.wbtn.disabled = s.plants.every((p) => p.stage === 'mature');
      row.g.disabled = row.locked || can < 5;
      this.can[d.id] = row.locked || can >= 5;
      if (row.card) row.card.classList.toggle('spent', !this.can[d.id]);
      this.closed[d.id] = !lab.sandbox && !plan.open;
    }
    this.grow();
  }
}
