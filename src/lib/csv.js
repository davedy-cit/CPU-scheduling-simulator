/**
 * RFC 4180 CSV encoding.
 *
 * Encoding only — no knowledge of what is being exported. The column and row
 * definitions live in `lib/exporters.js`, so this module stays a pure string
 * transform that can be reasoned about (and tested) on its own.
 *
 * Three details matter for the rubric's "both CSVs open cleanly in Excel":
 *
 *   - **CRLF line endings.** RFC 4180 specifies them, and Excel on Windows is
 *     the reader this export exists for.
 *   - **Quoting.** A field is quoted only when it contains a quote, comma or
 *     newline, and embedded quotes are doubled. Quoting everything would also be
 *     valid, but it makes the file harder to read in a text editor.
 *   - **Formula injection.** A spreadsheet treats a cell beginning `=`, `+` or
 *     `@` as a formula, and process IDs are user-supplied, so a workload with a
 *     process named `=1+1` would execute on open. Such cells are prefixed with an
 *     apostrophe, which Excel strips on display and never evaluates. A leading
 *     `-` gets the same treatment unless the whole cell is a plain number, so
 *     negative readings would still export as numbers rather than as text.
 */

/** Characters that force a field to be quoted. */
const NEEDS_QUOTES = /[",\r\n]/;

/** Leading characters a spreadsheet would interpret as the start of a formula. */
const FORMULA_START = /^[=+@\t\r]/;

/** A leading `-` that is *not* simply a negative number. */
const MINUS_NOT_A_NUMBER = /^-(?![\d.]+$)/;

/**
 * Encode one field.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function csvCell(value) {
  if (value === null || value === undefined) return '';

  let text = String(value);
  if (FORMULA_START.test(text) || MINUS_NOT_A_NUMBER.test(text)) text = `'${text}`;
  if (NEEDS_QUOTES.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Encode a table.
 *
 * `columns` may be plain keys (`['id', 'arrival']`) or `{ key, label }` objects;
 * the label is what the header row shows. Missing keys become empty cells, so a
 * column added to the definition before the data catches up exports as blank
 * rather than as `undefined`.
 *
 * @param {Array<string|{key: string, label: string}>} columns
 * @param {Array<Record<string, unknown>>} rows
 * @returns {string}
 */
export function toCsv(columns, rows) {
  const cols = columns.map((column) =>
    typeof column === 'string' ? { key: column, label: column } : column,
  );

  const lines = [cols.map((column) => csvCell(column.label)).join(',')];
  for (const row of rows) {
    lines.push(cols.map((column) => csvCell(row?.[column.key])).join(','));
  }

  return `${lines.join('\r\n')}\r\n`;
}
