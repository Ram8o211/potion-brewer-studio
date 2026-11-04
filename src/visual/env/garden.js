import { Rng, hashString } from '../../core/rng.js';
import { sky } from './paint.js';
import { heights, fillSolid, paintTerrain, markOpen, col } from './side.js';
import { fog } from './cave.js';

// The garden uses the same terrain/material/light maps as the Wilds and studio.
export function compose(cv, seed) {
  const rng = new Rng('garden:' + seed), W = cv.W, H = cv.H;
  sky(cv, 0, H, ['#171f2b', '#344c49', '#718366', '#9eaa77']);
  fog(cv, '#b4bb85', 40, 160, 0.2, hashString(seed));
  const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < W && j < H) cv.set(i, j, col(c)); };
  // Silhouettes of the shop's wall and a timber fence behind the beds.
  rect(0, 24, 48, 145, '#323b35');
  for (let y = 28; y < 164; y += 9) for (let x = 0; x < 48; x += 13) rect(x + (y % 2) * 5, y, 11, 7, '#475146');
  rect(12, 68, 24, 35, '#1a252a'); rect(15, 71, 18, 27, '#d9a65b'); rect(23, 71, 2, 28, '#5a3c29');
  for (let x = 55; x < W; x += 17) { rect(x, 123 + rng.int(-2, 2), 4, 35, '#644630'); rect(x, 123, 2, 35, '#98713e'); }
  rect(48, 134, W - 48, 3, '#8f683f'); rect(48, 148, W - 48, 3, '#593f2d');
  fillSolid(cv, heights(W, hashString(seed), { base: 175, amp: 3, freq: 0.014 }));
  paintTerrain(cv, { a: '#493225', b: '#62402a', grain: '#9b7750', dark: '#231c1b', deep: '#232325', cave: '#111d21',
    crust: ['#789948', '#4c6b38', '#3e4c2b'], seed: hashString(seed),
    cobble: { stones: ['#6b6b5e', '#52594f', '#858372'], mortar: '#262b29', s: 8 },
    layers: [{ kind: 'dirt', cols: ['#3c2c22', '#503624', '#876047', '#79523a', '#a89a7b', '#4e4134'], h: [9, 13] }],
  });
  for (let x = 55; x < W - 20; x += 65) {
    rect(x, 165, 49, 5, '#808474'); rect(x + 2, 165, 45, 1, '#a6a48a'); rect(x + 4, 159, 41, 6, '#3d2b20');
    for (let i = 0; i < 12; i++) rect(x + rng.int(5, 43), rng.int(159, 163), 2, 1, '#674732');
  }
  cv.pending.push([24, 84, 45, [1, 0.68, 0.3], 0.28]);
  markOpen(cv); cv.meta.vignette = 0.15; cv.meta.wind = 0.3;
}
