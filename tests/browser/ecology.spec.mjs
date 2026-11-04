// Saved campaign ecology and the garden, through the same controls used on phones.
import { test, expect } from '@playwright/test';
import { newGame, startSandbox, lab, watchErrors, shot, drag, horizontalOverflow } from './helpers.mjs';

async function resume(page) {
  await page.reload();
  await page.click('[data-act=continue]');
  await page.waitForSelector('canvas.view-canvas');
}

test('a wild harvest opens the garden; planting, watering and a single harvest survive reload', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, open: false, seed: 'ecology-garden-flow' });
  await page.click('[data-act=tab-garden]');
  await expect(page.locator('.view-garden')).toContainText('Gather your first ingredient');
  await page.click('[data-act=tab-wilds]');
  await expect(page.locator('[data-act=mode-water]')).toHaveCount(0);
  await lab(page, (l) => { l.views.wilds.wildlife = false; l.views.wilds.setZoom(1); });
  await page.locator('.view-wilds canvas.scene').scrollIntoViewIfNeeded();
  const aim = await lab(page, (l) => {
    const w = l.views.wilds, p = w.field.find((p) => p.m.id === 'wild-silverleaf'), f = w.frameOf(p);
    return { id: p.id, x: p.x * 384 - f.ax + f.w / 2, y: p.y * 216 - f.ay + f.h / 2 };
  });
  const box = await page.locator('.view-wilds canvas.scene').boundingBox();
  const at = (x, y) => ({ x: box.x + x / 384 * box.width, y: box.y + y / 216 * box.height });
  const x = Math.max(32, Math.min(352, aim.x));
  await drag(page, Array.from({ length: 19 }, (_, k) => at(x + Math.sin(k * Math.PI / 9) * 28, aim.y)), 12);
  await expect.poll(() => lab(page, (l, id) => !!l.views.wilds.fallen[id]?.landed, aim.id)).toBe(true);
  const item = await lab(page, (l, id) => l.views.wilds.itemCentre(id), aim.id);
  await drag(page, [at(item.x, item.y), at(item.x, item.y)], 20);
  await expect.poll(() => lab(page, (l) => l.state.garden.unlocked)).toBe(true);
  await page.click('[data-act=tab-garden]');
  await page.selectOption('[data-act=garden-seed]', 'wild-silverleaf');
  await page.click('[data-act=garden-plant]');
  const planted = await lab(page, (l) => ({ ...l.state.garden.plots[0].crop }));
  await page.click('[data-act=garden-water]');
  expect(await lab(page, (l) => l.state.garden.plots[0].crop.w)).toBeGreaterThan(planted.w);
  await resume(page);
  await page.click('[data-act=tab-garden]');
  expect(await lab(page, (l) => l.state.garden.plots[0].crop.id)).toBe(planted.id);
  const before = await lab(page, (l) => l.state.stock('wild-silverleaf'));
  // Advance only cultivation elapsed time; real waiting is covered by the growth unit suite.
  await lab(page, (l) => { l.state.garden.time += 30 * 60000; l.views.garden.refresh(); });
  await page.click('[data-act=garden-harvest]');
  expect(await lab(page, (l) => l.state.stock('wild-silverleaf'))).toBe(before + 50);
  await expect(page.locator('[data-act=garden-harvest]')).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBe(0);
  await shot(page, info, 'garden-harvested');
  await resume(page);
  expect(await lab(page, (l) => l.state.garden.plots[0].crop)).toBeNull();
  expect(await lab(page, (l) => l.state.stock('wild-silverleaf'))).toBe(before + 50);
  expect(errors).toEqual([]);
});

test('finite resources and wildlife stay depleted; a recharged coin enables regeneration in place', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, open: false, seed: 'ecology-travel-flow' });
  await page.click('[data-act=tab-wilds]');
  // Discover the guaranteed single Arcane specimen, then harvest it through its card.
  const fixture = await lab(page, (l) => {
    const d = l.state.deposits.find((d) => d.materialId === 'wild-silverleaf@arcane');
    l.state.found[d.materialId] = 1;
    l.views.wilds.refresh();
    const w = l.views.wilds.warren(), missing = w.rabbits[0].id;
    w.remove(w.rabbits[0]);
    return { deposit: d.id, missing, seed: l.state.sceneSeed('forest') };
  });
  await page.locator(`[data-act="gather-${fixture.deposit}"]`).click();
  await expect(page.locator(`[data-act="gather-${fixture.deposit}"]`)).toBeDisabled();
  await resume(page);
  await page.click('[data-act=tab-wilds]');
  await expect(page.locator(`[data-act="gather-${fixture.deposit}"]`)).toBeDisabled();
  expect(await lab(page, (l, id) => l.views.wilds.warren().rabbits.some((r) => r.id === id), fixture.missing)).toBe(false);
  const before = await lab(page, (l) => ({ stock: l.state.stock('wild-silverleaf@arcane'), seeds: { ...l.state.garden.seeds } }));
  await lab(page, (l) => { l.state.traveller.balance = 0; l.state.traveller.last = Date.now(); l.views.wilds.refresh(); });
  await expect(page.locator('[data-act=regenerate-biome]')).toBeDisabled();
  await lab(page, (l) => { l.state.traveller.last -= 25 * 60000; });
  await expect(page.locator('[data-act=regenerate-biome]')).toBeEnabled();
  await expect(page.locator('[data-act=regenerate-biome]')).toContainText('(1/3)');
  await page.click('[data-act=regenerate-biome]');
  expect(await lab(page, (l) => l.state.sceneSeed('forest'))).not.toBe(fixture.seed);
  expect(await lab(page, (l) => l.state.traveller.balance)).toBe(0);
  expect(await lab(page, (l) => l.state.stock('wild-silverleaf@arcane'))).toBe(before.stock);
  expect(await lab(page, (l) => l.state.garden.seeds)).toEqual(before.seeds);
  await shot(page, info, 'regenerated-forest');
  expect(errors).toEqual([]);
});

test('all exotic scenery controls activate their native scene and keep sandbox regeneration free', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startSandbox(page);
  await page.click('[data-act=tab-wilds]');
  const coins = await lab(page, (l) => l.state.traveller.balance);
  for (const region of ['moonfen', 'skyshard', 'morphgrove', 'veil', 'ghostglass', 'chronoglass']) {
    await page.click(`[data-act=region-${region}]`);
    await page.click('[data-act=biome-feature]');
    expect(await lab(page, (l) => l.views.wilds.interaction.points.some((p) => p.touched > 0))).toBe(true);
    expect(await lab(page, (l) => new Set(l.views.wilds.warren().rabbits.map((r) => r.kind)).size)).toBe(1);
    await page.click('[data-act=regenerate-biome]');
    expect(await lab(page, (l) => l.state.traveller.balance)).toBe(coins);
    expect(await horizontalOverflow(page)).toBe(0);
  }
  await shot(page, info, 'chronoglass-interaction');
  expect(errors).toEqual([]);
});
