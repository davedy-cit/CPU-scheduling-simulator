/**
 * The workload editor (spec §4, §8).
 *
 * This is the only panel that writes to the simulation's inputs rather than
 * reading from its outputs, and it is built around one distinction:
 *
 *   - the **draft**, which is what is in the text boxes right now and may be
 *     half-typed, invalid, or simply not applied yet; and
 *   - the **live workload**, which is what the timeline on screen was built from.
 *
 * The draft is stored with every field as a string, because that is what the
 * user is typing. Parsing runs on each keystroke so validation is immediate, but
 * nothing reaches the engine until the user applies it — except for the three
 * actions that produce a complete, valid workload by construction (loading a
 * preset, generating from a seed, importing a file). Those apply at once, since
 * making the user confirm a workload the app itself just built would be theatre.
 *
 * The draft re-syncs from the live workload whenever the latter is replaced, so
 * the editor always describes the run that is actually on screen.
 */

import { useMemo, useRef, useState } from 'react';

import { PRESETS } from '../../data/presets.js';
import { SAMPLE_WORKLOAD } from '../../data/sampleWorkload.js';
import {
  ALLOWED_BURST_COUNTS,
  BURST_MAX,
  BURST_MIN,
  PRIORITY_MAX,
  PRIORITY_MIN,
} from '../../engine/constants.js';
import { parseWorkloadJSON, serializeRun, serializeWorkload, slugify } from '../../engine/serialize.js';
import {
  formatBurstSequence,
  generateWorkload,
  parseBurstSequence,
  totalCpuDemand,
  totalIoDemand,
  validateWorkload,
} from '../../engine/workload.js';
import { toCsv } from '../../lib/csv.js';
import { downloadCsv, downloadJson } from '../../lib/download.js';
import {
  EVENT_COLUMNS,
  METRICS_COLUMNS,
  SUMMARY_COLUMNS,
  eventsRows,
  metricsRows,
  summaryRows,
} from '../../lib/exporters.js';
import { useSim } from '../../state/SimulationContext.jsx';
import { Button } from '../common/Button.jsx';
import { Card } from '../common/Card.jsx';
import { Chip } from '../common/Badge.jsx';
import { NumberInput, Select, TextInput } from '../common/Field.jsx';
import {
  CheckIcon,
  DiceIcon,
  DownloadIcon,
  PlusIcon,
  SettingsIcon,
  UploadIcon,
  WarningIcon,
} from '../common/icons.jsx';
import { ProcessEditorHeader, ProcessEditorRow } from './ProcessEditorRow.jsx';

/**
 * @typedef {Object} DraftRow
 * @property {string} id
 * @property {string} arrival
 * @property {string} priority
 * @property {string} burstText
 */

/** How many out-of-range burst notes to print before collapsing the rest. */
const MAX_BOUND_NOTES = 4;

/**
 * The live workload as editable text.
 *
 * @param {import('../../engine/types.js').ProcessSpec[]} processes
 * @returns {DraftRow[]}
 */
function toDraft(processes) {
  return processes.map((process) => ({
    id: process.id,
    arrival: String(process.arrival),
    priority: String(process.priority),
    burstText: formatBurstSequence(process.bursts),
  }));
}

/**
 * A comparable rendering of a workload, for the "has this been applied?" test.
 *
 * Comparing the draft against the live workload field by field would have to
 * re-implement the string→number coercion; stringifying one canonical shape is
 * both shorter and impossible to get subtly wrong.
 *
 * @param {Array<{id: string, arrival: unknown, priority: unknown, bursts: Array<{kind: string, duration: unknown}>}>} processes
 * @returns {string}
 */
function canonical(processes) {
  return JSON.stringify(
    processes.map((process) => [
      process.id,
      process.arrival,
      process.priority,
      process.bursts.map((burst) => `${burst.kind}:${burst.duration}`),
    ]),
  );
}

/**
 * The first unused `P<n>` ID, so "Add process" never creates a duplicate.
 *
 * @param {DraftRow[]} rows
 * @returns {string}
 */
function nextId(rows) {
  const used = new Set(rows.map((row) => row.id.trim()));
  let n = rows.length + 1;
  while (used.has(`P${n}`)) n += 1;
  return `P${n}`;
}

export function WorkloadEditor() {
  const { workload, config, timeline, actions } = useSim();

  const [draft, setDraft] = useState(() => toDraft(workload));
  const [syncedFrom, setSyncedFrom] = useState(workload);
  const [name, setName] = useState('Assignment workload');
  const [seed, setSeed] = useState('ccs635');
  const [count, setCount] = useState('5');
  /** @type {[null|{ok: boolean, errors: string[], warnings: string[], source: string}, Function]} */
  const [report, setReport] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const fileRef = useRef(null);

  // React's documented "adjust state when an input changes" pattern. The draft
  // mirrors the live workload until the user edits a field; `workload` only
  // changes when something applies a new one, so this resyncs exactly when the
  // run the editor describes has been replaced. Doing it during render rather
  // than in an effect avoids a frame of rows describing the previous workload.
  if (workload !== syncedFrom) {
    setSyncedFrom(workload);
    setDraft(toDraft(workload));
  }

  /* ────────────────────────────── Derived state ───────────────────────────── */

  /** The draft as the engine would see it. */
  const parsed = useMemo(
    () =>
      draft.map((row, index) => ({
        id: row.id.trim() || `P${index + 1}`,
        arrival: Number(row.arrival),
        priority: Number(row.priority),
        bursts: parseBurstSequence(row.burstText).bursts,
      })),
    [draft],
  );

  /** Per-field problems, so each one is reported beside the cell that caused it. */
  const rowErrors = useMemo(
    () =>
      draft.map((row) => {
        /** @type {string[]} */
        const errors = [];

        if (!row.id.trim()) errors.push('Needs an ID.');

        const arrival = Number(row.arrival);
        if (row.arrival.trim() === '' || !Number.isInteger(arrival) || arrival < 0) {
          errors.push('Arrival must be a whole number, 0 or more.');
        }

        const priority = Number(row.priority);
        if (!Number.isInteger(priority) || priority < PRIORITY_MIN || priority > PRIORITY_MAX) {
          errors.push(`Priority must be ${PRIORITY_MIN}–${PRIORITY_MAX} (1 = highest).`);
        }

        errors.push(...parseBurstSequence(row.burstText).errors);
        return errors;
      }),
    [draft],
  );

  /** The authoritative check — the same function the importer and the tests use. */
  const verdict = useMemo(() => validateWorkload(parsed), [parsed]);

  const dirty = useMemo(() => canonical(parsed) !== canonical(workload), [parsed, workload]);

  /**
   * Draft bursts outside the assignment's 50–200 range.
   *
   * Reported as notes rather than errors: the range governs the assignment's own
   * workload, while the textbook presets use short bursts on purpose. Surfacing
   * them means a student can see at a glance whether the set they built actually
   * satisfies §4.
   */
  const boundNotes = useMemo(() => {
    /** @type {string[]} */
    const notes = [];
    for (const process of parsed) {
      process.bursts.forEach((burst, index) => {
        if (
          Number.isInteger(burst.duration) &&
          (burst.duration < BURST_MIN || burst.duration > BURST_MAX)
        ) {
          notes.push(
            `${process.id}, burst ${index + 1}: ${burst.duration} is outside ${BURST_MIN}–${BURST_MAX}.`,
          );
        }
      });
    }
    return notes;
  }, [parsed]);

  const cpuDemand = useMemo(() => totalCpuDemand(parsed), [parsed]);
  const ioDemand = useMemo(() => totalIoDemand(parsed), [parsed]);

  const unit = config.unitLabel;

  /* ──────────────────────────────── Actions ──────────────────────────────── */

  /**
   * Hand a workload to the simulation. The cursor resets, because the old one
   * indexes into a timeline that no longer exists.
   *
   * @param {import('../../engine/types.js').ProcessSpec[]} processes
   * @param {Partial<import('../../engine/types.js').SimConfig>|null} [nextConfig]
   */
  const apply = (processes, nextConfig = null) => {
    if (nextConfig) actions.setConfig(nextConfig);
    actions.setWorkload(processes);
  };

  const updateRow = (index, patch) =>
    setDraft((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addRow = () =>
    setDraft((rows) => {
      const lastArrival = rows.length > 0 ? Number(rows[rows.length - 1].arrival) : 0;
      return [
        ...rows,
        {
          id: nextId(rows),
          arrival: String(Number.isFinite(lastArrival) ? lastArrival + 30 : 0),
          priority: '3',
          burstText: 'CPU 100',
        },
      ];
    });

  const removeRow = (index) => setDraft((rows) => rows.filter((_, i) => i !== index));

  const loadPreset = (presetId) => {
    const preset = PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;

    const processes = preset.source === 'sample' ? SAMPLE_WORKLOAD : preset.processes;
    setReport(null);
    setName(preset.label);

    // A preset that pins a quantum only makes sense under Round Robin, so it
    // selects the algorithm as well. The others leave the current algorithm
    // alone — comparing all six over one of these sets is the whole point of
    // having them.
    apply(processes, preset.quantum ? { quantum: preset.quantum, algorithm: 'RR' } : null);
  };

  const runGenerator = () => {
    const requested = Math.max(1, Math.min(50, Math.trunc(Number(count)) || 5));
    setReport(null);
    setName(`Seeded random — ${seed}`);
    apply(generateWorkload(seed, requested));
  };

  /**
   * Import JSON text.
   *
   * A failed import is reported beside the control rather than thrown, so a
   * malformed file costs the user a message and not the page.
   *
   * @param {string} text
   * @param {string} source
   */
  const importText = (text, source) => {
    const result = parseWorkloadJSON(text);
    setReport({ ok: result.ok, errors: result.errors, warnings: result.warnings, source });

    if (!result.ok) return;
    if (result.name) setName(result.name);
    apply(result.processes, result.config);
  };

  const onFilePicked = async (event) => {
    const file = event.target.files?.[0];
    // Clear the input so picking the same file twice fires `change` again.
    event.target.value = '';
    if (!file) return;
    importText(await file.text(), file.name);
  };

  const algorithmTag = config.algorithm.toLowerCase();
  const stem = slugify(name);

  const exportWorkloadJson = () =>
    downloadJson(`${stem}.json`, serializeWorkload(workload, { config, name }));
  const exportRunJson = () =>
    downloadJson(`${stem}-${algorithmTag}-run.json`, serializeRun(timeline, { name }));
  const exportMetricsCsv = () =>
    downloadCsv(`metrics-${algorithmTag}.csv`, toCsv(METRICS_COLUMNS, metricsRows(timeline)));
  const exportEventsCsv = () =>
    downloadCsv(`events-${algorithmTag}.csv`, toCsv(EVENT_COLUMNS, eventsRows(timeline)));
  const exportSummaryCsv = () =>
    downloadCsv(`summary-${algorithmTag}.csv`, toCsv(SUMMARY_COLUMNS, summaryRows(timeline)));

  /* ───────────────────────────────── Render ──────────────────────────────── */

  const statusChip = !verdict.ok ? (
    <Chip tone="warn">
      <WarningIcon className="mr-1 h-3.5 w-3.5" />
      {verdict.errors.length} problem{verdict.errors.length === 1 ? '' : 's'}
    </Chip>
  ) : dirty ? (
    <Chip tone="accent">Valid — not applied</Chip>
  ) : (
    <Chip>
      <CheckIcon className="mr-1 h-3.5 w-3.5" />
      Valid
    </Chip>
  );

  return (
    <Card
      title="Workload"
      subtitle="Edit the processes, generate a set from a seed, or import and export files"
      icon={<SettingsIcon className="h-4 w-4" />}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {statusChip}
          <Button size="sm" variant="ghost" onClick={() => setDraft(toDraft(workload))} disabled={!dirty}>
            Revert
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => apply(parsed)}
            disabled={!verdict.ok || !dirty}
          >
            Apply &amp; run
          </Button>
        </div>
      }
      footer={
        <p className="text-[11px] text-ink-subtle">
          Burst notation is the assignment&rsquo;s own: <span className="font-mono">CPU 180, A 100, CPU 120</span>.
          A process takes {ALLOWED_BURST_COUNTS.join(', ')} alternating bursts, must begin and end with
          CPU, and each burst is {BURST_MIN}–{BURST_MAX} {unit} in the brief&rsquo;s own workload.
        </p>
      }
    >
      <div className="space-y-4">
        {/* ── Preset + totals ────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Select
            label="Start from"
            className="w-64"
            value=""
            onChange={(event) => loadPreset(event.target.value)}
            options={[
              { value: '', label: 'Choose a workload…' },
              ...PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
            ]}
          />

          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <Stat label="Processes" value={String(draft.length)} />
            <Stat label="Total CPU" value={`${cpuDemand} ${unit}`} />
            <Stat label="Device A" value={`${ioDemand.A} ${unit}`} />
            <Stat label="Device B" value={`${ioDemand.B} ${unit}`} />
          </dl>
        </div>

        {/* ── The editable grid ──────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <div className="min-w-[44rem]">
            <ProcessEditorHeader unitLabel={unit} />
            <div className="divide-y divide-line">
              {draft.map((row, index) => (
                <ProcessEditorRow
                  key={index}
                  row={row}
                  index={index}
                  colorIndex={(index % 8) + 1}
                  unitLabel={unit}
                  errors={rowErrors[index]}
                  onChange={(patch) => updateRow(index, patch)}
                  onRemove={() => removeRow(index)}
                  canRemove={draft.length > 1}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={addRow}>
            Add process
          </Button>
          {dirty ? (
            <span className="text-xs text-ink-subtle">
              Edits are not running yet — press <strong className="font-semibold">Apply &amp; run</strong>.
            </span>
          ) : null}
        </div>

        {/* ── Validation ─────────────────────────────────────────────────── */}
        {!verdict.ok ? (
          <Report tone="error" title="The engine cannot run this workload" items={verdict.errors} />
        ) : null}

        {boundNotes.length > 0 ? (
          <Report
            tone="note"
            title={`Outside the brief's ${BURST_MIN}–${BURST_MAX} ${unit} burst range`}
            items={boundNotes}
            limit={MAX_BOUND_NOTES}
          />
        ) : null}

        {report ? (
          <Report
            tone={report.ok ? 'ok' : 'error'}
            title={
              report.ok
                ? `Imported ${report.source}`
                : `Could not import ${report.source}`
            }
            items={[...report.errors, ...report.warnings]}
            limit={6}
          />
        ) : null}

        {/* ── Generate · Import · Export ─────────────────────────────────── */}
        <div className="grid gap-4 border-t border-line pt-4 lg:grid-cols-3">
          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              Generate from a seed
            </h3>
            <div className="flex items-end gap-2">
              <TextInput
                label="Seed"
                className="w-28"
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                mono
              />
              <NumberInput
                label="Count"
                className="w-20"
                min={1}
                max={50}
                value={count}
                onChange={(event) => setCount(event.target.value)}
              />
              <Button size="sm" icon={<DiceIcon className="h-4 w-4" />} onClick={runGenerator}>
                Generate
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              The same seed always produces the same workload, so a demo can be repeated exactly.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              Import
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                icon={<UploadIcon className="h-4 w-4" />}
                onClick={() => fileRef.current?.click()}
              >
                Choose JSON file
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPasteOpen((open) => !open)}>
                {pasteOpen ? 'Hide paste box' : 'Paste JSON'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={onFilePicked}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>

            {pasteOpen ? (
              <div className="mt-2">
                <textarea
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  rows={4}
                  spellCheck={false}
                  aria-label="Workload JSON to import"
                  placeholder='{"processes": [{"id": "P1", "arrival": 0, "priority": 3, "bursts": "CPU 180, A 100, CPU 120"}]}'
                  className="w-full rounded-lg border border-line bg-surface p-2 font-mono text-xs text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none"
                />
                <Button
                  size="sm"
                  className="mt-1"
                  onClick={() => importText(pasteText, 'pasted JSON')}
                  disabled={pasteText.trim() === ''}
                >
                  Import pasted JSON
                </Button>
              </div>
            ) : null}

            <p className="mt-1 text-[11px] text-ink-subtle">
              A bare array works too, and bursts may be written as the text form above.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              Export
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<DownloadIcon className="h-4 w-4" />} onClick={exportWorkloadJson}>
                Workload JSON
              </Button>
              <Button size="sm" icon={<DownloadIcon className="h-4 w-4" />} onClick={exportRunJson}>
                Full run JSON
              </Button>
              <Button size="sm" icon={<DownloadIcon className="h-4 w-4" />} onClick={exportMetricsCsv}>
                Metrics CSV
              </Button>
              <Button size="sm" icon={<DownloadIcon className="h-4 w-4" />} onClick={exportEventsCsv}>
                Event trace CSV
              </Button>
              <Button size="sm" icon={<DownloadIcon className="h-4 w-4" />} onClick={exportSummaryCsv}>
                Summary CSV
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-ink-subtle">
              CSVs are UTF-8 with a byte-order mark, so they open directly in Excel.
            </p>
          </section>
        </div>
      </div>
    </Card>
  );
}

/**
 * One label/value pair in the totals strip.
 *
 * @param {{label: string, value: string}} props
 */
function Stat({ label, value }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="tnum font-semibold text-ink">{value}</dd>
    </div>
  );
}

/**
 * A block of messages, capped so a workload with fifty out-of-range bursts does
 * not push the rest of the panel off the screen.
 *
 * @param {Object} props
 * @param {'error'|'note'|'ok'} props.tone
 * @param {string} props.title
 * @param {string[]} props.items
 * @param {number} [props.limit]
 */
function Report({ tone, title, items, limit = Infinity }) {
  if (items.length === 0) return null;

  const shown = items.slice(0, limit);
  const hidden = items.length - shown.length;

  const skin = {
    error: 'border-state-terminated/40 bg-state-terminated/5 text-state-terminated',
    note: 'border-state-waiting/40 bg-state-waiting/5 text-ink',
    ok: 'border-accent/40 bg-accent/5 text-ink',
  }[tone];

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${skin}`}>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {/* Keyed by position, not by text: two processes can legitimately
            produce the same message (duplicate IDs with the same second
            problem), and duplicate keys would be a React error. */}
        {shown.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
        {hidden > 0 ? <li className="list-none italic">…and {hidden} more.</li> : null}
      </ul>
    </div>
  );
}
