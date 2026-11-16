/**
 * Console logging.
 *
 * Errors always reach the console, under the prefix the popup tells users to
 * filter on; changing the prefix breaks that instruction. The diagnostic
 * notes in debug() carry case data (addresses, correction rows, totals), so
 * they are written only by the admin build — see build-flavour.js.
 */

import { LOG_PREFIX } from "../../config.js";
import { CONSOLE_NOTES } from "./build-flavour.js";

/** Diagnostic output, one line per analysis step. Admin build only. */
export function debug(...args) {
  if (!CONSOLE_NOTES) return;
  console.debug(LOG_PREFIX, ...args);
}

/**
 * Kept separate from debug on purpose.
 *
 * This is the safety net that reports an unexpected failure without letting
 * the panel disappear silently. Folding it into a general logging helper that
 * someone might later silence would defeat the point.
 */
export function error(...args) {
  console.error(LOG_PREFIX, ...args);
}

export { LOG_PREFIX };
