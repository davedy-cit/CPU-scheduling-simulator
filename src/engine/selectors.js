/**
 * View-model derivations.
 *
 * Everything here is a pure function of `(timeline, cursor)` or of one
 * snapshot. No React, no state, no mutation of the timeline — which is what
 * makes the dashboard a projection of a frozen run rather than a second,
 * subtly-different implementation of the simulation.
 *
 * The single most important convention in this file: **the cursor is both the
 * clock reading and the count of elapsed ticks.** `snapshots[i]` describes the
 * interval `[i, i + 1)`, so at cursor `c` exactly `c` ticks have been executed —
 * intervals `[0,1) … [c-1,c)`. Every "reveal up to now" function below follows
 * from that one fact.
 */

/**
 * @typedef {import('./types.js').Timeline} Timeline
 * @typedef {import('./types.js').Snapshot} Snapshot
 * @typedef {import('./types.js').GanttSegment} GanttSegment
 * @typedef {import('./types.js').ProcessSpec} ProcessSpec
 * @typedef {import('./types.js').ProcessRuntime} ProcessRuntime
 */

/* ─────────────────────────────── Locations ─────────────────────────────── */

/**
 * Every place a process can be. Used by the flow board, the process table and
 * the history strip, so all three describe a process the same way.
 *
 * @typedef {'PENDING'|'JOB'|'READY'|'CPU'|'SWITCH'|'DEVICE_A'|'DEVICE_B'
 *          |'DEVICE_A_QUEUE'|'DEVICE_B_QUEUE'|'TERMINATED'} Location
 */

/** @type {Record<Location, string>} */
export const LOCATION_LABEL = {
  PENDING: 'Not arrived',
  JOB: 'Job Queue',
  READY: 'Ready Queue',
  CPU: 'Running on CPU',
  SWITCH: 'Context switch',
  DEVICE_A: 'Device A',
  DEVICE_B: 'Device B',
  DEVICE_A_QUEUE: 'Device A queue',
  DEVICE_B_QUEUE: 'Device B queue',
  TERMINATED: 'Terminated',
};

/** Which lifecycle state a location corresponds to (spec §5). */
/** @type {Record<Location, import('./types.js').ProcState>} */
export const LOCATION_STATE = {
  PENDING: 'NEW',
  JOB: 'NEW',
  READY: 'READY',
  CPU: 'RUNNING',
  SWITCH: 'RUNNING',
  DEVICE_A: 'WAITING',
  DEVICE_B: 'WAITING',
  DEVICE_A_QUEUE: 'WAITING',
  DEVICE_B_QUEUE: 'WAITING',
  TERMINATED: 'TERMINATED',
};

/**
 * Where a process is at this instant.
 *
 * Checked in service-first order, because a process being serviced is still
 * named in its queue in some designs — here it is not, but ordering the checks
 * this way keeps the function correct if that ever changes.
 *
 * @param {string} pid
 * @param {Snapshot} snapshot
 * @returns {Location}
 */
export function locationOf(pid, snapshot) {
  if (snapshot.cpu.pid === pid) return snapshot.cpu.inSwitch ? 'SWITCH' : 'CPU';
  if (snapshot.devices.A.busyPid === pid) return 'DEVICE_A';
  if (snapshot.devices.B.busyPid === pid) return 'DEVICE_B';
  if (snapshot.devices.A.queue.includes(pid)) return 'DEVICE_A_QUEUE';
  if (snapshot.devices.B.queue.includes(pid)) return 'DEVICE_B_QUEUE';
  if (snapshot.readyQueue.includes(pid)) return 'READY';
  if (snapshot.jobQueue.includes(pid)) return 'JOB';
  if (snapshot.terminated.includes(pid)) return 'TERMINATED';
  return 'PENDING';
}

/* ──────────────────────────────── Gantt ───────────────────────────────── */

/**
 * The portion of a resource timeline revealed so far, with the in-progress
 * segment clipped to the cursor.
 *
 * Segments are contiguous and sorted, so once one starts at or after the cursor
 * there is nothing further to reveal and the loop can stop.
 *
 * @param {GanttSegment[]} segments
 * @param {number} cursor
 * @returns {GanttSegment[]}
 */
export function visibleSegments(segments, cursor) {
  /** @type {GanttSegment[]} */
  const out = [];
  for (const segment of segments) {
    if (segment.start >= cursor) break;
    out.push(segment.end <= cursor ? segment : { ...segment, end: cursor });
  }
  return out;
}

/**
 * The interval `[cursor, cursor + 1)` on a resource timeline — what is happening
 * right now, highlighted under the playhead.
 *
 * @param {GanttSegment[]} segments
 * @param {number} cursor
 * @returns {GanttSegment|null}
 */
export function segmentAt(segments, cursor) {
  for (const segment of segments) {
    if (segment.start <= cursor && cursor < segment.end) return segment;
    if (segment.start > cursor) break;
  }
  return null;
}

/**
 * The three lanes the Gantt chart draws, in order (spec §8: the CPU chart plus
 * separate Device A and Device B timelines).
 *
 * @param {Timeline} timeline
 * @param {number} cursor
 */
export function ganttLanes(timeline, cursor) {
  /**
   * @param {'cpu'|'A'|'B'} id
   * @param {string} label
   * @param {string} hint
   * @param {GanttSegment[]} all
   */
  const lane = (id, label, hint, all) => ({
    id,
    label,
    hint,
    all,
    segments: visibleSegments(all, cursor),
  });

  return [
    lane('cpu', 'CPU', 'Execution, context switches and idle time', timeline.cpuSegments),
    lane('A', 'Device A', 'I/O service on Device A', timeline.deviceSegments.A),
    lane('B', 'Device B', 'I/O service on Device B', timeline.deviceSegments.B),
  ];
}

/* ──────────────────────────────── Events ──────────────────────────────── */

/**
 * How many events have occurred at or before the cursor.
 *
 * `eventTicks` is non-decreasing, so this is a binary search rather than a
 * filter — the event log is re-derived on every tick during playback.
 *
 * @param {Timeline} timeline
 * @param {number} cursor
 * @returns {number}
 */
export function eventCutoff(timeline, cursor) {
  const ticks = timeline.eventTicks;
  let lo = 0;
  let hi = ticks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ticks[mid] <= cursor) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The trace so far (spec §5). Events applied at boundary `t` are visible from
 * cursor `t` onwards, because the snapshot at `t` already reflects them.
 *
 * @param {Timeline} timeline
 * @param {number} cursor
 * @returns {import('./types.js').SimEvent[]}
 */
export function eventsUpTo(timeline, cursor) {
  return timeline.events.slice(0, eventCutoff(timeline, cursor));
}

/**
 * The events that happened at exactly this tick.
 *
 * @param {Timeline} timeline
 * @param {Snapshot} snapshot
 * @returns {import('./types.js').SimEvent[]}
 */
export function eventsAt(timeline, snapshot) {
  return snapshot.lastEventIds.map((id) => timeline.events[id]).filter(Boolean);
}

/* ─────────────────────────── Per-process progress ─────────────────────── */

/**
 * @typedef {Object} ProcessProgress
 * @property {number} burstIndex
 * @property {'CPU'|'A'|'B'|null} burstKind
 * @property {number} burstDuration
 * @property {number} burstServed Units of the current burst already serviced.
 * @property {number} burstRemaining
 * @property {number} burstProgress 0–1 within the current burst.
 * @property {number} totalWork Sum of every burst duration.
 * @property {number} workDone Completed bursts plus service within the current one.
 * @property {number} overallProgress 0–1 across the whole process.
 * @property {number} cpuRemaining Total CPU work still to do, including the current burst.
 */

/**
 * Progress through a process's burst sequence.
 *
 * Note that `burstDuration - remaining` is the amount *serviced*, not the amount
 * of wall time elapsed: a process sitting in a queue does not advance its burst.
 * That distinction is the whole reason the metrics module refuses to derive
 * waiting times by subtraction.
 *
 * @param {ProcessSpec} spec
 * @param {ProcessRuntime} rt
 * @returns {ProcessProgress}
 */
export function processProgress(spec, rt) {
  const burst = spec.bursts[rt.burstIndex] ?? null;
  const burstDuration = burst ? burst.duration : 0;
  const burstServed = burst ? Math.max(0, burstDuration - Math.max(0, rt.remaining)) : 0;

  let totalWork = 0;
  let workDone = 0;
  for (let i = 0; i < spec.bursts.length; i++) {
    totalWork += spec.bursts[i].duration;
    if (i < rt.burstIndex) workDone += spec.bursts[i].duration;
  }
  if (rt.state === 'TERMINATED') workDone = totalWork;
  else workDone += burstServed;

  let cpuRemaining = 0;
  for (let i = rt.burstIndex; i < spec.bursts.length; i++) {
    if (spec.bursts[i].kind !== 'CPU') continue;
    cpuRemaining += i === rt.burstIndex ? Math.max(0, rt.remaining) : spec.bursts[i].duration;
  }

  return {
    burstIndex: rt.burstIndex,
    burstKind: burst ? burst.kind : null,
    burstDuration,
    burstServed,
    burstRemaining: Math.max(0, rt.remaining),
    burstProgress: burstDuration > 0 ? burstServed / burstDuration : 0,
    totalWork,
    workDone,
    overallProgress: totalWork > 0 ? workDone / totalWork : 0,
    cpuRemaining,
  };
}

/* ──────────────────────────────── Rows ────────────────────────────────── */

/**
 * One row per process, with its live runtime record, location and progress.
 * Shared by the process table and the workload editor's read-only preview.
 *
 * @param {Timeline} timeline
 * @param {Snapshot} snapshot
 * @returns {Array<{spec: ProcessSpec, rt: ProcessRuntime, progress: ProcessProgress, location: Location}>}
 */
export function processRows(timeline, snapshot) {
  if (!snapshot) return [];
  return timeline.processes.map((spec) => {
    const rt = snapshot.proc[spec.id];
    return {
      spec,
      rt,
      progress: processProgress(spec, rt),
      location: locationOf(spec.id, snapshot),
    };
  });
}

/* ─────────────────────────────── Occupancy ────────────────────────────── */

/**
 * How many processes sit in each place, for the KPI strip and the queue column
 * headers.
 *
 * @param {Snapshot} snapshot
 */
export function occupancy(snapshot) {
  if (!snapshot) {
    return { pending: 0, job: 0, ready: 0, cpu: 0, deviceA: 0, deviceB: 0, terminated: 0, inSystem: 0 };
  }
  const cpu = snapshot.cpu.pid ? 1 : 0;
  return {
    pending: snapshot.pendingArrivals.length,
    job: snapshot.jobQueue.length,
    ready: snapshot.readyQueue.length,
    cpu,
    deviceA: snapshot.devices.A.queue.length + (snapshot.devices.A.busyPid ? 1 : 0),
    deviceB: snapshot.devices.B.queue.length + (snapshot.devices.B.busyPid ? 1 : 0),
    terminated: snapshot.terminated.length,
    inSystem:
      snapshot.jobQueue.length +
      snapshot.readyQueue.length +
      cpu +
      snapshot.devices.A.queue.length +
      (snapshot.devices.A.busyPid ? 1 : 0) +
      snapshot.devices.B.queue.length +
      (snapshot.devices.B.busyPid ? 1 : 0),
  };
}

/**
 * The algorithm's display label for the current run.
 *
 * @param {Timeline} timeline
 * @returns {string}
 */
export function algorithmLabelOf(timeline) {
  return timeline?.config?.algorithm ?? '—';
}

/* ─────────────────────────────── Live KPIs ────────────────────────────── */

/**
 * @typedef {Object} LiveSummary
 * @property {number} elapsed Ticks simulated so far.
 * @property {number} span Denominator used by every rate: `elapsed − minArrival`, at least 1.
 * @property {number} spanTicks The same span for display, allowed to be zero.
 * @property {number} completed
 * @property {number} total
 * @property {number|null} avgTurnaround Average over processes finished by now.
 * @property {number|null} avgResponse
 * @property {number|null} avgReadyWait
 * @property {number|null} avgJobWait
 * @property {number|null} avgDeviceWait
 * @property {number} throughput
 * @property {number} cpuUtilization
 * @property {number} deviceUtilizationA
 * @property {number} deviceUtilizationB
 * @property {number} cpuBusyTime
 * @property {number} idleTime
 * @property {number} switchTime
 * @property {number} contextSwitches
 * @property {number} dispatches
 * @property {number} preemptions
 * @property {number|null} makespanFinal What the run's makespan will be, for context.
 */

/**
 * The metrics as they stand at the cursor — the dashboard's live readouts.
 *
 * Averages cover only the processes that have actually finished, because
 * averaging in a process that is still running would need a completion time it
 * does not have. Every rate divides by `span` rather than by `elapsed`: the
 * spec's makespan is `lastCompletion − minArrival`, so dividing by the raw clock
 * would understate utilisation for any workload whose first process does not
 * arrive at t=0. Using `span` makes the live figures converge exactly on the
 * final reported metrics as the run completes.
 *
 * @param {Timeline} timeline
 * @param {number} cursor
 * @returns {LiveSummary}
 */
export function liveSummary(timeline, cursor) {
  const total = timeline.metrics.length;
  // `simulate` sorts processes by arrival, so the first is the earliest.
  const minArrival = timeline.processes.length > 0 ? timeline.processes[0].arrival : 0;
  const snapshot = timeline.snapshots[cursor] ?? null;

  const counters = snapshot?.counters ?? {
    elapsed: cursor,
    cpuExecutingTicks: 0,
    switchTicks: 0,
    idleTicks: 0,
    contextSwitches: 0,
    dispatches: 0,
    preemptions: 0,
  };
  const devices = snapshot?.devices ?? { A: { busyTicks: 0 }, B: { busyTicks: 0 } };

  // The divisor is floored at 1 so the rates are finite at t = 0; the display
  // value is not, because "0 of 1 ms executing" reads as a bug.
  const spanTicks = Math.max(0, cursor - minArrival);
  const span = Math.max(1, spanTicks);
  const done = timeline.metrics.filter((m) => m.completion !== null && m.completion <= cursor);

  /** @param {keyof import('./types.js').ProcessMetrics} key */
  const mean = (key) => {
    const values = done.map((row) => row[key]).filter((v) => typeof v === 'number');
    return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
  };

  return {
    elapsed: cursor,
    span,
    spanTicks,
    completed: done.length,
    total,

    avgTurnaround: mean('turnaround'),
    avgResponse: mean('response'),
    avgReadyWait: mean('readyWait'),
    avgJobWait: mean('jobWait'),
    avgDeviceWait: mean('deviceWait'),

    throughput: done.length / span,
    // Spec §9: CPU utilisation excludes context-switch ticks.
    cpuUtilization: (counters.cpuExecutingTicks / span) * 100,
    deviceUtilizationA: (devices.A.busyTicks / span) * 100,
    deviceUtilizationB: (devices.B.busyTicks / span) * 100,

    cpuBusyTime: counters.cpuExecutingTicks,
    idleTime: counters.idleTicks,
    switchTime: counters.switchTicks,

    contextSwitches: counters.contextSwitches,
    dispatches: counters.dispatches,
    preemptions: counters.preemptions,

    makespanFinal: timeline.summary.makespan,
  };
}

/**
 * The tick at which the next event occurs, or null if the run is finished.
 * Drives the "Next event at t=…" affordance on the control bar.
 *
 * @param {Timeline} timeline
 * @param {number} cursor
 * @returns {number|null}
 */
export function nextEventTick(timeline, cursor) {
  const from = eventCutoff(timeline, cursor);
  return from < timeline.eventTicks.length ? timeline.eventTicks[from] : null;
}
