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
import { HISTORY_PAGE_SIZE, paginate } from './utils/historyHelpers';

const TABS = ['Activity', 'Usage'];

/**
 * History, compact (Oct 2026): Activity and Usage, ten rows a page.
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

  const {
    activityLogs,
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
  const activityLimit = (activityPage + 1) * HISTORY_PAGE_SIZE + 1;

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
    const start = activityPage * HISTORY_PAGE_SIZE;
    return {
      items: activityLogs.slice(start, start + HISTORY_PAGE_SIZE),
      hasPrev: activityPage > 0,
      hasNext: activityLogs.length > start + HISTORY_PAGE_SIZE,
    };
  }, [activityLogs, activityPage]);

  // While the next page is being read the listener still holds the previous,
  // shorter list - show the spinner rather than an empty page.
  const activityPageLoading = loading && activity.items.length === 0;

  const usage = useMemo(
    () => paginate(usageHistory, usagePage, HISTORY_PAGE_SIZE),
    [usageHistory, usagePage]
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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 0 ? (
          <>
            <ActivityLog
              logs={activity.items}
              loading={activityPageLoading || (loading && activityLogs.length === 0)}
              showOfflineState={showOfflineState}
            />
            <Pager
              hasPrev={activity.hasPrev}
              hasNext={activity.hasNext}
              busy={loading}
              pageLabel={`Page ${activityPage + 1}`}
              onPrev={() => goToPage(setActivityPage, Math.max(0, activityPage - 1))}
              onNext={() => goToPage(setActivityPage, activityPage + 1)}
            />
          </>
        ) : (
          <>
            <UsageHistory
              usage={usage.items}
              loading={usageLoading}
              showOfflineState={showOfflineState}
            />
            <Pager
              page={usage.page}
              pageCount={usage.pageCount}
              hasPrev={usage.hasPrev}
              hasNext={usage.hasNext}
              onPrev={() => goToPage(setUsagePage, usage.page - 1)}
              onNext={() => goToPage(setUsagePage, usage.page + 1)}
            />
          </>
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
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
});

export default HistoryScreen;
