/**
 * Panel scaling and position arithmetic.
 *
 * Extracted as pure functions precisely because this is the part most likely
 * to break invisibly: at the default size the zoom factor is 1, so every
 * mistake here cancels out and only shows at "klein" or "groot".
 *
 * The panel is scaled with CSS `zoom` rather than `transform: scale()`, so
 * that text, line height, padding and buttons all scale together without
 * touching each individual size. That choice is NOT interchangeable — see
 * below.
 */

import { PANEEL_ZOOM } from "../../config.js";

const DEFAULT_ZOOM = 1;

/**
 * @param {string} panelSize one of the persisted size values
 * @returns {number}
 */
export function zoomFor(panelSize) {
  return PANEEL_ZOOM[panelSize] || DEFAULT_ZOOM;
}

/**
 * Converts a stored screen position into the left/top the panel needs.
 *
 * Positions are stored in REAL screen pixels so they stay correct whatever
 * size is active. But Chrome multiplies a zoomed element's own `left`/`top` by
 * that same zoom factor — "left: 100px" on an element at zoom 0.85 lands at
 * 85px — so the factor has to be divided back out here.
 *
 * This is exactly why `zoom` cannot be swapped for `transform: scale()`:
 * `zoom` affects layout and `transform` does not, so the compensation would
 * then be wrong in the opposite direction.
 *
 * @param {{left: number, top: number}} position real screen pixels
 * @param {number} zoom
 * @returns {{left: number, top: number}} values to assign to the element
 */
export function toElementPosition(position, zoom) {
  return { left: position.left / zoom, top: position.top / zoom };
}

/**
 * The inverse: an element's on-screen rectangle back into stored coordinates.
 *
 * getBoundingClientRect already reports the zoomed, on-screen position, so
 * during a drag the pointer maths works in real pixels and only the assignment
 * back to the element needs converting. Storing the element's own left/top
 * instead would save the divided value and the panel would creep every time
 * the size changed.
 *
 * @param {{left: number, top: number}} screenPosition
 * @returns {{left: number, top: number}}
 */
export function toStoredPosition(screenPosition) {
  return { left: screenPosition.left, top: screenPosition.top };
}

/**
 * Where the panel should sit while dragging, given the pointer and the grab
 * offset. Clamped so it cannot be dragged off the top or left edge.
 *
 * @param {{clientX: number, clientY: number}} pointer
 * @param {{offsetX: number, offsetY: number}} grab
 * @returns {{left: number, top: number}} real screen pixels
 */
export function positionFromPointer(pointer, grab) {
  return {
    left: Math.max(0, pointer.clientX - grab.offsetX),
    top: Math.max(0, pointer.clientY - grab.offsetY)
  };
}

/**
 * The offset within the panel where the drag started.
 *
 * @param {{clientX: number, clientY: number}} pointer
 * @param {{left: number, top: number}} rect from getBoundingClientRect
 * @returns {{offsetX: number, offsetY: number}}
 */
export function grabOffset(pointer, rect) {
  return { offsetX: pointer.clientX - rect.left, offsetY: pointer.clientY - rect.top };
}

/** Where the panel sits when no position has been stored. */
export const DEFAULT_CORNER = { right: "16px", bottom: "16px" };
