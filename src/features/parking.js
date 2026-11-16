/**
 * Parking hours.
 *
 * Reads the room total and reports how many parking hours to budget for one to
 * four workers. Hours only, never a cost — the tariff varies per address, so a
 * euro figure here would be misleading.
 */

import { calculateParkingOptions, calculateParkingBasis, buildParkingRateUrl, PARKING_MINIMUM_AMOUNT } from "../core/parking.js";
import { parseRepairRows } from "../core/row-grammar.js";
import { parseAddress, findCaseId } from "../core/address.js";
import { formatEuro, formatInteger, formatWorkerCount } from "../ui/format.js";

export default {
  id: "parking",
  settingKey: "parkingEnabled",

  // A room total alone must never be the SOLE reason the panel appears —
  // parking is a convenience estimate, not a warning, and every room the
  // Calculatietool renders a repair table for has SOME total. Reported by
  // the owner: a room with real repair costs but no wand-/gevelgegevens (the
  // embedded reference widget on a tab this tool has nothing to say about)
  // kept the panel on screen purely to offer an hours estimate, even with
  // parking switched off having already been ruled out as the fix — turning
  // parking off was not something they wanted either. See hasVisibleContent
  // in analysis.js, which reads this flag.
  contributesToVisibility: false,

  labels: {
    show: "Parkeeruren tonen",
    hide: "Parkeeruren verbergen"
  },

  action: "toggle-parkeren",

  /**
   * Contributes `address`, `parkingBasis` and `parkingAlreadyBudgeted`.
   *
   * Note the gate is INSIDE analyse, not at the call site: with it removed the
   * result carries an address object where it previously carried null, which
   * is an observable change in the data, not just wasted work.
   *
   * The room total ITSELF is deliberately NOT computed here — it is parsed
   * unconditionally by the core analysis, because it also decides whether the
   * panel has anything worth showing at all. `ctx.roomTotal` is that same
   * value, threaded through for exactly this feature. `parkingBasis` is
   * derived from it: see calculateParkingBasis for why the hour estimate below
   * must not be computed straight off the room total when a "Parkeren, uur"
   * row is already in the calculation.
   */
  analyse(ctx) {
    if (!ctx.settings.parkingEnabled) return { address: null };

    let address = parseAddress(ctx.pageText);
    if (!address) {
      const caseId = findCaseId(ctx.pageText);
      if (caseId && ctx.addressCache[caseId]) address = ctx.addressCache[caseId];
    }

    const { basis: parkingBasis, alreadyBudgeted: parkingAlreadyBudgeted } =
      ctx.roomTotal != null
        ? calculateParkingBasis(ctx.roomTotal, parseRepairRows(ctx.pageText))
        : { basis: null, alreadyBudgeted: 0 };

    return { address, parkingBasis, parkingAlreadyBudgeted };
  },

  /** Whether this feature alone justifies showing the panel. */
  hasData: (result) => result.roomTotal != null,

  render(result, ctx, t) {
    const shared = {
      separator: t.render("components/separator"),
      address: result.address
        ? t.render("components/parking/address", {
            street: result.address.street && result.address.houseNumber
              ? `${result.address.street} ${result.address.houseNumber}, ` : "",
            postalCode: result.address.postalCode,
            city: result.address.city
          })
        : t.render("components/parking/address-unknown"),
      link: t.render("components/link", {
        url: buildParkingRateUrl(result.address, ctx.now),
        label: "Tarief opzoeken op prettigparkeren.nl ↗"
      })
    };

    if (result.roomTotal == null) return t.render("components/parking/no-total", shared);

    // The estimate is computed on parkingBasis (room total minus whatever is
    // already budgeted for parking), never on roomTotal directly — see
    // calculateParkingBasis. roomTotal itself is still what's DISPLAYED as
    // "Ruimte-totaal", because that is the real figure on the page; the
    // deduction, when there is one, gets its own note instead of silently
    // changing the displayed total.
    const basis = result.parkingBasis;

    return t.render("components/parking/section", {
      ...shared,
      roomTotal: formatEuro(result.roomTotal),
      minimumNote: basis < PARKING_MINIMUM_AMOUNT
        ? ` (< €1.000, berekend met minimum €${formatInteger(PARKING_MINIMUM_AMOUNT)})`
        : "",
      basisNote: result.parkingAlreadyBudgeted > 0
        ? ` — al ${formatEuro(result.parkingAlreadyBudgeted)} parkeren in de calculatie, ` +
          `basis voor onderstaande uren: ${formatEuro(basis)}`
        : "",
      options: calculateParkingOptions(basis)
        .map((option) => t.render("components/row", {
          modifier: "",
          label: formatWorkerCount(option.werklieden),
          value: `${option.uren} u`
        }))
        .join("")
    });
  }
};
