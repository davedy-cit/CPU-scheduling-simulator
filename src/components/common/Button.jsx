/**
 * Button.
 *
 * One component covers the control bar's icon buttons, the panel actions and
 * the destructive buttons in the editor, so the whole dashboard has a single
 * set of hover/focus/disabled behaviours.
 *
 * `title` is always set from `label` when no visible text is rendered — an
 * icon-only button with no accessible name is unusable with a screen reader and
 * unguessable with a mouse.
 */

import { cx } from '../../lib/cn.js';

const VARIANTS = {
  primary: 'bg-accent text-white hover:bg-accent-hover border-transparent shadow-card',
  secondary: 'bg-surface text-ink border-line hover:bg-surface-sunken',
  ghost: 'bg-transparent text-ink-muted border-transparent hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-surface text-state-terminated border-line hover:bg-state-terminated/10',
};

const SIZES = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3 text-sm gap-2',
  lg: 'h-11 px-4 text-sm gap-2',
  icon: 'h-9 w-9 justify-center',
  'icon-sm': 'h-8 w-8 justify-center',
};

/**
 * @param {Object} props
 * @param {React.ReactNode} [props.children]
 * @param {React.ReactNode} [props.icon]
 * @param {string} [props.label] Accessible name; required for icon-only buttons.
 * @param {keyof VARIANTS} [props.variant]
 * @param {keyof SIZES} [props.size]
 * @param {boolean} [props.active] Renders the pressed state for toggles.
 * @param {string} [props.title]
 * @param {string} [props.className]
 */
export function Button({
  children,
  icon,
  label,
  variant = 'secondary',
  size = 'md',
  active = false,
  title,
  className,
  type = 'button',
  ...rest
}) {
  const accessibleName = label ?? title ?? (typeof children === 'string' ? children : undefined);

  return (
    <button
      type={type}
      title={title ?? accessibleName}
      aria-label={accessibleName}
      aria-pressed={rest['aria-pressed'] ?? (active || undefined)}
      className={cx(
        'inline-flex items-center rounded-lg border font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant] ?? VARIANTS.secondary,
        SIZES[size] ?? SIZES.md,
        active && 'border-accent/40 bg-accent/10 text-accent',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
