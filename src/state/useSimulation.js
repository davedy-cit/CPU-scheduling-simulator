/**
 * The single hook that binds the engine to React.
 *
 * Two pieces of state, and the split matters:
 *
 *   - the **timeline**, which is a pure function of `(workload, config)` and is
 *     therefore memoised rather than stored. `simulate` runs the entire schedule
 *     to completion in single-digit milliseconds, so recomputing it whenever an
 *     input changes is cheaper and far less error-prone than incremental
 *     updates would be.
 *   - the **playback cursor**, which is genuinely mutable UI state and lives in
 *     a reducer.
 *
 * Everything the UI shows is derived from `(timeline, cursor)` and nothing else,
 * which is why Reset is exactly reproducible and why Compare All is six calls
 * over one frozen workload.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

import { simulate } from '../engine/simulate.js';
import { DEFAULT_CONFIG } from '../engine/constants.js';
import { SAMPLE_WORKLOAD } from '../data/sampleWorkload.js';
import { cloneWorkload } from '../engine/workload.js';
import { INITIAL_PLAYBACK, clampCursor, playbackReducer } from './playbackReducer.js';
import { usePlaybackLoop } from '../hooks/usePlaybackLoop.js';

/**
 * @param {Object} [options]
 * @param {import('../engine/types.js').ProcessSpec[]} [options.initialWorkload]
 * @param {Partial<import('../engine/types.js').SimConfig>} [options.initialConfig]
 */
export function useSimulation({ initialWorkload, initialConfig } = {}) {
  const [workload, setWorkloadState] = useState(() => initialWorkload ?? SAMPLE_WORKLOAD);

  const [config, setConfigState] = useReducer(
    (current, patch) => ({ ...current, ...patch }),
    { ...DEFAULT_CONFIG, ...initialConfig },
  );

  const [playback, dispatch] = useReducer(playbackReducer, INITIAL_PLAYBACK);

  // The whole run, recomputed only when an input actually changes. The workload
  // is cloned on the way in so a later edit cannot retroactively change a
  // timeline that is still on screen.
  const timeline = useMemo(() => simulate(cloneWorkload(workload), config), [workload, config]);

  const maxCursor = Math.max(0, timeline.snapshots.length - 1);

  /**
   * The render-time clamp — the one that actually prevents a crash.
   *
   * Changing the algorithm or quantum can *shrink* the timeline, and the stored
   * cursor would then index past the end. Deriving the clamped value here rather
   * than storing it means no render ever sees an out-of-range cursor, with no
   * flash of `undefined` between an effect and a second render.
   */
  const cursor = clampCursor(playback.cursor, maxCursor);

  /**
   * Pull the *stored* cursor back when the timeline shrinks.
   *
   * The render clamp alone is not enough. If the stored cursor is 500 and the
   * new timeline ends at 300, the clamp shows 300 — but pressing "step back"
   * would compute 499, clamp to 300 again, and appear to do nothing. Keeping
   * the stored value in range makes the controls behave as they look.
   *
   * This only dispatches when the cursor is genuinely out of range, so the
   * ordinary path costs no extra render.
   */
  useEffect(() => {
    if (playback.cursor > maxCursor) dispatch({ type: 'reclamp', maxCursor });
  }, [maxCursor, playback.cursor]);

  const snapshot = timeline.snapshots[cursor] ?? null;

  /** Every navigation action carries the bound, so the reducer cannot store a stale cursor. */
  const send = useCallback(
    (action) => dispatch({ ...action, maxCursor, timeline }),
    [maxCursor, timeline],
  );

  const advance = useCallback((ticks) => send({ type: 'advance', by: ticks }), [send]);

  usePlaybackLoop({
    playing: playback.playing,
    speed: playback.speed,
    onAdvance: advance,
    shouldStop: () => cursor >= maxCursor,
  });

  const actions = useMemo(
    () => ({
      play: () => send({ type: 'play' }),
      pause: () => send({ type: 'pause' }),
      toggle: () => send({ type: 'toggle' }),
      reset: () => send({ type: 'reset' }),
      stepForward: () => send({ type: 'step', by: 1 }),
      stepBack: () => send({ type: 'step', by: -1 }),
      nextEvent: () => send({ type: 'nextEvent' }),
      prevEvent: () => send({ type: 'prevEvent' }),
      runToEnd: () => send({ type: 'runToEnd' }),
      seek: (tick) => send({ type: 'setCursor', cursor: tick }),
      setSpeed: (speed) => send({ type: 'setSpeed', speed }),

      /**
       * Changing the algorithm or quantum keeps the cursor at the same clock
       * tick. That is deliberate: comparing six algorithms at the same instant
       * is the whole point of the Compare All panel, and having the clock jump
       * to zero on every algorithm change would make the dashboard unusable.
       */
      setConfig: (patch) => setConfigState(patch),

      /** A new workload starts from the beginning, because the old cursor is meaningless. */
      setWorkload: (next) => {
        setWorkloadState(cloneWorkload(next));
        dispatch({ type: 'reset' });
      },
    }),
    [send],
  );

  return {
    // Inputs
    workload,
    config,
    // Derived
    timeline,
    maxCursor,
    cursor,
    snapshot,
    atEnd: cursor >= maxCursor,
    warning: timeline.warning,
    // Playback
    playing: playback.playing,
    speed: playback.speed,
    motion: playback.motion,
    delta: playback.delta,
    actions,
  };
}
