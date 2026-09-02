import { COLORS } from '../../../constants/colors';

export const getBudgetStatusColor = (percentageUsed) => {
  if (percentageUsed >= 100) return COLORS.error;
  if (percentageUsed >= 90) return '#F97316';
  if (percentageUsed >= 75) return '#F59E0B';
  return COLORS.success;
};

export const formatCurrency = (amount) => {
  return `₱${amount.toFixed(2)}`;
};

/**
 * Replaces a closed month's spend with the figure it was actually billed.
 *
 * `processDailyRollup` writes `currentSpending` from calculatePelcoIIIBill at
 * whatever supply rates sit in Settings, and `finalizeInvoice` never touches
 * the budget document. So the moment a month is finalized the two disagree for
 * ever: August 2026 read P79.39 here against a statement stamped FINAL for
 * P85.09, under a heading that says "spend against the budget in force then".
 * The billed figure is the one in the user's inbox, so it wins.
 *
 * **FINALIZED only, deliberately.** An open month is left exactly as stored,
 * because `handleBudgetAlerts` fires on that stored `currentSpending` - a
 * screen showing a different number than the one that triggers "you have used
 * 75% of your budget" would be a new disagreement in place of the one being
 * fixed. A finalized month is closed and raises no further alerts, so there is
 * nothing left to contradict.
 *
 * @param {Array} history Rows from `budgetService.getBudgetHistory`.
 * @param {Map|object} invoices Keyed by `YYYY-MM`. A month that is absent, or
 *   whose read failed, keeps its stored figure rather than being asserted
 *   unfinalized.
 * @returns {Array} the same rows, with `spent` corrected and `isFinal` set.
 */
export const applyFinalizedSpend = (history, invoices) => {
  const rows = Array.isArray(history) ? history : [];
  const lookup = invoices instanceof Map
    ? invoices
    : new Map(Object.entries(invoices || {}));

  return rows.map((row) => {
    const invoice = lookup.get(row.monthKey || row.id);
    if (invoice?.status !== 'FINALIZED') return { ...row, isFinal: false };

    // `Number(null)` is 0, not NaN, so coercing first would bill a closed month
    // at P0.00 and call that final.
    const raw = invoice.totalAmountDue;
    if (raw === null || raw === undefined || raw === '') return { ...row, isFinal: false };

    const billed = Number(raw);
    if (!Number.isFinite(billed)) return { ...row, isFinal: false };

    return { ...row, spent: billed, isFinal: true };
  });
};

export const calculateProjectedCost = (currentSpending, currentDay, daysInMonth) => {
  if (currentDay === 0) return 0;
  const dailyAverage = currentSpending / currentDay;
  return dailyAverage * daysInMonth;
};

export const getBudgetStatus = (currentSpending, monthlyBudget) => {
  const percentage = monthlyBudget > 0 ? (currentSpending / monthlyBudget) * 100 : 0;

  if (percentage >= 100) {
    return {
      status: 'exceeded',
      message: 'Budget exceeded',
      color: COLORS.error,
    };
  }
  if (percentage >= 90) {
    return {
      status: 'critical',
      message: 'Critical - 90% used',
      color: '#F97316',
    };
  }
  if (percentage >= 75) {
    return {
      status: 'warning',
      message: 'Warning - 75% used',
      color: '#F59E0B',
    };
  }
  if (percentage >= 50) {
    return {
      status: 'moderate',
      message: 'Moderate usage',
      color: COLORS.success,
    };
  }
  return {
    status: 'good',
    message: 'On track',
    color: COLORS.success,
  };
};