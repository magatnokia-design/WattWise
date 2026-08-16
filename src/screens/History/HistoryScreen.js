import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import ActivityLog from './components/ActivityLog';
import UsageHistory from './components/UsageHistory';
import DateRangeModal from './components/DateRangeModal';
import { useHistory } from './hooks/useHistory';
import ExportUsageCard from './components/ExportUsageCard';
import { useAuth } from '../../hooks/useAuth';
import { calculatePelcoIIIBill } from '../../utils/billing';
import {
  DATE_RANGE_PRESETS,
  resolveDateRange,
  filterByDateRange,
  formatCost,
} from './utils/historyHelpers';

const TABS = ['Activity', 'Usage'];
const ACTIVITY_PAGE_SIZE = 20;

const FilterChip = ({ label, active, onPress }) => (
  <TouchableOpacity
    style={[styles.filterChip, active && styles.filterChipActive]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const HistoryScreen = () => {
  const { width } = useWindowDimensions();
    const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [activeFilter, setActiveFilter] = useState('All');
  const [activeRangeId, setActiveRangeId] = useState('all');
  const [dateModalVisible, setDateModalVisible] = useState(false);
  // The activity listener is capped by count, so "load more" raises the cap and
  // re-subscribes. Growing the live query keeps realtime updates working, which
  // a separate paginated fetch would fight with.
  const [logLimit, setLogLimit] = useState(ACTIVITY_PAGE_SIZE);

 const { activityLogs, usageHistory, loading, hasMore, rateProfileId, supplyRates, subscribeActivityLogs, fetchUsageHistory } = useHistory();

 const filterToOutletValue = useMemo(() => ({
   All: 'all',
   'Outlet 1': '1',
   'Outlet 2': '2',
 }), []);

// Subscribe activity logs in real-time while Activity tab is active.
useEffect(() => {
  if (authLoading || !user || activeTab !== 0) return;

  const unsubscribe = subscribeActivityLogs(
    { outlet: filterToOutletValue[activeFilter] || 'all' },
    logLimit
  );

  return unsubscribe;
}, [activeFilter, activeTab, authLoading, user, subscribeActivityLogs, filterToOutletValue, logLimit]);

// Changing the outlet or date filter starts a fresh window.
useEffect(() => {
  setLogLimit(ACTIVITY_PAGE_SIZE);
}, [activeFilter, activeRangeId]);

const { startDate, endDate } = useMemo(
  () => resolveDateRange(activeRangeId),
  [activeRangeId]
);

// Usage history backs the summary cards on both tabs, so it loads regardless of
// which tab is showing (a single capped query, unlike the activity listener).
useEffect(() => {
  if (authLoading || !user) return;
  fetchUsageHistory(startDate, endDate);
}, [authLoading, user, fetchUsageHistory, startDate, endDate]);

  const filters = useMemo(() => ['All', 'Outlet 1', 'Outlet 2'], []);

  const handleTabPress = useCallback((index) => {
    setActiveTab(index);
  }, []);

  const handleFilterPress = useCallback((filter) => {
    setActiveFilter(filter);
  }, []);

  const handleDateFilterPress = useCallback(() => {
    setDateModalVisible(true);
  }, []);

  const handleDateModalClose = useCallback(() => {
    setDateModalVisible(false);
  }, []);

  const handleLoadMoreActivity = useCallback(() => {
    setLogLimit((current) => current + ACTIVITY_PAGE_SIZE);
  }, []);

  // Activity logs stream in unfiltered by date (the listener is capped by count,
  // not range), so the selected range is applied client-side here.
  const visibleActivityLogs = useMemo(
    () => filterByDateRange(activityLogs, startDate, endDate),
    [activityLogs, startDate, endDate]
  );

  const activeRangeLabel = useMemo(() => {
    const preset = DATE_RANGE_PRESETS.find((item) => item.id === activeRangeId);
    return preset?.shortLabel || 'Date';
  }, [activeRangeId]);

  const summaryData = useMemo(() => {
    const totalKwh = usageHistory.reduce((sum, item) => sum + (item.totalKwh || 0), 0);

    // Priced from the total, not by adding up the days.
    //
    // Each day's stored cost is a marginal figure that deliberately excludes
    // the once-a-month P5.00 metering charge, so summing them would leave the
    // fee out entirely - just as summing days that each included it charged
    // the fee once per day, which is what this header used to show.
    const totalCost = calculatePelcoIIIBill(totalKwh, {
      supplyRates,
      profileId: rateProfileId,
    }).totals.total;

    return {
      totalRecords: activeTab === 0 ? visibleActivityLogs.length : usageHistory.length,
      totalKwh: totalKwh.toFixed(2),
      totalCost: formatCost(totalCost),
    };
  }, [usageHistory, visibleActivityLogs.length, activeTab, rateProfileId, supplyRates]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
        <Text style={styles.headerSub}>Activity & usage records</Text>
      </View>

      {/* Summary Cards */}
      <View style={[styles.summaryRow, { paddingHorizontal: 16 }]}>
        <View style={[styles.summaryCard, { width: (width - 48) / 3 }]}>
          <Text style={styles.summaryValue}>{summaryData.totalRecords}</Text>
          <Text style={styles.summaryLabel}>Records</Text>
        </View>
        <View style={[styles.summaryCard, { width: (width - 48) / 3 }]}>
          <Text style={styles.summaryValue}>{summaryData.totalKwh}</Text>
          <Text style={styles.summaryLabel}>kWh Total</Text>
        </View>
        <View style={[styles.summaryCard, { width: (width - 48) / 3 }]}>
          <Text style={styles.summaryValue}>{summaryData.totalCost}</Text>
          <Text style={styles.summaryLabel}>Total Cost</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {TABS.map((tab, index) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === index && styles.tabActive]}
            onPress={() => handleTabPress(index)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === index && styles.tabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {filters.map((filter) => (
          <FilterChip
            key={filter}
            label={filter}
            active={activeFilter === filter}
            onPress={() => handleFilterPress(filter)}
          />
        ))}
        <TouchableOpacity
          style={[styles.dateFilterBtn, activeRangeId !== 'all' && styles.dateFilterBtnActive]}
          onPress={handleDateFilterPress}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.dateFilterText,
              activeRangeId !== 'all' && styles.dateFilterTextActive,
            ]}
          >
            📅 {activeRangeLabel}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 0 ? (
          <>
            {/* The listener is capped by count, so a date range can only filter
                what has been loaded. Say so rather than implying completeness. */}
            {activeRangeId !== 'all' && hasMore ? (
              <Text style={styles.rangeNotice}>
                Showing the {activityLogs.length} most recent entries within this range.
                Load more below to look further back.
              </Text>
            ) : null}
            <ActivityLog
              logs={visibleActivityLogs}
              loading={loading}
              hasMore={hasMore}
              onLoadMore={handleLoadMoreActivity}
            />
          </>
        ) : (
          <>
            {/* Above the list, because it exports what the list is showing and
                the relationship should be visible without scrolling. */}
            <ExportUsageCard usage={usageHistory} />
            <UsageHistory usage={usageHistory} loading={loading} />
          </>
        )}
      </ScrollView>

      <DateRangeModal
        visible={dateModalVisible}
        activeRangeId={activeRangeId}
        onSelect={setActiveRangeId}
        onClose={handleDateModalClose}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textLight,
  },
  tabTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  dateFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginLeft: 'auto',
  },
  dateFilterBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dateFilterText: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  dateFilterTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  rangeNotice: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textLight,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
});

export default HistoryScreen;