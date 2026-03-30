/**
 * EntityRenderer.js  (Layer 1)
 *
 * Renders semi-static scene entities:
 *   - Buildings (installations) — tier-specific icons with labels and glow
 *   - Batteries (placed by player) — crosshair-in-square icon
 *     - During DEPLOYMENT: also draws the engagement envelope (dashed circle)
 *
 * This canvas is only cleared and redrawn when the entity set changes
 * (new battery placed, map regenerated, building destroyed).
 * The Renderer calls `markDirty()` to trigger a redraw next frame.
 */

import { COLORS, PHASE } from '@/constants.js';

export class EntityRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this._dirty = true; // Force initial draw
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Signal that entities have changed and a redraw is needed this frame. */
  markDirty() {
    this._dirty = true;
  }

  /**
   * Redraw entity layer if dirty.
   *
   * @param {import('@/GameState.js').GameState} gameState
   */
  render(gameState) {
    if (!this._dirty) return;
    this._dirty = false;

    const ctx = this.ctx;
    const w   = this.canvas.width;
    const h   = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw buildings
    for (const building of gameState.buildings) {
      this._drawBuilding(ctx, building);
    }

    // Draw batteries (with envelope only during DEPLOYMENT)
    const showEnvelope = gameState.phase === PHASE.DEPLOYMENT;
    for (const battery of gameState.batteries) {
      this._drawBattery(ctx, battery, showEnvelope);
    }
  }

  // ── Building icons ────────────────────────────────────────────────────────────

  _drawBuilding(ctx, building) {
    if (building.destroyed) {
      this._drawDestroyedBuilding(ctx, building);
      return;
    }

    const { x, y, tier, label, icon } = building;

    // Glow intensity scales with tier
    const glowRadius = [6, 10, 14][tier];

    ctx.save();
    ctx.shadowColor = COLORS.GREEN;
    ctx.shadowBlur  = glowRadius;

    ctx.strokeStyle = COLORS.GREEN;
    ctx.fillStyle   = COLORS.BG;
    ctx.lineWidth   = 1.5;

    switch (icon) {
      case 'square':   this._iconSquare(ctx, x, y, 8);  break;
      case 'antenna':  this._iconAntenna(ctx, x, y, 10); break;
      case 'star':     this._iconStar(ctx, x, y, 11);    break;
    }

    // Tier badge
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = COLORS.GREEN_DIM || '#00882a';
    ctx.font        = '8px "Share Tech Mono", monospace';
    ctx.textAlign   = 'center';
    ctx.fillText(`[${['I', 'II', 'III'][tier]}]`, x, y + 20);

    // Label above icon
    ctx.fillStyle   = COLORS.GREEN;
    ctx.font        = '9px "Share Tech Mono", monospace';
    ctx.fillText(label, x, y - 16);

    ctx.restore();
  }

  _drawDestroyedBuilding(ctx, building) {
    const { x, y } = building;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 32, 32, 0.4)';
    ctx.lineWidth   = 1;

    // X mark
    const s = 7;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 32, 32, 0.35)';
    ctx.font      = '8px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DESTROYED', x, y + 20);

    ctx.restore();
  }

  // ── Tier icon primitives ──────────────────────────────────────────────────────

  /** Tier I — simple square */
  _iconSquare(ctx, x, y, size) {
    ctx.strokeRect(x - size, y - size, size * 2, size * 2);
    // Inner dot
    ctx.fillStyle = COLORS.GREEN;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Tier II — antenna / comms tower */
  _iconAntenna(ctx, x, y, size) {
    ctx.beginPath();
    // Vertical mast
    ctx.moveTo(x, y + size);
    ctx.lineTo(x, y - size);
    // Left arm
    ctx.moveTo(x, y - size * 0.3);
    ctx.lineTo(x - size * 0.7, y + size * 0.3);
    // Right arm
    ctx.moveTo(x, y - size * 0.3);
    ctx.lineTo(x + size * 0.7, y + size * 0.3);
    // Signal arcs
    ctx.arc(x, y - size, size * 0.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    // Base square
    const base = 4;
    ctx.strokeRect(x - base, y + size - base, base * 2, base);
  }

  /** Tier III — star / HQ */
  _iconStar(ctx, x, y, size) {
    const points = 5;
    const inner  = size * 0.45;

    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r     = i % 2 === 0 ? size : inner;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
      else         ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
    }
    ctx.closePath();
    ctx.stroke();
  }

  // ── Battery icon ──────────────────────────────────────────────────────────────

  _drawDestroyedBattery(ctx, battery) {
    const { x, y } = battery;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 32, 32, 0.5)';
    ctx.lineWidth   = 1.5;

    // Broken square outline
    const size = 10;
    ctx.strokeRect(x - size, y - size, size * 2, size * 2);

    // X mark
    ctx.beginPath();
    ctx.moveTo(x - size + 2, y - size + 2); ctx.lineTo(x + size - 2, y + size - 2);
    ctx.moveTo(x + size - 2, y - size + 2); ctx.lineTo(x - size + 2, y + size - 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 32, 32, 0.45)';
    ctx.font      = '8px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DESTROYED', x, y + size + 12);

    ctx.restore();
  }

  _drawBattery(ctx, battery, showEnvelope) {
    if (battery.destroyed) {
      this._drawDestroyedBattery(ctx, battery);
      return;
    }

    const { x, y, range } = battery;
    const size = 10;

    ctx.save();
    ctx.strokeStyle = COLORS.CYAN;
    ctx.fillStyle   = COLORS.BG;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = COLORS.CYAN;
    ctx.shadowBlur  = 6;

    // Outer square
    ctx.strokeRect(x - size, y - size, size * 2, size * 2);

    // Crosshair inside
    ctx.beginPath();
    // Horizontal
    ctx.moveTo(x - size + 3, y); ctx.lineTo(x + size - 3, y);
    // Vertical
    ctx.moveTo(x, y - size + 3); ctx.lineTo(x, y + size - 3);
    // Center dot
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Ammo label below
    ctx.fillStyle = COLORS.CYAN;
    ctx.font      = '8px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`AMM:${battery.ammo}`, x, y + size + 12);

    // Engagement envelope (dashed circle, DEPLOYMENT only)
    if (showEnvelope) {
      ctx.strokeStyle = 'rgba(0, 204, 204, 0.22)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([6, 5]);
      ctx.shadowBlur  = 0;
      ctx.beginPath();
      ctx.arc(x, y, range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}
