/**
 * The options page.
 *
 * Saves on an explicit button, which is what the original did. Note the fix
 * that comes with generating the form: the page now writes only the settings
 * it actually shows, merged onto whatever is stored at that moment. The
 * original wrote every key from its own in-memory copy, so toggling something
 * in the popup while this tab sat open silently reverted it.
 */

import { read, update } from "../platform/storage.js";
import { loadTemplates } from "../ui/template.js";
import { SETTINGS_FORM_TEMPLATES, TEMPLATE_DIR } from "../ui/templates/manifest.js";
import { renderSettingsForm, applySettingsToForm, bindSettingsForm } from "../ui/settings-form.js";

const CONFIRMATION_MS = 1500;

const area = chrome.storage.local;
const mount = document.querySelector('[data-mount="settings"]');
const savedNotice = document.getElementById("saved");

// So the owner can ask a colleague "welke versie heb je?" and compare against
// what chrome://extensions shows, without either of them opening DevTools.
document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;

const templates = await loadTemplates(SETTINGS_FORM_TEMPLATES, TEMPLATE_DIR);
let settings = await read(area);

mount.innerHTML = renderSettingsForm(templates, "options", settings, {
  withGroups: true,
  withHints: true
});
applySettingsToForm(mount, settings);

const collect = bindSettingsForm(mount, async (patch) => {
  // Re-read first, so this page only overwrites what it is responsible for.
  settings = await update(area, await read(area), patch);
  savedNotice.hidden = false;
  setTimeout(() => { savedNotice.hidden = true; }, CONFIRMATION_MS);
}, "submit");

document.getElementById("save").addEventListener("click", collect);

// The panel's own toggles write the same settings. Without this the page would
// show the state from before that click and look broken.
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local") return;
  settings = await read(area);
  applySettingsToForm(mount, settings);
});
