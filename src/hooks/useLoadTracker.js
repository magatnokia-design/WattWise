import { useState, useCallback, useRef } from 'react';
import { isConnectivityError, resolveLoadState } from '../utils/connectivity';

/**
 * The loading flags every data hook in this app needs, in one place.
 *
 * A single `loading` boolean cannot express the state the app was actually in
 * when the phone had no route to Firestore: not loading, but holding nothing,
 * and with no idea whether that nothing is the truth. Screens read the empty
 * collection, rendered the empty state written for a brand-new account, and
 * told users with full accounts that they had never linked a hub.
 *
 * `hasLoadedOnce` is the flag that was missing. Only a load that genuinely
 * returned sets it, so an empty state can require it before asserting that the
 * account is empty.
 *
 * Usage:
 *
 *   const load = useLoadTracker();
 *   try {
 *     const result = await service.get(uid);
 *     if (result.success) { apply(result.data); load.succeeded(); }
 *     else load.failed(result);
 *   } catch (error) { load.failed(error); }
 *
 * Note there is no `finally`. That is the point - clearing the flag in a
 * `finally` is what caused this, because `finally` cannot tell the two exits
 * apart.
 *
 * @param {{startLoading?: boolean}} [options] startLoading false for a hook
 *   whose first fetch is deferred behind some other condition.
 */
export const useLoadTracker = ({ startLoading = true } = {}) => {
  const [isLoading, setIsLoading] = useState(startLoading);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isUnreachable, setIsUnreachable] = useState(false);

  // Read by callers that need the current value inside an async closure without
  // re-subscribing an effect on every state change.
  const hasLoadedOnceRef = useRef(false);

  /** A load returned real data. The only thing that permits an empty state. */
  const succeeded = useCallback(() => {
    hasLoadedOnceRef.current = true;
    setHasLoadedOnce(true);
    setIsUnreachable(false);
    setIsLoading(false);
  }, []);

  /**
   * A load did not return.
   *
   * A non-connectivity failure - a permission denial, a malformed document -
   * still ends the loading state, but leaves `hasLoadedOnce` false so nothing
   * downstream claims the account is empty on the strength of a failed read.
   *
   * @param {Error|{error?: string, code?: string}} failure
   */
  const failed = useCallback((failure) => {
    setIsUnreachable(isConnectivityError(failure));
    setIsLoading(false);
  }, []);

  /** Re-entering the loading state for a manual refresh or a new user. */
  const restart = useCallback(() => {
    setIsLoading(true);
    setIsUnreachable(false);
  }, []);

  /**
   * Signing out, or any other case where there is nothing to load and the
   * absence of data is correct rather than unknown.
   */
  const settleEmpty = useCallback(() => {
    hasLoadedOnceRef.current = true;
    setHasLoadedOnce(true);
    setIsUnreachable(false);
    setIsLoading(false);
  }, []);

  return {
    isLoading,
    hasLoadedOnce,
    isUnreachable,
    hasLoadedOnceRef,
    loadState: resolveLoadState({ isLoading, hasLoadedOnce, isUnreachable }),
    succeeded,
    failed,
    restart,
    settleEmpty,
  };
};

/**
 * The same distinction, for a hook that already owns its own `loading` flag.
 *
 * Most of the data hooks in this app predate `useLoadTracker` and manage
 * `loading` themselves, often across several fetchers that share it. Swapping
 * that out wholesale would be a large change to code that works; this adds only
 * the missing half - whether a read has ever landed - and leaves the existing
 * loading flag alone.
 *
 * `showEmptyState` is the value worth reading at the call site. An empty state
 * asserts something about the account, so it is gated on a read that returned;
 * everything else falls through to `showOfflineState`.
 */
export const useLoadOutcome = () => {
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isUnreachable, setIsUnreachable] = useState(false);

  const succeeded = useCallback(() => {
    setHasLoadedOnce(true);
    setIsUnreachable(false);
  }, []);

  const failed = useCallback((failure) => {
    setIsUnreachable(isConnectivityError(failure));
  }, []);

  /** For a sign-out, or a switch of user, where nothing read so far applies. */
  const reset = useCallback(() => {
    setHasLoadedOnce(false);
    setIsUnreachable(false);
  }, []);

  return {
    hasLoadedOnce,
    isUnreachable,
    succeeded,
    failed,
    reset,
    // Safe to claim the account holds nothing: a read came back and said so.
    showEmptyState: hasLoadedOnce,
    // Nothing was ever read and the backend was out of reach. Data already in
    // hand wins over a later drop, so this is false once anything has loaded.
    showOfflineState: isUnreachable && !hasLoadedOnce,
  };
};

export default useLoadTracker;
