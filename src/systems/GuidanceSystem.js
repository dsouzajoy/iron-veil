/**
 * GuidanceSystem.js
 *
 * Implements the two guidance algorithms for interceptor missiles:
 *
 *   1. Augmented Proportional Navigation (APN) — default
 *      Extends PN by observing the target's lateral acceleration each frame
 *      and adding a corrective term:
 *        lateralAccelCommand = N × Vc × λ̇  +  (N/2) × gain × aT_perp
 *      Dramatically improves performance against maneuvering targets.
 *
 *   2. Proportional Navigation (PN) — fallback
 *      Lateral acceleration = N × closing velocity × LOS rate.
 *      Effective against constant-velocity targets.
 *
 * Both algorithms output an updated `angle` on the interceptor.
 * GuidanceSystem does NOT move missiles — call interceptor.move(dt) after.
 */

import { GUIDANCE } from '@/constants.js';

export class GuidanceSystem {
  /**
   * Apply guidance to a single interceptor for one simulation tick.
   *
   * @param {import('@/entities/Interceptor.js').Interceptor} interceptor
   * @param {import('@/entities/HostileMissile.js').HostileMissile} target
   * @param {number} dt  Delta time (seconds, pre-scaled)
   */
  guide(interceptor, target, dt) {
    if (!interceptor.active || !target.active) return;

    switch (interceptor.guidance) {
      case GUIDANCE.PROPORTIONAL:
        this._proportionalNav(interceptor, target, dt);
        break;

      case GUIDANCE.APN:
      default:
        this._augmentedPN(interceptor, target, dt);
        break;
    }
  }

  // ── Augmented Proportional Navigation ────────────────────────────────────────

  /**
   * APN extends PN with a feed-forward correction for the target's lateral
   * acceleration, derived from the change in the target's velocity since the
   * previous frame.
   *
   * Algorithm:
   *   1. Compute LOS angle, LOS rate, and closing speed (same as PN).
   *   2. Estimate target lateral acceleration from velocity delta.
   *   3. Total command = N × Vc × λ̇  +  (N/2) × gain × aT_perp
   *   4. Convert to angular velocity and cap by turnRate.
   *
   * @param {import('@/entities/Interceptor.js').Interceptor} interceptor
   * @param {import('@/entities/HostileMissile.js').HostileMissile} target
   * @param {number} dt
   */
  _augmentedPN(interceptor, target, dt) {
    const dx = target.x - interceptor.x;
    const dy = target.y - interceptor.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.1) return;

    const losAngle = Math.atan2(dy, dx);

    // First frame — initialise LOS state and steer directly toward target
    if (interceptor.prevLosAngle === null) {
      interceptor.prevLosAngle = losAngle;
      this._rotateToward(interceptor, losAngle, dt);
      return;
    }

    // LOS rate (rad/s)
    const losRate = _angleDiff(losAngle, interceptor.prevLosAngle) / dt;
    interceptor.prevLosAngle = losAngle;

    // LOS unit vector
    const ux = dx / dist;
    const uy = dy / dist;

    // Closing speed (magnitude of relative velocity along LOS)
    const closingSpeed = Math.abs(
      (target.vx - interceptor.vx) * ux +
      (target.vy - interceptor.vy) * uy,
    );

    const N = interceptor.navigationConstant;

    // ── PN base term ────────────────────────────────────────────────────────
    let lateralAccel = N * closingSpeed * losRate;

    // ── APN correction: target lateral acceleration ─────────────────────────
    // Perpendicular to LOS (90° CCW): (-uy, ux)
    // Target acceleration estimated from velocity delta this frame
    if (dt > 0) {
      const targetAx = (target.vx - target.prevVx) / dt;
      const targetAy = (target.vy - target.prevVy) / dt;
      const targetLateralAccel = targetAx * (-uy) + targetAy * ux;
      lateralAccel += (N / 2) * interceptor.apnCorrectionGain * targetLateralAccel;
    }

    // Convert accel to angular velocity: a = v × dθ/dt  →  dθ/dt = a / v
    const angularVel    = lateralAccel / (interceptor.speed || 1);
    const maxAngularVel = interceptor.turnRate;
    const clampedDelta  = Math.max(-maxAngularVel, Math.min(maxAngularVel, angularVel)) * dt;
    interceptor.angle  += clampedDelta;
  }

  // ── Proportional Navigation ───────────────────────────────────────────────────

  /**
   * Apply lateral acceleration proportional to the LOS rotation rate.
   *
   * Algorithm:
   *   1. Compute current LOS angle from interceptor to target.
   *   2. Compute LOS rate = Δangle / dt.
   *   3. Lateral acceleration = N × closingSpeed × LOS rate.
   *   4. Convert to heading change and cap by turnRate.
   *
   * @param {import('@/entities/Interceptor.js').Interceptor} interceptor
   * @param {import('@/entities/HostileMissile.js').HostileMissile} target
   * @param {number} dt
   */
  _proportionalNav(interceptor, target, dt) {
    const dx = target.x - interceptor.x;
    const dy = target.y - interceptor.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.1) return;

    const losAngle = Math.atan2(dy, dx);

    // First frame — just record the LOS angle, steer straight toward target
    if (interceptor.prevLosAngle === null) {
      interceptor.prevLosAngle = losAngle;
      this._rotateToward(interceptor, losAngle, dt);
      return;
    }

    // LOS rate (rad/s)
    let losRate = _angleDiff(losAngle, interceptor.prevLosAngle) / dt;
    interceptor.prevLosAngle = losAngle;

    // Closing speed (dot product of relative velocity with LOS unit vector)
    const ux = dx / dist;
    const uy = dy / dist;
    const closingSpeed = Math.abs(
      (target.vx - interceptor.vx) * ux +
      (target.vy - interceptor.vy) * uy,
    );

    const N = interceptor.navigationConstant;

    // Required lateral acceleration → heading change
    const lateralAccel   = N * closingSpeed * losRate;
    // Convert accel to angular velocity: a = v * dθ/dt → dθ/dt = a / v
    const angularVel     = lateralAccel / (interceptor.speed || 1);
    const maxAngularVel  = interceptor.turnRate;

    const clampedDelta = Math.max(-maxAngularVel, Math.min(maxAngularVel, angularVel)) * dt;
    interceptor.angle += clampedDelta;
  }

  // ── Shared rotation helper ────────────────────────────────────────────────────

  /**
   * Rotate `interceptor.angle` toward `desiredAngle` by at most
   * `turnRate × dt` radians.
   *
   * @param {import('@/entities/Interceptor.js').Interceptor} interceptor
   * @param {number} desiredAngle  Target angle (radians)
   * @param {number} dt
   */
  _rotateToward(interceptor, desiredAngle, dt) {
    const diff     = _angleDiff(desiredAngle, interceptor.angle);
    const maxTurn  = interceptor.turnRate * dt;
    const turn     = Math.max(-maxTurn, Math.min(maxTurn, diff));
    interceptor.angle += turn;
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Returns the shortest signed angle difference from `from` to `to`,
 * normalised to the range (-π, π].
 *
 * @param {number} to
 * @param {number} from
 * @returns {number} radians
 */
function _angleDiff(to, from) {
  let diff = to - from;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}
