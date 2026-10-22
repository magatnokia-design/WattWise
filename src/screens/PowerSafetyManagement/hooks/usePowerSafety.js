import { useState, useCallback, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { safetyService } from '../../../services/firebase';
import { mapAlertHistory } from '../../../services/firebase/safetyService';
import { auth } from '../../../services/firebase/config';
import { useLoadOutcome } from '../../../hooks/useLoadTracker';
import { areReadingsStale } from '../utils/safetyHelpers';

// How often staleness is re-asked against the clock. See areReadingsStale.
const STALE_CHECK_MS = 5000;

const EMPTY_STATUS = { voltage: 0, current: 0, power: 0 };

const usePowerSafety = () => {
  const [userId, setUserId] = useState(null);
  // Read through a ref by fetchSafetyData. With userId as a dependency, the
  // auth effect below re-ran the moment it set userId: it unsubscribed and
  // resubscribed everything and fetched a second time on every visit.
  const userIdRef = useRef(null);
  const [lastReadingWriteMs, setLastReadingWriteMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [safetyStage, setSafetyStage] = useState('normal');
  const [outlet1Status, setOutlet1Status] = useState(EMPTY_STATUS);
  const [outlet2Status, setOutlet2Status] = useState(EMPTY_STATUS);
  // Placeholders only - settingsLoaded tracks whether a read has landed and
  // nothing renders these as the user's own limits. Kept in step with
  // powerSafety.js regardless, so a frame drawn before the read cannot flash a
  // limit the backend does not enforce. 2000 W was four times the ceiling the
  // firmware actually permits.
  const [thresholds, setThresholds] = useState({
    voltage: { min: 190, max: 260 },
    current: { max: 10 },
    power: { max: 500 },
  });
  const [protectionEnabled, setProtectionEnabled] = useState(true);
  // Whether the two values above were read from the account or are still this
  // hook's placeholders. See applySafetyData.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [alertHistory, setAlertHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  // An empty alert history is a safety claim. It needs a read that returned.
  const load = useLoadOutcome();

  const applySafetyData = useCallback((safetyData) => {
    if (!safetyData) return;
    // Readings are only meaningful if the hardware wrote them recently. The
    // write time is kept and graded against a ticking clock (below), because
    // a Hub that goes quiet sends no further snapshot to re-grade on.
    setLastReadingWriteMs(Number(safetyData.lastReadingWriteMs || 0));
    setNowMs(Date.now());
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
    if (safetyData.thresholds) setThresholds(safetyData.thresholds);
    setProtectionEnabled(safetyData.protectionEnabled !== false);
    // Live: an alert raised while this screen is open used to wait for a
    // pull-to-refresh, because only the one-off read filled the list.
    setAlertHistory(mapAlertHistory(safetyData.alerts));

    // The thresholds above now came from the account. Until this is true they
    // are this hook's own initial values, which are not the user's settings
    // and must not be drawn as if they were.
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), STALE_CHECK_MS);
    return () => clearInterval(id);
  }, []);

  // One read. This used to read the same document twice in a row - once for
  // the settings, once more inside getAlertHistory.
  const fetchSafetyData = useCallback(async (targetUserId = null) => {
    const resolvedUserId = targetUserId || userIdRef.current;
    if (!resolvedUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await safetyService.getAlertHistory(resolvedUserId);
      if (result.success) {
        applySafetyData(result.safety);
        setAlertHistory(result.data);
        load.succeeded();
      } else {
        load.failed(result);
      }
    } catch (error) {
      console.error('Error fetching safety data:', error);
      load.failed(error);
    } finally {
      setLoading(false);
    }
  }, [applySafetyData, load.succeeded, load.failed]);

  // Load safety data with real-time listener once auth resolves.
  useEffect(() => {
    let unsubscribeSafety = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      const nextUserId = user?.uid || null;
      userIdRef.current = nextUserId;
      setUserId(nextUserId);

      if (unsubscribeSafety) {
        unsubscribeSafety();
        unsubscribeSafety = null;
      }

      if (!nextUserId) {
        setSafetyStage('normal');
        setOutlet1Status(EMPTY_STATUS);
        setOutlet2Status(EMPTY_STATUS);
        setAlertHistory([]);
        setSettingsLoaded(false);
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

      // Queued but not sent. The switch still moves, because Firestore has
      // applied it locally and will deliver it - the caller says so on screen.
      if (result.pending) {
        setProtectionEnabled(value);
        return result;
      }

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

      if (result.pending) {
        setThresholds(nextThresholds);
        return result;
      }

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
    showEmptyState: load.showEmptyState,
    showOfflineState: load.showOfflineState,
    safetyStage,
    readingsAreStale: areReadingsStale(lastReadingWriteMs, nowMs),
    outlet1Status,
    outlet2Status,
    thresholds,
    protectionEnabled,
    settingsLoaded,
    alertHistory,
    loading,
    handleToggleProtection,
    handleSaveThresholds,
    handleRefresh,
  };
};

export default usePowerSafety;
