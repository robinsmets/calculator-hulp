/**
 * Names shared between the rendered markup and the event listeners that read
 * it.
 *
 * Frozen in one place because a one-sided rename compiles, lints, and passes
 * every analysis test — the button just silently stops working. The emitter
 * and the listeners used to sit thirty lines apart; they are now in separate
 * modules, which makes drifting apart considerably easier.
 *
 * RESET_POSITION in particular is read from THREE places: the click handler,
 * the template, and a mousedown guard that stops the reset button from also
 * starting a drag. Miss the third and clicking it both resets and drags.
 */

export const ACTIONS = {
  RESET_POSITION: "reset-positie",
  TOGGLE_PARKING: "toggle-parkeren",
  TOGGLE_CORRECTIONS: "toggle-correctie",
  TOGGLE_WALLS: "toggle-wanden",
  TOGGLE_MINIMIZE: "toggle-minimaliseren",
  SET_VAT_SITUATION: "btw-situatie",
  TOGGLE_VAT: "toggle-btw"
};

/** Marks the region of the panel that can be grabbed to drag it. */
export const DRAG_HANDLE_ATTRIBUTE = "data-drag-handle";

/** The attribute carrying an action name. */
export const ACTION_ATTRIBUTE = "data-action";

export const ALL_ACTIONS = Object.values(ACTIONS);
