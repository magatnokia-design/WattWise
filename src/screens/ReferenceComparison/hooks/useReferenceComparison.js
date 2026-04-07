import { useState, useCallback, useEffect } from 'react';
import { comparisonService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { calculateComparison, generateInsights } from '../utils/comparisonHelpers';

const useReferenceComparison = () => {
  const currentDate = new Date();
  const currentMonthValue = currentDate.toISOString().slice(0, 7);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [currentMonthData, setCurrentMonthData] = useState({
    kWh: 0,
    cost: 0,
    outlet1: 0,
    outlet2: 0,
  });
  const [previousMonthData, setPreviousMonthData] = useState({
    kWh: 0,
    cost: 0,
    outlet1: 0,
    outlet2: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Calculate comparison data
  const comparisonData = calculateComparison(currentMonthData, previousMonthData);
  const insights = generateInsights(comparisonData, currentMonthData, previousMonthData);

  // Fetch when selected month changes
  useEffect(() => {
    fetchComparisonData();
  }, [selectedMonth]);

  // Fetch comparison data
  const fetchComparisonData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      // Fetch current month data
      const currentResult = await comparisonService.getMonthData(userId, selectedMonth);
      if (currentResult.success && currentResult.data) {
        const data = currentResult.data;
        setCurrentMonthData({
          kWh: data.totalKWh || 0,
          cost: data.totalCost || 0,
          outlet1: data.outlet1KWh || 0,
          outlet2: data.outlet2KWh || 0,
        });
      } else {
        setCurrentMonthData({ kWh: 0, cost: 0, outlet1: 0, outlet2: 0 });
      }

      // Calculate previous month
      const prevDate = new Date(selectedMonth + '-01');
      prevDate.setMonth(prevDate.getMonth() - 1);
      const prevMonth = prevDate.toISOString().slice(0, 7);

      // Fetch previous month data
      const prevResult = await comparisonService.getMonthData(userId, prevMonth);
      if (prevResult.success && prevResult.data) {
        const data = prevResult.data;
        setPreviousMonthData({
          kWh: data.totalKWh || 0,
          cost: data.totalCost || 0,
          outlet1: data.outlet1KWh || 0,
          outlet2: data.outlet2KWh || 0,
        });
      } else {
        setPreviousMonthData({ kWh: 0, cost: 0, outlet1: 0, outlet2: 0 });
      }
    } catch (error) {
      setError(error.message);
      console.error('Error fetching comparison data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  // Handle month change
  const handleMonthChange = useCallback((month) => {
    setSelectedMonth(month);
  }, []);

  // Add/update previous bill data
  const handleAddPreviousBill = useCallback(async (data) => {
    setError(null);

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      // Calculate previous month
      const prevDate = new Date(selectedMonth + '-01');
      prevDate.setMonth(prevDate.getMonth() - 1);
      const prevMonth = prevDate.toISOString().slice(0, 7);

      const result = await comparisonService.saveMonthData(userId, prevMonth, {
        totalKWh: data.kWh,
        totalCost: data.cost,
        outlet1KWh: data.outlet1,
        outlet2KWh: data.outlet2,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setPreviousMonthData(data);
      return { success: true };
    } catch (error) {
      setError(error.message);
      console.error('Error saving previous bill data:', error);
      return { success: false, error: error.message };
    }
  }, [selectedMonth]);

  // Refresh data
  const handleRefresh = useCallback(async () => {
    await fetchComparisonData();
  }, [fetchComparisonData]);

  return {
    selectedMonth,
    currentMonthData,
    previousMonthData,
    comparisonData,
    insights,
    loading,
    error,
    handleMonthChange,
    handleAddPreviousBill,
    handleRefresh,
  };
};

export default useReferenceComparison;