import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * How long to wait between attempts while a screen is showing an offline state.
 *
 * Long enough that a phone with no signal is not doing this constantly, short
 * enough that turning wi-fi back on feels like it fixed the screen rather than
 * like nothing happened.
 */
export const OFFLINE_RETRY_MS = 10000;

/**
 * Retry a failed load while - and only while - a screen is admitting it failed.
 *
 * The offline states this app grew were honest but inert: they said "Can't
 * reach WattWise" with a Try again button and then waited for a tap. Turning
 * airplane mode off with the app open fixed nothing, and the way out was to
 * kill the app and reopen it, which is not something a user should have to
 * work out. Reported from a real handset.
 *
 * Screen focus and foreground/background are the usual hooks for this and
 * neither one fires here: the user never leaves the screen and never leaves the
 * app. The only thing that changes is the network, and nothing in this project
 * is watching it - `@react-native-community/netinfo` is not a dependency, and
 * adding a native module for this was not worth the prebuild risk. So this
 * polls instead, which is acceptable precisely because it is so tightly
 * bounded: it runs only when `active` is true, and `active` is the screen's own
 * `showOfflineState`, which goes false the instant a read succeeds.
 *
 * Offline the retry is nearly free - a Firestore query with no route resolves
 * from the local cache rather than waiting on a timeout.
 *
 * `AppState` is still worth listening to on top of the timer: coming back from
 * the background is the other moment connectivity has often changed, and
 * reacting to it immediately beats waiting out the remainder of an interval.
 *
 * @param {boolean} active Whether the screen is currently unable to load.
 * @param {Function} retry Called to try again. May be recreated each render.
 * @param {number} [intervalMs]
 */
export const useOfflineRetry = (active, retry, intervalMs = OFFLINE_RETRY_MS) => {
  // Held in a ref so an inline arrow function does not restart the interval on
  // every render - which would clear the timer before it ever fired, and the
  // retry would silently never happen.
  const retryRef = useRef(retry);

  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);

  useEffect(() => {
    if (!active) return undefined;

    const attempt = () => {
      const fn = retryRef.current;
      if (typeof fn !== 'function') return;

      try {
        // A retry that rejects must not take the screen down with it; the next
        // attempt is a few seconds away regardless.
        Promise.resolve(fn()).catch(() => {});
      } catch {
        // Same reasoning for a synchronous throw.
      }
    };

    const timer = setInterval(attempt, intervalMs);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') attempt();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [active, intervalMs]);
};

export default useOfflineRetry;
