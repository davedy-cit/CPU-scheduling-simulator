import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SAMPLE_WORKLOAD } from '../../data/sampleWorkload.js';
import {
  cloneWorkload,
  formatBurstSequence,
  generateWorkload,
  parseBurstSequence,
  totalCpuDemand,
  totalIoDemand,
  validateWorkload,
} from '../workload.js';
import { ALLOWED_BURST_COUNTS, BURST_MAX, BURST_MIN } from '../constants.js';

/* ───────────────────── The spec §4 sample workload ───────────────────── */

test('sample workload matches the assignment table exactly', () => {
  const shape = SAMPLE_WORKLOAD.map((p) => ({
    id: p.id,
    arrival: p.arrival,
    priority: p.priority,
    sequence: formatBurstSequence(p.bursts),
  }));

  assert.deepEqual(shape, [
    { id: 'P1', arrival: 0, priority: 3, sequence: 'CPU 180 · A 100 · CPU 120 · B 80 · CPU 70' },
    { id: 'P2', arrival: 30, priority: 1, sequence: 'CPU 70 · B 150 · CPU 90' },
    { id: 'P3', arrival: 50, priority: 4, sequence: 'CPU 120 · A 70 · CPU 160' },
    { id: 'P4', arrival: 80, priority: 2, sequence: 'CPU 60 · B 100 · CPU 80 · A 60 · CPU 100' },
    { id: 'P5', arrival: 110, priority: 5, sequence: 'CPU 150' },
  ]);
});

test('sample workload satisfies every spec §4 rule', () => {
  const { ok, errors } = validateWorkload(SAMPLE_WORKLOAD, { enforceDurationBounds: true });
  assert.deepEqual(errors, []);
  assert.equal(ok, true);
});

test('sample workload uses 1, 3 and 5 burst processes that start and end with CPU', () => {
  for (const p of SAMPLE_WORKLOAD) {
    assert.ok(
      ALLOWED_BURST_COUNTS.includes(p.bursts.length),
      `${p.id} has ${p.bursts.length} bursts`,
    );
    assert.equal(p.bursts[0].kind, 'CPU', `${p.id} must begin with CPU`);
    assert.equal(p.bursts.at(-1).kind, 'CPU', `${p.id} must end with CPU`);
    for (const b of p.bursts) {
      assert.ok(
        b.duration >= BURST_MIN && b.duration <= BURST_MAX,
        `${p.id} burst ${b.duration} is outside ${BURST_MIN}–${BURST_MAX}`,
      );
    }
  }
});

test('sample workload demand figures are consistent', () => {
  // CPU: 370 + 160 + 280 + 240 + 150
  assert.equal(totalCpuDemand(SAMPLE_WORKLOAD), 1200);
  // A: 100 + 70 + 60 = 230   B: 80 + 150 + 100 = 330
  assert.deepEqual(totalIoDemand(SAMPLE_WORKLOAD), { A: 230, B: 330 });
});

/* ──────────────────────────── Validation rules ──────────────────────────── */

/** Build a minimal valid single-burst process, then override fields. */
const proc = (over = {}) => ({
  id: 'P1',
  arrival: 0,
  priority: 1,
  bursts: [{ kind: 'CPU', duration: 10 }],
  ...over,
});

test('validation rejects structural violations', () => {
  const cases = [
    ['duplicate ID', [proc(), proc()], /duplicate process ID/],
    ['empty workload', [], /at least one process/],
    ['must begin with CPU', [proc({ bursts: [{ kind: 'A', duration: 5 }, { kind: 'CPU', duration: 5 }] })], /must begin with a CPU burst/],
    ['must end with CPU', [proc({ bursts: [{ kind: 'CPU', duration: 5 }, { kind: 'B', duration: 5 }] })], /must end with a CPU burst/],
    ['even burst count', [proc({ bursts: [
      { kind: 'CPU', duration: 5 }, { kind: 'A', duration: 5 },
      { kind: 'CPU', duration: 5 }, { kind: 'B', duration: 5 },
    ] })], /must have 1, 3, 5 alternating bursts/],
    ['adjacent same kind', [proc({ bursts: [
      { kind: 'CPU', duration: 5 }, { kind: 'CPU', duration: 5 }, { kind: 'CPU', duration: 5 },
    ] })], /must alternate/],
    ['priority out of range', [proc({ priority: 9 })], /priority must be a whole number 1–5/],
    ['negative arrival', [proc({ arrival: -1 })], /arrival must be a non-negative/],
    ['non-integer duration', [proc({ bursts: [{ kind: 'CPU', duration: 2.5 }] })], /duration must be a positive whole number/],
    ['unknown burst kind', [proc({ bursts: [{ kind: 'GPU', duration: 5 }] })], /unknown burst kind/],
  ];

  for (const [name, input, pattern] of cases) {
    const { ok, errors } = validateWorkload(input);
    assert.equal(ok, false, `${name} should be invalid`);
    assert.ok(
      errors.some((e) => pattern.test(e)),
      `${name}: expected an error matching ${pattern}, got ${JSON.stringify(errors)}`,
    );
  }
});

test('duration bounds are opt-in so textbook presets stay valid', () => {
  const textbook = [proc({ bursts: [{ kind: 'CPU', duration: 6 }] })];
  assert.equal(validateWorkload(textbook).ok, true);
  assert.equal(validateWorkload(textbook, { enforceDurationBounds: true }).ok, false);
});

/* ───────────────────────────── Text coding ─────────────────────────────── */

test('burst sequence round-trips through text', () => {
  for (const p of SAMPLE_WORKLOAD) {
    const text = formatBurstSequence(p.bursts);
    const { bursts, errors } = parseBurstSequence(text);
    assert.deepEqual(errors, [], `${p.id} should parse cleanly`);
    assert.deepEqual(bursts, p.bursts, `${p.id} should round-trip`);
  }
});

test('burst sequence parser is forgiving about separators and spelling', () => {
  const expected = [
    { kind: 'CPU', duration: 180 },
    { kind: 'A', duration: 100 },
    { kind: 'CPU', duration: 120 },
  ];
  for (const text of [
    'CPU 180 A 100 CPU 120',
    'CPU 180, A 100, CPU 120',
    'cpu 180 | a 100 | cpu 120',
    'CPU 180; I/O A 100; CPU 120',
    'CPU 180\nIO-B 0\nCPU 120'.replace('IO-B 0\n', 'A 100 '),
  ]) {
    assert.deepEqual(parseBurstSequence(text).bursts, expected, `failed on: ${text}`);
  }
});

test('burst sequence parser reports unreadable input', () => {
  const { bursts, errors } = parseBurstSequence('CPU 10 wobble A 5 CPU 5');
  assert.deepEqual(bursts, [
    { kind: 'CPU', duration: 10 },
    { kind: 'A', duration: 5 },
    { kind: 'CPU', duration: 5 },
  ]);
  assert.ok(errors.some((e) => /Could not read "wobble"/.test(e)), JSON.stringify(errors));
});

/* ─────────────────────────── Random generation ─────────────────────────── */

test('generation is reproducible from a seed', () => {
  const a = generateWorkload('midterm-demo', 6);
  const b = generateWorkload('midterm-demo', 6);
  assert.deepEqual(a, b);

  const c = generateWorkload('a-different-seed', 6);
  assert.notDeepEqual(a, c);
});

test('numeric and textual seeds both work', () => {
  assert.deepEqual(generateWorkload(42, 4), generateWorkload(42, 4));
  assert.equal(generateWorkload(42, 4).length, 4);
});

test('generated workloads are always valid and spec-compliant', () => {
  for (const seed of [1, 2, 3, 'alpha', 'beta', 'gamma', 123456]) {
    const workload = generateWorkload(seed, 8);
    const { ok, errors } = validateWorkload(workload, { enforceDurationBounds: true });
    assert.deepEqual(errors, [], `seed ${seed} produced an invalid workload`);
    assert.equal(ok, true);

    // Arrivals must be non-decreasing so the schedule is well defined.
    const arrivals = workload.map((p) => p.arrival);
    assert.deepEqual(arrivals, [...arrivals].sort((x, y) => x - y), `seed ${seed}: arrivals not ordered`);
  }
});

/* ────────────────────────────── Utilities ──────────────────────────────── */

test('cloneWorkload is a deep copy', () => {
  const original = cloneWorkload(SAMPLE_WORKLOAD);
  const copy = cloneWorkload(original);
  copy[0].bursts[0].duration = 999;
  copy[0].arrival = 999;
  assert.notEqual(original[0].bursts[0].duration, 999);
  assert.notEqual(original[0].arrival, 999);
});
