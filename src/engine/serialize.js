/**
 * Workload and run interchange — JSON in, JSON out (spec §4, §8).
 *
 * The export shape is deliberately narrow and the import shape deliberately
 * forgiving, because the two are read by different people:
 *
 *   - **Export** is read by the grader and by `JSON.parse`. It carries a
 *     `format` tag and a `version`, and it contains only the fields that define
 *     the run — no `colorIndex`, which is presentation and is re-derived on the
 *     way back in.
 *   - **Import** is read by a human who typed the file by hand, possibly
 *     following the assignment's own notation. So a bare array is accepted as
 *     well as `{ processes: [...] }`, numeric strings are coerced, a burst
 *     sequence may be given as the spec's text form (`"CPU 180, A 100"`) instead
 *     of as objects, and a missing arrival or priority is defaulted with a
 *     warning rather than rejected.
 *
 * The split between `errors` and `warnings` is the point of the module: an
 * error means the workload cannot be simulated (it violates the process model
 * itself), while a warning means it can, but something was defaulted, ignored or
 * looks unusual. Duration bounds are a warning — the textbook presets use short
 * bursts on purpose, and the brief's 50–200 range governs the assignment's own
 * workload, not every workload a student might want to try.
 */

import {
  ALGORITHM_IDS,
  BURST_MAX,
  BURST_MIN,
  DEFAULT_UNIT_LABEL,
  MIN_QUANTUM,
  PRIORITY_MIN,
} from './constants.js';
import { parseBurstSequence, validateWorkload, withColorIndexes } from './workload.js';

/**
 * @typedef {import('./types.js').ProcessSpec} ProcessSpec
 * @typedef {import('./types.js').SimConfig} SimConfig
 */

/** Tag written into every exported workload, so an import can recognise its own files. */
export const WORKLOAD_FORMAT = 'cpu-sched-workload';

/** Schema version. Bumped only for a change an older build could misread. */
export const WORKLOAD_VERSION = 1;

/** Tag written into an exported full run (workload + results). */
export const RUN_FORMAT = 'cpu-sched-run';

/* ───────────────────────────────── Export ────────────────────────────────── */

/**
 * Build the portable document for a workload.
 *
 * `colorIndex` is intentionally dropped: it is a presentation detail that the
 * app re-assigns by position on import, and including it would make a
 * hand-edited file look authoritative about something that does not affect the
 * schedule.
 *
 * @param {ProcessSpec[]} processes
 * @param {Object} [options]
 * @param {Partial<SimConfig>} [options.config] Included only when supplied.
 * @param {string} [options.name]
 * @param {string} [options.note]
 * @returns {Object}
 */
export function serializeWorkload(processes, { config, name, note } = {}) {
  /** @type {Record<string, unknown>} */
  const doc = {
    format: WORKLOAD_FORMAT,
    version: WORKLOAD_VERSION,
    name: typeof name === 'string' && name.trim() ? name.trim() : 'Workload',
    processes: processes.map((process) => ({
      id: process.id,
      arrival: process.arrival,
      priority: process.priority,
      bursts: process.bursts.map((burst) => ({ kind: burst.kind, duration: burst.duration })),
    })),
  };

  if (typeof note === 'string' && note.trim()) doc.note = note.trim();

  if (config) {
    doc.config = {
      algorithm: config.algorithm,
      quantum: config.quantum,
      switchOverhead: config.switchOverhead ?? 0,
      admissionLimit: config.admissionLimit ?? null,
      unitLabel: config.unitLabel ?? DEFAULT_UNIT_LABEL,
    };
  }

  return doc;
}

/**
 * The workload document as text, ready to download.
 *
 * @param {ProcessSpec[]} processes
 * @param {Object} [options] Same as `serializeWorkload`.
 * @returns {string}
 */
export function stringifyWorkload(processes, options) {
  return `${JSON.stringify(serializeWorkload(processes, options), null, 2)}\n`;
}

/**
 * A full run — the workload, the configuration and every derived number.
 *
 * This is what makes the §10 write-up reproducible: the report can quote exact
 * figures and ship the file they came from, so a reader can re-derive them.
 *
 * @param {import('./types.js').Timeline} timeline
 * @param {Object} [options]
 * @param {string} [options.name]
 * @returns {Object}
 */
export function serializeRun(timeline, { name } = {}) {
  return {
    format: RUN_FORMAT,
    version: WORKLOAD_VERSION,
    name: typeof name === 'string' && name.trim() ? name.trim() : 'Run',
    generatedFrom: 'Interactive CPU Scheduling & Process Lifecycle Simulator (CCS635)',
    config: { ...timeline.config },
    workload: serializeWorkload(timeline.processes, { name }).processes,
    summary: { ...timeline.summary },
    metrics: timeline.metrics.map((row) => ({ ...row })),
    events: timeline.events.map((event) => ({ ...event })),
    warning: timeline.warning ?? null,
  };
}

/**
 * A filesystem-safe filename stem for a workload name.
 *
 * @param {string} [name]
 * @returns {string}
 */
export function slugify(name) {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'workload';
}

/* ───────────────────────────────── Import ────────────────────────────────── */

/**
 * @typedef {Object} ImportResult
 * @property {boolean} ok True when the workload can be simulated.
 * @property {ProcessSpec[]|null} processes Normalised, colour-indexed specs.
 * @property {Partial<SimConfig>|null} config Only the fields the file supplied and that are valid.
 * @property {string|null} name
 * @property {string|null} note
 * @property {string[]} errors Reasons the file cannot be used.
 * @property {string[]} warnings Things that were defaulted, ignored or look unusual.
 */

/**
 * Coerce a value to an integer where that is unambiguous.
 *
 * Returns the input untouched when it is present but not a number, so
 * `validateWorkload` can produce the error message rather than this function
 * silently substituting a default and hiding the problem.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function coerceInt(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isInteger(Number(value))) {
    return Number(value);
  }
  return value;
}

/**
 * Accept a burst list written as objects, as `[kind, duration]` pairs, or as the
 * assignment's own text notation.
 *
 * @param {unknown} raw
 * @param {string} id Process ID, for the warning messages.
 * @param {string[]} warnings
 * @returns {unknown} A burst array, or the raw value when it is unusable.
 */
function coerceBursts(raw, id, warnings) {
  if (typeof raw === 'string') {
    const { bursts, errors } = parseBurstSequence(raw);
    for (const error of errors) warnings.push(`Process ${id}: ${error}`);
    return bursts;
  }

  if (!Array.isArray(raw)) return raw;

  return raw.map((burst) => {
    if (typeof burst === 'string') {
      const { bursts, errors } = parseBurstSequence(burst);
      for (const error of errors) warnings.push(`Process ${id}: ${error}`);
      return bursts[0] ?? burst;
    }
    if (Array.isArray(burst)) {
      return { kind: String(burst[0] ?? '').toUpperCase(), duration: coerceInt(burst[1]) };
    }
    if (burst && typeof burst === 'object') {
      return {
        kind: typeof burst.kind === 'string' ? burst.kind.trim().toUpperCase() : burst.kind,
        duration: coerceInt(burst.duration),
      };
    }
    return burst;
  });
}

/**
 * Read the optional `config` block, keeping only what is valid.
 *
 * Invalid entries are warned about and dropped rather than rejected, so a file
 * exported by a newer build still loads with the current settings for the fields
 * this build does not understand.
 *
 * @param {unknown} raw
 * @param {string[]} warnings
 * @returns {Partial<SimConfig>|null}
 */
function coerceConfig(raw, warnings) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  /** @type {Partial<SimConfig>} */
  const out = {};

  if (typeof raw.algorithm === 'string') {
    if (ALGORITHM_IDS.includes(raw.algorithm)) out.algorithm = raw.algorithm;
    else warnings.push(`Unknown algorithm "${raw.algorithm}" — keeping the current one.`);
  }

  const quantum = coerceInt(raw.quantum);
  if (Number.isInteger(quantum)) {
    if (quantum >= MIN_QUANTUM) out.quantum = quantum;
    else warnings.push(`Quantum ${quantum} is below the minimum of ${MIN_QUANTUM} — keeping the current one.`);
  }

  const overhead = coerceInt(raw.switchOverhead);
  if (Number.isInteger(overhead)) {
    if (overhead >= 0) out.switchOverhead = overhead;
    else warnings.push('Context-switch overhead cannot be negative — keeping the current one.');
  }

  if (raw.admissionLimit === null) {
    out.admissionLimit = null;
  } else {
    const limit = coerceInt(raw.admissionLimit);
    if (Number.isInteger(limit)) {
      if (limit >= 1) out.admissionLimit = limit;
      else warnings.push('Admission limit must be at least 1 — keeping the current one.');
    }
  }

  if (typeof raw.unitLabel === 'string' && raw.unitLabel.trim()) {
    out.unitLabel = raw.unitLabel.trim();
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Parse and validate an imported workload.
 *
 * Never throws: a malformed file produces `ok: false` with reasons, so the
 * editor can show them beside the import control instead of losing the page to
 * an exception.
 *
 * @param {string|unknown} input JSON text, or an already-parsed value.
 * @returns {ImportResult}
 */
export function parseWorkloadJSON(input) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  /** @param {string[]} [extra] */
  const fail = (extra = []) => ({
    ok: false,
    processes: null,
    config: null,
    name: null,
    note: null,
    errors: [...errors, ...extra],
    warnings,
  });

  let doc = input;
  if (typeof input === 'string') {
    try {
      doc = JSON.parse(input);
    } catch (error) {
      return fail([`Not valid JSON: ${error.message}`]);
    }
  }

  if (doc === null || typeof doc !== 'object') {
    return fail(['Expected a JSON object or an array of processes.']);
  }

  const isBareArray = Array.isArray(doc);
  const rawList = isBareArray ? doc : doc.processes;
  const name = isBareArray ? null : typeof doc.name === 'string' ? doc.name : null;
  const note = isBareArray ? null : typeof doc.note === 'string' ? doc.note : null;

  if (!Array.isArray(rawList)) {
    return fail(['No "processes" array found. Expected {"processes": [...]} or a bare array.']);
  }

  if (!isBareArray && typeof doc.format === 'string' && doc.format !== WORKLOAD_FORMAT) {
    warnings.push(`Unrecognised format "${doc.format}" — importing anyway.`);
  }
  if (!isBareArray && Number.isFinite(doc.version) && doc.version > WORKLOAD_VERSION) {
    warnings.push(
      `File version ${doc.version} is newer than this build understands (${WORKLOAD_VERSION}).`,
    );
  }

  const processes = rawList
    .map((raw, index) => {
      const at = `Process #${index + 1}`;

      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        warnings.push(`${at}: not a process object; skipped.`);
        return null;
      }

      const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `P${index + 1}`;
      if (id !== raw.id) warnings.push(`${at}: missing or blank ID; using "${id}".`);

      const arrival = coerceInt(raw.arrival);
      if (arrival === undefined) {
        warnings.push(`Process ${id}: no arrival given; using 0.`);
      }

      const priority = coerceInt(raw.priority);
      if (priority === undefined) {
        warnings.push(`Process ${id}: no priority given; using ${PRIORITY_MIN} (highest).`);
      }

      return {
        id,
        arrival: arrival === undefined ? 0 : arrival,
        priority: priority === undefined ? PRIORITY_MIN : priority,
        bursts: coerceBursts(raw.bursts, id, warnings),
      };
    })
    .filter(Boolean);

  if (processes.length === 0) {
    return fail(['No usable processes found in the file.']);
  }

  const normalized = withColorIndexes(processes);
  errors.push(...validateWorkload(normalized).errors);

  // Duration bounds are a note, not a refusal — see the module docblock.
  for (const process of normalized) {
    if (!Array.isArray(process.bursts)) continue;
    process.bursts.forEach((burst, index) => {
      if (
        Number.isInteger(burst.duration) &&
        (burst.duration < BURST_MIN || burst.duration > BURST_MAX)
      ) {
        warnings.push(
          `Process ${process.id}, burst ${index + 1}: ${burst.duration} is outside the ` +
            `assignment's ${BURST_MIN}–${BURST_MAX} range.`,
        );
      }
    });
  }

  if (errors.length > 0) return fail();

  return {
    ok: true,
    processes: normalized,
    config: coerceConfig(isBareArray ? null : doc.config, warnings),
    name,
    note,
    errors,
    warnings,
  };
}
