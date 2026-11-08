/**
 * One editable row of the workload editor.
 *
 * Fully controlled — it holds no state of its own. The draft the editor owns
 * stores the burst sequence as *text*, which is what the user is typing, so a
 * half-written `CPU 18` is never forced through a parse-and-reformat round trip
 * that would move the caret. Parsing happens one level up, on every keystroke,
 * and the result is only handed to the engine when the user applies it.
 *
 * The column template is exported so the header row and every data row share one
 * definition; duplicating a grid template in two files is how a table ends up
 * with misaligned headings.
 */

import { cx } from '../../lib/cn.js';
import { INPUT_BASE } from '../common/Field.jsx';
import { Button } from '../common/Button.jsx';
import { TrashIcon } from '../common/icons.jsx';

/**
 * Swatch · ID · Arrival · Priority · Bursts · Remove.
 *
 * Static class string rather than a computed one — Tailwind's scanner only sees
 * literals, so a template-built `grid-cols-[…]` would produce no CSS at all.
 */
export const EDITOR_GRID =
  'grid grid-cols-[0.75rem_4.5rem_4.5rem_4.5rem_minmax(12rem,1fr)_2rem] items-center gap-2';

/**
 * @param {Object} props
 * @param {{id: string, arrival: string, priority: string, burstText: string}} props.row
 * @param {number} props.index
 * @param {number} props.colorIndex
 * @param {string} props.unitLabel
 * @param {string[]} props.errors
 * @param {(patch: Partial<{id: string, arrival: string, priority: string, burstText: string}>) => void} props.onChange
 * @param {() => void} props.onRemove
 * @param {boolean} props.canRemove
 */
export function ProcessEditorRow({
  row,
  index,
  colorIndex,
  unitLabel,
  errors = [],
  onChange,
  onRemove,
  canRemove,
}) {
  const invalid = errors.length > 0;

  return (
    <div className={cx('rounded-lg px-1.5 py-1.5', invalid && 'bg-state-terminated/5')}>
      <div className={EDITOR_GRID}>
        <span
          aria-hidden="true"
          className="h-6 rounded-sm"
          style={{ background: `var(--color-proc-${colorIndex})` }}
        />

        <input
          type="text"
          value={row.id}
          onChange={(event) => onChange({ id: event.target.value })}
          aria-label={`Process ${index + 1} ID`}
          spellCheck={false}
          className={cx(INPUT_BASE, 'font-mono')}
        />

        <input
          type="number"
          min={0}
          step={1}
          value={row.arrival}
          onChange={(event) => onChange({ arrival: event.target.value })}
          aria-label={`Process ${index + 1} arrival time in ${unitLabel}`}
          className={cx(INPUT_BASE, 'tnum')}
        />

        <input
          type="number"
          min={1}
          max={5}
          step={1}
          value={row.priority}
          onChange={(event) => onChange({ priority: event.target.value })}
          aria-label={`Process ${index + 1} priority, 1 is highest`}
          className={cx(INPUT_BASE, 'tnum')}
        />

        <input
          type="text"
          value={row.burstText}
          onChange={(event) => onChange({ burstText: event.target.value })}
          aria-label={`Process ${index + 1} burst sequence`}
          placeholder="CPU 180, A 100, CPU 120"
          spellCheck={false}
          className={cx(INPUT_BASE, 'font-mono text-xs')}
        />

        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onRemove}
          disabled={!canRemove}
          label={`Remove process ${row.id || index + 1}`}
          icon={<TrashIcon className="h-4 w-4" />}
        />
      </div>

      {invalid ? (
        <ul className="mt-1 space-y-0.5 pl-5 text-xs text-state-terminated">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The column headings, laid out on the same template as the rows.
 *
 * @param {{unitLabel: string}} props
 */
export function ProcessEditorHeader({ unitLabel }) {
  return (
    <div className={cx(EDITOR_GRID, 'px-1.5 pb-1')}>
      <span />
      <ColumnLabel>ID</ColumnLabel>
      <ColumnLabel>Arrival ({unitLabel})</ColumnLabel>
      <ColumnLabel>Priority</ColumnLabel>
      <ColumnLabel>Burst sequence</ColumnLabel>
      <span />
    </div>
  );
}

/** @param {{children: React.ReactNode}} props */
function ColumnLabel({ children }) {
  return (
    <span className="truncate text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
      {children}
    </span>
  );
}
