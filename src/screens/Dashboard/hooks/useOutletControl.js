import { useState, useCallback, useEffect } from 'react';
import { outletService, userService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { calculatePelcoIIIBill, marginalRatePerKwh } from '../../../utils/billing';

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
  // Alternatives the detector could not rule out on power alone. The user picks
  // between same-wattage appliances the measurements genuinely cannot separate.
  candidates: [],
  ambiguous: false,
  identityState: 'unknown',
  recognised: false,
  showBadge: false,
  canAccept: false,
};

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
  const power = toMetricNumber(outlet.power);
  // Power alone. This used to accept `current >= 0.01 A` as evidence of a load,
  // and the owner's PZEM reads 0.02 A at 0.0 W on a switched-off outlet - double
  // the threshold with nothing consuming - so outlet 2 sat there reading
  // "Nokia's Fan - recognised" while off. It tracked the meter exactly: 0.02 A
  // showed the name, 0.00 A showed "No appliance detected yet", 0.02 A showed it
  // again. Current without power is not consumption, it is the meter's noise
  // floor, and the power threshold was already doing the work.
  const hasLiveLoad = power >= LIVE_POWER_THRESHOLD_W;

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
    power >= LIVE_POWER_THRESHOLD_W;
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

  const identity = outlet.applianceIdentity || null;

  // Read before every early return below. Whether the outlet's name still
  // describes what is plugged in is a separate question from whether the
  // detector has a name to offer, and the two have different answers for the
  // case that matters most: a load the detector cannot place, on an outlet that
  // is named. Returning early there reported no suggestion AND no doubt, so the
  // stale name was displayed as fact - exactly the bug this is meant to catch.
  const identityState = String(identity?.state || 'unknown');
  const withIdentity = (base) => ({
    ...base,
    identityState,
    recognised: identity?.recognised === true,
  });

  const detectionUpdatedAtMs = toEpochMs(outlet.applianceDetection?.updatedAtMs);
  const runStartedAtMs = toEpochMs(outlet.detectionState?.runStartedAtMs);
  const hasCurrentRunDetection =
    detectionUpdatedAtMs > 0 &&
    (runStartedAtMs <= 0 || detectionUpdatedAtMs >= runStartedAtMs);

  if (!hasCurrentRunDetection) {
    return withIdentity(EMPTY_OUTLET_SUGGESTION);
  }

  const suggestedName = String(outlet.autoDetectedAppliance || '').trim();
  if (!suggestedName) {
    return withIdentity(EMPTY_OUTLET_SUGGESTION);
  }

  const normalizedCurrent = String(applianceName || '').trim().toLowerCase();
  const normalizedSuggested = suggestedName.toLowerCase();

  // Whether to offer a name is decided by the backend now (`suggestionPending`
  // on applianceIdentity), so the phone and the web cannot disagree about it -
  // they did, and the site kept offering a suggestion this app had accepted.
  // The label comparison stays as the fallback for outlet documents written
  // before that field existed.
  const isDifferent = typeof identity?.suggestionPending === 'boolean'
    ? identity.suggestionPending
    : (!!suggestedName && normalizedCurrent !== normalizedSuggested);

  const features = outlet.applianceDetection?.features || {};

  const rawCandidates = Array.isArray(outlet.applianceDetection?.candidates)
    ? outlet.applianceDetection.candidates
    : [];

  const candidates = rawCandidates
    .map((candidate) => ({
      name: String(candidate?.name || '').trim(),
      confidencePercent: toConfidencePercent(candidate?.confidence),
      source: String(candidate?.source || 'generic').trim(),
    }))
    .filter((candidate) => !!candidate.name);

  return {
    ...EMPTY_OUTLET_SUGGESTION,
    name: suggestedName,
    confidencePercent: toConfidencePercent(outlet.applianceDetection?.confidence),
    modelVersion: String(outlet.applianceDetection?.modelVersion || '').trim(),
    meanPowerW: toOptionalNumber(features.meanPower),
    runtimeSeconds: toOptionalNumber(features.runtimeSec),
    sampleCount: toOptionalNumber(features.sampleCount),
    candidates,
    ambiguous: outlet.applianceDetection?.ambiguous === true,
    // 'changed' means the measurements say the outlet's name is currently wrong.
    // The UI needs this separately from the suggestion: it is the difference
    // between "here is a name you could use" and "the name shown above is not
    // what is plugged in".
    identityState,
    // The match came from one of this account's saved signatures, not a generic
    // wattage range - the appliance was recognised on being plugged back in.
    recognised: identity?.recognised === true,
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
  // Whether a load is actually drawing power right now. The saved appliance
  // name is only meaningful while something is plugged in and running.
  const [outlet1HasLoad, setOutlet1HasLoad] = useState(false);
  const [outlet2HasLoad, setOutlet2HasLoad] = useState(false);
  // Kept apart from hasLoad because they answer different questions. "Nothing is
  // drawing" is a measurement; "the hardware stopped reporting" is the absence
  // of one. Collapsed together, a stale outlet claimed to be empty on the
  // strength of readings that had ended twelve seconds earlier.
  const [outlet1HasReading, setOutlet1HasReading] = useState(false);
  const [outlet2HasReading, setOutlet2HasReading] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  // Starts true so the UI can show a placeholder instead of briefly rendering
  // "Not set" before the first Firestore snapshot arrives.
  const [isLoadingOutlets, setIsLoadingOutlets] = useState(true);
  const [rateProfileId, setRateProfileId] = useState(null);
  const [supplyRates, setSupplyRates] = useState(null);
  const [hasSupplyRates, setHasSupplyRates] = useState(true);

  const applyOutletData = useCallback((outlet) => {
    if (!outlet || !outlet.outletNumber) return;

    const runtimeState = deriveOutletRuntimeState(outlet);
    const resolvedStatus = runtimeState.hasFreshTelemetry ? resolveOutletStatus(outlet) : false;
    const resolvedApplianceName = resolveApplianceName(outlet);
    const suggestion = buildOutletSuggestion(outlet, resolvedApplianceName, runtimeState);
    const metrics = buildOutletMetrics(outlet, resolvedStatus, runtimeState);
    const hasLoad = runtimeState.hasFreshTelemetry && runtimeState.hasLiveLoad;

    if (outlet.outletNumber === 1) {
      setOutlet1Status(resolvedStatus);
      setOutlet1ApplianceName(resolvedApplianceName);
      setOutlet1Metrics(metrics);
      setOutlet1Suggestion(suggestion);
      setOutlet1HasLoad(hasLoad);
      setOutlet1HasReading(runtimeState.hasFreshTelemetry);
    } else if (outlet.outletNumber === 2) {
      setOutlet2Status(resolvedStatus);
      setOutlet2ApplianceName(resolvedApplianceName);
      setOutlet2Metrics(metrics);
      setOutlet2Suggestion(suggestion);
      setOutlet2HasLoad(hasLoad);
      setOutlet2HasReading(runtimeState.hasFreshTelemetry);
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
        setOutlet1HasLoad(false);
        setOutlet2HasLoad(false);
        setOutlet1HasReading(false);
        setOutlet2HasReading(false);
        setRateProfileId(null);
        setIsLoadingOutlets(false);
        return;
      }

      // Rate profile drives the live cost estimate; a failure here just leaves
      // the estimate on the default profile rather than blocking the dashboard.
      userService.getUserPreferences(user.uid)
        .then((prefs) => {
          if (prefs?.success) {
            setRateProfileId(prefs.data?.rateProfileId || null);
            setSupplyRates(prefs.data?.supplyRates || null);
            setHasSupplyRates(prefs.data?.hasSupplyRates === true);
          }
        })
        .catch((error) => console.warn('Could not load rate profile:', error?.message));

      try {
        const result = await outletService.getOutlets(user.uid);
        if (result.success && result.data.length > 0) {
          result.data.forEach((outlet) => applyOutletData(outlet));
        }
      } finally {
        setIsLoadingOutlets(false);
      }

      unsubscribeOutlets = outletService.subscribeToOutlets(
        user.uid,
        (outlets) => {
          outlets.forEach((outlet) => applyOutletData(outlet));
          setIsLoadingOutlets(false);
        },
        (error) => {
          console.error('Outlet subscription error:', error);
          setIsLoadingOutlets(false);
        }
      );
    });

    return () => {
      if (unsubscribeOutlets) unsubscribeOutlets();
      unsubscribeAuth();
    };
  }, [applyOutletData]);

  // Toggle outlet ON/OFF
  const toggleOutlet = useCallback(async (outletNumber, newStatus) => {
    const setStatus = outletNumber === 2 ? setOutlet2Status : setOutlet1Status;
    const previousStatus = outletNumber === 2 ? outlet2Status : outlet1Status;

    // Move the switch now rather than after the round trip. The callable has to
    // reach asia-southeast1, and a cold start alone can take seconds - waiting
    // on that made a working toggle feel broken. The Firestore listener
    // overwrites this with the real value moments later either way, and a
    // failure below puts it straight back.
    setStatus(newStatus);
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
      setStatus(previousStatus);
      console.error('Error toggling outlet:', error);
      return { success: false, error: error.message };
    } finally {
      setIsToggling(false);
    }
  }, [outlet1Status, outlet2Status]);

  // Update appliance name
  const updateApplianceName = useCallback(async (outletNumber, newName, options = {}) => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const fallbackName = outletNumber === 2 ? 'Outlet 2' : 'Outlet 1';
      const sanitizedName = normalizeOutletDisplayName(newName) || fallbackName;

      // One call: it names the outlet and records the measured signature, so
      // confirming a suggestion both renames and teaches the detector.
      const result = await outletService.updateApplianceName(userId, outletNumber, sanitizedName, options);

      if (!result.success) {
        throw new Error(result.error);
      }

      const visibleName = isDefaultOutletLabel(sanitizedName, outletNumber)
        ? ''
        : sanitizedName;

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
      
      return { success: true, learned: !!result.learned, learnError: result.learnError || null };
    } catch (error) {
      console.error('Error updating appliance name:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Live cost estimate, driven by the same PELCO III tariff the Analytics and
  // Settings screens use so all three agree.
  const totalEnergyKwh =
    toMetricNumber(outlet1Metrics.energy) + toMetricNumber(outlet2Metrics.energy);
  const totalPowerW =
    toMetricNumber(outlet1Metrics.power) + toMetricNumber(outlet2Metrics.power);

  // `totalEnergyKwh` is TODAY's energy, so today is what this prices - marginally,
  // matching processDailyRollup and the live History row. Including the
  // once-a-month P5.00 metering charge here showed "Est. cost P5.61" beside
  // "0.00 kWh", which is a true bill line answering a question nobody asked.
  const bill = calculatePelcoIIIBill(totalEnergyKwh, {
    supplyRates,
    profileId: rateProfileId,
    includePeriodFlats: false,
  });
  const estimatedCost = toMetricNumber(bill?.totals?.total);

  // The marginal rate, never `bill.effectiveRate`. The latter divides the whole
  // bill - including the once-a-period P5.00 metering charge and its VAT - by
  // however much energy has accumulated, so at the start of a month it explodes:
  // 0.001 kWh gave an "effective" P5,610/kWh, and a 15.9 W lamp was reported as
  // costing P89.20 an hour. Pricing an hour of draw is a marginal question, so it
  // takes the marginal rate.
  const perKwhRate = toMetricNumber(
    marginalRatePerKwh({ supplyRates, profileId: rateProfileId })
  );
  const estimatedCostPerHour = (totalPowerW / 1000) * perKwhRate;

  return {
    outlet1Status,
    outlet2Status,
    outlet1ApplianceName,
    outlet2ApplianceName,
    outlet1Metrics,
    outlet2Metrics,
    outlet1Suggestion,
    outlet2Suggestion,
    outlet1HasLoad,
    outlet2HasLoad,
    outlet1HasReading,
    outlet2HasReading,
    isLoadingOutlets,
    totalEnergyKwh,
    totalPowerW,
    estimatedCost,
    estimatedCostPerHour,
    effectiveRate: perKwhRate,
    hasSupplyRates,
    isToggling,
    toggleOutlet,
    updateApplianceName,
  };
};