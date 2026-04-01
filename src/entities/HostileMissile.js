/**
 * HostileMissile.js  (INBOUND / HOSTILE)
 *
 * Represents an incoming enemy ballistic missile.
 *
 * Movement is updated here each frame via `update(dt, params)`.
 * The flight-path and evasion behaviour are self-contained so that
 * CollisionSystem and TargetAssignment only need to read position/velocity.
 *
 * Coordinate convention: Y increases downward (canvas default).
 */

import { EVADE_THRESHOLD_PX, TRAIL_LENGTH } from '@/constants.js';

let _nextId = 0;

export class HostileMissile {
  /**
   * @param {object} opts
   * @param {number} opts.x           Launch X (top of map)
   * @param {number} opts.y           Launch Y (within launch zone)
   * @param {number} opts.targetX     Target installation X
   * @param {number} opts.targetY     Target installation Y
   * @param {object} opts.params      Reference to gameState.params (hostile + simulation)
   */
  constructor({ x, y, targetX, targetY, params }) {
    this.id = _nextId++;

    // Position
    this.x = x;
    this.y = y;

    // Target (used for ballistic arc calculation and straight-line heading)
    this.targetX = targetX;
    this.targetY = targetY;

    // ── Velocity ────────────────────────────────────────────────────────────
    const speed       = params.hostile.speed;
    const gravity     = params.simulation.gravity;
    const flightPath  = params.hostile.flightPath;

    const dx = targetX - x;
    const dy = targetY - y;
    const dist = Math.hypot(dx, dy);

    if (flightPath === 'ballistic') {
      // Horizontal velocity is constant; vertical has initial component
      // chosen so the missile hits the target accounting for gravity.
      this.vx = (dx / dist) * speed;

      // Time to target at constant horizontal speed
      const tFlight = Math.abs(dx) > 1 ? Math.abs(dx / this.vx) : dist / speed;

      // vy_0 such that y + vy_0*t + 0.5*g*t² = targetY
      this.vy = (dy - 0.5 * gravity * tFlight * tFlight) / (tFlight || 1);
    } else {
      // Straight line at constant speed
      this.vx = (dx / dist) * speed;
      this.vy = (dy / dist) * speed;
    }

    // Store the configured speed magnitude for evasion calculations
    this._speed = speed;

    // ── State ────────────────────────────────────────────────────────────────
    this.active    = true;   // false when intercepted or impacted
    this.elapsed   = 0;      // seconds since launch

    // Radar cross-section (§1.6 / §4.1 — Stealth & Detection Range)
    // 0.0 = fully visible; 1.0 = fully stealthy. Reduces effective detection
    // range: effectiveRange = battery.detectionRange × (1 - stealthLevel).
    // Default is 0 (no stealth); per-wave overrides will set this in Phase 2.
    this.stealthLevel = 0;

    // ── Trail (last N positions for rendering) ───────────────────────────────
    /** @type {Array<{x:number, y:number}>} */
    this.trail = [];

    // ── Terminal phase state ─────────────────────────────────────────────────
    /** True once an interceptor has closed within terminalActivationRange. One-way latch. */
    this.inTerminalPhase    = false;
    /** Countdown (s) until next lateral maneuver direction change. */
    this._terminalJinkTimer = 0;

    // ── APN support — previous-frame velocity ────────────────────────────────
    /** Velocity components at the end of the previous frame, for lateral accel estimation. */
    this.prevVx = this.vx;
    this.prevVy = this.vy;
  }

  /**
   * Advance the missile one simulation tick.
   *
   * @param {number} dt                   Delta time (seconds, already scaled)
   * @param {object} params               gameState.params
   * @param {Array}  interceptors         Live interceptor array (for EVADE mode)
   */
  update(dt, params, interceptors) {
    if (!this.active) return;

    // Snapshot velocity before any mutation — used by GuidanceSystem for APN
    this.prevVx = this.vx;
    this.prevVy = this.vy;

    const gravity    = params.simulation.gravity;
    const flightPath = params.hostile.flightPath;
    const evasion    = params.hostile.evasionMode;

    // ── Apply gravity for ballistic path ─────────────────────────────────────
    if (flightPath === 'ballistic') {
      this.vy += gravity * dt;
    }

    // ── Evasion behaviour ─────────────────────────────────────────────────────
    // Terminal phase maneuvering: proximity-triggered, always active (replaces jink).
    this._checkTerminalPhase(params, interceptors);
    if (this.inTerminalPhase) {
      this._applyTerminalJink(dt, params);
    } else if (evasion === 'evade') {
      this._applyEvade(dt, params, interceptors);
    }

    // ── Move ─────────────────────────────────────────────────────────────────
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.elapsed += dt;

    // ── Record trail position ─────────────────────────────────────────────────
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
  }

  // ── Private evasion helpers ───────────────────────────────────────────────────

  /**
   * One-way latch: set inTerminalPhase once any interceptor closes within
   * terminalActivationRange. Never resets to false.
   */
  _checkTerminalPhase(params, interceptors) {
    if (this.inTerminalPhase) return; // already latched
    const threshold = params.hostile.terminalActivationRange;
    for (const intr of interceptors) {
      if (!intr.active) continue;
      if (Math.hypot(intr.x - this.x, intr.y - this.y) < threshold) {
        this.inTerminalPhase = true;
        return;
      }
    }
  }

  /**
   * Terminal phase maneuvering — applies a sudden lateral delta-v every
   * 0.4–0.8 s to break the interceptor's lock geometry.
   */
  _applyTerminalJink(dt, params) {
    this._terminalJinkTimer -= dt;
    if (this._terminalJinkTimer > 0) return;

    // Schedule next direction change
    this._terminalJinkTimer = 0.4 + Math.random() * 0.4;

    // Perpendicular to current heading, randomly left or right
    const travelAngle = Math.atan2(this.vy, this.vx);
    const sign        = Math.random() < 0.5 ? 1 : -1;
    const jinkForce   = params.hostile.terminalJinkForce;

    this.vx += -Math.sin(travelAngle) * sign * jinkForce;
    this.vy +=  Math.cos(travelAngle) * sign * jinkForce;
  }

  /**
   * Evade mode — steer away from the closest interceptor if within threshold.
   */
  _applyEvade(dt, params, interceptors) {
    let closest = null;
    let minDist = EVADE_THRESHOLD_PX;

    for (const intr of interceptors) {
      if (!intr.active) continue;
      const d = Math.hypot(intr.x - this.x, intr.y - this.y);
      if (d < minDist) { minDist = d; closest = intr; }
    }

    if (!closest) return;

    // Vector from interceptor to this missile
    const dx = this.x - closest.x;
    const dy = this.y - closest.y;
    const d  = Math.hypot(dx, dy) || 1;

    // Apply a lateral nudge proportional to how close the threat is
    const strength = (1 - minDist / EVADE_THRESHOLD_PX) * this._speed * 0.6;
    this.x += (dx / d) * strength * dt;
    this.y += (dy / d) * strength * dt;
  }
}
