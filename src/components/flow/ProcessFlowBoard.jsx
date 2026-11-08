/**
 * The process-flow board.
 *
 * Seven stages, left to right, in the order a process travels them:
 *
 *   Scheduled arrivals → Job Queue → Ready Queue → CPU → Device A / Device B → Terminated
 *
 * The whole board is one `LayoutGroup`, which is what makes a chip's flight from
 * one column to the next a single shared-layout animation. Keeping the group
 * scoped to the board matters: `layoutId` is matched across the entire React
 * tree by default, so the process table and the Gantt chart — which also list
 * processes — render plain elements rather than motion elements with matching
 * ids, and there is no chance of a chip in the table hijacking the flight.
 *
 * `instant` and `transition` come from `useAnimationInstant()`: a one-unit step
 * animates, a scrub or a run-to-end snaps.
 */

import { LayoutGroup } from 'framer-motion';

import { LOCATION_LABEL } from '../../engine/selectors.js';
import { useAnimationInstant } from '../../hooks/useAnimationInstant.js';
import { fmtTick } from '../../lib/format.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { Card } from '../common/Card.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { ChipIcon, ClockIcon, DeviceIcon, QueueIcon, TableIcon } from '../common/icons.jsx';
import { CpuCard } from './CpuCard.jsx';
import { IoDeviceCard } from './IoDeviceCard.jsx';
import { ProcessChip } from './ProcessChip.jsx';
import { QueueColumn } from './QueueColumn.jsx';

export function ProcessFlowBoard() {
  const { timeline, snapshot, cursor, delta, motion } = useSim();
  const { instant, transition } = useAnimationInstant({ delta, motion });

  if (!snapshot) {
    return (
      <Card title="Process flow">
        <EmptyState size="block" message="No simulation to display." />
      </Card>
    );
  }

  const unit = timeline.config.unitLabel;

  // Which processes had something happen to them at this exact boundary — used
  // to outline the chips involved, so a reader scanning the board can find the
  // change without reading the event log.
  const changed = new Set(
    snapshot.lastEventIds.map((id) => timeline.events[id]?.pid).filter(Boolean),
  );

  const chipProps = (pid) => {
    const spec = timeline.processes.find((p) => p.id === pid);
    const rt = snapshot.proc[pid];
    const burst = spec && rt ? spec.bursts[rt.burstIndex] : null;
    return {
      pid,
      colorIndex: spec?.colorIndex ?? 1,
      priority: rt?.priority ?? spec?.priority ?? 0,
      progress: {
        burstKind: burst?.kind ?? null,
        burstServed: burst && rt ? burst.duration - rt.remaining : 0,
        burstDuration: burst?.duration ?? 0,
        burstRemaining: rt ? rt.remaining : 0,
        burstProgress: burst && rt ? (burst.duration - rt.remaining) / burst.duration : 0,
      },
      instant,
      transition,
      highlight: changed.has(pid),
    };
  };

  return (
    <Card
      title="Process flow"
      subtitle={`Live placement of every process at t = ${fmtTick(cursor)} ${unit}`}
      icon={<ChipIcon className="h-4 w-4" />}
      actions={
        <div className="hidden items-center gap-1.5 text-[10px] text-ink-subtle sm:flex">
          <span>animation</span>
          <span
            className={`rounded px-1.5 py-0.5 font-semibold ${
              instant ? 'bg-surface-sunken text-ink-muted' : 'bg-accent/10 text-accent'
            }`}
          >
            {instant ? 'snap' : 'smooth'}
          </span>
        </div>
      }
      bodyClassName="p-3"
    >
      <LayoutGroup id="process-flow">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          {/* ── Not yet arrived ─────────────────────────────────────────── */}
          <QueueColumn
            title="Scheduled arrivals"
            subtitle="Not yet created"
            icon={<ClockIcon className="h-3.5 w-3.5" />}
            count={snapshot.pendingArrivals.length}
            className="min-h-[20rem]"
            footer="A process does not exist before its arrival tick (spec §6)."
          >
            {snapshot.pendingArrivals.length === 0 ? (
              <EmptyState message="All processes have arrived" />
            ) : (
              snapshot.pendingArrivals.map((pid) => {
                const spec = timeline.processes.find((p) => p.id === pid);
                return (
                  <div key={pid} className="flex items-center gap-1.5 opacity-60">
                    <span className="tnum w-3 shrink-0 text-[10px] text-ink-subtle" />
                    <ProcessChip
                      pid={pid}
                      colorIndex={spec?.colorIndex ?? 1}
                      priority={spec?.priority ?? 0}
                      progress={{
                        burstKind: null,
                        burstServed: 0,
                        burstDuration: 0,
                        burstRemaining: 0,
                        burstProgress: 0,
                      }}
                      locationLabel={`Arrives at t = ${spec?.arrival ?? '?'}`}
                      compact
                      instant={instant}
                      transition={transition}
                      showProgress={false}
                    />
                    <span className="tnum shrink-0 text-[10px] text-ink-subtle">
                      t={spec?.arrival ?? '?'}
                    </span>
                  </div>
                );
              })
            )}
          </QueueColumn>

          {/* ── Job Queue ───────────────────────────────────────────────── */}
          <QueueColumn
            title="Job Queue"
            subtitle="Awaiting admission"
            icon={<QueueIcon className="h-3.5 w-3.5" />}
            count={snapshot.jobQueue.length}
            className="min-h-[20rem]"
            footer={
              timeline.config.admissionLimit === null
                ? 'FCFS admission, unlimited (spec §5).'
                : `Admission limited to ${timeline.config.admissionLimit} in the system.`
            }
          >
            {snapshot.jobQueue.length === 0 ? (
              <EmptyState message="Empty" />
            ) : (
              snapshot.jobQueue.map((pid, index) => (
                <div key={pid} className="flex items-center gap-1.5">
                  <span className="tnum w-3 shrink-0 text-[10px] text-ink-subtle">{index + 1}</span>
                  <ProcessChip {...chipProps(pid)} compact showProgress={false} />
                </div>
              ))
            )}
          </QueueColumn>

          {/* ── Ready Queue ─────────────────────────────────────────────── */}
          <QueueColumn
            title="Ready Queue"
            subtitle="Dispatch order, head first"
            icon={<QueueIcon className="h-3.5 w-3.5" />}
            count={snapshot.readyQueue.length}
            className="min-h-[20rem]"
            footer="Ties break on Ready-Queue entry time, then lexical ID."
          >
            {snapshot.readyQueue.length === 0 ? (
              <EmptyState message="Empty" />
            ) : (
              snapshot.readyQueue.map((pid, index) => (
                <div key={pid} className="flex items-center gap-1.5">
                  <span
                    className={`tnum w-3 shrink-0 text-[10px] ${
                      index === 0 ? 'font-bold text-accent' : 'text-ink-subtle'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <ProcessChip {...chipProps(pid)} />
                </div>
              ))
            )}
          </QueueColumn>

          {/* ── CPU ─────────────────────────────────────────────────────── */}
          <CpuCard instant={instant} transition={transition} highlight={changed.has(snapshot.cpu.pid)} />

          {/* ── Devices ─────────────────────────────────────────────────── */}
          <IoDeviceCard device="A" instant={instant} transition={transition} changed={changed} />
          <IoDeviceCard device="B" instant={instant} transition={transition} changed={changed} />

          {/* ── Terminated ──────────────────────────────────────────────── */}
          <QueueColumn
            title="Terminated"
            subtitle="Completion order"
            icon={<TableIcon className="h-3.5 w-3.5" />}
            count={snapshot.terminated.length}
            className="min-h-[20rem]"
            footer={`${snapshot.terminated.length} of ${timeline.processes.length} complete.`}
          >
            {snapshot.terminated.length === 0 ? (
              <EmptyState message="None yet" />
            ) : (
              snapshot.terminated.map((pid) => {
                const rt = snapshot.proc[pid];
                return (
                  <div key={pid} className="flex items-center gap-1.5">
                    <ProcessChip
                      pid={pid}
                      colorIndex={timeline.processes.find((p) => p.id === pid)?.colorIndex ?? 1}
                      priority={rt?.priority ?? 0}
                      progress={{
                        burstKind: null,
                        burstServed: 0,
                        burstDuration: 0,
                        burstRemaining: 0,
                        burstProgress: 0,
                      }}
                      locationLabel={LOCATION_LABEL.TERMINATED}
                      compact
                      instant={instant}
                      transition={transition}
                      showProgress={false}
                    />
                    <span className="tnum shrink-0 text-[10px] text-ink-subtle">
                      t={fmtTick(rt?.completionTick)}
                    </span>
                  </div>
                );
              })
            )}
          </QueueColumn>
        </div>
      </LayoutGroup>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-subtle">
        <DeviceIcon className="h-3.5 w-3.5" />
        Device A and Device B each run a single FIFO server, concurrently with the CPU and with each
        other.
      </p>
    </Card>
  );
}
