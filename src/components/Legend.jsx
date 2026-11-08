/**
 * The lifecycle legend.
 *
 * Five states (spec §5), each with its colour *and* its name. Colour alone is
 * not a label: a reader who cannot distinguish the Ready blue from the Waiting
 * amber would otherwise have no way to read the board, and the same palette is
 * used for the state badges in the process table.
 */

import { LEGEND_STATES, STATE_CLASSES, STATE_HEX } from '../data/palette.js';
import { Card } from './common/Card.jsx';
import { SparkIcon } from './common/icons.jsx';

/** One line per state, saying what puts a process there. */
const MEANING = {
  NEW: 'Created but not yet admitted — sitting in the Job Queue.',
  READY: 'Admitted and runnable, waiting for the CPU.',
  RUNNING: 'Dispatched and executing its CPU burst.',
  WAITING: 'Blocked on an I/O burst, queued or in service on a device.',
  TERMINATED: 'All bursts complete; it has left the system.',
};

export function Legend() {
  return (
    <Card
      title="Process lifecycle"
      subtitle="Spec §5 states, and what puts a process in each"
      icon={<SparkIcon className="h-4 w-4" />}
    >
      <ul className="space-y-2">
        {LEGEND_STATES.map((state) => (
          <li key={state} className="flex items-start gap-2.5">
            <span
              className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATE_HEX[state] }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <span className="text-xs font-semibold text-ink">{STATE_CLASSES[state].label}</span>
              <p className="text-[11px] leading-snug text-ink-muted">{MEANING[state]}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-subtle">
        A process returns to <span className="font-medium text-ink-muted">Ready</span> every time an
        I/O burst completes, which is why a multiburst process appears in the Ready Queue several
        times in one run.
      </p>
    </Card>
  );
}
