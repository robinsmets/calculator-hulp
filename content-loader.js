/*
 * Content script entry point.
 *
 * A classic script, not a module — MV3 content scripts cannot use static
 * imports — so it dynamically imports the real entry point. Everything under
 * src/ is listed in web_accessible_resources, which is what makes that import
 * permitted at all.
 *
 * The try/catch is not decoration. chrome.runtime.getURL throws SYNCHRONOUSLY
 * in an orphaned frame — the state a tab is left in after the extension is
 * reloaded while the page stays open — so a promise .catch never sees it. Both
 * paths are needed.
 */

try {
  import(chrome.runtime.getURL("src/content.js")).catch((err) => {
    console.error("[Calculator-hulp] kon modules niet laden:", err);
  });
} catch (err) {
  console.error(
    "[Calculator-hulp] extensie-context ongeldig — herlaad dit tabblad:", err);
}
