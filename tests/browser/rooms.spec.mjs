// The Wilds and the Trials room through real input: harvesting a mature
// plant fills the stores and leaves nothing on the ground, a dragged
// dropper doses a subject, a spent subject is replaced for coins, and all
// of it survives a reload.
import { test, expect } from '@playwright/test';
import { NE } from '../../src/alchemy/effects.js';
import { watchErrors, shot, newGame, lab, drag, pourDose, crushInPot } from './helpers.mjs';

test('harvesting a mature plant fills the stores and leaves nothing behind; growing ones cannot be taken', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'gather-seed-1' });
  await page.click('[data-act=tab-wilds]');
  // (no wild rabbits hopping in front of the plants these taps are aimed at)
  await lab(page, (l) => { l.views.wilds.wildlife = false; });
  // (the whole region in view: taps below are aimed from the scene's own coordinates)
  await lab(page, (l) => l.views.wilds.setZoom(1));
  await expect(page.locator('.view-wilds canvas.scene')).toBeVisible();
  const dep = await lab(page, (l) => l.state.deposits.find((d) => d.region === 'forest' && d.rank === 0));
  const before = await lab(page, (l, id) => l.state.stock(id), dep.materialId);
  // the list holds only what has been gathered before: the first find of an ingredient adds it
  expect(await page.locator(`[data-act="gather-${dep.id}"]`).count(), 'an ingredient never gathered is not listed').toBe(0);
  await lab(page, (l, id) => { l.state.found[id] = 1; l.views.wilds.refresh(); }, dep.materialId);
  // the button names the method and the yield (which depends on tool, hour and weather)
  const label = await page.locator(`[data-act="gather-${dep.id}"]`).innerText();
  const promised = Number(/\+(\d+) ml/.exec(label)?.[1]);
  expect(promised).toBeGreaterThan(0);
  await page.click(`[data-act="gather-${dep.id}"]`);
  const after = await lab(page, (l, id) => l.state.stock(id), dep.materialId);
  expect(after, 'gathered what the button promised').toBe(before + promised);
  const node = await lab(page, (l, id) => l.state.gathering.nodes[id], dep.id);
  expect(node.plants.length, 'one plant was taken').toBe(dep.slots - 1);
  expect(node.due, 'finite wild specimens do not sprout again').toBeNull();
  expect(await lab(page, (l) => l.state.gathering.marks), 'it left no mark on the ground').toBeUndefined();
  // buying the Forager's Kit raises the yield of everything that is not simply picked
  const tool = await lab(page, (l, id) => { const m = l.state.lookup(id); return m.wild.gather; }, dep.materialId);
  if (tool !== 'pick') {
    await lab(page, (l) => { l.state.coins += 80; l.state.buyEquipment('kit'); l.views.wilds.refresh(); });
    const label2 = await page.locator(`[data-act="gather-${dep.id}"]`).innerText();
    expect(Number(/\+(\d+) ml/.exec(label2)?.[1])).toBe(promised * 2);
  }
  // careful or thorough
  await page.click('[data-act=harvest-thorough]');
  await expect(page.locator('[data-act=harvest-thorough]')).toHaveClass(/active/);
  await page.click('[data-act=harvest-careful]');
  // tapping a mature plant in the scene harvests it
  await page.locator('.view-wilds canvas.scene').scrollIntoViewIfNeeded();
  const cv = await page.locator('.view-wilds canvas.scene').boundingBox();
  if (!cv) throw new Error('no scene');
  // (each plant stands where the scene's ground put it, clear of the scenery)
  await page.waitForFunction(() => !!window.__alchemist.screen.views.wilds.bg);
  await lab(page, (l) => l.views.wilds.grow());
  // (each plant's middle: a fruit hangs below its hold, a flower stands above its foot)
  const field = await lab(page, (l) => l.views.wilds.field.map((p) => { const f = l.views.wilds.frameOf(p); return { id: p.id, dep: p.dep.id, materialId: p.dep.materialId, x: p.x, y: p.y, stage: p.stage, closed: !!l.views.wilds.closed[p.dep.id], fused: l.views.wilds.fused(p), mx: p.x * 384 - f.ax + f.w / 2, my: p.y * 216 - f.ay + f.h / 2 }; }));
  const tapAt = (p) => ({ x: cv.x + p.mx / 384 * cv.width, y: cv.y + p.my / 216 * cv.height });
  // (one open now: a dawn or dusk flower out of its hour stays shut and only bends; a crystal is struck free, not shaken)
  const ripe = field.find((p) => p.stage === 'mature' && !p.closed && !p.fused && p.dep !== dep.id);
  const s0 = await lab(page, (l, id) => l.state.stock(id), ripe.materialId);
  expect(await page.locator(`[data-deposit="${ripe.dep}"]`).count(), 'its ingredient is not yet listed').toBe(0);
  // sliding a finger across it shakes it: what it bears falls to the ground, and a tap there gathers it
  // (kept within the scene where the plant grows by an edge)
  const a = tapAt(ripe), ax = Math.max(cv.x + 16, Math.min(cv.x + cv.width - 16, a.x));
  await drag(page, [{ x: ax - 14, y: a.y }, { x: ax + 14, y: a.y }], 6);
  await drag(page, [{ x: ax + 14, y: a.y }, { x: ax - 14, y: a.y }], 6);
  await page.waitForFunction((id) => { const it = window.__alchemist.screen.views.wilds.fallen[id]; return it && it.landed; }, ripe.id);
  expect(await lab(page, (l, id) => l.state.stock(id), ripe.materialId), 'shaken, not yet gathered').toBe(s0);
  const it = await lab(page, (l, id) => l.views.wilds.itemCentre(id), ripe.id);
  const sw = await page.evaluate(() => /** @type {HTMLCanvasElement} */ (document.querySelector('.view-wilds canvas.scene')).width);
  await drag(page, [{ x: cv.x + it.x / sw * cv.width, y: cv.y + it.y / 216 * cv.height }, { x: cv.x + it.x / sw * cv.width, y: cv.y + it.y / 216 * cv.height }], 30);
  expect(await lab(page, (l, id) => l.state.stock(id), ripe.materialId), 'tapping the fallen plant gathered').toBeGreaterThan(s0);
  expect(await page.locator(`[data-deposit="${ripe.dep}"]`).count(), 'and its ingredient is listed from now on').toBe(1);
  expect(await lab(page, (l, id) => l.views.wilds.field.some((p) => p.id === id), ripe.id), 'and it is gone from the ground').toBe(false);
  await shot(page, info, 'wilds-gathered');
  // a plant still growing cannot be taken
  // (the youngest plant, a fresh sprout where there is one)
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  const total = await lab(page, (l) => l.state.gathering.total);
  const young = await lab(page, (l) => {
    const w = l.views.wilds;
    w.grow();
    const p = w.field.filter((q) => q.stage !== 'mature').sort((a, b) => b.born - a.born)[0];
    if (p) w.gather(p.dep, p);
    return !!p;
  });
  if (young) {
    await expect(page.locator('.toast, .note-dock', { hasText: 'Not ripe yet' })).toBeVisible();
    expect(await lab(page, (l) => l.state.gathering.total)).toBe(total);
  }
  // Whisperwood is generated from the world seed; only plants take taps — a
  // tap on the sky or canopy gathers nothing
  const scenery = await lab(page, (l) => JSON.stringify(l.state.gathering.nodes));
  for (const fx of [0.1, 0.5, 0.9]) await page.mouse.click(cv.x + cv.width * fx, cv.y + cv.height * 0.06);
  expect(await lab(page, (l) => JSON.stringify(l.state.gathering.nodes)), 'scenery is not gatherable').toBe(scenery);
  // a deposit beyond the guild rank grows nothing in the scene (its card says what opens it)
  const far = await lab(page, (l) => l.state.deposits.find((d) => d.region === 'forest' && d.rank > 0));
  if (far) expect(await lab(page, (l, id) => l.views.wilds.field.some((p) => p.dep.id === id), far.id)).toBe(false);
  // pointing at a mature plant highlights it
  if (info.project.name === 'desktop') {
    const p3 = await lab(page, (l) => { const p = l.views.wilds.field.find((q) => q.stage === 'mature'), f = p && l.views.wilds.frameOf(p); return p && { id: p.id, mx: p.x * 384 - f.ax + f.w / 2, my: p.y * 216 - f.ay + f.h / 2 }; });
    if (p3) {
      await page.mouse.move(tapAt(p3).x, tapAt(p3).y);
      await expect.poll(() => lab(page, (l) => l.views.wilds.hover)).toBe(p3.id);
    }
  }
  // An earned first-sale milestone opens the meadow; it is locked beforehand.
  await lab(page, (l) => { l.state.stats.served = 1; l.views.wilds.refresh(); });
  // the Sunlit Meadow grows its own plants, tapped the same way; their cards show the plant's icon
  await page.click('[data-act=region-meadow]');
  await page.waitForFunction(() => { const w = window.__alchemist.screen.views.wilds; return w.region === 'meadow' && !!w.bg; });
  await lab(page, (l) => l.views.wilds.grow());
  const m0 = await lab(page, (l) => { const p = l.views.wilds.field.find((q) => q.stage === 'mature' && !l.views.wilds.closed[q.dep.id] && !l.views.wilds.fused(q)), f = l.views.wilds.frameOf(p); return { id: p.id, materialId: p.dep.materialId, mx: p.x * 384 - f.ax + f.w / 2, my: p.y * 216 - f.ay + f.h / 2 }; });
  const ms0 = await lab(page, (l, id) => l.state.stock(id), m0.materialId);
  // (the page may have moved with the new region's cards)
  await page.locator('.view-wilds canvas.scene').scrollIntoViewIfNeeded();
  Object.assign(cv, await page.locator('.view-wilds canvas.scene').boundingBox());
  // a tap shakes it loose, a second tap on what fell gathers it
  await drag(page, [tapAt(m0), tapAt(m0)], 30);
  // (where it has come to rest)
  await page.waitForFunction((id) => { const it = window.__alchemist.screen.views.wilds.fallen[id]; return it && it.landed; }, m0.id);
  const it0 = await lab(page, (l, id) => l.views.wilds.itemCentre(id), m0.id);
  const sw0 = await page.evaluate(() => /** @type {HTMLCanvasElement} */ (document.querySelector('.view-wilds canvas.scene')).width);
  const t0 = { x: cv.x + it0.x / sw0 * cv.width, y: cv.y + it0.y / 216 * cv.height };
  await drag(page, [t0, t0], 30);
  expect(await lab(page, (l, id) => l.state.stock(id), m0.materialId), 'tapping a meadow plant gathered').toBeGreaterThan(ms0);
  // a card shows the ingredient as it grows in the wilds — the same picture as its jar on the shelf
  const same = await page.evaluate((id) => {
    const lab = /** @type {any} */ (window).__alchemist.screen, dep = lab.state.deposits.find((d) => d.materialId === id);
    const a = /** @type {HTMLCanvasElement|null} */ (document.querySelector(`.view-wilds .deposit[data-deposit="${dep.id}"] canvas`));
    const b = /** @type {HTMLCanvasElement|null} */ (document.querySelector(`.jar[data-id="${id}"] canvas`));
    return !!a && !!b && a.width === a.height && a.toDataURL() === b.toDataURL();
  }, m0.materialId);
  expect(same, 'the card and the shelf show the same picture of it').toBe(true);
  // (the screenshot without the toasts of the first gathering over the scene)
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await shot(page, info, 'wilds-meadow');
  // a magical region is closed to an apprentice
  await page.click('[data-act=region-moonfen]');
  await expect(page.locator('.toast, .note-dock', { hasText: 'Moonfen' })).toBeVisible();
  // the gathered herb is on the shelf
  await page.click('[data-act=tab-brew]');
  await expect(page.locator(`.jar[data-id="${dep.materialId}"]`)).toBeVisible();
  // and the plants survive a reload
  await lab(page, (l) => l.save());
  await page.reload();
  await page.click('[data-act=continue]');
  await page.waitForSelector('canvas.view-canvas');
  const back = await lab(page, (l, id) => l.state.gathering.nodes[id], dep.id);
  expect(back.plants).toEqual(node.plants);
  expect(errors).toEqual([]);
});

test('the dropper doses a rabbit on the farm; a dead one is replaced for coins; trials persist', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'trial-room-1' });
  const roles = await lab(page, (l) => l.state.world.roles);
  await pourDose(page, roles.water, [100]);
  await pourDose(page, 'wild-emberbark', [100]);
  await crushInPot(page);
  // steep the bark (it gives up its fire only when warm), so one reading plainly shows it
  await lab(page, (l) => { l.setAutoStir(true); l.setFurnace(0.8); l.speed = 4; });
  await page.waitForFunction(() => { const p = window.__alchemist.screen.sim.p; let t = 0; for (let i = 0; i < p.count; i++) t += p.temp[i]; return t / p.count > 62; }, null, { timeout: 60_000, polling: 250 });
  await page.waitForTimeout(3000);
  await lab(page, (l) => { l.setFurnace(0); l.setAutoStir(false); l.speed = 1; });
  await page.click('[data-act=tab-trials]');
  await expect(page.locator('[data-subject=beetle]')).toHaveCount(0);
  await expect(page.locator('.status-bars .sb')).toHaveCount(NE + 1);
  // drag the dropper onto Bramble's tile (the dose bar sits right above the roster)
  await page.locator('.dose-bar').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const from = await page.locator('.dropper').boundingBox();
  const to = await page.locator('.rabbit-tile[data-rabbit=r2] canvas').boundingBox();
  if (!from || !to) throw new Error('no boxes');
  const pts = [];
  for (let k = 0; k <= 20; k++) pts.push({ x: from.x + 20 + (to.x + to.width / 2 - from.x - 20) * (k / 20), y: from.y + 20 + (to.y + to.height / 2 - from.y - 20) * (k / 20) });
  await drag(page, pts, 20);
  await expect(page.locator('.trial-report .report').first()).toContainText('Bramble');
  const rec = await lab(page, (l) => l.state.trials.records[0]);
  expect(rec.subjectId).toBe('rabbit');
  expect(rec.revealed.length, 'a rabbit shows every effect').toBe(NE);
  expect(rec.values.fire, 'the rabbit shows fire (a single reading is noisy)').toBeGreaterThan(0);
  // the room's batch estimate updates at once
  await expect(page.locator('.view-trials')).not.toContainText('nothing tested yet');
  await expect(page.locator('.estimate-card .reading-rows')).toBeVisible();
  await shot(page, info, 'trial-farm');
  // a dead rabbit is replaced for its price
  await lab(page, (l) => { l.state.trials.subjects.rabbit.alive = false; l.state.trials.subjects.rabbit.health = 0; l.views.trials.refresh(); });
  await expect(page.locator('[data-act=test-rabbit]')).toHaveCount(0);
  const c0 = await lab(page, (l) => l.state.coins);
  await page.click('[data-act=replace-rabbit]');
  expect(await lab(page, (l) => l.state.coins)).toBe(c0 - 6);
  await expect(page.locator('[data-act=test-rabbit]')).toBeEnabled();
  // the trial log is in the book and survives a reload
  await lab(page, (l) => l.save());
  await page.reload();
  await page.click('[data-act=continue]');
  await page.waitForSelector('canvas.view-canvas');
  await page.click('[data-act=tab-book]');
  await page.click('[data-act=book-trials]');
  await expect(page.locator('.view-book .item', { hasText: 'Bramble' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('watering belongs to the garden; Water all updates crop moisture and survives reload', async ({ page }, info) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false, seed: 'garden-water-controls' });
  await page.click('[data-act=tab-wilds]');
  await expect(page.locator('[data-act=mode-water]')).toHaveCount(0);
  const dep = await lab(page, (l) => { l.state.found['wild-silverleaf'] = 1; l.views.wilds.refresh(); return l.state.deposits.find((d) => d.materialId === 'wild-silverleaf').id; });
  await page.locator(`[data-act="gather-${dep}"]`).click();
  await page.click('[data-act=tab-garden]');
  await page.selectOption('[data-act=garden-seed]', 'wild-silverleaf');
  await page.click('[data-act=garden-plant]');
  const before = await lab(page, (l) => l.state.garden.plots[0].crop.w);
  await page.click('[data-act=garden-water-all]');
  const watered = await lab(page, (l) => l.state.garden.plots[0].crop.w);
  expect(watered).toBeGreaterThan(before + 0.3);
  await expect(page.locator('.garden-plot.selected')).toHaveAttribute('data-moisture', 'wet');
  await shot(page, info, 'garden-watered');
  await page.reload(); await page.click('[data-act=continue]'); await page.waitForSelector('canvas.view-canvas');
  expect(await lab(page, (l) => l.state.garden.plots[0].crop.w)).toBeCloseTo(watered, 2);
  expect(errors).toEqual([]);
});
