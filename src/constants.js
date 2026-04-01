/**
 * constants.js
 *
 * Single source of truth for all game-wide magic numbers, default parameter
 * values, color palette, scoring rules, and rating thresholds.
 *
 * Nothing in here should be mutable at runtime — the live, editable copy of
 * each value lives in GameState.params (which is seeded from DEFAULTS below).
 */

// ── UI layout ────────────────────────────────────────────────────────────────

/** Width (px) of the right-side parameter panel — excluded from canvas space. */
export const UI_PANEL_WIDTH = 320;

// ── Color palette ────────────────────────────────────────────────────────────

export const COLORS = {
  BG:           '#050f0a',
  BG_MID:       '#0a1a10',
  GREEN:        '#00ff41',
  GREEN_DIM:    '#00882a',
  GREEN_GLOW:   '#39ff14',
  AMBER:        '#ffb000',
  RED:          '#ff2020',
  CYAN:         '#00cccc',
  BORDER:       '#1a4a2a',
  GRID:         'rgba(0, 136, 42, 0.18)',
  GRID_LABEL:   'rgba(0, 136, 42, 0.45)',
  TOPO:         'rgba(0, 80, 25, 0.12)',
  FRONTLINE_ENEMY:    'rgba(180, 90,  0, 0.18)',
  FRONTLINE_FRIENDLY: 'rgba(0, 100, 50, 0.16)',
  FRONTLINE_LINE:     'rgba(255, 176, 0, 0.55)',
};

// ── Building tiers ───────────────────────────────────────────────────────────

/**
 * Each tier entry defines:
 *   label   — prefix used when generating installation IDs
 *   icon    — which shape the EntityRenderer draws  ('square'|'antenna'|'star')
 *   radius  — collision radius in logical pixels
 */
export const BUILDING_TIERS = [
  { label: 'OBJ',  icon: 'square',  radius: 14 }, // Tier I
  { label: 'COM',  icon: 'antenna', radius: 18 }, // Tier II
  { label: 'CMD',  icon: 'star',    radius: 22 }, // Tier III
];

// ── Scoring ──────────────────────────────────────────────────────────────────

export const SCORE = {
  /** Points awarded when a building survives, indexed by tier (0-based). */
  BUILDING_SURVIVE:  [100, 250, 500],

  /** Points deducted when a building is destroyed, indexed by tier (0-based). */
  BUILDING_DESTROY:  [-80, -200, -400],

  /** Awarded each time an interceptor kills a hostile. */
  HOSTILE_KILL: 50,

  /** Deducted each time an interceptor expires without a kill. */
  INTERCEPTOR_WASTE: -10,
};

/** Survival-Index rating thresholds (lower bound inclusive). */
export const RATINGS = [
  { min: -Infinity, label: 'MISSION CRITICAL FAILURE', cssClass: 'critical' },
  { min: 0,         label: 'MARGINAL',                  cssClass: 'marginal' },
  { min: 500,       label: 'ACCEPTABLE',                cssClass: 'acceptable' },
  { min: 1500,      label: 'COMMENDABLE',               cssClass: 'commendable' },
  { min: 3000,      label: 'EXEMPLARY',                 cssClass: 'exemplary' },
];

// ── Default simulation parameters ────────────────────────────────────────────

/**
 * These are the "factory default" values.  GameState seeds its `.params`
 * object from here, and ParameterPanel resets back to these on [RESET].
 */
export const DEFAULTS = {
  // Battery (interceptor launcher) settings
  battery: {
    ammo:             10,   // interceptors per battery
    fireRate:         1.5,  // shots per second
    range:            200,  // engagement envelope radius (px)
    interceptorSpeed: 180,  // px/s
    turnRate:         2.5,  // rad/s max angular velocity
    killRadius:       20,   // blast radius on detonation (px)
    guidance:             'apn',  // 'apn' | 'proportional'
    navigationConstant:   3,      // N for PN/APN (1–6)
    apnCorrectionGain:    1.0,    // APN bias term gain (0.0–2.0)
  },

  // Hostile missile settings
  hostile: {
    launchCount:   12,
    speed:         120,        // px/s
    flightPath:    'ballistic', // 'ballistic' | 'straight'
    evasionMode:             'none',  // 'none' | 'evade'
    terminalActivationRange: 120,    // px — interceptor proximity that triggers terminal phase
    terminalJinkForce:       80,     // px/s — lateral delta-v applied per maneuver
    targetMode:              'weighted', // 'random' | 'weighted' (by tier importance)
  },

  // Simulation-wide settings
  simulation: {
    gravity:               80,   // px/s² downward acceleration
    timeScale:             1.0,  // simulation speed multiplier
    installationCount:     10,   // buildings per engagement
    batteryBudget:         3,    // batteries the player may place
    tierIIIPercent:        20,   // % of buildings that are Tier III (rest split I/II)
    frontlineRoughness:    0.5,  // 0.0 = nearly flat, 1.0 = highly irregular
    frontlineMeanAltitude: 0.30, // fraction from top (0.10–0.60)
  },

  // Sensor & C2 settings (§4.1 / §4.2 — Radar Detection Model + Track Quality)
  sensor: {
    detectionRange:  280,  // px — radar coverage radius per battery
    minTrackQuality: 0.4,  // 0.0–1.0 — minimum track quality before a battery may fire
  },
};

// ── Slider range definitions (used by ParameterPanel) ────────────────────────

/**
 * Defines the min / max / step for every configurable slider.
 * Keys must match the nested key path in DEFAULTS, e.g. 'battery.ammo'.
 */
export const PARAM_RANGES = {
  'battery.ammo':             { min: 5,    max: 30,   step: 1,    unit: 'rds' },
  'battery.fireRate':         { min: 0.5,  max: 5,    step: 0.1,  unit: '/s' },
  'battery.range':            { min: 100,  max: 400,  step: 10,   unit: 'px' },
  'battery.interceptorSpeed': { min: 80,   max: 400,  step: 10,   unit: 'px/s' },
  'battery.turnRate':         { min: 0.5,  max: 10,   step: 0.1,  unit: 'r/s' },
  'battery.killRadius':          { min: 5,   max: 60,  step: 1,   unit: 'px' },
  'battery.navigationConstant':  { min: 1,   max: 6,   step: 1,   unit: '' },
  'battery.apnCorrectionGain':   { min: 0.0, max: 2.0, step: 0.1, unit: '' },

  'hostile.launchCount':              { min: 5,   max: 30,  step: 1,  unit: '' },
  'hostile.speed':                    { min: 60,  max: 300, step: 10, unit: 'px/s' },
  'hostile.terminalActivationRange':  { min: 60,  max: 200, step: 5,  unit: 'px' },
  'hostile.terminalJinkForce':        { min: 20,  max: 160, step: 5,  unit: 'px/s' },

  'simulation.gravity':               { min: 0,    max: 200,  step: 5,    unit: 'px/s²' },
  'simulation.timeScale':             { min: 0.25, max: 3,    step: 0.25, unit: '×' },
  'simulation.installationCount':     { min: 5,    max: 20,   step: 1,    unit: '' },
  'simulation.batteryBudget':         { min: 1,    max: 8,    step: 1,    unit: '' },
  'simulation.tierIIIPercent':        { min: 0,    max: 60,   step: 5,    unit: '%' },
  'simulation.frontlineRoughness':    { min: 0.0,  max: 1.0,  step: 0.05, unit: '' },
  'simulation.frontlineMeanAltitude': { min: 0.10, max: 0.60, step: 0.01, unit: '' },

  // Sensor & C2 (§4.1 / §4.2)
  'sensor.detectionRange':  { min: 100, max: 500, step: 10,   unit: 'px' },
  'sensor.minTrackQuality': { min: 0.0, max: 1.0, step: 0.05, unit: '' },
};

// ── Game phase identifiers ────────────────────────────────────────────────────

export const PHASE = {
  DEPLOYMENT:   'DEPLOYMENT',
  ENGAGEMENT:   'ENGAGEMENT',
  AFTER_ACTION: 'AFTER_ACTION',
};

// ── Guidance algorithm identifiers ───────────────────────────────────────────

export const GUIDANCE = {
  APN:          'apn',          // Augmented Proportional Navigation (default)
  PROPORTIONAL: 'proportional', // Standard Proportional Navigation (fallback)
};

// ── Misc physics / behaviour constants ───────────────────────────────────────

/** Maximum simulated time-step (s) to prevent tunnelling at high speeds. */
export const MAX_DELTA = 1 / 30;

/** Lifetime (s) of an interceptor before self-destruct. */
export const INTERCEPTOR_LIFETIME = 8;

/** Distance threshold (px) within which Evade mode kicks in. */
export const EVADE_THRESHOLD_PX = 150;

/** Number of trail positions stored per missile for rendering. */
export const TRAIL_LENGTH = 16;

/** Duration (s) of an explosion ring animation. */
export const EXPLOSION_DURATION = 0.4;

/** Max pixel radius an explosion ring expands to. */
export const EXPLOSION_MAX_RADIUS = 36;

/** Stagger delay (s) between successive hostile launches. */
export const HOSTILE_LAUNCH_STAGGER = 0.4;
