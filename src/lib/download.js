/**
 * Browser file downloads.
 *
 * A `Blob` plus a temporary object URL is the whole mechanism — no dependency,
 * and no server, which is what keeps this a genuinely client-side SPA.
 *
 * The object URL is revoked on the next macrotask rather than immediately after
 * `click()`. Revoking it synchronously looks correct and works in Chrome, but
 * Firefox and Safari resolve the download asynchronously and end up fetching a
 * URL that no longer exists, producing an empty file.
 */

/**
 * Whether this environment can trigger a download at all. False during a
 * server-side render, where `document` does not exist.
 *
 * @returns {boolean}
 */
export function canDownload() {
  return (
    typeof document !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

/**
 * Save a blob under `filename`.
 *
 * @param {string} filename
 * @param {Blob} blob
 * @returns {boolean} False when downloads are unavailable in this environment.
 */
export function downloadBlob(filename, blob) {
  if (!canDownload()) return false;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);

  return true;
}

/**
 * Save a string as a file.
 *
 * @param {string} filename
 * @param {string} text
 * @param {string} [mime]
 * @returns {boolean}
 */
export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  return downloadBlob(filename, new Blob([text], { type: mime }));
}

/**
 * Save a value as pretty-printed JSON.
 *
 * @param {string} filename
 * @param {unknown} data
 * @returns {boolean}
 */
export function downloadJson(filename, data) {
  return downloadText(filename, `${JSON.stringify(data, null, 2)}\n`, 'application/json;charset=utf-8');
}

/**
 * The UTF-8 byte-order mark.
 *
 * Built from its code point rather than written as an escape or pasted in
 * literally: as a literal it is invisible in every editor and is exactly the
 * kind of character a formatter or a careless copy-paste deletes without anyone
 * noticing until Excel mangles a name.
 */
const BOM = String.fromCharCode(0xfeff);

/**
 * Save CSV, with the UTF-8 byte-order mark Excel needs.
 *
 * Without the BOM Excel reads a UTF-8 file using the system ANSI codepage and
 * mangles every non-ASCII character. The mark is added here rather than in
 * `toCsv` so the encoder stays a pure, testable string transform.
 *
 * @param {string} filename
 * @param {string} csv
 * @returns {boolean}
 */
export function downloadCsv(filename, csv) {
  return downloadText(filename, BOM + csv, 'text/csv;charset=utf-8');
}
