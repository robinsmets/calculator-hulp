/**
 * Passing results between frames.
 *
 * The calculation page may be split across frames — an embedded sub-app. Every
 * frame computes, but only the top one draws, otherwise each would paint its
 * own panel on top of the others. Sub-frames post their result upwards.
 *
 * The message type is versioned. That is not decoration: on an extension
 * reload, Chrome does not re-inject content scripts into open tabs, so the top
 * frame keeps running the old build while the next frame to navigate gets the
 * new one. With a shared message type, an old frame's result reaches new code
 * that expects different field names, slips past both defensive branches, and
 * throws on a missing number — caught by the safety net, leaving the panel
 * frozen with no visible cause.
 *
 * Versioning turns that into a clean no-op: mismatched frames ignore each
 * other and the top frame renders its own honest placeholder instead.
 */

const MESSAGE_TYPE = "PSH_RESULT_2";
const PROTOCOL_VERSION = 2;

/**
 * Fields that must never leave this frame.
 *
 * `debugText` was the entire page text including every form control value,
 * kept for a debug copy button. Both are gone, but a frame still running an
 * older build (Chrome does not re-inject on reload) can produce it, and
 * broadcasting it to the parent frame would be a considerable overshare: the
 * send is not yet origin-restricted.
 */
const LOCAL_ONLY_FIELDS = ["debugText"];

function stripLocalFields(result) {
  const copy = { ...result };
  for (const field of LOCAL_ONLY_FIELDS) delete copy[field];
  return copy;
}

/**
 * Sends a result to the top frame.
 *
 * @param {object} result
 * @param {object} [deps]
 */
export function publishToTopFrame(result, deps = {}) {
  const win = deps.window || window;
  const origin = deps.origin || location.origin;

  win.top.postMessage({
    type: MESSAGE_TYPE,
    v: PROTOCOL_VERSION,
    result: stripLocalFields(result),
    from: (deps.location || location).href
  // Restricting the target origin means the browser drops the message when
  // the top frame is on a different origin, rather than handing over case
  // data. A wildcard here would publish it to whatever page embeds us.
  }, origin);
}

/**
 * Whether an incoming message is a result we should accept.
 *
 * @param {MessageEvent} event
 * @param {string} expectedOrigin
 * @returns {boolean}
 */
export function isAcceptableResult(event, expectedOrigin) {
  if (!event || event.origin !== expectedOrigin) return false;

  const data = event.data;
  if (!data || data.type !== MESSAGE_TYPE) return false;
  if (data.v !== PROTOCOL_VERSION) return false;

  // Shape guard: a result that cannot be rendered is worse than none, because
  // it would replace a working panel with a frozen one.
  const result = data.result;
  return !!result && typeof result === "object" && typeof result.wallCount === "number";
}

/**
 * Listens for results from sub-frames.
 *
 * @param {(result: object, from: string) => void} onResult
 * @param {object} [deps]
 * @returns {() => void} removes the listener
 */
export function listenForChildResults(onResult, deps = {}) {
  const win = deps.window || window;
  const expectedOrigin = deps.origin || location.origin;

  const handler = (event) => {
    if (!isAcceptableResult(event, expectedOrigin)) return;
    onResult(event.data.result, event.data.from);
  };

  win.addEventListener("message", handler);
  return () => win.removeEventListener("message", handler);
}

export { MESSAGE_TYPE, PROTOCOL_VERSION, LOCAL_ONLY_FIELDS, stripLocalFields };
