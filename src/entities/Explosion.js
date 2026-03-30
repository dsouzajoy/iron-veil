/**
 * Explosion.js
 *
 * Expanding ring effect spawned on intercept success or building impact.
 * DynamicRenderer reads the public fields each frame to draw the ring.
 *
 * Color convention (matching requirements):
 *   'intercept' → phosphor green ring  (interceptor kills hostile)
 *   'impact'    → red-amber burst       (hostile destroys building)
 */

import { EXPLOSION_DURATION, EXPLOSION_MAX_RADIUS, COLORS } from '@/constants.js';

export class Explosion {
  /**
   * @param {object} opts
   * @param {number} opts.x
   * @param {number} opts.y
   * @param {'intercept'|'impact'} opts.type
   */
  constructor({ x, y, type }) {
    this.x        = x;
    this.y        = y;
    this.type     = type;
    this.elapsed  = 0;
    this.duration = EXPLOSION_DURATION;
    this.maxRadius = EXPLOSION_MAX_RADIUS;
    this.active   = true;

    // Resolved colors for the DynamicRenderer
    this.color = type === 'intercept' ? COLORS.GREEN : COLORS.RED;
    this.colorSecondary = type === 'impact' ? COLORS.AMBER : COLORS.GREEN_GLOW;
  }

  /**
   * Advance the explosion by dt seconds.
   * @param {number} dt
   */
  update(dt) {
    if (!this.active) return;
    this.elapsed += dt;
    if (this.elapsed >= this.duration) this.active = false;
  }

  /** Fraction of animation complete (0..1). */
  get progress() {
    return Math.min(this.elapsed / this.duration, 1);
  }

  /** Current ring radius based on animation progress. */
  get radius() {
    return this.maxRadius * this.progress;
  }

  /** Alpha value that fades out as the explosion ages. */
  get alpha() {
    return 1 - this.progress;
  }
}
