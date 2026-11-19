/**
 * The correction check.
 *
 * Correction rows claw back an amount paid earlier. One must never exceed the
 * repair it relates to — but its wording never matches that repair literally,
 * so the link has to be inferred and the panel says as much.
 */

import { parseCorrectionRows, parseRepairRows, parseManualRows, findMissingMinusCorrections, findUnlabelledNegativeRows } from "../core/row-grammar.js";
import { matchCorrections } from "../core/correction-matching.js";
import { resolveVatKeywords, resolveVatExceptions, checkVatRate } from "../core/vat-check.js";
import { vatReason } from "./vat.js";
import { tokenize } from "../core/similarity.js";
import { formatEuro, formatCorrectionCount, capitalise } from "../ui/format.js";

/**
 * A heading for a warning block.
 *
 * The shared trade term is preferred — it says more about what the correction
 * concerns than a damage number does. Failing that, the last meaningful word,
 * since the work description sits at the end in practice.
 */
function heading(correction) {
  if (correction.trefwoord) return capitalise(correction.trefwoord);

  const tokens = tokenize(correction.matchText || correction.description)
    .filter((token) => !/^\d+$/.test(token));
  if (tokens.length) return capitalise(tokens[tokens.length - 1]);

  if (correction.damageNumber) return `schade ${correction.damageNumber}`;
  return "correctie";
}

/** The ceiling a correction is measured against. */
function spendingCap(correction) {
  if (correction.matchGroup && correction.matchGroup.length > 1) {
    const parts = correction.matchGroup
      .map((row) => `"${row.code}" ${formatEuro(row.amount)}`).join(" + ");
    return `${parts} = ${formatEuro(correction.matchGroupTotal)}`;
  }
  return `"${correction.match.code}" ${formatEuro(correction.match.amount)}`;
}

export default {
  id: "corrections",
  settingKey: "correctionCheckEnabled",

  labels: {
    show: "Correctie-check tonen",
    hide: "Correctie-check verbergen"
  },

  action: "toggle-correctie",

  /**
   * Contributes `corrections`, `missingMinus` and `unlabelled`.
   *
   * Reading ctx.formText is what triggers a walk of the whole document, so the
   * gate is not merely tidiness — it keeps that walk out of every render cycle
   * for users who have this switched off.
   */
  analyse(ctx) {
    if (!ctx.settings.correctionCheckEnabled) return { corrections: [], missingMinus: [], unlabelled: [] };

    const formText = ctx.formText;
    const correctionRows = parseCorrectionRows(formText);
    const repairRows = [...parseRepairRows(formText), ...parseManualRows(formText)];
    const missingMinus = findMissingMinusCorrections(formText);
    const unlabelled = findUnlabelledNegativeRows(formText);

    ctx.log("correction rows found:", correctionRows);
    ctx.log("repair rows found:", repairRows);
    ctx.log("dash rows with a positive amount (mogelijk vergeten min-teken):", missingMinus);
    ctx.log("dash rows with a negative amount, without correction words:", unlabelled);

    const matched = matchCorrections(correctionRows, repairRows, ctx.settings.correctionKeywords);
    ctx.log("correction matches:", matched);

    // The P3 build checks VAT in a section of its own, over every row; see vat.js.
    if (ctx.p3) return { corrections: matched, missingMinus, unlabelled };

    // Independent of the matching above: a stuc-/sauswerk correction must
    // carry 9% BTW regardless of whether it could be linked to a repair row.
    const vatKeywords = resolveVatKeywords(ctx.settings.verlaagdBtwKeywords);
    const vatExceptions = resolveVatExceptions(ctx.settings.verlaagdBtwUitzonderingen);
    const corrections = matched.map((correction) => ({
      ...correction,
      ...checkVatRate(correction, vatKeywords, vatExceptions)
    }));
    ctx.log("BTW-rate check:", corrections.filter((c) => c.vatMismatch));

    return { corrections, missingMinus, unlabelled };
  },

  hasData: (result) => !!((result.corrections && result.corrections.length) ||
    (result.missingMinus && result.missingMinus.length) ||
    (result.unlabelled && result.unlabelled.length)),

  render(result, ctx, t) {
    const corrections = result.corrections || [];
    const missingMinus = result.missingMinus || [];
    const unlabelled = result.unlabelled || [];
    const shared = {
      separator: t.render("components/separator")
    };

    if (!corrections.length && !missingMinus.length && !unlabelled.length) return t.render("components/corrections/none", shared);

    // Only the actionable cases get a full block; the rest are summarised in a
    // line. Otherwise every correction has to be read through again, which was
    // the original problem.
    const exceeding = corrections.filter((c) => c.exceedsMatch);
    const cumulative = corrections.filter((c) => c.cumulativeExceeds);
    const vatMismatches = corrections.filter((c) => c.vatMismatch);
    const unmatched = corrections.filter((c) => !c.match);
    const withinBudget = corrections.filter((c) =>
      c.match && !c.exceedsMatch && !c.cumulativeExceeds && !c.inReportedCluster && !c.vatMismatch);

    const blocks =
      missingMinus.map((m) => t.render("components/corrections/missing-minus", {
        amount: formatEuro(m.amount),
        description: m.description
      })).join("") +
      unlabelled.map((m) => t.render("components/corrections/unlabelled", {
        amount: formatEuro(m.amount),
        description: m.description
      })).join("") +
      exceeding.map((c) => t.render("components/corrections/exceeds", {
        heading: heading(c),
        amount: formatEuro(c.amount),
        description: c.description,
        cap: spendingCap(c)
      })).join("") +
      cumulative.map((c) => t.render("components/corrections/cumulative", {
        heading: heading(c),
        count: c.cumulativeMembers ? c.cumulativeMembers.length : 0,
        total: formatEuro(c.cumulativeTotal),
        members: (c.cumulativeMembers || []).map((m) =>
          t.render("components/corrections/cumulative-member", {
            description: m.description,
            amount: formatEuro(m.amount)
          })).join(""),
        cap: spendingCap(c)
      })).join("") +
      vatMismatches.map((c) => t.render("components/corrections/vat-mismatch", {
        heading: heading(c),
        percentage: `${c.vatPercentage} %`,
        expected: `${c.vatExpected} %`,
        description: c.description,
        reason: vatReason(c)
      })).join("");

    const summaryParts = [];
    if (withinBudget.length) summaryParts.push(`${withinBudget.length} binnen gematchte post`);
    if (unmatched.length) {
      summaryParts.push(
        `${unmatched.length} zonder zekere match (${unmatched.map((c) => formatEuro(c.amount)).join(", ")})`);
    }

    return t.render("components/corrections/section", {
      ...shared,
      count: t.render("components/corrections/count", {
        count: formatCorrectionCount(corrections.length)
      }),
      blocks: blocks || t.render("components/corrections/within-budget"),
      summary: summaryParts.length
        ? t.render("components/summary", { text: summaryParts.join(" · ") })
        : ""
    });
  }
};
