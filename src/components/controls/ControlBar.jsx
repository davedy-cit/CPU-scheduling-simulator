/**
 * The control bar.
 *
 * Layout follows the order in which the controls are used: transport first,
 * then the parameters that change what the transport is playing (algorithm,
 * quantum, speed), then the scrubber that lets you move around the run.
 *
 * The warning banner appears here rather than in a toast because a workload
 * that failed validation changes the meaning of every panel below it — it has
 * to stay on screen, not disappear after four seconds.
 */

import { useSim } from '../../state/SimulationContext.jsx';
import { Card } from '../common/Card.jsx';
import { WarningIcon } from '../common/icons.jsx';
import { AlgorithmSelect } from './AlgorithmSelect.jsx';
import { ConfigPanel } from './ConfigPanel.jsx';
import { PlaybackControls } from './PlaybackControls.jsx';
import { QuantumInput } from './QuantumInput.jsx';
import { Scrubber } from './Scrubber.jsx';
import { SpeedControl } from './SpeedControl.jsx';

export function ControlBar() {
  const { warning } = useSim();

  return (
    <Card bodyClassName="space-y-3" className="sticky top-0 z-20">
      {warning ? (
        <div className="flex items-start gap-2 rounded-lg border border-state-waiting/40 bg-state-waiting/10 px-3 py-2 text-xs text-ink">
          <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-state-waiting" />
          <p>
            <span className="font-semibold">Simulation warning.</span> {warning}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <PlaybackControls />
        <div className="hidden h-11 w-px bg-line lg:block" />
        <AlgorithmSelect />
        <QuantumInput />
        <SpeedControl />
        <div className="ml-auto">
          <ConfigPanel />
        </div>
      </div>

      <Scrubber />
    </Card>
  );
}
