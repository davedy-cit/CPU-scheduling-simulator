/**
 * Shared assertions and view helpers for the engine suites.
 *
 * Not a test file itself — the `npm test` glob only picks up `*.test.js`, so
 * nothing in here runs on its own.
 */

import assert from 'node:assert/strict';

/**
 * Compare a float to an exact expectation.
 *
 * The engine does no division until `buildSummary`, so averages carry ordinary
 * binary rounding (47/3, not 15.67). Comparing with a tolerance keeps the
 * assertions readable without hiding a real off-by-one.
 *
 * @param {number|null} actual
 * @param {number} expected
 * @param {string} what
 */
export function close(actual, expected, what) {
  assert.ok(actual !== null && actual !== undefined, `${what}: expected ${expected}, got ${actual}`);
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${what}: expected ${expected}, got ${actual}`,
  );
}

/**
 * Completion tick per process ID.
 *
 * @param {import('../types.js').Timeline} timeline
 * @returns {Record<string, number|null>}
 */
export function completions(timeline) {
  return Object.fromEntries(timeline.metrics.map((m) => [m.id, m.completion]));
}

/**
 * Metrics keyed by process ID, for terse per-process assertions.
 *
 * @param {import('../types.js').Timeline} timeline
 * @returns {Record<string, import('../types.js').ProcessMetrics>}
 */
export function byId(timeline) {
  return Object.fromEntries(timeline.metrics.map((m) => [m.id, m]));
}

/**
 * The CPU timeline as a compact string, e.g. `P4[0,3) P3[3,11)`.
 *
 * Asserting on this makes a scheduling bug obvious at a glance, because the
 * failure message shows the whole trace rather than one number.
 *
 * @param {import('../types.js').Timeline} timeline
 * @returns {string}
 */
export function cpuTrace(timeline) {
  return timeline.cpuSegments.map((s) => `${s.pid ?? s.kind}[${s.start},${s.end})`).join(' ');
}

/**
 * A device's timeline as a compact string.
 *
 * @param {import('../types.js').Timeline} timeline
 * @param {'A'|'B'} device
 * @returns {string}
 */
export function deviceTrace(timeline, device) {
  return timeline.deviceSegments[device]
    .map((s) => `${s.pid ?? s.kind}[${s.start},${s.end})`)
    .join(' ');
}

/**
 * A device's *busy* spans only, with idle padding stripped.
 *
 * Device timelines always span the whole run, so a bare trace assertion would
 * be dominated by IDLE segments and would break every time an unrelated part of
 * the workload changed length. This keeps the assertion about the service
 * intervals themselves.
 *
 * @param {import('../types.js').Timeline} timeline
 * @param {'A'|'B'} device
 * @returns {string}
 */
export function deviceBusy(timeline, device) {
  return timeline.deviceSegments[device]
    .filter((s) => s.kind !== 'IDLE')
    .map((s) => `${s.pid}[${s.start},${s.end})`)
    .join(' ');
}

/**
 * Assert a trace string exactly, with the expectation written first so a
 * failure reads as "expected X, got Y" rather than the reverse.
 *
 * @param {string} actual
 * @param {string} expected
 * @param {string} what
 */
export function traceIs(actual, expected, what) {
  assert.equal(actual, expected, `${what}\n  expected: ${expected}\n  actual:   ${actual}`);
}

/** Every process ID mentioned anywhere in a snapshot, with how many places it occupies. */
export function placementCounts(snapshot) {
  /** @type {Record<string, number>} */
  const counts = {};
  const add = (pid) => {
    if (pid) counts[pid] = (counts[pid] ?? 0) + 1;
  };

  snapshot.pendingArrivals.forEach(add);
  snapshot.jobQueue.forEach(add);
  snapshot.readyQueue.forEach(add);
  add(snapshot.cpu.pid);
  add(snapshot.devices.A.busyPid);
  snapshot.devices.A.queue.forEach(add);
  add(snapshot.devices.B.busyPid);
  snapshot.devices.B.queue.forEach(add);
  snapshot.terminated.forEach(add);

  return counts;
}
