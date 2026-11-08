/**
 * Form primitives: labelled select, number input and text input.
 *
 * All three share the same label/hint/error furniture, so the control bar and
 * the workload editor look like one application.
 */

import { useId } from 'react';

import { cx } from '../../lib/cn.js';
import { ChevronDownIcon } from './icons.jsx';

const CONTROL_BASE =
  'w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink ' +
  'placeholder:text-ink-subtle focus:border-accent focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle';

/**
 * The shared input chrome, exported for the workload editor's grid.
 *
 * That grid carries its column names in a single header row rather than a label
 * above every cell, so it cannot use `TextInput`/`NumberInput` — but it must not
 * drift away from them visually either.
 */
export const INPUT_BASE = `${CONTROL_BASE} h-9`;

/** @param {Object} props */
function FieldShell({ label, hint, error, htmlFor, className, children }) {
  return (
    <div className={cx('min-w-0', className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="mb-1 block text-[11px] font-semibold tracking-wide text-ink-muted uppercase"
        >
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-state-terminated">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {string} [props.label]
 * @param {string} [props.hint]
 * @param {Array<{value: string, label: string, disabled?: boolean}>} props.options
 * @param {string} [props.className]
 */
export function Select({ label, hint, error, options, className, id, ...rest }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={inputId} className={className}>
      <div className="relative">
        <select
          id={inputId}
          className={cx(CONTROL_BASE, 'h-9 cursor-pointer appearance-none pr-8')}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
      </div>
    </FieldShell>
  );
}

/**
 * @param {Object} props
 * @param {string} [props.label]
 * @param {string} [props.hint]
 * @param {string} [props.suffix] Unit rendered inside the input, e.g. `ms`.
 * @param {string} [props.className]
 */
export function NumberInput({ label, hint, error, suffix, className, id, ...rest }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={inputId} className={className}>
      <div className="relative">
        <input
          id={inputId}
          type="number"
          className={cx(CONTROL_BASE, 'tnum h-9', suffix && 'pr-10')}
          {...rest}
        />
        {suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-ink-subtle">
            {suffix}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
}

/**
 * @param {Object} props
 * @param {string} [props.label]
 * @param {string} [props.hint]
 * @param {string} [props.className]
 */
export function TextInput({ label, hint, error, className, id, mono = false, ...rest }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={inputId} className={className}>
      <input
        id={inputId}
        type="text"
        className={cx(CONTROL_BASE, 'h-9', mono && 'font-mono')}
        {...rest}
      />
    </FieldShell>
  );
}

/**
 * A horizontal set of mutually exclusive pills — used for playback speed, where
 * a select would hide the alternatives behind a click.
 *
 * @param {Object} props
 * @param {string} [props.label]
 * @param {Array<{value: any, label: string}>} props.options
 * @param {any} props.value
 * @param {(value: any) => void} props.onChange
 * @param {string} [props.className]
 */
export function PillGroup({ label, options, value, onChange, className }) {
  return (
    <div className={cx('min-w-0', className)}>
      {label ? (
        <span className="mb-1 block text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
          {label}
        </span>
      ) : null}
      <div
        role="group"
        aria-label={label}
        className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cx(
                'tnum h-7 rounded-md px-2 text-xs font-semibold transition-colors',
                selected
                  ? 'bg-surface text-ink shadow-card'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
