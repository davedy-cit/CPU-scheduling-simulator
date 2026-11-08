/**
 * Per-process performance measures (spec §9).
 *
 * This table shows the **final** figures for the whole run, not the values at
 * the cursor. The distinction is deliberate: the process table above is the live
 * view, and this is the result. Averaging a process that has not finished would
 * require a completion time it does not have, so a "live metrics table" would
 * either be wrong or full of dashes.
 *
 * The totals row repeats the definitions rather than only the numbers, because
 * several of these are defined in ways the reader is likely to assume
 * differently — CPU utilisation excludes context-switch time, waiting is
 * per-queue, and the makespan is measured from the first arrival.
 */

import { fmtNum, fmtTick, fmtTimeAvg } from '../../lib/format.js';
import { procHex } from '../../data/palette.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { Card } from '../common/Card.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { Tooltip } from '../common/Tooltip.jsx';
import { TableIcon } from '../common/icons.jsx';

const COLUMNS = [
  { key: 'id', label: 'PID', hint: 'Process identifier' },
  { key: 'arrival', label: 'Arrival', hint: 'Tick at which the process is created' },
  { key: 'priority', label: 'Prio', hint: '1 = highest priority' },
  { key: 'completion', label: 'Completion', hint: 'Tick at which the last CPU burst finished' },
  { key: 'turnaround', label: 'Turnaround', hint: 'completion − arrival (spec §9)' },
  { key: 'response', label: 'Response', hint: 'first CPU start − arrival (spec §9)' },
  { key: 'jobWait', label: 'Job wait', hint: 'Ticks awaiting admission in the Job Queue' },
  { key: 'readyWait', label: 'Ready wait', hint: 'Ticks in the Ready Queue only (spec §9)' },
  { key: 'deviceWait', label: 'Device wait', hint: 'Ticks queued before I/O service, excluding service time' },
  { key: 'cpuTime', label: 'CPU time', hint: 'Total CPU service received' },
  { key: 'ioRequests', label: 'I/O ops', hint: 'Number of I/O bursts requested' },
  { key: 'preemptions', label: 'Pre', hint: 'Times interrupted before its CPU burst completed' },
];

export function MetricsTable() {
  const { timeline } = useSim();
  const unit = timeline.config.unitLabel;
  const { metrics, summary } = timeline;

  if (metrics.length === 0) {
    return (
      <Card title="Performance measures" icon={<TableIcon className="h-4 w-4" />}>
        <EmptyState size="block" message="No metrics — the workload could not be simulated." />
      </Card>
    );
  }

  const num = (value) => (value === null ? '—' : fmtTick(value));

  return (
    <Card
      title="Performance measures"
      subtitle={`Final results · makespan ${fmtTick(summary.makespan)} ${unit}`}
      icon={<TableIcon className="h-4 w-4" />}
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-left">
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
            {metrics.map((row) => (
              <tr key={row.id} className="border-b border-line/70 last:border-b-0 hover:bg-surface-muted">
                <th scope="row" className="px-2.5 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-1 rounded-full"
                      style={{
                        backgroundColor: procHex(
                          timeline.processes.find((p) => p.id === row.id)?.colorIndex ?? 1,
                        ),
                      }}
                      aria-hidden="true"
                    />
                    <span className="tnum text-xs font-bold text-ink">{row.id}</span>
                  </span>
                </th>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{row.arrival}</td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{row.priority}</td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{num(row.completion)}</td>
                <td className="tnum px-2.5 py-2 text-xs font-semibold text-ink">
                  {num(row.turnaround)}
                </td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{num(row.response)}</td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{row.jobWait}</td>
                <td className="tnum px-2.5 py-2 text-xs font-semibold text-ink">{row.readyWait}</td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{row.deviceWait}</td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{row.cpuTime}</td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{row.ioRequests}</td>
                <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{row.preemptions}</td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-line bg-surface-muted">
              <th scope="row" className="px-2.5 py-2 text-[11px] font-semibold text-ink">
                Average
              </th>
              <td colSpan={3} className="px-2.5 py-2 text-[11px] text-ink-subtle">
                over {summary.completed} completed of {summary.total}
              </td>
              <td className="tnum px-2.5 py-2 text-xs font-semibold text-ink">
                {fmtNum(summary.avgTurnaround, 2)}
              </td>
              <td className="tnum px-2.5 py-2 text-xs font-semibold text-ink">
                {fmtNum(summary.avgResponse, 2)}
              </td>
              <td className="tnum px-2.5 py-2 text-xs text-ink-muted">
                {fmtNum(summary.avgJobWait, 2)}
              </td>
              <td className="tnum px-2.5 py-2 text-xs font-semibold text-ink">
                {fmtNum(summary.avgReadyWait, 2)}
              </td>
              <td className="tnum px-2.5 py-2 text-xs text-ink-muted">
                {fmtNum(summary.avgDeviceWait, 2)}
              </td>
              <td className="tnum px-2.5 py-2 text-xs text-ink-muted">
                {fmtTimeAvg(
                  metrics.reduce((sum, r) => sum + r.cpuTime, 0) / Math.max(1, metrics.length),
                  unit,
                  1,
                )}
              </td>
              <td className="tnum px-2.5 py-2 text-xs text-ink-muted">
                {metrics.reduce((sum, r) => sum + r.ioRequests, 0)}
              </td>
              <td className="tnum px-2.5 py-2 text-xs text-ink-muted">{summary.preemptions}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="border-t border-line px-4 py-2 text-[11px] text-ink-subtle">
        All times in {unit}. Ready wait counts only ticks in the Ready Queue; job wait only ticks
        awaiting admission; device wait only ticks queued before an I/O burst is serviced.
      </p>
    </Card>
  );
}
