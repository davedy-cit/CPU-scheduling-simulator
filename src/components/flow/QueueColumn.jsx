/**
 * A column on the process-flow board.
 *
 * The board is one `LayoutGroup`, so a chip handed from the Ready Queue to the
 * CPU animates across the two columns. Each column is a scroll container, and
 * each carries `layoutScroll`: without it Framer Motion measures chip positions
 * against the page rather than the scrolled container, and after any scroll a
 * chip flies to a position that is offset by exactly the scroll distance. It is
 * the single most common way a shared-layout board goes wrong.
 */

import { motion } from 'framer-motion';

import { cx } from '../../lib/cn.js';

/**
 * @param {Object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {React.ReactNode} [props.icon]
 * @param {number} [props.count]
 * @param {React.ReactNode} props.children
 * @param {React.ReactNode} [props.footer]
 * @param {string} [props.accent] Tailwind text-colour class for the header rule.
 * @param {boolean} [props.scroll] Whether the body scrolls. Fixed-height panels
 *   (the CPU, a device) do not need it.
 * @param {string} [props.className]
 * @param {string} [props.bodyClassName]
 */
export function QueueColumn({
  title,
  subtitle,
  icon,
  count,
  children,
  footer,
  accent = 'text-ink-subtle',
  scroll = true,
  className,
  bodyClassName,
}) {
  return (
    <section
      className={cx(
        'flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card',
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-2.5 py-2">
        {icon ? <span className={cx('shrink-0', accent)}>{icon}</span> : null}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs font-semibold text-ink">{title}</h3>
          {subtitle ? (
            <p className="truncate text-[10px] text-ink-subtle">{subtitle}</p>
          ) : null}
        </div>
        {typeof count === 'number' ? (
          <span className="tnum shrink-0 rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">
            {count}
          </span>
        ) : null}
      </header>

      <motion.div
        // `layoutScroll` is what makes a shared-layout flight land correctly
        // inside a scrolled container. Without it Framer Motion measures the
        // chip against the viewport, so the chip flies to a spot offset by
        // exactly the scroll distance — the classic shared-layout bug. It is
        // set from `scroll` rather than unconditionally so the non-scrolling
        // panels (CPU, devices) do not pay for a measurement they never need.
        layoutScroll={scroll}
        className={cx(
          'flex min-h-0 flex-1 flex-col gap-1.5 p-2',
          scroll && 'overflow-y-auto',
          bodyClassName,
        )}
      >
        {children}
      </motion.div>

      {footer ? (
        <div className="border-t border-line px-2.5 py-1.5 text-[10px] text-ink-subtle">{footer}</div>
      ) : null}
    </section>
  );
}
