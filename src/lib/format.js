/**
 * Display formatting.
 *
 * The engine counts in abstract ticks; the assignment's default unit is
 * milliseconds (spec §4). Every place the UI prints a time goes through here so
 * the unit is decided once — changing `unitLabel` in the run config changes the
 * whole dashboard, and no component hard-codes "ms".
 *
 * The app never claims a real-time equivalence: a simulated unit is a unit of
 * logical time, and playback speed changes how fast the *clock* advances, not
 * how long a unit "really" takes.
 */

import { DEFAULT_UNIT_LABEL } from '../engine/constants.js';

/** Fallback unit, used before a timeline exists. */
export const DEFAULT_UNIT = DEFAULT_UNIT_LABEL;

/**
 * An integer count of simulated time units, e.g. `128`.
 *
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function fmtTick(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return String(Math.round(value));
}

/**
 * A time value with its unit, e.g. `128 ms`.
 *
 * @param {number|null|undefined} value
 * @param {string} [unit]
 * @returns {string}
 */
export function fmtTime(value, unit = DEFAULT_UNIT) {
  const tick = fmtTick(value);
  return tick === '—' ? tick : `${tick} ${unit}`;
}

/**
 * A measurement with a fixed number of decimals, e.g. `12.60`.
 *
 * @param {number|null|undefined} value
 * @param {number} [digits]
 * @returns {string}
 */
export function fmtNum(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

/**
 * A time measurement with decimals and a unit, e.g. `12.60 ms`.
 *
 * @param {number|null|undefined} value
 * @param {string} [unit]
 * @param {number} [digits]
 * @returns {string}
 */
export function fmtTimeAvg(value, unit = DEFAULT_UNIT, digits = 2) {
  const n = fmtNum(value, digits);
  return n === '—' ? n : `${n} ${unit}`;
}

/**
 * A percentage, e.g. `94.17%`.
 *
 * @param {number|null|undefined} value
 * @param {number} [digits]
 * @returns {string}
 */
export function fmtPct(value, digits = 2) {
  const n = fmtNum(value, digits);
  return n === '—' ? n : `${n}%`;
}

/**
 * Throughput is a rate, so it is printed with three decimals — at the default
 * unit the interesting values sit around 0.004 and would round to 0.00.
 *
 * @param {number|null|undefined} value
 * @param {string} [unit]
 * @returns {string}
 */
export function fmtThroughput(value, unit = DEFAULT_UNIT) {
  const n = fmtNum(value, 4);
  return n === '—' ? n : `${n} / ${unit}`;
}

/**
 * A fraction in 0–1 as a percentage, for progress bars and meters.
 *
 * @param {number} value
 * @returns {number} 0–100, clamped.
 */
export function toPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value * 100));
}

/**
 * Clamp a number into 0–1, tolerating junk.
 *
 * @param {number} value
 * @returns {number}
 */
export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * A count with a plural suffix, e.g. `1 tick` / `4 ticks`.
 *
 * @param {number} count
 * @param {string} noun
 * @returns {string}
 */
export function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * A one-line description of a burst, e.g. `CPU 180`.
 *
 * @param {{kind: string, duration: number}|null|undefined} burst
 * @returns {string}
 */
export function fmtBurst(burst) {
  if (!burst) return '—';
  return `${burst.kind === 'CPU' ? 'CPU' : `I/O ${burst.kind}`} ${burst.duration}`;
}

/**
 * Playback speed as a label, e.g. `2×`.
 *
 * @param {number} speed
 * @returns {string}
 */
export function fmtSpeed(speed) {
  return `${speed}×`;
}
