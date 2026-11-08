/**
 * Workload definition, validation, generation and text coding.
 *
 * Spec §4 requires manual input, seeded random generation and JSON
 * import/export — all three funnel through `validateWorkload()` so an invalid
 * workload is rejected with an actionable message rather than producing a
 * simulation that quietly disagrees with the brief.
 */

import {
  ALLOWED_BURST_COUNTS,
  BURST_MAX,
  BURST_MIN,
  PRIORITY_MAX,
  PRIORITY_MIN,
} from './constants.js';
import { normalizeSeed, pick, randInt, mulberry32 } from './rng.js';

/** The burst kinds a user may type. `CPU` is the processor; `A` and `B` are the devices. */
export const BURST_KINDS = ['CPU', 'A', 'B'];

/**
 * @typedef {import('./types.js').ProcessSpec} ProcessSpec
 * @typedef {import('./types.js').Burst} Burst
 */

/* ──────────────────────────────── Validation ─────────────────────────────── */

/**
 * Check a workload against the process-model rules.
 *
 * Two tiers:
 *   - structural rules (always enforced) — unique IDs, valid arrival/priority,
 *     1/3/5 alternating bursts beginning and ending with CPU. These define the
 *     model itself, so violating them is always an error.
 *   - duration bounds (opt-in) — the spec's 50–200 range applies to the
 *     assignment's default workload. The textbook validation presets use short
 *     bursts (24, 3, 3, …) on purpose, so the bound is opt-in.
 *
 * @param {ProcessSpec[]} processes
 * @param {{ enforceDurationBounds?: boolean }} [options]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateWorkload(processes, options = {}) {
  const { enforceDurationBounds = false } = options;
  /** @type {string[]} */
  const errors = [];

  if (!Array.isArray(processes) || processes.length === 0) {
    return { ok: false, errors: ['A workload must contain at least one process.'] };
  }

  const seen = new Set();

  processes.forEach((p, i) => {
    const at = `Process ${p && p.id ? p.id : `#${i + 1}`}`;

    if (!p || typeof p !== 'object') {
      errors.push(`${at}: not a process object.`);
      return;
    }
    if (typeof p.id !== 'string' || p.id.trim() === '') {
      errors.push(`${at}: missing a process ID.`);
    } else if (seen.has(p.id)) {
      errors.push(`${at}: duplicate process ID.`);
    } else {
      seen.add(p.id);
    }

    if (!Number.isInteger(p.arrival) || p.arrival < 0) {
      errors.push(`${at}: arrival must be a non-negative whole number.`);
    }

    if (!Number.isInteger(p.priority) || p.priority < PRIORITY_MIN || p.priority > PRIORITY_MAX) {
      errors.push(`${at}: priority must be a whole number ${PRIORITY_MIN}–${PRIORITY_MAX} (1 = highest).`);
    }

    if (!Array.isArray(p.bursts) || p.bursts.length === 0) {
      errors.push(`${at}: needs at least one burst.`);
      return;
    }

    if (!ALLOWED_BURST_COUNTS.includes(p.bursts.length)) {
      errors.push(
        `${at}: must have ${ALLOWED_BURST_COUNTS.join(', ')} alternating bursts, but has ${p.bursts.length}.`,
      );
    }

    if (p.bursts[0].kind !== 'CPU') errors.push(`${at}: must begin with a CPU burst.`);
    if (p.bursts[p.bursts.length - 1].kind !== 'CPU') {
      errors.push(`${at}: must end with a CPU burst.`);
    }

    p.bursts.forEach((b, bi) => {
      const where = `${at}, burst ${bi + 1}`;
      if (!BURST_KINDS.includes(b.kind)) {
        errors.push(`${where}: unknown burst kind "${b.kind}" (expected CPU, A or B).`);
      }
      if (!Number.isInteger(b.duration) || b.duration <= 0) {
        errors.push(`${where}: duration must be a positive whole number.`);
      } else if (enforceDurationBounds && (b.duration < BURST_MIN || b.duration > BURST_MAX)) {
        errors.push(`${where}: duration must be ${BURST_MIN}–${BURST_MAX} simulated time units.`);
      }
      if (bi > 0 && p.bursts[bi - 1].kind === b.kind) {
        errors.push(`${where}: bursts must alternate, but two "${b.kind}" bursts are adjacent.`);
      }
    });
  });

  return { ok: errors.length === 0, errors };
}

/* ─────────────────────────────── Text coding ─────────────────────────────── */

/**
 * Render a burst sequence the way the assignment writes it: `CPU 180 · A 100 · CPU 120`.
 *
 * @param {Burst[]} bursts
 * @returns {string}
 */
export function formatBurstSequence(bursts) {
  return bursts.map((b) => `${b.kind} ${b.duration}`).join(' · ');
}

/**
 * Parse a typed burst sequence into bursts.
 *
 * Accepts the assignment's own notation and a few forgiving variants:
 *   `CPU 180 A 100 CPU 120 B 80`
 *   `CPU 180, A 100, CPU 120`
 *   `CPU 180 | I/O A 100 | CPU 120`
 *
 * @param {string} text
 * @returns {{ bursts: Burst[], errors: string[] }}
 */
export function parseBurstSequence(text) {
  /** @type {Burst[]} */
  const bursts = [];
  /** @type {string[]} */
  const errors = [];
  if (typeof text !== 'string' || text.trim() === '') {
    return { bursts, errors: ['Burst sequence is empty.'] };
  }

  // `CPU`, `A`, `B`, and the wordier `I/O A` / `IO-B` forms.
  const token = /(?:i\s*\/?\s*o\s*[-_ ]?\s*([ab])|\b(cpu)\b|\b([ab])\b)\s*[=:]?\s*(\d+)/gi;

  /** Text that is only separators is fine; anything else is a typo worth reporting. */
  const unreadable = (chunk) => chunk.replace(/[\s,;·|/]+/g, '').trim();

  let match;
  let cursor = 0;

  while ((match = token.exec(text)) !== null) {
    // Inspect the gap *before* this match, not just the tail after the last one.
    const gap = unreadable(text.slice(cursor, match.index));
    if (gap) errors.push(`Could not read "${gap}".`);

    const kind = match[2] ? 'CPU' : (match[1] || match[3]).toUpperCase();
    bursts.push({ kind, duration: Number(match[4]) });
    cursor = token.lastIndex;
  }

  const tail = unreadable(text.slice(cursor));
  if (tail) errors.push(`Could not read "${tail}".`);
  if (bursts.length === 0) errors.push('No bursts found. Try: CPU 180, A 100, CPU 120');

  return { bursts, errors };
}

/* ────────────────────────────── Random generation ────────────────────────── */

/**
 * Generate a valid random workload from a seed (spec §4).
 *
 * The same seed always produces the same workload, so a demo can be reproduced
 * exactly — which is what makes "fix the workload while switching algorithms"
 * meaningful for a generated set.
 *
 * @param {number|string} seed
 * @param {number} [count] Number of processes to generate.
 * @param {Object} [options]
 * @param {[number, number]} [options.arrivalGap] Inclusive gap range between consecutive arrivals.
 * @param {number} [options.deviceCount] Devices available to assign I/O bursts to.
 * @returns {ProcessSpec[]}
 */
export function generateWorkload(seed, count = 5, options = {}) {
  const { arrivalGap = [20, 60] } = options;
  const rng = mulberry32(normalizeSeed(seed));

  /** @type {ProcessSpec[]} */
  const processes = [];
  let arrival = 0;

  for (let i = 0; i < count; i++) {
    if (i > 0) arrival += randInt(rng, arrivalGap[0], arrivalGap[1]);

    const burstCount = pick(rng, ALLOWED_BURST_COUNTS);
    /** @type {Burst[]} */
    const bursts = [];
    for (let b = 0; b < burstCount; b++) {
      if (b % 2 === 0) {
        bursts.push({ kind: 'CPU', duration: randInt(rng, BURST_MIN, BURST_MAX) });
      } else {
        bursts.push({ kind: pick(rng, ['A', 'B']), duration: randInt(rng, BURST_MIN, BURST_MAX) });
      }
    }

    processes.push({
      id: `P${i + 1}`,
      arrival,
      priority: randInt(rng, PRIORITY_MIN, PRIORITY_MAX),
      colorIndex: (i % 8) + 1,
      bursts,
    });
  }

  return processes;
}

/* ─────────────────────────────── Utilities ──────────────────────────────── */

/**
 * Deep-copy a workload. Used to freeze a workload before running Compare All,
 * so six runs cannot observe each other's edits (spec §4).
 *
 * @param {ProcessSpec[]} processes
 * @returns {ProcessSpec[]}
 */
export function cloneWorkload(processes) {
  return processes.map((p) => ({ ...p, bursts: p.bursts.map((b) => ({ ...b })) }));
}

/**
 * Total CPU demand of a workload, in simulated time units.
 *
 * @param {ProcessSpec[]} processes
 * @returns {number}
 */
export function totalCpuDemand(processes) {
  return processes.reduce(
    (sum, p) => sum + p.bursts.filter((b) => b.kind === 'CPU').reduce((s, b) => s + b.duration, 0),
    0,
  );
}

/**
 * Total I/O demand of a workload, split by device.
 *
 * @param {ProcessSpec[]} processes
 * @returns {{A: number, B: number}}
 */
export function totalIoDemand(processes) {
  const out = { A: 0, B: 0 };
  for (const p of processes) {
    for (const b of p.bursts) if (b.kind !== 'CPU') out[b.kind] += b.duration;
  }
  return out;
}

/**
 * Ensure every process has a colour index in 1–8, so a hand-edited or imported
 * workload still renders with stable per-process colours.
 *
 * @param {ProcessSpec[]} processes
 * @returns {ProcessSpec[]}
 */
export function withColorIndexes(processes) {
  return processes.map((p, i) => ({ ...p, colorIndex: p.colorIndex ?? (i % 8) + 1 }));
}
