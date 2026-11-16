/**
 * Composition root.
 *
 * The only file with side effects. Everything else is a function or a factory
 * that can be called in isolation, which is what makes the rest of the
 * codebase testable without a browser.
 *
 * The frame arrangement, which is the least obvious part: the page may be
 * split across frames, so EVERY frame analyses but only the top one draws.
 * Otherwise each frame paints its own panel over the others. Sub-frames post
 * their result upwards.
 */

import { analyzePage, hasVisibleContent } from "./analysis.js";
import { deriveCacheEntry, addToCache, findCaseId } from "./core/address.js";
import { MIXED_VAT_SITUATION } from "./core/vat-check.js";
import { hasBouwdelenSection } from "./core/controle-parts.js";
import { renderPanel } from "./ui/panel-view.js";
import { createPanel } from "./ui/panel-element.js";
import { loadTemplates } from "./ui/template.js";
import { TEMPLATE_NAMES, TEMPLATE_DIR, STYLESHEET } from "./ui/templates/manifest.js";
import { extractTextWithInputValues } from "./platform/page-text.js";
import {
  regionElements, regionText, tableElements, findRegions, findControleRegions
} from "./platform/page-regions.js";
import { isRelevantPage, isControlePage, isTopFrame } from "./platform/page-context.js";
import { createScheduler } from "./platform/scheduler.js";
import { publishToTopFrame, listenForChildResults } from "./platform/frame-bridge.js";
import { read, update, readChange, removeStoredCaseData, STORAGE_KEY } from "./platform/storage.js";
import { debug, error } from "./platform/log.js";
import { P3 } from "./platform/build-flavour.js";

async function start() {
  const area = chrome.storage.local;

  const [templates, stylesheet, initialSettings] = await Promise.all([
    loadTemplates(TEMPLATE_NAMES, TEMPLATE_DIR),
    fetch(chrome.runtime.getURL(STYLESHEET)).then((r) => r.text()),
    read(area)
  ]);

  // Only the top frame, so a page full of frames does not all race it.
  if (isTopFrame()) {
    removeStoredCaseData(area)
      .then((removed) => { if (removed) debug("removed addresses stored by an older version"); })
      .catch((err) => error("could not remove old stored addresses:", err));
  }

  let settings = initialSettings;
  let childResult = null;
  let childResultPath = null;

  // The address of the case being worked on, for the calculation page to
  // find (see cacheAddress). Kept in memory only, never in chrome.storage:
  // the owner does not want case data to outlive the tab, or to still be
  // there after moving to another case or restarting the browser.
  let addressCache = {};

  // The P3 build's VAT situation. It belongs to the case on screen, so it is
  // kept in memory only and goes back to 9-21% whenever another case is
  // opened: the owner does not want a 0% or 21% choice carried over by mistake.
  let vatSituation = MIXED_VAT_SITUATION;
  let vatSituationCase = null;

  const top = isTopFrame();
  debug("loaded on", location.href, "top:", top, "relevant:", isRelevantPage(location.pathname));

  const panel = top ? createPanel({
    stylesheet,
    getSettings: () => settings,
    onSettingsChange: (patch) => {
      settings = { ...settings, ...patch };
      update(area, settings, patch).catch((err) => error("could not save settings:", err));
      scheduler.schedule();
    },
    onVatSituationChange: (situation) => {
      vatSituation = situation;
      scheduler.schedule();
    }
  }) : null;

  if (panel) panel.removeStalePanels();

  /**
   * The parts of the page this tool reads, and their text: only the regions
   * in page-regions.js, never the whole page. The two tools are laid out
   * differently, so each has its own set.
   */
  function readPage() {
    if (!document.body) return { text: "", tables: [] };
    const find = isControlePage(location.pathname) ? findControleRegions : findRegions;
    const elements = regionElements(document.body, debug, find);
    return { text: regionText(elements), tables: tableElements(elements) };
  }

  /** Builds the analysis context. formText is lazy: it walks the tables. */
  function buildContext(page) {
    let formText = null;
    return {
      pageText: page.text,
      get formText() {
        if (formText === null) {
          formText = page.tables.map((table) => extractTextWithInputValues(table)).join("\n");
        }
        return formText;
      },
      // Decides which wall-section parser analysis.js uses. URL-based, not
      // sniffed from page text: "Bouwdelen" is not as unique to the
      // Controletool's layout as assumed — it showed up somewhere on a
      // Calculatietool page too, which silently zeroed out every wall there.
      isControlePage: isControlePage(location.pathname),
      settings,
      p3: P3,
      addressCache,
      log: debug
    };
  }

  /**
   * Every page of a case is checked, not just the calculation page — the
   * calculation page rarely carries the address, but other pages of the same
   * case do.
   */
  function cacheAddress(pageText) {
    const entry = deriveCacheEntry(pageText, addressCache);
    if (!entry) return;

    addressCache = addToCache(addressCache, entry.caseId, entry.address);
    debug("cached address for", entry.caseId, entry.address);
  }

  function update_() {
    // The master on/off switch, from the extension's popup. Checked first and
    // does as close to nothing as an "off" switch should: no address caching,
    // no analysis, no publishing from a sub-frame — just remove the panel if
    // one is already there.
    if (!settings.enabled) {
      if (panel) panel.remove();
      return;
    }

    const page = readPage();
    cacheAddress(page.text);

    const caseId = findCaseId(page.text);
    if (caseId && caseId !== vatSituationCase) {
      vatSituationCase = caseId;
      vatSituation = MIXED_VAT_SITUATION;
    }

    const relevant = isRelevantPage(location.pathname);

    if (!top) {
      if (!relevant) return;
      const result = analyzePage(buildContext(page));
      if (hasVisibleContent(result, settings)) publishToTopFrame(result);
      return;
    }

    if (!relevant) {
      panel.remove();
      return;
    }

    // A child's result describes the room that was open when it was sent. This
    // is a single-page app, so navigating to another room does not reload
    // anything — without this the panel would keep showing the previous room's
    // figures indefinitely.
    if (childResultPath !== null && childResultPath !== location.pathname) {
      childResult = null;
      childResultPath = null;
    }

    const own = analyzePage(buildContext(page));

    // Own result wins when it has anything; otherwise adopt a child's. Whole
    // results, never merged field by field — two frames describing the same
    // room would otherwise produce a blend belonging to neither.
    const result = hasVisibleContent(own, settings) ? own : (childResult || own);

    // Both tools embed a read-only "Ruimte informatie / Schadeoverzicht /
    // Herstelwerkzaamheden" reference widget on their room pages, with its
    // own internal tabs that do not change the url isRelevantPage checks
    // above. This tool has nothing to do with the OTHER two tabs, so the
    // panel hides there UNCONDITIONALLY — even when the room otherwise has a
    // repair total or an active correction finding, neither of which is
    // reason enough on that tab. Own wall/gevel data still wins over this: a
    // genuine Wand/Gevel block found on the page is never second-guessed by
    // which tab an unrelated reference widget shows.
    //
    // This IS the whole visibility rule now — deliberately not ALSO folded
    // under hasVisibleContent. That was tried and reverted: it hid the panel
    // even on the widget's own "Ruimte informatie" tab whenever a room's
    // Bouwdelen table was otherwise empty (no walls, no corrections), which
    // the owner does not want — "Bouwdelen" present must always be enough.
    if (result.wallCount === 0 && !hasBouwdelenSection(page.text)) {
      panel.remove();
      return;
    }

    // Rendering mutates the observed tree, so it must not schedule itself.
    scheduler.withoutTriggering(() => {
      panel.render(renderPanel(result, {
        settings, now: new Date(), templates, p3: P3, vatSituation
      }));
      panel.applyZoom();
      panel.applyPosition();
    });
  }

  /**
   * An unexpected failure must never leave the panel silently gone — that
   * looks like the whole tool is broken. The previous contents stay put and
   * the reason lands in the console, where the panel itself tells the user to
   * look.
   */
  function safeUpdate() {
    try {
      update_();
    } catch (err) {
      error("unexpected failure during render, panel not updated:", err);
    }
  }

  const scheduler = createScheduler(safeUpdate);

  if (top) {
    listenForChildResults((result, from) => {
      debug("result received from sub-frame:", from, result);
      childResult = result;
      childResultPath = location.pathname;
      safeUpdate();
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const change = readChange(changes);
    if (!change) return;

    settings = change.settings;
    debug("settings updated:", settings);

    if (panel) {
      panel.applyZoom();
      panel.applyPosition();
    }
    scheduler.schedule();
  });

  scheduler.schedule();
  scheduler.observe(document.documentElement);
}

start().catch((err) => error("could not start:", err));

export { STORAGE_KEY };
