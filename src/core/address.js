/**
 * Finds the property address on a page, for the parking-tariff deep link.
 *
 * Not keyed on a label — those vary ("Adres", "Postcode en plaats",
 * "Woonplaats", ...) — but on the Dutch postcode pattern itself, which is the
 * same everywhere and therefore more reliable.
 *
 * Street and house number are best effort. In a standard Dutch address block
 * they sit on the line immediately above the postcode. When that does not
 * parse the deep link still works, just at city level.
 */

/**
 * Four digits and two capitals, optionally spaced, followed by the city on the
 * rest of the line.
 *
 * Case sensitive: a lowercase postcode is not recognised. The city capture
 * cannot cross a digit, so "3511 AK Bergen 2" fails the whole match rather
 * than just the city part. And any four digits followed by two capitals looks
 * like a postcode, so "versie 2024 AB Concept" parses as one.
 */
const POSTCODE_PATTERN = /\b(\d{4}\s?[A-Z]{2})\s+([^\n\d]{2,40}?)(?=\n|$)/;

/** Canonical form: exactly one space between digits and letters. */
const POSTCODE_CANONICAL = /\s*(\d{4})\s*([A-Z]{2})/;

/**
 * A street line: name, number, optional suffix.
 *
 * The name cannot start with a digit, so common Dutch forms like
 * "1e Kerkstraat" are not recognised and fall back to city level.
 *
 * The suffix may be attached ("10a") or spaced ("27 a"); the tariff site wants
 * it attached, so the two parts are joined.
 */
const STREET_PATTERN = /^([A-Za-zÀ-ÿ.'\- ]{2,40}?)\s+(\d{1,4})\s*([a-zA-Z]{0,3})$/;

/** How far back to look for the street line. */
const STREET_LOOKBACK = 80;

/** Case identifier, e.g. "S-1234567". Present on nearly every page of a file. */
const CASE_ID_PATTERN = /S-\d{5,}/;

/**
 * How many cases to remember an address for.
 *
 * The owner asked for exactly one: only the dossier currently open, not a
 * running history of every dossier ever visited. Opening a different dossier
 * replaces this entry outright rather than adding to it.
 *
 * The cache is only a convenience — a miss costs a city-level parking link
 * rather than a street-level one, never a wrong one (see deriveCacheEntry:
 * lookups are always keyed on the CURRENT dossier's own case id, so a stale
 * entry is simply absent, never used for the wrong dossier).
 */
const MAX_CACHED_CASES = 1;

/**
 * @typedef {object} Address
 * @property {string} postalCode
 * @property {string} city
 * @property {string|null} street
 * @property {string|null} houseNumber
 *
 * English field names, including in storage. That is possible because the
 * storage layer keeps everything under one versioned key, so the stored shape
 * is ours to define rather than something inherited. It means there is ONE
 * address shape in the codebase instead of a Dutch persisted one and an
 * English in-memory one.
 */

/**
 * @param {string} text
 * @returns {Address|null}
 */
export function parseAddress(text) {
  const match = text.match(POSTCODE_PATTERN);
  if (!match) return null;

  const postalCode = match[1].toUpperCase().replace(POSTCODE_CANONICAL, "$1 $2");
  const city = match[2].trim();
  if (!city) return null;

  const before = text.slice(Math.max(0, match.index - STREET_LOOKBACK), match.index);
  const lines = before.split("\n").map((line) => line.trim()).filter(Boolean);
  const streetLine = lines[lines.length - 1] || "";
  const streetMatch = streetLine.match(STREET_PATTERN);

  return {
    postalCode,
    city,
    street: streetMatch ? streetMatch[1].trim() : null,
    houseNumber: streetMatch ? (streetMatch[2] + streetMatch[3]).trim() : null
  };
}

/**
 * @param {string} text
 * @returns {string|null}
 */
export function findCaseId(text) {
  const match = text.match(CASE_ID_PATTERN);
  return match ? match[0] : null;
}

/**
 * Decides whether this page can contribute an address to the cache.
 *
 * The calculation page itself usually has no address, but other pages of the
 * same file do — so every page is checked, and the address is stored against
 * the case id for the calculation page to find later.
 *
 * Only when the page carries exactly ONE case id: on an overview or list page
 * there is no way to tell which address belongs to which file.
 *
 * @param {string} text
 * @param {Record<string, Address>} cache
 * @returns {{caseId: string, address: Address}|null} null when nothing to store
 */
export function deriveCacheEntry(text, cache) {
  const ids = text.match(new RegExp(CASE_ID_PATTERN.source, "g")) || [];
  const unique = [...new Set(ids)];
  if (unique.length !== 1) return null;

  const caseId = unique[0];
  const address = parseAddress(text);
  if (!address) return null;

  // Already stored and unchanged — nothing to write.
  //
  // Compares serialised form, so it is sensitive to key order. The Address
  // shape is therefore built in exactly one place: reordering that literal
  // would make every cached entry compare unequal forever, and the extension
  // would write to storage on every render.
  const existing = cache[caseId];
  if (existing && JSON.stringify(existing) === JSON.stringify(address)) return null;

  return { caseId, address };
}

/**
 * Adds an entry, evicting the oldest once the cache is full.
 *
 * Insertion order is object key order, which is stable for string keys that
 * are not integer-like — and case ids never are.
 *
 * @param {Record<string, Address>} cache
 * @param {string} caseId
 * @param {Address} address
 * @returns {Record<string, Address>} a new cache
 */
export function addToCache(cache, caseId, address) {
  const entries = Object.entries(cache).filter(([id]) => id !== caseId);
  entries.push([caseId, address]);
  return Object.fromEntries(entries.slice(-MAX_CACHED_CASES));
}

/**
 * Exported for the frozen-literal assertions: this pattern is matched against
 * the live Dutch site, so its VALUE is the contract rather than its name.
 */
export { CASE_ID_PATTERN, MAX_CACHED_CASES };
