// Active-play time only. No wall-clock timestamp is used for customer patience.
export const ORDERS = Object.freeze({ basePatience: 600, minPatience: 300, maxPatience: 1500, minPayment: 0.7, specialMultiplier: 2.5, pickupGraceDays: 3 });
export function startService(com, rank = 0) {
  if (!com || com.tutorial || com.special) return com;
  if (com.service && Number.isFinite(com.service.duration) && com.service.duration >= ORDERS.minPatience) {
    com.service.duration = Math.min(ORDERS.maxPatience, com.service.duration);
    com.service.elapsed = Number.isFinite(com.service.elapsed) ? Math.max(0, Math.min(com.service.duration, com.service.elapsed)) : 0;
    return com;
  }
  const complexity = (com.requirements || []).filter((r) => r.key !== 'purity').length + (com.techniques?.length || 0);
  const personality = Number(com.customer?.persona?.patience) || 3;
  com.service = { elapsed: 0, duration: Math.min(ORDERS.maxPatience, Math.max(ORDERS.minPatience, ORDERS.basePatience + complexity * 90 + (personality - 3) * 60 + rank * 30)) };
  return com;
}
export function serviceStatus(com) {
  const s = com?.service;
  const fraction = s ? Math.max(0, Math.min(1, 1 - s.elapsed / s.duration)) : 1;
  return { fraction, expired: !!s && fraction === 0, payment: ORDERS.minPayment + (1 - ORDERS.minPayment) * fraction };
}
export function waitForService(com, dt, active = true) {
  if (!active || !com?.service || !Number.isFinite(dt) || dt <= 0) return false;
  // A suspended tab or a stalled frame must not consume the missed interval.
  if (dt > 1) return false;
  com.service.elapsed = Math.min(com.service.duration, com.service.elapsed + dt);
  return serviceStatus(com).expired;
}
export function normalizeSpecialOrders(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.filter((o) => {
    if (!o || typeof o.id !== 'string' || seen.has(o.id) || !o.request?.requirements?.length || !Number.isSafeInteger(o.pickupDay) || o.pickupDay < 1 || !Number.isFinite(o.reward) || o.reward <= 0) return false;
    seen.add(o.id); return true;
  }).slice(0, 4).map((o) => ({ ...o, request: { ...o.request, special: true } }));
}
