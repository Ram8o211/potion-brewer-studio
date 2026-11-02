// Wild rabbits in the wilds: they hop about the ground; a blow wounds one,
// its blood stains what it lands on and it flees faster from then on; three
// bring it down, and it is caught alive or its body carried to the hutch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Warren, warrenSpots, WILD_HP, BLEED_OUT } from '../src/game/wild-rabbits.js';
import { GameState } from '../src/game/state.js';
import { livingRabbits, causeWord } from '../src/game/colony.js';
import { sceneOf, SCENE_W, SCENE_H } from '../src/visual/env/scene.js';

const W = 300, H = 120, FLOOR = 100;
/** @param {[string, number][]} [habitat] */
const flat = (habitat = [['rabbit', 1]]) => new Warren('meadow', 'test', {
  W, H, solid: (x, y) => y >= FLOOR, liquid: () => false,
  spots: Array.from({ length: 20 }, (_, i) => [40 + i * 10, FLOOR - 1]),
  habitat,
});
const run = (w, s) => { for (let t = 0; t < s; t += 1 / 60) w.step(1 / 60); };

test('wild rabbits hop about the ground and never sink into it', () => {
  const w = flat();
  assert.ok(w.rabbits.length >= 3, 'a region has its rabbits');
  const x0 = w.rabbits.map((r) => r.x);
  let hopped = false;
  for (let t = 0; t < 20; t += 1 / 60) {
    w.step(1 / 60);
    for (const r of w.rabbits) { assert.ok(r.y <= FLOOR - 1 + 1e-6, 'never in the ground'); assert.ok(r.x >= 0 && r.x <= W); if (r.air) hopped = true; }
  }
  assert.ok(hopped, 'they hop');
  assert.ok(w.rabbits.some((r, i) => Math.abs(r.x - x0[i]) > 3), 'and get somewhere');
});

test('a blow wounds a rabbit: its blood stains the ground, and it flees faster from then on', () => {
  const w = flat(), r = w.rabbits[0];
  run(w, 0.5);
  const calm = [];
  for (let t = 0; t < 10; t += 1 / 60) { w.step(1 / 60); if (r.air) calm.push(Math.abs(r.vx)); }
  const before = calm.reduce((a, b) => a + b, 0) / Math.max(1, calm.length);
  const x = r.x, y = r.y;
  assert.equal(w.strike(r, x - 3, y - 8), 'wounded');
  assert.ok(r.alarm && r.wounds.length === 1);
  assert.ok(w.drops.length > 10, 'blood bursts from it');
  let stained = 0, airborne = 0, moved = 0, last = r.x;
  const T = BLEED_OUT * 0.9;
  for (let t = 0; t < T; t += 1 / 60) {
    w.step(1 / 60);
    stained += w.takeStains().length;
    if (r.air) airborne++;
    moved += Math.abs(r.x - last); last = r.x;
  }
  assert.ok(stained > 20, `its blood colours the ground (${stained})`);
  assert.ok(moved > T * (before || 20), `it runs much faster than it hopped (${moved.toFixed(0)} px in ${T} s, calm hops at ${before.toFixed(0)} px/s)`);
  assert.ok(airborne > T * 60 * 0.6, 'and hardly stops between bounds');
  // a tap that misses close by sets another one running too
  const o = w.rabbits[1];
  w.scare(o, o.x + 10);
  assert.ok(o.alarm);
});

test('wounded, an animal bleeds out within seconds; the third tap before then catches it', () => {
  const w = flat(), r = w.rabbits[0];
  assert.equal(w.strike(r, r.x, r.y - 6), 'wounded');
  assert.ok(r.blood < 1.0001 && r.running);
  run(w, BLEED_OUT * 0.5);
  assert.ok(r.running && r.blood > 0 && r.blood < 0.6, `half its blood is gone (${r.blood.toFixed(2)})`);
  run(w, BLEED_OUT * 0.5 + 0.2);
  assert.ok(r.dead, 'it bleeds out quickly');
  assert.ok(BLEED_OUT <= 5, 'the death from blood loss is quick');
  assert.equal(w.at(r.x, r.y - 3), r, 'its body can be tapped');
  // three quick taps catch one alive
  const q = w.rabbits[1];
  for (let k = 1; k < WILD_HP; k++) { assert.equal(w.strike(q, q.x, q.y - 6), 'wounded'); run(w, 0.5); }
  assert.ok(q.running, 'still alive after two wounds and a second of running');
  assert.equal(w.strike(q, q.x, q.y - 6), 'caught');
  assert.ok(q.down && !q.dead);
  assert.equal(w.strike(q, q.x, q.y - 6), 'killed');
});

test('a rabbit from the wilds joins the hutch: alive and weak, or as a body for its remains', () => {
  const st = GameState.create('wild-hunt', { tutorial: false });
  const w = flat(), r = w.rabbits[0];
  const n = livingRabbits(st.colony).length;
  const caught = st.bringWildRabbit({ look: r.look, sex: r.sex, health: 30 });
  assert.ok(caught.ok);
  assert.equal(livingRabbits(st.colony).length, n + 1);
  assert.ok(caught.rabbit.alive && caught.rabbit.health <= 30);
  const body = st.bringWildRabbit({ look: w.rabbits[1].look, sex: 'm', dead: true });
  assert.ok(body.ok && !body.rabbit.alive);
  assert.equal(causeWord(body.rabbit.cause), 'killed in the wilds');
  assert.ok(st.processRemains(body.rabbit.id).ok, 'its remains can be recovered');
});

test('caught alive is kept alive: the Shop\'s places never turn a catch into a body, only a full enclosure does', async () => {
  const { penCount, PEN_MAX } = await import('../src/game/colony.js');
  const { kindLook } = await import('../src/game/kinds.js');
  const { Rng } = await import('../src/core/rng.js');
  const st = GameState.create('catch-alive', { tutorial: false });
  const w = flat(), live0 = livingRabbits(st.colony).length;
  // more catches than the starting hutch's places: every one comes home alive
  for (let i = 0; i < st.cap.hutch + 2; i++) {
    const r = w.rabbits[i % w.rabbits.length];
    const res = st.bringWildRabbit({ look: r.look, sex: 'f', health: 20 });
    assert.ok(res.ok && res.rabbit.alive, `catch ${i + 1} comes home alive`);
  }
  assert.equal(livingRabbits(st.colony).length, live0 + st.cap.hutch + 2);
  assert.ok(st.bringWildRabbit({ look: kindLook('cat', new Rng('c')), sex: 'm', health: 20 }).rabbit.alive, 'and other kinds too');
  // only a full enclosure (ten, living and dead) refuses one
  while (penCount(st.colony, 'rabbit') < PEN_MAX) assert.ok(st.bringWildRabbit({ look: w.rabbits[0].look, sex: 'f' }).ok);
  const no = st.bringWildRabbit({ look: w.rabbits[0].look, sex: 'f' });
  assert.equal(no.ok, false);
  assert.equal(no.full, 'pen');
  // buying from the breeder still respects the Shop's places for rabbits
  assert.equal(st.buyRabbit(true).ok, false);
});

test('each enclosure holds at most ten animals, living and dead', async () => {
  const { PEN_MAX, penCount, colonyTick, colonyDay } = await import('../src/game/colony.js');
  assert.equal(PEN_MAX, 10);
  const st = GameState.create('pen-cap', { tutorial: false });
  Object.defineProperty(st, 'cap', { get: () => ({ hutch: 99 }) });
  const w = flat(), look = w.rabbits[0].look;
  for (let k = 0; penCount(st.colony, 'rabbit') < PEN_MAX; k++) assert.ok(st.bringWildRabbit({ look, sex: 'f', dead: k % 2 === 0 }).ok);
  assert.equal(st.bringWildRabbit({ look, sex: 'f' }).ok, false, 'no room alive');
  assert.equal(st.bringWildRabbit({ look, sex: 'f', dead: true }).ok, false, 'nor for a body');
  assert.equal(st.buyRabbit(true).ok, false, 'nor bought');
  // other kinds have enclosures of their own
  const { kindLook } = await import('../src/game/kinds.js');
  const { Rng } = await import('../src/core/rng.js');
  assert.ok(st.bringWildRabbit({ look: kindLook('cat', new Rng('c')), sex: 'f' }).ok);
  // recovering a body's remains makes room
  const body = st.colony.rabbits.find((x) => !x.alive && penCount(st.colony, 'rabbit') && x.look.kind !== 'cat');
  assert.ok(st.processRemains(body.id).ok);
  assert.ok(st.bringWildRabbit({ look, sex: 'f' }).ok);
  // and nights in it never breed it past ten
  for (const x of st.colony.rabbits) if (x.alive) { x.marks.love = 80; x.health = 100; }
  st.colony.rabbits.find((x) => x.alive && !x.look.kind).sex = 'm';
  for (let d = 1; d < 12; d++) { colonyTick(st.colony, 60, { day: st.day + d, cap: 99 }); colonyDay(st.colony, { day: st.day + d, cap: 99 }); }
  assert.ok(penCount(st.colony, 'rabbit') <= PEN_MAX);
});

test('every region has open ground for its rabbits to start on', () => {
  for (const id of ['forest', 'netherwood', 'meadow', 'river', 'quarry', 'moonfen', 'crags']) {
    const sc = sceneOf(id, 'spots');
    const spots = warrenSpots(sc, SCENE_W, SCENE_H);
    assert.ok(spots.length > 20, `${id}: ${spots.length} spots`);
    for (const [x, y] of spots.slice(0, 50)) assert.ok(!sc.solid[y * SCENE_W + x] && sc.solid[(y + 1) * SCENE_W + x], `${id}: feet on the ground`);
  }
});
