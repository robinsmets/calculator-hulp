/**
 * Dragging the panel by its title bar.
 *
 * The default position overlaps the photo pane on some screens, so the panel
 * can be moved and remembers where it was put.
 *
 * All the arithmetic lives in zoom.js and is unit-tested there; this file only
 * wires it to pointer events.
 */

import { grabOffset, positionFromPointer, toElementPosition, toStoredPosition } from "./zoom.js";

/**
 * @param {object} options
 * @param {HTMLElement} options.element
 * @param {() => number} options.getZoom
 * @param {(position: {left: number, top: number}) => void} options.onDrop
 * @param {Document} [options.document]
 * @returns {{start: (event: MouseEvent) => void, stop: () => void}}
 */
export function createDragHandler({ element, getZoom, onDrop, document: doc = document }) {
  let grab = null;
  let latest = null;

  function apply(position) {
    const { left, top } = toElementPosition(position, getZoom());
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
  }

  function onMove(event) {
    if (!grab) return;
    latest = positionFromPointer(event, grab);
    apply(latest);
  }

  function onRelease() {
    if (!grab) return;
    const dropped = latest;
    grab = null;
    latest = null;
    doc.removeEventListener("mousemove", onMove);
    doc.removeEventListener("mouseup", onRelease);
    // Store what was computed during the drag, not what is on the element:
    // the element carries the zoom-divided value, and storing that would make
    // the panel creep every time the size changed.
    if (dropped) onDrop(toStoredPosition(dropped));
  }

  return {
    start(event) {
      // getBoundingClientRect already reports the zoomed on-screen rectangle,
      // so the pointer arithmetic works in real pixels throughout.
      grab = grabOffset(event, element.getBoundingClientRect());
      latest = null;
      doc.addEventListener("mousemove", onMove);
      doc.addEventListener("mouseup", onRelease);
      event.preventDefault();
    },
    stop: onRelease,
    apply
  };
}
