/**
 * Room-level figures: floor area and the room total.
 */

import { parseDutchMeasurement, parseDutchAmount } from "./text.js";

const FLOOR_AREA_PATTERN = /Oppervlakte van de vloer\s*\n+\s*([\d.,]+)/i;

/**
 * The room total excluding VAT.
 *
 * Label and amount may share a line (possibly with empty cells between) or sit
 * on separate lines, hence the loose non-greedy window.
 *
 * LEADING WHITESPACE IS ALLOWED, and that is load-bearing. The total sits in
 * the calculation table, and Chrome's innerText separates table cells with a
 * TAB and rows with a newline. A row whose first cell is the empty code column
 * therefore reads as "\n\tTotaal\t€ 24.100,00" — with the label not at the
 * start of its line at all. Anchored strictly, this pattern matched nothing on
 * a real page: no room total, so no parking section, silently.
 *
 * The `\b` after the label is what keeps "Totale breedte" out; the anchor never
 * contributed to that. ROW_START_ANCHOR in row-grammar.js is loose for the same
 * reason, discovered the same way.
 *
 * The pattern cannot start on a minus sign, so a negative total yields null —
 * indistinguishable from "no total on this page". Preserved.
 */
const ROOM_TOTAL_PATTERN = /(?:^|\n)[ \t]*Totaal\b[\s\S]{0,60}?€\s*([\d.,]+)/gi;

/**
 * The room's own floor area, which caps the stucloper surface.
 *
 * Uses measurement parsing, so a dot is a decimal point rather than a
 * thousands separator — the same convention the wall dimensions use.
 *
 * @param {string} text
 * @returns {number|null}
 */
export function parseFloorArea(text) {
  const match = text.match(FLOOR_AREA_PATTERN);
  return match ? parseDutchMeasurement(match[1]) : null;
}

/**
 * The room total, taking the LAST match on the page.
 *
 * There is a subtotal higher up ("Totaal herstelwerkzaamheden op schade
 * niveau"), and the real room total appears further down the table, so last
 * wins. The same rule means a trailing "Totaal incl. BTW" row beats the
 * excl-VAT figure the parking calculation is actually specified on. Preserved.
 *
 * Unlike floor area, this uses amount parsing: dots ARE thousands separators
 * here.
 *
 * @param {string} text
 * @returns {number|null}
 */
export function parseRoomTotal(text) {
  const pattern = new RegExp(ROOM_TOTAL_PATTERN.source, ROOM_TOTAL_PATTERN.flags);

  let match;
  let last = null;
  while ((match = pattern.exec(text)) !== null) last = match[1];

  return last === null ? null : parseDutchAmount(last);
}

/**
 * Stucloper totals for the parts that count.
 *
 * Stucloper is laid as a one-metre-deep strip along each wall, so the area in
 * m² equals the total width in m1 — capped at the room's floor area, because
 * there is never more floor than there is.
 *
 * The comparison is strict: at exactly equal, no capping applies. The capped
 * and uncapped areas are numerically identical at that point, so the only
 * observable difference is the flag and the note it produces in the panel.
 *
 * @param {import("./walls.js").WallSection[]} matched
 * @param {number|null} floorArea
 */
export function calculateStucloperTotals(matched, floorArea) {
  const totalWidth = matched.reduce((sum, section) => sum + (section.breedte || 0), 0);

  // Width times height, a separate control figure for paintwork and plastering.
  // NOT the basis for the stucloper area.
  const wallSurfaceArea = matched.reduce(
    (sum, section) => sum + (section.breedte || 0) * (section.hoogte || 0), 0);

  const areaCappedToFloor = floorArea != null && totalWidth > floorArea;
  const totalArea = areaCappedToFloor ? floorArea : totalWidth;

  return { totalWidth, totalArea, wallSurfaceArea, areaCappedToFloor };
}
