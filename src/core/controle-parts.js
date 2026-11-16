/**
 * Parses building parts on the Controletool, which lays the same information
 * out very differently from the Calculatietool that `walls.js` reads.
 *
 * There, a wall's Breedte/Hoogte/Causaal-lijst sit directly under its own
 * heading. Here they are split across two tables:
 *
 *   Bouwdelen      one row per Wand/Gevel, with Hoogte and Breedte as two
 *                  bare "N.Nm" figures — no "Breedte"/"Hoogte" label next to
 *                  the number at all.
 *   Schadeopname   one row per schade NUMBER, naming which Wand/Gevel it was
 *                  found on. This is the causal link that on the Calculatietool
 *                  lives inside the wall's own block.
 *
 * Both parsers below scope themselves to text BETWEEN two section headings
 * before matching anything inside. That is not tidiness: "Wand 1", "Gevel 1A"
 * etc. reappear, verbatim, as a column value in the Schadeopname table further
 * down the same page. Matching `\b(Wand|Gevel)\s+(\w+)` against the whole page
 * (the way `walls.js` safely does, because its page never repeats a heading)
 * would treat every one of those repeats as a second, spurious heading here,
 * and silently mis-slice every block after it.
 *
 * The result of `buildControleSections` is a `WallSection[]` — the exact shape
 * `parseWallSections` produces — specifically so every downstream function
 * (`isSectionMatched`, `describeKind`, `sectionArea`,
 * `calculateStucloperTotals`) needs no controletool-specific version at all.
 *
 * Every literal below matches the live Dutch page. See `walls.js` for what
 * translating one of them actually does — nothing throws, the panel just goes
 * quietly empty.
 */

import { parseDutchMeasurement } from "./text.js";

/** The section heading this whole module scopes itself to. */
const BOUWDELEN_HEADING = "Bouwdelen";

/** The heading `parseBouwdelen` scopes its own section up to — see there. */
const SCHADEOPNAME_HEADING = "Schadeopname";

/** Building-part heading, same rule as `walls.js`'s HEADING_PATTERN. */
const HEADING_PATTERN = /\b(Wand|Gevel)\s+(\w+)/g;

/**
 * Hoogte then Breedte, as two bare measurements separated only by tab/space —
 * never a newline. That distinction is load-bearing: the Aansomend figure
 * just above ("5,00" on its own line, followed by "mm/s" on the NEXT line)
 * would otherwise be misread as the first half of the pair, because "mm/s"
 * also starts with a bare "m". A newline sits between "5,00" and that "m", so
 * requiring `[ \t]+` — not `\s+` — between the two halves rules it out.
 */
const DIMENSIONS_PATTERN = /([\d]+[.,][\d]+)\s*m[ \t]+([\d]+[.,][\d]+)\s*m\b/;

/** One Schadeopname row: schade number, then (skipping the description) the building part it was found on. */
const SCHADE_ROW_PATTERN = /(?:^|\n)(\d+)\t[^\t\n]*\t((?:Wand|Gevel)\s+\w+)\t/g;

/**
 * Text between two section headings, first-to-first. Non-greedy, so a
 * repeated later heading (there isn't one, but nothing here should assume
 * that) can never pull the slice past the section it names.
 *
 * @param {string} text
 * @param {string} startLabel
 * @param {string} endLabel
 * @returns {string} "" when either heading is absent
 */
function sectionBetween(text, startLabel, endLabel) {
  const pattern = new RegExp(
    "\\b" + startLabel + "\\b([\\s\\S]*?)\\b" + endLabel + "\\b");
  const match = text.match(pattern);
  return match ? match[1] : "";
}

/**
 * @typedef {object} BouwdeelPart
 * @property {string} naam        e.g. "Wand 1", "Gevel 1A"
 * @property {"wand"|"gevel"} soort
 * @property {number} breedte     metres
 * @property {number|null} hoogte metres, or null when the row omits it
 */

/**
 * @param {string} text page text (`document.body.innerText`)
 * @returns {BouwdeelPart[]}
 */
export function parseBouwdelen(text) {
  const section = sectionBetween(text, BOUWDELEN_HEADING, SCHADEOPNAME_HEADING);
  const headings = [...section.matchAll(HEADING_PATTERN)];
  const parts = [];

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : section.length;
    const block = section.slice(start, end);

    const dimensions = block.match(DIMENSIONS_PATTERN);
    if (!dimensions) continue;

    parts.push({
      naam: `${headings[i][1]} ${headings[i][2]}`,
      soort: headings[i][1].toLowerCase() === "gevel" ? "gevel" : "wand",
      hoogte: parseDutchMeasurement(dimensions[1]),
      breedte: parseDutchMeasurement(dimensions[2])
    });
  }

  return parts;
}

/**
 * @typedef {object} SchadeopnameRow
 * @property {number} nr
 * @property {string} naam the Wand/Gevel this damage was recorded on
 */

/**
 * @param {string} text page text
 * @returns {SchadeopnameRow[]}
 */
export function parseSchadeopname(text) {
  const section = sectionBetween(text, SCHADEOPNAME_HEADING, "Analyse en beoordeling");
  const pattern = new RegExp(SCHADE_ROW_PATTERN.source, SCHADE_ROW_PATTERN.flags);

  const rows = [];
  let match;
  while ((match = pattern.exec(section)) !== null) {
    rows.push({ nr: parseInt(match[1], 10), naam: match[2] });
  }
  return rows;
}

/**
 * Joins the two tables into the same `WallSection` shape `parseWallSections`
 * produces on the Calculatietool, `causaal` included — built here from the
 * Schadeopname rows that name each part, rather than parsed off an embedded
 * list.
 *
 * @param {BouwdeelPart[]} bouwdelen
 * @param {SchadeopnameRow[]} schadeopname
 * @returns {import("./walls.js").WallSection[]}
 */
export function buildControleSections(bouwdelen, schadeopname) {
  return bouwdelen.map((part) => ({
    naam: part.naam,
    soort: part.soort,
    breedte: part.breedte,
    hoogte: part.hoogte,
    causaal: schadeopname
      .filter((row) => row.naam === part.naam)
      .map((row) => row.nr)
  }));
}

/**
 * Whether the word "Bouwdelen" is present on the page right now.
 *
 * Both tools embed a read-only "Ruimte informatie / Schadeoverzicht /
 * Herstelwerkzaamheden op schadeniveau" reference widget on their room
 * pages, with its own internal tabs that do not change the url. Only its
 * "Ruimte informatie" tab renders this heading; content.js uses this to
 * decide the panel should never show while any of the OTHER tabs is active —
 * unconditionally, regardless of what else the room otherwise has to say (a
 * repair total, an active correction finding): the owner confirmed neither
 * should keep the panel up there.
 *
 * A bare word match on purpose, NOT requiring a later "Schadeopname" heading
 * the way `parseBouwdelen` itself does: tried that first, and on this
 * embedded widget's compact per-tab layout "Schadeopname" never actually
 * follows "Bouwdelen" the way it does on parseBouwdelen's real input (a full
 * standalone Controletool page) — so requiring it hid the panel on a room
 * genuinely showing its "Ruimte informatie" tab, with real Bouwdelen
 * entries, which is exactly what this function exists to keep visible. The
 * owner was explicit: the word itself is the trigger, full stop.
 *
 * @param {string} text page text (`document.body.innerText`)
 * @returns {boolean}
 */
export function hasBouwdelenSection(text) {
  return new RegExp("\\b" + BOUWDELEN_HEADING + "\\b").test(text || "");
}
