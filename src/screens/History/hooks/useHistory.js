import { useState, useCallback, useEffect } from 'react';
import { historyService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

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

      if (loadMore) {
        setActivityLogs(prev => [...prev, ...result.data.logs]);
      } else {
        setActivityLogs(result.data.logs);
      }

      setLastDoc(result.data.lastDoc);
      setHasMore(result.data.hasMore);
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