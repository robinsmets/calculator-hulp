/**
 * Parking hours.
 *
 * Transcribed from the "parkeren" tab of the estimating spreadsheet. Reports
 * hours only, never a cost: the tariff varies per address, so a euro figure
 * here would be misleading. The user decides how many workers apply.
 *
 * The arithmetic is done in integers throughout — see scaledFactor. Summing
 * the tiers as floating point, as the original did, reported an hour too many
 * at 60 specific amounts.
 */

/**
 * The spreadsheet's table starts at EUR 1.000 and says so explicitly, so lower
 * amounts are treated as 1.000.
 */
const MINIMUM_AMOUNT = 1000;

/** Amounts are rounded up to a multiple of this before the tiers apply. */
const ROUNDING_STEP = 250;

/**
 * Tier divisors. Each euro band contributes at a different rate.
 * Verified against the spreadsheet's worked example: EUR 24.100 with one
 * worker gives 74 hours.
 */
const TIER_1_LIMIT = 5000;
const TIER_1_DIVISOR = 2000;
const TIER_2_LIMIT = 10000;
const TIER_2_DIVISOR = 2500;
const TIER_3_DIVISOR = 3000;

/** Hours per worker per unit of factor. */
const HOURS_PER_FACTOR = 8;

/** The worker counts offered in the panel. */
const WORKER_COUNTS = [1, 2, 3, 4];

/**
 * A repair row with this exact description is an amount ALREADY budgeted for
 * parking. Page literal — matched against the live Dutch page, never
 * translate.
 */
const PARKING_ROW_LABEL = "Parkeren, uur";

/**
 * The basis for the hour estimate: the room total, minus whatever the
 * calculation already budgets for parking.
 *
 * The estimate below recommends a scope-appropriate number of hours from the
 * SIZE of the job. A "Parkeren, uur" row is itself a parking cost, not a sign
 * of more repair work — leaving it in the total would inflate the estimate by
 * an amount that has nothing to do with the job's scope. That row does not
 * always appear (the owner confirmed it can be entirely absent), so nothing
 * is subtracted when there is none: `alreadyBudgeted` is then 0 and `basis`
 * equals `roomTotal` exactly, which is today's behaviour.
 *
 * Several rows can in principle carry the same description; all of them are
 * summed rather than assuming there is at most one.
 *
 * @param {number} roomTotal
 * @param {import("./row-grammar.js").RepairRow[]} repairRows
 * @returns {{basis: number, alreadyBudgeted: number}}
 */
export function calculateParkingBasis(roomTotal, repairRows) {
  const alreadyBudgeted = repairRows
    .filter((row) => row.description === PARKING_ROW_LABEL)
    .reduce((sum, row) => sum + row.amount, 0);

  return { basis: roomTotal - alreadyBudgeted, alreadyBudgeted };
}

export { PARKING_ROW_LABEL };

/**
 * @param {number} amount the room total, excluding VAT
 * @returns {number}
 */
export function calculateParkingFactor(amount) {
  const floored = Math.max(amount, MINIMUM_AMOUNT);
  const rounded = Math.ceil(floored / ROUNDING_STEP) * ROUNDING_STEP;

  const tier1 = Math.min(rounded, TIER_1_LIMIT) / TIER_1_DIVISOR;
  const tier2 = Math.max(0, Math.min(rounded, TIER_2_LIMIT) - TIER_1_LIMIT) / TIER_2_DIVISOR;
  const tier3 = Math.max(0, rounded - TIER_2_LIMIT) / TIER_3_DIVISOR;

  return tier1 + tier2 + tier3;
}

/**
 * The tier sum as an exact integer, scaled by SCALE.
 *
 * The three tier quotients do not all divide evenly, so summing them as
 * floating point can land a hair above a whole number — and the ceiling below
 * then rounds a whole hour up. The original reported 209 hours where the
 * spreadsheet gives 208, at 60 specific amounts and only at three workers.
 *
 * Multiplying through by the lowest common multiple of the three divisors
 * keeps everything in integers, so the division happens exactly once and the
 * ceiling is applied to a true value.
 *
 *   1/2000 = 15/30000    1/2500 = 12/30000    1/3000 = 10/30000
 */
const SCALE = 30000;

function scaledFactor(amount) {
  const floored = Math.max(amount, MINIMUM_AMOUNT);
  const rounded = Math.ceil(floored / ROUNDING_STEP) * ROUNDING_STEP;

  return 15 * Math.min(rounded, TIER_1_LIMIT) +
         12 * Math.max(0, Math.min(rounded, TIER_2_LIMIT) - TIER_1_LIMIT) +
         10 * Math.max(0, rounded - TIER_2_LIMIT);
}

/**
 * @param {number} amount the room total, excluding VAT
 * @returns {Array<{werklieden: number, uren: number}>}
 */
export function calculateParkingOptions(amount) {
  const scaled = scaledFactor(amount);
  return WORKER_COUNTS.map((werklieden) => ({
    werklieden,
    // ceil(scaled/SCALE * werklieden * 8), done as one exact division.
    uren: Math.ceil((scaled * werklieden * HOURS_PER_FACTOR) / SCALE)
  }));
}

export { MINIMUM_AMOUNT as PARKING_MINIMUM_AMOUNT };

/**
 * Day names as prettigparkeren.nl expects them in a URL.
 *
 * Outbound wire format, not UI text: translating these produces a
 * plausible-looking dead link. Indexed by Date#getDay(), so Sunday first.
 */
const PARKEREN_DAGEN = [
  "Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"
];

/** A representative time of day for the tariff lookup. */
const PARKEREN_TIJDSTIP = "14:00";

const SITE_ROOT = "https://www.prettigparkeren.nl/";
const MAP_ROOT = "https://www.prettigparkeren.nl/kaart/#!";

/**
 * Builds a deep link into the interactive tariff map.
 *
 * Format is `/kaart/#!Plaats/Straat/Dag/Tijd`, recovered from a real example.
 * House number is deliberately omitted: tariffs apply per street or zone
 * anyway, and it avoids a fragile bit of suffix parsing.
 *
 * Degrades gracefully — without a street, to city level; without a city, to the
 * homepage for the user to search themselves.
 *
 * `now` is a parameter rather than a `new Date()` call so the output is
 * deterministic and testable. The day name comes from LOCAL time.
 *
 * Takes the RESULT shape ({city, street}), not the persisted Dutch shape.
 * Conversion happens once, in toAddressResult.
 *
 * @param {{city: string, street: string|null}|null} address
 * @param {Date} now
 * @returns {string}
 */
export function buildParkingRateUrl(address, now) {
  if (!address || !address.city) return SITE_ROOT;

  const city = encodeURIComponent(address.city.replace(/\s+/g, "_"));
  if (!address.street) return MAP_ROOT + city;

  const street = encodeURIComponent(address.street.replace(/\s+/g, "_"));
  const day = PARKEREN_DAGEN[now.getDay()];

  return `${MAP_ROOT}${city}/${street}/${day}/${PARKEREN_TIJDSTIP}`;
}

export { PARKEREN_DAGEN, PARKEREN_TIJDSTIP };
