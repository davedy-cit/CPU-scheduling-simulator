/**
 * Algorithm selector.
 *
 * Changing the algorithm re-runs the same frozen workload and keeps the cursor
 * at the same clock reading, so the reader can flip between two schedulers and
 * watch the same instant differ. Resetting the clock on every change would make
 * that comparison impossible.
 */

import { ALGORITHMS } from '../../engine/constants.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { Chip } from '../common/Badge.jsx';
import { Select } from '../common/Field.jsx';

export function AlgorithmSelect() {
  const { config, actions } = useSim();
  const active = ALGORITHMS.find((a) => a.id === config.algorithm);

  return (
    <div className="min-w-0">
      <Select
        label="Scheduling algorithm"
        value={config.algorithm}
        onChange={(event) => actions.setConfig({ algorithm: event.target.value })}
        options={ALGORITHMS.map((a) => ({ value: a.id, label: a.label }))}
        className="min-w-[15rem]"
      />
      <div className="mt-1 flex items-center gap-1.5">
        <Chip tone={active?.preemptive ? 'accent' : 'neutral'}>
          {active?.preemptive ? 'Preemptive' : 'Non-preemptive'}
        </Chip>
        {active?.needsQuantum ? <Chip>Quantum-based</Chip> : null}
      </div>
    </div>
  );
}
