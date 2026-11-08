/**
 * Card / panel.
 *
 * The dashboard is a grid of these. `Card.Header` carries the title, an
 * optional subtitle and a slot for controls, so every panel's heading sits at
 * the same height with the same type scale.
 */

import { cx } from '../../lib/cn.js';

/**
 * @param {Object} props
 * @param {React.ReactNode} [props.title]
 * @param {string} [props.subtitle]
 * @param {React.ReactNode} [props.actions]
 * @param {React.ReactNode} [props.icon]
 * @param {string} [props.className]
 * @param {boolean} [props.dense] Reduces the body padding for list-heavy panels.
 */
export function CardHeader({ title, subtitle, actions, icon, className }) {
  return (
    <div
      className={cx(
        'flex items-start justify-between gap-3 border-b border-line px-4 py-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        {icon ? <span className="mt-0.5 text-ink-subtle">{icon}</span> : null}
        <div className="min-w-0">
          {title ? (
            <h2 className="truncate text-sm font-semibold tracking-tight text-ink">{title}</h2>
          ) : null}
          {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {React.ReactNode} [props.title]
 * @param {string} [props.subtitle]
 * @param {React.ReactNode} [props.actions]
 * @param {React.ReactNode} [props.icon]
 * @param {React.ReactNode} [props.footer]
 * @param {string} [props.className]
 * @param {string} [props.bodyClassName]
 * @param {boolean} [props.dense]
 * @param {'card'|'raised'|'none'} [props.elevation]
 */
export function Card({
  children,
  title,
  subtitle,
  actions,
  icon,
  footer,
  className,
  bodyClassName,
  dense = false,
  elevation = 'card',
  ...rest
}) {
  return (
    <section
      className={cx(
        'flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface',
        elevation === 'card' && 'shadow-card',
        elevation === 'raised' && 'shadow-raised',
        className,
      )}
      {...rest}
    >
      {title || actions ? (
        <CardHeader title={title} subtitle={subtitle} actions={actions} icon={icon} />
      ) : null}
      <div className={cx('min-w-0 flex-1', dense ? 'p-3' : 'p-4', bodyClassName)}>{children}</div>
      {footer ? <div className="border-t border-line px-4 py-2.5">{footer}</div> : null}
    </section>
  );
}
