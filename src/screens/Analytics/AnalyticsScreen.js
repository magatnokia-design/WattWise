import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, CHART_COLORS } from '../../constants/colors';
import { useAuth } from '../../hooks/useAuth';
import {
  historyService,
  outletService,
  userService,
} from '../../services/firebase';
import { calculatePelcoIIIBill } from '../../utils/billing';
import { buildLiveAppliances, buildLiveTodayEntry, withLiveToday } from '../../utils/liveUsage';
import { formatCurrency } from '../BudgetTracking/utils/budgetHelpers';
import LiveUsagePanel from './components/LiveUsagePanel';
import UsageBarChart from './components/UsageBarChart';
import BillBreakdown from './components/BillBreakdown';
import { RateNotice } from '../../components/common/RateNotice';
import { WebAppNotice } from '../../components/common/WebAppNotice';
import { WEB_APP_LINKS } from '../../constants/webApp';
import { useDismissibleNotice } from '../../hooks/useDismissibleNotice';
import { useLoadOutcome } from '../../hooks/useLoadTracker';
import { useOfflineRetry } from '../../hooks/useOfflineRetry';
import { OfflineBanner } from '../../components/common/OfflineNotice';

/**
 * Analytics, compact (Oct 2026): live readings, the period's total with a
 * stacked daily chart, and a short bill breakdown.
 *
 * Removed on request: Usage by Appliance, Outlet Comparison, Budget Progress
 * and Insights. The per-outlet split lives in the chart (Outlet 1 under
 * Outlet 2), budget lives on the Budget tab, and the per-appliance breakdown
 * on the monthly statement.
 */

const TABS = ['Daily', 'Weekly', 'Monthly'];

// Matches the Outlets tab's staleness window, so both screens agree on whether
// the hardware is currently reporting.
const HARDWARE_STALE_THRESHOLD_MS = 12000;

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

const buildDateRange = (startDate, endDate) => {
  const days = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

// Shared by the fetch effect and the compute memo so the queried window and the
// charted window can never drift apart.
const getTabRange = (tab) => {
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);

  const startDate = tab === 'Weekly'
    ? addDays(endDate, -6)
    : new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  return { startDate, endDate };
};

const formatShortDate = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const formatWeekday = (date) => date.toLocaleDateString('en-US', { weekday: 'short' });

const formatPeakHour = (hourValue) => {
  if (hourValue === null || hourValue === undefined || hourValue === '') return null;
  const hour = Number(hourValue);
  if (!Number.isFinite(hour)) return null;
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12} ${period}`;
};

const kwh = (value, digits = 2) => `${toNumber(value).toFixed(digits)} kWh`;

/** Today's split between the two outlets, for the Daily view. */
const OutletSplit = ({ outlet1, outlet2 }) => {
  const total = outlet1 + outlet2;
  return (
    <View style={styles.split}>
      {[[1, outlet1], [2, outlet2]].map(([number, value]) => {
        const share = total > 0 ? (value / total) * 100 : 0;
        return (
          <View key={number} style={styles.splitRow}>
            <View style={[styles.splitSwatch, { backgroundColor: CHART_COLORS.series[number - 1] }]} />
            <Text style={styles.splitLabel}>Outlet {number}</Text>
            <View style={styles.splitTrack}>
              {share > 0 ? (
                <View
                  style={[
                    styles.splitFill,
                    { width: `${Math.max(3, share)}%`, backgroundColor: CHART_COLORS.series[number - 1] },
                  ]}
                />
              ) : null}
            </View>
            <Text style={styles.splitValue}>{kwh(value, 3)}</Text>
          </View>
        );
      })}
    </View>
  );
};

const Stat = ({ label, value }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
  </View>
);

export const AnalyticsScreen = ({ navigation }) => {
  const { user, loading: authLoading } = useAuth();
  const [selectedTab, setSelectedTab] = useState('Daily');
  const [rangeEntries, setRangeEntries] = useState([]);
  // Last rolled-up day, named only when today has measured nothing yet.
  const [fallbackDaily, setFallbackDaily] = useState(null);
  const [rateProfileId, setRateProfileId] = useState(null);
  const [supplyRates, setSupplyRates] = useState(null);
  const [hasSupplyRates, setHasSupplyRates] = useState(true);
  const rateNotice = useDismissibleNotice('rate-notice');
  const webNotice = useDismissibleNotice('analytics-web-app');
  const showRateNotice = !hasSupplyRates && rateNotice.visible;

  // The analytics fetch lives inside its effect rather than in a callback, so
  // this is what re-runs it: bumping the tick is the retry. See useOfflineRetry.
  const [retryTick, setRetryTick] = useState(0);
  // A flat chart and a zero bill are measurements. Neither may be drawn from a
  // range that could not be read.
  const load = useLoadOutcome();
  useOfflineRetry(load.showOfflineState, () => setRetryTick((tick) => tick + 1));

  const [outlets, setOutlets] = useState([]);

  // Today, assembled from live outlet telemetry rather than waiting for the
  // midnight rollup to write a history_daily document.
  const liveTodayEntry = useMemo(
    () => buildLiveTodayEntry(outlets, { rateProfileId, supplyRates }),
    [outlets, rateProfileId, supplyRates]
  );

  const liveAppliances = useMemo(
    () => buildLiveAppliances(outlets, { rateProfileId, supplyRates }),
    [outlets, rateProfileId, supplyRates]
  );

  // Telemetry arrives every couple of seconds while the device is connected.
  const telemetryIsStale = !outlets.some((outlet) => {
    const updatedMs = Number(outlet?.metricsUpdatedAtMs) || 0;
    return updatedMs > 0 && Date.now() - updatedMs < HARDWARE_STALE_THRESHOLD_MS;
  });

  // Zeroed rather than carried forward once the Hub stops posting. `power` is a
  // stored field, not a stream - it holds its last value indefinitely.
  const liveTotalPowerW = telemetryIsStale
    ? 0
    : liveAppliances.reduce((sum, item) => sum + toNumber(item.powerW), 0);
  const liveCostPerHour = telemetryIsStale
    ? 0
    : liveAppliances.reduce((sum, item) => sum + toNumber(item.costPerHour), 0);

  useEffect(() => {
    if (!user?.uid) {
      setRateProfileId(null);
      return undefined;
    }

    let active = true;

    userService.getUserPreferences(user.uid).then((result) => {
      if (!active || !result.success) return;
      setRateProfileId(result.data.rateProfileId || null);
      setSupplyRates(result.data.supplyRates || null);
      setHasSupplyRates(result.data.hasSupplyRates !== false);
    });

    // Live outlet telemetry. This is what makes today's usage appear
    // immediately instead of waiting for the midnight rollup.
    const unsubscribeOutlets = outletService.subscribeToOutlets(
      user.uid,
      (nextOutlets) => {
        if (active) setOutlets(nextOutlets);
      },
      (error) => console.error('Analytics outlet subscription error:', error)
    );

    return () => {
      active = false;
      unsubscribeOutlets();
    };
  }, [user?.uid]);

  // Fetch only. Kept off the live telemetry path on purpose: recomputing is
  // cheap, but re-querying Firestore on every sensor reading is not.
  useEffect(() => {
    if (authLoading) return undefined;

    if (!user?.uid) {
      setRangeEntries([]);
      setFallbackDaily(null);
      return undefined;
    }

    let active = true;

    const fetchAnalytics = async () => {
      try {
        if (selectedTab === 'Daily') {
          // Only needed to name the last measured day when today has nothing.
          const dailyResult = await historyService.getDailyUsage(user.uid, {}, null, 1);
          if (!active) return;
          if (!dailyResult.success) {
            load.failed(dailyResult);
            return;
          }
          setFallbackDaily(dailyResult.data.length ? dailyResult.data[0] : null);
          setRangeEntries([]);
          load.succeeded();
          return;
        }

        const { startDate, endDate } = getTabRange(selectedTab);
        const rangeResult = await historyService.getUsageByDateRange(
          user.uid,
          toDateKey(startDate),
          toDateKey(endDate)
        );
        if (!active) return;

        // An empty array here is a real answer - the range held no usage - and
        // was previously also what a failed read produced.
        if (rangeResult.success) {
          setRangeEntries(rangeResult.data);
          load.succeeded();
        } else {
          load.failed(rangeResult);
        }
      } catch (error) {
        console.error('Error loading analytics:', error);
        load.failed(error);
      }
    };

    fetchAnalytics();

    return () => {
      active = false;
    };
  }, [authLoading, selectedTab, user?.uid, retryTick]);

  // Compute from stored history plus the live day. This re-runs on every
  // telemetry update, which is what makes today's figures move in real time.
  const analytics = useMemo(() => {
    if (selectedTab === 'Daily') {
      // Today, and only today - never the last rolled-up day borrowed under a
      // "Daily" heading (0e59ed2). A quiet day reports zero, and the note names
      // when the last measured day actually was.
      const dailyEntry = liveTodayEntry;
      const lastMeasuredLabel = !dailyEntry && fallbackDaily?.date
        ? formatShortDate(new Date(`${fallbackDaily.date}T00:00:00`))
        : '';

      const totalEnergy = toNumber(dailyEntry?.totalEnergy);
      const entryDate = dailyEntry?.date ? new Date(`${dailyEntry.date}T00:00:00`) : new Date();
      // Marginal: a day is not a billing period, so the once-a-month metering
      // charge does not belong in it.
      const bill = calculatePelcoIIIBill(totalEnergy, {
        date: entryDate,
        supplyRates,
        profileId: rateProfileId || null,
        includePeriodFlats: false,
        daysInPeriod: dailyEntry ? 1 : 0,
        billingDays: getDaysInMonth(entryDate),
      });

      return {
        totalEnergy,
        totalCost: bill.totals.total,
        periodLabel: `Today · ${formatShortDate(entryDate)}`,
        outlet1: toNumber(dailyEntry?.outlet1Energy),
        outlet2: toNumber(dailyEntry?.outlet2Energy),
        peakHour: formatPeakHour(dailyEntry?.peakHour),
        note: lastMeasuredLabel ? `Nothing measured yet today. Last usage: ${lastMeasuredLabel}.` : '',
        bars: null,
        bill,
      };
    }

    const { startDate, endDate } = getTabRange(selectedTab);
    // Today has no rolled-up document until midnight, so splice in the live
    // figure - otherwise the current day always charted as zero.
    const entries = withLiveToday(rangeEntries, liveTodayEntry);
    const entriesByDate = new Map(entries.map((entry) => [entry.date, entry]));
    const days = buildDateRange(startDate, endDate);
    const isWeekly = selectedTab === 'Weekly';

    // Day by day for both views - the month as 28-31 thin bars rather than
    // 7-day blocks, now that each bar no longer carries a printed value.
    const bars = days.map((day) => {
      const entry = entriesByDate.get(toDateKey(day));
      const date = day.getDate();
      return {
        key: toDateKey(day),
        label: `${formatWeekday(day)}, ${formatShortDate(day)}`,
        shortLabel: isWeekly ? formatWeekday(day) : String(date),
        showLabel: isWeekly || date === 1 || date % 5 === 0,
        o1: toNumber(entry?.outlet1Energy),
        o2: toNumber(entry?.outlet2Energy),
        total: toNumber(entry?.totalEnergy),
      };
    });

    const totalEnergy = bars.reduce((sum, bar) => sum + bar.total, 0);
    const peak = bars.reduce((best, bar) => (bar.total > (best?.total || 0) ? bar : best), null);

    // Monthly is the only tab that is a billing period, so it is the only one
    // that carries the period flats and reports a true effective rate.
    const isBillingPeriod = selectedTab === 'Monthly';
    const bill = calculatePelcoIIIBill(totalEnergy, {
      date: endDate,
      supplyRates,
      profileId: rateProfileId || null,
      includePeriodFlats: isBillingPeriod && totalEnergy > 0,
      daysInPeriod: entries.length > 0 ? days.length : 0,
      billingDays: getDaysInMonth(endDate),
    });

    return {
      totalEnergy,
      totalCost: bill.totals.total,
      // Which stretch of time this total covers. "Monthly" runs from the 1st
      // to today, so on the 1st it is a single day - correct, and confusing
      // unless it says so.
      periodLabel: days.length === 1
        ? formatShortDate(startDate)
        : `${formatShortDate(startDate)} – ${formatShortDate(endDate)} · ${days.length} days`,
      average: days.length ? totalEnergy / days.length : 0,
      peak,
      note: '',
      bars,
      bill,
    };
  }, [selectedTab, rangeEntries, fallbackDaily, liveTodayEntry, rateProfileId, supplyRates]);

  const offline = load.showOfflineState;
  const isMonthly = selectedTab === 'Monthly';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Analytics</Text>
            <Text style={styles.subtitle}>Priced on the PELCO III residential tariff</Text>
          </View>
          {/* Moved here from Home when it was removed (Oct 2026). */}
          <TouchableOpacity
            style={styles.compareButton}
            onPress={() => navigation?.navigate?.('ReferenceComparison')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Compare months"
          >
            <Ionicons name="git-compare-outline" size={17} color={COLORS.primary} />
            <Text style={styles.compareText}>Compare</Text>
          </TouchableOpacity>
        </View>

        {showRateNotice && (
          <RateNotice
            style={styles.notice}
            onPress={() => navigation?.navigate?.('Settings')}
            onDismiss={rateNotice.dismiss}
          />
        )}

        {/* One banner at a time, and the rate warning outranks this. */}
        {!showRateNotice && webNotice.visible && (
          <WebAppNotice
            style={styles.notice}
            title="Easier on a bigger screen"
            body="These charts open up on a laptop or desktop - the same data, with more room."
            url={WEB_APP_LINKS.analytics}
            onDismiss={webNotice.dismiss}
          />
        )}

        {/* "No signal" (the Hub stopped reporting) and "no connection" (the
            phone cannot reach Firestore) are different facts; both can be true
            at once, so they are reported separately. */}
        {offline && (
          <OfflineBanner style={styles.notice} message="No connection — totals and charts can't be loaded right now." />
        )}

        <LiveUsagePanel
          appliances={liveAppliances}
          totalPowerW={liveTotalPowerW}
          costPerHour={liveCostPerHour}
          isStale={telemetryIsStale}
        />

        <View style={styles.tabsContainer}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, selectedTab === tab && styles.tabActive]}
              onPress={() => setSelectedTab(tab)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedTab === tab }}
            >
              <Text style={[styles.tabText, selectedTab === tab && styles.tabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Total energy for the period and its chart, in one card. A headline
            total is the number a reader takes away, so it is dashed - not
            zeroed - when the period could not be read. */}
        <View style={styles.usageCard}>
          <Text style={styles.usageLabel}>Total energy</Text>
          <View style={styles.usageTop}>
            <Text style={styles.usageValue}>
              {offline ? '—' : toNumber(analytics.totalEnergy).toFixed(2)}
              {offline ? null : <Text style={styles.usageUnit}> kWh</Text>}
            </Text>
            <View style={styles.costBadge}>
              <Text style={styles.costValue}>{offline ? '—' : formatCurrency(analytics.totalCost)}</Text>
              <Text style={styles.costLabel}>{isMonthly ? 'estimated bill' : 'estimated cost'}</Text>
            </View>
          </View>
          {!offline ? <Text style={styles.period}>{analytics.periodLabel}</Text> : null}
          {analytics.note && !offline ? <Text style={styles.note}>{analytics.note}</Text> : null}

          {!offline && analytics.bars ? (
            <>
              <View style={styles.stats}>
                <Stat label="Daily average" value={kwh(analytics.average)} />
                <Stat
                  label={analytics.peak ? `Peak · ${analytics.peak.label.split(', ')[1]}` : 'Peak day'}
                  value={analytics.peak ? kwh(analytics.peak.total) : '—'}
                />
                <Stat
                  label={isMonthly ? 'Effective rate' : 'Per extra kWh'}
                  value={`₱${toNumber(analytics.bill.effectiveRate).toFixed(2)}`}
                />
              </View>
              <View style={styles.chart}>
                <UsageBarChart bars={analytics.bars} />
              </View>
            </>
          ) : null}

          {!offline && !analytics.bars ? (
            <>
              <OutletSplit outlet1={analytics.outlet1} outlet2={analytics.outlet2} />
              {analytics.peakHour ? (
                <Text style={styles.peakHour}>Busiest hour so far: {analytics.peakHour}</Text>
              ) : null}
            </>
          ) : null}
        </View>

        {!offline && analytics.totalEnergy > 0 ? (
          <BillBreakdown
            bill={analytics.bill}
            rate={analytics.bill.effectiveRate}
            // Only Monthly carries the period flats, so only Monthly's figure
            // is what the period actually worked out at; the others are what
            // the next kWh costs.
            rateLabel={isMonthly ? 'Effective rate' : 'Rate per additional kWh'}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  notice: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  compareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#ECF8EF',
  },
  compareText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: COLORS.textLight,
  },
  tabTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  usageCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  usageLabel: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  usageTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  usageValue: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.text,
  },
  usageUnit: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  costBadge: {
    alignItems: 'flex-end',
    backgroundColor: '#ECF8EF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  costValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  costLabel: {
    fontSize: 10.5,
    color: COLORS.primaryDark,
  },
  period: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  note: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 6,
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  statValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 10.5,
    color: COLORS.textLight,
    marginTop: 1,
  },
  chart: {
    marginTop: 14,
  },
  split: {
    marginTop: 12,
    gap: 10,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  splitSwatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  splitLabel: {
    width: 62,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  splitTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: CHART_COLORS.grid,
    overflow: 'hidden',
  },
  splitFill: {
    height: '100%',
    borderRadius: 5,
  },
  splitValue: {
    width: 78,
    textAlign: 'right',
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.text,
  },
  peakHour: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 10,
  },
});

export default AnalyticsScreen;
