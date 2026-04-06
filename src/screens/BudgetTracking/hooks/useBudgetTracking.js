import { useState, useCallback, useEffect } from 'react';

const useBudgetTracking = () => {
  // TODO: Replace with Firebase real-time data
  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [currentSpending, setCurrentSpending] = useState(0);
  const [outlet1Spending, setOutlet1Spending] = useState(0);
  const [outlet2Spending, setOutlet2Spending] = useState(0);
  const [dailyAverage, setDailyAverage] = useState(0);
  const [projectedCost, setProjectedCost] = useState(0);
  const [budgetHistory, setBudgetHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // Get current month details
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();

  // TODO: Fetch budget data from Firebase
  useEffect(() => {
    fetchBudgetData();
  }, []);

  const fetchBudgetData = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: Firebase Firestore query
      // const userId = auth.currentUser.uid;
      // const budgetRef = doc(db, 'budget', userId);
      // const budgetDoc = await getDoc(budgetRef);
      // if (budgetDoc.exists()) {
      //   const data = budgetDoc.data();
      //   setMonthlyBudget(data.monthlyBudget || 0);
      //   setCurrentSpending(data.currentSpending || 0);
      //   setOutlet1Spending(data.outlet1Spending || 0);
      //   setOutlet2Spending(data.outlet2Spending || 0);
      //   
      //   // Calculate daily average and projected cost
      //   const avgDaily = currentDay > 0 ? data.currentSpending / currentDay : 0;
      //   setDailyAverage(avgDaily);
      //   setProjectedCost(avgDaily * daysInMonth);
      // }

      // Fetch budget history
      // const historyRef = collection(db, 'budget', userId, 'history');
      // const historyQuery = query(historyRef, orderBy('date', 'desc'), limit(3));
      // const historySnapshot = await getDocs(historyQuery);
      // const history = historySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // setBudgetHistory(history);

      // Placeholder: All values = 0
      setMonthlyBudget(0);
      setCurrentSpending(0);
      setOutlet1Spending(0);
      setOutlet2Spending(0);
      setDailyAverage(0);
      setProjectedCost(0);
      setBudgetHistory([]);
    } catch (error) {
      console.error('Error fetching budget data:', error);
    } finally {
      setLoading(false);
    }
  }, [currentDay, daysInMonth]);

  const handleSetBudget = useCallback(async (budget) => {
    try {
      // TODO: Update Firebase
      // const userId = auth.currentUser.uid;
      // const budgetRef = doc(db, 'budget', userId);
      // await setDoc(budgetRef, { monthlyBudget: budget }, { merge: true });

      setMonthlyBudget(budget);
    } catch (error) {
      console.error('Error setting budget:', error);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    await fetchBudgetData();
  }, [fetchBudgetData]);

  return {
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