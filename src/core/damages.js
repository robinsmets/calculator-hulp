/**
 * Finds which damages had stucloper work calculated for them.
 *
 * A building part counts towards the totals when at least one of its causal
 * damages appears in the damage list of a trigger-code repair row.
 */

import { parseNumberList, escapeRegExp } from "./text.js";

/**
 * How far after a code to look for its damage list.
 *
 * This window does NOT stop at the row boundary, so a trigger row carrying no
 * damages of its own will adopt a later, unrelated row's list if it falls
 * inside the window. Preserved.
 */
const DAMAGE_SEARCH_WINDOW = 400;

/**
 * @param {string} text page text
 * @param {string[]} codes configured trigger codes
 * @returns {{damages: Set<number>, perCode: Record<string, number[][]>}}
 */
export function parseTriggerDamages(text, codes) {
  const damages = new Set();
  const perCode = {};

  for (const code of codes) {
    // Codes are user-editable, so a stray "." must not become a wildcard.
    const pattern = new RegExp(
      "\\b" + escapeRegExp(code) + "\\b[\\s\\S]{0," + DAMAGE_SEARCH_WINDOW + "}?Schades:\\s*([0-9, ]+)",
      "gi"
    );

    const found = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const numbers = parseNumberList(match[1]);
      numbers.forEach((n) => damages.add(n));
      found.push(numbers);
    }
    perCode[code] = found;
  }

  return { damages, perCode };
}

/**
 * @param {import("./walls.js").WallSection} section
 * @param {Set<number>} damages
 * @returns {boolean}
 */
export function isSectionMatched(section, damages) {
  return section.causaal.some((number) => damages.has(number));
}
