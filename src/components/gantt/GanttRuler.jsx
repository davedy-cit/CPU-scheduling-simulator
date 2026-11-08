/**
 * The Gantt time axis.
 *
 * Tick spacing is chosen from the run's own length rather than fixed, because
 * the assignment's default workload runs for over a thousand units while the
 * textbook validation presets run for under thirty. A fixed interval produces
 * either three labels or three hundred.
 *
 * Labels are placed at multiples of a "nice" step (1, 2, 5, 10, 20, 50 …), so
 * the reader can read a duration off the axis by subtraction.
 */

import { fmtTick } from '../../lib/format.js';

/**
 * Round a raw interval up to the nearest 1/2/5 × 10ⁿ.
 *
 * @param {number} raw
 * @returns {number}
 */
function niceStep(raw) {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const multiple = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return multiple * magnitude;
}

/**
 * @param {Object} props
 * @param {number} props.totalTicks Total width of the axis, in simulated units.
 * @param {number} props.cursor
 * @param {number} [props.labelCount] Approximate number of labels to aim for.
 * @param {number} [props.gutter] Left gutter in rem, to align with the lane labels.
 */
export function GanttRuler({ totalTicks, cursor, labelCount = 10, gutter = 0 }) {
  const total = Math.max(1, totalTicks);
  const step = niceStep(total / labelCount);

  const marks = [];
  for (let tick = 0; tick <= total; tick += step) marks.push(tick);
  // Always anchor the right-hand end, so the reader can see the full extent even
  // when the last multiple of `step` falls short of it.
  if (marks[marks.length - 1] !== total) marks.push(total);

  return (
    <div className="flex items-stretch">
      <div className="shrink-0" style={{ width: `${gutter}rem` }} />
      <div className="relative h-6 min-w-0 flex-1 border-b border-line">
        {marks.map((tick) => {
          const left = (tick / total) * 100;
          return (
            <div key={tick} className="absolute top-0 h-full" style={{ left: `${left}%` }}>
              <span className="absolute bottom-0 h-2 w-px bg-line-strong" />
              {/* The end labels are pulled back inside the track rather than
                  allowed to overflow it. */}
              <span
                className={`tnum absolute bottom-2 text-[10px] whitespace-nowrap text-ink-subtle ${
                  tick === 0 ? 'left-0' : tick === total ? 'right-0' : 'left-0 -translate-x-1/2'
                }`}
              >
                {fmtTick(tick)}
              </span>
            </div>
          );
        })}

        <span
          className="absolute -bottom-px h-2 w-px bg-accent"
          style={{ left: `${(cursor / total) * 100}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
