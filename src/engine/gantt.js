/**
 * Gantt timeline derivation.
 *
 * Spec §8 requires "CPU Gantt chart and separate Device A / B timelines,
 * including Idle and Context Switch segments." Because the whole run is
 * precomputed, these segments are known the moment the timeline exists — the
 * chart's "dynamic" quality comes from revealing them progressively as the
 * cursor advances, not from building them incrementally.
 *
 * Each segment is a run-length-encoded span of ticks with the same occupant.
 */

/**
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {import('./types.js').GanttSegment} GanttSegment
 */

/**
 * Run-length encode the first `count` snapshots.
 *
 * Snapshot `i` describes the interval `[i, i + 1)`, so a timeline of `n`
 * snapshots yields `n - 1` intervals — the final snapshot is terminal state for
 * display only and covers no time.
 *
 * @param {number} count Number of intervals to encode.
 * @param {(i: number) => GanttSegment['kind']} kindOf
 * @param {(i: number) => string|null} pidOf
 * @returns {GanttSegment[]}
 */
function runLengthEncode(count, kindOf, pidOf) {
  /** @type {GanttSegment[]} */
  const segments = [];
  for (let i = 0; i < count; i++) {
    const kind = kindOf(i);
    const pid = pidOf(i);
    const tail = segments[segments.length - 1];
    if (tail && tail.kind === kind && tail.pid === pid) {
      tail.end = i + 1;
    } else {
      segments.push({ start: i, end: i + 1, pid, kind });
    }
  }
  return segments;
}

/**
 * CPU timeline: RUN (a process executing), SWITCH (context-switch overhead) or
 * IDLE (no eligible ready process).
 *
 * @param {Snapshot[]} snapshots
 * @returns {GanttSegment[]}
 */
export function deriveCpuSegments(snapshots) {
  return runLengthEncode(
    snapshots.length - 1,
    (i) => (snapshots[i].cpu.inSwitch ? 'SWITCH' : snapshots[i].cpu.pid ? 'RUN' : 'IDLE'),
    (i) => (snapshots[i].cpu.inSwitch ? null : snapshots[i].cpu.pid),
  );
}

/**
 * One device's timeline: BUSY while servicing, IDLE otherwise.
 *
 * Devices have no context switches — each is a single FIFO server.
 *
 * @param {Snapshot[]} snapshots
 * @param {'A'|'B'} device
 * @returns {GanttSegment[]}
 */
export function deriveDeviceSegments(snapshots, device) {
  return runLengthEncode(
    snapshots.length - 1,
    (i) => (snapshots[i].devices[device].busyPid ? 'BUSY' : 'IDLE'),
    (i) => snapshots[i].devices[device].busyPid,
  );
}

/**
 * Build all three timelines at once.
 *
 * @param {Snapshot[]} snapshots
 * @returns {{ cpu: GanttSegment[], A: GanttSegment[], B: GanttSegment[] }}
 */
export function deriveAllSegments(snapshots) {
  return {
    cpu: deriveCpuSegments(snapshots),
    A: deriveDeviceSegments(snapshots, 'A'),
    B: deriveDeviceSegments(snapshots, 'B'),
  };
}
