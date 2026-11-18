// Synthesised sound only — no audio files, no network. Everything is
// WebAudio: an engine hum that follows the car's speed, a two-tone police
// siren that follows the nearest cruiser, a car horn, and short one-shot
// effects (punch, crash, pickup, mission jingle, bust, timer tick). Audio
// starts on the first user gesture; until then every call is a safe no-op.

const ENGINE_BASE = 55;
const ENGINE_TOP = 210;
const MASTER_VOLUME = 0.5;

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineFilter = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let noiseBuffer = null;
  let sirenHigh = false;
  let sirenTimer = 0;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOLUME;
      master.connect(ctx.destination);
      // One shared noise buffer for crashes and punches (decaying white noise).
      const len = Math.floor(ctx.sampleRate * 0.4);
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      // Engine: two detuned oscillators through a low-pass, always running
      // with gain 0 at rest so there is no start-up click when driving.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = ENGINE_BASE;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = ENGINE_BASE * 0.5;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Siren: one square wave, flipped between two notes by update().
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  /** Call from any user gesture (key, click) so the context may run. */
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /** One oscillator note with a quick attack and an exponential tail. */
  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** A burst of the shared noise buffer through a low-pass filter. */
  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : MASTER_VOLUME;
      return muted;
    },
    isMuted() {
      return muted;
    },

    /** Continuous sounds, called every frame with the live game state. */
    update(dt, { driving, speedRatio, throttle, wanted, copDistance }) {
      if (!ctx || muted) return;
      const engineTarget = driving ? 0.05 + 0.11 * (0.35 + 0.65 * speedRatio) : 0;
      engineGain.gain.setTargetAtTime(engineTarget, ctx.currentTime, 0.08);
      const freq = ENGINE_BASE + (ENGINE_TOP - ENGINE_BASE) * speedRatio + (throttle ? 14 : 0);
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.06);
      engineOsc2.frequency.setTargetAtTime(freq * 0.5 + 3, ctx.currentTime, 0.06);
      engineFilter.frequency.setTargetAtTime(320 + 900 * speedRatio, ctx.currentTime, 0.1);
      if (wanted > 0) {
        sirenTimer -= dt;
        if (sirenTimer <= 0) {
          sirenTimer = 0.42;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.setTargetAtTime(sirenHigh ? 920 : 660, ctx.currentTime, 0.02);
        }
        const closeness = Math.max(0, 1 - copDistance / 120);
        sirenGain.gain.setTargetAtTime(0.028 + 0.05 * closeness, ctx.currentTime, 0.15);
      } else {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      }
    },

    punch() {
      noise(0.12, 0.5, 900);
      tone(140, 0.1, 'sine', 0.5, 0, 60);
    },
    crash(intensity = 1) {
      noise(0.3, Math.min(0.9, 0.45 * intensity), 1400);
      tone(90, 0.22, 'sine', 0.5, 0, 40);
    },
    steal() {
      tone(520, 0.09, 'square', 0.16);
      tone(780, 0.12, 'square', 0.16, 0.09);
    },
    coin() {
      tone(880, 0.1, 'sine', 0.28);
      tone(1318, 0.16, 'sine', 0.28, 0.09);
    },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.3, i * 0.11));
    },
    missionFail() {
      tone(320, 0.3, 'sawtooth', 0.2, 0, 180);
      tone(210, 0.4, 'sawtooth', 0.2, 0.18, 120);
    },
    busted() {
      [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'square', 0.2, i * 0.16));
    },
    click() {
      tone(700, 0.05, 'sine', 0.18);
    },
    /** Two-tone car horn: a major third, short and flat, like a city horn. */
    horn() {
      tone(370, 0.22, 'square', 0.14);
      tone(466, 0.22, 'square', 0.12);
    },
    /** The mission timer's last-seconds tick. */
    tick() {
      tone(1250, 0.05, 'sine', 0.14);
    },
  };
}
