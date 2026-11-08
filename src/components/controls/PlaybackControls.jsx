/**
 * The transport: Play/Pause, single-step, event navigation, run-to-end, Reset.
 *
 * Spec §8 asks for Start / Pause / Resume / Reset / Next Event / Step 1 Unit.
 * Start, Pause and Resume are one toggle button whose icon and label follow the
 * current state, because a button that says "Start" while the run is playing is
 * the most common way a simulator misleads its user.
 *
 * Every button is disabled exactly when it would do nothing, so the controls
 * double as a readout of where the cursor is.
 */

import { useSim } from '../../state/SimulationContext.jsx';
import { nextEventTick } from '../../engine/selectors.js';
import { Button } from '../common/Button.jsx';
import { Tooltip } from '../common/Tooltip.jsx';
import {
  FastForwardIcon,
  NextEventIcon,
  PauseIcon,
  PlayIcon,
  PrevEventIcon,
  ResetIcon,
  StepBackIcon,
  StepForwardIcon,
} from '../common/icons.jsx';

export function PlaybackControls() {
  const { cursor, maxCursor, atEnd, playing, actions, timeline, snapshot } = useSim();

  const unit = timeline.config.unitLabel;
  const upcoming = nextEventTick(timeline, cursor);
  const atStart = cursor <= 0;
  const empty = maxCursor <= 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="primary"
        size="lg"
        onClick={actions.toggle}
        disabled={empty}
        icon={playing ? <PauseIcon /> : <PlayIcon />}
        className="min-w-[6.5rem]"
        label={playing ? 'Pause simulation' : atEnd ? 'Restart simulation' : 'Start simulation'}
      >
        {playing ? 'Pause' : atEnd ? 'Restart' : 'Start'}
      </Button>

      <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface p-1">
        <Tooltip text="Step back one simulated unit (←)">
          <Button
            size="icon"
            variant="ghost"
            onClick={actions.stepBack}
            disabled={atStart}
            icon={<StepBackIcon />}
            label="Step back one unit"
          />
        </Tooltip>
        <Tooltip text="Step forward one simulated unit (→)">
          <Button
            size="icon"
            variant="ghost"
            onClick={actions.stepForward}
            disabled={atEnd}
            icon={<StepForwardIcon />}
            label="Step forward one unit"
          />
        </Tooltip>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <Tooltip text="Jump to the previous tick carrying an event (Shift + ←)">
          <Button
            size="icon"
            variant="ghost"
            onClick={actions.prevEvent}
            disabled={atStart}
            icon={<PrevEventIcon />}
            label="Previous event"
          />
        </Tooltip>
        <Tooltip
          text={
            upcoming === null
              ? 'No further events'
              : `Jump to the next event at t = ${upcoming} ${unit} (Shift + →)`
          }
        >
          <Button
            size="icon"
            variant="ghost"
            onClick={actions.nextEvent}
            disabled={atEnd || upcoming === null}
            icon={<NextEventIcon />}
            label="Next event"
          />
        </Tooltip>
      </div>

      <Tooltip text="Advance straight to the end of the run (End)">
        <Button
          onClick={actions.runToEnd}
          disabled={atEnd}
          icon={<FastForwardIcon />}
          label="Run to end"
        >
          Run to end
        </Button>
      </Tooltip>

      <Tooltip text="Return to t = 0. The run is precomputed, so a reset reproduces it exactly (Home)">
        <Button onClick={actions.reset} disabled={atStart && !playing} icon={<ResetIcon />}>
          Reset
        </Button>
      </Tooltip>

      <p className="ml-1 hidden text-xs text-ink-subtle lg:block">
        {snapshot ? `${snapshot.counters.elapsed} ${unit} simulated` : ''}
      </p>
    </div>
  );
}
