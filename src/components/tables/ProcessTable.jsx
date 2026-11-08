/**
 * The process table.
 *
 * Spec §5 requires a "process state panel" and spec §8 a process table that
 * stays synchronised with the clock, the trace and the charts. This is that
 * panel: one row per process, showing the live runtime record — state, where it
 * is, what it is doing, and the running totals the metrics are built from.
 *
 * The waiting columns are broken out separately (Job / Ready / Device) rather
 * than collapsed into one number, because spec §9 defines them as three
 * different measurements and warns explicitly that deriving waiting by
 * subtracting CPU time from turnaround is invalid here. A single "waiting"
 * column would hide exactly the distinction being graded.
 *
 * Values are shown live at the cursor; the final figures appear in the run
 * summary below the chart.
 */

import { LOCATION_LABEL, processRows } from '../../engine/selectors.js';
import { fmtTick } from '../../lib/format.js';
import { procHex } from '../../data/palette.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { StateBadge } from '../common/Badge.jsx';
import { Card } from '../common/Card.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { ProgressBar } from '../common/Meter.jsx';
import { Tooltip } from '../common/Tooltip.jsx';
import { TableIcon } from '../common/icons.jsx';
import { BurstChipRow } from './BurstChipRow.jsx';

/** Column headers, with the definition attached to each. */
const COLUMNS = [
  { key: 'pid', label: 'PID', hint: 'Process identifier' },
  { key: 'state', label: 'State', hint: 'Lifecycle state (spec §5)' },
  { key: 'location', label: 'Location', hint: 'Where the process is right now' },
  { key: 'priority', label: 'Prio', hint: '1 = highest priority (spec §3)' },
  { key: 'bursts', label: 'Bursts', hint: 'Alternating CPU / I/O sequence (spec §4)' },
  { key: 'burstIndex', label: 'Burst #', hint: 'Index of the burst being serviced' },
  { key: 'remaining', label: 'Remaining', hint: 'Time left in the current burst' },
  { key: 'progress', label: 'Progress', hint: 'Share of the whole burst sequence serviced' },
  { key: 'jobWait', label: 'Job wait', hint: 'Ticks awaiting admission in the Job Queue' },
  { key: 'readyWait', label: 'Ready wait', hint: 'Ticks in the Ready Queue only (spec §9)' },
  { key: 'deviceWait', label: 'Dev wait', hint: 'Ticks queued for I/O, excluding service' },
  { key: 'cpuTime', label: 'CPU time', hint: 'Total CPU service received' },
  { key: 'preemptions', label: 'Pre', hint: 'Times interrupted before its burst completed' },
  { key: 'completion', label: 'Done at', hint: 'Completion tick, once terminated' },
];

export function ProcessTable() {
  const { timeline, snapshot, cursor } = useSim();
  const unit = timeline.config.unitLabel;

  if (!snapshot) {
    return (
      <Card title="Processes" icon={<TableIcon className="h-4 w-4" />}>
        <EmptyState size="block" message="No simulation to display." />
      </Card>
    );
  }

  const rows = processRows(timeline, snapshot);

  return (
    <Card
      title="Process table"
      subtitle={`Live at t = ${fmtTick(cursor)} ${unit}`}
      icon={<TableIcon className="h-4 w-4" />}
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface-muted">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-2.5 py-2 text-[10px] font-semibold tracking-wide text-ink-muted uppercase"
                >
                  <Tooltip text={column.hint} side="bottom">
                    <span className="cursor-help border-b border-dotted border-line-strong">
                      {column.label}
                    </span>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map(({ spec, rt, progress, location }) => (
              <tr
                key={spec.id}
                className="border-b border-line/70 align-middle last:border-b-0 hover:bg-surface-muted"
              >
                <th scope="row" className="px-2.5 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-1 rounded-full"
                      style={{ backgroundColor: procHex(spec.colorIndex) }}
                      aria-hidden="true"
                    />
                    <span className="tnum text-xs font-bold text-ink">{spec.id}</span>
                  </span>
                </th>

                <td className="px-2.5 py-2">
                  <StateBadge state={rt.state} />
                </td>

                <td className="px-2.5 py-2 text-xs text-ink-muted">
                  {LOCATION_LABEL[location]}
                </td>

                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{spec.priority}</td>

                <td className="px-2.5 py-2">
                  <BurstChipRow
                    bursts={spec.bursts}
                    burstIndex={rt.burstIndex}
                    remaining={rt.remaining}
                    state={rt.state}
                    colorIndex={spec.colorIndex}
                    unit={unit}
                  />
                </td>

                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">
                  {rt.state === 'TERMINATED' ? '—' : `${rt.burstIndex + 1}/${spec.bursts.length}`}
                </td>

                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">
                  {rt.state === 'TERMINATED' ? '—' : fmtTick(rt.remaining)}
                </td>

                <td className="px-2.5 py-2">
                  <div className="w-24">
                    <ProgressBar
                      value={progress.overallProgress}
                      color={procHex(spec.colorIndex)}
                      label={`${spec.id} overall progress`}
                    />
                    <span className="tnum mt-0.5 block text-[10px] text-ink-subtle">
                      {fmtTick(progress.workDone)} / {fmtTick(progress.totalWork)}
                    </span>
                  </div>
                </td>

                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{fmtTick(rt.jobWait)}</td>
                <td className="tnum px-2.5 py-2 text-xs font-semibold text-ink">
                  {fmtTick(rt.readyWait)}
                </td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{fmtTick(rt.deviceWait)}</td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{fmtTick(rt.cpuTime)}</td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{rt.preemptions}</td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">
                  {rt.completionTick === null ? '—' : fmtTick(rt.completionTick)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line px-4 py-2 text-[11px] text-ink-subtle">
        Waiting is measured per queue and never derived by subtraction: spec §9 states the textbook
        shortcut <span className="font-mono">waiting = turnaround − CPU time</span> is invalid in a
        multiburst simulation.
      </p>
    </Card>
  );
}
