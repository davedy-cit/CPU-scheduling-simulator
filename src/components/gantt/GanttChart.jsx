/**
 * The Gantt chart.
 *
 * Spec §8 asks for a CPU chart *and* separate Device A and Device B timelines,
 * including Idle and Context Switch segments. Three stacked lanes satisfy that
 * directly, and stacking them on a shared axis is what lets the reader see the
 * thing that makes this workload interesting: the CPU running a process while
 * both devices are simultaneously busy with two others.
 *
 * Because the run is precomputed, "dynamic" here means the lanes are revealed
 * progressively as the cursor advances — the segments are not built incrementally
 * and cannot disagree with the trace.
 *
 * Clicking anywhere on the chart seeks to that instant. That is the same `seek`
 * action the scrubber uses, so the two controls can never drift apart.
 */

import { useMemo } from 'react';

import { ganttLanes, segmentAt } from '../../engine/selectors.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { Card } from '../common/Card.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { Chip } from '../common/Badge.jsx';
import { ChartIcon } from '../common/icons.jsx';
import { GanttRuler } from './GanttRuler.jsx';
import { GanttRow } from './GanttRow.jsx';

/** Width of the lane-label gutter, in rem. Shared by the ruler and every row. */
const GUTTER = 5.5;

export function GanttChart() {
  const { timeline, cursor, actions } = useSim();

  const total = Math.max(1, timeline.snapshots.length - 1);
  const lanes = useMemo(() => ganttLanes(timeline, cursor), [timeline, cursor]);

  const colorMap = useMemo(
    () => new Map(timeline.processes.map((p) => [p.id, p.colorIndex ?? 1])),
    [timeline.processes],
  );
  const colorOf = (pid) => colorMap.get(pid) ?? 1;

  const unit = timeline.config.unitLabel;

  /**
   * Context-switch markers revealed so far, plus the running count.
   *
   * The header reports the count *at the cursor*, not the run total — the KPI
   * strip beside it is live, and a header showing the final figure while the
   * strip beside it showed the current one would read as a disagreement.
   */
  const switches = useMemo(
    () => timeline.switchTicks.filter((tick) => tick <= cursor).map((tick) => ({ tick })),
    [timeline.switchTicks, cursor],
  );

  /** Preemptions so far, from the events rather than the run summary. */
  const preemptionsSoFar = useMemo(
    () =>
      timeline.events.reduce(
        (count, event) =>
          event.tick <= cursor && (event.reason === 'PREEMPT' || event.reason === 'QUANTUM_EXPIRE')
            ? count + 1
            : count,
        0,
      ),
    [timeline.events, cursor],
  );

  if (timeline.snapshots.length === 0) {
    return (
      <Card title="Timelines" icon={<ChartIcon className="h-4 w-4" />}>
        <EmptyState size="block" message="No simulation to display." />
      </Card>
    );
  }

  const onSeek = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = (event.clientX - rect.left) / rect.width;
    actions.seek(Math.round(Math.max(0, Math.min(1, fraction)) * total));
  };

  return (
    <Card
      title="Resource timelines"
      subtitle={`CPU, Device A and Device B on one shared axis · click to seek`}
      icon={<ChartIcon className="h-4 w-4" />}
      actions={
        <div className="flex items-center gap-1.5">
          <Chip>{switches.length} switches so far</Chip>
          <Chip>{preemptionsSoFar} preemptions so far</Chip>
        </div>
      }
      bodyClassName="p-3"
      footer={<GanttLegend />}
    >
      <GanttRuler totalTicks={total} cursor={cursor} gutter={GUTTER} />

      <div className="mt-1 space-y-1">
        {lanes.map((lane) => {
          // The *unclipped* segments: at the final tick every revealed segment
          // ends exactly at the cursor, so `segmentAt` over the clipped list
          // would report nothing while the run is plainly finished.
          const active = segmentAt(lane.all, Math.min(cursor, total - 1));
          return (
            <div key={lane.id} className="flex items-stretch">
              <div
                className="flex shrink-0 flex-col justify-center pr-2 text-right"
                style={{ width: `${GUTTER}rem` }}
              >
                <span className="truncate text-[11px] font-semibold text-ink">{lane.label}</span>
                <span className="tnum truncate text-[10px] text-ink-subtle">
                  {active
                    ? active.kind === 'IDLE'
                      ? 'idle'
                      : active.kind === 'SWITCH'
                        ? 'switching'
                        : (active.pid ?? '—')
                    : '—'}
                </span>
              </div>

              {/* A click target, not a control: the scrubber is the keyboard-
                  and screen-reader-accessible way to move the cursor, and this
                  is the mouse shortcut for the same action. */}
              <div
                onClick={onSeek}
                className="min-w-0 flex-1 cursor-crosshair"
                title={`Click to seek using the ${lane.label} timeline`}
              >
                <GanttRow
                  segments={lane.segments}
                  totalTicks={total}
                  cursor={cursor}
                  colorOf={colorOf}
                  markers={lane.id === 'cpu' ? switches : []}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-ink-subtle">
        Each lane spans t = 0 → {total} {unit}. Segments tile the run with no gaps: a lane is always
        running a process, switching, or idle.
      </p>
    </Card>
  );
}

/**
 * The segment key. Process colours are not listed individually — the flow board
 * already teaches them, and eight swatches would crowd out the two segment kinds
 * that are not a process.
 */
function GanttLegend() {
  const items = [
    { label: 'Running a process', swatch: 'bg-state-running' },
    { label: 'I/O service', swatch: 'bg-state-io' },
    { label: 'Idle', swatch: 'bg-state-idle/30' },
    {
      label: 'Context switch',
      swatch: 'bg-ink-subtle',
      hatch: true,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span
            className={`inline-block h-2.5 w-5 rounded-sm border border-line ${item.swatch}`}
            style={
              item.hatch
                ? {
                    backgroundImage:
                      'repeating-linear-gradient(45deg, var(--color-ink-subtle) 0 3px, transparent 3px 6px)',
                    backgroundColor: 'transparent',
                  }
                : undefined
            }
          />
          {item.label}
        </span>
      ))}
      <span className="text-[11px] text-ink-subtle">
        A zero-width context switch is drawn as a marker line.
      </span>
    </div>
  );
}
