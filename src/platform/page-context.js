/**
 * Which pages the extension applies to.
 *
 * The room calculation page has this shape in its URL:
 *   /editors/calculatie/ruimtes/{uuid}
 *
 * The fragment itself lives in config.js, where the owner can change it.
 *
 * The path fragment is matched against the live Dutch site. Translating it
 * does not throw — the panel simply never appears anywhere, which reads as the
 * extension being broken rather than misconfigured.
 */

import { PAGE_PATH, CONTROLE_PAGE_PATH } from "../../config.js";

function toPathPattern(path) {
  return new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

const CALCULATION_PAGE_PATTERN = toPathPattern(PAGE_PATH);
const CONTROLE_PAGE_PATTERN = toPathPattern(CONTROLE_PAGE_PATH);

/**
 * @param {string} pathname
 * @returns {boolean}
 */
export function isCalculationPage(pathname) {
  return CALCULATION_PAGE_PATTERN.test(pathname);
}

/**
 * @param {string} pathname
 * @returns {boolean}
 */
export function isControlePage(pathname) {
  return CONTROLE_PAGE_PATTERN.test(pathname);
}

/** Either tool: decides whether the panel appears at all. */
export function isRelevantPage(pathname) {
  return isCalculationPage(pathname) || isControlePage(pathname);
}

/** True in the top-level frame, false inside an embedded one. */
export function isTopFrame(win = window) {
  return win.top === win;
}

export { CALCULATION_PAGE_PATTERN, CONTROLE_PAGE_PATTERN };
