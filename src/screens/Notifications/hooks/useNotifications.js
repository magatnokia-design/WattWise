import { useState, useCallback, useEffect, useRef } from 'react';
import { notificationService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { useLoadOutcome } from '../../../hooks/useLoadTracker';
import {
  isUnconfirmedEmpty,
  UNREACHABLE_READ_RESULT,
  UNCONFIRMED_GRACE_MS,
} from '../../../utils/connectivity';
import { onAuthStateChanged } from 'firebase/auth';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadKnown, setUnreadKnown] = useState(false);
  const [loading, setLoading] = useState(false);
  // "No notifications" must not be said on the strength of a failed read.
  const load = useLoadOutcome();
  const [error, setError] = useState(null);

  // Pending decision on a listener snapshot that was empty and came from the
  // cache. Cancelled the moment the server confirms anything.
  const unconfirmedTimer = useRef(null);
  const clearUnconfirmed = useCallback(() => {
    if (unconfirmedTimer.current) {
      clearTimeout(unconfirmedTimer.current);
      unconfirmedTimer.current = null;
    }
  }, []);

  // Load notifications on mount with real-time listener
  useEffect(() => {
    let unsubscribeNotifications = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeNotifications) {
        unsubscribeNotifications();
        unsubscribeNotifications = null;
      }

      if (!user?.uid) {
        setNotifications([]);
        // Nothing read for the previous user applies to a signed-out panel.
        clearUnconfirmed();
        load.reset();
        return;
      }

      unsubscribeNotifications = notificationService.subscribeToNotifications(
        user.uid,
        (notificationsData, meta) => {
          setNotifications(notificationsData);

          // This callback - not `fetchNotifications` below - is what populates
          // the panel on open, and a listener reports an offline read through
          // this success path rather than the error one. Without the check the
          // panel drew "You're all caught up!" over an account that had four
          // unread notifications waiting. Held for a moment rather than acted
          // on, because the first snapshot comes from the cache even when the
          // server is about to answer - see UNCONFIRMED_GRACE_MS.
          if (isUnconfirmedEmpty(notificationsData.length, meta)) {
            if (!unconfirmedTimer.current) {
              unconfirmedTimer.current = setTimeout(() => {
                unconfirmedTimer.current = null;
                load.failed(UNREACHABLE_READ_RESULT);
              }, UNCONFIRMED_GRACE_MS);
            }
            return;
          }

          clearUnconfirmed();
          load.succeeded();
        },
        (err) => {
          setError(err.message);
          clearUnconfirmed();
          load.failed(err);
          console.error('Notifications subscription error:', err);
        }
      );
    });

    return () => {
      clearUnconfirmed();
      if (unsubscribeNotifications) unsubscribeNotifications();
      unsubscribeAuth();
    };
  }, []);

  // Load unread count with real-time listener
  useEffect(() => {
    let unsubscribeUnread = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeUnread) {
        unsubscribeUnread();
        unsubscribeUnread = null;
      }

      if (!user?.uid) {
        setUnreadCount(0);
        setUnreadKnown(false);
        return;
      }

      unsubscribeUnread = notificationService.subscribeToUnreadCount(
        user.uid,
        (count, meta) => {
          setUnreadCount(count);
          // "All read" is a claim, and a zero served from an empty cache does
          // not support it. The badge is already absent at zero either way;
          // this is so the panel header can stay silent instead of lying.
          setUnreadKnown(!isUnconfirmedEmpty(count, meta));
        },
        (err) => {
          setUnreadKnown(false);
          console.error('Unread count subscription error:', err);
        }
      );
    });

    return () => {
      if (unsubscribeUnread) unsubscribeUnread();
      unsubscribeAuth();
    };
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await notificationService.getNotifications(userId);

      if (!result.success) {
        throw new Error(result.error);
      }

      setNotifications(result.data);
      load.succeeded();
    } catch (err) {
      setError(err.message);
      load.failed(err);
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Mark as read
  const markAsRead = useCallback(async (notificationId) => {
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await notificationService.markAsRead(userId, notificationId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error marking as read:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await notificationService.markAllAsRead(userId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error marking all as read:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Clear all
  const clearAll = useCallback(async () => {
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await notificationService.clearAllNotifications(userId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error clearing notifications:', err);
      return { success: false, error: err.message };
    }
  }, []);

  return {
    showEmptyState: load.showEmptyState,
    showOfflineState: load.showOfflineState,
    notifications,
    unreadCount,
    unreadKnown,
    loading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    clearAll,
  };
};