/**
 * Decides when to re-analyse the page.
 *
 * The page is a single-page app that rewrites itself without navigating, so
 * there is no load event to hang off. Three triggers, each covering what the
 * others miss:
 *
 *   mutations  the usual case — the user edits a row and the panel follows
 *   interval   a safety net for changes the observer cannot see, and the retry
 *              that makes the cross-frame handoff reliable
 *   explicit   after settings change
 *
 * The interval is NOT merely about freshness. A sub-frame's first result can
 * arrive before the top frame is listening; the interval is what makes that
 * self-correct. Removing it as redundant would turn a benign race into a
 * permanent silent drop.
 */

const DEBOUNCE_MS = 400;
const POLL_MS = 4000;

/**
 * @param {() => void} run
 * @param {object} [deps]
 * @returns {{schedule: () => void, observe: (root: Node) => void, stop: () => void}}
 */
export function createScheduler(run, deps = {}) {
  const win = deps.window || globalThis;
  const debounceMs = deps.debounceMs ?? DEBOUNCE_MS;
  const pollMs = deps.pollMs ?? POLL_MS;

  let timer = null;
  let interval = null;
  let observer = null;
  let suspended = false;

  function schedule() {
    if (suspended) return;
    win.clearTimeout(timer);
    timer = win.setTimeout(run, debounceMs);
  }

  return {
    schedule,

    /**
     * Watches for page changes.
     *
     * `suspended` exists because the panel lives inside the observed tree.
     * Without it, every render would mutate the DOM, retrigger the observer,
     * and schedule another render — a loop that never settles and re-parses
     * the whole page several times a second forever.
     */
    observe(root) {
      const MutationObserverImpl = deps.MutationObserver || win.MutationObserver;
      observer = new MutationObserverImpl(() => schedule());
      observer.observe(root, { childList: true, subtree: true, characterData: true });
      interval = win.setInterval(schedule, pollMs);
    },

    /** Runs `fn` without the resulting DOM changes scheduling another pass. */
    withoutTriggering(fn) {
      suspended = true;
      try {
        return fn();
      } finally {
        suspended = false;
      }
    },

    stop() {
      win.clearTimeout(timer);
      win.clearInterval(interval);
      if (observer) observer.disconnect();
    }
  };
}

export { DEBOUNCE_MS, POLL_MS };
