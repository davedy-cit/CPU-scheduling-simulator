/**
 * Compare All — one frozen workload, six runs (spec §4, §8).
 *
 * Spec §4 fixes the workload for a fair comparison, so every run here is built
 * from its own deep copy of the same process list. `simulate` does not mutate
 * its input, but copying anyway means a future change to that cannot quietly
 * turn the six runs into six *different* workloads — which would be invisible in
 * the output, since all six would still produce plausible numbers.
 *
 * The comparison reports two different things and they are easy to conflate:
 *
 *   - **`best`** is quality, per metric, in the direction each metric is
 *     actually better in. Fewer preemptions is better; more throughput is
 *     better. This drives the highlighting.
 *   - **`extremeOf`** answers the spec §10 questions, which are not all about
 *     quality — "which algorithm does the most preemptions" wants the maximum,
 *     and calling that the "best" would be a category error.
 *
 * Ties return every algorithm that achieved the value rather than the first one
 * found. That is not pedantry: Priority-NP and Priority-P tie exactly on the
 * preset that has no late high-priority arrival, and reporting a single winner
 * there would be a fabricated result.
 */

import { ALGORITHMS } from './constants.js';
import { simulate } from './simulate.js';
import { cloneWorkload } from './workload.js';

/**
 * @typedef {import('./types.js').ProcessSpec} ProcessSpec
 * @typedef {import('./types.js').SimConfig} SimConfig
 * @typedef {import('./types.js').Timeline} Timeline
 * @typedef {import('./types.js').Summary} Summary
 */

/**
 * @typedef {Object} CompareMetric
 * @property {string} key Field of `Summary`.
 * @property {string} label Column heading.
 * @property {'lower'|'higher'} better Which direction is an improvement.
 * @property {'time'|'percent'|'rate'|'count'} unit How the value should be printed.
 * @property {string} help One line explaining what the metric means.
 */

/** @type {CompareMetric[]} */
export const COMPARE_METRICS = [
  {
    key: 'makespan',
    label: 'Makespan',
    better: 'lower',
    unit: 'time',
    help: 'Last completion − first arrival. Every rate below divides by it.',
  },
  {
    key: 'avgTurnaround',
    label: 'Avg turnaround',
    better: 'lower',
    unit: 'time',
    help: 'Mean of (completion − arrival).',
  },
  {
    key: 'avgResponse',
    label: 'Avg response',
    better: 'lower',
    unit: 'time',
    help: 'Mean of (first CPU start − arrival).',
  },
  {
    key: 'avgReadyWait',
    label: 'Avg ready wait',
    better: 'lower',
    unit: 'time',
    help: 'Mean ticks in the Ready Queue only — excludes Job Queue and device queues.',
  },
  {
    key: 'throughput',
    label: 'Throughput',
    better: 'higher',
    unit: 'rate',
    help: 'Completed processes per unit of simulated time.',
  },
  {
    key: 'cpuUtilization',
    label: 'CPU util.',
    better: 'higher',
    unit: 'percent',
    help: 'Executing ticks ÷ makespan × 100. Excludes context-switch ticks.',
  },
  {
    key: 'contextSwitches',
    label: 'Switches',
    better: 'lower',
    unit: 'count',
    help: 'Changes between two different running PIDs. The first dispatch is not a switch.',
  },
  {
    key: 'preemptions',
    label: 'Preemptions',
    better: 'lower',
    unit: 'count',
    help: 'Running processes interrupted before their CPU burst completed.',
  },
];

/**
 * @typedef {Object} CompareRun
 * @property {string} algorithm
 * @property {string} label
 * @property {string} short
 * @property {boolean} preemptive
 * @property {boolean} needsQuantum
 * @property {Summary} summary
 * @property {Timeline} timeline
 */

/**
 * @typedef {Object} Extreme
 * @property {number|null} value
 * @property {string[]} algorithms Every algorithm achieving `value`.
 */

/**
 * @typedef {Object} CompareResult
 * @property {CompareRun[]} runs One per algorithm, in the order spec §3 lists them.
 * @property {Record<string, Extreme>} best Best value per metric, in that metric's better direction.
 * @property {number} switchOverhead The overhead every run used, so the panel can say so.
 */

/**
 * Run all six algorithms over one frozen workload.
 *
 * @param {ProcessSpec[]} processes
 * @param {Partial<SimConfig>} [config] The algorithm field is ignored and replaced per run.
 * @returns {CompareResult}
 */
export function compareAll(processes, config = {}) {
  const workload = cloneWorkload(processes);

  const runs = ALGORITHMS.map((algorithm) => {
    const timeline = simulate(cloneWorkload(workload), { ...config, algorithm: algorithm.id });
    return {
      algorithm: algorithm.id,
      label: algorithm.label,
      short: algorithm.short,
      preemptive: algorithm.preemptive,
      needsQuantum: algorithm.needsQuantum,
      summary: timeline.summary,
      timeline,
    };
  });

  return {
    runs,
    best: Object.fromEntries(
      COMPARE_METRICS.map((metric) => [
        metric.key,
        extremeOf(runs, metric.key, metric.better === 'higher' ? 'max' : 'min'),
      ]),
    ),
    switchOverhead: runs[0]?.timeline.config.switchOverhead ?? 0,
  };
}

/**
 * The algorithms achieving the minimum or maximum of a summary field.
 *
 * @param {CompareRun[]} runs
 * @param {string} key Field of `Summary`.
 * @param {'min'|'max'} direction
 * @returns {Extreme}
 */
export function extremeOf(runs, key, direction) {
  const values = valuesOf(runs, key);

  if (values.length === 0) return { value: null, algorithms: [] };

  const value =
    direction === 'max'
      ? Math.max(...values.map((entry) => entry.value))
      : Math.min(...values.map((entry) => entry.value));

  return {
    value,
    // A tolerance rather than equality: the summary divides, so two runs that
    // are equal in exact arithmetic can differ in the last bit.
    algorithms: values
      .filter((entry) => Math.abs(entry.value - value) < 1e-9)
      .map((entry) => entry.algorithm),
  };
}

/**
 * How many metrics each algorithm is best at, for the "wins" column.
 *
 * Metrics that tie count for every tied algorithm. An algorithm that is never
 * best still appears, with zero — omitting it would make the column look like a
 * ranking of all six when it is not.
 *
 * @param {CompareResult} result
 * @returns {Record<string, number>}
 */
export function winCounts(result) {
  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(result.runs.map((run) => [run.algorithm, 0]));

  for (const metric of COMPARE_METRICS) {
    for (const algorithm of result.best[metric.key].algorithms) counts[algorithm] += 1;
  }

  return counts;
}

/**
 * A metric's value for every run, ready to be ranked or printed.
 *
 * Exported because the Compare panel asks a handful of specific questions from
 * spec §10 ("which minimises ready waiting", "which preempts the most") that are
 * not all about quality, and each one is just this function with a different
 * field and direction. Keeping the questions in the panel keeps this module free
 * of prose.
 *
 * @param {CompareRun[]} runs
 * @param {string} key
 * @returns {Array<{algorithm: string, value: number}>}
 */
export function valuesOf(runs, key) {
  return runs
    .map((run) => ({ algorithm: run.algorithm, value: run.summary[key] }))
    .filter((entry) => typeof entry.value === 'number' && Number.isFinite(entry.value));
}
