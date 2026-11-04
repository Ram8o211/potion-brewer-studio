// Layout on every viewport: nothing overflows, the cauldron dominates the
// brew room, every room fits, and controls are large enough to touch.
import { test, expect } from '@playwright/test';
import { watchErrors, shot, openGame, newGame, startSandbox, horizontalOverflow } from './helpers.mjs';

/** Visible interactive elements smaller than `min` CSS px. @param {import('@playwright/test').Page} page */
function smallTargets(page, min = 44) {
  return page.evaluate((m) => {
    const out = [];
    for (const el of document.querySelectorAll('button, .jar, input[type=range], [role=button]')) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || st.visibility === 'hidden' || st.display === 'none') continue;
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      // partly scrolled out of a strip: judge only fully visible controls
      const parent = el.closest('.tools, .shelf, .region-tabs, .book-tabs, .dose, .req-chips');
      if (parent) { const pr = parent.getBoundingClientRect(); if (r.left < pr.left - 1 || r.right > pr.right + 1) continue; }
      if (Math.min(r.width, r.height) < m) out.push(`${el.getAttribute('data-act') || el.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  }, min);
}

test('main menu fits the screen', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openGame(page);
  await page.waitForTimeout(800);
  expect(await horizontalOverflow(page)).toBe(0);
  for (const act of ['new-game', 'sandbox', 'help', 'menu-settings']) await expect(page.locator(`[data-act=${act}]`)).toBeInViewport();
  await shot(page, info, 'menu');
  expect(errors).toEqual([]);
});

test('brew room: cauldron, order, shelf, tools and tabs are all on screen', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false });
  const vw = page.viewportSize();
  if (!vw) throw new Error('no viewport');
  expect(await horizontalOverflow(page)).toBe(0);
  for (const sel of ['canvas.view-canvas', '.order-strip', '[data-act=tool-spoon]', '[data-act=bottle]', 'input[aria-label="Fire and frost control"]', '[data-act=lid]', '[data-act=tab-trials]', '[data-act=tab-wilds]', '[data-act=tab-counter]', '[data-act=tab-book]']) {
    await expect(page.locator(sel).first(), sel).toBeInViewport();
  }
  const jars = page.locator('.jar');
  expect(await jars.count()).toBeGreaterThanOrEqual(8);
  await expect(jars.first()).toBeInViewport();
  // the cauldron is the centre of the screen
  const cv = await page.locator('canvas.view-canvas').boundingBox();
  if (!cv) throw new Error('no canvas');
  const share = (cv.width * cv.height) / (vw.width * vw.height);
  expect(share, `cauldron view covers ${(share * 100).toFixed(0)}% of the screen`).toBeGreaterThan(0.22);
  if (info.project.use.hasTouch) expect(await smallTargets(page), 'controls smaller than 44 CSS px').toEqual([]);
  await shot(page, info, 'shop');
  expect(errors).toEqual([]);
});

test('every room fits the screen and its controls are touch sized', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'rooms-fit-1' });
  for (const room of ['counter', 'wilds', 'garden', 'trials', 'book']) {
    await page.click(`[data-act=tab-${room}]`);
    await expect(page.locator(`.view-${room}`)).toBeVisible();
    await page.waitForTimeout(250);
    expect(await horizontalOverflow(page), `${room} overflows`).toBe(0);
    const box = await page.locator(`.view-${room}`).boundingBox();
    if (!box) throw new Error('no room');
    expect(box.x + box.width).toBeLessThanOrEqual((page.viewportSize()?.width || 0) + 1);
    if (info.project.use.hasTouch) expect(await smallTargets(page), `${room}: controls smaller than 44 CSS px`).toEqual([]);
    await shot(page, info, `room-${room}`);
  }
  expect(errors).toEqual([]);
});

test('free experiment layout', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startSandbox(page);
  expect(await horizontalOverflow(page)).toBe(0);
  await expect(page.locator('canvas.view-canvas')).toBeInViewport();
  await expect(page.locator('[data-act=tool-pestle]')).toBeInViewport();
  await expect(page.locator('[data-act=tab-counter]')).toHaveCount(0);
  await shot(page, info, 'sandbox');
  expect(errors).toEqual([]);
});

test('panels open, fit and close', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false });
  for (const [act, name] of [['shop', 'shop-panel'], ['menu', 'pause-panel']]) {
    await page.click(`[data-act=${act}]`);
    const modal = page.locator('.overlay .modal');
    await expect(modal).toBeVisible();
    await page.waitForTimeout(300);
    const b = await modal.boundingBox();
    const vw = page.viewportSize();
    if (!b || !vw) throw new Error('no box');
    expect(b.x).toBeGreaterThanOrEqual(-1);
    expect(b.x + b.width).toBeLessThanOrEqual(vw.width + 1);
    expect(b.y + b.height).toBeLessThanOrEqual(vw.height + 1);
    await shot(page, info, name);
    await page.locator('.overlay .modal-head .btn').first().click();
    await expect(page.locator('.overlay')).toHaveCount(0);
  }
  // long-press a jar: the ingredient sheet shows its known effects
  const jar = page.locator('.jar[data-id="wild-silverleaf"]');
  await jar.click({ button: 'right' });
  await expect(page.locator('.overlay .modal')).toContainText('Vitality');
  await shot(page, info, 'ingredient-panel');
  await page.locator('.overlay .modal-head .btn').first().click();
  expect(errors).toEqual([]);
});
