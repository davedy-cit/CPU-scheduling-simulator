/**
 * The CPU.
 *
 * One logical processor (spec §5). Beyond showing who is running, the card is
 * where the Round Robin quantum becomes visible: the quantum bar drains at the
 * same rate as the burst bar, so "the process was evicted when the quantum ran
 * out, not when its burst finished" is something the reader can see rather than
 * infer from the trace.
 */

import { ALGORITHM_BY_ID } from '../../engine/constants.js';
import { STATE_HEX } from '../../data/palette.js';
import { fmtTick } from '../../lib/format.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { Chip } from '../common/Badge.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { ProgressBar } from '../common/Meter.jsx';
import { CpuIcon } from '../common/icons.jsx';
import { ProcessChip } from './ProcessChip.jsx';

export function CpuCard({ instant, transition, highlight }) {
  const { timeline, snapshot, config } = useSim();
  const cpu = snapshot.cpu;
  const running = cpu.pid ? snapshot.proc[cpu.pid] : null;
  const spec = cpu.pid ? timeline.processes.find((p) => p.id === cpu.pid) : null;

  const needsQuantum = Boolean(ALGORITHM_BY_ID[config.algorithm]?.needsQuantum);
  const burst = running ? spec?.bursts[running.burstIndex] : null;
  const burstProgress = burst ? (burst.duration - running.remaining) / burst.duration : 0;
  const quantumProgress = needsQuantum && Number.isFinite(cpu.quantumLeft)
    ? Math.max(0, Math.min(1, cpu.quantumLeft / config.quantum))
    : 0;

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-line px-2.5 py-2">
        <CpuIcon className="h-3.5 w-3.5 shrink-0 text-state-running" />
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">CPU</h3>
        <Chip tone={cpu.pid || cpu.inSwitch ? 'accent' : 'neutral'}>
          {cpu.inSwitch ? 'switching' : cpu.pid ? 'busy' : 'idle'}
        </Chip>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        {cpu.inSwitch ? (
          <EmptyState
            message={`Context switch — ${cpu.switchTicksLeft} ${timeline.config.unitLabel} left`}
          />
        ) : running && spec ? (
          <>
            <ProcessChip
              pid={spec.id}
              colorIndex={spec.colorIndex}
              priority={spec.priority}
              progress={{
                burstKind: burst?.kind ?? null,
                burstServed: burst ? burst.duration - running.remaining : 0,
                burstDuration: burst?.duration ?? 0,
                burstRemaining: running.remaining,
                burstProgress,
              }}
              locationLabel="Running on the CPU"
              instant={instant}
              transition={transition}
              highlight={highlight}
            />

            <dl className="tnum space-y-1 text-[10px] text-ink-muted">
              <div className="flex justify-between gap-2">
                <dt>Dispatched</dt>
                <dd className="font-semibold text-ink">t = {fmtTick(cpu.dispatchTick)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Remaining in burst</dt>
                <dd className="font-semibold text-ink">{running.remaining}</dd>
              </div>
              {needsQuantum ? (
                <div className="flex justify-between gap-2">
                  <dt>Quantum left</dt>
                  <dd className="font-semibold text-ink">
                    {Number.isFinite(cpu.quantumLeft) ? cpu.quantumLeft : '—'} / {config.quantum}
                  </dd>
                </div>
              ) : null}
            </dl>

            {needsQuantum ? (
              <div>
                <span className="mb-1 block text-[10px] font-semibold tracking-wide text-ink-subtle uppercase">
                  Quantum
                </span>
                <ProgressBar
                  value={quantumProgress}
                  color={STATE_HEX.READY}
                  label="Round Robin quantum remaining"
                />
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            message={
              snapshot.readyQueue.length > 0
                ? 'Idle — dispatch is evaluated at the next boundary'
                : 'Idle — no ready process'
            }
            icon={<CpuIcon className="h-5 w-5" />}
          />
        )}
      </div>

      <div className="border-t border-line px-2.5 py-1.5">
        <div className="tnum flex justify-between text-[10px] text-ink-subtle">
          <span>{fmtTick(snapshot.counters.cpuExecutingTicks)} executing</span>
          <span>{fmtTick(snapshot.counters.idleTicks)} idle</span>
        </div>
      </div>
    </section>
  );
}
