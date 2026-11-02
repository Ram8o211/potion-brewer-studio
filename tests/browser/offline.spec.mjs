// The production build installs a service worker and keeps working with the
// network really gone: the test runs its own server and stops it before the
// offline phase (setOffline alone does not stop a worker's requests).
import { test, expect } from '@playwright/test';
import { watchErrors, startServer, precacheReport } from './helpers.mjs';

test('the built game loads and plays offline after the first visit', async ({ page }) => {
  const errors = watchErrors(page);
  const server = await startServer(['--root', 'dist'], 4177);
  try {
    await page.goto(server.url + 'index.html');
    await page.locator('[data-act=new-game]').waitFor();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 }).catch(() => page.reload());
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
    const pre = await precacheReport(page, 'sw.js');
    expect(pre.cacheNames.length, 'exactly one cache for this scope').toBe(1);
    expect(pre.missing, 'every precache file is cached').toEqual([]);
    expect(pre.htmlUsesBundle, 'cached index.html matches the current bundle').toBe(true);
  } finally {
    await server.stop();
  }
  // the server is gone: everything must come from the service worker's cache
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  await page.reload();
  await page.locator('[data-act=new-game]').waitFor();
  await page.click('[data-act=sandbox]');
  await page.locator('canvas.view-canvas').waitFor();
  await page.evaluate(() => { const l = window.__alchemist.screen; l.selectIngredient(l.state.world.roles.water); l.startPour(0, 20); });
  await page.waitForFunction(() => window.__alchemist.screen.sim.p.count > 0, null, { timeout: 15_000 });
  expect(errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to fetch|net::/.test(e))).toEqual([]);
});

test('the bundled Art Studio opens, draws and saves offline without writing a game save', async ({ page }) => {
  const errors = watchErrors(page), server = await startServer(['--root', 'dist'], 4178);
  try {
    await page.goto(server.url + 'index.html');
    await page.locator('[data-act=art-studio]').waitFor();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => page.reload());
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    const report = await precacheReport(page, 'sw.js'); expect(report.missing).toEqual([]);
  } finally { await server.stop(); }
  await page.reload(); await page.locator('[data-act=art-studio]').click();
  await page.locator('[data-screen=studio]').waitFor();
  await page.waitForFunction(() => !!window.__alchemist.screen.generated);
  const xy = await page.evaluate(() => { const s = window.__alchemist.screen, b = s.canvas.getBoundingClientRect(); return [b.left + s.origin[0] + 16.5 * s.zoom, b.top + s.origin[1] + 16.5 * s.zoom]; });
  await page.mouse.click(xy[0], xy[1]); await page.locator('[data-act=art-save]').click();
  await expect(page.locator('.art-status')).toContainText('Draft saved');
  expect(await page.evaluate(() => localStorage.getItem('alchemist-shop.save'))).toBeNull();
  await page.locator('[data-act=art-exit]').click(); await page.locator('[data-act=art-studio]').click();
  await page.waitForFunction(() => window.__alchemist.screen.component.layers[0].pixels.some((p) => p > 0));
  expect(errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to fetch|net::/.test(e))).toEqual([]);
});
