/**
 * AudioSystem.js
 *
 * Synthesizes all in-game sound effects using the Web Audio API.
 * No external audio files — every sound is generated procedurally with
 * oscillators, noise buffers, and gain envelopes.
 *
 * Browser autoplay policy: the AudioContext is created immediately but starts
 * suspended. It is resumed on the first user gesture (handled by main.js
 * calling audioSystem.unlock() after any interaction).
 *
 * Public methods correspond 1-to-1 with game events:
 *   playBatteryPlace()     — battery placed on map
 *   playBatteryRemove()    — battery removed from map
 *   playInterceptorLaunch()— interceptor missile fired
 *   playInterceptKill()    — hostile missile destroyed
 *   playBuildingImpact()   — hostile hits an installation
 *   playEngagementStart()  — [ENGAGE] pressed, hostiles incoming
 *   playEngagementEnd()    — all hostiles resolved
 */

export class AudioSystem {
  constructor() {
    // AudioContext starts suspended — browser policy requires a user gesture
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master volume node — all sounds route through here
    this._master = this._ctx.createGain();
    this._master.gain.value = 0.35;
    this._master.connect(this._ctx.destination);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  /**
   * Resume the AudioContext after the first user interaction.
   * Safe to call multiple times — no-op if already running.
   */
  unlock() {
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
  }

  // ── Game event sounds ─────────────────────────────────────────────────────────

  /**
   * Mechanical click + rising blip — battery locked into position.
   */
  playBatteryPlace() {
    this._noise({ duration: 0.03, gain: 0.25, hiPass: 2000 });
    this._sweep({ freqStart: 440, freqEnd: 880, duration: 0.06, gain: 0.15, type: 'square', delay: 0.01 });
  }

  /**
   * Downward click — battery picked up / removed.
   */
  playBatteryRemove() {
    this._sweep({ freqStart: 660, freqEnd: 330, duration: 0.06, gain: 0.12, type: 'square' });
    this._noise({ duration: 0.02, gain: 0.15, hiPass: 1500 });
  }

  /**
   * Rising whoosh + noise — interceptor launched.
   */
  playInterceptorLaunch() {
    this._noise({ duration: 0.08, gain: 0.18, hiPass: 800 });
    this._sweep({ freqStart: 330, freqEnd: 990, duration: 0.10, gain: 0.12, type: 'sawtooth' });
  }

  /**
   * Electronic chirp burst — hostile missile neutralized.
   */
  playInterceptKill() {
    // Rapid staccato of descending tones
    const freqs = [1600, 1200, 1800, 1000];
    freqs.forEach((freq, i) => {
      this._tone({ freq, duration: 0.04, gain: 0.18, type: 'sine', delay: i * 0.045 });
    });
    this._noise({ duration: 0.06, gain: 0.10, hiPass: 2000, delay: 0.02 });
  }

  /**
   * Low rumbling boom — hostile missile hits an installation.
   */
  playBuildingImpact() {
    // Sub-bass thud
    this._sweep({ freqStart: 160, freqEnd: 60, duration: 0.35, gain: 0.45, type: 'sine' });
    // Noise burst on top
    this._noise({ duration: 0.20, gain: 0.30, loPass: 600 });
    // High crackle
    this._noise({ duration: 0.08, gain: 0.15, hiPass: 3000, delay: 0.02 });
  }

  /**
   * Military alert sequence — engagement begun, hostiles inbound.
   * Four rapid beeps at escalating pitch.
   */
  playEngagementStart() {
    const freqs = [440, 550, 440, 660];
    freqs.forEach((freq, i) => {
      this._tone({ freq, duration: 0.08, gain: 0.20, type: 'square', delay: i * 0.12 });
    });
  }

  /**
   * Brief upward arpeggio — engagement resolved.
   */
  playEngagementEnd() {
    const freqs = [440, 554, 659, 880];
    freqs.forEach((freq, i) => {
      this._tone({ freq, duration: 0.10, gain: 0.16, type: 'sine', delay: i * 0.09 });
    });
  }

  // ── Primitive synthesis helpers ───────────────────────────────────────────────

  /**
   * Play a single steady oscillator tone with a quick attack/release envelope.
   *
   * @param {object} opts
   * @param {number}  opts.freq      Frequency in Hz
   * @param {number}  opts.duration  Total note length in seconds
   * @param {number}  opts.gain      Peak amplitude (0–1)
   * @param {string}  opts.type      OscillatorType ('sine'|'square'|'sawtooth'|'triangle')
   * @param {number} [opts.delay]    Seconds before note starts (default 0)
   */
  _tone({ freq, duration, gain, type = 'sine', delay = 0 }) {
    const ctx  = this._ctx;
    const now  = ctx.currentTime + delay;

    const osc  = ctx.createOscillator();
    const env  = ctx.createGain();

    osc.type      = type;
    osc.frequency.setValueAtTime(freq, now);

    // Attack → sustain → release
    const attack  = Math.min(0.008, duration * 0.1);
    const release = Math.min(0.030, duration * 0.3);

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + attack);
    env.gain.setValueAtTime(gain, now + duration - release);
    env.gain.linearRampToValueAtTime(0, now + duration);

    osc.connect(env);
    env.connect(this._master);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Play a frequency-swept oscillator (portamento).
   *
   * @param {object} opts
   * @param {number}  opts.freqStart
   * @param {number}  opts.freqEnd
   * @param {number}  opts.duration
   * @param {number}  opts.gain
   * @param {string}  opts.type
   * @param {number} [opts.delay]
   */
  _sweep({ freqStart, freqEnd, duration, gain, type = 'sine', delay = 0 }) {
    const ctx = this._ctx;
    const now = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);

    const attack  = Math.min(0.008, duration * 0.1);
    const release = Math.min(0.060, duration * 0.4);

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + attack);
    env.gain.setValueAtTime(gain, now + duration - release);
    env.gain.linearRampToValueAtTime(0, now + duration);

    osc.connect(env);
    env.connect(this._master);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Play a burst of white noise, optionally band-limited.
   *
   * @param {object} opts
   * @param {number}  opts.duration
   * @param {number}  opts.gain
   * @param {number} [opts.hiPass]   High-pass cutoff frequency (Hz) — removes lows
   * @param {number} [opts.loPass]   Low-pass cutoff frequency (Hz) — removes highs
   * @param {number} [opts.delay]
   */
  _noise({ duration, gain, hiPass, loPass, delay = 0 }) {
    const ctx         = this._ctx;
    const sampleRate  = ctx.sampleRate;
    const frameCount  = Math.ceil(sampleRate * duration);

    // Fill a buffer with white noise
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data   = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Chain through optional filters
    let lastNode = source;

    if (hiPass) {
      const hp = ctx.createBiquadFilter();
      hp.type            = 'highpass';
      hp.frequency.value = hiPass;
      lastNode.connect(hp);
      lastNode = hp;
    }

    if (loPass) {
      const lp = ctx.createBiquadFilter();
      lp.type            = 'lowpass';
      lp.frequency.value = loPass;
      lastNode.connect(lp);
      lastNode = lp;
    }

    const env = ctx.createGain();
    const now = ctx.currentTime + delay;

    const attack  = Math.min(0.005, duration * 0.05);
    const release = Math.min(0.050, duration * 0.4);

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + attack);
    env.gain.setValueAtTime(gain, now + duration - release);
    env.gain.linearRampToValueAtTime(0, now + duration);

    lastNode.connect(env);
    env.connect(this._master);

    source.start(now);
    source.stop(now + duration);
  }
}
