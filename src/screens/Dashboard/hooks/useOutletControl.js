import { useState, useCallback, useEffect } from 'react';
import { outletService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';

const DEFAULT_OUTLET_NAME_PATTERN = /^Outlet\s+\d+$/i;
const DEFAULT_OUTLET_METRICS = {
  voltage: 0,
  current: 0,
  power: 0,
  energy: 0,
};

const toMetricNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildOutletMetrics = (outlet = {}) => ({
  voltage: toMetricNumber(outlet.voltage),
  current: toMetricNumber(outlet.current),
  power: toMetricNumber(outlet.power),
  energy: toMetricNumber(outlet.energy),
});

const resolveOutletStatus = (outlet = {}) => {
  if (typeof outlet.isOn === 'boolean') {
    return outlet.isOn;
  }

  const normalized = String(outlet.status || '').trim().toLowerCase();
  return normalized === 'on';
};

const toConfidencePercent = (rawConfidence) => {
  const parsed = Number(rawConfidence);
  if (!Number.isFinite(parsed)) return null;

  if (parsed > 1) {
    return Math.max(0, Math.min(100, Math.round(parsed)));
  }

  return Math.max(0, Math.min(100, Math.round(parsed * 100)));
};

const buildOutletSuggestion = (outlet = {}, outletName = '') => {
  const suggestedName = String(outlet.autoDetectedAppliance || '').trim();
  const normalizedCurrent = String(outletName || '').trim().toLowerCase();
  const normalizedSuggested = suggestedName.toLowerCase();
  const isDifferent = !!suggestedName && normalizedCurrent !== normalizedSuggested;

  return {
    name: suggestedName,
    confidencePercent: toConfidencePercent(outlet.applianceDetection?.confidence),
    modelVersion: String(outlet.applianceDetection?.modelVersion || '').trim(),
    showBadge: isDifferent,
    canAccept: isDifferent,
  };
};

export const useOutletControl = () => {
  const [outlet1Status, setOutlet1Status] = useState(false);
  const [outlet2Status, setOutlet2Status] = useState(false);
  const [outlet1Name, setOutlet1Name] = useState('Outlet 1');
  const [outlet2Name, setOutlet2Name] = useState('Outlet 2');
  const [outlet1Metrics, setOutlet1Metrics] = useState(DEFAULT_OUTLET_METRICS);
  const [outlet2Metrics, setOutlet2Metrics] = useState(DEFAULT_OUTLET_METRICS);
  const [outlet1Suggestion, setOutlet1Suggestion] = useState({
    name: '',
    confidencePercent: null,
    showBadge: false,
    canAccept: false,
  });
  const [outlet2Suggestion, setOutlet2Suggestion] = useState({
    name: '',
    confidencePercent: null,
    showBadge: false,
    canAccept: false,
  });
  const [isToggling, setIsToggling] = useState(false);

  const applyOutletData = useCallback((outlet) => {
    if (!outlet || !outlet.outletNumber) return;

    const resolvedName = String(outlet.applianceName || `Outlet ${outlet.outletNumber}`);
    const suggestion = buildOutletSuggestion(outlet, resolvedName);
    const metrics = buildOutletMetrics(outlet);
    const resolvedStatus = resolveOutletStatus(outlet);

    if (outlet.outletNumber === 1) {
      setOutlet1Status(resolvedStatus);
      setOutlet1Name(resolvedName);
      setOutlet1Metrics(metrics);
      setOutlet1Suggestion(suggestion);
    } else if (outlet.outletNumber === 2) {
      setOutlet2Status(resolvedStatus);
      setOutlet2Name(resolvedName);
      setOutlet2Metrics(metrics);
      setOutlet2Suggestion(suggestion);
    }
  }, []);

  // Load outlet data on mount
  useEffect(() => {
    let unsubscribeOutlets = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubscribeOutlets) {
        unsubscribeOutlets();
        unsubscribeOutlets = null;
      }

      if (!user?.uid) {
        setOutlet1Status(false);
        setOutlet2Status(false);
        setOutlet1Name('Outlet 1');
        setOutlet2Name('Outlet 2');
        setOutlet1Metrics(DEFAULT_OUTLET_METRICS);
        setOutlet2Metrics(DEFAULT_OUTLET_METRICS);
        setOutlet1Suggestion({ name: '', confidencePercent: null, showBadge: false, canAccept: false });
        setOutlet2Suggestion({ name: '', confidencePercent: null, showBadge: false, canAccept: false });
        return;
      }

      const result = await outletService.getOutlets(user.uid);
      if (result.success && result.data.length > 0) {
        result.data.forEach((outlet) => applyOutletData(outlet));
      }

      unsubscribeOutlets = outletService.subscribeToOutlets(
        user.uid,
        (outlets) => {
          outlets.forEach((outlet) => applyOutletData(outlet));
        },
        (error) => console.error('Outlet subscription error:', error)
      );
    });

    return () => {
      if (unsubscribeOutlets) unsubscribeOutlets();
      unsubscribeAuth();
    };
  }, [applyOutletData]);

  // Toggle outlet ON/OFF
  const toggleOutlet = useCallback(async (outletNumber, newStatus) => {
    setIsToggling(true);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await outletService.toggleOutlet(userId, outletNumber, newStatus);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error toggling outlet:', error);
      return { success: false, error: error.message };
    } finally {
      setIsToggling(false);
    }
  }, []);

  // Update appliance name
  const updateApplianceName = useCallback(async (outletNumber, newName, options = {}) => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await outletService.updateApplianceName(userId, outletNumber, newName, options);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error updating appliance name:', error);
      return { success: false, error: error.message };
    }
  }, []);

  return {
    outlet1Status,
    outlet2Status,
    outlet1Name,
    outlet2Name,
    outlet1Metrics,
    outlet2Metrics,
    outlet1Suggestion,
    outlet2Suggestion,
    isToggling,
    toggleOutlet,
    updateApplianceName,
  };
};