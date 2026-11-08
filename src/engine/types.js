/**
 * Shape definitions for the simulation engine.
 *
 * Documentation only — this module exports no runtime code. Keeping every shape
 * in one place means the engine, the selectors, the React layer and the tests
 * all agree on what a snapshot contains.
 *
 * The engine is plain JSX-compatible JavaScript with JSDoc types rather than
 * TypeScript, so there is no tsconfig or build step to maintain.
 */

/* ─────────────────────────────── Input model ─────────────────────────────── */

/**
 * A burst is either CPU work or I/O work on a named device. The assignment
 * writes workloads as `CPU 180 A 100 CPU 120 B 80`, so the device letter is
 * the burst kind for I/O bursts — there is no separate `device` field to keep
 * in sync.
 *
 * @typedef {'CPU' | 'A' | 'B'} BurstKind
 */

/**
 * @typedef {Object} Burst
 * @property {BurstKind} kind
 * @property {number} duration Simulated time units; 50–200 in the assignment's default workload.
 */

/**
 * A process definition — the immutable input to a simulation run.
 *
 * Spec §4: "A process may have 1, 3, or 5 alternating bursts and MUST begin and
 * end with CPU." `bursts[0].kind === 'CPU'` and `bursts.at(-1).kind === 'CPU'`,
 * with I/O and CPU strictly alternating in between.
 *
 * @typedef {Object} ProcessSpec
 * @property {string} id Process ID, e.g. 'P1'. Tie-breaking compares these lexically.
 * @property {number} arrival Tick at which the process is created in the Job Queue.
 * @property {number} priority 1–5, where 1 is the highest priority.
 * @property {Burst[]} bursts Alternating CPU/IO bursts.
 * @property {number} [colorIndex] 1–8, indexes the per-process colour palette.
 */

/**
 * Run configuration — everything that can change between two runs over the
 * same workload.
 *
 * @typedef {Object} SimConfig
 * @property {'FCFS'|'SJF_NP'|'SRTF'|'PRIO_NP'|'PRIO_P'|'RR'} algorithm
 * @property {number} quantum Round Robin time quantum. Ignored by the other five.
 * @property {number|null} admissionLimit Max processes admitted but not yet terminated; null = unlimited.
 * @property {number} switchOverhead Ticks consumed by a context switch; 0 = zero-cost (spec §7 default).
 * @property {string} unitLabel Display unit for simulated time, e.g. 'ms'.
 */

/* ────────────────────────────── Runtime model ────────────────────────────── */

/**
 * Process lifecycle states (spec §5).
 *
 * WAITING covers both queued and actively-serviced I/O; the device view
 * distinguishes the two.
 *
 * @typedef {'NEW' | 'READY' | 'RUNNING' | 'WAITING' | 'TERMINATED'} ProcState
 */

/**
 * A process's mutable runtime record.
 *
 * Copy-on-write: `simulate()` never mutates one of these in place. Unchanged
 * records keep their object identity across ticks, which is what lets
 * `React.memo` skip re-rendering chips that did not move.
 *
 * @typedef {Object} ProcessRuntime
 * @property {string} id
 * @property {number} priority Copied from the spec so scheduling never needs a spec lookup.
 * @property {boolean} arrived False until the arrival tick. A process does not exist before it arrives (spec §6).
 * @property {ProcState} state
 * @property {number} burstIndex Index into `spec.bursts`.
 * @property {number} remaining Time left in the current burst.
 * @property {number|null} readyEntryTick When it last entered the Ready Queue. Primary tie-break key.
 * @property {number|null} admittedTick When it left the Job Queue.
 * @property {number|null} firstCpuStartTick First dispatch. `response = firstCpuStartTick - arrival`.
 * @property {number|null} completionTick
 * @property {number} readyWait Running total of ticks spent in the Ready Queue.
 * @property {number} jobWait Running total of ticks awaiting admission.
 * @property {number} deviceWait Running total of ticks queued before I/O service (excludes service).
 * @property {number} cpuTime Running total of CPU service received.
 * @property {number} preemptions Times interrupted before its CPU burst completed.
 * @property {'A'|'B'|null} device Device it is waiting on, when `state === 'WAITING'`.
 * @property {number} ioRequests How many I/O bursts it has requested (denominator for average device wait).
 */

/**
 * One I/O device: a single FIFO server with its own wait queue, running
 * concurrently with the CPU and with the other device (spec §5).
 *
 * @typedef {Object} DeviceState
 * @property {'A'|'B'} id
 * @property {string|null} busyPid Process currently being serviced.
 * @property {number} remaining Time left in the in-service I/O burst.
 * @property {string[]} queue FIFO of PIDs waiting for this device.
 * @property {number} busyTicks Cumulative ticks the device spent servicing work.
 */

/**
 * The CPU: one logical processor (spec §5).
 *
 * @typedef {Object} CpuState
 * @property {string|null} pid Running process, or null when idle/switching.
 * @property {number} quantumLeft Round Robin only; Infinity for the other five.
 * @property {boolean} inSwitch True while a context switch is consuming ticks.
 * @property {number} switchTicksLeft Ticks remaining in the current context switch.
 * @property {number|null} admittedTick Admit time of the running process (for the CPU card).
 * @property {number|null} dispatchTick Dispatch time of the running process.
 * @property {boolean} hasRun False between dispatch and the process's first executed tick.
 */

/**
 * Cumulative run counters, used for the KPI tiles and the execution summary.
 *
 * @typedef {Object} Counters
 * @property {number} elapsed Ticks simulated so far.
 * @property {number} cpuExecutingTicks Ticks the CPU spent executing process work (excludes switches and idle).
 * @property {number} switchTicks Ticks lost to context-switch overhead.
 * @property {number} idleTicks Ticks with no eligible ready process.
 * @property {number} contextSwitches Changes between two different running PIDs (excludes the first dispatch).
 * @property {number} dispatches Total dispatch decisions.
 * @property {number} preemptions Total preemptions across all processes.
 */

/**
 * The complete simulation state during the interval `[tick, tick + 1)`.
 *
 * Every transition that occurs *at* `tick` has already been applied, so the
 * cursor index is exactly the clock value shown in the UI.
 *
 * @typedef {Object} Snapshot
 * @property {number} tick
 * @property {Record<string, ProcessRuntime>} proc Copy-on-write map, stable identities when unchanged.
 * @property {string[]} jobQueue Arrived but not yet admitted (state NEW), in FCFS order.
 * @property {string[]} pendingArrivals Not yet arrived, ordered by (arrival, lexical id).
 * @property {string[]} readyQueue Dispatch order; index 0 is the head of line.
 * @property {CpuState} cpu
 * @property {{A: DeviceState, B: DeviceState}} devices
 * @property {string[]} terminated PIDs in completion order.
 * @property {Counters} counters
 * @property {number[]} lastEventIds Indices into `Timeline.events` emitted at this tick.
 */

/* ──────────────────────────────── Timeline ──────────────────────────────── */

/**
 * Event reasons recorded in the trace (spec §5: timestamp, PID, previous
 * location/state, new location/state, reason, active algorithm).
 *
 * A CPU burst never simply "completes" as its own event — it always leads
 * either to an I/O request or to termination, so those are the recorded reasons.
 *
 * @typedef {'ARRIVE'|'ADMIT'|'DISPATCH'|'CONTEXT_SWITCH'|'PREEMPT'|'QUANTUM_EXPIRE'
 *          |'IO_REQUEST'|'IO_START'|'IO_COMPLETE'|'TERMINATE'|'IDLE'} EventReason
 */

/**
 * @typedef {Object} SimEvent
 * @property {number} id Stable index into `Timeline.events`.
 * @property {number} tick
 * @property {string|null} pid
 * @property {string} from Previous location or state, e.g. 'Ready Queue'.
 * @property {string} to New location or state, e.g. 'CPU'.
 * @property {EventReason} reason
 * @property {string} algorithm Algorithm active when the event occurred.
 * @property {'A'|'B'} [device] Present on device-related events.
 */

/**
 * A run-length-encoded slice of a resource timeline, used by the Gantt chart.
 *
 * @typedef {Object} GanttSegment
 * @property {number} start First tick of the segment (inclusive).
 * @property {number} end Tick after the last (exclusive).
 * @property {string|null} pid Process occupying the resource, or null.
 * @property {'RUN'|'IDLE'|'SWITCH'|'BUSY'} kind
 */

/**
 * Per-process results, the rows of the metrics table (spec §9).
 *
 * @typedef {Object} ProcessMetrics
 * @property {string} id
 * @property {number} arrival
 * @property {number} priority
 * @property {number|null} completion
 * @property {number|null} turnaround completion − arrival
 * @property {number|null} response first CPU start − arrival
 * @property {number} readyWait Total ticks in the Ready Queue only.
 * @property {number} jobWait Total ticks awaiting admission.
 * @property {number} deviceWait Total ticks queued before I/O service.
 * @property {number} cpuTime Total CPU service received.
 * @property {number} preemptions
 * @property {number} ioRequests
 */

/**
 * Aggregate results (spec §9).
 *
 * @typedef {Object} Summary
 * @property {number} makespan lastCompletion − minArrival
 * @property {number} completed
 * @property {number} total
 * @property {number|null} avgTurnaround
 * @property {number|null} avgResponse
 * @property {number|null} avgReadyWait
 * @property {number|null} avgJobWait
 * @property {number|null} avgDeviceWait
 * @property {number} throughput completed ÷ makespan
 * @property {number} cpuUtilization CPU executing ticks ÷ makespan × 100 (excludes switch ticks)
 * @property {number} deviceUtilizationA
 * @property {number} deviceUtilizationB
 * @property {number} contextSwitches
 * @property {number} dispatches
 * @property {number} preemptions
 * @property {number} cpuBusyTime
 * @property {number} idleTime
 * @property {number} switchTime
 */

/**
 * The fully precomputed result of one simulation run. Produced once by
 * `simulate()`; the UI only ever reads from it.
 *
 * @typedef {Object} Timeline
 * @property {ProcessSpec[]} processes Normalised specs, in (arrival, id) order.
 * @property {SimConfig} config
 * @property {Snapshot[]} snapshots One per tick; `snapshots[i]` covers `[i, i + 1)`.
 * @property {SimEvent[]} events Full trace, in emission order.
 * @property {number[]} eventTicks Tick of each event, parallel to `events`.
 * @property {GanttSegment[]} cpuSegments
 * @property {{A: GanttSegment[], B: GanttSegment[]}} deviceSegments
 * @property {number[]} switchTicks Ticks at which a context switch occurred (zero-cost markers).
 * @property {ProcessMetrics[]} metrics
 * @property {Summary} summary
 * @property {string|null} warning Set when the runaway guard tripped or the workload was invalid.
 */

export {};
