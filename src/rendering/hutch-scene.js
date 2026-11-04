// The farm's enclosures as 224×92 pixel-art scenes: for every kind — the
// Moon Rabbits' hutch among them — a pen of its own, painted procedurally
// (visual/env/pens.js; setPen picks which one a scene shows, each with its
// own floor, feeder, nest and cloth). The pen makes a cached background
// (nest straw where a female is expecting, a linen cloth while there are
// bodies) and its fringe of grass or snow is drawn over the animals; feet
// only ever rest on its ground. Each living rabbit
// runs a small behaviour machine — idling, hopping, grooming, eating at the rack, sniffing, and the moods its visible state
// gives it (flops when lovestruck or vital, zoomies on fire or vitality 3,
// rearing to flex its strength, loafing when sick, frozen solid, floating on
// arcana, slow near death); kits trail their mother. The dead lie on the
// cloth at the right in their death pose.
//
// Everything is deterministic: each decision draws from an Rng seeded by the
// rabbit's id, its look seed and that rabbit's decision counter, so the same
// sync() and update() calls always give the same hutch. The scene keeps
// only references to the entries it is given and never writes to them.
// Rabbits are drawn by drawRabbit (one cached sprite each, mirrored to face
// left) and depth-sorted by the y of their feet.

import { Rng, hashString } from '../core/rng.js';
import { PAL, makeCanvas } from './art.js';
import { drawRabbit, rabbitAnchors, rabbitLevels, rabbitPace, RABBIT_W } from './rabbit.js';
import { kindOf } from '../game/kinds.js';
import { penOf } from '../visual/env/pens.js';
import { drawPenAnim } from './pen-anim.js';
import { NATIVE_SPECIES } from '../game/native-species.js';

/** Walking speed in the hutch (px/s) of the kinds that walk rather than hop (rabbits, toads and ermines hop). */
const WALKERS = { cat: 12, salamander: 5, deer: 10, badger: 8, dove: 8, fox: 14, snail: 1.5, rat: 16 };
for (const [id, n] of Object.entries(NATIVE_SPECIES)) if (n.gait !== 'rabbit' && n.gait !== 'ermine') WALKERS[id] = WALKERS[n.gait] || 7;

export const HUTCH_W = 224;
export const HUTCH_H = 92;
/** Bodies shown on the cloth; the UI counts any beyond. */
export const HUTCH_BODIES = 3;

/** Back edge of the floor in the stand-in painted without a DOM. */
const FLOOR_Y = 67;

/**
 * An enclosure as the scene uses it: the ground's runs, where to eat, where
 * the bodies lie, and (for the kinds' procedural pens, visual/env/pens.js)
 * the painted back and front.
 * @typedef {{kind:string, y0:number, ground:number[][][], rack:{x:number, y:number}, slots:number[][], cloth:number[], nest:number[],
 *   roam:{x0:number, x1:number, y0:number, y1:number}, back?:any, front?:any, anim?:any[]}} PenDef
 */

/** @param {any} p @returns {PenDef} */
function penDef(p) {
  const flat = p.ground.flat();
  return { ...p, roam: { x0: Math.min(...flat.map((r) => r[0])), x1: Math.max(...flat.map((r) => r[1] - 1)), y0: p.y0, y1: p.y0 + p.ground.length - 1 } };
}

/** The Moon Rabbits' hutch. */
const HUTCH_PEN = penDef(penOf('rabbit'));
/** @type {Map<string, PenDef>} */
const PENS = new Map([['rabbit', HUTCH_PEN]]);

/** The enclosure of a kind (the rabbits' hutch for a kind without a pen of its own). @param {string} kind */
export function penFor(kind) {
  let p = PENS.get(kind);
  if (p) return p;
  const pen = penOf(kind);
  p = pen ? penDef(pen) : HUTCH_PEN;
  PENS.set(kind, p);
  return p;
}

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** @param {CanvasRenderingContext2D} ctx */
function R(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/**
 * One rabbit in the hutch.
 * @typedef {Object} Actor
 * @property {string} id
 * @property {any} look
 * @property {any} snap
 * @property {Record<string, number>} L    visible levels by channel
 * @property {string|null} mother
 * @property {boolean} alive
 * @property {boolean} hidden  a body beyond the cloth's slots
 * @property {number} x        feet, art pixels
 * @property {number} y
 * @property {number} face     1 right, -1 left
 * @property {string} act
 * @property {number} at       seconds into the act (scaled by pace)
 * @property {number} dur
 * @property {string|null} pose  pose asked of drawRabbit
 * @property {number} [stride] px walked (a walker's legs)
 * @property {number} hops     hops left in a run
 * @property {number} hopT     seconds per hop
 * @property {number} hopH     hop height
 * @property {number} step     px per hop
 * @property {number} sx       start and end of the current hop
 * @property {number} sy
 * @property {number} tx
 * @property {number} ty
 * @property {number} gx       goal of the run
 * @property {number} gy
 * @property {string|null} next  act after the run (eat)
 * @property {number} n        decision counter
 * @property {number} phase    animation phase, so the hutch does not bob in step
 * @property {number} react    0..1 after a poke
 * @property {string[]} reactCh
 * @property {any} anSnap      anchors cache
 * @property {string|null} anPose
 * @property {any} an
 */

// the stand-in painted without a DOM: dark oiled planks, golden straw
const HW = { k: '#1a1218', p1: '#3a2212', p3: '#5a371d', p5: '#8a5c33' };
const STRAW = ['#7a5a24', '#9a7630', '#b8923c', '#d2ae52', '#e8cc74', '#f6e2a0'];

/**
 * Paint an enclosure's background into a 224×92 context: a kind's
 * procedural pen (or a plain stand-in without a DOM), with a nest where a
 * female is expecting and a linen cloth for the bodies when asked.
 * @param {CanvasRenderingContext2D} ctx @param {{nest?:boolean, cloth?:boolean, pen?:any, def?:PenDef}} [o]
 *   pen: the pen's painting as a canvas; def: the enclosure (the hutch by default)
 */
export function paintHutch(ctx, o = {}) {
  const W = HUTCH_W, H = HUTCH_H, rng = new Rng('hutch-bg-3'), def = o.def || HUTCH_PEN;
  if (o.pen) ctx.drawImage(o.pen, 0, 0);
  else {
    R(ctx, 0, 0, W, FLOOR_Y, HW.p3);
    for (let y = 0; y < FLOOR_Y; y += 8) R(ctx, 0, y + 7, W, 1, HW.p1);
    R(ctx, 0, FLOOR_Y, W, H - FLOOR_Y, STRAW[2]);
    R(ctx, 0, FLOOR_Y, W, 1, HW.k);
  }
  // nest straw and down where the young will be born
  const [nx0, ny0, nx1, ny1] = def.nest;
  if (o.nest) for (let k = 0; k < 22; k++) R(ctx, rng.int(nx0, nx1 - 2), rng.int(ny0, ny1 - 1), rng.int(2, 3), 1, rng.pick([STRAW[4], STRAW[5], '#f6ead0', '#e6d3a5']));
  // ---- a linen cloth on the floor, where the bodies are laid
  if (o.cloth) {
    const [cx, cy, cw, ch] = def.cloth;
    R(ctx, cx, cy, cw, ch, PAL.parch0); R(ctx, cx + 1, cy, cw - 2, ch - 1, PAL.parch1); R(ctx, cx + 1, cy, cw - 2, 1, PAL.parch2);
    for (let x = cx + 7; x < cx + cw - 2; x += 9) { R(ctx, x, cy + 2, 1, 4, PAL.parch0); R(ctx, x + 1, cy + 6, 1, Math.max(1, ch - 9), PAL.parch0); }
  }
}

/**
 * What of the pen is drawn over the animals (its fringe of grass or snow).
 * @param {CanvasRenderingContext2D} ctx @param {any} [pen] the fringe as a canvas (nothing without a DOM)
 */
export function paintHutchFront(ctx, pen) {
  if (pen) ctx.drawImage(pen, 0, 0);
}

/** Whether a rabbit's feet may rest at a point: on the pen's ground, off what was set down on it. @param {number} x @param {number} y */
export function onGround(x, y, pen = HUTCH_PEN) {
  const row = pen.ground[Math.round(y) - pen.y0], xi = Math.round(x);
  return !!row && row.some(([x0, x1]) => xi >= x0 && xi < x1);
}

/** Pixels (visual/pixels.js) as a canvas, once per buffer. @type {WeakMap<object, any>} */
const asCanvas = new WeakMap();
/** @param {any} pix */
function canvasOf(pix) {
  let c = asCanvas.get(pix);
  if (!c && typeof document !== 'undefined') { c = pix.toCanvas(); asCanvas.set(pix, c); }
  return c || null;
}

/**
 * The colony's hutch. Feed it entries with sync(), step it with update(dt),
 * paint it with draw(); hit() maps a pointer in art pixels to a rabbit id.
 */
export class HutchScene {
  /**
   * @param {{canvas?:(w:number, h:number) => any, sprites?:boolean, kind?:string}} [opts]
   *   canvas: canvas maker for the cached background and the rabbit sprites
   *   (default makeCanvas when a DOM exists; without one the background is
   *   painted straight into the target every frame); sprites: false draws
   *   every rabbit rect by rect (tests); kind: whose enclosure it shows
   *   (the rabbits' hutch by default; setPen changes it).
   */
  constructor(opts = {}) {
    this.factory = opts.canvas || null;
    /** the enclosure shown */
    this.pen = penFor(opts.kind || 'rabbit');
    this.sprites = opts.sprites !== false;
    /** @type {Map<string, Actor>} */
    this.actors = new Map();
    this.steps = 0;
    this.nest = false;
    this.cloth = false;
    /** @type {any} */
    this.bg = null;
    this.bgKey = '';
    /** @type {any} */
    this.fg = null;
    this.fgPen = false;
    /** claw marks where an aggressive rabbit struck (or hearts where two mated): art pixels and age (s) */
    /** @type {{x:number, y:number, t:number, love?:boolean}[]} */
    this.clashes = [];
  }

  /**
   * Show another kind's enclosure: its animals are synced afresh into it.
   * @param {string} kind
   */
  setPen(kind) {
    const p = penFor(kind);
    if (p === this.pen) return;
    this.pen = p;
    this.actors.clear();
    this.clashes = [];
    this.bg = null; this.fg = null; this.bgKey = ''; this.fgPen = false;
  }

  /** Whether a foot may rest at a point of this enclosure. @param {number} x @param {number} y */
  onGround(x, y) {
    return onGround(x, y, this.pen);
  }

  /**
   * Take the colony as it is now: [{id, look, snap, mother?}], living and dead.
   * Rabbits keep their place and what they are doing across syncs.
   * @param {{id:string, look:any, snap:any, mother?:string|null, parents?:string[]|null}[]} entries
   */
  sync(entries) {
    const seen = new Set();
    let bodies = 0, nest = false;
    for (const e of Array.isArray(entries) ? entries : []) {
      if (!e || e.id == null || !e.look || !e.snap) continue;
      const id = String(e.id);
      if (seen.has(id)) continue;
      seen.add(id);
      let a = this.actors.get(id);
      if (!a) { a = this._spawn(id, e); this.actors.set(id, a); }
      a.look = e.look;
      a.snap = e.snap;
      a.L = rabbitLevels(e.snap);
      a.mother = e.mother != null ? String(e.mother) : Array.isArray(e.parents) && e.parents[0] ? String(e.parents[0]) : null;
      const alive = e.snap.alive !== false;
      if (!alive) {
        const slot = this.pen.slots[bodies++];
        a.hidden = !slot;
        if (slot) { a.x = slot[0]; a.y = slot[1]; }
        a.act = 'dead'; a.pose = null; a.face = 1; a.hops = 0;
      } else {
        if (!a.alive) this._place(a);
        a.hidden = false;
        if (e.snap.preg) nest = true;
      }
      a.alive = alive;
    }
    for (const id of [...this.actors.keys()]) if (!seen.has(id)) this.actors.delete(id);
    this.nest = nest;
    this.cloth = bodies > 0;
  }

  /** Advance every living rabbit's behaviour by dt seconds (clamped to 0.1). @param {number} dt */
  update(dt) {
    const d = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    this.steps++;
    for (const a of this.actors.values()) {
      if (a.react > 0) a.react = Math.max(0, a.react - d * 1.25);
      if (a.alive) this._tick(a, d);
    }
    for (const c of this.clashes) c.t += d;
    this.clashes = this.clashes.filter((c) => c.t < 0.9);
  }

  /**
   * A feral rabbit lunges at another: it dashes over, the victim flinches
   * and claw marks flash where it was struck.
   * @param {string} fromId @param {string} toId
   */
  attack(fromId, toId) {
    const a = this.actors.get(String(fromId)), v = this.actors.get(String(toId));
    if (!v || v.hidden) return;
    v.react = 1;
    v.reactCh = [];
    const b = this._box(v);
    this.clashes.push({ x: Math.round((b.x0 + b.x1) / 2), y: Math.round((b.y0 + b.y1) / 2), t: 0 });
    if (a && a.alive && !a.hidden && a.act !== 'collapse' && a.act !== 'frozen') {
      const side = a.x < v.x ? -1 : 1;
      this._hopTo(a, this._roam(v.x + side * 10, v.y), 3, true);
    }
  }

  /**
   * A lovestruck rabbit mates with another: it hops over and hearts rise
   * between them.
   * @param {string} fromId @param {string} toId
   */
  mate(fromId, toId) {
    const a = this.actors.get(String(fromId)), v = this.actors.get(String(toId));
    if (!v || v.hidden) return;
    const b = this._box(v);
    this.clashes.push({ x: Math.round((b.x0 + b.x1) / 2), y: Math.round(b.y0), t: 0, love: true });
    if (a && a.alive && !a.hidden && a.act !== 'collapse' && a.act !== 'frozen') {
      const side = a.x < v.x ? -1 : 1;
      this._hopTo(a, this._roam(v.x + side * 7, v.y), 2, true);
    }
  }

  /**
   * A pat or a dose landing on a rabbit: it hops on the spot and flashes
   * the channels given (drawRabbit's react).
   * @param {string} id @param {string[]} [channels]
   */
  poke(id, channels = []) {
    const a = this.actors.get(String(id));
    if (!a || !a.alive || a.act === 'collapse' || a.act === 'frozen') return;
    a.react = 1;
    a.reactCh = channels.slice();
    a.next = null;
    this._hopTo(a, { x: a.x + a.face * 2, y: a.y }, 1, false);
  }

  /**
   * Paint the hutch.
   * @param {CanvasRenderingContext2D} ctx a 224×92 art-resolution context
   * @param {number} t seconds
   * @param {{selected?:string|null, hover?:string|null, low?:boolean, detail?:CanvasRenderingContext2D|null}} [o]
   *   detail: a context twice the hutch's size, scaled ×2, laid over it at its own resolution (rendering/crisp.js):
   *   the animals are drawn there from sprites of twice the definition, and with them what lies over them
   */
  draw(ctx, t, o = {}) {
    const low = !!o.low;
    this._background(ctx);
    // what moves in the enclosure: fire, water, lamplight, snow, butterflies
    drawPenAnim(ctx, this.pen.anim, t);
    // the animals and all that lies over them, at twice the definition when there is a detail layer
    const k = o.detail ? 2 : 1;
    if (o.detail) ctx = o.detail;
    const list = this._visible();
    for (const a of list) {
      const f = this._frame(a);
      drawRabbit(ctx, a.look, a.snap, t + a.phase, a.react, {
        x: f.x, y: f.y, lift: f.lift, mirror: f.mirror, pose: a.pose || undefined, react: a.reactCh,
        quality: low ? 'low' : 'high', clear: false, floor: false, clip: false, flash: false, hop: false,
        cache: this.sprites, factory: this.factory || undefined, k,
      });
    }
    // feral rabbits: a red glare over the head; claw marks where they struck
    for (const a of list) {
      if (!a.alive || !a.snap.ag) continue;
      const f = this._frame(a), hx = f.mirror ? f.x + RABBIT_W - 1 - f.an.head.cx : f.x + f.an.head.cx;
      const y = Math.max(2, f.y + f.an.top - f.lift - 3);
      const on = Math.floor(t * 6 + a.phase) % 2 === 0;
      R(ctx, hx - 4, y, 2, 1, on ? '#ff3a2a' : '#a8241a'); R(ctx, hx + 3, y, 2, 1, on ? '#ff3a2a' : '#a8241a');
      R(ctx, hx - 3, y - 1, 1, 1, '#ff3a2a'); R(ctx, hx + 3, y - 1, 1, 1, '#ff3a2a');
    }
    for (const c of this.clashes) {
      if (c.love) {
        // two little hearts drifting up
        for (let i = 0; i < 2; i++) {
          const hx = c.x - 3 + i * 6, hy = Math.round(c.y - 2 - c.t * 10 - i * 2);
          const col = c.t < 0.5 ? '#ff5a8a' : '#c8306a';
          R(ctx, hx, hy, 1, 1, col); R(ctx, hx + 2, hy, 1, 1, col); R(ctx, hx - 1 + 1, hy + 1, 3, 1, col); R(ctx, hx + 1, hy + 2, 1, 1, col);
        }
        continue;
      }
      const k = c.t < 0.45 ? '#ff3a2a' : '#a8241a';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) R(ctx, c.x - 4 + i * 3 + j, c.y - 3 + j, 1, 1, j === 2 ? '#fff0e0' : k);
      if (c.t < 0.3) for (let i = 0; i < 6; i++) R(ctx, c.x + Math.round(Math.cos(i) * (4 + c.t * 20)), c.y + Math.round(Math.sin(i * 1.7) * (3 + c.t * 10)), 1, 1, '#f6ead0');
    }
    this._front(ctx);
    const hov = o.hover != null ? this.actors.get(String(o.hover)) : null;
    if (hov && !hov.hidden) {
      const b = this._box(hov), rx = Math.max(6, Math.round((b.x1 - b.x0) / 2) - 3);
      for (let i = 0; i < 12; i++) {
        const ang = (i * Math.PI) / 6;
        R(ctx, Math.round(hov.x + Math.cos(ang) * rx), Math.round(hov.y + 1 + Math.sin(ang) * 2), 1, 1, PAL.brassHi);
      }
    }
    const sel = o.selected != null ? this.actors.get(String(o.selected)) : null;
    if (sel && !sel.hidden) {
      // a brass marker bobbing over the selected rabbit's head
      const f = this._frame(sel), hx = f.mirror ? f.x + RABBIT_W - 1 - f.an.head.cx : f.x + f.an.head.cx;
      const y = Math.max(4, f.y + f.an.top - f.lift - 5 + Math.round(Math.sin(t * 4)));
      R(ctx, hx - 3, y - 1, 7, 2, '#1a1218'); R(ctx, hx - 2, y + 1, 5, 1, '#1a1218'); R(ctx, hx - 1, y + 2, 3, 1, '#1a1218'); R(ctx, hx, y + 3, 1, 1, '#1a1218');
      R(ctx, hx - 2, y, 5, 1, PAL.brass); R(ctx, hx - 1, y + 1, 3, 1, PAL.brass); R(ctx, hx, y + 2, 1, 1, PAL.brass); R(ctx, hx - 2, y, 2, 1, PAL.brassHi);
    }
  }

  /**
   * The rabbit under a point in art pixels (the topmost, by depth), or null.
   * Boxes are generous: 3px around the drawn rabbit, 6px for kits.
   * @param {number} x @param {number} y @returns {string|null}
   */
  hit(x, y) {
    const list = this._visible();
    for (let i = list.length - 1; i >= 0; i--) {
      const b = this._box(list[i]);
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return list[i].id;
    }
    return null;
  }

  /** The hit box of a rabbit in art pixels, or null. @param {string} id */
  boxOf(id) {
    const a = this.actors.get(String(id));
    return a && !a.hidden ? this._box(a) : null;
  }

  /** Feet position, facing and current act of a rabbit (for the UI and tests), or null. @param {string} id */
  where(id) {
    const a = this.actors.get(String(id));
    return a ? { x: Math.round(a.x), y: Math.round(a.y), face: a.face, act: a.act, hidden: a.hidden } : null;
  }

  // ---------------------------------------------------------------- internals

  /** @param {string} id @param {any} e @returns {Actor} */
  _spawn(id, e) {
    const r = new Rng(hashString(`hutch:${id}:${e.look.seed}`));
    /** @type {Actor} */
    const a = {
      id, look: e.look, snap: e.snap, L: rabbitLevels(e.snap), mother: null, alive: e.snap.alive !== false, hidden: false,
      x: 0, y: 0, face: r.chance(0.5) ? 1 : -1, act: 'idle', at: 0, dur: r.range(0.3, 2), pose: null,
      hops: 0, hopT: 0.34, hopH: 4, step: 8, sx: 0, sy: 0, tx: 0, ty: 0, gx: 0, gy: 0, next: null,
      n: 0, phase: r.range(0, 10), react: 0, reactCh: [], anSnap: null, anPose: null, an: null,
    };
    const R0 = this.pen.roam, p = this._roam(r.int(R0.x0, R0.x1), r.int(R0.y0, R0.y1));
    a.x = p.x; a.y = p.y;
    return a;
  }

  /** Put a rabbit back on the straw (it came back from the cloth). @param {Actor} a */
  _place(a) {
    const r = new Rng(hashString(`hutch:place:${a.id}:${a.n++}`));
    const R0 = this.pen.roam, p = this._roam(r.int(R0.x0, R0.x1), r.int(R0.y0, R0.y1));
    a.x = p.x; a.y = p.y;
    a.act = 'idle'; a.at = 0; a.dur = 1; a.pose = null; a.hops = 0;
  }

  /** @param {Actor} a @param {number} dt */
  _tick(a, dt) {
    const L = a.L, snap = a.snap;
    if (L.death === 3 || snap.hp >= 3) { a.act = 'collapse'; a.pose = null; return; } // too weak to move
    if (L.frost === 3) { a.act = 'frozen'; a.pose = null; return; } // frozen stiff
    if (a.act === 'collapse' || a.act === 'frozen') this._begin(a, 'idle', 0.5);
    a.at += dt * rabbitPace(snap);
    if (a.act === 'walk' || a.act === 'run') {
      // a cat or a salamander walks to its goal, striding as it goes
      const dx = a.gx - a.x, dy = a.gy - a.y, d = Math.hypot(dx, dy);
      const v = (WALKERS[kindOf(a.look)] || 10) * (a.act === 'run' ? 3 : 1) * (a.snap.stage === 'kit' ? 0.7 : 1);
      const s = Math.min(d, v * dt * rabbitPace(snap));
      if (d > 0.5) {
        // round whatever stands in the way (a pond, a log, a den): slide along it, or give up the walk
        const nx = a.x + (dx / d) * s, ny = a.y + (dy / d) * s;
        if (this.onGround(nx, ny)) { a.x = nx; a.y = ny; }
        else if (this.onGround(nx, a.y)) a.x = nx;
        else if (this.onGround(a.x, a.y + Math.sign(dy || 1) * s)) a.y += Math.sign(dy || 1) * s;
        else { a.next = null; this._decide(a); return; }
        if (Math.abs(dx) > 0.3) a.face = dx > 0 ? 1 : -1;
      }
      a.stride = (a.stride || 0) + s;
      // four beats to a stride, each a step's length on (a long-legged kind's steps longer)
      const beatLen = ({ deer: 2.6, cat: 2.2, fox: 2.2, dove: 1.2, snail: 1.5 })[kindOf(a.look)] || 1.6;
      a.pose = /** @type {any} */ (`walk${(Math.floor(a.stride / beatLen) % 4) + 1}`);
      if (d <= 0.5 || a.at > 12) {
        a.x = a.gx; a.y = a.gy;
        if (a.next === 'eat') { a.next = null; this._begin(a, 'eat', 2.6); } else this._decide(a);
      }
      return;
    }
    if (a.act === 'hop' || a.act === 'zoom') {
      const p = Math.min(1, a.at / a.hopT);
      a.x = a.sx + (a.tx - a.sx) * p;
      a.y = a.sy + (a.ty - a.sy) * p;
      // stretched out in the air, gathered up again to take off and land
      a.pose = p > 0.18 && p < 0.82 && a.tx !== a.sx ? 'hop' : null;
      if (p < 1) return;
      if (--a.hops > 0 && this._nextHop(a)) return;
      if (a.next === 'eat') { a.next = null; this._begin(a, 'eat', 2.6); } else this._decide(a);
      return;
    }
    if (a.act === 'float') {
      const dx = a.gx - a.x, dy = a.gy - a.y, d = Math.hypot(dx, dy), s = Math.min(d, 6 * dt);
      // it drifts toward its goal, but never settles over a bowl or the hide box
      if (d > 0.5 && this.onGround(a.x + (dx / d) * s, a.y + (dy / d) * s)) { a.x += (dx / d) * s; a.y += (dy / d) * s; if (Math.abs(dx) > 1) a.face = dx > 0 ? 1 : -1; }
    }
    if (a.at >= a.dur) this._decide(a);
  }

  /** Pick the next act from the rabbit's own seeded stream. @param {Actor} a */
  _decide(a) {
    const r = new Rng(hashString(`${a.id}:${a.look.seed}:${a.n++}`));
    const L = a.L, kit = a.snap.stage === 'kit';
    const sick = L.toxicity >= 2 || a.snap.hp >= 2;
    a.next = null;
    if (a.snap.ag && r.chance(0.6)) {
      // feral: stalk another rabbit
      const others = [...this.actors.values()].filter((o) => o !== a && o.alive && !o.hidden);
      if (others.length) { const o = r.pick(others); return this._hopTo(a, this._roam(o.x - 9 * Math.sign(o.x - a.x || 1), o.y), 3, true); }
    }
    if (sick && r.chance(0.8)) return this._begin(a, 'loaf', r.range(3, 6));
    if (L.arcana === 3 && r.chance(0.45)) {
      const g = this._goal(a, r, 26);
      a.gx = g.x; a.gy = g.y;
      return this._begin(a, 'float', r.range(2.5, 4));
    }
    if ((L.fire === 3 || L.vitality === 3) && r.chance(0.4)) return this._hopTo(a, this._goal(a, r, 60), 4, true);
    if (L.strength >= 2 && r.chance(0.3)) return this._begin(a, 'flex', r.range(1.2, 2));
    if ((L.love >= 2 || L.vitality >= 2) && a.snap.hp === 0 && r.chance(0.25)) return this._begin(a, 'flop', r.range(2.5, 4.5));
    const kind = kindOf(a.look);
    // a cat sits about and grooms, a toad mostly squats still, a salamander basks
    const w = { cat: [3, 2.5, 2.5, 1.2, 1], toad: [6, 2, 0.5, 1.2, 0.8], salamander: [5, 3, 0.3, 1, 1], snail: [6, 3, 0.2, 1.5, 0.5], rat: [1.5, 4, 1, 1.5, 3], dove: [2, 3, 1.5, 3, 1], deer: [3, 2, 1, 3, 1], badger: [3, 2.5, 0.8, 2, 2], fox: [3, 3, 2, 1, 1.5], ermine: [2, 4, 1.5, 1, 2.5] }[kind] || [3, 3, 1.5, 1.2, 1.5];
    const pick = r.weighted(['idle', 'hop', 'groom', 'eat', 'sniff'], w);
    if (pick === 'hop') return this._hopTo(a, this._goal(a, r, 30), kit ? 2 : r.int(1, 3), false);
    if (pick === 'eat') {
      const rack = this.pen.rack, dx = rack.x - a.x, dy = rack.y - a.y;
      if (Math.hypot(dx, dy) <= 4) return this._begin(a, 'eat', r.range(2, 3.5));
      a.next = 'eat';
      return this._hopTo(a, this._roam(rack.x + r.int(-3, 3), rack.y + r.int(0, 3)), 16, false);
    }
    const dur = pick === 'idle' ? r.range(1.2, 3.5) * (kit ? 0.6 : 1) : pick === 'groom' ? r.range(1.5, 2.5) : r.range(0.8, 1.4);
    return this._begin(a, pick, dur);
  }

  /** @param {Actor} a @param {string} act @param {number} dur */
  _begin(a, act, dur) {
    a.act = act; a.at = 0; a.dur = dur; a.hops = 0;
    a.pose = act === 'loaf' ? 'loaf' : act === 'flex' ? 'rear' : act === 'flop' ? 'flop' : act === 'eat' ? 'eat' : null;
    // a cat grooms sitting up
    if (act === 'groom' && kindOf(a.look) === 'cat') a.pose = 'rear';
    if (act === 'eat') a.face = -1;
  }

  /** Where to go next: kits trail their mother, the lovestruck seek company. @param {Actor} a @param {Rng} r @param {number} range */
  _goal(a, r, range) {
    const mom = a.snap.stage === 'kit' && a.mother ? this.actors.get(a.mother) : null;
    if (mom && mom.alive && !mom.hidden) return this._roam(mom.x - mom.face * 9 + r.int(-3, 3), mom.y + r.int(0, 3));
    if (a.L.love >= 2 && r.chance(0.5)) {
      let best = null, bd = Infinity;
      for (const o of this.actors.values()) {
        if (o === a || !o.alive || o.hidden) continue;
        const d = Math.hypot(o.x - a.x, o.y - a.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) return this._roam(best.x - 9 * Math.sign(best.x - a.x || 1), best.y + r.int(-2, 2));
    }
    return this._roam(a.x + r.range(-range, range), a.y + r.range(-range / 3, range / 3));
  }

  /** The point of the ground nearest to (x, y). @param {number} x @param {number} y */
  _roam(x, y) {
    if (this.onGround(x, y)) return { x, y };
    const pen = this.pen;
    let best = { x: pen.rack.x, y: pen.rack.y }, bd = Infinity;
    pen.ground.forEach((row, i) => {
      const gy = pen.y0 + i;
      for (const [x0, x1] of row) {
        const gx = clamp(x, x0, x1 - 1), d = (gx - x) ** 2 + (gy - y) ** 2;
        if (d < bd) { bd = d; best = { x: gx, y: gy }; }
      }
    });
    return best;
  }

  /** Start a run of hops toward a goal. @param {Actor} a @param {{x:number, y:number}} goal @param {number} n @param {boolean} zoom */
  _hopTo(a, goal, n, zoom) {
    const kit = a.snap.stage === 'kit';
    if (WALKERS[kindOf(a.look)]) {
      // walkers stroll (or, zooming, run) the whole way instead of hopping
      a.act = zoom ? 'run' : 'walk'; a.at = 0; a.hops = 0;
      a.gx = goal.x; a.gy = goal.y;
      if (Math.hypot(goal.x - a.x, goal.y - a.y) < 0.5) {
        // a poke: a startled step on the spot
        a.gx = this._roam(a.x + a.face * 3, a.y).x;
      }
      return;
    }
    const toad = kindOf(a.look) === 'toad';
    a.act = zoom ? 'zoom' : 'hop'; a.pose = null;
    a.gx = goal.x; a.gy = goal.y; a.hops = n;
    a.hopT = zoom ? 0.17 : 0.34; a.hopH = kit ? 2 : zoom ? 5 : 4;
    a.step = (kit ? 5 : 8) * (zoom ? 1.7 : 1);
    if (toad) { a.hopH = Math.max(2, a.hopH - 1); a.step *= 0.6; a.hopT *= 0.85; } // a toad's hops are short and low
    else if (kindOf(a.look) === 'ermine') { a.hopH = Math.max(2, a.hopH - 1); a.hopT *= 0.7; } // an ermine's bounds are quick and low
    if (!this._nextHop(a)) this._begin(a, 'idle', 0.6);
  }

  /** Plan the next hop of a run; false when already there. @param {Actor} a */
  _nextHop(a) {
    const dx = a.gx - a.x, dy = a.gy - a.y, d = Math.hypot(dx, dy);
    if (d < 0.5 && a.hops <= 0) return false;
    const len = Math.min(a.step, d);
    a.sx = a.x; a.sy = a.y;
    // a hop that would land in a bowl or the hide box lands beside it
    const land = d > 0 ? this._roam(a.x + (dx / d) * len, a.y + (dy / d) * len) : { x: a.x, y: a.y };
    a.tx = land.x; a.ty = land.y;
    if (Math.abs(dx) > 0.5) a.face = dx > 0 ? 1 : -1;
    a.at = 0;
    if (d < 0.5) a.hops = 1; // a hop on the spot (a poke), then stop
    return true;
  }

  /** @param {Actor} a */
  _anchors(a) {
    if (a.an && a.anSnap === a.snap && a.anPose === a.pose) return a.an;
    a.an = rabbitAnchors(a.look, a.snap, a.pose || undefined);
    a.anSnap = a.snap; a.anPose = a.pose;
    return a.an;
  }

  /** Frame origin, lift and facing of a rabbit as drawn now. @param {Actor} a */
  _frame(a) {
    const an = this._anchors(a), mirror = a.face < 0;
    let lift = 0, nx = 0, ny = 0;
    if (a.act === 'hop' || a.act === 'zoom') lift = Math.round(a.hopH * Math.sin(Math.PI * Math.min(1, a.at / a.hopT)));
    else if (a.act === 'groom') ny = Math.floor(a.at * 5) & 1;
    else if (a.act === 'eat') ny = Math.floor(a.at * 4) & 1;
    else if (a.act === 'sniff') nx = (Math.floor(a.at * 8) & 1) * a.face;
    const x = Math.round(a.x) - (mirror ? RABBIT_W - 1 - an.cx : an.cx) + nx;
    const y = Math.round(a.y) - an.feetY + ny;
    return { x, y, lift, mirror, an };
  }

  /** @param {Actor} a */
  _box(a) {
    const f = this._frame(a), b = f.an.box, pad = a.snap.stage === 'kit' ? 6 : 3;
    const x0 = f.mirror ? f.x + RABBIT_W - 1 - b.x1 : f.x + b.x0, x1 = f.mirror ? f.x + RABBIT_W - 1 - b.x0 : f.x + b.x1;
    return { x0: x0 - pad, y0: f.y + b.y0 - f.lift - pad, x1: x1 + pad, y1: f.y + b.y1 + pad };
  }

  /** Drawn rabbits in depth order (feet y, then id). */
  _visible() {
    return [...this.actors.values()].filter((a) => !a.hidden).sort((p, q) => p.y - q.y || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  }

  /** The painting of this enclosure's back or front, as a canvas (null without a DOM). @param {'back'|'front'} part */
  _art(part) {
    return canvasOf(part === 'back' ? this.pen.back : this.pen.front);
  }

  /** @param {CanvasRenderingContext2D} ctx */
  _front(ctx) {
    const factory = this.factory || (typeof document !== 'undefined' ? makeCanvas : null);
    const pen = this._art('front');
    if (!factory) { paintHutchFront(ctx, pen); return; }
    if (!this.fg || this.fgPen !== !!pen) { this.fg = factory(HUTCH_W, HUTCH_H); paintHutchFront(this.fg.getContext('2d'), pen); this.fgPen = !!pen; }
    ctx.drawImage(this.fg, 0, 0);
  }

  /** @param {CanvasRenderingContext2D} ctx */
  _background(ctx) {
    const o = { nest: this.nest, cloth: this.cloth, pen: this._art('back'), def: this.pen };
    const factory = this.factory || (typeof document !== 'undefined' ? makeCanvas : null);
    if (!factory) { paintHutch(ctx, o); return; }
    const key = `${this.pen.kind}${o.nest ? 1 : 0}${o.cloth ? 1 : 0}${o.pen ? 1 : 0}`;
    if (!this.bg || this.bgKey !== key) {
      this.bg = factory(HUTCH_W, HUTCH_H);
      paintHutch(this.bg.getContext('2d'), o);
      this.bgKey = key;
    }
    ctx.drawImage(this.bg, 0, 0);
  }
}
