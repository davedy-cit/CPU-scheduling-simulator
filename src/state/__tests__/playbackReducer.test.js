/**
 * Playback reducer.
 *
 * The cursor is the app's most crash-prone piece of state: it indexes into
 * `timeline.snapshots`, and the timeline can change length underneath it at any
 * moment. Every action is therefore tested against a bound, and the
 * out-of-range cases are tested deliberately rather than incidentally.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INITIAL_PLAYBACK,
  clampCursor,
  nextEventCursor,
  playbackReducer,
  prevEventCursor,
} from '../playbackReducer.js';
import { simulate } from '../../engine/simulate.js';
import { SAMPLE_WORKLOAD } from '../../data/sampleWorkload.js';

/** A tiny fake timeline: snapshots at t=0..4, with events only at 0, 2 and 4. */
function fakeTimeline() {
  const withEvents = new Set([0, 2, 4]);
  return {
    snapshots: Array.from({ length: 5 }, (_, tick) => ({
      tick,
      lastEventIds: withEvents.has(tick) ? [tick] : [],
    })),
  };
}

const MAX = 4;
const bound = (action) => ({ maxCursor: MAX, ...action });

describe('clampCursor', () => {
  it('clamps into range', () => {
    assert.equal(clampCursor(2, MAX), 2);
    assert.equal(clampCursor(-5, MAX), 0);
    assert.equal(clampCursor(99, MAX), 4);
  });

  it('treats a missing bound as unbounded rather than zero', () => {
    // Defaulting to 0 here would silently reset the cursor on every Play press.
    assert.equal(clampCursor(7, undefined), 7);
    assert.equal(clampCursor(7, Infinity), 7);
  });

  it('survives NaN and fractional input', () => {
    assert.equal(clampCursor(NaN, MAX), 0);
    assert.equal(clampCursor(2.7, MAX), 2);
  });
});

describe('Cursor navigation', () => {
  it('steps forward and back by whole ticks', () => {
    let s = playbackReducer(INITIAL_PLAYBACK, bound({ type: 'step', by: 1 }));
    assert.equal(s.cursor, 1);
    s = playbackReducer(s, bound({ type: 'step', by: 1 }));
    assert.equal(s.cursor, 2);
    s = playbackReducer(s, bound({ type: 'step', by: -1 }));
    assert.equal(s.cursor, 1);
  });

  it('will not step below zero', () => {
    const s = playbackReducer(INITIAL_PLAYBACK, bound({ type: 'step', by: -1 }));
    assert.equal(s.cursor, 0);
  });

  it('will not step past the end', () => {
    let s = { ...INITIAL_PLAYBACK, cursor: MAX };
    s = playbackReducer(s, bound({ type: 'step', by: 1 }));
    assert.equal(s.cursor, MAX);
  });

  it('pauses when stepped, because stepping implies a deliberate pace', () => {
    const playing = { ...INITIAL_PLAYBACK, playing: true, cursor: 1 };
    assert.equal(playbackReducer(playing, bound({ type: 'step', by: 1 })).playing, false);
  });

  it('seeks to an exact tick and reports a jump', () => {
    const s = playbackReducer(INITIAL_PLAYBACK, bound({ type: 'setCursor', cursor: 3 }));
    assert.equal(s.cursor, 3);
    assert.equal(s.motion, 'jump');
    assert.equal(s.delta, 3);
  });

  it('clamps a seek past the end', () => {
    const s = playbackReducer(INITIAL_PLAYBACK, bound({ type: 'setCursor', cursor: 999 }));
    assert.equal(s.cursor, MAX);
  });
});

describe('Event navigation', () => {
  const timeline = fakeTimeline();

  it('lands on the next tick that actually carries an event', () => {
    // From t=0 the next event is at t=2, not t=1 — that is the point of the
    // control: skip the stretches where nothing happens.
    assert.equal(nextEventCursor(timeline, 0, MAX), 2);
    assert.equal(nextEventCursor(timeline, 2, MAX), 4);
  });

  it('falls back to the end when no later event exists', () => {
    assert.equal(nextEventCursor(timeline, 4, MAX), MAX);
  });

  it('lands on the previous tick that carries an event', () => {
    assert.equal(prevEventCursor(timeline, 4), 2);
    assert.equal(prevEventCursor(timeline, 2), 0);
  });

  it('falls back to zero when no earlier event exists', () => {
    assert.equal(prevEventCursor(timeline, 0), 0);
  });

  it('drives the reducer to an event tick', () => {
    const s = playbackReducer(INITIAL_PLAYBACK, bound({ type: 'nextEvent', timeline }));
    assert.equal(s.cursor, 2);
    assert.equal(s.motion, 'jump');
  });

  it('advances through a real timeline without ever landing on a dead tick', () => {
    // On a real run, Next Event must terminate at the end rather than looping.
    const real = simulate(SAMPLE_WORKLOAD, { algorithm: 'RR', quantum: 75 });
    const realMax = real.snapshots.length - 1;
    let cursor = 0;
    let guard = 0;
    while (cursor < realMax && guard++ < 10000) {
      const next = nextEventCursor(real, cursor, realMax);
      assert.ok(next > cursor, `next event must move forward from ${cursor}`);
      cursor = next;
    }
    assert.equal(cursor, realMax, 'walking Next Event should reach the end');
  });
});

describe('Playback control', () => {
  it('plays, pauses and toggles', () => {
    let s = playbackReducer(INITIAL_PLAYBACK, bound({ type: 'play' }));
    assert.equal(s.playing, true);
    s = playbackReducer(s, bound({ type: 'pause' }));
    assert.equal(s.playing, false);
    s = playbackReducer(s, bound({ type: 'toggle' }));
    assert.equal(s.playing, true);
    s = playbackReducer(s, bound({ type: 'toggle' }));
    assert.equal(s.playing, false);
  });

  it('restarts when Play is pressed at the end', () => {
    // A Play button that appears to do nothing is worse than one that restarts.
    const atEnd = { ...INITIAL_PLAYBACK, cursor: MAX };
    const s = playbackReducer(atEnd, bound({ type: 'play' }));
    assert.equal(s.cursor, 0);
    assert.equal(s.playing, true);
  });

  it('stops automatically on reaching the end', () => {
    const nearEnd = { ...INITIAL_PLAYBACK, cursor: MAX - 1, playing: true };
    const s = playbackReducer(nearEnd, bound({ type: 'advance', by: 1 }));
    assert.equal(s.cursor, MAX);
    assert.equal(s.playing, false, 'playback should stop at the end, not spin');
  });

  it('runs to the end and stops', () => {
    const s = playbackReducer({ ...INITIAL_PLAYBACK, playing: true }, bound({ type: 'runToEnd' }));
    assert.equal(s.cursor, MAX);
    assert.equal(s.playing, false);
    assert.equal(s.motion, 'jump', 'a large jump should snap rather than animate');
  });

  it('resets to the start and stops, preserving the chosen speed', () => {
    const s = playbackReducer(
      { cursor: 3, playing: true, speed: 4, motion: 'step', delta: 1 },
      bound({ type: 'reset' }),
    );
    assert.equal(s.cursor, 0);
    assert.equal(s.playing, false);
    assert.equal(s.speed, 4, 'the user keeps their speed setting across a reset');
  });
});

describe('Speed', () => {
  it('accepts a known speed', () => {
    assert.equal(playbackReducer(INITIAL_PLAYBACK, { type: 'setSpeed', speed: 8 }).speed, 8);
  });

  it('ignores an unknown speed rather than producing NaN tick rates', () => {
    assert.equal(playbackReducer(INITIAL_PLAYBACK, { type: 'setSpeed', speed: 3 }).speed, 1);
    assert.equal(playbackReducer(INITIAL_PLAYBACK, { type: 'setSpeed', speed: 0 }).speed, 1);
  });
});

describe('Reclamping after the timeline shrinks', () => {
  it('pulls an out-of-range cursor back', () => {
    const s = playbackReducer({ ...INITIAL_PLAYBACK, cursor: 900 }, { type: 'reclamp', maxCursor: 10 });
    assert.equal(s.cursor, 10);
  });

  it('stops playback when the run got shorter than the cursor', () => {
    const s = playbackReducer(
      { ...INITIAL_PLAYBACK, cursor: 900, playing: true },
      { type: 'reclamp', maxCursor: 10 },
    );
    assert.equal(s.playing, false);
  });

  it('leaves an in-range cursor alone', () => {
    const s = playbackReducer({ ...INITIAL_PLAYBACK, cursor: 5 }, { type: 'reclamp', maxCursor: 10 });
    assert.equal(s.cursor, 5);
  });
});

describe('Unknown actions', () => {
  it('return the state unchanged rather than throwing', () => {
    const s = playbackReducer(INITIAL_PLAYBACK, { type: 'nonsense' });
    assert.equal(s, INITIAL_PLAYBACK, 'identity is preserved so React can bail out');
  });
});
