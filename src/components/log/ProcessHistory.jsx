/**
 * Per-process history (spec §8).
 *
 * The event trace answers "what happened at time t"; this answers "what happened
 * to P3". Both are needed: during a demonstration the first question is the one
 * asked, and during an analysis the second is.
 *
 * The strip is built by scanning the events for one PID and collapsing runs of
 * the same location, so a process that spends forty ticks in the Ready Queue
 * produces one entry rather than forty.
 */

import { useMemo, useState } from 'react';

import { eventsUpTo } from '../../engine/selectors.js';
import { fmtTick } from '../../lib/format.js';
import { procClasses } from '../../data/palette.js';
import { REASON_TONE, reasonLabel } from '../../data/eventLabels.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { Card } from '../common/Card.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { Chip } from '../common/Badge.jsx';
import { SparkIcon } from '../common/icons.jsx';

export function ProcessHistory() {
  const { timeline, cursor } = useSim();
  const [selected, setSelected] = useState(null);

  const pid = selected ?? timeline.processes[0]?.id ?? null;
  const unit = timeline.config.unitLabel;

  const entries = useMemo(() => {
    if (!pid) return [];
    const relevant = eventsUpTo(timeline, cursor).filter((event) => event.pid === pid);
    return relevant.slice().reverse();
  }, [timeline, cursor, pid]);

  const spec = timeline.processes.find((p) => p.id === pid);

  if (timeline.processes.length === 0) {
    return (
      <Card title="Process history" icon={<SparkIcon className="h-4 w-4" />}>
        <EmptyState size="block" message="No processes in this workload." />
      </Card>
    );
  }

  return (
    <Card
      title="Process history"
      subtitle={spec ? `${pid} · priority ${spec.priority} · arrives t = ${spec.arrival}` : undefined}
      icon={<SparkIcon className="h-4 w-4" />}
      bodyClassName="p-0"
    >
      <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2">
        {timeline.processes.map((process) => {
          const active = process.id === pid;
          const styles = procClasses(process.colorIndex);
          return (
            <button
              key={process.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(process.id)}
              className={`tnum rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                active
                  ? `${styles.soft} ${styles.text} border-current`
                  : 'border-line text-ink-muted hover:bg-surface-sunken'
              }`}
            >
              {process.id}
            </button>
          );
        })}
      </div>

      {entries.length === 0 ? (
        <div className="p-4">
          <EmptyState message={`Nothing has happened to ${pid} yet.`} />
        </div>
      ) : (
        <ol className="max-h-[22rem] space-y-0 overflow-y-auto">
          {entries.map((event, index) => (
            <li
              key={event.id}
              className={`flex items-start gap-2 px-3 py-1.5 ${
                index === 0 ? 'bg-accent/5' : ''
              }`}
            >
              <span className="tnum w-10 shrink-0 pt-0.5 text-[11px] text-ink-subtle">
                {fmtTick(event.tick)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={index === 0 ? 'accent' : (REASON_TONE[event.reason] ?? 'neutral')}>
                    {reasonLabel(event.reason)}
                  </Chip>
                  <span className="text-[11px] text-ink-muted">
                    {event.from} → <span className="font-medium text-ink">{event.to}</span>
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="border-t border-line px-4 py-2 text-[11px] text-ink-subtle">
        Trace of {pid} up to t = {fmtTick(cursor)} {unit}. The highlighted row is the most recent.
      </p>
    </Card>
  );
}
