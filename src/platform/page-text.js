/**
 * Extracts page text INCLUDING form control values.
 *
 * `innerText` cannot see what a user has typed into an input, and correction
 * descriptions live in exactly such inputs. So this walks the document and
 * splices control values back in at their position in the flow.
 *
 * Deliberately simpler than a browser's innerText, and the simplifications
 * have consequences that are load-bearing for the row grammar downstream:
 *
 *   - script, style and hidden content ARE included, unlike innerText
 *   - a textarea's contents appear twice: once as the element's value, once as
 *     the text node the walk then descends into
 *   - a select contributes every option, not only the selected one, which with
 *     bare codes in the dropdown can fabricate a whole phantom repair row
 *
 * All three are reproduced. They are queued as deliberate fixes, not swept up
 * in a rename.
 */

/**
 * Tag names that introduce a line break.
 *
 * THESE MUST STAY UPPERCASE. `tagName` reports uppercase for HTML elements, so
 * "modernising" this to a lowercase comparison makes every check fail — no
 * newlines are emitted, the row grammar matches nothing, and the correction
 * check silently returns an empty list while the panel still renders. This is
 * the single highest-probability silent failure in the codebase.
 *
 * Note this list is deliberately shorter than the one a browser uses for
 * innerText. The two text streams genuinely differ, and several pinned
 * behaviours depend on that difference.
 */
const LINE_BREAK_TAGS = new Set(["BR", "TR", "TD", "TH", "DIV", "P", "LI"]);

const VALUE_TAGS = new Set(["INPUT", "TEXTAREA"]);

/**
 * @param {Node} root usually document.body
 * @param {Document} [doc] the document to build the walker from
 * @returns {string}
 */
export function extractTextWithInputValues(root, doc = document) {
  const parts = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);

  let node = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue;
      if (text && text.trim()) parts.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;

      if (VALUE_TAGS.has(tag)) {
        if (node.value) parts.push(node.value);
        parts.push("\n");
      } else if (tag === "SELECT") {
        const option = node.options && node.options[node.selectedIndex];
        if (option) parts.push(option.text || option.value || "");
        parts.push("\n");
      } else if (LINE_BREAK_TAGS.has(tag)) {
        parts.push("\n");
      }
    }
    node = walker.nextNode();
  }

  // Joined on newlines and then collapsed, so an explicit separator and a
  // structural one become indistinguishable. The row grammar depends on this
  // collapsing; joining on "" instead would change everything downstream.
  return parts.join("\n").replace(/\n{2,}/g, "\n").trim();
}

export { LINE_BREAK_TAGS };
