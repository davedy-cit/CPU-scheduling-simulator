/**
 * Bars and meters.
 *
 * Utilisation percentages are always printed as a number next to the bar, never
 * conveyed by bar length alone — a bar that is 2% full and a bar that failed to
 * render look identical.
 */

import { cx } from '../../lib/cn.js';
import { clamp01 } from '../../lib/format.js';

/**
 * A horizontal progress meter.
 *
 * @param {Object} props
 * @param {number} props.value 0–1.
 * @param {string} [props.color] CSS colour for the filled portion.
 * @param {string} [props.className]
 * @param {string} [props.trackClassName]
 * @param {string} [props.label] Accessible name.
 * @param {number} [props.height] Tailwind height class override.
 */
export function ProgressBar({ value, color, className, trackClassName, label, height = 'h-1.5' }) {
  const pct = clamp01(value) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cx(
        'w-full overflow-hidden rounded-full bg-surface-sunken',
        height,
        trackClassName,
        className,
      )}
    >
      <div
        className="h-full rounded-full transition-[width] duration-200 ease-out"
        style={{ width: `${pct}%`, backgroundColor: color ?? 'var(--color-accent)' }}
      />
    </div>
  );
}

/**
 * A labelled percentage readout with a supporting bar.
 *
 * @param {Object} props
 * @param {string} props.label
 * @param {number} props.percent 0–100.
 * @param {string} [props.color]
 * @param {string} [props.detail] Secondary line, e.g. `230 of 1200 ms`.
 * @param {string} [props.className]
 */
export function UtilizationMeter({ label, percent, color, detail, className }) {
  const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  return (
    <div className={cx('min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
          {label}
        </span>
        <span className="tnum text-sm font-semibold text-ink">{safe.toFixed(1)}%</span>
      </div>
      <ProgressBar value={safe / 100} color={color} className="mt-1.5" label={label} />
      {detail ? <p className="mt-1 truncate text-[11px] text-ink-subtle">{detail}</p> : null}
    </div>
  );
}
