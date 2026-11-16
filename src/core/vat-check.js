/**
 * The BTW rate every correction post must carry.
 *
 * The rule, as the owner stated it: a correction is standard-rate (21%)
 * BTW by default, full stop — EXCEPT when its description names
 * stucadoors-/schilderwerk (stuc-/sauswerk), which is reduced-rate (9%).
 * "stucloper" and "afdekken" are confirmed EXCEPTIONS to that exception:
 * both name protection/material work, not stuc-/sauswerk labour, so they
 * stay standard rate — UNCONDITIONALLY. An exception word wins outright,
 * even when the same description also happens to mention stuc-/sauswerk
 * ("afdekken maaiveld bij stucadoorwerk" is a real example: the work is
 * afdekken, "stucadoorwerk" only says what it is done near).
 *
 * Things this got wrong before landing on this shape, each reported by the
 * owner in quick succession after the previous version shipped:
 *
 *   - it only checked corrections whose description matched a stuc-/
 *     sauswerk keyword or an exception. Everything else — the vast majority
 *     of corrections — went unchecked, so a correction sitting at 0% (never
 *     a valid rate for a correction; it is always 9% or 21%) was silently
 *     accepted as long as its wording had neither.
 *   - the exception-must-be-21% direction only compared against 9%
 *     specifically, so an exception row at 0% (also wrong) slipped through.
 *   - the keyword search read the RAW description, purpose clause included.
 *     A real "... overzetten stucwerk plafonds t.b.v. sauswerk" correction —
 *     genuinely stucwerk, correctly at 9% — found "sauswerk" in its own
 *     purpose clause; the actual, worse effect of the same leak was in
 *     correction-matching.js's own keyword search, which matched this
 *     correction to a "Sauswerk" repair row instead of the stucwerk one it
 *     was actually about. Fixed by wiring trefwoordTekst through
 *     CorrectionRow (row-grammar.js) and using it here too.
 *   - exceptions only worked by stripping the exception WORD out of the text
 *     before searching for a keyword, which only helps when the exception
 *     word literally contains the keyword as a substring ("stucloper"
 *     contains "stuc"). "Afdekken" shares no substring with "stuc" at all —
 *     "afdekken maaiveld bij stucadoorwerk" still found "stuc" via
 *     "stucadoorwerk" after stripping "afdekken", and got flagged as needing
 *     9% when it should stay 21%. Fixed by checking exceptions FIRST, on the
 *     whole text, before ever looking for a keyword — an exception match now
 *     decides the rate outright rather than merely clearing the way for one.
 *   - the keyword search never excluded the boilerplate every correction's
 *     description carries ("CORRECTIE DOSSIER <ref> ..."), so a custom
 *     keyword short enough to be a substring of one of those fixed words
 *     matched EVERY correction on the page. Real case: a "sier" keyword
 *     (meant for "sierpleister") matched via "dossier" and flagged unrelated
 *     corrections ("verplaatsen meubelstukken") that had nothing to do with
 *     stuc-/sauswerk. See BOILERPLATE_PATTERN below.
 *
 * Deliberately independent of the repair-row MATCHING in
 * correction-matching.js: a correction with no confident match at all is
 * still checked here, because the wrong rate is wrong regardless of whether
 * the correction can be linked to a specific repair row.
 */

import { DEFAULT_VERLAAGD_BTW_TREFWOORDEN, DEFAULT_VERLAAGD_BTW_UITZONDERINGEN } from "../../config.js";
import { CORRECTION_BOILERPLATE_WORDS } from "./row-grammar.js";
import { escapeRegExp } from "./text.js";

/**
 * Fixed boilerplate words present in the description of EVERY correction, in
 * some order — "CORRECTIE(POST) DOSSIER <ref> ...". Stripped before any
 * keyword/exception search, because "dossier" contains "sier" as a literal
 * substring: an owner-configured keyword "sier" (meant to catch
 * "sierpleister") matched every single correction on the page regardless of
 * its actual content, purely because they all say "DOSSIER" — real case,
 * "... verplaatsen meubelstukken" (no stuc/saus wording at all) got flagged
 * as needing 9% for exactly this reason. The stem-matching design (a short
 * keyword like "stuc" deliberately matching inside "stucwerk") is the whole
 * point and must stay; the fix here removes words that are guaranteed to be
 * NOISE — present in every correction, never the actual work — rather than
 * changing how matching works.
 *
 * The word list itself lives in row-grammar.js (CORRECTION_BOILERPLATE_WORDS)
 * — it is the same fixed prefix that module's missing-minus check looks for,
 * kept as one source of truth rather than two copies drifting apart.
 */
const BOILERPLATE_PATTERN = new RegExp(
  "\\b(" + CORRECTION_BOILERPLATE_WORDS.map(escapeRegExp).join("|") + ")\\b",
  "gi"
);

/** The rate stuc-/sauswerk correction posts must carry. */
const REDUCED_VAT_PERCENTAGE = 9;

/** The rate every OTHER correction post must carry — the default. */
const STANDARD_VAT_PERCENTAGE = 21;

/** Parking costs: always 0%. */
const ZERO_VAT_PERCENTAGE = 0;

/**
 * A parking cost row: "Parkeren, uur" (the repair row), or a correction or
 * provision about parking ("parkeerkosten"). Page wording — never translate.
 */
const PARKING_COST_PATTERN = /\bparke(er|ren)/i;

export function isParkingCost(description) {
  return PARKING_COST_PATTERN.test(description || "");
}

/**
 * @param {string[]|null} configured
 * @returns {string[]}
 */
export function resolveVatKeywords(configured) {
  return configured && configured.length ? configured : DEFAULT_VERLAAGD_BTW_TREFWOORDEN;
}

/**
 * @param {string[]|null} configured
 * @returns {string[]}
 */
export function resolveVatExceptions(configured) {
  return configured && configured.length ? configured : DEFAULT_VERLAAGD_BTW_UITZONDERINGEN;
}

/** Case-insensitive substring search, returning the first word that matches. */
function findWord(description, words) {
  const lower = (description || "").toLowerCase();
  return words.find((word) => lower.includes(word.toLowerCase())) || null;
}

/**
 * The first configured keyword that appears in the description, case
 * insensitive — a plain substring search, since these are word STEMS
 * ("stuc" must also catch "stuccen", "stucwerk").
 *
 * Does NOT know about exceptions — see checkVatRate for why that check now
 * happens separately, and first.
 *
 * @param {string} description
 * @param {string[]} keywords
 * @returns {string|null}
 */
export function findVatKeyword(description, keywords) {
  return findWord(description, keywords);
}

/**
 * The first configured EXCEPTION word that appears in the description.
 *
 * @param {string} description
 * @param {string[]} exceptions
 * @returns {string|null}
 */
export function findVatException(description, exceptions) {
  return findWord(description, exceptions);
}

/**
 * @param {import("./row-grammar.js").CorrectionRow} correction
 * @param {string[]} keywords
 * @param {string[]} [exceptions]
 * @returns {{vatKeyword: string|null, vatExpected: number|null, vatMismatch: boolean}}
 */
export function checkVatRate(correction, keywords, exceptions = []) {
  // Rate unreadable (null): stay silent rather than guess — a missed warning
  // is safer than a false one on data we could not actually parse.
  if (correction.vatPercentage == null) return { vatKeyword: null, vatExpected: null, vatMismatch: false };

  // Parking costs carry no VAT, ever. The owner's rule; it beats every
  // keyword and every VAT situation (see applyVatSituation).
  if (isParkingCost(correction.description)) {
    return {
      vatKeyword: null,
      vatExpected: ZERO_VAT_PERCENTAGE,
      vatMismatch: correction.vatPercentage !== ZERO_VAT_PERCENTAGE,
      vatParking: true
    };
  }

  // The purpose-stripped text, same field correction-matching.js's own
  // keyword search uses — NOT the raw description. See the module comment.
  // Also strips the fixed "correctie(post)/dossier" boilerplate every
  // correction carries, so a short custom keyword can't accidentally match
  // that instead of the actual work (see BOILERPLATE_PATTERN above).
  const text = (correction.trefwoordTekst || correction.description).replace(BOILERPLATE_PATTERN, " ");

  // Exceptions are checked FIRST, and win outright: "afdekken"/"stucloper"
  // name protection/material work, never stuc-/sauswerk labour, regardless
  // of whatever stuc-/sauswerk the text also happens to mention.
  const exception = findVatException(text, exceptions);
  if (exception) {
    return {
      vatKeyword: exception,
      vatExpected: STANDARD_VAT_PERCENTAGE,
      vatMismatch: correction.vatPercentage !== STANDARD_VAT_PERCENTAGE
    };
  }

  const keyword = findVatKeyword(text, keywords);
  if (keyword) {
    return {
      vatKeyword: keyword,
      vatExpected: REDUCED_VAT_PERCENTAGE,
      vatMismatch: correction.vatPercentage !== REDUCED_VAT_PERCENTAGE
    };
  }

  // Neither a keyword nor an exception: every other correction defaults to
  // the standard rate too.
  return {
    vatKeyword: null,
    vatExpected: STANDARD_VAT_PERCENTAGE,
    vatMismatch: correction.vatPercentage !== STANDARD_VAT_PERCENTAGE
  };
}

/**
 * The VAT situations the P3 build lets the user choose between. "9-21" is the
 * check above; "0" and "21" expect every row at that one rate. The
 * values are also the buttons' data-situation, so keep them in step.
 */
export const VAT_SITUATIONS = ["9-21", "0", "21"];
export const MIXED_VAT_SITUATION = "9-21";

/**
 * Re-checks rows against one flat rate, for the "0" and "21" situations. The
 * "9-21" situation, or none, leaves them as checkVatRate left them. A row
 * whose rate could not be read stays unflagged, as it does there, and a
 * parking cost stays held to 0% in every situation.
 *
 * @param {object[]} rows already through checkVatRate
 * @param {string} [situation] one of VAT_SITUATIONS
 * @returns {object[]}
 */
export function applyVatSituation(rows, situation) {
  if (!situation || situation === MIXED_VAT_SITUATION) return rows;
  const expected = Number(situation);
  return rows.map((row) => row.vatPercentage == null || row.vatParking ? row : {
    ...row,
    vatKeyword: null,
    vatExpected: expected,
    vatMismatch: row.vatPercentage !== expected
  });
}

export { REDUCED_VAT_PERCENTAGE, STANDARD_VAT_PERCENTAGE, ZERO_VAT_PERCENTAGE };
