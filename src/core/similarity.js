/**
 * Text similarity, used to match a free-text correction against the repair row
 * it belongs to.
 *
 * The correction wording is typed by the user and never matches a repair row
 * literally, so this is a heuristic. The panel says so, and shows its working.
 */

import { DEFAULT_TREFWOORDEN } from "../../config.js";

/**
 * Words carrying no trade meaning.
 *
 * `binnen` and `buiten` are in here for a specific reason. As standalone words
 * ("Sauswerk wanden binnen") they are generic location adverbs, and the
 * substring rule below would otherwise let "binnen" match anything starting
 * with it — "binnenplafonds", say — even when the correction is not about a
 * ceiling at all. As part of a compound ("binnenwanden") they still count,
 * because that is a single token.
 */
const STOPWOORDEN = new Set([
  "de", "het", "een", "en", "van", "voor", "op", "in", "incl", "inclusief",
  "aan", "met", "bij", "tot", "of", "als", "is", "te", "ter", "binnen", "buiten"
]);

/** Tokens shorter than this carry too little signal. */
const MIN_TOKEN_LENGTH = 3;

/**
 * Minimum length for the substring rule below. Shorter fragments match far too
 * much.
 */
const MIN_SUBSTRING_LENGTH = 4;

/**
 * Characters kept when tokenising.
 *
 * The accent allowlist is partial: é ë ï ö ü á à â survive, but è and ê do
 * not, so "crème" and "enquête" get shredded mid-word. Preserved.
 *
 * `\w` includes digits, so dates and damage numbers become tokens and can
 * contribute real overlap between two otherwise unrelated corrections.
 */
const TOKEN_SPLIT_PATTERN = /[^\wéëïöüáàâ ]+/g;

/**
 * @param {string} str
 * @returns {string[]}
 */
export function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .replace(TOKEN_SPLIT_PATTERN, " ")
    .split(/\s+/)
    .filter((token) => token.length > MIN_TOKEN_LENGTH - 1 && !STOPWOORDEN.has(token));
}

/**
 * Collapses the stuc family to a common stem, because stucwerk, stucen and
 * stucadoor are the same trade.
 *
 * `stucloper` is deliberately excluded: it is a protective covering, not
 * plastering.
 *
 * The separation now holds all the way through: {@link similarity} will not
 * substring-match a stemmed token, so "stuc" no longer matches "stucloper".
 * In the original it did, which the owner ran into in practice — a stucloper
 * correction could be matched against a stucwerk row and the other way round.
 *
 * @param {string} token
 * @returns {string}
 */
export function stemToken(token) {
  if (/^stuc/.test(token) && !/^stucloper/.test(token)) return "stuc";
  return token;
}

/**
 * Overlap between two phrases, with some latitude for compound words.
 *
 * The share of the SHORTER phrase's words that the longer one contains, each
 * word counted once, so it runs from 0 to 1. It used to count every word of
 * the first phrase against the second, repeats included: the owner hit a long
 * correction saying "wand" twice scoring 1.0 against the two-word "Sauswerk
 * wanden" — above the 0.75 a shared trade term earns — with no "sauswerk" in
 * it at all. He ruled that a word repeated in a line counts once.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function similarity(a, b) {
  const tokensA = uniqueTokens(a);
  const tokensB = uniqueTokens(b);
  if (!tokensA.length || !tokensB.length) return 0;

  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const overlap = shorter.filter((token) => longer.some((other) => tokensMatch(token, other))).length;

  return overlap / shorter.length;
}

/** A token, plus whether stemming actually shortened it. */
function uniqueTokens(text) {
  return [...new Set(tokenize(text))].map(withStem);
}

function withStem(token) {
  const stem = stemToken(token);
  return { value: stem, isStem: stem !== token };
}

/**
 * Whether two tokens count as the same word.
 *
 * Compound words match their parts — "binnenwanden" counts for "wanden" — which
 * is what the substring rule is for.
 *
 * But a STEM only ever matches exactly. Without that, "stucwerk" stems to
 * "stuc", which is a substring of "stucloper", and the two trades are treated
 * as one — undoing the separation stemToken exists to make.
 */
function tokensMatch(a, b) {
  if (a.value === b.value) return true;
  if (a.isStem || b.isStem) return false;

  const singularA = singular(a.value);
  const singularB = singular(b.value);
  return a.value.length >= MIN_SUBSTRING_LENGTH &&
         b.value.length >= MIN_SUBSTRING_LENGTH &&
         (singularA.includes(singularB) || singularB.includes(singularA));
}

/**
 * A Dutch word with its plural ending dropped and doubled vowels made single,
 * so singular and plural compare equal: "plafondarmatuur" and
 * "plafondarmaturen" both become "plafondarmatur", "muur" and "muren" "mur".
 * The owner hit "De- hermonteren plafondarmatuur" scoring no better against
 * "De- en hermonteren plafondarmaturen/spots" than against "Plafond
 * uitvlakken/ stucen", which won the tie on "plafond" alone.
 */
function singular(word) {
  return word.replace(/(?:en|s)$/, "").replace(/([aeou])\1/g, "$1");
}

/**
 * Whether a trade term is present in a text.
 *
 * A literal substring counts, which is how "wand" is found in "binnenwanden".
 * So does a word from the same stemmed trade family, and that is the part that
 * was missing: the keyword list says "stucwerk", a real repair row says
 * "stucen". Both are the stuc trade, {@link stemToken} has always said so and
 * {@link similarity} has always scored them as a match — but this search did
 * not, so the strongest evidence that a correction and a row concern the same
 * trade was invisible at exactly the point where it picks the ceiling.
 *
 * The owner hit it. "Overzetten stucwerk wanden" was measured against
 * "Sauswerk wanden" rather than "Wand uitvlakken/ stucen", because once stuc
 * went unseen the only term the two literally shared was "wand".
 *
 * The stuc/stucloper separation survives untouched: stemToken leaves
 * "stucloper" alone, so it stems to itself and never meets "stuc". And a term
 * that is not stemmed at all — every term but the stuc family — still matches
 * literally and only literally.
 */
export function keywordPresent(text, word) {
  const lower = (text || "").toLowerCase();
  if (lower.includes(word)) return true;

  const stem = stemToken(word);
  if (stem === word) return false;

  return tokenize(lower).some((token) => stemToken(token) === stem);
}

/**
 * The first configured trade term present in both texts.
 *
 * FIRST, not best — which is why the keyword list is ordered most-specific-first.
 * The choice made here decides the ceiling a correction is measured against,
 * and therefore whether the panel warns at all.
 *
 * @param {string} a
 * @param {string} b
 * @param {string[]} trefwoorden
 * @returns {string|null}
 */
export function findSharedKeyword(a, b, trefwoorden) {
  return trefwoorden.find((word) => keywordPresent(a, word) && keywordPresent(b, word)) || null;
}

/**
 * Resolves the keyword list to use, falling back to the defaults for both null
 * and an empty array.
 *
 * @param {string[]|null|undefined} configured
 * @returns {string[]}
 */
export function resolveKeywords(configured) {
  return configured && configured.length ? configured : DEFAULT_TREFWOORDEN;
}

export { STOPWOORDEN };
