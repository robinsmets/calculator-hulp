/**
 * The settings, described once.
 *
 * The original declared each setting in five places — the content script's
 * read, the options page's markup, its load, its save, and the popup's
 * equivalents — and adding one meant editing all of them. Worse, the options
 * page wrote every key on save from whatever it had in memory, so toggling
 * something in the popup while the options tab sat open silently overwrote it.
 *
 * One description, several surfaces. The form generator reads this; so does
 * the storage layer.
 *
 * `label` differs per surface on purpose: the options page describes a
 * default, the popup describes the current state.
 */

import {
  DEFAULT_TRIGGER_CODES, DEFAULT_TREFWOORDEN,
  DEFAULT_VERLAAGD_BTW_TREFWOORDEN, DEFAULT_VERLAAGD_BTW_UITZONDERINGEN
} from "../../config.js";

/** Comma-separated text in, array out. Blank falls back to the default. */
function parseList(raw, fallback, transform) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return fallback;
  const items = trimmed.split(",").map((s) => transform(s.trim())).filter(Boolean);
  return items.length ? items : fallback;
}

export const SETTINGS_SCHEMA = [
  {
    key: "enabled",
    type: "boolean",
    surfaces: ["popup"],
    labels: { popup: "Calculator hulp actief" },
    hint: "Uitzetten laat het paneel nergens meer verschijnen, zonder de extensie te verwijderen."
  },
  {
    key: "triggerCodes",
    type: "text",
    surfaces: ["options"],
    group: "Stucloper/afwerklaag",
    labels: { options: "Triggercodes (komma-gescheiden)" },
    hint: "Reparatiecodes waarvoor de wandbreedte/oppervlakte wordt getoond, bv. B514,B515,B516,B518,G122,B104. Geldt voor zowel de Calculatietool als de Controletool.",
    parse: (raw) => parseList(raw, DEFAULT_TRIGGER_CODES, (s) => s.toUpperCase()),
    serialize: (value) => (value || DEFAULT_TRIGGER_CODES).join(",")
  },
  {
    key: "wallListExpanded",
    type: "boolean",
    surfaces: ["options", "popup"],
    group: "Stucloper/afwerklaag",
    labels: {
      options: "Wand-/gevellijst standaard uitgeklapt tonen",
      popup: "Wand-/gevellijst tonen"
    },
    hint: "Staat uit: de losse wanden/gevels zijn verborgen, alleen het totaal blijft zichtbaar — handig bij een 'Buitenkant gebouw'-pagina met tientallen gevels. Kan ook per dossier aan/uit via 'Alle wanden/gevels tonen' in het paneel zelf."
  },
  {
    key: "parkingEnabled",
    type: "boolean",
    surfaces: ["options", "popup"],
    group: "Parkeeruren",
    labels: {
      options: "Parkeeruren-hulp standaard tonen",
      popup: "Parkeeruren-hulp tonen"
    },
    hint: "Kan ook per dossier aan/uit via het paneel zelf of de extensie-popup. Toont alleen uren, geen bedrag — het tarief verschilt per adres (zie prettigparkeren.nl)."
  },
  {
    key: "correctionCheckEnabled",
    type: "boolean",
    surfaces: ["options", "popup"],
    group: "Correctie-check",
    labels: {
      options: "Correctie-check standaard tonen",
      popup: "Correctie-check tonen"
    },
    hint: "Vergelijkt correctieregels (streepje-code + negatief bedrag + 'correctie' of 'dossier') op tekst-gelijkenis met reparatieregels in dezelfde ruimte en flagt als de correctie hoger is. Matching is best-effort — controleer altijd zelf."
  },
  {
    key: "vatCheckEnabled",
    type: "boolean",
    surfaces: ["popup"],
    // The VAT check is a section of the P3 build only; see features/vat.js.
    p3Only: true,
    labels: { popup: "BTW-check tonen" }
  },
  {
    key: "correctionKeywords",
    type: "text",
    surfaces: ["options"],
    group: "Correctie-check",
    labels: { options: "Vaktermen voor matching (komma-gescheiden)" },
    hint: "Komt zo'n woord in zowel de correctie-omschrijving als een reparatieregel voor, dan telt dat als sterke match (bv. \"stucwerk\" in beide). Vul aan met termen die bij jouw dossiers vaak voorkomen.",
    parse: (raw) => parseList(raw, null, (s) => s.toLowerCase()),
    serialize: (value) => (value || DEFAULT_TREFWOORDEN).join(",")
  },
  {
    key: "verlaagdBtwKeywords",
    type: "text",
    surfaces: ["options"],
    group: "Correctie-check",
    labels: { options: "Kernwoorden verlaagd BTW-tarief (komma-gescheiden)" },
    hint: "Elke correctiepost hoort standaard 21% BTW te hebben. Staat zo'n woord in de omschrijving (bv. \"stuc\", \"saus\"), dan geldt in plaats daarvan het verlaagde tarief van 9%. Klopt het percentage niet, dan waarschuwt de correctie-check — voor alle correcties, niet alleen deze.",
    parse: (raw) => parseList(raw, null, (s) => s.toLowerCase()),
    serialize: (value) => (value || DEFAULT_VERLAAGD_BTW_TREFWOORDEN).join(",")
  },
  {
    key: "verlaagdBtwUitzonderingen",
    type: "text",
    surfaces: ["options"],
    group: "Correctie-check",
    labels: { options: "Uitzonderingen verlaagd BTW-tarief (komma-gescheiden)" },
    hint: "Woorden die zelf geen stuc-/sauswerk zijn, bv. \"stucloper\" en \"afdekken\" (blijven altijd 21%, ook als \"stuc\"/\"saus\" er toevallig ook in de zin staat, zoals \"afdekken bij stucadoorwerk\").",
    parse: (raw) => parseList(raw, null, (s) => s.toLowerCase()),
    serialize: (value) => (value || DEFAULT_VERLAAGD_BTW_UITZONDERINGEN).join(",")
  },
  {
    key: "panelSize",
    type: "select",
    surfaces: ["popup"],
    labels: { popup: "Grootte paneel" },
    // The values are also the persisted ones and the zoom lookup's keys.
    options: [
      { value: "klein", label: "Klein" },
      { value: "normaal", label: "Normaal" },
      { value: "groot", label: "Groot" },
      { value: "extragroot", label: "Extra groot" }
    ]
  }
];

/** Settings shown on a given surface, in declaration order. */
export function settingsFor(surface, { p3 = false } = {}) {
  return SETTINGS_SCHEMA.filter((setting) =>
    setting.surfaces.includes(surface) && (!setting.p3Only || p3));
}

/** Option groups on the options page, in declaration order. */
export function groupsFor(surface) {
  const groups = [];
  for (const setting of settingsFor(surface)) {
    if (!setting.group) continue;
    const existing = groups.find((g) => g.title === setting.group);
    if (existing) existing.settings.push(setting);
    else groups.push({ title: setting.group, settings: [setting] });
  }
  return groups;
}
