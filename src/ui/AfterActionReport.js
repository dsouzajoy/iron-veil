/**
 * AfterActionReport.js
 *
 * Renders the post-engagement debrief overlay (#after-action-overlay).
 *
 * Displays:
 *   - Per-building result table (survived / destroyed, by tier)
 *   - Interceptor efficiency statistics
 *   - Final Survival Index score
 *   - Classification rating (EXEMPLARY … MISSION CRITICAL FAILURE)
 *   - Action buttons: [RE-ENGAGE] and [NEW ENGAGEMENT]
 */

export class AfterActionReport {
  /**
   * @param {import('@/GameState.js').GameState}       gameState
   * @param {import('@/systems/ScoringSystem.js').ScoringSystem} scoringSystem
   * @param {object}   callbacks
   * @param {Function} callbacks.onReEngage      Re-run with same map layout
   * @param {Function} callbacks.onNewEngagement Generate fresh map and restart
   */
  constructor(gameState, scoringSystem, callbacks) {
    this.gameState     = gameState;
    this.scoringSystem = scoringSystem;
    this.callbacks     = callbacks;

    this._overlay = document.getElementById('after-action-overlay');
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Show the debrief overlay with current engagement data. */
  show() {
    const summary = this.gameState.getSummary();
    const rating  = this.scoringSystem.getRating();

    this._overlay.innerHTML = '';
    this._overlay.appendChild(this._buildReport(summary, rating));
    this._overlay.classList.remove('hidden');
  }

  /** Hide the overlay. */
  hide() {
    this._overlay.classList.add('hidden');
  }

  // ── Report DOM construction ───────────────────────────────────────────────────

  _buildReport(summary, rating) {
    const box = _el('div', 'aar-box');

    // ── Header ────────────────────────────────────────────────────────────────
    box.appendChild(_el('div', 'aar-title', 'AFTER-ACTION REPORT'));
    box.appendChild(_el('div', 'aar-subtitle', `ENGAGEMENT DURATION: ${_formatTime(summary.engagementTime)}`));

    // ── Survival Index ────────────────────────────────────────────────────────
    const scoreSection = _el('div', 'aar-section');
    scoreSection.appendChild(_el('div', 'aar-section-header', 'SURVIVAL INDEX'));
    scoreSection.appendChild(_el('div', 'aar-score', summary.score.toLocaleString()));
    const ratingEl = _el('div', `aar-rating ${rating.cssClass}`, rating.label);
    scoreSection.appendChild(ratingEl);
    box.appendChild(scoreSection);

    // ── Installation status ───────────────────────────────────────────────────
    const instSection = _el('div', 'aar-section');
    instSection.appendChild(_el('div', 'aar-section-header', 'INSTALLATION STATUS'));

    const tierLabels = ['TIER I', 'TIER II', 'TIER III'];
    const table = _el('table', 'aar-table');

    // Header row
    const thead = document.createElement('tr');
    [['INSTALLATION', ''], ['STATUS', ''], ['TIER', '']].forEach(([t]) => {
      const th = document.createElement('td');
      th.textContent = t;
      thead.appendChild(th);
    });
    table.appendChild(thead);

    // All buildings
    const allBuildings = [
      ...summary.buildingsSurvived,
      ...summary.buildingsDestroyed,
    ].sort((a, b) => b.tier - a.tier || a.label.localeCompare(b.label));

    for (const b of allBuildings) {
      const tr     = document.createElement('tr');
      const tdName = _el('td', '', b.label);
      const tdStat = _el('td', b.destroyed ? 'destroyed' : 'survived',
                          b.destroyed ? 'DESTROYED' : 'INTACT');
      const tdTier = _el('td', '', tierLabels[b.tier]);
      tr.appendChild(tdName);
      tr.appendChild(tdStat);
      tr.appendChild(tdTier);
      table.appendChild(tr);
    }
    instSection.appendChild(table);
    box.appendChild(instSection);

    // ── Hostile intercept stats ───────────────────────────────────────────────
    const hostileSection = _el('div', 'aar-section');
    hostileSection.appendChild(_el('div', 'aar-section-header', 'INTERCEPT STATISTICS'));

    const hostileTable = _el('table', 'aar-table');
    const rows = [
      ['HOSTILES LAUNCHED',      summary.hostilesTotal],
      ['NEUTRALIZED',            summary.hostilesKilled],
      ['IMPACTED (MISSED)',       summary.hostilesTotal - summary.hostilesKilled],
      ['INTERCEPTORS FIRED',     summary.interceptorsFired],
      ['INTERCEPTORS WASTED',    summary.interceptorsWasted],
      ['INTERCEPT EFFICIENCY',   summary.interceptorsFired > 0
          ? `${Math.round((summary.hostilesKilled / summary.interceptorsFired) * 100)}%`
          : 'N/A'],
    ];

    for (const [label, value] of rows) {
      const tr = document.createElement('tr');
      tr.appendChild(_el('td', '', label));
      tr.appendChild(_el('td', '', String(value)));
      hostileTable.appendChild(tr);
    }
    hostileSection.appendChild(hostileTable);
    box.appendChild(hostileSection);

    // ── Action buttons ────────────────────────────────────────────────────────
    const actions = _el('div', 'aar-actions');

    const btnRe  = _el('button', 'action-btn primary', '[RE-ENGAGE]');
    const btnNew = _el('button', 'action-btn', '[NEW ENGAGEMENT]');

    btnRe.addEventListener('click',  () => { this.hide(); this.callbacks.onReEngage(); });
    btnNew.addEventListener('click', () => { this.hide(); this.callbacks.onNewEngagement(); });

    actions.appendChild(btnRe);
    actions.appendChild(btnNew);
    box.appendChild(actions);

    return box;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _el(tag, className, text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== '') el.textContent = text;
  return el;
}

function _formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
