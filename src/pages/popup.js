/**
 * The browser-action popup.
 *
 * Saves immediately on change — no save button — because it is a quick toggle
 * surface rather than a settings screen.
 */

import { read, update } from "../platform/storage.js";
import { P3 } from "../platform/build-flavour.js";
import { loadTemplates } from "../ui/template.js";
import { SETTINGS_FORM_TEMPLATES, TEMPLATE_DIR } from "../ui/templates/manifest.js";
import { renderSettingsForm, applySettingsToForm, bindSettingsForm } from "../ui/settings-form.js";

const CONFIRMATION_MS = 4000;

const area = chrome.storage.local;
const mount = document.querySelector('[data-mount="settings"]');

// So the owner can ask a colleague "welke versie heb je?" and compare against
// what chrome://extensions shows, without either of them opening DevTools.
document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;

const templates = await loadTemplates(SETTINGS_FORM_TEMPLATES, TEMPLATE_DIR);
let settings = await read(area);

mount.innerHTML = renderSettingsForm(templates, "popup", settings, { p3: P3 });
applySettingsToForm(mount, settings);

bindSettingsForm(mount, async (patch) => {
  settings = await update(area, await read(area), patch);
}, "change");

const confirmation = document.getElementById("reset-confirmation");
document.getElementById("reset-position").addEventListener("click", async () => {
  settings = await update(area, await read(area), { panelPosition: null });
  confirmation.hidden = false;
  setTimeout(() => { confirmation.hidden = true; }, CONFIRMATION_MS);
});

// The panel has its own toggles writing the same settings, so an open popup
// has to follow along or it shows a stale state and looks broken.
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local") return;
  settings = await read(area);
  applySettingsToForm(mount, settings);
});
