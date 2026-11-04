import test from 'node:test';
import assert from 'node:assert/strict';
import { interact, cutoffEffects, EFFECT_CUTOFF, NE, E } from '../src/alchemy/effects.js';

test('effects under 1% are switched to zero', () => {
  assert.equal(EFFECT_CUTOFF, 1);
  const e = new Float64Array(NE);
  e[E.VIT] = 0.99; e[E.STR] = 1; e[E.LOVE] = 5; e[E.ACID] = -0.6; e[E.FIRE] = -1.5;
  cutoffEffects(e);
  assert.equal(e[E.VIT], 0);
  assert.equal(e[E.STR], 1);
  assert.equal(e[E.LOVE], 5);
  assert.equal(e[E.ACID], 0);
  assert.equal(e[E.FIRE], -1.5);
});

test('interact leaves no trace below the cut-off', () => {
  const e = new Float64Array(NE);
  e[E.FIRE] = 10.5; e[E.FROST] = 10; // opposition leaves 0.5 fire
  e[E.ACID] = -0.4; e[E.ARC] = 0.8; e[E.TRANS] = 30;
  interact(e, []);
  for (let k = 0; k < NE; k++) assert.ok(e[k] === 0 || Math.abs(e[k]) >= 1, `channel ${k} = ${e[k]}`);
  assert.equal(e[E.FIRE], 0);
  assert.equal(e[E.TRANS], 30);
});

// ---------------------------------------------------------------- arcane
// A trace cut off at 1% must stay at zero when it awakens: awakening
// multiplies the substance's magic (×gain), and would otherwise lift a 0.6%
// trace to 1.8%.
import { SpeciesTable, MAX_SPECIES } from '../src/reactions/species.js';
import { completeMaterial } from '../src/materials/schema.js';
import { compositionEffects, theoryOf } from '../src/alchemy/effects.js';
import { awakenedDef, awakenedId, withAwakened, thresholdToCelsius } from '../src/alchemy/arcane.js';
import { generateWorld, makeLookup } from '../src/materials/generator.js';
import { Simulation } from '../src/simulation/world.js';
import { PHASE } from '../src/simulation/constants.js';
import { measureParticles } from '../src/game/measure.js';

const might = completeMaterial({ id: 'cut-might', name: 'Might Draught', form: 'liquid', color: [0.9, 0.7, 0.3], compat: [0.84, 0.11], boil: 180, melt: -60 });
Object.assign(might, { effects: { strength: 10 }, arcaneVariant: true, arcane: { thr: 300, gain: 3 } });

test('a trace under the cut-off does not come back when it awakens', () => {
  const water = completeMaterial({ id: 'cut-water', name: 'Water', form: 'liquid', color: [0.5, 0.6, 0.9], compat: [0.84, 0.11] });
  const sp = new SpeciesTable();
  const a = sp.ensure(might), w = sp.ensure(water), aw = sp.ensure(awakenedDef(might));
  const comp = new Float32Array(MAX_SPECIES), out = new Float64Array(NE);
  comp[a] = 0.06; comp[w] = 0.94; // 0.6% strength
  assert.equal(compositionEffects(sp, comp, 0, 20, [], out)[E.STR], 0);
  comp[a] = 0; comp[aw] = 0.06; // the same trace, awakened (1.8% if it were counted)
  assert.equal(compositionEffects(sp, comp, 0, 20, [], out)[E.STR], 0, 'stays at zero');
  comp[aw] = 0.15; comp[w] = 0.85; // 1.5% dormant: above the cut-off, so awakening counts in full
  assert.ok(Math.abs(compositionEffects(sp, comp, 0, 20, [], out)[E.STR] - 4.5) < 1e-3);
  // the guild's theory follows the same rule
  const look = withAwakened((id) => (id === might.id ? might : id === water.id ? water : undefined));
  const th = theoryOf([{ id: awakenedId(might.id), ml: 6 }, { id: water.id, ml: 94 }], look);
  assert.equal(th[E.STR], 0);
});

test('in the cauldron: a heated trace awakens but is still measured as zero', () => {
  const world = generateWorld('cutoff-arcane-1');
  const lookup = makeLookup(world, [might]);
  const s = new Simulation({ size: 'small', lookup, reactions: world.reactions, laws: [] });
  const pour = (id, n, x = 0) => { s.emitter.start(lookup(id), { x, amount: n }); let g = 0; while (s.emitter.pouring && g++ < 20000) s.step(); };
  pour(world.roles.water, 140, -0.4);
  pour(might.id, 7, 0.4); // ≈ 0.5% strength
  const stir = (sec) => {
    const t = s.tool; t.type = 'spoon';
    for (let k = 0; k < Math.round(sec * 120); k++) { const ang = (k / 120) * 2.6; t.setTarget(Math.cos(ang) * 0.9, 2.6 + Math.sin(ang) * 0.35, true); s.advance(1 / 120, 1, 2); }
    t.setTarget(0, 2.6, false);
  };
  stir(10);
  const idx = () => { const o = []; for (let i = 0; i < s.p.count; i++) if (s.p.phase[i] !== PHASE.GAS) o.push(i); return o; };
  assert.equal(measureParticles(s, idx()).effects[E.STR], 0);
  // heat well past 50 °C until the trace has awakened
  for (let k = 0; k < 120 * 40; k++) { s.furnace.setting = 1; s.step(); }
  s.furnace.setting = 0;
  let awake = 0;
  const as = s.species.slotOf.get(awakenedId(might.id));
  assert.ok(as !== undefined, `the trace awakened (≥ ${thresholdToCelsius(300)} °C)`);
  for (let i = 0; i < s.p.count; i++) awake += s.p.comp[i * MAX_SPECIES + /** @type {number} */ (as)];
  assert.ok(awake > 2, `awakened amount ${awake.toFixed(2)}`);
  assert.equal(measureParticles(s, idx()).effects[E.STR], 0, 'the awakened trace still measures zero');
});
