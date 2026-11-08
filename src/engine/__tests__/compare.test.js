/**
 * Compare All tests.
 *
 * The property that matters most here is **isolation**: six runs over one
 * workload must not be able to influence each other. A shared mutable spec or a
 * scheduler that leaked state between runs would still produce six plausible
 * result sets, so the check is that every run reproduces exactly what
 * `simulate` returns for that algorithm on its own — which is what the rest of
 * the suite already pins.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { ALGORITHM_IDS, DEFAULT_CONFIG } from '../constants.js';
import { COMPARE_METRICS, compareAll, extremeOf, valuesOf, winCounts } from '../compare.js';
import { simulate } from '../simulate.js';
import { SAMPLE_WORKLOAD } from '../../data/sampleWorkload.js';
import { FCFS_SJF_EXPECTED, FCFS_SJF_SET, PRIORITY_EXPECTED, PRIORITY_SET } from '../../data/presets.js';
import { close } from './helpers.js';

/* ──────────────────────────────── Coverage ───────────────────────────────── */

test('all six algorithms are compared, in the order the brief lists them', () => {
  const result = compareAll(SAMPLE_WORKLOAD, DEFAULT_CONFIG);
  assert.deepEqual(
    result.runs.map((run) => run.algorithm),
    ALGORITHM_IDS,
  );
});

test('every run reports the whole workload', () => {
  const result = compareAll(SAMPLE_WORKLOAD, DEFAULT_CONFIG);
  for (const run of result.runs) {
    assert.equal(run.summary.total, SAMPLE_WORKLOAD.length, run.algorithm);
    assert.equal(run.summary.completed, SAMPLE_WORKLOAD.length, run.algorithm);
  }
});

test('every metric in the comparison is a real summary field', () => {
  const result = compareAll(SAMPLE_WORKLOAD, DEFAULT_CONFIG);
  for (const metric of COMPARE_METRICS) {
    for (const run of result.runs) {
      assert.ok(
        typeof run.summary[metric.key] === 'number' &&
          Number.isFinite(run.summary[metric.key]),
        `${metric.key} missing from the ${run.algorithm} summary`,
      );
    }
  }
});

test('every metric declares which direction is an improvement', () => {
  for (const metric of COMPARE_METRICS) {
    assert.ok(['lower', 'higher'].includes(metric.better), metric.key);
    assert.ok(['time', 'percent', 'rate', 'count'].includes(metric.unit), metric.key);
    assert.ok(metric.help.length > 0, metric.key);
  }
});

/* ──────────────────────────────── Isolation ──────────────────────────────── */

test('each run reproduces a standalone simulation exactly', () => {
  const result = compareAll(SAMPLE_WORKLOAD, DEFAULT_CONFIG);

  for (const run of result.runs) {
    const solo = simulate(SAMPLE_WORKLOAD, { ...DEFAULT_CONFIG, algorithm: run.algorithm });
    assert.deepEqual(run.summary, solo.summary, `${run.algorithm} differs from a solo run`);
  }
});

test('the comparison is reproducible and leaves its input untouched', () => {
  const before = JSON.stringify(SAMPLE_WORKLOAD);
  const first = compareAll(SAMPLE_WORKLOAD, DEFAULT_CONFIG);
  const second = compareAll(SAMPLE_WORKLOAD, DEFAULT_CONFIG);

  assert.equal(JSON.stringify(SAMPLE_WORKLOAD), before, 'the workload was mutated');
  assert.deepEqual(
    first.runs.map((run) => run.summary),
    second.runs.map((run) => run.summary),
  );
});

test('the incoming algorithm field does not bias any run', () => {
  const fromFcfs = compareAll(SAMPLE_WORKLOAD, { ...DEFAULT_CONFIG, algorithm: 'FCFS' });
  const fromRr = compareAll(SAMPLE_WORKLOAD, { ...DEFAULT_CONFIG, algorithm: 'RR', quantum: 20 });

  // The quantum differs on purpose, so compare only the runs that ignore it.
  const pick = (result) => result.runs.filter((run) => !run.needsQuantum).map((run) => run.summary);
  assert.deepEqual(pick(fromFcfs), pick(fromRr));
});

test('the comparison reports the switch overhead every run used', () => {
  const withOverhead = compareAll(SAMPLE_WORKLOAD, { ...DEFAULT_CONFIG, switchOverhead: 5 });
  assert.equal(withOverhead.switchOverhead, 5);
  for (const run of withOverhead.runs) {
    assert.equal(run.summary.switchTime, run.summary.contextSwitches * 5, run.algorithm);
  }
});

/* ────────────────────────────── Known answers ────────────────────────────── */

test('the comparison reproduces the textbook FCFS and SJF figures', () => {
  const result = compareAll(FCFS_SJF_SET, DEFAULT_CONFIG);
  const byAlgorithm = Object.fromEntries(result.runs.map((run) => [run.algorithm, run.summary]));

  close(byAlgorithm.FCFS.avgReadyWait, FCFS_SJF_EXPECTED.FCFS.avgWaiting, 'FCFS average waiting');
  close(byAlgorithm.FCFS.avgTurnaround, FCFS_SJF_EXPECTED.FCFS.avgTurnaround, 'FCFS average turnaround');
  close(byAlgorithm.SJF_NP.avgReadyWait, FCFS_SJF_EXPECTED.SJF_NP.avgWaiting, 'SJF average waiting');
  close(byAlgorithm.SJF_NP.avgTurnaround, FCFS_SJF_EXPECTED.SJF_NP.avgTurnaround, 'SJF average turnaround');

  assert.equal(byAlgorithm.FCFS.makespan, FCFS_SJF_EXPECTED.FCFS.makespan);
});

test('two pairs of algorithms tie exactly on the all-arrive-at-once priority set', () => {
  const result = compareAll(PRIORITY_SET, DEFAULT_CONFIG);
  const byAlgorithm = Object.fromEntries(result.runs.map((run) => [run.algorithm, run.summary]));

  close(byAlgorithm.PRIO_NP.avgTurnaround, PRIORITY_EXPECTED.avgTurnaround, 'NP average turnaround');
  close(byAlgorithm.PRIO_P.avgTurnaround, PRIORITY_EXPECTED.avgTurnaround, 'P average turnaround');

  // Priority-NP and Priority-P agree because no higher-priority process ever
  // arrives after a lower-priority one has started, so preemption never fires.
  assert.deepEqual(byAlgorithm.PRIO_NP, byAlgorithm.PRIO_P);

  // SJF-NP and SRTF agree for the same reason in reverse: with every process
  // present from t=0, "shortest next burst" and "shortest remaining" select the
  // same process every time. They are the best on turnaround here — 7 against
  // priority's 12 — because priority order is not shortest-first.
  assert.deepEqual(byAlgorithm.SJF_NP, byAlgorithm.SRTF);
  close(byAlgorithm.SJF_NP.avgTurnaround, 7, 'SJF average turnaround');

  // Both ties must be reported as ties, not resolved to whichever ran first.
  assert.deepEqual(extremeOf(result.runs, 'avgTurnaround', 'min').algorithms, ['SJF_NP', 'SRTF']);
});

/* ──────────────────────────────── Extremes ───────────────────────────────── */

test('extremeOf finds the minimum and the maximum', () => {
  const runs = [
    { algorithm: 'A', summary: { x: 3 } },
    { algorithm: 'B', summary: { x: 1 } },
    { algorithm: 'C', summary: { x: 7 } },
  ];

  assert.deepEqual(extremeOf(runs, 'x', 'min'), { value: 1, algorithms: ['B'] });
  assert.deepEqual(extremeOf(runs, 'x', 'max'), { value: 7, algorithms: ['C'] });
});

test('extremeOf returns every algorithm on a tie', () => {
  const runs = [
    { algorithm: 'A', summary: { x: 2 } },
    { algorithm: 'B', summary: { x: 2 } },
    { algorithm: 'C', summary: { x: 5 } },
  ];

  assert.deepEqual(extremeOf(runs, 'x', 'min').algorithms, ['A', 'B']);
  assert.deepEqual(extremeOf(runs, 'x', 'max').algorithms, ['C']);
});

test('extremeOf tolerates floating-point ties', () => {
  // 47/3 computed two ways can differ in the last bit; a tie must still tie.
  const runs = [
    { algorithm: 'A', summary: { x: 47 / 3 } },
    { algorithm: 'B', summary: { x: 15.666666666666666 } },
  ];

  assert.equal(extremeOf(runs, 'x', 'min').algorithms.length, 2);
});

test('extremeOf ignores missing values rather than returning NaN', () => {
  const runs = [
    { algorithm: 'A', summary: { x: null } },
    { algorithm: 'B', summary: { x: 4 } },
    { algorithm: 'C', summary: { x: undefined } },
  ];

  assert.deepEqual(extremeOf(runs, 'x', 'min'), { value: 4, algorithms: ['B'] });
});

test('extremeOf over an empty list is null, not -Infinity', () => {
  assert.deepEqual(extremeOf([], 'x', 'min'), { value: null, algorithms: [] });
});

test('valuesOf reports one entry per algorithm', () => {
  const result = compareAll(SAMPLE_WORKLOAD, DEFAULT_CONFIG);
  assert.equal(valuesOf(result.runs, 'avgTurnaround').length, ALGORITHM_IDS.length);
});

/* ──────────────────────────────── Best / wins ────────────────────────────── */

test('best is keyed by every metric and respects each direction', () => {
  const result = compareAll(SAMPLE_WORKLOAD, DEFAULT_CONFIG);
  assert.deepEqual(Object.keys(result.best).sort(), COMPARE_METRICS.map((m) => m.key).sort());

  // Throughput is "higher is better"; makespan is "lower is better". Neither may
  // be picked with the other's direction.
  const throughput = valuesOf(result.runs, 'throughput').map((v) => v.value);
  const makespan = valuesOf(result.runs, 'makespan').map((v) => v.value);
  assert.equal(result.best.throughput.value, Math.max(...throughput));
  assert.equal(result.best.makespan.value, Math.min(...makespan));
});

test('win counts add up to the number of metrics', () => {
  const result = compareAll(SAMPLE_WORKLOAD, DEFAULT_CONFIG);
  const counts = winCounts(result);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  // A tie makes two algorithms each win the same metric, so the total can
  // exceed the metric count but never fall short of it.
  assert.ok(total >= COMPARE_METRICS.length, `only ${total} wins across ${COMPARE_METRICS.length} metrics`);
  assert.deepEqual(Object.keys(counts).sort(), [...ALGORITHM_IDS].sort());
});

test('every algorithm appears in the win counts even with zero wins', () => {
  const counts = winCounts(compareAll(SAMPLE_WORKLOAD, DEFAULT_CONFIG));
  for (const id of ALGORITHM_IDS) assert.equal(typeof counts[id], 'number', id);
});
