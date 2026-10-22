import { useState, useEffect, useMemo, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { historyService, outletService, userService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { buildLiveTodayEntry, withLiveToday, getManilaDateKey } from '../../../utils/liveUsage';
import {
  summarizeRange,
  validateRange,
  previousRange,
  rangeInsights,
  RANGE_PRESETS,
} from '../../../utils/rangeUsage';

/**
 * Usage and cost between two chosen dates, for the Budget screen.
 *
 * Stored days come from history_daily. Today has no stored row until the
 * midnight rollup, so it is built from live outlet telemetry with
 * buildLiveTodayEntry - the same guarded, same-priced entry History and
 * Analytics use - which is why this subscribes to the outlets and reads the
 * rate settings at all.
 *
 * `status` is what the card shows: 'loading', 'ready', 'invalid' (with
 * `message`), or 'offline'. A failed read is never shown as zero usage:
 * getUsageByDateRange returns a failure for an unconfirmed empty cache, and
 * this reports it, because "you used nothing" over a fortnight of real usage
 * is the exact wrong answer to a budgeting question.
 *
 * The period of the same length just before the range is read too, so the
 * insights can say "12% less than the 15 days before". If only that read
 * fails, the comparison is left out rather than made against nothing.
 *
 * Results are kept for the session by user and dates (`lastByRange`), so
 * reopening Budget shows the last answer at once while a fresh read runs.
 */

// "uid|start|end" -> { rows, previousRows }. Module scope: outlives the
// screen, not the app.
const lastByRange = new Map();

const useRangeUsage = () => {
  const [userId, setUserId] = useState(null);
  const [range, setRange] = useState(() => RANGE_PRESETS[0].resolve(getManilaDateKey()));
  const [rows, setRows] = useState([]);
  const [previousRows, setPreviousRows] = useState(null);
  const [status, setStatus] = useState('loading');
  const [outlets, setOutlets] = useState([]);
  const [rates, setRates] = useState({ rateProfileId: null, supplyRates: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let unsubscribeOutlets = null;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeOutlets) {
        unsubscribeOutlets();
        unsubscribeOutlets = null;
      }
      setUserId(user?.uid || null);
      if (!user?.uid) {
        lastByRange.clear();
        setOutlets([]);
        return;
      }

      userService.getUserPreferences(user.uid)
        .then((result) => {
          if (!result?.success) return;
          setRates({
            rateProfileId: result.data?.rateProfileId || null,
            supplyRates: result.data?.supplyRates || null,
          });
        })
        .catch((error) => console.warn('Could not load rate profile:', error?.message));

      unsubscribeOutlets = outletService.subscribeToOutlets(
        user.uid,
        setOutlets,
        (error) => console.error('Budget range outlet subscription error:', error)
      );
    });

    return () => {
      if (unsubscribeOutlets) unsubscribeOutlets();
      unsubscribeAuth();
    };
  }, []);

  const invalidMessage = validateRange(range.startDate, range.endDate);

  useEffect(() => {
    if (!userId || invalidMessage) return undefined;
    let cancelled = false;
    const cacheKey = `${userId}|${range.startDate}|${range.endDate}`;
    const cached = lastByRange.get(cacheKey);
    if (cached) {
      setRows(cached.rows);
      setPreviousRows(cached.previousRows);
      setStatus('ready');
    } else {
      setStatus('loading');
    }
    const before = previousRange(range.startDate, range.endDate);

    Promise.all([
      historyService.getUsageByDateRange(userId, range.startDate, range.endDate),
      historyService.getUsageByDateRange(userId, before.startDate, before.endDate)
        .catch(() => null),
    ])
      .then(([result, previous]) => {
        if (cancelled) return;
        if (result?.success) {
          const next = {
            rows: result.data || [],
            previousRows: previous?.success ? previous.data || [] : null,
          };
          lastByRange.set(cacheKey, next);
          setRows(next.rows);
          setPreviousRows(next.previousRows);
          setStatus('ready');
        } else if (!cached) {
          // With a cached answer on screen, a failed refresh keeps it rather
          // than replacing real figures with "could not be loaded".
          setStatus('offline');
        }
      })
      .catch(() => {
        if (!cancelled && !cached) setStatus('offline');
      });

    return () => {
      cancelled = true;
    };
  }, [userId, range.startDate, range.endDate, invalidMessage, reloadKey]);

  const { summary, insights } = useMemo(() => {
    const today = getManilaDateKey();
    const liveToday = buildLiveTodayEntry(outlets, rates);
    const coversToday = range.startDate <= today && range.endDate >= today;
    const merged = withLiveToday(rows, coversToday ? liveToday : null);
    const current = summarizeRange(merged, { ...range, today });
    const previous = previousRows
      ? summarizeRange(previousRows, { ...previousRange(range.startDate, range.endDate), today })
      : null;
    return { summary: current, insights: rangeInsights(merged, current, previous) };
  }, [rows, previousRows, outlets, rates, range]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return {
    range,
    setRange,
    summary,
    insights,
    status: invalidMessage ? 'invalid' : status,
    message: invalidMessage,
    reload,
  };
};

export default useRangeUsage;
