// Run with the development server on port 5173. Captures actual runtime pixels.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { BIOMES } from '../src/game/biomes.js';

const OUT = 'docs/screenshots/overhaul-v2'; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(120000);
  await page.goto('http://localhost:5173/index.html?nosw');
  await page.waitForSelector('[data-act=sandbox]');
  await page.evaluate(async () => { await window.__alchemist.startSandbox(); });
  await page.waitForSelector('canvas.view-canvas');
  await page.click('[data-act=tab-wilds]');
  const profiler = await page.context().newCDPSession(page);
  await profiler.send('Profiler.enable'); await profiler.send('Profiler.start');
  await page.waitForTimeout(2500);
  const profile = await profiler.send('Profiler.stop');
  const times = new Map();
  for (let i = 0; i < profile.profile.samples.length; i++) {
    const id = profile.profile.samples[i]; times.set(id, (times.get(id) || 0) + profile.profile.timeDeltas[i]);
  }
  const hot = profile.profile.nodes.map((n) => ({ function: n.callFrame.functionName, file: n.callFrame.url, selfMs: (times.get(n.id) || 0) / 1000 })).sort((a, b) => b.selfMs - a.selfMs).slice(0, 25);
  writeFileSync('/tmp/potion-ui-profile.json', JSON.stringify(hot, null, 2));
  for (const biome of BIOMES) {
    await page.click(`[data-act=region-${biome.id}]`);
    await page.evaluate(() => window.__alchemist.screen.views.wilds.setZoom(1));
    await page.locator('.view-wilds canvas.scene').screenshot({ path: `${OUT}/${biome.id}.png` });
  }
  await page.evaluate(() => {
    const l = window.__alchemist.screen;
    l.state.garden.unlocked = true; l.state.garden.wall = Date.now();
    l.state.garden.plots = ['seed', 'sprout', 'young', 'developing', 'mature'].map((_, i) => ({ id: 'plot-' + i, facility: i === 4 ? 'arcane' : 'soil', crop: { id: 'evidence-' + i, materialId: 'wild-silverleaf' + (i === 4 ? '@arcane' : ''), born: 0, g: [0, 0.15, 0.45, 0.8, 1][i], t: l.state.garden.time, w: 0.8 } }));
    l.showView('garden'); l.views.garden.refresh();
  });
  await page.screenshot({ path: `${OUT}/garden-stages-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${OUT}/garden-stages-phone.png` });
  await page.locator('.view-garden').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: `${OUT}/garden-stages-phone-bottom.png` });
  const report = await page.evaluate(() => {
    const st = window.__alchemist.screen.state, before = { seed: st.sceneSeed('forest'), population: st.gathering.instances.forest.roster, stock: { ...st.inventory }, balance: st.traveller.balance };
    st.regenerateBiome('forest');
    return { before: { seed: before.seed, population: before.population, balance: before.balance }, after: { seed: st.sceneSeed('forest'), population: st.gathering.instances.forest.roster, balance: st.traveller.balance }, preservedInventory: JSON.stringify(before.stock) === JSON.stringify(st.inventory) };
  });
  writeFileSync(`${OUT}/regeneration.json`, JSON.stringify(report, null, 2) + '\n');
  await page.click('[data-act=tab-wilds]'); await page.click('[data-act=region-forest]');
  await page.locator('.view-wilds canvas.scene').screenshot({ path: `${OUT}/forest-regenerated.png` });
  await page.setViewportSize({ width: 1540, height: 1000 });
  await page.evaluate(async () => {
    const { ingredientAssetFrame } = await import('../src/visual/ingredient-assets.js');
    const st = window.__alchemist.screen.state;
    const cv = document.createElement('canvas'); cv.width = 1490; cv.height = 1900;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#111b23'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.font = '16px monospace';
    ctx.fillStyle = '#ead9a8'; ctx.fillText('PERMANENT SPECIES · ORDINARY / ARCANE · SAME RARITY', 24, 30);
    for (const [r, rarity] of ['common','uncommon','rare','unique','legendary'].entries()) {
      ctx.fillText(rarity.toUpperCase(), 198 + r * 256, 64);
      ctx.fillText('Ordinary      Arcane', 185 + r * 256, 85);
    }
    for (const [row, biome] of st.unlockedBiomes.entries()) {
      ctx.fillStyle = '#ead9a8'; ctx.fillText(biome, 12, 154 + row * 148);
      for (const [r, rarity] of ['common','uncommon','rare','unique','legendary'].entries()) {
        const m = st.world.materials.find((m) => m.wild?.region === biome && m.rarity === rarity && !m.arcaneVariant && !m.product);
        for (const [v, suffix] of ['', '@arcane'].entries()) {
          const f = ingredientAssetFrame(m.wild.key + suffix, 'icon', 64);
          ctx.drawImage(f.pix.toCanvas(), 180 + r * 256 + v * 128, 94 + row * 148, 128, 128);
        }
      }
    }
    document.body.replaceChildren(cv);
    document.body.style.cssText = 'margin:0;background:#111b23';
  });
  await page.locator('canvas').screenshot({ path: `${OUT}/ordinary-arcane-rarities.png` });
  console.log(`Captured ${BIOMES.length} biomes, garden growth on desktop/phone and a seeded regeneration record.`);
} finally { await browser.close(); }
