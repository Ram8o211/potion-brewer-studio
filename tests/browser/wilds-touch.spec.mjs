// The wilds by touch, in the Free Experiment: a swipe shakes a ripe plant's
// ingredient loose, which falls as the very pixels it grew as; a tap (even a
// wobbly fingertip's) gathers it; the plant is gone and its stand sprouts
// again at random spots; and a finger dragged in watering mode waters every
// growing plant along its path.
import { test, expect } from '@playwright/test';
import { watchErrors, shot, startSandbox, newGame, lab, drag } from './helpers.mjs';

test('sandbox wilds: shake, gather by tap, regrow at random spots; watering stays in the garden', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startSandbox(page);
  await page.click('[data-act=tab-wilds]');
  // (no wild rabbits hopping in front of the plants these taps are aimed at)
  await lab(page, (l) => { l.views.wilds.wildlife = false; });
  // (the whole region in view: taps below are aimed from the scene's own coordinates)
  await lab(page, (l) => l.views.wilds.setZoom(1));
  await page.click('[data-act=region-meadow]');
  await page.waitForFunction(() => { const w = window.__alchemist.screen.views.wilds; return w.region === 'meadow' && !!w.bg; });
  await lab(page, (l) => l.views.wilds.grow());
  // every plant of the Free Experiment's wilds stands grown
  const field = await lab(page, (l) => l.views.wilds.field.map((p) => ({ id: p.id, dep: p.dep.id, x: p.x, y: p.y, stage: p.stage, mount: p.mount || 'ground', fused: l.views.wilds.fused(p) })));
  expect(field.length).toBeGreaterThan(2);
  expect(field.every((p) => p.stage === 'mature'), 'every plant is grown').toBe(true);
  await page.locator('.view-wilds canvas.scene').scrollIntoViewIfNeeded();
  const cv = await page.locator('.view-wilds canvas.scene').boundingBox();
  if (!cv) throw new Error('no scene');
  const H = 216, W = await page.evaluate(() => /** @type {HTMLCanvasElement} */ (document.querySelector('.view-wilds canvas.scene')).width);
  const at = (x, y) => ({ x: cv.x + x / W * cv.width, y: cv.y + y / H * cv.height });
  // a ripe plant on the ground, shaken by a single fast swipe across it
  const ripe = field.find((p) => p.mount === 'ground' && !p.fused) || field.find((p) => !p.fused) || field[0];
  const mid = await lab(page, (l, id) => { const w = l.views.wilds, p = w.field.find((q) => q.id === id), f = w.frameOf(p); return { x: p.x * 384 - f.ax + f.w / 2, y: p.y * 216 - f.ay + f.h / 2 }; }, ripe.id);
  // (a stroke across it and back, kept within the scene where it grows by an edge)
  const sx = Math.max(32, Math.min(W - 32, mid.x)), pts = [];
  for (let k = 0; k <= 8; k++) pts.push(at(sx - 30 + k * 7.5, mid.y));
  for (let k = 0; k <= 8; k++) pts.push(at(sx + 30 - k * 7.5, mid.y));
  await drag(page, pts, 12);
  await page.waitForFunction((id) => { const it = window.__alchemist.screen.views.wilds.fallen[id]; return it && it.landed; }, ripe.id);
  // it falls as a ragdoll cut from the very sprite it grew as: what lies on the ground shows its own pixels, turned but never resampled
  await page.waitForTimeout(400);
  const same = await page.evaluate(async (id) => {
    const S = await import(new URL('src/rendering/species-sprites.js', document.baseURI).href);
    const w = window.__alchemist.screen.views.wilds, it = w.fallen[id], sp = it.sp, p = w.field.find((q) => q.id === id);
    const opaque = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, out = []; for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 255) out.push((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return out; };
    // the body is the plant's own sprite, cut down to what shows of it
    const grown = S.plantCanvas(p.m, p.stage, { ...w.look(p), hover: false });
    const mine = opaque(sp.cv), theirs = opaque(grown.cv);
    const own = new Set(mine);
    const b = it.doll.box(1), x0 = Math.max(0, Math.floor(b.x0)), y0 = Math.max(0, Math.floor(b.y0));
    const dst = w.ctx.getImageData(x0, y0, Math.max(1, Math.ceil(b.x1) - x0), Math.max(1, Math.ceil(b.y1) - y0)).data;
    let found = 0;
    for (let i = 0; i < dst.length; i += 4) if (own.has((dst[i] << 16) | (dst[i + 1] << 8) | dst[i + 2])) found++;
    // (fallen bodies pass in front of one another: another lying over this one would hide it)
    const covered = Object.entries(w.fallen).some(([k, o]) => { if (k === id) return false; const c = o.doll.box(1); return c.x0 < b.x1 && c.x1 > b.x0 && c.y0 < b.y1 && c.y1 > b.y0; });
    return { n: mine.length, grown: theirs.length, same: mine.join() === theirs.join(), found, covered, pieces: it.doll.len.length };
  }, ripe.id);
  expect(same.n).toBeGreaterThan(10);
  expect(same.same, 'the fallen body is the plant’s own sprite, pixel for pixel, not a shrunken icon').toBe(true);
  // (turned to any angle, a piece shows each of its pixels once, a few twice or not at all; resampled, its exact colours would be all but gone)
  if (!same.covered) expect(same.found / same.n, 'and it is drawn with its own colours as it lies').toBeGreaterThan(0.55);
  // the finger sets the scenery's hanging strands swinging (the trees and bushes behind stay put)
  const leaves = await page.evaluate(async () => {
    const S = await import(new URL('src/rendering/wild-scene.js', document.baseURI).href);
    const st = window.__alchemist.screen.state, t = S.sceneTouch('meadow', st.seed);
    if (!t) return null;
    const ys = [];
    for (let g = 0; g < t.G; g++) if (t.hang[g] > 0) ys.push((t.box[g * 4 + 1] + t.box[g * 4 + 3]) / 2);
    return ys.length ? ys[Math.floor(ys.length / 2)] : null;
  });
  if (leaves !== null) {
    const row = [];
    for (let k = 0; k <= 24; k++) row.push(at(4 + k * (W - 8) / 24, leaves));
    await drag(page, row, 12);
    const moving = await page.evaluate(async () => {
      const S = await import(new URL('src/rendering/wild-scene.js', document.baseURI).href);
      const t = S.sceneTouch('meadow', window.__alchemist.screen.state.seed);
      let n = 0;
      for (let g = 0; g < t.G; g++) if (t.moving(g)) n++;
      return n;
    });
    expect(moving, 'the strands the finger went through are swinging').toBeGreaterThan(0);
    expect(await page.evaluate(async () => {
      const S = await import(new URL('src/rendering/wild-scene.js', document.baseURI).href);
      const t = S.sceneTouch('meadow', window.__alchemist.screen.state.seed);
      let n = 0;
      for (let g = 0; g < t.G; g++) if (!(t.hang[g] > 0) && t.moving(g)) n++;
      return n;
    }), 'no tree or bush was moved').toBe(0);
  }
  // (and whatever it knocked along has come to rest again)
  await page.waitForFunction((id) => { const it = window.__alchemist.screen.views.wilds.fallen[id]; return it && it.landed; }, ripe.id);
  // nothing that fell is anywhere in the terrain
  expect(await lab(page, (l) => { const w = l.views.wilds; return Object.values(w.fallen).filter((it) => it.doll.overlaps((x, y) => w.solidAt(x, y))).length; }), 'no fallen body overlaps the terrain').toBe(0);
  await shot(page, info, 'sandbox-wilds-fallen');
  // a fingertip that rolls a little is still a tap: it gathers what fell
  const it = await lab(page, (l, id) => l.views.wilds.itemCentre(id), ripe.id);
  const t = at(it.x, it.y), touch = !!info.project.use.hasTouch, wob = touch ? 4 : 1.5;
  await drag(page, [t, { x: t.x + wob, y: t.y + wob * 0.75 }, { x: t.x + wob * 1.8, y: t.y + wob * 0.5 }], 30);
  await expect.poll(() => lab(page, (l, id) => l.views.wilds.field.some((p) => p.id === id), ripe.id), { message: 'gathered: the plant is gone' }).toBe(false);
  // the stand sprouts again, at a spot of its own, and grows back within minutes
  const regrow = await page.evaluate(async ([depId, gone]) => {
    const G = await import(new URL('src/game/gathering.js', document.baseURI).href);
    const st = window.__alchemist.screen.state, d = st.deposits.find((x) => x.id === depId), now = Date.now();
    const s0 = G.depositStatus(st.gathering, d, now), s1 = G.depositStatus(st.gathering, d, now + d.spawnMs + 1);
    const s2 = G.depositStatus(st.gathering, d, now + d.spawnMs + d.growMs * 6);
    const fresh = s1.plants.find((p) => !s0.plants.some((q) => q.id === p.id));
    return { slots: d.slots, n0: s0.plants.length, n1: s1.plants.length, fresh: fresh && { stage: fresh.stage, id: fresh.id }, grown: s2.mature, gone: s1.plants.some((p) => p.id === gone), minutes: (d.spawnMs + d.growMs) / 60000 };
  }, [ripe.dep, ripe.id]);
  expect(regrow.n0).toBe(regrow.slots - 1);
  expect(regrow.n1, 'a new sprout came up').toBe(regrow.slots);
  expect(regrow.fresh && regrow.fresh.stage).toBe('sprout');
  expect(regrow.gone).toBe(false);
  expect(regrow.grown).toBe(regrow.slots);
  expect(regrow.minutes).toBeLessThan(6);
  // watering: a finger dragged across the scene waters every growing plant on its path
  const dep = await lab(page, (l) => {
    const st = l.state, d = st.deposits.find((x) => x.region === 'meadow' && x.botanical), now = Date.now();
    st.gathering.nodes[d.id] = { plants: [0, 1, 2].map((k) => ({ id: `${d.id}#t${k}`, x: 0.25 + k * 0.22, y: 0.8, born: now, g: 0.1, t: now, w: 0.2 })), due: null, seq: 60 };
    l.views.wilds.refresh();
    l.views.wilds.grow();
    return d;
  });
  await expect(page.locator('[data-act=mode-water]')).toHaveCount(0);
  await shot(page, info, 'sandbox-wilds-regrown');
  expect(errors).toEqual([]);
});

test('sandbox wilds: a crystal fused into its rock breaks free only after several blows', async ({ page }) => {
  const errors = watchErrors(page);
  await startSandbox(page);
  await page.click('[data-act=tab-wilds]');
  // (no wild rabbits hopping in front of the plants these taps are aimed at)
  await lab(page, (l) => { l.views.wilds.wildlife = false; });
  // (the whole region in view: taps below are aimed from the scene's own coordinates)
  await lab(page, (l) => l.views.wilds.setZoom(1));
  // the region whose plants include a crystal
  const region = await lab(page, async (l) => {
    const w = l.views.wilds;
    for (const r of ['quarry', 'moonfen', 'crags', 'river', 'forest', 'meadow', 'netherwood']) {
      w.region = r; w.bgKey = ''; w.refresh(); w.grow();
      if (w.field.some((p) => w.fused(p))) return r;
    }
    return null;
  });
  test.skip(!region, 'this world grows no crystal');
  const out = await lab(page, (l) => {
    const w = l.views.wilds, r = w.canvas.getBoundingClientRect();
    // (a tap on the middle of a crystal no other plant stands in front of)
    const p = w.field.filter((q) => w.fused(q)).find((q) => { const f = w.frameOf(q); return w.plantAt({ clientX: r.left + (q.x * 384 - f.ax + f.w / 2) / 384 * r.width, clientY: r.top + (q.y * 216 - f.ay + f.h / 2) / 216 * r.height }) === q; });
    const f = w.frameOf(p), e = { clientX: r.left + (p.x * 384 - f.ax + f.w / 2) / 384 * r.width, clientY: r.top + (p.y * 216 - f.ay + f.h / 2) / 216 * r.height };
    const loose = [];
    for (let k = 0; k < w.strikesFor(p); k++) { w.time += 1; w.tapScene(e); loose.push(!!w.fallen[p.id]); }
    return { need: w.strikesFor(p), loose };
  });
  expect(out.need, 'it takes several blows').toBeGreaterThanOrEqual(3);
  expect(out.loose.slice(0, -1).every((v) => !v), 'still fused after every blow but the last').toBe(true);
  expect(out.loose[out.loose.length - 1], 'the last blow breaks it free').toBe(true);
  expect(errors).toEqual([]);
});

test('sandbox wilds: the scene zooms in and out, starting a little closer, and a tap still finds the plant under it', async ({ page }) => {
  const errors = watchErrors(page);
  // (a first visit: no zoom kept from before — only on the first load, not the reload below)
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('zoomed')) { localStorage.removeItem('alchemist.wildsZoom'); sessionStorage.setItem('zoomed', '1'); } } catch { /* none */ } });
  await startSandbox(page);
  await page.click('[data-act=tab-wilds]');
  // (no wild rabbits hopping in front of the plants these taps are aimed at)
  await lab(page, (l) => { l.views.wilds.wildlife = false; });
  await page.waitForFunction(() => !!window.__alchemist.screen.views.wilds.bg);
  const z0 = await lab(page, (l) => l.views.wilds.zoom);
  expect(z0, 'it starts closer than the whole region').toBeGreaterThan(1);
  await page.click('[data-act=zoom-in]');
  const z1 = await lab(page, (l) => l.views.wilds.zoom);
  expect(z1).toBeGreaterThan(z0);
  await page.click('[data-act=zoom-fit]');
  expect(await lab(page, (l) => l.views.wilds.zoom)).toBe(1);
  await expect(page.locator('[data-act=zoom-out]')).toBeDisabled();
  await page.click('[data-act=zoom-in]'); await page.click('[data-act=zoom-in]');
  // zoomed in, the window shows part of the scene, and a point in it maps onto the same scene pixel
  const probe = await lab(page, (l) => {
    const w = l.views.wilds, v = w.view.getBoundingClientRect(), c = w.canvas.getBoundingClientRect();
    const p = w.scenePoint({ clientX: v.left + v.width / 2, clientY: v.top + v.height / 2 });
    const want = { x: (v.left + v.width / 2 - c.left) / c.width * 384, y: (v.top + v.height / 2 - c.top) / c.height * 216 };
    return { wider: c.width > v.width * 1.4, dx: Math.abs(p.x - want.x), dy: Math.abs(p.y - want.y) };
  });
  expect(probe.wider).toBe(true);
  expect(probe.dx + probe.dy).toBeLessThan(0.01);
  // the zoom is kept for next time
  await page.reload();
  await page.click('[data-act=sandbox]');
  await page.waitForSelector('canvas.view-canvas');
  await page.click('[data-act=tab-wilds]');
  // (no wild rabbits hopping in front of the plants these taps are aimed at)
  await lab(page, (l) => { l.views.wilds.wildlife = false; });
  expect(await lab(page, (l) => l.views.wilds.zoom)).toBeCloseTo(1.25 * 1.25, 2);
  expect(errors).toEqual([]);
});

test('wild rabbits: tapped, one bleeds over the ground and bolts faster; brought down, a tap carries it to the hutch', async ({ page }) => {
  const errors = watchErrors(page);
  await newGame(page, { tutorial: false });
  await page.click('[data-act=tab-wilds]');
  await lab(page, (l) => l.views.wilds.setZoom(1));
  await page.waitForFunction(() => { const w = window.__alchemist.screen.views.wilds; return !!w.bg && !!w.warren() && w.warren().rabbits.length > 0; });
  await page.locator('.view-wilds canvas.scene').scrollIntoViewIfNeeded();
  const before = await lab(page, (l) => l.state.colony.rabbits.length);
  // a real tap on a rabbit (the warren held still while it is aimed at)
  const tapRabbit = async () => {
    const pt = await lab(page, (l) => {
      const w = l.views.wilds, wr = w.warren(), r = wr.rabbits.find((q) => !q.dead) || wr.rabbits[0], c = w.canvas.getBoundingClientRect();
      wr.held = wr.step; wr.step = () => {};
      return { x: c.left + r.x / 384 * c.width, y: c.top + (r.y - 4) / 216 * c.height, id: r.id };
    });
    await page.mouse.click(pt.x, pt.y);
    await lab(page, (l) => { const wr = l.views.wilds.warren(); wr.step = wr.held; });
    return pt.id;
  };
  const id = await tapRabbit();
  const hurt = await lab(page, (l, i) => { const r = l.views.wilds.warren().rabbits.find((q) => q.id === i); return { hits: r.hits, alarm: r.alarm, drops: l.views.wilds.warren().drops.length }; }, id);
  expect(hurt.hits).toBe(1);
  expect(hurt.alarm, 'frantic after the first blow').toBe(true);
  expect(hurt.drops, 'blood bursts from it').toBeGreaterThan(10);
  await page.waitForTimeout(1200);
  // its blood colours the scene where it ran
  const red = await lab(page, (l) => {
    const cv = l.views.wilds.gore.get(l.views.wilds.region);
    if (!cv) return 0;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] > d[i + 1] * 2) n++;
    return n;
  });
  expect(red, 'the ground is stained').toBeGreaterThan(15);
  // two more blows before it bleeds out catch it; a tap carries it to the hutch
  await lab(page, (l, i) => { const w = l.views.wilds, wr = w.warren(), r = wr.rabbits.find((q) => q.id === i); wr.strike(r, r.x, r.y - 5); wr.strike(r, r.x, r.y - 5); }, id);
  expect(await lab(page, (l, i) => l.views.wilds.warren().rabbits.find((q) => q.id === i).down, id)).toBe(true);
  await lab(page, (l, i) => { const wr = l.views.wilds.warren(); for (const q of wr.rabbits) if (q.id !== i) wr.remove(q); }, id);
  await tapRabbit();
  const after = await lab(page, (l) => ({ n: l.state.colony.rabbits.length, last: l.state.colony.rabbits[l.state.colony.rabbits.length - 1] }));
  expect(after.n).toBe(before + 1);
  expect(after.last.alive, 'caught alive').toBe(true);
  expect(after.last.health).toBeLessThan(50);
  expect(errors).toEqual([]);
});
