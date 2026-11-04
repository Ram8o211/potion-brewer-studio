// Material definition contract. Every ingredient (purchased or created by a
// reaction) is a plain data object following this shape, so the simulation,
// UI and save system all speak the same language.

/**
 * @typedef {'liquid'|'powder'|'solid'|'gas'} MaterialForm
 *
 * @typedef {Object} MaterialDef
 * @property {string} id               stable identifier (unique per world)
 * @property {string} name             display name
 * @property {string} archetype        generator archetype key
 * @property {MaterialForm} form       form in which it is supplied at room temperature
 * @property {number[]} color          sRGB 0..1
 * @property {number} tint             coloring strength when mixed (0..1)
 * @property {number} opacity          render opacity of the pure liquid (0..1)
 * @property {number} density          condensed density g/ml (mass per particle volume)
 * @property {number} gasDensity       vapour density relative to air (=1)
 * @property {number} viscosity        dynamic viscosity of the liquid state at 20°C (cP)
 * @property {number} viscTemp         Andrade temperature coefficient (1/°C): μ(T)=μ20·e^(−k(T−20))
 * @property {number[]} compat         2-D miscibility vector; close vectors blend
 * @property {number} conductivity     relative thermal conductivity (water = 1)
 * @property {number} heatCapacity     volumetric heat capacity (J/ml·K, water ≈ 4.2)
 * @property {number} melt             melting point °C
 * @property {number} boil             boiling point °C (Infinity = never boils)
 * @property {number} latentFusion     game-scaled latent heat of fusion (J/ml)
 * @property {number} latentVapor      game-scaled latent heat of vaporisation (J/ml)
 * @property {number} expansion        volumetric thermal expansion (1/°C)
 * @property {number} flammability     0..1 fraction that can burn
 * @property {number} ignition         ignition temperature °C
 * @property {number} combustionHeat   heat released per burnt ml (J/ml)
 * @property {string} [ash]            id of powder residue when burnt
 * @property {string} [smoke]          id of gas released when burnt
 * @property {number} reactivity       0..1, general reactiveness (measured as "volatility" contribution)
 * @property {number} solubility       powders: max dissolved volume fraction at 20°C (0 = insoluble)
 * @property {number} solubilityTemp   powders: solubility gain per °C
 * @property {number} binder           powders: 0..1 tendency to form dough/paste with compatible liquid
 * @property {number} friction         granular friction coefficient (tan of repose angle)
 * @property {number} hardness         solids: resistance to crushing 0..1
 * @property {number[]} aspects        magical potency [vitality, ardor, arcana, fortitude] 0..100
 * @property {number} glow             emissive glow 0..1
 * @property {number} price            coins per 100 ml
 * @property {number} tier             progression tier at which it becomes purchasable
 * @property {boolean} product         true if only obtainable through reactions
 * @property {string} description      flavour + behaviour text
 * @property {string} [icon]           jar/bottle icon style
 * @property {number[]} [look]          appearance of the pure material (derived)
 * @property {number} [storeTemp]       temperature it is supplied at (°C)
 * @property {Record<string, number>} [effects] magical/chemical effect potency of the pure material (alchemy/effects.js)
 * @property {number} [econd]          electrical conductance 0..1
 * @property {number} [charge]         intrinsic electric charge per unit volume
 * @property {{key:string, shape:string, region:string, rank:number, rare:boolean, gatherOnly:boolean}} [wild] gathered raw ingredient
 * @property {boolean} [crushable]
 * @property {{thr:number, gain:number, awake?:boolean}} [arcane] arcane activation threshold (−1000…1000, see alchemy/arcane.js) and gain
 * @property {boolean} [awakened]      the awakened form of a magical material
 * @property {boolean} [arcaneVariant] only explicitly Arcane matter can awaken
 * @property {string} [speciesId] permanent ingredient species, independent of variant
 * @property {string} [rarity] intrinsic magical quality
 * @property {string} [dominant] principal magical effect
 * @property {string} [cultivation] soil, fungal or mineral growing structure
 * @property {boolean} [legacy] archived pre-overhaul material definition
 * @property {string} [base]           base material id of an awakened form
 * @property {number} [fxv]            version of the effect profile it carries
 * @property {string} [shape]          solid template name (shapes.js) for materials without a wild shape
 * @property {{rabbitId:string, rabbitName:string, part:string, day:number|null, cause:string|null, short:string}} [remains] recovered from a colony rabbit (remains.js)
 */

export const ASPECTS = ['vitality', 'ardor', 'arcana', 'fortitude'];
export const ASPECT_LABELS = ['Vitality', 'Ardor', 'Arcana', 'Fortitude'];

/** @type {Omit<MaterialDef,'id'|'name'|'archetype'|'form'|'color'|'description'>} */
export const MATERIAL_DEFAULTS = {
  tint: 0.5,
  opacity: 0.8,
  density: 1.0,
  gasDensity: 0.7,
  viscosity: 1,
  viscTemp: 0.02,
  compat: [0.85, 0.1],
  conductivity: 1,
  heatCapacity: 4.0,
  melt: 0,
  boil: 100,
  latentFusion: 60,
  latentVapor: 380,
  expansion: 0.0006,
  flammability: 0,
  ignition: 9999,
  combustionHeat: 0,
  reactivity: 0.1,
  solubility: 0,
  solubilityTemp: 0,
  binder: 0,
  friction: 0.62,
  hardness: 0.5,
  aspects: [0, 0, 0, 0],
  glow: 0,
  price: 4,
  tier: 0,
  product: false,
};

/**
 * Fill in defaults and normalise a partial definition.
 * @param {Partial<MaterialDef> & {id:string,name:string,form:MaterialForm,color:number[]}} def
 * @returns {MaterialDef}
 */
export function completeMaterial(def) {
  const m = /** @type {MaterialDef} */ ({ archetype: 'custom', description: '', ...MATERIAL_DEFAULTS, ...def });
  m.aspects = (m.aspects || [0, 0, 0, 0]).slice(0, 4);
  while (m.aspects.length < 4) m.aspects.push(0);
  m.compat = m.compat.slice(0, 2);
  if (m.boil === null || m.boil === undefined) m.boil = Infinity;
  m.look = appearance(m);
  return m;
}

/** sRGB → linear light. @param {number} c */
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** linear → sRGB. @param {number} c */
const srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/**
 * How the pure material actually looks: its pigment colour at its own
 * colouring strength (weakly tinted liquids like water look nearly clear).
 * @param {{color:number[], tint:number}} m
 */
export function appearance(m) {
  return m.color.map((c) => Math.round(srgb(Math.pow(Math.max(0.003, lin(c)), m.tint)) * 1000) / 1000);
}

/** Volatility 0..1 derived from boiling point (lower boil ⇒ more volatile). @param {MaterialDef} m */
export function volatilityOf(m) {
  if (!isFinite(m.boil)) return 0;
  const v = (180 - m.boil) / 220;
  return Math.max(0, Math.min(1, v)) * 0.85 + m.reactivity * 0.15;
}

/** Serialise for saves (Infinity is not JSON-safe). @param {MaterialDef} m */
export function serializeMaterial(m) {
  return { ...m, boil: isFinite(m.boil) ? m.boil : 'inf' };
}
/** @param {any} o @returns {MaterialDef} */
export function deserializeMaterial(o) {
  return completeMaterial({ ...o, boil: o.boil === 'inf' ? Infinity : o.boil });
}
