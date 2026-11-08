/**
 * Advanced configuration.
 *
 * Two settings that the brief treats as defaults rather than features, so they
 * live behind a disclosure instead of cluttering the control bar:
 *
 *   - **Context-switch overhead** (spec §7: "0 by default"). Raising it is the
 *     experiment §10 asks about — how a switch penalty changes the ranking of
 *     the algorithms — so the control has to exist, but it must not be on by
 *     accident.
 *   - **Admission limit** (spec §5: the Job Queue is unlimited by default).
 *     Setting it to 1 gives a uniprogrammed system, which is a useful contrast.
 *
 * The unit label is also here: it changes only how time is printed, never how it
 * is simulated.
 */

import { useState } from 'react';

import { DEFAULT_UNIT_LABEL } from '../../engine/constants.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { Button } from '../common/Button.jsx';
import { NumberInput, TextInput } from '../common/Field.jsx';
import { ChevronDownIcon, SettingsIcon } from '../common/icons.jsx';

export function ConfigPanel() {
  const { config, actions, timeline } = useSim();
  const [open, setOpen] = useState(false);

  const unit = timeline.config.unitLabel;
  const overheadOn = config.switchOverhead > 0;
  const limited = config.admissionLimit !== null && config.admissionLimit !== undefined;

  return (
    <div className="w-full">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        icon={<SettingsIcon className="h-3.5 w-3.5" />}
      >
        Advanced
        <ChevronDownIcon
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
        {overheadOn || limited ? (
          <span className="ml-1 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        ) : null}
      </Button>

      {open ? (
        <div className="mt-2 grid gap-3 rounded-lg border border-line bg-surface-sunken p-3 sm:grid-cols-3">
          <NumberInput
            label="Context-switch overhead"
            value={config.switchOverhead}
            min={0}
            step={1}
            suffix="u"
            hint={
              overheadOn
                ? `Each switch now costs ${config.switchOverhead} ${unit} of CPU time`
                : 'Spec §7 default: zero-cost switch'
            }
            onChange={(event) => {
              const parsed = Math.trunc(Number(event.target.value));
              actions.setConfig({
                switchOverhead: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
              });
            }}
          />

          <NumberInput
            label="Admission limit"
            value={limited ? config.admissionLimit : ''}
            min={1}
            step={1}
            placeholder="unlimited"
            hint={
              limited
                ? `At most ${config.admissionLimit} in the system at once`
                : 'Spec §5 default: the Job Queue is unlimited'
            }
            onChange={(event) => {
              const raw = event.target.value;
              if (raw.trim() === '') {
                actions.setConfig({ admissionLimit: null });
                return;
              }
              const parsed = Math.trunc(Number(raw));
              actions.setConfig({
                admissionLimit: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
              });
            }}
          />

          <TextInput
            label="Time unit label"
            value={config.unitLabel}
            maxLength={8}
            hint="Display only — the engine always counts ticks"
            onChange={(event) => {
              const next = event.target.value.trim();
              actions.setConfig({ unitLabel: next === '' ? DEFAULT_UNIT_LABEL : next });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
