/**
 * Matches corrections to the repair rows they belong to, and flags overruns.
 *
 * A correction claws back an amount paid earlier. It must never exceed the
 * newly calculated repair it relates to — but its wording never matches that
 * repair literally, so the link has to be inferred.
 *
 * Two checks come out of that:
 *   individual  is this correction larger than its matched row?
 *   cumulative  are several corrections larger together than the ceiling
 *               they share — either the same repair row worded two ways, or
 *               (rolsteiger) several DIFFERENT rows summed into one ceiling
 *               where each correction on its own can hide under the total
 *               while the group of them still exceeds it
 */

import { similarity, findSharedKeyword, resolveKeywords, keywordPresent } from "./similarity.js";
import { SAMEN_OPTELLEN_TREFWOORDEN, BOUWDELEN } from "../../config.js";

/** Below this, the match is not confident enough to judge on. */
const MATCH_THRESHOLD = 0.5;

/**
 * A shared trade term is strong evidence, so it lifts the score to at least
 * this — but raw overlap still counts, so that when two rows share a term the
 * better overall match wins rather than whichever came first.
 */
const KEYWORD_SCORE_FLOOR = 0.75;

/** Cent-level slack, so floating point does not manufacture overruns. */
const AMOUNT_EPSILON = 0.01;

/**
 * Union-find with path halving, for grouping corrections that share a ceiling.
 *
 * Grouping has to be transitive: if A shares a ceiling with B and A with C,
 * then B and C belong together too. Without that, three corrections on one
 * ceiling produce three separate warnings with three different totals.
 */
function createClusters(size) {
  const parent = Array.from({ length: size }, (_, i) => i);

  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }

  return {
    find,
    union(a, b) {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent[rootB] = rootA;
    }
  };
}

/**
 * Whether the correction and the row each name a building part, and not the
 * same one. A shared trade term is not enough when the parts differ: the owner
 * hit "Sauswerk binnenplafonds" measured against "Sauswerk wanden" in a room
 * with no ceiling row left, so it read as within budget instead of unmatched.
 */
function differentBuildingPart(correctionText, repairText) {
  const inCorrection = BOUWDELEN.filter((part) => keywordPresent(correctionText, part));
  const inRepair = BOUWDELEN.filter((part) => keywordPresent(repairText, part));
  return inCorrection.length > 0 && inRepair.length > 0 &&
    !inCorrection.some((part) => inRepair.includes(part));
}

/**
 * Picks the repair row a correction most likely belongs to.
 *
 * @returns {{match: object|null, score: number, keyword: string|null}}
 */
function findBestMatch(correction, repairs, trefwoorden) {
  let best = null;
  let bestScore = 0;
  let bestRawScore = 0;
  let bestRank = Infinity;
  let bestKeyword = null;

  for (const repair of repairs) {
    if (differentBuildingPart(correction.matchText, repair.description)) continue;

    const rawScore = similarity(correction.matchText, repair.description);
    // A building part says where the work is, not what it is: "Sauswerk
    // binnenplafonds" and "plafondarmaturen" share "plafond" and nothing else.
    // The list puts trades before parts, so a part found here means no trade
    // is shared, and the owner chose that this earns no keyword floor.
    const shared = findSharedKeyword(
      correction.trefwoordTekst || correction.description, repair.description, trefwoorden);
    const keyword = shared && !BOUWDELEN.includes(shared.toLowerCase()) ? shared : null;
    const score = keyword ? Math.max(rawScore, KEYWORD_SCORE_FLOOR) : rawScore;

    // How specific the shared term is: the list is ordered most-specific-first,
    // so an earlier term says more about what the correction concerns.
    const rank = keyword ? trefwoorden.indexOf(keyword) : Infinity;

    // The keyword floor makes ties the normal case rather than the exception:
    // any two rows sharing a term with the correction both sit at exactly the
    // floor. Specificity has to break that tie, and it has to break it BEFORE
    // raw overlap gets a say — raw overlap divides by the SHORTER of the two
    // descriptions, so a two-word row scores 0.5 on one accidental word while
    // the row that genuinely fits is dragged down by its own detail. That is
    // how a stucwerk correction came to be measured against "Sauswerk wanden":
    // both rows shared only "wand", and the shorter one won on overlap.
    const better = score > bestScore ||
      (score === bestScore && rank < bestRank) ||
      (score === bestScore && rank === bestRank && rawScore > bestRawScore);

    if (better) {
      bestScore = score;
      bestRawScore = rawScore;
      bestRank = rank;
      best = repair;
      bestKeyword = keyword;
    }
  }

  return { match: best, score: bestScore, keyword: bestKeyword };
}

/**
 * The rows a correction is measured against.
 *
 * Usually just the single best match: several rows can share a term without
 * belonging together, so summing them everywhere would mask real overruns.
 *
 * Scaffolding is the exception. Older files calculated it as one line; current
 * practice splits it into erection and hire. A correction referring to the old
 * single line has to be measured against both.
 */
function resolveMatchGroup(match, keyword, repairs) {
  if (!match) return [];
  if (!keyword || !SAMEN_OPTELLEN_TREFWOORDEN.includes(keyword.toLowerCase())) return [match];

  const term = keyword.toLowerCase();
  const group = repairs.filter((repair) => (repair.description || "").toLowerCase().includes(term));
  if (!group.includes(match)) group.push(match);
  return group;
}

/**
 * @param {import("./row-grammar.js").CorrectionRow[]} corrections
 * @param {import("./row-grammar.js").RepairRow[]} repairs
 * @param {string[]|null} configuredKeywords
 * @returns {object[]} corrections enriched with match and overrun information
 */
export function matchCorrections(corrections, repairs, configuredKeywords) {
  const trefwoorden = resolveKeywords(configuredKeywords);

  const matched = corrections.map((correction) => {
    const { match: best, score, keyword } = findBestMatch(correction, repairs, trefwoorden);
    const match = score >= MATCH_THRESHOLD ? best : null;

    const matchGroup = resolveMatchGroup(match, keyword, repairs);
    const matchGroupTotal = matchGroup.reduce((sum, repair) => sum + repair.amount, 0);

    return {
      ...correction,
      match,
      matchGroup,
      matchGroupTotal,
      matchScore: score,
      trefwoord: match ? keyword : null,
      // Tri-state on purpose: null means "no confident match", which is not
      // the same as "within budget".
      exceedsMatch: match ? correction.amount > matchGroupTotal + AMOUNT_EPSILON : null
    };
  });

  return addCumulativeWarnings(matched);
}

/**
 * Whether two matchGroups are the SAME summed-together group — same rows, same
 * count. Reference equality on the rows is enough: repair rows are never
 * copied, and resolveMatchGroup filters the same `repairs` array both times.
 *
 * @param {object[]} a
 * @param {object[]} b
 * @returns {boolean}
 */
function sameMatchGroup(a, b) {
  return a.length > 1 && a.length === b.length && a.every((row) => b.includes(row));
}

/**
 * Adds a cumulative overrun warning where several corrections exceed their
 * shared ceiling together. Two distinct reasons a shared ceiling exists:
 *
 *   the same repair row      several corrections against the SAME repair row,
 *                            however they are worded (e.g. the same stucloper
 *                            post split into two correction lines)
 *   a SAMEN_OPTELLEN keyword  several corrections against DIFFERENT repair
 *                            rows that are themselves summed into one shared
 *                            matchGroupTotal (rolsteiger opbouw/afbraak +
 *                            huur). Each correction on its own can sit safely
 *                            under the COMBINED cap while still, together,
 *                            exceeding it — a real case that went unflagged
 *                            because this function only ever clustered on
 *                            matching the exact same repair row, never on
 *                            matching the exact same GROUP of them.
 */
function addCumulativeWarnings(matched) {
  const clusters = createClusters(matched.length);

  for (let i = 0; i < matched.length; i++) {
    for (let j = i + 1; j < matched.length; j++) {
      const a = matched[i];
      const b = matched[j];
      if (!a.match || !b.match) continue;

      // Object identity: both must point at the same repair row instance.
      // This works because repair rows are never copied. Normalising or
      // round-tripping them would break clustering silently, with no error.
      // No wording requirement, by the owner's decision: corrections measured
      // against one row share its ceiling, so they are always summed — a
      // differently worded one that landed there is exactly the case that
      // should still be able to warn.
      const sameRow = a.match === b.match;

      // No wording-similarity requirement here on purpose: "opbouwen en
      // afbreken" and "huur per week" read nothing alike, and are correctly
      // matched to two DIFFERENT rolsteiger rows — what makes them belong
      // together is that those two rows are summed into one ceiling, not
      // that the corrections sound the same.
      const sameGroup = sameMatchGroup(a.matchGroup, b.matchGroup);

      if (sameRow || sameGroup) clusters.union(i, j);
    }
  }

  const members = new Map();
  matched.forEach((correction, i) => {
    if (!correction.match) return;
    const root = clusters.find(i);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(i);
  });

  const enriched = matched.map((correction) => ({
    ...correction,
    cumulativeTotal: null,
    cumulativeExceeds: false,
    cumulativeMembers: null
  }));

  for (const indices of members.values()) {
    if (indices.length < 2) continue;

    const total = indices.reduce((sum, i) => sum + matched[i].amount, 0);

    // Attach the warning to the first member not already flagged on its own.
    // If every member is individually too high, a cluster warning adds nothing.
    const reporter = indices.find((i) => !matched[i].exceedsMatch);
    if (reporter == null) continue;
    if (total <= matched[reporter].matchGroupTotal + AMOUNT_EPSILON) continue;

    enriched[reporter].cumulativeExceeds = true;
    enriched[reporter].cumulativeTotal = total;
    enriched[reporter].cumulativeMembers = indices.map((i) => ({
      description: matched[i].description,
      matchText: matched[i].matchText,
      amount: matched[i].amount
    }));

    // Mark every member so the summary does not also count them as "within
    // budget", which would read as a contradiction.
    for (const i of indices) enriched[i].inReportedCluster = true;
  }

  return enriched;
}

export { MATCH_THRESHOLD, KEYWORD_SCORE_FLOOR };
