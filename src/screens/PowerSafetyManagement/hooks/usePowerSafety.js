import { useState, useCallback, useEffect } from 'react';
import { safetyService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

const usePowerSafety = () => {
  const [safetyStage, setSafetyStage] = useState('normal');
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

  // Load safety data with real-time listener
  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const unsubscribe = safetyService.subscribeToSafetyData(
      userId,
      (safetyData) => {
        setSafetyStage(safetyData.currentStage);
        setOutlet1Status({
          voltage: safetyData.outlet1?.voltage || 0,
          current: safetyData.outlet1?.current || 0,
          power: safetyData.outlet1?.power || 0,
        });
        setOutlet2Status({
          voltage: safetyData.outlet2?.voltage || 0,
          current: safetyData.outlet2?.current || 0,
          power: safetyData.outlet2?.power || 0,
        });
        setThresholds(safetyData.thresholds);
        setProtectionEnabled(safetyData.protectionEnabled);
      },
      (error) => {
        console.error('Safety data subscription error:', error);
      }
    );

    fetchSafetyData();

    return () => unsubscribe();
  }, []);

  // Fetch safety data
  const fetchSafetyData = useCallback(async () => {
    setLoading(true);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await safetyService.getSafetyData(userId);

      if (result.success) {
        const data = result.data;
        setSafetyStage(data.currentStage);
        setOutlet1Status({
          voltage: data.outlet1?.voltage || 0,
          current: data.outlet1?.current || 0,
          power: data.outlet1?.power || 0,
        });
        setOutlet2Status({
          voltage: data.outlet2?.voltage || 0,
          current: data.outlet2?.current || 0,
          power: data.outlet2?.power || 0,
        });
        setThresholds(data.thresholds);
        setProtectionEnabled(data.protectionEnabled);
      }

      // Fetch alert history
      const alertsResult = await safetyService.getAlertHistory(userId, 10);
      if (alertsResult.success) {
        setAlertHistory(alertsResult.data);
      }
    } catch (error) {
      console.error('Error fetching safety data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Toggle protection
  const handleToggleProtection = useCallback(async (value) => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await safetyService.updateThresholds(userId, { protectionEnabled: value });

      if (!result.success) {
        throw new Error(result.error);
      }

      setProtectionEnabled(value);
      return { success: true };
    } catch (error) {
      console.error('Error toggling protection:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Refresh data
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