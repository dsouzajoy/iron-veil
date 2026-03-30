# IRON VEIL — Missile Defense Simulation

A Cold War-era tactical missile defense simulation built with vanilla JavaScript and HTML5 Canvas. Deploy interceptor batteries, tune guidance algorithms, and defend your installations against incoming ballistic threats.

![Game Phase: Deployment → Engagement → After-Action Report]

---

## Gameplay

The game runs in three phases each engagement:

1. **DEPLOYMENT** — Place interceptor batteries on the map by clicking in the defended zone. A radar sweep animates while you plan your defense.
2. **ENGAGEMENT** — Hostile missiles launch on staggered timers. Batteries autonomously detect, track, and fire interceptors at incoming threats.
3. **AFTER-ACTION REPORT** — Full debrief with installation status, intercept statistics, Survival Index score, and a classification rating.

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

```bash
npm run build    # Production build → dist/
npm run preview  # Preview the production build locally
```

---

## Controls

| Action | Input |
|---|---|
| Place battery | Click in the defended zone (below the dashed line) |
| Preview range | Hover over the defended zone |
| Generate new map | `[GENERATE MAP]` button |
| Start engagement | `[ENGAGE]` button |
| Abort engagement | `[ABORT ENGAGEMENT]` button |
| Reset all parameters | `[RESET PARAMETERS]` button |

---

## Parameter Reference

All parameters are tunable in real time from the right-side terminal panel.

### Battery Systems

| Parameter | Default | Range | Description |
|---|---|---|---|
| Ammo | 10 rds | 5 – 30 | Interceptors available per battery |
| Fire Rate | 1.5 /s | 0.5 – 5 | Shots per second |
| Engagement Range | 200 px | 100 – 400 | Detection/fire radius |
| Interceptor Speed | 180 px/s | 80 – 400 | Launch velocity |
| Turn Rate | 2.5 r/s | 0.5 – 10 | Max angular velocity (rad/s) |
| Kill Radius | 20 px | 5 – 60 | Blast radius on detonation |
| Guidance Algorithm | Predictive | — | Predictive Pursuit or Proportional Navigation |

### Hostile Parameters

| Parameter | Default | Range | Description |
|---|---|---|---|
| Launch Count | 12 | 5 – 30 | Missiles per engagement |
| Speed | 120 px/s | 60 – 300 | Cruise velocity |
| Evasion Mode | Ballistic | — | None / Jink / Evade |
| Jink Amplitude | 0 px | 0 – 80 | Lateral oscillation magnitude |
| Jink Frequency | 0 Hz | 0 – 5 | Oscillation rate |
| Flight Path | Ballistic | — | Parabolic arc or straight line |

### Simulation

| Parameter | Default | Range | Description |
|---|---|---|---|
| Gravity | 80 px/s² | 0 – 200 | Downward acceleration on ballistic paths |
| Time Scale | 1× | 0.25× – 3× | Simulation speed multiplier |
| Installations | 10 | 5 – 20 | Buildings per engagement |
| Battery Budget | 3 | 1 – 8 | Batteries the player may place |
| Tier III % | 20% | 0% – 60% | Fraction of high-value HQ installations |

---

## Scoring — Survival Index

| Event | Points |
|---|---|
| Tier I installation survives | +100 |
| Tier II installation survives | +250 |
| Tier III installation survives | +500 |
| Hostile neutralized | +50 |
| Tier I installation destroyed | −80 |
| Tier II installation destroyed | −200 |
| Tier III installation destroyed | −400 |
| Interceptor wasted (missed/expired) | −10 |

### Classification Ratings

| Rating | Survival Index |
|---|---|
| EXEMPLARY | > 3,000 |
| COMMENDABLE | 1,500 – 3,000 |
| ACCEPTABLE | 500 – 1,500 |
| MARGINAL | 0 – 500 |
| MISSION CRITICAL FAILURE | < 0 |

---

## Guidance Algorithms

### Predictive Pursuit (default)
Projects the hostile's future position based on its current velocity and steers toward the predicted intercept point. Effective against straight-line and mildly maneuvering targets.

### Proportional Navigation
Measures the rate of change of the line-of-sight (LOS) angle to the target and applies lateral acceleration proportional to that rate × navigation constant N (4). More accurate against maneuvering targets; used in real-world missile systems.

---

## Evasion Modes

| Mode | Behavior |
|---|---|
| **BALLISTIC** | Pure parabolic/straight arc — no deviation |
| **JINK** | Sinusoidal lateral oscillation along flight path. Tune amplitude and frequency |
| **EVADE** | Actively steers away from interceptors that close within 150 px |

---

## Project Structure

```
iron-veil/
├── index.html
├── package.json
├── vite.config.js
├── styles/
│   └── main.css               # CRT aesthetic, layout, all UI styles
└── src/
    ├── main.js                # Entry point: boot, game loop, phase transitions
    ├── constants.js           # All defaults, colors, score table, ranges
    ├── GameState.js           # State machine + event bus
    ├── entities/
    │   ├── Building.js        # Installation: tier, label, collision radius
    │   ├── Battery.js         # Defense battery: ammo, fire-control state
    │   ├── HostileMissile.js  # Enemy missile: flight path + evasion logic
    │   ├── Interceptor.js     # Interceptor: guidance state, trail, lifetime
    │   └── Explosion.js       # Expanding ring effect
    ├── systems/
    │   ├── MapGenerator.js    # Poisson-disc building placement
    │   ├── GuidanceSystem.js  # Predictive Pursuit + Proportional Navigation
    │   ├── TargetAssignment.js# Per-battery fire-control, deduplication
    │   ├── CollisionSystem.js # Hit detection, building impacts
    │   └── ScoringSystem.js   # Live score accumulation + rating
    ├── rendering/
    │   ├── Renderer.js        # Canvas orchestrator, resize handler
    │   ├── BackgroundRenderer.js  # Layer 0: grid, topo lines, radar sweep
    │   ├── EntityRenderer.js  # Layer 1: building/battery icons
    │   └── DynamicRenderer.js # Layer 2: missiles, trails, explosions
    └── ui/
        ├── UIController.js    # Mouse events, phase transitions, wiring
        ├── ParameterPanel.js  # Right-panel sliders, toggles, action buttons
        ├── StatusPanel.js     # Live HUD during engagement
        └── AfterActionReport.js  # Post-engagement debrief overlay
```

Each file has a single concern. Adding a new guidance algorithm means editing only `GuidanceSystem.js` and adding a toggle in `ParameterPanel.js`.

---

## Tech Stack

- **Vanilla JavaScript** (ES modules) — no game engine, no framework
- **HTML5 Canvas** — three stacked layers for performance
- **Vite** — build tool with HMR for development
- **Share Tech Mono** — monospace terminal font (Google Fonts)

### Canvas Layer Strategy

| Layer | Canvas | Update Strategy |
|---|---|---|
| 0 — Background | `#canvas-bg` | Pre-rendered to offscreen canvas; radar sweep animated live |
| 1 — Entities | `#canvas-entities` | Redrawn only on placement changes or building destruction |
| 2 — Dynamic | `#canvas-dynamic` | Cleared and redrawn every frame during engagement |
| 3 — UI | DOM overlay | HTML elements positioned over the canvas stack |

---

## Contributing

The codebase is organized so each file addresses exactly one concern. Before contributing:

- New entity types belong in `src/entities/`
- New simulation logic belongs in `src/systems/`
- New visual effects belong in the appropriate renderer in `src/rendering/`
- New UI controls belong in `src/ui/ParameterPanel.js` with a corresponding entry in `PARAM_RANGES` in `constants.js`

All configurable values (defaults, slider ranges, colors, score table) live in `src/constants.js` — start there when tuning behavior.

---

## Browser Support

Chrome, Firefox, and Safari (latest). Desktop only — mouse input required.
