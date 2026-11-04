// Effects, extraction, interactions, reactions and electricity — measured on
// the real simulation, never on labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, makeLookup } from '../src/materials/generator.js';
import { Simulation } from '../src/simulation/world.js';
import { PHASE } from '../src/simulation/constants.js';
import { tapSelection, measureParticles } from '../src/game/measure.js';
import { EFFECT_INDEX, interact, NE, theoryOf, effectVector } from '../src/alchemy/effects.js';
import { generateLaws } from '../src/materials/wild.js';
import { totalCharge } from '../src/simulation/electric.js';
import { MAX_SPECIES } from '../src/reactions/species.js';

const SEED = 'alchemy-tests-1';
const world = generateWorld(SEED);
const lookup = makeLookup(world);
const R = world.roles;
const V = EFFECT_INDEX;

function sim(laws = world.laws) {
  return new Simulation({ size: 'small', lookup, reactions: world.reactions, laws });
}
function pour(s, id, n, opts = {}) {
  s.emitter.start(lookup(id), { x: opts.x ?? 0, amount: n, ground: opts.ground });
  let g = 0;
  while (s.emitter.pouring && g++ < 20000) s.step();
}
function run(s, sec) { for (let k = 0; k < Math.round(sec * 120); k++) s.step(); }
function stir(s, sec, cy = 2.6) {
  const t = s.tool; t.type = 'spoon';
  for (let k = 0; k < Math.round(sec * 120); k++) {
    const a = (k / 120) * 2.6;
    t.setTarget(Math.cos(a) * 0.9, cy + Math.sin(a) * 0.35, true);
    s.advance(1 / 120, 1, 2);
  }
  t.setTarget(0, cy, false);
}
function fx(s, n = 40) {
  const sel = tapSelection(s, n);
  return measureParticles(s, sel);
}
function allParticles(s) {
  const out = [];
  for (let i = 0; i < s.p.count; i++) if (s.p.phase[i] !== PHASE.GAS && s.p.phase[i] !== PHASE.SOLID) out.push(i);
  return out;
}

test('every material carries an effect vector; worlds keep their old reagents and gain wild ones deterministically', () => {
  const again = generateWorld(SEED);
  assert.equal(JSON.stringify(again.laws), JSON.stringify(world.laws));
  assert.ok(world.wild.length >= 15, 'wild ingredients');
  for (const m of world.materials) assert.ok(m.effects && typeof m.effects === 'object', `${m.name} has effects`);
  assert.equal(world.laws.length, 6, 'six resonance laws');
  assert.notEqual(JSON.stringify(generateLaws('other-seed')), JSON.stringify(world.laws), 'laws differ between worlds');
  // a different seed still has the same roles but other names/laws
  const other = generateWorld('alchemy-tests-2');
  assert.equal(other.wild.length, world.wild.length);
});

test('plain water has no effect; an essence diluted 1:1 has half its potency', () => {
  const s = sim();
  pour(s, R.water, 30);
  run(s, 1);
  assert.ok(fx(s).effects.every((v) => Math.abs(v) < 0.01), 'water is inert');
  const s2 = sim();
  pour(s2, R.essenceA, 30);
  run(s2, 1);
  const pure = fx(s2).effects[V.vitality];
  const s3 = sim();
  pour(s3, R.water, 30, { x: -0.6 });
  pour(s3, R.essenceA, 30, { x: 0.6 });
  stir(s3, 10);
  run(s3, 4);
  const half = measureParticles(s3, allParticles(s3)).effects[V.vitality];
  assert.ok(pure > 10, `pure essence vitality ${pure}`);
  assert.ok(Math.abs(half - pure / 2) < 0.06 * pure, `diluted ${half.toFixed(2)} ≈ ${(pure / 2).toFixed(2)}`);
});

test('extraction: a whole root does nothing; ground and stirred it releases its effect; hot steeping releases far more', () => {
  const whole = sim();
  pour(whole, R.water, 36);
  pour(whole, 'wild-ironroot', 8);
  run(whole, 3);
  const wholeStr = fx(whole).effects[V.strength];
  const ground = sim();
  pour(ground, R.water, 36);
  pour(ground, 'wild-ironroot', 8, { ground: true });
  run(ground, 1);
  const unstirred = fx(ground).effects[V.strength];
  stir(ground, 8);
  run(ground, 2);
  const stirred = fx(ground).effects[V.strength];
  ground.furnace.setting = 0.45;
  run(ground, 25);
  stir(ground, 6);
  ground.furnace.setting = -0.6;
  run(ground, 30);
  ground.furnace.setting = 0;
  run(ground, 3);
  const steeped = fx(ground).effects[V.strength];
  const steepId = 'wild-p-steeped-ironroot';
  const slot = ground.species.slotOf.get(steepId);
  assert.ok(slot !== undefined, 'the steeping reaction produced a liquid extract');
  assert.ok(wholeStr < 0.5, `whole chunks inert (${wholeStr.toFixed(2)})`);
  assert.ok(stirred > unstirred, `stirring extracts more (${unstirred.toFixed(1)} → ${stirred.toFixed(1)})`);
  assert.ok(steeped > stirred * 1.2, `steeping hot extracts more (${stirred.toFixed(1)} → ${steeped.toFixed(1)})`);
});

test('effects interact only where the substances meet: fire and frost layers cancel once stirred together', () => {
  const s = sim([]);
  pour(s, R.essenceB, 24, { x: -0.8 }); // fire essence
  pour(s, 'wild-frostcap', Math.ceil(6 * 24 / lookup('wild-frostcap').effects.frost), { ground: true, x: 0.8 });
  pour(s, R.water, 20, { x: 0.8 });
  run(s, 2);
  // effect per particle averaged, before mixing
  const before = measureParticles(s, allParticles(s)).effects;
  stir(s, 14);
  run(s, 3);
  const after = measureParticles(s, allParticles(s)).effects;
  const sumBefore = before[V.fire] + before[V.frost];
  const sumAfter = after[V.fire] + after[V.frost];
  assert.ok(sumAfter < sumBefore * 0.8, `fire+frost cancel where mixed (${sumBefore.toFixed(1)} → ${sumAfter.toFixed(1)})`);
});

test('resonance laws: transmute, catalyse and suppress act per particle and are traced for discovery', () => {
  /** @param {'transmute'|'catalyse'|'suppress'} kind @param {string} a @param {string} b @param {string} [c] */
  const law = (kind, a, b, c) => ({ id: 'L', name: 'L', kind, a: V[a], b: V[b], c: c === undefined ? -1 : V[c], k: 0.6, min: 2, lore: '' });
  const e = new Float64Array(NE);
  e[V.love] = 20; e[V.arcana] = 20;
  const tr = new Float64Array(1);
  interact(e, [law('transmute', 'love', 'arcana', 'transformation')], tr);
  assert.ok(e[V.transformation] > 5 && e[V.love] < 20 && tr[0] > 0, 'love + arcana → transformation');
  const c = new Float64Array(NE);
  c[V.strength] = 20; c[V.fire] = 10;
  interact(c, [law('catalyse', 'strength', 'fire')]);
  assert.ok(c[V.strength] > 25, `fire catalyses strength (${c[V.strength].toFixed(1)})`);
  const u = new Float64Array(NE);
  u[V.love] = 20; u[V.toxicity] = 8;
  interact(u, [law('suppress', 'love', 'toxicity')]);
  assert.ok(u[V.love] < 16, 'toxicity suppresses love');
  // universal laws: vitality neutralises toxicity, acid + alkali cancel (signed)
  const v = new Float64Array(NE);
  v[V.vitality] = 30; v[V.toxicity] = 10;
  interact(v, []);
  assert.ok(v[V.toxicity] < 0.01 && Math.abs(v[V.vitality] - 10) < 0.01);
  // the naive theory ignores extraction but applies the laws you know
  const theory = theoryOf([{ id: R.essenceA, ml: 50 }, { id: R.water, ml: 50 }], lookup);
  assert.ok(Math.abs(theory[V.vitality] - effectVector(lookup(R.essenceA))[V.vitality] / 2) < 0.01);
});

test('heat spoils delicate petals: love falls and toxicity appears (reaction products carry effects)', () => {
  const brew = () => {
    const s = sim([]);
    pour(s, R.water, 30);
    pour(s, 'wild-heartpetal', 8, { ground: true });
    stir(s, 8);
    return s;
  };
  // steeped gently, kept between 45 and 52 °C
  const gentle = brew();
  const meanT = (s) => { let t = 0; for (let i = 0; i < s.p.count; i++) t += s.p.temp[i]; return t / s.p.count; };
  gentle.furnace.setting = 0.25;
  for (let k = 0; k < 12; k++) { run(gentle, 5); const T = meanT(gentle); gentle.furnace.setting = T > 52 ? 0 : T < 45 ? 0.25 : gentle.furnace.setting; }
  gentle.furnace.setting = -0.8; run(gentle, 30); gentle.furnace.setting = 0; run(gentle, 2);
  const steeped = fx(gentle).effects;
  // boiled hard
  const s = brew();
  s.furnace.setting = 0.7;
  run(s, 45);
  s.furnace.setting = -0.8;
  run(s, 40);
  s.furnace.setting = 0;
  run(s, 2);
  const spoiled = fx(s).effects;
  assert.ok(steeped[V.toxicity] < 0.5, 'a gentle steep spoils nothing');
  assert.ok(spoiled[V.love] < steeped[V.love] * 0.8, `love ${steeped[V.love].toFixed(1)} → ${spoiled[V.love].toFixed(1)}`);
  assert.ok(spoiled[V.toxicity] > steeped[V.toxicity] + 0.5, `toxicity ${steeped[V.toxicity].toFixed(1)} → ${spoiled[V.toxicity].toFixed(1)}`);
});

test('reduction: boiling water away with the lid open concentrates a non-volatile extract', () => {
  const s = sim([]);
  pour(s, R.water, 40);
  pour(s, 'wild-silverleaf', 8, { ground: true });
  stir(s, 6);
  s.furnace.setting = 0.4;
  run(s, 30);
  s.furnace.setting = -0.6;
  run(s, 30);
  s.furnace.setting = 0;
  const before = measureParticles(s, allParticles(s));
  // the extract in either form (hot enough, it also awakens)
  const slots = ['wild-p-silver-infusion', 'wild-p-silver-infusion~a'].map((id) => s.species.slotOf.get(id)).filter((x) => x !== undefined);
  assert.ok(slots.length > 0, 'the leaf infused');
  const extract = () => { let t = 0; for (let i = 0; i < s.p.count; i++) for (const slot of slots) t += s.p.comp[i * MAX_SPECIES + slot]; return t; };
  const ex0 = extract();
  s.cauldron.lidClosed = false;
  s.furnace.setting = 1;
  s.furnace.maxFlame = 520; s.furnace.heatPower = 5.5;
  run(s, 40);
  s.furnace.setting = -1;
  run(s, 25);
  s.furnace.setting = 0;
  run(s, 3);
  const after = measureParticles(s, allParticles(s));
  assert.ok(after.count < before.count, `water boiled away (${before.count} → ${after.count} particles)`);
  // a little extract is entrained in the steam, most stays behind
  assert.ok(extract() > 0.8 * ex0, `the extract stays in the pot (${ex0.toFixed(2)} → ${extract().toFixed(2)})`);
  assert.ok(after.effects[V.vitality] > before.effects[V.vitality] * 1.1, `vitality concentrated ${before.effects[V.vitality].toFixed(1)} → ${after.effects[V.vitality].toFixed(1)}`);
});

test('electric charge: conserved, spreads through brine, blocked by oil, and heats resistive contacts', () => {
  const s = sim([]);
  pour(s, R.salt, 6);
  pour(s, R.water, 30);
  stir(s, 8);
  run(s, 2);
  pour(s, 'wild-stormglass', 6, { ground: true });
  const q0 = totalCharge(s);
  assert.ok(q0 > 5, `storm glass brings its charge (${q0.toFixed(2)})`);
  const e0 = s.energyIn;
  stir(s, 6);
  run(s, 4);
  assert.ok(Math.abs(totalCharge(s) - q0) < 1e-3 * Math.max(1, q0), 'charge conserved');
  let liquidQ = 0, n = 0;
  for (let i = 0; i < s.p.count; i++) if (s.p.phase[i] === PHASE.LIQUID) { liquidQ += s.p.q[i]; n++; }
  assert.ok(liquidQ / n > 0.02, `charge spread into the brine (${(liquidQ / n).toFixed(3)} per particle)`);
  assert.ok(s.energyIn > e0, 'Joule heating');
  // oil insulates
  const o = sim([]);
  pour(o, R.oil, 30);
  pour(o, 'wild-stormglass', 6, { ground: true });
  run(o, 4);
  let oilQ = 0, on = 0;
  for (let i = 0; i < o.p.count; i++) if (o.p.phase[i] === PHASE.LIQUID) { oilQ += Math.abs(o.p.q[i]); on++; }
  assert.ok(oilQ / on < 0.01, `oil stays neutral (${(oilQ / on).toFixed(4)})`);
  // measurement reads it
  assert.ok(measureParticles(s, allParticles(s)).charge > 0.02);
});
