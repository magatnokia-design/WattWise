import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { historyService, outletService, userService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { buildLiveTodayEntry, withLiveToday } from '../../../utils/liveUsage';
import { formatDate, formatTime, getTimestampMs, splitDailyDate } from '../utils/historyHelpers';
import { useLoadOutcome } from '../../../hooks/useLoadTracker';
import {
  isUnconfirmedEmpty,
  UNREACHABLE_READ_RESULT,
  UNCONFIRMED_GRACE_MS,
} from '../../../utils/connectivity';

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

const buildLogLabel = (recordedName, outletNumber) => {
  const slot = `Outlet ${outletNumber || '--'}`;
  const name = String(recordedName || '').trim();
  return !name || name.toLowerCase() === slot.toLowerCase() ? slot : `${slot} · ${name}`;
};

const mapActivityLog = (log) => {
  const timestamp = log.timestamp || log.createdAt || log.lastUpdated;
  const outletNumber = normalizeOutletNumber(log.outlet);
  const action = String(log.action || log.status || '').toLowerCase();
  const isOn = action === 'on' || action === 'true';

  return {
    ...log,
    outlet: outletNumber,
    // The slot leads, the recorded name follows. Both outlets can carry the same
    // appliance name - two sockets called "LED Lamp" made every row in this log
    // indistinguishable - and the slot is the one part that is always true. The
    // name still has to be the one recorded at the time, not the current one: a
    // log that rewrites its own past is worse than one that reads stale.
    outletName: buildLogLabel(log.outletName, outletNumber),
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

  // Pending decision on a listener snapshot that was empty and came from the
  // cache. Cancelled the moment the server confirms anything.
  const unconfirmedTimer = useRef(null);
  const clearUnconfirmed = useCallback(() => {
    if (unconfirmedTimer.current) {
      clearTimeout(unconfirmedTimer.current);
      unconfirmedTimer.current = null;
    }
  }, []);
  // An empty log and an unreadable one are the same zero rows on screen. This
  // is what separates "you have no activity" from "I could not fetch any".
  const load = useLoadOutcome();

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
      load.succeeded();

    } catch (err) {
      setError(err.message);
      // Ends the load without asserting the log is empty.
      load.failed(err);
      console.error('Error fetching activity logs:', err);
    } finally {
      setLoading(false);
    }
  }, [load.succeeded, load.failed]);

  // Subscribe to activity logs in real time (latest page only).
  const subscribeActivityLogs = useCallback((filters = {}, limitCount = 20) => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      return () => {};
    }

    setLoading(true);
    setError(null);

    const unsubscribe = historyService.subscribeToActivityLogs(
      userId,
      filters,
      (logs, meta) => {
        const normalizedLogs = normalizeActivityLogs(logs);
        setActivityLogs(normalizedLogs);
        setHasMore(normalizedLogs.length >= limitCount);
        lastDocRef.current = null;
        setLastDoc(null);
        setLoading(false);

        // A listener reports an offline cold start through this success path,
        // not the error one below: an empty snapshot marked as served from
        // cache. Treating it as a real answer is what made an untouched
        // account and an unreachable one look identical. Held briefly rather
        // than acted on, because the first snapshot is served from cache even
        // when the server is a moment behind - see UNCONFIRMED_GRACE_MS.
        if (isUnconfirmedEmpty(normalizedLogs.length, meta)) {
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
      (subscriptionError) => {
        setError(subscriptionError?.message || 'Failed to subscribe to activity logs');
        setLoading(false);
        clearUnconfirmed();
        load.failed(subscriptionError);
      },
      limitCount
    );

    // The pending unconfirmed-empty decision belongs to this subscription, so
    // it has to die with it - a filter change tears the listener down and the
    // timer would otherwise fire against the next one.
    return () => {
      clearUnconfirmed();
      unsubscribe();
    };
  }, [load.succeeded, load.failed, clearUnconfirmed]);

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
      load.succeeded();
    } catch (err) {
      setError(err.message);
      // A failed range read must not price the header at zero pesos as though
      // the user had genuinely consumed nothing over it.
      load.failed(err);
      console.error('Error fetching usage history:', err);
    } finally {
      setLoading(false);
    }
  }, [load.succeeded, load.failed]);

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
    // "No Activity Yet", and the zeroed Records / kWh / Cost header, are all
    // claims about the account. They need a read that came back.
    showEmptyState: load.showEmptyState,
    showOfflineState: load.showOfflineState,
    fetchActivityLogs,
    subscribeActivityLogs,
    fetchUsageHistory,
  };
};