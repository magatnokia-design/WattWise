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
 * One month of usage, checked two ways.
 *
 * `month` is the only thing the user picks. Everything on the screen is keyed
 * to it: the totals, the preceding month it is compared against, and the actual
 * PELCO III bill for the same period.
 *
 * The baseline was a second user-chosen month until it turned out to be the
 * source of the screen's confusion. The bill card only ever followed the first
 * selection, so the second dropdown silently governed one half of the screen
 * and not the other, with nothing on the page marking the boundary. It is now
 * always the preceding month - derived, not selected - so there is exactly one
 * control and one month in play.
 *
 * The totals come from `history_daily`, what the hardware actually measured and
 * processDailyRollup wrote. An earlier version read them out of
 * `reference_comparison`, a collection only the manual bill form ever writes,
 * so the screen compared two sets of hand-typed numbers and showed zeroes until
 * the user filled both in. `reference_comparison` is still used, but only for
 * what it is good for: the paper bill, so the estimate can be checked against
 * the real thing.
 */
const useReferenceComparison = () => {
  const [userId, setUserId] = useState(null);
  const monthOptions = useMemo(() => buildMonthOptions(MONTH_OPTION_COUNT), []);

  const [monthA, setMonthA] = useState(() => monthOptions[0].value);
  const monthB = useMemo(() => previousMonthKey(monthA), [monthA]);

  const [totalsA, setTotalsA] = useState(emptyMonthTotals);
  const [totalsB, setTotalsB] = useState(emptyMonthTotals);
  const [actualBill, setActualBill] = useState(null);
  // The user's own PELCO III rates, kept so the accuracy check can re-price the
  // bill's own kWh with the same tariff the months were priced with.
  const [rates, setRates] = useState({});
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

      // The accuracy check re-prices the bill's own kWh, so it needs the same
      // rates the months were priced with.
      setRates(rates);

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
    () => compareToActualBill(totalsA, actualBill, rates),
    [totalsA, actualBill, rates]
  );

  const selectMonth = useCallback((month) => setMonthA(month), []);

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
    // The selected month, and the one it is measured against. `previousMonth`
    // is exported so a screen can name the baseline it is showing; it is not
    // settable.
    month: monthA,
    previousMonth: monthB,
    totals: totalsA,
    previousTotals: totalsB,
    comparison,
    actualBill,
    accuracy,
    loading,
    error,
    selectMonth,
    saveActualBill,
    deleteActualBill,
    refresh: fetchComparison,
  };
};

export default useReferenceComparison;
