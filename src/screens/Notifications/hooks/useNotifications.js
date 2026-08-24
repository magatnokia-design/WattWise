import { useState, useCallback, useEffect } from 'react';
import { notificationService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { useLoadOutcome } from '../../../hooks/useLoadTracker';
import { onAuthStateChanged } from 'firebase/auth';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  // "No notifications" must not be said on the strength of a failed read.
  const load = useLoadOutcome();
  const [error, setError] = useState(null);

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
        return;
      }

      unsubscribeNotifications = notificationService.subscribeToNotifications(
        user.uid,
        (notificationsData) => {
          setNotifications(notificationsData);
        },
        (err) => {
          setError(err.message);
          console.error('Notifications subscription error:', err);
        }
      );
    });

    return () => {
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
        return;
      }

      unsubscribeUnread = notificationService.subscribeToUnreadCount(
        user.uid,
        (count) => {
          setUnreadCount(count);
        },
        (err) => {
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
    loading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    clearAll,
  };
};