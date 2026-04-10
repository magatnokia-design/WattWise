import { useState, useCallback, useEffect } from 'react';
import { historyService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { formatDate, formatTime, getTimestampMs } from '../utils/historyHelpers';

const normalizeOutletNumber = (outletValue) => {
  if (typeof outletValue === 'number') return outletValue;
  if (typeof outletValue === 'string') {
    const match = outletValue.match(/\d+/);
    if (match) {
      const parsed = Number(match[0]);
      return Number.isNaN(parsed) ? null : parsed;
    }
  }
  return null;
};

const mapActivityLog = (log) => {
  const timestamp = log.timestamp || log.createdAt || log.lastUpdated;
  const outletNumber = normalizeOutletNumber(log.outlet);
  const action = String(log.action || log.status || '').toLowerCase();
  const isOn = action === 'on' || action === 'true';

  return {
    ...log,
    outlet: outletNumber,
    outletName: log.outletName || `Outlet ${outletNumber || '--'}`,
    status: isOn ? 'ON' : 'OFF',
    timestamp,
    time: formatTime(timestamp),
    date: formatDate(timestamp),
    _sortTime: getTimestampMs(timestamp),
  };
};

export const useHistory = () => {
  const [activityLogs, setActivityLogs] = useState([]);
  const [usageHistory, setUsageHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  // Fetch activity logs with pagination
  const fetchActivityLogs = useCallback(async (filters = {}, loadMore = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await historyService.getActivityLogs(
        userId,
        filters,
        loadMore ? lastDoc : null,
        20
      );

           if (!result.success) {
        throw new Error(result.error);
      }

      const normalizedLogs = result.data
        .map(mapActivityLog)
        .sort((a, b) => b._sortTime - a._sortTime)
        .map(({ _sortTime, ...rest }) => rest);

      if (loadMore) {
        setActivityLogs((prev) => [...prev, ...normalizedLogs]);
      } else {
        setActivityLogs(normalizedLogs);
      }

      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);

    } catch (err) {
      setError(err.message);
      console.error('Error fetching activity logs:', err);
    } finally {
      setLoading(false);
    }
  }, [lastDoc]);

  // Fetch usage history (daily summaries)
  const fetchUsageHistory = useCallback(async (startDate, endDate) => {
    setLoading(true);
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await historyService.getDailyUsage(userId, startDate, endDate);

      if (!result.success) {
        throw new Error(result.error);
      }

      setUsageHistory(result.data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching usage history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    activityLogs,
    usageHistory,
    loading,
    error,
    hasMore,
    fetchActivityLogs,
    fetchUsageHistory,
  };
};