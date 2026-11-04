// Wild animals in the wilds: a few hop, prowl or creep about each region's
// open ground — rabbits everywhere, and, by habitat (game/kinds.js), cats
// that stroll, sit and pounce, toads that squat and make short hops, fire
// salamanders that creep slowly and bask, deer that graze and bound away,
// badgers that trundle and root, doves that peck and take wing, foxes that
// trot and pounce high, ermines that bound and stand up to look about,
// snails that glide and hide in their shells, and rats that scurry in
// short dashes. Each kind moves in its own way,
// calm and alarmed (`hop`, `kindMove`, `walkStep` and `flyStep` below;
// GAITS sets each kind's speeds, leaps, rests and what fright makes it do); wounds, blood, the catch
// and the body are the same for all of them.
//
// Wild rabbits in the wilds: a few hop about each region's open ground,
// grazing and resting between calm hops. A tap on one wounds it: blood
// bursts from where it was struck, and from then on it bleeds — drips as it
// runs, spurts as it lands, a trail of it on the ground behind — and it
// flees in long, quick bounds that hardly stop (even a tap that misses close
// by sets it running so). It bleeds out fast: BLEED_OUT seconds after the
// first wound it drops dead. Tapped a third time before then it is caught
// alive (it goes home to the hutch, weak from its wounds); otherwise its
// body can be carried home for its remains.
//
// Every drop of blood is a particle under gravity; where it meets the
// ground, rock or a trunk it stains it (`stains`, painted by the view onto
// the scene for as long as the player stays in the wilds), and where it
// falls in water it clouds it. Pure (no DOM): the scene is given as
// `solid` / `liquid` tests, so the whole thing runs in Node too.

import { Rng, hashString } from '../core/rng.js';
import { rollLook } from './colony.js';
import { pickKind, kindLook } from './kinds.js';
import { NATIVE_SPECIES } from './native-species.js';

/** Pull of gravity on a rabbit and on blood, scene pixels per second². */
export const HOP_GRAVITY = 300, BLOOD_GRAVITY = 260;
/** Taps that catch an animal (the first two wound it). */
export const WILD_HP = 3;
/** Seconds a wounded animal lives on, bleeding, after its first wound. */
export const BLEED_OUT = 4;
/** How close (scene pixels) a tap that misses must come to set a rabbit running. */
export const NEAR_MISS = 24;
/** How many rabbits a region keeps, and how soon (seconds) a new one comes in from the edge. */
export const WARREN_SIZE = { forest: 6, meadow: 6, river: 5, netherwood: 5, quarry: 4, moonfen: 5, crags: 4 };
export const RESPAWN = 25;

/** The blood's colours, fresh to dark. */
export const BLOOD = ['#b0141c', '#8e0c14', '#6c060e', '#c8202a', '#54040a'];

/**
 * @typedef {(x:number, y:number) => boolean} Test  whether the scene pixel (x, y) is something (ground, water)
 * @typedef {{x:number, y:number, vx:number, vy:number, t:number, s:number, c:string}} Drop
 * @typedef {{x:number, y:number, c:string}} Stain  a pixel of the scene coloured by blood
 * @typedef {{x:number, y:number, t:number, r:number}} Cloud  blood spreading in water
 */

/** A wild rabbit's look: mostly the coats of the wild (agouti, grey, brown), upright ears. @param {Rng} rng */
export function wildLook(rng) {
  const look = rollLook(rng);
  const coats = [[0.55, 0.42, 0.3], [0.6, 0.58, 0.62], [0.47, 0.36, 0.26], [0.36, 0.24, 0.18], [0.66, 0.54, 0.4]];
  look.coat = coats[rng.int(0, coats.length - 1)].slice();
  look.coat2 = rng.chance(0.7) ? [0.93, 0.89, 0.82] : [0.2, 0.18, 0.2];
  look.pattern = rng.chance(0.65) ? 'agouti' : 'solid';
  look.ear = rng.chance(0.85) ? 'upright' : 'half';
  look.eye = 'dark';
  return look;
}

/**
 * How each kind gets about (scene pixels and seconds).
 *   walk / run   calm and fleeing ground speed ([0, 0]: it does not walk)
 *   walkT        how long a stroll lasts
 *   hop          a calm leap [vx lo, vx hi, vy lo, vy hi] (a toad's hop, a fox's or a cat's pounce, an ermine's bound), and its chance
 *   flee         a fleeing leap, and the chance a fleeing step is one
 *   pWalk        the chance that, rested, it sets off walking
 *   poses        what it does when it rests, by weight (null: just stands)
 *   rest         seconds it rests between moves
 *   climb        the highest step it walks up or down
 *   alarm        what fright makes it do: 'run' (or leap), 'bound' (leaps
 *                only), 'fly' (a dove takes wing), 'hide' (a snail draws
 *                into its shell)
 *   fly          the chance a calm dove takes a short flight
 * @typedef {{walk:[number, number], run:[number, number], walkT:[number, number], hop:number[]|null, pHop:number, flee:number[]|null, pFlee:number, pWalk:number, poses:[string|null, number][], rest:[number, number], climb:number, alarm:'run'|'bound'|'fly'|'hide', fly?:number, leapsWalls?:boolean}} Gait
 * @type {Record<string, Gait>}
 */
export const GAITS = {
  rabbit: { walk: [0, 0], run: [0, 0], walkT: [0, 0], hop: [16, 30, 42, 58], pHop: 1, flee: [78, 100, 82, 108], pFlee: 1, pWalk: 0, poses: [['eat', 35], ['rear', 10], [null, 55]], rest: [0.8, 3.2], climb: 4, alarm: 'bound' },
  // strolls, sits, grooms and now and then pounces; flees at a sprint, leaping what is in the way
  cat: { walk: [11, 17], run: [80, 100], walkT: [1.2, 4], hop: [44, 58, 52, 66], pHop: 0.12, flee: [90, 110, 70, 90], pFlee: 0.15, pWalk: 0.68, poses: [['rear', 40], ['loaf', 30], ['eat', 15], [null, 15]], rest: [1.2, 4], climb: 4, alarm: 'run', leapsWalls: true },
  // squats a long while, then a short low hop; frightened, quick little hops
  toad: { walk: [0, 0], run: [0, 0], walkT: [0, 0], hop: [10, 18, 30, 40], pHop: 0.55, flee: [40, 56, 52, 68], pFlee: 1, pWalk: 0, poses: [['eat', 50], ['rear', 15], [null, 35]], rest: [2, 5.5], climb: 3, alarm: 'bound' },
  // creeps along slowly and basks; frightened, it scurries
  salamander: { walk: [5, 9], run: [36, 46], walkT: [1.2, 5], hop: null, pHop: 0, flee: null, pFlee: 0, pWalk: 0.65, poses: [[null, 50], ['rear', 25], ['eat', 25]], rest: [1.5, 5], climb: 3, alarm: 'run' },
  // grazes and steps on slowly, raises its head to look about; frightened, it bounds away in great leaps
  deer: { walk: [7, 11], run: [0, 0], walkT: [1, 3], hop: null, pHop: 0, flee: [80, 100, 95, 115], pFlee: 1, pWalk: 0.45, poses: [['eat', 55], ['rear', 25], ['loaf', 8], [null, 12]], rest: [1.5, 4.5], climb: 4, alarm: 'bound', leapsWalls: true },
  // trundles about and roots in the ground; frightened, a heavy, not very fast run
  badger: { walk: [6, 10], run: [44, 54], walkT: [1.5, 4], hop: null, pHop: 0, flee: null, pFlee: 0, pWalk: 0.55, poses: [['eat', 55], ['rear', 15], [null, 30]], rest: [1.5, 4], climb: 3, alarm: 'run' },
  // walks with a bobbing head and pecks; flutters up a little now and then, and takes wing when frightened
  dove: { walk: [5, 9], run: [0, 0], walkT: [0.8, 2.5], hop: [10, 18, 40, 52], pHop: 0.08, flee: null, pFlee: 0, pWalk: 0.5, poses: [['eat', 60], ['rear', 15], [null, 25]], rest: [0.8, 2.5], climb: 3, alarm: 'fly', fly: 0.07 },
  // trots about, sits, curls up, and pounces high on mice; flees at a long run
  fox: { walk: [12, 18], run: [100, 120], walkT: [1.5, 4], hop: [25, 40, 95, 110], pHop: 0.15, flee: [100, 120, 70, 85], pFlee: 0.12, pWalk: 0.6, poses: [['rear', 35], ['loaf', 30], ['eat', 20], [null, 15]], rest: [1, 3.5], climb: 4, alarm: 'run', leapsWalls: true },
  // restless: quick low bounds, and up on its hind legs to look about; frightened, long fast bounds
  ermine: { walk: [0, 0], run: [0, 0], walkT: [0, 0], hop: [20, 34, 40, 52], pHop: 0.65, flee: [85, 105, 60, 80], pFlee: 1, pWalk: 0, poses: [['rear', 50], ['eat', 15], [null, 35]], rest: [0.4, 1.6], climb: 4, alarm: 'bound' },
  // glides along ever so slowly; frightened, or struck, it draws into its shell a while
  snail: { walk: [1.2, 2.2], run: [0, 0], walkT: [3, 8], hop: null, pHop: 0, flee: null, pFlee: 0, pWalk: 0.75, poses: [['eat', 40], ['rear', 20], [null, 40]], rest: [2, 6], climb: 2, alarm: 'hide' },
  // scurries in short dashes, stopping to sniff up on its hind legs; frightened, it bolts
  rat: { walk: [14, 22], run: [90, 110], walkT: [0.3, 1], hop: null, pHop: 0, flee: null, pFlee: 0, pWalk: 0.6, poses: [['rear', 40], ['eat', 30], [null, 30]], rest: [0.3, 1.5], climb: 3, alarm: 'run' },
};
for (const [id, n] of Object.entries(NATIVE_SPECIES)) if (!GAITS[id]) GAITS[id] = { ...GAITS[n.gait], ...(n.gait === 'dove' ? { fly: 0.35, rest: [0.4, 1.4] } : {}) };

export class WildRabbit {
  /**
   * @param {string} id @param {number} x @param {number} y its feet (scene pixels) @param {Rng} rng
   * @param {import('./kinds.js').AnimalKind} [kind]
   */
  constructor(id, x, y, rng, kind = 'rabbit') {
    this.id = id;
    this.kind = kind;
    this.look = kind === 'rabbit' ? wildLook(rng) : kindLook(kind, rng);
    /** @type {'f'|'m'} */
    this.sex = rng.chance(0.5) ? 'f' : 'm';
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.air = false;
    /** which way it faces: 1 right, -1 left */
    this.face = rng.chance(0.5) ? 1 : -1;
    /** seconds before its next hop */
    this.rest = rng.range(0.2, 2.5);
    /** what it does while resting: sit, graze or rear up */
    this.pose = /** @type {string|null} */ (null);
    this.hits = 0;
    /** seconds it has bled since its first wound (it dies at BLEED_OUT) */
    this.bleedT = 0;
    /** frantic since the first attempt on its life: it bounds about fast and hardly stops */
    this.alarm = false;
    /** where the danger came from (it flees away from it) */
    this.from = x;
    this.down = false;
    this.dead = false;
    /** seconds since it went down */
    this.downT = 0;
    /** where it was struck, relative to its feet (facing right) @type {[number, number][]} */
    this.wounds = [];
    /** seconds to the next drip, and to the next spurt */
    this.drip = 0;
    this.spurt = 0.6;
    /** the flinch of a blow (fades) */
    this.react = 0;
    /** walking on the ground (cats, salamanders): seconds of it left, and its speed */
    this.walkT = 0;
    this.walkV = 0;
    /** distance walked (the stride of its legs) */
    this.stride = 0;
    /** a dove's flight: seconds of it left, the height it makes for, and its speed */
    this.fly = 0;
    this.flyY = 0;
    this.flyV = 0;
    /** a snail's time drawn into its shell */
    this.hide = 0;
    this.t = rng.range(0, 10);
  }

  /** How badly it is hurt, as the renderer's health band (0 healthy … 3 down). */
  get band() {
    return this.dead || this.down ? 3 : Math.min(2, this.hits);
  }

  /** The blood it has left, 1 unhurt … 0 dead. */
  get blood() {
    return this.dead ? 0 : this.hits ? Math.max(0, 1 - this.bleedT / BLEED_OUT) : 1;
  }

  /** Whether it is walking along the ground just now. */
  get walking() {
    return this.running && !this.air && this.walkT > 0;
  }

  /** Whether it is flying (a dove on the wing). */
  get flying() {
    return this.running && this.fly > 0;
  }

  /** Its pose as drawn: off the ground, striding, or what it does while resting. */
  get drawPose() {
    // a dove beats its wings in flight and spreads them to glide down
    if (GAITS[this.kind]?.fly && this.fly > 0) return Math.floor(this.t * 9) & 1 ? 'fly1' : 'fly2';
    if (this.kind === 'snail' && this.hide > 0 && this.running) return 'loaf';
    if (this.air) return 'hop';
    if (this.walking) return `walk${(Math.floor(this.stride / ({ cat: 2.2, fox: 2.2, deer: 2.6 }[this.kind] || 1.6)) % 4) + 1}`;
    return this.running && !this.alarm ? this.pose || undefined : undefined;
  }

  /** Whether it is still up and about. */
  get running() {
    return !this.dead && !this.down;
  }

  /** The box it is struck in (scene pixels): its body round its feet. @param {number} [pad] */
  box(pad = 0) {
    const lying = this.dead || this.down;
    // (a wild animal is drawn at half the hutch's size: about 18 scene pixels long; a salamander and a toad keep low)
    const tall = { salamander: 6, toad: 8, snail: 8, rat: 7, ermine: 8, badger: 9, dove: 9, cat: 12, fox: 12, deer: 17 }[this.kind] ?? 11;
    return lying
      ? { x0: this.x - 8 - pad, y0: this.y - 6 - pad, x1: this.x + 8 + pad, y1: this.y + 1 + pad }
      : { x0: this.x - 7 - pad, y0: this.y - tall - pad, x1: this.x + 7 + pad, y1: this.y + 1 + pad };
  }
}

export class Warren {
  /**
   * The rabbits of a region.
   * @param {string} region @param {string} seed
   * @param {{solid:Test, liquid:Test, W:number, H:number, spots:[number, number][], habitat?:[string, number][], finite?:boolean}} scene its ground, the spots an animal may start on, and (optionally) which kinds live there
   */
  constructor(region, seed, scene) {
    this.region = region;
    this.solid = scene.solid; this.liquid = scene.liquid;
    this.W = scene.W; this.H = scene.H;
    this.spots = scene.spots;
    /** which kinds live here, by weight (kinds.js HABITAT unless given) */
    this.habitat = scene.habitat || null;
    this.finite = !!scene.finite;
    this.rng = new Rng(hashString(`warren:${seed}:${region}`));
    this.serial = 0;
    /** @type {WildRabbit[]} */
    this.rabbits = [];
    /** blood in flight @type {Drop[]} */
    this.drops = [];
    /** pixels newly stained since the view last took them @type {Stain[]} */
    this.stains = [];
    /** blood spreading in water @type {Cloud[]} */
    this.clouds = [];
    /** seconds until a newcomer arrives */
    this.due = RESPAWN;
    this.size = WARREN_SIZE[region] ?? 3;
    for (let i = 0; i < this.size && this.spots.length; i++) this.add();
  }

  /** A new rabbit at a random spot (or, coming in, at an edge of the scene). @param {boolean} [edge] */
  add(edge = false) {
    if (!this.spots.length) return null;
    let at = this.spots[this.rng.int(0, this.spots.length - 1)];
    if (edge) {
      // the open spot nearest one side or the other
      const left = this.rng.chance(0.5);
      at = this.spots.reduce((b, s) => (left ? s[0] < b[0] : s[0] > b[0]) ? s : b, at);
    }
    const h = this.habitat;
    const kind = /** @type {import('./kinds.js').AnimalKind} */ (h ? this.rng.weighted(h.map((x) => x[0]), h.map((x) => x[1])) : pickKind(this.region, this.rng));
    const r = new WildRabbit(`${this.region}-${++this.serial}`, at[0], at[1], this.rng, kind);
    if (edge) { r.face = at[0] < this.W / 2 ? 1 : -1; r.rest = 0.1; }
    this.rabbits.push(r);
    return r;
  }

  /** The rabbit under a scene point (nearest where boxes overlap), grown to a fingertip. @param {number} x @param {number} y @param {number} [pad] */
  at(x, y, pad = 4) {
    let best = null, bd = Infinity;
    for (const r of this.rabbits) {
      const b = r.box(pad);
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      const d = (x - r.x) ** 2 + (y - r.y + 5) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  /** The running rabbits near a point (a tap that missed them). @param {number} x @param {number} y */
  near(x, y) {
    return this.rabbits.filter((r) => r.running && Math.hypot(r.x - x, r.y - 5 - y) <= NEAR_MISS);
  }

  /**
   * An attempt on a rabbit's life that missed: it bolts, and is frantic from then on.
   * @param {WildRabbit} r @param {number} x where the blow fell
   */
  scare(r, x) {
    if (!r.running) return;
    r.alarm = true;
    r.from = x;
    r.pose = null;
    r.walkT = 0;
    if (!r.air) r.rest = 0;
  }

  /**
   * A blow on a rabbit at (x, y): blood bursts from the wound, away from the
   * blow and up; it flees, bleeding out fast; the third tap catches it (it
   * goes limp, 'caught': the view takes it home), and a blow on one already
   * down kills it.
   * @param {WildRabbit} r @param {number} x @param {number} y
   * @returns {'wounded'|'caught'|'killed'|null}
   */
  strike(r, x, y) {
    if (r.dead) return null;
    const b = r.box();
    // the wound, on its body where the blow fell (as if it faced right)
    const wx = Math.max(b.x0 + 2, Math.min(b.x1 - 2, x)) - r.x, wy = Math.max(b.y0 + 2, Math.min(b.y1 - 2, y)) - r.y;
    r.wounds.push([wx * r.face, wy]);
    if (r.wounds.length > 6) r.wounds.shift();
    r.hits++;
    r.react = 1;
    const side = x < r.x ? 1 : -1;
    this.burst(r.x + wx, r.y + wy, side, 18 + r.hits * 8, 1);
    if (r.down) { this.kill(r); return 'killed'; }
    r.alarm = true;
    r.from = x;
    r.pose = null;
    r.walkT = 0;
    if (r.hits >= WILD_HP) {
      // (a dove struck down out of the air falls)
      if (r.fly > 0) { r.fly = 0; r.air = true; r.vy = Math.max(0, r.vy); }
      r.down = true;
      r.downT = 0;
      r.vx *= 0.3;
      return 'caught';
    }
    // it leaps away at once
    if (!r.air) r.rest = 0;
    return 'wounded';
  }

  /** It dies where it lies: a last gush, and the blood pools under it. @param {WildRabbit} r */
  kill(r) {
    if (r.dead) return;
    r.dead = true; r.down = false;
    r.react = 0.6;
    r.vx *= 0.3; r.fly = 0; r.walkT = 0;
    this.burst(r.x, r.y - 3, 0, 16, 0.6);
  }

  /** Take a rabbit out of the scene (caught, or its body carried off). @param {WildRabbit} r */
  remove(r) {
    this.rabbits = this.rabbits.filter((q) => q !== r);
  }

  /** Saved population, including wounds and deaths. Reloading never creates a new animal. */
  snapshot() {
    return { version: 1, serial: this.serial, rng: [this.rng.a, this.rng.b, this.rng.c, this.rng.d],
      animals: this.rabbits.map((r) => ({ ...r, look: structuredClone(r.look), wounds: r.wounds.map((w) => w.slice()) })) };
  }

  /** Restore only identities from this generation; reject malformed values at the boundary. */
  restore(raw) {
    if (raw?.version !== 1 || !Array.isArray(raw.animals)) return false;
    const valid = new Map(this.rabbits.map((r) => [r.id, r]));
    const seen = new Set();
    this.rabbits = raw.animals.slice(0, this.size).flatMap((s) => {
      const r = valid.get(s?.id);
      if (!r || seen.has(r.id) || s.kind !== r.kind) return [];
      seen.add(r.id);
      // Appearance and sex are already deterministically generated. Stored simulation
      // values may change behaviour, never species identity or the population limit.
      for (const k of ['x', 'y', 'vx', 'vy', 'rest', 'bleedT', 'downT', 'drip', 'spurt', 'react', 'walkT', 'walkV', 'stride', 'fly', 'flyY', 'flyV', 'hide', 't', 'from']) {
        if (typeof s[k] === 'number' && Number.isFinite(s[k])) r[k] = Math.max(-10000, Math.min(10000, s[k]));
      }
      r.x = Math.max(4, Math.min(this.W - 4, r.x)); r.y = Math.max(4, Math.min(this.H - 2, r.y));
      for (const k of ['air', 'alarm', 'down', 'dead']) r[k] = !!s[k];
      r.hits = Math.max(0, Math.min(WILD_HP, Math.floor(s.hits) || 0));
      r.face = s.face === -1 ? -1 : 1;
      r.pose = [null, 'eat', 'rear', 'loaf'].includes(s.pose) ? s.pose : null;
      r.wounds = Array.isArray(s.wounds) ? s.wounds.filter((w) => Array.isArray(w) && w.length === 2 && w.every(Number.isFinite)).slice(0, WILD_HP).map((w) => [Math.max(-20, Math.min(20, w[0])), Math.max(-24, Math.min(4, w[1]))]) : [];
      return [r];
    });
    if (Array.isArray(raw.rng) && raw.rng.length === 4 && raw.rng.every(Number.isInteger)) [this.rng.a, this.rng.b, this.rng.c, this.rng.d] = raw.rng;
    return true;
  }

  /**
   * Blood thrown from (x, y): `side` the way it flies (0 every way),
   * `n` drops, `force` how hard.
   * @param {number} x @param {number} y @param {number} side @param {number} n @param {number} force
   */
  burst(x, y, side, n, force) {
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      const dir = side || (rng.chance(0.5) ? 1 : -1), v = (40 + rng.next() * 90) * force;
      const a = rng.range(-1.35, 0.25);
      this.drops.push({
        x: x + rng.range(-1, 1), y: y + rng.range(-1, 1),
        vx: dir * Math.cos(a) * v * (side ? 1 : rng.range(0.3, 1)) + rng.range(-12, 12), vy: Math.sin(a) * v * 1.1 - rng.range(0, 20),
        t: 0, s: rng.chance(0.3) ? 2 : 1, c: BLOOD[rng.int(0, 3)],
      });
    }
  }

  /** A drop or two falling from a wound. @param {WildRabbit} r @param {number} n @param {number} [v] */
  bleed(r, n, v = 0) {
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      const w = r.wounds.length ? r.wounds[rng.int(0, r.wounds.length - 1)] : [0, -4];
      this.drops.push({
        x: r.x + w[0] * r.face + rng.range(-1, 1), y: r.y + w[1],
        vx: r.vx * 0.3 + rng.range(-10, 10) + (v ? -r.face * rng.range(10, 40) * v : 0), vy: v ? -rng.range(30, 70) * v : rng.range(-5, 10),
        t: 0, s: 1, c: BLOOD[rng.int(0, 4)],
      });
    }
  }

  /** Mark a scene pixel and the surface right round it as stained (where it is something). @param {number} x @param {number} y @param {string} c @param {number} spread */
  stain(x, y, c, spread) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return;
    this.stains.push({ x, y, c });
    const rng = this.rng;
    for (let k = 0; k < spread; k++) {
      const sx = x + rng.int(-2, 2), sy = y + rng.int(-1, 1);
      if (sx >= 0 && sx < this.W && sy >= 0 && sy < this.H && this.solid(sx, sy)) this.stains.push({ x: sx, y: sy, c: BLOOD[rng.int(1, 4)] });
    }
  }

  /** The ground's top under (x, y): the first row at or below y with something under it. @param {number} x @param {number} y */
  floor(x, y) {
    let yy = Math.max(0, Math.round(y));
    const X = Math.round(x);
    while (yy < this.H - 1 && !this.solid(X, yy + 1)) yy++;
    return yy;
  }

  /**
   * The next hop of a rabbit standing on the ground: calm, a short one now
   * and then (or a turn, or it grazes); frantic, long fast bounds away from
   * the danger, hardly stopping, now and then doubling back.
   * @param {WildRabbit} r
   */
  hop(r) {
    const rng = this.rng, G = GAITS[r.kind] || GAITS.rabbit;
    if (r.kind !== 'rabbit') return this.kindMove(r, G);
    if (r.alarm) {
      // away from where the blow came from, zigzagging; a wall or the scene's edge turns it
      r.face = r.x < r.from ? -1 : 1;
      if (rng.chance(0.18)) r.face = -r.face;
      const speed = rng.range(78, 100) * (1 + 0.12 * Math.min(2, r.hits));
      r.vx = r.face * speed;
      r.vy = -rng.range(82, 108);
    } else {
      if (rng.chance(0.3)) r.face = -r.face;
      r.vx = r.face * rng.range(16, 30);
      r.vy = -rng.range(42, 58);
    }
    // the edges of the scene turn it back; so does water ahead (it will not jump in)
    const flight = (2 * -r.vy) / HOP_GRAVITY, lx = r.x + r.vx * flight;
    if (lx < 8 || lx > this.W - 8 || this.wet(lx, r.y)) { r.face = -r.face; r.vx = -r.vx; }
    r.air = true;
    r.pose = null;
    // a wounded one throws blood off as it bounds
    if (r.hits) this.bleed(r, 2 + r.hits * 2, 0.7);
  }

  /**
   * The next move of any kind but the rabbit, standing on the ground, from
   * its gait (GAITS): calm, it walks a while, makes its leap (a toad's hop,
   * a pounce, an ermine's bound), a dove now and then takes a short flight,
   * or it rests in one of its poses; frightened, it runs, bounds, takes
   * wing, or — a snail — draws into its shell.
   * @param {WildRabbit} r @param {Gait} G
   */
  kindMove(r, G) {
    const rng = this.rng;
    r.pose = null;
    if (r.alarm) {
      if (G.alarm === 'hide') {
        // into the shell for a while; then, calmer, it creeps on
        r.hide = rng.range(4, 8) + 2 * r.hits;
        r.rest = r.hide;
        r.alarm = false;
        return;
      }
      r.face = r.x < r.from ? -1 : 1;
      if (rng.chance(r.kind === 'toad' ? 0.2 : 0.1)) r.face = -r.face;
      if (G.alarm === 'fly') return this.takeOff(r, true);
      if (G.flee && (G.alarm === 'bound' || rng.chance(G.pFlee))) return this.leap(r, G.flee, 1 + 0.12 * Math.min(2, r.hits));
      r.walkV = rng.range(G.run[0], G.run[1]) * (1 + 0.1 * Math.min(2, r.hits));
      r.walkT = rng.range(0.6, 1.4);
      return;
    }
    if (rng.chance(0.3)) r.face = -r.face;
    if (G.fly && rng.chance(G.fly)) return this.takeOff(r, false);
    if (G.hop && rng.chance(G.pHop)) return this.leap(r, G.hop, 1);
    if (G.walk[1] > 0 && rng.chance(G.pWalk)) {
      r.walkV = rng.range(G.walk[0], G.walk[1]);
      r.walkT = rng.range(G.walkT[0], G.walkT[1]);
      return;
    }
    r.pose = rng.weighted(G.poses.map((p) => p[0]), G.poses.map((p) => p[1]));
    r.rest = rng.range(G.rest[0], G.rest[1]);
  }

  /**
   * A dove takes wing: up to a height well above where it was (frightened,
   * higher, faster and longer), then on across the scene until it glides
   * down to land.
   * @param {WildRabbit} r @param {boolean} scared
   */
  takeOff(r, scared) {
    const rng = this.rng;
    r.fly = scared ? rng.range(2.2, 4) : rng.range(0.8, 1.6);
    r.flyY = Math.max(8, r.y - (scared ? rng.range(35, 70) : rng.range(12, 24)));
    r.flyV = scared ? rng.range(70, 90) * (1 + 0.1 * Math.min(2, r.hits)) : rng.range(30, 45);
    r.air = true; r.vx = r.face * r.flyV; r.vy = -60;
    r.pose = null; r.walkT = 0;
    if (r.hits) this.bleed(r, 2 + r.hits, 0.6);
  }

  /**
   * A dove in flight, by dt: wings beating, it climbs to its height and flies
   * on, turning back from rock and the scene's edges; when the flight is
   * spent it glides down (the ordinary fall lands it), but never onto water.
   * @param {WildRabbit} r @param {number} dt
   */
  flyStep(r, dt) {
    const solid = this.solid;
    r.fly -= dt;
    r.vy += ((r.flyY - r.y) * 2.5 - r.vy) * Math.min(1, dt * 4);
    r.vx = r.face * r.flyV;
    const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
    if (nx < 6 || nx > this.W - 6 || solid(Math.round(nx), Math.round(r.y) - 3) || solid(Math.round(nx), Math.round(r.y))) { r.face = -r.face; r.vx = -r.vx; }
    else r.x = nx;
    if (!(r.vy < 0 && solid(Math.round(r.x), Math.round(ny) - 6)) && !solid(Math.round(r.x), Math.round(ny) + 1)) r.y = Math.max(4, ny);
    else r.vy = 0;
    // a wounded one drips blood as it flies
    if (r.hits && this.rng.chance(dt * 6)) this.bleed(r, 1);
    if (r.fly <= 0) {
      // over water it flies on a little longer; otherwise it glides down
      if (this.wet(r.x, r.y)) { r.fly = 0.4; return; }
      r.fly = 0;
      r.vx = r.face * Math.min(r.flyV, 30);
      r.vy = 0;
      if (!r.alarm || !r.hits) r.alarm = false;
    }
  }

  /** A leap: [vx lo, vx hi, vy lo, vy hi] in the way it faces. @param {WildRabbit} r @param {number[]} v @param {number} k */
  leap(r, v, k) {
    const rng = this.rng;
    r.vx = r.face * rng.range(v[0], v[1]) * k;
    r.vy = -rng.range(v[2], v[3]);
    const flight = (2 * -r.vy) / HOP_GRAVITY, lx = r.x + r.vx * flight;
    if (lx < 8 || lx > this.W - 8 || this.wet(lx, r.y)) { r.face = -r.face; r.vx = -r.vx; }
    r.air = true;
    r.pose = null;
    r.walkT = 0;
    if (r.hits) this.bleed(r, 2 + r.hits * 2, 0.7);
  }

  /**
   * One step of walking along the ground: it follows the surface up and
   * down small steps; a drop, a wall, water or the scene's edge turns it
   * back — but a fleeing cat leaps up walls and down drops.
   * @param {WildRabbit} r @param {number} dt
   */
  walkStep(r, dt) {
    const G = GAITS[r.kind] || GAITS.rabbit, solid = this.solid;
    r.walkT -= dt;
    const nx = r.x + r.face * r.walkV * dt, X = Math.round(nx);
    const turn = () => { r.face = -r.face; if (!r.alarm) r.walkT = Math.min(r.walkT, 0.3); };
    if (nx < 6 || nx > this.W - 6 || this.wet(nx + r.face * 4, r.y)) return turn();
    // the surface under the next column: climb a step, or step down one
    let y = Math.round(r.y), k = 0;
    while (k <= G.climb && solid(X, y)) { y--; k++; }
    if (k > G.climb) {
      if (G.leapsWalls && r.alarm && G.flee) return this.leap(r, G.flee, 1);
      return turn();
    }
    if (k === 0) {
      let d = 0;
      while (d <= G.climb && !solid(X, y + 1)) { y++; d++; }
      if (d > G.climb) {
        if (G.leapsWalls && r.alarm) { r.x = nx; r.air = true; r.vx = r.face * r.walkV * 0.8; r.vy = 0; r.walkT = 0; return; }
        return turn();
      }
    }
    r.stride += Math.abs(nx - r.x);
    r.x = nx; r.y = y;
    // a wounded one drips as it goes
    if (r.hits && Math.floor(r.stride / 6) !== Math.floor((r.stride - r.walkV * dt) / 6)) this.bleed(r, 1);
    if (r.walkT <= 0) {
      r.walkT = 0;
      r.rest = r.alarm ? this.rng.range(0.02, 0.1) : this.rng.range(G.rest[0], G.rest[1]) * 0.6;
    }
  }

  /** Whether the ground round column x near row y is water (or lava). @param {number} x @param {number} y */
  wet(x, y) {
    const X = Math.round(x);
    for (let yy = Math.max(0, Math.round(y) - 24); yy < this.H; yy++) {
      if (this.liquid(X, yy)) return true;
      if (this.solid(X, yy)) return false;
    }
    return false;
  }

  /**
   * Everything on by dt seconds.
   * @param {number} dt
   */
  step(dt) {
    dt = Math.min(dt, 0.05);
    for (const r of this.rabbits) this.move(r, dt);
    // a newcomer now and then, until the region holds its share of the living
    const live = this.rabbits.filter((r) => r.running).length;
    if (!this.finite && live < this.size) { this.due -= dt; if (this.due <= 0) { this.add(true); this.due = RESPAWN; } }
    // and bodies beyond a few are left to the foxes
    const bodies = this.rabbits.filter((r) => r.dead);
    if (!this.finite && bodies.length > 3) this.remove(bodies[0]);
    this.flow(dt);
  }

  /** One rabbit on by dt. @param {WildRabbit} r @param {number} dt */
  move(r, dt) {
    const solid = this.solid;
    r.t += dt;
    r.react = Math.max(0, r.react - dt * 3);
    // its wounds bleed: drips, quicker the worse it is, and spurts with its heartbeat
    if (r.hits && !r.dead) {
      r.drip -= dt;
      if (r.drip <= 0) { this.bleed(r, 1 + (r.hits >> 1)); r.drip = (r.down ? 0.1 : 0.28) / r.hits; }
      r.spurt -= dt;
      if (r.spurt <= 0) {
        // a hemorrhage: jets with its heartbeat, harder the worse the wounds
        this.bleed(r, r.down ? 3 : 2 + r.hits * 2, r.down ? 0.5 : 0.5 + 0.25 * r.hits);
        r.spurt = r.down ? 0.9 : 0.75 - 0.1 * r.hits;
      }
    }
    if (r.dead && r.downT < 6) {
      // the blood pools under the body for a while
      r.downT += dt;
      if (Math.floor((r.downT - dt) * 5) !== Math.floor(r.downT * 5)) this.stain(r.x + this.rng.int(-6, 6), this.floor(r.x, r.y) + 1, BLOOD[this.rng.int(1, 4)], 1);
    }
    if (r.hits && !r.dead) {
      // it bleeds out fast from its first wound
      r.bleedT += dt;
      if (r.down) r.downT += dt;
      if (r.bleedT >= BLEED_OUT) this.kill(r);
    }
    if (r.fly > 0 && r.running) { this.flyStep(r, dt); return; }
    if (r.hide > 0) r.hide -= dt;
    if (r.air) {
      r.vy += HOP_GRAVITY * dt;
      const nx = r.x + r.vx * dt;
      // a face in the way turns it back; a step up it climbs
      if (solid(Math.round(nx), Math.round(r.y) - 5) || nx < 4 || nx > this.W - 4) { r.vx = -r.vx * 0.4; r.face = r.vx < 0 ? -1 : r.vx > 0 ? 1 : r.face; }
      else {
        r.x = nx;
        for (let k = 0; k < 4 && solid(Math.round(r.x), Math.round(r.y)); k++) r.y--;
      }
      const ny = r.y + r.vy * dt;
      if (r.vy < 0) {
        if (solid(Math.round(r.x), Math.round(ny) - 12)) r.vy = 0; else r.y = ny;
      } else {
        // down until it meets the ground (every pixel on the way: it never falls through a thin ledge)
        let y = r.y, landed = false;
        while (y < ny) {
          const step = Math.min(1, ny - y);
          // (its feet stop on the air right over the ground)
          if (solid(Math.round(r.x), Math.round(y + step) + 1)) { y = Math.round(y + step); landed = true; break; }
          y += step;
        }
        r.y = Math.min(y, this.H - 2);
        if (landed || r.y >= this.H - 2) {
          r.air = false;
          r.y = Math.round(r.y);
          const hard = r.vy;
          r.vx = 0; r.vy = 0;
          const G = GAITS[r.kind] || GAITS.rabbit;
          r.rest = r.alarm ? this.rng.range(0.03, r.kind === 'toad' ? 0.25 : 0.14) : this.rng.range(G.rest[0], G.rest[1]);
          if (!r.alarm) { const u = this.rng.next(); r.pose = r.kind === 'rabbit' ? (u < 0.35 ? 'eat' : u < 0.45 ? 'rear' : null) : u < 0.4 ? this.rng.weighted(G.poses.map((p) => p[0]), G.poses.map((p) => p[1])) : null; }
          // where a bleeding one lands it leaves blood on the ground
          if (r.hits) { this.stain(r.x - r.face * this.rng.int(0, 3), r.y + 1, BLOOD[this.rng.int(0, 2)], r.hits * 2 + 2); if (hard > 60) this.bleed(r, r.hits * 2, 0.5); }
        }
      }
      return;
    }
    // standing: it falls if the ground went from under it
    if (!solid(Math.round(r.x), Math.round(r.y) + 1)) { r.air = true; r.vx = 0; r.vy = 0; return; }
    if (!r.running) { r.walkT = 0; return; }
    if (r.walkT > 0) { this.walkStep(r, dt); return; }
    r.rest -= dt;
    if (r.rest <= 0) this.hop(r);
  }

  /** The blood in flight: it falls, and stains what it meets (clouding water). @param {number} dt */
  flow(dt) {
    const keep = [];
    for (const d of this.drops) {
      d.t += dt;
      d.vy += BLOOD_GRAVITY * dt;
      const steps = Math.max(1, Math.ceil(Math.hypot(d.vx, d.vy) * dt));
      let hit = false;
      for (let k = 0; k < steps && !hit; k++) {
        const nx = d.x + (d.vx * dt) / steps, ny = d.y + (d.vy * dt) / steps, X = Math.round(nx), Y = Math.round(ny);
        if (X < 0 || X >= this.W || Y >= this.H) { hit = true; d.t = 9; break; }
        if (Y >= 0 && this.liquid(X, Y)) { this.clouds.push({ x: X, y: Y, t: 0, r: 2 + d.s }); hit = true; break; }
        if (Y >= 0 && this.solid(X, Y)) {
          // it splashes where it lands: the faster, the wider
          this.stain(X, Y, d.c, Math.hypot(d.vx, d.vy) > 90 ? 2 + d.s : d.s - 1);
          hit = true; break;
        }
        d.x = nx; d.y = ny;
      }
      if (!hit && d.t < 4) keep.push(d);
    }
    this.drops = keep;
    for (const c of this.clouds) c.t += dt;
    this.clouds = this.clouds.filter((c) => c.t < 4);
  }

  /** The stains made since last asked (the view paints them once). */
  takeStains() {
    const s = this.stains;
    this.stains = [];
    return s;
  }
}

/**
 * Where a rabbit may start in a scene: open ground (a surface with air over
 * it) out of water and away from the very edges, as [x, feet row].
 * @param {{open:Uint8Array, solid:Uint8Array, liquid:Uint8Array, rock:Uint8Array}} sc @param {number} W @param {number} H
 * @returns {[number, number][]}
 */
export function warrenSpots(sc, W, H) {
  /** @type {[number, number][]} */
  const out = [];
  for (let y = 2; y < H - 2; y++) for (let x = 12; x < W - 12; x += 2) {
    const k = y * W + x;
    // the surface pixel itself is solid; its feet stand on the air pixel above it, with room over them
    if (!sc.open[k] || !sc.solid[k] || sc.solid[k - W] || sc.liquid[k - W]) continue;
    let clear = true;
    for (let j = 2; j <= 16 && clear; j++) if (sc.solid[k - j * W] || sc.rock[k - j * W]) clear = false;
    if (clear) out.push([x, y - 1]);
  }
  return out;
}
