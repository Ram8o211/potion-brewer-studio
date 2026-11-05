import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers.mjs';

test('menu trips release the previous shop screens and their canvas observers', async ({ page }) => {
  const errors = watchErrors(page);
  // Locators avoid inspector-held ElementHandles distorting object lifetime.
  await page.goto('/index.html?nosw');
  await page.locator('[data-act=sandbox]').click();
  await page.locator('canvas.view-canvas').waitFor();
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__alchemist.showMenu());
    await page.click('[data-act=sandbox]');
    await page.locator('canvas.view-canvas').waitFor();
  }
  const cdp = await page.context().newCDPSession(page), group = 'screen-lifetime-check';
  try {
    await cdp.send('HeapProfiler.collectGarbage');
    const proto = await cdp.send('Runtime.evaluate', { expression: 'window.__alchemist.screen.constructor.prototype', objectGroup: group });
    const objects = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId, objectGroup: group });
    const count = await cdp.send('Runtime.callFunctionOn', { objectId: objects.objects.objectId,
      functionDeclaration: 'function() { return this.length; }', returnByValue: true });
    expect(count.result.value, 'only the current LabScreen remains reachable after GC').toBe(1);
  } finally { await cdp.send('Runtime.releaseObjectGroup', { objectGroup: group }); }
  expect(errors).toEqual([]);
});
