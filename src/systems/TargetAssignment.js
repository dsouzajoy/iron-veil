/**
 * TargetAssignment.js
 *
 * Autonomous fire-control logic for each Battery.
 *
 * Each frame (during ENGAGEMENT) this system:
 *   1. Cleans up stale target assignments (intercepted / impacted hostiles).
 *   2. For each battery that has no assigned target, finds the nearest
 *      active hostile within the engagement envelope.
 *   3. When a battery is ready to fire (cooldown expired, ammo remaining),
 *      launches a new Interceptor toward the assigned hostile.
 *
 * Deduplication rule: a hostile is only considered "already handled" if it
 * has an *active* interceptor pursuing it from this specific battery.
 * If the interceptor is lost, the battery can fire again.
 */

import { Interceptor } from '@/entities/Interceptor.js';

export class TargetAssignment {
  /**
   * @param {import('@/GameState.js').GameState} gameState
   * @param {import('./GuidanceSystem.js').GuidanceSystem} guidanceSystem
   */
  constructor(gameState, guidanceSystem) {
    this.gameState      = gameState;
    this.guidanceSystem = guidanceSystem;
  }

  /**
   * Run one tick of the fire-control loop.
   * @param {number} dt  Delta time (seconds, pre-scaled)
   */
  update(dt) {
    const gs = this.gameState;

    for (let bi = 0; bi < gs.batteries.length; bi++) {
      const battery = gs.batteries[bi];

      // Skip destroyed batteries
      if (battery.destroyed) continue;

      // Advance fire-rate cooldown
      battery.timeSinceLastShot += dt;

      // ── 1. Validate existing target assignment ────────────────────────────
      if (battery.currentTargetId !== null) {
        const target = gs.hostiles.find(h => h.id === battery.currentTargetId);

        if (!target || !target.active) {
          // Target gone — clear assignment so battery searches again
          battery.currentTargetId = null;
        } else {
          // Check if an active interceptor from THIS battery is still alive
          const hasLiveInterceptor = gs.interceptors.some(
            intr => intr.active &&
                    intr.targetId     === battery.currentTargetId &&
                    intr.batteryIndex === bi,
          );

          if (!hasLiveInterceptor) {
            // Interceptor lost — allow re-fire at same target
            // (currentTargetId stays set so we re-fire without searching)
          }
        }
      }

      // ── 2. Find a target if none assigned ────────────────────────────────
      if (battery.currentTargetId === null) {
        battery.currentTargetId = this._findTarget(battery, bi);
      }

      if (battery.currentTargetId === null) continue; // Nothing in range

      // ── 3. Check fire conditions ─────────────────────────────────────────
      const target = gs.hostiles.find(h => h.id === battery.currentTargetId);
      if (!target || !target.active) { battery.currentTargetId = null; continue; }

      const cooldownMet    = battery.timeSinceLastShot >= 1 / battery.fireRate;
      const hasAmmo        = battery.ammo > 0;
      const noLiveRound    = !gs.interceptors.some(
        intr => intr.active &&
                intr.targetId     === battery.currentTargetId &&
                intr.batteryIndex === bi,
      );

      if (cooldownMet && hasAmmo && noLiveRound) {
        this._fire(battery, bi, target);
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /**
   * Find the nearest active hostile within this battery's engagement range.
   * Returns the hostile's ID, or null if none found.
   *
   * @param {import('@/entities/Battery.js').Battery} battery
   * @param {number} batteryIndex
   * @returns {number|null}
   */
  _findTarget(battery, batteryIndex) {
    let bestId   = null;
    let bestDist = Infinity;

    for (const hostile of this.gameState.hostiles) {
      if (!hostile.active) continue;

      const dist = Math.hypot(hostile.x - battery.x, hostile.y - battery.y);
      if (dist > battery.range)  continue;
      if (dist >= bestDist)      continue;

      bestDist = dist;
      bestId   = hostile.id;
    }

    return bestId;
  }

  /**
   * Create and register a new Interceptor from this battery toward the target.
   *
   * @param {import('@/entities/Battery.js').Battery} battery
   * @param {number} batteryIndex
   * @param {import('@/entities/HostileMissile.js').HostileMissile} target
   */
  _fire(battery, batteryIndex, target) {
    const gs = this.gameState;

    const interceptor = new Interceptor({
      x:                   battery.x,
      y:                   battery.y,
      targetId:            target.id,
      speed:               battery.interceptorSpeed,
      turnRate:            battery.turnRate,
      killRadius:          battery.killRadius,
      guidance:            battery.guidance,
      navigationConstant:  battery.navigationConstant,
      apnCorrectionGain:   battery.apnCorrectionGain,
      batteryIndex,
    });

    // Point the interceptor toward the target's current position to start
    interceptor.angle = Math.atan2(target.y - battery.y, target.x - battery.x);

    gs.interceptors.push(interceptor);
    gs.recordInterceptorFired();

    battery.ammo--;
    battery.timeSinceLastShot = 0;
  }
}
