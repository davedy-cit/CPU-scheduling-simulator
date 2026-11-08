/**
 * One I/O device: a single FIFO server with its own wait queue (spec §5).
 *
 * The in-service process and the waiting queue are drawn as two visually
 * distinct regions, because that separation is exactly what spec §9 asks for in
 * the metrics: device waiting time counts ticks spent *queued*, not ticks spent
 * being serviced. A card that blended the two would make the distinction
 * invisible at the point where it matters.
 *
 * Devices run concurrently with the CPU and with each other, which is why this
 * card has no quantum bar and no switch state — a device is either servicing one
 * process or it is not.
 */

import { STATE_HEX } from '../../data/palette.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { Chip } from '../common/Badge.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { ProgressBar } from '../common/Meter.jsx';
import { DeviceIcon } from '../common/icons.jsx';
import { ProcessChip } from './ProcessChip.jsx';

/**
 * @param {Object} props
 * @param {'A'|'B'} props.device
 * @param {boolean} props.instant
 * @param {import('framer-motion').Transition} [props.transition]
 * @param {Set<string>} [props.changed]
 */
export function IoDeviceCard({ device, instant, transition, changed }) {
  const { timeline, snapshot } = useSim();
  const state = snapshot.devices[device];
  const unit = timeline.config.unitLabel;

  const busySpec = state.busyPid
    ? timeline.processes.find((p) => p.id === state.busyPid)
    : null;
  const busyRuntime = state.busyPid ? snapshot.proc[state.busyPid] : null;
  const busyBurst = busySpec && busyRuntime ? busySpec.bursts[busyRuntime.burstIndex] : null;

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-line px-2.5 py-2">
        <DeviceIcon className="h-3.5 w-3.5 shrink-0 text-state-io" />
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">Device {device}</h3>
        <Chip tone={state.busyPid ? 'accent' : 'neutral'}>
          {state.busyPid ? 'servicing' : 'idle'}
        </Chip>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        <div>
          <span className="mb-1 block text-[10px] font-semibold tracking-wide text-ink-subtle uppercase">
            In service
          </span>
          {busySpec && busyRuntime && busyBurst ? (
            <div className="space-y-1.5">
              <ProcessChip
                pid={busySpec.id}
                colorIndex={busySpec.colorIndex}
                priority={busySpec.priority}
                progress={{
                  burstKind: busyBurst.kind,
                  burstServed: busyBurst.duration - busyRuntime.remaining,
                  burstDuration: busyBurst.duration,
                  burstRemaining: busyRuntime.remaining,
                  burstProgress: (busyBurst.duration - busyRuntime.remaining) / busyBurst.duration,
                }}
                locationLabel={`Being serviced on Device ${device}`}
                instant={instant}
                transition={transition}
                highlight={changed?.has(busySpec.id)}
              />
              <p className="tnum text-[10px] text-ink-muted">
                {busyRuntime.remaining} {unit} of I/O left
              </p>
            </div>
          ) : (
            <EmptyState message="Device idle" />
          )}
        </div>

        <div className="min-h-0">
          <span className="mb-1 flex items-baseline justify-between text-[10px] font-semibold tracking-wide text-ink-subtle uppercase">
            <span>Waiting (FIFO)</span>
            <span className="tnum">{state.queue.length}</span>
          </span>
          {state.queue.length === 0 ? (
            <EmptyState message="No waiters" />
          ) : (
            <ol className="space-y-1.5">
              {state.queue.map((pid, index) => {
                const spec = timeline.processes.find((p) => p.id === pid);
                const rt = snapshot.proc[pid];
                if (!spec || !rt) return null;
                const burst = spec.bursts[rt.burstIndex];
                return (
                  <li key={pid} className="flex items-center gap-1.5">
                    <span className="tnum w-3 shrink-0 text-[10px] text-ink-subtle">
                      {index + 1}
                    </span>
                    <ProcessChip
                      pid={spec.id}
                      colorIndex={spec.colorIndex}
                      priority={spec.priority}
                      progress={{
                        burstKind: burst?.kind ?? null,
                        burstServed: 0,
                        burstDuration: burst?.duration ?? 0,
                        burstRemaining: burst?.duration ?? 0,
                        burstProgress: 0,
                      }}
                      locationLabel={`Queued for Device ${device}`}
                      compact
                      instant={instant}
                      transition={transition}
                      highlight={changed?.has(spec.id)}
                      showProgress={false}
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <div className="border-t border-line px-2.5 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-ink-subtle">Busy</span>
          <span className="tnum text-[10px] font-semibold text-ink-muted">
            {state.busyTicks} {unit}
          </span>
        </div>
        <ProgressBar
          value={snapshot.counters.elapsed > 0 ? state.busyTicks / snapshot.counters.elapsed : 0}
          color={STATE_HEX.BUSY}
          className="mt-1"
          label={`Device ${device} utilisation so far`}
        />
      </div>
    </section>
  );
}
