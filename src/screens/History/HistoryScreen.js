import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../constants/colors';
import ActivityLog from './components/ActivityLog';
import UsageHistory from './components/UsageHistory';
import Pager from './components/Pager';
import { useHistory } from './hooks/useHistory';
import ExportUsageCard from './components/ExportUsageCard';
import { useAuth } from '../../hooks/useAuth';
import { HISTORY_PAGE_SIZE, fitPageSize, paginate } from './utils/historyHelpers';

// Row geometry, matching the fixed heights in ActivityLog and UsageHistory.
// Each page is sized to the space on screen so it never needs scrolling.
const ACTIVITY_ROW = { rowHeight: 49, chrome: 22 };
const USAGE_ROW = { rowHeight: 40, chrome: 42 };
const LIST_BOTTOM_PADDING = 12;

const TABS = ['Activity', 'Usage'];

/**
 * History, compact (Oct 2026): Activity and Usage, a page sized to fit the screen.
 *
 * Removed on request: the Records / kWh total / Total cost tiles, the
 * All / Outlet 1 / Outlet 2 filter, and the date filter. Usage shows only the
 * date, energy and cost; Export to Excel picks its own dates and keeps the
 * detail.
 */
const HistoryScreen = () => {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [activityPage, setActivityPage] = useState(0);
  const [usagePage, setUsagePage] = useState(0);
  const scrollRef = useRef(null);
  // Height the list area has between the tabs and the page controls.
  const [listHeight, setListHeight] = useState(0);
  const available = listHeight - LIST_BOTTOM_PADDING;
  const activityPageSize = listHeight ? fitPageSize(available, ACTIVITY_ROW) : HISTORY_PAGE_SIZE;
  const usagePageSize = listHeight ? fitPageSize(available, USAGE_ROW) : HISTORY_PAGE_SIZE;

  const {
    activityLogs,
    activityTotal,
    usageHistory,
    loading,
    usageLoading,
    showOfflineState,
    subscribeActivityLogs,
    fetchUsageHistory,
    fetchUsageForExport,
  } = useHistory();

  // The activity listener is capped by count, so paging forward raises the cap
  // - one row past the page, which is how the screen knows a next page exists.
  // Growing the live query keeps realtime updates working, which a separate
  // paginated fetch would fight with.
  const activityLimit = (activityPage + 1) * activityPageSize + 1;

  useEffect(() => {
    if (authLoading || !user || activeTab !== 0) return undefined;
    return subscribeActivityLogs({ outlet: 'all' }, activityLimit);
  }, [activeTab, authLoading, user, subscribeActivityLogs, activityLimit]);

  // Every recorded day (up to a year), read once and paged on the phone.
  useEffect(() => {
    if (authLoading || !user) return;
    fetchUsageHistory();
  }, [authLoading, user, fetchUsageHistory]);

  const activity = useMemo(() => {
    const start = activityPage * activityPageSize;
    return {
      items: activityLogs.slice(start, start + activityPageSize),
      hasPrev: activityPage > 0,
      hasNext: activityLogs.length > start + activityPageSize,
    };
  }, [activityLogs, activityPage, activityPageSize]);

  // While the next page is being read the listener still holds the previous,
  // shorter list - show the spinner rather than an empty page.
  const activityPageLoading = loading && activity.items.length === 0;

  const usage = useMemo(
    () => paginate(usageHistory, usagePage, usagePageSize),
    [usageHistory, usagePage, usagePageSize]
  );

  // The oldest day on record, for the export's "All" choice.
  const firstUsageDate = usageHistory.length > 0
    ? usageHistory[usageHistory.length - 1].date
    : null;

  const goToPage = (setter, next) => {
    setter(next);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
        {activeTab === 1 ? (
          <ExportUsageCard fetchRows={fetchUsageForExport} firstDate={firstUsageDate} />
        ) : null}
      </View>

      <View style={styles.tabContainer}>
        {TABS.map((tab, index) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === index && styles.tabActive]}
            onPress={() => setActiveTab(index)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === index }}
          >
            <Text style={[styles.tabText, activeTab === index && styles.tabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.height);
          if (Math.abs(next - listHeight) > 2) setListHeight(next);
        }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 0 ? (
          <ActivityLog
            style={styles.fill}
            logs={activity.items}
            loading={activityPageLoading || (loading && activityLogs.length === 0)}
            showOfflineState={showOfflineState}
          />
        ) : (
          <UsageHistory
            style={styles.fill}
            usage={usage.items}
            loading={usageLoading}
            showOfflineState={showOfflineState}
          />
        )}
      </ScrollView>

      {/* Pinned above the tab bar rather than following the list, and the list
          card stretches down to it - so a short page never leaves a gap
          between the last row, the page controls and the tabs (Oct 2026). */}
      {activeTab === 0 && activity.items.length > 0 ? (
        <Pager
          style={styles.pager}
          hasPrev={activity.hasPrev}
          hasNext={activity.hasNext}
          busy={loading}
          pageLabel={activityTotal
            ? `Page ${activityPage + 1} of ${Math.max(1, Math.ceil(activityTotal / activityPageSize))}`
            : `Page ${activityPage + 1}`}
          onPrev={() => goToPage(setActivityPage, Math.max(0, activityPage - 1))}
          onNext={() => goToPage(setActivityPage, activityPage + 1)}
        />
      ) : null}
      {activeTab === 1 && usage.items.length > 0 ? (
        <Pager
          style={styles.pager}
          page={usage.page}
          pageCount={usage.pageCount}
          hasPrev={usage.hasPrev}
          hasNext={usage.hasNext}
          onPrev={() => goToPage(setUsagePage, usage.page - 1)}
          onNext={() => goToPage(setUsagePage, usage.page + 1)}
        />
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    minHeight: 52,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  fill: {
    flexGrow: 1,
  },
  // Clear of the tab bar: the buttons sat close enough to the tabs to be
  // mistaken for part of them (Oct 2026).
  pager: {
    paddingTop: 10,
    paddingBottom: 22,
  },
});

export default HistoryScreen;
