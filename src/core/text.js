/**
 * Text and number helpers shared by the parsers.
 *
 * There are THREE different ways this codebase turns Dutch number text into a
 * JavaScript number, and they are not interchangeable. Unifying them looks like
 * an obvious cleanup and would change results on real pages, so they are kept
 * as three named functions with the difference stated explicitly.
 */

/**
 * Splits a list of damage numbers.
 *
 * Separated by commas OR newlines: a causal list can run over several lines,
 * and the original split on commas only, so `parseInt("2\n3")` quietly
 * returned 2 and the 3 disappeared.
 *
 * Note the explicit radix: `parseInt(s, 10)` stops at the first non-digit, so
 * "0x10" yields 0 rather than 16. Left as it was — it needs a genuinely
 * malformed page to matter.
 *
 * @param {string} str e.g. "1, 2, 3"
 * @returns {number[]}
 */
export function parseNumberList(str) {
  return (str || "")
    .split(/[,\n]/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}

/**
 * Parses a measurement: comma is the decimal separator, and a dot is NOT
 * treated as a thousands separator.
 *
 * So "1.234,50" reads as 1.234 — one and a bit metres. That is almost
 * certainly wrong for a real page carrying thousands separators, but it is
 * what the shipped code does for wall dimensions and floor areas, and changing
 * it changes surface calculations.
 *
 * Contrast with {@link parseDutchAmount}, which does strip dots.
 *
 * @param {string} str e.g. "3,50"
 * @returns {number}
 */
export function parseDutchMeasurement(str) {
  return parseFloat(String(str).replace(",", "."));
}

/**
 * Parses a money amount: dots are thousands separators and are removed, then
 * the comma becomes the decimal point.
 *
 * So "1.234,50" reads as 1234.50 — the opposite of
 * {@link parseDutchMeasurement}. Both behaviours are shipped; keep them apart.
 *
 * @param {string} str e.g. "24.100,00"
 * @returns {number|null} null when the text is not a number
 */
export function parseDutchAmount(str) {
  const value = parseFloat(String(str).replace(/\./g, "").replace(",", "."));
  return isNaN(value) ? null : value;
}

/**
 * Escapes a string for literal use inside a regular expression.
 *
 * Needed because trigger codes are user-editable: a stray "." must match a
 * literal dot rather than any character, and a stray "(" must not throw.
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeRegExp(str) {
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}
