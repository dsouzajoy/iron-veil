/**
 * main.js
 *
 * Entry point for IRON VEIL.
 *
 * Responsibilities:
 *   1. Instantiate all systems and wire them together.
 *   2. Kick off the initial map generation and DEPLOYMENT phase.
 *   3. Run the requestAnimationFrame game loop.
 *
 * Architecture overview:
 *
 *   GameState          — owns all mutable state; event bus for phase changes
 *   Renderer           — manages 3 canvas layers; sub-renderers per layer
 *   MapGenerator       — procedural Poisson-disc building placement
 *   GuidanceSystem     — interceptor steering algorithms (PP + PN)
 *   TargetAssignment   — battery fire-control loop
 *   CollisionSystem    — hit detection & explosion spawning
 *   ScoringSystem      — live score accumulation + final rating
 *   AudioSystem        — Web Audio API synthetic sound effects
 *   UIController       — DOM wiring, mouse events, status HUD orchestration
 */

import { GameState }        from './GameState.js';
import { Renderer }         from './rendering/Renderer.js';
import { generateMap }      from './systems/MapGenerator.js';
import { GuidanceSystem }   from './systems/GuidanceSystem.js';
import { TargetAssignment } from './systems/TargetAssignment.js';
import { CollisionSystem }  from './systems/CollisionSystem.js';
import { ScoringSystem }    from './systems/ScoringSystem.js';
import { AudioSystem }      from './audio/AudioSystem.js';
import { UIController }     from './ui/UIController.js';
import { HostileMissile }   from './entities/HostileMissile.js';
import { MAX_DELTA, PHASE, HOSTILE_LAUNCH_STAGGER } from './constants.js';
import { generateFrontline } from './systems/FrontlineGenerator.js';

// ── 1. Instantiate core systems ───────────────────────────────────────────────

const gameState   = new GameState();
const renderer    = new Renderer(gameState);
const audioSystem = new AudioSystem();

const guidanceSystem   = new GuidanceSystem();
const scoringSystem    = new ScoringSystem(gameState);
const targetAssignment = new TargetAssignment(gameState, guidanceSystem);
const collisionSystem  = new CollisionSystem(gameState, scoringSystem);

// ── 2. Wire AudioSystem to GameState events ───────────────────────────────────

gameState.on('interceptorFired',   () => audioSystem.playInterceptorLaunch());
gameState.on('hostileKilled',      () => audioSystem.playInterceptKill());
gameState.on('buildingDestroyed',  () => audioSystem.playBuildingImpact());
gameState.on('batteryDestroyed',   () => audioSystem.playBuildingImpact());
gameState.on('phaseChange', phase => {
  if (phase === PHASE.ENGAGEMENT)   audioSystem.playEngagementStart();
  if (phase === PHASE.AFTER_ACTION) audioSystem.playEngagementEnd();
});

// ── 3. Hostile launch scheduler ───────────────────────────────────────────────

/**
 * Prepares the list of hostile missiles to launch.
 * Each hostile has a scheduled launch time offset so they stagger in.
 */
function scheduleHostiles() {
  const gs      = gameState;
  const count   = gs.params.hostile.launchCount;
  // Spawn well within enemy territory — 40% of the mean-altitude height
  const launchY = gs.canvasHeight * gs.params.simulation.frontlineMeanAltitude * 0.4;

  // Generate 2–4 fixed launch sites spread across enemy territory
  const siteCount = 2 + Math.floor(Math.random() * 3);  // 2, 3, or 4
  gs.launchSites = [];
  for (let s = 0; s < siteCount; s++) {
    const x = (gs.canvasWidth * 0.1) + (s / (siteCount - 1 || 1)) * (gs.canvasWidth * 0.8)
              + (Math.random() - 0.5) * (gs.canvasWidth * 0.1);
    gs.launchSites.push({ x: Math.max(gs.canvasWidth * 0.05, Math.min(gs.canvasWidth * 0.95, x)), y: launchY });
  }

  const schedule = [];

  for (let i = 0; i < count; i++) {
    // Assign each missile to a launch site (cycling through them)
    const site    = gs.launchSites[i % gs.launchSites.length];
    const launchX = site.x;
    const target  = _pickTarget(gs);

    const missile = new HostileMissile({
      x:       launchX,
      y:       launchY,
      targetX: target.x,
      targetY: target.y,
      params:  gs.params,
    });

    schedule.push({ missile, launchAt: i * HOSTILE_LAUNCH_STAGGER });
  }

  return schedule;
}

/**
 * Select a target building for a hostile missile.
 * 'weighted' mode biases toward higher-tier buildings.
 *
 * @param {import('./GameState.js').GameState} gs
 * @returns {import('./entities/Building.js').Building}
 */
function _pickTarget(gs) {
  const buildings  = gs.buildings.filter(b => !b.destroyed);
  const batteries  = gs.batteries.filter(b => !b.destroyed);

  if (buildings.length === 0 && batteries.length === 0) {
    return { x: gs.canvasWidth / 2, y: gs.canvasHeight * 0.85 };
  }

  if (gs.params.hostile.targetMode === 'random') {
    const all = [...buildings, ...batteries];
    return all[Math.floor(Math.random() * all.length)];
  }

  // Importance-weighted selection — higher tier = higher weight; batteries weight 2
  const candidates = [
    ...buildings.map(b => ({ entity: b, weight: [1, 3, 6][b.tier] })),
    ...batteries.map(b => ({ entity: b, weight: 2 })),
  ];

  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let rand    = Math.random() * total;

  for (const c of candidates) {
    rand -= c.weight;
    if (rand <= 0) return c.entity;
  }

  return candidates[candidates.length - 1].entity;
}

// ── 4. UIController (wired last so canvas is sized) ──────────────────────────

const uiController = new UIController({
  gameState,
  renderer,
  generateMap,
  scoringSystem,
  audioSystem,
  startEngagement: beginEngagement,
  abortEngagement: returnToDeployment,
});

// ── 5. Phase logic ────────────────────────────────────────────────────────────

/** Kick off a fresh DEPLOYMENT phase with a generated map. */
function initDeployment() {
  const gs = gameState;

  const frontline = generateFrontline(
    gs.canvasWidth,
    gs.canvasHeight,
    gs.params.simulation.frontlineRoughness,
    gs.params.simulation.frontlineMeanAltitude,
  );
  gs.setFrontline(frontline);   // emits 'frontlineChanged' → background.resize()

  gs.buildings = generateMap({
    canvasWidth:    gs.canvasWidth,
    canvasHeight:   gs.canvasHeight,
    count:          gs.params.simulation.installationCount,
    tierIIIPercent: gs.params.simulation.tierIIIPercent,
    frontline,
  });
  gs.startDeployment();
  renderer.markEntitiesDirty();
}

/** Transition from DEPLOYMENT → ENGAGEMENT. */
function beginEngagement() {
  const gs     = gameState;
  _launchSchedule = scheduleHostiles();
  _launchElapsed  = 0;
  gs.hostiles      = [];
  gs.interceptors  = [];
  gs.explosions    = [];
  gs.startEngagement();
  renderer.markEntitiesDirty();
}

/** Abort engagement and return to DEPLOYMENT. */
function returnToDeployment() {
  const gs = gameState;
  gs.hostiles      = [];
  gs.interceptors  = [];
  gs.explosions    = [];
  gs.launchSites   = [];
  gs.buildings.forEach(b => { b.destroyed = false; });
  gs.startDeployment();
  renderer.markEntitiesDirty();
}

// Hostile launch schedule state (reset each engagement)
let _launchSchedule = [];
let _launchElapsed  = 0;

// ── 6. Game loop ──────────────────────────────────────────────────────────────

let _lastTime = null;

function loop(timestamp) {
  requestAnimationFrame(loop);

  // ── Delta time ──────────────────────────────────────────────────────────────
  if (_lastTime === null) { _lastTime = timestamp; }
  const rawDt = Math.min((timestamp - _lastTime) / 1000, MAX_DELTA);
  _lastTime   = timestamp;

  const dt = rawDt * gameState.params.simulation.timeScale;

  // ── Per-phase update ────────────────────────────────────────────────────────
  if (gameState.phase === PHASE.ENGAGEMENT) {
    _updateEngagement(dt);
  }

  // ── UI update ───────────────────────────────────────────────────────────────
  uiController.update();

  // ── Render ──────────────────────────────────────────────────────────────────
  renderer.render();
}

/**
 * Run one engagement simulation tick.
 * @param {number} dt  Scaled delta time (seconds)
 */
function _updateEngagement(dt) {
  const gs = gameState;
  gs.engagementTime += dt;

  // ── Launch scheduled hostiles ──────────────────────────────────────────────
  _launchElapsed += dt;
  for (const entry of _launchSchedule) {
    if (!entry.launched && _launchElapsed >= entry.launchAt) {
      gs.hostiles.push(entry.missile);
      entry.launched = true;
    }
  }

  // ── Update hostiles ────────────────────────────────────────────────────────
  for (const hostile of gs.hostiles) {
    hostile.update(dt, gs.params, gs.interceptors);
  }

  // ── Guidance + move interceptors ───────────────────────────────────────────
  for (const intr of gs.interceptors) {
    if (!intr.active) continue;

    const target = gs.hostiles.find(h => h.id === intr.targetId && h.active);

    if (target) {
      guidanceSystem.guide(intr, target, dt);
    }
    intr.move(dt);
  }

  // ── Collision detection ────────────────────────────────────────────────────
  collisionSystem.update();

  // ── Battery fire-control ───────────────────────────────────────────────────
  targetAssignment.update(dt);

  // ── Update explosions ──────────────────────────────────────────────────────
  for (const exp of gs.explosions) exp.update(dt);

  // ── Prune dead entities ────────────────────────────────────────────────────
  gs.interceptors = gs.interceptors.filter(i => i.active || !i._prunable);
  gs.explosions   = gs.explosions.filter(e => e.active);
  for (const i of gs.interceptors) {
    if (!i.active) i._prunable = true;
  }

  // ── Mark entity layer dirty if a building or battery was destroyed ─────────
  if (gs.buildings.some(b => b.destroyed && !b._dirtyFlagged)) {
    gs.buildings.filter(b => b.destroyed).forEach(b => { b._dirtyFlagged = true; });
    renderer.markEntitiesDirty();
  }
  if (gs.batteries.some(b => b.destroyed && !b._dirtyFlagged)) {
    gs.batteries.filter(b => b.destroyed).forEach(b => { b._dirtyFlagged = true; });
    renderer.markEntitiesDirty();
  }

  // ── Check end condition ────────────────────────────────────────────────────
  const allLaunched = _launchSchedule.every(e => e.launched);
  if (allLaunched && collisionSystem.isEngagementOver()) {
    _endEngagement();
  }
}

/** Finalise scoring and transition to AFTER_ACTION. */
function _endEngagement() {
  scoringSystem.finalise();
  gameState.endEngagement();
}

// ── 8. Window resize ──────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  renderer.resize();
  if (gameState.phase === PHASE.DEPLOYMENT) {
    const gs = gameState;
    if (gs.batteries.length === 0) {
      const frontline = generateFrontline(
        gs.canvasWidth,
        gs.canvasHeight,
        gs.params.simulation.frontlineRoughness,
        gs.params.simulation.frontlineMeanAltitude,
      );
      gs.setFrontline(frontline);
      gs.buildings = generateMap({
        canvasWidth:    gs.canvasWidth,
        canvasHeight:   gs.canvasHeight,
        count:          gs.params.simulation.installationCount,
        tierIIIPercent: gs.params.simulation.tierIIIPercent,
        frontline,
      });
    }
    renderer.markEntitiesDirty();
  }
});

// ── 9. Boot ───────────────────────────────────────────────────────────────────

initDeployment();
requestAnimationFrame(loop);
