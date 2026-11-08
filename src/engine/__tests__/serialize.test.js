/**
 * Interchange tests.
 *
 * Two properties matter more than any individual case:
 *
 *   1. **Round trip.** Exporting the assignment's own workload and importing it
 *      back must produce a workload that simulates to exactly the same timeline.
 *      Asserting on the timeline rather than on the object graph means the test
 *      would still catch a coercion bug that happened to preserve field names.
 *   2. **No throw.** A malformed file is a user error, not a crash. Every
 *      rejected input below is asserted to come back as `ok: false` with a
 *      reason, because the editor shows that reason instead of an error page.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_CONFIG } from '../constants.js';
import {
  RUN_FORMAT,
  WORKLOAD_FORMAT,
  WORKLOAD_VERSION,
  parseWorkloadJSON,
  serializeRun,
  serializeWorkload,
  slugify,
  stringifyWorkload,
} from '../serialize.js';
import { simulate } from '../simulate.js';
import { formatBurstSequence } from '../workload.js';
import { SAMPLE_WORKLOAD } from '../../data/sampleWorkload.js';
import { RR_SET } from '../../data/presets.js';
import { completions, traceIs, cpuTrace } from './helpers.js';

const CONFIG = { ...DEFAULT_CONFIG, algorithm: 'SRTF' };

/* ──────────────────────────────── Round trip ─────────────────────────────── */

test('exporting and re-importing the sample workload reproduces the same run', () => {
  const text = stringifyWorkload(SAMPLE_WORKLOAD, { config: CONFIG, name: 'Assignment workload' });
  const result = parseWorkloadJSON(text);

  assert.equal(result.ok, true, result.errors.join('; '));
  assert.deepEqual(result.errors, []);

  const before = simulate(SAMPLE_WORKLOAD, CONFIG);
  const after = simulate(result.processes, CONFIG);

  traceIs(cpuTrace(after), cpuTrace(before), 'CPU timeline after a JSON round trip');
  assert.deepEqual(completions(after), completions(before));
  assert.deepEqual(after.summary, before.summary);
});

test('the exported document carries a format tag and a version', () => {
  const doc = serializeWorkload(SAMPLE_WORKLOAD, { config: CONFIG });
  assert.equal(doc.format, WORKLOAD_FORMAT);
  assert.equal(doc.version, WORKLOAD_VERSION);
  assert.equal(doc.processes.length, SAMPLE_WORKLOAD.length);
});

test('colour indexes are not exported — they are re-derived by position', () => {
  const doc = serializeWorkload(SAMPLE_WORKLOAD, { config: CONFIG });
  for (const process of doc.processes) {
    assert.equal('colorIndex' in process, false);
  }

  const result = parseWorkloadJSON(doc);
  assert.deepEqual(
    result.processes.map((p) => p.colorIndex),
    [1, 2, 3, 4, 5],
  );
});

test('the config block is exported only when a config is supplied', () => {
  assert.equal('config' in serializeWorkload(SAMPLE_WORKLOAD), false);
  const doc = serializeWorkload(SAMPLE_WORKLOAD, { config: CONFIG });
  assert.equal(doc.config.algorithm, 'SRTF');
  assert.equal(doc.config.quantum, CONFIG.quantum);
});

test('the exported text is valid JSON with a trailing newline', () => {
  const text = stringifyWorkload(SAMPLE_WORKLOAD, { config: CONFIG });
  assert.ok(text.endsWith('\n'));
  assert.doesNotThrow(() => JSON.parse(text));
});

/* ────────────────────────────── Forgiving input ──────────────────────────── */

test('a bare array is accepted as a workload', () => {
  const result = parseWorkloadJSON(JSON.stringify(RR_SET));
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.processes.length, 3);
  assert.equal(result.name, null);
});

test('a burst sequence may be written in the assignment’s own notation', () => {
  const result = parseWorkloadJSON({
    processes: [
      { id: 'P1', arrival: 0, priority: 3, bursts: 'CPU 180, A 100, CPU 120' },
    ],
  });

  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(
    formatBurstSequence(result.processes[0].bursts),
    'CPU 180 · A 100 · CPU 120',
  );
});

test('numeric strings, [kind, duration] pairs and a device alias all coerce', () => {
  const result = parseWorkloadJSON({
    processes: [
      { id: 'P1', arrival: '0', priority: '2', bursts: [['cpu', '60'], ['a', 70], { kind: 'CPU', duration: 80 }] },
    ],
  });

  assert.equal(result.ok, true, result.errors.join('; '));
  assert.deepEqual(result.processes[0], {
    id: 'P1',
    arrival: 0,
    priority: 2,
    bursts: [
      { kind: 'CPU', duration: 60 },
      { kind: 'A', duration: 70 },
      { kind: 'CPU', duration: 80 },
    ],
    colorIndex: 1,
  });
});

test('a missing arrival or priority is defaulted with a warning, not an error', () => {
  const result = parseWorkloadJSON({
    processes: [{ id: 'P1', bursts: [{ kind: 'CPU', duration: 100 }] }],
  });

  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.processes[0].arrival, 0);
  assert.equal(result.processes[0].priority, 1);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /no arrival given/);
  assert.match(result.warnings[1], /no priority given/);
});

test('a missing ID is filled in from the row position', () => {
  const result = parseWorkloadJSON({
    processes: [
      { arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 100 }] },
      { arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 100 }] },
    ],
  });

  assert.equal(result.ok, true, result.errors.join('; '));
  assert.deepEqual(
    result.processes.map((p) => p.id),
    ['P1', 'P2'],
  );
  assert.match(result.warnings[0], /missing or blank ID/);
});

test('an unrecognised format tag warns but still imports', () => {
  const result = parseWorkloadJSON({
    format: 'something-else',
    version: 99,
    processes: RR_SET,
  });

  assert.equal(result.ok, true);
  assert.match(result.warnings.join(' '), /Unrecognised format/);
  assert.match(result.warnings.join(' '), /newer than this build/);
});

/* ──────────────────────────── Duration bounds are notes ──────────────────── */

test('out-of-range bursts are a warning, because the textbook presets use short ones', () => {
  const result = parseWorkloadJSON(JSON.stringify(RR_SET));

  assert.equal(result.ok, true);
  assert.ok(
    result.warnings.some((w) => /outside the assignment's 50–200 range/.test(w)),
    `expected a range note, got: ${JSON.stringify(result.warnings)}`,
  );
});

test('the sample workload produces no range notes', () => {
  const result = parseWorkloadJSON(JSON.stringify(SAMPLE_WORKLOAD));
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
});

/* ──────────────────────────────── Rejections ─────────────────────────────── */

test('malformed JSON is rejected with the parser’s reason', () => {
  const result = parseWorkloadJSON('{ not json');
  assert.equal(result.ok, false);
  assert.equal(result.processes, null);
  assert.match(result.errors[0], /Not valid JSON/);
});

test('a document with no processes array is rejected', () => {
  const result = parseWorkloadJSON({ format: WORKLOAD_FORMAT, version: 1 });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /No "processes" array/);
});

test('a non-object document is rejected', () => {
  assert.equal(parseWorkloadJSON('42').ok, false);
  assert.equal(parseWorkloadJSON('null').ok, false);
});

test('an empty process list is rejected', () => {
  const result = parseWorkloadJSON({ processes: [] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /No usable processes/);
});

test('model violations survive coercion and are reported', () => {
  // Ends with I/O, has two adjacent CPU bursts, and a priority outside 1–5.
  const result = parseWorkloadJSON({
    processes: [
      {
        id: 'P1',
        arrival: 0,
        priority: 9,
        bursts: [
          { kind: 'CPU', duration: 100 },
          { kind: 'CPU', duration: 100 },
          { kind: 'A', duration: 100 },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  const joined = result.errors.join(' ');
  assert.match(joined, /must end with a CPU burst/);
  assert.match(joined, /must alternate/);
  assert.match(joined, /priority must be a whole number 1–5/);
});

test('duplicate IDs are reported', () => {
  const result = parseWorkloadJSON({
    processes: [
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 100 }] },
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 100 }] },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /duplicate process ID/);
});

test('junk rows are skipped with a warning rather than crashing the parse', () => {
  const result = parseWorkloadJSON({
    processes: [
      null,
      'not a process',
      { id: 'P1', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 100 }] },
    ],
  });

  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.processes.length, 1);
  assert.equal(result.warnings.filter((w) => /not a process object/.test(w)).length, 2);
});

/* ─────────────────────────────── Config import ───────────────────────────── */

test('a valid config block is imported', () => {
  const result = parseWorkloadJSON({
    processes: RR_SET,
    config: { algorithm: 'RR', quantum: 4, switchOverhead: 2, admissionLimit: 3, unitLabel: 'ticks' },
  });

  assert.deepEqual(result.config, {
    algorithm: 'RR',
    quantum: 4,
    switchOverhead: 2,
    admissionLimit: 3,
    unitLabel: 'ticks',
  });
});

test('invalid config fields are dropped with a warning, and the rest survive', () => {
  const result = parseWorkloadJSON({
    processes: RR_SET,
    config: { algorithm: 'MAGIC', quantum: 0, switchOverhead: -1, admissionLimit: null },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.config, { admissionLimit: null });
  const joined = result.warnings.join(' ');
  assert.match(joined, /Unknown algorithm "MAGIC"/);
  assert.match(joined, /below the minimum/);
  assert.match(joined, /cannot be negative/);
});

test('an unlimited admission limit round-trips as null', () => {
  const doc = serializeWorkload(RR_SET, { config: { ...CONFIG, admissionLimit: null } });
  assert.equal(doc.config.admissionLimit, null);
  assert.deepEqual(parseWorkloadJSON(doc).config.admissionLimit, null);
});

/* ──────────────────────────────── Full run ───────────────────────────────── */

test('a serialised run contains the workload, the config and every result', () => {
  const timeline = simulate(SAMPLE_WORKLOAD, CONFIG);
  const run = serializeRun(timeline, { name: 'Assignment workload' });

  assert.equal(run.format, RUN_FORMAT);
  assert.equal(run.config.algorithm, 'SRTF');
  assert.equal(run.workload.length, SAMPLE_WORKLOAD.length);
  assert.equal(run.metrics.length, SAMPLE_WORKLOAD.length);
  assert.equal(run.events.length, timeline.events.length);
  assert.equal(run.summary.makespan, timeline.summary.makespan);
  assert.equal(run.warning, null);
});

test('a serialised run is JSON-safe', () => {
  const timeline = simulate(SAMPLE_WORKLOAD, CONFIG);
  const text = JSON.stringify(serializeRun(timeline));
  assert.doesNotThrow(() => JSON.parse(text));
  assert.equal(text.includes('undefined'), false);
});

/* ─────────────────────────────── Filenames ───────────────────────────────── */

test('slugify produces a filesystem-safe stem', () => {
  assert.equal(slugify('Assignment workload (§4)'), 'assignment-workload-4');
  assert.equal(slugify('Round Robin (q=4)'), 'round-robin-q-4');
  assert.equal(slugify('   '), 'workload');
  assert.equal(slugify(undefined), 'workload');
});
