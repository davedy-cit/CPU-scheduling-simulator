/**
 * Colour maps.
 *
 * Tailwind v4 scans source files for *literal* class strings. A template like
 * `` `bg-proc-${colorIndex}` `` produces no CSS at all — the scanner never sees
 * `bg-proc-1`, so the utility is never emitted and the element renders
 * unstyled. Every mapping below is therefore written out in full, and the maps
 * are keyed by the same indices the engine uses.
 *
 * Two independent colour systems, deliberately:
 *
 *   - **by state** (NEW / READY / RUNNING / WAITING / TERMINATED) for badges,
 *     column headers and the legend, so a reader can learn the lifecycle at a
 *     glance; and
 *   - **by process** for the moving chips, so a token stays identifiable as it
 *     travels between columns — which is what makes the animation requirement
 *     legible rather than decorative.
 *
 * Colour is never the only carrier of meaning: every chip also shows its PID,
 * and every state badge its label.
 */

/** Per-process chip classes, indexed 1–8. */
export const PROC_CLASSES = {
  1: { bg: 'bg-proc-1', text: 'text-proc-1', border: 'border-proc-1', soft: 'bg-proc-1/10' },
  2: { bg: 'bg-proc-2', text: 'text-proc-2', border: 'border-proc-2', soft: 'bg-proc-2/10' },
  3: { bg: 'bg-proc-3', text: 'text-proc-3', border: 'border-proc-3', soft: 'bg-proc-3/10' },
  4: { bg: 'bg-proc-4', text: 'text-proc-4', border: 'border-proc-4', soft: 'bg-proc-4/10' },
  5: { bg: 'bg-proc-5', text: 'text-proc-5', border: 'border-proc-5', soft: 'bg-proc-5/10' },
  6: { bg: 'bg-proc-6', text: 'text-proc-6', border: 'border-proc-6', soft: 'bg-proc-6/10' },
  7: { bg: 'bg-proc-7', text: 'text-proc-7', border: 'border-proc-7', soft: 'bg-proc-7/10' },
  8: { bg: 'bg-proc-8', text: 'text-proc-8', border: 'border-proc-8', soft: 'bg-proc-8/10' },
};

/**
 * @param {number|undefined} colorIndex
 * @returns {typeof PROC_CLASSES[1]}
 */
export function procClasses(colorIndex) {
  const index = ((Math.trunc(colorIndex ?? 1) - 1 + 8) % 8) + 1;
  return PROC_CLASSES[index];
}

/** Raw CSS colour for a process, for inline `style` and SVG fills. */
export const PROC_HEX = {
  1: '#2563eb',
  2: '#0d9488',
  3: '#d97706',
  4: '#dc2626',
  5: '#7c3aed',
  6: '#0891b2',
  7: '#ca8a04',
  8: '#db2777',
};

/**
 * @param {number|undefined} colorIndex
 * @returns {string}
 */
export function procHex(colorIndex) {
  const index = ((Math.trunc(colorIndex ?? 1) - 1 + 8) % 8) + 1;
  return PROC_HEX[index];
}

/** Lifecycle state styling, keyed by `ProcState`. */
export const STATE_CLASSES = {
  NEW: { bg: 'bg-state-new', text: 'text-state-new', soft: 'bg-state-new/10', label: 'New' },
  READY: {
    bg: 'bg-state-ready',
    text: 'text-state-ready',
    soft: 'bg-state-ready/10',
    label: 'Ready',
  },
  RUNNING: {
    bg: 'bg-state-running',
    text: 'text-state-running',
    soft: 'bg-state-running/10',
    label: 'Running',
  },
  WAITING: {
    bg: 'bg-state-waiting',
    text: 'text-state-waiting',
    soft: 'bg-state-waiting/10',
    label: 'Waiting',
  },
  TERMINATED: {
    bg: 'bg-state-terminated',
    text: 'text-state-terminated',
    soft: 'bg-state-terminated/10',
    label: 'Terminated',
  },
};

/** @param {import('../engine/types.js').ProcState} state */
export function stateClasses(state) {
  return STATE_CLASSES[state] ?? STATE_CLASSES.NEW;
}

/** Raw CSS colour per state, for SVG and inline styles. */
export const STATE_HEX = {
  NEW: '#94a3b8',
  READY: '#2a78d6',
  RUNNING: '#008300',
  WAITING: '#eda100',
  TERMINATED: '#e87ba4',
  IDLE: '#898781',
  SWITCH: '#64748b',
  BUSY: '#6250d6',
};

/**
 * Gantt segment styling. `SWITCH` is distinct from `IDLE` because spec §8 asks
 * for context-switch segments to be visible in their own right.
 */
export const SEGMENT_CLASSES = {
  RUN: 'bg-state-running',
  IDLE: 'bg-state-idle/40',
  SWITCH: 'bg-ink-subtle',
  BUSY: 'bg-state-io',
};

/** The legend rows, in lifecycle order. */
export const LEGEND_STATES = ['NEW', 'READY', 'RUNNING', 'WAITING', 'TERMINATED'];
