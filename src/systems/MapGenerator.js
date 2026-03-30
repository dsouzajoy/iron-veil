/**
 * MapGenerator.js
 *
 * Generates a randomized set of Building installations for each engagement
 * using Poisson-disc sampling to ensure a minimum separation distance
 * between buildings and prevent visual overlap.
 *
 * Tier weighting: Tier III (HQ) buildings are biased toward the map center;
 * lower-tier buildings scatter more freely across the defended zone.
 */

import { Building }        from '@/entities/Building.js';
import { BUILDING_TIERS }  from '@/constants.js';

// Minimum separation (px) between any two building centers
const MIN_DIST = 80;

// Poisson-disc candidate attempts before giving up on an active point
const MAX_CANDIDATES = 30;

/**
 * Generate `count` Building instances placed within the defended zone
 * (below the launch zone) of the canvas.
 *
 * @param {object}          opts
 * @param {number}          opts.canvasWidth
 * @param {number}          opts.canvasHeight
 * @param {number}          opts.count           Total number of buildings to place
 * @param {number}          opts.tierIIIPercent  Percentage (0-60) that should be Tier III
 * @param {Float32Array|null} [opts.frontline]   Frontline y-values; null → flat fallback
 * @returns {Building[]}
 */
export function generateMap({ canvasWidth, canvasHeight, count, tierIIIPercent, frontline = null }) {
  const padding = 40;
  const xMin = padding;
  const xMax = canvasWidth - padding;

  // Use the maximum (lowest on-screen) frontline y across the full width as the
  // global yMin. This guarantees all placed buildings are below the frontline
  // at every x position, avoiding the need to post-filter sampled points.
  const yMin = frontline
    ? _maxFrontlineY(frontline, xMin, xMax) + padding
    : canvasHeight * 0.40 + padding;  // flat fallback

  const yMax = canvasHeight - padding;

  const positions = poissonDisc(xMin, xMax, yMin, yMax, MIN_DIST, count);

  // Assign tiers according to percentage split
  const tiers = _assignTiers(positions.length, tierIIIPercent);

  // Counters for generating unique numeric suffixes per label prefix
  const labelCounters = { OBJ: 0, COM: 0, CMD: 0 };

  return positions.map((pos, i) => {
    const tier  = tiers[i];
    const prefix = BUILDING_TIERS[tier].label;
    labelCounters[prefix]++;
    const label = `${prefix}-${String(labelCounters[prefix]).padStart(2, '0')}`;

    return new Building({ x: pos.x, y: pos.y, tier, label });
  });
}

// ── Poisson-disc sampling ─────────────────────────────────────────────────────

/**
 * Returns an array of at most `maxPoints` {x, y} positions within the
 * rectangle [xMin,xMax] × [yMin,yMax] with pairwise distance >= minDist.
 *
 * Uses Bridson's fast Poisson-disc algorithm.
 *
 * @param {number} xMin
 * @param {number} xMax
 * @param {number} yMin
 * @param {number} yMax
 * @param {number} minDist   Minimum separation between points
 * @param {number} maxPoints Cap on total output points
 * @returns {Array<{x:number, y:number}>}
 */
function poissonDisc(xMin, xMax, yMin, yMax, minDist, maxPoints) {
  const cellSize = minDist / Math.SQRT2;
  const cols     = Math.ceil((xMax - xMin) / cellSize);
  const rows     = Math.ceil((yMax - yMin) / cellSize);

  // 2D grid of accepted point indices (-1 = empty)
  const grid = new Array(cols * rows).fill(-1);

  const points  = [];
  const active  = []; // indices into `points` of still-active candidates

  /** Map world coord to grid cell index. */
  const cellIdx = (x, y) => {
    const col = Math.floor((x - xMin) / cellSize);
    const row = Math.floor((y - yMin) / cellSize);
    return row * cols + col;
  };

  /** Check that point (x,y) is far enough from all neighbors. */
  const isFar = (x, y) => {
    const col0 = Math.floor((x - xMin) / cellSize);
    const row0 = Math.floor((y - yMin) / cellSize);

    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = row0 + dr;
        const c = col0 + dc;
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const idx = grid[r * cols + c];
        if (idx === -1) continue;
        const p = points[idx];
        if (Math.hypot(p.x - x, p.y - y) < minDist) return false;
      }
    }
    return true;
  };

  /** Add point to accepted list and grid. */
  const addPoint = (x, y) => {
    const idx = points.length;
    points.push({ x, y });
    active.push(idx);
    grid[cellIdx(x, y)] = idx;
  };

  // Seed with a random initial point
  addPoint(
    xMin + Math.random() * (xMax - xMin),
    yMin + Math.random() * (yMax - yMin),
  );

  while (active.length > 0 && points.length < maxPoints) {
    // Pick a random active point
    const pickIdx   = Math.floor(Math.random() * active.length);
    const sourceIdx = active[pickIdx];
    const source    = points[sourceIdx];

    let placed = false;

    for (let attempt = 0; attempt < MAX_CANDIDATES; attempt++) {
      // Random point in annulus [minDist, 2*minDist] around source
      const angle = Math.random() * 2 * Math.PI;
      const r     = minDist + Math.random() * minDist;
      const cx    = source.x + Math.cos(angle) * r;
      const cy    = source.y + Math.sin(angle) * r;

      if (cx < xMin || cx > xMax || cy < yMin || cy > yMax) continue;
      if (!isFar(cx, cy)) continue;

      addPoint(cx, cy);
      placed = true;

      if (points.length >= maxPoints) break;
    }

    if (!placed) {
      // Exhausted — remove from active list
      active.splice(pickIdx, 1);
    }
  }

  return points;
}

// ── Frontline helpers ─────────────────────────────────────────────────────────

/**
 * Return the maximum (lowest on-screen) frontline y value within [xMin, xMax].
 * Used to compute the safe global yMin for Poisson-disc building placement.
 *
 * @param {Float32Array} frontline
 * @param {number} xMin
 * @param {number} xMax
 * @returns {number}
 */
function _maxFrontlineY(frontline, xMin, xMax) {
  let max = 0;
  const lo = Math.floor(xMin);
  const hi = Math.min(Math.ceil(xMax), frontline.length - 1);
  for (let x = lo; x <= hi; x++) {
    if (frontline[x] > max) max = frontline[x];
  }
  return max;
}

// ── Tier assignment ───────────────────────────────────────────────────────────

/**
 * Produces an array of tier indices (0,1,2) of length `count`.
 * Tier III count is derived from `tierIIIPercent`.
 * Remaining slots are split roughly 50/50 between Tier I and Tier II.
 *
 * The array is then shuffled so tiers are distributed across positions
 * (EntityRenderer sorts HQ toward center visually via position bias).
 *
 * @param {number} count
 * @param {number} tierIIIPercent  0-60
 * @returns {number[]}  Array of 0|1|2 values
 */
function _assignTiers(count, tierIIIPercent) {
  const nIII = Math.max(0, Math.round(count * (tierIIIPercent / 100)));
  const nII  = Math.round((count - nIII) / 2);
  const nI   = count - nIII - nII;

  const tiers = [
    ...Array(nI).fill(0),
    ...Array(nII).fill(1),
    ...Array(nIII).fill(2),
  ];

  // Fisher-Yates shuffle
  for (let i = tiers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiers[i], tiers[j]] = [tiers[j], tiers[i]];
  }

  return tiers;
}
