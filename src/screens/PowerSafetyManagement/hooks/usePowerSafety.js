import { useState, useCallback, useEffect } from 'react';

const usePowerSafety = () => {
  // TODO: Replace with Firebase real-time data
  const [safetyStage, setSafetyStage] = useState('normal'); // normal, warning, limit, cutoff
  const [outlet1Status, setOutlet1Status] = useState({
    voltage: 0,
    current: 0,
    power: 0,
  });
  const [outlet2Status, setOutlet2Status] = useState({
    voltage: 0,
    current: 0,
    power: 0,
  });
  const [thresholds, setThresholds] = useState({
    voltage: { min: 200, max: 250 },
    current: { max: 10 },
    power: { max: 2000 },
  });
  const [protectionEnabled, setProtectionEnabled] = useState(true);
  const [alertHistory, setAlertHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // TODO: Fetch safety data from Firebase
  useEffect(() => {
    fetchSafetyData();
  }, []);

  const fetchSafetyData = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: Firebase Firestore query
      // const userId = auth.currentUser.uid;
      // const safetyRef = doc(db, 'safety', userId);
      // const safetyDoc = await getDoc(safetyRef);
      // if (safetyDoc.exists()) {
      //   const data = safetyDoc.data();
      //   setSafetyStage(data.currentStage);
      //   setThresholds(data.thresholds);
      //   setProtectionEnabled(data.protectionEnabled);
      // }
      
      // Fetch alert history
      // const alertsRef = collection(db, 'safety', userId, 'alerts');
      // const alertsQuery = query(alertsRef, orderBy('timestamp', 'desc'), limit(10));
      // const alertsSnapshot = await getDocs(alertsQuery);
      // const alerts = alertsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // setAlertHistory(alerts);

      // Placeholder: All values = 0
      setSafetyStage('normal');
      setOutlet1Status({ voltage: 0, current: 0, power: 0 });
      setOutlet2Status({ voltage: 0, current: 0, power: 0 });
      setAlertHistory([]);
    } catch (error) {
      console.error('Error fetching safety data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggleProtection = useCallback(async (value) => {
    try {
      // TODO: Update Firebase
      // const userId = auth.currentUser.uid;
      // const safetyRef = doc(db, 'safety', userId);
      // await updateDoc(safetyRef, { protectionEnabled: value });

      setProtectionEnabled(value);
    } catch (error) {
      console.error('Error toggling protection:', error);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    await fetchSafetyData();
  }, [fetchSafetyData]);

  return {
    safetyStage,
    outlet1Status,
    outlet2Status,
    thresholds,
    protectionEnabled,
    alertHistory,
    loading,
    handleToggleProtection,
    handleRefresh,
  };
};

export default usePowerSafety;