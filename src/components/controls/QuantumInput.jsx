/**
 * Round Robin quantum.
 *
 * Spec §8: the quantum defaults to 75 and is editable. It is disabled — not
 * merely ignored — under the other five algorithms, so the control never
 * implies an effect it does not have.
 *
 * The value is clamped on blur rather than on every keystroke. Clamping while
 * typing makes the field impossible to edit: clearing it to type "100" would
 * snap it back to 1 before the "1" was entered.
 */

import { useState } from 'react';

import { ALGORITHM_BY_ID, DEFAULT_QUANTUM, MIN_QUANTUM } from '../../engine/constants.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { Button } from '../common/Button.jsx';
import { NumberInput } from '../common/Field.jsx';

export function QuantumInput() {
  const { config, actions } = useSim();
  const enabled = Boolean(ALGORITHM_BY_ID[config.algorithm]?.needsQuantum);

  // Local draft so the field can hold an intermediate value while typing.
  const [draft, setDraft] = useState(String(config.quantum));
  const [syncedQuantum, setSyncedQuantum] = useState(config.quantum);

  // Follow the config when the quantum changes from somewhere else — "Reset to
  // 75", or loading a preset that pins one. Adjusted during render rather than
  // in an effect so the field never shows a stale value for a frame after the
  // quantum it is describing has already changed.
  if (config.quantum !== syncedQuantum) {
    setSyncedQuantum(config.quantum);
    setDraft(String(config.quantum));
  }

  const commit = (raw) => {
    const parsed = Math.trunc(Number(raw));
    const next = Number.isFinite(parsed) ? Math.max(MIN_QUANTUM, parsed) : config.quantum;
    setDraft(String(next));
    if (next !== config.quantum) actions.setConfig({ quantum: next });
  };

  const overMax = config.quantum > DEFAULT_QUANTUM;

  return (
    <div className="min-w-0">
      <NumberInput
        label="RR quantum"
        value={draft}
        min={MIN_QUANTUM}
        step={1}
        disabled={!enabled}
        suffix="u"
        className="w-28"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        hint={enabled ? undefined : 'Round Robin only'}
      />
      <div className="mt-1 flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          disabled={!enabled || config.quantum === DEFAULT_QUANTUM}
          onClick={() => actions.setConfig({ quantum: DEFAULT_QUANTUM })}
        >
          Reset to {DEFAULT_QUANTUM}
        </Button>
        {enabled && overMax ? (
          <span className="text-[11px] text-ink-subtle">long quantum ≈ FCFS</span>
        ) : null}
      </div>
    </div>
  );
}
