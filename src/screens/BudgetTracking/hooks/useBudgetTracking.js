import { useState, useCallback, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { budgetService, invoiceService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { useLoadOutcome } from '../../../hooks/useLoadTracker';
import { applyFinalizedSpend } from '../utils/budgetHelpers';

const useBudgetTracking = () => {
  const [userId, setUserId] = useState(null);
  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [currentSpending, setCurrentSpending] = useState(0);
  const [outlet1Spending, setOutlet1Spending] = useState(0);
  const [outlet2Spending, setOutlet2Spending] = useState(0);
  const [dailyAverage, setDailyAverage] = useState(0);
  const [projectedCost, setProjectedCost] = useState(0);
  const [budgetHistory, setBudgetHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  // A zero budget and an unread one are not the same claim.
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
        setMonthlyBudget(0);
        setCurrentSpending(0);
        setOutlet1Spending(0);
        setOutlet2Spending(0);
        setDailyAverage(0);
        setProjectedCost(0);
        setBudgetHistory([]);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Fetch budget data
  const fetchBudgetData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    try {
      const result = await budgetService.getCurrentMonthBudget(userId);

      if (result.success) {
        const data = result.data;
        setMonthlyBudget(data.monthlyBudget || 0);
        setCurrentSpending(data.currentSpending || 0);
        setOutlet1Spending(data.outlet1Spending || 0);
        setOutlet2Spending(data.outlet2Spending || 0);

        // Calculate daily average and projected cost
        const avgDaily = currentDay > 0 ? (data.currentSpending || 0) / currentDay : 0;
        setDailyAverage(avgDaily);
        setProjectedCost(avgDaily * daysInMonth);
      }

      // Fetch budget history (last 3 months), and the statements that priced
      // any of those months for real. A month the user has finalized was billed
      // at PELCO III's official rates, and this table says "spend against the
      // budget in force then" - see applyFinalizedSpend.
      const [historyResult, invoiceResult] = await Promise.all([
        budgetService.getBudgetHistory(userId, 3),
        invoiceService.getInvoices(userId, 3),
      ]);

      if (historyResult.success) {
        // A failed invoice read leaves every row on its stored figure rather
        // than asserting that none of those months were finalized.
        const invoices = new Map(
          (invoiceResult.success ? invoiceResult.data : [])
            .map((invoice) => [invoice.billingMonth, invoice])
        );

        setBudgetHistory(applyFinalizedSpend(historyResult.data, invoices));
        load.succeeded();
      } else {
        load.failed(historyResult);
      }
    } catch (error) {
      console.error('Error fetching budget data:', error);
      load.failed(error);
    } finally {
      setLoading(false);
    }
  }, [currentDay, daysInMonth, userId, load.succeeded, load.failed]);

  useEffect(() => {
    if (!userId) return;
    fetchBudgetData();
  }, [userId, fetchBudgetData]);

  // Set monthly budget
  const handleSetBudget = useCallback(async (budget) => {
    try {
      if (!userId) throw new Error('User not authenticated');

      const result = await budgetService.setMonthlyBudget(userId, parseFloat(budget));

      if (!result.success) {
        throw new Error(result.error);
      }

      setMonthlyBudget(parseFloat(budget));
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

  return {
    showEmptyState: load.showEmptyState,
    showOfflineState: load.showOfflineState,
    monthlyBudget,
    currentSpending,
    outlet1Spending,
    outlet2Spending,
    dailyAverage,
    projectedCost,
    daysInMonth,
    currentDay,
    budgetHistory,
    loading,
    handleSetBudget,
    handleRefresh,
  };
};

export default useBudgetTracking;