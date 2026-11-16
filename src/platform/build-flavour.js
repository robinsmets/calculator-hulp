/**
 * Which build this is.
 *
 * The owner wants the build colleagues get to write no diagnostic notes to
 * the console (addresses, correction rows, totals), and a separate admin
 * build for himself that does, for troubleshooting.
 *
 * This file is that switch. It ships as false; `npm run build` writes a
 * second, admin copy of the extension in which dev/build.js rewrites the
 * line below to true. Keep it a single literal line: the build matches it
 * exactly and refuses to build when it cannot find it.
 */
export const CONSOLE_NOTES = false;

/**
 * The P3 build: a separate copy for P3 with larger minimise arrows and a
 * choice of VAT situation in the correction check. Ships as false; dev/build.js
 * rewrites it to true in the P3 copy, under the same single-line rule as above.
 */
export const P3 = false;
