// Synthesised sound for Sunset Heat: no audio files, everything is built
// from oscillators and filtered noise in the Web Audio API. The context is
// created lazily on the first user gesture (browsers block audio before
// one), every call is guarded, and M mutes the master gain — so a headless
// run with no audio device never throws.

/** One-shot effect presets: [frequency, seconds, wave, volume, slideTo]. */
const BLIPS = {
  tick: [1180, 0.07, 'sine', 0.14, 0],
  click: [660, 0.06, 'sine', 0.12, 0],
  chimeLow: [880, 0.12, 'sine', 0.16, 0],
  chimeHigh: [1318, 0.22, 'sine', 0.16, 0],
  thudTone: [110, 0.14, 'sine', 0.3, 55],
  crashTone: [90, 0.25, 'sawtooth', 0.2, 45],
};

/**
 * The sound bank: a lazy AudioContext, two continuous loops (engine hum
 * and police siren) and a set of one-shot effects. Every public method is
 * safe to call before the context exists or when there is no audio device.
 */
export class SoundBank {
  constructor() {
    this.context = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenPhase = 0;
    this.muted = false;
  }

  /** Create the context and the two loops, once. False when impossible. */
  ensure() {
    if (this.context) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      const ctx = new Ctor();
      this.context = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(ctx.destination);
      this.buildEngineLoop(ctx);
      this.buildSirenLoop(ctx);
    } catch {
      this.context = null;
      return false;
    }
    return true;
  }

  /** Engine: a low sawtooth plus a detuned square, through a lowpass. */
  buildEngineLoop(ctx) {
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 52;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 26;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  /** Siren: one triangle wave whose frequency the update loop swings. */
  buildSirenLoop(ctx) {
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  /** Resume a suspended context after a user gesture. */
  wake() {
    if (this.context && this.context.state === 'suspended') {
      try {
        void this.context.resume();
      } catch {
        // Sound is garnish: never let it break the game.
      }
    }
  }

  /** A short tone, optionally sliding to another frequency. */
  tone(freq, seconds, type, volume, slideTo) {
    if (!this.ensure()) return;
    try {
      this.wake();
      const ctx = this.context;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + seconds);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + seconds + 0.02);
    } catch {
      // Ignore.
    }
  }

  /** A burst of filtered noise, for impacts and punches. */
  noise(seconds, volume, cutoff) {
    if (!this.ensure()) return;
    try {
      this.wake();
      const ctx = this.context;
      const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff || 900;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start();
    } catch {
      // Ignore.
    }
  }

  /** Play one of the BLIPS presets. */
  blip(name) {
    const preset = BLIPS[name];
    if (preset) this.tone(preset[0], preset[1], preset[2], preset[3], preset[4]);
  }

  setMuted(value) {
    this.muted = !!value;
    if (this.master && this.context) {
      try {
        this.master.gain.value = this.muted ? 0 : 0.5;
      } catch {
        // Ignore.
      }
    }
  }

  /** The engine hum follows the car's speed; silent on foot or parked. */
  engine(speedNorm, running) {
    if (!this.ensure() || !this.engineGain) return;
    try {
      this.wake();
      const ctx = this.context;
      const target = running ? 0.05 + 0.1 * speedNorm : 0;
      this.engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      const freq = 52 + 95 * speedNorm;
      this.engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
      this.engineOsc2.frequency.setTargetAtTime(freq / 2, ctx.currentTime, 0.08);
    } catch {
      // Ignore.
    }
  }

  /** The two-tone police siren while any wanted star is showing. */
  siren(wanted) {
    if (!this.ensure() || !this.sirenGain) return;
    try {
      this.wake();
      const ctx = this.context;
      if (wanted > 0) {
        this.sirenPhase += 1;
        const high = this.sirenPhase % 2 === 0;
        this.sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, ctx.currentTime, 0.05);
        this.sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
      } else {
        this.sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      }
    } catch {
      // Ignore.
    }
  }

  /** The car horn: two tones at once, a low one and a higher one. */
  horn() {
    this.tone(370, 0.45, 'square', 0.16);
    this.tone(466, 0.45, 'square', 0.12);
  }

  /** The mission clock ticking in its last ten seconds. */
  tick() {
    this.blip('tick');
  }

  /** Cash-register chime for a stash or a mission payout. */
  chime() {
    this.blip('chimeLow');
    setTimeout(() => this.blip('chimeHigh'), 90);
  }

  /** A punch landing. */
  thud() {
    this.noise(0.14, 0.5, 500);
    this.blip('thudTone');
  }

  /** Metal on metal (or on concrete). */
  crash() {
    this.noise(0.3, 0.55, 1400);
    this.blip('crashTone');
  }

  click() {
    this.blip('click');
  }

  /** Called once a frame from the main loop for the continuous sounds. */
  update(state) {
    const inCar = !state.player.onFoot && state.player.car;
    const speedNorm = inCar ? Math.min(1, Math.abs(state.player.car.speed) / 30) : 0;
    this.engine(speedNorm, !!inCar);
    this.siren(state.wanted);
  }
}

/** Build the sound bank. */
export function createAudio() {
  return new SoundBank();
}
