// Baked local light for the pixel scenery. Light lifts the painted material,
// while the air receives a faint bloom. Accumulate sources before shading so
// overlapping mushrooms and lamps do not clip every surface to a flat white.

/** A material's response, preserving its light/dark facets under strong light. */
export function litColour(colour, r, g, b, surface) {
  const shade = (v, energy) => {
    const exposure = 1 - Math.exp(-Math.max(0, energy));
    const lift = surface ? (v * 1.25 + 45) * exposure : 200 * exposure;
    const room = 255 - v;
    return Math.round(v + (room > 0 ? room * (1 - Math.exp(-lift / room)) : 0));
  };
  return ((colour & 0xff000000) | (shade((colour >>> 16) & 255, b) << 16)
    | (shade((colour >>> 8) & 255, g) << 8) | shade(colour & 255, r)) >>> 0;
}

/**
 * Distance to the first rock/terrain surface in each direction from a light.
 * Rays ignore the light's own mounting pixel. A few pixels of penetration
 * light the visible stone face; a whole slab still casts a shadow behind it.
 * @param {any} cv @param {number} x @param {number} y @param {number} radius
 */
function horizons(cv, x, y, radius) {
  const count = 192, out = new Float32Array(count).fill(radius), W = cv.W, H = cv.H;
  for (let i = 0; i < count; i++) {
    const a = i * Math.PI * 2 / count, dx = Math.cos(a), dy = Math.sin(a);
    for (let d = 2; d < radius; d++) {
      const xx = Math.round(x + dx * d), yy = Math.round(y + dy * d);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
      const k = yy * W + xx;
      if (cv.solid[k] || cv.rock[k]) { out[i] = d; break; }
    }
  }
  return out;
}

/**
 * Apply the composition's queued lights to the still painting, its bare
 * background and the wind layers using the same exposure at each home pixel.
 * @param {any} cv @param {[number,number,number,number[],number][]} lights
 */
export function illuminate(cv, lights) {
  if (!lights.length) return;
  const W = cv.W, H = cv.H, N = W * H, sw = cv.sw;
  const energy = new Float32Array(N * 3), surfaces = new Uint8Array(N);
  for (let k = 0; k < N; k++) surfaces[k] = cv.solid[k] || cv.rock[k] || cv.trees[k] || cv.things[k] || cv.liquid[k] ? 1 : 0;
  if (sw) for (let i = 0; i < sw.k.length; i++) {
    const k = sw.k[i];
    // Last visible wind stamp wins, just as in the runtime compositor.
    if (sw.layer[k] <= sw.s[i]) surfaces[k] = sw.far[sw.g[i]] ? 0 : 1;
  }
  for (const [sx, sy, radius, rgb, strength] of lights) {
    if (!(radius > 0) || !(strength > 0)) continue;
    const horizon = horizons(cv, sx, sy, radius), rays = horizon.length;
    for (let y = Math.max(0, Math.floor(sy - radius)); y < Math.min(H, Math.ceil(sy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(sx - radius)); x < Math.min(W, Math.ceil(sx + radius)); x++) {
        const dx = x - sx, dy = y - sy, distance = Math.hypot(dx, dy), d = distance / radius;
        if (d >= 1) continue;
        const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
        const ray = Math.round(angle * rays / (Math.PI * 2)) % rays;
        const penetration = Math.max(0, distance - horizon[ray]);
        // A little scattered bloom reaches round a ledge, while its direct
        // light is shaded. This keeps fungi luminous in the dark cavern.
        const visibility = penetration ? 0.1 + 0.9 * Math.exp(-penetration / 5) : 1;
        const amount = (1 - d) ** 2 * strength * visibility;
        const k = (y * W + x) * 3;
        energy[k] += rgb[0] * amount; energy[k + 1] += rgb[1] * amount; energy[k + 2] += rgb[2] * amount;
      }
    }
  }
  const apply = (colour, k, surface) => litColour(colour, energy[k * 3], energy[k * 3 + 1], energy[k * 3 + 2], surface);
  for (let k = 0; k < N; k++) {
    const same = sw && sw.bare[k] === cv.pix.px[k];
    cv.pix.px[k] = apply(cv.pix.px[k], k, surfaces[k]);
    if (sw) {
      const fixed = cv.solid[k] || cv.rock[k] || cv.things[k] || cv.liquid[k];
      // A moved leaf reveals air behind it, which must not keep the leaf's light.
      sw.bare[k] = apply(sw.bare[k], k, fixed || (cv.trees[k] && same));
    }
  }
  if (sw) for (let i = 0; i < sw.k.length; i++) {
    const k = sw.k[i], surface = !sw.far[sw.g[i]];
    sw.c[i] = apply(sw.c[i], k, surface);
  }
}
