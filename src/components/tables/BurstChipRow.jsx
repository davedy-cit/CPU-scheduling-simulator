/**
 * A process's burst sequence, drawn as a row of chips.
 *
 * This is the view that makes the multiburst model legible. A table of numbers
 * hides the thing spec §4 is really testing — that a process alternates CPU and
 * I/O and returns to the Ready Queue several times — so each burst is drawn as a
 * chip that fills as it is serviced, and the *current* burst is the only one
 * that can be partially filled.
 *
 * Serviced amounts are read from `remaining`, not from elapsed wall time: a
 * burst only advances while its resource is actually working on it, which is
 * precisely why the spec forbids deriving waiting time by subtraction.
 */

import { cx } from '../../lib/cn.js';
import { procHex } from '../../data/palette.js';
import { Tooltip } from '../common/Tooltip.jsx';

/**
 * @param {Object} props
 * @param {import('../../engine/types.js').Burst[]} props.bursts
 * @param {number} props.burstIndex Index of the burst currently being serviced.
 * @param {number} props.remaining Time left in the current burst.
 * @param {import('../../engine/types.js').ProcState} props.state
 * @param {number} props.colorIndex
 * @param {string} props.unit
 */
export function BurstChipRow({ bursts, burstIndex, remaining, state, colorIndex, unit }) {
  const color = procHex(colorIndex);
  const terminated = state === 'TERMINATED';

  return (
    <ol className="flex flex-wrap items-center gap-1">
      {bursts.map((burst, index) => {
        const isPast = index < burstIndex || terminated;
        const isCurrent = index === burstIndex && !terminated;
        const served = isPast ? burst.duration : isCurrent ? burst.duration - remaining : 0;
        const fraction = burst.duration > 0 ? served / burst.duration : 0;

        return (
          <li key={`${burst.kind}-${index}-${burst.duration}`}>
            <Tooltip
              text={`Burst ${index + 1}: ${burst.kind === 'CPU' ? 'CPU' : `I/O on Device ${burst.kind}`} · ${burst.duration} ${unit}${
                isCurrent ? ` · ${remaining} left` : isPast ? ' · complete' : ' · not started'
              }`}
            >
              <span
                className={cx(
                  'relative inline-flex items-center gap-1 overflow-hidden rounded border px-1.5 py-0.5',
                  'tnum text-[10px] font-semibold whitespace-nowrap',
                  isPast && 'border-line bg-surface-sunken text-ink-muted',
                  isCurrent && 'border-transparent text-white',
                  !isPast && !isCurrent && 'border-dashed border-line text-ink-subtle',
                )}
                style={isCurrent ? { backgroundColor: color } : undefined}
              >
                {isCurrent ? (
                  <span
                    className="absolute inset-y-0 left-0 bg-white/25"
                    style={{ width: `${fraction * 100}%` }}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="relative">{burst.kind === 'CPU' ? 'CPU' : burst.kind}</span>
                <span className="relative opacity-80">{burst.duration}</span>
              </span>
            </Tooltip>
          </li>
        );
      })}
    </ol>
  );
}
