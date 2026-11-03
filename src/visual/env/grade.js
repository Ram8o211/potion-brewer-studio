// The last pass on a wild region's painting, after its lights: the grade
// that makes it crisp and vivid rather than soft and hazy.
//
//   - contrast: an S-curve on every channel, deepening the shadows and
//     lifting the lights while leaving black and white where they are;
//   - colour: saturation raised round each pixel's own brightness, most in
//     the dull mid-tones, never pushing what is already vivid off its hue;
//   - edges: the rock's silhouette inked — its sides and underside against
//     the air a pixel darker — so every pillar and ledge stands out sharp
//     from what lies behind it.
//
// Per-pixel and pure, applied alike to the painting, the bare painting
// under the swaying foliage and the foliage itself, so the leaves keep
// matching what they were painted over.

/** How strong each region's grade is: [contrast, saturation, edge ink]. */
const GRADE = {
  meadow: [0.25, 1.18, 0.42], forest: [0.24, 1.16, 0.42], netherwood: [0.18, 1.18, 0.4], river: [0.24, 1.18, 0.42],
  quarry: [0.23, 1.12, 0.42], moonfen: [0.18, 1.18, 0.4], crags: [0.2, 1.14, 0.42],
  // the farm's enclosures (pens.js): the wilds' look, no ground silhouette to ink
  pen: [0.25, 1.18, 0],
};

/** The S-curve, 0..255 → 0..255, as a table. @param {number} k */
function curve(k) {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255, s = v * v * (3 - 2 * v);
    t[i] = Math.max(0, Math.min(255, Math.round((v + (s - v) * k * 1.6) * 255)));
  }
  return t;
}

/**
 * Grade a pixel: the curve on each channel, then saturation round its brightness.
 * @param {number} c @param {Uint8Array} T @param {number} sat
 */
function gradePx(c, T, sat) {
  let r = T[c & 255], g = T[(c >>> 8) & 255], b = T[(c >>> 16) & 255];
  const l = 0.3 * r + 0.59 * g + 0.11 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  // dull colours gain the most; what is vivid already gains little
  const chroma = (mx - mn) / 255, k = 1 + (sat - 1) * (1 - chroma * 0.7);
  r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
  const cl = (/** @type {number} */ v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  return ((c & 0xff000000) | (cl(b) << 16) | (cl(g) << 8) | cl(r)) >>> 0;
}

/**
 * Grade a composed, finished region (see the head of the file).
 * @param {any} cv the region's Canvas (paint.js) @param {string} region
 */
export function grade(cv, region) {
  const [con, sat, ink] = GRADE[region] || [0.38, 1.28, 0.4];
  const T = curve(con), W = cv.W, H = cv.H, S = cv.solid, px = cv.pix.px, s = cv.sw;
  // the rock's silhouette first, on the graded colours' source (ground with air beside or under it)
  const air = (/** @type {number} */ k) => !S[k] && !cv.liquid[k] && !cv.rock[k];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const k = y * W + x;
    if (!S[k] || cv.liquid[k]) continue;
    // (the grass on top keeps its bright edge)
    if (!(air(k - 1) || air(k + 1) || air(k + W)) || air(k - W)) continue;
    px[k] = mul(px[k], 1 - ink);
    if (s) s.bare[k] = mul(s.bare[k], 1 - ink);
  }
  for (let k = 0; k < px.length; k++) px[k] = gradePx(px[k], T, sat);
  if (s) {
    for (let k = 0; k < s.bare.length; k++) s.bare[k] = gradePx(s.bare[k], T, sat);
    for (let i = 0; i < s.c.length; i++) s.c[i] = gradePx(s.c[i], T, sat);
  }
}

/** A colour darkened by factor f (0..1). @param {number} c @param {number} f */
function mul(c, f) {
  return ((c & 0xff000000) | (Math.round(((c >>> 16) & 255) * f) << 16) | (Math.round(((c >>> 8) & 255) * f) << 8) | Math.round((c & 255) * f)) >>> 0;
}
