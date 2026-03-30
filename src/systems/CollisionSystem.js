/**
 * CollisionSystem.js
 *
 * Detects and resolves collisions each frame during ENGAGEMENT:
 *
 *   1. Interceptor ↔ Hostile  — detonation within killRadius
 *   2. Hostile ↔ Building     — hostile reaches an installation
 *   3. Hostile ↔ Map boundary — missile exits below the canvas (miss)
 *
 * Spawns Explosion effects and updates GameState statistics and score.
 *
 * Note on tunnelling prevention: callers should cap dt to MAX_DELTA so
 * missiles never jump more than their own kill-radius in one frame.
 */

import { Explosion }   from '@/entities/Explosion.js';
import { SCORE }       from '@/constants.js';

export class CollisionSystem {
  /**
   * @param {import('@/GameState.js').GameState} gameState
   * @param {import('./ScoringSystem.js').ScoringSystem} scoringSystem
   */
  constructor(gameState, scoringSystem) {
    this.gameState     = gameState;
    this.scoringSystem = scoringSystem;
  }

  /**
   * Process all collision checks for the current frame.
   * Modifies entity `.active` flags and pushes Explosion objects.
   */
  update() {
    const gs = this.gameState;

    // ── 1. Interceptor → Hostile ─────────────────────────────────────────────
    for (const intr of gs.interceptors) {
      if (!intr.active) continue;

      for (const hostile of gs.hostiles) {
        if (!hostile.active) continue;

        const dist = Math.hypot(hostile.x - intr.x, hostile.y - intr.y);

        if (dist <= intr.killRadius) {
          // Kill the hostile and the interceptor
          hostile.active = false;
          intr.active    = false;

          gs.explosions.push(new Explosion({ x: hostile.x, y: hostile.y, type: 'intercept' }));

          gs.recordHostileKilled();
          this.scoringSystem.onHostileKilled();
          break; // one interceptor can only kill one hostile per frame
        }
      }
    }

    // ── 2. Hostile → Building ────────────────────────────────────────────────
    for (const hostile of gs.hostiles) {
      if (!hostile.active) continue;

      for (const building of gs.buildings) {
        if (building.destroyed) continue;

        const dist = Math.hypot(building.x - hostile.x, building.y - hostile.y);

        if (dist <= building.radius) {
          hostile.active = false;
          building.destroy();

          gs.explosions.push(new Explosion({ x: hostile.x, y: hostile.y, type: 'impact' }));
          // Secondary explosion on the building itself for visual impact
          gs.explosions.push(new Explosion({ x: building.x, y: building.y, type: 'impact' }));

          gs.recordBuildingDestroyed(building);
          this.scoringSystem.onBuildingDestroyed(building.tier);
          break;
        }
      }
    }

    // ── 2b. Hostile → Battery ────────────────────────────────────────────────
    for (const hostile of gs.hostiles) {
      if (!hostile.active) continue;

      for (const battery of gs.batteries) {
        if (battery.destroyed) continue;

        const dist = Math.hypot(battery.x - hostile.x, battery.y - hostile.y);

        if (dist <= battery.radius) {
          hostile.active = false;
          battery.destroy();

          gs.explosions.push(new Explosion({ x: hostile.x, y: hostile.y, type: 'impact' }));
          gs.explosions.push(new Explosion({ x: battery.x, y: battery.y, type: 'impact' }));

          gs.recordBatteryDestroyed(battery);
          break;
        }
      }
    }

    // ── 3. Hostile exits below canvas (miss — no penalty) ───────────────────
    for (const hostile of gs.hostiles) {
      if (!hostile.active) continue;
      if (hostile.y > gs.canvasHeight + 20) {
        hostile.active = false;
      }
    }

    // ── 4. Interceptor lifetime expiry → wasted shot ────────────────────────
    for (const intr of gs.interceptors) {
      // Interceptor.move() marks active=false on expiry.
      // We detect that transition here (one-shot) by checking a flag.
      if (!intr.active && !intr._wastedRecorded) {
        intr._wastedRecorded = true;
        // Only count as wasted if the target is still alive
        const targetStillLive = gs.hostiles.some(
          h => h.id === intr.targetId && h.active,
        );
        if (targetStillLive) {
          gs.recordInterceptorWasted();
          this.scoringSystem.onInterceptorWasted();
        }
      }
    }
  }

  /**
   * Returns true when the engagement is over:
   * all hostiles are resolved (intercepted, impacted, or exited map).
   *
   * @returns {boolean}
   */
  isEngagementOver() {
    return this.gameState.hostiles.every(h => !h.active);
  }
}
