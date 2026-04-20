import { useState, useCallback, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { safetyService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

const usePowerSafety = () => {
  const [userId, setUserId] = useState(null);
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

  const applySafetyData = useCallback((safetyData) => {
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
  }, []);

  // Fetch safety data
  const fetchSafetyData = useCallback(async (targetUserId = null) => {
    const resolvedUserId = targetUserId || userId;
    if (!resolvedUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    try {
      const result = await safetyService.getSafetyData(resolvedUserId);

      if (result.success) {
        applySafetyData(result.data);
      }

      // Fetch alert history
      const alertsResult = await safetyService.getAlertHistory(resolvedUserId, 10);
      if (alertsResult.success) {
        setAlertHistory(alertsResult.data);
      }
    } catch (error) {
      console.error('Error fetching safety data:', error);
    } finally {
      setLoading(false);
    }
  }, [applySafetyData, userId]);

  // Load safety data with real-time listener once auth resolves.
  useEffect(() => {
    let unsubscribeSafety = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      const nextUserId = user?.uid || null;
      setUserId(nextUserId);

      if (unsubscribeSafety) {
        unsubscribeSafety();
        unsubscribeSafety = null;
      }

      if (!nextUserId) {
        setSafetyStage('normal');
        setOutlet1Status({ voltage: 0, current: 0, power: 0 });
        setOutlet2Status({ voltage: 0, current: 0, power: 0 });
        setAlertHistory([]);
        setLoading(false);
        return;
      }

      unsubscribeSafety = safetyService.subscribeToSafetyData(
        nextUserId,
        applySafetyData,
        (error) => {
          console.error('Safety data subscription error:', error);
        }
      );

      fetchSafetyData(nextUserId);
    });

    return () => {
      if (unsubscribeSafety) unsubscribeSafety();
      unsubscribeAuth();
    };
  }, [applySafetyData, fetchSafetyData]);

  // Toggle protection
  const handleToggleProtection = useCallback(async (value) => {
    try {
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
  }, [userId]);

  const handleSaveThresholds = useCallback(async (nextThresholds) => {
    try {
      if (!userId) throw new Error('User not authenticated');

      const result = await safetyService.updateThresholds(userId, {
        thresholds: nextThresholds,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setThresholds(nextThresholds);
      return { success: true };
    } catch (error) {
      console.error('Error saving thresholds:', error);
      return { success: false, error: error.message };
    }
  }, [userId]);

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
    handleSaveThresholds,
    handleRefresh,
  };
};

export default usePowerSafety;