/**
 * FrontlineGenerator.js
 *
 * Generates an irregular procedural frontline curve using the midpoint
 * displacement algorithm. The curve spans the full canvas width and
 * represents the contested boundary between enemy (above) and friendly
 * (below) territory.
 *
 * Two public exports:
 *   generateFrontline — produces a Float32Array of y-values (one per pixel column)
 *   getFrontlineY     — O(1) interpolated lookup into that array
 */

/**
 * Generate a frontline curve using 1D midpoint displacement.
 *
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} roughness       0.0 = nearly flat, 1.0 = highly irregular
 * @param {number} meanAltitude    Fraction from top (0.30–0.60). Default: 0.40.
 * @returns {Float32Array}  Length = canvasWidth + 1. Entry [x] is the frontline
 *                          y-value at pixel column x.
 */
export function generateFrontline(canvasWidth, canvasHeight, roughness, meanAltitude) {
  // ── 1. Size the working array to the next power of 2 ──────────────────────
  // Midpoint displacement requires a power-of-2 number of segments so every
  // recursive bisection lands on an integer index.
  let N = 1;
  while (N < canvasWidth) N <<= 1;

  const temp = new Float32Array(N + 1);

  // ── 2. Set endpoints at mean altitude ─────────────────────────────────────
  const meanY = canvasHeight * meanAltitude;
  temp[0] = meanY;
  temp[N] = meanY;

  // Maximum vertical displacement — scales with roughness and canvas height.
  // At roughness=0.5 and a 600px-tall canvas, initialRange ≈ 60px.
  const initialRange = canvasHeight * 0.20 * roughness;

  // ── 3. Recursive midpoint displacement ────────────────────────────────────
  // At each depth d the displacement range shrinks by a factor that preserves
  // more energy (larger features) at high roughness values.
  _displace(temp, 0, N, initialRange, roughness);

  // ── 4. Clamp to safe screen bounds ────────────────────────────────────────
  const minY = canvasHeight * 0.05;
  const maxY = canvasHeight * 0.80;
  for (let i = 0; i <= N; i++) {
    if (temp[i] < minY) temp[i] = minY;
    if (temp[i] > maxY) temp[i] = maxY;
  }

  // ── 5. Resample from power-of-2 space to canvasWidth + 1 columns ──────────
  const out = new Float32Array(canvasWidth + 1);
  const scale = N / canvasWidth;
  for (let x = 0; x <= canvasWidth; x++) {
    const t    = x * scale;
    const lo   = Math.floor(t);
    const hi   = Math.min(lo + 1, N);
    const frac = t - lo;
    out[x] = temp[lo] * (1 - frac) + temp[hi] * frac;
  }

  return out;
}

/**
 * Sample the frontline y-value at canvas column x using linear interpolation.
 *
 * @param {Float32Array} points  Output of generateFrontline()
 * @param {number}       x       Canvas x coordinate (may be fractional)
 * @returns {number}             Interpolated y value
 */
export function getFrontlineY(points, x) {
  const clamped = Math.max(0, Math.min(x, points.length - 2));
  const lo   = Math.floor(clamped);
  const frac = clamped - lo;
  return points[lo] * (1 - frac) + points[lo + 1] * frac;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Recursively bisect the segment [left, right] in `arr`, displacing the
 * midpoint by a random amount in [-range, +range].
 *
 * The range decay factor is `0.5^(1 - roughness * 0.4)`:
 *   roughness = 0.0 → factor ≈ 0.50  (fast decay = smooth)
 *   roughness = 1.0 → factor ≈ 0.76  (slow decay = jagged)
 *
 * @param {Float32Array} arr
 * @param {number} left
 * @param {number} right
 * @param {number} range   Current displacement magnitude
 * @param {number} roughness
 */
function _displace(arr, left, right, range, roughness) {
  if (right - left <= 1) return;

  const mid  = (left + right) >> 1;
  const disp = (Math.random() * 2 - 1) * range;
  arr[mid]   = (arr[left] + arr[right]) / 2 + disp;

  const decay    = Math.pow(0.5, 1 - roughness * 0.4);
  const newRange = range * decay;

  _displace(arr, left,  mid,   newRange, roughness);
  _displace(arr, mid,   right, newRange, roughness);
}
