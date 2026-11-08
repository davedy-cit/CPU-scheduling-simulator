/**
 * Tooltip.
 *
 * CSS-only: a positioned span revealed on hover *and* focus. Pure CSS keeps it
 * out of the render path — during playback the dashboard re-renders every tick,
 * and a tooltip that measured its own position in an effect would add work to
 * every one of those frames.
 *
 * The wrapped content is also given an `aria-describedby`-free fallback: the
 * tooltip text is `aria-hidden`, and callers pass a real accessible name to the
 * control itself. A tooltip is a convenience, never the only label.
 */

import { cx } from '../../lib/cn.js';

/**
 * @param {Object} props
 * @param {string} props.text
 * @param {React.ReactNode} props.children
 * @param {'top'|'bottom'|'left'|'right'} [props.side]
 * @param {string} [props.className]
 */
export function Tooltip({ text, children, side = 'top', className }) {
  if (!text) return children;

  return (
    <span className={cx('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute z-30 hidden max-w-56 rounded-md bg-ink px-2 py-1',
          'text-[11px] leading-snug font-medium text-white shadow-raised group-hover/tt:block',
          'group-focus-within/tt:block',
          side === 'top' && 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
          side === 'bottom' && 'top-full left-1/2 mt-1.5 -translate-x-1/2',
          side === 'left' && 'top-1/2 right-full mr-1.5 -translate-y-1/2',
          side === 'right' && 'top-1/2 left-full ml-1.5 -translate-y-1/2',
        )}
      >
        {text}
      </span>
    </span>
  );
}
