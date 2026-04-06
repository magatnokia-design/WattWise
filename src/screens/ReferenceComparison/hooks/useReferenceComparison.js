import { useState, useCallback, useEffect } from 'react';
import { calculateComparison, generateInsights } from '../utils/comparisonHelpers';

const useReferenceComparison = () => {
  const currentDate = new Date();
  const currentMonthValue = currentDate.toISOString().slice(0, 7); // YYYY-MM

  // TODO: Replace with Firebase real-time data
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

  // Calculate comparison data
  const comparisonData = calculateComparison(currentMonthData, previousMonthData);
  const insights = generateInsights(comparisonData, currentMonthData, previousMonthData);

  // TODO: Fetch comparison data from Firebase
  useEffect(() => {
    fetchComparisonData();
  }, [selectedMonth]);

  const fetchComparisonData = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: Firebase Firestore query
      // const userId = auth.currentUser.uid;
      
      // Fetch current month data
      // const currentRef = doc(db, 'history', userId, 'monthly', selectedMonth);
      // const currentDoc = await getDoc(currentRef);
      // if (currentDoc.exists()) {
      //   const data = currentDoc.data();
      //   setCurrentMonthData({
      //     kWh: data.totalKWh || 0,
      //     cost: data.totalCost || 0,
      //     outlet1: data.outlet1KWh || 0,
      //     outlet2: data.outlet2KWh || 0,
      //   });
      // }

      // Fetch previous month data
      // const prevDate = new Date(selectedMonth + '-01');
      // prevDate.setMonth(prevDate.getMonth() - 1);
      // const prevMonth = prevDate.toISOString().slice(0, 7);
      // const prevRef = doc(db, 'history', userId, 'monthly', prevMonth);
      // const prevDoc = await getDoc(prevRef);
      // if (prevDoc.exists()) {
      //   const data = prevDoc.data();
      //   setPreviousMonthData({
      //     kWh: data.totalKWh || 0,
      //     cost: data.totalCost || 0,
      //     outlet1: data.outlet1KWh || 0,
      //     outlet2: data.outlet2KWh || 0,
      //   });
      // } else {
      //   setPreviousMonthData({ kWh: 0, cost: 0, outlet1: 0, outlet2: 0 });
      // }

      // Placeholder: All values = 0
      setCurrentMonthData({ kWh: 0, cost: 0, outlet1: 0, outlet2: 0 });
      setPreviousMonthData({ kWh: 0, cost: 0, outlet1: 0, outlet2: 0 });
    } catch (error) {
      console.error('Error fetching comparison data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  const handleMonthChange = useCallback((month) => {
    setSelectedMonth(month);
  }, []);

  const handleAddPreviousBill = useCallback(async (data) => {
    try {
      // TODO: Save to Firebase
      // const userId = auth.currentUser.uid;
      // const prevDate = new Date(selectedMonth + '-01');
      // prevDate.setMonth(prevDate.getMonth() - 1);
      // const prevMonth = prevDate.toISOString().slice(0, 7);
      // const prevRef = doc(db, 'history', userId, 'monthly', prevMonth);
      // await setDoc(prevRef, {
      //   totalKWh: data.kWh,
      //   totalCost: data.cost,
      //   outlet1KWh: data.outlet1,
      //   outlet2KWh: data.outlet2,
      //   updatedAt: serverTimestamp(),
      // }, { merge: true });

      setPreviousMonthData(data);
    } catch (error) {
      console.error('Error saving previous bill data:', error);
    }
  }, [selectedMonth]);

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
    handleMonthChange,
    handleAddPreviousBill,
    handleRefresh,
  };
};

export default useReferenceComparison;