import { useState, useCallback, useEffect, useMemo } from 'react';
import { outletService, userService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { calculatePelcoIIIBill, marginalRatePerKwh } from '../../../utils/billing';
import {
  deriveOutletRuntimeState,
  toEpochMs,
  LIVE_POWER_THRESHOLD_W,
  HARDWARE_STALE_THRESHOLD_MS,
} from '../utils/outletRuntime';

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
  // The raw documents, not conclusions drawn from them. Everything below is
  // derived during render instead of in the snapshot handler, because the
  // conclusions depend on the clock: staleness has to arrive on time, and a
  // handler only runs when data arrives. When the ESP32 goes quiet no data
  // arrives, so a value computed there freezes at its last reading and goes on
  // presenting it as current.
  const [outletDocs, setOutletDocs] = useState({ 1: null, 2: null });
  // Optimistic toggle and rename, each held only until the next snapshot for
  // that outlet. Kept beside the documents rather than written over the derived
  // values, because the derived values are recomputed every render now and would
  // overwrite them straight back.
  const [pendingToggle, setPendingToggle] = useState({ 1: null, 2: null });
  const [pendingRename, setPendingRename] = useState({ 1: null, 2: null });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isToggling, setIsToggling] = useState(false);
  // Starts true so the UI can show a placeholder instead of briefly rendering
  // "Not set" before the first Firestore snapshot arrives.
  const [isLoadingOutlets, setIsLoadingOutlets] = useState(true);
  const [rateProfileId, setRateProfileId] = useState(null);
  const [supplyRates, setSupplyRates] = useState(null);
  const [hasSupplyRates, setHasSupplyRates] = useState(true);

  // Half the staleness threshold, so an outlet is reported stale within about
  // six seconds of the readings stopping rather than whenever something else
  // happens to re-render.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), HARDWARE_STALE_THRESHOLD_MS / 2);
    return () => clearInterval(timer);
  }, []);

  const applyOutletData = useCallback((outlet) => {
    if (!outlet || !outlet.outletNumber) return;

    const outletNumber = Number(outlet.outletNumber);
    if (outletNumber !== 1 && outletNumber !== 2) return;

    setOutletDocs((previous) => ({ ...previous, [outletNumber]: outlet }));
    // The document now says what the relay is doing, so the optimistic value
    // has nothing left to cover.
    setPendingToggle((previous) => (
      previous[outletNumber] === null ? previous : { ...previous, [outletNumber]: null }
    ));
    setPendingRename((previous) => (
      previous[outletNumber] === null ? previous : { ...previous, [outletNumber]: null }
    ));
    // Any snapshot is also proof the clock should be re-read: a document that
    // has just arrived is fresh, and the interval may be up to six seconds away.
    setNowMs(Date.now());
  }, []);

  const derived = useMemo(() => {
    const forOutlet = (outletNumber) => {
      const outlet = outletDocs[outletNumber];
      if (!outlet) {
        return {
          status: false,
          applianceName: '',
          metrics: DEFAULT_OUTLET_METRICS,
          suggestion: { ...EMPTY_OUTLET_SUGGESTION },
          hasLoad: false,
          hasReading: false,
        };
      }

      const runtimeState = deriveOutletRuntimeState(outlet, nowMs);
      // Ungated on telemetry, deliberately. `status` is the *commanded* state -
      // written by processOutletToggle and by the device's ack, and held in
      // Firestore - so the hardware going quiet says nothing about whether that
      // write happened. Gating it did not degrade to "unknown"; it substituted a
      // confident "off" for a value that was never telemetry-derived, which is
      // the failure most likely to produce a bad action: the user sees off,
      // believes the fan is off, and walks away. liveUsage.js reads the same
      // field with no gate, and the two should not disagree about it.
      const reportedStatus = resolveOutletStatus(outlet);
      const optimisticStatus = pendingToggle[outletNumber];
      const status = optimisticStatus === null ? reportedStatus : optimisticStatus;

      const optimisticName = pendingRename[outletNumber];
      const applianceName = optimisticName === null
        ? resolveApplianceName(outlet)
        : optimisticName;

      const suggestion = buildOutletSuggestion(outlet, applianceName, runtimeState);

      return {
        status,
        applianceName,
        metrics: buildOutletMetrics(outlet, status, runtimeState),
        // A name the user has just chosen leaves nothing to suggest, and the
        // offer must go the moment they accept it rather than a round trip later.
        suggestion: optimisticName === null
          ? suggestion
          : { ...suggestion, showBadge: false, canAccept: false },
        hasLoad: runtimeState.hasLoad,
        hasReading: runtimeState.hasFreshTelemetry,
      };
    };

    return { 1: forOutlet(1), 2: forOutlet(2) };
  }, [outletDocs, pendingToggle, pendingRename, nowMs]);

  const outlet1Status = derived[1].status;
  const outlet2Status = derived[2].status;
  const outlet1ApplianceName = derived[1].applianceName;
  const outlet2ApplianceName = derived[2].applianceName;
  const outlet1Metrics = derived[1].metrics;
  const outlet2Metrics = derived[2].metrics;
  const outlet1Suggestion = derived[1].suggestion;
  const outlet2Suggestion = derived[2].suggestion;
  const outlet1HasLoad = derived[1].hasLoad;
  const outlet2HasLoad = derived[2].hasLoad;
  const outlet1HasReading = derived[1].hasReading;
  const outlet2HasReading = derived[2].hasReading;

  // Load outlet data on mount
  useEffect(() => {
    let unsubscribeOutlets = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubscribeOutlets) {
        unsubscribeOutlets();
        unsubscribeOutlets = null;
      }

      if (!user?.uid) {
        // Dropping the documents resets everything derived from them.
        setOutletDocs({ 1: null, 2: null });
        setPendingToggle({ 1: null, 2: null });
        setPendingRename({ 1: null, 2: null });
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
    const key = outletNumber === 2 ? 2 : 1;

    // Move the switch now rather than after the round trip. The callable has to
    // reach asia-southeast1, and a cold start alone can take seconds - waiting
    // on that made a working toggle feel broken. Held as an override rather than
    // written over the derived value, so the next snapshot clears it by simply
    // being newer; a failure below drops it early.
    setPendingToggle((previous) => ({ ...previous, [key]: newStatus }));
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
      setPendingToggle((previous) => ({ ...previous, [key]: null }));
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
      if (outletNumber === 1 || outletNumber === 2) {
        setPendingRename((previous) => ({ ...previous, [outletNumber]: visibleName }));
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