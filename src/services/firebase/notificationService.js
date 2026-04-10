import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  doc,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './config';
import { addDoc } from 'firebase/firestore';

export const notificationService = {
  // Get notifications with pagination
  getNotifications: async (userId, limitCount = 20, unreadOnly = false) => {
    try {
      const notificationsRef = collection(db, 'users', userId, 'notifications');
      let q = query(
        notificationsRef,
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      if (unreadOnly) {
        q = query(
          notificationsRef,
          where('read', '==', false),
          orderBy('timestamp', 'desc'),
          limit(limitCount)
        );
      }

      const snapshot = await getDocs(q);
      const notifications = [];
      snapshot.forEach((doc) => {
        notifications.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, data: notifications };
    } catch (error) {
      console.error('Error getting notifications:', error);
      return { success: false, error: error.message };
    }
  },

  // Get unread count
  getUnreadCount: async (userId) => {
    try {
      const notificationsRef = collection(db, 'users', userId, 'notifications');
      const q = query(notificationsRef, where('read', '==', false));
      
      const snapshot = await getDocs(q);
      return { success: true, count: snapshot.size };
    } catch (error) {
      console.error('Error getting unread count:', error);
      return { success: false, error: error.message };
    }
  },

  // Real-time listener for notifications
  subscribeToNotifications: (userId, onUpdate, onError) => {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const q = query(
      notificationsRef,
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    
    return onSnapshot(
      q,
      (snapshot) => {
        const notifications = [];
        snapshot.forEach((doc) => {
          notifications.push({ id: doc.id, ...doc.data() });
        });
        onUpdate(notifications);
      },
      (error) => {
        console.error('Error in notifications listener:', error);
        if (onError) onError(error);
      }
    );
  },

  // Real-time listener for unread count
  subscribeToUnreadCount: (userId, onUpdate, onError) => {
    const notificationsRef = collection(db, 'users', userId, 'notifications');
    const q = query(notificationsRef, where('read', '==', false));

    return onSnapshot(
      q,
      (snapshot) => {
        onUpdate(snapshot.size);
      },
      (error) => {
        console.error('Error in unread count listener:', error);
        if (onError) onError(error);
      }
    );
  },

    // Create notification (for testing/manual creation)
  createNotification: async (userId, notificationData) => {
    try {
      const notificationsRef = collection(db, 'users', userId, 'notifications');
      await addDoc(notificationsRef, {
        type: notificationData.type || 'device',
        title: notificationData.title || 'Notification',
        message: notificationData.message || '',
        outlet: notificationData.outlet || null,
        read: false,
        timestamp: new Date(),
        metadata: notificationData.metadata || {},
      });
      return { success: true };
    } catch (error) {
      console.error('Error creating notification:', error);
      return { success: false, error: error.message };
    }
  },
  
  // Mark notification as read
  markAsRead: async (userId, notificationId) => {
    try {
      await updateDoc(
        doc(db, 'users', userId, 'notifications', notificationId),
        { read: true }
      );
      return { success: true };
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return { success: false, error: error.message };
    }
  },

  // Mark all as read
  markAllAsRead: async (userId) => {
    try {
      const notificationsRef = collection(db, 'users', userId, 'notifications');
      const q = query(notificationsRef, where('read', '==', false));
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);
      snapshot.forEach((doc) => {
        batch.update(doc.ref, { read: true });
      });

      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error('Error marking all as read:', error);
      return { success: false, error: error.message };
    }
  },

  // Clear all notifications
  clearAll: async (userId) => {
    try {
      const notificationsRef = collection(db, 'users', userId, 'notifications');
      const snapshot = await getDocs(notificationsRef);

      const batch = writeBatch(db);
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error('Error clearing notifications:', error);
      return { success: false, error: error.message };
    }
  },

  // Backward-compatible alias used by some hooks/components
  clearAllNotifications: async (userId) => {
    return notificationService.clearAll(userId);
  },
};