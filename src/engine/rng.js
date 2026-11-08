/**
 * Seeded pseudo-random number generation.
 *
 * Spec §4 requires "random valid workload generation (with a seed)" so that a
 * generated workload is reproducible and can be compared across algorithms and
 * across grading runs. `Math.random()` cannot do that, so the generator uses a
 * small explicit PRNG instead.
 *
 * mulberry32 — 32-bit state, fast, and good enough for workload generation.
 * Not cryptographic, and not intended to be.
 */

/**
 * @param {number} seed Any integer; only the low 32 bits are used.
 * @returns {() => number} A function returning successive values in [0, 1).
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a stable 32-bit seed from an arbitrary string, so a user can type a
 * memorable seed ("midterm-demo") instead of a number.
 *
 * FNV-1a.
 *
 * @param {string} text
 * @returns {number} Unsigned 32-bit integer.
 */
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Accept either a numeric or textual seed and normalise it to a 32-bit integer.
 *
 * A numeric-*looking* string is treated as that number rather than hashed, so
 * `42`, `'42'` and `' 42 '` all name the same workload. That matters because the
 * seed arrives from a text field: hashing the string form would make a stray
 * space silently produce a different workload, and would make a seed typed by
 * hand disagree with the same seed round-tripped through exported JSON.
 *
 * Anything that is not a number is hashed, so a memorable word like
 * `"midterm-demo"` still works as a seed.
 *
 * @param {number|string} seed
 * @returns {number} Unsigned 32-bit integer.
 */
export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.trunc(seed) >>> 0;
  const text = String(seed ?? '').trim();
  if (/^[+-]?\d+$/.test(text)) return Number(text) >>> 0;
  return hashSeed(text === '' ? '0' : text);
}

/**
 * Uniform integer in [min, max], inclusive at both ends.
 *
 * @param {() => number} rng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Pick one element of `items` uniformly.
 *
 * @template T
 * @param {() => number} rng
 * @param {readonly T[]} items
 * @returns {T}
 */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}
