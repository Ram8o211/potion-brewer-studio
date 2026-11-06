// The core loop played through the real UI: dose buttons, stirring with a
// pointer (touch events on phone projects), the fire control, a trial in
// the Trials room, bottling, serving at the Counter — then the customer pays.
import { test, expect } from '@playwright/test';
import { watchErrors, shot, newGame, lab, drag, stirPath, pourDose, wholeSolids, crushInPot } from './helpers.mjs';

test('first commission: brew, test on a subject, bottle and serve', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: true, seed: 'first-brew-tour' });
  await page.click('[data-act=tutorial-next]');
  await page.waitForTimeout(200);
  await page.click('[data-act=tutorial-next]').catch(() => {});
  const roles = await lab(page, (l) => l.state.world.roles);
  const leaf = 'wild-silverleaf', sun = 'wild-sunthistle';
  const before = await lab(page, (l, id) => ({ coins: l.state.coins, rep: l.state.reputation, leaf: l.state.stock(id) }), leaf);
  // 125 ml of water, 50 ml of whole Silverleaf (healing with a frosty bite), 25 ml of Sunthistle to cancel the frost
  await pourDose(page, roles.water, [100, 25]);
  await pourDose(page, leaf, [50]);
  await pourDose(page, sun, [25]);
  expect(await lab(page, (l) => l.sim.p.count * 5)).toBe(200);
  expect(await lab(page, (l, id) => l.state.stock(id), leaf), 'poured herbs are charged to the inventory').toBe(before.leaf - 50);
  await shot(page, info, 'tutorial-poured');
  // the herbs went in whole: crush them with the pestle
  const whole = await wholeSolids(page);
  await crushInPot(page);
  expect(await wholeSolids(page), 'the pestle broke up the herbs').toBeLessThan(whole);
  // the order shows the healing effect as unknown before any trial
  await expect(page.locator('.req-chip.fx').first()).toContainText('?');
  // stir with the spoon
  await page.click('[data-act=tool-spoon]');
  const stir0 = await lab(page, (l) => l.sim.tool.stirDistance);
  await drag(page, await stirPath(page, 4, 160));
  expect(await lab(page, (l) => l.sim.tool.stirDistance), 'the spoon stirred the brew').toBeGreaterThan(stir0 + 5);
  await shot(page, info, 'tutorial-stirred');
  // heat to steep the herbs, hold a while, then let it settle warm
  await page.locator('input[aria-label="Fire and frost control"]').fill('90');
  await page.waitForFunction(() => {
    const p = window.__alchemist.screen.sim.p;
    let t = 0;
    for (let i = 0; i < p.count; i++) t += p.temp[i];
    return t / p.count > 56;
  }, null, { timeout: 60_000, polling: 250 });
  await page.locator('input[aria-label="Fire and frost control"]').fill('20');
  await lab(page, (l) => { l.speed = 4; });
  await page.waitForFunction(() => {
    const st = window.__alchemist.screen.state, sim = window.__alchemist.screen.sim;
    const leafLeft = sim.species.slotOf.get('wild-silverleaf');
    let f = 0;
    for (let i = 0; i < sim.p.count; i++) f += leafLeft === undefined ? 0 : sim.p.comp[i * sim.p.S + leafLeft];
    return f < 2 && !!st;
  }, null, { timeout: 90_000, polling: 500 });
  await lab(page, (l) => { l.speed = 1; });
  await page.locator('input[aria-label="Fire and frost control"]').fill('0');
  // Extraction happens after the initial stir. Mix the extracted liquid again
  // before drawing a tap sample, instead of testing a stratified bottom layer.
  await page.click('[data-act=tool-spoon]');
  await drag(page, await stirPath(page, 3, 100));
  await shot(page, info, 'tutorial-heated');
  // the trial: a real 10 ml dose leaves the cauldron and reveals vitality
  await page.click('[data-act=tab-trials]');
  await expect(page.locator('[data-act=test-rabbit]')).toBeVisible();
  const n0 = await lab(page, (l) => l.sim.p.count);
  await page.click('[data-act=test-rabbit]');
  await expect(page.locator('.trial-report .report')).toBeVisible();
  expect(await lab(page, (l) => l.sim.p.count), 'the dose was taken from the cauldron').toBe(n0 - 2);
  const rec = await lab(page, (l) => l.state.trials.records[0]);
  expect(rec.subjectId).toBe('rabbit');
  // one reading of a ~7 % brew: noisy (about ±30 % a dose, plus the rabbit's own bias) but plainly there
  expect(rec.values.vitality).toBeGreaterThan(1.5);
  expect(rec.values.love, 'the rabbit reports love too').toBeDefined();
  expect(rec.values.acidity, 'and acidity: a rabbit shows every effect').toBeDefined();
  await shot(page, info, 'trial');
  // back at the cauldron the healing requirement has a reading — met (✓) or, after a single noisy one, not yet settled (~)
  await page.click('[data-act=tab-brew]');
  await expect(page.locator('.req-chip.fx').first()).toContainText(/[✓~]/, { timeout: 5000 });
  // bottle the ordered quantity: the sealed vial goes to the counter
  await page.click('[data-act=bottle]');
  const orderMl = await lab(page, (l) => l.state.current.bottleMl);
  await page.click(`[data-act=bottle-${orderMl}]`);
  await expect(page.locator('[data-act=serve]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-act=serve]')).toBeEnabled();
  await shot(page, info, 'vial');
  // the batch was tested, so the bottle labelled itself (vitality tested) and shows it at once
  expect(await lab(page, (l) => l.state.vial.label && l.state.vial.label.claims.vitality.source)).toBe('trial');
  await expect(page.locator('.label-line').first()).toContainText('(tested');
  await page.click('[data-act=label]');
  await expect(page.locator('.label-rows')).toBeVisible();
  await expect(page.locator('.label-row.relevant .src.trial').first()).toBeVisible();
  await shot(page, info, 'label');
  await page.click('[data-act=label-seal]');
  // offer it: straight to the bargaining
  await page.click('[data-act=serve]');
  await expect(page.locator('.haggle-log')).toBeVisible();
  await shot(page, info, 'bargain');
  await page.click('[data-act=accept-offer]');
  await page.click('[data-act=haggle-done]');
  await expect(page.locator('[data-act=result-continue]')).toBeVisible({ timeout: 10_000 });
  await shot(page, info, 'tutorial-result');
  await page.fill('.overlay input[aria-label="Recipe name"]', 'Mabry\'s tonic');
  await page.click('[data-act=save-recipe]');
  await page.click('[data-act=result-continue]');
  await page.waitForTimeout(800);
  const result = await lab(page, (l) => ({ coins: l.state.coins, rep: l.state.reputation, served: l.state.stats.served, last: l.state.history[0], sale: l.state.sales[0], vial: l.state.vial }));
  expect(result.served).toBe(1);
  expect(result.vial).toBeNull();
  // how good it really was is known once the customer reports back
  expect(result.last.stars).toBeNull();
  expect(result.sale.stars).toBeGreaterThanOrEqual(3);
  expect(result.coins).toBeGreaterThan(before.coins);
  expect(result.rep).toBeGreaterThan(before.rep);
  expect(await lab(page, (l) => l.state.followUps.length), 'the customer will report back tomorrow').toBe(1);
  // the next customer arrives
  await page.waitForFunction(() => { const s = window.__alchemist.screen.state; return !!s.current && !s.current.tutorial; }, null, { timeout: 10_000 });
  // the saved recipe is in the book, marked tested, and can be prepared again (charging stock)
  await lab(page, (l) => { l.sim.clear(); l.state.brewLog = []; l.state.newBatch(); });
  const stock0 = await lab(page, (l, id) => l.state.stock(id), leaf);
  await page.click('[data-act=tab-book]');
  await page.click('[data-act=book-recipes]');
  await expect(page.locator('.view-book .item', { hasText: 'Mabry' })).toBeVisible();
  await expect(page.locator('.view-book .item', { hasText: 'Mabry' })).toContainText('Tested');
  await page.locator('.view-book [data-act=prepare]').first().click();
  await page.waitForFunction(() => window.__alchemist.screen.sim.p.count >= 40 && !window.__alchemist.screen.sim.emitter.pouring, null, { timeout: 30_000 });
  expect(await lab(page, (l) => l.sim.p.count * 5)).toBe(200);
  expect(await lab(page, (l, id) => l.state.stock(id), leaf)).toBe(stock0 - 50);
  // the recipe keeps its procedure: the book lists the steps, heating included
  await expect(page.locator('.view-book .item', { hasText: 'Mabry' }).locator('.recipe-steps li', { hasText: 'Heat to' }).first()).toBeAttached();
  // poured but not yet prepared the same way: the panel says so, and nothing is verified
  await lab(page, (l) => l.showView('brew'));
  await page.click('[data-act=brew-info]');
  await expect(page.locator('.brew-panel .recipe-partial')).toContainText('not yet prepared the same way');
  await expect(page.locator('.brew-panel')).toContainText('Verified nothing yet');
  expect(errors).toEqual([]);
});

test('a customer who insists on proof will not buy until the vial is tested; testing fills in the label', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'untested-serve-1' });
  // a simple healing order from a customer who wants trial evidence
  await lab(page, (l) => {
    const st = l.state;
    st.current = { ...st.current, requirements: [{ key: 'vitality', kind: 'min', target: 3, tol: 0, zero: 8, label: 'at least 3', effect: true }], effectOrder: true, bottleMl: 50, bottleN: 10,
      customer: { ...st.current.customer, persona: { haggle: 0.4, patience: 3, honesty: 1, proof: 0.95 } } };
    l.refreshCustomer();
    l.views.counter.refresh();
  });
  await pourDose(page, await lab(page, (l) => l.state.world.roles.water), [100]);
  await pourDose(page, 'wild-silverleaf', [50]);
  await crushInPot(page);
  // steeped warm, so one reading plainly shows the healing (a cold brew is too weak to be sure of)
  await lab(page, (l) => { l.setAutoStir(true); l.setFurnace(0.8); l.speed = 4; });
  await page.waitForFunction(() => { const p = window.__alchemist.screen.sim.p; let t = 0; for (let i = 0; i < p.count; i++) t += p.temp[i]; return t / p.count > 60; }, null, { timeout: 60_000, polling: 250 });
  await lab(page, (l) => l.setFurnace(0.1));
  await page.waitForTimeout(4000);
  await lab(page, (l) => { l.setFurnace(0); l.setAutoStir(false); l.speed = 1; });
  await page.click('[data-act=bottle]');
  await page.click('[data-act=bottle-50]');
  await expect(page.locator('[data-act=serve]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.vial-card')).toContainText('Not yet tested');
  await expect(page.locator('.vial-card')).toContainText('insists on proof');
  // label it on theory alone: the guild's estimate, never a hidden truth
  await page.click('[data-act=label]');
  await expect(page.locator('.label-row.relevant .src.est').first()).toBeVisible();
  expect(await page.locator('.label-row .src.trial').count(), 'nothing is marked tested before a trial').toBe(0);
  await page.click('[data-act=label-seal]');
  await page.click('[data-act=serve]');
  await expect(page.locator('.toast, .note-dock').last()).toContainText('wants proof');
  await expect(page.locator('.haggle-log')).toHaveCount(0);
  // test a dose of the sealed vial itself
  await page.click('[data-act=test-vial]');
  await expect(page.locator('[data-act=src-vial]')).toHaveClass(/active/);
  const ml0 = await lab(page, (l) => l.state.vial.ml);
  await page.click('[data-act=test-rabbit]');
  expect(await lab(page, (l) => l.state.vial.ml), 'the dose came out of the vial').toBe(ml0 - 10);
  await expect(page.locator('.reading[data-effect=vitality]')).toHaveAttribute('data-level', 'preliminary');
  await expect(page.locator('.reading[data-effect=vitality] .rv')).not.toContainText('±0 ');
  expect(await lab(page, (l) => l.state.vial.label.claims.vitality.source), 'the reading fills in the label').toBe('trial');
  await page.click('[data-act=tab-counter]');
  // one reading is not proof enough for this customer: they want it read on a second rabbit
  await page.click('[data-act=serve]');
  await expect(page.locator('.toast, .note-dock').last()).toContainText('second rabbit');
  await expect(page.locator('.haggle-log')).toHaveCount(0);
  await page.click('[data-act=test-vial]');
  await lab(page, (l) => { const st = l.state; const other = st.colony.rabbits.find((r) => r.alive && r.id !== st.colony.focus); st.selectRabbit(other.id); l.views.trials.refresh(); });
  await page.click('[data-act=test-rabbit]');
  expect(await lab(page, (l) => l.state.vial.label.claims.vitality.evidence.level), 'two rabbits corroborate the reading').toMatch(/corroborated|certified/);
  await page.click('[data-act=tab-counter]');
  await shot(page, info, 'vial-certified');
  await page.click('[data-act=serve]');
  await expect(page.locator('.haggle-log')).toBeVisible();
  // bargain one round, then take their improved offer
  await page.click('[data-act=ask-up]');
  await page.click('[data-act=ask-price]');
  await expect(page.locator('.haggle-log .line.you')).toHaveCount(1);
  if (await page.locator('[data-act=accept-offer]').isEnabled()) await page.click('[data-act=accept-offer]');
  await page.click('[data-act=haggle-done]');
  await expect(page.locator('[data-act=result-continue]')).toBeVisible({ timeout: 10_000 });
  await page.click('[data-act=result-continue]');
  expect(await lab(page, (l) => l.state.stats.served)).toBe(1);
  // the next day the customer comes back with their verdict
  const fu = await lab(page, (l) => { const st = l.state; st.current = null; st.customerIndex = st.customersPerDay; st.endDay(); l.views.counter.refresh(); return st.dueFollowUps().map((f) => f.kind); });
  if (fu.length) {
    await page.click('[data-act=tab-counter]');
    await expect(page.locator('.followup')).toBeVisible();
    await shot(page, info, 'follow-up');
  }
  expect(errors).toEqual([]);
});

test('tools switch and act on the brew', async ({ page }) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false });
  const roles = await lab(page, (l) => l.state.world.roles);
  await pourDose(page, roles.water, [100]);
  for (const t of ['spoon', 'probe']) {
    const btn = page.locator(`[data-act=tool-${t}]`);
    await btn.click();
    expect(await lab(page, (l) => l.tool)).toBe(t);
  }
  // pouring by holding inside the cauldron
  await page.click(`.jar[data-id="${roles.oil}"]`);
  expect(await lab(page, (l) => l.tool)).toBe('pour');
  const n0 = await lab(page, (l) => l.sim.p.count);
  const box = await page.locator('canvas.view-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  const touch = !!(await page.evaluate(() => navigator.maxTouchPoints));
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const pt = [{ x: box.x + box.width * 0.5, y: box.y + box.height * 0.4, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
    await page.waitForTimeout(900);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
  }
  await page.waitForTimeout(1500);
  const n1 = await lab(page, (l) => l.sim.p.count);
  expect(n1, 'holding in the cauldron pours').toBeGreaterThan(n0);
  // the measuring vial shows what the tap would draw — physical readings only
  await page.locator('[data-act=sample]:visible').first().click();
  await expect(page.locator('.overlay .modal', { hasText: 'Measuring vial' })).toBeVisible();
  await expect(page.locator('.overlay .modal')).toContainText('unknown');
  await page.locator('.overlay .modal-head .btn').first().click();
  // the lid toggles
  const lid0 = await lab(page, (l) => l.sim.cauldron.lidClosed);
  await page.locator('[data-act=lid]:visible').first().click();
  expect(await lab(page, (l) => l.sim.cauldron.lidClosed)).toBe(!lid0);
  expect(errors).toEqual([]);
});

test('drag a jar from the shelf onto the cauldron to pour; a root goes in whole and only the pestle crushes it', async ({ page }) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'drag-pour-2' });
  const roles = await lab(page, (l) => l.state.world.roles);
  const jar = await page.locator(`.jar[data-id="${roles.water}"]`).boundingBox();
  const cv = await page.locator('canvas.view-canvas').boundingBox();
  if (!jar || !cv) throw new Error('no boxes');
  const pts = [{ x: jar.x + jar.width / 2, y: jar.y + jar.height / 2 }];
  for (let k = 1; k <= 30; k++) pts.push({ x: jar.x + jar.width / 2 + (cv.x + cv.width / 2 - jar.x - jar.width / 2) * (k / 30), y: jar.y + jar.height / 2 + (cv.y + cv.height * 0.4 - jar.y - jar.height / 2) * (k / 30) });
  for (let k = 0; k < 16; k++) pts.push({ x: cv.x + cv.width / 2 + Math.sin(k / 6) * 10, y: cv.y + cv.height * 0.4 });
  await drag(page, pts, 20);
  await page.waitForTimeout(800);
  expect(await lab(page, (l) => l.sim.p.count), 'dragging the jar onto the cauldron poured it').toBeGreaterThan(3);
  // a wild root goes in whole: there is no grinding before the pour
  await lab(page, (l) => { l.state.inventory['wild-ironroot'] = 100; l.buildShelf(); });
  await page.click('.jar[data-id="wild-ironroot"]');
  await expect(page.locator('[data-act=ground]')).toHaveCount(0);
  await page.click('[data-act=dose-25]');
  await page.waitForFunction(() => !window.__alchemist.screen.sim.emitter.pouring);
  const before = await wholeSolids(page);
  expect(before, 'the root arrives whole').toBeGreaterThanOrEqual(4);
  expect(await lab(page, (l) => l.state.brewLog.some((e) => e.type === 'pour' && e.ground))).toBe(false);
  // the pestle breaks it up
  await crushInPot(page);
  expect(await wholeSolids(page), 'the pestle crushed the root').toBeLessThan(before);
  expect(errors).toEqual([]);
});
