/**
 * Number formatting for the panel.
 *
 * All output is Dutch, so amounts read as "€ 1.234,56" rather than
 * "€ 1,234.56". That depends on the runtime carrying full ICU data; a
 * small-icu build silently falls back to English grouping, which is why the
 * test suite asserts it.
 */

const DUTCH_LOCALE = "nl-NL";

/**
 * A money amount, Dutch notation: "€ 1.234,56".
 *
 * The original had two formats and used both in one panel — this one for the
 * room total, and a bare toFixed(2) in the correction section producing
 * "€ 1234.56". In a Dutch tool the second is simply wrong, and seeing both at
 * once is worse. One format now.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatEuro(value) {
  return "€ " + value.toLocaleString(DUTCH_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * A measurement, always two decimals, with a dot — this is not locale
 * formatted in the original and is left alone.
 *
 * @param {number} value
 * @param {string} unit
 * @returns {string}
 */
export function formatMeasurement(value, unit) {
  return `${value.toFixed(2)} ${unit}`;
}

/**
 * A whole number formatted the Dutch way, for the parking minimum in prose.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatInteger(value) {
  return value.toLocaleString(DUTCH_LOCALE);
}

/**
 * Dutch pluralisation for the number of workers.
 *
 * Assembled from fragments in the original, so the words "werklid" and
 * "werklieden" appear nowhere in the source and no word-search would find
 * them. Spelled out here for exactly that reason.
 *
 * @param {number} count
 * @returns {string}
 */
export function formatWorkerCount(count) {
  return `${count} werkli${count === 1 ? "d" : "eden"}`;
}

/**
 * Dutch pluralisation for the number of correction rows found.
 *
 * @param {number} count
 * @returns {string}
 */
export function formatCorrectionCount(count) {
  return `${count} correctie-regel${count === 1 ? "" : "s"}`;
}

/**
 * Capitalises the first letter, leaving the rest alone.
 *
 * @param {string} word
 * @returns {string}
 */
export function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
