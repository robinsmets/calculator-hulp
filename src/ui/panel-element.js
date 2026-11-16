/**
 * The panel's DOM lifecycle.
 *
 * Two structural decisions worth knowing about.
 *
 * MOUNTED ON documentElement, NOT body. The analysis reads
 * `document.body.innerText`, so a panel inside the body would feed its own
 * output back into the next parse — the room total it displays would be read
 * as a room total on the page. Keeping it a sibling of <body> makes that
 * impossible rather than merely unlikely.
 *
 * RENDERED INTO A SHADOW ROOT. The host page's stylesheet cannot reach in and
 * ours cannot leak out. The original used an inline style on every element for
 * exactly this reason; a shadow root does it properly, which is what let the
 * styling move to a real stylesheet.
 */

import { ACTIONS, ACTION_ATTRIBUTE, DRAG_HANDLE_ATTRIBUTE } from "./actions.js";
import { zoomFor, toElementPosition, DEFAULT_CORNER } from "./zoom.js";
import { createDragHandler } from "./drag.js";

/**
 * Versioned, so a panel left behind by an older build is recognisable rather
 * than being silently adopted and fought over.
 */
const PANEL_ID = "psh-overlay-panel-2";
const LEGACY_PANEL_PREFIX = "psh-overlay-panel";

/**
 * @param {object} options
 * @param {string} options.stylesheet  the panel stylesheet, as text
 * @param {() => object} options.getSettings
 * @param {(patch: object) => void} options.onSettingsChange
 * @param {(situation: string) => void} [options.onVatSituationChange] P3 build only
 * @param {Document} [options.document]
 */
export function createPanel({
  stylesheet,
  getSettings,
  onSettingsChange,
  onVatSituationChange = () => {},
  document: doc = document
}) {
  let host = null;
  let shadow = null;
  let body = null;
  let drag = null;

  function build() {
    host = doc.createElement("div");
    host.id = PANEL_ID;
    host.className = "calc-panel";

    shadow = host.attachShadow({ mode: "open" });

    const style = doc.createElement("style");
    style.textContent = stylesheet;
    shadow.append(style);

    body = doc.createElement("div");
    body.className = "calc-panel";
    shadow.append(body);

    doc.documentElement.append(host);

    drag = createDragHandler({
      element: host,
      getZoom: () => zoomFor(getSettings().panelSize),
      onDrop: (panelPosition) => onSettingsChange({ panelPosition }),
      document: doc
    });

    attachListeners();
    applyPosition();
    applyZoom();
    return host;
  }

  /**
   * One delegated listener rather than per-element handlers, so it survives
   * the panel's contents being replaced on every render.
   *
   * `composedPath()[0]` rather than `event.target`: an event crossing a shadow
   * boundary is retargeted to the host, so `target` would be the panel itself
   * and every action would silently stop matching. `closest` then climbs from
   * there, because a toggle's arrow is a span inside the element that carries
   * the action.
   */
  function attachListeners() {
    shadow.addEventListener("click", (event) => {
      const clicked = event.composedPath()[0];
      const source = clicked && clicked.closest && clicked.closest(`[${ACTION_ATTRIBUTE}]`);
      const action = source && source.getAttribute(ACTION_ATTRIBUTE);
      if (!action) return;

      const settings = getSettings();

      if (action === ACTIONS.TOGGLE_PARKING) {
        onSettingsChange({ parkingEnabled: !settings.parkingEnabled });
      } else if (action === ACTIONS.TOGGLE_CORRECTIONS) {
        onSettingsChange({ correctionCheckEnabled: !settings.correctionCheckEnabled });
      } else if (action === ACTIONS.TOGGLE_VAT) {
        onSettingsChange({ vatCheckEnabled: !settings.vatCheckEnabled });
      } else if (action === ACTIONS.TOGGLE_WALLS) {
        onSettingsChange({ wallListExpanded: !settings.wallListExpanded });
      } else if (action === ACTIONS.TOGGLE_MINIMIZE) {
        onSettingsChange({ panelMinimized: !settings.panelMinimized });
      } else if (action === ACTIONS.RESET_POSITION) {
        resetPosition();
      } else if (action === ACTIONS.SET_VAT_SITUATION) {
        onVatSituationChange(source.getAttribute("data-situation"));
      }
    });

    shadow.addEventListener("mousedown", (event) => {
      const source = event.composedPath()[0];
      if (!source || !source.closest) return;

      // The reset AND minimize/expand controls sit inside the drag handle, so
      // without this guard clicking either would both fire the action and
      // begin a drag.
      const sourceAction = source.getAttribute && source.getAttribute(ACTION_ATTRIBUTE);
      if (sourceAction === ACTIONS.RESET_POSITION || sourceAction === ACTIONS.TOGGLE_MINIMIZE) return;
      if (source.closest(`[${DRAG_HANDLE_ATTRIBUTE}]`)) drag.start(event);
    });
  }

  function applyPosition() {
    if (!host) return;
    const { panelPosition, panelSize } = getSettings();

    if (!panelPosition) {
      host.style.left = "auto";
      host.style.top = "auto";
      host.style.right = DEFAULT_CORNER.right;
      host.style.bottom = DEFAULT_CORNER.bottom;
      return;
    }

    const { left, top } = toElementPosition(panelPosition, zoomFor(panelSize));
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  }

  function applyZoom() {
    if (!host) return;
    // CSS zoom rather than transform: scale(). Not interchangeable — zoom
    // affects layout, which is what the position arithmetic compensates for.
    host.style.zoom = zoomFor(getSettings().panelSize);
  }

  function resetPosition() {
    onSettingsChange({ panelPosition: null });
    applyPosition();
  }

  return {
    /** Creates the panel if needed and returns it. */
    ensure() {
      if (!host || !doc.documentElement.contains(host)) build();
      return host;
    },

    /** Replaces the panel's contents. */
    render(html) {
      this.ensure();
      body.innerHTML = html;
    },

    remove() {
      if (host) host.remove();
      host = null;
      shadow = null;
      body = null;
    },

    applyPosition,
    applyZoom,

    /**
     * Removes a panel left by an older build.
     *
     * Only ever a best effort: an orphaned content script keeps its own timers
     * running and will simply recreate its panel a few seconds later. The
     * reliable fix is reloading the tab, and the README says so.
     */
    removeStalePanels() {
      for (const element of doc.querySelectorAll(`[id^="${LEGACY_PANEL_PREFIX}"]`)) {
        if (element.id !== PANEL_ID) element.remove();
      }
    },

    get element() { return host; }
  };
}

export { PANEL_ID, LEGACY_PANEL_PREFIX };
