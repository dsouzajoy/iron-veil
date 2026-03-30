/**
 * Interceptor.js  (IRON / INTERCEPTOR MISSILE)
 *
 * Represents an interceptor missile fired by a Battery.
 * Movement and guidance are applied externally by GuidanceSystem each frame —
 * this class is responsible only for holding state and advancing position.
 */

import { INTERCEPTOR_LIFETIME, TRAIL_LENGTH } from '@/constants.js';

let _nextId = 0;

export class Interceptor {
  /**
   * @param {object} opts
   * @param {number} opts.x             Launch X (battery position)
   * @param {number} opts.y             Launch Y
   * @param {number} opts.targetId      ID of the HostileMissile being tracked
   * @param {number} opts.speed         px/s (from Battery)
   * @param {number} opts.turnRate      rad/s (from Battery)
   * @param {number} opts.killRadius    px (from Battery)
   * @param {string} opts.guidance      'predictive' | 'proportional'
   * @param {number} opts.batteryIndex  Which battery fired this (for dedup)
   */
  constructor({ x, y, targetId, speed, turnRate, killRadius, guidance, batteryIndex }) {
    this.id           = _nextId++;
    this.x            = x;
    this.y            = y;
    this.targetId     = targetId;
    this.speed        = speed;
    this.turnRate     = turnRate;
    this.killRadius   = killRadius;
    this.guidance     = guidance;
    this.batteryIndex = batteryIndex;

    // Current heading angle (radians). Points upward initially (toward launch zone).
    this.angle = -Math.PI / 2;

    // Velocity components derived from angle each frame by GuidanceSystem
    this.vx = 0;
    this.vy = 0;

    // Proportional Navigation internal state
    /** Previous LOS angle to target (radians) — updated each frame by GuidanceSystem. */
    this.prevLosAngle = null;

    // Lifetime tracking
    this.elapsed  = 0;
    this.lifetime = INTERCEPTOR_LIFETIME;
    this.active   = true;

    // Trail for rendering
    /** @type {Array<{x:number, y:number}>} */
    this.trail = [];
  }

  /**
   * Advance position by one tick using the current velocity set by GuidanceSystem.
   * @param {number} dt  Delta time (seconds, pre-scaled)
   */
  move(dt) {
    if (!this.active) return;

    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.elapsed += dt;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > TRAIL_LENGTH) this.trail.shift();

    // Self-destruct on lifetime expiry
    if (this.elapsed >= this.lifetime) {
      this.active = false;
    }
  }
}
