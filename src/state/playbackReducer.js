/**
 * Playback state machine.
 *
 * The engine precomputes the whole run, so every control the assignment asks
 * for — Start, Pause, Resume, Reset, Next Event, Step 1 Unit, Run to end, scrub
 * — is cursor arithmetic over `timeline.snapshots`. There is no second
 * "fast-forward" code path, which is the single largest source of divergence in
 * step-wise simulators: they routinely produce a different final state after
 * Reset than on the first run, and spec §7 grades reproducible traces.
 *
 * The reducer deliberately does **not** hold the timeline. The timeline is a
 * pure function of (workload, config) and is memoised in `useSimulation`; the
 * reducer only tracks where the cursor is and whether it is moving.
 *
 * Cursor clamping happens in two places on purpose:
 *   - here, against the `maxCursor` every navigation action carries, so the
 *     stored cursor cannot run past the end; and
 *   - again in `useSimulation` at render time, because changing the algorithm
 *     or quantum can *shrink* the timeline and a cursor that was valid a moment
 *     ago would then index past the end and read `undefined`.
 *
 * The second clamp is what actually prevents the crash; the first keeps the
 * state itself honest. See the README.
 */

import { SPEEDS } from '../engine/constants.js';

/**
 * @typedef {Object} PlaybackState
 * @property {number} cursor Index into `timeline.snapshots`; also the clock value shown.
 * @property {boolean} playing
 * @property {number} speed One of `SPEEDS`.
 * @property {'none'|'step'|'jump'} motion How the cursor last moved, so the animation
 *   layer can snap on large jumps instead of playing hundreds of staggered transitions.
 * @property {number} delta How many ticks the cursor moved on the last action.
 */

/** @type {PlaybackState} */
export const INITIAL_PLAYBACK = {
  cursor: 0,
  playing: false,
  speed: 1,
  motion: 'none',
  delta: 0,
};

/**
 * Clamp a cursor into `[0, maxCursor]`.
 *
 * @param {number} cursor
 * @param {number} maxCursor
 * @returns {number}
 */
export function clampCursor(cursor, maxCursor) {
  if (!Number.isFinite(cursor)) return 0;
  if (!Number.isFinite(maxCursor)) return Math.max(0, Math.trunc(cursor));
  return Math.max(0, Math.min(Math.trunc(cursor), Math.max(0, maxCursor)));
}

/**
 * The next tick at or after `cursor + 1` that has at least one event, or
 * `maxCursor` when no later event exists.
 *
 * Used by "Next Event", which must land on the next *interesting* instant
 * rather than simply advancing one tick — the whole point of the control is to
 * skip the stretches where nothing happens.
 *
 * @param {import('../engine/types.js').Timeline} timeline
 * @param {number} cursor
 * @param {number} maxCursor
 * @returns {number}
 */
export function nextEventCursor(timeline, cursor, maxCursor) {
  const from = cursor + 1;
  for (let t = from; t <= maxCursor; t++) {
    const snap = timeline.snapshots[t];
    if (snap && snap.lastEventIds.length > 0) return t;
  }
  return maxCursor;
}

/**
 * The previous tick at or before `cursor - 1` that has at least one event, or 0.
 *
 * @param {import('../engine/types.js').Timeline} timeline
 * @param {number} cursor
 * @returns {number}
 */
export function prevEventCursor(timeline, cursor) {
  for (let t = cursor - 1; t >= 0; t--) {
    const snap = timeline.snapshots[t];
    if (snap && snap.lastEventIds.length > 0) return t;
  }
  return 0;
}

/**
 * @typedef {Object} Action
 * @property {string} type
 * @property {number} [cursor]
 * @property {number} [by]
 * @property {number} [speed]
 * @property {number} [maxCursor]
 * @property {import('../engine/types.js').Timeline} [timeline]
 */

/**
 * @param {PlaybackState} state
 * @param {Action} action
 * @returns {PlaybackState}
 */
export function playbackReducer(state, action) {
  // An absent bound means "unbounded", not "zero". Defaulting to 0 would make
  // `play` believe the run was already finished and reset the cursor on every
  // press, so the distinction is load-bearing rather than defensive noise.
  const max = Number.isFinite(action.maxCursor) ? Math.max(0, action.maxCursor) : Infinity;

  switch (action.type) {
    /** Scrub to an exact tick. */
    case 'setCursor': {
      const cursor = clampCursor(action.cursor ?? 0, max);
      return { ...state, cursor, motion: 'jump', delta: cursor - state.cursor, playing: false };
    }

    /** Step forward or back by whole ticks. Pauses, as stepping implies. */
    case 'step': {
      const by = action.by ?? 1;
      const cursor = clampCursor(state.cursor + by, max);
      return { ...state, cursor, motion: 'step', delta: cursor - state.cursor, playing: false };
    }

    /** Jump to the next tick carrying an event. */
    case 'nextEvent': {
      const cursor = nextEventCursor(action.timeline, state.cursor, max);
      return { ...state, cursor, motion: 'jump', delta: cursor - state.cursor, playing: false };
    }

    /** Jump to the previous tick carrying an event. */
    case 'prevEvent': {
      const cursor = prevEventCursor(action.timeline, state.cursor);
      return { ...state, cursor, motion: 'jump', delta: cursor - state.cursor, playing: false };
    }

    /** Advance by `by` ticks during playback; stop automatically at the end. */
    case 'advance': {
      const cursor = clampCursor(state.cursor + (action.by ?? 1), max);
      const atEnd = cursor >= max;
      return {
        ...state,
        cursor,
        motion: 'step',
        delta: cursor - state.cursor,
        playing: atEnd ? false : state.playing,
      };
    }

    case 'play': {
      // Pressing Play at the end restarts, which is what a user expects rather
      // than a button that appears to do nothing.
      const cursor = state.cursor >= max ? 0 : state.cursor;
      return { ...state, cursor, playing: true, motion: 'none', delta: 0 };
    }

    case 'pause':
      return { ...state, playing: false };

    case 'toggle': {
      if (state.playing) return { ...state, playing: false };
      const cursor = state.cursor >= max ? 0 : state.cursor;
      return { ...state, cursor, playing: true, motion: 'none', delta: 0 };
    }

    /** Reset is exactly reproducible: the timeline is never re-derived here. */
    case 'reset':
      return { ...INITIAL_PLAYBACK, speed: state.speed };

    case 'runToEnd':
      return { ...state, cursor: max, playing: false, motion: 'jump', delta: max - state.cursor };

    case 'setSpeed':
      return { ...state, speed: SPEEDS.includes(action.speed) ? action.speed : state.speed };

    /**
     * The timeline changed shape. Keep the cursor where it is if it still
     * exists, otherwise pull it back to the new end and stop playing — a
     * shorter timeline means the old cursor pointed at a tick that is gone.
     */
    case 'reclamp': {
      const cursor = clampCursor(state.cursor, max);
      const playing = cursor >= max ? false : state.playing;
      return { ...state, cursor, playing, motion: 'none', delta: 0 };
    }

    default:
      return state;
  }
}
