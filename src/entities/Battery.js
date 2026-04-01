/**
 * Battery.js  (INTERCEPTOR BATTERY)
 *
 * Represents a player-placed defense system on the map.
 * State for targeting and fire-control is owned here; the actual guidance
 * and targeting logic lives in TargetAssignment.js and GuidanceSystem.js.
 */

export class Battery {
  /**
   * @param {object} opts
   * @param {number} opts.x                  Map X position
   * @param {number} opts.y                  Map Y position
   * @param {object} opts.params             Live reference to gameState.params.battery
   */
  constructor({ x, y, params }) {
    this.x = x;
    this.y = y;

    // Copy scalar values from params at construction time.
    // TargetAssignment reads from gameState.params directly for live changes.
    this.ammo             = params.ammo;
    this.fireRate         = params.fireRate;
    this.range            = params.range;
    this.interceptorSpeed    = params.interceptorSpeed;
    this.turnRate            = params.turnRate;
    this.killRadius          = params.killRadius;
    this.guidance            = params.guidance;
    this.navigationConstant  = params.navigationConstant;
    this.apnCorrectionGain   = params.apnCorrectionGain;

    // Fire-control state
    /** Seconds since the last shot was fired (compared against 1/fireRate). */
    this.timeSinceLastShot = 0;

    // Radar sweep visual state (§7.5 — Per-Battery Radar Sweep)
    // Angle is advanced each frame by RadarSystem; random start so batteries
    // don't all sweep in lockstep.
    this.radarSweepAngle   = Math.random() * Math.PI * 2;
    /** Seconds remaining on the new-contact acquisition flash. */
    this.radarContactFlash = 0;

    /**
     * ID of the hostile this battery is currently tracking.
     * null means the battery is searching for a target.
     * @type {number|null}
     */
    this.currentTargetId = null;

    // Survivability
    /** Collision radius used by CollisionSystem for hostile impact detection. */
    this.radius    = 14;
    this.destroyed = false;
  }

  /** Mark this battery as destroyed — it stops firing immediately. */
  destroy() {
    this.destroyed = true;
  }
}
