// A small seeded random source (mulberry32) plus the helpers the world
// builds on: the same seed always lays out the same city, the same
// traffic colours and the same pedestrians, which is what makes the
// screenshot scenes repeatable from one run to the next.

export function createRandom(seed) {
  let a = seed | 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** A float in [0, 1). */
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** An integer in [min, max). */
    int(min, max) {
      return Math.floor(min + next() * (max - min));
    },
    /** One element of `list`, uniformly. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** True with probability `p`. */
    chance(p) {
      return next() < p;
    },
  };
}
