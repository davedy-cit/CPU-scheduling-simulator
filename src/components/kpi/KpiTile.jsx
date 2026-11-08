/**
 * A single KPI tile.
 *
 * Every tile carries a label, a value and — where the number could be
 * misread — a one-line note stating how it is defined. That note is not
 * decoration: spec §9 defines several of these in ways that contradict the
 * textbook shortcut, and a bare number invites the reader to assume the
 * shortcut.
 */

import { cx } from '../../lib/cn.js';
import { ProgressBar } from '../common/Meter.jsx';
import { Tooltip } from '../common/Tooltip.jsx';

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {React.ReactNode} props.value
 * @param {string} [props.unit] Rendered smaller, after the value.
 * @param {string} [props.note] How the metric is defined.
 * @param {string} [props.help] Longer explanation, shown on hover.
 * @param {React.ReactNode} [props.icon]
 * @param {number} [props.progress] 0–1; renders a bar under the value.
 * @param {string} [props.color]
 * @param {'default'|'accent'} [props.tone]
 * @param {string} [props.className]
 */
export function KpiTile({
  label,
  value,
  unit,
  note,
  help,
  icon,
  progress,
  color,
  tone = 'default',
  className,
}) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-col justify-between rounded-card border bg-surface px-3.5 py-3',
        tone === 'accent' ? 'border-accent/30 shadow-card' : 'border-line shadow-card',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
          {help ? (
            <Tooltip text={help}>
              <span className="cursor-help border-b border-dotted border-ink-subtle">{label}</span>
            </Tooltip>
          ) : (
            label
          )}
        </span>
        {icon ? <span className="shrink-0 text-ink-subtle">{icon}</span> : null}
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        <span className="tnum text-2xl leading-none font-semibold text-ink">{value}</span>
        {unit ? <span className="text-xs font-medium text-ink-muted">{unit}</span> : null}
      </div>

      {typeof progress === 'number' ? (
        <ProgressBar
          value={progress}
          color={color}
          className="mt-2.5"
          label={`${label} progress`}
        />
      ) : null}

      {note ? <p className="mt-1.5 text-[11px] leading-snug text-ink-subtle">{note}</p> : null}
    </div>
  );
}
