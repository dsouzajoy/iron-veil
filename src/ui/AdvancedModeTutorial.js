/**
 * AdvancedModeTutorial.js
 *
 * Multi-step walkthrough overlay shown the first time a player enables
 * Advanced Mode. Covers the radar detection and tracking systems that become
 * active in this mode.
 *
 * Uses a separate localStorage key from the main Tutorial so the two are
 * fully independent — no shared state, no shared DOM element.
 *
 * Each step is a plain object: { title, body (HTML string) }.
 * Navigation: PREV / NEXT buttons + step indicator dots.
 */

const STORAGE_KEY = 'iron-veil-advanced-tutorial-seen';

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    title: 'ADVANCED MODE: ACTIVATED',
    body: `
      <p>Sensor systems are now online, Commander. The battlefield has changed.</p>

      <p>In standard mode, all hostile missiles are immediately visible and your
      batteries open fire without delay. Advanced Mode removes that abstraction —
      hostiles are <b>invisible until detected by radar</b>, and batteries cannot
      engage a target until a minimum track quality has been established.</p>

      <table class="tut-table">
        <tr><td>1.</td><td><b>DETECTION</b></td><td>A battery's radar sweep must cross a hostile to acquire it.</td></tr>
        <tr><td>2.</td><td><b>TRACKING</b></td><td>Track quality rises from 0.0 → 1.0 over 2–4 seconds.</td></tr>
        <tr><td>3.</td><td><b>ENGAGEMENT</b></td><td>The battery may only fire once quality meets the threshold.</td></tr>
      </table>

      <p class="tut-hint">The SENSOR &amp; C2 section is now visible in the parameter panel.
      Use it to tune detection range and engagement threshold.</p>
    `,
  },

  {
    title: 'RADAR DETECTION',
    body: `
      <p>Each battery rotates a <b>radar sweep arc</b> — a green wedge that completes
      one full revolution every three seconds.</p>

      <ul class="tut-list">
        <li>When the arc crosses a hostile missile within <b>DETECTION RANGE</b>,
            contact is established and the battery flashes briefly to signal acquisition.</li>
        <li>A hostile that is not yet detected remains <b>invisible on the map</b>
            and cannot be targeted.</li>
        <li>Spreading batteries across the map creates overlapping radar coverage,
            reducing blind spots and ensuring earlier detection.</li>
      </ul>

      <p><b>Stealth hostiles</b> reduce your effective detection range. A missile with
      a stealth level of 0.5 halves the range at which it can be acquired — it must
      come twice as close before your radar picks it up.</p>

      <p class="tut-hint">Battery placement affects both intercept geometry and radar coverage —
      consider both when deploying.</p>
    `,
  },

  {
    title: 'TRACK MATURATION',
    body: `
      <p>Acquiring a contact is only the first step. After detection, the track
      must <b>mature</b> before the battery can engage.</p>

      <ul class="tut-list">
        <li>A new contact starts at <b>quality 0.0</b>. Quality rises linearly to
            <b>1.0</b> over a randomized maturation window of 2–4 seconds per contact.</li>
        <li>While maturing, a <b>dashed uncertainty circle</b> is drawn around the
            hostile. It shrinks as quality improves — when the circle disappears,
            the track is fully resolved.</li>
        <li>A small arc on the uncertainty circle fills clockwise to visualise
            track quality progress in real time.</li>
        <li>The battery <b>cannot fire</b> until track quality reaches the
            <b>MIN TRACK QUAL</b> threshold (default 0.4).</li>
      </ul>

      <p class="tut-hint">Fast or stealthy hostiles may reach their targets before their
      track matures. Lower MIN TRACK QUAL to engage earlier — but at the cost of
      firing on a less-resolved solution.</p>
    `,
  },

  {
    title: 'SENSOR & C2 CONTROLS',
    body: `
      <p>Two new parameters appear in the <b>SENSOR &amp; C2</b> section of the
      parameter panel while Advanced Mode is active:</p>

      <table class="tut-table">
        <tr>
          <td>DETECTION RANGE <span class="tut-unit">px</span></td>
          <td>The radar horizon for each battery. Hostiles must enter this radius
              before the sweep arc can acquire them. Larger values provide earlier
              warning but do not speed up maturation or intercept velocity.</td>
        </tr>
        <tr>
          <td>MIN TRACK QUAL <span class="tut-unit">0.0–1.0</span></td>
          <td>The minimum track quality a contact must reach before a battery is
              permitted to fire. 0.0 allows immediate engagement on first detection;
              1.0 requires a fully resolved track before any shot is taken.</td>
        </tr>
      </table>

      <p class="tut-hint">Good starting values: DETECTION RANGE 280 px, MIN TRACK QUAL 0.4.
      Experiment with lower thresholds against fast hostiles and higher thresholds
      to conserve ammo against stealth threats.</p>
    `,
  },
];

// ── AdvancedModeTutorial class ────────────────────────────────────────────────

export class AdvancedModeTutorial {
  constructor() {
    this._currentStep = 0;
    this._overlay     = null;
    this._titleEl     = null;
    this._bodyEl      = null;
    this._dotsEl      = null;
    this._prevBtn     = null;
    this._nextBtn     = null;
    this._stepLabel   = null;
    this._dismissBtn  = null;

    this._buildDOM();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Show the advanced tutorial if the player has not seen it before.
   * Called automatically the first time Advanced Mode is enabled.
   */
  showIfNeeded() {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      this._currentStep = 0;
      this._render();
      this._overlay.classList.remove('hidden');
    }
  }

  // ── DOM construction ──────────────────────────────────────────────────────────

  _buildDOM() {
    const overlay = document.createElement('div');
    overlay.id        = 'advanced-tutorial-overlay';
    overlay.className = 'hidden';
    document.body.appendChild(overlay);
    this._overlay = overlay;

    const box = document.createElement('div');
    box.className = 'tut-box';
    overlay.appendChild(box);

    // Classification header
    const classification = document.createElement('div');
    classification.className = 'tut-classification';
    classification.textContent = '// ADVANCED SENSOR SYSTEMS BRIEFING — RESTRICTED //';
    box.appendChild(classification);

    // Step label (e.g. "STEP 1 OF 4")
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

    // Dismiss button (only shown on last step)
    const dismissBtn = document.createElement('button');
    dismissBtn.className   = 'action-btn primary tut-dismiss';
    dismissBtn.textContent = '[SENSORS ONLINE — ACKNOWLEDGED]';
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
