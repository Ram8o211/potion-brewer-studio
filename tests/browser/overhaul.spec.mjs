import { test, expect } from '@playwright/test';
import { newGame, lab, watchErrors, horizontalOverflow } from './helpers.mjs';

test('shipped ingredient artwork loads without fetching locked Exotic biomes', async ({ page }) => {
  const errors = watchErrors(page), assets = [];
  page.on('request', (r) => { if (r.url().includes('/ingredients/biomes/')) assets.push(r.url()); });
  await newGame(page, { tutorial: true, seed: 'atlas-onboarding' });
  await expect(page.locator('.jar[data-id="wild-silverleaf"] canvas')).toHaveAttribute('data-asset', 'silverleaf:icon');
  await expect(page.locator('.jar[data-id="wild-silverleaf@arcane"] canvas')).toHaveAttribute('data-asset', 'silverleaf@arcane:icon');
  const images = await page.locator('.jar[data-id^="wild-silverleaf"] canvas').evaluateAll((els) => els.map((e) => (/** @type {HTMLCanvasElement} */ (e)).toDataURL()));
  expect(new Set(images).size).toBeGreaterThanOrEqual(2);
  expect(assets.some((url) => /moonfen|skyshard|morphgrove|ghostglass|chronoglass|\/veil\./.test(url))).toBe(false);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('introductory fox, seed and garden use actual controls and persist tutorial position', async ({ page }) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: true, seed: 'tour-garden-v2' });
  await page.click('[data-act=tutorial-next]'); await page.click('[data-act=tutorial-next]');
  await page.click('[data-act=tab-wilds]');
  await page.click('[data-act=tutorial-fox]');
  expect(await lab(page, (l) => l.state.colony.rabbits.some((r) => r.look.kind === 'fox' && r.alive))).toBe(true);
  // Discover the guaranteed common stand, then harvest through its real card.
  const id = await lab(page, (l) => { l.state.found['wild-silverleaf'] = 1; l.views.wilds.refresh(); return l.state.deposits.find((d) => d.materialId === 'wild-silverleaf').id; });
  await page.locator(`[data-act="gather-${id}"]`).click();
  await page.click('[data-act=tab-garden]');
  await page.selectOption('[data-act=garden-seed]', 'wild-silverleaf');
  await page.click('[data-act=garden-plant]');
  await expect(page.locator('.garden-plot.selected canvas')).toHaveAttribute('data-asset', /silverleaf:(seed|sprout)/);
  await page.click('[data-act=garden-water]');
  await expect(page.locator('.garden-plot.selected')).toHaveAttribute('data-moisture', 'wet');
  const before = await lab(page, (l) => { l.save(); return { step: l.state.tutorial.step, crop: l.state.garden.plots[0].crop.id }; });
  await page.reload(); await page.click('[data-act=continue]'); await page.waitForSelector('canvas.view-canvas');
  expect(await lab(page, (l) => l.state.tutorial.step)).toBe(before.step);
  expect(await lab(page, (l) => l.state.garden.plots[0].crop.id)).toBe(before.crop);
  expect(errors).toEqual([]);
});

test('service patience and delayed commission controls preserve separate order slots', async ({ page }) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'customer-v2', open: false });
  await page.click('[data-act=tab-counter]'); await page.click('[data-act=next-customer]');
  await expect(page.getByRole('progressbar', { name: 'Customer patience' })).toBeVisible();
  const index = await lab(page, (l) => {
    l.state.current.service.elapsed = l.state.current.service.duration - 0.1;
    return l.state.customerIndex;
  });
  await expect.poll(() => lab(page, (l) => l.state.current === null)).toBe(true);
  expect(await lab(page, (l) => l.state.customerIndex)).toBe(index + 1);
  await lab(page, (l) => {
    l.state.day = 3; l.state.reputation = 180;
    l.state.specialOfferDay = 3;
    l.state.specialOffer = { id: 'ui-commission', pickupDay: 5, reward: 200, request: { tier: 2, budget: 80, bottleMl: 100, potionName: 'Winter Tonic', customer: { name: 'Mira' }, requirements: [{ key: 'frost', label: 'at least 10%', kind: 'min', target: 10, zero: 10, tol: 0 }] } };
    l.views.counter.refresh();
  });
  await page.click('[data-act=special-accept]');
  await expect(page.locator('.special-board')).toContainText('pickup day 5');
  await expect(page.locator('[data-act=special-deliver]')).toBeDisabled();
  expect(await lab(page, (l) => l.state.specialOrders.length)).toBe(1);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(errors).toEqual([]);
});


test('a complete tour replay keeps the current brew and grants no extra resources', async ({ page }) => {
  await newGame(page, { tutorial: false, seed: 'replay-is-safe', open: false });
  const before = await lab(page, (l) => ({ stock: { ...l.state.inventory }, coins: l.state.coins, seeds: { ...l.state.garden.seeds }, particles: l.sim.p.count }));
  await lab(page, (l) => { l.tutorial.start(true); });
  let steps = 0;
  while (await page.locator('[data-act=tutorial-next]').count()) {
    await page.click('[data-act=tutorial-next]');
    if (++steps > 30) throw new Error('Tour replay did not finish');
  }
  expect(steps).toBe(24);
  expect(await lab(page, (l) => l.state.tutorial.done)).toBe(true);
  expect(await lab(page, (l) => ({ stock: { ...l.state.inventory }, coins: l.state.coins, seeds: { ...l.state.garden.seeds }, particles: l.sim.p.count }))).toEqual(before);
});
