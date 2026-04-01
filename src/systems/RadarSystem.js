/**
 * RadarSystem.js  (§4.1 Radar Detection Model + §4.2 Track Quality)
 *
 * Manages the sensor layer between enemy missiles and defensive batteries.
 *
 * Each frame during ENGAGEMENT this system:
 *   1. Rotates each battery's radar sweep angle (§7.5).
 *   2. Checks every untracked active hostile against every active battery's
 *      effective detection range (detectionRange × (1 - stealthLevel)).
 *   3. Creates a new TrackData entry on first detection with quality = 0.
 *   4. Matures existing tracks toward quality = 1.0 over a randomised
 *      2–4 second window (§4.2).
 *   5. Prunes tracks whose missile is no longer active.
 *
 * Track quality gates battery firing — TargetAssignment calls isFireable()
 * before committing to a target. DynamicRenderer calls isDetected() to decide
 * whether to draw a hostile at all, and getTrack() to draw uncertainty overlays.
 */

/** Radar sweep rotation speed — full circle every 3 seconds. */
const SWEEP_RATE = (Math.PI * 2) / 3;

/** Duration (s) of the bright flash on new-contact acquisition. */
const CONTACT_FLASH_DUR = 0.35;

/** Initial uncertainty circle radius (px) at track quality = 0. */
const INITIAL_UNCERTAINTY_R = 30;

export class RadarSystem {
  /**
   * @param {import('@/GameState.js').GameState} gameState
   */
  constructor(gameState) {
    this.gameState = gameState;

    /**
     * Live track table.  Key = hostile missile ID, value = TrackData.
     * @type {Map<number, {
     *   missileId: number,
     *   quality: number,
     *   maturationTime: number,
     *   elapsed: number,
     *   uncertaintyRadius: number,
     *   detectedByBattery: number
     * }>}
     */
    this.tracks = new Map();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Clear all tracks — called at the start of each engagement. */
  reset() {
    this.tracks.clear();
  }

  /**
   * Advance radar state by one simulation tick.
   *
   * When advanced mode is OFF the system falls back to pre-radar behaviour:
   * every active hostile is instantly treated as a fully confirmed track so
   * that DynamicRenderer shows all missiles and TargetAssignment fires freely.
   *
   * @param {number} dt  Scaled delta time (seconds)
   */
  update(dt) {
    const gs = this.gameState;

    // ── Simple mode fallback (advanced mode OFF) ──────────────────────────────
    // Instantly confirm all active hostiles so the simulation behaves exactly
    // as it did before the radar feature was introduced.
    if (!gs.advancedMode) {
      for (const hostile of gs.hostiles) {
        if (!hostile.active) continue;
        if (!this.tracks.has(hostile.id)) {
          this.tracks.set(hostile.id, {
            missileId:          hostile.id,
            quality:            1,
            maturationTime:     0,
            elapsed:            0,
            uncertaintyRadius:  0,
            detectedByBattery:  -1,
          });
        }
      }
      // Prune tracks for missiles that are no longer active
      for (const [id] of this.tracks) {
        const hostile = gs.hostiles.find(h => h.id === id);
        if (!hostile || !hostile.active) this.tracks.delete(id);
      }
      return;
    }

    const detectionRange = gs.params.sensor.detectionRange;

    // ── 1. Rotate battery sweep arcs ─────────────────────────────────────────
    for (const battery of gs.batteries) {
      if (battery.destroyed) continue;
      battery.radarSweepAngle   = (battery.radarSweepAngle + SWEEP_RATE * dt) % (Math.PI * 2);
      battery.radarContactFlash = Math.max(0, battery.radarContactFlash - dt);
    }

    // ── 2. Mature existing tracks ─────────────────────────────────────────────
    for (const [id, track] of this.tracks) {
      const hostile = gs.hostiles.find(h => h.id === id);
      if (!hostile || !hostile.active) {
        this.tracks.delete(id);
        continue;
      }
      track.elapsed          += dt;
      track.quality           = Math.min(1.0, track.elapsed / track.maturationTime);
      track.uncertaintyRadius = INITIAL_UNCERTAINTY_R * (1 - track.quality);
    }

    // ── 3. Detect new contacts ────────────────────────────────────────────────
    for (const hostile of gs.hostiles) {
      if (!hostile.active || this.tracks.has(hostile.id)) continue;

      // Stealth reduces effective detection range (§1.6 / §4.1)
      const stealth        = hostile.stealthLevel ?? 0;
      const effectiveRange = detectionRange * (1 - stealth);

      for (let bi = 0; bi < gs.batteries.length; bi++) {
        const battery = gs.batteries[bi];
        if (battery.destroyed) continue;

        const dist = Math.hypot(hostile.x - battery.x, hostile.y - battery.y);
        if (dist > effectiveRange) continue;

        // New contact acquired
        this.tracks.set(hostile.id, {
          missileId:          hostile.id,
          quality:            0,
          maturationTime:     2 + Math.random() * 2,  // 2–4 s randomised per contact
          elapsed:            0,
          uncertaintyRadius:  INITIAL_UNCERTAINTY_R,
          detectedByBattery:  bi,
        });

        // Trigger acquisition flash on the detecting battery (§7.5)
        battery.radarContactFlash = CONTACT_FLASH_DUR;
        break; // One detection is sufficient — don't add duplicate tracks
      }
    }
  }

  /**
   * True if the hostile has been detected (any track quality ≥ 0).
   * @param {number} missileId
   */
  isDetected(missileId) {
    return this.tracks.has(missileId);
  }

  /**
   * True if the track quality meets the configured firing threshold.
   * Batteries use this before committing to a target (§4.2).
   * @param {number} missileId
   */
  isFireable(missileId) {
    const track = this.tracks.get(missileId);
    return track != null && track.quality >= this.gameState.params.sensor.minTrackQuality;
  }

  /**
   * Return the full TrackData for rendering, or null if not detected.
   * @param {number} missileId
   * @returns {{ quality: number, uncertaintyRadius: number, detectedByBattery: number } | null}
   */
  getTrack(missileId) {
    return this.tracks.get(missileId) ?? null;
  }
}
