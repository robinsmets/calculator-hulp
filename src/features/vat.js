/**
 * The VAT check, as a section of its own. P3 build only.
 *
 * The other builds check VAT inside the correction check, on correction rows.
 * P3 asked for it apart, over every row with a VAT rate, so it also works on a
 * room without corrections. The same keyword rule applies to every row; the
 * situation buttons switch it to "all 0%" or "all 21%" for one dossier.
 */

import { parseCorrectionRows, parseRepairRows, parseManualRows, findUnlabelledNegativeRows } from "../core/row-grammar.js";
import {
  resolveVatKeywords, resolveVatExceptions, checkVatRate, applyVatSituation,
  REDUCED_VAT_PERCENTAGE, VAT_SITUATIONS, MIXED_VAT_SITUATION
} from "../core/vat-check.js";

/** The labels on the VAT situation buttons, by situation. */
const VAT_SITUATION_LABELS = { "9-21": "9-21%", "0": "0%", "21": "21%" };

/**
 * Why a row's BTW rate is wrong. In the 9-21% situation, three shapes: a
 * keyword requires 9%, an exception word (e.g. "stucloper") explicitly is NOT
 * stuc-/sauswerk, and a row with neither is held to the standard rate. See
 * vat-check.js. Also used by the correction check in the other builds.
 *
 * @param {object} row
 * @param {string} [situation] one of VAT_SITUATIONS
 * @param {string} [noun] what the rule covers: "correcties" in the correction
 *   check, "posten" here
 */
export function vatReason(row, situation, noun = "correcties") {
  if (row.vatParking) return "parkeerkosten staan altijd op 0% BTW";
  if (situation && situation !== MIXED_VAT_SITUATION) {
    return `BTW-situatie ${situation}% — alle posten horen op ${situation}% BTW te staan`;
  }
  if (row.vatExpected === REDUCED_VAT_PERCENTAGE) {
    return `bevat "${row.vatKeyword}" — dat werk valt onder het verlaagde BTW-tarief (9%)`;
  }
  return row.vatKeyword
    ? `"${row.vatKeyword}" is geen stuc-/sauswerk — ${noun} zijn standaard 21% BTW`
    : `${noun} zijn standaard 21% BTW, tenzij het stuc-/sauswerk betreft`;
}

function situationButtons(situation, t) {
  return t.render("components/vat/situations", {
    buttons: VAT_SITUATIONS.map((value) => t.render("components/vat/situation", {
      situation: value,
      label: VAT_SITUATION_LABELS[value],
      state: value === situation ? " calc-vat-situation--active" : ""
    })).join("")
  });
}

export default {
  id: "vat",
  settingKey: "vatCheckEnabled",
  p3Only: true,

  // Every room with a repair table has rows with a VAT rate, so like parking
  // this must not be the sole reason the panel appears. See analysis.js.
  contributesToVisibility: false,

  labels: {
    show: "BTW-check tonen",
    hide: "BTW-check verbergen"
  },

  action: "toggle-btw",

  /** Contributes `vatRows`: every repair and correction row, VAT-checked. */
  analyse(ctx) {
    if (!ctx.p3 || !ctx.settings.vatCheckEnabled) return { vatRows: [] };

    const formText = ctx.formText;
    const keywords = resolveVatKeywords(ctx.settings.verlaagdBtwKeywords);
    const exceptions = resolveVatExceptions(ctx.settings.verlaagdBtwUitzonderingen);
    const rows = [
      ...parseRepairRows(formText).map((row) => ({ ...row, heading: row.code })),
      ...parseManualRows(formText).map((row) => ({ ...row, heading: "Eigen post" })),
      ...findUnlabelledNegativeRows(formText).map((row) => ({ ...row, heading: "Eigen post" })),
      ...parseCorrectionRows(formText).map((row) => ({ ...row, heading: "Correctie" }))
    ]
      .filter((row) => row.vatPercentage != null)
      .map((row) => ({ ...row, ...checkVatRate(row, keywords, exceptions) }));
    ctx.log("BTW-check:", rows.filter((row) => row.vatMismatch));

    return { vatRows: rows };
  },

  hasData: (result) => !!(result.vatRows && result.vatRows.length),

  render(result, ctx, t) {
    const separator = t.render("components/separator");
    if (!result.vatRows || !result.vatRows.length) return t.render("components/vat/none", { separator });

    const situation = ctx.vatSituation || MIXED_VAT_SITUATION;
    const rows = applyVatSituation(result.vatRows, situation);
    const mismatches = rows.filter((row) => row.vatMismatch);

    const blocks = mismatches.map((row) => t.render("components/corrections/vat-mismatch", {
      heading: row.heading,
      percentage: `${row.vatPercentage} %`,
      expected: `${row.vatExpected} %`,
      description: row.description,
      reason: vatReason(row, situation, "posten")
    })).join("");

    return t.render("components/vat/section", {
      separator,
      situations: situationButtons(situation, t),
      count: rows.length,
      blocks: blocks || t.render("components/vat/all-correct")
    });
  }
};
