import { useState, useCallback, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { safetyService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

// Two of the backend's 15s reading-write intervals, plus room for a slow
// round trip. Long enough that a healthy device is never called stale between
// writes, short enough that an unplugged one is obvious within a minute.
const READINGS_STALE_AFTER_MS = 40000;

const usePowerSafety = () => {
  const [userId, setUserId] = useState(null);
  const [readingsAreStale, setReadingsAreStale] = useState(true);
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
    // Readings are only meaningful if the hardware wrote them recently.
    // Without this the last values received sat on screen indefinitely, so an
    // ESP32 that had been unplugged for hours still showed 242.7 V and a
    // "Safe" verdict - the screen asserting the state of a device it had not
    // heard from. Worse in the other direction: 0.0 V is below every voltage
    // minimum, so a disconnected device could be graded Critical.
    //
    // updateOutletMetrics writes these at most every 15s
    // (READING_WRITE_INTERVAL_MS), so the threshold has to clear two intervals
    // to avoid calling a healthy device stale between writes. It still notices
    // an unplugged one inside a minute.
    const lastWriteMs = Number(safetyData.lastReadingWriteMs || 0);
    const stale = !(lastWriteMs > 0 && Date.now() - lastWriteMs < READINGS_STALE_AFTER_MS);

    setReadingsAreStale(stale);
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
    readingsAreStale,
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