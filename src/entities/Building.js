/**
 * Building.js  (INSTALLATION)
 *
 * Represents a player-side installation that hostile missiles are targeting.
 * Pure data + a minimal update hook; all rendering is handled by EntityRenderer.
 *
 * Tier mapping:
 *   0 = Tier I  — small city outpost   (OBJ-xx)
 *   1 = Tier II — comms installation   (COM-xx)
 *   2 = Tier III — command HQ          (CMD-xx)
 */

import { BUILDING_TIERS } from '@/constants.js';

export class Building {
  /**
   * @param {object} opts
   * @param {number} opts.x         Logical X position (0..canvasWidth)
   * @param {number} opts.y         Logical Y position (0..canvasHeight)
   * @param {number} opts.tier      0 | 1 | 2
   * @param {string} opts.label     Generated label e.g. "CMD-HQ-04"
   */
  constructor({ x, y, tier, label }) {
    this.x     = x;
    this.y     = y;
    this.tier  = tier;   // 0-based
    this.label = label;

    // Collision radius scales with tier importance
    this.radius    = BUILDING_TIERS[tier].radius;
    this.icon      = BUILDING_TIERS[tier].icon;

    this.destroyed = false;
  }

  /** Mark this installation as destroyed. */
  destroy() {
    this.destroyed = true;
  }
}
