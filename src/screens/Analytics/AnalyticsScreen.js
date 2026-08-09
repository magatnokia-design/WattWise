import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import { FONTS, SIZES } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { budgetService, historyService, userService } from '../../services/firebase';
import { calculatePelcoIIIBill } from '../../utils/billing';
import { formatCurrency } from '../BudgetTracking/utils/budgetHelpers';

const { width } = Dimensions.get('window');

const TABS = ['Daily', 'Weekly', 'Monthly'];

const DEFAULT_SUMMARY = {
  totalEnergy: 0,
  totalCost: 0,
  averageUsage: 0,
  peakUsage: 0,
  peakHour: 'N/A',
  bestDay: 'N/A',
  outlet1Total: 0,
  outlet2Total: 0,
  effectiveRate: 0,
};

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

const StatCard = ({ label, value, icon, trend }) => (
  <View style={styles.statCard}>
    <Text style={styles.statIcon}>{icon}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
    {trend !== undefined && (
      <View style={styles.trendContainer}>
        <Text style={[styles.trendText, trend > 0 ? styles.trendUp : styles.trendDown]}>
          {trend > 0 ? '↑' : trend < 0 ? '↓' : '–'} {Math.abs(trend)}%
        </Text>
      </View>
    )}
  </View>
);

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

const OutletComparisonCard = ({ outlet1, outlet2 }) => {
  const total = parseFloat(outlet1) + parseFloat(outlet2);
  const outlet1Percent = total > 0 ? (parseFloat(outlet1) / total) * 100 : 50;
  
  return (
    <View style={styles.comparisonCard}>
      <Text style={styles.comparisonTitle}>Outlet Comparison</Text>
      <View style={styles.comparisonRow}>
        <View style={styles.comparisonItem}>
          <View style={[styles.comparisonDot, { backgroundColor: COLORS.primary }]} />
          <View style={styles.comparisonInfo}>
            <Text style={styles.comparisonLabel}>Outlet 1</Text>
            <Text style={styles.comparisonValue}>{outlet1} kWh</Text>
          </View>
        </View>
        <View style={styles.comparisonItem}>
          <View style={[styles.comparisonDot, { backgroundColor: COLORS.primaryLight }]} />
          <View style={styles.comparisonInfo}>
            <Text style={styles.comparisonLabel}>Outlet 2</Text>
            <Text style={styles.comparisonValue}>{outlet2} kWh</Text>
          </View>
        </View>
      </View>
      <View style={styles.comparisonBar}>
        <View style={[styles.comparisonFill, { 
          width: `${outlet1Percent}%`, 
          backgroundColor: COLORS.primary 
        }]} />
        <View style={[styles.comparisonFill, { 
          width: `${100 - outlet1Percent}%`, 
          backgroundColor: COLORS.primaryLight 
        }]} />
      </View>
    </View>
  );
};

export const AnalyticsScreen = () => {
  const { user, loading: authLoading } = useAuth();
  const [selectedTab, setSelectedTab] = useState('Daily');
  const [summary, setSummary] = useState(DEFAULT_SUMMARY);
  const [chartLabels, setChartLabels] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [billDetails, setBillDetails] = useState(null);
  const [rateProfileId, setRateProfileId] = useState(null);
  const [budget, setBudget] = useState({ monthlyBudget: 0, currentSpending: 0 });
  const [loading, setLoading] = useState(false);

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
      }
    };

    fetchPreferences();

    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (authLoading) return;

    if (!user?.uid) {
      setSummary(DEFAULT_SUMMARY);
      setChartLabels([]);
      setChartData([]);
      setBillDetails(null);
      return;
    }

    let active = true;

    const applySummary = (nextSummary, nextLabels, nextData, nextBill) => {
      if (!active) return;
      setSummary(nextSummary);
      setChartLabels(nextLabels);
      setChartData(nextData);
      setBillDetails(nextBill || null);
    };

    const fetchAnalytics = async () => {
      setLoading(true);

      try {
        if (selectedTab === 'Daily') {
          const dailyResult = await historyService.getDailyUsage(user.uid, {}, null, 1);
          const dailyEntry = dailyResult.success && dailyResult.data.length
            ? dailyResult.data[0]
            : null;

          const totalEnergy = toNumber(dailyEntry?.totalEnergy);
          const outlet1Total = toNumber(dailyEntry?.outlet1Energy);
          const outlet2Total = toNumber(dailyEntry?.outlet2Energy);
          const entryDate = dailyEntry?.date
            ? new Date(`${dailyEntry.date}T00:00:00`)
            : new Date();
          const billingDays = getDaysInMonth(entryDate);
          const daysInPeriod = dailyEntry ? 1 : 0;
          const bill = calculatePelcoIIIBill(totalEnergy, {
            date: entryDate,
            profileId: rateProfileId || null,
            daysInPeriod,
            billingDays,
          });

          applySummary(
            {
              totalEnergy,
              totalCost: bill.totals.total,
              averageUsage: totalEnergy,
              peakUsage: totalEnergy,
              peakHour: formatPeakHour(dailyEntry?.peakHour),
              bestDay: dailyEntry?.date ? formatShortDate(entryDate) : 'N/A',
              outlet1Total,
              outlet2Total,
              effectiveRate: bill.effectiveRate,
            },
            ['Outlet 1', 'Outlet 2', 'Total'],
            [outlet1Total, outlet2Total, totalEnergy],
            bill
          );

          return;
        }

        const endDate = new Date();
        endDate.setHours(0, 0, 0, 0);

        let startDate = endDate;
        if (selectedTab === 'Weekly') {
          startDate = addDays(endDate, -6);
        } else {
          startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        }

        const rangeResult = await historyService.getUsageByDateRange(
          user.uid,
          toDateKey(startDate),
          toDateKey(endDate)
        );

        const entries = rangeResult.success ? rangeResult.data : [];
        const entriesByDate = new Map();
        entries.forEach((entry) => {
          entriesByDate.set(entry.date, entry);
        });

        const hasEntries = entries.length > 0;

        const days = buildDateRange(startDate, endDate);
        const dailyValues = days.map((day) => {
          const entry = entriesByDate.get(toDateKey(day));
          return toNumber(entry?.totalEnergy);
        });

        const totalEnergy = dailyValues.reduce((sum, value) => sum + value, 0);
        const outlet1Total = days.reduce((sum, day) => {
          const entry = entriesByDate.get(toDateKey(day));
          return sum + toNumber(entry?.outlet1Energy);
        }, 0);
        const outlet2Total = days.reduce((sum, day) => {
          const entry = entriesByDate.get(toDateKey(day));
          return sum + toNumber(entry?.outlet2Energy);
        }, 0);

        const peakUsage = dailyValues.length ? Math.max(...dailyValues) : 0;
        const bestDayData = dailyValues
          .map((value, index) => ({ value, date: days[index] }))
          .filter((item) => item.value > 0)
          .sort((a, b) => a.value - b.value)[0];
        const bestDay = bestDayData ? formatShortDate(bestDayData.date) : 'N/A';

        const bill = calculatePelcoIIIBill(totalEnergy, {
          date: endDate,
          profileId: rateProfileId || null,
          daysInPeriod: hasEntries ? days.length : 0,
          billingDays: getDaysInMonth(endDate),
        });

        const nextSummary = {
          totalEnergy,
          totalCost: bill.totals.total,
          averageUsage: days.length ? totalEnergy / days.length : 0,
          peakUsage,
          peakHour: 'N/A',
          bestDay,
          outlet1Total,
          outlet2Total,
          effectiveRate: bill.effectiveRate,
        };

        if (selectedTab === 'Weekly') {
          applySummary(nextSummary, days.map(formatWeekday), dailyValues, bill);
          return;
        }

        const weeklyBuckets = [0, 0, 0, 0];
        dailyValues.forEach((value, index) => {
          const bucket = Math.min(3, Math.floor(index / 7));
          weeklyBuckets[bucket] += value;
        });

        applySummary(
          nextSummary,
          ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
          weeklyBuckets,
          bill
        );
      } catch (error) {
        console.error('Error loading analytics:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchAnalytics();

    return () => {
      active = false;
    };
  }, [authLoading, rateProfileId, selectedTab, user?.uid]);

  const budgetPercent = budget.monthlyBudget > 0
    ? (budget.currentSpending / budget.monthlyBudget) * 100
    : 0;
  const remainingBudget = Math.max(0, budget.monthlyBudget - budget.currentSpending);
  const showBreakdown = billDetails && summary.totalEnergy > 0;
  const insightsText = loading
    ? 'Loading analytics...'
    : summary.totalEnergy > 0
      ? `Estimated bill for the ${selectedTab.toLowerCase()} period is ${formatCurrency(summary.totalCost)}.`
      : 'No data available yet. Connect your appliances to start tracking energy usage.';

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
        </View>

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Total Energy Usage</Text>
            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>{selectedTab}</Text>
            </View>
          </View>
          <Text style={styles.summaryValue}>{summary.totalEnergy.toFixed(2)} kWh</Text>
          <Text style={styles.summarySubValue}>
            {formatCurrency(summary.totalCost)} estimated cost
          </Text>
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
              <Text style={styles.peakBadgeText}>
                Peak: {summary.peakUsage.toFixed(2)} kWh
              </Text>
            </View>
          </View>
          <SimpleBarChart data={chartData} labels={chartLabels} />
        </View>

        {/* Statistics Grid */}
        <Text style={styles.sectionTitle}>Statistics</Text>
        <View style={styles.statsGrid}>
          <StatCard
            icon="⚡"
            label="Total Usage"
            value={`${summary.totalEnergy.toFixed(2)} kWh`}
            trend={0}
          />
          <StatCard
            icon="📊"
            label="Average"
            value={`${summary.averageUsage.toFixed(2)} kWh`}
            trend={0}
          />
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            icon="📈"
            label="Peak Usage"
            value={`${summary.peakUsage.toFixed(2)} kWh`}
          />
          <StatCard
            icon="🕐"
            label="Peak Hour"
            value={summary.peakHour}
          />
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            icon="💰"
            label="Total Cost"
            value={formatCurrency(summary.totalCost)}
            trend={0}
          />
          <StatCard
            icon="💡"
            label="Best Day"
            value={summary.bestDay}
          />
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
                  <Text style={styles.breakdownLabel}>Effective Rate</Text>
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

        {/* Outlet Comparison */}
        <Text style={styles.sectionTitle}>Outlet Comparison</Text>
        <OutletComparisonCard
          outlet1={summary.outlet1Total.toFixed(2)}
          outlet2={summary.outlet2Total.toFixed(2)}
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

        {/* Insights */}
        <View style={styles.insightsCard}>
          <Text style={styles.insightsTitle}>💡 Insights</Text>
          <Text style={styles.insightsText}>{insightsText}</Text>
        </View>
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
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: SIZES.padding,
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: SIZES.padding,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  statIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  statLabel: {
    ...FONTS.small,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  statValue: {
    ...FONTS.h4,
    color: COLORS.textDark,
    fontWeight: 'bold',
  },
  trendContainer: {
    marginTop: 4,
  },
  trendText: {
    ...FONTS.small,
    fontWeight: '600',
  },
  trendUp: {
    color: COLORS.error,
  },
  trendDown: {
    color: COLORS.success,
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
  comparisonTitle: {
    ...FONTS.h4,
    color: COLORS.textDark,
    fontWeight: 'bold',
    marginBottom: 16,
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
  comparisonFill: {
    height: '100%',
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
  insightsCard: {
    backgroundColor: COLORS.primary,
    marginHorizontal: SIZES.padding,
    padding: SIZES.padding,
    borderRadius: SIZES.radius,
    opacity: 0.9,
  },
  insightsTitle: {
    ...FONTS.body,
    color: COLORS.white,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  insightsText: {
    ...FONTS.small,
    color: COLORS.white,
    lineHeight: 20,
  },
});