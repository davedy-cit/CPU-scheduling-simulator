/**
 * Playback speed.
 *
 * Spec §8 requires playback speed to be independent of simulated time, and the
 * UI should make that independence visible rather than merely true: the control
 * shows both the multiplier and the resulting tick rate, so nobody has to guess
 * whether "4×" means four times the ticks or four times the clock.
 */

import { SPEEDS, TICKS_PER_SECOND } from '../../engine/constants.js';
import { fmtSpeed } from '../../lib/format.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { PillGroup } from '../common/Field.jsx';

export function SpeedControl() {
  const { speed, actions, timeline } = useSim();
  const rate = TICKS_PER_SECOND[speed] ?? 8;

  return (
    <div className="min-w-0">
      <PillGroup
        label="Playback speed"
        value={speed}
        onChange={actions.setSpeed}
        options={SPEEDS.map((value) => ({ value, label: fmtSpeed(value) }))}
      />
      <p className="mt-1 text-[11px] text-ink-subtle">
        {rate} simulated {timeline.config.unitLabel}/s — playback only
      </p>
    </div>
  );
}
