/**
 * The KPI strip.
 *
 * These tiles are **live**: they describe the run as of the playback cursor, not
 * the finished run. That is the point of a simulator — the numbers should move
 * as the schedule unfolds. Because every rate divides by the same span the
 * final metrics use, the tiles land exactly on the summary figures when
 * playback reaches the end.
 */

import { liveSummary, occupancy } from '../../engine/selectors.js';
import { fmtNum, fmtPct, fmtTick, fmtTimeAvg } from '../../lib/format.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { STATE_HEX } from '../../data/palette.js';
import { ClockIcon, CpuIcon, QueueIcon, SparkIcon, TableIcon } from '../common/icons.jsx';
import { KpiTile } from './KpiTile.jsx';

export function KpiRow() {
  const { timeline, cursor, snapshot } = useSim();

  if (!snapshot) {
    return (
      <div className="rounded-card border border-line bg-surface p-4 text-sm text-ink-muted shadow-card">
        No simulation to display.
      </div>
    );
  }

  const live = liveSummary(timeline, cursor);
  const unit = timeline.config.unitLabel;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label="Logical clock"
        value={fmtTick(cursor)}
        unit={unit}
        icon={<ClockIcon className="h-4 w-4" />}
        note={`${fmtTick(live.completed)} of ${live.total} terminated`}
        help="One integer logical clock, advanced one unit per tick (spec §7)."
      />

      <KpiTile
        label="CPU utilisation"
        value={fmtPct(live.cpuUtilization, 1)}
        icon={<CpuIcon className="h-4 w-4" />}
        progress={live.cpuUtilization / 100}
        color={STATE_HEX.RUNNING}
        note={`${fmtTick(live.cpuBusyTime)} of ${fmtTick(live.spanTicks)} ${unit} executing`}
        help="Executing time ÷ makespan. Context-switch ticks are excluded (spec §9)."
      />

      <KpiTile
        label="Throughput"
        value={fmtNum(live.throughput, 4)}
        unit={`/ ${unit}`}
        icon={<SparkIcon className="h-4 w-4" />}
        note="Completed ÷ makespan"
        help="Completed processes per unit of simulated time."
      />

      <KpiTile
        label="Avg turnaround"
        value={fmtNum(live.avgTurnaround, 2)}
        unit={unit}
        icon={<TableIcon className="h-4 w-4" />}
        note={`over ${live.completed} finished`}
        help="Average of (completion − arrival) across processes finished so far."
      />

      <KpiTile
        label="Avg ready wait"
        value={fmtNum(live.avgReadyWait, 2)}
        unit={unit}
        icon={<QueueIcon className="h-4 w-4" />}
        note="Ready Queue time only"
        help="Ticks spent in the Ready Queue. Excludes Job Queue and device queues (spec §9)."
      />

      <KpiTile
        label="Switches / preemptions"
        value={`${live.contextSwitches} / ${live.preemptions}`}
        icon={<CpuIcon className="h-4 w-4" />}
        note={`${live.dispatches} dispatches · ${fmtTimeAvg(live.switchTime, unit, 0)} switching`}
        help="Switches count changes between two different running PIDs and exclude the first dispatch. Preemptions count running processes interrupted before their CPU burst finished."
      />
    </div>
  );
}

/**
 * A compact strip of queue occupancies, shown beneath the KPI tiles so the
 * reader can see the pipeline filling and draining at a glance.
 */
export function OccupancyStrip() {
  const { snapshot } = useSim();
  if (!snapshot) return null;
  const counts = occupancy(snapshot);

  const cells = [
    ['Not arrived', counts.pending],
    ['Job Queue', counts.job],
    ['Ready Queue', counts.ready],
    ['CPU', counts.cpu],
    ['Device A', counts.deviceA],
    ['Device B', counts.deviceB],
    ['Terminated', counts.terminated],
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {cells.map(([label, count]) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-muted"
        >
          {label}
          <span className="tnum font-semibold text-ink">{count}</span>
        </span>
      ))}
    </div>
  );
}
