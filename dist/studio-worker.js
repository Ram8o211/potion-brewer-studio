// The Alchemist's Shop 2.3.0 — bundled build
// src/core/color.js
const __m3 = (() => {
function srgbToLinear(c) {
return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
if (c <= 0) return 0;
if (c >= 1) return 1;
return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
function rgbToOklab(r, g, b) {
return rgbToOklabInto(r, g, b, [0, 0, 0]);
}
function rgbToOklabInto(r, g, b, out) {
const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
return out;
}
function oklabToRgb(L, a, b) {
const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
const s_ = L - 0.0894841775 * a - 1.291485548 * b;
const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
return [
linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
];
}
function deltaE(lab1, lab2) {
const dL = lab1[0] - lab2[0], da = lab1[1] - lab2[1], db = lab1[2] - lab2[2];
return Math.sqrt(dL * dL + da * da + db * db) * 100;
}
function hslToRgb(h, s, l) {
h = ((h % 360) + 360) % 360;
const c = (1 - Math.abs(2 * l - 1)) * s;
const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
const m = l - c / 2;
let r = 0, g = 0, b = 0;
if (h < 60) [r, g, b] = [c, x, 0];
else if (h < 120) [r, g, b] = [x, c, 0];
else if (h < 180) [r, g, b] = [0, c, x];
else if (h < 240) [r, g, b] = [0, x, c];
else if (h < 300) [r, g, b] = [x, 0, c];
else [r, g, b] = [c, 0, x];
return [r + m, g + m, b + m];
}
function rgbToHex(rgb) {
const h = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
return '#' + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
}
function hexToRgb(hex) {
const v = parseInt(hex.replace('#', ''), 16);
return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
function hueOf(rgb) {
const [, a, b] = rgbToOklab(rgb[0], rgb[1], rgb[2]);
return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
}
const HUE_NAMES = [
[20, 'crimson'], [45, 'scarlet'], [70, 'amber'], [95, 'golden'], [120, 'olive'],
[150, 'verdant'], [185, 'emerald'], [215, 'teal'], [245, 'azure'], [275, 'cobalt'],
[305, 'violet'], [335, 'magenta'], [360, 'rose'],
];
function describeColor(rgb) {
const [L, a, b] = rgbToOklab(rgb[0], rgb[1], rgb[2]);
const C = Math.sqrt(a * a + b * b);
let base;
if (C < 0.035) {
base = L > 0.85 ? 'clear white' : L > 0.6 ? 'pale grey' : L > 0.35 ? 'slate grey' : 'inky black';
return base;
}
const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
base = HUE_NAMES.find(([lim]) => hue < lim)[1];
const tone = L > 0.82 ? 'pale ' : L < 0.42 ? 'deep ' : C < 0.08 ? 'dusky ' : '';
return tone + base;
}
return { srgbToLinear, linearToSrgb, rgbToOklab, rgbToOklabInto, oklabToRgb, deltaE, hslToRgb, rgbToHex, hexToRgb, hueOf, describeColor };
})();
// src/visual/color.js
const __m2 = (() => {
const { rgbToOklab, oklabToRgb } = __m3;
function toLch(rgb) {
const [L, a, b] = rgbToOklab(rgb[0], rgb[1], rgb[2]);
return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}
function fromLch(L, C, h) {
const r = (h * Math.PI) / 180;
L = Math.max(0, Math.min(1, L));
for (let k = 0; k < 8; k++) {
const a = Math.cos(r) * C, b = Math.sin(r) * C;
const rgb = oklabToRgb(L, a, b);
const back = rgbToOklab(rgb[0], rgb[1], rgb[2]);
if (Math.abs(back[0] - L) < 0.02 && Math.hypot(back[1] - a, back[2] - b) < 0.02) return rgb;
C *= 0.8;
}
return oklabToRgb(L, Math.cos(r) * C, Math.sin(r) * C);
}
const hueDiff = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;
const hueToward = (h, target, t) => (h + hueDiff(h, target) * t + 360) % 360;
function pack(rgb, a = 1) {
const r = Math.round(Math.max(0, Math.min(1, rgb[0])) * 255), g = Math.round(Math.max(0, Math.min(1, rgb[1])) * 255), b = Math.round(Math.max(0, Math.min(1, rgb[2])) * 255);
return ((Math.round(a * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
const unpack = (c) => [(c & 255) / 255, ((c >>> 8) & 255) / 255, ((c >>> 16) & 255) / 255];
function mixPacked(a, b, t) {
const r = (a & 255) + ((b & 255) - (a & 255)) * t, g = ((a >>> 8) & 255) + (((b >>> 8) & 255) - ((a >>> 8) & 255)) * t, bl = ((a >>> 16) & 255) + (((b >>> 16) & 255) - ((a >>> 16) & 255)) * t;
return ((255 << 24) | (Math.round(bl) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
}
function hex(hex) {
const v = parseInt(hex.slice(1), 16);
return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
function ramp(rgb, o = {}) {
const n = o.n ?? 6, spread = o.spread ?? 0.5, cool = o.cool ?? 0.35, warm = o.warm ?? 0.25, sat = o.sat ?? 1, lift = o.lift ?? 0;
const [L0, C0, h0] = toLch(rgb);
const out = [];
for (let i = 0; i < n; i++) {
const t = n === 1 ? 0.5 : i / (n - 1);
const L = L0 + lift + (t - 0.55) * spread;
const h = t < 0.55 ? hueToward(h0, 285, cool * (0.55 - t) * 1.6) : hueToward(h0, 75, warm * (t - 0.55) * 1.8);
const C = C0 * sat * (t < 0.5 ? 0.75 + t * 0.5 : 1 - (t - 0.5) * 0.45) + (t < 0.3 ? 0.008 : 0);
out.push(pack(fromLch(L, C, h)));
}
return out;
}
function shift(rgb, d) {
const [L, C, h] = toLch(rgb);
const hh = d.h !== undefined ? hueToward(h, d.h, d.hT ?? 1) : h + (d.dh || 0);
return fromLch(L + (d.dL || 0), Math.max(0, C * (d.cK ?? 1) + (d.dC || 0)), (hh + 360) % 360);
}
return { toLch, fromLch, hueDiff, hueToward, pack, unpack, mixPacked, hex, ramp, shift };
})();
// src/game/biomes.js
const __m6 = (() => {
const BIOMES = [
{ id: 'forest', name: 'Whisperwood', category: 'natural', dominant: 'vitality', creature: 'fox', rank: 0, sales: 0, sky: [0.36, 0.52, 0.42], desc: 'Old oaks, healing herbs and silver leaves.' },
{ id: 'meadow', name: 'Sunlit Meadow', category: 'natural', dominant: 'love', creature: 'hare', rank: 0, sales: 1, sky: [0.55, 0.72, 0.9], desc: 'Warm meadows, flowers and affectionate magic.' },
{ id: 'river', name: 'Willow Bank', category: 'natural', dominant: 'frost', creature: 'otter', rank: 1, sales: 3, sky: [0.5, 0.66, 0.78], desc: 'Cool water, willow roots and winter pearls.' },
{ id: 'quarry', name: 'Ironstone Quarry', category: 'natural', dominant: 'strength', creature: 'beetle', rank: 1, sales: 5, sky: [0.62, 0.6, 0.58], desc: 'Mineral seams and hardy stone-borne life.' },
{ id: 'netherwood', name: 'Netherwood', category: 'natural', dominant: 'toxicity', creature: 'cavemoth', rank: 2, sales: 8, sky: [0.1, 0.12, 0.18], desc: 'A deep fungal forest, rich with poisonous spores.' },
{ id: 'crags', name: 'Ember Crags', category: 'natural', dominant: 'fire', creature: 'salamander', rank: 2, sales: 12, sky: [0.42, 0.2, 0.16], desc: 'Volcanic ledges and heat-blooming ingredients.' },
{ id: 'moonfen', name: 'Moonfen', category: 'exotic', dominant: 'arcana', creature: 'wisp', rank: 3, sales: 16, sky: [0.16, 0.18, 0.32], desc: 'Luminous marshes and spectral ripples.', interaction: 'ripple' },
{ id: 'skyshard', name: 'Skyshard Archipelago', category: 'exotic', dominant: 'levitation', creature: 'cloudray', rank: 3, sales: 19, sky: [0.4, 0.72, 0.92], desc: 'Floating islands anchored by springing sky crystals.', interaction: 'spring' },
{ id: 'morphgrove', name: 'Morphgrove', category: 'exotic', dominant: 'transformation', creature: 'mimiclizard', rank: 3, sales: 22, sky: [0.32, 0.52, 0.48], desc: 'Living terrain and plants that change their shape.', interaction: 'morph' },
{ id: 'veil', name: 'Veil Hollow', category: 'exotic', dominant: 'invisibility', creature: 'shroudmoth', rank: 4, sales: 26, sky: [0.24, 0.28, 0.38], desc: 'Disturb the mist to uncover hidden ruins.', interaction: 'mist' },
{ id: 'ghostglass', name: 'Ghostglass Reef', category: 'exotic', dominant: 'phasing', creature: 'axolotl', rank: 4, sales: 30, sky: [0.08, 0.24, 0.34], desc: 'Spectral coral and crystals that drift between states.', interaction: 'phase' },
{ id: 'chronoglass', name: 'Chronoglass Wastes', category: 'exotic', dominant: 'temporal', creature: 'scarab', rank: 4, sales: 36, sky: [0.56, 0.35, 0.5], desc: 'Broken arches and sandfalls outside ordinary time.', interaction: 'time' },
].map((b) => Object.freeze({ ...b, magical: b.category === 'exotic' }));
const BIOME_BY_ID = Object.fromEntries(BIOMES.map((b) => [b.id, b]));
function biomeUnlocked(st, id) {
const b = BIOME_BY_ID[id];
return !!b && (id === 'forest' || !!st.unlockedBiomes?.includes(id) || (st.rank >= b.rank && (st.stats?.served || 0) >= b.sales));
}
function refreshBiomeUnlocks(st) {
st.unlockedBiomes = [...new Set(['forest', ...(st.unlockedBiomes || []), ...BIOMES.filter((b) => biomeUnlocked(st, b.id)).map((b) => b.id)])];
return st.unlockedBiomes;
}
return { BIOMES, BIOME_BY_ID, biomeUnlocked, refreshBiomeUnlocks };
})();
// src/reactions/compatibility.js
const __m8 = (() => {
const COMPAT_FULL = 0.26;
const COMPAT_NONE = 0.4;
function compatFactor(a1, b1, a2, b2) {
const d = Math.hypot(a1 - a2, b1 - b2);
if (d <= COMPAT_FULL) return 1;
if (d >= COMPAT_NONE) return 0;
return 1 - (d - COMPAT_FULL) / (COMPAT_NONE - COMPAT_FULL);
}
function miscible(m1, m2) {
return compatFactor(m1.compat[0], m1.compat[1], m2.compat[0], m2.compat[1]) > 0.5;
}
return { COMPAT_FULL, COMPAT_NONE, compatFactor, miscible };
})();
// src/alchemy/effects.js
const __m7 = (() => {
const EFFECTS = [
{ key: 'vitality', label: 'Vitality', icon: 'heart', color: [0.92, 0.3, 0.32], kind: 'magic', desc: 'Healing and life: mends wounds, restores energy.' },
{ key: 'strength', label: 'Strength', icon: 'fist', color: [0.96, 0.76, 0.36], kind: 'magic', desc: 'Might and toughness of body (or of stone).' },
{ key: 'love', label: 'Love', icon: 'rose', color: [1, 0.5, 0.74], kind: 'magic', desc: 'Attraction, affection and calm.' },
{ key: 'arcana', label: 'Arcana', icon: 'eye', color: [0.62, 0.52, 1], kind: 'magic', desc: 'Insight and raw magical potency; makes things shine.' },
{ key: 'transformation', label: 'Transformation', icon: 'swirl', color: [0.4, 0.9, 0.79], kind: 'magic', desc: 'Change of shape, colour or nature.' },
{ key: 'fire', label: 'Fire', icon: 'flame', color: [1, 0.56, 0.3], kind: 'magic', desc: 'Burning warmth. Opposes frost.' },
{ key: 'frost', label: 'Frost', icon: 'snow', color: [0.55, 0.87, 1], kind: 'magic', desc: 'Freezing cold. Opposes fire.' },
{ key: 'acidity', label: 'Acidity', icon: 'acid', color: [0.84, 0.91, 0.45], kind: 'chemical', signed: true, harmful: true, desc: 'Corrosive acid. Negative values are alkaline; acids and alkalis neutralise.' },
{ key: 'toxicity', label: 'Toxicity', icon: 'skull', color: [0.57, 0.8, 0.44], kind: 'chemical', harmful: true, desc: 'Poison. Vitality neutralises it.' },
{ key: 'death', label: 'Death', icon: 'death', color: [0.71, 0.57, 0.93], kind: 'magic', harmful: true, desc: 'Necromantic decay. Opposes vitality.' },
{ key: 'swiftness', label: 'Swiftness', icon: 'speed', color: [0.78, 0.95, 0.45], kind: 'magic', desc: 'Quickens movement and reactions.' },
{ key: 'levitation', label: 'Levitation', icon: 'feather', color: [0.53, 0.88, 1], kind: 'magic', desc: 'Lifts the body above the ground.' },
{ key: 'invisibility', label: 'Invisibility', icon: 'eye', color: [0.74, 0.65, 0.94], kind: 'magic', desc: 'Veils the body from sight.' },
{ key: 'phasing', label: 'Phasing', icon: 'crystal', color: [0.45, 1, 0.9], kind: 'magic', desc: 'Shifts the body toward a spectral state.' },
{ key: 'temporal', label: 'Temporal Distortion', icon: 'clock', color: [1, 0.82, 0.4], kind: 'magic', desc: 'Distorts the pace of a creature’s local time.' },
];
const NATURAL_EFFECTS = Object.freeze(['vitality', 'strength', 'love', 'fire', 'frost', 'acidity', 'toxicity', 'death', 'swiftness']);
const EXOTIC_EFFECTS = Object.freeze(['arcana', 'levitation', 'transformation', 'invisibility', 'phasing', 'temporal']);
const NE = EFFECTS.length;
const EFFECT_KEYS = EFFECTS.map((e) => e.key);
const EFFECT_INDEX = Object.fromEntries(EFFECT_KEYS.map((k, i) => [k, i]));
const EFFECT_BY_KEY = Object.fromEntries(EFFECTS.map((e) => [e.key, e]));
const E = Object.freeze({ VIT: 0, STR: 1, LOVE: 2, ARC: 3, TRANS: 4, FIRE: 5, FROST: 6, ACID: 7, TOX: 8, DEATH: 9 });
const ASPECT_TO_EFFECT = ['vitality', 'fire', 'arcana', 'strength'];
const { compatFactor } = __m8;
const LEACH_WET = 0.12;
const LEACH_DRY = 0.05;
const KNEE = 40;
const EFFECT_CUTOFF = 1;
function cutoffEffects(e) {
for (let k = 0; k < NE; k++) if (Math.abs(e[k]) < EFFECT_CUTOFF) e[k] = 0;
return e;
}
function effectVector(def) {
const v = new Array(NE).fill(0);
if (def && def.effects) {
for (let k = 0; k < NE; k++) v[k] = Number(def.effects[EFFECT_KEYS[k]]) || 0;
} else if (def && def.aspects) {
for (let a = 0; a < 4; a++) v[EFFECT_INDEX[ASPECT_TO_EFFECT[a]]] += def.aspects[a] || 0;
}
return v;
}
function toRecord(vec) {
const o = {};
for (let k = 0; k < NE; k++) o[EFFECT_KEYS[k]] = Math.round(vec[k] * 10) / 10;
return o;
}
function fromRecord(rec) {
const v = new Array(NE).fill(0);
if (rec) for (let k = 0; k < NE; k++) v[k] = Number(rec[EFFECT_KEYS[k]]) || 0;
return v;
}
function cutoffDormant(e, dormant) {
for (let k = 0; k < NE; k++) if (Math.abs(dormant[k]) < EFFECT_CUTOFF) e[k] = 0;
return e;
}
function extractedEffects(sp, comp, off, T, out, dormant) {
for (let k = 0; k < NE; k++) out[k] = 0;
if (dormant) for (let k = 0; k < NE; k++) dormant[k] = 0;
const n = sp.count;
let tot = 0, liquid = 0, nl = 0;
for (let s = 0; s < n; s++) {
const f = comp[off + s];
if (f <= 0) continue;
tot += f;
if (!sp.isPowder[s] || T >= sp.melt[s]) { liquid += f; liqIdx[nl++] = s; }
}
if (tot <= 1e-9) return 0;
for (let s = 0; s < n; s++) {
const f = comp[off + s];
if (f <= 0) continue;
let avail = f;
if (sp.isPowder[s] && T < sp.melt[s]) {
let solvent = 0;
for (let q = 0; q < nl; q++) {
const l = liqIdx[q];
if (compatFactor(sp.compatA[s], sp.compatB[s], sp.compatA[l], sp.compatB[l]) > 0.5) solvent += comp[off + l];
}
const sol = Math.min(0.9, Math.max(0, sp.solubility[s] + sp.solTemp[s] * (T - 20)));
const dissolved = Math.min(f, sol * solvent * 1.2);
avail = dissolved + (solvent / tot > 0.05 ? LEACH_WET : LEACH_DRY) * (f - dissolved);
}
const base = s * NE;
const dg = dormant ? 1 / (sp.arcGain[s] || 1) : 0;
for (let k = 0; k < NE; k++) {
const e = sp.eff[base + k];
if (e === 0) continue;
out[k] += avail * e;
if (dormant) dormant[k] += avail * e * dg;
}
}
const inv = 1 / tot;
for (let k = 0; k < NE; k++) out[k] *= inv;
if (dormant) for (let k = 0; k < NE; k++) dormant[k] *= inv;
return liquid / tot;
}
const liqIdx = new Int16Array(64);
const contrib = new Float64Array(32);
function interact(e, laws, trace) {
const nl = Math.min(laws ? laws.length : 0, contrib.length);
for (let r = 0; r < nl; r++) {
const L = laws[r];
const a = e[L.a], b = L.kind === 'suppress' ? Math.abs(e[L.b]) : e[L.b];
contrib[r] = 0;
if (a <= L.min || b <= L.min) continue;
if (L.kind === 'transmute') {
const amt = Math.min(L.k * Math.sqrt((a - L.min) * (b - L.min)), 0.8 * Math.min(a, b));
contrib[r] = amt;
} else if (L.kind === 'catalyse') {
contrib[r] = Math.min(1, (b - L.min) / Math.max(1, 3 * L.min)) * L.k * a;
} else {
contrib[r] = Math.min(a, L.k * b);
}
}
for (let r = 0; r < nl; r++) {
const amt = contrib[r];
if (amt <= 0) continue;
const L = laws[r];
if (L.kind === 'transmute') {
e[L.a] -= amt * 0.5;
e[L.b] -= amt * 0.5;
e[L.c] += amt * 1.15;
} else if (L.kind === 'catalyse') {
e[L.a] += amt;
} else {
e[L.a] -= amt;
}
if (trace) trace[r] += amt;
}
let m = Math.min(e[E.FIRE], e[E.FROST]);
if (m > 0) { e[E.FIRE] -= m; e[E.FROST] -= m; }
m = Math.min(e[E.VIT], e[E.DEATH]);
if (m > 0) { e[E.VIT] -= m; e[E.DEATH] -= m; }
m = Math.min(e[E.VIT] * 0.5, e[E.TOX]);
if (m > 0) { e[E.TOX] -= m; e[E.VIT] -= 2 * m; }
for (let k = 0; k < NE; k++) {
let v = e[k];
if (k !== E.ACID && v < 0) v = 0;
const s = v < 0 ? -1 : 1, av = Math.abs(v);
e[k] = av <= KNEE ? v : s * (KNEE + 60 * (1 - Math.exp(-(av - KNEE) / 60)));
}
return cutoffEffects(e);
}
const scratch = new Float64Array(NE);
const dormantScratch = new Float64Array(NE);
function compositionEffects(sp, comp, off, T, laws, out, trace, dormant) {
const d = dormant || dormantScratch;
extractedEffects(sp, comp, off, T, scratch, d);
for (let k = 0; k < NE; k++) out[k] = scratch[k];
interact(out, laws, trace);
return cutoffDormant(out, d);
}
function theoryOf(parts, lookup, knownLaws = []) {
const v = new Float64Array(NE);
let tot = 0;
for (const p of parts) tot += p.ml;
if (tot <= 0) return v;
const dormant = new Float64Array(NE);
for (const p of parts) {
const d = lookup(p.id);
if (!d || d.remains) continue;
const ev = effectVector(d);
const dg = d.awakened && d.arcane && d.arcane.gain > 0 ? 1 / d.arcane.gain : 1;
for (let k = 0; k < NE; k++) { v[k] += (ev[k] * p.ml) / tot; dormant[k] += (ev[k] * dg * p.ml) / tot; }
}
return cutoffDormant(interact(v, knownLaws), dormant);
}
function sampleEffects(sim, indices) {
const p = sim.p, sp = sim.species, laws = sim.laws || [], S = p.S;
const sum = new Float64Array(NE);
const trace = new Float64Array(laws.length);
const one = new Float64Array(NE), dorm = new Float64Array(NE), dsum = new Float64Array(NE);
const n = indices.length;
for (let q = 0; q < n; q++) {
const i = indices[q];
compositionEffects(sp, p.comp, i * S, p.temp[i], laws, one, trace, dorm);
for (let k = 0; k < NE; k++) { sum[k] += one[k]; dsum[k] += dorm[k]; }
}
if (n) {
for (let k = 0; k < NE; k++) { sum[k] /= n; dsum[k] /= n; }
for (let r = 0; r < trace.length; r++) trace[r] /= n;
}
cutoffDormant(cutoffEffects(sum), dsum);
return { effects: sum, resonance: trace };
}
function dominantEffect(v, min = 2) {
let best = -1, bv = min;
for (let k = 0; k < NE; k++) {
const x = k === E.ACID ? Math.abs(v[k]) : v[k];
if (x > bv) { bv = x; best = k; }
}
return best;
}
function potencyWord(v, key) {
if (key === 'acidity' && v < -2) return v < -25 ? 'strongly alkaline' : 'alkaline';
const a = Math.abs(v);
if (a < 2) return 'none';
if (a < 8) return 'trace';
if (a < 20) return 'mild';
if (a < 40) return 'strong';
return 'intense';
}
return { EFFECTS, NATURAL_EFFECTS, EXOTIC_EFFECTS, NE, EFFECT_KEYS, EFFECT_INDEX, EFFECT_BY_KEY, E, ASPECT_TO_EFFECT, EFFECT_CUTOFF, cutoffEffects, effectVector, toRecord, fromRecord, cutoffDormant, extractedEffects, interact, compositionEffects, theoryOf, sampleEffects, dominantEffect, potencyWord };
})();
// src/core/rng.js
const __m10 = (() => {
function hashString(str) {
let h = 2166136261 >>> 0;
for (let i = 0; i < str.length; i++) {
h ^= str.charCodeAt(i);
h = Math.imul(h, 16777619);
}
h ^= h >>> 16;
h = Math.imul(h, 0x85ebca6b);
h ^= h >>> 13;
h = Math.imul(h, 0xc2b2ae35);
h ^= h >>> 16;
return h >>> 0;
}
class Rng {
constructor(seed) {
const s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
this.a = s ^ 0x9e3779b9;
this.b = Math.imul(s, 0x85ebca6b) ^ 0x243f6a88;
this.c = Math.imul(s ^ 0x13198a2e, 0xc2b2ae35);
this.d = 1;
for (let i = 0; i < 16; i++) this.next();
}
next() {
let a = this.a, b = this.b, c = this.c, d = this.d;
const t = (((a + b) | 0) + d) | 0;
d = (d + 1) | 0;
a = b ^ (b >>> 9);
b = (c + (c << 3)) | 0;
c = (c << 21) | (c >>> 11);
c = (c + t) | 0;
this.a = a; this.b = b; this.c = c; this.d = d;
return (t >>> 0) / 4294967296;
}
range(lo, hi) { return lo + (hi - lo) * this.next(); }
int(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
chance(p) { return this.next() < p; }
gauss() {
let u = 0, v = 0;
while (u === 0) u = this.next();
v = this.next();
return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
shuffle(arr) {
const out = arr.slice();
for (let i = out.length - 1; i > 0; i--) {
const j = Math.floor(this.next() * (i + 1));
const t = out[i]; out[i] = out[j]; out[j] = t;
}
return out;
}
weighted(items, weights) {
let total = 0;
for (const w of weights) total += w;
let r = this.next() * total;
for (let i = 0; i < items.length; i++) {
r -= weights[i];
if (r <= 0) return items[i];
}
return items[items.length - 1];
}
fork(label) {
return new Rng((hashString(label) ^ Math.floor(this.next() * 4294967296)) >>> 0);
}
}
return { hashString, Rng };
})();
// src/game/native-species.js
const __m11 = (() => {
const NATIVE_SPECIES = {
fox: { label: 'Fox', plural: 'foxes', biome: 'forest', effect: 'vitality', anatomy: 'fox', gait: 'fox', color: [0.84, 0.44, 0.18] },
hare: { label: 'Hare', plural: 'hares', biome: 'meadow', effect: 'love', anatomy: 'hare', gait: 'rabbit', color: [0.65, 0.51, 0.33] },
otter: { label: 'River Otter', plural: 'river otters', biome: 'river', effect: 'frost', anatomy: 'otter', gait: 'ermine', color: [0.47, 0.33, 0.23] },
beetle: { label: 'Rock Beetle', plural: 'rock beetles', biome: 'quarry', effect: 'strength', anatomy: 'beetle', gait: 'badger', color: [0.55, 0.47, 0.34] },
cavemoth: { label: 'Cave Moth', plural: 'cave moths', biome: 'netherwood', effect: 'toxicity', anatomy: 'moth', gait: 'dove', color: [0.48, 0.52, 0.34] },
salamander: { label: 'Salamander', plural: 'salamanders', biome: 'crags', effect: 'fire', anatomy: 'salamander', gait: 'salamander', color: [0.2, 0.23, 0.19] },
wisp: { label: "Will-o'-Wisp", plural: 'wisps', biome: 'moonfen', effect: 'arcana', anatomy: 'wisp', gait: 'dove', color: [0.35, 0.8, 0.85] },
cloudray: { label: 'Cloud Ray', plural: 'cloud rays', biome: 'skyshard', effect: 'levitation', anatomy: 'ray', gait: 'dove', color: [0.55, 0.8, 0.9] },
mimiclizard: { label: 'Mimic Lizard', plural: 'mimic lizards', biome: 'morphgrove', effect: 'transformation', anatomy: 'lizard', gait: 'salamander', color: [0.43, 0.7, 0.42] },
shroudmoth: { label: 'Shroud Moth', plural: 'shroud moths', biome: 'veil', effect: 'invisibility', anatomy: 'moth', gait: 'dove', color: [0.57, 0.46, 0.71] },
axolotl: { label: 'Spectral Axolotl', plural: 'spectral axolotls', biome: 'ghostglass', effect: 'phasing', anatomy: 'axolotl', gait: 'salamander', color: [0.58, 0.81, 0.84] },
scarab: { label: 'Hourglass Scarab', plural: 'hourglass scarabs', biome: 'chronoglass', effect: 'temporal', anatomy: 'scarab', gait: 'badger', color: [0.7, 0.52, 0.23] },
};
return { NATIVE_SPECIES };
})();
// src/game/kinds.js
const __m9 = (() => {
const { Rng } = __m10;
const { NATIVE_SPECIES } = __m11;
const RABBIT_SPREAD = 0.1;
const STEADY_SPREAD = 0.012;
const STEADY_NOISE = 0.3;
const KINDS = {
rabbit: {
id: 'rabbit', noun: 'rabbit', plural: 'rabbits', young: 'kit',
biasAll: RABBIT_SPREAD, bias: {}, noise: {}, steady: null,
lore: 'Moon Rabbits feel every effect, each a little more or less than the next (about ±10 %): the all-round test animal.',
},
cat: {
id: 'cat', noun: 'cat', plural: 'cats', young: 'kitten',
biasAll: RABBIT_SPREAD, bias: { arcana: STEADY_SPREAD, love: 0.16 }, noise: { arcana: STEADY_NOISE, love: 1.2 }, steady: 'arcana',
lore: 'Every cat feels arcana alike, within about 1 %, and steadily dose after dose: a few trials on cats pin arcana down. Their love is fickle.',
},
toad: {
id: 'toad', noun: 'toad', plural: 'toads', young: 'toadlet',
biasAll: RABBIT_SPREAD, bias: { toxicity: STEADY_SPREAD, acid: 0.05 }, noise: { toxicity: STEADY_NOISE, acid: 0.7 }, steady: 'toxicity',
lore: 'Toads all feel poison alike, within about 1 %, and steadily: the surest measure of toxicity. Acids they read fairly well too.',
},
salamander: {
id: 'salamander', noun: 'salamander', plural: 'salamanders', young: 'eft',
biasAll: RABBIT_SPREAD, bias: { fire: STEADY_SPREAD, frost: 0.14 }, noise: { fire: STEADY_NOISE, frost: 1.2 }, steady: 'fire',
lore: 'Fire salamanders all feel fire alike, within about 1 %, and steadily: the surest measure of fire. Cold makes them erratic.',
},
deer: {
id: 'deer', noun: 'deer', plural: 'deer', young: 'fawn',
biasAll: RABBIT_SPREAD, bias: { vitality: STEADY_SPREAD, death: 0.14 }, noise: { vitality: STEADY_NOISE, death: 1.2 }, steady: 'vitality',
lore: 'Deer all feel vitality alike, within about 1 %, and steadily: the surest measure of healing. Death unsettles them.',
},
badger: {
id: 'badger', noun: 'badger', plural: 'badgers', young: 'cub',
biasAll: RABBIT_SPREAD, bias: { strength: STEADY_SPREAD, love: 0.14 }, noise: { strength: STEADY_NOISE, love: 1.2 }, steady: 'strength',
lore: 'Badgers all feel strength alike, within about 1 %, and steadily: the surest measure of might. Love they take unevenly.',
},
dove: {
id: 'dove', noun: 'dove', plural: 'doves', young: 'squab',
biasAll: RABBIT_SPREAD, bias: { love: STEADY_SPREAD, strength: 0.14 }, noise: { love: STEADY_NOISE, strength: 1.2 }, steady: 'love',
lore: 'Doves all feel love alike, within about 1 %, and steadily: the surest measure of love. Strength sits oddly on them.',
},
fox: {
id: 'fox', noun: 'fox', plural: 'foxes', young: 'kit',
biasAll: RABBIT_SPREAD, bias: { transformation: STEADY_SPREAD, arcana: 0.13 }, noise: { transformation: STEADY_NOISE, arcana: 1.2 }, steady: 'transformation',
lore: 'Foxes, the old shape-shifters, all feel transformation alike, within about 1 %, and steadily. Their arcana is capricious.',
},
ermine: {
id: 'ermine', noun: 'ermine', plural: 'ermines', young: 'kit',
biasAll: RABBIT_SPREAD, bias: { frost: STEADY_SPREAD, fire: 0.14 }, noise: { frost: STEADY_NOISE, fire: 1.2 }, steady: 'frost',
lore: 'Ermines, white with the winter, all feel frost alike, within about 1 %, and steadily. Heat makes them erratic.',
},
snail: {
id: 'snail', noun: 'snail', plural: 'snails', young: 'hatchling',
biasAll: RABBIT_SPREAD, bias: { acidity: STEADY_SPREAD, toxicity: 0.06 }, noise: { acidity: STEADY_NOISE, toxicity: 0.7 }, steady: 'acidity',
lore: 'Snails all feel acids and lyes alike, within about 1 %, and steadily: the surest measure of acidity. Poisons they read fairly well too.',
},
rat: {
id: 'rat', noun: 'rat', plural: 'rats', young: 'pup',
biasAll: RABBIT_SPREAD, bias: { death: STEADY_SPREAD, vitality: 0.14 }, noise: { death: STEADY_NOISE, vitality: 1.2 }, steady: 'death',
lore: 'Rats all feel death alike, within about 1 %, and steadily: the surest measure of death. Healing takes them unevenly.',
},
};
for (const [id, n] of Object.entries(NATIVE_SPECIES)) {
KINDS[id] = { id, noun: n.label.toLowerCase(), plural: n.plural, young: ['beetle', 'scarab', 'cavemoth', 'shroudmoth'].includes(id) ? 'larva' : 'young',
biasAll: RABBIT_SPREAD, bias: { [n.effect]: STEADY_SPREAD }, noise: { [n.effect]: STEADY_NOISE }, steady: n.effect,
lore: `${n.label} is native to ${n.biome}. Its steady channel is ${n.effect}.` };
}
KINDS.ermine = { ...KINDS.ermine, steady: 'swiftness', bias: { swiftness: STEADY_SPREAD }, noise: { swiftness: STEADY_NOISE } };
const KIND_IDS = /** @type {AnimalKind[]} */ (Object.keys(KINDS));
function kindOf(o) {
const k = o && (o.kind || (o.look && o.look.kind));
return k && Object.prototype.hasOwnProperty.call(KINDS, k) ? k : 'rabbit';
}
const kindDef = (o) => KINDS[kindOf(o)];
function biasSpread(o, key) {
const d = kindDef(o);
return d.bias[key] ?? d.biasAll;
}
function noiseFactor(o, key) {
return kindDef(o).noise[key] ?? 1;
}
function aNoun(o) {
return `a ${kindDef(o).noun}`;
}
const HABITAT = {
meadow: [['rabbit', 4], ['cat', 1], ['deer', 2], ['dove', 2], ['badger', 1], ['fox', 1]],
forest: [['rabbit', 3], ['cat', 2], ['toad', 1], ['deer', 2], ['badger', 2], ['fox', 2], ['snail', 1]],
netherwood: [['rabbit', 2], ['cat', 2], ['salamander', 1], ['fox', 2], ['rat', 2]],
river: [['rabbit', 2], ['toad', 3], ['dove', 1], ['snail', 2], ['rat', 1]],
quarry: [['rabbit', 1], ['salamander', 2], ['rat', 2], ['ermine', 1]],
moonfen: [['rabbit', 1], ['toad', 3], ['salamander', 1], ['snail', 2], ['rat', 1], ['ermine', 1]],
crags: [['rabbit', 1], ['cat', 1], ['salamander', 2], ['ermine', 2], ['dove', 1]],
};
for (const [id, n] of Object.entries(NATIVE_SPECIES)) HABITAT[n.biome] = [[id, 1]];
function pickKind(region, rng) {
const h = HABITAT[region] || [['rabbit', 1]];
return rng.weighted(h.map((x) => x[0]), h.map((x) => x[1]));
}
const r2 = (v) => Math.round(v * 100) / 100;
function kindLook(kind, rng) {
const seed = 1 + rng.int(0, 2147483000);
const size = r2(Math.max(0.85, Math.min(1.15, 1 + 0.06 * rng.gauss())));
const native = NATIVE_SPECIES[kind];
if (native && !['fox', 'salamander'].includes(kind)) {
const factor = rng.range(0.9, 1.08), coat = native.color.map((c) => r2(Math.min(1, c * factor)));
return { kind, coat, coat2: coat.map((c) => Math.min(1, c + 0.22)), pattern: 'solid', ear: kind === 'hare' ? 'upright' : 'none', size, eye: 'dark', tail: 1, seed };
}
if (kind === 'cat') {
const coats = [
[[0.55, 0.45, 0.33], [0.24, 0.18, 0.13], 'tabby', 3], [[0.85, 0.52, 0.24], [0.62, 0.32, 0.12], 'tabby', 2],
[[0.2, 0.18, 0.2], [0.97, 0.96, 0.94], 'dutch', 1], [[0.16, 0.15, 0.17], [0.16, 0.15, 0.17], 'solid', 2],
[[0.6, 0.6, 0.64], [0.36, 0.36, 0.4], 'tabby', 2], [[0.93, 0.89, 0.82], [0.35, 0.25, 0.2], 'points', 1],
];
const c = coats[rng.weighted(coats.map((_, i) => i), coats.map((x) => /** @type {number} */ (x[3])))];
return { kind, coat: /** @type {number[]} */ (c[0]).slice(), coat2: /** @type {number[]} */ (c[1]).slice(), pattern: c[2], ear: 'cat', size, eye: rng.chance(0.5) ? 'green' : 'amber', tail: 1, seed };
}
if (kind === 'toad') {
const coats = [[0.46, 0.5, 0.27], [0.5, 0.4, 0.26], [0.36, 0.44, 0.26], [0.58, 0.5, 0.32]];
const c = coats[rng.int(0, coats.length - 1)];
return { kind, coat: c.slice(), coat2: [c[0] * 0.62, c[1] * 0.62, c[2] * 0.6].map(r2), pattern: 'warts', ear: 'none', size, eye: 'amber', tail: 0, seed };
}
const pick = (/** @type {any[]} */ xs) => xs[rng.int(0, xs.length - 1)];
if (kind === 'deer') {
return { kind, coat: pick([[0.62, 0.42, 0.25], [0.55, 0.38, 0.22], [0.68, 0.5, 0.32]]).slice(), coat2: [0.96, 0.93, 0.86], pattern: 'dapple', ear: 'deer', size, eye: 'dark', tail: 1, seed };
}
if (kind === 'badger') {
return { kind, coat: pick([[0.56, 0.55, 0.57], [0.5, 0.48, 0.47], [0.62, 0.6, 0.58]]).slice(), coat2: [0.12, 0.11, 0.12], pattern: 'badger', ear: 'round', size, eye: 'dark', tail: 1, seed };
}
if (kind === 'dove') {
const c = pick([[0.8, 0.8, 0.85], [0.95, 0.95, 0.95], [0.78, 0.7, 0.72]]);
return { kind, coat: c.slice(), coat2: [c[0] * 0.6, c[1] * 0.6, c[2] * 0.66].map(r2), pattern: 'dove', ear: 'none', size, eye: 'dark', tail: 1, seed };
}
if (kind === 'fox') {
return { kind, coat: pick([[0.86, 0.45, 0.16], [0.78, 0.38, 0.14], [0.9, 0.55, 0.22]]).slice(), coat2: [0.97, 0.95, 0.9], pattern: 'fox', ear: 'fox', size, eye: 'amber', tail: 2, seed };
}
if (kind === 'ermine') {
const white = rng.chance(0.5);
return { kind, coat: white ? [0.96, 0.95, 0.92] : [0.52, 0.36, 0.22], coat2: white ? [0.96, 0.95, 0.92] : [0.96, 0.92, 0.82], pattern: 'ermine', ear: 'round', size, eye: 'dark', tail: 1, seed };
}
if (kind === 'snail') {
return { kind, coat: pick([[0.62, 0.56, 0.48], [0.55, 0.52, 0.48], [0.7, 0.62, 0.52]]).slice(), coat2: pick([[0.72, 0.5, 0.28], [0.6, 0.45, 0.3], [0.82, 0.68, 0.42]]).slice(), pattern: 'spiral', ear: 'stalk', size, eye: 'dark', tail: 0, seed };
}
if (kind === 'rat') {
const c = pick([[0.45, 0.4, 0.37], [0.3, 0.27, 0.26], [0.58, 0.54, 0.48]]);
return { kind, coat: c.slice(), coat2: [Math.min(1, c[0] + 0.25), Math.min(1, c[1] + 0.25), Math.min(1, c[2] + 0.22)].map(r2), pattern: 'solid', ear: 'round', size, eye: 'dark', tail: 1, seed };
}
const spot = rng.chance(0.65) ? [0.98, 0.78, 0.16] : [0.96, 0.46, 0.12];
return { kind: 'salamander', coat: [0.14, 0.12, 0.13], coat2: spot, pattern: 'blotched', ear: 'none', size, eye: 'dark', tail: 2, seed };
}
return { RABBIT_SPREAD, STEADY_SPREAD, STEADY_NOISE, KINDS, KIND_IDS, kindOf, kindDef, biasSpread, noiseFactor, aNoun, HABITAT, pickKind, kindLook };
})();
// src/studio/domain-model.js
const __m5 = (() => {
const { BIOMES } = __m6;
const { EFFECT_KEYS } = __m7;
const { KIND_IDS } = __m9;
const REGIONS = [...BIOMES.map((b) => b.id), 'garden'];
const MATERIALS = ['liquid', 'powder', 'paste', 'solid', 'gas', 'frozen'];
const EFFECT_NAMES = EFFECT_KEYS;
const CREATURES = KIND_IDS;
const visualStyle = () => ({ tint: '#ffffff', mix: 0, opacity: 1, grain: 1, emission: 0, speed: 1 });
const creatureStyle = () => ({ body: 1, head: 1, ears: 1, legs: 1, tail: 1, coat: '#b19a7b', coat2: '#e7dfcd', recolor: false, pattern: '', speed: 1, poses: {} });
const environmentStyle = () => ({ strokes: [], objects: [], lights: [], tint: '#253f4c', mix: 0, density: 1, light: 1, atmosphere: 1 });
function newDomains() {
return { ingredients: {}, environments: {}, creatures: {}, materials: {}, effects: {}, interface: { enabled: false, accent: '#aebf8d', panel: '#2c2429', ink: '#f5e8cc', border: 2, duration: 140, frame: '', button: '', icons: {} } };
}
const check = (ok, name) => { if (!ok) throw new Error('Invalid art domain: ' + name); };
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const color = (v) => typeof v === 'string' && /^#[a-f\d]{6}$/i.test(v);
function validateDomains(d, assets) {
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
return { REGIONS, MATERIALS, EFFECT_NAMES, CREATURES, visualStyle, creatureStyle, environmentStyle, newDomains, validateDomains };
})();
// src/studio/model.js
const __m4 = (() => {
const { newDomains, validateDomains } = __m5;
const FORMAT = 'potion-art-studio';
const VERSION = 2;
const CATEGORIES = ['Ingredients and plants', 'Crystals and minerals', 'Trees and vegetation', 'Terrain and environments', 'Creatures and rabbits', 'Buildings and props', 'Liquids, powders and vapours', 'Magical and physical effects', 'UI and icons'];
const STAGES = ['Sprout', 'Ripe', 'Mature'];
const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = () => globalThis.crypto?.randomUUID?.() || `art-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function newLayer(name = 'Pixel corrections') {
return { id: uid(), name, visible: true, opacity: 1, scope: 'all', variant: 0, stage: 2, pixels: Array(32 * 32).fill(0) };
}
function newComponent(name = 'Component', shape = 'leaf') {
return { id: uid(), name, tags: '', width: 32, height: 32, anchor: [16, 28], tip: [16, 4],
geometry: shape === 'blank' ? [] : [{ shape, color: '#76b98a', width: 12, height: 24, x: 16, y: 16 }], layers: [newLayer()] };
}
function newNode(component, parent = '') {
return { id: uid(), component, parent, name: 'Attach component', count: 1, x: 0, y: 0, angle: 0, scale: 1, jitter: 0, spread: 0, probability: 1, minStage: 0, maxStage: 2, mirror: false, locked: false, lockSeed: 1, avoidOverlap: false, weight: 1, choice: '', anchor: 'tip' };
}
function newAsset(name = 'Untitled plant') {
const stem = newComponent('Stem', 'stem'), leaf = newComponent('Leaf');
stem.geometry[0].color = '#497c56';
const root = newNode(stem.id); root.name = 'Stem'; root.x = 48; root.y = 86;
const leaves = newNode(leaf.id, root.id); leaves.name = 'Leaves'; leaves.count = 3; leaves.spread = 12; leaves.angle = -45; leaves.jitter = 8; leaves.mirror = true; leaves.scale = 0.7; leaves.minStage = 1;
return { id: uid(), name, category: CATEGORIES[0], folder: 'My collection', tags: '', seed: 1, width: 96, height: 96, components: [stem, leaf], nodes: [root, leaves], stages: [0.5, 0.8, 1] };
}
function newProject(name = 'Untitled art project') {
return { format: FORMAT, version: VERSION, id: uid(), name, assets: [newAsset()], palette: ['#172331', '#35594a', '#76b98a', '#e5d4a1', '#ad718d', '#77b7ce'],
presets: [], domains: newDomains(), direction: { global: { tint: '#ffffff', mix: 0, saturation: 1, contrast: 1 }, biomes: {}, families: {}, species: {} }, updated: Date.now() };
}
const fail = (message) => { throw new Error(`Invalid art project: ${message}`); };
const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, n = 120) => typeof v === 'string' && v.length <= n;
const num = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const color = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
function validateProject(input) {
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
JSON.stringify(input, (k, v) => { if (['__proto__', 'constructor', 'prototype'].includes(k)) fail('unsafe key'); return v; });
return input;
}
function validateStyle(s) {
if (!obj(s) || !color(s.tint) || !num(s.mix, 0, 1) || !num(s.saturation, 0, 2) || !num(s.contrast, 0.2, 2)) fail('style values');
}
function parseProject(json) {
if (typeof json !== 'string' || json.length > 16 * 1024 * 1024) fail('file exceeds 16 MB');
const p = JSON.parse(json);
if (p?.format === FORMAT && p.version === 0) { p.version = 1; for (const a of p.assets || []) { a.folder ??= ''; a.tags ??= ''; } }
return upgradeProject(p);
}
function upgradeProject(input) {
const p = clone(input);
if (p?.format === FORMAT && p.version === 1) { p.version = 2; p.domains = newDomains(); }
return clone(validateProject(p));
}
function compileProfile(project) {
validateProject(project);
return clone({ ...project.direction, domains: project.domains, assets: project.assets });
}
class History {
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
return { FORMAT, VERSION, CATEGORIES, STAGES, clone, uid, newLayer, newComponent, newNode, newAsset, newProject, validateProject, validateStyle, parseProject, upgradeProject, compileProfile, History };
})();
// src/studio/direction.js
const __m1 = (() => {
const { hex, pack, unpack } = __m2;
const { validateStyle, clone } = __m4;
let active = null, revision = 0;
const listeners = new Set();
const artRevision = () => revision;
const artDirection = () => active ? clone(active) : null;
function setArtDirection(profile) {
if (profile) {
validateStyle(profile.global);
for (const type of ['biomes', 'families', 'species']) for (const s of Object.values(profile[type] || {})) validateStyle(s);
}
active = profile ? clone(profile) : null; revision++;
for (const fn of listeners) fn();
}
const onArtChanged = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function directDescriptor(d) {
if (!active) return d;
const style = { ...active.global, ...active.biomes[d.id.region], ...active.families[d.family], ...active.species[d.id.key] };
const tint = hex(style.tint), pal = {};
for (const [name, values] of Object.entries(d.pal)) pal[name] = values.map((value) => {
const rgb = unpack(value), l = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
return pack(rgb.map((v, i) => {
const saturated = l + (v - l) * style.saturation;
const contrasted = (saturated - 0.5) * style.contrast + 0.5;
return contrasted * (1 - style.mix) + tint[i] * style.mix;
}), (value >>> 24) / 255);
});
const native = artDomain('ingredients', d.id.key);
const m = { ...d.m };
for (const [k, value] of Object.entries(native?.morph || {})) if (typeof m[k] === typeof value) m[k] = value;
return { ...d, m, pal };
}
const artDomain = (section, key) => active?.domains?.[section]?.[key] || null;
const artAssets = () => active?.assets || [];
const artInterface = () => active?.domains?.interface?.enabled ? active.domains.interface : null;
function withArtProfile(profile, token, fn) {
const old = active, oldRevision = revision;
active = profile; revision = token;
try { return fn(); } finally { active = old; revision = oldRevision; }
}
return { artRevision, artDirection, setArtDirection, onArtChanged, directDescriptor, artDomain, artAssets, artInterface, withArtProfile };
})();
// src/visual/geometry.js
const __m15 = (() => {
class Model {
constructor() {
this.parts = [];
this.glints = [];
}
add(p) { this.parts.push(p); return this; }
poly(pts, mat, o = {}) { return this.add({ t: 'poly', pts, mat, shade: 'round', ...o }); }
stroke(pts, w, mat, o = {}) { return this.add({ t: 'stroke', pts, w, mat, shade: 'cyl', ...o }); }
line(pts, mat, o = {}) { return this.add({ t: 'line', pts, mat, clip: true, ...o }); }
dot(x, y, mat, o = {}) { return this.add({ t: 'dot', x, y, mat, clip: true, ...o }); }
ellipse(cx, cy, rx, ry, mat, o = {}, rot = 0) { return this.poly(ellipse(cx, cy, rx, ry, rot), mat, o); }
bounds() {
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
const take = (x, y, r = 0) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
for (const p of this.parts) {
if (p.pts) {
p.pts.forEach((q, i) => take(q[0], q[1], p.t === 'stroke' ? (Array.isArray(p.w) ? p.w[i] ?? p.w[p.w.length - 1] : p.w || 1) / 2 : 0));
} else take(p.x, p.y);
}
return { x0, y0, x1, y1 };
}
transform(a, b, c, d, e, f, k = Math.sqrt(Math.abs(a * d - b * c))) {
const m = (/** @type {Pt} */ q) => /** @type {Pt} */ ([a * q[0] + c * q[1] + e, b * q[0] + d * q[1] + f]);
for (const p of this.parts) {
if (p.pts) p.pts = p.pts.map(m);
if (p.x !== undefined) { const [x, y] = m([p.x, p.y]); p.x = x; p.y = y; }
if (p.w !== undefined) p.w = Array.isArray(p.w) ? p.w.map((v) => v * k) : p.w * k;
}
this.glints = this.glints.map(m);
return this;
}
rotate(ang, cx = 0, cy = 0) {
const c = Math.cos(ang), s = Math.sin(ang);
return this.transform(c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy, 1);
}
fit(w, h, o = {}) {
const mg = o.margin ?? 1, b = this.bounds();
const bw = Math.max(1e-6, b.x1 - b.x0), bh = Math.max(1e-6, b.y1 - b.y0);
const s = Math.min((w - mg * 2) / bw, (h - mg * 2) / bh, o.max ?? Infinity);
const ox = (w - bw * s) / 2 - b.x0 * s, oy = o.foot ? h - mg - b.y1 * s : (h - bh * s) / 2 - b.y0 * s;
this.transform(s, 0, 0, s, ox, oy, s);
return s;
}
clone() {
const m = new Model();
m.parts = this.parts.map((p) => ({ ...p, pts: p.pts ? p.pts.map((q) => /** @type {Pt} */ ([q[0], q[1]])) : undefined, w: Array.isArray(p.w) ? p.w.slice() : p.w }));
m.glints = this.glints.map((q) => /** @type {Pt} */ ([q[0], q[1]]));
return m;
}
merge(o) { this.parts.push(...o.parts); this.glints.push(...o.glints); return this; }
}
const SQUARE = 4;
function sq(a) {
const c = Math.cos(a), s = Math.sin(a), e = 2 / SQUARE;
return [Math.sign(c) * Math.pow(Math.abs(c), e), Math.sign(s) * Math.pow(Math.abs(s), e)];
}
function ellipse(cx, cy, rx, ry, rot = 0, n = 0) {
n = n || Math.max(12, Math.round((rx + ry) * 2.4));
const c = Math.cos(rot), s = Math.sin(rot), out = /** @type {Pt[]} */ ([]);
for (let i = 0; i < n; i++) {
const a = (i / n) * Math.PI * 2, [ux, uy] = sq(a), x = ux * rx, y = uy * ry;
out.push([cx + x * c - y * s, cy + x * s + y * c]);
}
return out;
}
function bezier(p0, p1, p2, p3, n = 12) {
const out = /** @type {Pt[]} */ ([]);
for (let i = 0; i <= n; i++) {
const t = i / n, u = 1 - t;
out.push([
u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
]);
}
return out;
}
function arc(a, b, bend, n = 10) {
const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
const c = /** @type {Pt} */ ([mx - dy * bend, my + dx * bend]);
const out = /** @type {Pt[]} */ ([]);
for (let i = 0; i <= n; i++) {
const t = i / n, u = 1 - t;
out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
}
return out;
}
function blade(base, ang, len, width, profile, o = {}) {
const n = o.n ?? Math.max(8, Math.round(len * 1.5)), teeth = o.teeth || 0, tooth = o.tooth ?? 0.25, asym = o.asym || 0, curl = o.curl || 0;
const left = /** @type {Pt[]} */ ([]), right = /** @type {Pt[]} */ ([]);
for (let i = 0; i <= n; i++) {
const t = i / n;
const a = ang + curl * t * t;
const cx = base[0] + Math.cos(ang) * len * t + Math.cos(a + Math.PI / 2) * curl * len * t * t * 0.15;
const cy = base[1] + Math.sin(ang) * len * t + Math.sin(a + Math.PI / 2) * curl * len * t * t * 0.15;
let hw = Math.max(0, profile(t)) * width;
if (teeth && t > 0.08 && t < 0.95) hw *= 1 - tooth + tooth * ((t * teeth) % 1);
const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
left.push([cx + nx * hw * (1 + asym), cy + ny * hw * (1 + asym)]);
right.push([cx - nx * hw * (1 - asym), cy - ny * hw * (1 - asym)]);
}
return left.concat(right.reverse());
}
const PROFILES = {
ovate: (t) => Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - t * 0.15),
lance: (t) => Math.sin(Math.PI * Math.pow(t, 0.6)) * (1 - t * 0.35),
round: (t) => Math.sqrt(Math.max(0, 1 - Math.pow(t * 2 - 1, 2))),
spoon: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 1.6)), 0.8),
heart: (t) => (t > 0.85 ? Math.max(0, (1 - t) / 0.15) * 0.75 : Math.sin(Math.PI * Math.pow(t, 0.55) * 0.92)),
linear: (t) => (t < 0.85 ? 1 - t * 0.35 : (1 - t) / 0.15 * 0.7),
needle: (t) => (1 - t) * 0.9 + 0.1 * Math.sin(Math.PI * t),
wedge: (t) => Math.min(1, t * 1.6) * (t > 0.9 ? (1 - t) * 8 : 1),
};
function roughen(pts, rnd, amt) {
return pts.map((q) => /** @type {Pt} */ ([q[0] + (rnd() - 0.5) * 2 * amt, q[1] + (rnd() - 0.5) * 2 * amt]));
}
function lumpy(cx, cy, rx, ry, rnd, lump = 0.15, k = 7, n = 0) {
n = n || Math.max(12, Math.round((rx + ry) * 2.5));
const amps = Array.from({ length: k }, () => 1 + (rnd() - 0.5) * 2 * lump);
rnd(); // (the old rotation's draw: keeps every later draw of the stream in place)
const out = /** @type {Pt[]} */ ([]);
for (let i = 0; i < n; i++) {
const a = (i / n) * Math.PI * 2, f = (i / n) * k, i0 = Math.floor(f) % k, i1 = (i0 + 1) % k, u = f - Math.floor(f);
const r = amps[i0] + (amps[i1] - amps[i0]) * (u * u * (3 - 2 * u)), [ux, uy] = sq(a);
out.push([cx + ux * rx * r, cy + uy * ry * r]);
}
return out;
}
function polygon(cx, cy, r, k, rot, rnd, jit = 0.15, sy = 1) {
const out = /** @type {Pt[]} */ ([]);
for (let i = 0; i < k; i++) {
const a = rot + (i / k) * Math.PI * 2 + (rnd() - 0.5) * jit;
const rr = r * (1 + (rnd() - 0.5) * jit);
out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sy]);
}
return out;
}
function along(pts, t) {
const L = [0];
for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
const want = L[L.length - 1] * Math.max(0, Math.min(1, t));
for (let i = 1; i < pts.length; i++) {
if (L[i] >= want) {
const u = (want - L[i - 1]) / Math.max(1e-9, L[i] - L[i - 1]);
const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u;
return { x, y, ang: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) };
}
}
const n = pts.length - 1;
return { x: pts[n][0], y: pts[n][1], ang: n > 0 ? Math.atan2(pts[n][1] - pts[n - 1][1], pts[n][0] - pts[n - 1][0]) : -Math.PI / 2 };
}
function upTo(pts, t) {
if (t >= 1) return pts.slice();
const end = along(pts, t), out = /** @type {Pt[]} */ ([pts[0]]);
let L = 0;
const total = pts.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
for (let i = 1; i < pts.length; i++) {
L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
if (L >= total * t) break;
out.push(pts[i]);
}
out.push([end.x, end.y]);
return out;
}
return { Model, SQUARE, sq, ellipse, bezier, arc, blade, PROFILES, roughen, lumpy, polygon, along, upTo };
})();
// src/visual/pixels.js
const __m17 = (() => {
class Pixels {
constructor(w, h) {
this.w = w;
this.h = h;
this.data = new Uint8ClampedArray(w * h * 4);
this.px = new Uint32Array(this.data.buffer);
}
get(x, y) {
return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x];
}
set(x, y, c) {
x |= 0; y |= 0;
if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
}
blend(x, y, c, a) {
x |= 0; y |= 0;
if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
const k = y * this.w + x, o = this.px[k];
if (a >= 1 || !(o >>> 24)) { if (a >= 1) this.px[k] = c; else if (!(o >>> 24)) this.px[k] = (c & 0xffffff) | (Math.round(a * 255) << 24) >>> 0; return; }
const r = (o & 255) + ((c & 255) - (o & 255)) * a, g = ((o >>> 8) & 255) + (((c >>> 8) & 255) - ((o >>> 8) & 255)) * a, b = ((o >>> 16) & 255) + (((c >>> 16) & 255) - ((o >>> 16) & 255)) * a;
this.px[k] = ((o & 0xff000000) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
}
rect(x, y, w, h, c) {
for (let j = Math.max(0, y | 0); j < Math.min(this.h, (y + h) | 0); j++) for (let i = Math.max(0, x | 0); i < Math.min(this.w, (x + w) | 0); i++) this.px[j * this.w + i] = c;
}
draw(src, x, y, flip = false) {
for (let j = 0; j < src.h; j++) {
const yy = y + j;
if (yy < 0 || yy >= this.h) continue;
for (let i = 0; i < src.w; i++) {
const c = src.px[j * src.w + (flip ? src.w - 1 - i : i)];
const a = c >>> 24;
if (!a) continue;
const xx = x + i;
if (xx < 0 || xx >= this.w) continue;
if (a === 255) this.px[yy * this.w + xx] = c; else this.blend(xx, yy, c | 0xff000000, a / 255);
}
}
}
mask() {
const m = new Uint8Array(this.w * this.h);
for (let k = 0; k < m.length; k++) m[k] = this.px[k] >>> 24 ? 1 : 0;
return m;
}
hash() {
let h = 2166136261 >>> 0;
for (let k = 0; k < this.px.length; k++) { h ^= this.px[k]; h = Math.imul(h, 16777619); }
return h >>> 0;
}
toCanvas() {
const cv = document.createElement('canvas');
cv.width = this.w; cv.height = this.h;
const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
if (this.w && this.h) ctx.putImageData(new ImageData(new Uint8ClampedArray(this.data), this.w, this.h), 0, 0);
return cv;
}
}
return { Pixels };
})();
// src/visual/noise.js
const __m18 = (() => {
function hash3(x, y, z, seed) {
let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1)) >>> 0;
h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
h ^= h >>> 15;
return (h >>> 0) / 4294967296;
}
const hash2 = (x, y, seed) => hash3(x, y, 0, seed);
const smooth = (t) => t * t * (3 - 2 * t);
function noise2(x, y, seed) {
const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
const a = hash3(xi, yi, 0, seed), b = hash3(xi + 1, yi, 0, seed), c = hash3(xi, yi + 1, 0, seed), d = hash3(xi + 1, yi + 1, 0, seed);
return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function noise1(x, seed) {
const xi = Math.floor(x), f = smooth(x - xi);
const a = hash3(xi, 0, 7, seed), b = hash3(xi + 1, 0, 7, seed);
return a + (b - a) * f;
}
function fbm2(x, y, seed, oct = 4) {
let v = 0, amp = 0.5, tot = 0;
for (let o = 0; o < oct; o++) {
v += noise2(x, y, seed + o * 101) * amp;
tot += amp;
x *= 2.03; y *= 2.03; amp *= 0.5;
}
return v / tot;
}
function fbm1(x, seed, oct = 4) {
let v = 0, amp = 0.5, tot = 0;
for (let o = 0; o < oct; o++) {
v += noise1(x, seed + o * 131) * amp;
tot += amp;
x *= 2.07; amp *= 0.5;
}
return v / tot;
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER4[(x & 3) + (y & 3) * 4] + 0.5) / 16;
return { hash3, hash2, noise2, noise1, fbm2, fbm1, bayer };
})();
// src/visual/style.js
const __m19 = (() => {
const { Pixels } = __m17;
const INK = 0xff1a1016;
const BANDS = [0.3, 0.6, 0.9, Infinity];
const AT = [0.1, 0.45, 0.78, 1];
function toneOf(n, l) {
let b = 0;
while (l >= BANDS[b]) b++;
return Math.round(AT[b] * (n - 1));
}
function materialTone(n, l, blot, h, g) {
const top = n - 1;
let i = l < 0.36 ? Math.round(top * 0.15) : l < 0.84 ? Math.round(top * 0.45) : Math.round(top * 0.85);
if (l >= 0.36 && l < 0.84 && blot > 0.56 && g > 0) i++;
if (g > 0 && h > 1 - 0.035 * g) i += 2;
else if (g > 0 && h < 0.03 * g) i -= 2;
return Math.max(0, Math.min(top, i));
}
function inked(src) {
const w = src.w + 2, h = src.h + 2, p = new Pixels(w, h);
const op = (x, y) => x >= 0 && y >= 0 && x < src.w && y < src.h && src.px[y * src.w + x] >>> 24;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
if (op(x - 1, y - 1)) continue;
if (op(x - 2, y - 1) || op(x, y - 1) || op(x - 1, y - 2) || op(x - 1, y)) p.px[y * w + x] = INK;
}
p.draw(src, 1, 1);
return p;
}
return { INK, toneOf, materialTone, inked };
})();
// src/visual/raster.js
const __m16 = (() => {
const { Pixels } = __m17;
const { noise2, hash2 } = __m18;
const { mixPacked } = __m2;
const { INK, materialTone, toneOf } = __m19;
const GRAIN = 2;
const L = (() => { const v = [-0.55, -0.72, 0.62], n = Math.hypot(...v); return v.map((x) => x / n); })();
function inside(x, y, pts) {
let c = false;
for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
}
return c;
}
let covBuf = new Int32Array(4096);
const xsBuf = [];
function covRoom(n) { if (n > covBuf.length) { const b = new Int32Array(Math.max(n, covBuf.length * 2)); b.set(covBuf); covBuf = b; } }
function spans(pts, w, h, y0, y1) {
const xs = xsBuf, n = pts.length;
let len = 0;
for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
const cy = y + 0.5;
xs.length = 0;
for (let i = 0, j = n - 1; i < n; j = i++) {
const yi = pts[i][1], yj = pts[j][1];
if ((yi > cy) !== (yj > cy)) xs.push(pts[i][0] + ((pts[j][0] - pts[i][0]) * (cy - yi)) / (yj - yi));
}
xs.sort((a, b) => a - b);
for (let k = 0; k + 1 < xs.length; k += 2) {
const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(w - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
covRoom(len + (xb - xa + 1) * 2 + 2);
for (let x = xa; x <= xb; x++) { covBuf[len++] = x; covBuf[len++] = y; }
}
}
return covBuf.subarray(0, len);
}
const S = { n: 0, mat: new Int16Array(0), lum: new Float32Array(0), tex: new Float32Array(0), idx: new Int8Array(0), sep: new Uint8Array(0) };
function grow(n) {
if (n <= S.n) return;
const m = Math.max(n, S.n * 2, 4096);
S.n = m; S.mat = new Int16Array(m); S.lum = new Float32Array(m); S.tex = new Float32Array(m); S.idx = new Int8Array(m); S.sep = new Uint8Array(m);
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lit = (nx, ny, nz) => clamp01(0.47 + 0.6 * (nx * L[0] + ny * L[1] + nz * L[2]));
function rasterize(model, w, h, pal, o = {}) {
if ((o.cell ?? 1) > 1) return coarse(model, w, h, pal, o);
const N = w * h, seed = o.seed ?? 1, texAmp = o.texture ?? 1, gr = Math.max(1, o.grain ?? GRAIN);
grow(N);
const mat = S.mat.subarray(0, N).fill(-1), lum = S.lum.subarray(0, N), tex = S.tex.subarray(0, N);
const part = new Int16Array(N).fill(-1);
const mats = [];
const matId = (/** @type {string} */ m) => { let k = mats.indexOf(m); if (k < 0) { k = mats.length; mats.push(m); } return k; };
const glow = [];
const parts = model.parts;
for (let pi = 0; pi < parts.length; pi++) {
const p = parts[pi], mi = matId(p.mat), tone = p.tone || 0, tx = p.tex ?? 1;
const put = (/** @type {number} */ k, /** @type {number} */ l) => { mat[k] = mi; part[k] = pi; lum[k] = clamp01(l + tone); tex[k] = tx; };
if (p.t === 'poly') {
const pts = /** @type {import('./geometry.js').Pt[]} */ (p.pts);
if (!pts || pts.length < 3) continue;
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
let cov = spans(pts, w, h, y0, y1);
if (!cov.length) {
const cx = Math.floor((x0 + x1) / 2), cy = Math.floor((y0 + y1) / 2);
if (cx >= 0 && cy >= 0 && cx < w && cy < h) cov = Int32Array.of(cx, cy); else continue;
}
const n = cov.length / 2;
let mx = 0, my = 0;
for (let i = 0; i < cov.length; i += 2) { mx += cov[i] + 0.5; my += cov[i + 1] + 0.5; }
mx /= n; my /= n;
let sxx = 0, syy = 0, sxy = 0;
for (let i = 0; i < cov.length; i += 2) { const dx = cov[i] + 0.5 - mx, dy = cov[i + 1] + 0.5 - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
sxx = sxx / n + 0.08; syy = syy / n + 0.08; sxy /= n;
const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), c = Math.cos(th), s = Math.sin(th);
const l1 = Math.max(0.1, sxx * c * c + 2 * sxy * c * s + syy * s * s), l2 = Math.max(0.1, sxx * s * s - 2 * sxy * c * s + syy * c * c);
const r1 = 2 * Math.sqrt(l1) + 0.3, r2 = 2 * Math.sqrt(l2) + 0.3;
const shade = p.shade || 'round';
const foldLit = Math.sign(-s * L[0] + c * L[1]) || 1;
for (let i = 0; i < cov.length; i += 2) {
const x = cov[i], y = cov[i + 1], k = y * w + x;
const dx = x + 0.5 - mx, dy = y + 0.5 - my, u = (dx * c + dy * s) / r1, v = (-dx * s + dy * c) / r2;
let l;
if (shade === 'flat') l = 0.55;
else if (shade === 'facet') l = p.lum ?? 0.55;
else if (shade === 'fold') l = (Math.sign(v) === foldLit ? 0.36 : 0.64) - u * 0.08 * (c * L[0] + s * L[1] < 0 ? -1 : 1) + (Math.abs(v) > 0.75 ? -0.05 : 0);
else {
const d2 = Math.min(0.98, u * u + v * v), nz = Math.sqrt(1 - d2);
const nx = u * c - v * s, ny = u * s + v * c;
l = lit(nx, ny, nz);
}
put(k, l);
if (p.glow) glow.push([x, y]);
}
} else if (p.t === 'stroke') {
const pts = /** @type {import('./geometry.js').Pt[]} */ (p.pts);
if (!pts || !pts.length) continue;
const ws = Array.isArray(p.w) ? p.w : pts.map(() => /** @type {number} */ (p.w || 1));
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, wm = 0;
for (let i = 0; i < pts.length; i++) { const [x, y] = pts[i]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); wm = Math.max(wm, ws[i] ?? ws[ws.length - 1]); }
const bx0 = Math.max(0, Math.floor(x0 - wm / 2 - 1)), by0 = Math.max(0, Math.floor(y0 - wm / 2 - 1));
const bw = Math.min(w - 1, Math.ceil(x1 + wm / 2 + 1)) - bx0 + 1, bh = Math.min(h - 1, Math.ceil(y1 + wm / 2 + 1)) - by0 + 1;
if (bw <= 0 || bh <= 0) continue;
const best = new Float32Array(bw * bh).fill(Infinity), nxs = new Float32Array(bw * bh), nys = new Float32Array(bw * bh);
const segs = Math.max(1, pts.length - 1);
for (let i = 0; i < segs; i++) {
const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)];
const wa = ws[i] ?? ws[ws.length - 1], wb = ws[Math.min(ws.length - 1, i + 1)] ?? ws[ws.length - 1];
const r = Math.max(wa, wb) / 2 + 1;
const vx = b[0] - a[0], vy = b[1] - a[1], ll = vx * vx + vy * vy, ang = Math.atan2(vy, vx), sa = -Math.sin(ang), ca = Math.cos(ang);
const sx0 = Math.max(bx0, Math.floor(Math.min(a[0], b[0]) - r)), sx1 = Math.min(bx0 + bw - 1, Math.ceil(Math.max(a[0], b[0]) + r));
const sy0 = Math.max(by0, Math.floor(Math.min(a[1], b[1]) - r)), sy1 = Math.min(by0 + bh - 1, Math.ceil(Math.max(a[1], b[1]) + r));
for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
const px = x + 0.5, py = y + 0.5;
const t = ll > 0 ? clamp01(((px - a[0]) * vx + (py - a[1]) * vy) / ll) : 0;
const qx = a[0] + vx * t - px, qy = a[1] + vy * t - py;
const hw = Math.max(0.5, (wa * (1 - t) + wb * t) / 2);
const d = Math.hypot(qx, qy) / hw, k = (y - by0) * bw + x - bx0;
if (d < best[k]) {
best[k] = d;
const side = (vx * -qy - vy * -qx) >= 0 ? 1 : -1, sN = Math.min(0.95, d) * side;
nxs[k] = sa * sN; nys[k] = ca * sN;
}
}
}
for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
const k = j * bw + i;
if (!(best[k] <= 1)) continue;
const nx = nxs[k], ny = nys[k], sN2 = nx * nx + ny * ny;
put((by0 + j) * w + bx0 + i, p.shade === 'flat' ? 0.55 : lit(nx, ny, Math.sqrt(Math.max(0, 1 - sN2))));
if (p.glow) glow.push([bx0 + i, by0 + j]);
}
} else if (p.t === 'line') {
const pts = /** @type {import('./geometry.js').Pt[]} */ (p.pts);
for (let i = 0; i < pts.length - 1 || (pts.length === 1 && i === 0); i++) {
const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)];
let x = Math.floor(a[0]), y = Math.floor(a[1]);
const xe = Math.floor(b[0]), ye = Math.floor(b[1]), dx = Math.abs(xe - x), dy = -Math.abs(ye - y), sx = x < xe ? 1 : -1, sy = y < ye ? 1 : -1;
let err = dx + dy;
for (let guard = 0; guard < 400; guard++) {
if (x >= 0 && y >= 0 && x < w && y < h) {
const k = y * w + x;
if (!p.clip || mat[k] >= 0) { mat[k] = mi; part[k] = pi; lum[k] = clamp01((p.lum ?? (mat[k] >= 0 ? lum[k] : 0.5)) + tone); tex[k] = 0; if (p.glow) glow.push([x, y]); }
}
if (x === xe && y === ye) break;
const e2 = 2 * err;
if (e2 >= dy) { err += dy; x += sx; }
if (e2 <= dx) { err += dx; y += sy; }
}
if (pts.length === 1) break;
}
} else if (p.t === 'dot') {
const x = Math.floor(/** @type {number} */ (p.x)), y = Math.floor(/** @type {number} */ (p.y));
if (x < 0 || y < 0 || x >= w || y >= h) continue;
const k = y * w + x;
if (p.clip && mat[k] < 0) continue;
mat[k] = mi; part[k] = pi; lum[k] = clamp01((p.lum ?? (lum[k] || 0.5)) + tone); tex[k] = 0;
if (p.glow) glow.push([x, y]);
}
}
const idx = S.idx.subarray(0, N).fill(-1);
const ramps = mats.map((m) => pal[m] || pal.default || [0xff808080]);
for (let y = 0; y < h; y++) {
for (let x = 0; x < w; x++) {
const k = y * w + x, mi = mat[k];
if (mi < 0) continue;
const g = tex[k] * texAmp, gx = Math.floor(x / gr), gy = Math.floor(y / gr);
const st = parts[part[k]].step;
idx[k] = st !== undefined ? Math.max(0, Math.min(ramps[mi].length - 1, Math.round(st * (ramps[mi].length - 1))))
: materialTone(ramps[mi].length, lum[k], g > 0 ? noise2(gx / (3.5 / gr), gy / (3.5 / gr), seed + mi * 977) : 0, g > 0 ? hash2(gx, gy, seed + mi * 31) : 0.5, g);
}
}
const flat = (/** @type {number} */ pi) => parts[pi].t === 'line' || parts[pi].t === 'dot';
const sep = S.sep.subarray(0, N).fill(0);
for (let y = 0; y < h; y++) {
for (let x = 0; x < w; x++) {
const k = y * w + x, a = part[k];
if (a < 0 || flat(a)) continue;
for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
const xx = x + dx, yy = y + dy;
if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
const b = part[yy * w + xx];
if (b > a && !flat(b) && !parts[b].noOutline && !parts[b].soft) { sep[k] = 1; break; }
}
}
}
const pix = new Pixels(w, h);
const outline = o.outline !== false;
for (let y = 0; y < h; y++) {
for (let x = 0; x < w; x++) {
const k = y * w + x, mi = mat[k];
if (mi < 0) continue;
const r = ramps[mi];
let i = idx[k];
if (sep[k]) i = toneOf(r.length, 0);
let c = r[i];
const pp = parts[part[k]];
if (!pp.noOutline && !flat(part[k])) {
const up = y === 0 || mat[k - w] < 0, left = x === 0 || mat[k - 1] < 0, down = y === h - 1 || mat[k + w] < 0, right = x === w - 1 || mat[k + 1] < 0;
if (up && !sep[k]) c = r[Math.min(r.length - 1, Math.max(i + 2, Math.round((r.length - 1) * 0.8)))];
else if (outline && (down || left || right)) c = mixPacked(r[0], INK, 0.55);
}
pix.px[k] = c;
}
}
const glints = model.glints.map(([x, y]) => [Math.floor(x), Math.floor(y)]).filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h && mat[y * w + x] >= 0);
return { pix, part, glints: glints.concat(glow.filter((_, i) => i % 3 === 0)) };
}
function coarse(model, w, h, pal, o) {
const c = Math.round(o.cell), cw = Math.ceil(w / c), ch = Math.ceil(h / c);
const m = model.clone().transform(1 / c, 0, 0, 1 / c, 0, 0, 1 / c);
const r = rasterize(m, cw, ch, pal, { ...o, cell: 1, grain: 1 });
const pix = new Pixels(w, h), part = new Int16Array(w * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
const s = Math.floor(y / c) * cw + Math.floor(x / c), k = y * w + x;
pix.px[k] = r.pix.px[s]; part[k] = r.part[s];
}
return { pix, part, glints: r.glints.map(([x, y]) => [x * c + (c >> 1), y * c + (c >> 1)]) };
}
return { GRAIN, rasterize };
})();
// src/studio/pixels.js
const __m20 = (() => {
const { Pixels } = __m17;
const { hex, pack } = __m2;
const colorWord = (color) => pack(hex(color));
const wordColor = (c) => '#' + [c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((n) => n.toString(16).padStart(2, '0')).join('');
function line(x0, y0, x1, y1, put) {
x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
let err = dx + dy;
for (;;) { put(x0, y0); if (x0 === x1 && y0 === y1) break; const e = err * 2; if (e >= dy) { err += dy; x0 += sx; } if (e <= dx) { err += dx; y0 += sy; } }
}
function region(pixels, w, h, x, y) {
if (x < 0 || y < 0 || x >= w || y >= h) return [];
const seed = y * w + x, target = pixels[seed], seen = new Uint8Array(w * h), stack = [seed], out = [];
seen[seed] = 1;
while (stack.length) {
const i = stack.pop(); out.push(i); const xx = i % w, yy = Math.floor(i / w);
for (const [a, b] of [[xx - 1, yy], [xx + 1, yy], [xx, yy - 1], [xx, yy + 1]]) {
const j = b * w + a;
if (a >= 0 && b >= 0 && a < w && b < h && !seen[j] && pixels[j] === target) { seen[j] = 1; stack.push(j); }
}
}
return out;
}
function inPolygon(x, y, pts) {
let inside = false;
for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
const a = pts[i], b = pts[j];
if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
}
return inside;
}
function composite(base, layers, stage, variant) {
const out = new Pixels(base.w, base.h); out.px.set(base.px);
for (const l of layers) {
if (!l.visible || l.scope === 'stage' && l.stage !== stage || l.scope === 'variant' && l.variant !== variant) continue;
for (let i = 0; i < out.px.length; i++) {
const c = l.pixels[i]; if (!c) continue;
const alpha = (c === -1 ? 1 : (c >>> 24) / 255) * l.opacity;
const old = out.px[i], oa = (old >>> 24) / 255;
if (c === -1) { out.px[i] = alpha >= 1 ? 0 : ((old & 0xffffff) | (Math.round(oa * (1 - alpha) * 255) << 24)) >>> 0; continue; }
const a = alpha + oa * (1 - alpha);
let word = Math.round(a * 255) << 24;
for (let k = 0; k < 3; k++) word |= Math.round((((c >>> (k * 8)) & 255) * alpha + ((old >>> (k * 8)) & 255) * oa * (1 - alpha)) / (a || 1)) << (k * 8);
out.px[i] = word >>> 0;
}
}
return out;
}
function transformed(src, angle = 0, scale = 1, flip = false) {
const out = new Pixels(src.w, src.h), r = angle * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), cx = src.w / 2, cy = src.h / 2;
for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
let u = ((x + 0.5 - cx) * c + (y + 0.5 - cy) * s) / scale;
const v = (-(x + 0.5 - cx) * s + (y + 0.5 - cy) * c) / scale;
if (flip) u = -u;
out.set(x, y, src.get(Math.floor(u + cx), Math.floor(v + cy)));
}
return out;
}
function validatePNGHeader(bytes) {
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
if (bytes.length < 24 || !signature.every((v, i) => bytes[i] === v) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error('Not a valid PNG header');
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), w = view.getUint32(16), h = view.getUint32(20);
if (!w || !h || w > 4096 || h > 4096) throw new Error('PNG dimensions must be between 1 and 4096 pixels');
return { w, h };
}
return { colorWord, wordColor, line, region, inPolygon, composite, transformed, validatePNGHeader };
})();
// src/studio/engine.js
const __m14 = (() => {
const { Rng, hashString } = __m10;
const { Model } = __m15;
const { rasterize } = __m16;
const { ramp, hex } = __m2;
const { Pixels } = __m17;
const { composite } = __m20;
function componentPixels(component, stage = 2, variant = 0) {
const m = new Model();
const pal = {};
for (const [i, g] of component.geometry.entries()) {
const x = g.x, y = g.y, w = g.width / 2, h = g.height / 2, mat = 'g' + i;
const prng = new Rng(`${variant}:palette:${component.id}:${i}`);
const color = hex(g.color).map((v) => Math.max(0, Math.min(1, v + (prng.next() - 0.5) * (component.paletteVariation || 0) * 0.2)));
pal[mat] = ramp(color);
let pts;
if (g.shape === 'polygon') {
const rng = new Rng(`${variant}:morph:${component.id}:${i}`);
m.poly(g.points.map(([x, y]) => [g.x + (x - 16) * g.width / 32, g.y + (y - 16) * g.height / 32]), mat, { tone: ((component.lighting ?? 1) - 1) * 0.4, tex: component.texture ?? 1 }); continue;
}
if (g.shape === 'stem') { m.stroke([[x, y + h], [x - 1, y], [x, y - h]], Math.max(1, w / 2), mat); continue; }
if (g.shape === 'leaf') pts = [[x, y + h], [x - w, y + h / 3], [x - w * 0.7, y - h / 2], [x, y - h], [x + w, y - h / 3], [x + w * 0.6, y + h / 2]];
else if (g.shape === 'crystal') pts = [[x - w, y + h], [x - w, y - h / 2], [x, y - h], [x + w, y - h / 2], [x + w * 0.7, y + h]];
else if (g.shape === 'ellipse') pts = Array.from({ length: 24 }, (_, j) => [x + Math.cos(j / 12 * Math.PI) * w, y + Math.sin(j / 12 * Math.PI) * h]);
else pts = [[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]];
m.poly(pts, mat, { shade: g.shape === 'crystal' ? 'facet' : 'round', lum: 0.7 });
}
const morphology = new Rng(`${variant}:morph:${component.id}`);
for (const part of m.parts) {
if (part.pts && component.irregularity) part.pts = part.pts.map(([x, y]) => [x + morphology.range(-1, 1) * component.irregularity, y + morphology.range(-1, 1) * component.irregularity]);
if (part.tone === undefined) part.tone = ((component.lighting ?? 1) - 1) * 0.4;
}
const base = rasterize(m, 32, 32, pal, { seed: hashString(component.id + ':surface'), texture: component.texture ?? 1 }).pix;
return composite(base, component.layers, stage, variant);
}
const transform = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const multiply = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
function generate(asset, seed = asset.seed, stage = 2) {
const pix = new Pixels(asset.width, asset.height), owners = new Int16Array(pix.px.length).fill(-1), instances = [], warnings = [];
const byParent = new Map();
for (const n of asset.nodes) { if (!byParent.has(n.parent)) byParent.set(n.parent, []); byParent.get(n.parent).push(n); }
const sprites = new Map(); let emitted = 0;
const visit = (parent, matrix, path, depth) => {
if (depth > 32) { warnings.push('Hierarchy depth limit reached'); return; }
const children = byParent.get(parent) || [], chosen = new Map();
for (const n of children) if (n.choice && !chosen.has(n.choice)) {
const group = children.filter((c) => c.choice === n.choice && stage >= c.minStage && stage <= c.maxStage);
const rng = new Rng(`${seed}:choice:${path}:${n.choice}`);
if (group.reduce((s, g) => s + g.weight, 0) > 0) chosen.set(n.choice, rng.weighted(group, group.map((g) => g.weight)).id);
}
for (const n of children) {
if (stage < n.minStage || stage > n.maxStage || n.choice && chosen.get(n.choice) !== n.id) continue;
const c = asset.components.find((p) => p.id === n.component); if (!c) continue;
if (!sprites.has(c.id)) sprites.set(c.id, componentPixels(c, stage, seed));
const sprite = sprites.get(c.id);
for (let i = 0; i < n.count; i++) {
if (++emitted > 512) { warnings.push('512 instance limit reached'); return; }
const key = `${path}/${n.id}:${i}`, rng = new Rng(`${n.locked ? n.lockSeed : seed}:morph:${key}`);
if (rng.next() >= n.probability) continue;
const growth = asset.stages[stage], r = (n.angle + rng.range(-n.jitter, n.jitter)) * Math.PI / 180;
const s = n.scale * (n.locked ? 1 : growth), flip = n.mirror && i % 2 ? -1 : 1;
const m = multiply(matrix, [Math.cos(r) * s * flip, Math.sin(r) * s * flip, -Math.sin(r) * s, Math.cos(r) * s, n.x + (i - (n.count - 1) / 2) * n.spread, n.y]);
const paint = multiply(m, [1, 0, 0, 1, -c.anchor[0], -c.anchor[1]]);
const det = paint[0] * paint[3] - paint[1] * paint[2];
const cells = [];
const corners = [[0, 0], [32, 0], [32, 32], [0, 32]].map(([x, y]) => transform(paint, x, y));
const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0])))), x1 = Math.min(pix.w, Math.ceil(Math.max(...corners.map((p) => p[0]))));
const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1])))), y1 = Math.min(pix.h, Math.ceil(Math.max(...corners.map((p) => p[1]))));
for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
const dx = x + 0.5 - paint[4], dy = y + 0.5 - paint[5];
const col = sprite.get(Math.floor((paint[3] * dx - paint[2] * dy) / det), Math.floor((-paint[1] * dx + paint[0] * dy) / det));
if (col >>> 24) cells.push([y * pix.w + x, col]);
}
if (n.avoidOverlap && cells.some(([k]) => pix.px[k] >>> 24)) continue;
const index = instances.length;
for (const [k, col] of cells) { pix.px[k] = col; owners[k] = index; }
instances.push({ node: n.id, component: c.id, matrix: paint, parentMatrix: matrix.slice(), path: key, pixels: cells.length });
const at = n.anchor === 'tip' ? c.tip : c.anchor;
const endpoint = transform(paint, at[0], at[1]);
visit(n.id, [m[0], m[1], m[2], m[3], endpoint[0], endpoint[1]], key, depth + 1);
}
}
};
visit('', [1, 0, 0, 1, 0, 0], '', 0);
return { pix, owners, instances, warnings: [...new Set(warnings)] };
}
return { componentPixels, generate };
})();
// src/studio/asset-runtime.js
const __m21 = (() => {
const { artDomain, artAssets, artRevision } = __m1;
const { generate } = __m14;
const { Pixels } = __m17;
const cache = new Map();
function fitPixels(src, width, height) {
const out = new Pixels(width, height);
let x0 = src.w, y0 = src.h, x1 = 0, y1 = 0;
for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.get(x, y) >>> 24) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
if (x0 >= x1) return out;
const scale = Math.min((width - 2) / (x1 - x0), (height - 2) / (y1 - y0)), ox = (width - (x1 - x0) * scale) / 2, oy = height - 1 - (y1 - y0) * scale;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.set(x, y, src.get(x0 + Math.floor((x - ox) / scale), y0 + Math.floor((y - oy) / scale)));
return out;
}
function boundPixels(key, seed, stage, width, height) {
const id = artDomain('ingredients', key)?.asset;
return id ? assetPixels(id, seed, stage, width, height) : null;
}
function assetPixels(id, seed, stage, width = 32, height = 32) {
const asset = artAssets().find((a) => a.id === id); if (!asset) return null;
const key = `${artRevision()}:${id}:${seed}:${stage}:${width}:${height}`;
if (cache.has(key)) return cache.get(key);
const out = fitPixels(generate(asset, seed, stage).pix, width, height);
if (cache.size > 160) cache.clear(); cache.set(key, out); return out;
}
return { fitPixels, boundPixels, assetPixels };
})();
// src/studio/environment-runtime.js
const __m13 = (() => {
const { artDomain, artAssets } = __m1;
const { generate } = __m14;
const { fitPixels } = __m21;
const { hex, pack, mixPacked } = __m2;
const { hashString } = __m10;
function directEnvironment(cv, region, seed) {
const cfg = artDomain('environments', region); if (!cfg) return;
const W = cv.W, H = cv.H;
const touched = new Uint8Array(W * H);
for (const stroke of cfg.strokes) for (const [cx, cy] of stroke.points) {
for (let y = Math.max(0, Math.floor(cy - stroke.radius)); y <= Math.min(H - 1, cy + stroke.radius); y++) for (let x = Math.max(0, Math.floor(cx - stroke.radius)); x <= Math.min(W - 1, cx + stroke.radius); x++) {
if ((x - cx) ** 2 + (y - cy) ** 2 > stroke.radius ** 2) continue;
const k = y * W + x, erase = stroke.kind === 'erase', liquid = stroke.kind === 'water' || stroke.kind === 'lava';
touched[k] = 1; cv.solid[k] = erase || liquid ? 0 : 1; cv.liquid[k] = liquid ? 1 : 0;
cv.cave[k] = erase ? 1 : 0; cv.stratum[k] = stroke.kind === 'soil' ? 1 : 0;
cv.rock[k] = stroke.kind === 'rock' ? 1 : 0; cv.props[k] = 0; cv.trees[k] = 0; cv.grass[k] = 0; cv.depth[k] = erase || liquid ? 0 : y + 1;
const noise = ((Math.imul(x + y * W, 2654435761) >>> 0) % 17) / 255;
const rgb = erase ? hex(cfg.tint) : hex(stroke.color).map((v) => Math.min(1, v + noise));
cv.paint(k, pack(rgb));
}
}
if (cfg.strokes.length) for (let y = 1; y < H - 2; y++) for (let x = 1; x < W - 1; x++) {
const k = y * W + x;
cv.open[k] = !cv.solid[k] && !cv.liquid[k] && !cv.rock[k] && !cv.trees[k] && !cv.props[k] && cv.solid[k + W] && !cv.liquid[k + W] ? 1 : 0;
if (cv.open[k]) cv.grass[k] = 1;
}
const warnings = [];
for (const o of cfg.objects) {
const asset = artAssets().find((a) => a.id === o.asset); if (!asset) continue;
const size = Math.max(8, Math.round(64 * o.scale)), image = fitPixels(generate(asset, o.locked ? o.seed : (o.seed ^ hashString(seed)) >>> 0, 2).pix, size, size);
let foot = -1;
for (let delta = 0; delta < H; delta++) for (const y of [Math.round(o.y) + delta, Math.round(o.y) - delta]) {
if (foot >= 0 || y < size || y >= H - 2) continue;
const x0 = Math.round(o.x - size / 2); let valid = !!cv.open[y * W + Math.round(o.x)];
if (!valid) continue;
for (let iy = 0; valid && iy < size; iy++) for (let ix = 0; ix < size; ix++) if (image.get(ix, iy) >>> 24) {
const x = x0 + ix, yy = y - size + 1 + iy, k = yy * W + x;
if (x < 1 || x >= W - 1 || cv.solid[k] || cv.liquid[k] || cv.rock[k] || cv.props[k]) { valid = false; break; }
}
if (valid) foot = y;
}
if (foot < 0) { warnings.push('No free attachment surface for ' + asset.name); continue; }
const claim = ++cv.nprops;
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
const col = image.get(x, y); if (!(col >>> 24)) continue;
const k = (foot - size + 1 + y) * W + Math.round(o.x - size / 2) + x;
cv.paint(k, col); cv.props[k] = claim; cv.trees[k] = 1; cv.depth[k] = foot; cv.open[k] = 0;
}
}
const tint = pack(hex(cfg.tint));
if (cfg.mix || cfg.light !== 1) for (let k = 0; k < cv.pix.px.length; k++) {
const c = mixPacked(cv.pix.px[k], tint, cfg.mix);
cv.paint(k, pack([c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((v) => v / 255 * cfg.light)));
}
for (const l of cfg.lights || []) cv.pending.push([l.x, l.y, l.radius, hex(l.color), l.strength]);
cv.meta.artWarnings = warnings; cv.meta.artAtmosphere = cfg.atmosphere;
}
return { directEnvironment };
})();
// src/visual/env/paint.js
const __m22 = (() => {
const { Pixels } = __m17;
const { rasterize } = __m16;
const { Model } = __m15;
const { ramp, hex, mixPacked, pack, unpack } = __m2;
const SCENE_W = 384;
const SCENE_H = 216;
const CELL = 1;
class Canvas {
constructor(seed, w = SCENE_W, h = SCENE_H) {
this.W = w; this.H = h;
const N = w * h;
this.pix = new Pixels(w, h);
this.open = new Uint8Array(N);
this.depth = new Uint16Array(N);
this.solid = new Uint8Array(N);
this.liquid = new Uint8Array(N);
this.grass = new Uint8Array(N);
this.stratum = new Uint8Array(N);
this.cave = new Uint8Array(N);
this.rock = new Uint8Array(N);
this.trees = new Uint8Array(N);
this.props = new Uint16Array(N);
this.nprops = 0;
this.things = new Uint8Array(N);
this.ground = null;
this.seed = seed >>> 0;
this.meta = /** @type {Record<string, any>} */ ({});
this.pending = [];
this.sw = null;
}
set(x, y, c) {
this.pix.set(x, y, c);
const s = this.sw;
x |= 0; y |= 0;
if (s && x >= 0 && y >= 0 && x < this.W && y < this.H) { const k = y * this.W + x; s.bare[k] = c; s.layer[k] = ++s.seq; }
}
paint(k, c) {
this.pix.px[k] = c;
const s = this.sw;
if (s) { s.bare[k] = c; s.layer[k] = ++s.seq; }
}
swayStart() {
if (!this.sw) this.sw = { bare: this.pix.px.slice(), layer: new Uint32Array(this.W * this.H), seq: 0, k: [], c: [], s: [], g: [], amp: [], hang: [], gx: [], gn: [], y0: [], y1: [], far: [] };
return this.sw;
}
swayGroup(amp, hang = 0, far = false) {
const s = this.swayStart();
s.far.push(far ? 1 : 0);
s.amp.push(amp); s.hang.push(hang); s.gx.push(0); s.gn.push(0); s.y0.push(this.H); s.y1.push(0);
return s.amp.length - 1;
}
swaySet(x, y, c, g, seq) {
x |= 0; y |= 0;
if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
const s = this.swayStart(), k = y * this.W + x;
this.pix.px[k] = c;
s.k.push(k); s.c.push(c); s.s.push(seq ?? ++s.seq); s.g.push(g);
s.gx[g] += x; s.gn[g]++;
if (y < s.y0[g]) s.y0[g] = y;
if (y > s.y1[g]) s.y1[g] = y;
}
block(x0, y0, x1, y1, v = 0) {
for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.H, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.W, Math.ceil(x1)); x++) this.open[y * this.W + x] = v;
}
blockEllipse(cx, cy, rx, ry) {
for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
if (x < 0 || y < 0 || x >= this.W || y >= this.H) continue;
if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.open[y * this.W + x] = 0;
}
}
stamp(model, pal, x, y, o = {}) {
const r = this.raster(model, pal, o);
if (!r) return null;
const X = Math.round(x) + r.left, Y = Math.round(y) + r.top;
if (o.test && !o.test(r.raster.pix, X, Y)) return null;
return this.put(r, x, y, o);
}
raster(model, pal, o = {}) {
const b = model.bounds(), cell = o.cell ?? CELL, mod = (v) => ((v % cell) + cell) % cell;
let left = Math.floor(b.x0) - 1, top = Math.floor(b.y0) - 1;
left -= mod(left); top -= mod(top);
let w = Math.ceil(b.x1) + 2 - left, h = Math.ceil(b.y1) + 2 - top;
w += mod(-w); h += mod(-h);
if (w <= 0 || h <= 0 || w > 2000 || h > 2000) return null;
model.transform(1, 0, 0, 1, -left, -top, 1);
const ro = { seed: o.seed ?? this.seed, outline: o.outline, texture: o.texture, cell, grain: cell };
const r = rasterize(model, w, h, pal, ro);
tint(r.pix, o);
return { raster: r, left, top, w, h, model, pal, ro, tint: { haze: o.haze, dark: o.dark } };
}
put(r, x, y, o = {}) {
const p = r.raster.pix, w = r.w, h = r.h, X = Math.round(x) + r.left, Y = Math.round(y) + r.top;
const parts = r.model ? r.model.parts : [], sways = o.sway !== 0 && parts.some((q) => q.sa !== undefined);
if (sways || this.sw) this.putSway(r, X, Y, sways ? o.sway ?? 1 : 0, !!o.haze);
else this.pix.draw(p, X, Y);
if (o.roots) this.blockEllipse(Math.round(x), Math.round(y) - 1, o.roots[0], o.roots[1]);
if (o.foot) this.blockEllipse(Math.round(x), Math.round(y), o.foot[0], o.foot[1]);
const fy = Math.round(y), id = o.claim ?? 0;
for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
if (!(p.px[j * w + i] >>> 24)) continue;
const xx = X + i, yy = Y + j;
if (xx < 0 || yy < 0 || xx >= this.W || yy >= this.H) continue;
const k = yy * this.W + xx;
if (id) { this.props[k] = id; this.things[k] = 1; }
if (!o.foot) continue;
if (fy > this.depth[k]) this.depth[k] = fy;
this.open[k] = 0;
}
return { x: X, y: Y, w, h, raster: r.raster };
}
putSway(r, X, Y, mult, far = false) {
const p = r.raster.pix, part = r.raster.part, w = r.w, h = r.h, W = this.W, px = this.pix.px;
const s = this.swayStart(), seq = ++s.seq, parts = r.model ? r.model.parts : [];
let under = null;
if (mult) {
const bm = new Model();
bm.parts = parts.filter((q) => q.sa === undefined);
under = rasterize(bm, w, h, r.pal, r.ro).pix;
tint(under, r.tint);
}
const leafy = new Uint8Array(w * h);
if (mult) for (let k = 0; k < w * h; k++) { const q = part && part[k] >= 0 ? parts[part[k]] : null; if (p.px[k] >>> 24 && q && q.sa !== undefined) leafy[k] = 1; }
const inside = (/** @type {number} */ i, /** @type {number} */ j) => {
for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
const ii = i + a, jj = j + b;
if (ii < 0 || jj < 0 || ii >= w || jj >= h || !leafy[jj * w + ii]) return false;
}
return true;
};
const groups = new Map();
for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
let c = p.px[j * w + i];
const a = c >>> 24, xx = X + i, yy = Y + j;
if (!a || xx < 0 || yy < 0 || xx >= W || yy >= this.H) continue;
const k = yy * W + xx;
if (a < 255) c = mixPacked(px[k] | 0xff000000, c | 0xff000000, a / 255);
const q = part ? parts[part[j * w + i]] : null;
if (mult && q && q.sa !== undefined) {
const key = q.sg ?? 0;
let g = groups.get(key);
if (g === undefined) { g = this.swayGroup(q.sa * mult, (q.sh || 0) * mult, far); groups.set(key, g); }
const u = /** @type {any} */ (under).px[j * w + i];
if (u >>> 24) { s.bare[k] = u; s.layer[k] = seq; }
else if (inside(i, j)) { s.bare[k] = mixPacked(c, 0xff000000, 0.5); s.layer[k] = seq; }
this.swaySet(xx, yy, c, g, seq);
} else { px[k] = c; s.bare[k] = c; s.layer[k] = seq; }
}
}
swayData() {
const s = this.sw;
if (!s || !s.k.length) return null;
const n = s.k.length, f = new Float32Array(n), home = new Uint8Array(this.W * this.H);
for (let i = 0; i < n; i++) home[s.k[i]] = 1;
for (let k = 0; k < home.length; k++) if (!home[k]) s.bare[k] = this.pix.px[k];
for (let i = 0; i < n; i++) { const g = s.g[i], y = Math.floor(s.k[i] / this.W); f[i] = s.hang[g] ? (y - s.y0[g]) / Math.max(1, s.y1[g] - s.y0[g]) : 0; }
return {
bare: s.bare, layer: s.layer, k: Int32Array.from(s.k), c: Uint32Array.from(s.c), s: Uint32Array.from(s.s), g: Int32Array.from(s.g), f,
amp: Float32Array.from(s.amp), hang: Float32Array.from(s.hang), far: Uint8Array.from(s.far), gx: Float32Array.from(s.gx, (v, g) => v / Math.max(1, s.gn[g])), gy: Float32Array.from(s.y0),
};
}
each(f, op, y0 = 0, y1 = this.H) {
const W = this.W, px = this.pix.px, s = this.sw, a = Math.max(0, y0), b = Math.min(this.H, y1);
for (let y = a; y < b; y++) for (let x = 0; x < W; x++) {
const t = f(x, y);
if (t <= 0.004) continue;
const k = y * W + x;
px[k] = op(px[k], t);
if (s) s.bare[k] = op(s.bare[k], t);
}
if (s) for (let i = 0; i < s.k.length; i++) {
const y = Math.floor(s.k[i] / W);
if (y < a || y >= b) continue;
const t = f(s.k[i] - y * W, y);
if (t > 0.004) s.c[i] = op(s.c[i], t);
}
}
place(model, pal, x, o = {}) {
const r = this.raster(model, pal, o);
if (!r) return null;
const W = this.W, H = this.H, p = r.raster.pix, sink = o.sink ?? 1, range = o.range ?? 40, step = o.step ?? 3;
const [xa, xb] = o.x || [2, W - 3], id = o.group ?? ++this.nprops;
const base = [];
for (let i = 0; i < r.w; i++) for (let j = r.h - 1; j >= 0; j--) if (p.px[j * r.w + i] >>> 24) { base.push([i, j]); break; }
const bottom = Math.max(...base.map(([, j]) => j)), low = base.filter(([, j]) => j >= bottom - 3);
const surfaceAt = (/** @type {number} */ cx) => {
if (cx < 0 || cx >= W) return -1;
if (o.y === undefined) return this.ground ? Math.round(this.ground[cx]) : -1;
for (let d = 0; d <= 6; d++) for (const yy of [o.y + d, o.y - d]) {
const k = yy * W + cx;
if (yy > 0 && yy < H && this.solid[k] && !this.solid[k - W]) return yy;
}
return -1;
};
const surface = (/** @type {number} */ cx) => {
let top = H;
for (const [i] of low) { const y = surfaceAt(cx + r.left + i); if (y >= 0) top = Math.min(top, y); }
return top < H ? top : -1;
};
const fits = (/** @type {number} */ cx, /** @type {number} */ fy) => {
const X = cx + r.left, Y = fy + r.top;
for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
if (!(p.px[j * r.w + i] >>> 24)) continue;
const xx = X + i, yy = Y + j;
if (xx < 0 || xx >= W || yy < 1) return false;
if (yy >= H) continue;
const k = yy * W + xx;
if (this.rock[k] || this.liquid[k] || this.trees[k] || (this.props[k] && this.props[k] !== id)) return false;
if (this.solid[k] && yy < fy - sink) return false;
}
for (const [i, j] of low) {
const xx = X + i, yy = Math.max(Y + j, fy - sink);
let under = false;
for (let d = 0; d <= 4 && !under; d++) { const k = (yy + d) * W + xx; under = yy + d < H && !!this.solid[k] && !this.liquid[k]; }
if (!under) return false;
}
return true;
};
for (let d = 0; d <= range; d += step) for (const s of d ? [1, -1] : [1]) {
const cx = Math.round(x) + s * d;
if (cx < xa || cx > xb) continue;
const fy0 = surface(cx);
if (fy0 < 0) continue;
const fy = fy0 + sink;
if (!o.free && !fits(cx, fy)) continue;
return { ...this.put(r, cx, fy, { ...o, claim: id }), fx: cx, fy };
}
return null;
}
clear(x0, y0, x1, y1) {
for (let y = Math.max(0, y0); y <= Math.min(this.H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.W - 1, x1); x++) {
const k = y * this.W + x;
if (this.solid[k] || this.rock[k] || this.liquid[k] || this.trees[k] || this.props[k]) return false;
}
return x0 >= 0 && y0 >= 0 && x1 < this.W && y1 < this.H;
}
setThing(x, y, c) {
this.set(x, y, c);
x = Math.round(x); y = Math.round(y);
if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.things[y * this.W + x] = 1;
}
claim(x0, y0, x1, y1) {
const id = ++this.nprops;
for (let y = Math.max(0, y0); y <= Math.min(this.H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.W - 1, x1); x++) {
const k = y * this.W + x;
if (!this.solid[k]) this.props[k] = id;
}
}
glow(x, y, r, rgb, k) {
this.pending.push([x, y, r, rgb, k]);
(this.meta.lights ||= []).push([Math.round(x), Math.round(y), r, rgb]);
}
wash(c, f, y0 = 0, y1 = this.H) {
this.each(f, (q, t) => mixPacked(q, c, Math.min(1, t)), y0, y1);
}
light(rgb, f, y0 = 0, y1 = this.H) {
this.each(f, (c, t) => {
const r = Math.min(255, (c & 255) + rgb[0] * 255 * t), g = Math.min(255, ((c >>> 8) & 255) + rgb[1] * 255 * t), b = Math.min(255, ((c >>> 16) & 255) + rgb[2] * 255 * t);
return ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
}, y0, y1);
}
}
function tint(p, o) {
if (o.haze || o.dark) for (let k = 0; k < p.px.length; k++) {
const c = p.px[k];
if (!(c >>> 24)) continue;
let q = c;
if (o.haze) q = mixPacked(q, o.haze[0], o.haze[1]);
if (o.dark) q = mixPacked(q, 0xff000000, o.dark);
p.px[k] = q;
}
}
function sky(cv, y0, y1, stops, _bands) {
const cols = stops.map(hex);
const at = (t) => {
const f = Math.min(cols.length - 1.0001, Math.max(0, t) * (cols.length - 1)), i = Math.floor(f), u = f - i;
return cols[i].map((v, k) => v + (cols[i + 1][k] - v) * u);
};
const B = [0, 0.5, 0.125, 0.625, 0.75, 0.25, 0.875, 0.375];
for (let y = y0; y < y1; y++) {
const c = at(Math.pow((y - y0) / Math.max(1, y1 - y0 - 1), 0.9));
for (let x = 0; x < cv.W; x++) {
const d = (B[(x & 3) + ((y & 1) << 2)] - 0.5) / 255;
cv.set(x, y, pack([c[0] + d, c[1] + d, c[2] + d]));
}
}
}
return { SCENE_W, SCENE_H, CELL, Canvas, sky, ramp, hex, mixPacked, pack, unpack };
})();
// src/visual/env/stone.js
const __m25 = (() => {
const { hash2, noise2 } = __m18;
const { mixPacked } = __m2;
function cobble(x, y, o) {
if (o.round) return pebble(x, y, o);
const s = o.s, gx = Math.floor(x / s), gy = Math.floor(y / s), fl = o.flat ?? 1.3;
let d1 = 1e9, d2 = 1e9, bx = 0, by = 0, id = 0;
for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
const cx = gx + i, cy = gy + j;
const px = (cx + 0.15 + hash2(cx, cy, o.seed) * 0.7) * s, py = (cy + 0.15 + hash2(cx, cy, o.seed + 1) * 0.7) * s;
const dx = x + 0.5 - px, dy = (y + 0.5 - py) * fl, d = dx * dx + dy * dy;
if (d < d1) { d2 = d1; d1 = d; bx = dx; by = dy / fl; id = cx * 7919 + cy * 104729; }
else if (d < d2) d2 = d;
}
const edge = Math.sqrt(d2) - Math.sqrt(d1);
if (edge < 0.9) return o.mortar;
let c = o.stones[Math.floor(hash2(id, 3, o.seed) * o.stones.length)];
const r = s * 0.5, lit = -((bx / r) * 0.55 + (by / r) * 0.85);
if (edge < 1.7 && by > -r * 0.2) c = mixPacked(c, 0xff000000, 0.32);
else if (lit > 0.6) c = mixPacked(c, 0xffffffff, 0.24);
else if (lit > 0.22) c = mixPacked(c, 0xffffffff, 0.11);
else if (lit < -0.5) c = mixPacked(c, 0xff000000, 0.24);
else if (lit < -0.15) c = mixPacked(c, 0xff000000, 0.1);
const g = hash2(x, y, o.seed + 9);
if (g > 0.993) c = mixPacked(c, 0xffffffff, 0.12); else if (g < 0.007) c = mixPacked(c, 0xff000000, 0.22);
return c;
}
const TONES = new Map();
function tones(c) {
let t = TONES.get(c);
if (!t) {
t = [mixPacked(c, 0xffffffff, 0.42), mixPacked(c, 0xffffffff, 0.21), c, mixPacked(c, 0xff000000, 0.23), mixPacked(c, 0xff000000, 0.48)];
TONES.set(c, t);
}
return t;
}
function pebble(x, y, o) {
const s = o.s, fl = o.flat ?? 1.3;
const gx = Math.floor(x / s), gy = Math.floor(y * fl / s);
let d1 = Infinity, d2 = Infinity, d3 = Infinity, bx = 0, by = 0, id = 0;
for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
const cx = gx + i, cy = gy + j;
const px = (cx + (cy & 1) * 0.45 + 0.18 + hash2(cx, cy, o.seed) * 0.64) * s;
const py = (cy + 0.18 + hash2(cx, cy, o.seed + 1) * 0.64) * s / fl;
const dx = x + 0.5 - px, dy = (y + 0.5 - py) * fl;
const d = dx * dx + dy * dy;
if (d < d1) { d3 = d2; d2 = d1; d1 = d; bx = dx; by = dy; id = cx * 7919 + cy * 104729; }
else if (d < d2) { d3 = d2; d2 = d; }
else if (d < d3) d3 = d;
}
const edge = Math.sqrt(d2) - Math.sqrt(d1);
if (edge < 0.75 || Math.sqrt(d3) - Math.sqrt(d1) < 1.7) return o.mortar;
const r = s * 0.56, e = Math.sqrt(d1) / r;
const T = tones(o.stones[Math.floor(hash2(id, 3, o.seed) * o.stones.length)]);
const u = bx / r, v = by / r;
const dome = Math.max(0, 1 - u * u - v * v);
const lit = -(u * 0.55 + v * 0.85) + dome * 0.22;
if (o.moss && v < -0.22 && e > 0.3 && hash2(id, 11, o.seed) < 0.12) {
const m = Math.abs(u - (hash2(id, 12, o.seed) - 0.5) * 0.8);
if (m < 0.6 - (e - 0.3) * 0.25) return v < -0.55 || m < 0.2 ? o.moss[1] : o.moss[0];
}
let t;
if (edge < 1.6 && v > -0.22) t = 4;
else if (lit > 0.76 && v < -0.12) t = 0;
else if (lit > 0.27) t = 1;
else if (lit > -0.28) t = 2;
else t = lit > -0.7 ? 3 : 4;
const n = noise2((x + id % 7) * 0.38, y * 0.42, o.seed + 31);
if (t > 0 && t < 4) {
if (n > 0.67 && lit > -0.15) t--;
else if (n < 0.27) t++;
if (edge > 2 && hash2(x >> 1, y, o.seed + 44) > 0.965) t = Math.max(0, t - 1);
}
if (hash2(id, 13, o.seed) < 0.08 && e < 0.7) {
const ca = hash2(id, 14, o.seed) * Math.PI, d = Math.abs(u * Math.sin(ca) - v * Math.cos(ca) + (hash2(id, 15, o.seed) - 0.5) * 0.4);
if (d < 0.07 + 0.04 * Math.abs(Math.sin(u * 9))) return T[4];
}
return T[t];
}
return { cobble, pebble };
})();
// src/visual/env/side.js
const __m24 = (() => {
const { fbm1, fbm2, hash2, noise2 } = __m18;
const { mixPacked, pack, hex } = __m2;
const { CELL } = __m22;
const { cobble } = __m25;
const snap = (v) => v - (((v % CELL) + CELL) % CELL);
const col = (h) => pack(hex(h));
function far(c, x, y, seed) {
const g = hash2(Math.floor(x / CELL), Math.floor(y / CELL), seed + 7);
if (g > 0.993) return mixPacked(c, 0xffffffff, 0.1);
if (g < 0.006) return mixPacked(c, 0xff000000, 0.14);
return fbm2(snap(x) * 0.05, snap(y) * 0.07, seed, 2) > 0.55 ? mixPacked(c, 0xffffffff, 0.06) : c;
}
function heights(W, seed, o) {
const top = new Float32Array(W), step = o.step ?? 1, f = o.freq ?? 0.012;
for (let x = 0; x < W; x++) top[x] = Math.round((o.base + (fbm1(x * f, seed, 3) - 0.5) * 2 * o.amp) / step) * step;
return top;
}
function dip(top, cx, hw, depth, flat = 0.4) {
for (let x = Math.max(0, Math.floor(cx - hw)); x <= Math.min(top.length - 1, Math.ceil(cx + hw)); x++) {
const u = Math.abs(x - cx) / hw, t = u < flat ? 1 : Math.cos(((u - flat) / (1 - flat)) * Math.PI / 2);
top[x] = Math.round(Math.max(top[x], top[x] + depth * t * t));
}
}
function raise(top, x0, x1, y, slope = 4) {
for (let x = Math.max(0, Math.floor(x0 - slope * 3)); x <= Math.min(top.length - 1, Math.ceil(x1 + slope * 3)); x++) {
const out = x < x0 ? (x0 - x) / slope : x > x1 ? (x - x1) / slope : 0;
top[x] = Math.min(top[x], Math.round(y + out * out));
}
}
function fillSolid(cv, top) {
for (let x = 0; x < cv.W; x++) top[x] = Math.round(top[x]);
cv.ground = top;
for (let x = 0; x < cv.W; x++) for (let y = Math.max(0, Math.round(top[x])); y < cv.H; y++) cv.solid[y * cv.W + x] = 1;
}
function blob(cv, cx, cy, rx, ry, seed, v = 1, rough = 0.35) {
if (!(rx > 0 && ry > 0)) return;
const x0 = Math.max(0, Math.floor(cx - rx * 1.4)), x1 = Math.min(cv.W - 1, Math.ceil(cx + rx * 1.4));
const y0 = Math.max(0, Math.floor(cy - ry * 1.4)), y1 = Math.min(cv.H - 1, Math.ceil(cy + ry * 1.4));
for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
const u = (x + 0.5 - cx) / rx, w = (y + 0.5 - cy) / ry;
const warp = (fbm2(x * 0.045, y * 0.065, seed, 2) - 0.5) * rough * 1.6;
const chip = (noise2(x * 0.28, y * 0.3, seed + 17) - 0.5) * rough * 0.22;
if (Math.abs(u) ** 2.6 + Math.abs(w) ** 2.3 + warp + chip > 1) continue;
if (v && y < cy - ry * 0.55) continue;
const k = y * cv.W + x;
if (v) cv.solid[k] = 1; else if (cv.solid[k]) { cv.solid[k] = 0; cv.cave[k] = 1; }
}
}
function paintTerrain(cv, o) {
const W = cv.W, H = cv.H, S = cv.solid;
const A = col(o.a), B = col(o.b), G = col(o.grain), D = col(o.dark), deep = col(o.deep), cave = col(o.cave), crust = o.crust.map(col);
const ch = o.crustH ?? 3, blot = o.blot ?? 0.06;
const tex = o.cobble ? { stones: o.cobble.stones.map(col), mortar: col(o.cobble.mortar), s: o.cobble.s ?? 6, seed: o.seed, flat: o.cobble.flat, round: true, moss: o.cobble.moss ? o.cobble.moss.map(col) : undefined } : null;
const layers = (o.layers || []).map((l, i) => ({ ...l, c: l.cols.map(col), paint: STRATA[l.kind] || STRATA.soil, seed: o.seed + 101 * (i + 1) }));
const floors = layers.length ? new Float32Array(W * layers.length) : null;
if (floors) for (let x = 0; x < W; x++) {
let acc = 0;
layers.forEach((l, i) => { acc += l.h[0] + (l.h[1] - l.h[0]) * fbm1(x * 0.035, l.seed, 2); floors[x * layers.length + i] = Math.round(acc); });
}
const strat = cv.stratum || (cv.stratum = new Uint8Array(W * H));
for (let x = 0; x < W; x++) {
let d = 0;
for (let y = 0; y < H; y++) {
const k = y * W + x;
if (!S[k]) {
d = 0;
if (cv.cave[k]) {
const m = fbm2(snap(x) * blot, snap(y) * blot * 1.3, o.seed + 5, 2) > 0.5;
cv.set(x, y, mixPacked(m ? B : A, cave, 0.78));
}
continue;
}
const airAbove = y === 0 || !S[k - W];
if (airAbove) d = 0; else d++;
let c;
const qx = snap(x), qy = snap(y);
let li = -1, into = 0, thick = 1;
if (d >= ch && floors) {
const g = cv.ground ? Math.round(cv.ground[x]) : -1;
const seam = (noise2(x * 0.18, y * 0.15, o.seed + 81) - 0.5) * 1.8;
const e = (g >= 0 && y >= g ? y - g - ch : d - ch) + seam;
for (let i = 0, top = 0; i < layers.length; top = floors[x * layers.length + i], i++) if (e >= 0 && e < floors[x * layers.length + i]) { li = i; into = e - top; thick = floors[x * layers.length + i] - top; break; }
}
const drip = hash2(x >> 1, 5, o.seed) < 0.32 ? 1 + Math.floor(hash2(x >> 1, 6, o.seed) * 2) : 0;
if (d < ch) {
let tone = Math.min(crust.length - 1, d);
const tuft = hash2(x >> 1, y - d, o.seed + 19);
if (d === 0 && tuft < 0.16) tone = Math.min(crust.length - 1, 1);
else if (d > 0 && tuft > 0.74) tone--;
c = crust[tone];
}
else if (d < ch + drip && floors) c = crust[Math.min(crust.length - 1, d - 1)];
else if (li >= 0) {
const l = layers[li];
c = l.paint(x, y, into, l.c, l.seed, thick);
if (into === 0 && li > 0) c = mixPacked(c, D, 0.4);
strat[k] = li + 1;
} else if (tex) {
c = cobble(x, y, tex);
const dd = cv.ground ? Math.min(d, Math.max(0, y - cv.ground[x]) + 10) : d;
const t = Math.min(4, Math.floor((dd - ch) / 10));
if (t > 0) c = mixPacked(c, deep, t * 0.045);
} else {
const m = o.strata ? (Math.floor((qy + fbm1(qx * 0.02, o.seed, 2) * 14) / 8) % 2 ? 0.6 : 0.4) + (fbm2(qx * blot, qy * blot, o.seed, 2) - 0.5) * 0.3
: fbm2(qx * blot, qy * blot * 1.3, o.seed, 2) + (noise2(qx * 0.3, qy * 0.3, o.seed + 9) - 0.5) * 0.08;
c = m > 0.52 ? B : A;
const g = hash2(Math.floor(x / CELL), Math.floor(y / CELL), o.seed + 3);
if (g > 0.955) c = G; else if (g < 0.03) c = D;
const dd = cv.ground ? Math.min(d, Math.max(0, y - cv.ground[x])) : d;
const t = Math.min(4, Math.floor((dd - ch) / 14));
if (t > 0) c = mixPacked(c, deep, t * 0.16);
}
const air = (/** @type {number} */ dx, /** @type {number} */ dy) => { const xx = x + dx, yy = y + dy; return xx >= 0 && xx < W && yy < H && !S[yy * W + xx]; };
let below = false, side = false;
for (let j = 1; j <= CELL; j++) { below ||= air(0, j); side ||= air(-j, 0) || air(j, 0); }
if (below || (side && d >= ch)) c = mixPacked(c, D, 0.55);
cv.set(x, y, c);
}
}
if (o.rocks) inclusions(cv, o.rocks, ch, o.seed);
if (o.seams) seams(cv, o.seams, ch, o.seed);
if (o.grass) grass(cv, o.grass, o.seed);
}
const STRATA = {
dirt(x, y, into, c, seed, thick) {
const band = 1 + Math.round(fbm1(x * 0.13, seed + 11, 2) * 2);
if (thick - into <= 1 + (hash2(x >> 1, 7, seed) < 0.4 ? 1 : 0)) return mixPacked(c[0], 0xff000000, 0.3);
const cx = Math.floor(x / 10), cy = Math.floor((y + (cx & 1) * 3) / 7);
if (hash2(cx, cy, seed + 3) < 0.42) {
const pw = 4 + (hash2(cx, cy, seed + 5) < 0.5 ? 1 : 0), ph = 3;
const px = cx * 10 + 1 + Math.floor(hash2(cx, cy, seed + 4) * (9 - pw)), py = cy * 7 - (cx & 1) * 3 + 1 + Math.floor(hash2(cx, cy, seed + 8) * 3);
const u = x - px, v = y - py;
if (u >= 0 && u < pw && v >= 0 && v < ph && !((u === 0 || u === pw - 1) && (v === 0 || v === ph - 1))) return v === 0 ? c[4] : v === ph - 1 ? c[5] : (u < 2 ? c[4] : mixPacked(c[4], c[5], 0.45));
}
if (into < band) return hash2(x >> 1, y, seed + 9) < 0.2 ? c[2] : c[3];
const clod = noise2(x * 0.23, y * 0.38, seed + 17);
const streak = hash2(Math.floor((x + (y & 3) * 2) / 4), y, seed + 7);
if (streak < 0.12 && clod > 0.45) return c[2];
if (clod < 0.24) return mixPacked(c[0], 0xff000000, 0.18);
if (clod > 0.72) return mixPacked(c[1], c[2], 0.5);
return fbm2(x * 0.13, y * 0.25, seed, 2) > 0.5 ? c[1] : c[0];
},
band(x, y, into, c, seed, thick) {
if (into === 0) return c[2];
if (into >= thick - 1) return c[3];
return hash2(Math.floor((x + into * 3) / 6), y, seed) < 0.28 ? c[1] : c[0];
},
sand(x, y, into, c, seed) {
if (into === 0) return c[0];
const g = hash2(x, y, seed + 1);
if (g < 0.018) return c[3];
if (g > 0.98) return c[0];
const v = y + fbm1(x * 0.05, seed, 2) * 5;
if (Math.floor(v / 4) % 3 === 2 && hash2(x >> 3, Math.floor(v / 4), seed + 2) < 0.7) return c[2];
const patch = noise2(x * 0.22, y * 0.32, seed + 12);
return patch > 0.68 ? mixPacked(c[1], c[0], 0.45) : patch < 0.28 ? mixPacked(c[1], c[2], 0.4) : c[1];
},
soil(x, y, into, c, seed) {
const cx = Math.floor(x / 5), cy = Math.floor((y + (cx & 1) * 2) / 4);
if (hash2(cx, cy, seed + 3) < 0.16) {
const px = cx * 5 + 1 + Math.floor(hash2(cx, cy, seed + 4) * 2), py = cy * 4 - (cx & 1) * 2 + 1;
if (x >= px && x <= px + 1 && y >= py && y <= py + 1) return y === py ? c[2] : c[3];
}
return fbm2(x * 0.09, y * 0.14, seed, 2) > 0.52 ? c[1] : c[0];
},
clay(x, y, into, c, seed) {
const v = y + fbm1(x * 0.03, seed, 2) * 5;
return c[Math.floor(v / 2) % c.length];
},
banded(x, y, into, c, seed) {
const n = c.length - 1, v = y + fbm1(x * 0.025, seed, 2) * 7 + fbm1(x * 0.11, seed + 3, 2) * 1.5, h = 4, b = Math.floor(v / h), f = v - b * h;
const t = c[((b % n) + n) % n];
if (f >= h - 1 && hash2(x >> 2, b, seed + 4) < 0.65) return c[n];
const grain = noise2(x * 0.35, y * 0.4, seed + 8);
if (f < 1) return mixPacked(t, 0xffffffff, grain > 0.5 ? 0.18 : 0.08);
return grain < 0.24 ? mixPacked(t, c[n], 0.22) : grain > 0.74 ? mixPacked(t, 0xffffffff, 0.1) : t;
},
gravel(x, y, into, c, seed) {
return cobble(x, y, { stones: [c[1], c[1], c[0], c[2]], mortar: c[3], s: 3.6, seed, flat: 1.15, round: true });
},
peat(x, y, into, c, seed) {
const s = hash2(Math.floor(x / 5), y, seed + 7);
if (s < 0.14) return c[2];
return fbm2(x * 0.08, y * 0.2, seed, 2) > 0.5 ? c[1] : c[0];
},
ash(x, y, into, c, seed) {
if (hash2(x, y, seed + 5) < 0.07) return c[2];
return Math.floor((y + fbm1(x * 0.05, seed, 2) * 3) / 3) % 2 ? c[1] : c[0];
},
};
function depthAt(cv, x, y) {
let d = 0;
while (y - d - 1 >= 0 && cv.solid[(y - d - 1) * cv.W + x]) d++;
return d;
}
function inclusions(cv, r, ch, seed) {
const [lit, mid, dark] = r.cols.map(col);
for (let i = 0; i < r.n; i++) {
const cx = Math.floor(hash2(i, 1, seed + 40) * cv.W), cy = Math.floor(hash2(i, 2, seed + 40) * cv.H);
if (!cv.solid[cy * cv.W + cx] || depthAt(cv, cx, cy) < ch + 3) continue;
const rx = 2 + hash2(i, 3, seed + 40) * (r.r ?? 5), ry = rx * (0.5 + hash2(i, 4, seed + 40) * 0.3);
for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
if (x < 0 || y < 0 || x >= cv.W || y >= cv.H || !cv.solid[y * cv.W + x]) continue;
const qx = snap(x) + CELL / 2, qy = snap(y) + CELL / 2;
const e = (Math.abs(qx - cx) / rx) ** 3 + (Math.abs(qy - cy) / ry) ** 3 + (hash2(Math.floor(x / CELL), Math.floor(y / CELL), seed + i) - 0.5) * 0.5;
if (e > 1) continue;
cv.set(x, y, qy < cy - ry * 0.45 ? lit : e > 0.6 && qy > cy ? dark : mid);
}
}
}
function seams(cv, sm, ch, seed) {
const cols = sm.cols.map(col);
for (let i = 0; i < sm.n; i++) {
const y0 = Math.floor(hash2(i, 5, seed + 50) * cv.H), x0 = Math.floor(hash2(i, 6, seed + 50) * cv.W), len = 20 + Math.floor(hash2(i, 7, seed + 50) * 60);
const c = cols[i % cols.length];
for (let x = x0; x < Math.min(cv.W, x0 + len); x++) {
const y = snap(Math.round(y0 + (fbm1(snap(x) * 0.05, seed + i, 2) - 0.5) * 8));
for (const yy of [y, y + 1, ...(hash2(Math.floor(x / CELL), i, seed) > 0.6 ? [y + 2, y + 3] : [])]) if (yy > 0 && yy < cv.H && cv.solid[yy * cv.W + x] && depthAt(cv, x, yy) >= ch + 2) cv.set(x, yy, c);
}
}
}
function hanging(cv, o) {
const fill = col(o.fill), rim = o.rim ? col(o.rim) : fill, line = new Float32Array(cv.W);
for (let x = 0; x < cv.W; x++) {
const qx = snap(x);
line[x] = snap(Math.round(o.base + (fbm1(qx * o.freq, o.seed, 4) - 0.5) * 2 * o.amp + (o.rough ? (hash2(qx >> 1, 1, o.seed) - 0.5) * o.rough : 0))) + CELL - 1;
for (let y = 0; y <= Math.min(cv.H - 1, line[x]); y++) cv.set(x, y, y > line[x] - CELL ? rim : far(fill, x, y, o.seed));
}
return line;
}
function grass(cv, g, seed) {
const cols = g.cols.map(col), fl = (g.flowers || []).map(col), tall = g.tall ?? 3, rate = g.rate ?? 0.6;
for (let x = 0; x < cv.W; x++) for (let y = 1; y < cv.H; y++) {
const k = y * cv.W + x;
if (!cv.solid[k] || cv.solid[k - cv.W] || cv.liquid[k - cv.W]) continue;
const bx = Math.floor(x / CELL), r = hash2(bx, y, seed + 21);
if (r > rate) continue;
const h = 1 + Math.floor(hash2(bx, y, seed + 22) * tall);
if (cv.grass) cv.grass[k] = 1;
for (let j = 1; j <= h; j++) if (y - j >= 0 && !cv.solid[k - j * cv.W]) cv.set(x, y - j, cols[(j + (r > rate * 0.5 ? 1 : 0)) % cols.length]);
if (fl.length && hash2(bx, y, seed + 23) < 0.025) for (const yy of [y - h - 1, y - h - 2]) cv.set(x, yy, fl[Math.floor(hash2(bx, y, seed + 24) * fl.length)]);
}
}
function pool(cv, x0, x1, level, o) {
const surf = col(o.surface), body = o.body.map(col), see = o.see ?? 0.15, bed = (o.bed || []).map(col);
for (let x = Math.max(0, x0); x <= Math.min(cv.W - 1, x1); x++) {
for (let y = level; y < cv.H; y++) {
const k = y * cv.W + x;
if (cv.solid[k]) break;
cv.liquid[k] = 1;
const d = y - level, f = Math.min(body.length - 1, d / 5), i = Math.floor(f), c = d === 0 ? surf : i >= body.length - 1 ? body[i] : mixPacked(body[i], body[i + 1], f - i);
cv.paint(k, mixPacked(c, cv.pix.px[k], d === 0 ? 0 : see));
}
}
if (bed.length) for (let y = level; y < cv.H; y++) for (let x = Math.max(0, x0 - 3); x <= Math.min(cv.W - 1, x1 + 3); x++) {
const k = y * cv.W + x;
if (!cv.solid[k]) continue;
let near = 9;
for (let j = -3; j <= 0; j++) for (let i = -3; i <= 3; i++) {
const xx = x + i, yy = y + j;
if (xx >= 0 && yy >= 0 && xx < cv.W && cv.liquid[yy * cv.W + xx]) near = Math.min(near, Math.max(Math.abs(i), -j));
}
if (near < 3) cv.paint(k, bed[Math.min(bed.length - 1, near + (hash2(x, y, 77) > 0.8 ? 1 : 0))]);
}
for (let y = level + 1; y < cv.H; y += 3) for (let x = Math.max(1, x0); x < Math.min(cv.W - 1, x1); x += 5) {
if (hash2(x, y, cv.seed + 83) > 0.45) continue;
const len = 1 + Math.floor(hash2(x, y, cv.seed + 84) * 4);
for (let i = 0; i < len; i++) {
const k = y * cv.W + x + i;
if (x + i <= x1 && cv.liquid[k]) cv.paint(k, mixPacked(cv.pix.px[k], y < level + 5 ? surf : body[0], y < level + 5 ? 0.7 : 0.35));
}
}
return { x0, x1, level };
}
function sunbeams(cv, sx, sy, strength = 0.12) {
cv.light([1, 0.94, 0.7], (x, y) => {
if (y < sy) return 0;
const d = y - sy, u = x - sx + d * 0.65;
let a = 0;
for (const off of [-15, 0, 19]) {
const q = Math.abs(u - off) / (3 + d * 0.08);
if (q < 1) a = Math.max(a, (1 - q) * strength * Math.max(0, 1 - d / cv.H));
}
return a * 0.48;
}, sy, cv.H);
}
function markOpen(cv, minY = 30) {
const W = cv.W, S = cv.solid, L = cv.liquid;
for (let y = Math.max(1, minY); y < cv.H; y++) for (let x = 2; x < W - 2; x++) {
const k = y * W + x;
if (!S[k] || S[k - W] || L[k - W] || L[k]) continue;
cv.open[k] = 1; cv.open[k - W] = 1;
}
}
function ledges(cv, top, rng, n, o = {}) {
const keep = o.keep || [], r0 = o.rise || [32, 46];
const shapes = [];
const boxes = [];
const n0 = Math.max(3, Math.round(n * 0.6)), n1 = o.high || 0;
const dry = [];
let a = 0;
for (const [k0, k1] of [...keep].sort((p, q) => p[0] - q[0])) { if (k0 > a) dry.push([a, k0]); a = Math.max(a, k1); }
if (a < cv.W) dry.push([a, cv.W]);
const span = dry.reduce((t, [p, q]) => t + q - p, 0);
const along = (/** @type {number} */ u, /** @type {number} */ dx, /** @type {number} */ r) => {
let d = u * span;
for (const [p, q] of dry) {
if (d <= q - p) return Math.round(q - p > 2 * r ? Math.max(p + r, Math.min(q - r, p + d + dx)) : (p + q) / 2);
d -= q - p;
}
return cv.W / 2;
};
for (const [tier, count, rise] of /** @type {[number, number, number[]][]} */ ([[0, n0, r0], [1, n1, [r0[0] + 42, r0[1] + 42]]])) {
let x0 = cv.W, x1 = 0, y0 = cv.H;
for (let i = 0; i < count; i++) {
const rx = rng.int(22, 30), x = along(tier ? (i + 1) / (count + 1) : (i + 0.5) / count, rng.int(-14, 14), rx + (keep.length ? 4 : -rx));
if (!tier && keep.some(([a, b]) => x + rx > a && x - rx < b)) continue;
const ground = Math.min(top[Math.max(0, x - rx)], top[Math.min(cv.W - 1, x)], top[Math.min(cv.W - 1, x + rx)]);
const y = snap(Math.max(60, Math.round(ground) - rng.int(rise[0], rise[1])));
if (ground - y < 24) continue;
const ry = rng.int(7, 10), seed = rng.int(0, 1e9);
const box = /** @type {[number, number, number, number]} */ ([x - rx, y - ry * 0.55, x + rx, y + ry]);
if (boxes.some((b) => box[0] < b[2] + 12 && box[2] > b[0] - 12 && box[1] < b[3] + 26 && box[3] + 26 > b[1])) continue;
shapes.push(slab(x, y, rx, ry, seed));
const side = rng.next() < 0.5 ? -1 : 1, bx = x + side * Math.round(rx * rng.next() * 0.25);
const lean = side * rng.int(0, 4), fx = Math.max(2, Math.min(cv.W - 3, bx + lean));
if (keep.some(([a, b]) => fx + rx * 0.5 > a && fx - rx * 0.5 < b)) { shapes.pop(); continue; }
let land = Math.round(y + ry);
while (land < cv.H - 1 && !cv.solid[land * cv.W + fx]) land++;
const w0 = Math.round(rx * (tier ? 0.42 : 0.4)) + rng.int(0, 3), w1 = w0 + rng.int(4, 10);
shapes.push(buttress(bx, y + ry * 0.6, fx, land + 3, w0, w1, seed));
boxes.push(box);
x0 = Math.min(x0, x - rx - 12, fx - w1 - 12); x1 = Math.max(x1, x + rx + 12, fx + w1 + 12); y0 = Math.min(y0, y - ry * 2);
}
const ground = (/** @type {number} */ x, /** @type {number} */ y) => top[Math.max(0, Math.min(cv.W - 1, Math.round(x)))] - y;
for (let Y = snap(Math.max(0, Math.floor(y0))); Y < cv.H; Y += CELL) for (let X = snap(Math.max(0, x0)); X < Math.min(cv.W, x1); X += CELL) {
const x = X + CELL / 2, y = Y + CELL / 2;
let d = ground(x, y);
for (const f of shapes) d = smin(d, f(x, y), 8);
if (d >= 0) continue;
for (let yy = Y; yy < Math.min(cv.H, Y + CELL); yy++) for (let xx = X; xx < Math.min(cv.W, X + CELL); xx++) {
const k = yy * cv.W + xx;
if (!cv.cave[k]) cv.solid[k] = 1;
}
}
}
}
function smin(a, b, k) {
const h = Math.max(k - Math.abs(a - b), 0) / k;
return Math.min(a, b) - h * h * k * 0.25;
}
function slab(cx, cy, rx, ry, seed) {
const cut = cy - ry * 0.55;
return (/** @type {number} */ x, /** @type {number} */ y) => {
if (Math.abs(x - cx) > rx + 16 || Math.abs(y - cy) > ry + 16) return 1e3;
const e = Math.pow(Math.abs(x - cx) / rx, 4) + Math.pow(Math.abs(y - cy) / ry, 3);
const d = (Math.pow(e, 0.28) - 1) * ry + (fbm2(x * 0.08, y * 0.12, seed, 2) - 0.5) * 4;
return Math.max(d, cut - y);
};
}
function buttress(x0, y0, x1, y1, w0, w1, seed) {
const vx = x1 - x0, vy = y1 - y0, ll = vx * vx + vy * vy || 1;
const lx = Math.min(x0, x1) - w1 - 16, hx = Math.max(x0, x1) + w1 + 16, ly = Math.min(y0, y1) - w1 - 16, hy = Math.max(y0, y1) + w1 + 16;
return (/** @type {number} */ x, /** @type {number} */ y) => {
if (x < lx || x > hx || y < ly || y > hy) return 1e3;
const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / ll));
const r = (w0 + (w1 - w0) * t * t) / 2 + (hash2(Math.floor(y / 4), 0, seed) - 0.5) * 1.6;
return Math.hypot(x - x0 - vx * t, y - y0 - vy * t) - r;
};
}
function surfaceAt(cv, x) {
x = Math.max(0, Math.min(cv.W - 1, Math.round(x)));
if (cv.ground) return Math.round(cv.ground[x]);
for (let y = 0; y < cv.H; y++) if (cv.solid[y * cv.W + x]) return y;
return cv.H - 1;
}
function silhouette(cv, o) {
const fill = col(o.fill), rim = o.rim ? col(o.rim) : fill, line = new Float32Array(cv.W);
for (let x = 0; x < cv.W; x++) {
const qx = snap(x);
let v = fbm1(qx * o.freq, o.seed, 4);
if (o.peaks) v = Math.pow(v, 1 / (1 + o.peaks));
line[x] = snap(Math.round(o.base - (v - 0.5) * 2 * o.amp - (fbm1(qx * 0.11, o.seed + 5, 2) - 0.5) * Math.max(2, o.amp * 0.35) - (o.rough ? (hash2(qx >> 1, 0, o.seed) - 0.5) * o.rough : 0)));
}
const shade = mixPacked(fill, 0xff000000, 0.12);
for (let x = 0; x < cv.W; x++) {
const rise = line[Math.max(0, x - 2)] - line[Math.min(cv.W - 1, x + 2)], deep = 1 + (rise < 0 ? 2 : rise === 0 ? 1 : 0) + (hash2(x >> 1, 9, o.seed) < 0.3 ? -1 : 0);
const band = 3 + Math.round(fbm1(x * 0.08, o.seed + 6, 2) * 5);
for (let y = Math.max(0, line[x]); y < (o.bottom ?? cv.H); y++) {
const d = y - line[x];
cv.set(x, y, d < Math.max(1, deep) ? rim : d < deep + band && rise > 0 ? shade : far(fill, x, y, o.seed));
}
}
return line;
}
function mountains(cv, o) {
const W = cv.W, peaks = [];
for (let i = 0; i < o.n; i++) {
const px = ((i + 0.15 + hash2(i, 1, o.seed) * 0.7) / o.n) * (W + 80) - 40, h = o.amp * (0.45 + hash2(i, 2, o.seed) * 0.55);
peaks.push([px, h, h * (1.2 + hash2(i, 3, o.seed) * 1.1), h * (1.2 + hash2(i, 4, o.seed) * 1.1)]);
}
const line = new Float32Array(W), own = new Int16Array(W);
for (let x = 0; x < W; x++) {
let best = -1e9, bi = 0;
for (let i = 0; i < peaks.length; i++) {
const [px, h, wl, wr] = peaks[i], u = Math.min(1, Math.abs(x - px) / (x < px ? wl : wr));
const v = h * (1 - u) * (1 - u * 0.3);
if (v > best) { best = v; bi = i; }
}
const h = peaks[bi][1];
best += (fbm1(x * 0.045, o.seed + 11, 3) - 0.5) * h * 0.34 + (fbm1(x * 0.19, o.seed + 12, 2) - 0.5) * h * 0.1 + (hash2(x >> 1, 7, o.seed) - 0.5) * 1.4;
line[x] = Math.round(o.base - Math.max(0, best));
own[x] = bi;
}
rockFace(cv, line, own, peaks.map(([px, h]) => [px, o.base - h, h]), o);
return line;
}
function rockFace(cv, line, own, tops, o) {
const W = cv.W, fill = col(o.fill), L = o.lit ? col(o.lit) : mixPacked(fill, 0xffffffff, 0.18), D = o.dark ? col(o.dark) : mixPacked(fill, 0xff000000, 0.18);
const LL = mixPacked(L, 0xffffffff, 0.16), DD = mixPacked(D, 0xff000000, 0.2);
const snow = o.snow ? col(o.snow) : 0, snowS = o.snow ? mixPacked(snow, D, 0.32) : 0, snowL = o.snow ? mixPacked(snow, L, 0.18) : 0;
const snowAt = o.snowAt ?? (o.base !== undefined && o.amp !== undefined ? o.base - o.amp * 0.6 : -1e9);
for (let x = 0; x < W; x++) {
const i = own[x], [px, py, h] = tops[i];
for (let y = Math.max(0, line[x]); y < (o.bottom ?? cv.H); y++) {
const d = y - line[x], below = Math.max(1, y - py);
const rx = px + (fbm1(y * 0.05, o.seed + i * 13, 3) - 0.5) * Math.min(1, below / 24) * h * 0.7;
const lit = x < rx;
const ang = (x - px) / (below + 6), g = fbm2(ang * 9, y * 0.035, o.seed + i * 7, 2);
let c = lit ? L : D;
if (g > 0.6) c = lit ? fill : DD; else if (g < 0.32) c = lit ? LL : fill;
const deep = (o.deep ?? 0.95) * h + (fbm1(x * 0.04, o.seed + 9, 2) - 0.5) * h * 0.5;
if (d > deep) c = g > 0.66 ? D : fill;
if (d === 0) c = lit ? LL : c;
if (snow) {
const edge = snowAt + (g - 0.45) * 22 + (hash2(x >> 1, y >> 2, o.seed + 3) - 0.5) * 3;
if (y < edge) c = lit ? (g < 0.35 ? snowL : snow) : snowS;
}
cv.set(x, y, c);
}
}
}
function treeShape(cv, x, y, h, kind, c, seed) {
const fill = col(c), tw = Math.max(1, Math.round(h / 14));
const put = (px, py) => {
const X = snap(px), Y = snap(py);
for (let j = Y; j < Y + CELL; j++) for (let i = X; i < X + CELL; i++) if (i >= 0 && j >= 0 && i < cv.W && j < cv.H) cv.paint(j * cv.W + i, far(fill, i, j, seed));
};
for (let j = 0; j < h * (kind === 'pine' ? 0.9 : 0.6); j++) for (let i = -tw; i < tw; i++) put(Math.round(x + i), Math.round(y - j));
if (kind === 'pine') {
for (let j = 0; j < h * 0.85; j++) {
const t = j / (h * 0.85), w = Math.round((1 - t) * h * 0.28 * (0.8 + 0.4 * ((j >> 2) % 2)));
for (let i = -w; i <= w; i++) put(Math.round(x + i), Math.round(y - h * 0.15 - j));
}
} else if (kind === 'dead') {
for (let b = 0; b < 4; b++) {
const s = b % 2 ? 1 : -1, y0 = y - h * (0.35 + b * 0.12);
for (let i = 0; i < h * 0.2; i++) put(Math.round(x + s * i), Math.round(y0 - i * 0.7));
}
} else {
const r = h * 0.3, cy = y - h * 0.65, lit = mixPacked(fill, 0xffffffff, 0.14), shade = mixPacked(fill, 0xff000000, 0.22);
const n = 4 + Math.floor(hash2(x, 3, seed) * 3), clumps = [];
for (let i = 0; i < n; i++) {
const a = (i / n) * Math.PI * 2 + hash2(i, 1, seed) * 0.8, d = r * (0.35 + hash2(i, 2, seed) * 0.35);
clumps.push([x + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d * 0.8, r * (0.45 + hash2(i, 4, seed) * 0.25)]);
}
clumps.sort((p, q) => p[1] - q[1]);
clumps.push([x, cy - r * 0.1, r * 0.62]);
for (const [ccx, ccy, cr] of clumps) for (let j = Math.floor(-cr); j <= cr; j++) for (let i = Math.floor(-cr); i <= cr; i++) {
const e = (i * i + j * j) / (cr * cr) + (hash2(Math.round(ccx + i), Math.round(ccy + j), seed) - 0.5) * 0.25;
if (e > 1) continue;
const px = Math.round(ccx + i), py = Math.round(ccy + j);
if (px < 0 || py < 0 || px >= cv.W || py >= cv.H) continue;
const l = -(i / cr) * 0.5 - (j / cr) * 0.85;
cv.paint(py * cv.W + px, l > 0.55 && e > 0.25 ? lit : l < -0.5 ? shade : far(fill, px, py, seed));
}
}
}
function glow(cv, x, y, r, rgb, k) {
cv.glow(x, y, r, rgb, k);
}
function drips(cv, seed, n) {
const out = [];
for (let y = 20; y < cv.H - 10; y++) for (let x = 4; x < cv.W - 4; x++) {
const k = y * cv.W + x;
if (!cv.solid[k] || cv.solid[k + cv.W] || cv.liquid[k + cv.W] || hash2(x, y, seed) > 0.05) continue;
let fall = 1;
while (y + fall < cv.H && !cv.solid[k + fall * cv.W] && !cv.liquid[k + fall * cv.W]) fall++;
if (fall > 6) out.push([x, y + 1, fall - 1]);
}
return out.filter((_, i) => i % Math.max(1, Math.floor(out.length / n)) === 0).slice(0, n);
}
return { col, far, heights, dip, raise, fillSolid, blob, paintTerrain, STRATA, hanging, pool, sunbeams, markOpen, ledges, surfaceAt, silhouette, mountains, rockFace, treeShape, glow, drips };
})();
// src/visual/env/lighting.js
const __m26 = (() => {
function litColour(colour, r, g, b, surface) {
const shade = (v, energy) => {
const exposure = 1 - Math.exp(-Math.max(0, energy));
const lift = surface ? (v * 1.25 + 45) * exposure : 200 * exposure;
const room = 255 - v;
return Math.round(v + (room > 0 ? room * (1 - Math.exp(-lift / room)) : 0));
};
return ((colour & 0xff000000) | (shade((colour >>> 16) & 255, b) << 16)
| (shade((colour >>> 8) & 255, g) << 8) | shade(colour & 255, r)) >>> 0;
}
function horizons(cv, x, y, radius) {
const count = 192, out = new Float32Array(count).fill(radius), W = cv.W, H = cv.H;
for (let i = 0; i < count; i++) {
const a = i * Math.PI * 2 / count, dx = Math.cos(a), dy = Math.sin(a);
for (let d = 2; d < radius; d++) {
const xx = Math.round(x + dx * d), yy = Math.round(y + dy * d);
if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
const k = yy * W + xx;
if (cv.solid[k] || cv.rock[k]) { out[i] = d; break; }
}
}
return out;
}
function illuminate(cv, lights) {
if (!lights.length) return;
const W = cv.W, H = cv.H, N = W * H, sw = cv.sw;
const energy = new Float32Array(N * 3), surfaces = new Uint8Array(N);
for (let k = 0; k < N; k++) surfaces[k] = cv.solid[k] || cv.rock[k] || cv.trees[k] || cv.things[k] || cv.liquid[k] ? 1 : 0;
if (sw) for (let i = 0; i < sw.k.length; i++) {
const k = sw.k[i];
if (sw.layer[k] <= sw.s[i]) surfaces[k] = sw.far[sw.g[i]] ? 0 : 1;
}
for (const [sx, sy, radius, rgb, strength] of lights) {
if (!(radius > 0) || !(strength > 0)) continue;
const horizon = horizons(cv, sx, sy, radius), rays = horizon.length;
for (let y = Math.max(0, Math.floor(sy - radius)); y < Math.min(H, Math.ceil(sy + radius)); y++) {
for (let x = Math.max(0, Math.floor(sx - radius)); x < Math.min(W, Math.ceil(sx + radius)); x++) {
const dx = x - sx, dy = y - sy, distance = Math.hypot(dx, dy), d = distance / radius;
if (d >= 1) continue;
const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
const ray = Math.round(angle * rays / (Math.PI * 2)) % rays;
const penetration = Math.max(0, distance - horizon[ray]);
const visibility = penetration ? 0.1 + 0.9 * Math.exp(-penetration / 5) : 1;
const amount = (1 - d) ** 2 * strength * visibility;
const k = (y * W + x) * 3;
energy[k] += rgb[0] * amount; energy[k + 1] += rgb[1] * amount; energy[k + 2] += rgb[2] * amount;
}
}
}
const apply = (colour, k, surface) => litColour(colour, energy[k * 3], energy[k * 3 + 1], energy[k * 3 + 2], surface);
for (let k = 0; k < N; k++) {
const same = sw && sw.bare[k] === cv.pix.px[k];
cv.pix.px[k] = apply(cv.pix.px[k], k, surfaces[k]);
if (sw) {
const fixed = cv.solid[k] || cv.rock[k] || cv.things[k] || cv.liquid[k];
sw.bare[k] = apply(sw.bare[k], k, fixed || (cv.trees[k] && same));
}
}
if (sw) for (let i = 0; i < sw.k.length; i++) {
const k = sw.k[i], surface = !sw.far[sw.g[i]];
sw.c[i] = apply(sw.c[i], k, surface);
}
}
return { litColour, illuminate };
})();
// src/visual/env/cave.js
const __m23 = (() => {
const { fbm1, fbm2, hash2 } = __m18;
const { mixPacked } = __m2;
const { col, far } = __m24;
const { cobble } = __m25;
const { illuminate } = __m26;
function farPillars(cv, o) {
const fill = col(o.fill), rim = o.rim ? col(o.rim) : fill, W = cv.W;
for (let i = 0; i < o.n; i++) {
const cx = ((i + 0.2 + hash2(i, 1, o.seed) * 0.6) / o.n) * W, w = o.w[0] + hash2(i, 2, o.seed) * (o.w[1] - o.w[0]);
const kind = hash2(i, 3, o.seed), top = kind < 0.25 ? o.floor - 30 - hash2(i, 4, o.seed) * 50 : -2, bottom = kind > 0.85 ? 30 + hash2(i, 5, o.seed) * 50 : o.floor + 20;
for (let y = Math.max(0, Math.floor(top)); y < Math.min(cv.H, bottom); y++) {
const u = (y - top) / Math.max(1, bottom - top);
let hw = w / 2 * (0.75 + 1.1 * (u - 0.5) ** 2 * 2) + (fbm1(y * 0.08, o.seed + i, 2) - 0.5) * w * 0.4;
if (kind < 0.25) hw *= Math.min(1, u * 2.4);
if (kind > 0.85) hw *= Math.min(1, (1 - u) * 2.4);
const sx = cx + (fbm1(y * 0.015, o.seed + i * 3, 2) - 0.5) * w * 0.8;
for (let x = Math.max(0, Math.floor(sx - hw)); x <= Math.min(W - 1, Math.ceil(sx + hw)); x++) cv.set(x, y, x < sx - hw + 2 ? rim : far(fill, x, y, o.seed + i));
}
if (o.caps && kind >= 0.25 && kind <= 0.85) {
const cy = o.floor - 40 - hash2(i, 6, o.seed) * 60, cw = w * (1.6 + hash2(i, 7, o.seed));
for (let y = Math.floor(cy - 4); y < cy + 5; y++) for (let x = Math.floor(cx - cw); x <= cx + cw; x++) {
if (x < 0 || x >= W || y < 0) continue;
const e = ((x - cx) / cw) ** 4 + ((y - cy) / (y < cy ? 4 : 5)) ** 2;
if (e <= 1) cv.set(x, y, y < cy - 3 ? rim : far(fill, x, y, o.seed + i));
}
}
}
}
function fog(cv, c, y0, y1, k, seed) {
const fc = col(c);
cv.wash(fc, (x, y) => {
const t = (y - y0) / Math.max(1, y1 - y0);
return t < 0 || t > 1 ? 0 : Math.sin(t * Math.PI) * k * (0.7 + fbm2(x * 0.02, y * 0.06, seed, 2) * 0.6);
}, Math.max(0, Math.floor(y0)), Math.ceil(y1));
}
function caveFrame(cv, o) {
const W = cv.W, H = cv.H, seed = o.seed;
const tex = { stones: o.stones.map(col), mortar: col(o.mortar), s: o.s ?? 8, seed, round: true };
const roof = new Float32Array(W);
for (let x = 0; x < W; x++) {
let y = o.roof[0] + fbm1(x * 0.03, seed, 3) * (o.roof[1] - o.roof[0]) + (hash2(x >> 1, 0, seed) - 0.5) * 2;
if (o.open) {
const [a, b] = o.open, u = (x - a) / (b - a);
if (u > 0 && u < 1) y = y * Math.pow(1 - Math.sin(u * Math.PI), 1.6) - Math.sin(u * Math.PI) * 6;
}
roof[x] = Math.round(y);
}
const [wl, wr] = o.walls || [0, 0];
const wallL = (y) => wl ? wl * (0.6 + 0.8 * (1 - y / H) ** 2) + (fbm1(y * 0.05, seed + 3, 3) - 0.5) * 10 : -1;
const wallR = (y) => wr ? W - 1 - (wr * (0.6 + 0.8 * (1 - y / H) ** 2) + (fbm1(y * 0.05, seed + 4, 3) - 0.5) * 10) : W;
const inRock = (x, y) => y <= roof[Math.max(0, Math.min(W - 1, x))] || x < wallL(y) || x > wallR(y);
const dark = o.dark ?? 0.45, lip = (o.lip || []).map(col);
for (let y = 0; y < H; y++) {
const l = wallL(y), r = wallR(y);
for (let x = 0; x < W; x++) {
if (!(y <= roof[x] || x < l || x > r)) continue;
cv.rock[y * W + x] = 1;
const under = !inRock(x, y + 1) || !inRock(x, y + 2), inner = (x < l && !inRock(x + 2, y)) || (x > r && !inRock(x - 2, y));
let c = mixPacked(cobble(x, y, tex), 0xff000000, dark);
if (under && lip.length && y <= roof[x]) c = lip[!inRock(x, y + 1) ? 0 : 1];
else if (under || inner) c = mixPacked(c, 0xff000000, 0.35);
cv.set(x, y, c);
}
}
const tips = [];
if (o.stal) {
const st = o.stal, tip = st.tip ? col(st.tip) : 0;
for (let i = 0; i < st.n; i++) {
const x0 = Math.round(((i + hash2(i, 1, seed + 7)) / st.n) * W), y0 = roof[Math.max(0, Math.min(W - 1, x0))];
if (y0 < 0) continue;
const L = st.len[0] + hash2(i, 2, seed + 7) * (st.len[1] - st.len[0]), w = (st.w || [3, 7])[0] + hash2(i, 3, seed + 7) * ((st.w || [3, 7])[1] - (st.w || [3, 7])[0]);
const bend = (hash2(i, 4, seed + 7) - 0.5) * 4;
for (let j = -2; j < L; j++) {
const u = Math.max(0, j) / L, hw = w * Math.pow(1 - u, 1.2) + (j < 2 ? 1.5 : 0), cx = x0 + bend * u * u;
for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
if (x < 0 || x >= W || y0 + j < 0 || y0 + j >= H || Math.abs(x - cx) > hw) continue;
const y = y0 + j;
let c = mixPacked(cobble(x, y, { ...tex, s: 3 }), 0xff000000, dark);
if (x < cx - hw + 1.5) c = mixPacked(c, 0xffffffff, 0.12); else if (x > cx + hw - 1.5) c = mixPacked(c, 0xff000000, 0.35);
if (tip && u > 0.8) c = mixPacked(c, tip, (u - 0.8) * 4);
cv.set(x, y, c);
cv.rock[y * W + x] = 1;
}
}
tips.push([Math.round(x0 + bend), Math.round(y0 + L)]);
}
}
cv.meta.tips = tips;
return { roof, wallL, wallR };
}
function vines(cv, line, o) {
const W = cv.W, cols = o.cols.map(col), leaf = col(o.leaf || o.cols[0]), fl = o.flower ? col(o.flower) : 0, rate = o.rate ?? 0.3;
for (let x = 1; x < W - 1; x++) {
const y0 = line[x];
if (y0 < 0) continue;
const cluster = fbm1(x * 0.06, o.seed, 2);
if (hash2(x, 1, o.seed) > rate * cluster * 2) continue;
const L = Math.round(o.len[0] + (o.len[1] - o.len[0]) * hash2(x, 2, o.seed) * cluster * 1.6);
let vx = x;
const g = cv.swayGroup(0, 1 + L * 0.05);
for (let j = 1; j <= L; j++) {
const y = y0 + j;
if (y >= cv.H || cv.solid[y * W + vx] || cv.liquid[y * W + vx]) break;
if (hash2(x, j >> 3, o.seed + 5) > 0.85 && j % 8 === 0) vx += hash2(x, j, o.seed) < 0.5 ? -1 : 1;
if (vx < 0 || vx >= W) break;
const c = cols[Math.min(cols.length - 1, Math.floor((j / Math.max(1, L)) * cols.length))];
cv.swaySet(vx, y, c, g);
if (j % 3 === 0) { const s = (j / 3) % 2 ? 1 : -1; if (vx + s >= 0 && vx + s < W) cv.swaySet(vx + s, y, leaf, g); }
if (fl && j === L && hash2(x, 3, o.seed) < 0.15) cv.swaySet(vx, y + 1, fl, g);
}
}
}
function moss(cv, o) {
const W = cv.W, H = cv.H, S = cv.solid, cols = o.cols.map(col), drape = o.drape ?? 10, rate = o.rate ?? 0.25, len = o.len ?? 12;
for (let x = 1; x < W - 1; x++) {
let d = 0, top = 0;
for (let y = 0; y < H; y++) {
const k = y * W + x;
if (!S[k]) { d = 0; continue; }
if (y === 0 || !S[k - W]) { d = 0; top = y; } else d++;
const side = !S[k - 1] || !S[k + 1];
if (side && d > 0 && d < drape * (0.4 + hash2(x >> 1, top, o.seed))) cv.set(x, y, cols[Math.min(cols.length - 1, 1 + (d > drape * 0.6 ? 1 : 0))]);
if (y + 1 < H && !S[k + W] && !cv.liquid[k + W] && y - top < 24 && hash2(x, y, o.seed + 1) < rate) {
const L = 1 + Math.floor(hash2(x, y, o.seed + 2) ** 2 * len);
const g = L >= 4 ? cv.swayGroup(0, 0.5 + L * 0.06) : -1;
for (let j = 1; j <= L && y + j < H && !S[k + j * W] && !cv.liquid[k + j * W]; j++) {
const c = cols[Math.min(cols.length - 1, Math.floor((j / L) * cols.length))];
if (g >= 0) cv.swaySet(x, y + j, c, g); else cv.set(x, y + j, c);
}
}
}
}
}
function glowShrooms(cv, o) {
const W = cv.W, cap = col(o.cap), lit = col(o.lit), stem = col(o.stem), spots = [];
for (let k = 0; k < cv.open.length; k++) if (cv.open[k] && cv.solid[k] && Math.floor(k / W) >= (o.minY ?? 0)) spots.push(k);
const out = [];
for (let i = 0; i < o.n * 4 && out.length < o.n && spots.length; i++) {
const k = spots[Math.floor(hash2(i, 1, o.seed) * spots.length)], x = k % W, y = Math.floor(k / W);
if (out.some(([a, b]) => Math.abs(a - x) < 10 && Math.abs(b - y) < 6)) continue;
if (!cv.clear(x - 4, y - 8, x + 4, y - 1) || !cv.solid[k - 4] || !cv.solid[k + 4]) continue;
const n = 1 + Math.floor(hash2(i, 2, o.seed) * 3);
for (let m = 0; m < n; m++) {
const mx = x + (m - (n - 1) / 2) * 3, h = 2 + Math.floor(hash2(i, m + 3, o.seed) * 4), r = 1 + (m === 0 ? 1 : 0);
for (let j = 1; j <= h; j++) cv.setThing(mx, y - j, stem);
for (let dx = -r; dx <= r; dx++) cv.setThing(mx + dx, y - h - 1, cap);
for (let dx = -r + 1; dx <= r - 1; dx++) cv.setThing(mx + dx, y - h - 2, lit);
cv.setThing(mx - r, y - h - 2, cap);
}
cv.block(x - 4, y - 8, x + 5, y + 1);
cv.claim(x - 4, y - 8, x + 4, y - 1);
cv.glow(x, y - 4, 22, o.rgb, 0.6);
out.push([x, y - 4]);
}
return out;
}
function torch(cv, x, y, h = 10) {
const wood = col('#4a3020'), woodL = col('#6a4830'), iron = col('#2a2624'), fl = [col('#fff4b0'), col('#ffc040'), col('#ff7a20'), col('#c03a10')];
for (let j = 0; j < h; j++) { cv.setThing(x, y - j, wood); cv.setThing(x + 1, y - j, j % 3 ? woodL : wood); }
for (let dx = -1; dx <= 2; dx++) cv.setThing(x + dx, y - h, iron);
const flame = [[0, 1, 0], [-1, 1, 1], [0, 0, 0], [1, 0, 1], [0, 2, 1], [1, 1, 0], [-1, 2, 2], [2, 1, 2], [0, 3, 2], [1, 2, 1], [1, 3, 3], [0, 4, 3]];
for (const [dx, dy, t] of flame) cv.set(x + dx, y - h - dy, fl[t]);
cv.claim(x - 1, y - h - 4, x + 2, y);
cv.glow(x + 0.5, y - h - 2, 34, [1, 0.6, 0.25], 0.6);
(cv.meta.torches ||= []).push([x, y - h - 2]);
}
function fall(cv, x, y0, o) {
const W = cv.W, w = o.w ?? 3, cols = o.cols.map(col);
let y = y0;
while (y < cv.H - 1 && !cv.solid[y * W + x] && !cv.liquid[y * W + x]) y++;
for (let yy = y0; yy < y; yy++) {
const wob = Math.round((hash2(yy >> 2, 0, o.seed) - 0.5) * 1.2);
for (let dx = -w; dx <= w; dx++) {
const xx = x + dx + wob;
if (xx < 0 || xx >= W) continue;
const k = yy * W + xx, a = Math.abs(dx) / (w + 0.5);
cv.paint(k, cols[Math.min(cols.length - 1, Math.floor(a * cols.length + (hash2(xx, yy >> 1, o.seed) > 0.8 ? 1 : 0)))]);
cv.liquid[k] = 1; cv.open[k] = 0;
}
}
for (let dx = -w - 3; dx <= w + 3; dx++) for (let j = 0; j < 3; j++) {
const xx = x + dx, yy = y - j;
if (xx < 0 || xx >= W || yy < 0 || hash2(xx, j, o.seed + 1) < 0.3 + j * 0.25) continue;
cv.set(xx, yy, cols[Math.min(cols.length - 1, j)]);
}
cv.block(x - w - 6, y - 10, x + w + 7, y + 2);
if (o.rgb) {
cv.glow(x, y - 4, 28, o.rgb, 0.55);
for (let yy = y0 + 10; yy < y - 10; yy += 18) cv.glow(x, yy, 18, o.rgb, 0.3);
}
(cv.meta.falls ||= []).push([x, y0, y, w]);
return y;
}
function ruins(cv, o) {
const fill = col(o.fill), line = col(o.line), rim = col(o.rim || o.fill), W = cv.W;
const cols = [];
for (let i = 0; i < o.n; i++) {
const cx = Math.round(((i + 0.2 + hash2(i, 1, o.seed) * 0.6) / o.n) * W), w = 10 + Math.floor(hash2(i, 2, o.seed) * 8), h = 50 + hash2(i, 3, o.seed) * 70;
cols.push([cx, w, h]);
const top = o.floor - h;
for (let y = Math.max(0, Math.floor(top - 8)); y < o.floor + 10; y++) for (let x = cx - w / 2; x < cx + w / 2; x++) {
if (x < 0 || x >= W) continue;
const bt = top - Math.floor(hash2(Math.floor((x - cx + w) / 4), i, o.seed) * 3) * 4;
if (y < bt) continue;
const row = Math.floor((y - top) / 5), off = row % 2 ? 3 : 0, mortar = (y - top) % 5 === 4 || ((x - cx + off + 40) % 7) === 0;
cv.set(Math.floor(x), y, y < bt + 1 ? rim : mortar ? line : far(fill, Math.floor(x), y, o.seed + i));
}
}
for (let i = 0; i + 1 < cols.length; i += 2) {
const [ax, aw, ah] = cols[i], [bx, bw, bh] = cols[i + 1];
if (bx - ax > 120 || hash2(i, 9, o.seed) < 0.3) continue;
const cx = (ax + bx) / 2, r = (bx - ax) / 2, y0 = o.floor - Math.min(ah, bh) + 8, t = 6;
for (let y = Math.floor(y0 - r - t); y <= y0; y++) for (let x = Math.floor(cx - r - t); x <= cx + r + t; x++) {
const d = Math.hypot(x - cx, (y - y0) * 1.1);
if (x < 0 || x >= W || y < 0 || d < r - aw / 2 || d > r - aw / 2 + t) continue;
cv.set(x, y, (Math.floor(Math.atan2(y - y0, x - cx) * 9) % 2 === 0 && Math.abs(d - (r - aw / 2 + t / 2)) > 2) ? far(fill, x, y, o.seed) : line);
}
}
}
function finish(cv, k = 0.55) {
const W = cv.W, H = cv.H;
if (k > 0) cv.wash(0xff000000, (x, y) => {
const u = (x - W / 2) / (W * 0.62), v = (y - H * 0.55) / (H * 0.75), t = Math.max(0, u * u + v * v - 0.3) * k;
return t > 0.01 ? Math.min(0.8, t) : 0;
});
illuminate(cv, cv.pending);
cv.pending = [];
}
function ledgeTops(cv, n, seed, rise = 12) {
const W = cv.W, /** @type {[number, number][]} */ all = [];
for (let k = W; k < cv.open.length; k++) {
const x = k % W, y = Math.floor(k / W);
if (cv.open[k] && cv.solid[k] && !cv.solid[k - W] && cv.ground && y < cv.ground[x] - rise) all.push([x, y]);
}
const out = [];
for (let i = 0; i < n * 4 && out.length < n && all.length; i++) {
const p = all[Math.floor(hash2(i, 0, seed) * all.length)];
if (!out.some(([x, y]) => Math.abs(x - p[0]) < 14 && Math.abs(y - p[1]) < 10)) out.push(p);
}
return out;
}
function veins(cv, p, o) {
const W = cv.W, H = cv.H, S = cv.solid, L = cv.liquid, seed = o.seed, reach = o.reach ?? 60, soak = o.soak ?? 10, k = o.k ?? 0.7;
const from = o.from.map(col), to = col(o.to), w0 = o.w ?? 3;
const x0 = Math.max(0, p.x0 - reach), x1 = Math.min(W - 1, p.x1 + reach), y0 = Math.max(0, p.level - 4);
const px = cv.pix.px;
const dist = new Float32Array(W * H).fill(1e3);
for (let y = y0; y < H; y++) for (let x = x0; x <= x1; x++) if (L[y * W + x]) dist[y * W + x] = 0;
for (let pass = 0; pass < 2; pass++) {
const fwd = pass === 0, d1 = fwd ? -1 : 1;
for (let yy = 0; yy < H - y0; yy++) {
const y = fwd ? y0 + yy : H - 1 - yy;
for (let xx = 0; xx <= x1 - x0; xx++) {
const x = fwd ? x0 + xx : x1 - xx, i = y * W + x;
if (!S[i]) continue;
let d = dist[i];
const sx = x + d1 >= x0 && x + d1 <= x1, sy = y + d1 >= y0 && y + d1 < H;
if (sx) d = Math.min(d, dist[i + d1] + 1);
if (sy) d = Math.min(d, dist[i + d1 * W] + 1);
if (sx && sy) d = Math.min(d, dist[i + d1 * W + d1] + 1.41);
if (sx && y - d1 >= y0 && y - d1 < H) d = Math.min(d, dist[i - d1 * W + d1] + 1.41);
dist[i] = d;
}
}
}
const wet = new Float32Array(W * H), vt = new Float32Array(W * H).fill(1);
const n = o.n ?? 6, walkers = [];
for (let v = 0; v < n; v++) {
const sx = Math.round(p.x0 + (v + 0.2 + hash2(v, 1, seed) * 0.6) / n * (p.x1 - p.x0));
let sy = p.level;
while (sy < H - 1 && !S[sy * W + sx]) sy++;
const out = (sx - (p.x0 + p.x1) / 2) / Math.max(1, (p.x1 - p.x0) / 2);
walkers.push([sx, sy - 1, Math.PI / 2 - out * 1.1 + (hash2(v, 2, seed) - 0.5) * 0.6, reach * (0.55 + hash2(v, 3, seed) * 0.45), 0, w0, v]);
}
for (let wi = 0; wi < walkers.length && wi < n * 3; wi++) {
let [x, y, a, len, t0, wd, id] = walkers[wi];
for (let t = 0; t < len; t++) {
const xi = Math.round(x), yi = Math.round(y);
if (xi < 1 || xi >= W - 1 || yi >= H - 1 || yi < 0) break;
if (!S[yi * W + xi] && !L[yi * W + xi]) break;
const u = t0 + (1 - t0) * (t / len), r = 0.9 + wd * 1.1 * (1 - u) ** 1.5, R = Math.ceil(r);
for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
const q = (yi + j) * W + xi + i;
if (q < 0 || q >= W * H || !S[q]) continue;
const e = 1 - Math.sqrt(i * i + j * j) / (r + 0.5);
if (e <= 0) continue;
const v = e * (1 - u * 0.75);
if (v > wet[q]) { wet[q] = v; vt[q] = u; }
}
a += (hash2(id, t, seed + 5) - 0.5) * 0.75 + (Math.PI / 2 - a) * 0.025;
x += Math.cos(a); y += Math.max(-0.2, Math.sin(a));
if (hash2(id, t, seed + 6) < (o.branch ?? 0.015) && t > 4 && walkers.length < n * 3) walkers.push([x, y, a + (hash2(id, t, seed + 7) < 0.5 ? -0.7 : 0.7), (len - t) * 0.6, u, wd * (1 - u) * 0.8, id * 31 + t]);
}
}
const lum = (/** @type {number} */ c) => (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11;
const crev = new Float32Array(W * H);
for (let y = y0; y < H; y++) for (let x = x0; x <= x1; x++) {
const i = y * W + x;
if (!S[i] || (dist[i] >= soak && wet[i] <= 0)) continue;
let sum = 0, m = 0;
for (let j = -2; j <= 2; j++) for (let ii = -2; ii <= 2; ii++) {
const xx = x + ii, yy = y + j;
if (xx < 0 || xx >= W || yy < 0 || yy >= H || !S[yy * W + xx]) continue;
sum += lum(px[yy * W + xx]); m++;
}
const avg = sum / m;
crev[i] = Math.max(0, Math.min(1, (avg - lum(px[i])) / (avg * 0.18 + 4)));
}
const grad = (/** @type {number} */ u) => { const f = Math.min(from.length - 1.001, u * (from.length - 1)), i = Math.floor(f); return mixPacked(from[i], from[i + 1], f - i); };
const light = new Float32Array(W * H);
for (let y = y0; y < H; y++) for (let x = x0; x <= x1; x++) {
const i = y * W + x;
if (!S[i]) continue;
const d = dist[i];
let bed = 0;
if (d < soak) bed = (1 - d / soak) ** 1.6 * (0.75 + fbm2(x * 0.15, y * 0.15, seed + 9, 2) * 0.5);
const gap = Math.min(1, Math.max(0, (fbm2(x * 0.3, y * 0.3, seed + 11, 2) - vt[i] * 0.95 + 0.1) / 0.1));
const s = wet[i] * gap * (0.7 + (1 - vt[i]) * 0.3);
if (bed <= 0 && s <= 0) continue;
const c = crev[i], u = Math.min(1, vt[i] + (1 - Math.min(1, s)) * 0.3);
const stain = Math.min(0.85, (bed * 0.7 + s * 0.45) * k);
cv.paint(i, mixPacked(px[i], to, stain));
const fill = Math.min(0.95, bed * c * 1.7 + Math.max(0, s * (c * 1.7 + 0.08) - 0.12) + bed * bed * 0.2);
if (fill > 0) cv.paint(i, mixPacked(px[i], s > bed ? grad(u) : from[Math.min(from.length - 1, 1)], fill));
light[i] = Math.max(bed * 0.5, fill * (1 - u * 0.6));
}
if (o.rgb) {
const g = o.glow ?? 0.4, rgb = o.rgb, R = 4;
const spread = new Float32Array(W * H);
for (let y = y0; y < H; y++) for (let x = x0; x <= x1; x++) {
const v = light[y * W + x];
if (v < 0.05) continue;
for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
const xx = x + i, yy = y + j;
if (xx >= 0 && xx < W && yy >= 0 && yy < H) spread[yy * W + xx] += v * 0.05 * Math.exp(-(i * i + j * j) / 5);
}
}
cv.light(rgb, (x, y) => Math.min(0.6, spread[y * W + x] * g), y0, H);
}
}
const WATER_VEINS = (seed, from = ['#6aaac8', '#4a8aa8', '#36708c', '#2a5a70']) => ({ from, to: '#14262e', seed, n: 6, reach: 54, soak: 11, k: 0.6, w: 1.8, branch: 0.025, rgb: [0.35, 0.65, 0.8], glow: 0.35 });
const LAVA_VEINS = (seed) => ({ from: ['#ffd060', '#ffb040', '#ff8a2a', '#e05a18', '#a8320e', '#5a1a0c'], to: '#8a2a10', seed, n: 4, reach: 60, soak: 5, k: 0.6, w: 1, branch: 0.012, rgb: [1, 0.45, 0.14], glow: 0.35 });
return { farPillars, fog, caveFrame, vines, moss, glowShrooms, torch, fall, ruins, finish, ledgeTops, veins, WATER_VEINS, LAVA_VEINS };
})();
// src/visual/env/legible.js
const __m27 = (() => {
const { hash2, fbm2, noise2 } = __m18;
const { mixPacked } = __m2;
const { Rng } = __m10;
const luma = (c) => 0.3 * (c & 255) + 0.59 * ((c >>> 8) & 255) + 0.11 * ((c >>> 16) & 255);
const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);
function saturate(c, k) {
const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255, l = luma(c);
const f = (v) => clampI(Math.round(l + (v - l) * k), 0, 255);
return ((c & 0xff000000) | (f(b) << 16) | (f(g) << 8) | f(r)) >>> 0;
}
const INK = 0xff100810, WHITE = 0xffffffff, BLACK = 0xff000000, BOULDER = 0xff8c949c;
const ROOTED = new Set(['forest', 'meadow', 'river', 'netherwood', 'moonfen']);
function legible(cv, region) {
const W = cv.W, H = cv.H, N = W * H, S = cv.solid, seed = cv.seed;
const thing = (k) => cv.things[k] === 1 || cv.trees[k] === 1;
const ground = (k) => S[k] === 1 || cv.rock[k] === 1;
const depth = new Uint16Array(N);
for (let x = 0; x < W; x++) { let d = 0; for (let y = 0; y < H; y++) { const k = y * W + x; d = ground(k) ? (y && ground(k - W) ? d + 1 : 0) : 0; depth[k] = d; } }
const layers = cv.sw ? [cv.pix.px, cv.sw.bare] : [cv.pix.px], orig = cv.pix.px.slice();
let r = 0, g = 0, b = 0, n = 0, L = 0;
for (let k = 0; k < N; k++) {
if (ground(k) || thing(k) || cv.liquid[k] || cv.cave[k]) continue;
const c = cv.pix.px[k];
if (!(c >>> 24)) continue;
r += c & 255; g += (c >>> 8) & 255; b += (c >>> 16) & 255; L += luma(c); n++;
}
const amb = n ? (255 << 24 | Math.round(b / n) << 16 | Math.round(g / n) << 8 | Math.round(r / n)) >>> 0 : BLACK, mean = n ? L / n : 128;
for (const px of layers) {
for (let k = 0; k < N; k++) {
const c = px[k];
if (!(c >>> 24)) continue;
const x = k % W, y = (k - x) / W;
if (ground(k)) {
const d = depth[k];
if (d < 3 || (cv.stratum && cv.stratum[k])) continue; // the crust and grass on top, and the strata, stay as painted
const lay = Math.floor((y + noise2(x * 0.025, 0, seed + 3) * 10) / 12), which = hash2(lay, 7, seed);
px[k] = which > 0.7 ? mixPacked(c, WHITE, 0.06) : which < 0.3 ? mixPacked(c, BLACK, 0.09) : c;
continue;
}
if (cv.things[k]) { px[k] = saturate(c, 1.1); continue; }
if (cv.trees[k] || cv.liquid[k] || cv.cave[k]) continue;
px[k] = mixPacked(c, amb, 0.03);
}
}
const rng = new Rng(seed ^ 0x51ab);
const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const k = y * W + x; if (!ground(k) || depth[k] < 3) return; for (const px of layers) px[k] = c; };
const shade = (x, y, t, toward = BLACK) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const k = y * W + x; if (!ground(k) || depth[k] < 3) return; for (const px of layers) px[k] = mixPacked(px[k], toward, t); };
const bedded = [];
for (let i = 0; i < N / 520; i++) {
const cx = rng.int(4, W - 5), cy = rng.int(4, H - 3), k0 = cy * W + cx;
const rx = rng.range(3, 8.5), ry = rx * rng.range(0.5, 0.7);
if (!ground(k0) || depth[k0] < ry + 5) continue;
if (cv.stratum && (cv.stratum[k0] || cv.stratum[Math.max(0, k0 - Math.ceil(ry + 1) * W)])) continue;
if (bedded.some(([x, y, r]) => Math.abs(x - cx) < r + rx + 2 && Math.abs(y - cy) < (r + rx) * 0.6 + 2)) continue;
bedded.push([cx, cy, rx]);
let ar = 0, ag = 0, ab = 0, an = 0;
for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
if (x < 0 || y < 0 || x >= W || y >= H) continue;
const c = cv.pix.px[y * W + x]; ar += c & 255; ag += (c >>> 8) & 255; ab += (c >>> 16) & 255; an++;
}
const base = mixPacked((255 << 24 | Math.round(ab / an) << 16 | Math.round(ag / an) << 8 | Math.round(ar / an)) >>> 0, BOULDER, 0.42);
const tones = [mixPacked(base, WHITE, 0.42), mixPacked(base, WHITE, 0.2), base, mixPacked(base, BLACK, 0.22), mixPacked(base, BLACK, 0.42)];
for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, e = u * u + v * v;
if (e > 1.3) continue;
if (e > 1) { shade(x, y, v > 0 ? 0.6 : 0.4, INK); continue; }
const lit = -(u * 0.5 + v * 0.9) + (1 - e) * 0.25;
let t = lit > 0.75 && e < 0.45 ? 0 : lit > 0.4 ? 1 : lit > -0.1 ? 2 : lit > -0.55 ? 3 : 4;
if (e > 0.75 && v > 0.3) t = 4;
if (e < 0.8 && hash2(x, y, seed + 31) < 0.03) t = 4;
put(x, y, tones[t]);
}
}
if (ROOTED.has(region)) {
const root = [0xff1a2a3a, 0xff2a4458, 0xff3a5a74];
for (let x = 0; x < W; x++) {
if (hash2(x, 3, seed) > 0.05) continue;
let y = 0;
while (y < H - 1 && !(ground(y * W + x) && depth[y * W + x] === 3)) y++;
if (y >= H - 2) continue;
let px_ = x;
const len = 5 + Math.floor(hash2(x, 4, seed) * 12);
for (let j = 0; j < len; j++) {
put(px_, y + j, root[j < len - 3 ? 2 : 1]); put(px_ + 1, y + j, root[0]);
if (hash2(x, j, seed + 5) < 0.3) px_ += hash2(x, j, seed + 6) < 0.5 ? -1 : 1;
}
}
}
const isG = new Uint8Array(N), isT = new Uint8Array(N);
for (let k = 0; k < N; k++) { isG[k] = ground(k) ? 1 : 0; isT[k] = cv.things[k] ? 1 : 0; }
for (const px of layers) {
const src = px.slice();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
const k = y * W + x;
if (isG[k]) {
if (x > 0 && !isG[k - 1] && !isT[k - 1] && !cv.trees[k - 1] && !cv.liquid[k - 1] && depth[k] >= 2) px[k] = mixPacked(src[k], WHITE, 0.1);
continue;
}
if (cv.liquid[k] || !(src[k] >>> 24)) continue;
if (isT[k] || cv.trees[k]) continue;
const gR = x < W - 1 && isG[k + 1], gL = x > 0 && isG[k - 1], gU = y > 0 && isG[k - W];
const tN = (x > 0 && isT[k - 1]) || (x < W - 1 && isT[k + 1]) || (y > 0 && isT[k - W]) || (y < H - 1 && isT[k + W]);
if (tN) { const deep = (x > 0 && isT[k - 1]) || (y > 0 && isT[k - W]); px[k] = mixPacked(src[k], INK, deep ? 0.45 : 0.28); }
else if (gU) px[k] = mixPacked(src[k], INK, 0.32);
else if (gL) px[k] = mixPacked(src[k], INK, 0.26);
else if (gR) px[k] = mixPacked(src[k], INK, 0.18);
}
}
crowns(cv, layers);
if (cv.sw) {
const sw = cv.sw, px = cv.pix.px;
for (let i = 0; i < sw.k.length; i++) if (sw.c[i] === orig[sw.k[i]]) sw.c[i] = px[sw.k[i]];
}
}
function crowns(cv, layers) {
const W = cv.W, H = cv.H, N = W * H, T = cv.trees, px = cv.pix.px, CONTRAST = 46, R = 9;
const back = (/** @type {number} */ k) => !T[k] && !cv.solid[k] && !cv.rock[k] && !cv.liquid[k] && !cv.things[k] && !cv.props[k];
const sum = (/** @type {(k:number) => number} */ val, /** @type {(k:number) => boolean} */ use) => {
const I = new Float64Array((W + 1) * (H + 1)), C = new Float64Array((W + 1) * (H + 1));
for (let y = 0; y < H; y++) {
let rs = 0, rc = 0;
for (let x = 0; x < W; x++) {
const k = y * W + x;
if (use(k)) { rs += val(k); rc++; }
const q = (y + 1) * (W + 1) + x + 1;
I[q] = I[q - W - 1] + rs; C[q] = C[q - W - 1] + rc;
}
}
return (/** @type {number} */ x, /** @type {number} */ y) => {
const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(W, x + R + 1), y1 = Math.min(H, y + R + 1);
const a = y0 * (W + 1) + x0, b = y0 * (W + 1) + x1, c = y1 * (W + 1) + x0, d = y1 * (W + 1) + x1;
const n = C[d] - C[b] - C[c] + C[a];
return n > 0 ? [(I[d] - I[b] - I[c] + I[a]) / n, n] : [-1, 0];
};
};
let any = false;
for (let k = 0; k < N; k++) if (T[k]) { any = true; break; }
if (!any) return;
const bg = sum((k) => luma(px[k]), back), tr = sum((k) => luma(px[k]), (k) => T[k] === 1);
const home = new Uint8Array(N);
if (cv.sw) { const sw = cv.sw; for (let i = 0; i < sw.k.length; i++) if (sw.c[i] === px[sw.k[i]]) home[sw.k[i]] = 1; }
const scale = (/** @type {number} */ c, /** @type {number} */ f, /** @type {number} */ add) => {
const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
const m = (/** @type {number} */ v) => clampI(Math.round(v * f + add), 0, 255);
return ((c & 0xff000000) | (m(b) << 16) | (m(g) << 8) | m(r)) >>> 0;
};
const lit = (/** @type {number} */ x, /** @type {number} */ y) => (x > 0 && back(y * W + x - 1)) || (y > 0 && back((y - 1) * W + x));
{
const L = layers[0];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
const k = y * W + x;
if (!T[k] || !home[k]) continue;
const [b, nb] = bg(x, y);
if (nb < 6) continue;
const [t] = tr(x, y), c = L[k];
let f = 1, add = 0;
if (b < 110) {
if (t < b + CONTRAST) { f = Math.min(2.3, (b + CONTRAST) / Math.max(12, t)); add = Math.max(0, (b + CONTRAST - t * f)) * 0.6; }
} else if (t > b - CONTRAST) f = Math.max(0.88, (b - CONTRAST) / Math.max(1, t));
if (lit(x, y) && b < 110) { f *= 1.12; add += 6; }
if (f !== 1 || add) L[k] = saturate(scale(c, f, add), f > 1 ? 1.05 : 1);
}
}
}
return { legible };
})();
// src/visual/env/flourish.js
const __m28 = (() => {
const { hash2 } = __m18;
const { col } = __m24;
const FLORA = {
meadow: {
kinds: [['tuft', 4], ['daisy', 3], ['spike', 1.6], ['bloom', 2], ['fern', 0.8]], rate: 0.3,
cols: { blade: ['#2e6a22', '#4e9a34', '#7ac046', '#a8dc5a'], petal: ['#ffffff', '#fff4c0', '#ffd8e8'], eye: ['#ffd040', '#f0a020'], spike: ['#5a3a9a', '#8a62d0', '#b898f0'], bloom: ['#ff7a8a', '#ffb0c8', '#ffe066', '#c9b0ff'] },
creep: { cols: ['#6a1e1a', '#9a2e22', '#c04a30'], leaf: '#4e9a34', berry: '#e8403a', rate: 0.5 },
},
forest: {
kinds: [['tuft', 3], ['fern', 3], ['bloom', 1.4], ['cap', 1.2], ['daisy', 1]], rate: 0.2,
cols: { blade: ['#1e4a1e', '#2e6a2a', '#4e8a34', '#78ac48'], petal: ['#f4ecd8', '#f0c8d8'], eye: ['#e8b040'], bloom: ['#f08ab0', '#e85a8a', '#f0e0a0'], cap: ['#8a4a2a', '#b8683a', '#e0c8a0'] },
creep: { cols: ['#2a4a1e', '#3e6a2a', '#5a8a34'], leaf: '#6aa83a', berry: '#c03a3a', rate: 0.45 },
},
netherwood: {
kinds: [['tuft', 3], ['glowcap', 1.6], ['spike', 1.6], ['daisy', 1.2], ['fern', 1.2]], rate: 0.2,
cols: { blade: ['#16473f', '#226f62', '#3aa993', '#72dbc0'], petal: ['#e8e0ff', '#c8f0ff'], eye: ['#a080ff'], spike: ['#65449b', '#a26ae0', '#d3a7ff'], cap: ['#6f36b0', '#b46aff', '#f1d5ff'] },
creep: { cols: ['#4a1414', '#7a1e1a', '#a83020'], leaf: '#3e7a6a', berry: '#ff5a6a', rate: 0.55 },
glow: [0.7, 0.4, 1],
},
river: {
kinds: [['tuft', 4], ['daisy', 2.4], ['cattail', 1.6], ['fern', 1.4], ['bloom', 1]], rate: 0.24,
cols: { blade: ['#2a5a26', '#4a8a30', '#6ab040', '#98d05a'], petal: ['#ffffff', '#fff4c0'], eye: ['#ffd040'], bloom: ['#ffe58a', '#c9b0ff', '#ffffff'], cat: ['#3a2414', '#6a4024', '#8a5a34'] },
creep: { cols: ['#2a4a1e', '#3e6a2a', '#5a8a34'], leaf: '#7ac04a', rate: 0.3 },
},
quarry: {
kinds: [['tuft', 4], ['daisy', 1]], rate: 0.07,
cols: { blade: ['#5a5a2a', '#7a7a34', '#a09a48', '#c8bc6a'], petal: ['#ffffff', '#f4ecd8'], eye: ['#e8b040'] },
},
moonfen: {
kinds: [['tuft', 3], ['puff', 1.8], ['shard', 1.2], ['glowcap', 1.2], ['cattail', 1]], rate: 0.2,
cols: { blade: ['#14322a', '#1e4a3c', '#2e6a52', '#4a9a78'], puff: ['#c8d8f0', '#ffffff'], shard: ['#3a6ab0', '#6ab0f0', '#c8f0ff'], cap: ['#1e5a8a', '#4ab0f0', '#c0f0ff'], cat: ['#1a1e2a', '#2e3446', '#464e66'] },
creep: { cols: ['#14322a', '#1e4a3c', '#2e6a52'], leaf: '#4a9a78', berry: '#8ff0ff', rate: 0.4 },
glow: [0.45, 0.8, 1],
},
crags: {
kinds: [['tuft', 4], ['bloom', 1.4], ['cap', 0.6]], rate: 0.12,
cols: { blade: ['#3a3418', '#5a5a26', '#7a7a34', '#a09a48'], bloom: ['#ff5a2a', '#ff8a3a', '#ffd060'], cap: ['#6a2a14', '#c04a1e', '#ffb060'] },
},
};
function flourish(cv, region) {
const f = FLORA[region];
if (!f) return;
const W = cv.W, H = cv.H, seed = cv.seed ^ 0x6f1a;
const swaying = new Uint8Array(W * H);
if (cv.sw) for (const k of cv.sw.k) swaying[k] = 1;
const cols = Object.fromEntries(Object.entries(f.cols).map(([k, v]) => [k, v.map(col)]));
const air = (x, y) => {
if (x < 0 || y < 0 || x >= W || y >= H) return false;
const k = y * W + x;
return !cv.solid[k] && !cv.liquid[k] && !cv.rock[k] && !cv.trees[k] && !cv.things[k] && !cv.props[k] && !swaying[k];
};
const put = (x, y, c) => { if (air(x, y)) cv.set(x, y, c); };
const total = f.kinds.reduce((t, [, w]) => t + w, 0);
const pick = (r) => { let a = r * total; for (const [k, w] of f.kinds) { if ((a -= w) < 0) return k; } return f.kinds[0][0]; };
const glows = [];
const last = new Int16Array(H).fill(-99);
for (let x = 3; x < W - 3; x++) {
for (let y = 2; y < H - 2; y++) {
const k = y * W + x;
if (!cv.solid[k] || cv.liquid[k] || cv.solid[k - W] || cv.liquid[k - W] || !cv.open[k] || !air(x, y - 1)) continue;
if (hash2(x, y, seed) > f.rate) continue;
let near = false;
for (let j = Math.max(0, y - 3); j <= Math.min(H - 1, y + 3); j++) if (x - last[j] < 3) near = true;
if (near) continue;
const kind = pick(hash2(x, y, seed + 1)), r = (/** @type {number} */ i) => hash2(x * 31 + i, y, seed + 2 + i);
const fx = r(9) < 0.5 ? -1 : 1;
const drawn = PLANTS[kind]?.(put, x, y - 1, r, cols, fx);
if (drawn && f.glow && (kind === 'glowcap' || kind === 'shard')) glows.push([x, y - 3]);
if (drawn && (kind === 'tuft' || kind === 'fern')) cv.grass[k] = 1;
last[y] = x;
}
}
for (const [x, y] of glows) cv.glow(x, y, 9, f.glow, 0.35);
if (f.creep) creepers(cv, f.creep, seed + 7, swaying);
EXTRAS[region]?.(cv, seed + 11, swaying);
}
const EXTRAS = {
quarry: (cv, seed) => ore(cv, seed),
river: (cv, seed, sw) => bells(cv, seed, sw, { cols: [['#28a4bb', '#6ae5f1', '#ddffff']], stem: ['#448a30', '#6aaf3e'], rgb: [[0.3, 0.85, 1]], n: 4 }),
netherwood: (cv, seed, sw) => bells(cv, seed, sw, { cols: [['#c03a6a', '#ff7aa8', '#ffd0e0'], ['#c8862a', '#ffc860', '#fff0c0']], stem: ['#2e5a3a', '#4a2e22'], rgb: [[1, 0.45, 0.65], [1, 0.75, 0.35]], n: 6 }),
moonfen: (cv, seed, sw) => bells(cv, seed, sw, { cols: [['#6a3ac0', '#a878ff', '#e8d0ff'], ['#2a7ab0', '#6ad0ff', '#d8f8ff']], stem: ['#1e4a3c', '#2e6a52'], rgb: [[0.7, 0.45, 1], [0.4, 0.85, 1]], n: 5 }),
};
function depthOf(cv, x, y) {
let d = 0;
while (y - d - 1 >= 0 && cv.solid[(y - d - 1) * cv.W + x] && d < 40) d++;
return d;
}
function ore(cv, seed) {
const W = cv.W, H = cv.H, ink = col('#3a2410'), gold = [col('#b8781e'), col('#e8b030'), col('#fff0a0')], quartz = [col('#9aa0a8'), col('#e4e8ec'), col('#ffffff')];
const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cv.solid[y * W + x] && !cv.liquid[y * W + x] && !cv.things[y * W + x] && depthOf(cv, x, y) > 4;
for (let i = 0; i < 60; i++) {
const cx = Math.floor(hash2(i, 1, seed) * W), cy = Math.floor(hash2(i, 2, seed) * H);
if (!ok(cx, cy)) continue;
const g = hash2(i, 3, seed) < 0.75 ? gold : quartz, n = 3 + Math.floor(hash2(i, 4, seed) * 6);
for (let j = 0; j < n; j++) {
const x = cx + Math.round((hash2(i, j * 3 + 5, seed) - 0.5) * 12), y = cy + Math.round((hash2(i, j * 3 + 6, seed) - 0.5) * 7), w = 1 + Math.floor(hash2(i, j * 3 + 7, seed) * 2);
if (!ok(x, y) || !ok(x + w, y + 1)) continue;
for (let yy = -1; yy <= 2; yy++) for (let xx = -1; xx <= w + 1; xx++) if (ok(x + xx, y + yy) && (yy < 0 || yy > 1 || xx < 0 || xx > w)) cv.set(x + xx, y + yy, ink);
for (let yy = 0; yy <= 1; yy++) for (let xx = 0; xx <= w; xx++) cv.set(x + xx, y + yy, g[yy ? 0 : 1]);
cv.set(x, y, g[2]);
}
}
}
function bells(cv, seed, swaying, o) {
const W = cv.W, H = cv.H, stem = o.stem.map(col), cols = o.cols.map((c) => c.map(col));
const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !cv.solid[y * W + x] && !cv.rock[y * W + x] && !cv.trees[y * W + x] && !cv.things[y * W + x] && !swaying[y * W + x] && !cv.liquid[y * W + x];
const spots = [];
for (let x = 6; x < W - 6; x++) for (let y = 4; y < 90; y++) if (cv.rock[y * W + x] && free(x, y + 1)) { spots.push([x, y + 1]); break; }
const out = [];
for (let i = 0; i < spots.length && out.length < o.n; i++) {
const [x, y] = spots[Math.floor(hash2(i, 1, seed) * spots.length)];
if (out.some((p) => Math.abs(p[0] - x) < 34)) continue;
const len = 10 + Math.floor(hash2(i, 2, seed) * 26), kind = Math.floor(hash2(i, 3, seed) * cols.length), C = cols[kind];
let ok = true;
for (let j = 0; j < len + 6; j++) if (!free(x, y + j)) { ok = false; break; }
if (!ok) continue;
let sx = x;
for (let j = 0; j < len; j++) {
if (j && hash2(i, j, seed + 3) < 0.15) sx += hash2(i, j, seed + 4) < 0.5 ? -1 : 1;
if (free(sx, y + j)) cv.set(sx, y + j, stem[j % 4 ? 0 : 1]);
if (hash2(i, j, seed + 5) < 0.12 && free(sx + 1, y + j)) cv.set(sx + 1, y + j, stem[0]);
}
const by = y + len;
for (const [dx, dy] of [[0, 0], [-3, -2], [3, -1], [-1, 3]].slice(0, 2 + Math.floor(hash2(i, 6, seed) * 3))) {
const bx = sx + dx, yy = by + dy;
if (dx) for (let j = Math.min(0, dy); j < 0; j++) cv.set(sx + Math.sign(dx), yy + j + 1, stem[0]);
for (const [px, py, t] of [[0, 0, 1], [-1, 1, 0], [0, 1, 2], [1, 1, 1], [-1, 2, 1], [0, 2, 2], [1, 2, 1], [-1, 3, 0], [1, 3, 0]]) if (free(bx + px, yy + py)) cv.set(bx + px, yy + py, C[t]);
}
cv.glow(sx, by + 2, 18, o.rgb[kind], 0.5);
out.push([sx, by + 2]);
}
(cv.meta.bells ||= []).push(...out);
}
const PLANTS = {
tuft(put, x, y, r, c, fx) {
const B = c.blade, h = 3 + Math.floor(r(1) * 4);
for (const [dx, k] of [[0, 1], [-1, 0.75], [1, 0.8], [-2, 0.45], [2, 0.5]]) {
if (Math.abs(dx) === 2 && r(2 + dx) < 0.4) continue;
const hh = Math.max(1, Math.round(h * k * (0.8 + r(5 + dx) * 0.4)));
for (let j = 0; j < hh; j++) {
const lean = Math.abs(dx) && j > hh * 0.5 ? Math.sign(dx) : j > hh * 0.7 && !dx ? fx : 0;
put(x + dx + lean, y - j, B[Math.min(B.length - 1, Math.floor((j / hh) * B.length + (dx ? 0 : 0.6)))]);
}
}
return true;
},
daisy(put, x, y, r, c) {
const n = 1 + Math.floor(r(1) * 3);
put(x - 1, y, c.blade[1]); put(x + 1, y, c.blade[1]);
for (let i = 0; i < n; i++) {
const dx = (i - (n - 1) / 2) * 3 + Math.round((r(2 + i) - 0.5) * 2), h = 2 + Math.floor(r(5 + i) * 4), p = c.petal[Math.floor(r(8 + i) * c.petal.length)];
for (let j = 0; j < h; j++) put(x + dx, y - j, c.blade[j ? 2 : 1]);
const hy = y - h - 1;
put(x + dx - 1, hy, p); put(x + dx + 1, hy, p); put(x + dx, hy - 1, p); put(x + dx, hy + 1, p);
put(x + dx, hy, c.eye[Math.floor(r(11 + i) * c.eye.length)]);
}
return true;
},
spike(put, x, y, r, c) {
const S = c.spike, n = 1 + Math.floor(r(1) * 3);
put(x - 1, y, c.blade[1]); put(x + 1, y, c.blade[1]); put(x, y, c.blade[0]);
for (let i = 0; i < n; i++) {
const dx = (i - (n - 1) / 2) * 2, h = 5 + Math.floor(r(2 + i) * 5), head = 3 + Math.floor(r(5 + i) * 2);
for (let j = 1; j < h - head; j++) put(x + dx, y - j, c.blade[2]);
for (let j = h - head; j < h; j++) {
put(x + dx, y - j, S[(j + i) % 2 ? 1 : 2]);
if ((j - (h - head)) % 2 === 0 && j < h - 1) { put(x + dx - 1, y - j, S[0]); put(x + dx + 1, y - j, S[1]); }
}
put(x + dx, y - h, S[2]);
}
return true;
},
bloom(put, x, y, r, c) {
const B = c.bloom, p = B[Math.floor(r(1) * B.length)], h = 3 + Math.floor(r(2) * 4);
for (let j = 0; j < h; j++) put(x, y - j, c.blade[1 + (j > 1 ? 1 : 0)]);
put(x - 1, y - 1, c.blade[2]); put(x + 1, y - 2, c.blade[3] ?? c.blade[2]);
const hy = y - h;
for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 0], [-1, -1], [1, -1], [0, -2]]) put(x + dx, hy + dy, p);
put(x, hy - 1, 0xffffffff);
return true;
},
fern(put, x, y, r, c, fx) {
const B = c.blade, n = 3 + Math.floor(r(1) * 2);
for (let i = 0; i < n; i++) {
const s = i % 2 ? 1 : -1, len = 4 + Math.floor(r(2 + i) * 4), ang = 0.35 + (i / n) * 0.9;
for (let j = 0; j < len; j++) {
const t = j / len, px = x + Math.round(s * Math.sin(ang) * j * (1 + t * 0.6)), py = y - Math.round(Math.cos(ang) * j - t * t * len * 0.35);
put(px, py, B[Math.min(B.length - 1, 1 + Math.floor(t * (B.length - 1)))]);
if (j % 2 && j < len - 1) put(px, py - 1, B[B.length - 1]);
}
}
put(x, y, B[0]);
put(x + fx, y - 1, B[1]);
return true;
},
cap(put, x, y, r, c) {
const C = c.cap, n = 1 + Math.floor(r(1) * 2);
for (let i = 0; i < n; i++) {
const dx = i ? (r(2) < 0.5 ? -3 : 3) : 0, h = 1 + Math.floor(r(3 + i) * 3) - i;
for (let j = 0; j < Math.max(1, h); j++) put(x + dx, y - j, C[2]);
const cy = y - Math.max(1, h);
for (let d = -1; d <= 1; d++) put(x + dx + d, cy, C[0]);
put(x + dx, cy - 1, C[1]); put(x + dx - 1, cy - 1, C[1]);
if (r(6 + i) < 0.5) put(x + dx + 1, cy - 1, C[0]);
}
return true;
},
glowcap(put, x, y, r, c) {
const C = c.cap, n = 1 + Math.floor(r(1) * 3);
for (let i = 0; i < n; i++) {
const dx = (i - (n - 1) / 2) * 3, h = 2 + Math.floor(r(2 + i) * 3), w = i === Math.floor(n / 2) ? 2 : 1;
for (let j = 0; j < h; j++) put(x + dx, y - j, 0xffe0e8f0);
const cy = y - h;
for (let d = -w; d <= w; d++) put(x + dx + d, cy, C[1]);
for (let d = -w + 1; d <= w - 1; d++) put(x + dx + d, cy - 1, C[2]);
if (w > 1) { put(x + dx - w + 1, cy - 1, C[1]); put(x + dx + w - 1, cy - 1, C[1]); }
}
return true;
},
cattail(put, x, y, r, c) {
const C = c.cat, n = 1 + Math.floor(r(1) * 2);
for (let i = 0; i < n; i++) {
const dx = i * 2 - (n - 1), h = 9 + Math.floor(r(2 + i) * 6);
for (let j = 0; j < h; j++) put(x + dx, y - j, c.blade[j < 2 ? 1 : 2]);
for (let j = h - 6; j < h - 1; j++) { put(x + dx, y - j, C[1]); put(x + dx + 1, y - j, j === h - 6 ? C[0] : C[j < h - 3 ? 0 : 2]); }
put(x + dx, y - h - 1, c.blade[3] ?? c.blade[2]);
}
for (let j = 0; j < 6; j++) put(x - n - (j > 3 ? 1 : 0), y - j, c.blade[Math.min(3, 1 + (j >> 1))]);
return true;
},
puff(put, x, y, r, c) {
const P = c.puff, n = 1 + Math.floor(r(1) * 2);
for (let i = 0; i < n; i++) {
const dx = i ? 3 : 0, h = 4 + Math.floor(r(2 + i) * 4);
for (let j = 0; j < h; j++) put(x + dx, y - j, c.blade[2]);
const hy = y - h - 1;
for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]) put(x + dx + a, hy + b, P[a || b ? 0 : 1]);
put(x + dx - 1, hy - 1, P[1]);
}
return true;
},
shard(put, x, y, r, c) {
const S = c.shard, n = 2 + Math.floor(r(1) * 2);
for (let i = 0; i < n; i++) {
const dx = i - Math.floor(n / 2), h = (i === Math.floor(n / 2) ? 5 : 3) + Math.floor(r(2 + i) * 2);
for (let j = 0; j < h; j++) put(x + dx, y - j, j === h - 1 ? S[2] : S[dx < 0 ? 0 : 1]);
}
return true;
},
};
function creepers(cv, o, seed, swaying) {
const W = cv.W, H = cv.H, S = cv.solid, C = o.cols.map(col), leaf = col(o.leaf), berry = o.berry ? col(o.berry) : 0;
const ground = (x, y) => x >= 0 && y >= 0 && x < W && y < H && S[y * W + x] === 1 && !cv.liquid[y * W + x];
const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !S[y * W + x] && !cv.liquid[y * W + x] && !cv.things[y * W + x] && !cv.trees[y * W + x] && !swaying[y * W + x] && !cv.props[y * W + x];
const done = new Uint8Array(W);
for (let y = 4; y < H - 8; y++) for (let x = 2; x < W - 2; x++) {
if (!ground(x, y) || ground(x, y - 1) || done[x]) continue;
const side = !ground(x - 1, y + 2) && free(x - 1, y + 2) ? -1 : !ground(x + 1, y + 2) && free(x + 1, y + 2) ? 1 : 0;
if (!side || hash2(x, y, seed) > o.rate * 0.25) continue;
done[x] = 1;
const len = 10 + Math.floor(hash2(x, y, seed + 1) * 34);
let cx = x, inward = 0;
for (let j = 2; j < len; j++) {
const yy = y + j;
let fx = cx;
if (!ground(fx, yy)) { if (ground(fx - side, yy)) fx -= side; else if (ground(fx - 2 * side, yy)) fx -= 2 * side; else break; }
while (ground(fx + side, yy) && Math.abs(fx + side - cx) <= 1) fx += side;
if (free(fx + side, yy) === false && ground(fx + side, yy)) break;
cx = fx;
if (hash2(x, j, seed + 2) < 0.3) inward = inward ? 0 : 1;
const px = cx - side * inward;
cv.set(px, yy, C[(j >> 1) % 3 === 0 ? 2 : (j % 3 ? 1 : 0)]);
const h = hash2(x, j, seed + 3);
if (h < 0.16 && free(cx + side, yy)) cv.set(cx + side, yy, leaf);
else if (berry && h > 0.95 && free(cx + side, yy)) cv.set(cx + side, yy, berry);
}
}
}
return { flourish };
})();
// src/visual/env/grade.js
const __m29 = (() => {
const GRADE = {
meadow: [0.25, 1.18, 0.42], forest: [0.24, 1.16, 0.42], netherwood: [0.18, 1.18, 0.4], river: [0.24, 1.18, 0.42],
quarry: [0.23, 1.12, 0.42], moonfen: [0.18, 1.18, 0.4], crags: [0.2, 1.14, 0.42],
pen: [0.25, 1.18, 0],
};
function curve(k) {
const t = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
const v = i / 255, s = v * v * (3 - 2 * v);
t[i] = Math.max(0, Math.min(255, Math.round((v + (s - v) * k * 1.6) * 255)));
}
return t;
}
function gradePx(c, T, sat) {
let r = T[c & 255], g = T[(c >>> 8) & 255], b = T[(c >>> 16) & 255];
const l = 0.3 * r + 0.59 * g + 0.11 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
const chroma = (mx - mn) / 255, k = 1 + (sat - 1) * (1 - chroma * 0.7);
r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
const cl = (/** @type {number} */ v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
return ((c & 0xff000000) | (cl(b) << 16) | (cl(g) << 8) | cl(r)) >>> 0;
}
function grade(cv, region) {
const [con, sat, ink] = GRADE[region] || [0.38, 1.28, 0.4];
const T = curve(con), W = cv.W, H = cv.H, S = cv.solid, px = cv.pix.px, s = cv.sw;
const edges = s ? new Uint8Array(px.length) : null;
const air = (/** @type {number} */ k) => !S[k] && !cv.liquid[k] && !cv.rock[k];
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
const k = y * W + x;
if (!S[k] || cv.liquid[k]) continue;
if (!(air(k - 1) || air(k + 1) || air(k + W)) || air(k - W)) continue;
px[k] = mul(px[k], 1 - ink);
if (s) { s.bare[k] = mul(s.bare[k], 1 - ink); edges[k] = 1; }
}
for (let k = 0; k < px.length; k++) px[k] = gradePx(px[k], T, sat);
if (s) {
for (let k = 0; k < s.bare.length; k++) s.bare[k] = gradePx(s.bare[k], T, sat);
for (let i = 0; i < s.c.length; i++) s.c[i] = gradePx(edges[s.k[i]] ? mul(s.c[i], 1 - ink) : s.c[i], T, sat);
}
}
function mul(c, f) {
return ((c & 0xff000000) | (Math.round(((c >>> 16) & 255) * f) << 16) | (Math.round(((c >>> 8) & 255) * f) << 8) | Math.round((c & 255) * f)) >>> 0;
}
return { grade };
})();
// src/visual/env/kit.js
const __m31 = (() => {
const { ramp, hex } = __m22;
const { Rng, hashString } = __m10;
const { shift } = __m2;
function palette(spec) {
const out = {};
for (const [k, v] of Object.entries(spec)) out[k] = Array.isArray(v) ? ramp(hex(v[0]), v[1]) : ramp(hex(v));
return out;
}
function vary(pal, rng, amt = 1) {
const dh = (rng.next() - 0.5) * 16 * amt, cK = 1 + (rng.next() - 0.5) * 0.2 * amt, dL = (rng.next() - 0.5) * 0.04 * amt;
const out = {};
for (const [k, r] of Object.entries(pal)) out[k] = r.map((c) => {
const rgb = [(c & 255) / 255, ((c >>> 8) & 255) / 255, ((c >>> 16) & 255) / 255];
const s = shift(rgb, { dh, cK, dL });
return ((255 << 24) | (Math.round(s[2] * 255) << 16) | (Math.round(s[1] * 255) << 8) | Math.round(s[0] * 255)) >>> 0;
});
return out;
}
const streamOf = (seed, region, part) => new Rng(hashString(`env:${seed}:${region}:${part}`));
return { palette, vary, streamOf };
})();
// src/visual/env/foliage.js
const __m33 = (() => {
const { Model, bezier } = __m15;
let groups = 0;
const swayGroup = () => ++groups;
const SHAPES = [
(a) => 1 + 0.08 * Math.sin(a * 5),
(a) => 0.8 + 0.28 * Math.abs(Math.cos(a * 1.5)),
(a) => 0.85 + 0.2 * Math.cos(a * 2),
(a) => 0.78 + 0.26 * Math.abs(Math.cos(a * 2)),
(a) => 1 - 0.28 * Math.cos(a + Math.PI / 2),
];
function leaf(rnd, x, y, r) {
const f = SHAPES[Math.floor(rnd() * SHAPES.length)], rot = rnd() * Math.PI * 2, sy = 0.7 + rnd() * 0.45, n = 10;
const crop = rnd() < 0.2 ? 0.35 + rnd() * 0.4 : 2, ca = rnd() * Math.PI * 2, cx = Math.cos(ca), cy = Math.sin(ca);
const pts = [];
for (let i = 0; i < n; i++) {
const a = (i / n) * Math.PI * 2, rr = r * f(a) * (1 + (rnd() - 0.5) * 0.25);
let u = Math.cos(a) * rr, v = Math.sin(a) * rr * sy;
const d = u * cx + v * cy - crop * r;
if (d > 0) { u -= d * cx; v -= d * cy; }
pts.push([x + u * Math.cos(rot) - v * Math.sin(rot), y + u * Math.sin(rot) + v * Math.cos(rot)]);
}
return pts;
}
function oval(x, y, rx, ry, rnd) {
const n = Math.max(10, Math.round((rx + ry) * 1.5)), ph = rnd() * 6;
const pts = [];
for (let i = 0; i < n; i++) {
const a = (i / n) * Math.PI * 2, r = 1 + 0.12 * Math.sin(a * 3 + ph) + (rnd() - 0.5) * 0.16;
pts.push([x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r]);
}
return pts;
}
const pick = (rnd, mats) => (mats.length < 2 || rnd() < 0.6 ? mats[0] : mats[1 + Math.floor(rnd() * (mats.length - 1))]);
function puff(x, y, r, rnd, sy = 0.86) {
const n = Math.max(12, Math.round(r * 5)), lobes = Math.round(r * 0.9) + 3, ph = rnd() * 6;
const pts = [];
for (let i = 0; i < n; i++) {
const a = (i / n) * Math.PI * 2, q = 1 + 0.14 * Math.abs(Math.sin(a * lobes * 0.5 + ph)) - 0.07 + (rnd() - 0.5) * 0.08;
pts.push([x + Math.cos(a) * r * q, y + Math.sin(a) * r * q * sy]);
}
return pts;
}
function cluster(m, rng, x, y, rx, ry, o = {}) {
const rnd = () => rng.next(), mats = o.mats || ['leaf'], tone = o.tone ?? 0, sw = { sa: o.amp ?? 1, sg: swayGroup() };
const st = (/** @type {number} */ v) => Math.max(0, Math.min(1, v + tone * 1.5));
const leafy = { shade: /** @type {'flat'} */ ('flat'), noOutline: true, ...sw };
m.poly(oval(x + rx * 0.04, y + ry * 0.12, rx * 0.9, ry * (o.flat ? 0.68 : 0.84), rnd), mats[0], { ...leafy, step: st(0.2) });
const pr = Math.max(2.2, Math.min(3.6, Math.min(rx, ry) * 0.46)), n = Math.max(4, Math.round(((rx * ry) / (pr * pr)) * 1.25 * (o.dense ?? 1)));
const at = [];
for (let i = 0; i < n; i++) {
const a = rnd() * Math.PI * 2, q = Math.sqrt(rnd()) * 0.86;
let py = y + Math.sin(a) * (ry - pr * 0.6) * q - ry * 0.05;
if (o.flat) py = Math.min(py, y + ry * 0.22);
at.push([x + Math.cos(a) * (rx - pr * 0.5) * q, py, pr * (0.8 + rnd() * 0.4)]);
}
at.sort((p, q) => q[1] - p[1]);
for (const [px, py, r] of at) {
const up = (y - py) / ry, left = (x - px) / rx, mat = pick(rnd, mats), b = 0.46 + up * 0.12 + left * 0.06 + (rnd() - 0.5) * 0.08;
m.poly(puff(px + r * 0.14, py + r * 0.18, r + 0.4, rnd, 0.82), mat, { ...leafy, step: st(b - 0.14) });
m.poly(puff(px, py, r, rnd), mat, { ...leafy, step: st(b) });
m.poly([
[px - r, py - r * 0.18], [px - r * 0.5, py - r * 0.78],
[px + r * 0.05, py - r * 0.82], [px + r * 0.6, py - r * 0.38],
[px + r * 0.18, py + r * 0.05], [px - r * 0.35, py - r * 0.06],
[px - r * 0.55, py + r * 0.25],
], mat, { ...leafy, step: st(b + 0.17) });
m.poly(leaf(rnd, px - r * 0.48, py - r * 0.55, Math.max(0.8, r * 0.42)), mat, { ...leafy, step: st(b + 0.3) });
for (let j = 0; j < 3; j++) {
const lx = px + (rnd() - 0.5) * r * 1.25, ly = py + (rnd() - 0.55) * r;
const width = 1 + rnd() * 0.7;
m.line([[lx, ly], [lx + width, ly - 0.5]], mat, { ...sw, step: st(b + (j === 0 ? -0.2 : 0.2 + rnd() * 0.12)) });
}
for (let j = 0; j < Math.max(1, Math.round(r * 0.35)); j++) {
const a = Math.PI * (1.15 + rnd() * 0.6);
m.poly(leaf(rnd, px + Math.cos(a) * r * 0.95, py + Math.sin(a) * r * 0.9, 0.8 + rnd() * 0.6), mat, { ...leafy, step: st(b + 0.24) });
}
}
const tufts = Math.round((rx + ry) * 0.6);
for (let i = 0; i < tufts; i++) {
const a = rnd() * Math.PI * 2, q = 0.9 + rnd() * 0.14, lx = x + Math.cos(a) * rx * q, ly = y + Math.sin(a) * ry * q * (o.flat && Math.sin(a) > 0 ? 0.64 : 1);
const lit = -Math.sin(a) * 0.7 - Math.cos(a) * 0.3;
m.poly(leaf(rnd, lx, ly, 0.8 + rnd() * 0.6), pick(rnd, mats), { ...leafy, step: st(0.42 + lit * 0.3) });
}
for (let i = 0; i < tufts * 0.25; i++) {
const a = rnd() * Math.PI * 2, q = 1.03 + rnd() * 0.12;
m.dot(x + Math.cos(a) * rx * q, y + Math.sin(a) * ry * q * (o.flat && Math.sin(a) > 0 ? 0.6 : 1), pick(rnd, mats), { clip: false, step: st(Math.sin(a) < 0 ? 0.62 : 0.3), ...sw });
}
if (o.bloom) for (let i = 0; i < n * 3 * o.bloom.rate; i++) {
const a = rnd() * Math.PI * 2, q = Math.sqrt(rnd()) * 0.85, bx = x + Math.cos(a) * rx * q, by = y + Math.sin(a) * ry * q * 0.85 - ry * 0.1;
m.dot(bx, by, o.bloom.mat, { clip: false, lum: 0.62 + rnd() * 0.33, ...sw });
if (rnd() < 0.35) m.dot(bx + 1, by, o.bloom.mat, { clip: false, lum: 0.5, ...sw });
}
return sw.sg;
}
function strand(m, rng, x, y, len, o = {}) {
const rnd = () => rng.next(), mat = o.mat || 'leaf', sw = { sa: o.amp ?? 1, sh: 1.2 + len * 0.07, sg: swayGroup() };
const ph = rnd() * 6, wv = 0.4 + rnd() * 0.6, tone = o.tone ?? 0;
const pts = [];
for (let k = 0; k <= Math.ceil(len / 3); k++) { const t = Math.min(1, (k * 3) / len); pts.push([x + Math.sin(ph + t * 4) * wv * t, y + t * len]); }
m.stroke(pts, [1.3, 1], mat, { tone: tone - 0.12, noOutline: true, tex: 0.5, ...sw });
const step = o.leaves ?? 2.2;
for (let d = 1.5, s = rnd() < 0.5 ? -1 : 1; d < len - (o.bloom ? len * 0.35 : 0); d += step + rnd(), s = -s) {
const t = d / len, lx = x + Math.sin(ph + t * 4) * wv * t + s * 0.9, ly = y + d;
m.poly(leaf(rnd, lx, ly, 0.9 + rnd() * 0.6 * (1 - t * 0.5)), mat, { shade: 'round', soft: true, noOutline: true, tex: 0.6, tone: tone + 0.02 - t * 0.14 + (rnd() - 0.5) * 0.1, ...sw });
}
if (o.bloom) {
const b0 = len * 0.6;
for (let d = b0; d <= len + 1; d += 1) {
const t = (d - b0) / Math.max(1, len + 1 - b0), w = 1.6 * (1 - t) + 0.4, cx = x + Math.sin(ph + (d / len) * 4) * wv * (d / len);
for (let i = -Math.round(w); i <= Math.round(w); i++) if (rnd() < 0.8) m.dot(cx + i, y + d, o.bloom, { clip: false, lum: 0.5 + rnd() * 0.4 - t * 0.12, ...sw });
}
}
return sw.sg;
}
function grove(rng, h, tw, o = {}) {
const m = new Model(), rnd = () => rng.next(), bark = o.bark || 'bark', style = o.style || 'dome';
const dir = o.dir ?? (rnd() < 0.5 ? -1 : 1), mats = o.mats || ['leaf'];
const th = h * (style === 'weep' ? 0.62 : style === 'tiers' ? 0.66 : style === 'sparse' ? 0.7 : 0.6);
const sw1 = (0.1 + rnd() * 0.1) * h, sw2 = (0.06 + rnd() * 0.1) * h;
const spine = bezier([0, 0], [dir * sw1, -th * 0.35], [-dir * sw2, -th * 0.7], [dir * (rnd() - 0.3) * h * 0.12, -th], 14);
const ws = spine.map((_, i) => Math.max(1.2, tw * (1 - (i / (spine.length - 1)) * 0.55) * (i === 0 ? 1.25 : 1)));
for (const s of [-1, 1]) m.stroke([[s * tw * 0.2, -tw * 0.7], [s * tw * 0.9, -1], [s * tw * 1.7, 1]], [tw * 0.45, tw * 0.25, 1.2], bark, { tone: s > 0 ? -0.08 : 0 });
m.stroke(spine, ws, bark, { tex: 0.35 });
m.line(/** @type {any} */ (spine.slice(1, -2).map((q, i) => [q[0] - ws[i + 1] * 0.28, q[1]])), bark, { lum: 0.8 });
m.line(/** @type {any} */ (spine.slice(1, -2).map((q, i) => [q[0] - ws[i + 1] * 0.12, q[1]])), bark, { lum: 0.66 });
m.line(/** @type {any} */ (spine.slice(2, -3).map((q, i) => [q[0] + ws[i + 2] * 0.3, q[1]])), bark, { lum: 0.14 });
for (let i = 1; i < spine.length - 2; i++) {
if (ws[i] < 3) continue;
const [ax, ay] = spine[i], [bx, by] = spine[i + 1], off = (i % 2 ? 0.05 : 0.18) * ws[i], mid = 0.4 + rnd() * 0.3;
m.line([[ax + off, ay], [ax + (bx - ax) * mid + off, ay + (by - ay) * mid]], bark, { lum: 0.24 });
}
const tops = [];
const nb = style === 'sparse' ? 2 + Math.round(rnd()) : style === 'tiers' ? 3 + Math.round(rnd()) : 3 + Math.round(rnd() * 2);
for (let b = 0; b < nb; b++) {
const t = 0.5 + (b / Math.max(1, nb - 1)) * 0.42, i = Math.min(spine.length - 2, Math.round(t * (spine.length - 1))), [sx, sy] = spine[i];
const side = (b % 2 ? 1 : -1) * dir, L = h * (style === 'tiers' ? 0.26 + rnd() * 0.14 : style === 'sparse' ? 0.2 + rnd() * 0.1 : 0.2 + rnd() * 0.14);
const a = style === 'tiers' ? 0.12 + rnd() * 0.25 : 0.35 + rnd() * 0.5, ex = sx + side * L * Math.cos(a), ey = sy - L * Math.sin(a);
m.stroke([[sx, sy], [sx + side * L * 0.4, sy - L * 0.08 + (rnd() - 0.3) * L * 0.2], [ex, ey]], [ws[i] * 0.6, Math.max(1, ws[i] * 0.3)], bark, { tex: 0.6 });
const r = h * (style === 'sparse' ? 0.1 + rnd() * 0.04 : style === 'tiers' ? 0.13 + rnd() * 0.04 : 0.12 + rnd() * 0.05);
tops.push([ex, ey - r * 0.2, r * (style === 'tiers' ? 1.3 : 1), r * (style === 'tiers' ? 0.5 : 0.72)]);
if (L > h * 0.24 && style !== 'sparse') {
const fx = sx + side * L * 0.55, fy = sy - L * 0.25, gx = fx + side * L * 0.18, gy = fy - L * 0.45;
m.stroke([[fx, fy], [gx, gy]], [Math.max(1, ws[i] * 0.32), 1], bark, {});
tops.push([gx, gy - r * 0.2, r * 0.75, r * 0.55]);
}
}
const top = spine[spine.length - 1], tr = h * (style === 'sparse' ? 0.12 : style === 'tiers' ? 0.15 : 0.17 + rnd() * 0.04);
tops.push([top[0], top[1] - tr * 0.3, tr * (style === 'tiers' ? 1.3 : 1.1), tr * (style === 'tiers' ? 0.55 : 0.75)]);
if (style === 'dome' || style === 'weep' || style === 'wisteria') {
const xs = tops.map((q) => q[0]), ys = tops.map((q) => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
const cw = (Math.max(...xs) - Math.min(...xs)) / 2 + 1, ch = (Math.max(...ys) - Math.min(...ys)) / 2 + 1;
for (let i = 0; i < 2 + Math.round(rnd() * 2); i++) {
const a = rnd() * Math.PI * 2, q = Math.sqrt(rnd()) * 0.8;
tops.push([cx + Math.cos(a) * cw * q, cy + Math.sin(a) * ch * q, h * (0.1 + rnd() * 0.05), h * (0.08 + rnd() * 0.03)]);
}
}
const amp = (/** @type {number} */ y) => 0.7 + Math.min(1, -y / h) * 0.5;
const hang = o.hang || (style === 'weep' ? { rate: 1, len: /** @type {[number, number]} */ ([h * 0.12, h * 0.4]) } : style === 'wisteria' ? { rate: 0.8, len: /** @type {[number, number]} */ ([6, 18]) } : null);
if (hang) for (const [x, y, rx, ry] of tops) {
const n = Math.round(rx * 0.7 * hang.rate);
for (let i = 0; i < n; i++) {
const u = style === 'weep' ? (Math.floor(rnd() * 4) / 3 - 0.5) * 1.5 + (rnd() - 0.5) * 0.3 : (rnd() - 0.5) * 1.7;
const sx = x + u * rx, sy = y + ry * (0.3 + rnd() * 0.4), L = hang.len[0] + rnd() * (hang.len[1] - hang.len[0]);
const bloom = style === 'wisteria' && o.bloom && rnd() < 0.7 ? o.bloom.mat : hang.bloom;
strand(m, rng, sx, sy, L, { mat: hang.mat || mats[0], amp: amp(y), bloom, tone: style === 'weep' ? 0.04 : -0.04 });
}
}
tops.sort((p, q) => q[1] - p[1]);
const bloom = style === 'wisteria' ? undefined : o.bloom;
for (const [x, y, rx, ry] of tops) cluster(m, rng, x, y, rx, ry, { mats, bloom, amp: amp(y), flat: style === 'tiers', dense: style === 'sparse' ? 0.7 : 1 });
return m;
}
return { swayGroup, leaf, cluster, strand, grove };
})();
// src/visual/env/objects.js
const __m32 = (() => {
const { Model, blade, PROFILES, bezier, lumpy, ellipse, polygon } = __m15;
const { cluster, strand, grove, swayGroup } = __m33;
const R = (rng) => () => rng.next();
function leafBlock(x, y, hw, hh, rnd) {
const c = Math.max(1, Math.round(Math.min(hw, hh) * 0.4)), j = () => Math.round((rnd() - 0.5) * 2);
const x0 = Math.round(x - hw) + j(), x1 = Math.round(x + hw) + j(), y0 = Math.round(y - hh) + j(), y1 = Math.round(y + hh) + j();
return /** @type {import('../geometry.js').Pt[]} */ ([
[x0 + c, y0], [x1 - c, y0], [x1 - c, y0 + c], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1 - c], [x1 - c, y1],
[x0 + c, y1], [x0 + c, y1 - c], [x0, y1 - c], [x0, y0 + c], [x0 + c, y0 + c],
]);
}
function crown(m, rng, cx, cy, rx, ry, mat = 'leaf', o = {}) {
const rnd = R(rng), r = o.r ?? Math.max(2.5, Math.min(rx * 0.5, ry * 0.62, 9)), mats = [mat, ...(o.mats || []).filter((q) => q !== mat)];
m.poly(lumpy(cx, cy + r * 0.2, rx * 0.92, ry * 0.88, rnd, 0.06, 7), mat, { shade: 'flat', tex: 0.3, tone: -0.24, sa: (o.amp ?? 1) * 0.85, sg: swayGroup() });
const sx = r * 1.5, sy = r * 1.15, clumps = [];
for (let row = -Math.ceil(ry / sy); row <= Math.ceil(ry / sy); row++) for (let col = -Math.ceil(rx / sx) - 1; col <= Math.ceil(rx / sx) + 1; col++) {
const x = cx + col * sx + ((row & 1) ? sx / 2 : 0) + (rng.next() - 0.5) * r * 0.25, y = cy + row * sy + (rng.next() - 0.5) * r * 0.2;
if (((x - cx) / (rx - r * 0.4)) ** 2 + ((y - cy) / (ry - r * 0.3)) ** 2 > 1) continue;
clumps.push([x, y]);
}
clumps.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
for (const [x, y] of clumps) cluster(m, rng, x, y, r * 1.05, r * 0.9, { mats, bloom: o.bloom, amp: (o.amp ?? 1) * (0.9 + Math.max(0, (cy - y) / ry) * 0.2), tone: ((cx - x) / rx) * 0.04 });
return m;
}
function pad(m, rng, x, y, rx, ry, mat = 'leaf', o = {}) {
const mats = [mat, ...(o.mats || []).filter((q) => q !== mat)], amp = o.amp ?? 1;
cluster(m, rng, x, y + ry * 0.12, rx, ry * 0.8, { mats, amp: amp * 0.9, flat: true, dense: 0.8 });
const n = Math.max(2, Math.round(rx / (ry * 0.9)));
for (let i = 0; i < n; i++) {
const u = n === 1 ? 0 : i / (n - 1) - 0.5, bx = x + u * rx * 1.25, by = y - ry * (0.15 + (0.5 - Math.abs(u)) * 0.4), r = ry * (0.75 + rng.next() * 0.25);
cluster(m, rng, bx, by, r * 1.15, r * 0.85, { mats, amp, bloom: o.bloom, tone: -u * 0.06 });
}
const drips = o.drips ?? Math.round(rx / 4);
for (let i = 0; i < drips; i++) {
const dx = x + (rng.next() - 0.5) * rx * 1.4, L = 2 + rng.next() * ry * 1.6;
strand(m, rng, dx, y + ry * 0.55, L, { mat: o.drip || mat, amp, tone: o.drip ? 0 : 0.1, leaves: o.drip ? 3 : 2.2 });
}
return m;
}
function branchTree(rng, h, tw, o = {}) {
const m = new Model(), bark = o.bark || 'bark', leaf = o.leaf || 'leaf';
const shape = o.shape || ['tall', 'spread', 'lean'][Math.floor(rng.next() * 3)], dir = o.dir ?? (rng.next() < 0.5 ? -1 : 1);
const th = shape === 'spread' ? h * 0.62 : shape === 'tall' ? h * 0.86 : h * 0.8;
const w1 = shape === 'lean' ? h * 0.14 : h * 0.05, w2 = shape === 'lean' ? -h * 0.04 : -h * 0.05;
const lean = shape === 'lean' ? h * 0.16 : (rng.next() - 0.5) * h * 0.1;
const spine = bezier([0, 0], [dir * w1, -th * 0.35], [dir * w2, -th * 0.7], [dir * lean, -th], 14);
const ws = spine.map((_, i) => Math.max(1.2, tw * (1 - (i / (spine.length - 1)) * 0.55) * (i === 0 ? 1.2 : 1)));
for (const s of [-1, 1]) m.stroke([[s * tw * 0.2, -tw * 0.7], [s * tw * 0.9, -1], [s * tw * 1.6, 1]], [tw * 0.45, tw * 0.25, 1.2], bark, { tone: s > 0 ? -0.08 : 0 });
m.stroke(spine, ws, bark, { tex: 0.7 });
m.line(/** @type {any} */ (spine.slice(1, -2).map((q, i) => [q[0] - ws[i + 1] * 0.25, q[1]])), bark, { lum: 0.78 });
const pads = [];
const nb = shape === 'tall' ? 3 + Math.round(rng.next()) : shape === 'spread' ? 2 + Math.round(rng.next()) : 2 + Math.round(rng.next() * 2);
for (let b = 0; b < nb; b++) {
const t = shape === 'tall' ? 0.3 + (b / Math.max(1, nb - 1)) * 0.55 : shape === 'spread' ? 0.55 + (b / Math.max(1, nb - 1)) * 0.35 : 0.45 + (b / Math.max(1, nb - 1)) * 0.4;
const i = Math.min(spine.length - 2, Math.round(t * (spine.length - 1))), [sx, sy] = spine[i], side = (b % 2 ? 1 : -1) * dir;
const L = h * (shape === 'spread' ? 0.28 + rng.next() * 0.12 : shape === 'tall' ? 0.16 + rng.next() * 0.08 : 0.2 + rng.next() * 0.12);
const a = (0.25 + rng.next() * 0.45), ex = sx + side * L * Math.cos(a), ey = sy - L * Math.sin(a);
const pts = /** @type {[number, number][]} */ ([[sx, sy], [sx + side * L * 0.45, sy - L * 0.05 - (rng.next() - 0.3) * L * 0.25], [ex, ey]]);
m.stroke(pts, [ws[i] * 0.6, Math.max(1, ws[i] * 0.28)], bark, { tex: 0.5 });
const pr = h * (shape === 'tall' ? 0.14 + rng.next() * 0.04 : 0.16 + rng.next() * 0.05);
pads.push([ex, ey - pr * 0.25, pr, pr * 0.62]);
if (L > h * 0.24) {
const fx = sx + side * L * 0.55, fy = sy - L * 0.3, gx = fx + side * L * 0.25, gy = fy - L * 0.45;
m.stroke([[fx, fy], [gx, gy]], [Math.max(1, ws[i] * 0.35), 1], bark, {});
pads.push([gx, gy - pr * 0.25, pr * 0.8, pr * 0.52]);
}
}
const top = spine[spine.length - 1], tr = h * (shape === 'tall' ? 0.17 : 0.2 + rng.next() * 0.05);
pads.push([top[0], top[1] - tr * 0.3, tr, tr * 0.62]);
pads.sort((p, q) => q[1] - p[1]);
for (const [x, y, rx, ry] of pads) pad(m, rng, x, y, rx, ry, leaf, { drip: o.drip, mats: o.mats, bloom: o.bloom, amp: 0.7 + Math.min(1, -y / h) * 0.5 });
return m;
}
const GROVES = { gnarl: 'dome', tiers: 'tiers', willow: 'weep', wisteria: 'wisteria', sparse: 'sparse' };
function tree(rng, kind, h, tw, o = {}) {
const look = o.look || {};
if (kind === 'oak' || kind === 'birch') return branchTree(rng, h, tw, { ...o, ...look, drip: look.hang?.mat, shape: o.shape || (kind === 'birch' ? 'tall' : undefined) });
if (GROVES[kind]) return grove(rng, h, tw, { ...o, ...look, hang: kind === 'willow' || kind === 'wisteria' ? undefined : look.hang, style: GROVES[kind] });
const m = new Model(), lean = (o.lean ?? (rng.next() - 0.5) * 0.15) * h;
const trunkTop = kind === 'pine' ? h * 0.95 : kind === 'dead' ? h * 0.75 : h * 0.55;
const spine = bezier([0, 0], [0, -trunkTop * 0.4], [lean * 0.6, -trunkTop * 0.75], [lean, -trunkTop], 12);
const ws = spine.map((_, i) => tw * (1 - (i / spine.length) * (kind === 'pine' ? 0.8 : 0.45)) * (i === 0 ? 1.25 : 1));
for (const s of [-1, 1]) m.stroke([[s * tw * 0.2, -tw * 0.6], [s * tw * 0.9, -1], [s * tw * 1.5, 1]], [tw * 0.45, tw * 0.25, 1.2], o.bark || 'bark', { tone: s > 0 ? -0.08 : 0 });
m.stroke(spine, ws, o.bark || 'bark', { tex: 0.5 });
for (let k = 0; k < Math.max(1, Math.round(tw / 3)); k++) {
const f = (k + 0.5) / Math.max(1, Math.round(tw / 3)) - 0.5, pts = [];
for (let i = 1; i < spine.length - 1; i += 1) pts.push([spine[i][0] + f * ws[i] * 0.7 + (rng.next() - 0.5) * 0.8, spine[i][1]]);
m.line(/** @type {any} */ (pts), o.bark || 'bark', { lum: 0.12 });
}
const top = spine[spine.length - 1];
if (kind === 'dead') {
branch(m, rng, top[0], top[1], -Math.PI / 2, h * 0.3, tw * 0.6, 3, o.bark || 'bark');
branch(m, rng, spine[6][0], spine[6][1], -Math.PI / 2 - 0.9, h * 0.25, tw * 0.45, 2, o.bark || 'bark');
branch(m, rng, spine[8][0], spine[8][1], -Math.PI / 2 + 0.8, h * 0.22, tw * 0.4, 2, o.bark || 'bark');
return m;
}
if (kind === 'pine') {
const tiers = Math.max(4, Math.round(h / 9));
for (let i = 0; i < tiers; i++) {
const t = i / (tiers - 1), y = -h * 0.28 - t * h * 0.7, w = h * 0.3 * (1 - t * 0.85) + 2;
const pts = [[lean * (0.3 + t * 0.7) - w, y + h * 0.06], [lean * (0.3 + t * 0.7), y - h * 0.12], [lean * (0.3 + t * 0.7) + w, y + h * 0.06]];
for (let k = 5; k >= 1; k--) pts.push([lean * (0.3 + t * 0.7) - w + (k / 6) * w * 2, y + h * 0.06 - (k % 2) * h * 0.025]);
m.poly(/** @type {any} */ (pts), o.leaf || 'leaf', { shade: 'fold', tex: 1.4, tone: -0.04 + t * 0.06, sa: 0.3 + t * 0.6, sg: swayGroup() });
}
return m;
}
const cw = kind === 'birch' ? h * 0.24 : h * 0.36;
for (const s of [-1, 1]) m.stroke([[top[0], top[1] + 3], [top[0] + s * cw * 0.35, top[1] - h * 0.08], [top[0] + s * cw * 0.6, top[1] - h * 0.18]], [tw * 0.5, tw * 0.25], o.bark || 'bark', {});
const cy = top[1] - h * 0.2;
crown(m, rng, top[0], cy, cw, h * (kind === 'birch' ? 0.3 : 0.28), o.leaf || 'leaf', look);
if (kind === 'birch') for (let i = 2; i < spine.length - 1; i += 2) m.line([[spine[i][0] - ws[i] * 0.4, spine[i][1]], [spine[i][0] + ws[i] * 0.1, spine[i][1]]], o.bark || 'bark', { lum: 0.08 });
return m;
}
function branch(m, rng, x, y, ang, len, w, depth, mat) {
const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
m.stroke([[x, y], [(x + ex) / 2 + (rng.next() - 0.5) * len * 0.2, (y + ey) / 2], [ex, ey]], [w, w * 0.6], mat, { noOutline: w < 2.5 });
if (depth > 0) for (const s of [-1, 1]) branch(m, rng, ex, ey, ang + s * (0.35 + rng.next() * 0.35), len * (0.55 + rng.next() * 0.2), Math.max(1, w * 0.6), depth - 1, mat);
return m;
}
function bush(rng, rx, ry, o = {}) {
const m = new Model();
crown(m, rng, 0, -ry * 0.7, rx, ry, o.leaf || 'leaf', { amp: 0.4, mats: o.mats });
if (o.dots) for (let i = 0; i < rx * 0.8; i++) {
const a = Math.PI + rng.next() * Math.PI, q = Math.sqrt(rng.next()) * 0.8;
m.dot(Math.cos(a) * rx * q, -ry * 0.7 + Math.sin(a) * ry * q * 0.8, o.dots, { lum: rng.next() < 0.5 ? 0.85 : 0.55 });
}
return m;
}
function boulder(rng, rx, ry, o = {}) {
const m = new Model();
m.poly(lumpy(0, -ry * 0.8, rx, ry, R(rng), 0.2, 6), o.rock || 'rock', { shade: 'round', tex: 1.4 });
for (let i = 0; i < Math.max(1, rx / 5); i++) {
const x = (rng.next() - 0.5) * rx * 1.2, y = -ry * (0.4 + rng.next() * 0.6);
m.line([[x, y], [x + (rng.next() - 0.5) * 3, y + ry * 0.3], [x + (rng.next() - 0.5) * 3, y + ry * 0.55]], o.rock || 'rock', { lum: 0.1 });
}
if (o.moss) for (let i = 0; i < rx * 1.5; i++) {
const x = (rng.next() - 0.5) * rx * 1.4, y = -ry * 1.6 + rng.next() * ry * 0.7;
m.dot(x, y, o.moss, { lum: 0.4 + rng.next() * 0.5 });
}
return m;
}
function reeds(rng, h, n, o = {}) {
const m = new Model();
for (let i = 0; i < n; i++) {
const x = (i / Math.max(1, n - 1) - 0.5) * n * 1.3 + (rng.next() - 0.5);
const L = h * (0.55 + rng.next() * 0.45), a = -Math.PI / 2 + (x / (n * 1.3)) * 0.8 + (rng.next() - 0.5) * 0.2;
m.poly(blade([x, 0], a, L, Math.max(0.8, L * 0.05), PROFILES.linear, { curl: (rng.next() - 0.5) * 0.5 }), o.leaf || 'reed', { shade: 'fold', tone: i % 2 ? -0.06 : 0.04 });
if (o.heads && rng.next() < o.heads) {
const tx = x + Math.cos(a) * L * 0.92, ty = Math.sin(a) * L * 0.92;
m.ellipse(tx, ty + 2, 1.3, 3, o.head || 'cattail', { shade: 'round' });
}
}
return m;
}
function fern(rng, size, o = {}) {
const m = new Model(), n = 5 + Math.round(rng.next() * 2);
for (let f = 0; f < n; f++) {
const a = -Math.PI / 2 + (f / (n - 1) - 0.5) * 2.6;
const pts = [];
for (let i = 0; i <= 8; i++) { const t = i / 8, bend = t * t * 0.9 * Math.sign(a + Math.PI / 2 || 1); pts.push([Math.cos(a + bend) * size * t, Math.sin(a + bend) * size * t * 0.85]); }
m.stroke(/** @type {any} */ (pts), [1.4, 0.8], o.leaf || 'leaf', { noOutline: true, tone: -0.1 });
for (let i = 2; i < 8; i++) {
const q = /** @type {[number, number]} */ (pts[i]), s = 1.8 * (1 - i / 10);
m.poly(blade(q, a - 1.2, size * 0.18 * (1 - i / 10) + 1, s, PROFILES.lance), o.leaf || 'leaf', { shade: 'fold', tone: 0.04 });
m.poly(blade(q, a + 1.2, size * 0.18 * (1 - i / 10) + 1, s, PROFILES.lance), o.leaf || 'leaf', { shade: 'fold', tone: -0.04 });
}
}
return m;
}
function tuft(rng, h, o = {}) {
const m = new Model();
for (let i = 0; i < 4; i++) {
const a = -Math.PI / 2 + (i - 1.5) * 0.35 + (rng.next() - 0.5) * 0.2;
m.line([[i - 1.5, 0], [i - 1.5 + Math.cos(a) * h, Math.sin(a) * h * (0.7 + rng.next() * 0.3)]], o.leaf || 'leaf', { clip: false, lum: i % 2 ? 0.88 : 0.18 });
}
return m;
}
function log(rng, len, r, o = {}) {
const m = new Model(), bark = o.bark || 'bark', wood = o.wood || 'wood', rnd = R(rng);
const x0 = -len / 2 + r * 0.6, x1 = len / 2 - r * 0.6, sag = (rng.next() - 0.5) * 1.2;
const hw = (/** @type {number} */ t) => r * (1.05 - 0.18 * t);
const pts = [];
const ws = [];
for (let i = 0; i <= 8; i++) {
const t = i / 8;
pts.push([x0 + t * (x1 - x0), -hw(t) + Math.sin(t * Math.PI) * sag]);
ws.push(hw(t) * 2);
}
const at = (/** @type {number} */ t) => { const f = t * 8, i = Math.min(7, Math.floor(f)), u = f - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]; };
for (const [dy, a, l] of [[0.55, 2.7, 1.1], [0.1, 3.0, 1.3], [-0.45, 3.4, 0.9]]) {
const bx = x0 + r * 0.2, by = pts[0][1] + dy * r, ex = bx + Math.cos(a) * r * l, ey = Math.min(-0.5, by - Math.sin(a) * r * l * 0.4);
m.stroke([[bx, by], [ex, ey]], [r * 0.75, r * 0.3], bark, { tex: 1, tone: -0.06 });
}
m.stroke(pts, ws, bark, { tex: 1.2 });
const bt = 0.45 + rng.next() * 0.2, [bxp, byp] = at(bt), bl = r * (0.9 + rng.next() * 0.4);
const tip = /** @type {import('../geometry.js').Pt} */ ([bxp + bl * 0.6, byp - hw(bt) - bl * 0.75]);
m.stroke([[bxp - r * 0.1, byp - hw(bt) * 0.4], tip], [r * 0.8, r * 0.5], bark, { tex: 1 });
m.ellipse(tip[0], tip[1], r * 0.28, r * 0.2, wood, { shade: 'flat', tone: 0.05 });
for (const [v, lum] of [[-0.35, 0.42], [0.15, 0.34], [0.55, 0.28]]) {
let t = rng.next() * 0.08;
while (t < 0.94) {
const l = (0.06 + rng.next() * 0.1), t2 = Math.min(0.96, t + l);
const [ax, ay] = at(t), [bx2, by2] = at(t2);
m.line([[ax, ay + v * hw(t)], [bx2, by2 + v * hw(t2) + (rnd() < 0.3 ? 1 : 0)]], bark, { lum });
t = t2 + 0.03 + rng.next() * 0.08;
}
}
for (let t = 0.05; t < 0.9; t += 0.1 + rng.next() * 0.1) {
const [ax, ay] = at(t), [bx2, by2] = at(Math.min(0.95, t + 0.05 + rng.next() * 0.06));
m.line([[ax, ay - hw(t) * 0.72], [bx2, by2 - hw(t) * 0.72]], bark, { lum: 0.86 });
}
const ex = x1 + hw(1) * 0.35, ey = pts[8][1], fr = hw(1);
m.ellipse(ex, ey, fr * 0.62, fr * 1.0, bark, { shade: 'flat', tone: -0.12, soft: true });
m.ellipse(ex + 0.3, ey, fr * 0.5, fr * 0.84, wood, { shade: 'flat', tone: 0.08, noOutline: true });
m.ellipse(ex + 0.3, ey, fr * 0.3, fr * 0.5, wood, { shade: 'flat', tone: -0.1, noOutline: true });
m.ellipse(ex + 0.3, ey, fr * 0.14, fr * 0.22, wood, { shade: 'flat', tone: 0.04, noOutline: true });
m.line([[ex + 0.3, ey], [ex + fr * 0.3, ey - fr * 0.6]], wood, { lum: 0.15 });
if (o.moss) {
for (let k = 0, n = 1 + Math.round(rng.next()); k < n; k++) {
const t = 0.12 + (k / n) * 0.6 + rng.next() * 0.15, [mx, my] = at(t), mw = len * (0.1 + rng.next() * 0.08), top = my - hw(t);
m.poly(lumpy(mx, top + 0.8, mw, 1.6, rnd, 0.25, 6), o.moss, { shade: 'round', tex: 0.6, tone: 0.08 });
for (let i = 0; i < mw * 0.8; i++) {
const dx = (rnd() - 0.5) * mw * 1.6, dl = 1 + Math.floor(rnd() * hw(t) * 0.7);
m.line([[mx + dx, top + 1], [mx + dx, top + 1 + dl]], o.moss, { lum: 0.3 + rnd() * 0.3 });
}
}
}
return m;
}
function stump(rng, w, h, o = {}) {
const m = new Model();
m.poly([[-w / 2 - 2, 0], [-w / 2, -h], [w / 2, -h], [w / 2 + 2, 0]], o.bark || 'bark', { shade: 'round', tex: 1.5 });
m.ellipse(0, -h, w / 2, Math.max(1.5, w * 0.18), o.wood || 'wood', { shade: 'flat' });
m.ellipse(0, -h, w / 4, Math.max(0.8, w * 0.09), o.wood || 'wood', { shade: 'flat', tone: -0.2 });
return m;
}
function mushroom(rng, h, r, o = {}) {
const m = new Model(), stem = o.stem || 'stem', cap = o.cap || 'cap', lean = (rng.next() - 0.5) * h * 0.3;
const spine = bezier([0, 0], [0, -h * 0.4], [lean * 0.5, -h * 0.8], [lean, -h], 10);
for (const s of [-1, 1]) m.stroke([[s * r * 0.08, -3], [s * r * 0.3, 0]], [r * 0.2, 1.2], stem, { tone: s > 0 ? -0.1 : 0 });
m.stroke(spine, spine.map((_, i) => Math.max(1.5, r * 0.3 * (1 - (i / spine.length) * 0.3))), stem, { tex: 0.6 });
m.poly(lumpy(lean, -h + r * 0.1, r * 0.92, r * 0.16, R(rng), 0.05, 6), cap, { shade: 'flat', tone: -0.35 });
const dome = [];
for (let i = 0; i <= 14; i++) { const a = Math.PI + (i / 14) * Math.PI; dome.push([lean + Math.cos(a) * r, -h + Math.sin(a) * r * 0.6 * (1 + (rng.next() - 0.5) * 0.06)]); }
m.poly(dome, cap, { shade: 'round', tex: 0.5 });
for (let i = 0; i < Math.round(r / 3); i++) {
const u = (rng.next() - 0.5) * 1.4, v = 0.25 + rng.next() * 0.5;
m.ellipse(lean + u * r * 0.7, -h - v * r * 0.5, 1.3, 1, o.spot || stem, { shade: 'flat', tone: 0.2, noOutline: true });
}
return m;
}
function cloud(rng, w, h, mat = 'cloud') {
const m = new Model(), n = Math.max(3, Math.round(w / 9));
for (let i = 0; i < n; i++) {
const x = (i / (n - 1) - 0.5) * w * 0.8, r = h * (0.45 + Math.sin((i / (n - 1)) * Math.PI) * 0.45) * (0.8 + rng.next() * 0.3);
m.poly(lumpy(x, -r * 0.8, r * 1.2, r, R(rng), 0.12, 6), mat, { shade: 'round', tex: 0.5, noOutline: true });
}
m.poly(ellipse(0, -h * 0.25, w * 0.5, h * 0.25), mat, { shade: 'round', tone: -0.1, noOutline: true });
return m;
}
function beam(m, a, b, w, mat = 'timber') {
m.stroke([a, b], w, mat, { shade: 'cyl', tex: 1.2 });
const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
if (w >= 2 && length > 6) {
const nx = -dy / length, ny = dx / length, side = nx + ny > 0 ? -1 : 1;
const at = (t, off) => /** @type {[number,number]} */ ([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
m.line([at(0.06, side * w * 0.28), at(0.94, side * w * 0.28)], mat, { lum: 0.86 });
for (let t = 0.15; t < 0.85; t += 0.26) m.line([at(t, -side * 0.2), at(Math.min(0.94, t + 0.14), -side * 0.2)], mat, { lum: 0.24 });
}
return m;
}
function crane(rng, h) {
const m = new Model();
beam(m, [0, 0], [0, -h], 3);
beam(m, [-4, 0], [0, -h * 0.4], 2);
beam(m, [-h * 0.15, -h + 1], [h * 0.55, -h - 3], 2.5);
beam(m, [0, -h * 0.75], [h * 0.3, -h - 1], 1.6);
m.line([[h * 0.5, -h - 2], [h * 0.5, -h * 0.45]], 'rope', { clip: false, lum: 0.4 });
m.poly(polygon(h * 0.5, -h * 0.4, 3.2, 5, 0.3, R(rng), 0.3, 0.8), 'rock', { shade: 'round' });
return m;
}
function ladder(h, lean = 0.12) {
const m = new Model(), dx = h * lean;
beam(m, [-3, 0], [-3 + dx, -h], 1.4);
beam(m, [3, 0], [3 + dx, -h], 1.4);
for (let y = 3; y < h; y += 4) m.stroke([[-3 + dx * (y / h), -y], [3 + dx * (y / h), -y]], 1, 'timber', { noOutline: true });
return m;
}
function cart(rng, w) {
const m = new Model();
m.poly([[-w / 2, -w * 0.55], [w / 2, -w * 0.55], [w / 2 - 2, -w * 0.18], [-w / 2 + 2, -w * 0.18]], 'timber', { shade: 'round' });
for (let i = 1; i < 4; i++) m.line([[-w / 2 + (i * w) / 4, -w * 0.53], [-w / 2 + (i * w) / 4, -w * 0.2]], 'timber', { lum: 0.1 });
m.poly(lumpy(0, -w * 0.58, w * 0.45, w * 0.16, R(rng), 0.4, 6), 'ore', { shade: 'round', tex: 2 });
for (const s of [-1, 1]) { m.ellipse(s * w * 0.3, -w * 0.14, w * 0.13, w * 0.13, 'metal', {}); m.dot(s * w * 0.3, -w * 0.14, 'metal', { lum: 0.95 }); }
return m;
}
function crate(s) {
const m = new Model();
m.poly([[-s / 2, 0], [-s / 2, -s], [s / 2, -s], [s / 2, 0]], 'timber', { shade: 'round' });
m.line([[-s / 2 + 1, -1], [s / 2 - 1, -s + 1]], 'timber', { lum: 0.15 });
m.line([[-s / 2 + 1, -s / 2], [s / 2 - 1, -s / 2]], 'timber', { lum: 0.85 });
return m;
}
function fence(len, h, gap = 14) {
const m = new Model();
for (const y of [-h * 0.75, -h * 0.4]) beam(m, [-len / 2, y], [len / 2, y + 1], 1.8);
for (let x = -len / 2; x <= len / 2; x += gap) beam(m, [x, 1], [x, -h], 2.4);
return m;
}
function skep(s) {
const m = new Model();
beam(m, [-s * 0.6, 0], [s * 0.6, 0], 2);
m.poly(lumpy(0, -s * 0.6, s * 0.5, s * 0.62, () => 0.5, 0, 3), 'straw', { shade: 'round' });
for (let i = 1; i < 4; i++) m.line([[-s * 0.48, -s * 0.2 * i - 1], [s * 0.48, -s * 0.2 * i - 1]], 'straw', { lum: 0.2 });
m.ellipse(0, -s * 0.2, 1.2, 1, 'straw', { shade: 'flat', tone: -0.5 });
return m;
}
function basalt(rng, w, h) {
const m = new Model();
const x0 = -w / 2, x1 = w / 2;
m.poly([[x0, 0], [x0, -h], [x0 + w * 0.3, -h - w * 0.2], [x1, -h], [x1, 0]], 'rock', { shade: 'facet', lum: 0.42 });
m.poly([[x0, 0], [x0, -h], [x0 + w * 0.3, -h + w * 0.05], [x0 + w * 0.3, 0]], 'rock', { shade: 'facet', lum: 0.62 });
m.poly([[x0, -h], [x0 + w * 0.3, -h - w * 0.2], [x1, -h], [x0 + w * 0.3, -h + w * 0.05]], 'rock', { shade: 'facet', lum: 0.78 });
for (let i = 0; i < 2; i++) { const y = -h * (0.3 + rng.next() * 0.5); m.line([[x0 + 1, y], [x1 - 1, y + 1]], 'rock', { lum: 0.1 }); }
return m;
}
function spire(rng, h, mat = 'gem') {
const m = new Model(), n = 2 + Math.round(rng.next() * 2);
for (let i = 0; i < n; i++) {
const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.35, L = h * (i === Math.floor(n / 2) ? 1 : 0.6), w = L * 0.28;
const c = Math.cos(a), s = Math.sin(a), px = -s, py = c, x = (i - (n - 1) / 2) * 2;
const at = (u, v) => /** @type {[number, number]} */ ([x + c * u + px * v, s * u + py * v]);
m.poly([at(0, -w / 2), at(L * 0.75, -w / 2), at(L, 0), at(L * 0.75, 0), at(0, 0)], mat, { shade: 'facet', lum: 0.8 });
m.poly([at(0, 0), at(L * 0.75, 0), at(L, 0), at(L * 0.75, w / 2), at(0, w / 2)], mat, { shade: 'facet', lum: 0.42 });
}
return m;
}
function cairn(rng, s) {
const m = new Model();
for (let i = 0; i < 3; i++) m.poly(lumpy(0, -s * 0.3 - i * s * 0.55, s * (0.7 - i * 0.15), s * 0.32, R(rng), 0.2, 5), 'rock', { shade: 'round', tone: i * 0.04 });
return m;
}
function scaffold(rng, w, h) {
const m = new Model();
for (const x of [-w / 2, w / 2]) beam(m, [x, 1], [x, -h - 6], 2.4);
beam(m, [-w / 2 - 3, -h], [w / 2 + 3, -h], 2.6);
beam(m, [-w / 2, -h - 6], [w / 2, -h - 6], 1.4);
beam(m, [-w / 2, -2], [w / 2, -h + 2], 1.6);
if (rng.next() < 0.6) beam(m, [w / 2, -2], [-w / 2, -h + 2], 1.6);
if (h > 20) beam(m, [-w / 2, -h / 2], [w / 2, -h / 2], 1.6);
return m;
}
function wheel(rng, r, h) {
const m = new Model();
beam(m, [-r * 0.7, 0], [0, -h], 2.4); beam(m, [r * 0.7, 0], [0, -h], 2.4);
const n = 16, pts = [];
for (let i = 0; i <= n; i++) pts.push([Math.cos((i / n) * Math.PI * 2) * r, -h + Math.sin((i / n) * Math.PI * 2) * r]);
for (let i = 0; i < n; i++) beam(m, pts[i], pts[i + 1], 1.8);
for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI + rng.next() * 0.1; beam(m, [Math.cos(a) * r, -h + Math.sin(a) * r], [-Math.cos(a) * r, -h - Math.sin(a) * r], 1.2); }
m.ellipse(0, -h, 1.8, 1.8, 'metal', {});
return m;
}
return { leafBlock, crown, pad, branchTree, tree, branch, bush, boulder, reeds, fern, tuft, log, stump, mushroom, cloud, beam, crane, ladder, cart, crate, fence, skep, basalt, spire, cairn, scaffold, wheel };
})();
// src/visual/env/trees.js
const __m34 = (() => {
const { branchTree, tree } = __m32;
const { Rng } = __m10;
const { pack, hex } = __m2;
function treeRow(cv, rng, pal, o) {
const haze = pack(hex(o.haze));
const density = cv.meta.artDensity ?? 1;
if (density === 0) return;
o = { ...o, gap: [Math.max(2, o.gap[0] / density), Math.max(2, o.gap[1] / density)] };
for (let x = rng.int(-6, 6); x < cv.W + 10; x += rng.int(o.gap[0], o.gap[1])) {
const h = rng.int(o.h[0], o.h[1]), xi = Math.max(0, Math.min(cv.W - 1, x));
const m = o.kind ? tree(rng, o.kind, h, Math.max(2, h / 16), { look: o.look }) : branchTree(rng, h, Math.max(2, h / 12), { shape: o.shape || 'tall', mats: o.look?.mats });
cv.stamp(m, pal, x, Math.round(o.line[xi]) + (o.dy ?? 0), { haze: [haze, o.fade], outline: false, sway: 1 - o.fade * 0.8 });
}
}
function terrainTrees(cv, rng, pal, o) {
o = { ...o, n: Math.round(o.n * (cv.meta.artDensity ?? 1)) };
const W = cv.W, H = cv.H, S = cv.solid, gap = o.gap ?? 22, [xa, xb] = o.x || [4, W - 5];
const spots = [];
for (let y = 20; y < H - 2; y++) for (let x = xa; x <= xb; x++) {
const k = y * W + x;
if (!S[k] || S[k - W] || cv.liquid[k - W] || cv.rock[k - W]) continue;
if (!o.ledges && cv.ground && y < cv.ground[x] - 4) continue;
let wet = false;
for (let i = -5; i <= 5 && !wet; i++) wet = x + i >= 0 && x + i < W && (cv.liquid[k - W + i] || cv.liquid[k + i]);
if (!wet) spots.push([x, y]);
}
const out = [];
for (let tries = 0; tries < Math.min(60, Math.max(30, o.n * 8)) && out.length < o.n && spots.length; tries++) {
const [x, y] = spots[Math.floor(rng.next() * spots.length)];
if (out.some(([a, b]) => Math.abs(a - x) < gap && Math.abs(b - y) < 30)) continue;
const kind = o.kinds[Math.floor(rng.next() * o.kinds.length)], shape = o.shapes ? o.shapes[Math.floor(rng.next() * o.shapes.length)] : undefined;
const h0 = rng.int(o.h[0], o.h[1]), seed = rng.int(0, 1e9);
for (let f = 1; f >= 0.45; f *= 0.8) {
const h = Math.round(h0 * f), tw = Math.max(2, Math.round(h / 11)), fy = y + 2;
const m = tree(new Rng(seed), kind, h, tw, { shape, look: o.look });
const ok = cv.stamp(m, pal, x, fy, {
roots: [Math.max(4, tw * 1.5), 2], dark: o.dark,
test: (p, X, Y) => {
for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
if (!(p.px[j * p.w + i] >>> 24)) continue;
const xx = X + i, yy = Y + j;
if (yy < 1 || xx < 0 || xx >= W) return false;
if (yy >= H) continue;
const k = yy * W + xx;
if ((S[k] && yy < fy - 3 - tw) || cv.rock[k] || cv.liquid[k] || cv.trees[k] || cv.props[k]) return false;
}
return true;
},
});
if (!ok) continue;
const p = ok.raster.pix;
for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
const xx = ok.x + i, yy = ok.y + j;
if (xx >= 0 && yy >= 0 && xx < W && yy < H && p.px[j * p.w + i] >>> 24) cv.trees[yy * W + xx] = 1;
}
out.push([x, fy, h]);
break;
}
}
return out;
}
return { treeRow, terrainTrees };
})();
// src/visual/env/meadow.js
const __m30 = (() => {
const { sky } = __m22;
const { palette, vary, streamOf } = __m31;
const { heights, dip, raise, fillSolid, blob, paintTerrain, pool, markOpen, silhouette, mountains, treeShape, glow, drips, ledges, sunbeams } = __m24;
const { caveFrame, fog, vines, moss, veins, WATER_VEINS } = __m23;
const { cloud, fence, skep, boulder, spire } = __m32;
const { terrainTrees } = __m34;
const { Model, lumpy } = __m15;
const { pack } = __m2;
function compose(cv, seed) {
const W = cv.W, H = cv.H, s = (p) => streamOf(seed, 'meadow', p);
const pal = vary(palette({
leaf: ['#559c24', { spread: 0.58, warm: 0.5, cool: 0.12 }], leaf2: ['#79ac26', { spread: 0.55, warm: 0.5, cool: 0.12 }], bloom: ['#f0d040', { spread: 0.4 }], bark: '#684022', rock: '#7a7a72', cloud: ['#dce7f4', { spread: 0.25, cool: 0.5 }], gem: ['#aa60e0', { spread: 0.5, n: 5 }],
timber: '#6a4a2e', straw: ['#c8a050', { spread: 0.45 }], moss: '#5a8a34',
}), s('pal'), 1);
sky(cv, 0, 160, ['#126bd0', '#368ce2', '#86c1ed', '#c6e4ee'], 10);
const sx = 230 + s('sun').int(-50, 50), sy = 34;
for (let y = sy - 10; y <= sy + 10; y++) for (let x = sx - 10; x <= sx + 10; x++) if (Math.hypot(x - sx, y - sy) <= 9.5) cv.set(x, y, Math.hypot(x - sx, y - sy) < 7.5 ? pack([1, 0.98, 0.86]) : pack([1, 0.92, 0.66]));
glow(cv, sx, sy, 70, [1, 0.92, 0.7], 0.35);
const cr = s('clouds');
for (let i = 0; i < 4 + cr.int(0, 2); i++) cv.stamp(cloud(cr, cr.int(30, 70), cr.int(8, 14)), pal, cr.int(40, W - 40), cr.int(26, 70), { outline: false, texture: 0 });
mountains(cv, { base: 118, amp: 42, n: 7, seed: s('h1').int(0, 1e9), fill: '#6796bd', lit: '#88b1d1', dark: '#537da6', snow: '#d4e6f2', snowAt: 82 });
fog(cv, '#9ab8d0', 96, 140, 0.25, s('haze').int(0, 1e9));
const wood = silhouette(cv, { base: 124, amp: 8, freq: 0.014, seed: s('h2').int(0, 1e9), fill: '#1e3e30', rim: '#2a5038' });
const tr = s('far');
for (let x = 4; x < W; x += tr.int(5, 12)) treeShape(cv, x, wood[x] + 2, tr.int(12, 24), tr.next() < 0.4 ? 'pine' : 'oak', tr.next() < 0.5 ? '#1e3e30' : '#24482f', tr.int(0, 1e9));
fog(cv, '#9ab8b0', 118, 150, 0.18, s('haze2').int(0, 1e9));
const hills = silhouette(cv, { base: 140, amp: 6, freq: 0.02, seed: s('h3').int(0, 1e9), fill: '#2e5a32', rim: '#3e7238' });
const nr = s('near');
for (let x = nr.int(0, 10); x < W; x += nr.int(14, 30)) treeShape(cv, x, hills[x] + 3, nr.int(20, 34), nr.next() < 0.25 ? 'pine' : 'oak', nr.next() < 0.5 ? '#2e5e30' : '#346a36', nr.int(0, 1e9));
sunbeams(cv, sx, sy, 0.15);
const fs = s('frame'), cave = fs.next() < 0.08;
if (cave) {
const o0 = fs.int(40, 80), o1 = W - fs.int(30, 70);
const frame = caveFrame(cv, {
seed: fs.int(0, 1e9), stones: ['#4a3e30', '#3e3428', '#4a4a34'], mortar: '#140e0a', dark: 0.35, roof: [40, 70], walls: [26, 22], open: [o0, o1],
stal: { n: 10, len: [4, 18], w: [2, 5] }, lip: ['#5a9a34', '#3a6e26'],
});
vines(cv, frame.roof, { cols: ['#5a9a30', '#3e7226', '#2a5020'], leaf: '#6ab83a', flower: '#ff9fc7', seed: fs.int(0, 1e9), rate: 0.3, len: [4, 50] });
}
const ts = s('terrain'), top = heights(W, ts.int(0, 1e9), { base: 166, amp: 10, freq: 0.01 });
const kx = ts.int(40, W - 120);
raise(top, kx, kx + ts.int(40, 70), Math.min(...top) - ts.int(10, 18), 3);
const fr = s('feature'), feature = fr.weighted(['hives', 'stones', 'pond'], [1.2, 0.8, 0.8]);
let pond = null;
if (feature === 'pond') {
const px = kx < W / 2 ? fr.int(220, 320) : fr.int(70, 150), hw = fr.int(26, 40);
pond = { x: px, hw, level: Math.round(top[px]) + 2 };
dip(top, px, hw, 16);
}
fillSolid(cv, top);
if (ts.next() < 0.6) blob(cv, kx + 20, top[kx + 20] + 18, 12, 6, ts.int(0, 1e9), 0);
ledges(cv, top, ts, 6, { keep: pond ? [[pond.x - pond.hw, pond.x + pond.hw]] : [] });
const ss = ts.int(0, 1e9);
paintTerrain(cv, {
a: '#6a4a30', b: '#7e5a3a', grain: '#a08060', dark: '#2a1c12', deep: '#140c08', cave: '#100a06',
crust: ['#8ccf4a', '#5ea83a', '#3f7e2c', '#2e5a22'], crustH: 4, seed: ss,
cobble: { stones: ['#5f564d', '#574d46', '#4d433e', '#6c5e59', '#5a5048', '#635a52'], mortar: '#0a0909', s: 10, moss: ['#3e7a26', '#6ab83a'] },
grass: { cols: ['#6ab83e', '#8ccf4a', '#4e9a34'], tall: 4, rate: 0.7, flowers: ['#fff4c0', '#ffe066', '#ff9fc7', '#c9b0ff', '#ffffff', '#ff7a6a'] },
layers: [
{ kind: 'dirt', cols: ['#89502b', '#995c31', '#b87339', '#c88340', '#c4a684', '#6a4e38'], h: [12, 18] },
],
});
moss(cv, { cols: ['#8ccf4a', '#5ea83a', '#3f7e2c', '#2e5a22'], seed: ss + 1, drape: 12, rate: 0.32, len: 14 });
if (pond) {
cv.meta.pond = pool(cv, pond.x - pond.hw, pond.x + pond.hw, pond.level, { surface: '#d5f6ff', body: ['#268fc7', '#1674ad', '#12598c', '#10446d'], see: 0.15, bed: ['#3a2e20', '#4a3a28', '#2a2018'] });
veins(cv, cv.meta.pond, WATER_VEINS(ss + 4, ['#7aa8d8', '#3a6a98', '#2e5a86', '#244a72']));
}
markOpen(cv);
if (feature === 'hives') {
const fx = fr.int(70, 300), len = fr.int(36, 60);
cv.place(fence(len, 14), pal, fx, { foot: [len * 0.6, 2], range: 240, x: [6, W - len - 6] });
let bx = fr.int(20, W - 60), hives = null;
for (let i = 0; i < 2 + fr.int(0, 1); i++) {
const at = cv.place(skep(9), pal, bx, { foot: [6, 2], range: 30, step: 2 });
if (!at) continue;
hives ||= [at.fx + 6, at.fy - 9];
bx = at.fx + 13;
}
if (hives) cv.meta.hives = hives;
} else if (feature === 'stones') {
let x = fr.int(80, 300);
const ring = ++cv.nprops;
for (let i = 0; i < 4; i++) {
const m = new Model(), hh = fr.int(10, 18);
m.poly(lumpy(0, -hh / 2, 3 + fr.next() * 1.5, hh / 2, () => fr.next(), 0.12, 5), 'rock', { shade: 'round' });
const at = cv.place(m, pal, x, { sink: 2, foot: [4, 2], range: 20, step: 2, group: ring });
x = (at ? at.fx : x) + fr.int(12, 18);
}
}
terrainTrees(cv, s('oaks'), pal, {
n: 3, kinds: ['gnarl', 'gnarl', 'gnarl', 'oak'], shapes: ['spread', 'lean'], h: [60, 130], gap: 60, ledges: true,
look: { mats: ['leaf', 'leaf2'], bloom: { mat: 'bloom', rate: 0.05 } },
});
const rr = s('rocks');
for (let i = 0; i < 2; i++) cv.place(boulder(rr, rr.int(5, 9), rr.int(3, 5), { moss: 'moss' }), pal, rr.int(10, W - 10), { sink: 2, foot: [8, 2] });
const gems = s('gems');
for (let i = 0; i < 2; i++) cv.place(spire(gems, gems.int(10, 16)), pal, gems.int(16, W - 16), { foot: [5, 2], range: 36 });
cv.meta.sun = [sx, sy];
cv.meta.trickles = drips(cv, ss, 3);
cv.meta.vignette = cave ? 0.3 : 0.12;
cv.meta.wind = cave ? 0.8 : 1;
cv.meta.horizon = 120;
}
return { compose };
})();
// src/visual/env/forest.js
const __m35 = (() => {
const { sky } = __m22;
const { palette, vary, streamOf } = __m31;
const { heights, raise, fillSolid, blob, paintTerrain, markOpen, surfaceAt, col, drips, ledges, hanging } = __m24;
const { fog, moss, glowShrooms } = __m23;
const { fern, log, stump } = __m32;
const { treeRow, terrainTrees } = __m34;
const { hash2 } = __m18;
function compose(cv, seed) {
const W = cv.W, H = cv.H, s = (p) => streamOf(seed, 'forest', p);
const autumn = s('season').next() < 0.8;
const pal = vary(palette({
leaf: [autumn ? '#b66a26' : '#438532', { spread: 0.5, cool: 0.1, warm: 0.45 }], leaf2: [autumn ? '#9e4c20' : '#2e7740', { spread: 0.48, cool: 0.1, warm: 0.45 }], bark: ['#684326', { spread: 0.5 }], logbark: ['#6e4c2e', { spread: 0.5 }], wood: '#a87a48', rock: '#5e625c',
moss: ['#4e7a30', { spread: 0.5 }], fern: [autumn ? '#8a6a26' : '#4e8a34', { spread: 0.55 }],
}), s('pal'), 1);
const backPal = vary(palette({ leaf: ['#497456', { spread: 0.38 }], leaf2: ['#638568', { spread: 0.38 }], bark: '#53634c', moss: '#49794a' }), s('back-pal'), 0.4);
const back = '#9ab8a0';
sky(cv, 0, H, ['#c8dcc0', '#b0ccb0', '#90b49c', '#78a088']);
const ts = s('terrain'), top = heights(W, ts.int(0, 1e9), { base: 172, amp: 8, freq: 0.012 });
const rows = s('rows'), far = top.map((v) => v - 14), mid = top.map((v) => v - 6);
const look = { mats: ['leaf', 'leaf2'], hang: { mat: 'moss', rate: 0.6, len: /** @type {[number, number]} */ ([4, 16]) } };
treeRow(cv, rows, backPal, { line: far, gap: [20, 26], h: [50, 58], haze: back, fade: 0.68, shape: 'tall', look });
fog(cv, '#b8d0b8', 60, 190, 0.3, rows.int(0, 1e9));
treeRow(cv, rows, backPal, { line: mid, gap: [26, 34], h: [64, 74], haze: back, fade: 0.45, shape: 'tall', look });
fog(cv, '#b8d0b8', 80, 200, 0.2, rows.int(0, 1e9));
hanging(cv, { base: 14, amp: 10, freq: 0.03, seed: s('canopy').int(0, 1e9), fill: '#183c22', rim: '#2a5230', rough: 4 });
const kx = ts.int(60, W - 140);
raise(top, kx, kx + ts.int(30, 60), Math.min(...top) - ts.int(8, 14), 3);
fillSolid(cv, top);
ledges(cv, top, ts, 6);
const hx = ts.int(60, W - 60);
blob(cv, hx, top[hx] + 20, ts.int(14, 22), 8, ts.int(0, 1e9), 0);
const ss = ts.int(0, 1e9);
paintTerrain(cv, {
a: '#3e2a1c', b: '#4c3422', grain: '#6e5034', dark: '#1a120c', deep: '#0a0806', cave: '#070605',
crust: ['#8cc23c', '#5b982f', '#367127', '#244c20'], crustH: 4, seed: ss,
cobble: { stones: ['#57524a', '#4c4840', '#625c52', '#46443c', '#5a5850', '#504a42'], mortar: '#0a0908', s: 10, moss: ['#2e6024', '#5a9a34'] },
grass: { cols: ['#69a82f', '#93c843', '#4b8c2a'], tall: 3, rate: 0.5, flowers: ['#f08ab0', '#e85a8a', '#f0e0a0'] },
layers: [
{ kind: 'dirt', cols: ['#3a2618', '#442c1c', '#5e4028', '#6e4a2a', '#a49480', '#4e4034'], h: [4, 7] },
],
});
moss(cv, { cols: ['#8cc23c', '#5b982f', '#367127', '#244c20'], seed: ss + 1, drape: 12, rate: 0.32, len: 16 });
roots(cv, s('roots'), '#4a3020', '#6a4630');
markOpen(cv);
litter(cv, s, pal);
terrainTrees(cv, s('oaks'), pal, { n: 8, kinds: ['oak', 'gnarl', 'gnarl', 'tiers'], shapes: ['tall', 'spread', 'lean'], h: [44, 116], gap: 22, ledges: true, look });
ferns(cv, s, pal);
const shafts = s('shafts'), sx0 = shafts.int(110, 230);
cv.light([1, 0.95, 0.7], (x, y) => {
const u = x - sx0 - y * 0.35, c = 14 + (y / H) * 10;
let t = 0;
for (let k = 0; k < 3; k++) { const d = Math.abs(u - k * 34) / c; if (d < 1) t = Math.max(t, (1 - d * d) * (1 - k * 0.25)); }
return t * 0.16 * (1 - y / H);
}, 0, H);
cv.meta.shaft = sx0;
cv.meta.glows = glowShrooms(cv, { n: 5, cap: '#e8642a', lit: '#ffc070', stem: '#e0d0b0', rgb: [1, 0.5, 0.18], seed: s('shrooms').int(0, 1e9) });
cv.meta.trickles = drips(cv, ss, 4);
cv.meta.vignette = 0.18;
cv.meta.wind = 0.9;
cv.meta.horizon = 120;
}
function roots(cv, rt, dark, lit) {
const W = cv.W, H = cv.H, root = col(dark), rootLit = col(lit);
for (let i = 0; i < 14; i++) {
let x = rt.int(0, W - 1), y = surfaceAt(cv, x) + rt.int(3, 8);
const dx = rt.next() < 0.5 ? -1 : 1;
for (let k = 0; k < rt.int(12, 30); k++) {
if (x < 0 || x >= W || y >= H) break;
if (cv.solid[y * W + x] || cv.cave[y * W + x]) { cv.set(x, y, k % 5 ? root : rootLit); if (y + 1 < H) cv.set(x, y + 1, root); }
x += dx; if (hash2(x, y, i) < 0.45) y++;
}
}
}
function litter(cv, s, pal) {
const lr = s('logs');
cv.place(log(lr, lr.int(36, 48), lr.int(5, 7), { moss: 'moss', bark: pal.logbark ? 'logbark' : 'bark' }), pal, lr.int(90, 290), { sink: 2, foot: [22, 3], range: 200 });
cv.place(stump(lr, lr.int(9, 12), lr.int(6, 9)), pal, lr.int(60, 320), { foot: [7, 2], range: 120 });
}
function ferns(cv, s, pal) {
const W = cv.W, fr = s('ferns');
for (let i = 0, n = 0; i < 14 && n < 6; i++) if (cv.place(fern(fr, fr.int(8, 13), { leaf: 'fern' }), pal, fr.int(10, W - 10), { roots: [5, 1], range: 24 })) n++;
}
return { compose, roots, litter, ferns };
})();
// src/visual/env/river.js
const __m36 = (() => {
const { sky } = __m22;
const { palette, vary, streamOf } = __m31;
const { heights, dip, raise, fillSolid, ledges, paintTerrain, pool, markOpen, surfaceAt, silhouette, mountains, treeShape } = __m24;
const { caveFrame, farPillars, fog, vines, moss, glowShrooms, ledgeTops, veins, WATER_VEINS } = __m23;
const { reeds, beam, cloud } = __m32;
const { terrainTrees } = __m34;
const { Model } = __m15;
function compose(cv, seed) {
const W = cv.W, H = cv.H, s = (p) => streamOf(seed, 'river', p);
const pal = vary(palette({
leaf: ['#5d9c29', { spread: 0.5, cool: 0.12 }], leaf2: ['#85aa32', { spread: 0.48, cool: 0.12 }], bark: ['#684528', { spread: 0.5 }], reed: ['#4e7a2e', { spread: 0.5 }],
cattail: '#7a3a22', timber: '#6a4a2e', cloud: ['#eef2f4', { spread: 0.3 }],
}), s('pal'), 1);
const fs = s('frame'), cave = fs.next() < 0.75;
if (cave) {
sky(cv, 0, H, ['#05090c', '#08121a', '#0c1c20', '#102624']);
farPillars(cv, { n: 8, fill: '#0c2930', rim: '#154149', seed: s('far1').int(0, 1e9), w: [10, 20], floor: 180, caps: true });
fog(cv, '#1e4040', 90, 200, 0.35, s('fog1').int(0, 1e9));
farPillars(cv, { n: 5, fill: '#103137', rim: '#1c4648', seed: s('far2').int(0, 1e9), w: [16, 28], floor: 185, caps: true });
fog(cv, '#24504a', 120, 210, 0.25, s('fog2').int(0, 1e9));
const frame = caveFrame(cv, {
seed: fs.int(0, 1e9), stones: ['#494c44', '#5a5b4e', '#41463e'], mortar: '#0b100d', dark: 0.2, roof: [10, 28], walls: [8, 9],
stal: { n: 18, len: [8, 36], w: [3, 7] }, lip: ['#4e8a2e', '#2e5a22'],
});
vines(cv, frame.roof, { cols: ['#78af28', '#4f8a23', '#2c541a'], leaf: '#a3cd38', seed: fs.int(0, 1e9), rate: 0.24, len: [8, 58] });
} else {
sky(cv, 0, 170, ['#3a6eb4', '#6a9ad0', '#a8c8e0', '#d8e6e4']);
const cr = s('clouds');
for (let i = 0; i < 3 + cr.int(0, 2); i++) cv.stamp(cloud(cr, cr.int(30, 60), cr.int(7, 12)), pal, cr.int(0, W), cr.int(14, 50), { outline: false, texture: 0 });
mountains(cv, { base: 118, amp: 70, n: 6, seed: s('m').int(0, 1e9), fill: '#7a8eb4', lit: '#98aacc', dark: '#64769c', snow: '#eef2f8' });
fog(cv, '#c8d8e4', 80, 130, 0.3, s('haze').int(0, 1e9));
const pines = silhouette(cv, { base: 122, amp: 8, freq: 0.02, seed: s('p').int(0, 1e9), fill: '#4e7a6a' });
const pr = s('pines');
for (let x = 2; x < W; x += pr.int(5, 11)) treeShape(cv, x, pines[x] + 2, pr.int(12, 22), 'pine', '#3e6a5a', pr.int(0, 1e9));
}
const ts = s('terrain'), top = heights(W, ts.int(0, 1e9), { base: 168, amp: 8, freq: 0.012 });
const rx = ts.int(150, 240), hw = ts.int(30, 38);
dip(top, rx, hw, 28, 0.45);
const bank = ts.next() < 0.5 ? ts.int(20, 90) : ts.int(300, 360);
raise(top, bank, bank + ts.int(20, 40), Math.min(...top) - ts.int(6, 12), 3);
fillSolid(cv, top);
ledges(cv, top, ts, 8, { keep: [[rx - hw - 6, rx + hw + 6]], high: 1 });
const ss = ts.int(0, 1e9);
paintTerrain(cv, {
a: '#8a7a62', b: '#c8c0a8', grain: '#e8e4d4', dark: '#2a2a22', deep: '#141612', cave: '#0a0c0a',
crust: ['#fefbc7', '#fce199', '#fbd88d', '#f6d187'], crustH: 3, seed: ss,
cobble: { stones: ['#57524a', '#4a463e', '#625e54', '#3e3a34', '#56544a', '#4c4a42'], mortar: '#080807', s: 10, moss: ['#3e7226', '#6aa83a'] },
grass: { cols: ['#5a9a3a', '#7ac04a', '#4a8a30'], tall: 4, rate: 0.32, flowers: ['#ffe58a', '#ffffff'] },
layers: [
{ kind: 'sand', cols: ['#fefbc7', '#fcdb91', '#dfba77', '#927d58'], h: [10, 15] },
{ kind: 'band', cols: ['#525d60', '#606766', '#787c74', '#34322e'], h: [3, 5] },
],
});
moss(cv, { cols: ['#7ac04a', '#4e8a34', '#3a6e2a', '#2a5020'], seed: ss + 1, drape: 12, rate: 0.3, len: 15 });
const level = Math.round(Math.max(top[rx - hw], top[rx + hw])) + 5;
cv.meta.river = pool(cv, rx - hw, rx + hw, level, { surface: '#b3ffff', body: ['#139eac', '#087d90', '#086375', '#064c60', '#063b4e'], see: 0.15, bed: ['#2a3a2e', '#34463a', '#1e2a22'] });
veins(cv, cv.meta.river, WATER_VEINS(ss + 4, ['#5a9a98', '#2a6a68', '#1e5654', '#164442']));
markOpen(cv);
if (s('bridge').next() < 0.8) {
const y = level - 4, m = new Model(), x0 = rx - hw - 4, x1 = rx + hw + 4;
beam(m, [x0, y], [x1, y], 3);
for (let x = x0 + 8; x < x1; x += 16) beam(m, [x, y - 8], [x, y + 1], 1.6);
beam(m, [x0, y - 8], [x1, y - 8], 1.4);
cv.stamp(m, pal, 0, 0, { dark: 0.2, claim: ++cv.nprops });
cv.meta.bridge = [x0, x1, y];
}
const rr = s('reeds');
for (const [x, y] of ledgeTops(cv, 5, rr.int(0, 1e9))) cv.place(reeds(rr, rr.int(10, 16), rr.int(3, 5), { heads: 0.7 }), pal, x, { y, range: 9 });
for (const side of [-1, 1]) {
let x = rx + side * (hw - rr.int(2, 10));
while (cv.liquid[(surfaceAt(cv, x) - 1) * W + x] && x > 0 && x < W - 1) x += side;
cv.place(reeds(rr, rr.int(12, 20), rr.int(4, 7), { heads: 0.6 }), pal, x + side * 4, { range: 30, step: 2, x: side < 0 ? [2, x + 4] : [x - 4, W - 3] });
}
const wr = s('willow');
const look = { mats: ['leaf', 'leaf2'] };
terrainTrees(cv, wr, pal, { n: 1, kinds: ['willow'], h: [70, 126], dark: 0.15, ledges: true, x: rx < W / 2 ? [rx + hw + 20, W - 10] : [10, rx - hw - 20], look });
terrainTrees(cv, wr, pal, { n: 3, kinds: ['oak', 'gnarl'], shapes: ['spread', 'lean', 'tall'], h: [36, 80], gap: 40, ledges: true, look });
cv.meta.glows = glowShrooms(cv, { n: cave ? 9 : 4, cap: '#2ab8d8', lit: '#b0f4ff', stem: '#c8dcd4', rgb: [0.25, 0.75, 0.95], seed: s('shrooms').int(0, 1e9) });
cv.meta.vignette = cave ? 0.3 : 0.14;
cv.meta.wind = cave ? 0.35 : 1;
cv.meta.horizon = 116;
}
return { compose };
})();
// src/visual/env/quarry.js
const __m37 = (() => {
const { sky } = __m22;
const { palette, vary, streamOf } = __m31;
const { fillSolid, blob, ledges, paintTerrain, markOpen, glow, drips, silhouette, mountains, sunbeams } = __m24;
const { caveFrame, farPillars, fog, moss, torch, ledgeTops } = __m23;
const { crane, ladder, cart, crate, beam, boulder, scaffold, wheel, cloud, spire } = __m32;
const { terrainTrees } = __m34;
const { Model } = __m15;
const { Rng } = __m10;
function compose(cv, seed) {
const W = cv.W, H = cv.H, s = (p) => streamOf(seed, 'quarry', p);
const pal = vary(palette({
rock: ['#5a5048', { spread: 0.55 }], timber: ['#6a4428', { spread: 0.5 }], rope: '#4a3a2a', ore: ['#5a4a46', { spread: 0.5 }], metal: '#5a5a62',
seamC: ['#e8c040', { spread: 0.4, n: 4 }], leaf: ['#647e35', { spread: 0.45 }], leaf2: ['#85873e', { spread: 0.45 }], bark: ['#4a3e34', { spread: 0.45 }], cloud: ['#eef0f0', { spread: 0.3 }], gem: ['#f05e48', { spread: 0.5, n: 5, cool: 0.12 }],
}), s('pal'), 0.8);
const fs = s('frame'), cave = fs.next() < 0.2;
if (cave) {
sky(cv, 0, H, ['#070504', '#0e0a08', '#16100c', '#1c140e']);
farPillars(cv, { n: 7, fill: '#1a130e', rim: '#241a12', seed: s('far1').int(0, 1e9), w: [12, 24], floor: 180 });
fog(cv, '#3a2a1c', 80, 200, 0.3, s('fog1').int(0, 1e9));
farPillars(cv, { n: 4, fill: '#22180f', rim: '#30221a', seed: s('far2').int(0, 1e9), w: [20, 34], floor: 185, caps: true });
caveFrame(cv, {
seed: fs.int(0, 1e9), stones: ['#3a3028', '#2e2620', '#463a2e'], mortar: '#0c0806', dark: 0.4, roof: [10, 34], walls: [10, 12],
stal: { n: 18, len: [6, 34], w: [3, 7], tip: '#c8702a' }, lip: ['#5a4a36', '#3a2e22'],
});
} else {
sky(cv, 0, 150, ['#5a8ac0', '#8ab0d4', '#c8d8e0', '#e8e0d0']);
const cr = s('clouds');
for (let i = 0; i < 3; i++) cv.stamp(cloud(cr, cr.int(26, 50), cr.int(6, 10)), pal, cr.int(0, W), cr.int(10, 34), { outline: false, texture: 0 });
mountains(cv, { base: 104, amp: 44, n: 8, seed: s('far').int(0, 1e9), fill: '#b0a498', lit: '#c8beb0', dark: '#9a8e82' });
fog(cv, '#e0d8cc', 70, 120, 0.25, s('haze').int(0, 1e9));
silhouette(cv, { base: 100, amp: 8, freq: 0.02, seed: s('far2').int(0, 1e9), fill: '#8a7e72', rim: '#a09486', rough: 3 });
sunbeams(cv, 32, 52, 0.2);
}
const ts = s('terrain'), top = new Float32Array(W), right = ts.next() < 0.5;
const steps = [ts.int(108, 118), ts.int(128, 138), ts.int(148, 156), ts.int(166, 176)];
let x = 0;
const edges = [];
for (let k = 0; k < steps.length; k++) {
const w = k === steps.length - 1 ? W - x : ts.int(64, 96);
for (let i = x; i < Math.min(W, x + w); i++) top[right ? W - 1 - i : i] = steps[k] + (i - x < 2 ? -1 : 0);
x += w;
edges.push(right ? W - x : x);
}
fillSolid(cv, top);
ledges(cv, top, ts, 8, { rise: [26, 34] });
const ak = ts.int(0, 2), ax = right ? edges[ak] - 14 : edges[ak] + 14, ay = steps[ak + 1] - 8;
blob(cv, ax, ay, 9, 7, ts.int(0, 1e9), 0, 0.1);
for (let yy = ay; yy < steps[ak + 1]; yy++) for (let xx = ax - 9; xx <= ax + 9; xx++) if (cv.solid[yy * W + xx]) { cv.solid[yy * W + xx] = 0; cv.cave[yy * W + xx] = 1; }
const ss = ts.int(0, 1e9);
paintTerrain(cv, {
a: '#5a5048', b: '#4e463e', grain: '#8a7e70', dark: '#1e1812', deep: '#0e0a08', cave: '#060404',
crust: ['#fddf88', '#f7c069', '#e8b160'], crustH: 3, seed: ss,
cobble: { stones: ['#4a3e34', '#3e342c', '#55483c', '#463a30', '#5a4c40', '#40362e'], mortar: '#080605', s: 10 },
layers: [
{ kind: 'banded', cols: ['#fdcc76', '#f7c069', '#fddf88', '#e8b160', '#a86e38'], h: [12, 18] },
{ kind: 'band', cols: ['#525d60', '#606766', '#787c74', '#34322e'], h: [4, 6] },
],
});
moss(cv, { cols: ['#8a7a5e', '#6a5c48', '#4a4034'], seed: ss + 1, drape: 5, rate: 0.08, len: 6 });
const fl = s('flecks'), ores = [[0xff2a5aa8, 0xff3a7ac8], [0xff3ab0e8, 0xff2a7ad0], [0xffd8e0e4, 0xffa8b0b4]];
for (let i = 0; i < 18; i++) {
const cx = fl.int(0, W - 1), cy = fl.int(100, H - 4), ore = ores[i % ores.length], r = fl.int(3, 6);
for (let k = 0; k < r * r * 1.6; k++) {
const a = fl.next() * Math.PI * 2, d = Math.sqrt(fl.next()) * r, xx = Math.round(cx + Math.cos(a) * d * 1.4), yy = Math.round(cy + Math.sin(a) * d);
if (xx < 0 || xx >= W || yy < 0 || yy >= H || !cv.solid[yy * W + xx] || !cv.solid[(yy - 3) * W + xx]) continue;
cv.set(xx, yy, ore[fl.next() < 0.7 ? 0 : 1]);
}
}
for (let i = 0; i < 90; i++) {
const xx = fl.int(0, W - 1), yy = fl.int(0, H - 1);
if (!cv.solid[yy * W + xx]) continue;
cv.set(xx, yy, fl.next() < 0.6 ? 0xff3ab0e8 : 0xff2a7ad0);
}
markOpen(cv);
const fm = new Model();
beam(fm, [-9, 0], [-9, -15], 2.4); beam(fm, [9, 0], [9, -15], 2.4); beam(fm, [-11, -15], [11, -15], 2.6);
cv.stamp(fm, pal, ax, steps[ak + 1], { claim: ++cv.nprops });
cv.meta.adit = [ax, ay];
const tm = s('timber');
const lk = ak === 1 ? 2 : ak === 2 ? 1 : tm.int(1, 2), lxx = right ? edges[lk] - 6 : edges[lk] + 6;
cv.stamp(ladder(steps[lk + 1] - steps[lk] + 6, 0.05), pal, lxx, steps[lk + 1] + 1, { claim: ++cv.nprops });
const r0 = right ? 0 : edges[2], r1 = right ? edges[2] : W, ry = steps[3] - 1;
for (let i = r0; i < r1; i++) { cv.set(i, ry, pal.metal[4]); if (i % 6 === 0) { cv.set(i, ry, pal.timber[1]); cv.set(i + 1, ry, pal.timber[1]); } }
const tcx = Math.round((r0 + r1) / 2) + tm.int(-30, 30);
cv.place(cart(tm, 24), pal, tcx, { y: steps[3], sink: 0, foot: [13, 2], range: 60, x: [r0 + 16, r1 - 16] });
const cx = right ? tm.int(W - 50, W - 24) : tm.int(24, 50), ch = tm.int(60, 72), cseed = tm.int(0, 1e9);
for (let h = ch; h >= 36; h -= 8) {
const cm = crane(new Rng(cseed), h);
if (right) cm.transform(-1, 0, 0, 1, 0, 0, 1);
if (cv.place(cm, pal, cx, { roots: [6, 2], range: 50, x: right ? [edges[0] + 4, W - 3] : [2, edges[0] - 4] })) break;
}
const wx = right ? tm.int(40, 120) : tm.int(W - 120, W - 40);
cv.place(wheel(tm, tm.int(10, 14), tm.int(30, 40)), pal, wx, { roots: [8, 2], range: 80 });
for (let i = 0; i < 2; i++) cv.place(scaffold(tm, tm.int(16, 26), tm.int(16, 30)), pal, tm.int(60, W - 60), { foot: [12, 2], range: 100 });
for (let i = 0; i < 2; i++) cv.place(crate(tm.int(8, 11)), pal, tm.int(30, W - 30), { foot: [6, 2] });
terrainTrees(cv, s('trees'), pal, { n: cave ? 1 : 3, kinds: ['sparse', 'sparse', 'gnarl'], h: [30, 64], gap: 50, ledges: true, dark: cave ? 0.3 : 0, look: { mats: ['leaf', 'leaf2'] } });
const br = s('rubble');
for (let i = 0; i < 4; i++) cv.place(boulder(br, br.int(3, 6), br.int(2, 4)), pal, br.int(10, W - 10), { foot: [5, 1], range: 30 });
const gems = s('gems');
for (let i = 0; i < 2; i++) cv.place(spire(gems, gems.int(12, 19)), pal, gems.int(18, W - 18), { foot: [6, 2], range: 45 });
const lp = new Model();
beam(lp, [0, 0], [0, -26], 2.4); beam(lp, [0, -26], [6, -26], 1.6);
lp.poly([[4, -24], [8, -24], [8, -18], [4, -18]], 'seamC', { shade: 'flat', tone: 0.3 });
const lat = cv.place(lp, pal, tm.int(40, W - 40), { foot: [3, 2], range: 80 });
if (lat) {
glow(cv, lat.fx + 6, lat.fy - 22, 40, [1, 0.7, 0.3], 0.55);
cv.meta.lantern = [lat.fx + 6, lat.fy - 22];
}
glow(cv, ax, ay, 20, [1, 0.6, 0.25], 0.35);
const tr = s('torches');
for (const [x0, y0] of ledgeTops(cv, 3, tr.int(0, 1e9), 8)) {
const h = tr.int(8, 12);
if (!cv.clear(x0 - 1, y0 - h - 4, x0 + 2, y0 - 1)) continue;
torch(cv, x0, y0, h); cv.block(x0 - 3, y0 - 14, x0 + 4, y0 + 1);
}
cv.meta.trickles = drips(cv, ss, 5);
cv.meta.vignette = cave ? 0.32 : 0.14;
cv.meta.wind = cave ? 0.3 : 0.8;
cv.meta.horizon = 100;
}
return { compose };
})();
// src/visual/env/moonfen.js
const __m38 = (() => {
const { sky } = __m22;
const { palette, vary, streamOf } = __m31;
const { heights, dip, raise, fillSolid, ledges, paintTerrain, pool, markOpen, surfaceAt, glow, silhouette, treeShape } = __m24;
const { caveFrame, farPillars, fog, vines, moss, ruins, glowShrooms, veins, WATER_VEINS } = __m23;
const { reeds, spire, cairn } = __m32;
const { terrainTrees } = __m34;
const { fbm2 } = __m18;
const { pack } = __m2;
function compose(cv, seed) {
const W = cv.W, H = cv.H, s = (p) => streamOf(seed, 'moonfen', p);
const pal = vary(palette({
leaf: ['#278679', { spread: 0.45, cool: 0.15 }], leaf2: ['#307d96', { spread: 0.45, cool: 0.15 }], bloom: ['#c860a8', { spread: 0.5 }], moss: ['#3c9270', { spread: 0.45 }], bark: ['#49404b', { spread: 0.4 }], wood: '#5a4a3a', rock: ['#61677e', { spread: 0.45 }],
reed: ['#2e4a34', { spread: 0.45 }], cattail: '#3a2a1e', gem: ['#6ac8f0', { spread: 0.6 }],
}), s('pal'), 0.8);
sky(cv, 0, H, ['#04050e', '#0a0f2a', '#121a40', '#1a2250']);
const st = s('stars');
for (let i = 0; i < 140; i++) { const x = st.int(0, W - 1), y = st.int(0, 110), b = st.next(); cv.set(x, y, pack(b > 0.8 ? [0.95, 0.95, 1] : b > 0.4 ? [0.7, 0.72, 0.95] : [0.45, 0.48, 0.75])); }
for (let i = 0; i < 5; i++) { const x = st.int(4, W - 4), y = st.int(4, 70), c = pack([0.85, 0.9, 1]); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]) cv.set(x + dx, y + dy, c); }
const fs = s('frame'), cave = fs.next() < 0.12, o0 = fs.int(70, 150), o1 = o0 + fs.int(140, 200);
const mx = Math.round((o0 + o1) / 2) + s('moon').int(-30, 30), my = s('moon2').int(30, 44), mr = 12;
glow(cv, mx, my, 80, [0.45, 0.5, 0.8], 0.4);
const ms = s('craters').int(0, 1e9), crescent = s('phase').next() < 0.5;
for (let y = my - mr; y <= my + mr; y++) for (let x = mx - mr; x <= mx + mr; x++) {
if (Math.hypot(x - mx, y - my) > mr + 0.3) continue;
if (crescent && Math.hypot(x - mx - mr * 0.55, y - my + mr * 0.3) < mr * 0.95) continue;
const l = fbm2(x * 0.25, y * 0.25, ms, 2) > 0.58 ? 0.8 : 0.95;
cv.set(x, y, pack([0.86 * l + 0.1, 0.9 * l + 0.08, l]));
}
if (cave) farPillars(cv, { n: 8, fill: '#0e1430', rim: '#141c3e', seed: s('far1').int(0, 1e9), w: [10, 20], floor: 180 });
else {
const tl = s('tl'), line = silhouette(cv, { base: 132, amp: 6, freq: 0.03, seed: tl.int(0, 1e9), fill: '#0e1430', rough: 3 });
for (let x = 2; x < W; x += tl.int(7, 15)) treeShape(cv, x, line[x] + 2, tl.int(12, 26), tl.next() < 0.3 ? 'dead' : 'oak', '#0e1430', tl.int(0, 1e9));
}
fog(cv, '#2a3466', 90, 200, 0.3, s('fog1').int(0, 1e9));
ruins(cv, { n: 5, fill: '#1a2246', line: '#0e1430', rim: '#2a3460', seed: s('ruins').int(0, 1e9), floor: 178 });
fog(cv, '#30407a', 120, 210, 0.22, s('fog2').int(0, 1e9));
if (cave) {
const frame = caveFrame(cv, {
seed: fs.int(0, 1e9), stones: ['#2a2e40', '#22263a', '#30344a'], mortar: '#08080e', dark: 0.4, roof: [26, 50], walls: [12, 14], open: [o0, o1],
stal: { n: 14, len: [6, 28], w: [2, 6] }, lip: ['#2e6a56', '#1e4a3c'],
});
vines(cv, frame.roof, { cols: ['#2e6a56', '#1e4a3c', '#14322a'], leaf: '#3e8a6a', flower: '#8ff0ff', seed: fs.int(0, 1e9), rate: 0.3, len: [4, 50] });
}
const ts = s('terrain'), top = heights(W, ts.int(0, 1e9), { base: 166, amp: 8, freq: 0.02 });
const bx = ts.int(40, W - 100);
raise(top, bx, bx + ts.int(30, 50), Math.min(...top) - ts.int(10, 16), 4);
const pools = [];
for (let i = 0; i < 6 && pools.length < 1; i++) {
const px = ts.int(30, W - 30), hw = ts.int(18, 30);
if (px + hw > bx - 8 && px - hw < bx + 60) continue;
if (pools.some((q) => Math.abs(q.x - px) < q.hw + hw + 16)) continue;
pools.push({ x: px, hw, level: Math.round(top[px]) + 2 });
dip(top, px, hw, ts.int(10, 16));
}
fillSolid(cv, top);
ledges(cv, top, ts, 8, { keep: pools.map((p) => [p.x - p.hw - 4, p.x + p.hw + 4]), high: 1 });
const ss = ts.int(0, 1e9);
paintTerrain(cv, {
a: '#1e1a18', b: '#2a2420', grain: '#4a4038', dark: '#0a0a10', deep: '#050508', cave: '#030305',
crust: ['#7ae3be', '#40b59a', '#287a6c', '#205449'], crustH: 4, seed: ss,
cobble: { stones: ['#283247', '#323850', '#3b425b', '#454f68', '#2e3a4c', '#3a4658'], mortar: '#020308', s: 10, moss: ['#1e4a3c', '#3e8a6a'] },
grass: { cols: ['#2e6a52', '#3e8a6a', '#1e4a3c'], tall: 4, rate: 0.55, flowers: ['#8ff0ff', '#d8ff8a'] },
layers: [
{ kind: 'dirt', cols: ['#1d1c1c', '#24222a', '#33333b', '#404c54', '#516b6e', '#141416'], h: [6, 10] },
{ kind: 'band', cols: ['#33333b', '#404c54', '#516b6e', '#141416'], h: [3, 5] },
],
});
moss(cv, { cols: ['#3e8a6a', '#2e6a52', '#1e4a3c', '#14322a'], seed: ss + 1, drape: 10, rate: 0.25, len: 14 });
cv.meta.pools = pools.map((p) => pool(cv, p.x - p.hw, p.x + p.hw, p.level, { surface: '#b0c4f0', body: ['#22346a', '#1a2a58', '#142046', '#0e1834'], see: 0.15, bed: ['#0e1a14', '#16261e', '#0a0e0c'] }));
cv.meta.pools.forEach((p, i) => veins(cv, p, { ...WATER_VEINS(ss + 4 + i, ['#5a74b0', '#2a3e78', '#22346a', '#1a2a58']), to: '#0c1428', n: 3, reach: 40, rgb: [0.35, 0.45, 0.85] }));
markOpen(cv);
const wr = s('willows');
const look = { mats: ['leaf', 'leaf2'], bloom: { mat: 'bloom', rate: 0.05 }, hang: { mat: 'moss', rate: 0.4, len: /** @type {[number, number]} */ ([4, 12]) } };
terrainTrees(cv, wr, pal, { n: 2, kinds: ['gnarl', 'tiers'], h: [54, 96], dark: 0.06, gap: 120, look });
terrainTrees(cv, wr, pal, { n: 2, kinds: ['dead', 'wisteria', 'gnarl'], shapes: ['lean', 'tall'], h: [36, 70], dark: 0.08, gap: 40, ledges: true, look });
const rr = s('reeds');
for (const p of pools) for (const side of [-1, 1]) {
let x = p.x + side * p.hw;
while (x > 0 && x < W - 1 && cv.liquid[(surfaceAt(cv, x) - 1) * W + x]) x += side;
cv.place(reeds(rr, rr.int(10, 18), rr.int(3, 5), { heads: 0.4 }), pal, x + side * 4, { range: 24, step: 2, x: side < 0 ? [2, x + 4] : [x - 4, W - 3] });
}
const sr = s('stones');
cv.place(cairn(sr, 6), pal, bx + sr.int(5, 25), { foot: [6, 2], range: 30 });
const glows = [];
for (let i = 0; i < 3; i++) {
const at = cv.place(spire(sr, sr.int(12, 20)), pal, sr.int(16, W - 16), { foot: [5, 2], range: 40 });
if (!at) continue;
glow(cv, at.fx, at.fy - 7, 30, [0.3, 0.6, 0.95], 0.4);
glows.push([at.fx, at.fy - 7]);
}
glows.push(...glowShrooms(cv, { n: 7, cap: '#7ae0f0', lit: '#e8ffff', stem: '#5a8a8a', rgb: [0.4, 0.85, 1], seed: s('flowers').int(0, 1e9) }));
const fm = s('mist').int(0, 1e9), mist = pack([0.4, 0.48, 0.72]);
cv.wash(mist, (x, y) => {
const band = Math.exp(-(((y - 160) / 8) ** 2)) * 0.35 + Math.exp(-(((y - 130) / 6) ** 2)) * 0.2;
return band * (fbm2(x * 0.02, y * 0.05, fm, 3) > 0.5 ? 1 : 0.5);
}, 100, H);
cv.meta.glows = glows;
cv.meta.moon = [mx, my];
cv.meta.vignette = 0.3;
cv.meta.wind = cave ? 0.4 : 0.7;
cv.meta.horizon = 124;
}
return { compose };
})();
// src/visual/env/crags.js
const __m39 = (() => {
const { sky } = __m22;
const { palette, vary, streamOf } = __m31;
const { heights, dip, raise, fillSolid, blob, ledges, paintTerrain, pool, markOpen, glow, drips, silhouette, col, rockFace } = __m24;
const { caveFrame, farPillars, fog, moss, fall, veins, LAVA_VEINS } = __m23;
const { basalt, spire, cloud } = __m32;
const { terrainTrees } = __m34;
const { fbm1, hash2 } = __m18;
const { mixPacked } = __m2;
const { Model, lumpy } = __m15;
const LAVA = ['#fff0a0', '#ffc040', '#ff8a2a', '#e05a18', '#a8320e'];
function compose(cv, seed) {
const W = cv.W, H = cv.H, s = (p) => streamOf(seed, 'crags', p);
const pal = vary(palette({
rock: ['#3a2e34', { spread: 0.5 }], lava: ['#e05a18', { spread: 0.7, n: 7, warm: 0.6 }], bark: ['#2a1e1a', { spread: 0.35 }],
gem: ['#f65b4e', { spread: 0.55, cool: 0.15 }], leaf: ['#7f831d', { spread: 0.5 }], leaf2: ['#9a9728', { spread: 0.48 }], bloom: ['#f08a2a', { spread: 0.4 }], wood: '#3a2a20', cloud: ['#4a3a3e', { spread: 0.4 }],
}), s('pal'), 0.6);
const fs = s('frame'), cave = fs.next() < 0.85;
let frame = null;
if (cave) {
sky(cv, 0, H, ['#080303', '#120505', '#1c0807', '#260c08']);
farPillars(cv, { n: 8, fill: '#1a0a08', rim: '#2a0e0a', seed: s('far1').int(0, 1e9), w: [10, 22], floor: 180 });
fog(cv, '#5a180c', 80, 210, 0.35, s('fog1').int(0, 1e9));
farPillars(cv, { n: 5, fill: '#24100c', rim: '#381610', seed: s('far2').int(0, 1e9), w: [18, 30], floor: 185, caps: true });
fog(cv, '#6a2210', 130, 216, 0.25, s('fog2').int(0, 1e9));
frame = caveFrame(cv, {
seed: fs.int(0, 1e9), stones: ['#4d3932', '#5b4038', '#392a27'], mortar: '#080404', dark: 0.2, roof: [10, 30], walls: [8, 9],
stal: { n: 18, len: [6, 34], w: [3, 7], tip: '#ff6a20' }, lip: ['#5a2a1a', '#3a1a12'],
});
for (const [x, y] of cv.meta.tips) glow(cv, x, y, 10, [1, 0.4, 0.12], 0.4);
} else {
sky(cv, 0, H, ['#1a080a', '#3a1010', '#7a2a18', '#c8582a', '#e88a40']);
const cr = s('clouds');
for (let i = 0; i < 4; i++) cv.stamp(cloud(cr, cr.int(40, 90), cr.int(8, 16)), pal, cr.int(0, W), cr.int(10, 50), { outline: false, texture: 0 });
const cs = s('cone'), vx = cs.int(110, 270), cseed = cs.int(0, 1e9);
const cone = volcano(cv, vx, cseed);
const top = cone[vx];
glow(cv, vx, top - 2, 60, [1, 0.45, 0.15], 0.5);
plume(cv, vx, top - 1, cseed + 5);
cv.meta.crater = [vx, top - 4];
silhouette(cv, { base: 124, amp: 10, freq: 0.02, seed: s('r1').int(0, 1e9), fill: '#24161a', rim: '#3a2024', rough: 4, peaks: 0.4 });
fog(cv, '#8a3a1a', 100, 170, 0.25, s('haze').int(0, 1e9));
}
const ts = s('terrain'), top = heights(W, ts.int(0, 1e9), { base: 168, amp: 10, freq: 0.014 });
const px = ts.int(90, W - 90), hw = ts.int(30, 46);
dip(top, px, hw, 22, 0.3);
const kx = px < W / 2 ? ts.int(230, 300) : ts.int(30, 90);
raise(top, kx, kx + ts.int(30, 50), Math.min(...top) - ts.int(10, 16), 2);
fillSolid(cv, top);
ledges(cv, top, ts, 6, { keep: [[px - hw - 6, px + hw + 6]] });
blob(cv, kx + 20, Math.round(top[kx + 20]) + 22, ts.int(16, 24), 7, ts.int(0, 1e9), 0);
const ss = ts.int(0, 1e9);
paintTerrain(cv, {
a: '#2a2228', b: '#352a30', grain: '#5a3a36', dark: '#100a0a', deep: '#060304', cave: '#040203',
crust: ['#a4aa35', '#7d852c', '#555922', '#35351b'], crustH: 4, seed: ss,
cobble: { stones: ['#45312d', '#3a231e', '#5e3a30', '#4a2a22', '#6c4436', '#3e2a26'], mortar: '#050202', s: 10 },
grass: { cols: ['#5a5a26', '#6a6a2e', '#4a4420'], tall: 3, rate: 0.45, flowers: ['#ff5a2a', '#ff8a3a', '#e0302a'] },
layers: [
{ kind: 'ash', cols: ['#625658', '#6c5e60', '#d8c0b0'], h: [6, 9] },
{ kind: 'gravel', cols: ['#c0603a', '#8a3a22', '#5a2416', '#1a0c08'], h: [3, 5] },
],
});
moss(cv, { cols: ['#6a6a2e', '#4e4e24', '#3a3a1e', '#2a2418'], seed: ss + 1, drape: 8, rate: 0.18, len: 10 });
const level = Math.round(Math.max(top[px - hw], top[px + hw])) + 4;
cv.meta.lava = pool(cv, px - hw, px + hw, level, { surface: '#ffe680', body: ['#ffb040', '#ff8a2a', '#e05a18', '#b03a10'], see: 0, bed: ['#ffd060', '#e05a18', '#5a2a1a'] });
veins(cv, cv.meta.lava, LAVA_VEINS(ss + 4));
glow(cv, px, level, hw + 50, [1, 0.42, 0.12], 0.6);
markOpen(cv);
const lf = s('falls');
const fx = px + lf.int(-hw + 8, hw - 8);
if (frame) fall(cv, fx, Math.max(0, frame.roof[fx]) + 1, { w: 3, cols: LAVA, rgb: [1, 0.45, 0.12], seed: lf.int(0, 1e9) });
const br = s('basalt');
for (let g = 0; g < 2; g++) {
let x = br.int(20, W - 40);
const group = ++cv.nprops;
for (let i = 0; i < br.int(3, 5); i++) {
const at = cv.place(basalt(br, 6, br.int(10, 24)), pal, x, { sink: 2, foot: [3, 2], range: i ? 2 : 40, step: 1, group });
if (!at) break;
x = at.fx + 6;
}
}
const gr = s('glass');
for (let i = 0; i < 2; i++) cv.place(spire(gr, gr.int(8, 13)), pal, gr.int(10, W - 10), { foot: [4, 2], range: 30 });
const dr = s('brush');
terrainTrees(cv, dr, pal, { n: 2, kinds: ['gnarl', 'sparse'], h: [34, 64], gap: 60, ledges: true, look: { mats: ['leaf', 'leaf2'], bloom: { mat: 'bloom', rate: 0.08 } } });
terrainTrees(cv, dr, pal, { n: 3, kinds: ['dead'], h: [18, 34], gap: 30, ledges: true });
const vr = s('vents'), vents = [];
for (let i = 0; i < 2; i++) {
const m = new Model();
m.poly(lumpy(0, -4, 9, 5, () => vr.next(), 0.2, 6), 'rock', { shade: 'round' });
m.ellipse(0, -9, 2.5, 1, 'lava', { shade: 'flat', tone: 0.3 });
const at = cv.place(m, pal, vr.int(30, W - 30), { foot: [9, 2], range: 40 });
if (!at) continue;
glow(cv, at.fx, at.fy - 9, 16, [1, 0.5, 0.2], 0.4);
vents.push({ x: at.fx, y: at.fy - 10, r: 4 });
}
cv.meta.vents = vents;
cv.meta.trickles = drips(cv, ss, 4);
cv.meta.vignette = cave ? 0.32 : 0.2;
cv.meta.wind = cave ? 0.3 : 0.6;
cv.meta.horizon = 120;
}
function volcano(cv, vx, seed) {
const W = cv.W, top = 46, cr = 13 + Math.round(hash2(1, 1, seed) * 5), line = new Float32Array(W), own = new Int16Array(W);
for (let x = 0; x < W; x++) {
const d = Math.abs(x - vx), side = x < vx ? 0 : 1;
let y = d < cr ? top + (cr - d < 4 ? 0 : 2) : top + 96 * (1 - Math.exp(-(d - cr) / (side ? 78 : 66)));
if (d < cr - 3) y = top + 3 + Math.round((1 - d / cr) * 2) - (x < vx ? 1 : 0);
y += (fbm1(x * 0.06, seed + 2, 3) - 0.5) * 9 * Math.min(1, d / 30 + 0.3) + (fbm1(x * 0.25, seed + 3, 2) - 0.5) * 3;
line[x] = Math.round(y);
}
rockFace(cv, line, own, [[vx, top, 96]], { seed, fill: '#3e2628', lit: '#5a3634', dark: '#2c1a1e', bottom: 140, deep: 1.2 });
const glowC = [col('#ffe680'), col('#ffb040'), col('#e0601e')];
for (let x = vx - cr + 4; x <= vx + cr - 4; x++) {
const y = line[x];
cv.set(x, y, glowC[Math.abs(x - vx) < cr * 0.4 ? 0 : 1]);
cv.set(x, y + 1, glowC[2]);
if (hash2(x, 3, seed) < 0.5) cv.set(x, y - 1, glowC[2]);
}
const runs = [[vx + (hash2(2, 1, seed) < 0.5 ? -1 : 1) * (cr - 4), 1, 0]];
for (let r = 0; r < runs.length && r < 7; r++) {
let [x, alive, gen, y0] = runs[r];
const dir = x < vx ? -1 : 1, len = gen ? 30 + hash2(r, 6, seed) * 40 : 90;
let y = y0 ?? line[Math.round(x)] + 1, px = Math.round(x);
for (let k = 0; k < len && alive; k++, y++) {
x += dir * (0.25 + fbm1(k * 0.07, seed + r * 9, 2) * 0.6) + (hash2(k, r, seed + 4) - 0.5) * 0.5;
let xi = Math.round(x);
xi = Math.max(px - 1, Math.min(px + 1, xi)); x = Math.max(x - 1, Math.min(x + 1, x));
if (xi < 1 || xi >= W - 1 || y >= 138) break;
if (y < line[xi]) y = line[xi];
const t = k / 90, core = t < 0.4 ? glowC[0] : t < 0.7 ? glowC[1] : glowC[2], edge = mixPacked(glowC[2], col('#3e2628'), 0.25 + t * 0.55);
cv.set(xi, y, core);
if (xi !== px) cv.set(px, y, core);
cv.set(xi + dir, y, edge);
if (gen === 0 && t < 0.4) cv.set(xi - dir, y, edge);
px = xi;
if (k > 10 && hash2(k, r, seed + 5) < 0.03 && runs.length < 7) runs.push([x, 1, gen + 1, y]);
if (k % 18 === 9) cv.glow(xi, y, 10, [1, 0.45, 0.15], 0.22);
}
}
return line;
}
function plume(cv, x0, y0, seed) {
const W = cv.W, cols = ['#2a1e22', '#3e3036', '#56464c', '#706068'].map(col), fire = [col('#7a3a24'), col('#b8582a')];
const puffs = [];
for (let i = 0; i < 9; i++) {
const t = i / 8, r = 4 + t * 9 + hash2(i, 1, seed) * 3;
puffs.push([x0 + t * t * 34 + (hash2(i, 2, seed) - 0.5) * 6, y0 - 3 - t * 40, r, t]);
}
for (let i = puffs.length - 1; i >= 0; i--) {
const [cx, cy, r, t] = puffs[i];
for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r * 1.2); x <= cx + r * 1.2; x++) {
if (x < 0 || y < 0 || x >= W) continue;
const u = (x - cx) / (r * 1.2), v = (y - cy) / r, a = Math.atan2(v, u), e = u * u + v * v - 0.12 * Math.abs(Math.sin(a * 4 + i));
if (e > 1) continue;
const lit = -(u * 0.6 + v * 0.8) + (1 - e) * 0.3;
let c = lit > 0.55 ? cols[3] : lit > 0.1 ? cols[2] : lit > -0.4 ? cols[1] : cols[0];
if (t < 0.3 && v > 0.1) c = v > 0.5 ? fire[1] : fire[0];
if (e > 0.82 && v > 0.2) c = cols[0];
cv.set(x, y, c);
}
}
}
return { compose };
})();
// src/visual/env/netherwood.js
const __m40 = (() => {
const { sky } = __m22;
const { palette, vary, streamOf } = __m31;
const { heights, dip, raise, fillSolid, blob, paintTerrain, pool, markOpen, drips, ledges, glow } = __m24;
const { caveFrame, farPillars, fog, vines, moss, glowShrooms, veins, WATER_VEINS } = __m23;
const { mushroom } = __m32;
const { treeRow, terrainTrees } = __m34;
const { roots, litter, ferns } = __m35;
function compose(cv, seed) {
const W = cv.W, H = cv.H, s = (p) => streamOf(seed, 'netherwood', p);
const pal = vary(palette({
leaf: ['#218577', { spread: 0.44, cool: 0.18 }], leaf2: ['#26748a', { spread: 0.44, cool: 0.18 }], bloom: ['#b080f0', { spread: 0.4 }], bark: ['#4a3444', { spread: 0.4 }], logbark: ['#71504a', { spread: 0.45 }], wood: '#a07756', rock: '#4a4a56',
moss: ['#2e6a5a', { spread: 0.5 }], fern: ['#2a6a5e', { spread: 0.5 }],
stem: ['#d8d0ec', { spread: 0.4 }], cap: ['#9a5ae0', { spread: 0.6 }], spot: '#f4e8ff',
}), s('pal'), 1);
const back = '#0e1820';
sky(cv, 0, H, ['#03080e', '#06121d', '#092536', '#123649']);
farPillars(cv, { n: 8, fill: '#0d2332', rim: '#15364a', seed: s('far1').int(0, 1e9), w: [10, 22], floor: 180, caps: true });
fog(cv, '#1c2c40', 80, 200, 0.3, s('fog1').int(0, 1e9));
const ts = s('terrain'), top = heights(W, ts.int(0, 1e9), { base: 172, amp: 8, freq: 0.012 });
const rows = s('rows'), far = top.map((v) => v - 14), mid = top.map((v) => v - 6);
const look = { mats: ['leaf', 'leaf2'], bloom: { mat: 'bloom', rate: 0.04 }, hang: { mat: 'moss', rate: 0.5, len: /** @type {[number, number]} */ ([4, 14]) } };
treeRow(cv, rows, pal, { line: far, gap: [22, 30], h: [48, 58], haze: back, fade: 0.72, shape: 'tall', look });
fog(cv, '#1c2c40', 60, 190, 0.22, rows.int(0, 1e9));
treeRow(cv, rows, pal, { line: mid, gap: [28, 38], h: [60, 72], haze: back, fade: 0.55, shape: 'lean', look });
fog(cv, '#24344a', 80, 200, 0.15, rows.int(0, 1e9));
const fs = s('frame');
const frame = caveFrame(cv, {
seed: fs.int(0, 1e9), stones: ['#47424b', '#38343e', '#4d4c55'], mortar: '#08080d', dark: 0.2, roof: [12, 30], walls: [8, 9],
stal: { n: 12, len: [8, 28], w: [3, 6] }, lip: ['#3e7a6a', '#24504a'],
});
vines(cv, frame.roof, { cols: ['#5a4232', '#46321f', '#2e2016'], leaf: '#6a4e3a', flower: '#c8a0ff', seed: fs.int(0, 1e9), rate: 0.22, len: [6, 48] });
const kx = ts.int(60, W - 140);
raise(top, kx, kx + ts.int(30, 60), Math.min(...top) - ts.int(8, 14), 3);
let still = null;
if (ts.next() < 0.5) {
const px = kx < W / 2 ? ts.int(230, 320) : ts.int(60, 140), hw = ts.int(22, 32);
still = { x: px, hw, level: Math.round(top[px]) + 2 };
dip(top, px, hw, 14);
}
fillSolid(cv, top);
ledges(cv, top, ts, 6, { keep: still ? [[still.x - still.hw - 6, still.x + still.hw + 6]] : [] });
const hx = ts.int(60, W - 60);
if (!still || Math.abs(hx - still.x) > still.hw + 30) blob(cv, hx, top[hx] + 20, ts.int(14, 22), 8, ts.int(0, 1e9), 0);
const ss = ts.int(0, 1e9);
paintTerrain(cv, {
a: '#2a2228', b: '#342a30', grain: '#54465a', dark: '#100c10', deep: '#060408', cave: '#040305',
crust: ['#67d7aa', '#39a788', '#247d70', '#1c5555'], crustH: 4, seed: ss,
cobble: { stones: ['#3a3444', '#443c4e', '#4e4658', '#36303e', '#48405a', '#3e3848'], mortar: '#050408', s: 10, moss: ['#2a5a4e', '#4e8a7a'] },
grass: { cols: ['#3e7a6a', '#5aa08a', '#2a5a4e'], tall: 3, rate: 0.45, flowers: ['#c8a0ff', '#8ff0ff', '#f0c8ff'] },
layers: [
{ kind: 'dirt', cols: ['#241e2a', '#2c2432', '#3e3248', '#4a3a58', '#6e5a86', '#16121a'], h: [6, 10] },
],
});
moss(cv, { cols: ['#5aa08a', '#3e7a6a', '#2a5a4e', '#1e4038'], seed: ss + 1, drape: 10, rate: 0.25, len: 14 });
roots(cv, s('roots'), '#3a2a24', '#5a4232');
if (still) {
cv.meta.pool = pool(cv, still.x - still.hw, still.x + still.hw, still.level, { surface: '#a8a0e0', body: ['#1e1e3a', '#16162e', '#101024', '#0a0a1a'], see: 0.15, bed: ['#1a1620', '#241e2a', '#120e16'] });
veins(cv, cv.meta.pool, { ...WATER_VEINS(ss + 4, ['#6a5ab0', '#2e2a5a', '#1e1e3a', '#16162e']), to: '#100c1e', n: 4, reach: 44, rgb: [0.5, 0.4, 0.95] });
}
markOpen(cv);
litter(cv, s, pal);
terrainTrees(cv, s('trees'), pal, { n: 5, kinds: ['gnarl', 'tiers', 'gnarl'], shapes: ['spread', 'lean'], h: [44, 96], gap: 36, ledges: true, dark: 0.05, look });
const mr = s('mushrooms'), glows = [];
for (let i = 0, n = 0; i < 10 && n < 3; i++) {
const h = mr.int(18, 34), r = Math.round(h * mr.range(0.4, 0.55));
const at = cv.place(mushroom(mr, h, r, { spot: 'spot' }), pal, mr.int(30, W - 30), { sink: 2, roots: [r * 0.4, 2], range: 120 });
if (!at) continue;
glow(cv, at.fx, at.fy - h + r * 0.2, r * 3.4, [0.6, 0.35, 1], 0.55);
glow(cv, at.fx, at.fy - h * 0.45, h * 0.6, [0.75, 0.55, 1], 0.4);
glow(cv, at.fx, at.fy - 1, r * 1.6, [0.6, 0.35, 1], 0.3);
glows.push([at.fx, Math.round(at.fy - h + r * 0.3)]);
n++;
}
ferns(cv, s, pal);
glows.push(...glowShrooms(cv, { n: 9, cap: '#9a5ae8', lit: '#f0c8ff', stem: '#c8c0d0', rgb: [0.62, 0.38, 1], seed: s('shrooms').int(0, 1e9) }));
cv.meta.glows = glows;
cv.meta.trickles = drips(cv, ss, 4);
cv.meta.vignette = 0.32;
cv.meta.wind = 0.3;
cv.meta.horizon = 120;
}
return { compose };
})();
// src/visual/env/garden.js
const __m41 = (() => {
const { Rng, hashString } = __m10;
const { sky } = __m22;
const { heights, fillSolid, paintTerrain, markOpen, col } = __m24;
const { fog } = __m23;
function compose(cv, seed) {
const rng = new Rng('garden:' + seed), W = cv.W, H = cv.H;
sky(cv, 0, H, ['#171f2b', '#344c49', '#718366', '#9eaa77']);
fog(cv, '#b4bb85', 40, 160, 0.2, hashString(seed));
const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < W && j < H) cv.set(i, j, col(c)); };
rect(0, 24, 48, 145, '#323b35');
for (let y = 28; y < 164; y += 9) for (let x = 0; x < 48; x += 13) rect(x + (y % 2) * 5, y, 11, 7, '#475146');
rect(12, 68, 24, 35, '#1a252a'); rect(15, 71, 18, 27, '#d9a65b'); rect(23, 71, 2, 28, '#5a3c29');
for (let x = 55; x < W; x += 17) { rect(x, 123 + rng.int(-2, 2), 4, 35, '#644630'); rect(x, 123, 2, 35, '#98713e'); }
rect(48, 134, W - 48, 3, '#8f683f'); rect(48, 148, W - 48, 3, '#593f2d');
fillSolid(cv, heights(W, hashString(seed), { base: 175, amp: 3, freq: 0.014 }));
paintTerrain(cv, { a: '#493225', b: '#62402a', grain: '#9b7750', dark: '#231c1b', deep: '#232325', cave: '#111d21',
crust: ['#789948', '#4c6b38', '#3e4c2b'], seed: hashString(seed),
cobble: { stones: ['#6b6b5e', '#52594f', '#858372'], mortar: '#262b29', s: 8 },
layers: [{ kind: 'dirt', cols: ['#3c2c22', '#503624', '#876047', '#79523a', '#a89a7b', '#4e4134'], h: [9, 13] }],
});
for (let x = 55; x < W - 20; x += 65) {
rect(x, 165, 49, 5, '#808474'); rect(x + 2, 165, 45, 1, '#a6a48a'); rect(x + 4, 159, 41, 6, '#3d2b20');
for (let i = 0; i < 12; i++) rect(x + rng.int(5, 43), rng.int(159, 163), 2, 1, '#674732');
}
cv.pending.push([24, 84, 45, [1, 0.68, 0.3], 0.28]);
markOpen(cv); cv.meta.vignette = 0.15; cv.meta.wind = 0.3;
}
return { compose };
})();
// src/visual/env/exotic.js
const __m42 = (() => {
const { Rng, hashString } = __m10;
const { sky } = __m22;
const { heights, dip, raise, fillSolid, blob, paintTerrain, markOpen, col, pool, surfaceAt, ledges, silhouette, sunbeams } = __m24;
const { caveFrame, farPillars, fog, vines, ruins, fall, moss, torch } = __m23;
const { palette } = __m31;
const { treeRow, terrainTrees } = __m34;
const { hash2 } = __m18;
const { branchTree, spire, fern, cairn, mushroom } = __m32;
const EXOTIC_ART = {
skyshard: { sky: ['#284e85', '#4d98c0', '#85c8dc', '#d2ebdf'], rock: ['#424868', '#61637d', '#807f92'], turf: ['#a7d95c', '#78b342', '#4b793e'], gem: '#73d9fa', soil: '#524969' },
morphgrove: { sky: ['#112331', '#284c55', '#426f6b', '#6d9e8c'], rock: ['#424951', '#555d60', '#6e7470'], turf: ['#a8cd5d', '#659b43', '#40683c'], gem: '#e89ccd', soil: '#5c3a43' },
veil: { sky: ['#060a15', '#121e29', '#223842', '#385359'], rock: ['#343f4c', '#4c585c', '#616e6c'], turf: ['#a3c589', '#688767', '#405b51'], gem: '#c7a6ee', soil: '#383a48' },
ghostglass: { sky: ['#020c20', '#092b45', '#104862', '#126875'], rock: ['#263b55', '#37526a', '#4a6980'], turf: ['#8bedf3', '#47b4c6', '#257b92'], gem: '#68e7ef', soil: '#31475d' },
chronoglass: { sky: ['#584270', '#9d6f8d', '#dca788', '#f0d4a2'], rock: ['#665157', '#8b695f', '#ad866b'], turf: ['#f1d582', '#d5af62', '#a47d4b'], gem: '#d4a1f0', soil: '#92704c' },
};
function composeExotic(cv, seed, id) {
const rng = new Rng(`${id}:terrain-v1:${seed}`), a = EXOTIC_ART[id], W = cv.W, H = cv.H, nseed = hashString(seed + id);
sky(cv, 0, H, a.sky);
cv.meta.exotic = id; cv.meta.interactionPoints = [];
cv.meta.pools = [];
const pools = [];
const treePal = palette({ bark: '#765043', wood: '#b38c62', leaf: '#63ab58', leaf2: '#c878bb', bloom: '#f2b7de', moss: '#63b59a' });
const pal = palette({ bark: '#68434c', wood: '#9a6e59', leaf: id === 'morphgrove' ? '#b26999' : '#4b9a99', leaf2: '#749d69', rock: a.rock[1], gem: a.gem });
if (id === 'skyshard') {
for (let i = 0; i < 13; i++) {
const x = rng.int(-10, W + 10), y = rng.int(20, H - 10), w = rng.int(10, 32);
for (let yy = -4; yy < 5; yy++) for (let xx = -w; xx <= w; xx++) {
if ((xx / w) ** 2 + (yy / 5) ** 2 < 1 + hash2(xx, yy, nseed + i) * 0.2) cv.set(x + xx, y + yy, col(yy < 1 ? '#deeff3' : '#aed4e6'));
}
}
for (let i = 0; i < 8; i++) {
const x = rng.int(0, W - 1), y = rng.int(35, 195), w = rng.int(7, 15);
for (let j = 0; j < 13; j++) for (let k = -w + j; k <= w - j; k++) cv.set(x + k, y + j, col(j < 2 ? '#8dc6a4' : '#6b9eae'));
}
for (let i = 0; i < 5; i++) {
const x = 35 + i * 76 + rng.int(-10, 10), y = 87 + (i % 2) * 68 + rng.int(-10, 10), rx = rng.int(24, 34), depth = rng.int(28, 45);
for (let yy = y; yy < Math.min(H, y + depth); yy++) {
const u = (yy - y) / depth, half = rx * (1 - u ** 1.7) + (hash2(0, yy, nseed + i) - 0.5) * 4;
for (let xx = Math.max(0, Math.ceil(x - half)); xx <= Math.min(W - 1, x + half); xx++) cv.solid[yy * W + xx] = 1;
}
cv.meta.interactionPoints.push([x + rng.int(-9, 9), Math.max(30, y - 42)]);
}
cv.ground = Float32Array.from({ length: W }, (_, x) => surfaceAt(cv, x));
sunbeams(cv, 310, 12, 0.16);
} else {
const top = heights(W, nseed, { base: id === 'ghostglass' ? 187 : 176, amp: id === 'chronoglass' ? 17 : 9, freq: 0.012 });
if (id === 'morphgrove') {
for (let i = 0; i < 3; i++) raise(top, 24 + i * 130, 68 + i * 130, 153 - i % 2 * 14, 12);
treeRow(cv, rng, treePal, { line: top.map((y) => y - 14), gap: [27, 40], h: [64, 94], haze: '#54837f', fade: 0.67, shape: 'lean' });
treeRow(cv, rng, treePal, { line: top.map((y) => y - 5), gap: [38, 54], h: [74, 105], haze: '#427a73', fade: 0.4, shape: 'spread' });
dip(top, 210, 26, 22); pools.push({ x0: 184, x1: 236, level: Math.round(top[184]) + 2 });
}
if (id === 'veil') {
dip(top, 192, 44, 28); pools.push({ x0: 149, x1: 235, level: 191 });
treeRow(cv, rng, treePal, { line: top.map((y) => y - 8), gap: [33, 47], h: [74, 110], haze: '#273f48', fade: 0.78, shape: 'lean' });
}
if (id === 'ghostglass') {
for (let i = 0; i < 5; i++) { const x = 17 + i * 83; raise(top, x, x + 40, 106 + i % 3 * 29, 8); }
pools.push({ x0: 0, x1: W - 1, level: 186 });
}
if (id === 'chronoglass') {
silhouette(cv, { base: 134, amp: 13, freq: 0.013, seed: nseed + 1, fill: '#b58785', rough: 2 });
silhouette(cv, { base: 157, amp: 12, freq: 0.018, seed: nseed + 2, fill: '#c99c83', rough: 2 });
ruins(cv, { n: 9, fill: '#99747e', line: '#79576b', rim: '#bd9696', seed: nseed, floor: 171 });
} else if (id !== 'morphgrove') farPillars(cv, { n: 7, fill: a.sky[1], rim: a.sky[2], seed: nseed, w: [8, 18], floor: 184, caps: false });
fog(cv, a.sky[2], 75, 195, id === 'veil' ? 0.2 : 0.1, nseed);
fillSolid(cv, top);
if (id === 'morphgrove' || id === 'veil' || id === 'chronoglass') ledges(cv, top, rng, 5, { high: id === 'chronoglass' ? 2 : 1, keep: pools.map((p) => [p.x0 - 4, p.x1 + 4]) });
for (let i = 0; i < 4; i++) blob(cv, rng.int(30, W - 30), rng.int(188, 210), rng.int(12, 26), rng.int(6, 10), rng.int(0, 1e9), 0, 0.17);
if (id === 'veil') {
const frame = caveFrame(cv, { seed: nseed, stones: a.rock, mortar: '#050a11', roof: [9, 20], walls: [7, 7], dark: 0.15, stal: { n: 10, len: [5, 17] } });
vines(cv, frame.roof, { cols: ['#8a6aa0', '#5f5274', '#3b3c58'], seed: nseed, rate: 0.34, len: [18, 62], leaf: '#8c81b0', flower: '#c6a2f5' });
}
}
paintTerrain(cv, { a: a.soil, b: a.rock[0], grain: a.rock[2], dark: '#101520', deep: a.sky[0], cave: a.sky[0], crust: a.turf, crustH: 3, seed: nseed,
cobble: { stones: a.rock, mortar: '#101422', s: id === 'chronoglass' ? 9 : 7 },
layers: [{ kind: id === 'chronoglass' ? 'sand' : 'dirt', cols: [a.soil, a.rock[0], a.rock[2], a.soil, a.rock[1], a.sky[0]], h: [5, 10] }],
grass: id === 'chronoglass' ? undefined : { cols: a.turf, tall: 3, rate: 0.3 },
});
markOpen(cv);
if (id === 'morphgrove') {
terrainTrees(cv, rng, treePal, { n: 7, kinds: ['gnarl', 'oak', 'tiers'], shapes: ['lean', 'spread'], h: [56, 99], gap: 25, ledges: true, look: { mats: ['leaf', 'leaf2'], bloom: { mat: 'bloom', rate: 0.08 } } });
for (let i = 0; i < 4; i++) {
const x = 36 + i * 100, y = surfaceAt(cv, x);
cv.place(mushroom(rng, rng.int(12, 20), rng.int(9, 15), { cap: 'leaf2', stem: 'wood' }), treePal, x, { roots: [3, 1], range: 20 });
cv.meta.interactionPoints.push([x, Math.max(35, y - 23)]);
}
}
if (id === 'skyshard' || id === 'veil' || id === 'chronoglass') {
const x = id === 'skyshard' ? 181 : id === 'veil' ? 285 : 77, y = surfaceAt(cv, x);
gate(cv, x, y, id === 'chronoglass' ? '#b18b61' : '#7e9894', id === 'skyshard' ? '#a9eaff' : id === 'veil' ? '#d2bded' : '#f9d68f');
if (id === 'veil') { torch(cv, x - 15, y - 5, 8); torch(cv, x + 15, y - 5, 8); }
}
if (id === 'skyshard') terrainTrees(cv, rng, treePal, { n: 3, kinds: ['gnarl'], shapes: ['spread'], h: [20, 32], gap: 45, ledges: true, look: { mats: ['leaf'] } });
if (id === 'morphgrove' || id === 'veil') moss(cv, { cols: a.turf, seed: nseed + 5, drape: 9, rate: 0.24, len: 12 });
for (const p of pools) cv.meta.pools.push(pool(cv, p.x0, p.x1, p.level, { surface: id === 'ghostglass' ? '#76e4ee' : '#b2d9dc', body: ['#286a7c', '#1b526a', '#14394f'], see: 0.12 }));
if (id === 'ghostglass') {
for (let i = 0; i < 9; i++) coral(cv, 22 + i * 42 + rng.int(-8, 8), surfaceAt(cv, 22 + i * 42), rng.int(15, 33), i % 2 ? '#de86d9' : '#62dbe1', nseed + i);
for (let i = 0; i < 5; i++) cv.light([0.22, 0.6, 0.9], (x, y) => Math.max(0, 1 - Math.abs(x - i * 95 + y * 0.45) / 9) * 0.11, 0, H);
}
for (let i = 0; i < 9; i++) {
const x = rng.int(12, W - 12), y = surfaceAt(cv, x);
if (y < 30 || y >= H - 5) continue;
if (id !== 'morphgrove') cv.place(spire(rng, rng.int(9, 25)), pal, x, { seed: nseed + i, roots: [1, 3] });
else cv.place(fern(rng, rng.int(8, 14)), pal, x, { seed: nseed + i });
cv.pending.push([x, y - 10, 22, id === 'chronoglass' ? [0.6, 0.3, 1] : [0.25, 0.7, 1], 0.3]);
if (id !== 'skyshard' && id !== 'morphgrove') cv.meta.interactionPoints.push([x, y - 12]);
}
if (id === 'chronoglass') cv.meta.sandfalls = cv.meta.interactionPoints.slice(0, 4);
for (let k = 0; k < cv.open.length; k++) if (cv.liquid[k] || (k >= W && cv.liquid[k - W])) cv.open[k] = 0;
cv.meta.vignette = id === 'veil' ? 0.3 : 0.12; cv.meta.wind = id === 'skyshard' ? 1.4 : 0.6;
}
const skyshard = { compose: (cv, seed) => composeExotic(cv, seed, 'skyshard') };
const morphgrove = { compose: (cv, seed) => composeExotic(cv, seed, 'morphgrove') };
const veil = { compose: (cv, seed) => composeExotic(cv, seed, 'veil') };
const ghostglass = { compose: (cv, seed) => composeExotic(cv, seed, 'ghostglass') };
const chronoglass = { compose: (cv, seed) => composeExotic(cv, seed, 'chronoglass') };
function gate(cv, x, y, stone, gem) {
if (y > cv.H - 8 || y < 50) return;
const base = col(stone), edge = col('#343742'), glow = col(gem), h = 31;
for (let yy = y - h; yy < y; yy++) for (const side of [-1, 1]) for (let j = 0; j < 5; j++) {
const xx = x + side * 13 + j - 2;
cv.set(xx, yy, (yy % 7 === 0 || j === 4) ? edge : base);
}
for (let xx = -14; xx <= 16; xx++) for (let j = 0; j < 5; j++) cv.set(x + xx, y - h + j, j === 4 || xx % 7 === 0 ? edge : base);
for (let j = -3; j <= 3; j++) { cv.set(x + j, y - 18, glow); cv.set(x, y - 18 + j, glow); }
cv.glow(x, y - 18, 20, [0.5, 0.75, 0.95], 0.25);
cv.block(x - 19, y - 36, x + 19, y + 1);
}
function coral(cv, x, y, height, color, seed) {
const dark = col('#315e81'), mid = col(color), hi = col('#e6efff');
for (let branch = -2; branch <= 2; branch++) {
const end = height * (0.65 + hash2(branch, 0, seed) * 0.35);
for (let j = 0; j < end; j++) {
const xx = x + Math.round(branch * j * 0.18 + Math.sin(j * 0.22 + branch) * j * 0.05), yy = y - j;
cv.set(xx, yy, mid); cv.set(xx + 1, yy, j > end - 3 ? hi : dark);
if (j > 4 && j % 6 === 0) for (let k = 0; k < 5; k++) cv.set(xx + Math.sign(branch || 1) * k, yy - k, mid);
}
}
cv.glow(x, y - height * 0.6, 23, [0.3, 0.7, 0.9], 0.24);
cv.block(x - 12, y - height, x + 12, y + 1);
}
return { EXOTIC_ART, composeExotic, skyshard, morphgrove, veil, ghostglass, chronoglass };
})();
// src/visual/env/scene.js
const __m12 = (() => {
const { directEnvironment } = __m13;
const { artRevision, artDomain } = __m1;
const { Canvas, SCENE_W, SCENE_H } = __m22;
const { hashString } = __m10;
const { finish } = __m23;
const { legible } = __m27;
const { flourish } = __m28;
const { grade } = __m29;
const meadow = __m30;
const forest = __m35;
const river = __m36;
const quarry = __m37;
const moonfen = __m38;
const crags = __m39;
const netherwood = __m40;
const garden = __m41;
const { skyshard, morphgrove, veil, ghostglass, chronoglass } = __m42;
const ENV_VERSION = 15;
const COMPOSERS = { meadow, forest, netherwood, river, quarry, moonfen, crags, garden, skyshard, morphgrove, veil, ghostglass, chronoglass };
const cache = new Map();
function composeScene(region, seed) {
const id = COMPOSERS[region] ? region : 'forest';
const cv = new Canvas(hashString(`scene:${seed}:${id}`));
cv.meta.artDensity = artDomain('environments', id)?.density ?? 1;
COMPOSERS[id].compose(cv, String(seed));
directEnvironment(cv, id, seed);
legible(cv, id);
flourish(cv, id);
finish(cv, cv.meta.vignette ?? 0.55);
grade(cv, id);
for (const px of cv.sw ? [cv.pix.px, cv.sw.bare] : [cv.pix.px]) {
for (let y = 1; y < SCENE_H; y++) for (let x = 0; x < SCENE_W; x++) if (!(px[y * SCENE_W + x] >>> 24)) px[y * SCENE_W + x] = px[(y - 1) * SCENE_W + x] | 0xff000000;
}
for (let x = 0; x < SCENE_W; x++) { cv.open[x] = 0; cv.open[(SCENE_H - 1) * SCENE_W + x] = 0; cv.open[(SCENE_H - 2) * SCENE_W + x] = 0; }
let top = SCENE_H;
for (let k = 0; k < cv.open.length; k++) if (cv.open[k]) { top = Math.floor(k / SCENE_W); break; }
return { pix: cv.pix, open: cv.open, depth: cv.depth, solid: cv.solid, liquid: cv.liquid, grass: cv.grass, rock: cv.rock, trees: cv.trees, props: cv.props, top, meta: cv.meta, sway: cv.swayData() };
}
function sceneOf(region, seed) {
const id = COMPOSERS[region] ? region : 'forest';
const key = `${ENV_VERSION}:${artRevision()}:${id}:${seed}`;
let s = cache.get(key);
if (s) return s;
s = composeScene(id, seed);
if (cache.size >= 12) cache.delete(/** @type {string} */ (cache.keys().next().value));
cache.set(key, s);
return s;
}
return { ENV_VERSION, composeScene, sceneOf, SCENE_W, SCENE_H };
})();
// src/studio/worker.js
const __m0 = (() => {
const { setArtDirection } = __m1;
const { composeScene } = __m12;
const channel = /** @type {any} */ (globalThis);
channel.onmessage = ({ data }) => {
try {
setArtDirection(data.profile);
const s = composeScene(data.region, String(data.seed));
channel.postMessage({ key: data.key, w: s.pix.w, h: s.pix.h, data: s.pix.data, solid: s.solid, open: s.open, meta: s.meta }, [s.pix.data.buffer, s.solid.buffer, s.open.buffer]);
} catch (e) { channel.postMessage({ key: data.key, error: e.message || String(e) }); }
};
return {  };
})();