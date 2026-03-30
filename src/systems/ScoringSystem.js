/**
 * ScoringSystem.js
 *
 * Manages real-time score accumulation and computes the final Survival Index
 * with a classification rating at the end of an engagement.
 *
 * Score events are called by CollisionSystem; final tallying of surviving
 * buildings happens once when the engagement ends.
 */

import { SCORE, RATINGS } from '@/constants.js';

export class ScoringSystem {
  /**
   * @param {import('@/GameState.js').GameState} gameState
   */
  constructor(gameState) {
    this.gameState = gameState;
  }

  // ── In-flight scoring events ──────────────────────────────────────────────────

  /** Called each time an interceptor kills a hostile. */
  onHostileKilled() {
    this.gameState.addScore(SCORE.HOSTILE_KILL);
  }

  /** Called each time an interceptor expires without a kill. */
  onInterceptorWasted() {
    this.gameState.addScore(SCORE.INTERCEPTOR_WASTE);
  }

  /** Called each time a hostile missile destroys a building. */
  onBuildingDestroyed(tier) {
    this.gameState.addScore(SCORE.BUILDING_DESTROY[tier]);
  }

  // ── End-of-engagement scoring ─────────────────────────────────────────────────

  /**
   * Award survival bonuses for intact buildings.
   * Call this exactly once when transitioning to AFTER_ACTION.
   */
  finalise() {
    for (const building of this.gameState.buildings) {
      if (!building.destroyed) {
        this.gameState.addScore(SCORE.BUILDING_SURVIVE[building.tier]);
      }
    }
  }

  // ── Rating classification ─────────────────────────────────────────────────────

  /**
   * Return the rating entry that matches the current score.
   *
   * @returns {{ label: string, cssClass: string }}
   */
  getRating() {
    const score = this.gameState.stats.score;

    // Walk ratings from highest threshold downward
    for (let i = RATINGS.length - 1; i >= 0; i--) {
      if (score >= RATINGS[i].min) return RATINGS[i];
    }

    return RATINGS[0]; // Fallback — should never be reached
  }
}
