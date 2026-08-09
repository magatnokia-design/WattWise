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

const buildOutletSuggestion = (outlet = {}, applianceName = '', runtimeState = {}) => {
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

  const normalizedCurrent = String(applianceName || '').trim().toLowerCase();
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

const buildOutletLabel = (outletNumber) => {
  return outletNumber > 0 ? `Outlet ${outletNumber}` : 'Outlet';
};

const isDefaultOutletLabel = (value, outletNumber) => {
  if (!value) return false;
  const normalizedValue = String(value).trim().toLowerCase();
  const normalizedLabel = buildOutletLabel(outletNumber).toLowerCase();
  return normalizedValue === normalizedLabel;
};

const resolveApplianceName = (outlet = {}) => {
  const outletNumber = Number(outlet.outletNumber) || 0;
  const candidateName = normalizeOutletDisplayName(
    outlet.applianceName ||
    outlet.applianceSelection?.name ||
    outlet.applianceLabel ||
    outlet.label ||
    ''
  );
  if (!candidateName || isDefaultOutletLabel(candidateName, outletNumber)) {
    return '';
  }
  return candidateName;
};

export const useOutletControl = () => {
  const [outlet1Status, setOutlet1Status] = useState(false);
  const [outlet2Status, setOutlet2Status] = useState(false);
  const [outlet1ApplianceName, setOutlet1ApplianceName] = useState('');
  const [outlet2ApplianceName, setOutlet2ApplianceName] = useState('');
  const [outlet1Metrics, setOutlet1Metrics] = useState(DEFAULT_OUTLET_METRICS);
  const [outlet2Metrics, setOutlet2Metrics] = useState(DEFAULT_OUTLET_METRICS);
  const [outlet1Suggestion, setOutlet1Suggestion] = useState({ ...EMPTY_OUTLET_SUGGESTION });
  const [outlet2Suggestion, setOutlet2Suggestion] = useState({ ...EMPTY_OUTLET_SUGGESTION });
  const [isToggling, setIsToggling] = useState(false);

  const applyOutletData = useCallback((outlet) => {
    if (!outlet || !outlet.outletNumber) return;

    const runtimeState = deriveOutletRuntimeState(outlet);
    const resolvedStatus = runtimeState.hasFreshTelemetry ? resolveOutletStatus(outlet) : false;
    const resolvedApplianceName = resolveApplianceName(outlet);
    const suggestion = buildOutletSuggestion(outlet, resolvedApplianceName, runtimeState);
    const metrics = buildOutletMetrics(outlet, resolvedStatus, runtimeState);

    if (outlet.outletNumber === 1) {
      setOutlet1Status(resolvedStatus);
      setOutlet1ApplianceName(resolvedApplianceName);
      setOutlet1Metrics(metrics);
      setOutlet1Suggestion(suggestion);
    } else if (outlet.outletNumber === 2) {
      setOutlet2Status(resolvedStatus);
      setOutlet2ApplianceName(resolvedApplianceName);
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
        setOutlet1ApplianceName('');
        setOutlet2ApplianceName('');
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

      const visibleName = isDefaultOutletLabel(sanitizedName, outletNumber)
        ? ''
        : sanitizedName;

      // Confirming a real appliance name teaches the detector this outlet's
      // measured signature. Best-effort: the outlet may be idle or have too few
      // samples to learn from, which must never fail the rename itself.
      let learnedProfile = null;
      if (visibleName) {
        const learnResult = await outletService.registerApplianceProfile(
          userId,
          outletNumber,
          visibleName
        );

        if (learnResult.success) {
          learnedProfile = learnResult.data?.profile || null;
        } else {
          console.warn('Appliance signature not learned:', learnResult.error);
        }
      }

      // Apply immediately in UI; snapshot listener will keep it in sync afterward.
      if (outletNumber === 1) {
        setOutlet1ApplianceName(visibleName);
        setOutlet1Suggestion((previous) => ({
          ...previous,
          showBadge: false,
          canAccept: false,
        }));
      } else if (outletNumber === 2) {
        setOutlet2ApplianceName(visibleName);
        setOutlet2Suggestion((previous) => ({
          ...previous,
          showBadge: false,
          canAccept: false,
        }));
      }
      
      return { success: true, learnedProfile };
    } catch (error) {
      console.error('Error updating appliance name:', error);
      return { success: false, error: error.message };
    }
  }, []);

  return {
    outlet1Status,
    outlet2Status,
    outlet1ApplianceName,
    outlet2ApplianceName,
    outlet1Metrics,
    outlet2Metrics,
    outlet1Suggestion,
    outlet2Suggestion,
    isToggling,
    toggleOutlet,
    updateApplianceName,
  };
};