// TODO: Connect to Firebase when backend is ready
import React, { useState, useCallback } from 'react';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // TODO: Replace with Firebase fetch
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      // Firebase fetch will go here
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // TODO: Replace with Firebase update
  const markAsRead = useCallback(async (notificationId) => {
    try {
      // Firebase update will go here
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // TODO: Replace with Firebase update
  const markAllAsRead = useCallback(async () => {
    try {
      // Firebase update will go here
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // TODO: Replace with Firebase delete
  const clearAll = useCallback(async () => {
    try {
      // Firebase delete will go here
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      setError(err.message);
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