/**
 * The feature registry.
 *
 * THIS IS THE FILE TO EDIT TO ADD A FEATURE. Write one module beside this one,
 * import it, add it to the array. Nothing else needs to change: the analysis
 * picks up its contribution to the result, the panel renders its section, and
 * its toggle appears — all from the descriptor.
 *
 * Order here is the order sections appear in the panel.
 *
 * See docs/adding-a-feature.md for the descriptor contract and a template.
 *
 * Note what is NOT here: the wall/stucloper calculation. It owns the panel's
 * overall shape rather than contributing a section to it — three different
 * top-level layouts depending on what it finds — so it lives in the core
 * analysis and the entry-point templates. Everything that adds a SECTION
 * belongs in this list.
 */

import parking from "./parking.js";
import corrections from "./corrections.js";
import vat from "./vat.js";

export const FEATURES = [parking, corrections, vat];

/** A feature is on when its setting is on. */
export function isEnabled(feature, settings) {
  return !!settings[feature.settingKey];
}
