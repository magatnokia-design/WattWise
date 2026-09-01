import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, CHART_COLORS } from '../../constants/colors';
import { FONTS, SIZES } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import {
  budgetService,
  historyService,
  outletService,
  userService,
} from '../../services/firebase';
import { calculatePelcoIIIBill } from '../../utils/billing';
import { buildLiveAppliances, buildLiveTodayEntry, withLiveToday } from '../../utils/liveUsage';
import { formatCurrency } from '../BudgetTracking/utils/budgetHelpers';
import LiveUsagePanel from './components/LiveUsagePanel';
import InsightsCard from './components/InsightsCard';
import { RateNotice } from '../../components/common/RateNotice';
import { WebAppNotice } from '../../components/common/WebAppNotice';
import { WEB_APP_LINKS } from '../../constants/webApp';
import { useDismissibleNotice } from '../../hooks/useDismissibleNotice';
import { useLoadOutcome } from '../../hooks/useLoadTracker';
import { OfflineBanner } from '../../components/common/OfflineNotice';

const { width } = Dimensions.get('window');

const TABS = ['Daily', 'Weekly', 'Monthly'];

// Matches the dashboard's staleness window, so both screens agree on whether
// the hardware is currently reporting.
const HARDWARE_STALE_THRESHOLD_MS = 12000;

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

/**
 * Builds the situational insight list. Every entry is conditional: an insight
 * only appears when the data actually supports it, so the card never states
 * something the numbers cannot back up.
 *
 * Each insight carries a `signature` combining its key with the figures it
 * quotes. That is what dismissal is keyed on, so hiding "on pace for P500"
 * does not also hide "on pace for P900" when the situation worsens.
 */
const buildInsights = ({
  summary,
  budget,
  selectedTab,
  chartData,
  chartLabels,
  liveAppliances = [],
  isLive = false,
}) => {
  const insights = [];
  const totalEnergy = toNumber(summary.totalEnergy);

  const add = (key, stamp, entry) => {
    insights.push({ key, signature: `${key}:${stamp}`, ...entry });
  };

  // Live status first - it is the only part that reflects this moment rather
  // than the selected period.
  const drawing = liveAppliances.filter((appliance) => appliance.isDrawing);
  const idleOn = liveAppliances.filter((appliance) => appliance.isOn && !appliance.isDrawing);

  if (isLive && drawing.length > 0) {
    const livePower = drawing.reduce((sum, appliance) => sum + toNumber(appliance.powerW), 0);
    const liveCostPerHour = drawing.reduce((sum, appliance) => sum + toNumber(appliance.costPerHour), 0);
    // Slot-qualified, because two outlets may carry the same appliance name and
    // "LED Lamp and LED Lamp are drawing 29 W" tells the reader nothing about
    // which socket to go and look at.
    const names = drawing
      .map((appliance) => appliance.displayLabel || appliance.applianceName)
      .join(' and ');

    add('live-draw', `${Math.round(livePower / 5) * 5}`, {
      icon: '⚡',
      tone: 'good',
      text: `${names} ${drawing.length > 1 ? 'are' : 'is'} drawing ${livePower.toFixed(1)} W right now, about ${formatCurrency(liveCostPerHour)} per hour if it keeps running.`,
    });
  }

  if (isLive && idleOn.length > 0) {
    add('idle-outlet', idleOn.map((appliance) => appliance.outletNumber).join('-'), {
      icon: '🔌',
      tone: 'warn',
      text: `Outlet ${idleOn.map((appliance) => appliance.outletNumber).join(' and ')} ${idleOn.length > 1 ? 'are' : 'is'} switched on but nothing is drawing power. Turning ${idleOn.length > 1 ? 'them' : 'it'} off costs you nothing to try.`,
    });
  }

  if (totalEnergy <= 0) return insights;

  // Biggest consumer for the period.
  const topAppliance = summary.applianceUsage?.[0];
  if (topAppliance && topAppliance.energyKwh > 0) {
    const share = (topAppliance.energyKwh / totalEnergy) * 100;
    add('top-appliance', `${topAppliance.applianceName}:${share.toFixed(0)}`, {
      icon: '📌',
      tone: 'neutral',
      text: `${topAppliance.applianceName} is your biggest consumer at ${share.toFixed(0)}% of usage (${formatCurrency(topAppliance.cost)}).`,
    });
  }

  // Outlet imbalance, only when one side is meaningfully heavier.
  const energy1 = toNumber(summary.outlet1Total);
  const energy2 = toNumber(summary.outlet2Total);
  const heavier = energy1 >= energy2 ? 1 : 2;
  const lighter = Math.min(energy1, energy2);
  if (lighter > 0.01) {
    const ratio = Math.max(energy1, energy2) / lighter;
    if (ratio >= 1.5) {
      add('imbalance', `${heavier}:${ratio.toFixed(1)}`, {
        icon: '⚖️',
        tone: 'neutral',
        text: `Outlet ${heavier} is drawing ${ratio.toFixed(1)}x more than Outlet ${heavier === 1 ? 2 : 1}.`,
      });
    }
  }

  // Peak day within the charted range.
  const peakIndex = chartData.reduce(
    (best, value, index) => (toNumber(value) > toNumber(chartData[best]) ? index : best),
    0
  );
  if (chartData.length > 1 && toNumber(chartData[peakIndex]) > 0 && chartLabels[peakIndex]) {
    add('peak', `${chartLabels[peakIndex]}:${toNumber(chartData[peakIndex]).toFixed(2)}`, {
      icon: '📈',
      tone: 'neutral',
      text: `Highest usage was ${chartLabels[peakIndex]} at ${toNumber(chartData[peakIndex]).toFixed(2)} kWh.`,
    });
  }

  // Month-end projection against the configured budget.
  const monthlyBudget = toNumber(budget.monthlyBudget);
  const currentSpending = toNumber(budget.currentSpending);
  if (monthlyBudget > 0 && currentSpending > 0) {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = getDaysInMonth(now);
    const projected = (currentSpending / dayOfMonth) * daysInMonth;
    const projectedPercent = (projected / monthlyBudget) * 100;

    add('projection', `${Math.round(projectedPercent / 5) * 5}`, {
      icon: projectedPercent > 100 ? '⚠️' : '🎯',
      tone: projectedPercent > 100 ? 'alert' : 'good',
      text: projectedPercent > 100
        ? `On pace for ${formatCurrency(projected)} by month end - ${(projectedPercent - 100).toFixed(0)}% over your ${formatCurrency(monthlyBudget)} budget.`
        : `On pace for ${formatCurrency(projected)} by month end, ${projectedPercent.toFixed(0)}% of your ${formatCurrency(monthlyBudget)} budget.`,
    });
  } else if (monthlyBudget <= 0) {
    add('no-budget', 'unset', {
      icon: '🎯',
      tone: 'neutral',
      text: 'Set a monthly budget to see whether your usage is on track.',
    });
  }

  // The rate that makes the total explainable - but the two tabs mean different
  // things by "rate", so they must not use the same sentence.
  //
  // Monthly is a billing period: its rate includes the once-a-month P5.00
  // metering charge, so "effectively paying" is true. Daily and Weekly exclude
  // it, so their figure is what one more kWh costs, not what the period averaged
  // out at. Calling that "effectively paying" would state the smaller number as
  // the bill rate and understate it.
  const effectiveRate = toNumber(summary.effectiveRate);
  if (effectiveRate > 0) {
    const isBillingPeriod = selectedTab === 'Monthly';

    add('rate', `${selectedTab}:${effectiveRate.toFixed(2)}`, {
      icon: '💰',
      tone: 'neutral',
      text: isBillingPeriod
        ? `You are effectively paying ${formatCurrency(effectiveRate)} per kWh this monthly period.`
        : `${formatCurrency(effectiveRate)} per additional kWh.`,
    });
  }

  return insights;
};

/**
 * Rolls the per-day applianceBreakdown written by processDailyRollup into one
 * list for the selected range, largest consumer first.
 */
const aggregateApplianceUsage = (entries) => {
  const totals = new Map();

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const breakdown = Array.isArray(entry?.applianceBreakdown) ? entry.applianceBreakdown : [];

    breakdown.forEach((item) => {
      const name = String(item?.applianceName || '').trim();
      const energyKwh = toNumber(item?.energyKwh);
      if (!name || energyKwh <= 0) return;

      const existing = totals.get(name) || { applianceName: name, energyKwh: 0, cost: 0 };
      existing.energyKwh += energyKwh;
      existing.cost += toNumber(item?.cost);
      totals.set(name, existing);
    });
  });

  return Array.from(totals.values()).sort((a, b) => b.energyKwh - a.energyKwh);
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

const getDaysInMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

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

const formatShortDate = (date) => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatWeekday = (date) => {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

const formatPeakHour = (hourValue) => {
  const hour = Number(hourValue);
  if (!Number.isFinite(hour)) return 'N/A';
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:00 ${period}`;
};

// Custom Simple Bar Chart Component (no library)
const SimpleBarChart = ({ data, labels }) => {
  const maxValue = Math.max(...data, 1); // Avoid division by zero
  
  return (
    <View style={styles.customChart}>
      <View style={styles.chartBars}>
        {data.map((value, index) => {
          const numericValue = Number(value);
          const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
          const barHeight = maxValue > 0 ? (safeValue / maxValue) * 150 : 0;
          const displayValue = Number.isFinite(numericValue)
            ? numericValue.toFixed(2)
            : '0.00';
          return (
            <View key={index} style={styles.barContainer}>
              <Text style={styles.barValue}>{displayValue}</Text>
              <View style={styles.barWrapper}>
                <View style={[styles.bar, { height: barHeight || 4 }]} />
              </View>
              <Text style={styles.barLabel}>{labels[index]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const BillBreakdownSection = ({ title, items, total }) => {
  if (!items || items.length === 0) return null;

  return (
    <View style={styles.breakdownSection}>
      <View style={styles.breakdownSectionHeader}>
        <Text style={styles.breakdownSectionTitle}>{title}</Text>
        <Text style={styles.breakdownSectionTotal}>{formatCurrency(total)}</Text>
      </View>
      {items.map((item) => (
        <View key={item.key} style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{item.label}</Text>
          <Text style={styles.breakdownValue}>{formatCurrency(item.amount)}</Text>
        </View>
      ))}
    </View>
  );
};

/**
 * Outlet split for the selected period. Cost per outlet uses
 * energy x effectiveRate, matching how processDailyRollup splits the bill so
 * these figures agree with Budget and the daily receipt email.
 */
const OutletComparisonCard = ({ outlet1Energy, outlet2Energy, effectiveRate, appliance1, appliance2 }) => {
  const energy1 = Number(outlet1Energy) || 0;
  const energy2 = Number(outlet2Energy) || 0;
  const total = energy1 + energy2;
  const hasData = total > 0;

  const rate = Number(effectiveRate) || 0;
  const cost1 = energy1 * rate;
  const cost2 = energy2 * rate;

  const outlet1Percent = hasData ? (energy1 / total) * 100 : 0;
  const outlet2Percent = hasData ? 100 - outlet1Percent : 0;

  const heavier = energy1 >= energy2 ? 1 : 2;
  const heavierEnergy = Math.max(energy1, energy2);
  const lighterEnergy = Math.min(energy1, energy2);
  // Only claim a ratio when the smaller side is non-trivial, otherwise "12x"
  // is just noise from a near-idle outlet.
  const ratio = lighterEnergy > 0.01 ? heavierEnergy / lighterEnergy : null;

  return (
    <View style={styles.comparisonCard}>
      <View style={styles.comparisonRow}>
        <View style={styles.comparisonItem}>
          <View style={[styles.comparisonDot, { backgroundColor: CHART_COLORS.series[0] }]} />
          <View style={styles.comparisonInfo}>
            <Text style={styles.comparisonLabel} numberOfLines={1}>
              {appliance1 || 'Outlet 1'}
            </Text>
            <Text style={styles.comparisonValue}>{energy1.toFixed(2)} kWh</Text>
            <Text style={styles.comparisonCost}>{formatCurrency(cost1)}</Text>
          </View>
        </View>
        <View style={styles.comparisonItem}>
          <View style={[styles.comparisonDot, { backgroundColor: CHART_COLORS.series[1] }]} />
          <View style={styles.comparisonInfo}>
            <Text style={styles.comparisonLabel} numberOfLines={1}>
              {appliance2 || 'Outlet 2'}
            </Text>
            <Text style={styles.comparisonValue}>{energy2.toFixed(2)} kWh</Text>
            <Text style={styles.comparisonCost}>{formatCurrency(cost2)}</Text>
          </View>
        </View>
      </View>

      {hasData ? (
        <>
          {/* Two adjacent fills get a surface gap between them so the boundary
              stays visible rather than reading as one continuous bar. */}
          <View style={styles.comparisonBar}>
            <View style={[styles.comparisonFill, {
              width: `${outlet1Percent}%`,
              backgroundColor: CHART_COLORS.series[0],
            }]} />
            <View style={styles.comparisonFillGap} />
            <View style={[styles.comparisonFill, {
              width: `${outlet2Percent}%`,
              backgroundColor: CHART_COLORS.series[1],
            }]} />
          </View>
          <View style={styles.comparisonSplitRow}>
            <Text style={styles.comparisonSplitText}>
              {outlet1Percent.toFixed(0)}% / {outlet2Percent.toFixed(0)}%
            </Text>
            {ratio && ratio >= 1.2 ? (
              <Text style={styles.comparisonSplitText}>
                Outlet {heavier} used {ratio.toFixed(1)}x more
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        <View style={styles.comparisonEmpty}>
          <Text style={styles.comparisonEmptyText}>
            No usage recorded for this period yet. A comparison needs two periods
            with measurements in them, so this fills in once WattWise has been
            running for a second day.
          </Text>
        </View>
      )}
    </View>
  );
};

export const AnalyticsScreen = ({ navigation }) => {
  const { user, loading: authLoading } = useAuth();
  const [selectedTab, setSelectedTab] = useState('Daily');
  const [rangeEntries, setRangeEntries] = useState([]);
  // Last rolled-up day, shown only when today has measured nothing yet.
  const [fallbackDaily, setFallbackDaily] = useState(null);
  const [rateProfileId, setRateProfileId] = useState(null);
  const [supplyRates, setSupplyRates] = useState(null);
  const [hasSupplyRates, setHasSupplyRates] = useState(true);
  const rateNotice = useDismissibleNotice('rate-notice');
  const webNotice = useDismissibleNotice('analytics-web-app');
  const showRateNotice = !hasSupplyRates && rateNotice.visible;
  const [budget, setBudget] = useState({ monthlyBudget: 0, currentSpending: 0 });
  const [loading, setLoading] = useState(false);
  // A flat chart and a zero bill are measurements. Neither may be drawn from a
  // range that could not be read.
  const load = useLoadOutcome();
  const [outlets, setOutlets] = useState([]);
  // Insights are dismissed by signature, so an insight returns when the figures
  // it quotes change. Session-scoped on purpose: a new day should start clean.
  const [dismissedInsights, setDismissedInsights] = useState([]);

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
  // stored field, not a stream - it holds its last value indefinitely, so summing
  // it after telemetry stops totals a load that is no longer connected. Home
  // already zeroes on this same condition through buildOutletMetrics, and the two
  // screens disagreeing is what put "14.1 W drawing now" on Analytics opposite
  // "0.0 W - No reading" on Home, for the same outlet at the same moment.
  const liveTotalPowerW = telemetryIsStale
    ? 0
    : liveAppliances.reduce((sum, item) => sum + toNumber(item.powerW), 0);
  const liveCostPerHour = telemetryIsStale
    ? 0
    : liveAppliances.reduce((sum, item) => sum + toNumber(item.costPerHour), 0);

  useEffect(() => {
    if (!user?.uid) {
      setBudget({ monthlyBudget: 0, currentSpending: 0 });
      setRateProfileId(null);
      return;
    }

    let active = true;

    const fetchBudget = async () => {
      const result = await budgetService.getCurrentMonthBudget(user.uid);
      if (!active) return;

      if (result.success) {
        setBudget({
          monthlyBudget: toNumber(result.data.monthlyBudget),
          currentSpending: toNumber(result.data.currentSpending),
        });
      }
    };

    fetchBudget();

    const fetchPreferences = async () => {
      const result = await userService.getUserPreferences(user.uid);
      if (!active) return;

      if (result.success) {
        setRateProfileId(result.data.rateProfileId || null);
        setSupplyRates(result.data.supplyRates || null);
        setHasSupplyRates(result.data.hasSupplyRates === true);
      }
    };

    fetchPreferences();

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
    if (authLoading) return;

    if (!user?.uid) {
      setRangeEntries([]);
      setFallbackDaily(null);
      return;
    }

    let active = true;

    const fetchAnalytics = async () => {
      setLoading(true);

      try {
        if (selectedTab === 'Daily') {
          // Only needed as a fallback for when nothing has been measured today.
          const dailyResult = await historyService.getDailyUsage(user.uid, {}, null, 1);
          if (!active) return;

          if (!dailyResult.success) {
            // Leaves the previous figure alone rather than nulling it, which
            // renders as a measured zero for today.
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
        // was previously also what a failed read produced, so an unreachable
        // backend drew a flat chart and a zero bill for the month.
        if (rangeResult.success) {
          setRangeEntries(rangeResult.data);
          load.succeeded();
        } else {
          load.failed(rangeResult);
        }
      } catch (error) {
        console.error('Error loading analytics:', error);
        load.failed(error);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchAnalytics();

    return () => {
      active = false;
    };
  }, [authLoading, selectedTab, user?.uid]);

  // Compute from stored history plus the live day. This re-runs on every
  // telemetry update, which is what makes today's figures move in real time.
  const analytics = useMemo(() => {
    if (selectedTab === 'Daily') {
      // Today, and only today. This read `liveTodayEntry || fallbackDaily`, so
      // on a day with no consumption yet it substituted the last rolled-up day
      // and printed it under a "Daily" badge with nothing naming the date - on
      // 29 Aug it showed 28 Aug’s 0.01 kWh and P0.09 as though they were
      // today’s. That is the same substitution 9069b9e removed from the
      // dashboard; Analytics kept its own copy of it.
      //
      // A quiet day is information. It reports as zero, and the note below says
      // when the last measured day actually was, so the figure is never silently
      // borrowed from another date.
      const dailyEntry = liveTodayEntry;

      const lastMeasuredLabel = !dailyEntry && fallbackDaily?.date
        ? formatShortDate(new Date(`${fallbackDaily.date}T00:00:00`))
        : '';

      const totalEnergy = toNumber(dailyEntry?.totalEnergy);
      const outlet1Total = toNumber(dailyEntry?.outlet1Energy);
      const outlet2Total = toNumber(dailyEntry?.outlet2Energy);
      const entryDate = dailyEntry?.date
        ? new Date(`${dailyEntry.date}T00:00:00`)
        : new Date();
      // Marginal: a day is not a billing period, so the once-a-month P5.00
      // metering charge does not belong in it. Charged here, a day on which
      // almost nothing ran was priced at P5.61 for 0.001 kWh.
      const bill = calculatePelcoIIIBill(totalEnergy, {
        date: entryDate,
        supplyRates,
        profileId: rateProfileId || null,
        includePeriodFlats: false,
        daysInPeriod: dailyEntry ? 1 : 0,
        billingDays: getDaysInMonth(entryDate),
      });

      return {
        summary: {
          totalEnergy,
          totalCost: bill.totals.total,
          averageUsage: totalEnergy,
          peakUsage: totalEnergy,
          peakHour: formatPeakHour(dailyEntry?.peakHour),
          bestDay: dailyEntry?.date ? formatShortDate(entryDate) : 'N/A',
          outlet1Total,
          outlet2Total,
          effectiveRate: bill.effectiveRate,
          applianceUsage: aggregateApplianceUsage(dailyEntry ? [dailyEntry] : []),
          outlet1Name: String(dailyEntry?.outlet1Name || '').trim(),
          outlet2Name: String(dailyEntry?.outlet2Name || '').trim(),
          emptyDayNote: lastMeasuredLabel
            ? `Nothing measured today. Last recorded usage was ${lastMeasuredLabel}.`
            : '',
        },
        chartLabels: ['Outlet 1', 'Outlet 2', 'Total'],
        chartData: [outlet1Total, outlet2Total, totalEnergy],
        billDetails: bill,
      };
    }

    const { startDate, endDate } = getTabRange(selectedTab);

    // Today has no rolled-up document until midnight, so splice in the live
    // figure - otherwise the current day always charted as zero.
    const entries = withLiveToday(rangeEntries, liveTodayEntry);
    const entriesByDate = new Map();
    entries.forEach((entry) => {
      entriesByDate.set(entry.date, entry);
    });

    const days = buildDateRange(startDate, endDate);
    const dailyValues = days.map((day) => toNumber(entriesByDate.get(toDateKey(day))?.totalEnergy));

    const totalEnergy = dailyValues.reduce((sum, value) => sum + value, 0);
    const outlet1Total = days.reduce(
      (sum, day) => sum + toNumber(entriesByDate.get(toDateKey(day))?.outlet1Energy),
      0
    );
    const outlet2Total = days.reduce(
      (sum, day) => sum + toNumber(entriesByDate.get(toDateKey(day))?.outlet2Energy),
      0
    );

    const peakUsage = dailyValues.length ? Math.max(...dailyValues) : 0;
    const bestDayData = dailyValues
      .map((value, index) => ({ value, date: days[index] }))
      .filter((item) => item.value > 0)
      .sort((a, b) => a.value - b.value)[0];

    // Monthly is the only tab that is a billing period, so it is the only one
    // that carries the period flats and reports a true effective rate. "The last
    // 7 days" is not a billing period either - Weekly was charging a full
    // month's metering fee, the same error as the day, one scale up.
    const isBillingPeriod = selectedTab === 'Monthly';

    const bill = calculatePelcoIIIBill(totalEnergy, {
      date: endDate,
      supplyRates,
      profileId: rateProfileId || null,
      // ...and only when something was actually measured in it.
      includePeriodFlats: isBillingPeriod && totalEnergy > 0,
      daysInPeriod: entries.length > 0 ? days.length : 0,
      billingDays: getDaysInMonth(endDate),
    });

    const summary = {
      totalEnergy,
      totalCost: bill.totals.total,
      averageUsage: days.length ? totalEnergy / days.length : 0,
      peakUsage,
      peakHour: 'N/A',
      bestDay: bestDayData ? formatShortDate(bestDayData.date) : 'N/A',
      outlet1Total,
      outlet2Total,
      effectiveRate: bill.effectiveRate,
      applianceUsage: aggregateApplianceUsage(entries),
      // Names come from the most recent day in range, so a rename shows the
      // current label rather than a stale one.
      outlet1Name: String(entries[entries.length - 1]?.outlet1Name || '').trim(),
      outlet2Name: String(entries[entries.length - 1]?.outlet2Name || '').trim(),
    };

    if (selectedTab === 'Weekly') {
      return {
        summary,
        chartLabels: days.map(formatWeekday),
        chartData: dailyValues,
        billDetails: bill,
      };
    }

    // The month in 7-day blocks, labelled by the days each one actually covers.
    //
    // This used to be four fixed buckets with `Math.min(3, ...)`, which swept
    // days 29-31 into "Week 4" - a bar ten days wide sitting beside three that
    // were seven, always taller for that reason alone, and labelled as though it
    // were not. Naming the span instead of the week number means the chart
    // cannot misrepresent what it is adding up, whatever the month's length.
    //
    // The web client charts the same month day by day. That is the better view
    // where there is room for 31 bars; this is the phone.
    const blocks = [];
    for (let index = 0; index < dailyValues.length; index += 7) {
      const window = dailyValues.slice(index, index + 7);
      const firstDay = days[index].getDate();
      const lastDay = days[index + window.length - 1].getDate();

      blocks.push({
        label: firstDay === lastDay ? `${firstDay}` : `${firstDay}-${lastDay}`,
        value: window.reduce((sum, value) => sum + value, 0),
      });
    }

    return {
      summary,
      chartLabels: blocks.map((block) => block.label),
      chartData: blocks.map((block) => block.value),
      billDetails: bill,
    };
  }, [selectedTab, rangeEntries, fallbackDaily, liveTodayEntry, rateProfileId, supplyRates]);

  const { summary, chartLabels, chartData, billDetails } = analytics;

  const budgetPercent = budget.monthlyBudget > 0
    ? (budget.currentSpending / budget.monthlyBudget) * 100
    : 0;
  const remainingBudget = Math.max(0, budget.monthlyBudget - budget.currentSpending);
  const showBreakdown = billDetails && summary.totalEnergy > 0;

  const allInsights = useMemo(
    () => buildInsights({
      summary,
      budget,
      selectedTab,
      chartData,
      chartLabels,
      liveAppliances,
      isLive: !telemetryIsStale,
    }),
    [summary, budget, selectedTab, chartData, chartLabels, liveAppliances, telemetryIsStale]
  );

  const insights = allInsights.filter(
    (insight) => !dismissedInsights.includes(insight.signature)
  );

  const handleDismissInsight = (signature) => {
    setDismissedInsights((previous) =>
      previous.includes(signature) ? previous : [...previous, signature]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Analytics</Text>
          <Text style={styles.subtitle}>Track your energy consumption</Text>
          <Text style={styles.tariffNote}>
            Costs computed on the PELCO III residential tariff
          </Text>
        </View>

        {showRateNotice && (
          <RateNotice
            onPress={() => navigation?.navigate?.('Settings')}
            onDismiss={rateNotice.dismiss}
          />
        )}

        {/* Only ever one banner at a time, and the rate warning outranks this:
            wrong peso figures matter more than a nicer place to read charts. */}
        {!showRateNotice && webNotice.visible && (
          <WebAppNotice
            title="Easier on a bigger screen"
            body="These charts open up on a laptop or desktop - the same data, with room to compare outlets side by side."
            url={WEB_APP_LINKS.analytics}
            onDismiss={webNotice.dismiss}
          />
        )}

        {/* A banner rather than replacing the charts: the "No signal" state
            already on this screen means the Hub stopped reporting, which is a
            different fact from the phone being unable to reach Firestore. Both
            can be true at once, and conflating them would tell someone their
            hardware had failed when their wi-fi had. */}
        {load.showOfflineState && (
          <OfflineBanner message="No connection — totals and charts can't be loaded right now." />
        )}

        {/* What is happening right now, straight from live telemetry. */}
        <LiveUsagePanel
          appliances={liveAppliances}
          totalPowerW={liveTotalPowerW}
          costPerHour={liveCostPerHour}
          isStale={telemetryIsStale}
        />

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Total Energy Usage</Text>
            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>{selectedTab}</Text>
            </View>
          </View>
          {/* The banner above already says the totals could not be loaded, and
              this card printed "0.00 kWh / ₱0.00 estimated cost" underneath it
              in the same breath. Two claims on one screen, one of them false.
              The banner was the right choice for the charts - "No signal" (the
              Hub stopped reporting) and "no connection" (the phone cannot reach
              Firestore) are different facts and conflating them would blame the
              hardware for a wi-fi problem - but a headline total is not a
              chart. It is the number a reader takes away. */}
          <Text style={styles.summaryValue}>
            {load.showOfflineState ? '—' : `${summary.totalEnergy.toFixed(2)} kWh`}
          </Text>
          <Text style={styles.summarySubValue}>
            {load.showOfflineState
              ? 'Not loaded — needs a connection'
              : `${formatCurrency(summary.totalCost)} estimated cost`}
          </Text>
          {summary.emptyDayNote && !load.showOfflineState ? (
            <Text style={styles.summaryNote}>{summary.emptyDayNote}</Text>
          ) : null}
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, selectedTab === tab && styles.tabActive]}
              onPress={() => setSelectedTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, selectedTab === tab && styles.tabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Energy Consumption</Text>
            <View style={styles.peakBadge}>
              {/* Same unread condition as the total above: a peak of 0.00 kWh
                  is a measurement nobody took. */}
              <Text style={styles.peakBadgeText}>
                {load.showOfflineState
                  ? 'Peak: —'
                  : `Peak: ${summary.peakUsage.toFixed(2)} kWh`}
              </Text>
            </View>
          </View>
          <SimpleBarChart data={chartData} labels={chartLabels} />
        </View>

        {showBreakdown && (
          <>
            <Text style={styles.sectionTitle}>Bill Breakdown</Text>
            <View style={styles.breakdownCard}>
              <BillBreakdownSection
                title="Generation & Transmission"
                items={billDetails.items.generationTransmission}
                total={billDetails.totals.generationTransmission}
              />
              <BillBreakdownSection
                title="Distribution"
                items={billDetails.items.distribution}
                total={billDetails.totals.distribution}
              />
              <BillBreakdownSection
                title="Government Charges"
                items={billDetails.items.government}
                total={billDetails.totals.government}
              />
              <BillBreakdownSection
                title="Other Charges"
                items={billDetails.items.otherCharges}
                total={billDetails.totals.other}
              />
              <View style={styles.breakdownFooter}>
                <View style={styles.breakdownRow}>
                  {/* Named for what it is on this tab. Only Monthly's figure
                      carries the period flats, so only Monthly's is the rate
                      the period actually worked out at.

                      "for extra use" read as though it meant unusual or
                      excessive consumption. It means the next kWh, under a
                      blocked tariff, so say that. */}
                  <Text style={styles.breakdownLabel}>
                    {selectedTab === 'Monthly' ? 'Effective Rate' : 'Rate per additional kWh'}
                  </Text>
                  <Text style={styles.breakdownValue}>
                    ₱{summary.effectiveRate.toFixed(4)} / kWh
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownFooterLabel}>Total Estimated Bill</Text>
                  <Text style={styles.breakdownFooterValue}>
                    {formatCurrency(billDetails.totals.total)}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Usage per appliance, from the daily rollup breakdown */}
        <Text style={styles.sectionTitle}>Usage by Appliance</Text>
        <View style={styles.applianceCard}>
          {summary.applianceUsage.length === 0 ? (
            <Text style={styles.applianceEmptyText}>
              No appliance usage recorded for this period yet. Plug something in and
              usage appears here as it is measured.
            </Text>
          ) : (
            summary.applianceUsage.map((item, index) => {
              const share = summary.totalEnergy > 0
                ? (item.energyKwh / summary.totalEnergy) * 100
                : 0;

              return (
                <View
                  key={item.applianceName}
                  style={[styles.applianceRow, index > 0 && styles.applianceRowDivider]}
                >
                  <View style={styles.applianceRowTop}>
                    <Text style={styles.applianceName} numberOfLines={1}>
                      {item.applianceName}
                    </Text>
                    <Text style={styles.applianceCost}>{formatCurrency(item.cost)}</Text>
                  </View>
                  <View style={styles.applianceBarTrack}>
                    <View
                      style={[
                        styles.applianceBarFill,
                        { width: `${Math.max(2, Math.min(100, share))}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.applianceMeta}>
                    {item.energyKwh.toFixed(2)} kWh · {share.toFixed(0)}% of total
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Outlet Comparison */}
        <Text style={styles.sectionTitle}>Outlet Comparison</Text>
        <OutletComparisonCard
          outlet1Energy={summary.outlet1Total}
          outlet2Energy={summary.outlet2Total}
          effectiveRate={summary.effectiveRate}
          appliance1={summary.outlet1Name}
          appliance2={summary.outlet2Name}
        />

        {/* Budget Progress */}
        <View style={styles.budgetProgressCard}>
          <View style={styles.budgetProgressHeader}>
            <Text style={styles.budgetProgressTitle}>Budget Progress</Text>
            <Text style={styles.budgetProgressPercent}>{budgetPercent.toFixed(0)}%</Text>
          </View>
          <View style={styles.budgetProgressBar}>
            <View
              style={[
                styles.budgetProgressFill,
                { width: `${Math.min(100, budgetPercent)}%` },
              ]}
            />
          </View>
          <View style={styles.budgetProgressFooter}>
            <Text style={styles.budgetProgressText}>
              {formatCurrency(budget.currentSpending)} used
            </Text>
            <Text style={styles.budgetProgressText}>
              {formatCurrency(remainingBudget)} remaining
            </Text>
          </View>
        </View>

        {/* Insights - conditional on the data, and dismissible once read */}
        <InsightsCard
          insights={insights}
          loading={loading && allInsights.length === 0}
          onDismiss={handleDismissInsight}
          onReset={() => setDismissedInsights([])}
          hasDismissed={dismissedInsights.length > 0}
        />
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
  header: {
    padding: SIZES.padding,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    ...FONTS.h2,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  tariffNote: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  subtitle: {
    ...FONTS.small,
    color: COLORS.textLight,
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: COLORS.primary,
    margin: SIZES.padding,
    padding: SIZES.padding * 1.5,
    borderRadius: SIZES.radius * 1.5,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryTitle: {
    ...FONTS.body,
    color: COLORS.white,
    opacity: 0.9,
  },
  summaryBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  summaryBadgeText: {
    ...FONTS.small,
    color: COLORS.white,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 4,
  },
  summarySubValue: {
    ...FONTS.body,
    color: COLORS.white,
    opacity: 0.8,
  },
  summaryNote: {
    ...FONTS.small,
    color: COLORS.white,
    opacity: 0.85,
    marginTop: 8,
    lineHeight: 17,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: SIZES.padding,
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: SIZES.radius,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabText: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  chartCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SIZES.padding,
    padding: SIZES.padding,
    borderRadius: SIZES.radius,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    ...FONTS.h4,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  peakBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  peakBadgeText: {
    ...FONTS.small,
    color: COLORS.white,
    fontWeight: '600',
  },
  customChart: {
    paddingVertical: 16,
  },
  chartBars: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 180,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barValue: {
    ...FONTS.small,
    color: COLORS.textDark,
    fontWeight: '600',
    marginBottom: 4,
  },
  barWrapper: {
    width: '70%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 150,
  },
  bar: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    ...FONTS.small,
    color: COLORS.textLight,
    marginTop: 8,
  },
  sectionTitle: {
    ...FONTS.h4,
    color: COLORS.textDark,
    fontWeight: 'bold',
    marginHorizontal: SIZES.padding,
    marginBottom: 12,
  },
  breakdownCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SIZES.padding,
    padding: SIZES.padding,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  breakdownSection: {
    marginBottom: 16,
  },
  breakdownSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  breakdownSectionTitle: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  breakdownSectionTotal: {
    ...FONTS.body,
    color: COLORS.primary,
    fontWeight: '600',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  breakdownLabel: {
    ...FONTS.small,
    color: COLORS.textLight,
    flex: 1,
    marginRight: 12,
  },
  breakdownValue: {
    ...FONTS.small,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  breakdownFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  breakdownFooterLabel: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  breakdownFooterValue: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  comparisonCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SIZES.padding,
    padding: SIZES.padding,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  comparisonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  comparisonDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  comparisonInfo: {
    flex: 1,
  },
  comparisonLabel: {
    ...FONTS.small,
    color: COLORS.textLight,
  },
  comparisonValue: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  comparisonBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  comparisonFillGap: {
    width: 2,
    alignSelf: 'stretch',
    backgroundColor: COLORS.white,
  },
  comparisonFill: {
    height: '100%',
  },
  comparisonCost: {
    ...FONTS.small,
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  comparisonSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  comparisonSplitText: {
    ...FONTS.small,
    fontSize: 11,
    color: COLORS.textLight,
  },
  comparisonEmpty: {
    paddingTop: 10,
  },
  comparisonEmptyText: {
    ...FONTS.small,
    color: COLORS.textLight,
  },
  applianceCard: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SIZES.padding,
    marginBottom: 16,
  },
  applianceEmptyText: {
    ...FONTS.small,
    color: COLORS.textLight,
    lineHeight: 18,
  },
  applianceRow: {
    paddingVertical: 10,
  },
  applianceRowDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  applianceRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  applianceName: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 8,
  },
  applianceCost: {
    ...FONTS.body,
    color: COLORS.primary,
    fontWeight: '700',
  },
  applianceBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  applianceBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  applianceMeta: {
    ...FONTS.small,
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 5,
  },
  budgetProgressCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SIZES.padding,
    padding: SIZES.padding,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  budgetProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  budgetProgressTitle: {
    ...FONTS.h4,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  budgetProgressPercent: {
    ...FONTS.h4,
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  budgetProgressBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  budgetProgressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  budgetProgressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  budgetProgressText: {
    ...FONTS.small,
    color: COLORS.textLight,
  },
});