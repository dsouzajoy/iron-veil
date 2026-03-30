/**
 * BackgroundRenderer.js  (Layer 0)
 *
 * Draws the static tactical backdrop:
 *   - Dark terrain fill
 *   - Faint coordinate grid with alphanumeric labels (A1, B4 …)
 *   - Procedural topographic contour lines
 *   - Launch-zone separator line (hostile territory boundary)
 *
 * Everything here is pre-rendered once into an offscreen canvas and blitted
 * to the main canvas each frame — no per-frame work beyond a single drawImage.
 */

import { COLORS, LAUNCH_ZONE_RATIO } from '@/constants.js';

// Grid cell size in logical pixels — determines coordinate label density
const GRID_CELL = 80;

// Number of topographic contour paths to pre-generate
const TOPO_LINE_COUNT = 12;

export class BackgroundRenderer {
  /**
   * @param {HTMLCanvasElement} canvas  The background canvas (Layer 0)
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    /** Offscreen canvas holding the static background. */
    this._offscreen    = null;
    this._offscreenCtx = null;

    /** Pre-generated topographic contour paths (reused each frame). */
    this._topoPaths = [];
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Called whenever the canvas is resized.
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
   * Called once on resize; result is reused every frame.
   */
  _renderStatic(w, h) {
    const ctx = this._offscreenCtx;

    // Background fill
    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(0, 0, w, h);

    // Topographic contour lines
    this._drawTopoLines(ctx, w, h);

    // Tactical grid
    this._drawGrid(ctx, w, h);

    // Launch-zone separator
    this._drawLaunchZoneLine(ctx, w, h);
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

  // ── Launch-zone separator ─────────────────────────────────────────────────────

  _drawLaunchZoneLine(ctx, w, h) {
    const y = h * LAUNCH_ZONE_RATIO;

    // Separator line — brighter so it reads clearly
    ctx.strokeStyle = 'rgba(255, 32, 32, 0.70)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels — larger font, full opacity, with a dark backing rect for legibility
    ctx.font = 'bold 11px "Share Tech Mono", monospace';

    const labelAbove = '▲  HOSTILE LAUNCH ZONE';
    const labelBelow = '▼  DEFENDED TERRITORY';
    const pad = 5;

    // Back-fill above label
    const wAbove = ctx.measureText(labelAbove).width;
    ctx.fillStyle = 'rgba(5, 15, 10, 0.70)';
    ctx.fillRect(6, y - 17, wAbove + pad * 2, 14);

    ctx.fillStyle  = 'rgba(255, 80, 80, 0.95)';
    ctx.shadowColor = 'rgba(255, 32, 32, 0.6)';
    ctx.shadowBlur  = 6;
    ctx.textAlign   = 'left';
    ctx.fillText(labelAbove, 8 + pad, y - 6);

    // Back-fill below label
    const wBelow = ctx.measureText(labelBelow).width;
    ctx.fillStyle = 'rgba(5, 15, 10, 0.70)';
    ctx.shadowBlur = 0;
    ctx.fillRect(6, y + 4, wBelow + pad * 2, 14);

    ctx.fillStyle   = 'rgba(0, 220, 80, 0.95)';
    ctx.shadowColor = 'rgba(0, 255, 65, 0.5)';
    ctx.shadowBlur  = 6;
    ctx.fillText(labelBelow, 8 + pad, y + 15);

    ctx.shadowBlur = 0;
  }
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
