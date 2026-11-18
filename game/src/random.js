// A small seeded random source (mulberry32) plus the helpers the world
// builds on: the same seed always lays out the same city, the same
// traffic colours and the same pedestrians, which is what makes the
// screenshot scenes repeatable from one run to the next.

/**
 * Deterministic PRNG. The stream depends only on the seed: two instances
 * built from the same seed hand out the same numbers in the same order.
 */
export class SeededRandom {
  constructor(seed) {
    // Force the state into a 32-bit integer; 0 would still work, but a
    // nonzero-looking start keeps the first values well spread.
    this.state = (seed | 0) || 0x9e3779b9;
  }

  /** A float in [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** An integer in [min, max). */
  int(min, max) {
    return Math.floor(min + this.next() * (max - min));
  }

  /** One element of `list`, uniformly. */
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  /** True with probability `p`. */
  chance(p) {
    return this.next() < p;
  }

  /** A fresh array of `count` numbers in [0, 1). */
  take(count) {
    const out = new Array(count);
    for (let i = 0; i < count; i += 1) out[i] = this.next();
    return out;
  }
}

/** Build a seeded source; the world and the renderer each get their own. */
export function createRandom(seed) {
  return new SeededRandom(seed);
}
