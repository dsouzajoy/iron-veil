/**
 * GuidanceSystem.js
 *
 * Implements the two guidance algorithms for interceptor missiles:
 *
 *   1. Predictive Pursuit (default)
 *      Projects the hostile's future position and steers toward it.
 *      Simple and effective for constant-velocity targets.
 *
 *   2. Proportional Navigation (PN)
 *      Measures the rate of change of the line-of-sight angle and applies
 *      lateral acceleration proportional to that rate × navigation constant N.
 *      More accurate against maneuvering targets.
 *
 * Both algorithms output an updated `angle` on the interceptor.
 * GuidanceSystem does NOT move missiles — call interceptor.move(dt) after.
 */

import { GUIDANCE, PN_CONSTANT } from '@/constants.js';

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
      case GUIDANCE.PREDICTIVE:
        this._predictivePursuit(interceptor, target, dt);
        break;

      case GUIDANCE.PROPORTIONAL:
        this._proportionalNav(interceptor, target, dt);
        break;

      default:
        this._predictivePursuit(interceptor, target, dt);
    }
  }

  // ── Predictive Pursuit ────────────────────────────────────────────────────────

  /**
   * Estimate where the hostile will be when the interceptor arrives and steer
   * toward that predicted intercept point.
   *
   * Algorithm:
   *   1. Compute distance from interceptor to hostile's current position.
   *   2. Estimate time-to-intercept = dist / interceptorSpeed.
   *   3. Project hostile's future position using its current velocity.
   *   4. Compute desired heading to future position.
   *   5. Rotate actual heading toward desired, capped by turnRate.
   *
   * @param {import('@/entities/Interceptor.js').Interceptor} interceptor
   * @param {import('@/entities/HostileMissile.js').HostileMissile} target
   * @param {number} dt
   */
  _predictivePursuit(interceptor, target, dt) {
    const dx = target.x - interceptor.x;
    const dy = target.y - interceptor.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.1) return; // Already at target

    // Time estimate — one iteration is sufficient for smooth curves
    const tEstimate = dist / interceptor.speed;

    // Predicted hostile position
    const futureX = target.x + target.vx * tEstimate;
    const futureY = target.y + target.vy * tEstimate;

    // Desired heading angle toward predicted intercept point
    const desiredAngle = Math.atan2(futureY - interceptor.y, futureX - interceptor.x);

    this._rotateToward(interceptor, desiredAngle, dt);
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

    // Required lateral acceleration → heading change
    const lateralAccel   = PN_CONSTANT * closingSpeed * losRate;
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
