// Synthesised sound for Sunset Heat: no audio files, everything is built
// from oscillators and filtered noise in the Web Audio API. The context is
// created lazily on the first user gesture (browsers block audio before
// one), every call is guarded, and M mutes the master gain — so a headless
// run with no audio device never throws.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenPhase = 0;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      // Engine: a low sawtooth plus a detuned square, through a lowpass.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      engineOsc2 = context.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 26;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Siren: one triangle wave whose frequency the update loop swings.
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      context = null;
      return false;
    }
    return true;
  }

  /** A short tone, optionally sliding to another frequency. */
  function tone(freq, seconds, type, volume, slideTo) {
    if (!ensure()) return;
    try {
      if (context.state === 'suspended') void context.resume();
      const osc = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + seconds);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + seconds + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  /** A burst of filtered noise, for impacts and punches. */
  function noise(seconds, volume, cutoff) {
    if (!ensure()) return;
    try {
      if (context.state === 'suspended') void context.resume();
      const length = Math.max(1, Math.floor(context.sampleRate * seconds));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff || 900;
      const gain = context.createGain();
      gain.gain.value = volume;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    get muted() {
      return muted;
    },
    setMuted(value) {
      muted = !!value;
      if (master && context) {
        try {
          master.gain.value = muted ? 0 : 0.5;
        } catch {
          // Ignore.
        }
      }
    },
    /** The engine hum follows the car's speed; silent on foot or parked. */
    engine(speedNorm, running) {
      if (!ensure() || !engineGain) return;
      try {
        if (context.state === 'suspended') void context.resume();
        const target = running ? 0.05 + 0.1 * speedNorm : 0;
        engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
        const freq = 52 + 95 * speedNorm;
        engineOsc.frequency.setTargetAtTime(freq, context.currentTime, 0.08);
        engineOsc2.frequency.setTargetAtTime(freq / 2, context.currentTime, 0.08);
      } catch {
        // Ignore.
      }
    },
    /** The two-tone police siren while any wanted star is showing. */
    siren(wanted) {
      if (!ensure() || !sirenGain) return;
      try {
        if (context.state === 'suspended') void context.resume();
        if (wanted > 0) {
          sirenPhase += 1;
          const high = sirenPhase % 2 === 0;
          sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, context.currentTime, 0.05);
          sirenGain.gain.setTargetAtTime(0.045, context.currentTime, 0.1);
        } else {
          sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.1);
        }
      } catch {
        // Ignore.
      }
    },
    /** The car horn: two tones at once, a low one and a higher one. */
    horn() {
      tone(370, 0.45, 'square', 0.16);
      tone(466, 0.45, 'square', 0.12);
    },
    /** The mission clock ticking in its last ten seconds. */
    tick() {
      tone(1180, 0.07, 'sine', 0.14);
    },
    /** Cash-register chime for a stash or a mission payout. */
    chime() {
      tone(880, 0.12, 'sine', 0.16);
      setTimeout(() => tone(1318, 0.22, 'sine', 0.16), 90);
    },
    /** A punch landing. */
    thud() {
      noise(0.14, 0.5, 500);
      tone(110, 0.14, 'sine', 0.3, 55);
    },
    /** Metal on metal (or on concrete). */
    crash() {
      noise(0.3, 0.55, 1400);
      tone(90, 0.25, 'sawtooth', 0.2, 45);
    },
    click() {
      tone(660, 0.06, 'sine', 0.12);
    },
    /** Called once a frame from the main loop for the continuous sounds. */
    update(state) {
      const inCar = !state.player.onFoot && state.player.car;
      const speedNorm = inCar ? Math.min(1, Math.abs(state.player.car.speed) / 30) : 0;
      this.engine(speedNorm, !!inCar);
      this.siren(state.wanted);
    },
  };
}
