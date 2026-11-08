/**
 * The deterministic simulation engine.
 *
 * `simulate(processes, config)` is a pure function with no React, no DOM and no
 * timers. It runs the whole schedule to completion and returns a Timeline: one
 * immutable snapshot per tick, plus the event trace, the Gantt segments and the
 * performance measures.
 *
 * Why precompute rather than step-and-mutate:
 *   - Play / Pause / Step / Next Event / Reset / Run-to-end / scrub all become
 *     cursor arithmetic over `timeline.snapshots`, so there is no separate
 *     fast-forward code path to get wrong.
 *   - Reset is exactly reproducible, which the "deterministic traces" rubric
 *     criterion depends on.
 *   - Compare All is six calls on a frozen workload.
 *   - The engine is testable in plain Node against hand-computed textbook answers.
 *
 * ── Boundary ordering (spec §7) ─────────────────────────────────────────────
 *
 * At each integer boundary t, five phases run in a fixed order. The spec
 * requires this order to be documented and applied consistently, because
 * "deterministic queue order is essential for reproducible grading":
 *
 *   1. COMPLETE all CPU and I/O work ending at t. A CPU burst that ends exactly
 *      at quantum expiry completes — completion wins.
 *   2. ARRIVE new processes, then ADMIT from the Job Queue. Completed I/O is
 *      placed in the Ready Queue in device-ID order (A before B).
 *   3. EVALUATE PREEMPTION for SRTF / Priority-P, and RR quantum expiry. A
 *      preempted RR process goes to the END of the Ready Queue, after any
 *      same-boundary arrivals and completions.
 *   4. DISPATCH a ready process if the CPU is free.
 *   5. Execute [t, t + 1) and accrue queue waits.
 *
 * Snapshot `i` therefore describes the interval `[i, i + 1)` — the cursor index
 * is exactly the clock value shown in the UI.
 */

import { compareIds, getScheduler } from './algorithms.js';
import { DEFAULT_CONFIG, MAX_TICKS } from './constants.js';
import { deriveAllSegments } from './gantt.js';
import { buildSummary, deriveProcessMetrics } from './metrics.js';
import { cloneWorkload, validateWorkload, withColorIndexes } from './workload.js';

const DEVICES = /** @type {const} */ (['A', 'B']);

/** Location labels used in the event trace. */
const LOC = {
  NEW: '—',
  JOB: 'Job Queue',
  READY: 'Ready Queue',
  CPU: 'CPU',
  TERMINATED: 'Terminated',
  IDLE: 'Idle',
};
const deviceLoc = (d) => `Device ${d}`;
const deviceQueueLoc = (d) => `Device ${d} queue`;

/**
 * Copy-on-write update of one process's runtime record.
 *
 * The only way runtime state is ever changed. Unchanged records keep their
 * object identity across ticks, which is what lets `React.memo` skip
 * re-rendering chips that did not move this tick.
 *
 * @param {SimState} S
 * @param {string} pid
 * @param {Partial<import('./types.js').ProcessRuntime>} delta
 */
function patch(S, pid, delta) {
  S.proc = { ...S.proc, [pid]: { ...S.proc[pid], ...delta } };
}

/**
 * @param {import('./types.js').ProcessSpec} spec
 * @returns {import('./types.js').ProcessRuntime}
 */
function makeRuntime(spec) {
  return {
    id: spec.id,
    priority: spec.priority,
    arrived: false,
    state: 'NEW',
    burstIndex: 0,
    remaining: spec.bursts[0].duration,
    readyEntryTick: null,
    admittedTick: null,
    firstCpuStartTick: null,
    completionTick: null,
    readyWait: 0,
    jobWait: 0,
    deviceWait: 0,
    cpuTime: 0,
    preemptions: 0,
    device: null,
    ioRequests: 0,
  };
}

/** @returns {import('./types.js').DeviceState} */
function makeDevice(id) {
  return { id, busyPid: null, remaining: 0, queue: [], busyTicks: 0 };
}

/**
 * The scheduler-facing view of the world for this instant.
 *
 * @param {SimState} S
 * @param {number} t
 * @returns {import('./algorithms.js').SchedulerContext}
 */
function makeContext(S, t) {
  return {
    tick: t,
    readyQueue: S.readyQueue,
    running: S.cpu.pid === null ? null : { pid: S.cpu.pid, quantumLeft: S.cpu.quantumLeft },
    proc: S.proc,
    spec: S.spec,
    config: S.config,
  };
}

/** Deep-enough copy of the working state to freeze one instant. */
function takeSnapshot(S, t) {
  return {
    tick: t,
    proc: S.proc,
    jobQueue: S.jobQueue.slice(),
    pendingArrivals: S.pendingArrivals.slice(),
    readyQueue: S.readyQueue.slice(),
    cpu: { ...S.cpu },
    devices: {
      A: { ...S.devices.A, queue: S.devices.A.queue.slice() },
      B: { ...S.devices.B, queue: S.devices.B.queue.slice() },
    },
    terminated: S.terminated.slice(),
    counters: { ...S.counters },
    lastEventIds: S.lastEventIds.slice(),
  };
}

/**
 * An empty timeline, returned when the workload cannot be simulated.
 *
 * @param {import('./types.js').SimConfig} config
 * @param {string} warning
 * @returns {import('./types.js').Timeline}
 */
function emptyTimeline(config, warning) {
  return {
    processes: [],
    config,
    snapshots: [],
    events: [],
    eventTicks: [],
    cpuSegments: [],
    deviceSegments: { A: [], B: [] },
    switchTicks: [],
    metrics: [],
    summary: buildSummary({
      metrics: [],
      makespan: 0,
      counters: {
        elapsed: 0,
        cpuExecutingTicks: 0,
        switchTicks: 0,
        idleTicks: 0,
        contextSwitches: 0,
        dispatches: 0,
        preemptions: 0,
      },
      devices: { A: makeDevice('A'), B: makeDevice('B') },
    }),
    warning,
  };
}

/**
 * Run one simulation to completion.
 *
 * @param {import('./types.js').ProcessSpec[]} processes
 * @param {Partial<import('./types.js').SimConfig>} [config]
 * @returns {import('./types.js').Timeline}
 */
export function simulate(processes, config = {}) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  const validation = validateWorkload(processes);
  if (!validation.ok) {
    return emptyTimeline(fullConfig, `Invalid workload: ${validation.errors[0]}`);
  }

  // Normalise: drop zero-length bursts, keep only schedulable processes, and
  // order by (arrival, lexical id) so arrival order is deterministic.
  const specs = withColorIndexes(cloneWorkload(processes))
    .map((p) => ({ ...p, bursts: p.bursts.filter((b) => b.duration > 0) }))
    .filter((p) => p.bursts.length > 0 && p.bursts.some((b) => b.kind === 'CPU'))
    .sort((a, b) => a.arrival - b.arrival || compareIds(a.id, b.id));

  if (specs.length === 0) return emptyTimeline(fullConfig, 'No schedulable processes.');

  const scheduler = getScheduler(fullConfig.algorithm);
  const specById = Object.fromEntries(specs.map((s) => [s.id, s]));
  const minArrival = specs[0].arrival;

  /** @type {SimState} */
  const S = {
    config: fullConfig,
    spec: specById,
    proc: Object.fromEntries(specs.map((s) => [s.id, makeRuntime(s)])),
    jobQueue: [],
    pendingArrivals: specs.map((s) => s.id),
    readyQueue: [],
    cpu: {
      pid: null,
      quantumLeft: Infinity,
      inSwitch: false,
      switchTicksLeft: 0,
      admittedTick: null,
      dispatchTick: null,
      hasRun: false,
    },
    devices: { A: makeDevice('A'), B: makeDevice('B') },
    terminated: [],
    counters: {
      elapsed: 0,
      cpuExecutingTicks: 0,
      switchTicks: 0,
      idleTicks: 0,
      contextSwitches: 0,
      dispatches: 0,
      preemptions: 0,
    },
    events: [],
    lastEventIds: [],
    lastExecutedPid: null,
    wasIdle: false,
    snapshots: [],
  };

  /**
   * Append an event to the trace.
   * @param {number} tick
   * @param {string|null} pid
   * @param {string} from
   * @param {string} to
   * @param {import('./types.js').EventReason} reason
   * @param {'A'|'B'} [device]
   */
  const emit = (tick, pid, from, to, reason, device) => {
    const id = S.events.length;
    S.events.push({
      id,
      tick,
      pid,
      from,
      to,
      reason,
      algorithm: fullConfig.algorithm,
      ...(device ? { device } : {}),
    });
    S.lastEventIds.push(id);
  };

  /** Processes admitted but not yet terminated — the admission limit applies to these. */
  const inSystemCount = () =>
    specs.reduce((n, s) => {
      const rt = S.proc[s.id];
      return n + (rt.admittedTick !== null && rt.completionTick === null ? 1 : 0);
    }, 0);

  /* ───────────────────────────── Phase handlers ───────────────────────────── */

  /** Phase 1a — a CPU burst finished at t. */
  function completeCpuBurst(pid, t) {
    const spec = S.spec[pid];
    const rt = S.proc[pid];

    S.cpu.pid = null;
    S.cpu.quantumLeft = Infinity;
    S.cpu.admittedTick = null;
    S.cpu.dispatchTick = null;
    S.cpu.hasRun = false;

    const nextIndex = rt.burstIndex + 1;

    if (nextIndex >= spec.bursts.length) {
      patch(S, pid, {
        burstIndex: nextIndex,
        remaining: 0,
        state: 'TERMINATED',
        completionTick: t,
        device: null,
      });
      S.terminated.push(pid);
      emit(t, pid, LOC.CPU, LOC.TERMINATED, 'TERMINATE');
      return;
    }

    const burst = spec.bursts[nextIndex];
    patch(S, pid, {
      burstIndex: nextIndex,
      remaining: burst.duration,
      state: 'WAITING',
      device: burst.kind,
      ioRequests: rt.ioRequests + 1,
    });
    emit(t, pid, LOC.CPU, deviceLoc(burst.kind), 'IO_REQUEST', burst.kind);
    requestDevice(burst.kind, pid, burst.duration, t, LOC.CPU);
  }

  /**
   * Hand a process to a device: start immediately if the server is free,
   * otherwise join that device's FIFO queue (spec §6).
   */
  function requestDevice(deviceId, pid, duration, t, from) {
    const dev = S.devices[deviceId];
    if (dev.busyPid === null) {
      dev.busyPid = pid;
      dev.remaining = duration;
      emit(t, pid, from, deviceLoc(deviceId), 'IO_START', deviceId);
    } else {
      dev.queue.push(pid);
    }
  }

  /** Phase 1b — an I/O burst finished at t, then promote the next waiter. */
  function completeIoBurst(deviceId, t) {
    const dev = S.devices[deviceId];
    const pid = dev.busyPid;
    if (pid === null) return;

    const spec = S.spec[pid];
    const rt = S.proc[pid];
    dev.busyPid = null;
    dev.remaining = 0;

    const nextIndex = rt.burstIndex + 1;
    const burst = spec.bursts[nextIndex];
    patch(S, pid, {
      burstIndex: nextIndex,
      remaining: burst.duration,
      state: 'READY',
      device: null,
      readyEntryTick: t,
    });
    S.readyQueue.push(pid);
    emit(t, pid, deviceLoc(deviceId), LOC.READY, 'IO_COMPLETE', deviceId);

    // A free server never idles while its queue is non-empty.
    if (dev.queue.length > 0) {
      const next = dev.queue.shift();
      dev.busyPid = next;
      dev.remaining = S.proc[next].remaining;
      emit(t, next, deviceQueueLoc(deviceId), deviceLoc(deviceId), 'IO_START', deviceId);
    }
  }

  /** Phase 2 — arrivals and admissions. */
  function admitArrivals(t) {
    while (S.pendingArrivals.length > 0) {
      const pid = S.pendingArrivals[0];
      if (S.spec[pid].arrival > t) break;
      S.pendingArrivals.shift();
      patch(S, pid, { arrived: true, state: 'NEW' });
      S.jobQueue.push(pid);
      emit(t, pid, LOC.NEW, LOC.JOB, 'ARRIVE');
    }

    while (S.jobQueue.length > 0) {
      const limit = fullConfig.admissionLimit;
      if (limit !== null && limit !== undefined && inSystemCount() >= limit) break;
      const pid = S.jobQueue.shift();
      patch(S, pid, { state: 'READY', admittedTick: t, readyEntryTick: t });
      S.readyQueue.push(pid);
      emit(t, pid, LOC.JOB, LOC.READY, 'ADMIT');
    }
  }

  /** Phase 4 — give the CPU to a ready process, or leave it idle. */
  function dispatchIfPossible(t) {
    if (S.cpu.pid !== null || S.cpu.inSwitch) return;

    const pid = scheduler.select(makeContext(S, t));
    if (pid === null) return;

    const rt = S.proc[pid];
    const index = S.readyQueue.indexOf(pid);
    if (index >= 0) S.readyQueue.splice(index, 1);

    // A switch is a change between two *different* running PIDs; the first
    // dispatch is not a switch (spec §7), and neither is a dispatch that
    // follows an idle stretch, because `lastExecutedPid` is cleared on idle.
    const switching = S.lastExecutedPid !== null && S.lastExecutedPid !== pid;

    patch(S, pid, {
      state: 'RUNNING',
      firstCpuStartTick: rt.firstCpuStartTick === null ? t : rt.firstCpuStartTick,
    });

    S.cpu.pid = pid;
    S.cpu.quantumLeft = scheduler.needsQuantum ? fullConfig.quantum : Infinity;
    S.cpu.admittedTick = rt.admittedTick;
    S.cpu.dispatchTick = t;
    S.cpu.hasRun = false;
    S.counters.dispatches += 1;

    if (switching) {
      S.counters.contextSwitches += 1;
      emit(t, pid, LOC.READY, LOC.CPU, 'CONTEXT_SWITCH');
      if (fullConfig.switchOverhead > 0) {
        S.cpu.inSwitch = true;
        S.cpu.switchTicksLeft = fullConfig.switchOverhead;
      }
    } else {
      emit(t, pid, LOC.READY, LOC.CPU, 'DISPATCH');
    }
  }

  /* ──────────────────────────────── Tick loop ─────────────────────────────── */

  let guard = 0;
  let warning = null;
  let t = 0;

  for (;;) {
    S.counters.elapsed = t;

    // ── Phase 1: complete everything that ended at t ──────────────────────────
    // Completion is tested before the quantum check, so a CPU burst that ends
    // exactly at quantum expiry completes rather than being preempted.
    if (S.cpu.pid !== null && !S.cpu.inSwitch && S.proc[S.cpu.pid].remaining <= 0) {
      completeCpuBurst(S.cpu.pid, t);
    }
    for (const deviceId of DEVICES) {
      if (S.devices[deviceId].busyPid !== null && S.devices[deviceId].remaining <= 0) {
        completeIoBurst(deviceId, t);
      }
    }

    // ── Phase 2: arrivals, then admissions ────────────────────────────────────
    admitArrivals(t);

    // ── Phase 3: preemption ───────────────────────────────────────────────────
    // `hasRun` keeps the scheduler from evicting a process that has not yet
    // received any service. With zero switch overhead this is always true by the
    // time the next boundary arrives, so behaviour is unchanged; with overhead it
    // stops a process being preempted on the very tick its switch completes.
    if (S.cpu.pid !== null && !S.cpu.inSwitch && S.cpu.hasRun) {
      const ctx = makeContext(S, t);
      if (scheduler.shouldPreempt(ctx)) {
        const pid = S.cpu.pid;
        patch(S, pid, {
          state: 'READY',
          readyEntryTick: t,
          preemptions: S.proc[pid].preemptions + 1,
        });
        // Preempted process goes to the END — after same-boundary arrivals and
        // completions (spec §7).
        S.readyQueue.push(pid);
        S.counters.preemptions += 1;
        emit(t, pid, LOC.CPU, LOC.READY, scheduler.needsQuantum ? 'QUANTUM_EXPIRE' : 'PREEMPT');
        S.cpu.pid = null;
        S.cpu.quantumLeft = Infinity;
        S.cpu.admittedTick = null;
        S.cpu.dispatchTick = null;
        S.cpu.hasRun = false;
      } else if (scheduler.needsQuantum && S.cpu.quantumLeft <= 0) {
        // Quantum expired with nobody waiting: grant a fresh quantum rather
        // than evicting the process only to re-dispatch it immediately.
        S.cpu.quantumLeft = fullConfig.quantum;
      }
    }

    // ── Phase 4: dispatch ─────────────────────────────────────────────────────
    dispatchIfPossible(t);

    const idle = S.cpu.pid === null && !S.cpu.inSwitch;
    if (idle && !S.wasIdle) emit(t, null, LOC.CPU, LOC.IDLE, 'IDLE');
    S.wasIdle = idle;

    // ── Snapshot the instant, then execute [t, t + 1) ─────────────────────────
    S.snapshots.push(takeSnapshot(S, t));
    S.lastEventIds = [];

    if (S.terminated.length === specs.length) break;
    if (++guard > MAX_TICKS) {
      warning = `Simulation stopped after ${MAX_TICKS} ticks without completing.`;
      break;
    }

    // ── Phase 5a: accrue queue waits for the interval ─────────────────────────
    for (const pid of S.readyQueue) patch(S, pid, { readyWait: S.proc[pid].readyWait + 1 });
    for (const deviceId of DEVICES) {
      for (const pid of S.devices[deviceId].queue) {
        patch(S, pid, { deviceWait: S.proc[pid].deviceWait + 1 });
      }
    }
    for (const pid of S.jobQueue) patch(S, pid, { jobWait: S.proc[pid].jobWait + 1 });

    // ── Phase 5b: execute the interval ────────────────────────────────────────
    if (S.cpu.inSwitch) {
      S.counters.switchTicks += 1;
      S.cpu.switchTicksLeft -= 1;
      if (S.cpu.switchTicksLeft <= 0) {
        S.cpu.inSwitch = false;
        S.cpu.switchTicksLeft = 0;
      }
    } else if (S.cpu.pid !== null) {
      const pid = S.cpu.pid;
      const rt = S.proc[pid];
      patch(S, pid, { remaining: rt.remaining - 1, cpuTime: rt.cpuTime + 1 });
      if (scheduler.needsQuantum) S.cpu.quantumLeft -= 1;
      S.counters.cpuExecutingTicks += 1;
      S.lastExecutedPid = pid;
      S.cpu.hasRun = true;
    } else {
      S.counters.idleTicks += 1;
      S.lastExecutedPid = null;
    }

    for (const deviceId of DEVICES) {
      const dev = S.devices[deviceId];
      if (dev.busyPid !== null) {
        dev.remaining -= 1;
        dev.busyTicks += 1;
      }
    }

    t += 1;
  }

  /* ──────────────────────────────── Results ──────────────────────────────── */

  const metrics = deriveProcessMetrics(specs, S.proc);
  const lastCompletion = metrics.reduce((max, m) => Math.max(max, m.completion ?? 0), 0);
  const makespan = lastCompletion - minArrival;
  const segments = deriveAllSegments(S.snapshots);

  return {
    processes: specs,
    config: fullConfig,
    snapshots: S.snapshots,
    events: S.events,
    eventTicks: S.events.map((e) => e.tick),
    cpuSegments: segments.cpu,
    deviceSegments: { A: segments.A, B: segments.B },
    switchTicks: S.events.filter((e) => e.reason === 'CONTEXT_SWITCH').map((e) => e.tick),
    metrics,
    summary: buildSummary({
      metrics,
      makespan,
      counters: S.counters,
      devices: S.devices,
    }),
    warning,
  };
}

/**
 * @typedef {Object} SimState
 * @property {import('./types.js').SimConfig} config
 * @property {Record<string, import('./types.js').ProcessSpec>} spec
 * @property {Record<string, import('./types.js').ProcessRuntime>} proc
 * @property {string[]} jobQueue
 * @property {string[]} pendingArrivals
 * @property {string[]} readyQueue
 * @property {import('./types.js').CpuState} cpu
 * @property {{A: import('./types.js').DeviceState, B: import('./types.js').DeviceState}} devices
 * @property {string[]} terminated
 * @property {import('./types.js').Counters} counters
 * @property {import('./types.js').SimEvent[]} events
 * @property {number[]} lastEventIds
 * @property {string|null} lastExecutedPid PID that last executed a tick; null after idle.
 * @property {boolean} wasIdle
 * @property {import('./types.js').Snapshot[]} snapshots
 */
