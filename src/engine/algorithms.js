/**
 * The six scheduling algorithms (spec §3).
 *
 * Every scheduler exposes the same tiny interface, so the simulation loop never
 * branches on which algorithm is active:
 *
 *   select(ctx)        → which ready process should be dispatched, or null
 *   shouldPreempt(ctx) → should the running process be evicted right now?
 *
 * Dispatch and preemption are separate questions on purpose. FCFS and SJF
 * answer "no" to preemption unconditionally; SRTF and Priority-P compare a
 * contender against the running process; Round Robin defers entirely to the
 * quantum, which the engine tracks.
 *
 * Spec §3 fixes the tie-break and the strictness of preemption, and both matter:
 * "Tie-breaking: earlier Ready Queue entry time, then lexical process ID.
 * Priority 1 = highest. A tie does not trigger preemption."
 */

import { ALGORITHM_BY_ID } from './constants.js';

/**
 * Lexical process-ID comparison, exactly as the spec specifies.
 *
 * Note the consequence: `P10` sorts *before* `P2`. The generator zero-pads IDs
 * once a workload exceeds nine processes so the default workloads never hit it,
 * and the README documents the rule.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Spec tie-break: earlier Ready Queue entry time first, then lexical ID.
 *
 * @param {string} a
 * @param {string} b
 * @param {SchedulerContext} ctx
 * @returns {number}
 */
export function byTie(a, b, ctx) {
  const ea = ctx.proc[a].readyEntryTick ?? 0;
  const eb = ctx.proc[b].readyEntryTick ?? 0;
  return ea - eb || compareIds(a, b);
}

/**
 * The process's *next* CPU burst — the full duration of the CPU burst that
 * would begin if it were dispatched now (SJF-NP's criterion, spec §3).
 *
 * @param {string} pid
 * @param {SchedulerContext} ctx
 * @returns {number} Infinity when the process has no CPU work left.
 */
export function nextCpuBurst(pid, ctx) {
  const burst = ctx.spec[pid].bursts[ctx.proc[pid].burstIndex];
  return burst && burst.kind === 'CPU' ? burst.duration : Infinity;
}

/**
 * Pick the best ready process by `keyOf`, breaking ties per the spec.
 *
 * @param {SchedulerContext} ctx
 * @param {(pid: string, ctx: SchedulerContext) => number} keyOf
 * @returns {string|null}
 */
function pickBest(ctx, keyOf) {
  let best = null;
  let bestKey = Infinity;
  for (const pid of ctx.readyQueue) {
    const key = keyOf(pid, ctx);
    if (best === null || key < bestKey || (key === bestKey && byTie(pid, best, ctx) < 0)) {
      best = pid;
      bestKey = key;
    }
  }
  return best;
}

/** SRTF/Priority-P preempt only on a *strictly* better contender (spec §3). */
function strictPreemption(ctx, keyOf) {
  if (!ctx.running || ctx.readyQueue.length === 0) return false;
  const best = pickBest(ctx, keyOf);
  if (best === null) return false;
  return keyOf(best, ctx) < keyOf(ctx.running.pid, ctx);
}

/* ─────────────────────────────── The six ─────────────────────────────── */

/** FCFS — oldest entry in the Ready Queue; never preempts. */
export const fcfs = {
  id: 'FCFS',
  isPreemptive: false,
  needsQuantum: false,
  select: (ctx) => ctx.readyQueue[0] ?? null,
  shouldPreempt: () => false,
};

/** SJF (non-preemptive) — shortest *next CPU burst* among ready processes. */
export const sjf = {
  id: 'SJF_NP',
  isPreemptive: false,
  needsQuantum: false,
  select: (ctx) => pickBest(ctx, nextCpuBurst),
  shouldPreempt: () => false,
};

/** SRTF — smallest *remaining* current CPU burst; preempts on a strictly shorter contender. */
export const srtf = {
  id: 'SRTF',
  isPreemptive: true,
  needsQuantum: false,
  select: (ctx) => pickBest(ctx, (pid, c) => c.proc[pid].remaining),
  shouldPreempt: (ctx) => strictPreemption(ctx, (pid, c) => c.proc[pid].remaining),
};

/** Priority (non-preemptive) — lowest priority number among ready processes. */
export const priorityNP = {
  id: 'PRIO_NP',
  isPreemptive: false,
  needsQuantum: false,
  select: (ctx) => pickBest(ctx, (pid, c) => c.proc[pid].priority),
  shouldPreempt: () => false,
};

/** Priority (preemptive) — preempts on a strictly higher priority. */
export const priorityP = {
  id: 'PRIO_P',
  isPreemptive: true,
  needsQuantum: false,
  select: (ctx) => pickBest(ctx, (pid, c) => c.proc[pid].priority),
  shouldPreempt: (ctx) => strictPreemption(ctx, (pid, c) => c.proc[pid].priority),
};

/**
 * Round Robin — FIFO ready queue with a fixed quantum.
 *
 * Preemption happens at quantum expiry, and only if somebody is actually
 * waiting. If the Ready Queue is empty when the quantum runs out, the running
 * process simply receives a fresh quantum: evicting it to re-dispatch the same
 * process would log a meaningless preemption and switch.
 */
export const roundRobin = {
  id: 'RR',
  isPreemptive: true,
  needsQuantum: true,
  select: (ctx) => ctx.readyQueue[0] ?? null,
  shouldPreempt: (ctx) =>
    Boolean(ctx.running) && ctx.running.quantumLeft <= 0 && ctx.readyQueue.length > 0,
};

/** Registry keyed by the algorithm IDs in `constants.js`. */
export const SCHEDULERS = {
  FCFS: fcfs,
  SJF_NP: sjf,
  SRTF: srtf,
  PRIO_NP: priorityNP,
  PRIO_P: priorityP,
  RR: roundRobin,
};

/**
 * @param {string} id
 * @returns {typeof fcfs}
 */
export function getScheduler(id) {
  const scheduler = SCHEDULERS[id];
  if (!scheduler) throw new Error(`Unknown scheduling algorithm: ${id}`);
  return scheduler;
}

/** Human-readable label for an algorithm ID. */
export function algorithmLabel(id) {
  return ALGORITHM_BY_ID[id]?.label ?? id;
}

/**
 * @typedef {Object} SchedulerContext
 * @property {number} tick Current logical clock value.
 * @property {string[]} readyQueue Dispatch order; index 0 is the head of line.
 * @property {{pid: string, quantumLeft: number}|null} running
 * @property {Record<string, import('./types.js').ProcessRuntime>} proc
 * @property {Record<string, import('./types.js').ProcessSpec>} spec
 * @property {import('./types.js').SimConfig} config
 */
