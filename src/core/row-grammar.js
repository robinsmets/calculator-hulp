/**
 * Reads rows out of the calculation table.
 *
 * The table holds two kinds of row, and they are told apart by STRUCTURE, never
 * by wording:
 *
 *   repair rows      a real code in the code column, e.g. B514
 *   correction rows  a dash instead of a code, plus a negative excl-VAT amount
 *
 * Correction wording is free text the user types — sometimes carrying a file
 * number, date or damage number, sometimes just a short description — so it
 * cannot be used to identify them. The negative amount is the decisive signal.
 *
 * Every pattern fragment below has a reason attached. Several exist because a
 * stricter version turned out not to match the real page, and a whitespace
 * tweak here silently reverts that.
 */

/** The four code formats seen in the table. */
const ROW_CODE_PATTERN = "(?:B\\d{3}|G\\d{3}|VZ-BI-\\d{3}|VZ-BUI-\\d{3,4})";

/**
 * Field separator: at least one newline, tolerant of stray spaces, tabs and
 * blank lines. A stricter "exactly one \n" did not hold on the real page.
 */
const FIELD_SEPARATOR = "\\s*\\n\\s*";

/**
 * Start of a row: start-of-text or a newline, with optional leading whitespace.
 * The real page emits " B109" with a leading space, and without this tolerance
 * no repair row was found at all.
 */
const ROW_START_ANCHOR = "(?:^|\\n)[ \\t]*";

/**
 * End of a row: the next row's marker, the Totaal line, or the "Voorziening
 * toevoegen" button.
 *
 * That last anchor is not redundant. The button is always present, whereas the
 * Totaal line disappears as soon as a correction exceeds its matched row —
 * which is exactly the case the correction check exists for. Without it, such a
 * row runs past the character cap below and vanishes entirely.
 */
const ROW_END_BOUNDARY =
  "(?=\\n[ \\t]*(?:-|" + ROW_CODE_PATTERN + ")" + FIELD_SEPARATOR +
  "|\\nTotaal\\b|\\n[ \\t]*Voorziening\\b|$)";

/** Description length caps. Longer descriptions make the row vanish. */
const REPAIR_DESCRIPTION_CAP = 150;
const CORRECTION_DESCRIPTION_CAP = 300;

/** How much trailing row content to scan for the amount. */
const ROW_TAIL_CAP = 300;

/** Amounts in the row tail. The last one is the excl-VAT figure. */
const AMOUNT_PATTERN = /€\s*(-?[\d.,]+)/g;

/**
 * The BTW percentage, wherever it lands right after the row's last amount.
 *
 * A calculated (read-only) row renders it as plain text: "21 %". An EDITABLE
 * row — every correction, and any manually added "Voorziening" — has a BTW
 * dropdown instead, and the text stream that also carries the Aantal INPUT's
 * value renders the selected percentage as a bare number with no "%" sign,
 * TWICE: confirmed against a real page, "...€ -824,10\n21\n21". Both shapes
 * are simply "a 1-2 digit number right after the last amount", so one
 * pattern covers both without caring whether a "%" follows.
 */
const VAT_PERCENTAGE_PATTERN = /(\d{1,2})/;

/** Trailing "Schades: 1, 2" annotation on a repair description. */
const DAMAGE_ANNOTATION_PATTERN = /\n?Schades:.*$/i;

/**
 * A correction description states its PURPOSE at the end: "overzetten stucwerk
 * wanden t.b.v. sauswerk" is about stucwerk, not sauswerk. Matching on the
 * whole string lets the purpose word win, so the tail is dropped.
 */
const PURPOSE_SUFFIX_PATTERN = /\s*\b(?:t\.?\s?b\.?\s?v\.?|ten\s+behoeve\s+van)\b[\s\S]*$/i;

/** Minimum length that must remain, so a description STARTING with t.b.v. survives. */
const MIN_MEANINGFUL_LENGTH = 3;

/**
 * Splits on a spaced hyphen, en dash or em dash — or one straight after a
 * closing parenthesis with a space behind it. The owner hit "Hal (wand 2a)-
 * Gehele wand …": with no split the room name stayed in the match text and
 * "Sauswerk wanden" won on raw overlap. Only after ")": a bare "de- en
 * hermonteren" or "brand- / rookmelder" is wording, not a separator.
 */
const SEGMENT_SEPARATOR = /\s[-–—]\s|\)[-–—]\s/;

const CASE_REF_PATTERN = /dossier\s+(\S+)/i;
const DATE_PATTERN = /d\.d\.?\s*([\d\-/]+)/i;
const DAMAGE_NUMBER_PATTERN = /schade\s+(\d+)/i;

/**
 * Fixed words every genuine correction description carries, in some order:
 * "CORRECTIE(POST) DOSSIER <ref> ...". Not used to identify a correction row
 * — the dash marker plus negative amount already does that reliably, see the
 * module comment — but used as a confirming signal in two places: here, for
 * the missing-minus check below, and in vat-check.js, which strips these
 * words out before its own keyword search (a short custom keyword can
 * otherwise match this boilerplate instead of the actual work).
 */
const CORRECTION_BOILERPLATE_WORDS = ["correctiepost", "correctie", "dossier"];

/** Parses "1.234,56" as 1234.56 — dots are thousands separators here. */
function parseAmount(str) {
  return parseFloat(str.replace(/\./g, "").replace(",", "."));
}

/** A line holding only a number: the Aantal field that follows the description. */
const NUMBER_LINE_PATTERN = /^\s*-?[\d.,]+\s*$/;

/**
 * A description typed with an Enter in it arrives as several lines. The owner
 * hit "CORRECTIE DOSSIER S-1234567, schade 12 -" + newline + "overzetten
 * stucwerk ...": only the first line was read, so the BTW check lost the
 * keyword and could not say which row it meant. Every line up to the Aantal
 * number belongs to the description, joined with a space.
 */
function withContinuationLines(firstLine, rest) {
  const lines = rest.split("\n");
  const extra = [];
  while (lines.length && !NUMBER_LINE_PATTERN.test(lines[0]) && lines[0].trim() && !lines[0].includes("€")) {
    extra.push(lines.shift().trim());
  }
  return { description: [firstLine, ...extra].join(" "), tail: lines.join("\n") };
}

/**
 * Walks the table, yielding one entry per row whose marker matches.
 *
 * Both row kinds share this loop; only the marker, the description cap and
 * what is done with the amount differ.
 *
 * @param {string} text
 * @param {string} markerPattern regex source for the code column
 * @param {number} descriptionCap
 * @returns {Array<{marker: string, description: string, amount: number, vatPercentage: number|null}>}
 */
function scanRows(text, markerPattern, descriptionCap) {
  const pattern = new RegExp(
    ROW_START_ANCHOR + "(" + markerPattern + ")" + FIELD_SEPARATOR +
    "([^\\n]{2," + descriptionCap + "})" + FIELD_SEPARATOR +
    "([\\s\\S]{0," + ROW_TAIL_CAP + "}?)" + ROW_END_BOUNDARY,
    "g"
  );

  const rows = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const [, marker, firstLine, rest] = match;
    // Only a dash row's description is typed by the user. A coded row's is
    // catalogue text on one line, and what follows it can be the unit, e.g.
    // "uur" behind an empty Aantal: "Parkeren, uur uur" stopped matching
    // PARKING_ROW_LABEL and the parking cost was no longer subtracted.
    const { description, tail } = marker === "-"
      ? withContinuationLines(firstLine, rest)
      : { description: firstLine, tail: rest };

    const amounts = [...tail.matchAll(AMOUNT_PATTERN)];
    if (!amounts.length) continue;

    const lastAmount = amounts[amounts.length - 1];
    const amount = parseAmount(lastAmount[1]);
    if (isNaN(amount)) continue;

    const afterAmount = tail.slice(lastAmount.index + lastAmount[0].length);
    const vatMatch = afterAmount.match(VAT_PERCENTAGE_PATTERN);
    const vatPercentage = vatMatch ? parseInt(vatMatch[1], 10) : null;

    rows.push({ marker, description, amount, vatPercentage });
  }
  return rows;
}

/**
 * @typedef {object} RepairRow
 * @property {string} code
 * @property {string} description
 * @property {number} amount always positive
 * @property {number|null} vatPercentage the BTW rate on this row, when readable
 */

/**
 * @param {string} text text stream including form control values
 * @returns {RepairRow[]}
 */
export function parseRepairRows(text) {
  return scanRows(text, ROW_CODE_PATTERN, REPAIR_DESCRIPTION_CAP).map((row) => ({
    code: row.marker,
    description: row.description.replace(DAMAGE_ANNOTATION_PATTERN, "").trim(),
    amount: Math.abs(row.amount),
    vatPercentage: row.vatPercentage
  }));
}

/**
 * Rows the user added by hand ("Voorziening toevoegen"): a dash instead of a
 * code, and a positive amount. The owner hit a correction "de- en hermonteren
 * leidingwerk" matched to "De- en hermonteren plafondarmaturen" while a manual
 * row with exactly that text sat right below it — the matcher only knew coded
 * rows. A dash row carrying the correction boilerplate is left out: that is a
 * correction with a forgotten minus, see findMissingMinusCorrections.
 *
 * Shaped like a RepairRow, with the description as its code, since that is the
 * only thing that identifies the row on the page.
 *
 * @param {string} text text stream including form control values
 * @returns {RepairRow[]}
 */
export function parseManualRows(text) {
  return scanRows(text, "-", CORRECTION_DESCRIPTION_CAP)
    .filter((row) => row.amount > 0 && !hasCorrectionBoilerplate(row.description))
    .map((row) => {
      const description = row.description.trim();
      return { code: description, description, amount: row.amount, vatPercentage: row.vatPercentage };
    });
}

/**
 * @typedef {object} CorrectionRow
 * @property {string|null} dossierRef  file reference, when the text carries one
 * @property {string|null} date
 * @property {string|null} damageNumber
 * @property {string} description   the description as typed
 * @property {string} matchText     the part used for matching
 * @property {string} trefwoordTekst the description, purpose clause stripped,
 *                                   used ONLY for the keyword search — see
 *                                   parseCorrectionDescription
 * @property {number} amount        positive magnitude of a negative amount
 * @property {number|null} vatPercentage the BTW rate on this row, when readable
 */

/**
 * @param {string} text text stream including form control values
 * @returns {CorrectionRow[]}
 */
export function parseCorrectionRows(text) {
  const rows = [];

  for (const row of scanRows(text, "-", CORRECTION_DESCRIPTION_CAP)) {
    // A dash row with a positive amount is not a correction. Note this also
    // rejects 0 and -0.
    if (row.amount >= 0) continue;

    const description = row.description.trim();
    const { dossierRef, date, damageNumber, matchText, trefwoordTekst } = parseCorrectionDescription(description);

    rows.push({
      dossierRef, date, damageNumber, description, matchText, trefwoordTekst,
      amount: Math.abs(row.amount),
      vatPercentage: row.vatPercentage
    });
  }

  return rows;
}

/**
 * Drops a trailing purpose clause, unless doing so would leave nothing useful.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripPurposeSuffix(text) {
  const stripped = (text || "").replace(PURPOSE_SUFFIX_PATTERN, "").trim();
  return stripped.length >= MIN_MEANINGFUL_LENGTH ? stripped : text;
}

/**
 * Pulls optional metadata out of a free-text correction description, and works
 * out which part of it to match on.
 *
 * The match text is the segment after the last spaced dash, which in practice
 * is the actual work description — the earlier segments carry the file and
 * damage references.
 *
 * @param {string} raw
 * @returns {{dossierRef: string|null, date: string|null, damageNumber: string|null, matchText: string, trefwoordTekst: string}}
 */
export function parseCorrectionDescription(raw) {
  const caseRef = raw.match(CASE_REF_PATTERN);
  const date = raw.match(DATE_PATTERN);
  const damageNumber = raw.match(DAMAGE_NUMBER_PATTERN);

  const segments = raw.split(SEGMENT_SEPARATOR).map((s) => s.trim()).filter(Boolean);
  const lastSegment = segments.length ? segments[segments.length - 1] : raw;

  return {
    dossierRef: caseRef ? caseRef[1] : null,
    date: date ? date[1] : null,
    damageNumber: damageNumber ? damageNumber[1] : null,
    matchText: stripPurposeSuffix(lastSegment),
    // For the keyword search: the whole description, but still without the
    // purpose clause — otherwise that clause supplies a keyword of its own.
    trefwoordTekst: stripPurposeSuffix(raw)
  };
}

/**
 * A dash-marked row with a POSITIVE amount reads as "not a correction" and
 * parseCorrectionRows silently drops it (see the `amount >= 0` check there).
 * That is correct for an empty, not-yet-filled-in row (amount 0) — but it
 * also fires when someone filling in a real correction simply forgets the
 * "-" in front of the amount. The row is then a genuine, filled-in
 * correction that never appears in ANY check (BTW rate, spending-cap match,
 * cumulative overrun), because parseCorrectionRows never sees it at all.
 *
 * Flags candidates for that specific typo: a dash row with a strictly
 * positive amount (so a still-empty row stays uninteresting) whose
 * description carries the fixed correction boilerplate above. Deliberately
 * NOT folded into parseCorrectionRows itself — the amount sign stays the
 * decisive, structural signal for what IS a correction; this is a
 * best-effort nudge for one specific mistake, not a redefinition of the
 * rule the module comment states.
 *
 * @param {string} text text stream including form control values
 * @returns {Array<{description: string, amount: number, vatPercentage: number|null}>}
 */
export function findMissingMinusCorrections(text) {
  return scanRows(text, "-", CORRECTION_DESCRIPTION_CAP)
    .filter((row) => row.amount > 0 && hasCorrectionBoilerplate(row.description))
    .map((row) => ({
      description: row.description.trim(),
      amount: row.amount,
      vatPercentage: row.vatPercentage
    }));
}

function hasCorrectionBoilerplate(description) {
  const lower = (description || "").toLowerCase();
  return CORRECTION_BOILERPLATE_WORDS.some((word) => lower.includes(word));
}

export {
  ROW_CODE_PATTERN, FIELD_SEPARATOR, ROW_START_ANCHOR, ROW_END_BOUNDARY, PURPOSE_SUFFIX_PATTERN,
  CORRECTION_BOILERPLATE_WORDS
};
