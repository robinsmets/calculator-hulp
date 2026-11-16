/**
 * Reads only the parts of the page the calculations need.
 *
 * The owner does not want the tool reading the whole page, so instead of
 * `document.body.innerText` the parsers are fed the text of a handful of
 * regions he pointed out on a live Calculatietool page:
 *
 *   - the case id: the page heading (`h2.atabix-title`, "S-1234567 | v4")
 *     and the bar at the bottom under "Calculatie tool"
 *   - the "Adres" and "Oppervlakte van de vloer" label/value pairs
 *   - the card holding the "Bouwdelen" heading (walls, Hoogte, Breedte,
 *     Causaal)
 *   - the calculation table (repair rows, "Schades:", corrections, Totaal)
 *
 * The case id goes first on purpose. Correction descriptions in the table
 * name OTHER cases ("CORRECTIE DOSSIER S-7654321 | v1, ..."), and findCaseId
 * takes the first S-number it sees.
 *
 * Labels are found by their exact text rather than by class, because the
 * value divs have no class of their own (the address sits in a bare div),
 * and "atabix-card" is on many cards, so the Bouwdelen card is the one that
 * holds that heading, not merely the first card.
 *
 * A region that is not on the page contributes nothing. That is the point —
 * no falling back to the whole page — but it also means a renamed label on
 * the live site shows up as an empty panel, so each miss is logged.
 */

/** Exact label texts. Page literals: never translate. */
const ADDRESS_LABEL = "Adres";
const FLOOR_AREA_LABEL = "Oppervlakte van de vloer";
const BOUWDELEN_HEADING = "Bouwdelen";

const CASE_ID_SELECTOR = "h2.atabix-title, .atabix-snackbar__content_subtitle";
const CARD_SELECTOR = ".atabix-card";

/**
 * The Controletool's content blocks. The owner found everything the tool
 * needs there (schade rows, Herstel, the calculation table, Totaal) in one
 * of these on a live page.
 */
const VERIFY_CARD_SELECTOR = ".atabix-verify-editor__card-content";

/** Collapses runs of whitespace, non-breaking spaces included. */
function normalise(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

/** The element's own text, leaving out whatever its child elements hold. */
function ownText(el) {
  let text = "";
  for (const node of el.childNodes) if (node.nodeType === 3) text += node.nodeValue;
  return normalise(text);
}

/**
 * Elements whose own text is exactly `text`.
 *
 * Own text rather than textContent: every ancestor of the label "contains"
 * it too. And own text rather than "an element with no children", which was
 * tried first and found nothing on the live site — the real headings carry a
 * child element (an icon or similar) beside their text.
 */
function findByExactText(root, text) {
  const found = [];
  for (const el of root.querySelectorAll("*")) {
    if (ownText(el) === text) found.push(el);
  }
  return found;
}

/**
 * A label together with its value. Usually the label's parent holds both;
 * when the label's text sits directly in the element that also holds the
 * value, that element already is the pair.
 */
function labelledValues(root, label) {
  return findByExactText(root, label)
    .map((el) => (normalise(el.innerText) !== label ? el : el.parentElement))
    .filter(Boolean);
}

function bouwdelenCards(root) {
  return findByExactText(root, BOUWDELEN_HEADING)
    .map((el) => el.closest(CARD_SELECTOR))
    .filter(Boolean);
}

/**
 * The regions, in the order their text is joined.
 *
 * @param {ParentNode} root usually document.body
 * @returns {{name: string, elements: Element[]}[]}
 */
export function findRegions(root) {
  return [
    { name: "case id", elements: [...root.querySelectorAll(CASE_ID_SELECTOR)] },
    { name: ADDRESS_LABEL, elements: labelledValues(root, ADDRESS_LABEL) },
    { name: FLOOR_AREA_LABEL, elements: labelledValues(root, FLOOR_AREA_LABEL) },
    { name: BOUWDELEN_HEADING, elements: bouwdelenCards(root) },
    { name: "calculation table", elements: [...root.querySelectorAll("table")] }
  ];
}

/**
 * A Controletool block together with its own header.
 *
 * The section headings controle-parts.js scopes on (Bouwdelen,
 * Schadeopname, Analyse en beoordeling) may sit in the card's header rather
 * than in its content, so the parent is taken when it wraps this one block
 * only. A parent holding several blocks is the whole editor, so then the
 * block alone is read.
 */
function withHeader(el, root) {
  const parent = el.parentElement;
  if (!parent || parent === root) return el;
  return parent.querySelectorAll(VERIFY_CARD_SELECTOR).length === 1 ? parent : el;
}

/**
 * The Controletool's regions: the case id and every content block.
 *
 * @param {ParentNode} root
 * @returns {{name: string, elements: Element[]}[]}
 */
export function findControleRegions(root) {
  return [
    { name: "case id", elements: [...root.querySelectorAll(CASE_ID_SELECTOR)] },
    {
      name: "Controletool blocks",
      elements: [...root.querySelectorAll(VERIFY_CARD_SELECTOR)].map((el) => withHeader(el, root))
    }
  ];
}

/** Elements nested inside another chosen element would be read twice. */
function outermost(elements) {
  return elements.filter((el) => !elements.some((other) => other !== el && other.contains(el)));
}

/**
 * The chosen regions as one list of elements, each once, in region order.
 *
 * @param {ParentNode} root
 * @param {(...args: unknown[]) => void} [log] told which regions were missing
 * @param {(root: ParentNode) => {name: string, elements: Element[]}[]} [find]
 *   findRegions for the Calculatietool, findControleRegions for the
 *   Controletool
 * @returns {Element[]}
 */
export function regionElements(root, log = () => {}, find = findRegions) {
  const regions = find(root);
  const missing = regions.filter((r) => !r.elements.length).map((r) => r.name);
  if (missing.length) log("not on this page:", missing.join(", "));

  const all = [];
  for (const region of regions) {
    for (const el of region.elements) if (!all.includes(el)) all.push(el);
  }
  return outermost(all);
}

/**
 * The text the parsers read, in place of `document.body.innerText`.
 *
 * @param {Element[]} elements from regionElements
 * @returns {string}
 */
export function regionText(elements) {
  return elements.map((el) => el.innerText).join("\n");
}

/**
 * Only the calculation tables: correction descriptions live in their inputs,
 * and nothing else on the page has any.
 *
 * @param {Element[]} elements from regionElements
 * @returns {Element[]}
 */
export function tableElements(elements) {
  return elements.flatMap((el) =>
    el.tagName === "TABLE" ? [el] : [...el.querySelectorAll("table")]);
}
