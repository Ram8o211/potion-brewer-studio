// Procedural, seed-reproducible reagent ecosystem.
//
// Every world rolls its own ingredients from archetypes (so each has a clear
// behavioural identity — a thin solvent, an immiscible oil, a heavy syrup, a
// volatile spirit, vivid essences, a dough-forming binder, a soluble salt,
// and later crystals, metals, waxes, gases…) with jittered properties,
// colours and names. Reactions are generated from templates that bind to
// this world's specific reagents, and their products' properties are
// derived from the reactants (densities are stoichiometric blends, so mass
// is conserved through every reaction).

import { attachVisuals } from '../visual/identity.js';
import { Rng } from '../core/rng.js';
import { hslToRgb } from '../core/color.js';
import { completeMaterial } from './schema.js';
import { makeName, makeProductName } from './names.js';
import { applyProfile } from './profiles.js';
import { generateWild, generateLaws, WILD_FX_VERSION, WILD_BY_KEY } from './wild.js';
import { withAwakened } from '../alchemy/arcane.js';

/** @typedef {import('./schema.js').MaterialDef} MaterialDef */
/** @typedef {import('../reactions/reactions.js').ReactionRule} ReactionRule */

/**
 * @typedef {Object} World
 * @property {string} seed
 * @property {number} [catalogVersion] fixed-species catalog revision, absent in legacy saves
 * @property {MaterialDef[]} materials       every material (ingredients, products, universals)
 * @property {string[]} ingredients          purchasable ingredient ids (display order)
 * @property {string[]} starting             ids available from the start
 * @property {ReactionRule[]} reactions
 * @property {Record<string,string>} roles   archetype role → material id
 * @property {import('../alchemy/effects.js').Resonance[]} laws  hidden resonance laws of this world
 * @property {string[]} wild                 gatherable raw ingredient ids
 */

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * @param {string|number} seed
 * @returns {World}
 */
export function generateWorld(seed) {
  const seedStr = String(seed);
  const rng = new Rng('world:' + seedStr);
  const usedNames = new Set();
  /** @type {MaterialDef[]} */
  const materials = [];
  /** @type {Record<string,string>} */
  const roles = {};
  let idc = 0;
  const nextId = (tag) => `${tag}-${(idc++).toString(36)}`;

  const add = (role, d) => {
    const id = nextId(role);
    const m = completeMaterial({ ...d, id });
    m.name = d.name || makeName(rng, m.color, d.archetype, usedNames);
    materials.push(m);
    roles[role] = id;
    return m;
  };
  const hue = (h, s, l) => hslToRgb(h, s, l);

  // ---------------------------------------------------------------- universals
  const soot = add('soot', {
    name: 'Soot', form: 'powder', archetype: 'ash', color: [0.17, 0.16, 0.16], tint: 0.9, opacity: 1,
    density: 1.1, compat: [0.5, 0.3], friction: 0.72, melt: 3000, boil: Infinity, heatCapacity: 1, conductivity: 0.2,
    price: 0, tier: 99, product: true, description: 'Charred residue left by fire.',
  });
  const smoke = add('smoke', {
    name: 'Smoke', form: 'gas', archetype: 'smoke', color: [0.46, 0.44, 0.43], tint: 0.6, opacity: 0.6,
    density: 0.8, gasDensity: 1.05, compat: [0.5, 0.3], melt: -200, boil: -150, heatCapacity: 1.2, conductivity: 0.2,
    price: 0, tier: 99, product: true, description: 'Choking fumes from burning reagents.',
  });

  // ---------------------------------------------------------------- starting liquids
  const waterHue = rng.range(185, 215);
  const water = add('water', {
    form: 'liquid', archetype: 'water', color: hue(waterHue, 0.55, 0.82), tint: 0.12, opacity: 0.5,
    density: r2(rng.range(0.98, 1.02)), viscosity: r2(rng.range(0.9, 1.2)), compat: [r2(rng.range(0.83, 0.87)), r2(rng.range(0.08, 0.12))],
    boil: Math.round(rng.range(97, 103)), melt: Math.round(rng.range(-1, 1)), heatCapacity: 4.2, conductivity: 1,
    gasDensity: 0.62, latentVapor: 380, latentFusion: 60, price: 1, tier: 0,
    description: 'Clear, thin and cheap — the base of most brews. The village well refills it for free.',
  });
  const oilHue = rng.pick([42, 50, 75, 95]);
  const oil = add('oil', {
    form: 'liquid', archetype: 'oil', color: hue(oilHue, 0.75, 0.55), tint: 0.55, opacity: 0.72,
    density: r2(rng.range(0.8, 0.88)), viscosity: Math.round(rng.range(25, 70)), viscTemp: 0.025, compat: [r2(rng.range(0.13, 0.19)), r2(rng.range(0.08, 0.13))],
    boil: Math.round(rng.range(260, 310)), melt: Math.round(rng.range(-25, -8)), heatCapacity: 1.9, conductivity: 0.3,
    flammability: 0.85, ignition: Math.round(rng.range(215, 250)), combustionHeat: 900, smoke: smoke.id, ash: soot.id,
    gasDensity: 2.5, price: 3, tier: 0, aspects: [0, 6, 0, 4], reactivity: 0.15,
    description: 'Slick and golden; it will not mix with watery liquids and floats on top of them. Burns readily.',
  });
  const syrupHue = rng.range(25, 45);
  const syrup = add('syrup', {
    form: 'liquid', archetype: 'syrup', color: hue(syrupHue, 0.8, rng.range(0.38, 0.48)), tint: 0.7, opacity: 0.86,
    density: r2(rng.range(1.36, 1.48)), viscosity: Math.round(rng.range(3500, 9000)), viscTemp: 0.045, compat: [r2(rng.range(0.76, 0.8)), r2(rng.range(0.16, 0.2))],
    boil: Math.round(rng.range(180, 200)), melt: -12, heatCapacity: 3.2, conductivity: 0.55,
    aspects: [10, 4, 0, 6], price: 5, tier: 0,
    description: 'Thick, heavy and sweet. Sinks through watery liquids and flows reluctantly unless warmed.',
  });
  const spiritHue = rng.pick([120, 150, 280, 300]);
  const spirit = add('spirit', {
    form: 'liquid', archetype: 'spirit', color: hue(spiritHue, 0.45, 0.85), tint: 0.16, opacity: 0.35,
    density: r2(rng.range(0.78, 0.82)), viscosity: r2(rng.range(1.1, 1.4)), compat: [r2(rng.range(0.6, 0.64)), r2(rng.range(0.13, 0.17))],
    boil: Math.round(rng.range(68, 80)), melt: -110, heatCapacity: 2.4, conductivity: 0.75, latentVapor: 260,
    flammability: 0.75, ignition: Math.round(rng.range(340, 380)), combustionHeat: 700, smoke: smoke.id, gasDensity: 1.5,
    aspects: [0, 4, 8, 0], reactivity: 0.3, price: 4, tier: 0,
    description: 'A light, volatile spirit. Blends with water, evaporates well below water’s boiling point and is flammable.',
  });
  const hA = rng.range(0, 360);
  const hB = (hA + rng.range(120, 160)) % 360;
  const hC = (hA + rng.range(220, 260)) % 360;
  const essence = (role, h, asp, tier) =>
    add(role, {
      form: 'liquid', archetype: 'essence', color: hue(h, rng.range(0.75, 0.9), rng.range(0.42, 0.52)), tint: 1, opacity: 0.8,
      density: r2(rng.range(1.02, 1.08)), viscosity: r2(rng.range(1.2, 2.2)), compat: [r2(rng.range(0.81, 0.86)), r2(rng.range(0.1, 0.14))],
      boil: Math.round(rng.range(100, 106)), melt: Math.round(rng.range(-6, -3)), heatCapacity: 4.0, conductivity: 0.95,
      aspects: asp, reactivity: 0.25, price: tier ? 6 : 4, tier,
      description: 'A vividly coloured essence. Mixes freely with watery liquids and stains the whole brew.',
    });
  const essA = essence('essenceA', hA, [10, 0, 0, 0], 0);
  const essB = essence('essenceB', hB, [0, 10, 0, 0], 0);

  // ---------------------------------------------------------------- starting powders
  const binderHue = rng.range(30, 50);
  const binder = add('binder', {
    form: 'powder', archetype: 'binder', color: hue(binderHue, 0.3, rng.range(0.78, 0.88)), tint: 0.5, opacity: 1,
    density: r2(rng.range(1.22, 1.36)), compat: [r2(rng.range(0.79, 0.83)), r2(rng.range(0.13, 0.17))],
    friction: r2(rng.range(0.66, 0.76)), binder: r2(rng.range(0.9, 1)), melt: 1500, boil: Infinity, heatCapacity: 1.6, conductivity: 0.3,
    flammability: 0.35, ignition: Math.round(rng.range(400, 440)), combustionHeat: 400, ash: soot.id,
    aspects: [2, 0, 0, 10], price: 3, tier: 0,
    description: 'A fine dry meal that piles like sand. Knead it with a watery liquid and it becomes a dough; add more liquid and it thins to a paste.',
  });
  const saltHue = rng.range(0, 360);
  const salt = add('salt', {
    form: 'powder', archetype: 'salt', color: hue(saltHue, 0.35, 0.9), tint: 0.3, opacity: 1,
    density: r2(rng.range(1.9, 2.3)), compat: [r2(rng.range(0.84, 0.88)), r2(rng.range(0.08, 0.12))],
    friction: r2(rng.range(0.57, 0.64)), solubility: r2(rng.range(0.22, 0.3)), solubilityTemp: 0.0025, melt: 800, boil: Infinity,
    heatCapacity: 1.9, conductivity: 1.2, aspects: [6, 0, 0, 2], reactivity: 0.3, price: 3, tier: 0,
    description: 'Glittering crystals that dissolve into watery liquids — faster when hot or stirred — making them denser.',
  });

  // ---------------------------------------------------------------- tier 1
  const essC = essence('essenceC', hC, [0, 0, 10, 0], 1);
  const ember = add('ember', {
    form: 'powder', archetype: 'ember', color: hue(rng.range(10, 25), 0.85, 0.5), tint: 0.8, opacity: 1,
    density: 1.5, compat: [0.7, 0.3], friction: 0.62, solubility: 0.04, melt: 900, boil: Infinity, heatCapacity: 1.4, conductivity: 0.8,
    flammability: 0.9, ignition: Math.round(rng.range(180, 215)), combustionHeat: 1200, ash: soot.id, glow: 0.35,
    aspects: [0, 30, 0, 0], reactivity: 0.7, price: 8, tier: 1,
    description: 'Warm, faintly glowing grit. Reacts eagerly and catches fire if overheated in open air.',
  });
  const frost = add('frost', {
    form: 'solid', archetype: 'frost', color: hue(rng.range(180, 200), 0.6, 0.86), tint: 0.25, opacity: 0.7,
    density: 0.98, compat: [0.85, 0.12], hardness: 0.35, melt: Math.round(rng.range(3, 8)), boil: 102, heatCapacity: 4.0,
    conductivity: 1.4, latentFusion: 110, storeTemp: -30, aspects: [0, 0, 2, 12], price: 6, tier: 1,
    description: 'Chunks of everlasting rime kept at -30°C. They melt into icy water, chilling the brew — or crush them first.',
  });
  const metal = add('metal', {
    form: 'liquid', archetype: 'metal', color: [0.76, 0.78, 0.82], tint: 0.95, opacity: 1,
    density: r2(rng.range(2.9, 3.4)), viscosity: 1.5, compat: [0.5, 0.95], boil: 360, melt: -38, heatCapacity: 1.5, conductivity: 4,
    aspects: [0, 0, 4, 14], price: 9, tier: 1,
    description: 'A heavy, mirror-bright liquid metal. Mixes with nothing and sinks beneath every other liquid.',
  });

  // ---------------------------------------------------------------- tier 2
  const crystal = add('crystal', {
    form: 'solid', archetype: 'crystal', color: hue(rng.range(230, 275), 0.5, 0.78), tint: 0.7, opacity: 1,
    density: 2.4, compat: [0.62, 0.3], hardness: 0.6, melt: 1200, boil: Infinity, solubility: 0.1, solubilityTemp: 0.002,
    heatCapacity: 2, conductivity: 1.5, glow: 0.45, aspects: [0, 0, 30, 6], reactivity: 0.4, price: 14, tier: 2,
    description: 'Hard luminous shards. Crush them with the pestle; the grains slowly dissolve into spirits.',
  });
  const wax = add('wax', {
    form: 'powder', archetype: 'wax', color: hue(rng.range(45, 60), 0.6, 0.82), tint: 0.6, opacity: 0.95,
    density: 0.92, compat: [0.15, 0.12], friction: 0.55, viscosity: 30, melt: Math.round(rng.range(56, 66)), boil: 360,
    heatCapacity: 2.2, conductivity: 0.3, latentFusion: 40, flammability: 0.7, ignition: 250, combustionHeat: 800, smoke: smoke.id, ash: soot.id,
    aspects: [0, 2, 0, 8], price: 6, tier: 2,
    description: 'Waxy flakes that melt into an oily liquid when warmed and set into a solid cake when cooled.',
  });
  const fizz = add('fizz', {
    form: 'powder', archetype: 'fizz', color: hue(rng.range(0, 360), 0.25, 0.92), tint: 0.2, opacity: 1,
    density: 1.6, compat: [0.86, 0.1], friction: 0.6, solubility: 0.3, melt: 700, boil: Infinity, heatCapacity: 1.8,
    aspects: [0, 0, 6, 0], reactivity: 0.8, price: 7, tier: 2,
    description: 'An effervescent powder. Dissolved together with a certain essence it fizzes, releasing a heavy vapour.',
  });
  const spores = add('spores', {
    form: 'powder', archetype: 'spores', color: hue(rng.range(160, 190), 0.7, 0.55), tint: 0.7, opacity: 1,
    density: 0.9, compat: [0.75, 0.24], friction: 0.7, binder: 0.4, melt: 1500, boil: Infinity, heatCapacity: 1.5,
    glow: 0.6, aspects: [4, 0, 22, 0], price: 10, tier: 2,
    description: 'Softly glowing spores; light enough to float on water until kneaded in.',
  });

  // ---------------------------------------------------------------- tier 3
  const resin = add('resin', {
    form: 'solid', archetype: 'resin', color: hue(rng.range(0, 15), 0.85, 0.38), tint: 0.9, opacity: 0.95,
    density: 1.12, compat: [0.2, 0.2], hardness: 0.45, viscosity: 18000, viscTemp: 0.05, melt: Math.round(rng.range(72, 85)), boil: 380,
    heatCapacity: 2, conductivity: 0.3, flammability: 0.6, ignition: 300, combustionHeat: 900, smoke: smoke.id, ash: soot.id,
    aspects: [0, 22, 0, 16], price: 16, tier: 3,
    description: 'Blood-red resin lumps. They soften into a very thick, oily liquid only when properly heated.',
  });
  const starlight = add('starlight', {
    form: 'liquid', archetype: 'starlight', color: hue(rng.range(200, 240), 0.6, 0.9), tint: 0.6, opacity: 0.55,
    density: 0.95, viscosity: 1, compat: [0.8, 0.18], boil: 96, melt: -20, heatCapacity: 3.8, glow: 0.85,
    aspects: [6, 0, 45, 0], reactivity: 0.4, price: 25, tier: 3,
    description: 'Bottled starlight that glimmers in the dark. Prized by mages.',
  });
  const moss = add('moss', {
    form: 'powder', archetype: 'moss', color: hue(rng.range(85, 110), 0.5, 0.35), tint: 0.75, opacity: 1,
    density: 1.15, compat: [0.78, 0.2], friction: 0.78, binder: 0.7, melt: 1500, boil: Infinity, heatCapacity: 1.7,
    aspects: [6, 0, 0, 34], price: 15, tier: 3,
    description: 'Dried troll moss. Binds into a tough green paste that toughens the drinker.',
  });
  const vapor = add('vapor', {
    form: 'gas', archetype: 'vapor', color: hue(rng.range(90, 130), 0.5, 0.6), tint: 0.6, opacity: 0.5,
    density: 1.05, gasDensity: 2.1, compat: [0.8, 0.2], melt: -40, boil: 9, heatCapacity: 3, latentVapor: 200,
    aspects: [0, 0, 14, 0], reactivity: 0.5, price: 12, tier: 3,
    description: 'A heavy marsh gas that pools low. It condenses into a liquid if the brew is chilled near freezing.',
  });

  // ---------------------------------------------------------------- tier 4
  const phoenix = add('phoenix', {
    form: 'powder', archetype: 'phoenix', color: hue(rng.range(20, 35), 0.95, 0.55), tint: 0.85, opacity: 1,
    density: 1.4, compat: [0.84, 0.15], friction: 0.6, solubility: 0.2, melt: 1200, boil: Infinity, heatCapacity: 1.6, glow: 0.7,
    aspects: [20, 55, 0, 0], reactivity: 0.9, price: 40, tier: 4,
    description: 'Ash that is still warm a century later. It reacts violently with water.',
  });
  const voidInk = add('void', {
    form: 'liquid', archetype: 'void', color: hue(rng.range(260, 290), 0.6, 0.12), tint: 1, opacity: 1,
    density: 1.26, viscosity: 60, compat: [0.35, 0.55], boil: 240, melt: -30, heatCapacity: 2.4,
    aspects: [0, 0, 55, 20], reactivity: 0.6, price: 45, tier: 4,
    description: 'Ink darker than night. It refuses to mix with water or oil and settles in its own layer.',
  });

  // ---------------------------------------------------------------- reactions
  /** @type {ReactionRule[]} */
  const reactions = [];
  const blendColor = (a, b, shiftHue) => {
    const c = hslToRgb(shiftHue, 0.85, 0.48);
    return [0, 1, 2].map((k) => r2((a.color[k] + b.color[k]) * 0.15 + c[k] * 0.7));
  };
  /**
   * @param {string} role @param {string} theme
   * @param {MaterialDef} a @param {MaterialDef|null} b @param {number} ra @param {number} rb
   * @param {Partial<MaterialDef>} props
   */
  const product = (role, theme, a, b, ra, rb, props) => {
    const id = nextId(role);
    const tot = ra + (b ? rb : 0);
    const dens = (a.density * ra + (b ? b.density * rb : 0)) / tot;
    const comp = b ? [r2((a.compat[0] * ra + b.compat[0] * rb) / tot), r2((a.compat[1] * ra + b.compat[1] * rb) / tot)] : a.compat.slice();
    const color = props.color || blendColor(a, b || a, rng.range(0, 360));
    const m = completeMaterial({
      form: 'liquid', archetype: 'product', tint: 1, opacity: 0.85, heatCapacity: 3.6, boil: 108, melt: -8,
      viscosity: 2, compat: comp, price: 0, tier: 99, product: true, ...props, id, name: '', color, density: r2(props.density ?? dens),
    });
    m.name = props.name || makeProductName(rng, theme, color, usedNames);
    materials.push(m);
    roles[role] = id;
    return m;
  };
  const t = (lo, hi) => Math.round(rng.range(lo, hi) / 5) * 5;

  const elixir = product('p_elixir', 'elixir', essA, salt, 2, 1, {
    aspects: [70, 0, 6, 4], viscosity: 3, glow: 0.15, description: 'A restorative elixir created by dissolving salt into a vital essence and heating it.',
  });
  reactions.push({
    id: 'r_elixir', name: elixir.name, kind: 'mix', a: essA.id, b: salt.id, ra: 2, rb: 1, products: [{ id: elixir.id, frac: 1 }],
    minT: t(40, 55), maxT: 140, rate: 0.35, heat: 25, stir: 0.6,
    hint: `Dissolve ${salt.name} in ${essA.name} and keep it hot.`,
  });

  const ardent = product('p_ardent', 'ardent', essB, ember, 2, 1, {
    aspects: [0, 72, 0, 4], viscosity: 2.5, glow: 0.3, description: 'A fiery cordial that warms from the inside out.',
  });
  reactions.push({
    id: 'r_ardent', name: ardent.name, kind: 'contact', a: essB.id, b: ember.id, ra: 2, rb: 1, products: [{ id: ardent.id, frac: 1 }],
    minT: t(25, 40), maxT: 160, rate: 0.5, heat: 90, stir: 0.8,
    hint: `${ember.name} reacts where it touches warm ${essB.name}. Stirring spreads the reaction.`,
  });

  const arcane = product('p_arcane', 'arcane', spirit, crystal, 3, 1, {
    aspects: [0, 0, 75, 4], viscosity: 1.5, glow: 0.75, boil: 85, tint: 0.9, opacity: 0.7,
    description: 'A glimmering tincture of dissolved moonlight, sought by scholars and wizards.',
  });
  reactions.push({
    id: 'r_arcane', name: arcane.name, kind: 'mix', a: spirit.id, b: crystal.id, ra: 3, rb: 1, products: [{ id: arcane.id, frac: 1 }],
    minT: t(35, 50), maxT: 70, rate: 0.4, heat: 15, stir: 0.6,
    hint: `Crush ${crystal.name} and dissolve it in warm ${spirit.name} — but don't boil the spirit away.`,
  });

  const salve = product('p_salve', 'salve', binder, syrup, 1, 1, {
    form: 'powder', binder: 1, friction: 0.7, solubility: 0, melt: 1500, boil: Infinity, heatCapacity: 2,
    aspects: [10, 0, 0, 70], tint: 0.85, description: 'A dense, protective salve baked from dough and syrup.',
  });
  reactions.push({
    id: 'r_salve', name: salve.name, kind: 'mix', a: binder.id, b: syrup.id, ra: 1, rb: 1, products: [{ id: salve.id, frac: 1 }],
    minT: t(55, 70), maxT: 130, rate: 0.3, heat: -20, stir: 1.2,
    hint: `Knead ${binder.name} with ${syrup.name} into a dough, then bake it gently.`,
  });

  const fizzGas = product('p_fizzgas', 'arcana', fizz, essB, 1, 1, {
    name: 'Fizz Vapour', form: 'gas', gasDensity: 1.7, boil: -60, melt: -120, aspects: [0, 0, 8, 0], reactivity: 0.9, tint: 0.3,
    color: [0.85, 0.88, 0.8], density: 0.9, description: 'The heavy bubbles released by a fizzing reaction.',
  });
  const spent = product('p_spent', 'fortitude', fizz, essB, 1, 1, {
    name: 'Spent Salts', form: 'powder', solubility: 0.35, melt: 900, boil: Infinity, aspects: [0, 0, 4, 4], reactivity: 0.7,
    color: [0.92, 0.9, 0.85], tint: 0.3, density: r2((fizz.density + essB.density) - 0.9), description: 'What remains after a fizz.',
  });
  reactions.push({
    id: 'r_fizz', name: 'Effervescence', kind: 'mix', a: fizz.id, b: essB.id, ra: 1, rb: 1,
    products: [{ id: fizzGas.id, frac: 0.5 }, { id: spent.id, frac: 0.5 }], minT: -10, maxT: 200, rate: 0.6, heat: -25, stir: 0.6,
    hint: `${fizz.name} fizzes when dissolved into ${essB.name}. The bubbles make a brew lively and volatile.`,
  });

  const caramel = product('p_caramel', 'caramel', syrup, null, 1, 0, {
    aspects: [14, 16, 0, 8], viscosity: Math.round(syrup.viscosity * 2.5), viscTemp: 0.05, boil: 260, melt: -5,
    color: hue(rng.range(15, 30), 0.75, 0.24), tint: 0.95, description: 'Syrup darkened by fierce heat into a deep, warming caramel.',
  });
  reactions.push({
    id: 'r_caramel', name: caramel.name, kind: 'decompose', a: syrup.id, b: null, ra: 1, rb: 0, products: [{ id: caramel.id, frac: 1 }],
    minT: t(140, 160), maxT: 400, rate: 0.12, heat: 10, stir: 0.2,
    hint: `Heat ${syrup.name} far beyond boiling water and it darkens.`,
  });

  const panacea = product('p_panacea', 'panacea', elixir, arcane, 1, 1, {
    aspects: [85, 0, 62, 10], viscosity: 2, glow: 0.8, boil: 110, description: 'The legendary cure-all: vitality and arcana in perfect union.',
  });
  reactions.push({
    id: 'r_panacea', name: panacea.name, kind: 'mix', a: elixir.id, b: arcane.id, ra: 1, rb: 1, products: [{ id: panacea.id, frac: 1 }],
    minT: t(30, 40), maxT: 70, rate: 0.25, heat: 20, stir: 1,
    hint: `Blend ${elixir.name} with ${arcane.name} while warm, not hot.`,
  });

  const amalgam = product('p_amalgam', 'amalgam', metal, crystal, 3, 1, {
    aspects: [0, 0, 30, 60], viscosity: 3, compat: metal.compat.slice(), tint: 0.95, opacity: 1, boil: 380, melt: -20,
    color: hue(rng.range(200, 260), 0.35, 0.65), description: 'Liquid metal infused with crystal — heavy, shining and protective.',
  });
  reactions.push({
    id: 'r_amalgam', name: amalgam.name, kind: 'contact', a: metal.id, b: crystal.id, ra: 3, rb: 1, products: [{ id: amalgam.id, frac: 1 }],
    minT: t(15, 25), maxT: 300, rate: 1.2, heat: 10, stir: 2,
    hint: `${metal.name} swallows crushed ${crystal.name} wherever they touch.`,
  });

  const phoenixBrew = product('p_phoenix', 'phoenix', phoenix, water, 1, 2, {
    aspects: [60, 70, 0, 6], viscosity: 2, glow: 0.6, boil: 115, description: 'A blazing brew of rebirth. Dangerous to make, wondrous to drink.',
  });
  reactions.push({
    id: 'r_phoenix', name: phoenixBrew.name, kind: 'mix', a: phoenix.id, b: water.id, ra: 1, rb: 2, products: [{ id: phoenixBrew.id, frac: 1 }],
    minT: 15, maxT: 300, rate: 0.5, heat: 160, stir: 0.6,
    hint: `${phoenix.name} reacts violently with ${water.name} — keep the heat under control.`,
  });

  const varnish = product('p_varnish', 'varnish', resin, oil, 1, 1, {
    aspects: [0, 22, 0, 56], viscosity: 900, viscTemp: 0.04, compat: [0.18, 0.15], boil: 330, melt: -10, flammability: 0.5, ignition: 280,
    combustionHeat: 800, smoke: smoke.id, color: hue(rng.range(10, 25), 0.75, 0.3), description: 'A thick protective varnish of melted resin and oil.',
  });
  reactions.push({
    id: 'r_varnish', name: varnish.name, kind: 'mix', a: resin.id, b: oil.id, ra: 1, rb: 1, products: [{ id: varnish.id, frac: 1 }],
    minT: t(85, 100), maxT: 220, rate: 0.3, heat: 15, stir: 1,
    hint: `Melt ${resin.name} into hot ${oil.name}.`,
  });

  const frostbloom = product('p_frostbloom', 'frostbloom', frost, essC, 1, 1, {
    aspects: [0, 0, 32, 44], viscosity: 2, melt: -15, color: hue(rng.range(170, 200), 0.8, 0.6), glow: 0.25,
    description: 'An icy bloom of crystal patterns suspended in liquid. Only forms in the cold.',
  });
  reactions.push({
    id: 'r_frostbloom', name: frostbloom.name, kind: 'mix', a: frost.id, b: essC.id, ra: 1, rb: 1, products: [{ id: frostbloom.id, frac: 1 }],
    minT: -30, maxT: t(5, 10), rate: 0.35, heat: -15, stir: 0.8,
    hint: `Melted ${frost.name} and ${essC.name} combine only when kept near freezing.`,
  });

  const lumen = product('p_lumen', 'lumen', spores, starlight, 1, 1, {
    aspects: [6, 0, 85, 0], viscosity: 1.5, glow: 1, color: hue(rng.range(160, 220), 0.9, 0.62), description: 'Liquid light. It glows bright enough to read by.',
  });
  reactions.push({
    id: 'r_lumen', name: lumen.name, kind: 'contact', a: spores.id, b: starlight.id, ra: 1, rb: 1, products: [{ id: lumen.id, frac: 1 }],
    minT: t(30, 40), maxT: 75, rate: 0.35, heat: 10, stir: 1,
    hint: `${spores.name} bloom when kneaded into warm ${starlight.name}.`,
  });

  // The shop sells no prepared reagents: every effect comes from what grows
  // or lies in the wilds (added by addAlchemy). Only the three plain
  // solvents, which carry no magic of their own, are stocked. The prepared
  // reagents above stay in the world as physics references and for old
  // brews, but are never on the shelf.
  void [syrup, essA, essB, binder, salt, essC, ember, frost, metal, crystal, wax, fizz, spores, resin, starlight, moss, vapor, phoenix, voidInk];
  const ingredients = [water, oil, spirit].map((m) => m.id);
  const starting = ingredients.slice();
  return addAlchemy({ seed: seedStr, materials, ingredients, starting, reactions, roles });
}

/**
 * Give every material its effects, arcane and electrical profile and add the
 * wild ingredients, their reactions and the hidden resonance laws. Separate
 * RNG streams: worlds keep the reagents their seed always produced, and an
 * old save's embedded world is upgraded to exactly what a new world of that
 * seed gets (effects, thresholds, extraction reactions); its names, colours
 * and physical reagents never change.
 * @param {any} world
 */
export function addAlchemy(world) {
  for (const m of world.materials) applyProfile(m, world.seed);
  const stale = !world.catalogVersion || !world.wild || world.materials.some((m) => m.id.startsWith('wild-') && m.fxv !== WILD_FX_VERSION);
  if (stale) {
    const w = generateWild(world.seed, world);
    for (const m of w.materials) {
      const old = world.materials.find((x) => x.id === m.id);
      if (!old) { world.materials.push(m); continue; }
      const mm = /** @type {any} */ (m);
      Object.assign(old, { effects: mm.effects, arcane: mm.arcane, arcaneVariant: mm.arcaneVariant, speciesId: mm.speciesId, rarity: mm.rarity, dominant: mm.dominant, cultivation: mm.cultivation, fxv: mm.fxv, solubility: m.solubility, binder: m.binder, description: m.description });
      if (mm.wild) old.wild = { ...mm.wild };
    }
    for (const r of w.reactions) {
      const k = world.reactions.findIndex((x) => x.id === r.id);
      if (k < 0) world.reactions.push(r);
      else world.reactions[k] = r;
    }
    world.wild = w.materials.filter((m) => !m.product).map((m) => m.id);
    world.catalogVersion = 1;
    for (const id of world.wild) if (!world.ingredients.includes(id)) world.ingredients.push(id);
    if (!world.laws) world.laws = w.laws;
  }
  if (!world.laws) world.laws = generateLaws(world.seed);
  // an ingredient grows in the region its archetype names now (Witch's Ear and
  // Mandrake moved from the Whisperwood into the Netherwood); its look stays
  for (const m of world.materials) {
    const w = /** @type {any} */ (m).wild, spec = w && WILD_BY_KEY[w.key];
    if (spec && w.region !== spec.region) /** @type {any} */ (m).wild = { ...w, region: spec.region };
  }
  // a save from before the procedural graphics: its ingredients get the identity their world would give them
  attachVisuals(world);
  // older worlds stocked prepared reagents (essences, salts, crystals…):
  // only the solvents, the wild ingredients and recovered remains stay
  const keep = new Set([...SOLVENT_ROLES.map((r) => world.roles[r]), ...world.wild]);
  world.ingredients = world.ingredients.filter((id) => keep.has(id) || world.materials.some((m) => m.id === id && (m.remains || (m.legacy && !m.product))));
  world.starting = SOLVENT_ROLES.map((r) => world.roles[r]).filter(Boolean);
  return world;
}

/** The plain solvents the shop still sells: they carry no magic. */
export const SOLVENT_ROLES = ['water', 'oil', 'spirit'];

/**
 * Prepared laboratory reagents: never sold in the shop, but on the shelf of
 * the Free Experiment, where they show off the physics (layers, doughs,
 * frozen blocks, burning oil, charge).
 */
export const LAB_ROLES = ['syrup', 'essenceA', 'essenceB', 'binder', 'salt', 'essenceC', 'ember', 'frost', 'metal', 'crystal', 'wax', 'fizz', 'spores', 'resin', 'starlight', 'moss', 'vapor', 'phoenix', 'void'];

/** Everything on the Free Experiment's shelf. @param {World} world */
export function sandboxIngredients(world) {
  const ids = world.ingredients.slice();
  for (const r of LAB_ROLES) if (world.roles[r] && !ids.includes(world.roles[r])) ids.push(world.roles[r]);
  return ids;
}

/**
 * Build an id → material lookup for a world (plus optional extra defs). The
 * awakened form of any magical material (`id~a`) resolves too.
 */
export function makeLookup(world, extra = []) {
  const map = new Map();
  // materials added during play (a rabbit's remains) are indexed when they appear
  let n = -1;
  const index = () => {
    map.clear();
    for (const m of world.materials) map.set(m.id, m);
    for (const m of extra) map.set(m.id, m);
    n = world.materials.length;
  };
  index();
  return withAwakened((id) => {
    if (n !== world.materials.length) index();
    return map.get(id);
  });
}
