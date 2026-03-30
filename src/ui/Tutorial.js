/**
 * Tutorial.js
 *
 * Multi-step walkthrough overlay shown the first time a player loads the game.
 * Uses localStorage to remember when the tutorial has been dismissed so it
 * only appears automatically on first visit.
 *
 * Players can reopen it any time via the [? HELP] button in the parameter panel.
 *
 * Each step is a plain object: { title, body (HTML string) }.
 * Navigation: PREV / NEXT buttons + step indicator dots.
 * The overlay matches the Cold War CRT terminal aesthetic.
 */

const STORAGE_KEY = 'iron-veil-tutorial-seen';

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    title: 'WELCOME TO IRON VEIL',
    body: `
      <p>You command a tactical missile defense network. Hostile ballistic
      missiles are inbound. Your mission: protect as many installations
      as possible before the threat wave is exhausted.</p>

      <p>The game runs in three phases:</p>
      <table class="tut-table">
        <tr><td>1.</td><td><b>DEPLOYMENT</b></td><td>Place your interceptor batteries on the map.</td></tr>
        <tr><td>2.</td><td><b>ENGAGEMENT</b></td><td>Watch your batteries automatically intercept inbound hostiles.</td></tr>
        <tr><td>3.</td><td><b>AFTER-ACTION</b></td><td>Review your Survival Index score and classification rating.</td></tr>
      </table>

      <p class="tut-hint">All parameters on the right panel can be tuned before or during engagement
      to experiment with different physics and guidance scenarios.</p>
    `,
  },

  {
    title: 'THE TACTICAL MAP',
    body: `
      <p>The map is divided into two zones separated by the dashed red line:</p>

      <table class="tut-table">
        <tr>
          <td class="tut-red">▲ HOSTILE LAUNCH ZONE</td>
          <td>Top 20% — enemy missiles originate here.</td>
        </tr>
        <tr>
          <td class="tut-green">▼ DEFENDED TERRITORY</td>
          <td>Bottom 80% — your installations are scattered here.</td>
        </tr>
      </table>

      <p>Installations come in three tiers of importance:</p>
      <table class="tut-table">
        <tr><td>■ TIER I</td><td>City outpost</td><td class="tut-green">+100 survive / -80 destroyed</td></tr>
        <tr><td>⊤ TIER II</td><td>Comms station</td><td class="tut-green">+250 survive / -200 destroyed</td></tr>
        <tr><td>★ TIER III</td><td>Command HQ</td><td class="tut-green">+500 survive / -400 destroyed</td></tr>
      </table>

      <p class="tut-hint">Tier III installations are weighted toward the map center.
      Hostile missiles preferentially target higher-value installations.</p>
    `,
  },

  {
    title: 'DEPLOYMENT — PLACING BATTERIES',
    body: `
      <p>During DEPLOYMENT, click anywhere in the defended zone (below the
      dashed line) to place an interceptor <b>BATTERY</b>.</p>

      <ul class="tut-list">
        <li>The <b>dashed circle</b> around each battery is its <b>engagement envelope</b> —
            the radius within which it detects and fires at incoming threats.</li>
        <li>Overlapping envelopes provide redundant coverage for high-value zones.</li>
        <li><b>Click an already-placed battery</b> to remove it and reposition.</li>
        <li>Your <b>BATTERY BUDGET</b> (right panel → Simulation) limits how many you can deploy.</li>
      </ul>

      <p>Once satisfied with your layout, press <b>[ENGAGE]</b> to begin the engagement.
      Batteries lock in place — the [ABORT ENGAGEMENT] button returns you to
      deployment if you want to adjust.</p>

      <p class="tut-hint">Place batteries to maximize coverage of your Tier III (★) installations.</p>
    `,
  },

  {
    title: 'BATTERY PARAMETERS',
    body: `
      <table class="tut-table">
        <tr>
          <td>ENGAGEMENT RANGE <span class="tut-unit">px</span></td>
          <td>Radius within which the battery detects and engages targets.
              Larger values cover more of the map but don't make interceptors faster.</td>
        </tr>
        <tr>
          <td>INTERCEPTOR SPEED <span class="tut-unit">px/s</span></td>
          <td>Pixels per second — how fast your interceptor missiles travel.
              At 180 px/s, a missile crosses ~700 px in about 3.9 seconds.</td>
        </tr>
        <tr>
          <td>TURN RATE <span class="tut-unit">rad/s</span></td>
          <td>Maximum angular velocity in radians per second.
              1 rad/s ≈ 57°/s. At 2.5 rad/s, an interceptor can turn ~143°/s —
              critical for tracking maneuvering or jinking targets.</td>
        </tr>
        <tr>
          <td>KILL RADIUS <span class="tut-unit">px</span></td>
          <td>Blast radius on detonation. Any hostile within this many pixels
              of the interceptor's position is neutralized.</td>
        </tr>
        <tr>
          <td>FIRE RATE <span class="tut-unit">/s</span></td>
          <td>Shots per second per battery. 1.5/s means one shot every 0.67 seconds.
              Higher rates burn through ammo faster.</td>
        </tr>
        <tr>
          <td>AMMO <span class="tut-unit">rds</span></td>
          <td>Total interceptors this battery can fire per engagement.
              Once exhausted, the battery is silent for the rest of the round.</td>
        </tr>
      </table>
    `,
  },

  {
    title: 'GUIDANCE ALGORITHMS',
    body: `
      <p>Each interceptor uses one of two steering algorithms to home in on its target.</p>

      <div class="tut-algo">
        <div class="tut-algo-title">PREDICTIVE PURSUIT (default)</div>
        <p>The interceptor estimates where the hostile <em>will be</em> when it arrives
        and flies toward that predicted intercept point. Simple and efficient against
        straight-line or mildly curving targets.</p>
        <p class="tut-hint">Best for: BALLISTIC flight path, low-speed hostiles.</p>
      </div>

      <div class="tut-algo">
        <div class="tut-algo-title">PROPORTIONAL NAVIGATION (PROP NAV)</div>
        <p>Measures the rate of change of the line-of-sight (LOS) angle to the target
        each frame. Applies lateral acceleration proportional to that rotation rate ×
        navigation constant N (4). The interceptor drives the LOS rate to zero — the
        same principle used in real-world air-to-air missiles.</p>
        <p class="tut-hint">Best for: JINK or EVADE evasion modes, fast or maneuvering hostiles.</p>
      </div>
    `,
  },

  {
    title: 'HOSTILE PARAMETERS',
    body: `
      <table class="tut-table">
        <tr>
          <td>LAUNCH COUNT</td>
          <td>Total hostile missiles fired per engagement, launched on staggered timers.</td>
        </tr>
        <tr>
          <td>SPEED <span class="tut-unit">px/s</span></td>
          <td>Hostile cruise velocity. At 120 px/s a missile crosses ~700 px in ~5.8 seconds.
              At 300 px/s it crosses in ~2.3 seconds — very little time to react.</td>
        </tr>
        <tr>
          <td>EVASION MODE</td>
          <td>
            <b>BALLISTIC</b> — pure parabolic arc, no maneuvering. Easiest to intercept.<br>
            <b>JINK</b> — sinusoidal lateral oscillation during flight. Amplitude = max
            sideways deviation (px). Frequency = oscillations per second (Hz).<br>
            <b>EVADE</b> — actively steers away from any interceptor within 150 px.
            Requires high TURN RATE and PROP NAV guidance to defeat reliably.
          </td>
        </tr>
        <tr>
          <td>FLIGHT PATH</td>
          <td>
            <b>BALLISTIC</b> — parabolic arc shaped by the GRAVITY parameter.<br>
            <b>STRAIGHT</b> — direct line to target, ignores gravity.
          </td>
        </tr>
      </table>

      <p class="tut-hint">JINK AMPLITUDE (px) and JINK FREQUENCY (Hz) only matter
      when evasion mode is set to JINK.</p>
    `,
  },

  {
    title: 'SCORING — SURVIVAL INDEX',
    body: `
      <table class="tut-table">
        <tr><td class="tut-green">Tier I installation survives</td><td class="tut-green">+100</td></tr>
        <tr><td class="tut-green">Tier II installation survives</td><td class="tut-green">+250</td></tr>
        <tr><td class="tut-green">Tier III installation survives</td><td class="tut-green">+500</td></tr>
        <tr><td class="tut-green">Hostile missile neutralized</td><td class="tut-green">+50</td></tr>
        <tr><td class="tut-red">Tier I installation destroyed</td><td class="tut-red">−80</td></tr>
        <tr><td class="tut-red">Tier II installation destroyed</td><td class="tut-red">−200</td></tr>
        <tr><td class="tut-red">Tier III installation destroyed</td><td class="tut-red">−400</td></tr>
        <tr><td class="tut-red">Interceptor wasted (missed / expired)</td><td class="tut-red">−10</td></tr>
      </table>

      <p>Classification ratings:</p>
      <table class="tut-table">
        <tr><td>&gt; 3,000</td><td class="tut-green">EXEMPLARY</td></tr>
        <tr><td>1,500 – 3,000</td><td class="tut-green">COMMENDABLE</td></tr>
        <tr><td>500 – 1,500</td><td class="tut-cyan">ACCEPTABLE</td></tr>
        <tr><td>0 – 500</td><td class="tut-amber">MARGINAL</td></tr>
        <tr><td>&lt; 0</td><td class="tut-red">MISSION CRITICAL FAILURE</td></tr>
      </table>
    `,
  },

  {
    title: 'CLEARED FOR DEPLOYMENT',
    body: `
      <p>You are cleared to proceed, Commander.</p>

      <p><b>Quick tips before you begin:</b></p>
      <ul class="tut-list">
        <li>Position batteries to maximize coverage of Tier III (★) Command HQ installations.</li>
        <li>Overlapping engagement envelopes give your highest-value targets redundant protection.</li>
        <li>Raise TURN RATE when facing JINK or EVADE hostiles.</li>
        <li>Switch to PROP NAV guidance against maneuvering targets.</li>
        <li>Use TIME SCALE (right panel → Simulation) to slow down and observe the guidance algorithms in detail.</li>
        <li>After placing a battery, click it again to reposition it before pressing [ENGAGE].</li>
      </ul>

      <p class="tut-hint">You can reopen this tutorial any time using the [? HELP] button
      at the top of the right panel.</p>
    `,
  },
];

// ── Tutorial class ────────────────────────────────────────────────────────────

export class Tutorial {
  constructor() {
    this._currentStep = 0;
    this._overlay     = null;
    this._titleEl     = null;
    this._bodyEl      = null;
    this._dotsEl      = null;
    this._prevBtn     = null;
    this._nextBtn     = null;
    this._stepLabel   = null;

    this._buildDOM();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Show the tutorial if the player has not seen it before.
   * Always shows if `force` is true (e.g. from the [? HELP] button).
   * @param {boolean} [force]
   */
  showIfNeeded(force = false) {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen || force) {
      this._currentStep = 0;
      this._render();
      this._overlay.classList.remove('hidden');
    }
  }

  /** Programmatically open the tutorial (from Help button). */
  show() {
    this.showIfNeeded(true);
  }

  // ── DOM construction ──────────────────────────────────────────────────────────

  _buildDOM() {
    const overlay = document.createElement('div');
    overlay.id        = 'tutorial-overlay';
    overlay.className = 'hidden';
    document.body.appendChild(overlay);
    this._overlay = overlay;

    const box = document.createElement('div');
    box.className = 'tut-box';
    overlay.appendChild(box);

    // Classification header
    const classification = document.createElement('div');
    classification.className = 'tut-classification';
    classification.textContent = '// TACTICAL ORIENTATION BRIEFING — CLASSIFIED //';
    box.appendChild(classification);

    // Step label (e.g. "STEP 1 OF 8")
    const stepLabel = document.createElement('div');
    stepLabel.className = 'tut-step-label';
    box.appendChild(stepLabel);
    this._stepLabel = stepLabel;

    // Title
    const title = document.createElement('div');
    title.className = 'tut-title';
    box.appendChild(title);
    this._titleEl = title;

    // Body
    const body = document.createElement('div');
    body.className = 'tut-body';
    box.appendChild(body);
    this._bodyEl = body;

    // Navigation row
    const nav = document.createElement('div');
    nav.className = 'tut-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className   = 'action-btn tut-nav-btn';
    prevBtn.textContent = '◀  PREV';
    prevBtn.addEventListener('click', () => this._go(-1));
    nav.appendChild(prevBtn);
    this._prevBtn = prevBtn;

    // Dot indicators
    const dots = document.createElement('div');
    dots.className = 'tut-dots';
    nav.appendChild(dots);
    this._dotsEl = dots;

    const nextBtn = document.createElement('button');
    nextBtn.className   = 'action-btn tut-nav-btn';
    nextBtn.textContent = 'NEXT  ▶';
    nextBtn.addEventListener('click', () => this._go(1));
    nav.appendChild(nextBtn);
    this._nextBtn = nextBtn;

    box.appendChild(nav);

    // Dismiss button (only on last step)
    const dismissBtn = document.createElement('button');
    dismissBtn.className   = 'action-btn primary tut-dismiss';
    dismissBtn.textContent = '[INITIATE DEPLOYMENT]';
    dismissBtn.addEventListener('click', () => this._dismiss());
    box.appendChild(dismissBtn);
    this._dismissBtn = dismissBtn;

    // Allow closing by clicking the backdrop
    overlay.addEventListener('click', e => {
      if (e.target === overlay) this._dismiss();
    });
  }

  // ── Navigation ────────────────────────────────────────────────────────────────

  _go(delta) {
    this._currentStep = Math.max(0, Math.min(STEPS.length - 1, this._currentStep + delta));
    this._render();
  }

  _render() {
    const step  = STEPS[this._currentStep];
    const total = STEPS.length;
    const i     = this._currentStep;

    this._stepLabel.textContent = `STEP ${i + 1} OF ${total}`;
    this._titleEl.textContent   = step.title;
    this._bodyEl.innerHTML      = step.body;

    // Prev / Next button states
    this._prevBtn.disabled = (i === 0);
    this._nextBtn.disabled = (i === total - 1);

    // Dismiss button only shown on last step
    this._dismissBtn.style.display = (i === total - 1) ? 'block' : 'none';

    // Dot indicators
    this._dotsEl.innerHTML = '';
    for (let d = 0; d < total; d++) {
      const dot = document.createElement('span');
      dot.className = d === i ? 'tut-dot active' : 'tut-dot';
      dot.addEventListener('click', () => { this._currentStep = d; this._render(); });
      this._dotsEl.appendChild(dot);
    }
  }

  _dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    this._overlay.classList.add('hidden');
  }
}
