import { artDomain } from './direction.js';
import { hex } from '../visual/color.js';
export function directLook(look) {
  if (!look) return look;
  const cfg = artDomain('creatures', look.kind || 'rabbit');
  if (!cfg) return look;
  return { ...look, ...(cfg.recolor ? { coat: hex(cfg.coat), coat2: hex(cfg.coat2) } : {}), ...(cfg.pattern ? { pattern: cfg.pattern } : {}) };
}
/** Adjust visual anchors inside the original frame. Simulation/warren hit boxes are untouched. */
export function directAnatomy(a) {
  const c = artDomain('creatures', a.kind); if (!c) return a;
  const pose = c.poses[a.pose] || {};
  if (['body', 'head', 'ears', 'legs', 'tail'].every((k) => c[k] === 1) && !Object.keys(pose).length) return a;
  for (const p of [a.haunch, a.chest]) { p.rx = Math.min(14, Math.max(2, p.rx * c.body)); p.ry = Math.min(12, Math.max(2, p.ry * c.body)); }
  const dx = pose.headX || 0, dy = pose.headY || 0;
  a.head.rx = Math.min(7, a.head.rx * c.head); a.head.ry = Math.min(7, a.head.ry * c.head); a.head.cx += dx; a.head.cy += dy;
  for (const p of [a.eye, a.eye3, a.nose, a.cheek, a.brow, a.wing]) { p.x += dx; p.y += dy; }
  a.muzzle.cx += dx; a.muzzle.cy += dy;
  for (const e of a.ears) { e.x += dx; e.y += dy; e.len = Math.max(1, Math.min(16, e.len * c.ears + (pose.ear || 0))); }
  for (const l of a.legs) { l.w = Math.max(1, l.w * c.legs); l.h = Math.max(1, l.h * c.legs); }
  a.tail.r = Math.min(5, a.tail.r * c.tail); a.tail.len = Math.min(16, a.tail.len * c.tail);
  return a;
}
export const creatureClock = (look, time) => time * (artDomain('creatures', look?.kind || 'rabbit')?.speed || 1);
