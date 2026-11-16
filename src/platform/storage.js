/**
 * The chrome.storage boundary.
 *
 * Everything is kept under ONE versioned key. That is worth explaining,
 * because the obvious alternative — one key per setting, as the original had —
 * looks simpler and is worse.
 *
 * The original spreads seven Dutch-named keys across three files, each with
 * its own hardcoded list, and renaming any of them to English would silently
 * lose that setting on the next page load. A migration cannot fix that safely:
 * there is no background service worker, so no `onInstalled` hook, and the
 * content script runs in every frame — so a read-modify-write migration would
 * race itself against non-transactional storage.
 *
 * Versioning sidesteps the whole problem. There is no migration step:
 *
 *   READ   when the versioned key is absent, the legacy keys are read and
 *          shaped in memory. Pure and deterministic, so every frame computes
 *          the same thing independently. Nothing is written, so nothing races.
 *   WRITE  only ever the versioned key. The legacy keys are never written
 *          again and simply rot.
 *
 * Case data is never stored here. Addresses found on a case's pages used to
 * be cached in this blob, and the owner did not want them surviving a switch
 * to another case or a browser restart; they now live in memory in
 * content.js. An address left in an older profile is ignored on read and
 * dropped from the blob by the next write.
 */

import { DEFAULTS, DEFAULT_TRIGGER_CODES } from "../../config.js";

/** The single key everything lives under. */
export const STORAGE_KEY = "calculatorHulp";

/** Bump when the stored shape changes; read() upgrades older versions. */
export const STORAGE_VERSION = 2;

/**
 * The keys version 1 used — the original's seven Dutch names.
 *
 * Read once, on a profile that has never run version 2, and never written.
 * Frozen: these are what is actually sitting in the owner's browser.
 */
const V1_KEYS = {
  triggerCodes: "triggerCodes",
  parkingEnabled: "parkerenEnabled",
  correctionCheckEnabled: "correctieCheckEnabled",
  correctionKeywords: "correctieTrefwoorden",
  panelPosition: "panelPos",
  panelSize: "paneelGrootte"
};

/**
 * Applies the same coercion rules everywhere.
 *
 * The original coerced differently on first load than on live update — one
 * path required a non-empty array, the other accepted anything truthy — so an
 * empty trigger-code list behaved differently depending on which ran. One
 * function, one behaviour.
 */
function coerce(raw) {
  const settings = { ...DEFAULTS };

  if (Array.isArray(raw.triggerCodes) && raw.triggerCodes.length) {
    settings.triggerCodes = raw.triggerCodes;
  } else {
    settings.triggerCodes = DEFAULT_TRIGGER_CODES;
  }

  if (raw.enabled != null) settings.enabled = !!raw.enabled;
  if (raw.parkingEnabled != null) settings.parkingEnabled = !!raw.parkingEnabled;
  if (raw.correctionCheckEnabled != null) {
    settings.correctionCheckEnabled = !!raw.correctionCheckEnabled;
  }
  if (raw.vatCheckEnabled != null) settings.vatCheckEnabled = !!raw.vatCheckEnabled;
  if (raw.wallListExpanded != null) settings.wallListExpanded = !!raw.wallListExpanded;
  if (raw.panelMinimized != null) settings.panelMinimized = !!raw.panelMinimized;

  // null means "use the defaults", and an empty array is treated the same way.
  settings.correctionKeywords =
    Array.isArray(raw.correctionKeywords) && raw.correctionKeywords.length
      ? raw.correctionKeywords
      : null;

  settings.verlaagdBtwKeywords =
    Array.isArray(raw.verlaagdBtwKeywords) && raw.verlaagdBtwKeywords.length
      ? raw.verlaagdBtwKeywords
      : null;

  settings.verlaagdBtwUitzonderingen =
    Array.isArray(raw.verlaagdBtwUitzonderingen) && raw.verlaagdBtwUitzonderingen.length
      ? raw.verlaagdBtwUitzonderingen
      : null;

  if (raw.panelSize) settings.panelSize = raw.panelSize;

  settings.panelPosition =
    raw.panelPosition && typeof raw.panelPosition.left === "number"
      ? raw.panelPosition
      : null;

  return settings;
}

/** Reads the seven version-1 keys and shapes them. No writes. */
async function readVersion1(area) {
  const stored = await area.get(Object.values(V1_KEYS));
  return coerce({
    triggerCodes: stored[V1_KEYS.triggerCodes],
    parkingEnabled: stored[V1_KEYS.parkingEnabled],
    correctionCheckEnabled: stored[V1_KEYS.correctionCheckEnabled],
    correctionKeywords: stored[V1_KEYS.correctionKeywords],
    panelPosition: stored[V1_KEYS.panelPosition],
    panelSize: stored[V1_KEYS.panelSize]
  });
}

/**
 * @param {object} area a chrome.storage area
 * @returns {Promise<object>} settings
 */
export async function read(area) {
  const stored = await area.get([STORAGE_KEY]);
  const blob = stored[STORAGE_KEY];

  if (!blob || typeof blob !== "object") return readVersion1(area);
  if (blob.version === STORAGE_VERSION) return coerce(blob.settings || {});

  // A future version written by a newer build. Read what is recognisable
  // rather than discarding the lot.
  return coerce(blob.settings || {});
}

/**
 * Writes the whole blob.
 *
 * Always a full write, never a partial one — which is the point. Callers
 * cannot forget to include a field, and there is no per-key list to keep in
 * sync across three files.
 *
 * @param {object} area
 * @param {object} settings
 */
export async function write(area, settings) {
  await area.set({ [STORAGE_KEY]: { version: STORAGE_VERSION, settings } });
}

/** Where version 1 kept addresses. Page literal of the old build: frozen. */
const LEGACY_ADDRESS_KEY = "adresCache";

/**
 * Deletes the addresses older builds stored, once.
 *
 * Builds before 2.2.4 kept case addresses in storage; the owner wants none
 * left behind (Firefox updates in place, so they would otherwise stay). Two
 * places: the version 1 key, and an addressCache field in the blob.
 *
 * The blob part is a read-modify-write, which the header warns against.
 * Accepted here, on the owner's decision: it only ever writes when the
 * field is present, so it runs once per profile, and every frame racing it
 * writes the same settings minus the same field. The one thing it could
 * lose is a setting changed in the popup in that same instant.
 *
 * @param {object} area a chrome.storage area
 * @returns {Promise<boolean>} whether anything was removed
 */
export async function removeStoredCaseData(area) {
  const stored = await area.get([STORAGE_KEY, LEGACY_ADDRESS_KEY]);
  let removed = false;

  if (stored[LEGACY_ADDRESS_KEY] !== undefined) {
    await area.remove(LEGACY_ADDRESS_KEY);
    removed = true;
  }

  const blob = stored[STORAGE_KEY];
  if (blob && blob.settings && typeof blob.settings === "object" && "addressCache" in blob.settings) {
    const settings = { ...blob.settings };
    delete settings.addressCache;
    await area.set({ [STORAGE_KEY]: { ...blob, settings } });
    removed = true;
  }

  return removed;
}

/**
 * Applies a partial update on top of the current settings.
 *
 * @param {object} area
 * @param {object} current
 * @param {object} patch
 * @returns {Promise<object>} the merged settings
 */
export async function update(area, current, patch) {
  const merged = { ...current, ...patch };
  await write(area, merged);
  return merged;
}

/**
 * Turns a storage change event into the new settings, or null when the change
 * was not ours.
 *
 * The original branched on individual key names. With one blob there is a
 * single change to inspect, and the caller diffs whatever it cares about.
 *
 * @param {Record<string, {oldValue?: unknown, newValue?: unknown}>} changes
 * @returns {{settings: object, previous: object|null}|null}
 */
export function readChange(changes) {
  const change = changes[STORAGE_KEY];
  if (!change) return null;

  const next = change.newValue;
  const previous = change.oldValue;

  return {
    settings: coerce((next && next.settings) || {}),
    previous: previous ? coerce(previous.settings || {}) : null
  };
}

export { V1_KEYS, coerce };
