/**
 * Seam B: analysis result in, panel HTML out.
 *
 * No markup in this file. It starts from one of the entry-point templates at
 * the top of src/ui/templates/ — one per render branch — and fills its slots
 * with components. This module only decides WHICH template and WHAT values.
 *
 * Pure — returns a string rather than touching the DOM — so it can be asserted
 * on directly.
 *
 * All user-facing text is Dutch and lives in the template file. Note several
 * strings are assembled at runtime ("Geveloppervlakte", "werklieden") and so
 * appear nowhere as literals; the formatting helpers name them explicitly for
 * that reason.
 */

import { formatMeasurement } from "./format.js";
import { FEATURES, isEnabled } from "../features/index.js";
import { ACTIONS } from "./actions.js";

/**
 * Row modifiers. The variant is meaning, not decoration: "dim" says this part
 * exists but does not count towards the total, and "total" marks a total.
 */
const ROW_MODIFIERS = {
  total: "calc-row--total",
  dim: "calc-row--dim",
  normal: ""
};

function renderRow(t, label, value, variant) {
  return t.render("components/row", { modifier: ROW_MODIFIERS[variant] ?? "", label, value });
}

/**
 * A toggle's arrow, in a span of its own so the P3 build can make it larger
 * without enlarging the words beside it.
 */
function toggleArrow(open) {
  return open ? "▾" : "▸";
}

/**
 * @param {object} result an analysis result
 * @param {{settings: object, now: Date, templates: object}} ctx
 * @returns {string} the panel's inner HTML
 */
export function renderPanel(result, ctx) {
  const t = ctx.templates;

  // Minimized: just the title bar, with an expand control instead of a
  // minimize one. Checked before anything else in this function runs — a
  // minimized panel has nothing to compute or show beyond that one bar.
  const minimized = !!ctx.settings.panelMinimized;
  const titleBar = t.render("components/panel/title-bar", {
    minimizeIcon: minimized ? "▴" : "▾",
    minimizeTitle: minimized ? "Uitklappen" : "Minimaliseren"
  });
  if (minimized) return t.render("panel-minimized", { titleBar });

  const kindLabel = result.kindLabel || "wand";
  const kindPlural = result.kindLabelPlural || "wanden";
  const kindCapitalised = kindLabel === "gevel" ? "Gevel" : "Wand";

  // Each feature renders its own toggle, plus its body when switched on. The
  // toggle is always emitted: without it a feature turned off from the panel
  // could never be turned back on there.
  // A feature marked p3Only shows only in the P3 build's panel.
  const sections = FEATURES.filter((feature) => !feature.p3Only || ctx.p3).map((feature) => {
    const on = isEnabled(feature, ctx.settings);
    const toggle = t.render("components/toggle", {
      action: feature.action,
      label: on ? feature.labels.hide : feature.labels.show,
      arrow: toggleArrow(on)
    });
    return toggle + (on ? feature.render(result, ctx, t) : "");
  });

  const shared = {
    titleBar,
    separator: t.render("components/separator"),
    disclaimer: t.render("components/panel/disclaimer"),
    sections: sections.join("")
  };

  if (result.wallCount === 0) return t.render("panel-no-walls", shared);

  // Defensive: a result from a frame running an older build may not carry
  // allWalls. Falling back keeps the panel working rather than throwing,
  // though every row then renders dimmed because isMatched is undefined.
  const walls = result.allWalls || result.matchedWalls || [];
  const wallRows = walls
    .map((wall) => renderRow(
      t,
      wall.name,
      wall.area != null ? formatMeasurement(wall.area, "m²") : "? (geen hoogte)",
      wall.isMatched ? "normal" : "dim"))
    .join("");

  // A "Buitenkant gebouw" page can carry dozens of gevels, and the list used
  // to push Parkeeruren and Correctie-check out of view entirely below it.
  // Collapsed by default for that reason — the total above stays visible
  // either way. Expanding shows every row (an inner scroll box was tried and
  // reverted: the panel re-renders on every page mutation, which kept
  // snapping that box's scroll position back to the top).
  const wallListExpanded = !!ctx.settings.wallListExpanded;
  const wallListToggle = walls.length
    ? t.render("components/toggle", {
        action: ACTIONS.TOGGLE_WALLS,
        label: wallListExpanded ? `Alle ${kindPlural} verbergen` : `Alle ${kindPlural} tonen`,
        arrow: toggleArrow(wallListExpanded)
      })
    : "";

  const rows = !walls.length
    ? t.render("components/panel/no-sections-found", { kindPlural })
    : wallListToggle + (wallListExpanded
      ? t.render("components/panel/wall-list", { rows: wallRows })
      : "");

  // No trigger damage on this page means no stucloper is needed here, so the
  // totals would all be zero and are not worth showing. The individual areas
  // stay useful as reference — for wallpaper or paintwork — so they are kept,
  // all dimmed, since nothing matched.
  if (result.damageCount === 0) {
    return t.render("panel-no-matching-damage", {
      ...shared,
      triggerCodes: ctx.settings.triggerCodes.join("/"),
      kindCapitalised,
      rows
    });
  }

  const areaNote = result.areaCappedToFloor
    ? t.render("components/panel/area-capped", {
        widthBasis: result.totalWidth.toFixed(2),
        floorArea: result.floorArea.toFixed(2)
      })
    : result.floorArea == null
    ? t.render("components/panel/area-uncapped")
    : "";

  return t.render("panel-full", {
    ...shared,
    separator2: shared.separator,
    totalWidthRow: renderRow(t, "Totale breedte", formatMeasurement(result.totalWidth, "m"), "total"),
    totalAreaRow: renderRow(t, "Totale oppervlakte", formatMeasurement(result.totalArea, "m²"), "total"),
    areaNote,
    controlRow: renderRow(t, `${kindCapitalised}oppervlakte (controle)`,
      formatMeasurement(result.wallSurfaceArea, "m²")),
    kindPlural,
    rows
  });
}
