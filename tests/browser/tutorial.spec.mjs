import { test, expect } from '@playwright/test';
import { newGame, lab, drag, pourDose, crushInPot, watchErrors, shot } from './helpers.mjs';

test('the first tour completes harvesting, cultivation, Arcane practice and a real customer sale', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: true, seed: 'complete-tour-1' });
  const step = async (n) => expect.poll(() => lab(page, (l) => l.tutorial.index)).toBe(n);
  await page.click('[data-act=tutorial-next]'); await page.click('[data-act=tutorial-next]');
  await page.click('[data-act=tab-wilds]'); await step(3);
  // Exercise the real first discovery; no inventory, seed or found flags are granted by this fixture.
  await lab(page, (l) => { l.views.wilds.setZoom(1); l.views.wilds.wildlife = false; l.views.wilds.grow(); });
  const leaf = await lab(page, (l) => {
    const w = l.views.wilds, p = w.field.find((p) => p.m.id === 'wild-silverleaf' && p.stage === 'mature');
    if (!p) throw new Error('The introductory Silverleaf stand is missing');
    const f = w.frameOf(p);
    return { id: p.id, x: p.x * 384 - f.ax + f.w / 2, y: p.y * 216 - f.ay + f.h / 2 };
  });
  const scene = page.locator('.view-wilds canvas.scene'); await scene.scrollIntoViewIfNeeded();
  const box = await scene.boundingBox();
  const at = (x, y) => ({ x: box.x + x * box.width / 384, y: box.y + y * box.height / 216 });
  const stroke = [], x = Math.max(28, Math.min(356, leaf.x));
  for (let k = 0; k <= 8; k++) stroke.push(at(x - 24 + k * 6, leaf.y));
  for (let k = 0; k <= 8; k++) stroke.push(at(x + 24 - k * 6, leaf.y));
  await drag(page, stroke, 12);
  await page.waitForFunction((id) => window.__alchemist.screen.views.wilds.fallen[id]?.landed, leaf.id);
  const fallen = await lab(page, (l, id) => l.views.wilds.itemCentre(id), leaf.id);
  await page.mouse.click(at(fallen.x, fallen.y).x, at(fallen.x, fallen.y).y);
  await step(4);
  expect(await lab(page, (l) => l.state.garden.seeds['wild-silverleaf'])).toBeGreaterThan(0);
  await lab(page, (l) => { l.views.wilds.wildlife = true; });
  await page.click('[data-act=tutorial-fox]'); await step(5);
  await page.click('[data-act=tab-garden]'); await step(6);
  await page.selectOption('[data-act=garden-seed]', 'wild-silverleaf');
  await page.click('[data-act=garden-plant]'); await step(7);
  await page.click('[data-act=garden-water]'); await step(8);
  await page.click('[data-act=tutorial-next]');
  await page.click('[data-act=tab-brew]'); await step(10);
  const water = await lab(page, (l) => l.state.world.roles.water);
  await pourDose(page, water, [100]); await step(11);
  await pourDose(page, 'wild-silverleaf@arcane', [25]); await step(12);
  await crushInPot(page);
  await lab(page, (l) => { l.setAutoStir(true); l.speed = 4; });
  await page.locator('input[aria-label="Fire and frost control"]').fill('90');
  await page.waitForFunction(() => window.__alchemist.screen.state.tutorial.arcane === true, null, { timeout: 60000 });
  expect(await lab(page, (l) => l.sim.awakened)).toBeGreaterThan(0);
  await step(13);
  await shot(page, info, 'tour-arcane-practice');
  await page.locator('input[aria-label="Fire and frost control"]').fill('0');
  await page.click('[data-act=empty]'); await page.getByRole('button', { name: 'Empty it', exact: true }).click();
  await step(14);
  await page.click('[data-act=tab-counter]'); await step(15);
  await page.click('[data-act=tab-brew]');
  await pourDose(page, water, [100, 25]);
  await pourDose(page, 'wild-silverleaf', [50]);
  await pourDose(page, 'wild-sunthistle', [25]); await step(16);
  await crushInPot(page);
  await page.locator('input[aria-label="Fire and frost control"]').fill('90');
  await page.waitForFunction(() => {
    const p = window.__alchemist.screen.sim.p;
    let t = 0; for (let i = 0; i < p.count; i++) t += p.temp[i]; return t / p.count > 60;
  }, null, { timeout: 60000 });
  await page.locator('input[aria-label="Fire and frost control"]').fill('15');
  await page.waitForFunction(() => {
    const s = window.__alchemist.screen.sim, slot = s.species.slotOf.get('wild-silverleaf');
    let raw = 0; for (let i = 0; i < s.p.count; i++) raw += slot === undefined ? 0 : s.p.comp[i * s.p.S + slot]; return raw < 2;
  }, null, { timeout: 90000 });
  await page.locator('input[aria-label="Fire and frost control"]').fill('0');
  await lab(page, (l) => { l.speed = 1; l.setAutoStir(false); }); await step(17);
  await page.click('[data-act=tab-trials]'); await page.click('[data-act=test-rabbit]'); await step(18);
  await page.click('[data-act=tutorial-next]'); await page.click('[data-act=tab-brew]');
  await page.click('[data-act=bottle]'); await page.click('[data-act=bottle-100]'); await step(20);
  await page.click('[data-act=serve]'); await expect(page.locator('.haggle-log')).toBeVisible();
  await page.click('[data-act=accept-offer]'); await page.click('[data-act=haggle-done]');
  await page.click('[data-act=result-continue]'); await step(21);
  for (let notes = 0; await lab(page, (l) => l.tutorial.active); notes++) {
    if (notes >= 3) throw new Error('The closing tutorial notes did not finish');
    try { await page.click('[data-act=tutorial-next]', { timeout: 10000 }); }
    catch (e) { if (await lab(page, (l) => l.tutorial.active)) throw e; }
  }
  const result = await lab(page, (l) => ({ done: l.state.tutorial.done, active: l.tutorial.active, arcane: l.state.tutorial.arcane, served: l.state.stats.served,
    fox: l.state.colony.rabbits.some((r) => r.look.kind === 'fox' && r.alive), crop: l.state.garden.plots.some((p) => p.crop?.materialId === 'wild-silverleaf') }));
  expect(result).toEqual({ done: true, active: false, arcane: true, served: 1, fox: true, crop: true });
  expect(errors).toEqual([]);
});
