/**
 * BackgroundRenderer.js  (Layer 0)
 *
 * Draws the static tactical backdrop plus the animated contested frontline.
 *
 * Two-phase rendering strategy:
 *   Static (offscreen canvas, rebuilt on resize or new frontline):
 *     - Dark terrain fill
 *     - Territory gradient fills (amber above frontline, green below)
 *     - Topographic contour lines
 *     - Faint coordinate grid with alphanumeric labels
 *
 *   Dynamic (drawn each frame on top of the blitted offscreen):
 *     - Animated dashed amber frontline border (lineDashOffset drifts over time)
 *
 * Everything static is pre-rendered once into an offscreen canvas and blitted
 * to the main canvas each frame — only the animated line adds per-frame work.
 */

import { COLORS } from '@/constants.js';

// Grid cell size in logical pixels — determines coordinate label density
const GRID_CELL = 80;

// Number of topographic contour paths to pre-generate
const TOPO_LINE_COUNT = 12;

export class BackgroundRenderer {
  /**
   * @param {HTMLCanvasElement}                        canvas    The background canvas (Layer 0)
   * @param {import('@/GameState.js').GameState}        gameState
   */
  constructor(canvas, gameState) {
    this.canvas    = canvas;
    this.ctx       = canvas.getContext('2d');
    this.gameState = gameState;

    /** Offscreen canvas holding the static background. */
    this._offscreen    = null;
    this._offscreenCtx = null;

    /** Pre-generated topographic contour paths (reused each frame). */
    this._topoPaths = [];

  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Called whenever the canvas is resized or the frontline changes.
   * Rebuilds the offscreen canvas and regenerates procedural content.
   */
  resize() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    this._offscreen    = new OffscreenCanvas(w, h);
    this._offscreenCtx = this._offscreen.getContext('2d');

    this._topoPaths = _generateTopoPaths(w, h, TOPO_LINE_COUNT);
    this._renderStatic(w, h);
  }

  /**
   * Draw the background for one frame.
   * The background is fully static — just blit the offscreen canvas.
   */
  render() {
    if (!this._offscreen) return;
    this.ctx.drawImage(this._offscreen, 0, 0);
  }

  // ── Static background (pre-rendered) ─────────────────────────────────────────

  /**
   * Renders everything into the offscreen canvas.
   * Called on resize and when the frontline changes; result is reused every frame.
   */
  _renderStatic(w, h) {
    const ctx = this._offscreenCtx;

    // Background fill
    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(0, 0, w, h);

    // Territory gradient fills (enemy / friendly zones)
    this._drawTerritoryFills(ctx, w, h);

    // Topographic contour lines (over the fills)
    this._drawTopoLines(ctx, w, h);

    // Tactical grid (topmost static layer)
    this._drawGrid(ctx, w, h);

    // Static frontline border line
    this._drawFrontlineBorder(ctx, w, h);
  }

  // ── Territory fills ───────────────────────────────────────────────────────────

  /**
   * Draws two gradient-filled regions divided by the frontline curve:
   *   - Enemy territory above (faint amber)
   *   - Friendly territory below (faint blue-green)
   *
   * Falls back to a flat horizontal divider at frontlineMeanAltitude when no
   * frontline has been generated yet (pre-boot safety guard).
   */
  _drawTerritoryFills(ctx, w, h) {
    const frontline = this.gameState.frontline;
    const flatY     = h * this.gameState.params.simulation.frontlineMeanAltitude;

    // ── Enemy territory (above frontline) ─────────────────────────────────────
    const enemyGrad = ctx.createLinearGradient(0, 0, 0, h);
    enemyGrad.addColorStop(0,   'rgba(180, 90,  0, 0.18)');
    enemyGrad.addColorStop(0.9, 'rgba(140, 60,  0, 0.05)');
    enemyGrad.addColorStop(1,   'rgba(140, 60,  0, 0.00)');

    ctx.save();
    ctx.fillStyle = enemyGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    if (frontline) {
      // Trace frontline right-to-left along its bottom edge to close the region
      for (let x = w; x >= 0; x--) {
        ctx.lineTo(x, frontline[x]);
      }
    } else {
      ctx.lineTo(w, flatY);
      ctx.lineTo(0, flatY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ── Friendly territory (below frontline) ──────────────────────────────────
    const friendlyGrad = ctx.createLinearGradient(0, 0, 0, h);
    friendlyGrad.addColorStop(0,   'rgba(0, 80, 40, 0.00)');
    friendlyGrad.addColorStop(0.2, 'rgba(0, 80, 40, 0.05)');
    friendlyGrad.addColorStop(1,   'rgba(0, 100, 50, 0.16)');

    ctx.save();
    ctx.fillStyle = friendlyGrad;
    ctx.beginPath();
    if (frontline) {
      ctx.moveTo(0, frontline[0]);
      for (let x = 1; x <= w; x++) {
        ctx.lineTo(x, frontline[x]);
      }
    } else {
      ctx.moveTo(0, flatY);
      ctx.lineTo(w, flatY);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ── Static frontline border ───────────────────────────────────────────────────

  /**
   * Draws a static amber line along the frontline curve.
   * Rendered once into the offscreen canvas on resize/frontline change.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   */
  _drawFrontlineBorder(ctx, w, h) {
    const frontline = this.gameState.frontline;
    if (!frontline) return;

    ctx.save();

    // ── Frontline curve ───────────────────────────────────────────────────────
    ctx.strokeStyle = COLORS.FRONTLINE_LINE;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = 'rgba(255, 176, 0, 0.30)';
    ctx.shadowBlur  = 4;

    ctx.beginPath();
    ctx.moveTo(0, frontline[0]);
    for (let x = 1; x <= w; x++) {
      ctx.lineTo(x, frontline[x]);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Territory labels (vertical, rotated -90°) ─────────────────────────────
    // Sample the average frontline y to find the center of each zone.
    let sumY = 0;
    const step = Math.max(1, Math.floor(frontline.length / 40));
    let   n    = 0;
    for (let x = 0; x < frontline.length; x += step) { sumY += frontline[x]; n++; }
    const avgY = sumY / n;

    const enemyCenterY   = avgY / 2;
    const friendlyCenterY = avgY + (h - avgY) / 2;

    ctx.font      = 'bold 13px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    const pad   = 6;
    const labelX = 18;  // distance from left edge

    _drawVerticalLabel(ctx, 'HOSTILE LAUNCH ZONE', labelX, enemyCenterY,
      'rgba(255, 100, 100, 1.0)', 'rgba(255, 32, 32, 1.0)', pad);

    _drawVerticalLabel(ctx, 'DEFENDED TERRITORY', labelX, friendlyCenterY,
      'rgba(0, 255, 100, 1.0)', 'rgba(0, 255, 65, 1.0)', pad);

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Grid ──────────────────────────────────────────────────────────────────────

  _drawGrid(ctx, w, h) {
    const cols = Math.ceil(w / GRID_CELL);
    const rows = Math.ceil(h / GRID_CELL);

    ctx.strokeStyle = COLORS.GRID;
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);

    // Vertical lines
    for (let c = 0; c <= cols; c++) {
      const x = c * GRID_CELL;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Horizontal lines
    for (let r = 0; r <= rows; r++) {
      const y = r * GRID_CELL;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Coordinate labels at grid intersections
    ctx.fillStyle = COLORS.GRID_LABEL;
    ctx.font      = '9px "Share Tech Mono", monospace';
    ctx.textAlign = 'left';

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const colLabel = String.fromCharCode(65 + (c % 26)); // A–Z cycling
        const rowLabel = String(r + 1);
        ctx.fillText(`${colLabel}${rowLabel}`, c * GRID_CELL + 3, r * GRID_CELL + 11);
      }
    }
  }

  // ── Topographic contour lines ─────────────────────────────────────────────────

  _drawTopoLines(ctx, w, h) {
    ctx.strokeStyle = COLORS.TOPO;
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);

    for (const path of this._topoPaths) {
      ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const pt = path[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else         ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }
  }
}

// ── Vertical label helper ─────────────────────────────────────────────────────

/**
 * Draw a label rotated -90° (reads bottom-to-top) centered at (cx, cy).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} cx        Horizontal center of the label
 * @param {number} cy        Vertical center of the label
 * @param {string} color     Text fill color
 * @param {string} glow      Shadow/glow color
 * @param {number} pad       Padding inside the backing rect
 */
function _drawVerticalLabel(ctx, text, cx, cy, color, glow, pad) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 2);

  const tw = ctx.measureText(text).width;
  const th = 12; // approximate cap height for 11px font

  // Dark backing rect
  ctx.fillStyle = 'rgba(2, 10, 6, 0.90)';
  ctx.shadowBlur = 0;
  ctx.fillRect(-tw / 2 - pad, -th - pad, tw + pad * 2, th + pad * 2);

  // Text
  ctx.fillStyle   = color;
  ctx.shadowColor = glow;
  ctx.shadowBlur  = 10;
  ctx.fillText(text, 0, 0);
  // Second pass for extra crispness
  ctx.shadowBlur  = 0;
  ctx.fillText(text, 0, 0);

  ctx.restore();
}

// ── Procedural topographic contours ──────────────────────────────────────────

/**
 * Generate `count` wavy contour-line paths using layered sine functions.
 * Each path is a polyline array of {x, y} points.
 *
 * @param {number} w
 * @param {number} h
 * @param {number} count
 * @returns {Array<Array<{x:number, y:number}>>}
 */
function _generateTopoPaths(w, h, count) {
  const paths = [];

  for (let i = 0; i < count; i++) {
    const baseY    = (h / (count + 1)) * (i + 1);
    const amp1     = 20 + Math.random() * 30;
    const amp2     = 10 + Math.random() * 20;
    const freq1    = (0.003 + Math.random() * 0.005);
    const freq2    = (0.008 + Math.random() * 0.012);
    const phase1   = Math.random() * Math.PI * 2;
    const phase2   = Math.random() * Math.PI * 2;

    const pts  = [];
    const step = 8;

    for (let x = 0; x <= w; x += step) {
      const y = baseY
        + amp1 * Math.sin(freq1 * x + phase1)
        + amp2 * Math.sin(freq2 * x + phase2);
      pts.push({ x, y });
    }

    paths.push(pts);
  }

  return paths;
}
