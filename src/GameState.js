/**
 * GameState.js
 *
 * Central state container and state-machine for IRON VEIL.
 *
 * Responsibilities:
 *   - Holds the current game phase (DEPLOYMENT / ENGAGEMENT / AFTER_ACTION).
 *   - Owns all live entity arrays (buildings, batteries, hostiles, etc.).
 *   - Stores the single mutable copy of all configurable parameters.
 *   - Tracks live engagement statistics (score, fired counts, etc.).
 *   - Provides a simple event-bus so subsystems can react to phase changes
 *     without circular imports.
 *
 * GameState is intentionally a plain class — no framework reactivity.
 * Consumers call gameState.on('phaseChange', cb) to subscribe.
 */

import { DEFAULTS, PHASE } from '@/constants.js';
import { getFrontlineY as _getFY } from '@/systems/FrontlineGenerator.js';

export class GameState {
  constructor() {
    // ── Phase ────────────────────────────────────────────────────────────────
    this.phase = PHASE.DEPLOYMENT;

    // ── Configurable parameters (mutable copy of DEFAULTS) ───────────────────
    this.params = this._cloneDefaults();

    // ── Canvas dimensions (set by Renderer after it measures the viewport) ───
    this.canvasWidth  = 0;
    this.canvasHeight = 0;

    // ── Enemy launch sites ────────────────────────────────────────────────────
    /**
     * Array of {x, y} positions for enemy launch sites.
     * Populated when an engagement begins; cleared on return to deployment.
     * @type {Array<{x:number, y:number}>}
     */
    this.launchSites = [];

    // ── Frontline curve ────────────────────────────────────────────────────────
    /**
     * Float32Array of y-values for the procedural frontline, indexed by pixel
     * column. Null until the first map generation.
     * @type {Float32Array|null}
     */
    this.frontline = null;

    // ── Entity arrays (populated by respective systems) ───────────────────────
    /** @type {import('@/entities/Building.js').Building[]} */
    this.buildings = [];

    /** @type {import('@/entities/Battery.js').Battery[]} */
    this.batteries = [];

    /** @type {import('@/entities/HostileMissile.js').HostileMissile[]} */
    this.hostiles = [];

    /** @type {import('@/entities/Interceptor.js').Interceptor[]} */
    this.interceptors = [];

    /** @type {import('@/entities/Explosion.js').Explosion[]} */
    this.explosions = [];

    // ── Engagement statistics ─────────────────────────────────────────────────
    this.stats = this._freshStats();

    // ── Engagement timer (seconds elapsed since ENGAGE) ───────────────────────
    this.engagementTime = 0;

    // ── Advanced mode flag ────────────────────────────────────────────────────
    // When false the simulation behaves like pre-radar-feature: all hostiles are
    // immediately visible and batteries fire without any track-quality gate.
    // Toggled by the [ADVANCED MODE] button in the parameter panel — intentionally
    // NOT part of params so that [RESET PARAMETERS] does not clear it.
    this.advancedMode = false;

    // ── Internal event-bus ────────────────────────────────────────────────────
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  // ── Phase transitions ────────────────────────────────────────────────────────

  /** Transition to DEPLOYMENT phase and reset entities. */
  startDeployment() {
    this.hostiles     = [];
    this.interceptors = [];
    this.explosions   = [];
    this.batteries    = [];
    this.stats        = this._freshStats();
    this.engagementTime = 0;
    this._setPhase(PHASE.DEPLOYMENT);
  }

  /** Transition to ENGAGEMENT phase (batteries are locked, hostiles launch). */
  startEngagement() {
    this.stats        = this._freshStats();
    this.engagementTime = 0;
    this._setPhase(PHASE.ENGAGEMENT);
  }

  /** Transition to AFTER_ACTION phase (show debrief screen). */
  endEngagement() {
    this._setPhase(PHASE.AFTER_ACTION);
  }

  // ── Statistics helpers ────────────────────────────────────────────────────────

  recordInterceptorFired()    { this.stats.interceptorsFired++;  this._emit('interceptorFired');   }
  recordHostileKilled()       { this.stats.hostilesKilled++;     this._emit('hostileKilled');       }
  recordInterceptorWasted()   { this.stats.interceptorsWasted++; this._emit('interceptorWasted');   }
  recordBuildingDestroyed(b)  { this.stats.buildingsDestroyed.push(b); this._emit('buildingDestroyed', b); }
  recordBatteryDestroyed(bat) { this._emit('batteryDestroyed', bat); }
  addScore(delta)             { this.stats.score += delta; }

  /** Returns an object with derived totals useful for the AAR. */
  getSummary() {
    const survived = this.buildings.filter(b => !b.destroyed);
    const destroyed = this.buildings.filter(b => b.destroyed);
    return {
      score:             this.stats.score,
      hostilesTotal:     this.params.hostile.launchCount,
      hostilesKilled:    this.stats.hostilesKilled,
      hostilesImpacted:  this.params.hostile.launchCount
                           - this.stats.hostilesKilled
                           - this.hostiles.filter(h => h.active).length,
      interceptorsFired:   this.stats.interceptorsFired,
      interceptorsWasted:  this.stats.interceptorsWasted,
      buildingsSurvived:   survived,
      buildingsDestroyed:  destroyed,
      engagementTime:      this.engagementTime,
    };
  }

  // ── Frontline helpers ─────────────────────────────────────────────────────────

  /**
   * Store a newly-generated frontline and notify listeners so the background
   * renderer can rebuild its territory fills.
   * @param {Float32Array} points
   */
  setFrontline(points) {
    this.frontline = points;
    this._emit('frontlineChanged');
  }

  /**
   * Return the frontline y-coordinate at canvas column x.
   * Falls back to canvasHeight × frontlineMeanAltitude before the first
   * frontline is generated.
   * @param {number} x
   * @returns {number}
   */
  getFrontlineY(x) {
    if (!this.frontline) {
      return this.canvasHeight * this.params.simulation.frontlineMeanAltitude;
    }
    return _getFY(this.frontline, x);
  }

  // ── Param helpers ────────────────────────────────────────────────────────────

  /** Restore params to factory defaults. */
  resetParams() {
    this.params = this._cloneDefaults();
    this._emit('paramsReset');
  }

  // ── Event bus ────────────────────────────────────────────────────────────────

  /**
   * Subscribe to a named event.
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(callback);
  }

  /**
   * Unsubscribe a previously registered callback.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    this._listeners.get(event)?.delete(callback);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  _setPhase(phase) {
    this.phase = phase;
    this._emit('phaseChange', phase);
  }

  _emit(event, data) {
    this._listeners.get(event)?.forEach(cb => cb(data));
  }

  _cloneDefaults() {
    // Deep-clone so mutations to params never affect DEFAULTS
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  _freshStats() {
    return {
      score:               0,
      interceptorsFired:   0,
      hostilesKilled:      0,
      interceptorsWasted:  0,
      buildingsDestroyed:  [],
    };
  }
}
