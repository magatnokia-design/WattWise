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
import { useHistory } from './hooks/useHistory';

const TABS = ['Activity', 'Usage'];

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
  const [activeTab, setActiveTab] = useState(0);
  const [activeFilter, setActiveFilter] = useState('All');

 const { activityLogs, usageHistory, loading, fetchActivityLogs, fetchUsageHistory } = useHistory();

 const filterToOutletValue = useMemo(() => ({
   All: 'all',
   'Outlet 1': '1',
   'Outlet 2': '2',
 }), []);

// Fetch activity logs on filter change
useEffect(() => {
  fetchActivityLogs({ outlet: filterToOutletValue[activeFilter] || 'all' });
}, [activeFilter, fetchActivityLogs, filterToOutletValue]);

// Fetch usage history once on mount
useEffect(() => {
  fetchUsageHistory();
}, [fetchUsageHistory]);

  const filters = useMemo(() => ['All', 'Outlet 1', 'Outlet 2'], []);

  const handleTabPress = useCallback((index) => {
    setActiveTab(index);
  }, []);

  const handleFilterPress = useCallback((filter) => {
    setActiveFilter(filter);
  }, []);

  const summaryData = useMemo(() => ({
    totalRecords: 0,
    totalKwh: '0.00',
    totalCost: '₱0.00',
  }), []);

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
        {/* TODO: Add date range picker when backend is ready */}
        <TouchableOpacity style={styles.dateFilterBtn} activeOpacity={0.7}>
          <Text style={styles.dateFilterText}>📅 Date</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 0 ? (
          <ActivityLog logs={activityLogs} />
        ) : (
          <UsageHistory usage={usageHistory} />
        )}
      </ScrollView>
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
  dateFilterText: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '500',
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