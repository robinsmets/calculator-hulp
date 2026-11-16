/**
 * The template files, listed explicitly.
 *
 * Top level    entry points — a whole panel, one per render branch. These are
 *              what panel-view.js starts from.
 * components/  everything they are built out of. The shared ones sit at the
 *              top of that folder; the rest are grouped by the feature they
 *              belong to.
 *
 * A directory cannot be listed over fetch, so the browser has to be told what
 * to load. test/spec/template.test.js asserts this matches what is on disk and
 * that every entry is actually referenced, so neither drift nor dead files can
 * accumulate.
 */

/** Whole panels, one per render branch. */
export const ENTRY_TEMPLATES = [
  "panel-full",
  "panel-minimized",
  "panel-no-matching-damage",
  "panel-no-walls",
];

export const COMPONENT_TEMPLATES = [
  "components/corrections/count",
  "components/corrections/cumulative",
  "components/corrections/cumulative-member",
  "components/corrections/exceeds",
  "components/corrections/missing-minus",
  "components/corrections/none",
  "components/corrections/section",
  "components/corrections/vat-mismatch",

  "components/corrections/within-budget",
  "components/form/checkbox",
  "components/form/group",
  "components/form/hint",
  "components/form/select",
  "components/form/select-option",
  "components/form/text",
  "components/link",
  "components/panel/area-capped",
  "components/panel/area-uncapped",
  "components/panel/disclaimer",
  "components/panel/no-sections-found",
  "components/panel/title-bar",
  "components/panel/wall-list",
  "components/parking/address",
  "components/parking/address-unknown",
  "components/parking/no-total",
  "components/parking/section",
  "components/row",
  "components/separator",
  "components/summary",
  "components/toggle",
  "components/vat/all-correct",
  "components/vat/none",
  "components/vat/section",
  "components/vat/situation",
  "components/vat/situations",
];

export const TEMPLATE_NAMES = [...ENTRY_TEMPLATES, ...COMPONENT_TEMPLATES];

/**
 * The subset settings-form.js actually renders — every template a popup or
 * options page's settings form can produce, nothing panel-only. The popup
 * and options pages used to fetch the full TEMPLATE_NAMES list (all ~34
 * files, meant for the floating panel on a deatabix page) just to render a
 * handful of form controls, which is most of why opening the toolbar popup
 * visibly lagged: it awaited every one of those fetches before painting
 * anything beyond the static HTML. See src/pages/popup.js and options.js.
 */
export const SETTINGS_FORM_TEMPLATES = [
  "components/form/checkbox",
  "components/form/group",
  "components/form/hint",
  "components/form/select",
  "components/form/select-option",
  "components/form/text",
];

export const TEMPLATE_DIR = "src/ui/templates";
export const STYLESHEET = "src/ui/panel.css";
