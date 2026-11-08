/**
 * The seeded generator — spec §4 requires a "seeded random generator", which
 * only means anything if the same seed always yields the same workload.
 *
 * A `Math.random()` implementation would pass a casual eyeball test and fail
 * every assertion here, which is the point.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hashSeed, mulberry32, normalizeSeed, pick, randInt } from '../rng.js';
import { generateWorkload, validateWorkload } from '../workload.js';
import { ALLOWED_BURST_COUNTS, BURST_MAX, BURST_MIN, PRIORITY_MAX, PRIORITY_MIN } from '../constants.js';

describe('Seeded PRNG', () => {
  it('produces the same stream for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const draw = (rng) => Array.from({ length: 20 }, () => rng());
    assert.deepEqual(draw(b), draw(a));
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    assert.notDeepEqual(
      Array.from({ length: 10 }, () => a()),
      Array.from({ length: 10 }, () => b()),
    );
  });

  it('stays within [0, 1)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      assert.ok(v >= 0 && v < 1, `draw ${i} produced ${v}`);
    }
  });

  it('is reasonably uniform across ten buckets', () => {
    // Not a rigorous statistical test — just enough to catch a generator that
    // is stuck, biased to one end, or returning a constant.
    const rng = mulberry32(2024);
    const buckets = new Array(10).fill(0);
    const draws = 20000;
    for (let i = 0; i < draws; i++) buckets[Math.floor(rng() * 10)] += 1;
    for (const [i, count] of buckets.entries()) {
      assert.ok(
        count > draws / 10 - draws / 40 && count < draws / 10 + draws / 40,
        `bucket ${i} got ${count} of ${draws}`,
      );
    }
  });
});

describe('Seed normalisation', () => {
  it('hashes text seeds to a stable integer', () => {
    assert.equal(hashSeed('hello'), hashSeed('hello'));
    assert.notEqual(hashSeed('hello'), hashSeed('world'));
    assert.ok(Number.isInteger(hashSeed('hello')));
  });

  it('accepts numeric and textual seeds interchangeably', () => {
    assert.equal(normalizeSeed(42), 42);
    assert.equal(normalizeSeed('42'), 42);
    assert.equal(normalizeSeed(' 42 '), 42, 'surrounding whitespace is ignored');
    assert.equal(normalizeSeed('abc'), hashSeed('abc'), 'non-numeric text is hashed');
  });

  it('falls back to a default for empty or unusable seeds', () => {
    assert.ok(Number.isInteger(normalizeSeed('')));
    assert.ok(Number.isInteger(normalizeSeed(null)));
    assert.ok(Number.isInteger(normalizeSeed(undefined)));
  });
});

describe('Bounded draws', () => {
  it('respects inclusive integer bounds', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 2000; i++) {
      const v = randInt(rng, 3, 7);
      assert.ok(Number.isInteger(v) && v >= 3 && v <= 7, `drew ${v}`);
    }
  });

  it('can return both endpoints', () => {
    const rng = mulberry32(11);
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(randInt(rng, 0, 2));
    assert.deepEqual([...seen].sort(), [0, 1, 2]);
  });

  it('handles a degenerate single-value range', () => {
    const rng = mulberry32(3);
    assert.equal(randInt(rng, 4, 4), 4);
  });

  it('picks only from the supplied items', () => {
    const rng = mulberry32(8);
    const items = ['x', 'y', 'z'];
    for (let i = 0; i < 200; i++) assert.ok(items.includes(pick(rng, items)));
  });
});

describe('Generated workloads', () => {
  it('are reproducible from the seed', () => {
    assert.deepEqual(generateWorkload(7, 5), generateWorkload(7, 5));
    assert.notDeepEqual(generateWorkload(7, 5), generateWorkload(8, 5));
  });

  it('are always structurally valid', () => {
    for (let seed = 0; seed < 60; seed++) {
      const workload = generateWorkload(seed, 6);
      const { ok, errors } = validateWorkload(workload, { enforceDurationBounds: true });
      assert.ok(ok, `seed ${seed}: ${errors.join('; ')}`);
    }
  });

  it('honour every §4 constraint', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const p of generateWorkload(seed, 8)) {
        assert.ok(ALLOWED_BURST_COUNTS.includes(p.bursts.length), `${p.id} burst count`);
        assert.equal(p.bursts[0].kind, 'CPU', `${p.id} starts with CPU`);
        assert.equal(p.bursts[p.bursts.length - 1].kind, 'CPU', `${p.id} ends with CPU`);
        assert.ok(p.priority >= PRIORITY_MIN && p.priority <= PRIORITY_MAX, `${p.id} priority`);
        for (const b of p.bursts) {
          assert.ok(
            b.duration >= BURST_MIN && b.duration <= BURST_MAX,
            `${p.id} burst ${b.duration} outside ${BURST_MIN}–${BURST_MAX}`,
          );
        }
      }
    }
  });

  it('gives every process a distinct ID and a colour index', () => {
    const workload = generateWorkload(3, 9);
    const ids = workload.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
    for (const p of workload) {
      assert.ok(p.colorIndex >= 1 && p.colorIndex <= 8, `${p.id} colour index`);
    }
  });

  it('produces non-decreasing arrivals', () => {
    const workload = generateWorkload(21, 7);
    for (let i = 1; i < workload.length; i++) {
      assert.ok(
        workload[i].arrival >= workload[i - 1].arrival,
        `${workload[i].id} arrives before ${workload[i - 1].id}`,
      );
    }
    assert.equal(workload[0].arrival, 0, 'the first process arrives at t=0');
  });

  it('honours a requested process count', () => {
    for (const count of [1, 2, 5, 12]) {
      assert.equal(generateWorkload(4, count).length, count);
    }
  });
});
