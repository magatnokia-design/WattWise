import {
  collection,
  query,
  orderBy,
  limit as limitTo,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { db } from './config';

/**
 * Reads the security event log.
 *
 * Read-only by design and by rules: `security_events` is `allow write: if false`
 * for every client, because an actor who could add entries could forge an alibi
 * and one who could delete them could erase what they did. Only Cloud Functions
 * write here, through the Admin SDK.
 *
 * There is deliberately no "mark as read" and no "clear" - both would be writes,
 * and both would let the log be quietly emptied by whoever most wants it empty.
 */

const RECENT_LIMIT = 50;

const eventsRef = (userId) => collection(db, 'users', userId, 'security_events');

const buildQuery = (userId, max) =>
  query(eventsRef(userId), orderBy('at', 'desc'), limitTo(max));

const toEvent = (docSnapshot) => ({
  id: docSnapshot.id,
  ...docSnapshot.data(),
});

export const securityService = {
  /**
   * Live subscription. Returns the unsubscribe function.
   *
   * Live rather than fetched once because the thing this exists to show - a
   * device token being guessed at - is happening now, not last time the screen
   * was opened.
   */
  subscribeSecurityEvents: (userId, onChange, onError, max = RECENT_LIMIT) => {
    if (!userId) return () => {};

    return onSnapshot(
      buildQuery(userId, max),
      (snapshot) => onChange(snapshot.docs.map(toEvent)),
      (error) => {
        if (typeof onError === 'function') onError(error);
      }
    );
  },

  /** One-shot read, for callers that do not want a listener. */
  getSecurityEvents: async (userId, max = RECENT_LIMIT) => {
    if (!userId) return [];

    const snapshot = await getDocs(buildQuery(userId, max));
    return snapshot.docs.map(toEvent);
  },
};

export default securityService;
