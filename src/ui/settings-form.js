/**
 * Builds the settings controls on the options and popup pages.
 *
 * Generated from the schema so a new setting appears everywhere it should
 * without touching five files. The surrounding page — headings, explanatory
 * prose, the link between pages — stays hand-written HTML, because that is
 * copy, not structure.
 *
 * No inline event handlers anywhere: the extension CSP forbids them, and the
 * symptom is a control that simply does nothing. One delegated listener.
 */

import { settingsFor, groupsFor } from "../config/settings-schema.js";

const CONTROL_TEMPLATES = {
  boolean: "components/form/checkbox",
  text: "components/form/text",
  select: "components/form/select"
};

function renderControl(templates, setting, surface, settings) {
  const id = `setting-${setting.key}`;
  const label = setting.labels[surface];
  const value = settings[setting.key];

  if (setting.type === "select") {
    return templates.render(CONTROL_TEMPLATES.select, {
      id, key: setting.key, label,
      options: setting.options.map((option) =>
        templates.render("components/form/select-option", option)).join("")
    });
  }

  if (setting.type === "boolean") {
    return templates.render(CONTROL_TEMPLATES.boolean, { id, key: setting.key, label });
  }

  return templates.render(CONTROL_TEMPLATES.text, {
    id, key: setting.key, label,
    value: setting.serialize ? setting.serialize(value) : (value ?? "")
  });
}

/**
 * @param {object} templates
 * @param {"options"|"popup"} surface
 * @param {object} settings
 * @param {{withGroups?: boolean, withHints?: boolean, p3?: boolean}} [options]
 *   p3: the P3 build, which also shows the settings marked p3Only
 * @returns {string}
 */
export function renderSettingsForm(templates, surface, settings, options = {}) {
  const { withGroups = false, withHints = false, p3 = false } = options;

  const renderOne = (setting) => {
    const control = renderControl(templates, setting, surface, settings);
    const hint = withHints && setting.hint
      ? templates.render("components/form/hint", { text: setting.hint })
      : "";
    return control + hint;
  };

  if (!withGroups) return settingsFor(surface, { p3 }).map(renderOne).join("");

  return groupsFor(surface).map((group) => templates.render("components/form/group", {
    title: group.title,
    settings: group.settings.map(renderOne).join("")
  })).join("");
}

/**
 * Reflects stored values into the rendered controls.
 *
 * Called on load AND whenever storage changes elsewhere — the panel's own
 * toggles write the same settings, so without this an open popup would show
 * the state from before the click and look broken.
 *
 * Skips whichever control currently has focus. Without that, a completely
 * unrelated write anywhere else (a toggle in the panel on an open
 * calculatie-tab, the popup, even this same page's own save) fires
 * chrome.storage.onChanged, which this function reacts to by resetting EVERY
 * control to what is in storage — including a text field the owner is mid-
 * typing into, whose keystrokes are not in storage yet. It looks like
 * whatever was just typed instantly vanishes.
 */
export function applySettingsToForm(root, settings) {
  const active = root.ownerDocument.activeElement;

  for (const control of root.querySelectorAll("[data-setting]")) {
    if (control === active) continue;

    const setting = SETTING_BY_KEY[control.dataset.setting];
    if (!setting) continue;

    const value = settings[setting.key];
    if (setting.type === "boolean") control.checked = !!value;
    else if (setting.type === "select") control.value = value ?? setting.options[0].value;
    else control.value = setting.serialize ? setting.serialize(value) : (value ?? "");
  }
}

/**
 * Wires the controls up.
 *
 * @param {HTMLElement} root
 * @param {(patch: object) => void} onChange
 * @param {"change"|"submit"} mode  "change" saves immediately; "submit" waits
 *                                  for an explicit save
 */
export function bindSettingsForm(root, onChange, mode = "change") {
  const readControl = (control) => {
    const setting = SETTING_BY_KEY[control.dataset.setting];
    if (!setting) return null;

    const raw = setting.type === "boolean" ? control.checked : control.value;
    return { [setting.key]: setting.parse ? setting.parse(raw) : raw };
  };

  if (mode === "change") {
    root.addEventListener("change", (event) => {
      const control = event.target.closest("[data-setting]");
      if (!control) return;
      const patch = readControl(control);
      if (patch) onChange(patch);
    });
    return () => {};
  }

  // Explicit save: collect everything at once.
  return () => {
    let patch = {};
    for (const control of root.querySelectorAll("[data-setting]")) {
      Object.assign(patch, readControl(control) || {});
    }
    onChange(patch);
  };
}

const SETTING_BY_KEY = Object.fromEntries(
  [...settingsFor("options"), ...settingsFor("popup", { p3: true })].map((s) => [s.key, s]));
