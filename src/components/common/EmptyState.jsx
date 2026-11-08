/**
 * Empty state.
 *
 * Panels that can legitimately have nothing to show — an idle device, a queue
 * with no waiters, a trace before the first event — say so explicitly rather
 * than rendering a blank box. During playback a blank box is indistinguishable
 * from a rendering bug.
 */

import { cx } from '../../lib/cn.js';

/**
 * @param {Object} props
 * @param {string} props.message
 * @param {React.ReactNode} [props.icon]
 * @param {'inline'|'block'} [props.size]
 * @param {string} [props.className]
 */
export function EmptyState({ message, icon, size = 'inline', className }) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line',
        'text-center text-ink-subtle',
        size === 'inline' ? 'px-3 py-4 text-[11px]' : 'px-6 py-10 text-sm',
        className,
      )}
    >
      {icon}
      <span>{message}</span>
    </div>
  );
}
