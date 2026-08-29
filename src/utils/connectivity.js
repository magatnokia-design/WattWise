/**
 * Telling "you have no data" apart from "I could not ask".
 *
 * Every loading hook in this app used to clear its loading flag inside a
 * `finally` block, which runs whether the fetch succeeded or threw. With no
 * network the fetch throws, the collections stay empty, loading goes false, and
 * each screen renders the empty state it keeps for a genuinely new account. The
 * result was an app that looked freshly installed - no hub linked, no history,
 * no schedules, zero pesos - to a user whose account was full.
 *
 * The distinction that was missing is not "is the phone online". It is "did a
 * load ever actually succeed", which is already knowable at the point the error
 * is caught and needs no new dependency to observe.
 */

/**
 * Error codes that mean the request never reached the backend.
 *
 * `unavailable` is what Firestore raises with no route to the server, and
 * `deadline-exceeded` is what a request that left but was never answered
 * becomes. The auth and functions namespaces prefix their own.
 */
const CONNECTIVITY_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'auth/network-request-failed',
  'auth/timeout',
  'functions/unavailable',
  'functions/deadline-exceeded',
  'storage/retry-limit-exceeded',
]);

/**
 * Substrings that identify a connectivity failure when no code survived.
 *
 * The service modules return `{ success: false, error: error.message }`, so a
 * result that has crossed that boundary has only prose left to go on. Matching
 * on message text is unreliable in general and is used only as a fallback after
 * the code has been checked.
 */
const CONNECTIVITY_PHRASES = [
  'client is offline',
  'could not reach cloud firestore',
  'failed to get document because the client is offline',
  'network request failed',
  'network error',
  'unable to resolve host',
  'connection failed',
  'timeout',
];

const textOf = (value) => (typeof value === 'string' ? value : '').toLowerCase();

/**
 * Whether a failure was the network rather than the request.
 *
 * Accepts an Error, or the `{ success, error, code }` result shape the service
 * modules return, so callers can pass whichever they are holding.
 *
 * @param {Error|{error?: string, code?: string}|null|undefined} failure
 * @returns {boolean} true only when the request did not reach the backend.
 */
export const isConnectivityError = (failure) => {
  if (!failure) return false;

  const code = textOf(failure.code);
  if (code && CONNECTIVITY_CODES.has(code)) return true;

  // A Firestore error carries its code in `code`; some wrappers put the whole
  // "unavailable: ..." string in the message instead.
  const message = textOf(failure.message || failure.error);
  if (!message) return false;

  return CONNECTIVITY_PHRASES.some((phrase) => message.includes(phrase));
};

/**
 * The three states a load can actually be in.
 *
 * `EMPTY` is an assertion - it says the account really does hold nothing - and
 * must only be reached after a load that succeeded. `UNREACHABLE` is the state
 * that used to collapse into it.
 */
export const LOAD_STATE = {
  LOADING: 'loading',
  READY: 'ready',
  UNREACHABLE: 'unreachable',
};

/**
 * Reduce a hook's three flags to one state for a screen to switch on.
 *
 * @param {{isLoading: boolean, hasLoadedOnce: boolean, isUnreachable: boolean}} flags
 * @returns {string} one of LOAD_STATE.
 */
export const resolveLoadState = ({ isLoading, hasLoadedOnce, isUnreachable } = {}) => {
  if (isLoading) return LOAD_STATE.LOADING;
  // Data already in hand outranks a later failure: a listener that drops after
  // a good first load leaves the screen showing what it last knew, which is
  // stale but true, rather than an offline notice over data we still have.
  if (hasLoadedOnce) return LOAD_STATE.READY;
  if (isUnreachable) return LOAD_STATE.UNREACHABLE;
  return LOAD_STATE.READY;
};

/**
 * Whether a service result represents a read that could not be performed.
 *
 * A document that is genuinely absent reports `notFound`, and that is an
 * answer - a new account really does have no outlet documents yet. Anything
 * else that failed is an absence of information, not information.
 */
export const isFailedRead = (result) =>
  !!result && !result.success && !result.notFound;

/**
 * Whether a pair of document reads both failed to happen.
 *
 * `getAllOutlets` reads two documents and used to report `success: true`
 * whatever came back, mapping failures to null. Offline that is a confident
 * claim that the account has no outlets, which the Dashboard draws as "Link
 * your WattWise unit" and Settings as "Not linked".
 */
export const bothReadsFailed = (first, second) =>
  isFailedRead(first) && isFailedRead(second);

/**
 * Whether an empty listener snapshot means "nothing there" or "I don't know".
 *
 * Firestore listeners do not raise an error when the network drops. They go on
 * serving the local cache and set `fromCache` on the snapshot, so an offline
 * cold start delivers an empty snapshot through the SUCCESS path - which is
 * why no error handler ever saw this and every list looked like a new account.
 *
 * Cached data that is not empty is real and worth showing. Only empty AND
 * unconfirmed means the answer has not arrived.
 *
 * @param {number} count Documents in the snapshot.
 * @param {{fromCache?: boolean}} meta Snapshot metadata.
 */
export const isUnconfirmedEmpty = (count, meta) =>
  count === 0 && !!meta?.fromCache;

/**
 * How long a write waits for the server before the UI stops waiting with it.
 *
 * Generous enough to cover a slow connection and a cold Cloud Functions start,
 * short enough that a button does not sit spinning long enough to look broken.
 */
export const WRITE_TIMEOUT_MS = 8000;

/**
 * The result a bounded write reports when the server never answered.
 *
 * `pending: true` is the part callers must not flatten into a plain failure.
 * The write has not been rejected - it is sitting in Firestore's queue.
 */
export const PENDING_WRITE_RESULT = Object.freeze({
  success: false,
  pending: true,
  code: 'unavailable',
  error: 'No connection — the change has not reached the server yet.',
});

/**
 * Put a ceiling on a write that would otherwise wait forever.
 *
 * A Firestore write does not reject when the phone is offline. `setDoc`,
 * `updateDoc`, `addDoc` and `deleteDoc` resolve when the *server* acknowledges,
 * so with no route there the promise simply stays pending: the caller's `await`
 * never returns, and the button spins until the connection comes back. Nothing
 * in the SDK times it out. The one place that already knew this is the
 * push-token cleanup in `authService.logout`, which races the same way.
 *
 * This does not cancel anything. Firestore keeps the write queued and sends it
 * when the connection returns - which is usually what the user wanted - so the
 * result says `pending`, not "failed". Two things follow from that, and both
 * belong in whatever message the caller shows:
 *
 * - The change may well land later, so do not tell the user it did not happen.
 * - This app has no disk cache (`getFirestore` with no persistence), so the
 *   queue lives in memory only. Killing the app drops it.
 *
 * @param {Promise} promise The write in flight.
 * @param {number} [timeoutMs]
 * @returns {Promise<{success: boolean, pending?: boolean, code?: string, error?: string}>}
 */
export const withWriteTimeout = async (promise, timeoutMs = WRITE_TIMEOUT_MS) => {
  let timer = null;

  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(PENDING_WRITE_RESULT), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export default {
  isConnectivityError,
  LOAD_STATE,
  resolveLoadState,
  isFailedRead,
  bothReadsFailed,
  isUnconfirmedEmpty,
  withWriteTimeout,
  WRITE_TIMEOUT_MS,
  PENDING_WRITE_RESULT,
};
