/**
 * Parses building parts — walls on a room page, facades on a "Buitenkant
 * gebouw" page.
 *
 * Both have the same structure (Hoogte / Breedte / Causaal); only the label
 * differs. So one parser handles both and keeps whichever word it found,
 * because that word drives Dutch UI text later on.
 *
 * Every literal in the patterns below matches the live Dutch page. Translating
 * any of them does not throw — the parser simply returns nothing, the panel
 * renders "nog geen wandgegevens gevonden", and it reads like a page that has
 * not finished loading. See docs/glossary.md, category 3.
 */

import { parseNumberList, parseDutchMeasurement } from "./text.js";

/**
 * Building part headings: "Wand 1", "Wand 2A", "Gevel 1", "Gevel 2a".
 *
 * Case sensitive on purpose — a lowercase "wand" in prose is not a heading.
 * The `\w+` suffix cannot cross a hyphen, so "Wand A-1" captures as "Wand A".
 */
const HEADING_PATTERN = /\b(Wand|Gevel)\s+(\w+)/g;

const WIDTH_PATTERN = /Breedte\s*\n+\s*([\d.,]+)\s*m\b/i;
const HEIGHT_PATTERN = /Hoogte\s*\n+\s*([\d.,]+)\s*m\b/i;

/**
 * The causal damage list: one or more lines of numbers.
 *
 * Matches those number lines directly and stops at the first line that is not
 * one, whatever it happens to start with.
 *
 * The original instead looked ahead for a line beginning with a letter, which
 * failed in two ways the owner confirmed happen on real pages:
 *
 *   - A following line starting with a euro sign, bullet, parenthesis or dash
 *     matched neither alternative, so the WHOLE match failed and the part ended
 *     up with no causal damages at all. It then silently stopped counting
 *     towards the totals — wrong m² on a quote, with no warning.
 *   - A following line starting with a digit was swallowed instead, and the
 *     number parser truncated at the newline, so a damage number vanished.
 *
 * Both are fixed here: the amount below a causal list now ends it cleanly, and
 * a genuinely multi-line list keeps every number.
 */
const CAUSAL_PATTERN = /(?:^|\n)Causaal\s*\n+((?:[ \t]*[\d]+[\d,\s]*?(?:\n|$))+)/i;

/**
 * @typedef {object} WallSection
 * @property {string} naam        e.g. "Wand 1"
 * @property {"wand"|"gevel"} soort
 * @property {number} breedte     metres
 * @property {number|null} hoogte metres, or null when the page omits it
 * @property {number[]} causaal   damage numbers attributed to this part
 */

/**
 * @param {string} text page text (`document.body.innerText`)
 * @returns {WallSection[]}
 */
export function parseWallSections(text) {
  const headings = [...text.matchAll(HEADING_PATTERN)];
  const sections = [];

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    const block = text.slice(start, end);

    const width = block.match(WIDTH_PATTERN);
    // No width means no usable part. Height may legitimately be missing; the
    // panel renders "? (geen hoogte)" for those.
    if (!width) continue;

    const height = block.match(HEIGHT_PATTERN);
    const causaal = block.match(CAUSAL_PATTERN);

    sections.push({
      naam: `${headings[i][1]} ${headings[i][2]}`,
      soort: headings[i][1].toLowerCase() === "gevel" ? "gevel" : "wand",
      breedte: parseDutchMeasurement(width[1]),
      hoogte: height ? parseDutchMeasurement(height[1]) : null,
      causaal: causaal ? parseNumberList(causaal[1]) : []
    });
  }

  return sections;
}

/**
 * The label used for this page's parts, and its plural.
 *
 * A page should only ever contain one kind, but both is handled defensively.
 * Note the singular is also an internal discriminator, so the values stay
 * Dutch — they are derived from the page's own wording.
 *
 * @param {WallSection[]} sections
 * @returns {{kindLabel: string, kindLabelPlural: string}}
 */
export function describeKind(sections) {
  const kinds = new Set(sections.map((section) => section.soort));
  const kindLabel = kinds.size === 1 ? [...kinds][0] : "wand/gevel";

  const kindLabelPlural =
    kindLabel === "gevel" ? "gevels" :
    kindLabel === "wand" ? "wanden" :
    "wanden/gevels";

  return { kindLabel, kindLabelPlural };
}

/**
 * Surface area of a part, or null when its height is unknown.
 *
 * @param {WallSection} section
 * @returns {number|null}
 */
export function sectionArea(section) {
  return section.hoogte != null ? (section.breedte || 0) * section.hoogte : null;
}
