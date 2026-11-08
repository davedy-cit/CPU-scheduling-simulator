/**
 * The animated process token.
 *
 * This is the element spec §8 has in mind when it says "moving process tokens
 * are mandatory — a final Gantt chart alone does not meet the requirement". A
 * chip is the *same DOM node* in every column: it carries a `layoutId` derived
 * from the PID, so when a process moves from the Ready Queue to the CPU, Framer
 * Motion animates the one chip between the two positions rather than unmounting
 * one box and mounting another.
 *
 * Three details make that work rather than merely appear to:
 *
 *   - **No `AnimatePresence` here.** Combining `AnimatePresence` with `layoutId`
 *     on the same element leaves the exiting clone on screen while the entering
 *     element flies, which reads as a ghost plus a jump. Chips are only ever
 *     handed off between columns, never faded out.
 *   - **`layout="position"`** — the chip's width is set by its column, and
 *     animating width as well would make it stretch grotesquely as it crosses
 *     the board.
 *   - **`instant` on big jumps.** Running to the end or scrubbing must snap.
 *     Animating two hundred staggered flights is slower than the run itself and
 *     makes the board unreadable.
 *
 * The chip shows its PID, its current burst and a progress bar, so the animation
 * carries information: you can watch a burst drain while the token sits on the
 * CPU.
 */

import { motion } from 'framer-motion';
import { memo } from 'react';

import { procClasses, procHex } from '../../data/palette.js';
import { cx } from '../../lib/cn.js';
import { ProgressBar } from '../common/Meter.jsx';
import { Tooltip } from '../common/Tooltip.jsx';

/**
 * @param {Object} props
 * @param {string} props.pid
 * @param {number} props.colorIndex
 * @param {number} props.priority
 * @param {{burstKind: string|null, burstServed: number, burstDuration: number, burstRemaining: number, burstProgress: number}} props.progress
 * @param {string} props.locationLabel
 * @param {boolean} [props.compact] Single-line chip for narrow columns.
 * @param {boolean} [props.instant] Snap instead of animating.
 * @param {import('framer-motion').Transition} [props.transition]
 * @param {boolean} [props.highlight] Marks a chip whose state changed this tick.
 * @param {boolean} [props.showProgress]
 * @param {string} [props.className]
 */
function ProcessChipImpl({
  pid,
  colorIndex,
  priority,
  progress,
  locationLabel,
  compact = false,
  instant = false,
  transition,
  highlight = false,
  showProgress = true,
  className,
}) {
  const styles = procClasses(colorIndex);
  const burst = progress.burstKind;
  const kindLabel = burst === 'CPU' ? 'CPU' : burst ? `I/O ${burst}` : 'complete';

  const tooltip = `${pid} · priority ${priority} · ${locationLabel}${
    burst
      ? ` · ${kindLabel} burst, ${progress.burstRemaining} of ${progress.burstDuration} remaining`
      : ''
  }`;

  return (
    <Tooltip text={tooltip} className="w-full">
      <motion.div
        layoutId={`board-${pid}`}
        layout="position"
        transition={instant ? { duration: 0 } : transition}
        className={cx(
          'relative w-full min-w-0 overflow-hidden rounded-lg border bg-surface select-none',
          highlight ? cx(styles.border, 'shadow-raised') : 'border-line shadow-card',
          className,
        )}
      >
        {/* A colour bar rather than a solid fill: a chip that is entirely one
            colour fights the state palette used everywhere else. */}
        <span className={cx('absolute inset-y-0 left-0 w-[3px]', styles.bg)} aria-hidden="true" />

        <div className={cx('flex items-center gap-2 pl-2.5', compact ? 'py-1' : 'py-1.5 pr-2')}>
          <span className={cx('tnum shrink-0 text-xs font-bold', styles.text)}>{pid}</span>

          {compact ? (
            <span className="tnum ml-auto shrink-0 text-[10px] text-ink-subtle">P{priority}</span>
          ) : (
            <>
              <span className="truncate text-[10px] font-medium text-ink-muted">
                {burst ? `${kindLabel} · ${progress.burstRemaining}` : 'complete'}
              </span>
              <span className="tnum ml-auto shrink-0 rounded bg-surface-sunken px-1 text-[10px] font-semibold text-ink-muted">
                P{priority}
              </span>
            </>
          )}
        </div>

        {showProgress && !compact && burst ? (
          <ProgressBar
            value={progress.burstProgress}
            color={procHex(colorIndex)}
            height="h-0.5"
            trackClassName="rounded-none bg-surface-sunken"
            className="rounded-none"
            label={`${pid} burst progress`}
          />
        ) : null}
      </motion.div>
    </Tooltip>
  );
}

/**
 * Memoised on the values that are actually displayed.
 *
 * Copy-on-write in the engine means an untouched process keeps its object
 * identity across ticks — but a process *waiting in a queue* is patched every
 * tick to accrue its waiting counter, so its record is rebuilt even though the
 * chip does not move. Comparing record identity would therefore re-render every
 * queued chip on every tick; comparing the rendered fields does not.
 */
export const ProcessChip = memo(ProcessChipImpl, (prev, next) => {
  return (
    prev.pid === next.pid &&
    prev.colorIndex === next.colorIndex &&
    prev.priority === next.priority &&
    prev.compact === next.compact &&
    prev.instant === next.instant &&
    prev.highlight === next.highlight &&
    prev.showProgress === next.showProgress &&
    prev.transition === next.transition &&
    prev.locationLabel === next.locationLabel &&
    prev.progress.burstKind === next.progress.burstKind &&
    prev.progress.burstRemaining === next.progress.burstRemaining &&
    prev.progress.burstDuration === next.progress.burstDuration &&
    prev.progress.burstServed === next.progress.burstServed &&
    prev.progress.burstProgress === next.progress.burstProgress
  );
});
