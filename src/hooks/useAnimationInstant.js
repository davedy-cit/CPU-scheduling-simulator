/**
 * Decide whether this cursor move should animate or snap.
 *
 * Two situations demand an instant transition rather than a flight:
 *
 *   - **A large jump.** Run-to-end, scrubbing, or Reset can move the cursor by
 *     hundreds of ticks. Animating that plays hundreds of staggered chip
 *     transitions at once, which reads as a smear rather than as movement.
 *   - **Reduced motion.** A user who has asked their OS for less animation
 *     should not be shown chips flying between columns. `useReducedMotion()`
 *     reports that preference, and it is honoured for every transition, not
 *     just the large ones.
 *
 * Returning a Framer Motion `transition` object rather than a boolean keeps the
 * call sites uniform: `<motion.div transition={transition} />` regardless.
 */

import { useReducedMotion } from 'framer-motion';

/** Moves larger than this many ticks snap instead of animating. */
export const INSTANT_JUMP_THRESHOLD = 3;

/** The shared spring used for ordinary chip movement. */
export const CHIP_SPRING = { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 };

/**
 * The snap transition. Hoisted to a module constant rather than written inline:
 * `ProcessChip` is memoised on `transition`, and a fresh `{ duration: 0 }` on
 * every render would defeat that memo for every chip on the board.
 */
export const INSTANT_TRANSITION = { duration: 0 };

/**
 * @param {Object} [options]
 * @param {number} [options.delta] How far the cursor moved on the last action.
 * @param {string} [options.motion] `'none' | 'step' | 'jump'`.
 * @returns {{ transition: object, instant: boolean }}
 */
export function useAnimationInstant({ delta = 0, motion = 'none' } = {}) {
  const prefersReduced = useReducedMotion();

  const largeJump = Math.abs(delta) > INSTANT_JUMP_THRESHOLD;
  const instant = Boolean(prefersReduced) || motion === 'jump' || largeJump;

  return {
    instant,
    transition: instant ? INSTANT_TRANSITION : CHIP_SPRING,
  };
}
