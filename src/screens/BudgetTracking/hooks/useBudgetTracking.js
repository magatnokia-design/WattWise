import { useState, useCallback, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { budgetService, invoiceService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { useLoadOutcome } from '../../../hooks/useLoadTracker';
import { applyFinalizedSpend } from '../utils/budgetHelpers';

/**
 * The month's budget, spending and the last three months.
 *
 * COPY RULE: byte-identical with the web repo's copy at the same path.
 *
 * Fast on purpose (Oct 2026: "when I click Budget it's like empty, then it
 * has data"). Two causes, both fixed here:
 *
 *  - The reads ran one after another: the month, sometimes a second read for a
 *    carried-over budget, and only then history + statements. All three now
 *    start together.
 *  - Every visit started from zero. Firestore here has no disk cache, so the
 *    screen drew ₱0 / "No Budget Set" until the network answered. The last
 *    result is now kept for the session (`lastByUser`) and shown immediately
 *    on the next visit while a fresh read runs - stale-while-revalidate.
 *
 * `hasLoaded` is false only until the first answer this session. Until then
 * the screen shows a loading state, never the zeros in useState, because a
 * ₱0 budget and an unread one are not the same claim.
 */

// userId -> last good result. Module scope, so it outlives the screen but not
// the app; signing out clears it.
const lastByUser = new Map();

const useBudgetTracking = () => {
  const [userId, setUserId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // A ₱0 budget with ₱0 spent is also what an unreachable read looks like.
  const load = useLoadOutcome();

  // Get current month details
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();

  // Track auth state so budget fetch waits for an authenticated user.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const nextUserId = user?.uid || null;
      setUserId(nextUserId);

      if (!nextUserId) {
        lastByUser.clear();
        setData(null);
        setLoading(false);
        return;
      }

      // Show what this session already knows at once; the fetch below still
      // runs and replaces it.
      const cached = lastByUser.get(nextUserId);
      if (cached) setData(cached);
    });

    return unsubscribe;
  }, []);

  const fetchBudgetData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // All three at once. History and statements together give "spend against
      // the budget in force then", with a finalized month at what it was billed
      // - see applyFinalizedSpend.
      const [monthResult, historyResult, invoiceResult] = await Promise.all([
        budgetService.getCurrentMonthBudget(userId),
        budgetService.getBudgetHistory(userId, 3),
        invoiceService.getInvoices(userId, 3),
      ]);

      if (!monthResult.success || !historyResult.success) {
        load.failed(monthResult.success ? historyResult : monthResult);
        return;
      }

      // A failed invoice read leaves every row on its stored figure rather
      // than asserting that none of those months were finalized.
      const invoices = new Map(
        (invoiceResult.success ? invoiceResult.data : [])
          .map((invoice) => [invoice.billingMonth, invoice])
      );

      const month = monthResult.data || {};
      const next = {
        monthlyBudget: month.monthlyBudget || 0,
        currentSpending: month.currentSpending || 0,
        outlet1Spending: month.outlet1Spending || 0,
        outlet2Spending: month.outlet2Spending || 0,
        budgetHistory: applyFinalizedSpend(historyResult.data, invoices),
      };

      lastByUser.set(userId, next);
      setData(next);
      load.succeeded();
    } catch (error) {
      console.error('Error fetching budget data:', error);
      load.failed(error);
    } finally {
      setLoading(false);
    }
  }, [userId, load.succeeded, load.failed]);

  useEffect(() => {
    if (!userId) return;
    fetchBudgetData();
  }, [userId, fetchBudgetData]);

  // Set monthly budget
  const handleSetBudget = useCallback(async (budget) => {
    try {
      if (!userId) throw new Error('User not authenticated');

      const amount = parseFloat(budget);
      const result = await budgetService.setMonthlyBudget(userId, amount);

      if (!result.success) {
        throw new Error(result.error);
      }

      setData((current) => {
        const next = { ...(current || {}), monthlyBudget: amount };
        lastByUser.set(userId, next);
        return next;
      });
      return { success: true };
    } catch (error) {
      console.error('Error setting budget:', error);
      return { success: false, error: error.message };
    }
  }, [userId]);

  // Refresh data
  const handleRefresh = useCallback(async () => {
    await fetchBudgetData();
  }, [fetchBudgetData]);

  const currentSpending = data?.currentSpending || 0;
  const dailyAverage = currentDay > 0 ? currentSpending / currentDay : 0;

  return {
    showEmptyState: load.showEmptyState,
    // A cached result on screen is not an offline account: only say offline
    // when there is nothing this session could show instead.
    showOfflineState: load.showOfflineState && !data,
    hasLoaded: Boolean(data),
    monthlyBudget: data?.monthlyBudget || 0,
    currentSpending,
    outlet1Spending: data?.outlet1Spending || 0,
    outlet2Spending: data?.outlet2Spending || 0,
    dailyAverage,
    projectedCost: dailyAverage * daysInMonth,
    daysInMonth,
    currentDay,
    budgetHistory: data?.budgetHistory || [],
    loading,
    handleSetBudget,
    handleRefresh,
  };
};

export default useBudgetTracking;
