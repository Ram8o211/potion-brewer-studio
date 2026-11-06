// The new systems in their characteristic states, played through the real
// game and captured for the documentation (scripts/curate-screenshots.mjs):
// an awakened brew, its patterns bold; a hutch full of changed rabbits and a body;
// labelling and bargaining; a customer back the next day; the wilds at
// dusk in bad weather. Each scene also checks what it shows.
import { test, expect } from '@playwright/test';
import { watchErrors, shot, newGame, lab, pourRole, crushInPot } from './helpers.mjs';
import { weatherOn } from '../../src/game/gathering.js';

const NE = 10;
/** Documentation shots show the scene, not the pile of toasts above it. */
const clean = (page) => page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
const KEYS = ['vitality', 'strength', 'love', 'arcana', 'transformation', 'fire', 'frost', 'acidity', 'toxicity', 'death'];

test('an awakened brew draws its effects\' patterns boldly', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'showcase-glow' });
  await pourRole(page, 'water', 125);
  await lab(page, (l) => { l.state.inventory['wild-silverleaf@arcane'] = 100; l.buildShelf(); });
  await pourRole(page, 'wild-silverleaf@arcane', 100);
  await crushInPot(page);
  // 100 ml is 20 simulation volumes: awaken more than half of the eligible
  // Arcane matter, then verify the actual awakened species below.
  // Stir until even, then heat past the blend's threshold with the fire control
  await lab(page, (l) => { l.setAutoStir(true); });
  await page.waitForTimeout(2500);
  await lab(page, (l) => { l.setAutoStir(false); l.setFurnace(1); l.speed = 4; });
  await page.waitForFunction(() => (/** @type {any} */ (window)).__alchemist.screen.sim.awakened > 10, null, { timeout: 90_000, polling: 500 });
  await lab(page, (l) => { l.setFurnace(0); l.speed = 1; });
  await page.waitForTimeout(600);
  const inv = await lab(page, (l) => l.sim.inventory());
  expect(Object.keys(inv).some((id) => id.endsWith('~a')), 'awakened essence is in the brew').toBe(true);
  await clean(page);
  await shot(page, info, 'showcase-awakened');
  expect(errors).toEqual([]);
});

test('a hutch of changed rabbits, and a body that keeps its changes', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'showcase-hutch' });
  await lab(page, (l, a) => {
    const st = l.state;
    st.coins = 300;
    st.equipment.push('kennel');
    for (let i = 0; i < 4; i++) st.buyRabbit();
    const fx = (o) => { const e = new Array(a.NE).fill(0); for (const [k, v] of Object.entries(o)) e[a.KEYS.indexOf(k)] = v; return { effects: e, resonance: [], color: [0.6, 0.4, 0.5], temperature: 25 }; };
    const ctx = (id, ml = 25) => ({ ml, source: 'cauldron', batchId: 'showcase-hutch', rev: st.batch.rev, // fixed: the same readings every run
      theory: new Array(a.NE).fill(0), parts: [], rabbitId: id });
    const ids = st.colony.rabbits.map((r) => r.id);
    st.recordTrial('rabbit', fx({ strength: 16, love: 10 }), ctx(ids[0]));
    st.recordTrial('rabbit', fx({ transformation: 12, arcana: 14 }), ctx(ids[1]));
    st.recordTrial('rabbit', fx({ transformation: 10, frost: 9 }), ctx(ids[1]));
    st.recordTrial('rabbit', fx({ fire: 9, toxicity: 6 }), ctx(ids[2]));
    st.recordTrial('rabbit', fx({ love: 22 }), ctx(ids[3]));
    st.recordTrial('rabbit', fx({ transformation: 14, strength: 12 }), ctx(ids[4]));
    st.recordTrial('rabbit', fx({ fire: 120 }), ctx(ids[4]));
    st.selectRabbit(ids[1]);
    l.showView('trials');
    l.views.trials.refresh();
  }, { NE, KEYS });
  await page.waitForTimeout(2500); // let them wander
  const dead = await lab(page, (l) => l.state.colony.rabbits.filter((r) => !r.alive).map((r) => ({ id: r.id, traits: r.traits })));
  expect(dead.length).toBe(1);
  expect(dead[0].traits.length, 'the burned rabbit keeps its transformation').toBeGreaterThan(0);
  await page.locator('.hutch').scrollIntoViewIfNeeded();
  await clean(page);
  await shot(page, info, 'showcase-hutch');
  await page.click(`.rabbit-tile[data-rabbit=${dead[0].id}]`);
  await page.locator('.rabbit-detail').scrollIntoViewIfNeeded();
  await clean(page);
  await shot(page, info, 'showcase-body');
  expect(errors).toEqual([]);
});

test('label, bargain, and the customer comes back with a complaint', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'showcase-trade' });
  // a plain healing order from a picky customer
  await lab(page, (l) => {
    const st = l.state;
    st.current = { ...st.current, requirements: [{ key: 'vitality', kind: 'min', target: 6, tol: 0, zero: 8, label: 'at least 6%', effect: true }], effectOrder: true, bottleMl: 50, bottleN: 10, potionName: 'Healing Draught',
      customer: { ...st.current.customer, persona: { haggle: 0.75, patience: 3, honesty: 1, proof: 0.5 } } };
    l.refreshCustomer();
    l.views.counter.refresh();
  });
  await pourRole(page, 'water', 50);
  await pourRole(page, 'water', 50);
  await pourRole(page, 'wild-silverleaf', 50);
  await crushInPot(page);
  await page.click('[data-act=bottle]');
  await page.click('[data-act=bottle-50]');
  await expect(page.locator('[data-act=serve]')).toBeVisible({ timeout: 20_000 });
  await page.click('[data-act=label]');
  // claim far more healing than the guild's theory says
  await page.click('.label-row[data-claim=vitality]');
  for (let k = 0; k < 25; k++) await page.click('[data-act=claim-up-vitality]');
  await clean(page);
  await shot(page, info, 'showcase-label');
  await page.click('[data-act=label-seal]');
  await page.click('[data-act=serve]');
  await page.click('[data-act=ask-up]');
  await page.click('[data-act=ask-price]');
  await clean(page);
  await shot(page, info, 'showcase-bargain');
  if (await page.locator('[data-act=accept-offer]').isEnabled()) await page.click('[data-act=accept-offer]');
  await page.click('[data-act=haggle-done]');
  await page.click('[data-act=result-continue]');
  // the next day: the label lied, and the customer is back
  await lab(page, (l) => { const st = l.state; st.current = null; st.customerIndex = st.customersPerDay; st.endDay(); l.refreshHud(true); l.showView('counter'); l.views.counter.refresh(); });
  await expect(page.locator('.followup.complaint')).toBeVisible();
  await clean(page);
  await shot(page, info, 'showcase-complaint');
  await page.click('[data-act=fu-refund]');
  expect(await lab(page, (l) => l.state.followUps[0].resolved)).toBe(true);
  expect(errors).toEqual([]);
});

test('the wilds at dusk in a thunderstorm', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'showcase-wilds' });
  // find a stormy day for this world, and make it dusk
  const seed = await lab(page, (l) => l.state.seed);
  let day = 2;
  while (day < 80 && weatherOn(seed, day).id !== 'storm') day++;
  await lab(page, (l, d) => { const st = l.state; st.day = d; st.current = null; st.customerIndex = st.customersPerDay; l.showView('wilds'); l.views.wilds.refresh(); }, day);
  await expect(page.locator('.wilds-sky')).toContainText('Dusk');
  await expect(page.locator('.wilds-sky')).toContainText('Thunderstorm');
  await page.waitForTimeout(800);
  await clean(page);
  await shot(page, info, 'showcase-wilds-storm');
  expect(errors).toEqual([]);
});
