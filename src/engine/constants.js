/**
 * Engine-wide constants and defaults.
 *
 * Every scheduling rule that the assignment brief pins down lives here so that
 * the documented behaviour and the implementation cannot drift apart.
 */

/**
 * The six scheduling algorithms (spec §3), in the order the brief lists them.
 *
 * `preemptive` is descriptive only — the authoritative behaviour lives in each
 * scheduler's `decide()`. `needsQuantum` drives whether the quantum input is
 * enabled in the control bar.
 */
export const ALGORITHMS = [
  {
    id: 'FCFS',
    label: 'First Come First Served (FCFS)',
    short: 'FCFS',
    preemptive: false,
    needsQuantum: false,
  },
  {
    id: 'SJF_NP',
    label: 'Shortest Job First — Non-Preemptive (SJF)',
    short: 'SJF',
    preemptive: false,
    needsQuantum: false,
  },
  {
    id: 'SRTF',
    label: 'Shortest Remaining Time First (SRTF)',
    short: 'SRTF',
    preemptive: true,
    needsQuantum: false,
  },
  {
    id: 'PRIO_NP',
    label: 'Priority — Non-Preemptive',
    short: 'Prio NP',
    preemptive: false,
    needsQuantum: false,
  },
  {
    id: 'PRIO_P',
    label: 'Priority — Preemptive',
    short: 'Prio P',
    preemptive: true,
    needsQuantum: false,
  },
  {
    id: 'RR',
    label: 'Round Robin (RR)',
    short: 'RR',
    preemptive: true,
    needsQuantum: true,
  },
];

export const ALGORITHM_IDS = ALGORITHMS.map((a) => a.id);

/** @type {Record<string, typeof ALGORITHMS[number]>} */
export const ALGORITHM_BY_ID = Object.fromEntries(ALGORITHMS.map((a) => [a.id, a]));

/** Round Robin quantum default (spec §8: "quantum default 75 (editable)"). */
export const DEFAULT_QUANTUM = 75;
export const MIN_QUANTUM = 1;

/** Priority convention (spec §3): 1 = highest, 5 = lowest. */
export const PRIORITY_MIN = 1;
export const PRIORITY_MAX = 5;

/** Burst duration bounds (spec §4): each burst is 50–200 simulated time units. */
export const BURST_MIN = 50;
export const BURST_MAX = 200;

/** Allowed burst counts (spec §4): a process has 1, 3 or 5 alternating bursts. */
export const ALLOWED_BURST_COUNTS = [1, 3, 5];

/** Default display unit (spec §4: "default unit: ms"). */
export const DEFAULT_UNIT_LABEL = 'ms';

/**
 * Runaway guard. A malformed workload must never hang the tab, so the tick
 * loop aborts and surfaces a warning rather than spinning forever.
 */
export const MAX_TICKS = 100000;

/**
 * Playback speeds and how many simulated ticks each maps to per real second.
 * Playback speed is independent of simulated time (spec §8).
 */
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
export const TICKS_PER_SECOND = { 0.25: 2, 0.5: 4, 1: 8, 2: 16, 4: 32, 8: 64 };

/** Default simulation configuration. */
export const DEFAULT_CONFIG = {
  algorithm: 'FCFS',
  quantum: DEFAULT_QUANTUM,
  /** null = unlimited admission (spec §5). */
  admissionLimit: null,
  /** 0 = zero-cost context switch (spec §7 default). */
  switchOverhead: 0,
  unitLabel: DEFAULT_UNIT_LABEL,
};
