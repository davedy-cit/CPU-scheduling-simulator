/**
 * CSV encoder tests.
 *
 * The encoder is small enough to look obviously correct and is exactly the kind
 * of code that is not: quoting, line endings and spreadsheet formula handling
 * each have a failure mode that only shows up when a real file is opened in
 * Excel. Each one is pinned below.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { csvCell, toCsv } from '../csv.js';
import { canDownload, downloadJson } from '../download.js';
import {
  EVENT_COLUMNS,
  METRICS_COLUMNS,
  SUMMARY_COLUMNS,
  eventsRows,
  metricsRows,
  summaryRows,
} from '../exporters.js';
import { DEFAULT_CONFIG } from '../../engine/constants.js';
import { simulate } from '../../engine/simulate.js';
import { SAMPLE_WORKLOAD } from '../../data/sampleWorkload.js';

/* ────────────────────────────────── Cells ────────────────────────────────── */

test('plain values are emitted unquoted', () => {
  assert.equal(csvCell('P1'), 'P1');
  assert.equal(csvCell(180), '180');
  assert.equal(csvCell(0), '0');
  assert.equal(csvCell(false), 'false');
});

test('null and undefined become empty cells, not the words "null"/"undefined"', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('a value containing a comma, quote or newline is quoted', () => {
  assert.equal(csvCell('Ready, waiting'), '"Ready, waiting"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
});

test('a spreadsheet formula is defused with a leading apostrophe', () => {
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('+A1'), "'+A1");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('-1+1'), "'-1+1");
});

test('a negative number stays a number', () => {
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell(-1.5), '-1.5');
  assert.equal(csvCell('-42'), '-42');
});

test('a formula that also needs quoting gets both treatments', () => {
  assert.equal(csvCell('=SUM(A1,B1)'), '"\'=SUM(A1,B1)"');
});

/* ────────────────────────────────── Tables ───────────────────────────────── */

test('a table is a header row, the data rows, and a trailing CRLF', () => {
  const csv = toCsv(
    [
      { key: 'id', label: 'Process' },
      { key: 'arrival', label: 'Arrival' },
    ],
    [
      { id: 'P1', arrival: 0 },
      { id: 'P2', arrival: 30 },
    ],
  );

  assert.equal(csv, 'Process,Arrival\r\nP1,0\r\nP2,30\r\n');
});

test('bare string columns use the key as the label', () => {
  assert.equal(toCsv(['id', 'arrival'], [{ id: 'P1', arrival: 0 }]), 'id,arrival\r\nP1,0\r\n');
});

test('a missing key exports as an empty cell rather than "undefined"', () => {
  assert.equal(toCsv(['id', 'nope'], [{ id: 'P1' }]), 'id,nope\r\nP1,\r\n');
});

test('a header-only table is still a valid file', () => {
  assert.equal(toCsv(['id'], []), 'id\r\n');
});

/* ──────────────────────────── Exported timeline tables ───────────────────── */

const timeline = simulate(SAMPLE_WORKLOAD, { ...DEFAULT_CONFIG, algorithm: 'SRTF' });

/**
 * Parse a CSV back into rows of cells.
 *
 * A naive `split(',')` would miscount any row containing a quoted comma — and
 * the summary table has those by design, because its Definition column holds
 * prose. Parsing properly is also the only way to check that the quoting the
 * encoder produced is something a reader can actually undo, which is the
 * property Excel depends on.
 *
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = false;
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += char;
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/**
 * Assert every row has exactly one cell per column, and that the file has the
 * header plus the expected number of data rows.
 *
 * @param {string} csv
 * @param {number} columnCount
 * @param {number} rowCount
 * @param {string} what
 */
function assertRectangular(csv, columnCount, rowCount, what) {
  const rows = parseCsv(csv);

  assert.equal(rows.length, rowCount + 1, `${what}: row count`);
  for (const [index, row] of rows.entries()) {
    assert.equal(row.length, columnCount, `${what}: row ${index} has ${row.length} cells`);
  }
  return rows;
}

test('the metrics table has one column per definition and one row per process', () => {
  const csv = toCsv(METRICS_COLUMNS, metricsRows(timeline));
  const rows = assertRectangular(csv, METRICS_COLUMNS.length, SAMPLE_WORKLOAD.length, 'metrics');

  assert.deepEqual(rows[0], [
    'Process',
    'Arrival',
    'Priority',
    'Completion',
    'Turnaround',
    'Response',
    'Ready wait',
    'Job wait',
    'Device wait',
    'CPU time',
    'Preemptions',
    'I/O requests',
  ]);

  // The values must survive the round trip as numbers, not as text.
  const p1 = rows.find((row) => row[0] === 'P1');
  assert.equal(Number(p1[1]), 0);
  assert.equal(Number(p1[5]), timeline.metrics.find((m) => m.id === 'P1').response);
});

test('the event trace exports every event, humanised', () => {
  const rows = eventsRows(timeline);
  assert.equal(rows.length, timeline.events.length);
  assert.ok(rows.some((row) => row.reason === 'Context switch'));
  assert.ok(rows.every((row) => /^[A-Z]/.test(row.reason)));
});

test('the event trace is rectangular', () => {
  assertRectangular(
    toCsv(EVENT_COLUMNS, eventsRows(timeline)),
    EVENT_COLUMNS.length,
    timeline.events.length,
    'events',
  );
});

test('the summary exports a metric, a value and a definition for each row', () => {
  const rows = summaryRows(timeline);

  assert.ok(rows.length > 15);
  assert.ok(rows.every((row) => typeof row.metric === 'string' && row.definition.length > 0));
  assert.ok(rows.some((row) => row.metric === 'Makespan' && row.value === timeline.summary.makespan));
});

test('the summary says which definitions exclude switch time', () => {
  const rows = summaryRows(timeline);
  const cpu = rows.find((row) => row.metric === 'CPU utilisation (%)');
  assert.match(cpu.definition, /excludes context-switch ticks/);
});

test('the summary is rectangular, quoted commas and all', () => {
  const rows = summaryRows(timeline);
  const parsed = assertRectangular(
    toCsv(SUMMARY_COLUMNS, rows),
    SUMMARY_COLUMNS.length,
    rows.length,
    'summary',
  );

  // The Definition column holds prose with commas in it, so this row is the one
  // that proves the quoting survives a real parse rather than merely looking
  // right in the file.
  const turnaround = parsed.find((row) => row[0] === 'Average turnaround');
  assert.equal(turnaround[2], 'Mean of (completion − arrival), in ms');
});

test('a Round Robin run reports its quantum in the summary', () => {
  const rr = simulate(SAMPLE_WORKLOAD, { ...DEFAULT_CONFIG, algorithm: 'RR', quantum: 75 });
  const rows = summaryRows(rr);
  assert.ok(rows.some((row) => row.metric === 'Quantum' && row.value === 75));

  const fcfs = summaryRows(timeline);
  assert.equal(fcfs.some((row) => row.metric === 'Quantum'), false);
});

/* ────────────────────────────────── Download ─────────────────────────────── */

test('downloads are a no-op outside a browser rather than a crash', () => {
  // Node has no `document`, which is exactly the situation a server-side render
  // puts the app in. The export buttons must survive being rendered there.
  assert.equal(canDownload(), false);
  assert.equal(downloadJson('x.json', { a: 1 }), false);
});
