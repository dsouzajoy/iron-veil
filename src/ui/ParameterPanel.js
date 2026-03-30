/**
 * ParameterPanel.js
 *
 * Builds and manages the right-side parameter control terminal.
 *
 * Each parameter is rendered as a labelled slider (or toggle/select) that
 * writes its value directly into `gameState.params` on change.
 *
 * Sections:
 *   [BATTERY SYSTEMS]   — interceptor launcher parameters
 *   [HOSTILE PARAMETERS] — enemy missile configuration
 *   [SIMULATION]        — gravity, time-scale, map settings
 *   [ACTIONS]           — generate map, reset, engage, abort
 */

import { DEFAULTS, PARAM_RANGES, PHASE, GUIDANCE } from '@/constants.js';

export class ParameterPanel {
  /**
   * @param {HTMLElement}                           container   The #param-panel element
   * @param {import('@/GameState.js').GameState}    gameState
   * @param {object}                                callbacks
   * @param {Function}                              callbacks.onGenerateMap
   * @param {Function}                              callbacks.onEngage
   * @param {Function}                              callbacks.onAbort
   * @param {Function}                              callbacks.onReset
   */
  constructor(container, gameState, callbacks) {
    this.container = container;
    this.gameState = gameState;
    this.callbacks = callbacks;

    /** Map of paramKey → <input> element for live updates (e.g. sliders). */
    this._inputs = new Map();

    this._build();
    this._syncButtonStates();

    // React to phase changes
    gameState.on('phaseChange', () => this._syncButtonStates());
    gameState.on('paramsReset', () => this._syncAllInputsToState());
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Update displayed battery ammo counts (called after a battery is placed). */
  refresh() {
    this._syncButtonStates();
  }

  // ── DOM construction ──────────────────────────────────────────────────────────

  _build() {
    this.container.innerHTML = '';

    // ── Header ────────────────────────────────────────────────────────────────
    const header = _el('div', 'panel-header-row');
    header.appendChild(_el('div', 'panel-title', 'IRON VEIL // SYS-CTL'));
    const helpBtn = _el('button', 'action-btn help-btn', '[? HELP]');
    helpBtn.addEventListener('click', () => this.callbacks.onHelp?.());
    header.appendChild(helpBtn);
    this.container.appendChild(header);
    this.container.appendChild(_divider());

    // ── Status panel placeholder (populated by StatusPanel.js) ────────────────
    const statusPlaceholder = _el('div', '', '');
    statusPlaceholder.id = 'status-panel';
    this.container.appendChild(statusPlaceholder);

    // ── Battery Systems ───────────────────────────────────────────────────────
    this.container.appendChild(_sectionHeader('[BATTERY SYSTEMS]'));

    this._addSlider('battery.ammo',             'AMMO (RDS)',        'battery', 'ammo');
    this._addSlider('battery.fireRate',         'FIRE RATE',         'battery', 'fireRate');
    this._addSlider('battery.range',            'ENG. RANGE',        'battery', 'range');
    this._addSlider('battery.interceptorSpeed', 'INTR. SPEED',       'battery', 'interceptorSpeed');
    this._addSlider('battery.turnRate',         'TURN RATE',         'battery', 'turnRate');
    this._addSlider('battery.killRadius',       'KILL RADIUS',       'battery', 'killRadius');
    this._addGuidanceToggle();

    // ── Hostile Parameters ────────────────────────────────────────────────────
    this.container.appendChild(_sectionHeader('[HOSTILE PARAMETERS]'));

    this._addSlider('hostile.launchCount',             'LAUNCH COUNT',   'hostile', 'launchCount');
    this._addSlider('hostile.speed',                   'SPEED',          'hostile', 'speed');
    this._addEvasionSelect();
    this._addSlider('hostile.terminalActivationRange', 'TERMINAL RANGE', 'hostile', 'terminalActivationRange');
    this._addSlider('hostile.terminalJinkForce',       'TERMINAL FORCE', 'hostile', 'terminalJinkForce');
    this._addFlightToggle();

    // ── Simulation ────────────────────────────────────────────────────────────
    this.container.appendChild(_sectionHeader('[SIMULATION]'));

    this._addSlider('simulation.gravity',           'GRAVITY',       'simulation', 'gravity');
    this._addSlider('simulation.timeScale',         'TIME SCALE',    'simulation', 'timeScale');
    this._addSlider('simulation.installationCount', 'INSTALLATIONS', 'simulation', 'installationCount');
    this._addSlider('simulation.batteryBudget',     'BATTERY BUDGET','simulation', 'batteryBudget');
    this._addSlider('simulation.tierIIIPercent',    'TIER III %',    'simulation', 'tierIIIPercent');

    // ── Map & Terrain ─────────────────────────────────────────────────────────
    this.container.appendChild(_sectionHeader('[MAP & TERRAIN]'));

    this._addSlider('simulation.frontlineRoughness',    'FRONT ROUGHNESS', 'simulation', 'frontlineRoughness');
    this._addSlider('simulation.frontlineMeanAltitude', 'FRONT ALTITUDE',  'simulation', 'frontlineMeanAltitude');

    // ── Actions ───────────────────────────────────────────────────────────────
    this.container.appendChild(_sectionHeader('[ACTIONS]'));
    this._buildActionButtons();
  }

  // ── Slider helper ─────────────────────────────────────────────────────────────

  /**
   * @param {string} key         Full dotted key for PARAM_RANGES lookup
   * @param {string} label       Display label
   * @param {string} section     Top-level key in gameState.params (e.g. 'battery')
   * @param {string} field       Second-level key (e.g. 'ammo')
   */
  _addSlider(key, label, section, field) {
    const range   = PARAM_RANGES[key];
    if (!range) return;

    const current = this.gameState.params[section][field];
    const { min, max, step, unit } = range;

    const row      = _el('div', 'param-row');
    const labelRow = _el('div', 'param-label-row');
    const lbl      = _el('span', 'param-label', label);
    const val      = _el('span', 'param-value', `${current}${unit}`);
    labelRow.appendChild(lbl);
    labelRow.appendChild(val);

    const input = document.createElement('input');
    input.type  = 'range';
    input.min   = min;
    input.max   = max;
    input.step  = step;
    input.value = current;

    input.addEventListener('input', () => {
      const parsed = parseFloat(input.value);
      this.gameState.params[section][field] = parsed;
      val.textContent = `${parsed}${unit}`;
    });

    row.appendChild(labelRow);
    row.appendChild(input);
    this.container.appendChild(row);

    // Track input for reset sync
    this._inputs.set(key, { input, valEl: val, section, field, unit });
  }

  // ── Guidance toggle ───────────────────────────────────────────────────────────

  _addGuidanceToggle() {
    const row    = _el('div', 'param-row');
    const lbl    = _el('div', 'param-label', 'GUIDANCE ALGORITHM');
    const group  = _el('div', 'toggle-group');

    const btnPred = _el('button', 'toggle-btn', 'PREDICTIVE');
    const btnPN   = _el('button', 'toggle-btn', 'PROP NAV');

    const update = () => {
      const isPred = this.gameState.params.battery.guidance === GUIDANCE.PREDICTIVE;
      btnPred.classList.toggle('active', isPred);
      btnPN.classList.toggle('active', !isPred);
    };

    btnPred.addEventListener('click', () => {
      this.gameState.params.battery.guidance = GUIDANCE.PREDICTIVE;
      update();
    });
    btnPN.addEventListener('click', () => {
      this.gameState.params.battery.guidance = GUIDANCE.PROPORTIONAL;
      update();
    });

    group.appendChild(btnPred);
    group.appendChild(btnPN);
    row.appendChild(lbl);
    row.appendChild(group);
    this.container.appendChild(row);

    // Store refs for reset
    this._guidanceBtnPred = btnPred;
    this._guidanceBtnPN   = btnPN;
    this._guidanceUpdate  = update;
    update();
  }

  // ── Evasion mode select ───────────────────────────────────────────────────────

  _addEvasionSelect() {
    const row   = _el('div', 'param-row');
    const lbl   = _el('div', 'param-label-row');
    lbl.appendChild(_el('span', 'param-label', 'EVASION MODE'));

    const sel = document.createElement('select');
    [['none', 'BALLISTIC'], ['evade', 'EVADE']].forEach(([val, text]) => {
      const opt = document.createElement('option');
      opt.value       = val;
      opt.textContent = text;
      sel.appendChild(opt);
    });
    sel.value = this.gameState.params.hostile.evasionMode;
    sel.addEventListener('change', () => {
      this.gameState.params.hostile.evasionMode = sel.value;
    });

    row.appendChild(lbl);
    row.appendChild(sel);
    this.container.appendChild(row);
    this._evasionSelect = sel;
  }

  // ── Flight path toggle ────────────────────────────────────────────────────────

  _addFlightToggle() {
    const row   = _el('div', 'param-row');
    const lbl   = _el('div', 'param-label', 'FLIGHT PATH');
    const group = _el('div', 'toggle-group');

    const btnBal  = _el('button', 'toggle-btn', 'BALLISTIC');
    const btnStr  = _el('button', 'toggle-btn', 'STRAIGHT');

    const update = () => {
      const isBal = this.gameState.params.hostile.flightPath === 'ballistic';
      btnBal.classList.toggle('active', isBal);
      btnStr.classList.toggle('active', !isBal);
    };

    btnBal.addEventListener('click', () => {
      this.gameState.params.hostile.flightPath = 'ballistic';
      update();
    });
    btnStr.addEventListener('click', () => {
      this.gameState.params.hostile.flightPath = 'straight';
      update();
    });

    group.appendChild(btnBal);
    group.appendChild(btnStr);
    row.appendChild(lbl);
    row.appendChild(group);
    this.container.appendChild(row);

    this._flightBtnBal = btnBal;
    this._flightBtnStr = btnStr;
    this._flightUpdate = update;
    update();
  }

  // ── Action buttons ────────────────────────────────────────────────────────────

  _buildActionButtons() {
    this._btnGenerate = _actionButton('[GENERATE MAP]',        () => this.callbacks.onGenerateMap());
    this._btnReset    = _actionButton('[RESET PARAMETERS]',    () => {
      this.gameState.resetParams();
    });
    this._btnEngage   = _actionButton('[ENGAGE]',              () => this.callbacks.onEngage());
    this._btnAbort    = _actionButton('[ABORT ENGAGEMENT]',    () => this.callbacks.onAbort());

    this._btnEngage.classList.add('primary');
    this._btnAbort.classList.add('danger');

    this.container.appendChild(this._btnGenerate);
    this.container.appendChild(this._btnReset);
    this.container.appendChild(this._btnEngage);
    this.container.appendChild(this._btnAbort);
  }

  // ── Button state sync ─────────────────────────────────────────────────────────

  _syncButtonStates() {
    const phase        = this.gameState.phase;
    const isDeployment = phase === PHASE.DEPLOYMENT;
    const isEngagement = phase === PHASE.ENGAGEMENT;

    this._btnGenerate.disabled = isEngagement;
    this._btnReset.disabled    = isEngagement;
    this._btnEngage.disabled   = !isDeployment;
    this._btnAbort.disabled    = !isEngagement;
  }

  // ── Reset sync ────────────────────────────────────────────────────────────────

  _syncAllInputsToState() {
    for (const [, { input, valEl, section, field, unit }] of this._inputs) {
      const v = this.gameState.params[section][field];
      input.value     = v;
      valEl.textContent = `${v}${unit}`;
    }
    this._guidanceUpdate?.();
    this._flightUpdate?.();
    if (this._evasionSelect) {
      this._evasionSelect.value = this.gameState.params.hostile.evasionMode;
    }
  }
}

// ── DOM utility helpers ───────────────────────────────────────────────────────

function _el(tag, className, text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text)      el.textContent = text;
  return el;
}

function _sectionHeader(text) {
  return _el('div', 'section-header', text);
}

function _divider() {
  const d = document.createElement('hr');
  d.style.cssText = 'border:none;border-top:1px solid #1a4a2a;margin:4px 0';
  return d;
}

function _actionButton(label, onClick) {
  const btn = _el('button', 'action-btn', label);
  btn.addEventListener('click', onClick);
  return btn;
}
