/**
 * A very small template engine, so markup lives in .html files and never
 * inside JavaScript.
 *
 * One template per file, under templates/. The file IS the fragment: no
 * wrapper element, no ceremony, and the filename is the template name. Each
 * one opens in any editor as ordinary HTML.
 *
 * Two placeholder forms, deliberately unalike so they cannot be confused at a
 * glance:
 *
 *   {{name}}   a VALUE. Always HTML-escaped. Correction descriptions are typed
 *              by the user and wall names arrive over postMessage, so escaping
 *              is not optional.
 *   [name]     a SLOT, filled with markup this engine already produced. Never
 *              with anything derived from page content.
 *
 * Curly braces read as "substitute a value here"; square brackets read as
 * "another template goes here". Which is the point — the two are different
 * operations with very different safety properties, and they should not look
 * alike.
 *
 * A missing placeholder throws rather than rendering an empty string. A silent
 * blank in a panel of numbers is worse than a loud failure.
 *
 * Whitespace is preserved exactly as written, minus the single trailing
 * newline every text file ends with. So the bytes in the file are the bytes
 * that render, which makes the output reviewable by reading the template
 * rather than by running it.
 */

const VALUE_PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;
const SLOT_PLACEHOLDER = /\[([a-zA-Z][\w.]*)\]/g;

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Drops the single trailing newline a text file ends with. Nothing else. */
function trimFinalNewline(body) {
  return body.replace(/\n$/, "");
}

/** Resolves "a.b" against an object. */
function lookup(data, path) {
  return path.split(".").reduce(
    (value, key) => (value == null ? undefined : value[key]), data);
}

/**
 * Builds a renderer from name -> file contents.
 *
 * @param {Record<string, string>|Map<string, string>} sources
 * @param {string} [label] used in error messages
 */
export function createTemplates(sources, label = "templates") {
  const entries = sources instanceof Map ? [...sources] : Object.entries(sources);
  const blocks = new Map(entries.map(([name, body]) => [name, trimFinalNewline(body)]));

  if (!blocks.size) throw new Error(`${label}: no templates supplied`);

  /**
   * @param {string} id
   * @param {Record<string, unknown>} [data]
   * @returns {string}
   */
  function render(id, data = {}) {
    const body = blocks.get(id);
    if (body === undefined) {
      throw new Error(`${label}: no template "${id}" (have: ${[...blocks.keys()].join(", ")})`);
    }

    return body
      .replace(SLOT_PLACEHOLDER, (whole, path) => {
        const value = lookup(data, path);
        if (value === undefined) throw new Error(`${label}: "${id}" is missing slot [${path}]`);
        return value === null ? "" : String(value);
      })
      .replace(VALUE_PLACEHOLDER, (whole, path) => {
        const value = lookup(data, path);
        if (value === undefined) throw new Error(`${label}: "${id}" is missing {{${path}}}`);
        return value === null ? "" : escapeHtml(value);
      });
  }

  return {
    render,
    has: (id) => blocks.has(id),
    ids: () => [...blocks.keys()]
  };
}

/**
 * Loads the template files inside the extension.
 *
 * There is no HTML equivalent of a CSS module import — that proposal never
 * shipped — so they are fetched. Fetched once at startup, in parallel, and
 * covered by the extension's web-accessible resources.
 *
 * @param {string[]} names
 * @param {string} dir relative to the extension root
 * @returns {Promise<ReturnType<createTemplates>>}
 */
export async function loadTemplates(names, dir) {
  const sources = await Promise.all(names.map(async (name) => {
    const url = chrome.runtime.getURL(`${dir}/${name}.html`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`could not load ${name}.html: ${response.status}`);
    return [name, await response.text()];
  }));
  return createTemplates(Object.fromEntries(sources), dir);
}
