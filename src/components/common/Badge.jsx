/**
 * Badges and meters.
 *
 * `StateBadge` renders a lifecycle state (spec §5) with both its colour and its
 * name, because colour alone fails for colour-blind readers and in print.
 */

import { cx } from '../../lib/cn.js';
import { stateClasses } from '../../data/palette.js';

/**
 * @param {Object} props
 * @param {import('../../engine/types.js').ProcState|string} props.state
 * @param {'solid'|'soft'|'outline'} [props.tone]
 * @param {string} [props.className]
 */
export function StateBadge({ state, tone = 'soft', className }) {
  const styles = stateClasses(state);
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        tone === 'solid' && cx(styles.bg, 'text-white'),
        tone === 'soft' && cx(styles.soft, styles.text),
        tone === 'outline' && cx('border border-current bg-transparent', styles.text),
        className,
      )}
    >
      {styles.label}
    </span>
  );
}

/**
 * A neutral chip, for algorithm names, counts and units.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 * @param {'neutral'|'accent'|'warn'} [props.tone]
 */
export function Chip({ children, className, tone = 'neutral' }) {
  return (
    <span
      className={cx(
        'tnum inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold',
        tone === 'neutral' && 'border-line bg-surface-sunken text-ink-muted',
        tone === 'accent' && 'border-accent/30 bg-accent/10 text-accent',
        tone === 'warn' && 'border-state-waiting/40 bg-state-waiting/10 text-state-waiting',
        className,
      )}
    >
      {children}
    </span>
  );
}

