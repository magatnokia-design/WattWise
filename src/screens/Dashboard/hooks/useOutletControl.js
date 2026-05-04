import { useState, useCallback, useEffect } from 'react';
import { outletService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';

const DEFAULT_OUTLET_METRICS = {
  voltage: 0,
  current: 0,
  power: 0,
  energy: 0,
};

const EMPTY_OUTLET_SUGGESTION = {
  name: '',
  confidencePercent: null,
  modelVersion: '',
  meanPowerW: null,
  runtimeSeconds: null,
  sampleCount: null,
  showBadge: false,
  canAccept: false,
};

const LIVE_CURRENT_THRESHOLD_A = 0.01;
const LIVE_POWER_THRESHOLD_W = 0.5;
const HARDWARE_STALE_THRESHOLD_MS = 12000;

const toMetricNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toOptionalNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeOutletDisplayName = (value) => {
  return String(value || '').replace(/\s+/g, ' ').trim();
};

const toEpochMs = (value) => {
  if (!value) return 0;

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getTelemetryUpdatedAtMs = (outlet = {}) => {
  const explicitTelemetryMs = toEpochMs(
    outlet.metricsUpdatedAtMs ||
    outlet.lastMetricsAtMs ||
    outlet.lastTelemetryAtMs
  );

  if (explicitTelemetryMs > 0) {
    return explicitTelemetryMs;
  }

  return toEpochMs(
    outlet.metricsUpdatedAt ||
    outlet.lastMetricsAt ||
    outlet.lastTelemetryAt ||
    outlet.lastUpdated
  );
};

const hasLiveLoadFromMetrics = (metrics = {}) => {
  return (
    toMetricNumber(metrics.power) >= LIVE_POWER_THRESHOLD_W ||
    toMetricNumber(metrics.current) >= LIVE_CURRENT_THRESHOLD_A
  );
};

const deriveOutletRuntimeState = (outlet = {}) => {
  const current = toMetricNumber(outlet.current);
  const power = toMetricNumber(outlet.power);
  const hasLiveLoad = power >= LIVE_POWER_THRESHOLD_W || current >= LIVE_CURRENT_THRESHOLD_A;

  const lastUpdatedMs = getTelemetryUpdatedAtMs(outlet);
  const hasFreshTelemetry =
    lastUpdatedMs > 0 && (Date.now() - lastUpdatedMs) <= HARDWARE_STALE_THRESHOLD_MS;

  return {
    hasLiveLoad,
    hasFreshTelemetry,
  };
};

const buildOutletMetrics = (outlet = {}, isOutletOn = false, runtimeState = {}) => {
  const voltage = toMetricNumber(outlet.voltage);
  const current = toMetricNumber(outlet.current);
  const power = toMetricNumber(outlet.power);
  const energy = toMetricNumber(outlet.energy);

  const hasLiveLoad =
    runtimeState.hasLiveLoad === true ||
    power >= LIVE_POWER_THRESHOLD_W ||
    current >= LIVE_CURRENT_THRESHOLD_A;
  const hasFreshTelemetry = runtimeState.hasFreshTelemetry === true;

  if (!hasFreshTelemetry) {
    return { ...DEFAULT_OUTLET_METRICS };
  }

  // If backend status is briefly stale but live current/power is already present,
  // keep showing live metrics instead of forcing zeros.
  if (!isOutletOn && !hasLiveLoad) {
    return { ...DEFAULT_OUTLET_METRICS };
  }

  return {
    voltage,
    current,
    power,
    energy,
  };
};

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

const buildOutletSuggestion = (outlet = {}, outletName = '', runtimeState = {}) => {
  if (!runtimeState.hasFreshTelemetry || !runtimeState.hasLiveLoad) {
    return { ...EMPTY_OUTLET_SUGGESTION };
  }

  const detectionUpdatedAtMs = toEpochMs(outlet.applianceDetection?.updatedAtMs);
  const runStartedAtMs = toEpochMs(outlet.detectionState?.runStartedAtMs);
  const hasCurrentRunDetection =
    detectionUpdatedAtMs > 0 &&
    (runStartedAtMs <= 0 || detectionUpdatedAtMs >= runStartedAtMs);

  if (!hasCurrentRunDetection) {
    return { ...EMPTY_OUTLET_SUGGESTION };
  }

  const suggestedName = String(outlet.autoDetectedAppliance || '').trim();
  if (!suggestedName) {
    return { ...EMPTY_OUTLET_SUGGESTION };
  }

  const normalizedCurrent = String(outletName || '').trim().toLowerCase();
  const normalizedSuggested = suggestedName.toLowerCase();
  const isDifferent = !!suggestedName && normalizedCurrent !== normalizedSuggested;
  const features = outlet.applianceDetection?.features || {};

  return {
    ...EMPTY_OUTLET_SUGGESTION,
    name: suggestedName,
    confidencePercent: toConfidencePercent(outlet.applianceDetection?.confidence),
    modelVersion: String(outlet.applianceDetection?.modelVersion || '').trim(),
    meanPowerW: toOptionalNumber(features.meanPower),
    runtimeSeconds: toOptionalNumber(features.runtimeSec),
    sampleCount: toOptionalNumber(features.sampleCount),
    showBadge: isDifferent,
    canAccept: isDifferent,
  };
};

const resolveOutletName = (outlet = {}, runtimeState = {}) => {
  const outletNumber = Number(outlet.outletNumber) || 0;
  const fallbackName = outletNumber > 0 ? `Outlet ${outletNumber}` : 'Outlet';

  // While no appliance load is present (or telemetry is stale), keep neutral labels.
  if (!runtimeState.hasFreshTelemetry || !runtimeState.hasLiveLoad) {
    return fallbackName;
  }

  const candidateName = normalizeOutletDisplayName(
    outlet.applianceName ||
    outlet.applianceSelection?.name ||
    outlet.applianceLabel ||
    outlet.label ||
    ''
  );
  return candidateName || fallbackName;
};

export const useOutletControl = () => {
  const [outlet1Status, setOutlet1Status] = useState(false);
  const [outlet2Status, setOutlet2Status] = useState(false);
  const [outlet1Name, setOutlet1Name] = useState('Outlet 1');
  const [outlet2Name, setOutlet2Name] = useState('Outlet 2');
  const [outlet1Metrics, setOutlet1Metrics] = useState(DEFAULT_OUTLET_METRICS);
  const [outlet2Metrics, setOutlet2Metrics] = useState(DEFAULT_OUTLET_METRICS);
  const [outlet1Suggestion, setOutlet1Suggestion] = useState({ ...EMPTY_OUTLET_SUGGESTION });
  const [outlet2Suggestion, setOutlet2Suggestion] = useState({ ...EMPTY_OUTLET_SUGGESTION });
  const [isToggling, setIsToggling] = useState(false);

  const applyOutletData = useCallback((outlet) => {
    if (!outlet || !outlet.outletNumber) return;

    const runtimeState = deriveOutletRuntimeState(outlet);
    const resolvedStatus = runtimeState.hasFreshTelemetry ? resolveOutletStatus(outlet) : false;
    const resolvedName = resolveOutletName(outlet, runtimeState);
    const suggestion = buildOutletSuggestion(outlet, resolvedName, runtimeState);
    const metrics = buildOutletMetrics(outlet, resolvedStatus, runtimeState);

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
        setOutlet1Suggestion({ ...EMPTY_OUTLET_SUGGESTION });
        setOutlet2Suggestion({ ...EMPTY_OUTLET_SUGGESTION });
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

      const fallbackName = outletNumber === 2 ? 'Outlet 2' : 'Outlet 1';
      const sanitizedName = normalizeOutletDisplayName(newName) || fallbackName;

      const result = await outletService.updateApplianceName(userId, outletNumber, sanitizedName, options);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      const hasLiveLoadNow = outletNumber === 1
        ? hasLiveLoadFromMetrics(outlet1Metrics)
        : hasLiveLoadFromMetrics(outlet2Metrics);
      const visibleName = hasLiveLoadNow ? sanitizedName : fallbackName;

      // Apply immediately in UI; snapshot listener will keep it in sync afterward.
      if (outletNumber === 1) {
        setOutlet1Name(visibleName);
        setOutlet1Suggestion((previous) => ({
          ...previous,
          showBadge: false,
          canAccept: false,
        }));
      } else if (outletNumber === 2) {
        setOutlet2Name(visibleName);
        setOutlet2Suggestion((previous) => ({
          ...previous,
          showBadge: false,
          canAccept: false,
        }));
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error updating appliance name:', error);
      return { success: false, error: error.message };
    }
  }, [outlet1Metrics, outlet2Metrics]);

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