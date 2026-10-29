import { useEffect, useMemo, useState } from 'react';
import {
  historyService,
  outletService,
  userService,
} from '../../../services/firebase';
import { marginalRatePerKwh } from '../../../utils/billing';
import { buildLiveTodayEntry, getManilaDateKey, withLiveToday } from '../../../utils/liveUsage';
import { aggregateApplianceUsage, averageHoursPerRunDay } from '../../../utils/applianceBreakdown';
import { useLoadOutcome } from '../../../hooks/useLoadTracker';
import { useOfflineRetry } from '../../../hooks/useOfflineRetry';

// Long enough to average over more than a weekend, short enough that a fan
// put away in the cool months stops counting.
const MEASURED_WINDOW_DAYS = 30;

const dateKeyDaysAgo = (todayKey, days) => {
  const date = new Date(`${todayKey}T00:00:00`);
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Everything the Appliance costs screen prices from: the user's own marginal
 * rate, their saved appliances, and how long each one actually ran over the
 * last 30 days (run time, measured by updateOutletMetrics since Oct 2026).
 *
 * Three reads, one outcome. A failed read must not render as "no saved
 * appliances" or as an unmeasured appliance, so every branch reports through
 * `load` and the screen renders `showOfflineState`.
 */
export const useApplianceCosts = (userId) => {
  const [rateProfileId, setRateProfileId] = useState(null);
  const [supplyRates, setSupplyRates] = useState(null);
  const [savedAppliances, setSavedAppliances] = useState([]);
  const [windowEntries, setWindowEntries] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  const load = useLoadOutcome();
  useOfflineRetry(load.showOfflineState, () => setRetryTick((tick) => tick + 1));

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return undefined;
    }

    let active = true;

    const fetchAll = async () => {
      try {
        const todayKey = getManilaDateKey();
        const [preferences, saved, history] = await Promise.all([
          userService.getUserPreferences(userId),
          outletService.getSavedAppliances(userId),
          historyService.getUsageByDateRange(
            userId,
            dateKeyDaysAgo(todayKey, MEASURED_WINDOW_DAYS - 1),
            todayKey
          ),
        ]);
        if (!active) return;

        const failure = [preferences, saved, history].find((result) => !result?.success);
        if (failure) {
          load.failed(failure);
          return;
        }

        setRateProfileId(preferences.data.rateProfileId || null);
        setSupplyRates(preferences.data.supplyRates || null);
        setSavedAppliances(saved.data);
        setWindowEntries(history.data);
        load.succeeded();
      } catch (error) {
        console.error('Error loading appliance costs:', error);
        if (active) load.failed(error);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchAll();

    return () => {
      active = false;
    };
  }, [userId, retryTick]);

  // Today has no rolled-up row until midnight; its run time so far comes from
  // the live outlet documents, the same way Analytics splices in today.
  useEffect(() => {
    if (!userId) return undefined;

    return outletService.subscribeToOutlets(
      userId,
      (nextOutlets) => setOutlets(nextOutlets),
      (error) => console.error('Appliance costs outlet subscription error:', error)
    );
  }, [userId]);

  const ratePerKwh = useMemo(
    () => marginalRatePerKwh({ supplyRates, profileId: rateProfileId }),
    [supplyRates, rateProfileId]
  );

  // Measured hours a day, keyed by lower-cased name - the same key saved
  // appliances use, so "Electric fan" and "Electric Fan" are one appliance.
  const measuredByName = useMemo(() => {
    const liveToday = buildLiveTodayEntry(outlets, { rateProfileId, supplyRates });
    const rows = aggregateApplianceUsage(withLiveToday(windowEntries, liveToday));
    const byName = new Map();
    rows.forEach((row) => {
      const hours = averageHoursPerRunDay(row);
      if (hours === null) return;
      byName.set(row.applianceName.toLowerCase(), { hoursPerRunDay: hours, runDays: row.runDays });
    });
    return byName;
  }, [windowEntries, outlets, rateProfileId, supplyRates]);

  return {
    loading,
    ratePerKwh,
    savedAppliances,
    measuredByName,
    measuredWindowDays: MEASURED_WINDOW_DAYS,
    showOfflineState: load.showOfflineState,
  };
};

export default useApplianceCosts;
