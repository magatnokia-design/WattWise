import { useState, useCallback, useEffect } from 'react';
import { notificationService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load notifications on mount with real-time listener
  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const unsubscribe = notificationService.subscribeToNotifications(
      userId,
      (notificationsData) => {
        setNotifications(notificationsData);
      },
      (err) => {
        setError(err.message);
        console.error('Notifications subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  // Load unread count with real-time listener
  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const unsubscribe = notificationService.subscribeToUnreadCount(
      userId,
      (count) => {
        setUnreadCount(count);
      },
      (err) => {
        console.error('Unread count subscription error:', err);
      }
    );

    return () => unsubscribe();
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
    } catch (err) {
      setError(err.message);
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