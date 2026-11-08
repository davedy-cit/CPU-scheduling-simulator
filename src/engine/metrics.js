/**
 * Performance measures (spec §9).
 *
 * The spec is explicit that the usual textbook shortcut is invalid here:
 *
 *   "The common textbook shortcut waiting = turnaround - total CPU time is
 *    INVALID for this multiburst simulation unless I/O and other non-ready
 *    delays are deducted."
 *
 * So nothing below derives a wait by subtraction. Every waiting figure is
 * accumulated by the tick loop while the process is actually sitting in that
 * queue, which is the only way to separate Ready wait from Job wait from device
 * wait when a process blocks and returns several times.
 */

/**
 * @typedef {import('./types.js').ProcessSpec} ProcessSpec
 * @typedef {import('./types.js').ProcessRuntime} ProcessRuntime
 * @typedef {import('./types.js').ProcessMetrics} ProcessMetrics
 * @typedef {import('./types.js').Summary} Summary
 * @typedef {import('./types.js').DeviceState} DeviceState
 */

/**
 * Per-process results, in workload order (which is arrival order).
 *
 * @param {ProcessSpec[]} specs
 * @param {Record<string, ProcessRuntime>} proc
 * @returns {ProcessMetrics[]}
 */
export function deriveProcessMetrics(specs, proc) {
  return specs.map((spec) => {
    const rt = proc[spec.id];
    const completion = rt.completionTick;

    return {
      id: spec.id,
      arrival: spec.arrival,
      priority: spec.priority,
      completion,
      turnaround: completion === null ? null : completion - spec.arrival,
      // Response time is measured from arrival to the FIRST dispatch, so a
      // process that blocks and returns does not get a second response time.
      response: rt.firstCpuStartTick === null ? null : rt.firstCpuStartTick - spec.arrival,
      readyWait: rt.readyWait,
      jobWait: rt.jobWait,
      deviceWait: rt.deviceWait,
      cpuTime: rt.cpuTime,
      preemptions: rt.preemptions,
      ioRequests: rt.ioRequests,
    };
  });
}

/**
 * Average a numeric field over a set of rows, or null when the set is empty.
 *
 * @param {ProcessMetrics[]} rows
 * @param {keyof ProcessMetrics} key
 * @returns {number|null}
 */
function mean(rows, key) {
  const values = rows.map((r) => r[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Aggregate results (spec §9).
 *
 * Makespan is `lastCompletion − minArrival`. The spec does not pin the origin,
 * so it is documented in the README; note that every utilisation figure below
 * divides by it, so the choice is visible in the numbers.
 *
 * @param {Object} input
 * @param {ProcessMetrics[]} input.metrics
 * @param {number} input.makespan
 * @param {import('./types.js').Counters} input.counters
 * @param {{A: DeviceState, B: DeviceState}} input.devices
 * @returns {Summary}
 */
export function buildSummary({ metrics, makespan, counters, devices }) {
  const completed = metrics.filter((m) => m.completion !== null);
  const responded = metrics.filter((m) => m.response !== null);
  // Guard the denominators: a zero makespan would make every percentage NaN.
  const denom = makespan > 0 ? makespan : 1;

  return {
    makespan,
    completed: completed.length,
    total: metrics.length,

    // Spec §9: report averages for turnaround, response and ready-waiting.
    avgTurnaround: mean(completed, 'turnaround'),
    avgResponse: mean(responded, 'response'),
    avgReadyWait: mean(completed, 'readyWait'),
    avgJobWait: mean(completed, 'jobWait'),
    avgDeviceWait: mean(completed, 'deviceWait'),

    throughput: completed.length / denom,
    // Excludes context-switch ticks, per spec §9.
    cpuUtilization: (counters.cpuExecutingTicks / denom) * 100,
    deviceUtilizationA: (devices.A.busyTicks / denom) * 100,
    deviceUtilizationB: (devices.B.busyTicks / denom) * 100,

    contextSwitches: counters.contextSwitches,
    dispatches: counters.dispatches,
    preemptions: counters.preemptions,

    cpuBusyTime: counters.cpuExecutingTicks,
    idleTime: counters.idleTicks,
    switchTime: counters.switchTicks,
  };
}
