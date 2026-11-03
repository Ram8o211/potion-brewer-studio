import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers.mjs';

const state = (page, fn) => page.evaluate(fn);
async function enter(page) {
  await page.goto('/?nosw'); await page.locator('[data-act=art-studio]').click();
  await expect(page.locator('[data-screen=studio]')).toBeVisible();
  await page.waitForFunction(() => window.__alchemist.screen.generated && window.__alchemist.screen.loaded);
}
async function drawPoint(page, x, y) {
  const p = await page.evaluate(([x, y]) => { const s = window.__alchemist.screen, b = s.canvas.getBoundingClientRect(); return { x: b.left + s.origin[0] + (x + 0.5) * s.zoom, y: b.top + s.origin[1] + (y + 0.5) * s.zoom }; }, [x, y]);
  await page.mouse.click(p.x, p.y);
}
async function named(page, selector, name) {
  await page.locator(selector).click(); const input = page.locator('.overlay input').last(); await input.fill(name);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
}

test('draw, extract, attach, vary, grow and recover an editable project without touching the shop', async ({ page }) => {
  const errors = watchErrors(page); await enter(page);
  const saveBefore = await page.evaluate(() => localStorage.getItem('alchemist-shop.save'));
  await named(page, '[data-act=art-new-asset]', 'Moon plant');
  await named(page, '[data-act=art-new-component]', 'Drawn moon leaf');
  await drawPoint(page, 14, 16); await drawPoint(page, 15, 16); await drawPoint(page, 15, 17);
  const pixels = await state(page, () => window.__alchemist.screen.component.layers[0].pixels.slice());
  expect(pixels.filter(Boolean).length).toBe(3);
  await page.locator('[data-act=art-undo]').click(); expect(await state(page, () => window.__alchemist.screen.component.layers[0].pixels.filter(Boolean).length)).toBe(2);
  await page.locator('[data-act=art-redo]').click(); expect(await state(page, () => window.__alchemist.screen.component.layers[0].pixels.filter(Boolean).length)).toBe(3);
  await page.locator('.art-tool-more > summary').click();
  await page.locator('[data-act=art-tool-contiguous]').click(); await drawPoint(page, 15, 16);
  await named(page, '[data-act=art-extract]', 'Reusable moon leaf');
  await page.locator('[data-act=art-attach]').click();
  await page.getByLabel('Count', { exact: true }).fill('4'); await page.getByLabel('Count', { exact: true }).press('Tab');
  await page.getByLabel('Angle variation', { exact: true }).fill('35'); await page.getByLabel('Angle variation', { exact: true }).press('Tab');
  expect(await state(page, () => window.__alchemist.screen.asset.nodes.at(-1).count)).toBe(4);
  await page.locator('[data-act=art-tab-growth]').click(); await page.locator('[data-act=art-stage-0]').click();
  await page.getByLabel('Sprout scale').fill('0.6'); await page.getByLabel('Sprout scale').press('Tab');
  await page.locator('[data-act=art-stage-1]').click(); await page.locator('[data-act=art-stage-2]').click();
  await page.locator('[data-act=art-tab-variants]').click(); await page.locator('[data-act=art-regenerate]').click();
  expect(await state(page, () => window.__alchemist.screen.asset.components.at(-1).layers[0].pixels.filter(Boolean).length)).toBe(3);
  await page.locator('[data-act=art-save]').click(); await expect(page.locator('.art-status')).toContainText('Draft saved');
  await page.locator('[data-act=art-exit]').click(); await page.locator('[data-act=art-studio]').click();
  await expect(page.getByLabel('Asset name', { exact: true })).toHaveValue('Untitled plant');
  await page.getByRole('button', { name: 'Moon plant', exact: true }).click();
  expect(await state(page, () => window.__alchemist.screen.asset.components.some((c) => c.name === 'Reusable moon leaf'))).toBe(true);
  expect(await state(page, () => window.__alchemist.screen.asset.stages[0])).toBe(0.6);
  expect(await page.evaluate(() => localStorage.getItem('alchemist-shop.save'))).toBe(saveBefore);
  expect(errors).toEqual([]);
});

test('project and transparent PNG export/import perform real round trips; invalid imports preserve work', async ({ page }) => {
  const errors = watchErrors(page); await enter(page); await drawPoint(page, 16, 15);
  const before = await state(page, () => JSON.stringify(window.__alchemist.screen.project.assets));
  await page.locator('.art-project-menu > summary').click();
  const exported = page.waitForEvent('download'); await page.locator('[data-act=art-export]').click(); const file = await exported; const path = await file.path();
  // Start from saved state to avoid an intentional unsaved-replacement dialog.
  await page.locator('[data-act=art-save]').click();
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(path);
  await expect(page.locator('.art-status')).toContainText('Project imported');
  expect(await state(page, () => JSON.stringify(window.__alchemist.screen.project.assets))).toBe(before);
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"potion-art-studio","version":999}') });
  await expect(page.locator('.art-status')).toContainText('unsupported version'); expect(await state(page, () => JSON.stringify(window.__alchemist.screen.project.assets))).toBe(before);
  await page.locator('[data-editor-group="component-layers"] > summary').click();
  const image = page.waitForEvent('download'); await page.locator('[data-act=art-export-png]').click(); const png = await image; const pngPath = await png.path();
  await page.locator('input[type=file][accept="image/png"]').setInputFiles({ name: png.suggestedFilename(), mimeType: 'image/png', buffer: await readFile(pngPath) });
  await expect.poll(() => state(page, () => window.__alchemist.screen.component.layers.length)).toBe(2);
  expect(errors).toEqual([]);
});

test('art preview is temporary, apply persists, revert restores original generators and legacy saves stay readable', async ({ page }) => {
  const errors = watchErrors(page); await enter(page);
  // Capture a genuine existing-format game save using the game's own persistence path.
  await page.locator('[data-act=art-exit]').click(); await page.locator('[data-act=new-game]').click();
  await page.getByLabel('Guided tour').uncheck(); await page.getByLabel('World seed').fill('studio-legacy'); await page.locator('[data-act=start-game]').click();
  await page.waitForFunction(() => window.__alchemist.screen.state?.seed === 'studio-legacy');
  await page.evaluate(() => window.__alchemist.showMenu());
  const saved = await page.evaluate(() => ({ ...localStorage }));
  await page.locator('[data-act=art-studio]').click();
  await page.getByText('Game art direction — ingredient ramps', { exact: true }).click();
  await page.getByLabel('Tint strength', { exact: true }).fill('0.8'); await page.getByLabel('Tint strength', { exact: true }).press('Tab');
  await page.locator('[data-act=art-preview]').click(); await expect(page.locator('[data-act=art-return]')).toBeVisible();
  await page.locator('[data-act=art-return]').click(); await expect(page.locator('[data-screen=studio]')).toBeVisible();
  expect(await page.evaluate((snapshot) => Object.keys(snapshot).every((k) => localStorage.getItem(k) === snapshot[k]), saved)).toBe(true);
  await page.locator('.art-project-menu > summary').click();
  await page.locator('[data-act=art-apply]').click(); await expect(page.locator('.art-status')).toContainText('Art profile applied');
  await page.reload(); await page.locator('[data-act=continue]').click(); await page.waitForFunction(() => window.__alchemist.screen.state?.seed === 'studio-legacy');
  await page.evaluate(() => window.__alchemist.showMenu()); await page.locator('[data-act=art-studio]').click(); await page.locator('.art-project-menu > summary').click(); await page.locator('[data-act=art-revert]').click();
  await expect(page.locator('.art-status')).toContainText('Original game visuals restored'); expect(errors).toEqual([]);
});

test('zoomed coordinates, cancelled gestures and hidden layouts remain reliable', async ({ page }) => {
  await enter(page); await named(page, '[data-act=art-new-component]', 'Coordinate fixture');
  // Zoom around the image centre through the actual wheel event.
  const canvas = page.locator('.art-canvas'), b = await canvas.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, -300);
  await page.waitForTimeout(80); await drawPoint(page, 16, 16);
  expect(await state(page, () => window.__alchemist.screen.component.layers[0].pixels[16 * 32 + 16] >>> 24)).toBe(255);
  const painted = await state(page, () => window.__alchemist.screen.component.layers[0].pixels.slice());
  await page.locator('[data-act=art-tool-eraser]').click(); await drawPoint(page, 16, 16);
  expect(await state(page, () => window.__alchemist.screen.component.layers[0].pixels[16 * 32 + 16])).toBe(-1);
  await page.locator('[data-act=art-undo]').click(); expect(await state(page, () => window.__alchemist.screen.component.layers[0].pixels.slice())).toEqual(painted);
  // Pointer cancellation must not leave a half-committed brush stroke.
  const pos = await page.evaluate(() => { const s = window.__alchemist.screen, b = s.canvas.getBoundingClientRect(); return { x: b.left + s.origin[0] + 16.5 * s.zoom, y: b.top + s.origin[1] + 16.5 * s.zoom }; });
  await page.mouse.move(pos.x, pos.y); await page.mouse.down();
  await canvas.dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up();
  expect(await state(page, () => window.__alchemist.screen.component.layers[0].pixels.slice())).toEqual(painted);
  await page.locator('[data-act=art-toggle-library]').click(); await expect(page.locator('.art-library')).toBeHidden();
  await page.locator('[data-act=art-save]').click(); await page.reload(); await page.locator('[data-act=art-studio]').click();
  await expect(page.locator('.art-library')).toBeHidden(); await page.locator('[data-act=art-toggle-library]').click(); await expect(page.locator('.art-library')).toBeVisible();
});


test('component editor keeps the drawing workflow visible and advanced groups optional', async ({ page }) => {
  const errors = watchErrors(page);
  await enter(page);
  await expect(page.getByLabel('Asset name', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Paint color', { exact: true })).toBeVisible();
  await expect(page.locator('.art-tool-more > summary')).toBeVisible();
  await expect(page.getByLabel('Shape 1', { exact: true })).toBeHidden();
  const advancedShapes = page.locator('[data-editor-group="component-shapes"]');
  await advancedShapes.locator('summary').click();
  await expect(page.getByLabel('Shape 1', { exact: true })).toBeVisible();
  await page.getByLabel('Shape 1', { exact: true }).selectOption('ellipse');
  await expect(advancedShapes).toHaveAttribute('open', '');
  await expect(page.getByLabel('Shape 1', { exact: true })).toHaveValue('ellipse');
  await expect(page.getByLabel('Category', { exact: true })).toBeHidden();
  await page.locator('[data-editor-group="component-meta"] > summary').click();
  await expect(page.getByLabel('Category', { exact: true })).toBeVisible();
  await page.locator('[data-act=art-help]').click();
  await expect(page.getByRole('dialog', { name: 'Art Studio guide' })).toContainText('Draw a component');
  expect(errors).toEqual([]);
});
