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