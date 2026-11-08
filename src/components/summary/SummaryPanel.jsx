/**
 * Run summary.
 *
 * The final, whole-run figures, with each definition stated next to its value.
 * The definitions are the point: spec §9 defines several of these in ways a
 * reader is likely to assume differently, and the brief explicitly warns that
 * `waiting = turnaround − CPU time` is invalid for a multiburst simulation. A
 * panel that printed bare numbers would invite exactly that mistake.
 *
 * Two of these deserve to be spelled out, because they are where a correct
 * implementation is most likely to be mistaken for a wrong one:
 *
 *   - **CPU utilisation excludes context-switch ticks.** With a non-zero switch
 *     overhead the CPU is busy but not executing, and the spec counts only the
 *     executing time.
 *   - **Context switches exclude the first dispatch.** Idle → run is a dispatch,
 *     not a switch; only a change between two different running PIDs counts.
 */

import { STATE_HEX } from '../../data/palette.js';
import { fmtPct, fmtTick, fmtTimeAvg, fmtThroughput } from '../../lib/format.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { Card } from '../common/Card.jsx';
import { Chip } from '../common/Badge.jsx';
import { UtilizationMeter } from '../common/Meter.jsx';
import { ChartIcon } from '../common/icons.jsx';

export function SummaryPanel() {
  const { timeline } = useSim();
  const { summary } = timeline;
  const unit = timeline.config.unitLabel;
  const span = Math.max(1, summary.makespan);

  const rows = [
    {
      label: 'Makespan',
      value: `${fmtTick(summary.makespan)} ${unit}`,
      note: 'last completion − first arrival',
    },
    {
      label: 'Throughput',
      value: fmtThroughput(summary.throughput, unit),
      note: `${summary.completed} completed ÷ makespan`,
    },
    {
      label: 'Avg turnaround',
      value: fmtTimeAvg(summary.avgTurnaround, unit),
      note: 'completion − arrival',
    },
    {
      label: 'Avg response',
      value: fmtTimeAvg(summary.avgResponse, unit),
      note: 'first CPU start − arrival',
    },
    {
      label: 'Avg ready wait',
      value: fmtTimeAvg(summary.avgReadyWait, unit),
      note: 'Ready Queue ticks only',
    },
    {
      label: 'Avg job wait',
      value: fmtTimeAvg(summary.avgJobWait, unit),
      note: 'ticks awaiting admission',
    },
    {
      label: 'Avg device wait',
      value: fmtTimeAvg(summary.avgDeviceWait, unit),
      note: 'queued before service, service excluded',
    },
    {
      label: 'Context switches',
      value: fmtTick(summary.contextSwitches),
      note: `changes between running PIDs · ${summary.dispatches} dispatches`,
    },
    {
      label: 'Preemptions',
      value: fmtTick(summary.preemptions),
      note: 'bursts interrupted before completion',
    },
  ];

  return (
    <Card
      title="Run summary"
      subtitle={`${timeline.config.algorithm} · ${summary.completed} of ${summary.total} processes complete`}
      icon={<ChartIcon className="h-4 w-4" />}
      actions={
        timeline.config.switchOverhead > 0 ? (
          <Chip tone="warn">switch overhead {timeline.config.switchOverhead}</Chip>
        ) : (
          <Chip>zero-cost switch</Chip>
        )
      }
    >
      <div className="space-y-3">
        <UtilizationMeter
          label="CPU utilisation"
          percent={summary.cpuUtilization}
          color={STATE_HEX.RUNNING}
          detail={`${fmtTick(summary.cpuBusyTime)} of ${fmtTick(span)} ${unit} executing${
            summary.switchTime > 0 ? ` · ${fmtTick(summary.switchTime)} ${unit} switching, excluded` : ''
          }`}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <UtilizationMeter
            label="Device A utilisation"
            percent={summary.deviceUtilizationA}
            color={STATE_HEX.BUSY}
            detail={`busy ÷ makespan`}
          />
          <UtilizationMeter
            label="Device B utilisation"
            percent={summary.deviceUtilizationB}
            color={STATE_HEX.BUSY}
            detail={`busy ÷ makespan`}
          />
        </div>

        <dl className="divide-y divide-line rounded-lg border border-line">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
              <dt className="min-w-0">
                <span className="block text-xs font-medium text-ink">{row.label}</span>
                <span className="block text-[10px] text-ink-subtle">{row.note}</span>
              </dt>
              <dd className="tnum shrink-0 text-xs font-semibold text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="text-[11px] leading-relaxed text-ink-subtle">
          Idle time: {fmtTick(summary.idleTime)} {unit} ({fmtPct((summary.idleTime / span) * 100, 1)}
          ). CPU utilisation is executing time only — context-switch ticks are counted separately,
          per spec §9.
        </p>
      </div>
    </Card>
  );
}
