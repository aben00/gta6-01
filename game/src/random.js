// A small seeded random number generator (mulberry32): the same seed gives
// the same city, the same traffic and the same pedestrians, which is what
// makes the screenshot scenes repeatable. One generator instance is shared
// by the whole game, so the order in which systems draw from it is part of
// the seed's fingerprint — never draw from it inside a render loop.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [min, max] from the seeded generator. */
export function randInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of an array, from the seeded generator. */
export function randPick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/** A value in [min, max) from the seeded generator. */
export function randRange(random, min, max) {
  return min + random() * (max - min);
}

/** True with the given probability (0..1). */
export function randBool(random, probability) {
  return random() < probability;
}

/**
 * A shuffled copy of an array (Fisher–Yates, seeded). The input is left
 * untouched; useful when a system needs a few distinct items in random
 * order, like the boats along the shore.
 */
export function randShuffle(random, array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
