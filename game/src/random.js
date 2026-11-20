// Seeded randomness for Sunset Heat: one small deterministic generator
// (mulberry32) and the small conveniences the game builds on top of it.
//
// The same seed always deals the same stream, so the city layout, the
// traffic colours and the pedestrians are identical on every run with
// that seed — which is what makes the ?shot= scenes reproducible.

const GOLDEN = 0x9e3779b9;
const INCREMENT = 0x6d2b79f5;

/**
 * A deterministic stream of pseudo-random numbers. Two generators built
 * from the same seed hand out the same values in the same order.
 */
export class SeededRandom {
  constructor(seed) {
    // Coerce into a 32-bit integer; fall back to a nonzero-looking
    // constant when the caller passes 0, so the first draws stay spread.
    this.state = (seed | 0) || GOLDEN;
  }

  /** The next float in [0, 1). */
  next() {
    this.state = (this.state + INCREMENT) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** The next float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** The next integer in [min, max). */
  int(min, max) {
    return Math.floor(this.range(min, max));
  }

  /** One element of `list`, picked uniformly. */
  pick(list) {
    return list[this.int(0, list.length)];
  }

  /** True with probability `p`. */
  chance(p) {
    return this.next() < p;
  }

  /** A fresh array of `count` draws in [0, 1). */
  take(count) {
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(this.next());
    return out;
  }
}

/**
 * Make a seeded source. The world and the renderer each get their own
 * instance, so neither one's draws disturb the other's stream.
 */
export function createRandom(seed) {
  return new SeededRandom(seed);
}
