// The integrated systems as a player meets them, through the real UI: the
// day dawning with the shop closed, an order that names its techniques and
// what to gather, brewing advice read off the cauldron, a trial's margin and
// evidence level, the recipe book's recorded steps, what a customer weighs
// in bargaining, and a guild shop that sells only tools with a purpose.
import { test, expect } from '@playwright/test';
import { watchErrors, shot, newGame, lab, pourDose, crushInPot } from './helpers.mjs';
import { EFFECT_KEYS } from '../../src/alchemy/effects.js';

/** Clear the toasts so a screenshot shows the room itself. @param {import('@playwright/test').Page} page */
const clean = (page) => page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));

test('a day dawns closed; the order card says what it takes and where to find it', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'integration-1', open: false });
  await page.click('[data-act=tab-counter]');
  await expect(page.locator('.counter-empty')).toContainText('still closed');
  await page.click('[data-act=tab-wilds]');
  await expect(page.locator('.wilds-sky')).toContainText('Dawn');
  await expect(page.locator('.wilds-sky')).toContainText('until you open the shop');
  // open the door: a customer, an order with a technique, and a plan of supplies
  await page.click('[data-act=tab-counter]');
  await lab(page, (l) => {
    const st = l.state;
    st.reputation = 70; // a journeyman's orders
  });
  await page.click('[data-act=next-customer]');
  await expect(page.locator('.customer-card')).toBeVisible();
  expect(await lab(page, (l) => l.state.opened)).toBe(true);
  await page.click('[data-act=tab-wilds]');
  await expect(page.locator('.wilds-sky')).toContainText('Midday');
  await page.click('[data-act=tab-counter]');
  // an order with a technique, generated with the game's own context
  await lab(page, async (l) => {
    // the dev server serves the source modules (browser-side imports, not resolved by the type checker)
    const src = '/src/game/';
    const mod = await import(/* @vite-ignore */ src + 'commissions.js');
    const rng = await import(/* @vite-ignore */ '/src/core/' + 'rng.js');
    const st = l.state;
    // A forced Adept technique needs an Adept's earned access and supplies.
    st.reputation = 180; st.stats.served = 12; st.coins = 10000;
    const pureHerb = 'wild-crown-of-the-grove';
    st.inventory[pureHerb] = 1000;
    const context = { ...st.commissionContext(), available: new Set([st.world.roles.water, pureHerb]) };
    st.current = mod.generateCommission(context, new rng.Rng('ui-tech'), { tier: 2, request: 'healing', techniques: ['strong'] });
    if (!st.current) throw new Error('The progressed shop cannot support the forced technique fixture');
    l.refreshCustomer();
    l.views.counter.refresh();
  });
  await expect(page.locator('.tech-card')).toContainText('Strong and compact');
  await expect(page.locator('.supply-card summary')).toContainText('ml of brew');
  await page.click('.supply-card summary');
  await expect(page.locator('.supply-card')).toContainText('Check each species for side effects');
  await clean(page);
  await page.locator('.tech-card').scrollIntoViewIfNeeded();
  await shot(page, info, 'order-techniques');
  // the order strip: effects (unknown until tested), purity, the quantity
  await page.click('[data-act=tab-brew]');
  await pourDose(page, await lab(page, (l) => l.state.world.roles.water), [100]);
  const keys = await lab(page, (l) => l.state.current.requirements.map((r) => r.key));
  for (const k of keys) expect(['purity', ...EFFECT_KEYS]).toContain(k);
  await expect(page.locator('.req-chip.unknown').first()).toBeVisible();
  await expect(page.locator('.req-chip', { hasText: '°' }), 'no serving temperature on the order').toHaveCount(0);
  expect(errors).toEqual([]);
});

test('advice read off the cauldron, a trial’s margin and level, and a recipe that keeps its steps', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'integration-2' });
  const water = await lab(page, (l) => l.state.world.roles.water);
  // whole leaves: the advice chip says to crush them
  await pourDose(page, water, [100]);
  await pourDose(page, 'wild-silverleaf', [25]);
  const whole = await lab(page, (l) => { const p = l.sim.p; let n = 0; for (let i = 0; i < p.count; i++) if (p.phase[i] === 3) n++; return n; });
  if (whole >= 3) await expect(page.locator('[data-act=advice-chip]')).toBeVisible({ timeout: 5000 });
  // a proper brew: leaves crushed with the pestle, and warmth
  await lab(page, (l) => { l.sim.clear(); l.state.brewLog = []; l.state.newBatch(); });
  await pourDose(page, water, [100]);
  await pourDose(page, 'wild-silverleaf', [50]);
  await pourDose(page, 'wild-sunthistle', [25]);
  await crushInPot(page);
  await lab(page, (l) => { l.setAutoStir(true); l.setFurnace(0.8); l.speed = 4; });
  await page.waitForFunction(() => { const p = window.__alchemist.screen.sim.p; let t = 0; for (let i = 0; i < p.count; i++) t += p.temp[i]; return t / p.count > 60; }, null, { timeout: 60_000, polling: 250 });
  await lab(page, (l) => l.setFurnace(0.15));
  await page.waitForTimeout(6000);
  await lab(page, (l) => { l.setFurnace(0); l.setAutoStir(false); l.speed = 1; });
  // one trial: a margin, never ±0, and the level "1 reading"
  await page.click('[data-act=tab-trials]');
  await page.click('[data-act=test-rabbit]');
  const row = page.locator('.reading').first();
  await expect(row).toHaveAttribute('data-level', 'preliminary');
  await expect(row.locator('.rv')).toContainText('1 reading');
  await expect(row.locator('.rv')).not.toContainText('±0 ');
  // a second rabbit corroborates it
  await lab(page, (l) => { const st = l.state; const other = st.colony.rabbits.find((r) => r.alive && r.id !== st.colony.focus); st.selectRabbit(other.id); l.views.trials.refresh(); });
  await page.click('[data-act=test-rabbit]');
  await expect(page.locator('.reading').first()).toHaveAttribute('data-level', /corroborated|certified/);
  await clean(page);
  await page.locator('.reading-rows').scrollIntoViewIfNeeded();
  await shot(page, info, 'trial-evidence');
  // save the brew as a recipe straight from its draft: its procedure has the steep
  const steps = await lab(page, (l) => { const m = l.assay; const r = l.recipeDraft(m, null, null); l.state.addRecipe({ ...r, name: 'Leaf tea' }); return r.steps.map((s) => s.op); });
  expect(steps[0]).toBe('pour');
  expect(steps).toContain('temp');
  await page.click('[data-act=tab-book]');
  await page.click('[data-act=book-recipes]');
  const card = page.locator('.view-book .item.recipe', { hasText: 'Leaf tea' });
  await expect(card).toBeVisible();
  await card.locator('details.steps summary').click();
  await expect(card.locator('.recipe-steps li', { hasText: 'Heat to' }).first()).toBeVisible();
  await expect(card).toHaveAttribute('data-confidence', 'tested');
  await clean(page);
  await card.scrollIntoViewIfNeeded();
  await shot(page, info, 'recipe-steps');
  expect(errors).toEqual([]);
});

test('bargaining shows what the customer weighs; the guild sells only tools with a purpose', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'integration-3' });
  const water = await lab(page, (l) => l.state.world.roles.water);
  await pourDose(page, water, [100]);
  await pourDose(page, 'wild-silverleaf', [50]);
  await crushInPot(page);
  await page.click('[data-act=bottle]');
  const ml = await lab(page, (l) => l.state.current.bottleMl);
  await page.click(`[data-act=bottle-${ml}]`).catch(async () => { await page.locator('[data-act^=bottle-]').first().click(); });
  await expect(page.locator('[data-act=serve]')).toBeVisible({ timeout: 20_000 });
  await lab(page, (l) => { l.state.current.customer.persona.proof = 0.2; });
  await page.click('[data-act=serve]');
  await page.click('[data-act=label-seal]');
  await expect(page.locator('.haggle-why')).toContainText('Trust');
  await expect(page.locator('.haggle-why')).toContainText('Fit');
  await clean(page);
  await shot(page, info, 'bargain-reasons');
  await page.click('[data-act=walk-away]');
  // the shop's brew room has no physics-demonstration controls: those live in the Free Experiment
  await page.click('[data-act=tab-brew]');
  for (const act of ['alembic', 'thermal', 'tool-skimmer']) expect(await page.locator(`[data-act=${act}]`).count(), `${act} is a Free Experiment control`).toBe(0);
  // every item at the guild names what it is for; no retired item is sold
  await lab(page, (l) => { l.state.reputation = 9999; });
  await page.click('[data-act=shop]');
  await page.click('[data-act=shop-tab-equipment]');
  const items = page.locator('.overlay .item');
  const n = await items.count();
  expect(n).toBeGreaterThan(15);
  await expect(page.locator('.overlay .item .mech')).toHaveCount(n);
  for (const id of ['hydrometer', 'viscometer', 'assay', 'galvanometer', 'thermal', 'skimmer', 'alembic', 'bellows', 'athanor', 'lens', 'trowel', 'shelf1']) expect(await page.locator(`[data-act=equip-${id}]`).count(), `${id} is retired`).toBe(0);
  expect(errors).toEqual([]);
});
