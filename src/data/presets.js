/**
 * Textbook validation presets.
 *
 * These are the small, hand-computable workloads from the standard OS
 * literature. They exist so the engine can be checked against answers that were
 * derived on paper, independently of the implementation — which is the whole
 * point. A preset whose numbers the engine merely agrees with proves nothing.
 *
 * Every expected value below was computed by hand from the spec's own rules
 * (tie-break = earlier Ready entry, then lexical ID; strict preemption only) and
 * is asserted in `engine/__tests__/`. If a change to the scheduler makes one of
 * these fail, the scheduler is wrong, not the preset.
 *
 * Bursts here are deliberately shorter than the assignment's 50–200 range:
 * `validateWorkload` only enforces that range for the §4 workload
 * (`enforceDurationBounds: true`), precisely so these sets stay usable.
 */

/**
 * @typedef {import('../engine/types.js').ProcessSpec} ProcessSpec
 */

/** Shorthand: a single-CPU-burst process. */
const cpuOnly = (id, arrival, priority, duration) => ({
  id,
  arrival,
  priority,
  bursts: [{ kind: 'CPU', duration }],
});

/* ─────────────────────────────── FCFS / SJF ─────────────────────────────── */

/**
 * The standard FCFS-vs-SJF comparison set.
 *
 * | PID | Burst | Arrival |
 * |-----|-------|---------|
 * | P1  | 6     | 2       |
 * | P2  | 2     | 5       |
 * | P3  | 8     | 1       |
 * | P4  | 3     | 0       |
 * | P5  | 4     | 4       |
 *
 * FCFS dispatch order is arrival order — P4, P3, P1, P5, P2:
 *
 *   P4 [0,3)  P3 [3,11)  P1 [11,17)  P5 [17,21)  P2 [21,23)
 *
 *   waiting    = 0, 2, 9, 13, 16  → Σ 40 → avg 8
 *   turnaround = 3, 10, 15, 17, 18 → Σ 63 → avg 12.6
 *
 * SJF (non-preemptive) picks the shortest *next burst* at each decision point.
 * At t=9 the ready set is P3(8), P5(4), P2(2) — P2 and P5 arrived at t=5 and t=4
 * and have been waiting since, so they are candidates, not future arrivals:
 *
 *   P4 [0,3)  P1 [3,9)  P2 [9,11)  P5 [11,15)  P3 [15,23)
 *
 *   waiting    = 0, 1, 4, 7, 14 → Σ 26 → avg 5.2
 *   turnaround = 3, 7, 6, 11, 22 → Σ 49 → avg 9.8
 *
 * The improvement in average waiting (8 → 5.2) is the textbook result.
 */
export const FCFS_SJF_SET = [
  cpuOnly('P1', 2, 1, 6),
  cpuOnly('P2', 5, 1, 2),
  cpuOnly('P3', 1, 1, 8),
  cpuOnly('P4', 0, 1, 3),
  cpuOnly('P5', 4, 1, 4),
];

export const FCFS_SJF_EXPECTED = {
  FCFS: {
    completion: { P1: 17, P2: 23, P3: 11, P4: 3, P5: 21 },
    avgWaiting: 8,
    avgTurnaround: 12.6,
    makespan: 23,
  },
  SJF_NP: {
    completion: { P1: 9, P2: 11, P3: 23, P4: 3, P5: 15 },
    avgWaiting: 5.2,
    avgTurnaround: 9.8,
    makespan: 23,
  },
};

/* ───────────────────────────────── SRTF ────────────────────────────────── */

/**
 * The standard SRTF set (P1/P2/P3/P4 with arrivals 0/1/2/3).
 *
 *   t=0  P1 dispatched (rem 8)
 *   t=1  P2 arrives (4) — 4 < 7 remaining → preempt, run P2
 *   t=2  P3 arrives (9) — 9 > 3 remaining → P2 keeps the CPU
 *   t=3  P4 arrives (5) — 5 > 2 remaining → P2 keeps the CPU
 *   t=5  P2 completes. Ready: P1(7), P3(9), P4(5) → P4 shortest, run P4
 *   t=10 P4 completes. Ready: P1(7), P3(9) → run P1
 *   t=17 P1 completes, then P3 [17,26)
 *
 *   completion = P2 5, P4 10, P1 17, P3 26
 *   turnaround = 4, 7, 24, 17 (P1,P2,P3,P4) → Σ 52 → avg 13
 *   waiting    = 9, 0, 15, 2                → Σ 26 → avg 6.5
 *   response   = 0, 0, 15, 2                → Σ 17 → avg 4.25
 *
 * Response is measured to the *first* dispatch only. P1 and P2 are dispatched
 * the instant they arrive (0 and 0); P3 must wait for everything shorter to
 * clear, and P4 for P2 to finish. P1's later re-dispatch at t=10 does not
 * produce a second response time — this is the distinction the spec draws when
 * it says response is "first CPU start − arrival".
 */
export const SRTF_SET = [
  cpuOnly('P1', 0, 1, 8),
  cpuOnly('P2', 1, 1, 4),
  cpuOnly('P3', 2, 1, 9),
  cpuOnly('P4', 3, 1, 5),
];

export const SRTF_EXPECTED = {
  completion: { P1: 17, P2: 5, P3: 26, P4: 10 },
  avgTurnaround: 13,
  avgWaiting: 6.5,
  avgResponse: 4.25,
  makespan: 26,
};

/* ─────────────────────────────── Round Robin ───────────────────────────── */

/**
 * The Round Robin preemption set: bursts 24, 3, 3 with quantum 4, all arriving
 * at t=0 (so the initial Ready Queue order is lexical: P1, P2, P3).
 *
 *   P1 [0,4)   quantum expires, P2 and P3 waiting → P1 to the tail
 *   P2 [4,7)   completes (3 < 4) → P3
 *   P3 [7,10)  completes → P1
 *   P1 [10,30) completes; quantum expiries at 14/18/22/26 re-grant in place
 *              because the Ready Queue is empty
 *
 *   completion = P1 30, P2 7, P3 10
 *   turnaround = 30, 7, 10 → Σ 47 → avg 47/3 ≈ 15.67
 *   waiting    = 6, 4, 7  → Σ 17 → avg 17/3 ≈ 5.67
 *
 * Three context switches are counted: P1→P2 at t=4, P2→P3 at t=7 and P3→P1 at
 * t=10 — each is a change between two different running PIDs. P1's four later
 * quantum expiries at t=14/18/22/26 are **not** switches: the Ready Queue is
 * empty, so the quantum is re-granted to the process already running rather than
 * it being evicted and a different one dispatched. See the README.
 */
export const RR_SET = [
  cpuOnly('P1', 0, 1, 24),
  cpuOnly('P2', 0, 1, 3),
  cpuOnly('P3', 0, 1, 3),
];

export const RR_EXPECTED = {
  quantum: 4,
  completion: { P1: 30, P2: 7, P3: 10 },
  avgWaiting: 17 / 3,
  avgTurnaround: 47 / 3,
  contextSwitches: 3,
};

/* ──────────────────────────────── Priority ─────────────────────────────── */

/**
 * Priority set (1 = highest), all arriving at t=0.
 *
 * | PID | Burst | Priority |
 * |-----|-------|----------|
 * | P1  | 10    | 3        |
 * | P2  | 1     | 1        |
 * | P3  | 2     | 4        |
 * | P4  | 1     | 5        |
 * | P5  | 5     | 2        |
 *
 * Non-preemptive runs the single highest-priority ready process to completion:
 *
 *   P2 [0,1)  P5 [1,6)  P1 [6,16)  P3 [16,18)  P4 [18,19)
 *
 * All five arrive at t=0, so every wait is simply its dispatch time:
 *
 *   waiting    = 1, 0, 16, 18, 6 (P1..P5) → Σ 41 → avg 8.2
 *   turnaround = 16, 1, 18, 19, 6         → Σ 60 → avg 12
 *
 * Preemptive is identical here — no higher-priority process ever arrives after
 * a lower-priority one has started, so the two variants agree. That equality is
 * itself worth pinning: it shows preemption is *strictly* better-only and does
 * not fire on ties or on equal priority.
 */
export const PRIORITY_SET = [
  { id: 'P1', arrival: 0, priority: 3, bursts: [{ kind: 'CPU', duration: 10 }] },
  { id: 'P2', arrival: 0, priority: 1, bursts: [{ kind: 'CPU', duration: 1 }] },
  { id: 'P3', arrival: 0, priority: 4, bursts: [{ kind: 'CPU', duration: 2 }] },
  { id: 'P4', arrival: 0, priority: 5, bursts: [{ kind: 'CPU', duration: 1 }] },
  { id: 'P5', arrival: 0, priority: 2, bursts: [{ kind: 'CPU', duration: 5 }] },
];

export const PRIORITY_EXPECTED = {
  completion: { P1: 16, P2: 1, P3: 18, P4: 19, P5: 6 },
  avgWaiting: 8.2,
  avgTurnaround: 12,
  makespan: 19,
};

/**
 * Priority set with a late high-priority arrival, which is the case where the
 * two variants diverge.
 *
 * P1 has priority 5 (lowest) and a burst of **6**, so that P2's arrival at t=4
 * lands strictly inside P1's execution. A burst of exactly 4 would complete at
 * t=4 — the same instant P2 arrives — and no preemption would ever be tested.
 *
 *   t=0..4  P1 runs (priority 5)
 *   t=4     P2 arrives with priority 1
 *           non-preemptive → P1 keeps the CPU until its burst ends
 *           preemptive     → 1 < 5, strictly higher, so P1 is evicted
 *
 * Non-preemptive: P1 [0,6), P2 [6,7)
 *   completion P1 6, P2 7; waiting P1 0, P2 2 → avg 1; preemptions 0
 * Preemptive:     P1 [0,4), P2 [4,5), P1 [5,7)
 *   completion P1 7, P2 5; waiting P1 1, P2 0 → avg 0.5; preemptions 1
 *
 * P1 resumes at t=5 with 2 units left (6 − 4 already served), so it finishes at
 * t=7. Note the preemptive variant is *better* on both averages here, which is
 * the opposite of the usual "preemption costs you" intuition — with no switch
 * overhead, evicting the long low-priority job is free.
 */
export const PRIORITY_PREEMPT_SET = [
  { id: 'P1', arrival: 0, priority: 5, bursts: [{ kind: 'CPU', duration: 6 }] },
  { id: 'P2', arrival: 4, priority: 1, bursts: [{ kind: 'CPU', duration: 1 }] },
];

export const PRIORITY_PREEMPT_EXPECTED = {
  PRIO_NP: { completion: { P1: 6, P2: 7 }, avgWaiting: 1, preemptions: 0 },
  PRIO_P: { completion: { P1: 7, P2: 5 }, avgWaiting: 0.5, preemptions: 1 },
};

/* ───────────────────────────── I/O and devices ─────────────────────────── */

/**
 * Two processes contending for Device A, used to check FIFO device queueing.
 *
 * P1: CPU 2 → A 5 → CPU 2      P2: CPU 1 → A 3 → CPU 1
 *
 *   t=0  P1 dispatched (arrival order), runs [0,1)
 *   t=1  P2 arrives and waits; FCFS does not preempt, so P1 runs [1,2)
 *   t=2  P1's CPU burst ends. It requests A — free, so service starts at once,
 *        A busy [2,7). The CPU is now free, so P2 is dispatched, running [2,3)
 *   t=3  P2's CPU burst ends. It requests A — busy until t=7 — so P2 joins the
 *        device queue. Nothing is ready: the CPU idles [3,7)
 *   t=7  P1's I/O completes → P1 to Ready, and A immediately promotes P2 (FIFO),
 *        A busy [7,10). P1 runs [7,9) and terminates
 *   t=9  Nothing ready: the CPU idles [9,10)
 *   t=10 P2's I/O completes → Ready; P2 runs [10,11) and terminates
 *
 * Device A busy time = 8 (2–7 plus 7–10). P2's device wait = 4 (ticks 3–7),
 * counted only while it sits in the device *queue* — the 3 ticks it is actually
 * being serviced are not waiting.
 *
 * This set also pins the context-switch predicate. P1→P2 at t=2 is a switch;
 * the re-dispatches at t=7 and t=10 follow an idle gap and are therefore
 * *dispatches*, not switches. The run has exactly one context switch.
 */
export const IO_SET = [
  {
    id: 'P1',
    arrival: 0,
    priority: 1,
    bursts: [
      { kind: 'CPU', duration: 2 },
      { kind: 'A', duration: 5 },
      { kind: 'CPU', duration: 2 },
    ],
  },
  {
    id: 'P2',
    arrival: 1,
    priority: 1,
    bursts: [
      { kind: 'CPU', duration: 1 },
      { kind: 'A', duration: 3 },
      { kind: 'CPU', duration: 1 },
    ],
  },
];

export const IO_EXPECTED = {
  completion: { P1: 9, P2: 11 },
  deviceAWait: { P1: 0, P2: 4 },
  deviceABusyTicks: 8,
  contextSwitches: 1,
  makespan: 11,
};

/* ──────────────────────────────── Registry ─────────────────────────────── */

/** All presets, for the preset picker in the workload editor. */
export const PRESETS = [
  {
    id: 'sample',
    label: 'Assignment workload (§4)',
    description: 'The five-process, multi-burst workload from the brief.',
    source: 'sampleWorkload',
  },
  {
    id: 'fcfs-sjf',
    label: 'FCFS vs SJF',
    description: 'Five CPU-only processes; the classic average-waiting comparison.',
    processes: FCFS_SJF_SET,
  },
  {
    id: 'srtf',
    label: 'SRTF',
    description: 'Four processes, staggered arrivals — preemption on a shorter job.',
    processes: SRTF_SET,
  },
  {
    id: 'rr',
    label: 'Round Robin (q=4)',
    description: 'Bursts 24/3/3 — one long job preempted by two short ones.',
    processes: RR_SET,
    quantum: 4,
  },
  {
    id: 'priority',
    label: 'Priority',
    description: 'Five processes, priorities 1–5, all arriving together.',
    processes: PRIORITY_SET,
  },
  {
    id: 'priority-preempt',
    label: 'Priority preemption',
    description: 'A high-priority process arrives while a low-priority one runs.',
    processes: PRIORITY_PREEMPT_SET,
  },
  {
    id: 'io',
    label: 'Device A contention',
    description: 'Two processes queueing for the same I/O device.',
    processes: IO_SET,
  },
];
