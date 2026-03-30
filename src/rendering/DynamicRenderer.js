/**
 * DynamicRenderer.js  (Layer 2)
 *
 * Cleared and redrawn every frame during ENGAGEMENT.
 * Renders all moving / transient elements:
 *   - Hostile missiles (red V-chevron + exhaust trail)
 *   - Interceptor missiles (green diamond + lead glow + trail)
 *   - Explosions (expanding ring, color-coded by type)
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

    // Explosions (draw before missiles so they appear under live objects)
    for (const exp of gameState.explosions) {
      if (exp.active) this._drawExplosion(ctx, exp);
    }

    // Hostile missiles
    for (const hostile of gameState.hostiles) {
      if (hostile.active) this._drawHostile(ctx, hostile);
    }

    // Interceptors
    for (const intr of gameState.interceptors) {
      if (intr.active) this._drawInterceptor(ctx, intr);
    }
  }

  // ── Hostile missile ───────────────────────────────────────────────────────────

  _drawHostile(ctx, hostile) {
    // Exhaust trail (fading, red-dim)
    this._drawTrail(ctx, hostile.trail, COLORS.RED, 0.4);

    // V-chevron pointing in direction of travel
    const angle = Math.atan2(hostile.vy, hostile.vx);
    const size  = 7;

    ctx.save();
    ctx.translate(hostile.x, hostile.y);
    ctx.rotate(angle);

    ctx.strokeStyle = COLORS.RED;
    ctx.fillStyle   = 'rgba(255, 32, 32, 0.15)';
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = COLORS.RED;
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
