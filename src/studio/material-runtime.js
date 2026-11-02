import { artDomain, artRevision } from './direction.js';
import { hex } from '../visual/color.js';
import { PHASE } from '../simulation/constants.js';
let revision = -1, styles = {};
const NAMES = { [PHASE.LIQUID]: 'liquid', [PHASE.POWDER]: 'powder', [PHASE.PASTE]: 'paste', [PHASE.SOLID]: 'solid', [PHASE.GAS]: 'gas' };
export function materialStyles() {
  if (revision === artRevision()) return styles;
  revision = artRevision(); styles = {};
  for (const name of [...Object.values(NAMES), 'frozen']) {
    const c = artDomain('materials', name); if (c) styles[name] = { ...c, rgb: hex(c.tint).map((v) => v * 255) };
  }
  return styles;
}
/** Only the renderer's output buffer is modified, never the simulation's particle buffers. */
export function directMaterialImage(data, width, phaseAt, time) {
  const all = materialStyles(); if (!Object.keys(all).length) return;
  for (let k = 0; k < data.length / 4; k++) {
    const o = k * 4; if (!data[o + 3]) continue;
    const phase = phaseAt(k), c = all[typeof phase === 'string' ? phase : NAMES[phase]]; if (!c) continue;
    const x = k % width, y = Math.floor(k / width), grain = Math.sin(x * 12.9 + y * 78.2 + Math.floor(time * c.speed * 4)) * (c.grain - 1) * 3;
    for (let ch = 0; ch < 3; ch++) data[o + ch] = data[o + ch] * (1 - c.mix) + c.rgb[ch] * c.mix + grain + c.emission * 20 + Math.sin(time * c.speed * 3) * (c.speed - 1) * 3;
    data[o + 3] *= c.opacity;
  }
}
