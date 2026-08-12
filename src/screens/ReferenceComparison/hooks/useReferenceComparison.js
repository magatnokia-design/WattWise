import { useState, useCallback, useEffect, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { comparisonService, historyService, userService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import {
  MONTH_OPTION_COUNT,
  buildMonthOptions,
  emptyMonthTotals,
  previousMonthKey,
  summarizeDailyEntries,
  compareMonths,
  compareToActualBill,
} from '../utils/comparisonHelpers';

/**
 * Two-month usage comparison.
 *
 * The months being compared come from `history_daily` - what the hardware
 * actually measured and processDailyRollup wrote. The earlier version read both
 * sides out of `reference_comparison`, a collection only the manual bill form
 * ever writes, so the screen compared two sets of hand-typed numbers and showed
 * zeroes until the user filled both in.
 *
 * `reference_comparison` is still used, but only for what it is good for: the
 * actual PELCO III bill for a month, so the app's estimate can be checked
 * against the real thing.
 */
const useReferenceComparison = () => {
  const [userId, setUserId] = useState(null);
  const monthOptions = useMemo(() => buildMonthOptions(MONTH_OPTION_COUNT), []);

  const [monthA, setMonthA] = useState(() => monthOptions[0].value);
  const [monthB, setMonthB] = useState(() => previousMonthKey(monthOptions[0].value));

  const [totalsA, setTotalsA] = useState(emptyMonthTotals);
  const [totalsB, setTotalsB] = useState(emptyMonthTotals);
  const [actualBill, setActualBill] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const nextUserId = user?.uid || null;
      setUserId(nextUserId);

      if (!nextUserId) {
        setTotalsA(emptyMonthTotals);
        setTotalsB(emptyMonthTotals);
        setActualBill(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const loadMonthTotals = useCallback(async (uid, monthKey, rates) => {
    const result = await historyService.getUsageByDateRange(
      uid,
      `${monthKey}-01`,
      `${monthKey}-31`
    );

    return result.success ? summarizeDailyEntries(result.data, rates) : emptyMonthTotals;
  }, []);

  const fetchComparison = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Both months are priced from their own total energy, so they need the
      // user's own rates - without them a month is costed at the seeded
      // defaults while every other screen uses what the user configured, and
      // the accuracy check would grade the tariff against the wrong tariff.
      const preferences = await userService.getUserPreferences(userId);
      const rates = preferences?.success
        ? {
          supplyRates: preferences.data?.supplyRates || null,
          profileId: preferences.data?.rateProfileId || null,
        }
        : {};

      const [nextA, nextB, billResult] = await Promise.all([
        loadMonthTotals(userId, monthA, rates),
        loadMonthTotals(userId, monthB, rates),
        comparisonService.getMonthData(userId, monthA),
      ]);

      setTotalsA(nextA);
      setTotalsB(nextB);

      const bill = billResult.success ? billResult.data : null;
      // A stored row of all zeroes is the same as no bill on file.
      setActualBill(bill && (bill.totalCost > 0 || bill.totalKWh > 0) ? bill : null);
    } catch (err) {
      setError(err.message);
      console.error('Error loading comparison:', err);
    } finally {
      setLoading(false);
    }
  }, [loadMonthTotals, monthA, monthB, userId]);

  useEffect(() => {
    if (!userId) return;
    fetchComparison();
  }, [fetchComparison, userId]);

  const comparison = useMemo(
    () => compareMonths(totalsA, totalsB),
    [totalsA, totalsB]
  );

  const accuracy = useMemo(
    () => compareToActualBill(totalsA, actualBill),
    [totalsA, actualBill]
  );

  // Picking the same month on both sides compares nothing, so the other side
  // steps out of the way rather than showing a 0% delta.
  const selectMonthA = useCallback((month) => {
    setMonthA(month);
    setMonthB((current) => (current === month ? previousMonthKey(month) : current));
  }, []);

  const selectMonthB = useCallback((month) => {
    setMonthB(month);
    setMonthA((current) => (current === month ? previousMonthKey(month) : current));
  }, []);

  const saveActualBill = useCallback(async (data) => {
    setError(null);

    try {
      if (!userId) throw new Error('User not authenticated');

      const result = await comparisonService.saveMonthData(userId, monthA, {
        totalKWh: data.kWh,
        totalCost: data.cost,
        outlet1KWh: data.outlet1,
        outlet2KWh: data.outlet2,
      });

      if (!result.success) throw new Error(result.error);

      setActualBill({
        totalKWh: data.kWh,
        totalCost: data.cost,
        outlet1KWh: data.outlet1,
        outlet2KWh: data.outlet2,
      });

      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error saving actual bill:', err);
      return { success: false, error: err.message };
    }
  }, [monthA, userId]);

  const deleteActualBill = useCallback(async () => {
    setError(null);

    try {
      if (!userId) throw new Error('User not authenticated');

      const result = await comparisonService.deleteComparison(userId, monthA);
      if (!result.success) throw new Error(result.error);

      setActualBill(null);
      return { success: true };
    } catch (err) {
      setError(err.message);
      console.error('Error deleting actual bill:', err);
      return { success: false, error: err.message };
    }
  }, [monthA, userId]);

  return {
    monthOptions,
    monthA,
    monthB,
    totalsA,
    totalsB,
    comparison,
    actualBill,
    accuracy,
    loading,
    error,
    selectMonthA,
    selectMonthB,
    saveActualBill,
    deleteActualBill,
    refresh: fetchComparison,
  };
};

export default useReferenceComparison;
