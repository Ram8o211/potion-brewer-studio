// Arcane activation, measured in the real simulation: blended thresholds,
// activation by heat and by cold, proportional activated effects,
// persistence through cooling, bottling-style measurement and save/load,
// locality, reactions of awakened reagents and the energy balance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation/world.js';
import { PHASE } from '../src/simulation/constants.js';
import { completeMaterial } from '../src/materials/schema.js';
import { generateWorld, makeLookup } from '../src/materials/generator.js';
import { measureParticles } from '../src/game/measure.js';
import { snapshotSim, restoreSim } from '../src/simulation/snapshot.js';
import { EFFECT_INDEX } from '../src/alchemy/effects.js';
import { blendThreshold, thresholdToCelsius, awakenedId, pastThreshold } from '../src/alchemy/arcane.js';
import { MAX_SPECIES } from '../src/reactions/species.js';

const V = EFFECT_INDEX;
const world = generateWorld('arcane-tests-1');
// two hand-made reagents from the brief: a strength reagent at −1000 and a
// venom at +800, each carrying one effect, both miscible with water
const strengthR = completeMaterial({ id: 'test-might', name: 'Might Draught', form: 'liquid', color: [0.9, 0.7, 0.3], compat: [0.84, 0.11], boil: 180, melt: -60 });
Object.assign(strengthR, { effects: { strength: 10 }, arcaneVariant: true, arcane: { thr: -1000, gain: 3 } });
const venomR = completeMaterial({ id: 'test-venom', name: 'Viper Venom', form: 'liquid', color: [0.4, 0.8, 0.3], compat: [0.84, 0.11], boil: 180, melt: -60 });
Object.assign(venomR, { effects: { toxicity: 10 }, arcaneVariant: true, arcane: { thr: 800, gain: 3 } });
const lookup = makeLookup(world, [strengthR, venomR]);
const R = world.roles;

function sim() {
  return new Simulation({ size: 'small', lookup, reactions: world.reactions, laws: [] });
}
function pour(s, id, n, x = 0) {
  s.emitter.start(lookup(id), { x, amount: n });
  let g = 0;
  while (s.emitter.pouring && g++ < 20000) s.step();
}
function run(s, sec) { for (let k = 0; k < Math.round(sec * 120); k++) s.step(); }
function stir(s, sec) {
  const t = s.tool; t.type = 'spoon';
  for (let k = 0; k < Math.round(sec * 120); k++) {
    const a = (k / 120) * 2.6;
    t.setTarget(Math.cos(a) * 0.9, 2.6 + Math.sin(a) * 0.35, true);
    s.advance(1 / 120, 1, 2);
  }
  t.setTarget(0, 2.6, false);
}
function condensed(s) {
  const out = [];
  for (let i = 0; i < s.p.count; i++) if (s.p.phase[i] !== PHASE.GAS) out.push(i);
  return out;
}
/** total volume of a species id */
function amount(s, id) {
  const slot = s.species.slotOf.get(id);
  if (slot === undefined) return 0;
  let t = 0;
  for (let i = 0; i < s.p.count; i++) t += s.p.comp[i * MAX_SPECIES + slot];
  return t;
}
/** hold the mean temperature near T with the furnace for `sec` seconds */
function holdAt(s, T, sec) {
  for (let k = 0; k < Math.round(sec * 12); k++) {
    let m = 0;
    const idx = condensed(s);
    for (const i of idx) m += s.p.temp[i];
    m /= Math.max(1, idx.length);
    s.furnace.setting = Math.max(-1, Math.min(1, (T - m) / 8));
    run(s, 1 / 12);
  }
  s.furnace.setting = 0;
}

test('a blend threshold is the volume-weighted mean of its magical parts: −1000 ×1 and +800 ×2 → +200 (40 °C)', () => {
  const thr = blendThreshold([{ id: strengthR.id, ml: 50 }, { id: venomR.id, ml: 100 }, { id: R.water, ml: 300 }], lookup);
  assert.equal(Math.round(thr), 200, 'water does not count, magic does');
  assert.equal(thresholdToCelsius(thr), 40);
  assert.ok(pastThreshold(thr, 41) && !pastThreshold(thr, 39));
  assert.ok(pastThreshold(-1000, -81) && !pastThreshold(-1000, -60), 'negative thresholds open by cooling');
});

test('the opposing-threshold blend awakens past 40 °C but not below; each part alone would not', () => {
  const s = sim();
  pour(s, strengthR.id, 12, -0.5);
  pour(s, venomR.id, 24, 0.5);
  stir(s, 10);
  run(s, 1);
  const before = measureParticles(s, condensed(s)).effects;
  holdAt(s, 30, 20);
  const early = amount(s, awakenedId(venomR.id)) / 24;
  assert.ok(early < 0.1, `below the blended threshold almost nothing awakens (${early.toFixed(3)})`);
  holdAt(s, 52, 25);
  const awakeV = amount(s, awakenedId(venomR.id)), awakeS = amount(s, awakenedId(strengthR.id));
  const totalV = awakeV + amount(s, venomR.id), totalS = awakeS + amount(s, strengthR.id);
  assert.ok(awakeV / totalV > 0.9 && awakeS / totalS > 0.9, `the blend awakened (${(awakeS / totalS).toFixed(2)}, ${(awakeV / totalV).toFixed(2)})`);
  assert.ok(Math.abs(totalV - 24) < 1e-3 && Math.abs(totalS - 12) < 1e-3, 'awakening conserves every substance');
  // the same venom alone, held at the same temperature, stays asleep
  const alone = sim();
  pour(alone, venomR.id, 24);
  holdAt(alone, 52, 25);
  assert.ok(amount(alone, awakenedId(venomR.id)) < 0.01, 'venom alone needs 100 °C');
  // activated effects follow the real proportions: 1/3 strength, 2/3 venom, ×3
  holdAt(s, 20, 25);
  const after = measureParticles(s, condensed(s)).effects;
  assert.ok(Math.abs(before[V.strength] - 10 / 3) < 0.6 && Math.abs(before[V.toxicity] - 20 / 3) < 0.8, `native ${before[V.strength].toFixed(2)} / ${before[V.toxicity].toFixed(2)}`);
  assert.ok(Math.abs(after[V.strength] - 10) < 1.2, `awakened strength ≈ 10 (${after[V.strength].toFixed(2)})`);
  assert.ok(Math.abs(after[V.toxicity] - 20) < 2, `awakened toxicity ≈ 20 (${after[V.toxicity].toFixed(2)})`);
  assert.ok(Math.abs(after[V.toxicity] / after[V.strength] - 2) < 0.25, 'proportions kept');
});

test('activation persists after cooling, through measurement and save/load; dilution still lowers it', () => {
  const s = sim();
  pour(s, R.essenceA, 30);
  const thrC = thresholdToCelsius(lookup(R.essenceA).arcane.thr);
  holdAt(s, thrC + 12, 25);
  holdAt(s, 20, 25);
  const m1 = measureParticles(s, condensed(s));
  assert.ok(m1.composition[awakenedId(R.essenceA)] > 0.95, 'still awakened at room temperature');
  const native = lookup(R.essenceA).effects.vitality, gain = lookup(R.essenceA).arcane.gain;
  assert.ok(Math.abs(m1.effects[V.vitality] - Math.min(40 + 60 * (1 - Math.exp(-(native * gain - 40) / 60)), native * gain)) < 2.5, `awakened vitality ${m1.effects[V.vitality].toFixed(1)}`);
  const back = restoreSim(JSON.parse(JSON.stringify(snapshotSim(s, 'small'))), { lookup, reactions: world.reactions });
  const m2 = measureParticles(back, condensed(back));
  assert.ok(Math.abs(m2.effects[V.vitality] - m1.effects[V.vitality]) < 0.3, 'save/load keeps the awakened state');
  // dilute 1:1 with water: concentration halves, it does not re-sleep
  pour(s, R.water, 30);
  stir(s, 10);
  run(s, 2);
  const m3 = measureParticles(s, condensed(s));
  assert.ok(m3.effects[V.vitality] < m1.effects[V.vitality] * 0.65, `diluted ${m3.effects[V.vitality].toFixed(1)}`);
  assert.ok(m3.composition[awakenedId(R.essenceA)] > 0.45);
});

test('activation by cold: a negative threshold opens only when chilled', () => {
  // a cold-awakening essence: chilled it wakes, heated it never does
  const s = sim();
  Object.assign(s.furnace, { minCool: -30, coolPower: 6 }); // the frost rune plate
  pour(s, R.essenceC, 30, -0.7); // negative threshold: awakens by cold
  run(s, 2);
  const thr = lookup(R.essenceC).arcane.thr;
  assert.ok(thr < 0);
  holdAt(s, Math.min(4, thresholdToCelsius(thr) - 8), 30);
  const awake = amount(s, awakenedId(R.essenceC)), total = awake + amount(s, R.essenceC);
  assert.ok(awake / total > 0.5, `chilling awakened the arcana essence (${(awake / total).toFixed(2)})`);
  // heat never awakens a negative threshold
  const h = sim();
  pour(h, R.essenceC, 30);
  holdAt(h, 70, 20);
  assert.ok(amount(h, awakenedId(R.essenceC)) < 0.01, 'heating does not open a cold threshold');
});

test('an awakened reagent still reacts, and its product is awakened in proportion; energy still balances', () => {
  const s = sim();
  pour(s, R.essenceA, 40);
  const thrC = thresholdToCelsius(lookup(R.essenceA).arcane.thr);
  holdAt(s, thrC + 10, 20);
  const e0 = s.totalEnergy(), in0 = s.energyIn, out0 = s.energyOut;
  // salt + essence → elixir (r_elixir), hot
  pour(s, R.salt, 20);
  stir(s, 8);
  holdAt(s, 75, 40);
  const elixir = world.roles.p_elixir;
  const plain = amount(s, elixir), awake = amount(s, awakenedId(elixir));
  assert.ok(plain + awake > 1, `elixir formed (${(plain + awake).toFixed(2)})`);
  assert.ok(awake > plain, `mostly awakened elixir (${awake.toFixed(2)} vs ${plain.toFixed(2)})`);
  void e0; void in0; void out0;
  // energy: thermal energy change equals furnace input minus losses
  const s2 = sim();
  pour(s2, strengthR.id, 10);
  pour(s2, venomR.id, 20);
  stir(s2, 6);
  const E0 = s2.totalEnergy(), I0 = s2.energyIn, O0 = s2.energyOut;
  holdAt(s2, 55, 20);
  assert.ok(s2.awakened > 5, 'it awakened');
  const dE = s2.totalEnergy() - E0, dIn = s2.energyIn - I0, dOut = s2.energyOut - O0;
  const err = Math.abs(dE - (dIn - dOut));
  assert.ok(err < 0.02 * Math.abs(dIn) + 50, `energy balance error ${err.toFixed(1)} of ${dIn.toFixed(0)} in`);
});

test('activation starts where the heat arrives and spreads with it (no global switch)', () => {
  const s = sim();
  pour(s, R.essenceA, 120);
  run(s, 2);
  const slot = () => s.species.slotOf.get(awakenedId(R.essenceA));
  const thrC = thresholdToCelsius(lookup(R.essenceA).arcane.thr);
  s.furnace.setting = 1;
  // heat until the first matter awakens
  let guard = 0;
  while (s.awakened < 1 && guard++ < 120 * 120) s.step();
  assert.ok(s.awakened >= 1, 'the bottom reached the threshold');
  // at that moment the bottom is awake and the top is not
  let ys = [];
  for (let i = 0; i < s.p.count; i++) if (s.p.phase[i] !== PHASE.GAS) ys.push(s.p.y[i]);
  ys.sort((a, b) => a - b);
  const mid = ys[Math.floor(ys.length / 2)];
  let low = 0, nl = 0, high = 0, nh = 0;
  for (let i = 0; i < s.p.count; i++) {
    if (s.p.phase[i] === PHASE.GAS) continue;
    const a = s.p.comp[i * MAX_SPECIES + slot()];
    if (s.p.y[i] > mid) { low += a; nl++; } else { high += a; nh++; }
  }
  assert.ok(low / nl > 0.005 && high / nh < 0.25 * (low / nl), `bottom half more awake (${(low / nl).toFixed(3)}) than the top (${(high / nh).toFixed(3)})`);
  s.furnace.setting = 0;
  void thrC;
});
