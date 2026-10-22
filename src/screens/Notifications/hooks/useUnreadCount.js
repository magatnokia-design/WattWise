import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { notificationService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

/**
 * Just the unread count, for the red dot on the Settings tab (Oct 2026). One
 * listener on the unread query - none of useNotifications' list loading -
 * because the tab bar is mounted for the whole session.
 */
const useUnreadCount = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let unsubscribeUnread = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeUnread) {
        unsubscribeUnread();
        unsubscribeUnread = null;
      }
      if (!user?.uid) {
        setCount(0);
        return;
      }
      unsubscribeUnread = notificationService.subscribeToUnreadCount(
        user.uid,
        (next) => setCount(Number(next) || 0),
        (error) => console.error('Unread count (tab) subscription error:', error)
      );
    });
    return () => {
      if (unsubscribeUnread) unsubscribeUnread();
      unsubscribeAuth();
    };
  }, []);

  return count;
};

export default useUnreadCount;
