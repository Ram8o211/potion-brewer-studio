import test from 'node:test';
import assert from 'node:assert/strict';
import { startService, waitForService, serviceStatus, ORDERS } from '../src/game/orders.js';
import { GameState, SAVE_VERSION } from '../src/game/state.js';
import { EFFECT_INDEX, NE } from '../src/alchemy/effects.js';

const request = () => ({ id: 'test-request', tier: 2, bottleMl: 100, budget: 80, potionName: 'Healing tonic', customer: { name: 'Mira', persona: { patience: 3 } },
  requirements: [{ key: 'vitality', kind: 'min', target: 10, tol: 0, zero: 10, label: 'at least 10%' }] });
function bottle() { const effects = new Array(NE).fill(0); effects[EFFECT_INDEX.vitality] = 12; return { id: 'stored-1', ml: 100, m: { ml: 100, effects }, label: { claims: {} } }; }

test('service patience counts active time, persists, reduces payment and never counts suspension', () => {
  const com = startService(request());
  assert.equal(serviceStatus(com).fraction, 1);
  assert.equal(waitForService(com, 3600), false);
  assert.equal(waitForService(com, 1, false), false);
  for (let i = 0; i < 100; i++) waitForService(com, 1);
  assert.equal(com.service.elapsed, 100);
  assert.ok(serviceStatus(com).payment < 1);
  const st = GameState.create('service-save', { tutorial: false }); st.current = com;
  const loaded = GameState.fromJSON(JSON.parse(JSON.stringify(st.toJSON())));
  assert.equal(loaded.current.service.elapsed, 100);
  loaded.current.service.elapsed = loaded.current.service.duration - 0.25;
  assert.equal(loaded.tickCustomer(0.25, false), false);
  assert.equal(loaded.tickCustomer(0.25), true);
  assert.equal(loaded.current, null);
  assert.equal(loaded.stats.declined, 1);
  assert.equal(serviceStatus(com).payment >= ORDERS.minPayment, true);
  assert.equal(startService({ ...request(), tutorial: true }).service, undefined);
});

test('special commission reserves no immediate slot, persists and pays exactly once for a valid stored bottle', () => {
  const st = GameState.create('special-save', { tutorial: false });
  const o = { id: 'special-test', request: { ...request(), special: true }, pickupDay: 4, reward: 200 };
  st.specialOffer = o;
  assert.equal(st.acceptSpecial(o.id).ok, true);
  assert.equal(st.acceptSpecial(o.id).ok, false);
  assert.equal(st.customerIndex, 0);
  st.bottles.push(/** @type {any} */ (bottle()));
  const loaded = GameState.fromJSON(JSON.parse(JSON.stringify(st.toJSON())));
  const before = loaded.coins, index = loaded.customerIndex;
  assert.equal(loaded.deliverSpecial(o.id, 'stored-1').ok, false, 'too early');
  loaded.day = 4;
  loaded.bottles[0].m.effects[EFFECT_INDEX.vitality] = 0;
  assert.equal(loaded.deliverSpecial(o.id, 'stored-1').ok, false, 'reject wrong brew without consuming it');
  assert.equal(loaded.bottles.length, 1);
  loaded.bottles[0].m.effects[EFFECT_INDEX.vitality] = 12;
  assert.equal(loaded.deliverSpecial(o.id, 'stored-1').ok, true);
  assert.equal(loaded.coins, before + 200);
  assert.equal(loaded.customerIndex, index);
  assert.equal(loaded.bottles.length, 0);
  assert.equal(loaded.specialOrders.length, 0);
  assert.equal(loaded.deliverSpecial(o.id, 'stored-1').ok, false);
  assert.equal(loaded.coins, before + 200);
});

test('declining or missing a special order does not take coins or reputation', () => {
  const st = GameState.create('special-refusal', { tutorial: false });
  const o = { id: 'refusal', request: request(), pickupDay: 1, reward: 100 };
  st.specialOffer = o; const coins = st.coins, rep = st.reputation;
  st.declineSpecial(o.id);
  assert.equal(st.specialOffer, null);
  st.specialOrders.push(o); st.day = 1 + ORDERS.pickupGraceDays;
  st.endDay();
  assert.equal(st.specialOrders.length, 0);
  assert.equal(st.coins, coins); assert.equal(st.reputation, rep);
});

test('v8 save migrates the tour without changing inventory, recipes, crops or completed progress', () => {
  const st = GameState.create('tour-migration', { tutorial: true });
  const d = JSON.parse(JSON.stringify(st.toJSON())); d.version = 8; d.tutorial.step = 12;
  const back = GameState.fromJSON(d);
  assert.equal(back.toJSON().version, SAVE_VERSION);
  assert.equal(back.tutorial.step, 0);
  assert.equal(back.stock('wild-silverleaf@arcane'), 25);
  back.inventory['wild-silverleaf@arcane'] = 0;
  const again = GameState.fromJSON(JSON.parse(JSON.stringify(back.toJSON())));
  assert.equal(again.stock('wild-silverleaf@arcane'), 0, 'no repeated tutorial grant');
  assert.deepEqual(again.recipes, back.recipes);
});
