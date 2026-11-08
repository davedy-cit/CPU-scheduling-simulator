/**
 * The playback clock.
 *
 * `requestAnimationFrame` with a time accumulator, never `setInterval`.
 * `setInterval` drifts, and browsers throttle it to roughly 1 Hz in a
 * background tab — so a run left playing while the user reads the rubric would
 * silently fall minutes behind and then lurch forward. The accumulator also
 * decouples *playback speed* from *simulated time*, which spec §8 requires:
 * speed changes how fast ticks are revealed, never what the ticks are.
 *
 * The loop reads its callback and bounds from refs so that advancing the cursor
 * does not tear down and rebuild the rAF loop on every tick. Restarting it
 * every frame would drop the accumulated fractional time and make playback
 * stutter at exactly the moment it should be smoothest.
 */

import { useEffect, useRef } from 'react';

import { TICKS_PER_SECOND } from '../engine/constants.js';

/**
 * @param {Object} options
 * @param {boolean} options.playing
 * @param {number} options.speed
 * @param {(ticks: number) => void} options.onAdvance Called with whole ticks to consume.
 * @param {() => boolean} [options.shouldStop] Return true to end playback.
 */
export function usePlaybackLoop({ playing, speed, onAdvance, shouldStop }) {
  const onAdvanceRef = useRef(onAdvance);
  const shouldStopRef = useRef(shouldStop);

  // Keep the refs current without making them effect dependencies. Written in an
  // effect rather than during render because a render can be discarded before it
  // commits, and a ref written during a discarded render would leave the loop
  // calling a callback belonging to a state that never existed. Declared before
  // the loop effect, so it has already run by the time the first frame is
  // scheduled.
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
    shouldStopRef.current = shouldStop;
  });

  useEffect(() => {
    if (!playing) return undefined;

    const ticksPerSecond = TICKS_PER_SECOND[speed] ?? 8;
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;

    const tick = (now) => {
      // Clamp the frame delta: a backgrounded tab can hand back a delta of many
      // seconds, which would otherwise dump thousands of ticks in one frame.
      const elapsed = Math.min(now - last, 250);
      last = now;
      accumulator += (elapsed / 1000) * ticksPerSecond;

      const whole = Math.floor(accumulator);
      if (whole > 0) {
        accumulator -= whole;
        onAdvanceRef.current(whole);
        if (shouldStopRef.current?.()) return;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);
}
