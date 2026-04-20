import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  startAfter,
  doc,
  getDoc,
  addDoc,
} from 'firebase/firestore';
import { db } from './config';

const getTimestampMs = (value) => {
  if (!value) return 0;

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000);
  }

  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime()) ? 0 : asDate.getTime();
};

export const historyService = {
  buildActivityLogsQuery: (logsRef, filters = {}, limitCount = 20) => {
    // Apply outlet filter
    if (filters.outlet && filters.outlet !== 'all') {
      const outletValue = parseInt(filters.outlet, 10);
      return query(
        logsRef,
        where('outlet', 'in', [outletValue, String(outletValue)]),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
    }

    return query(logsRef, orderBy('timestamp', 'desc'), limit(limitCount));
  },

  // Get activity logs with pagination
  getActivityLogs: async (userId, filters = {}, lastDoc = null, limitCount = 20) => {
    try {
      const logsRef = collection(db, 'users', userId, 'history_logs');
      let q = historyService.buildActivityLogsQuery(logsRef, filters, limitCount);

      // Pagination
      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      const logs = [];
      snapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() });
      });

      logs.sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));

      return {
        success: true,
        data: logs,
        lastDoc: snapshot.docs[snapshot.docs.length - 1],
        hasMore: snapshot.docs.length === limitCount,
      };
    } catch (error) {
      console.error('Error getting activity logs:', error);
      return { success: false, error: error.message };
    }
  },

  // Subscribe to activity logs in real time.
  subscribeToActivityLogs: (
    userId,
    filters = {},
    onUpdate,
    onError,
    limitCount = 20
  ) => {
    try {
      const logsRef = collection(db, 'users', userId, 'history_logs');
      const q = historyService.buildActivityLogsQuery(logsRef, filters, limitCount);

      return onSnapshot(
        q,
        (snapshot) => {
          const logs = [];
          snapshot.forEach((logDoc) => {
            logs.push({ id: logDoc.id, ...logDoc.data() });
          });

          logs.sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
          onUpdate(logs);
        },
        (error) => {
          console.error('Error subscribing to activity logs:', error);
          if (onError) onError(error);
        }
      );
    } catch (error) {
      console.error('Error preparing activity log subscription:', error);
      if (onError) onError(error);
      return () => {};
    }
  },

  // Get daily usage history with optional date range.
  getDailyUsage: async (userId, filters = {}, lastDoc = null, limitCount = 30) => {
    try {
      const dailyRef = collection(db, 'users', userId, 'history_daily');
      const { startDate, endDate } = filters || {};
      let q;

      if (startDate && endDate) {
        q = query(
          dailyRef,
          where('date', '>=', startDate),
          where('date', '<=', endDate),
          orderBy('date', 'desc'),
          limit(limitCount)
        );
      } else {
        q = query(dailyRef, orderBy('date', 'desc'), limit(limitCount));
      }

      // Pagination
      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      const usage = [];
      snapshot.forEach((doc) => {
        usage.push({ id: doc.id, ...doc.data() });
      });

      return {
        success: true,
        data: usage,
        lastDoc: snapshot.docs[snapshot.docs.length - 1],
        hasMore: snapshot.docs.length === limitCount,
      };
    } catch (error) {
      console.error('Error getting daily usage:', error);
      return { success: false, error: error.message };
    }
  },

  // Get usage for specific date
  getUsageByDate: async (userId, date) => {
    try {
      const usageDoc = await getDoc(
        doc(db, 'users', userId, 'history_daily', date)
      );
      if (usageDoc.exists()) {
        return { success: true, data: usageDoc.data() };
      }
      return { success: false, error: 'No data for this date' };
    } catch (error) {
      console.error('Error getting usage by date:', error);
      return { success: false, error: error.message };
    }
  },

  // Get usage for date range (for Analytics screen)
  getUsageByDateRange: async (userId, startDate, endDate) => {
    try {
      const dailyRef = collection(db, 'users', userId, 'history_daily');
      const q = query(
        dailyRef,
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'asc')
      );

      const snapshot = await getDocs(q);
      const usage = [];
      snapshot.forEach((doc) => {
        usage.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, data: usage };
    } catch (error) {
      console.error('Error getting usage by date range:', error);
      return { success: false, error: error.message };
    }
  },

  // Add activity log (for testing - in production, server-side only)
  addActivityLog: async (userId, logData) => {
    try {
      const logsRef = collection(db, 'users', userId, 'history_logs');
      await addDoc(logsRef, {
        ...logData,
        timestamp: new Date(),
      });
      return { success: true };
    } catch (error) {
      console.error('Error adding activity log:', error);
      return { success: false, error: error.message };
    }
  },
};