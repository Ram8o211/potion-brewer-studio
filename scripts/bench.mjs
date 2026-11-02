// Performance benchmarks — measured, not estimated.
//
//   node scripts/bench.mjs            physics (Node) + browser frame timing
//   node scripts/bench.mjs --physics  physics only
//   node scripts/bench.mjs --browser  browser only (builds dist/ if needed)
//   node scripts/bench.mjs --memory   long-session memory soak only
//   node scripts/bench.mjs --colony   arcane awakening and the colony only
//
// Physics: mean wall-clock time of one 1/120 s simulation step for typical
// cauldron contents. Browser: frame intervals and per-frame work (physics +
// rendering) read from the game's own instrumentation, in headless Chromium
// at desktop size and in phone emulation with 4× CPU throttling (a stand-in
// for a mid-range phone — not a measurement on a physical device).
// Results are written to docs/perf-results.json.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Simulation } from '../src/simulation/world.js';
import { REF, refLookup } from '../src/materials/reference.js';
import { generateWorld, makeLookup } from '../src/materials/generator.js';
import { generateCommission } from '../src/game/commissions.js';
import { capabilities, EQUIPMENT } from '../src/game/equipment.js';
import { runPlanHeadless } from '../src/game/autobrew.js';
import { Rng } from '../src/core/rng.js';
import { measureParticles, tapSelection } from '../src/game/measure.js';
import { GameState } from '../src/game/state.js';
import { NE, EFFECT_KEYS } from '../src/alchemy/effects.js';
import { livingRabbits } from '../src/game/colony.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const memoryOnly = args.has('--memory');
const colonyOnly = args.has('--colony');
const doPhysics = !memoryOnly && !colonyOnly && (!args.has('--browser') || args.has('--physics'));
const doBrowser = !memoryOnly && !colonyOnly && (!args.has('--physics') || args.has('--browser'));
const doColony = !memoryOnly && (colonyOnly || doPhysics);
const out = { date: new Date().toISOString(), machine: { cpus: os.cpus()[0]?.model, cores: os.cpus().length, node: process.version, platform: `${os.platform()} ${os.arch()}` } };

// ------------------------------------------------------------------ physics
function pourAll(sim, id, n, x = 0) {
  sim.emitter.start(REF[id], { x, amount: n, rate: 600 });
  let g = 0;
  while (sim.emitter.pouring && g++ < 20000) sim.step();
}
function timeSteps(sim, seconds) {
  const n = Math.round(seconds * 120);
  const t0 = performance.now();
  for (let k = 0; k < n; k++) sim.step();
  return (performance.now() - t0) / n;
}

function physicsBench() {
  /** @type {[string, (sim: Simulation) => void, string][]} */
  const scenarios = [
    // the game's vessels with typical order-sized brews
    ['pot: tonic 60', (s) => { pourAll(s, 'water', 30); pourAll(s, 'red', 30); }, 'pot'],
    ['pot: brew 150', (s) => { pourAll(s, 'water', 100); pourAll(s, 'red', 50); }, 'pot'],
    ['pot: full 300', (s) => pourAll(s, 'water', 300), 'pot'],
    ['pot: stirred infusion 200', (s) => { pourAll(s, 'water', 160); pourAll(s, 'sand', 40); s.tool.auto = true; s.tool.autoCenterY = 1.2; s.tool.autoRadius = 0.5; }, 'pot'],
    ['copper: full 440', (s) => pourAll(s, 'water', 440), 'copper'],
    ['grand: 3 layers 600', (s) => { pourAll(s, 'honey', 200, -0.3); pourAll(s, 'water', 200); pourAll(s, 'oil', 200, 0.3); }, 'grand'],
    ['grand: boiling 400 (lid on)', (s) => { pourAll(s, 'water', 400); s.furnace.setting = 1; s.furnace.maxFlame = 520; for (let k = 0; k < 120 * 30; k++) s.step(); }, 'grand'],
    // the large reference vessels (the original pots)
    ['water 300', (s) => pourAll(s, 'water', 300), 'small'],
    ['water 900', (s) => pourAll(s, 'water', 900), 'medium'],
    ['water 1400', (s) => pourAll(s, 'water', 1400), 'large'],
    ['3 liquid layers 900', (s) => { pourAll(s, 'honey', 300, -0.5); pourAll(s, 'water', 300); pourAll(s, 'oil', 300, 0.5); }, 'medium'],
    ['sand pile 600', (s) => pourAll(s, 'sand', 600), 'medium'],
    ['dough 600 (stirred)', (s) => { pourAll(s, 'flour', 300); pourAll(s, 'water', 300); s.tool.auto = true; }, 'medium'],
    ['boiling water 600 (lid on)', (s) => { pourAll(s, 'water', 600); s.furnace.setting = 1; s.furnace.maxFlame = 520; for (let k = 0; k < 120 * 40; k++) s.step(); }, 'medium'],
    ['frozen block 500', (s) => { pourAll(s, 'red', 500); s.furnace.setting = -1; s.furnace.minCool = -40; for (let k = 0; k < 120 * 30; k++) s.step(); }, 'medium'],
  ];
  const rows = [];
  // warm-up: let the JIT compile the hot paths before anything is timed
  { const w = new Simulation({ size: 'medium', lookup: refLookup }); pourAll(w, 'water', 400); pourAll(w, 'sand', 200); timeSteps(w, 3); }
  for (const [name, setup, size] of scenarios) {
    const sim = new Simulation({ size, lookup: refLookup });
    setup(sim);
    for (let k = 0; k < 240; k++) sim.step();
    const ms = timeSteps(sim, 3);
    // what the HUD pays per assay (tap selection + full measurement with effects)
    const t1 = performance.now();
    for (let k = 0; k < 20; k++) measureParticles(sim, tapSelection(sim, Math.min(60, sim.p.count)));
    const assayMs = (performance.now() - t1) / 20;
    const gas = Array.from(sim.p.phase.slice(0, sim.p.count)).filter((p) => p === 4).length;
    rows.push({ scenario: name, vessel: size, particles: sim.p.count, gas, msPerStep: +ms.toFixed(3), msPerFrame60: +(ms * 2).toFixed(3), assayMs: +assayMs.toFixed(3) });
    console.log(`  ${name.padEnd(30)} ${String(sim.p.count).padStart(5)} particles  ${ms.toFixed(2).padStart(6)} ms/step  (${(ms * 2).toFixed(2)} ms per 60 fps frame) · assay ${assayMs.toFixed(2)} ms`);
  }
  // full commissions brewed by the homunculus (wall clock per brew)
  const brews = [];
  for (let k = 0; k < 6; k++) {
    const world = generateWorld('bench-' + k);
    const lookup = makeLookup(world);
    const cap = capabilities(EQUIPMENT.map((e) => e.id));
    cap.size = 'pot';
    const com = generateCommission({ world, lookup, available: new Set(world.ingredients), cap, rank: 4, priceOf: (id) => lookup(id).price || 1 }, new Rng('bench-c' + k), { tier: k % 5 });
    if (!com) continue;
    const sim = new Simulation({ size: 'pot', lookup, reactions: world.reactions, laws: world.laws });
    Object.assign(sim.furnace, { maxFlame: cap.maxFlame, heatPower: cap.heatPower, minCool: cap.minCool, coolPower: cap.coolPower });
    const t0 = performance.now();
    runPlanHeadless(sim, com.reference, lookup);
    brews.push({ style: com.style, simSeconds: +sim.time.toFixed(1), wallSeconds: +((performance.now() - t0) / 1000).toFixed(2) });
  }
  console.log('  homunculus brews:', brews.map((b) => `${b.style} ${b.simSeconds}s sim in ${b.wallSeconds}s`).join(', '));
  return { steps: rows, brews };
}

// ------------------------------------------------------- new systems (Node)
/** A random strong dose for a rabbit trial. @param {Rng} rng */
function randomDose(rng) {
  const e = new Array(NE).fill(0);
  for (let k = 0; k < 2; k++) e[rng.int(0, NE - 1)] += rng.range(4, 18);
  return { effects: e, resonance: [], color: [0.5, 0.4, 0.5], temperature: 20 };
}

/**
 * Arcane awakening in the step (the per-particle threshold check and the
 * conversion), and a long career in the hutch: nights of fading marks,
 * breeding and ageing, doses, deaths, remains, and what it does to the save.
 */
function newSystemsBench() {
  // awakening: water + the world's first essence heated past its blend threshold
  const st0 = GameState.create('bench-arcane', { tutorial: false });
  const R = st0.world.roles;
  const sim = new Simulation({ size: 'pot', lookup: st0.lookup, reactions: st0.world.reactions, laws: st0.world.laws });
  const pour = (id, n) => { sim.emitter.start(st0.lookup(id), { x: 0, amount: n, rate: 600 }); let g = 0; while (sim.emitter.pouring && g++ < 20000) sim.step(); };
  pour(R.water, 75);
  pour(R.essenceA, 75);
  sim.tool.auto = true;
  for (let k = 0; k < 120 * 3; k++) sim.step();
  const cold = timeSteps(sim, 2);
  Object.assign(sim.furnace, { maxFlame: 900, heatPower: 2 });
  sim.furnace.setting = 1;
  // heat until the first particles awaken, then time five seconds of awakening
  let steps = 0;
  while (sim.awakened <= 0 && steps < 120 * 240) { sim.step(); steps++; }
  const onset = sim.time;
  const during = timeSteps(sim, 5);
  sim.furnace.setting = 0;
  const after = timeSteps(sim, 2);
  // sim.awakened counts particle volumes of magic converted
  const arcane = { particles: sim.p.count, awakenedParticleVolumes: +sim.awakened.toFixed(1), onsetSimSeconds: +onset.toFixed(1), msPerStepBefore: +cold.toFixed(3), msPerStepAwakening: +during.toFixed(3), msPerStepAfter: +after.toFixed(3) };
  console.log(`  awakening (pot, ${arcane.particles} particles): ${arcane.msPerStepBefore} ms/step cold, ${arcane.msPerStepAwakening} while awakening (from ${arcane.onsetSimSeconds} s; ${arcane.awakenedParticleVolumes} particle volumes awakened), ${arcane.msPerStepAfter} after`);

  // a year in the hutch: the warren full, breeding on, a dose a day, the dead processed or buried
  const st = GameState.create('bench-colony', { tutorial: false });
  st.equipment.push('kennel', 'warren');
  st.coins = 1e6;
  while (st.buyRabbit().ok);
  const rng = new Rng('bench-colony-doses');
  const json0 = JSON.stringify(st.toJSON()).length;
  let nightMs = 0, doseMs = 0, doses = 0, processed = 0, buried = 0, born = 0, maxAlive = 0;
  for (let day = 0; day < 365; day++) {
    for (let k = 0; k < 2; k++) {
      // A dose can kill its subject; select again from the current living set.
      const living = livingRabbits(st.colony);
      if (!living.length) break;
      const r = living[rng.int(0, living.length - 1)];
      const t1 = performance.now();
      st.recordTrial('rabbit', randomDose(rng), { ml: 10, source: 'cauldron', batchId: st.batch.id, rev: st.batch.rev, theory: new Array(NE).fill(0), parts: [], rabbitId: r.id });
      doseMs += performance.now() - t1;
      doses++;
    }
    for (const r of st.colony.rabbits.filter((x) => !x.alive)) {
      if (processed <= buried) { st.processRemains(r.id); processed++; } else { st.buryRabbit(r.id); buried++; }
    }
    if (livingRabbits(st.colony).length < 2) st.buyRabbit();
    st.current = null;
    st.customerIndex = st.customersPerDay;
    const t2 = performance.now();
    const sum = st.endDay();
    nightMs += performance.now() - t2;
    born += sum.colony.born.length;
    maxAlive = Math.max(maxAlive, livingRabbits(st.colony).length);
  }
  const t3 = performance.now();
  const json = JSON.stringify(st.toJSON());
  const saveMs = performance.now() - t3;
  const t4 = performance.now();
  GameState.fromJSON(JSON.parse(json));
  const loadMs = performance.now() - t4;
  const colony = {
    days: 365, doses, born, processed, buried, maxAlive, living: livingRabbits(st.colony).length, memorial: st.colony.memorial.length,
    materials: st.world.materials.length, msPerNight: +(nightMs / 365).toFixed(3), msPerDose: +(doseMs / Math.max(1, doses)).toFixed(3),
    saveBytesStart: json0, saveBytesEnd: json.length, saveMs: +saveMs.toFixed(1), loadMs: +loadMs.toFixed(1),
  };
  console.log(`  a year in the hutch: ${doses} doses (${colony.msPerDose} ms each), ${born} born, ${processed} processed, ${buried} buried, up to ${maxAlive} alive; ${colony.msPerNight} ms per night (whole endDay); save ${(json0 / 1024).toFixed(1)} → ${(json.length / 1024).toFixed(1)} KB, written in ${colony.saveMs} ms, loaded in ${colony.loadMs} ms`);
  return { arcane, colony };
}

// ------------------------------------------------------------------ browser
/** A preinstalled Chromium can stand in for Playwright's own (PW_CHROMIUM=/path/to/chromium). */
const LAUNCH = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

async function browserBench() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('  playwright is not installed — skipping browser benchmark (npm install)');
    return null;
  }
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs'), '--no-zip'], { stdio: 'inherit' });
  const port = 4199;
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs'), '--root', path.join(ROOT, 'dist'), '--port', String(port)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch(LAUNCH);
  const results = [];
  let memory = null;
  const profiles = [
    { name: 'desktop 1440×900', viewport: { width: 1440, height: 900 }, dpr: 1, throttle: 1 },
    { name: 'phone 390×844 @2x, CPU ×4 throttle', viewport: { width: 390, height: 844 }, dpr: 2, throttle: 4, mobile: true },
  ];
  try {
    const runs = [];
    for (const prof of profiles) for (const n of [60, 150, 300, 600]) runs.push({ prof, n, preset: 'auto' });
    // graphics presets on the throttled phone: rendering cost only, same physics
    for (const preset of ['high', 'medium', 'low']) runs.push({ prof: profiles[1], n: 300, preset });
    for (const { prof, n, preset } of runs) {
      {
        const ctx = await browser.newContext({ viewport: prof.viewport, deviceScaleFactor: prof.dpr, isMobile: !!prof.mobile, hasTouch: !!prof.mobile });
        await ctx.addInitScript((q) => { try { const k = 'alchemist-shop.settings'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.quality = q; s.musicOn = false; localStorage.setItem(k, JSON.stringify(s)); } catch { /* ignore */ } }, preset);
        const page = await ctx.newPage();
        if (prof.throttle > 1) {
          const cdp = await ctx.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.throttle });
        }
        await page.goto(`http://localhost:${port}/index.html?nosw`);
        await page.waitForSelector('[data-act=sandbox]');
        await page.click('[data-act=sandbox]');
        await page.waitForSelector('canvas.view-canvas');
        // fill the cauldron directly (pouring at throttled speed would take minutes)
        await page.evaluate((count) => {
          const l = window.__alchemist.screen, sim = l.sim, R = l.state.world.roles, c = sim.cauldron;
          const defs = [R.water, R.essenceA, R.oil].map((id) => l.state.lookup(id));
          for (let k = 0; k < count; k++) {
            const d = defs[k % 3 === 2 && k < count * 0.85 ? 0 : k % 3];
            const y = c.depth - 0.12 - Math.random() * Math.min(c.depth - 0.3, (count / c.capacity) * c.depth * 1.3);
            const x = (Math.random() - 0.5) * 1.8 * c.halfWidth(y);
            sim.addParticle(d, x, y);
          }
        }, n);
        await page.waitForTimeout(3000);
        await page.evaluate(() => { const l = window.__alchemist.screen; l.autoStir = true; l.setFurnace(0.4); l.perf.n = 0; l._bench = { sim: l.sim.time, wall: performance.now() }; });
        await page.waitForTimeout(prof.throttle > 1 ? 8000 : 6000);
        const rep = await page.evaluate(() => {
          const l = window.__alchemist.screen;
          // simulated seconds per wall-clock second (1 = real time; less = slow motion)
          const simRate = (l.sim.time - l._bench.sim) / ((performance.now() - l._bench.wall) / 1000);
          return { ...l.perfReport(), simRate, quality: l.effectiveQuality() };
        });
        results.push({ profile: prof.name, preset, target: n, ...Object.fromEntries(Object.entries(rep).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v])) });
        console.log(`  ${prof.name.padEnd(36)} [${preset.padEnd(6)}] ${String(rep.particles).padStart(5)} particles  ${rep.fps.toFixed(1).padStart(5)} fps  frame p50 ${rep.intervalP50.toFixed(1)} / p95 ${rep.intervalP95.toFixed(1)} ms  work p50 ${rep.workP50.toFixed(1)} ms (physics ${rep.physMs.toFixed(1)}, render ${rep.renderMs.toFixed(1)})  sim speed ×${rep.simRate.toFixed(2)}  quality ${rep.quality}`);
        await ctx.close();
      }
    }
    for (const prof of profiles) results.push(await hutchFrames(browser, port, prof));
    memory = await memorySoak(browser, port);
  } finally {
    await browser.close();
    server.kill();
  }
  return { frames: results, memory };
}

/**
 * The trials room with a full warren of changed rabbits hopping about: the
 * hutch scene's frame cost (the cauldron is empty, so this is the scene).
 */
async function hutchFrames(browser, port, prof) {
  const ctx = await browser.newContext({ viewport: prof.viewport, deviceScaleFactor: prof.dpr, isMobile: !!prof.mobile, hasTouch: !!prof.mobile });
  await ctx.addInitScript(() => { try { const k = 'alchemist-shop.settings'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.quality = 'auto'; s.musicOn = false; localStorage.setItem(k, JSON.stringify(s)); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  if (prof.throttle > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.throttle });
  }
  await page.goto(`http://localhost:${port}/index.html?nosw`);
  await page.click('[data-act=sandbox]');
  await page.waitForSelector('canvas.view-canvas');
  const n = await page.evaluate(() => {
    const l = window.__alchemist.screen, st = l.state;
    st.coins = 1e6;
    for (const id of ['kennel', 'warren']) if (!st.has(id)) st.equipment.push(id);
    while (st.buyRabbit().ok);
    const keys = ['vitality', 'strength', 'love', 'arcana', 'transformation', 'fire', 'frost', 'acidity', 'toxicity', 'death'];
    let k = 0;
    for (const r of st.colony.rabbits) {
      const e = new Array(keys.length).fill(0);
      e[k % 7] = 14; e[(k * 3 + 2) % 7] = 10; e[4] += 8; // every rabbit changed, several transformed
      st.recordTrial('rabbit', { effects: e, resonance: [], color: [0.5, 0.4, 0.5], temperature: 20 }, { ml: 10, source: 'cauldron', batchId: st.batch.id, rev: st.batch.rev, theory: new Array(keys.length).fill(0), parts: [], rabbitId: r.id });
      k++;
    }
    l.showView('trials');
    l.views.trials.refresh();
    return st.colony.rabbits.filter((r) => r.alive).length;
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__alchemist.screen.perf.n = 0; });
  await page.waitForTimeout(prof.throttle > 1 ? 8000 : 6000);
  const rep = await page.evaluate(() => window.__alchemist.screen.perfReport());
  await ctx.close();
  const row = { profile: prof.name, preset: 'auto', target: 0, scene: `hutch, ${n} rabbits`, ...Object.fromEntries(Object.entries(rep).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v])) };
  console.log(`  ${prof.name.padEnd(36)} [hutch ] ${String(n).padStart(5)} rabbits    ${rep.fps.toFixed(1).padStart(5)} fps  frame p50 ${rep.intervalP50.toFixed(1)} / p95 ${rep.intervalP95.toFixed(1)} ms  work p50 ${rep.workP50.toFixed(1)} / p95 ${rep.workP95.toFixed(1)} ms`);
  return row;
}

/**
 * Long-session memory check: 90 s of boiling and stirring at 4× speed, then
 * ten trips between the menu and the shop. The JS heap is sampled after a
 * forced garbage collection (DevTools protocol). Locators are used instead
 * of element handles, which would keep old screens alive and fake a leak.
 */
async function memorySoak(browser, port) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const u = await cdp.send('Runtime.getHeapUsage');
    return +(u.usedSize / 1048576).toFixed(2);
  };
  await page.goto(`http://localhost:${port}/index.html?nosw`);
  await page.click('[data-act=sandbox]');
  await page.locator('canvas.view-canvas').waitFor();
  await page.evaluate(() => {
    const l = window.__alchemist.screen, sim = l.sim, R = l.state.world.roles, c = sim.cauldron;
    for (let k = 0; k < 450; k++) { const y = c.depth - 0.12 - Math.random() * 1.3; sim.addParticle(l.state.lookup(k % 4 ? R.water : R.binder), (Math.random() - 0.5) * 1.8 * c.halfWidth(y), y); }
  });
  await page.waitForTimeout(2000);
  const samples = [{ t: 0, mb: await heap() }];
  await page.evaluate(() => { const l = window.__alchemist.screen; l.sim.cauldron.lidClosed = true; l.setFurnace(0.9); l.autoStir = true; l.speed = 4; });
  for (const t of [30, 60, 90]) {
    await page.waitForTimeout(30_000);
    samples.push({ t, mb: await heap() });
  }
  const particles = await page.evaluate(() => window.__alchemist.screen.sim.p.count);
  const trips = [];
  for (let k = 0; k < 10; k++) {
    await page.evaluate(() => window.__alchemist.showMenu());
    await page.locator('[data-act=sandbox]').waitFor();
    await page.click('[data-act=sandbox]');
    await page.locator('canvas.view-canvas').waitFor();
    await page.waitForTimeout(400);
    if (k === 0 || k === 9) trips.push({ trip: k + 1, mb: await heap() });
  }
  await ctx.close();
  console.log(`  memory: heap ${samples.map((x) => `${x.mb} MB @${x.t}s`).join(', ')} (boiling, ${particles} particles left); after menu↔shop trips ${trips.map((x) => `${x.mb} MB (#${x.trip})`).join(', ')}`);
  return { soak: samples, particlesAtEnd: particles, screenTrips: trips };
}

console.log(`Machine: ${out.machine.cpus} × ${out.machine.cores}, Node ${out.machine.node}`);
if (doPhysics) {
  console.log('Physics (Node, single thread):');
  out.physics = physicsBench();
}
if (doColony) {
  console.log('Arcane awakening and the colony (Node, single thread):');
  out.systems = newSystemsBench();
}
if (doBrowser) {
  console.log('Browser (headless Chromium, software rendering):');
  out.browser = await browserBench();
}
const file = path.join(ROOT, 'docs', 'perf-results.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
let prev = {};
try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
if (memoryOnly) {
  const { chromium } = await import('playwright');
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs'), '--no-zip'], { stdio: 'inherit' });
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs'), '--root', path.join(ROOT, 'dist'), '--port', '4199'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch(LAUNCH);
  try {
    out.browser = { ...(prev.browser || {}), memory: await memorySoak(browser, 4199) };
  } finally {
    await browser.close();
    server.kill();
  }
}
fs.writeFileSync(file, JSON.stringify({ ...prev, ...out }, null, 2) + '\n');
console.log('Wrote docs/perf-results.json');
