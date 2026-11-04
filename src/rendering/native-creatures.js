import { NATIVE_SPECIES } from '../game/native-species.js';

// Pixel anatomy families share shading and locomotion poses. All output goes
// through the existing creature renderer's clipping, caches and effect overlays.
export function nativeBody(pen, look, snap, anchors) {
  const def = NATIVE_SPECIES[look.kind];
  if (!def || ['fox', 'salamander'].includes(def.anatomy)) return false;
  const pose = anchors.pose, seed = look.seed || 1;
  const levels = snap.lv || [], frozen = levels[6] >= 3, burned = snap.cause === 'fire';
  const c = (look.coat || def.color).map((v, i) => frozen ? v * 0.25 + [0.55, 0.8, 1][i] * 0.75 : burned ? v * 0.24 : snap.alive === false ? v * 0.62 : v);
  // Match the shared frame's kit/strength/trait scale and ground anchor.
  // Death is a rotated body with its own silhouette, never a stretched image.
  const scale = Math.max(0.5, Math.min(1.02, anchors.g));
  const P = (x, y, w, h, color) => {
    if (anchors.lying) {
      const xx = 24 + (y - 22) * scale, yy = 30 - (x - 24) * scale * 0.28;
      pen(xx, yy, Math.max(1, h * scale), Math.max(1, w * scale * 0.65), color);
    } else pen(24 + (x - 24) * scale, 34 + (y - 34) * scale, Math.max(1, w * scale), Math.max(1, h * scale), color);
  };
  const color = (k) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v * k)) * 255).toString(16).padStart(2, '0')).join('');
  const dark = '#1c1826', mid = color(1), light = color(1.3), shadow = color(0.65), pale = '#dae7dc';
  const dead = snap.alive === false, beat = pose === 'walk2' || pose === 'fly2' ? 1 : 0;
  const E = (cx, cy, rx, ry, body = mid) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (v > 1) continue;
      P(x, y, 1, 1, v > 0.8 ? dark : x + y < cx + cy - 3 ? light : y > cy + ry * 0.45 ? shadow : ((x * 13 + y * 7 + seed) & 31) === 0 ? light : body);
    }
  };
  const eye = (x, y) => { P(x, y, dead ? 3 : 2, 1, dark); if (!dead) P(x, y - 1, 1, 1, pale); };
  if (def.anatomy === 'hare') {
    E(19, 26, 11, 8); E(29, 24, 8, 7); E(34, 17, 6, 6); E(30, 8, 2.3, 8); E(36, 8, 2.4, 7);
    P(29, 1, 3, 3, dark); P(35, 2, 3, 3, dark); P(12, 33, 10, 2, shadow); P(29 + beat, 31, 7, 3, mid); E(7, 27, 3, 3, pale); eye(36, 16);
  } else if (def.anatomy === 'otter' || def.anatomy === 'lizard' || def.anatomy === 'axolotl') {
    for (let j = 0; j < 13; j++) P(2 + j, 28 - Math.floor(j / 5), 2, 2 + Math.floor(j / 5), j < 4 ? shadow : mid);
    E(22, 26, 13, 6); E(35, 23, 7, 5);
    for (const x of [15, 28]) { P(x + beat, 29, 3, 6, shadow); P(x + beat - 2, 34, 6, 2, mid); }
    eye(37, 21);
    if (def.anatomy === 'otter') { E(31, 18, 2, 2); P(37, 25, 6, 2, pale); P(40, 23, 4, 1, dark); }
    if (def.anatomy === 'lizard') { for (let j = 0; j < 9; j++) P(12 + j * 2, 19 - j % 3, 1, 3, light); P(31, 16, 3, 3, '#c58b97'); }
    if (def.anatomy === 'axolotl') for (const y of [18, 22, 26]) { P(27, y, 5, 1, '#d18bc2'); P(26, y - 2, 2, 4, '#b36da9'); P(30, y - 1, 1, 2, '#e7aed7'); }
  } else if (def.anatomy === 'beetle' || def.anatomy === 'scarab') {
    for (let j = 0; j < 3; j++) { P(7 + j * 6, 27 + (j + beat) % 2, 4, 7, dark); P(10 + j * 6, 32, 3, 2, light); }
    E(22, 23, 14, 10); E(36, 24, 6, 5); P(22, 15, 1, 16, dark); P(38, 16, 1, 5, light); P(41, 18, 1, 4, light); eye(38, 23);
    if (def.anatomy === 'scarab') for (let j = 0; j < 7; j++) { const w = Math.abs(j - 3); P(18 - w / 2, 19 + j, w + 2, 1, '#f4cf6a'); }
  } else if (def.anatomy === 'moth') {
    const span = beat ? 11 : 16;
    E(24 - span * 0.55, 18, span * 0.65, 10); E(24 + span * 0.55, 18, span * 0.65, 10);
    E(17, 27, beat ? 5 : 8, 6, shadow); E(31, 27, beat ? 5 : 8, 6, shadow);
    for (const x of [16, 32]) { E(x, 18, 3, 3, pale); P(x, 18, 1, 1, dark); }
    E(24, 23, 3, 11, shadow); P(20, 8, 2, 6, light); P(27, 8, 2, 6, light); eye(23, 14);
  } else if (def.anatomy === 'ray') {
    for (let j = 0; j < 14; j++) { const w = Math.max(2, 17 - Math.abs(j - 6) * 2); P(24 - w, 12 + j, w * 2, 1, j % 4 ? mid : light); }
    E(25, 20, 6, 6); for (let j = 0; j < 12; j++) P(21 - j, 25 + Math.floor(j / 2), 2, 1, light);
    eye(27, 16); P(30, 17, 2, 1, dark);
  } else if (def.anatomy === 'wisp') {
    E(24, 22, 9, 10); E(24, 21, 4, 6, pale);
    for (let j = 0; j < 12; j++) P(23 + Math.round(Math.sin(j * 0.7) * 3), 4 + j, Math.max(1, j / 3), 1, j < 5 ? light : mid);
    for (let j = 0; j < 4; j++) P(16 + j * 4, 32 + (j + beat) % 3, 2, 2, light);
    eye(21, 21); eye(27, 21);
  }
  return true;
}
