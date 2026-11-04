import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES } from '../src/game/biomes.js';
import { NATIVE_SPECIES } from '../src/game/native-species.js';
import { Warren } from '../src/game/wild-rabbits.js';
import { kindLook, KINDS } from '../src/game/kinds.js';
import { Rng } from '../src/core/rng.js';
import { defaultSnap } from '../src/game/colony.js';
import { drawRabbit } from '../src/rendering/rabbit.js';
import { ExoticInteractions } from '../src/rendering/exotic-interactions.js';
import { GameState } from '../src/game/state.js';
import { generateCommission } from '../src/game/commissions.js';
import { predictPlan } from '../src/game/predict.js';
import { EQUIPMENT } from '../src/game/equipment.js';
import { EFFECT_INDEX } from '../src/alchemy/effects.js';
import { collectedShop } from './game-fixtures.mjs';

function warren(region = 'forest') {
  return new Warren(region, 'population-0', { finite: true, W: 384, H: 216, solid: (x, y) => y >= 190,
    liquid: () => false, spots: [[40, 189], [100, 189], [170, 189], [240, 189], [300, 189]] });
}

function drawing(kind, snap = defaultSnap(), pose = 'idle', t = 1) {
  const calls = [], alpha = [];
  const ctx = { fillStyle: '', globalAlpha: 1, save() { alpha.push(this.globalAlpha); }, restore() { this.globalAlpha = alpha.pop(); },
    clearRect() {}, fillRect(x, y, w, h) { calls.push([x, y, w, h, this.fillStyle, this.globalAlpha]); } };
  drawRabbit(/** @type {any} */ (ctx), kindLook(kind, new Rng(4)), snap, t, 0, { cache: false, floor: false, hop: false, pose });
  return calls;
}

test('each of twelve biomes contains only its own native, with the matching steady trial channel', () => {
  const pictures = new Set();
  for (const b of BIOMES) {
    const w = warren(b.id);
    assert.ok(w.rabbits.length);
    assert.ok(w.rabbits.every((r) => r.kind === b.creature));
    assert.equal(KINDS[b.creature].steady, b.dominant);
    const calls = drawing(b.creature);
    assert.ok(calls.length > 30, b.id + ' has visible anatomy');
    pictures.add(JSON.stringify(calls));
  }
  assert.equal(pictures.size, BIOMES.length, 'all native silhouettes and palettes are distinguishable');
});

test('finite wildlife keeps removals, injuries and deaths through an actual game save', () => {
  const w = warren(), victim = w.rabbits[0], missing = w.rabbits[1];
  w.strike(victim, victim.x, victim.y - 5);
  w.remove(missing);
  const st = GameState.create('wildlife-save', { tutorial: false });
  st.gathering.instances.forest.wildlife = w.snapshot();
  const saved = GameState.fromJSON(JSON.parse(JSON.stringify(st.toJSON())));
  const back = warren();
  assert.ok(back.restore(saved.gathering.instances.forest.wildlife));
  assert.equal(back.rabbits.length, w.rabbits.length);
  assert.equal(back.rabbits.find((r) => r.id === victim.id).hits, 1);
  assert.ok(!back.rabbits.some((r) => r.id === missing.id));
  for (let i = 0; i < 1800; i++) back.step(1 / 60);
  assert.equal(back.rabbits.find((r) => r.id === victim.id).dead, true);
  assert.equal(back.rabbits.length, w.rabbits.length, 'waiting cannot refill a generation');
  assert.ok(back.restore({ version: 1, animals: [{ id: victim.id, kind: 'cat', x: NaN }] }));
  assert.equal(back.rabbits.length, 0, 'a forged cross-species record cannot enter the population');
});

test('new creature bodies retain distinct poses, kit size and a death silhouette', () => {
  for (const [kind, n] of Object.entries(NATIVE_SPECIES).filter(([, n]) => !['fox', 'salamander'].includes(n.anatomy))) {
    const adult = drawing(kind), kit = drawing(kind, { ...defaultSnap(), stage: 'kit' }), dead = drawing(kind, { ...defaultSnap(), alive: false });
    assert.notDeepEqual(kit, adult, kind + ' kits are smaller');
    assert.notDeepEqual(dead, adult, kind + ' death is visible');
    if (n.anatomy === 'moth') assert.notDeepEqual(drawing(kind, defaultSnap(), 'fly1'), drawing(kind, defaultSnap(), 'fly2'));
  }
});

test('every exotic signature responds to touch and remains bounded under repeated input', () => {
  for (const b of BIOMES.filter((b) => b.interaction)) {
    const fx = new ExoticInteractions(b.id, { meta: { interactionPoints: [[180, 100]] } });
    fx.activate();
    assert.ok(fx.points[0].touched > 0, b.id);
    for (let i = 0; i < 400; i++) { fx.push(100, 100, 260, 100); fx.step(0.016); }
    fx.step(NaN); fx.push(NaN, 0, 0, 0);
    assert.ok(fx.ripples.length <= 16);
    for (let i = 0; i < 1000; i++) fx.step(0.016);
    const p = fx.points[0];
    assert.ok(Number.isFinite(p.dx) && Math.abs(p.dx) < 0.01 && Math.abs(p.dy) < 0.01, b.id + ' settles');
  }
  const time = new ExoticInteractions('chronoglass', { meta: {} });
  time.push(10, 30, 10, 10); time.step(0.02); assert.ok(time.clock > 0.02, 'upward swipes accelerate');
  time.push(10, 10, 10, 30); const before = time.clock; time.step(0.02); assert.ok(time.clock < before, 'downward swipes reverse');
});

test('new effect requests are feasible from collected stock and carry their actual effect channel', () => {
  const st = GameState.create('native-orders', { tutorial: false });
  st.reputation = 800; st.equipment = EQUIPMENT.map((e) => e.id); st.coins = 1000; collectedShop(st);
  for (const [request, key] of [['fleetfoot', 'swiftness'], ['levitation', 'levitation'], ['invisibility', 'invisibility'], ['phasing', 'phasing'], ['temporal', 'temporal']]) {
    const com = generateCommission(st.commissionContext(), new Rng(request), { tier: 4, request });
    assert.ok(com, request + ' can be brewed');
    const prediction = predictPlan(st.world, st.lookup, com.reference);
    const req = com.requirements.find((r) => r.key === key);
    assert.ok(req && prediction.effects[EFFECT_INDEX[key]] >= req.target, request + ' uses the saved simulation channel');
    assert.ok(com.reference.ingredients.every((i) => st.supplyOf(i.id) >= i.n * 5 || st.canBuy(i.id).ok));
  }
});
