/**
 * Compare All (spec §8).
 *
 * Six runs over one frozen workload, side by side. The workload is frozen on
 * purpose — spec §4 requires it — and the panel says so, because a comparison
 * table is only meaningful if the reader knows the input did not move.
 *
 * Two deliberate choices:
 *
 *   - **The comparison is lazy.** Six simulations of a 1200-tick workload take
 *     about 30 ms. That is nothing once, and far too much on every playback
 *     frame, so it runs only while the panel is open and is memoised on the
 *     inputs that can change a schedule.
 *   - **The questions come from spec §10.** The table answers "which is best at
 *     each metric", but the brief asks something subtly different in places —
 *     "which algorithm does the *most* preemptions" wants a maximum, not an
 *     optimum. Both are shown, and they are labelled as what they are.
 */

import { useMemo, useState } from 'react';

import { COMPARE_METRICS, compareAll, extremeOf, winCounts } from '../../engine/compare.js';
import { fmtNum, fmtTick } from '../../lib/format.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { cx } from '../../lib/cn.js';
import { Button } from '../common/Button.jsx';
import { Card } from '../common/Card.jsx';
import { Chip } from '../common/Badge.jsx';
import { Tooltip } from '../common/Tooltip.jsx';
import { CompareIcon } from '../common/icons.jsx';

/**
 * Print a summary value according to its metric's unit.
 *
 * Throughput keeps four decimals because at the default unit the interesting
 * values sit near 0.004 and would otherwise all read as 0.00.
 *
 * @param {number|null} value
 * @param {'time'|'percent'|'rate'|'count'} unit
 * @returns {string}
 */
function formatValue(value, unit) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (unit === 'count') return fmtTick(value);
  if (unit === 'percent') return fmtNum(value, 1);
  if (unit === 'rate') return fmtNum(value, 4);
  return fmtNum(value, 2);
}

/** The unit suffix shown in a column heading, so cells can stay bare numbers. */
const HEADING_SUFFIX = { time: null, percent: '%', rate: null, count: null };

export function ComparePanel() {
  const { workload, config, actions } = useSim();
  const [open, setOpen] = useState(false);

  // Only the fields that can change a schedule. `algorithm` is deliberately
  // excluded: `compareAll` replaces it per run, so including it would re-run all
  // six simulations every time the user switched the live algorithm.
  const result = useMemo(
    () =>
      open
        ? compareAll(workload, {
            quantum: config.quantum,
            switchOverhead: config.switchOverhead,
            admissionLimit: config.admissionLimit,
            unitLabel: config.unitLabel,
          })
        : null,
    [open, workload, config.quantum, config.switchOverhead, config.admissionLimit, config.unitLabel],
  );

  const unit = config.unitLabel;

  return (
    <Card
      title="Compare all six algorithms"
      subtitle="One frozen workload, six schedules — the same processes, the same arrivals, the same bursts"
      icon={<CompareIcon className="h-4 w-4" />}
      actions={
        <Button size="sm" variant={open ? 'ghost' : 'primary'} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide comparison' : 'Run comparison'}
        </Button>
      }
    >
      {!open ? (
        <p className="text-sm text-ink-muted">
          Runs every algorithm over the workload currently loaded and reports the spec §9 metrics side by side.
          Nothing is changed by running it — the comparison works on its own copy.
        </p>
      ) : (
        <Comparison result={result} unit={unit} onRun={(algorithm) => actions.setConfig({ algorithm })} />
      )}
    </Card>
  );
}

/**
 * @param {Object} props
 * @param {import('../../engine/compare.js').CompareResult} props.result
 * @param {string} props.unit
 * @param {(algorithm: string) => void} props.onRun
 */
function Comparison({ result, unit, onRun }) {
  const wins = useMemo(() => winCounts(result), [result]);
  const findings = useMemo(() => buildFindings(result), [result]);

  // A metric no algorithm can win on is a property of the workload, not a bug —
  // with zero switch overhead the CPU never idles here, so every algorithm
  // finishes at the same instant and makespan cannot discriminate. Saying so is
  // more useful than printing six identical numbers with one of them highlighted.
  const flatMetrics = COMPARE_METRICS.filter((metric) => {
    const values = result.runs.map((run) => run.summary[metric.key]);
    return new Set(values.map((value) => Math.round(value * 1e6))).size === 1;
  });

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[54rem] border-collapse text-sm">
          <caption className="sr-only">
            Spec §9 metrics for each of the six scheduling algorithms over the current workload
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Algorithm
              </th>
              {COMPARE_METRICS.map((metric) => (
                <th
                  key={metric.key}
                  scope="col"
                  className="px-2 py-2 text-right text-[11px] font-semibold tracking-wide text-ink-muted uppercase"
                >
                  <Tooltip text={metric.help} side="bottom">
                    <span className="cursor-help border-b border-dotted border-line-strong">
                      {metric.label}
                      {HEADING_SUFFIX[metric.unit] ? ` (${HEADING_SUFFIX[metric.unit]})` : ''}
                      {metric.unit === 'time' ? ` (${unit})` : ''}
                    </span>
                  </Tooltip>
                </th>
              ))}
              <th scope="col" className="px-2 py-2 text-right text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                <Tooltip text="How many of the metrics above this algorithm is best at. Ties count for everyone tied." side="bottom">
                  <span className="cursor-help border-b border-dotted border-line-strong">Wins</span>
                </Tooltip>
              </th>
              <th scope="col" className="py-2 pl-2">
                <span className="sr-only">Run this algorithm</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {result.runs.map((run) => (
              <tr key={run.algorithm} className="border-b border-line/60 hover:bg-surface-sunken/60">
                <th scope="row" className="py-2 pr-3 text-left font-medium whitespace-nowrap text-ink">
                  {run.short}
                  {run.needsQuantum ? (
                    <span className="tnum ml-1 text-[11px] text-ink-subtle">
                      q={run.timeline.config.quantum}
                    </span>
                  ) : null}
                </th>

                {COMPARE_METRICS.map((metric) => {
                  const best = result.best[metric.key].algorithms.includes(run.algorithm);
                  return (
                    <td
                      key={metric.key}
                      className={cx(
                        'tnum px-2 py-2 text-right',
                        best ? 'font-semibold text-accent' : 'text-ink-muted',
                      )}
                    >
                      {formatValue(run.summary[metric.key], metric.unit)}
                      {best ? <span className="sr-only"> (best)</span> : null}
                    </td>
                  );
                })}

                <td className="tnum px-2 py-2 text-right font-semibold text-ink">
                  {wins[run.algorithm]}
                </td>

                <td className="py-1.5 pl-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => onRun(run.algorithm)}>
                    Run this
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {flatMetrics.length > 0 ? (
        <p className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
          <strong className="font-semibold text-ink">No discrimination on{' '}
          {flatMetrics.map((metric) => metric.label).join(', ')}.</strong>{' '}
          Every algorithm produced the same value. That is a fact about this workload rather than a
          tie-break: with a context-switch overhead of {result.switchOverhead} the CPU never idles here,
          so the total time to clear the queue is the same whichever order the processes run in. What the
          choice changes is <em>who waits</em>, which is why the averages below differ.
        </p>
      ) : null}

      <div>
        <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
          What the numbers say
        </h3>
        <dl className="space-y-1.5">
          {findings.map((finding) => (
            <div key={finding.question} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <dt className="text-ink-muted">{finding.question}</dt>
              <dd className="font-medium text-ink">
                {finding.algorithms.length === 0
                  ? '—'
                  : `${finding.algorithms.map((id) => shortOf(result, id)).join(' and ')}${
                      finding.value === null ? '' : ` (${formatValue(finding.value, finding.unit)})`
                    }`}
                {finding.algorithms.length > 1 ? (
                  <span className="ml-1 font-normal text-ink-subtle">— a tie</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{result.runs.length} runs</Chip>
        <Chip>switch overhead {result.switchOverhead}</Chip>
        <Chip>quantum {result.runs.find((run) => run.needsQuantum)?.timeline.config.quantum ?? '—'}</Chip>
        <span className="text-[11px] text-ink-subtle">
          The workload is copied for each run, so this panel cannot disturb the live schedule.
        </span>
      </div>
    </div>
  );
}

/**
 * The short display name of an algorithm, from the comparison's own runs.
 *
 * @param {import('../../engine/compare.js').CompareResult} result
 * @param {string} algorithm
 * @returns {string}
 */
function shortOf(result, algorithm) {
  return result.runs.find((run) => run.algorithm === algorithm)?.short ?? algorithm;
}

/**
 * The spec §10 questions that the comparison can answer from data.
 *
 * "Most" and "best" are separated on purpose: an algorithm that preempts the
 * most is being described, not praised.
 *
 * @param {import('../../engine/compare.js').CompareResult} result
 */
function buildFindings(result) {
  const runs = result.runs;
  return [
    {
      question: 'Fewest average ready-waiting ticks:',
      ...extremeOf(runs, 'avgReadyWait', 'min'),
      unit: 'time',
    },
    {
      question: 'Fastest average response:',
      ...extremeOf(runs, 'avgResponse', 'min'),
      unit: 'time',
    },
    {
      question: 'Best average turnaround:',
      ...extremeOf(runs, 'avgTurnaround', 'min'),
      unit: 'time',
    },
    {
      question: 'Most preemptions:',
      ...extremeOf(runs, 'preemptions', 'max'),
      unit: 'count',
    },
    {
      question: 'Most context switches:',
      ...extremeOf(runs, 'contextSwitches', 'max'),
      unit: 'count',
    },
    {
      question: 'Highest CPU utilisation:',
      ...extremeOf(runs, 'cpuUtilization', 'max'),
      unit: 'percent',
    },
  ];
}
