/**
 * StatusPanel.js
 *
 * Live HUD readout displayed inside the parameter panel during ENGAGEMENT.
 * Renders real-time statistics into the #status-panel element:
 *
 *   HOSTILES INBOUND    12 / NEUTRALIZED  4 / IMPACTED  1
 *   INTERCEPTORS FIRED   6 / REMAINING   14
 *   SURVIVAL INDEX    1,240
 *   ENGAGEMENT TIME   00:42
 */

import { PHASE } from '@/constants.js';

export class StatusPanel {
  /**
   * @param {import('@/GameState.js').GameState} gameState
   */
  constructor(gameState) {
    this.gameState = gameState;

    // The #status-panel div is created as a placeholder by ParameterPanel
    this._el = document.getElementById('status-panel');

    // Show/hide based on phase
    gameState.on('phaseChange', phase => {
      if (this._el) {
        this._el.style.display = phase === PHASE.ENGAGEMENT ? 'block' : 'none';
      }
    });

    if (this._el) this._el.style.display = 'none';
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Refresh the displayed values.
   * Called each frame during ENGAGEMENT from UIController.
   */
  update() {
    if (!this._el) return;

    const gs    = this.gameState;
    const stats = gs.stats;

    const total      = gs.params.hostile.launchCount;
    const killed     = stats.hostilesKilled;
    const impacted   = gs.buildings.filter(b => b.destroyed).length;
    const remaining  = gs.hostiles.filter(h => h.active).length;
    const neutralized = killed;

    // Compute ammo remaining across all batteries
    const ammoRemaining = gs.batteries.reduce((sum, b) => sum + b.ammo, 0);

    const timeStr = _formatTime(gs.engagementTime);

    this._el.innerHTML = `
      <div class="status-line">
        <span class="status-key">SYSTEM</span>
        <span class="status-val cyan">[THREAT-INBOUND]</span>
      </div>
      <div class="status-line">
        <span class="status-key">HOSTILES</span>
        <span class="status-val">${total}</span>
      </div>
      <div class="status-line">
        <span class="status-key">&#x25B6; INBOUND</span>
        <span class="status-val">${remaining}</span>
      </div>
      <div class="status-line">
        <span class="status-key">&#x25B6; NEUTRALIZED</span>
        <span class="status-val">${neutralized}</span>
      </div>
      <div class="status-line ${impacted > 0 ? 'threat' : ''}">
        <span class="status-key">&#x25B6; IMPACTED</span>
        <span class="status-val">${impacted}</span>
      </div>
      <div class="status-line">
        <span class="status-key">INTR FIRED</span>
        <span class="status-val">${stats.interceptorsFired}</span>
      </div>
      <div class="status-line ${ammoRemaining === 0 ? 'alert' : ''}">
        <span class="status-key">AMMO REMAIN</span>
        <span class="status-val">${ammoRemaining}</span>
      </div>
      <div class="status-line">
        <span class="status-key">SURVIVAL IDX</span>
        <span class="status-val">${stats.score.toLocaleString()}</span>
      </div>
      <div class="status-line">
        <span class="status-key">ENG. TIME</span>
        <span class="status-val">${timeStr}</span>
      </div>
    `;
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Format seconds as MM:SS.
 * @param {number} seconds
 * @returns {string}
 */
function _formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
