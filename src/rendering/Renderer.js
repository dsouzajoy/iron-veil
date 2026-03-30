/**
 * Renderer.js
 *
 * Orchestrates all three canvas layers and their sub-renderers.
 *
 * Owns:
 *   - canvas-bg      → BackgroundRenderer  (Layer 0)
 *   - canvas-entities → EntityRenderer     (Layer 1)
 *   - canvas-dynamic  → DynamicRenderer    (Layer 2)
 *
 * Responsibilities:
 *   - Measuring the viewport and computing canvas dimensions on startup/resize.
 *   - Writing canvas dimensions back into GameState so systems can reference them.
 *   - Dispatching render calls to each sub-renderer every frame.
 *   - Exposing public setters for UIController (placement ghost, hovered battery).
 */

import { BackgroundRenderer } from './BackgroundRenderer.js';
import { EntityRenderer }     from './EntityRenderer.js';
import { DynamicRenderer }    from './DynamicRenderer.js';
import { UI_PANEL_WIDTH }     from '@/constants.js';

export class Renderer {
  /**
   * @param {import('@/GameState.js').GameState} gameState
   */
  constructor(gameState) {
    this.gameState = gameState;

    // Grab the three canvas elements from the DOM
    this._bgCanvas      = document.getElementById('canvas-bg');
    this._entityCanvas  = document.getElementById('canvas-entities');
    this._dynamicCanvas = document.getElementById('canvas-dynamic');

    // Instantiate sub-renderers
    this.background = new BackgroundRenderer(this._bgCanvas);
    this.entities   = new EntityRenderer(this._entityCanvas);
    this.dynamic    = new DynamicRenderer(this._dynamicCanvas);

    // Initial sizing
    this.resize();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Resize all canvases to fill the available viewport area.
   * Called on construction and on window 'resize' events.
   */
  resize() {
    const w = window.innerWidth  - UI_PANEL_WIDTH;
    const h = window.innerHeight;

    this._setCanvasSize(this._bgCanvas,      w, h);
    this._setCanvasSize(this._entityCanvas,  w, h);
    this._setCanvasSize(this._dynamicCanvas, w, h);

    // Propagate dimensions to GameState for use by game systems
    this.gameState.canvasWidth  = w;
    this.gameState.canvasHeight = h;

    // Rebuild static background layer
    this.background.resize();

    // Force entity layer to redraw after resize
    this.entities.markDirty();
  }

  /**
   * Render one frame across all three layers.
   */
  render() {
    this.background.render();
    this.entities.render(this.gameState);
    this.dynamic.render(this.gameState);
  }

  /**
   * Set the hover ghost for battery placement preview.
   * Pass null to clear.
   *
   * @param {{x:number, y:number}|null} pos
   */
  setPlacementGhost(pos) {
    this.dynamic.placementGhost = pos;
  }

  /**
   * Mark the entity layer dirty (triggers a redraw next frame).
   * Called when batteries are placed, buildings change state, etc.
   */
  markEntitiesDirty() {
    this.entities.markDirty();
  }

  /**
   * Set the index of the battery currently under the mouse pointer.
   * -1 clears the hover state. The dynamic layer draws a removal hint ring.
   * @param {number} index
   */
  setHoveredBattery(index) {
    this.dynamic.hoveredBatteryIndex = index;
  }

  /** The dynamic canvas element (used by UIController to attach mouse events). */
  get interactionCanvas() {
    return this._dynamicCanvas;
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  _setCanvasSize(canvas, w, h) {
    canvas.width  = w;
    canvas.height = h;
  }
}
