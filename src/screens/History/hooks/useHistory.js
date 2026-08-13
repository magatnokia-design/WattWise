import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { historyService, outletService, userService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { buildLiveTodayEntry, withLiveToday } from '../../../utils/liveUsage';
import { formatDate, formatTime, getTimestampMs, splitDailyDate } from '../utils/historyHelpers';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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

const normalizeActivityLogs = (logs = []) => {
  return logs
    .map(mapActivityLog)
    .sort((a, b) => b._sortTime - a._sortTime)
    .map(({ _sortTime, ...rest }) => rest);
};

// `history_daily` documents are written by processDailyRollup with energy/cost
// field names that differ from what the usage list renders, so map them here
// rather than leaving the UI to read fields that never existed.
const mapUsageRecord = (record = {}) => {
  const dateString = record.date || record.id || '';
  const { day, month } = splitDailyDate(dateString);

  const outlet1Kwh = toNumber(record.outlet1Energy);
  const outlet2Kwh = toNumber(record.outlet2Energy);
  const totalKwh = record.totalEnergy !== undefined && record.totalEnergy !== null
    ? toNumber(record.totalEnergy)
    : outlet1Kwh + outlet2Kwh;

  return {
    ...record,
    date: dateString,
    day,
    month,
    outlet1Kwh,
    outlet2Kwh,
    totalKwh,
    totalCost: toNumber(record.cost),
    isLive: record.isLive === true,
  };
};

const normalizeUsageHistory = (records = []) => records.map(mapUsageRecord);

export const useHistory = () => {
  const [activityLogs, setActivityLogs] = useState([]);
  const [storedUsage, setStoredUsage] = useState([]);
  const [usageRange, setUsageRange] = useState({ startDate: null, endDate: null });
  const [outlets, setOutlets] = useState([]);
  const [rateProfileId, setRateProfileId] = useState(null);
  // The user's own Block 1 rates. Without them this screen priced everything at
  // the seeded profile while Analytics and Compare Months used what the user
  // actually saved, so the same month read P8.82 here and P8.34 there off the
  // same kWh. Same omission the comparison screen had.
  const [supplyRates, setSupplyRates] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef(null);

  // Live telemetry, so today's row moves as usage accumulates.
  useEffect(() => {
    let unsubscribeOutlets = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeOutlets) {
        unsubscribeOutlets();
        unsubscribeOutlets = null;
      }

      if (!user?.uid) {
        setOutlets([]);
        setRateProfileId(null);
        setSupplyRates(null);
        return;
      }

      userService.getUserPreferences(user.uid)
        .then((result) => {
          if (!result?.success) return;
          setRateProfileId(result.data?.rateProfileId || null);
          setSupplyRates(result.data?.supplyRates || null);
        })
        .catch((prefsError) => console.warn('Could not load rate profile:', prefsError?.message));

      unsubscribeOutlets = outletService.subscribeToOutlets(
        user.uid,
        setOutlets,
        (subscriptionError) => console.error('History outlet subscription error:', subscriptionError)
      );
    });

    return () => {
      if (unsubscribeOutlets) unsubscribeOutlets();
      unsubscribeAuth();
    };
  }, []);

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
        loadMore ? lastDocRef.current : null,
        20
      );

           if (!result.success) {
        throw new Error(result.error);
      }

      const normalizedLogs = normalizeActivityLogs(result.data);

      if (loadMore) {
        setActivityLogs((prev) => [...prev, ...normalizedLogs]);
      } else {
        setActivityLogs(normalizedLogs);
      }

      setLastDoc(result.lastDoc);
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);

    } catch (err) {
      setError(err.message);
      console.error('Error fetching activity logs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to activity logs in real time (latest page only).
  const subscribeActivityLogs = useCallback((filters = {}, limitCount = 20) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      return () => {};
    }

    setLoading(true);
    setError(null);

    return historyService.subscribeToActivityLogs(
      userId,
      filters,
      (logs) => {
        const normalizedLogs = normalizeActivityLogs(logs);
        setActivityLogs(normalizedLogs);
        setHasMore(normalizedLogs.length >= limitCount);
        lastDocRef.current = null;
        setLastDoc(null);
        setLoading(false);
      },
      (subscriptionError) => {
        setError(subscriptionError?.message || 'Failed to subscribe to activity logs');
        setLoading(false);
      },
      limitCount
    );
  }, []);

  // Fetch usage history (daily summaries)
  const fetchUsageHistory = useCallback(async (startDate, endDate) => {
    setLoading(true);
    setError(null);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await historyService.getDailyUsage(
        userId,
        { startDate, endDate },
        null,
        30
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      setStoredUsage(result.data);
      setUsageRange({ startDate, endDate });
    } catch (err) {
      setError(err.message);
      console.error('Error fetching usage history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Today has no rolled-up document until midnight Manila, so it is assembled
  // from live outlet telemetry and merged in here. Without this the current day
  // was simply missing from History until the next morning.
  const usageHistory = useMemo(() => {
    const liveToday = buildLiveTodayEntry(outlets, { rateProfileId, supplyRates });

    // Only splice today in when the selected range actually covers it -
    // otherwise browsing an earlier week would show today's row as well.
    const { startDate, endDate } = usageRange;
    const inRange = !!liveToday &&
      (!startDate || liveToday.date >= startDate) &&
      (!endDate || liveToday.date <= endDate);

    const merged = withLiveToday(storedUsage, inRange ? liveToday : null);

    // getDailyUsage returns newest first; withLiveToday sorts ascending.
    return normalizeUsageHistory(
      [...merged].sort((a, b) => String(b?.date).localeCompare(String(a?.date)))
    );
  }, [storedUsage, outlets, rateProfileId, supplyRates, usageRange]);

  return {
    activityLogs,
    usageHistory,
    loading,
    error,
    hasMore,
    // The screen prices its header total from the range's total energy rather
    // than by summing per-day costs, so it needs the same rates the rows
    // were priced with - the profile AND the user's own Block 1 figures.
    rateProfileId,
    supplyRates,
    fetchActivityLogs,
    subscribeActivityLogs,
    fetchUsageHistory,
  };
};