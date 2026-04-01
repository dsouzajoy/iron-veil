/**
 * UIController.js
 *
 * Orchestrates all user-interface concerns:
 *   - Wires ParameterPanel, StatusPanel, AfterActionReport, and Tutorial together.
 *   - Handles mouse events on the canvas for battery placement (DEPLOYMENT).
 *   - Supports battery removal: clicking an already-placed battery removes it.
 *   - Enforces placement rules (defended zone only, within battery budget).
 *   - Translates action-button callbacks into GameState transitions.
 *   - Routes UI interaction events to AudioSystem.
 *
 * UIController does NOT render anything directly — it coordinates between
 * the game systems and the UI modules.
 */

import { ParameterPanel }    from './ParameterPanel.js';
import { StatusPanel }       from './StatusPanel.js';
import { AfterActionReport } from './AfterActionReport.js';
import { Tutorial }              from './Tutorial.js';
import { AdvancedModeTutorial }  from './AdvancedModeTutorial.js';
import { Battery }           from '@/entities/Battery.js';
import { PHASE } from '@/constants.js';
import { generateFrontline } from '@/systems/FrontlineGenerator.js';

/** Pixel radius within which clicking an existing battery selects/removes it. */
const BATTERY_HIT_RADIUS = 18;

export class UIController {
  /**
   * @param {object} deps
   * @param {import('@/GameState.js').GameState}                    deps.gameState
   * @param {import('@/rendering/Renderer.js').Renderer}            deps.renderer
   * @param {Function}                                              deps.generateMap
   * @param {import('@/systems/ScoringSystem.js').ScoringSystem}    deps.scoringSystem
   * @param {import('@/audio/AudioSystem.js').AudioSystem}          deps.audioSystem
   * @param {Function}                                              deps.startEngagement
   * @param {Function}                                              deps.abortEngagement
   */
  constructor({ gameState, renderer, generateMap, scoringSystem, audioSystem, startEngagement, abortEngagement }) {
    this.gameState        = gameState;
    this.renderer         = renderer;
    this.generateMap      = generateMap;
    this.scoringSystem    = scoringSystem;
    this.audioSystem      = audioSystem;
    this.startEngagement  = startEngagement;
    this.abortEngagement  = abortEngagement;

    // ── Sub-modules ───────────────────────────────────────────────────────────
    const panelEl = document.getElementById('param-panel');

    this.paramPanel = new ParameterPanel(panelEl, gameState, {
      onGenerateMap:         () => this._handleGenerateMap(),
      onEngage:              () => this._handleEngage(),
      onAbort:               () => this._handleAbort(),
      onReset:               () => {},
      onHelp:                () => this.tutorial.show(),
      onAdvancedModeEnabled: () => this.advancedTutorial.showIfNeeded(),
    });

    this.statusPanel = new StatusPanel(gameState);

    this.aar = new AfterActionReport(gameState, scoringSystem, {
      onReEngage:      () => this._handleReEngage(),
      onNewEngagement: () => this._handleNewEngagement(),
    });

    this.tutorial         = new Tutorial();
    this.advancedTutorial = new AdvancedModeTutorial();

    // ── Mouse event wiring ────────────────────────────────────────────────────
    this._hoveredBatteryIndex = -1;
    this._bindMouseEvents();

    // ── Phase reactions ───────────────────────────────────────────────────────
    gameState.on('phaseChange', phase => this._onPhaseChange(phase));

    // ── Show tutorial on first load ───────────────────────────────────────────
    // Delay slightly so the map renders first (gives better visual context)
    setTimeout(() => this.tutorial.showIfNeeded(), 400);
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Called every frame from main.js during ENGAGEMENT to refresh the HUD.
   */
  update() {
    if (this.gameState.phase === PHASE.ENGAGEMENT) {
      this.statusPanel.update();
    }
  }

  // ── Phase reactions ───────────────────────────────────────────────────────────

  _onPhaseChange(phase) {
    // Clear hover state on phase change
    this._setHoveredBattery(-1);

    if (phase === PHASE.AFTER_ACTION) {
      this.aar.show();
    }
  }

  // ── Action-button handlers ────────────────────────────────────────────────────

  _handleGenerateMap() {
    const gs = this.gameState;

    const frontline = generateFrontline(
      gs.canvasWidth,
      gs.canvasHeight,
      gs.params.simulation.frontlineRoughness,
      gs.params.simulation.frontlineMeanAltitude,
    );
    gs.setFrontline(frontline);   // emits 'frontlineChanged' → background.resize()

    gs.buildings = this.generateMap({
      canvasWidth:    gs.canvasWidth,
      canvasHeight:   gs.canvasHeight,
      count:          gs.params.simulation.installationCount,
      tierIIIPercent: gs.params.simulation.tierIIIPercent,
      frontline,
    });
    gs.batteries = [];
    this._setHoveredBattery(-1);
    this.renderer.markEntitiesDirty();
  }

  _handleEngage() {
    const gs = this.gameState;
    if (gs.batteries.length === 0) return;
    this.startEngagement();
    this.renderer.setPlacementGhost(null);
  }

  _handleAbort() {
    this.abortEngagement();
    this.renderer.setPlacementGhost(null);
  }

  _handleReEngage() {
    const gs = this.gameState;
    gs.buildings.forEach(b => { b.destroyed = false; });
    gs.startDeployment();
    this.renderer.markEntitiesDirty();
  }

  _handleNewEngagement() {
    this._handleGenerateMap();
    this.gameState.startDeployment();
  }

  // ── Mouse event handling ──────────────────────────────────────────────────────

  _bindMouseEvents() {
    const canvas = this.renderer.interactionCanvas;

    canvas.addEventListener('mousemove', e => {
      // Unlock audio on first interaction
      this.audioSystem.unlock();

      if (this.gameState.phase !== PHASE.DEPLOYMENT) {
        this.renderer.setPlacementGhost(null);
        this._setHoveredBattery(-1);
        return;
      }

      const pos        = this._canvasPos(e, canvas);
      const batteryIdx = this._batteryAt(pos);

      this._setHoveredBattery(batteryIdx);

      if (batteryIdx >= 0) {
        // Hovering over existing battery — show removal hint, no placement ghost
        this.renderer.setPlacementGhost(null);
      } else if (this._isValidPlacement(pos)) {
        this.renderer.setPlacementGhost(pos);
      } else {
        this.renderer.setPlacementGhost(null);
      }
    });

    canvas.addEventListener('mouseleave', () => {
      this.renderer.setPlacementGhost(null);
      this._setHoveredBattery(-1);
    });

    canvas.addEventListener('click', e => {
      this.audioSystem.unlock();

      if (this.gameState.phase !== PHASE.DEPLOYMENT) return;

      const pos        = this._canvasPos(e, canvas);
      const batteryIdx = this._batteryAt(pos);

      if (batteryIdx >= 0) {
        // ── Remove existing battery ───────────────────────────────────────────
        this.gameState.batteries.splice(batteryIdx, 1);
        this._setHoveredBattery(-1);
        this.renderer.setPlacementGhost(null);
        this.renderer.markEntitiesDirty();
        this.paramPanel.refresh();
        this.audioSystem.playBatteryRemove();
      } else {
        // ── Place new battery ─────────────────────────────────────────────────
        const gs = this.gameState;
        if (!this._isValidPlacement(pos)) return;
        if (gs.batteries.length >= gs.params.simulation.batteryBudget) return;

        const battery = new Battery({
          x: pos.x,
          y: pos.y,
          params: gs.params.battery,
        });
        gs.batteries.push(battery);
        this.renderer.markEntitiesDirty();
        this.paramPanel.refresh();
        this.audioSystem.playBatteryPlace();
      }
    });

    // Prevent context menu on right-click so we own that interaction if needed
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ── Battery hit-testing ───────────────────────────────────────────────────────

  /**
   * Returns the index of the battery the pointer is over, or -1 if none.
   * @param {{x:number, y:number}} pos
   * @returns {number}
   */
  _batteryAt(pos) {
    const batteries = this.gameState.batteries;
    for (let i = batteries.length - 1; i >= 0; i--) {
      const b = batteries[i];
      if (Math.hypot(pos.x - b.x, pos.y - b.y) <= BATTERY_HIT_RADIUS) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Update the hovered battery index in both local state and the renderer.
   * @param {number} idx  -1 = none
   */
  _setHoveredBattery(idx) {
    if (this._hoveredBatteryIndex === idx) return;
    this._hoveredBatteryIndex = idx;
    this.renderer.setHoveredBattery(idx);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  /**
   * Convert a MouseEvent to canvas-local coordinates.
   * @param {MouseEvent} e
   * @param {HTMLCanvasElement} canvas
   * @returns {{x:number, y:number}}
   */
  _canvasPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  /**
   * A placement is valid if it falls within the defended zone and the
   * battery budget hasn't been exhausted.
   * @param {{x:number, y:number}} pos
   * @returns {boolean}
   */
  _isValidPlacement(pos) {
    const gs     = this.gameState;
    const minY   = gs.getFrontlineY(pos.x);   // per-column irregular boundary
    const budget = gs.params.simulation.batteryBudget;

    return (
      pos.y >= minY &&
      pos.y <= gs.canvasHeight &&
      pos.x >= 0 &&
      pos.x <= gs.canvasWidth &&
      gs.batteries.length < budget
    );
  }
}
