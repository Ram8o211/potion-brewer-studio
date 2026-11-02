// The rabbit renderer and the hutch scene, without a DOM: every visible
// state draws inside the frame, channels and levels are distinct, death
// keeps what the body bore, drawing is deterministic, and the hutch's
// behaviour machine is reproducible and never touches the colony.
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawRabbit, rabbitAnchors, RABBIT_W, RABBIT_H } from '../src/rendering/rabbit.js';
import { HutchScene, HUTCH_W, HUTCH_H, onGround } from '../src/rendering/hutch-scene.js';
import { defaultSnap, RABBIT_MARKS, TRAITS, TRAIT_EXCLUSIVE, rollLook } from '../src/game/colony.js';
import { Rng } from '../src/core/rng.js';

/** A context that records what is drawn. */
function stub() {
  const calls = [];
  const ctx = {
    fillStyle: '', globalAlpha: 1,
    fillRect(x, y, w, h) { calls.push(['r', x, y, w, h, ctx.fillStyle]); },
    clearRect(x, y, w, h) { calls.push(['c', x, y, w, h]); },
    drawImage() { calls.push(['i']); },
    save() {}, restore() {}, translate() {}, scale() {},
    getContext() { return ctx; },
  };
  return { ctx, calls };
}
const look = { coat: [0.93, 0.89, 0.82], coat2: [0.36, 0.24, 0.18], pattern: 'solid', ear: 'upright', size: 1, eye: 'dark', tail: 1, seed: 1 };
const snap = (o = {}) => {
  const s = defaultSnap();
  if (o.L) s.lv = RABBIT_MARKS.map((k) => o.L[k] || 0);
  return { ...s, ...o, lv: s.lv };
};
const draw = (lk, sn, t = 1.3, react = 0, opts = {}) => {
  const { ctx, calls } = stub();
  drawRabbit(/** @type {any} */ (ctx), lk, sn, t, react, { cache: false, ...opts });
  return calls;
};
const inFrame = (calls) => calls.filter((c) => c[0] === 'r').every(([, x, y, w, h]) => x >= 0 && y >= 0 && x + w <= RABBIT_W && y + h <= RABBIT_H);
const nonExclusive = TRAITS.filter((t) => !TRAIT_EXCLUSIVE.some((g) => g.indexOf(t) > 0));

test('every state draws, and only inside its 48×40 frame', () => {
  const all3 = Object.fromEntries(RABBIT_MARKS.map((k) => [k, 3]));
  const cases = [
    snap(), snap({ stage: 'kit' }), snap({ stage: 'young' }), snap({ stage: 'elder' }), snap({ preg: true }), snap({ hp: 2 }), snap({ hp: 3 }),
    snap({ L: all3 }), snap({ traits: nonExclusive.slice(0, 5) }), snap({ traits: ['giant'], L: { strength: 3 } }), snap({ traits: ['tiny'] }),
    snap({ sc: [3, 3, 3, 3, 3] }),
  ];
  for (const cause of ['poison', 'death', 'fire', 'frost', 'acid', 'alkali', 'change', 'arcana', 'age', 'frail', 'unknown']) {
    cases.push(snap({ alive: false, hp: 3, cause, traits: ['horns', 'wings', 'tail-lizard'], sc: [2, 1, 0, 2, 1] }));
  }
  for (let i = 0; i < 20; i++) cases.push(snap({ L: Object.fromEntries(RABBIT_MARKS.map((k, j) => [k, (i + j) % 4])) }));
  for (const sn of cases) {
    for (const lk of [look, { ...look, size: 1.15, ear: 'lop' }, rollLook(new Rng('render-' + sn.stage))]) {
      for (const t of [0, 0.7, 2.9]) {
        const c = draw(lk, sn, t, 0.6, { react: ['love', 'fire'] });
        assert.ok(c.length > 20, 'something is drawn');
        assert.ok(inFrame(c), `inside the frame: ${JSON.stringify(sn)}`);
      }
    }
    const a = rabbitAnchors({ ...look, size: 1.15 }, sn);
    assert.ok(a.box.x0 >= 0 && a.box.x1 < RABBIT_W && a.box.y1 < RABBIT_H, 'the body fits');
  }
});

test('each channel looks different at each level, and channels add up', () => {
  for (const ch of RABBIT_MARKS) {
    const lv = [1, 2, 3].map((n) => JSON.stringify(draw(look, snap({ L: { [ch]: n } }))));
    assert.notEqual(lv[0], lv[1], `${ch} 1 vs 2`);
    assert.notEqual(lv[1], lv[2], `${ch} 2 vs 3`);
    assert.notEqual(JSON.stringify(draw(look, snap())), lv[0], `${ch} 1 is visible`);
  }
  const loveFire = draw(look, snap({ L: { love: 3, fire: 3 } })).length;
  const love = draw(look, snap({ L: { love: 3 } })).length;
  assert.ok(loveFire > love, 'fire adds to love');
});

test('death changes the pose but keeps the body; drawing is deterministic', () => {
  const alive = snap({ traits: ['horns'] });
  const dead = snap({ alive: false, hp: 3, cause: 'fire', traits: ['horns'] });
  assert.notEqual(JSON.stringify(draw(look, alive)), JSON.stringify(draw(look, dead)));
  assert.equal(rabbitAnchors(look, dead).pose, 'dead');
  assert.equal(JSON.stringify(draw(look, dead, 1.1)), JSON.stringify(draw(look, dead, 1.1)));
  assert.equal(JSON.stringify(draw(look, alive, 2.2, 0.5)), JSON.stringify(draw(look, alive, 2.2, 0.5)));
  // the horns are still drawn on the body
  const hornless = draw(look, snap({ alive: false, hp: 3, cause: 'fire' }));
  assert.notEqual(JSON.stringify(hornless), JSON.stringify(draw(look, dead, 1.3)));
});

test('the hutch: deterministic behaviour, hit-testing, nothing mutated, any number of rabbits', () => {
  const entries = [];
  for (let i = 0; i < 12; i++) {
    const L = {}; if (i === 1) L.love = 2; if (i === 2) L.fire = 3; if (i === 3) L.strength = 2; if (i === 4) L.arcana = 3; if (i === 5) L.toxicity = 3; if (i === 6) L.frost = 3;
    entries.push({ id: 'r' + i, look: rollLook(new Rng('hutch-' + i)), snap: snap({ L, stage: i > 8 ? 'kit' : 'adult', alive: i !== 11, hp: i === 11 ? 3 : 0, cause: i === 11 ? 'poison' : null }), mother: i > 8 ? 'r0' : undefined });
  }
  const frozen = JSON.stringify(entries);
  const run = (list) => {
    const sc = new HutchScene({ canvas: () => stub().ctx, sprites: false });
    sc.sync(list);
    for (let k = 0; k < 150; k++) sc.update(0.1);
    const { ctx, calls } = stub();
    sc.draw(/** @type {any} */ (ctx), 4.2, { selected: 'r1', hover: 'r2' });
    return { sc, calls };
  };
  const a = run(entries), b = run(entries);
  assert.equal(JSON.stringify(a.calls), JSON.stringify(b.calls), 'same inputs, same hutch');
  assert.equal(JSON.stringify(entries), frozen, 'entries untouched');
  for (const e of entries) {
    const w = a.sc.where(e.id);
    if (w.hidden) continue;
    assert.ok(w.x >= 0 && w.x < HUTCH_W && w.y >= 0 && w.y < HUTCH_H);
    if (e.snap.alive !== false) assert.ok(onGround(w.x, w.y), `${e.id} stands on the straw (${w.x}, ${w.y})`);
    const box = a.sc.boxOf(e.id);
    assert.ok(box);
  }
  // hit-testing finds a rabbit standing alone
  const solo = run([entries[0]]).sc;
  const w0 = solo.where('r0');
  assert.equal(solo.hit(w0.x, w0.y - 4), 'r0');
  assert.equal(solo.hit(2, 2), null);
  for (const n of [0, 1]) assert.doesNotThrow(() => run(entries.slice(0, n)));
  // every step of the way, the living stand on the straw: never on a bowl, in the hide box, the wall or the rail
  const sc = new HutchScene({ canvas: () => stub().ctx, sprites: false });
  sc.sync(entries);
  for (let k = 0; k < 600; k++) {
    sc.update(0.1);
    if (k % 25 === 0) sc.attack('r2', 'r3');
    for (const e of entries) {
      const w = sc.where(e.id);
      if (e.snap.alive === false || ['hop', 'zoom', 'float'].includes(w.act)) continue;
      assert.ok(onGround(w.x, w.y), `${e.id} ${w.act} on the straw at step ${k} (${w.x}, ${w.y})`);
    }
  }
});

test('the sheet poses: standing, sitting up, leaping, grazing, startled and lying dead, each its own drawing inside the frame', () => {
  const poses = {
    idle: draw(look, snap(), 1.3, 0, { hop: false }),
    rear: draw(look, snap(), 1.3, 0, { hop: false, pose: 'rear' }),
    hop: draw(look, snap(), 1.3, 0, { hop: false, lift: 3 }),
    eat: draw(look, snap(), 1.3, 0, { hop: false, pose: 'eat' }),
    hurt: draw(look, snap({ hp: 2 }), 1.3, 0, { hop: false }),
    dead: draw(look, snap({ alive: false, hp: 3, cause: 'age' }), 1.3),
  };
  const seen = new Set();
  for (const [name, calls] of Object.entries(poses)) {
    assert.ok(inFrame(calls), name);
    const s = JSON.stringify(calls);
    assert.ok(!seen.has(s), `${name} differs from the others`);
    seen.add(s);
  }
  assert.equal(rabbitAnchors(look, snap({ hp: 2 })).pose, 'hurt', 'badly hurt sits startled');
  assert.equal(rabbitAnchors(look, snap({ hp: 2, L: { toxicity: 2 } })).pose, 'sick', 'poison slumps');
  assert.ok(poses.eat.some((c) => c[5] === '#6aa84f'), 'grazing shows the grass');
  // a harmful dose makes it flinch; a kind one does not
  assert.notEqual(JSON.stringify(draw(look, snap(), 1.3, 0.8, { hop: false, react: ['fire'], flash: false })), JSON.stringify(draw(look, snap(), 1.3, 0.8, { hop: false, react: ['love'], flash: false })));
  for (const pose of ['rear', 'eat', 'hop', 'hurt']) {
    for (const sn of [snap({ stage: 'kit' }), snap({ traits: ['giant', 'antlers'], L: { strength: 3 } }), snap({ preg: true })]) {
      assert.ok(inFrame(draw({ ...look, size: 1.15 }, sn, 0.4, 0, { pose })), `${pose} fits`);
      const a = rabbitAnchors({ ...look, size: 1.15 }, sn, pose);
      assert.ok(a.box.x0 >= 0 && a.box.x1 < RABBIT_W, `${pose} body fits`);
    }
  }
});

test('every kind, the rabbit too, has an enclosure of its own: built level, deterministic, with room to walk, eat and lie', async () => {
  const { penOf, PEN_KINDS, PEN_W, PEN_H } = await import('../src/visual/env/pens.js');
  const { KIND_IDS, kindLook } = await import('../src/game/kinds.js');
  assert.deepEqual([...PEN_KINDS].sort(), [...KIND_IDS].sort(), 'one pen per kind');
  const titles = new Set();
  for (const kind of KIND_IDS) {
    const p = penOf(kind);
    titles.add(p.title);
    assert.equal(p.back.w, PEN_W); assert.equal(p.back.h, PEN_H);
    assert.ok(p.back.px.every((c) => c >>> 24 === 255), `${kind}: the back is painted all over`);
    // what is drawn over the animals is at most a fringe along the bottom: the ground stays in view
    let front = 0;
    for (let k = 0; k < p.front.px.length; k++) if (p.front.px[k] >>> 24) front++;
    assert.ok(front < PEN_W * 5, `${kind}: only a fringe in front (${front} px)`);
    // every row of the ground has room to walk
    assert.ok(p.ground.length >= 16);
    for (const runs of p.ground) assert.ok(runs.reduce((a, [x0, x1]) => a + x1 - x0, 0) >= 80, `${kind}: room on every row`);
    // its own animals live on its ground
    const sc = new HutchScene({ canvas: () => stub().ctx, sprites: false, kind });
    const entries = [0, 1, 2, 3].map((i) => ({ id: `${kind}${i}`, look: kindLook(kind, new Rng(`${kind}-${i}`)), snap: snap() }));
    sc.sync(entries);
    for (let k = 0; k < 300; k++) {
      sc.update(0.1);
      for (const e of entries) {
        const w = sc.where(e.id);
        if (['hop', 'zoom', 'float'].includes(w.act)) continue;
        assert.ok(sc.onGround(w.x, w.y), `${kind}: ${e.id} ${w.act} on its floor at step ${k} (${w.x}, ${w.y})`);
      }
    }
  }
  assert.equal(titles.size, PEN_KINDS.length, 'each its own place');
  // the same kind always gets the same pen
  const a = penOf('toad').back.hash();
  assert.equal(penOf('toad').back.hash(), a);
});

test('an animal set into the wilds stands out: its tones spread, its outline inked, a pale halo beyond', async () => {
  const { punchSprite } = await import('../src/rendering/punch.js');
  const w = 8, h = 8, d = new Uint8ClampedArray(w * h * 4);
  // a 4×4 body, two greys close together
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) { const p = (y * w + x) * 4; d.set(x < 4 ? [110, 100, 90, 255] : [130, 120, 110, 255], p); }
  punchSprite(d, w, h);
  const at = (x, y) => Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
  assert.ok(at(4, 3)[0] - at(2, 3)[0] > 20 * 1.3, 'the two tones are further apart');
  assert.ok(at(1, 3)[0] < 40 && at(1, 3)[3] > 200, 'inked next to the body');
  assert.ok(at(0, 3)[0] > 200 && at(0, 3)[3] > 0 && at(0, 3)[3] < 128, 'a faint pale halo beyond the ink');
  assert.equal(at(0, 0)[3], 0, 'beyond the halo nothing is touched');
});
