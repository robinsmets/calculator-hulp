/**
 * Seam A: page text in, analysis result out.
 *
 * Composes the core parsers with whatever features are registered, which is
 * why it sits above core/ rather than inside it — core/ must stay free of
 * anything that renders.
 *
 * Still pure: no DOM, no chrome APIs, no clock. Everything arrives in the
 * context object, which is what makes the whole differential suite possible.
 *
 * Two things about the gating are easy to get wrong and both change results:
 *
 * The room total is parsed UNCONDITIONALLY, even when the parking feature is
 * off. It is not only parking data — it also decides whether the panel has
 * anything worth showing at all. Skipping it when parking is off makes the
 * panel silently stop appearing on pages that have no walls.
 *
 * The correction check and the address lookup ARE gated, and the gates sit
 * inside this function rather than at the call site. That is not just about
 * cost: with the address gate removed, the result carries an address object
 * where it previously carried null, which is an observable change in the data
 * this function returns.
 */

import { parseWallSections, describeKind, sectionArea } from "./core/walls.js";
import { parseBouwdelen, parseSchadeopname, buildControleSections } from "./core/controle-parts.js";
import { parseTriggerDamages, isSectionMatched } from "./core/damages.js";
import { parseFloorArea, parseRoomTotal, calculateStucloperTotals } from "./core/room.js";
import { FEATURES, isEnabled } from "./features/index.js";

/**
 * @typedef {object} AnalysisContext
 * @property {string} pageText   visible page text
 * @property {string} formText   page text INCLUDING form control values; a
 *                               getter, because producing it means walking the
 *                               whole document and it is only needed when the
 *                               correction check is on
 * @property {boolean} [isControlePage] which wall-section parser to use.
 *                               URL-derived, not sniffed from pageText — see
 *                               the note in analyzePage for why.
 * @property {object} settings   resolved settings
 * @property {Record<string, import("./address.js").Address>} addressCache
 * @property {(...args: unknown[]) => void} [log]
 */

/**
 * @param {AnalysisContext} ctx
 * @returns {object} the analysis result
 */
export function analyzePage(ctx) {
  const { pageText, settings, addressCache = {} } = ctx;
  const log = ctx.log || (() => {});

  // Which parser reads the wall/facade sections. Decided by the page's URL
  // (threaded in via ctx, ultimately from location.pathname), NOT by sniffing
  // pageText for a Controletool-only word: "Bouwdelen" turned out to appear
  // somewhere on a Calculatietool page too, which made every wall on it parse
  // to nothing with no error anywhere.
  const sections = ctx.isControlePage
    ? buildControleSections(parseBouwdelen(pageText), parseSchadeopname(pageText))
    : parseWallSections(pageText);
  const { damages, perCode } = parseTriggerDamages(pageText, settings.triggerCodes);
  const matched = sections.filter((section) => isSectionMatched(section, damages));

  const floorArea = parseFloorArea(pageText);
  const { totalWidth, totalArea, wallSurfaceArea, areaCappedToFloor } =
    calculateStucloperTotals(matched, floorArea);

  const roomTotal = parseRoomTotal(pageText);
  const { kindLabel, kindLabelPlural } = describeKind(sections);

  log("wall sections found:", sections.length, sections);
  log("trigger damages per code:", perCode);
  log("matching sections:", matched.map((section) => section.naam));
  log("room total:", roomTotal);
  log("floor area:", floorArea, "capped:", areaCappedToFloor);

  // Each registered feature contributes its own fields. A feature that is
  // switched off still runs, and returns the shape it would have produced with
  // its data absent — so the result keeps one shape regardless of settings.
  //
  // The context is passed through by DELEGATION, not by spreading. Spreading
  // would read every property, and formText is a getter that walks the entire
  // document — the exact work it exists to defer.
  const featureContext = Object.create(ctx, {
    addressCache: { value: addressCache },
    roomTotal: { value: roomTotal },
    log: { value: log }
  });
  const contributions = Object.assign({},
    ...FEATURES.map((feature) => feature.analyse(featureContext)));

  return {
    wallCount: sections.length,
    kindLabel,
    kindLabelPlural,
    damageCount: damages.size,

    matchedWalls: matched.map((section) => ({
      name: section.naam,
      width: section.breedte,
      height: section.hoogte,
      area: sectionArea(section)
    })),

    // Every part of the room, not only the matching ones, so the panel can show
    // at a glance which exist and which count. The non-matching ones render
    // dimmed rather than being left out.
    allWalls: sections.map((section) => ({
      name: section.naam,
      area: sectionArea(section),
      isMatched: isSectionMatched(section, damages)
    })),

    totalWidth,
    totalArea,
    wallSurfaceArea,
    areaCappedToFloor,
    floorArea,
    roomTotal,

    // Whatever the registered features added.
    ...contributions
  };
}


/**
 * Whether this result is worth publishing.
 *
 * Used in two places: a sub-frame only posts its result upwards when this is
 * true, and the top frame only adopts a child's result when its own is not.
 *
 * Note the loose `!= null` on the room total — a feature that omits its key
 * entirely would otherwise make this always true.
 *
 * @param {object} result
 * @returns {boolean}
 */
export function hasData(result) {
  // Walls first, then whatever any feature considers worth showing. Hardcoding
  // this list is how a fourth feature's data would silently never appear.
  return result.wallCount > 0 || FEATURES.some((feature) => feature.hasData(result));
}

/**
 * Whether the panel would show anything a person can actually see on screen
 * right now, given the CURRENT settings — narrower than hasData above.
 *
 * Two things hasData does not account for, both reported live by the owner
 * on the same kind of room (real repair costs, but no wand-/gevelgegevens —
 * a tab of the embedded reference widget this tool has nothing to say
 * about):
 *
 *   - a feature switched OFF still contributes via hasData (parking's is
 *     `roomTotal != null`, independent of the toggle on purpose — see the
 *     comment on parkingBasis in parking.js). Right for hasData's own job
 *     (does a frame's result carry real information at all, for cross-frame
 *     relay); wrong here, since an off toggle renders nothing at all.
 *   - even switched ON, a room total alone is not a reason for parking
 *     specifically: it is a convenience estimate, not a warning, and every
 *     room with a repair table has SOME total. The owner confirmed turning
 *     parking off does make the panel disappear here, and confirmed that is
 *     NOT the fix they want — the panel should hide regardless of whether
 *     parking is on. See parking.js's contributesToVisibility: false.
 *
 * Corrections are not excluded the same way: an actual finding there is a
 * warning about something wrong, not a generic estimate, and stays a valid
 * reason to show the panel on its own.
 *
 * @param {object} result
 * @param {object} settings
 * @returns {boolean}
 */
export function hasVisibleContent(result, settings) {
  return result.wallCount > 0 ||
    FEATURES.some((feature) =>
      feature.contributesToVisibility !== false &&
      isEnabled(feature, settings) &&
      feature.hasData(result));
}
