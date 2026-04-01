/**
 * DynamicRenderer.js  (Layer 2)
 *
 * Cleared and redrawn every frame during ENGAGEMENT.
 * Renders all moving / transient elements:
 *   - Hostile missiles (red V-chevron + exhaust trail)
 *       Only drawn when detected by radar (§4.1). Newly detected contacts
 *       display a shrinking uncertainty circle (§7.6).
 *   - Interceptor missiles (green diamond + lead glow + trail)
 *   - Explosions (expanding ring, color-coded by type)
 *   - Battery radar sweep arcs (rotating green fan, §7.5)
 *   - Engagement-envelope preview ghost while player is placing a battery
 *   - Battery hover highlight (amber ring when pointer is over a placed battery)
 *   - Placement status bar (DEPLOYMENT phase HUD at bottom of canvas)
 */

import { COLORS, PHASE } from '@/constants.js';

export class DynamicRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    /**
     * When set, draw a ghost engagement envelope at this position.
     * Used by UIController during battery placement hover.
     * @type {{x: number, y: number} | null}
     */
    this.placementGhost = null;

    /**
     * Index of the battery currently under the pointer (-1 = none).
     * Set by UIController; drawn as an amber removal-hint ring.
     * @type {number}
     */
    this.hoveredBatteryIndex = -1;

    /**
     * Reference to the RadarSystem, injected from main.js after construction.
     * When set, hostile missiles are only rendered if detected, and uncertainty
     * circles are drawn on maturing tracks (§4.1 / §7.6).
     * @type {import('@/systems/RadarSystem.js').RadarSystem | null}
     */
    this.radarSystem = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Render all dynamic elements for the current frame.
   * @param {import('@/GameState.js').GameState} gameState
   */
  render(gameState) {
    const ctx = this.ctx;
    const w   = this.canvas.width;
    const h   = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Battery hover highlight (must draw before the placement ghost so the
    // ghost crosshair overlays it, not the other way around)
    if (gameState.phase === PHASE.DEPLOYMENT && this.hoveredBatteryIndex >= 0) {
      const b = gameState.batteries[this.hoveredBatteryIndex];
      if (b) this._drawBatteryRemoveHint(ctx, b);
    }

    // Battery placement ghost (DEPLOYMENT phase hover)
    if (gameState.phase === PHASE.DEPLOYMENT && this.placementGhost) {
      this._drawPlacementGhost(ctx, this.placementGhost, gameState.params.battery.range);
    }

    // Deployment status bar (only in DEPLOYMENT phase)
    if (gameState.phase === PHASE.DEPLOYMENT) {
      this._drawDeploymentStatus(ctx, w, h, gameState);
    }

    // Enemy launch sites (ENGAGEMENT phase only)
    if (gameState.phase === PHASE.ENGAGEMENT) {
      for (let i = 0; i < gameState.launchSites.length; i++) {
        this._drawLaunchSite(ctx, gameState.launchSites[i], i + 1);
      }
    }

    // Radar sweep arcs — only in advanced mode during ENGAGEMENT (§7.5)
    // In simple mode there is no radar sensor layer, so no sweeps are shown.
    if (gameState.phase === PHASE.ENGAGEMENT && gameState.advancedMode) {
      const detectionRange = gameState.params.sensor?.detectionRange ?? 280;
      for (const battery of gameState.batteries) {
        if (!battery.destroyed) this._drawRadarSweep(ctx, battery, detectionRange);
      }
    }

    // Explosions (draw before missiles so they appear under live objects)
    for (const exp of gameState.explosions) {
      if (exp.active) this._drawExplosion(ctx, exp);
    }

    // Hostile missiles — only rendered once detected by radar (§4.1)
    for (const hostile of gameState.hostiles) {
      if (!hostile.active) continue;
      // Gate visibility on radar detection; if no RadarSystem is wired (e.g.
      // during unit tests), fall back to always-visible behaviour.
      if (this.radarSystem && !this.radarSystem.isDetected(hostile.id)) continue;
      const track = this.radarSystem?.getTrack(hostile.id) ?? null;
      this._drawHostile(ctx, hostile, track);
    }

    // Interceptors
    for (const intr of gameState.interceptors) {
      if (intr.active) this._drawInterceptor(ctx, intr);
    }
  }

  // ── Enemy launch site ─────────────────────────────────────────────────────────

  /**
   * Draw an enemy launch site marker — an upward-pointing chevron on a base
   * platform, labelled LAU-N, in amber/yellow to match enemy territory color.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x:number, y:number}} site
   * @param {number} index  1-based site number for the label
   */
  _drawLaunchSite(ctx, site, index) {
    const { x, y } = site;
    const RED_BRIGHT = COLORS.RED;
    const RED_DIM    = 'rgba(255, 32, 32, 0.15)';
    const RED_GLOW   = 'rgba(255, 32, 32, 0.7)';

    ctx.save();
    ctx.translate(x, y);

    ctx.shadowColor = RED_GLOW;
    ctx.shadowBlur  = 8;

    // ── Base platform (horizontal bar) ───────────────────────────────────────
    ctx.strokeStyle = RED_BRIGHT;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(-10, 6);
    ctx.lineTo(10, 6);
    ctx.stroke();

    // ── Launch chevron (upward-pointing arrow) ────────────────────────────────
    ctx.strokeStyle = RED_BRIGHT;
    ctx.fillStyle   = RED_DIM;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -10);       // tip
    ctx.lineTo(-7, 6);        // bottom-left
    ctx.lineTo(0, 2);         // inner notch
    ctx.lineTo(7, 6);         // bottom-right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Label ─────────────────────────────────────────────────────────────────
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = RED_BRIGHT;
    ctx.font        = 'bold 9px "Share Tech Mono", monospace';
    ctx.textAlign   = 'center';
    ctx.fillText(`LAU-0${index}`, 0, 18);

    ctx.restore();
  }

  // ── Hostile missile ───────────────────────────────────────────────────────────

  /**
   * Draw a hostile missile chevron and, when the track is maturing, an
   * uncertainty circle overlay (§7.6).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('@/entities/HostileMissile.js').HostileMissile} hostile
   * @param {{ quality: number, uncertaintyRadius: number } | null} track
   */
  _drawHostile(ctx, hostile, track = null) {
    // Amber during ballistic flight; red once terminal phase activates
    const missileColor = hostile.inTerminalPhase ? COLORS.RED : COLORS.AMBER;
    const fillColor    = hostile.inTerminalPhase
      ? 'rgba(255, 32, 32, 0.15)'
      : 'rgba(255, 176, 0, 0.15)';

    // Exhaust trail (fading)
    this._drawTrail(ctx, hostile.trail, missileColor, 0.4);

    // V-chevron pointing in direction of travel
    const angle = Math.atan2(hostile.vy, hostile.vx);
    const size  = 7;

    ctx.save();
    ctx.translate(hostile.x, hostile.y);
    ctx.rotate(angle);

    ctx.strokeStyle = missileColor;
    ctx.fillStyle   = fillColor;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = missileColor;
    ctx.shadowBlur  = 6;

    ctx.beginPath();
    ctx.moveTo(size, 0);              // nose
    ctx.lineTo(-size, -size * 0.7);  // left wing tip
    ctx.lineTo(-size * 0.3, 0);      // notch
    ctx.lineTo(-size, size * 0.7);   // right wing tip
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // ── Track uncertainty overlay (§7.6) ─────────────────────────────────────
    // Shown while the track is maturing (quality < 1). A dashed circle shrinks
    // from 30px to 0, transitioning from amber (uncertain) to green (confirmed).
    // A small arc fills clockwise as a quality progress indicator.
    if (track && track.quality < 1) {
      const q = track.quality;
      const r = track.uncertaintyRadius;

      // Color interpolates amber → green as quality rises
      const strokeCol = q < 0.5
        ? `rgba(255,176,0,${0.7 - q * 0.4})`
        : `rgba(0,255,65,${0.3 + q * 0.5})`;

      ctx.save();

      // Dashed uncertainty circle
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.shadowColor = strokeCol;
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(hostile.x, hostile.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Quality progress arc — small ring around the icon filling clockwise
      ctx.strokeStyle = 'rgba(0,255,65,0.85)';
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(hostile.x, hostile.y, 10,
        -Math.PI / 2,
        -Math.PI / 2 + q * Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }

  // ── Interceptor missile ───────────────────────────────────────────────────────

  _drawInterceptor(ctx, intr) {
    // Trail
    this._drawTrail(ctx, intr.trail, COLORS.GREEN, 0.5);

    // Diamond body
    const size = 5;

    ctx.save();
    ctx.translate(intr.x, intr.y);
    ctx.rotate(intr.angle);

    ctx.strokeStyle = COLORS.GREEN;
    ctx.fillStyle   = COLORS.BG;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = COLORS.GREEN;
    ctx.shadowBlur  = 10;

    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(0, -size * 0.6);
    ctx.lineTo(-size, 0);
    ctx.lineTo(0, size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Leading-edge glow dot
    ctx.fillStyle  = COLORS.GREEN_GLOW;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(size, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Explosion ring ────────────────────────────────────────────────────────────

  _drawExplosion(ctx, exp) {
    ctx.save();
    ctx.globalAlpha = exp.alpha;

    // Outer expanding ring
    ctx.strokeStyle = exp.color;
    ctx.lineWidth   = 2;
    ctx.shadowColor = exp.color;
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner secondary ring (slightly smaller, secondary color)
    if (exp.radius > 4) {
      ctx.strokeStyle = exp.colorSecondary;
      ctx.lineWidth   = 1;
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Battery removal hint ──────────────────────────────────────────────────────

  /**
   * Draw an amber pulsing ring around a battery to signal it can be removed.
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('@/entities/Battery.js').Battery} battery
   */
  _drawBatteryRemoveHint(ctx, battery) {
    ctx.save();
    ctx.strokeStyle = COLORS.AMBER;
    ctx.lineWidth   = 2;
    ctx.shadowColor = COLORS.AMBER;
    ctx.shadowBlur  = 10;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(battery.x, battery.y, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // "REMOVE" label
    ctx.fillStyle  = COLORS.AMBER;
    ctx.shadowBlur = 0;
    ctx.font       = '9px "Share Tech Mono", monospace';
    ctx.textAlign  = 'center';
    ctx.fillText('CLICK TO REMOVE', battery.x, battery.y - 22);
    ctx.restore();
  }

  // ── Deployment status bar ─────────────────────────────────────────────────────

  /**
   * Draw a small HUD bar at the bottom of the canvas during DEPLOYMENT showing
   * battery count, budget, and a brief interaction hint.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   * @param {import('@/GameState.js').GameState} gameState
   */
  _drawDeploymentStatus(ctx, w, h, gameState) {
    const placed = gameState.batteries.length;
    const budget = gameState.params.simulation.batteryBudget;
    const barH   = 30;
    const y      = h - barH;

    ctx.save();

    // Background strip — dark but not fully opaque
    ctx.fillStyle = 'rgba(5, 15, 10, 0.88)';
    ctx.fillRect(0, y, w, barH);

    // Top border — bright green so the bar edge is clearly defined
    ctx.strokeStyle = COLORS.GREEN_DIM;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    ctx.font = 'bold 12px "Share Tech Mono", monospace';

    // ── Left: battery budget ──────────────────────────────────────────────────
    const budgetColor = placed === budget ? COLORS.AMBER : COLORS.CYAN;
    ctx.fillStyle  = budgetColor;
    ctx.shadowColor = budgetColor;
    ctx.shadowBlur  = 8;
    ctx.textAlign  = 'left';
    ctx.fillText(`BATTERIES: ${placed}/${budget}`, 14, y + 19);

    // ── Center: interaction hint ──────────────────────────────────────────────
    ctx.fillStyle  = COLORS.GREEN;
    ctx.shadowColor = COLORS.GREEN;
    ctx.shadowBlur  = 4;
    ctx.textAlign  = 'center';
    const hint = placed === 0
      ? 'CLICK IN DEFENDED ZONE TO PLACE BATTERY'
      : placed < budget
        ? 'CLICK TO PLACE  |  CLICK BATTERY TO REPOSITION'
        : 'BUDGET EXHAUSTED — CLICK BATTERY TO REPOSITION  |  PRESS [ENGAGE] TO BEGIN';
    ctx.fillText(hint, w / 2, y + 19);

    // ── Right: phase label ────────────────────────────────────────────────────
    ctx.fillStyle  = COLORS.GREEN;
    ctx.shadowColor = COLORS.GREEN;
    ctx.shadowBlur  = 4;
    ctx.textAlign  = 'right';
    ctx.fillText('[DEPLOYMENT PHASE]', w - 14, y + 19);

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Placement ghost (hover preview) ──────────────────────────────────────────

  _drawPlacementGhost(ctx, ghost, range) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 204, 204, 0.35)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Small crosshair at ghost position
    ctx.strokeStyle = 'rgba(0, 204, 204, 0.6)';
    ctx.lineWidth   = 1;
    const s = 8;
    ctx.beginPath();
    ctx.moveTo(ghost.x - s, ghost.y); ctx.lineTo(ghost.x + s, ghost.y);
    ctx.moveTo(ghost.x, ghost.y - s); ctx.lineTo(ghost.x, ghost.y + s);
    ctx.stroke();
    ctx.restore();
  }

  // ── Radar sweep arc (§7.5) ───────────────────────────────────────────────────

  /**
   * Draw the rotating radar sweep arc for a placed battery.
   *
   * The arc is a faint green wedge that rotates at one revolution per three
   * seconds. When a new contact is acquired, `battery.radarContactFlash > 0`
   * causes a brief brightness spike on the leading edge.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('@/entities/Battery.js').Battery} battery
   * @param {number} detectionRange  Effective radar range (px)
   */
  _drawRadarSweep(ctx, battery, detectionRange) {
    const angle      = battery.radarSweepAngle;
    const flash      = battery.radarContactFlash;   // 0 (none) → 0.35 (peak)
    const flashT     = Math.min(1, flash / 0.35);   // normalise to 0–1
    const sweepWidth = Math.PI / 8;                  // 22.5° arc width

    ctx.save();
    ctx.translate(battery.x, battery.y);

    // Sweep wedge fill — faint green fan
    const fillAlpha  = 0.05 + flashT * 0.15;
    const edgeAlpha  = 0.4  + flashT * 0.6;

    ctx.fillStyle   = `rgba(0,255,65,${fillAlpha})`;
    ctx.strokeStyle = `rgba(0,255,65,${edgeAlpha})`;
    ctx.lineWidth   = 1;
    ctx.shadowColor = `rgba(0,255,65,${edgeAlpha})`;
    ctx.shadowBlur  = flashT > 0 ? 12 : 3;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, detectionRange, angle - sweepWidth, angle);
    ctx.closePath();
    ctx.fill();

    // Leading-edge bright line
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * detectionRange, Math.sin(angle) * detectionRange);
    ctx.stroke();

    ctx.restore();
  }

  // ── Trail helper ──────────────────────────────────────────────────────────────

  /**
   * Draw a fading trail polyline from oldest to newest position.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array<{x:number, y:number}>} trail
   * @param {string} color  CSS color string
   * @param {number} maxAlpha
   */
  _drawTrail(ctx, trail, color, maxAlpha) {
    if (trail.length < 2) return;

    ctx.save();

    for (let i = 1; i < trail.length; i++) {
      const alpha = (i / trail.length) * maxAlpha;
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x,     trail[i].y);
      ctx.stroke();
    }

    ctx.restore();
  }
}
