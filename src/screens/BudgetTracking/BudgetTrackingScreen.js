import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import BudgetProgressCard from './components/BudgetProgressCard';
import MonthAtAGlance from './components/MonthAtAGlance';
import SetBudgetModal from './components/SetBudgetModal';
import RangeUsageCard from './components/RangeUsageCard';
import { OfflineState } from '../../components/common/OfflineNotice';
import useBudgetTracking from './hooks/useBudgetTracking';
import useRangeUsage from './hooks/useRangeUsage';
import { useOfflineRetry } from '../../hooks/useOfflineRetry';

const BudgetTrackingScreen = ({ navigation }) => {
  const {
    monthlyBudget,
    currentSpending,
    daysInMonth,
    currentDay,
    budgetHistory,
    showOfflineState,
    hasLoaded,
    handleSetBudget,
    handleRefresh,
  } = useBudgetTracking();

  // Recovers on its own when the connection comes back, instead of sitting on
  // "Try again" until the user thinks to tap it. Calls the hook's refresh
  // rather than `onRefresh` below, so the pull-to-refresh spinner does not
  // flash every ten seconds while nothing is happening.
  useOfflineRetry(showOfflineState, handleRefresh);

  const rangeUsage = useRangeUsage();

  const [refreshing, setRefreshing] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await handleRefresh();
    setRefreshing(false);
  };

  const percentageUsed = monthlyBudget > 0 ? (currentSpending / monthlyBudget) * 100 : 0;
  const remainingBudget = monthlyBudget - currentSpending;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Budget Tracking</Text>
        <TouchableOpacity
          onPress={() => setShowBudgetModal(true)}
          style={styles.editButton}
        >
          <Ionicons name="create-outline" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Every figure below is an assertion about the account - a ₱0 budget,
            nothing spent, "Under budget". With no read behind them they are
            all zero, which is the empty state of a new account rather than
            the truth about this one. */}
        {showOfflineState ? (
          <OfflineState
            style={styles.offline}
            body="Your budget and this month's spending are stored on your account, and the app needs a connection to read them. Nothing has been lost or reset."
            onRetry={onRefresh}
          />
        ) : !hasLoaded ? (
          // First open this session: nothing read yet. A spinner, not the
          // "No Budget Set" card - that card is a claim about the account.
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading your budget…</Text>
          </View>
        ) : (
        <>
        {/* Budget Progress */}
        <BudgetProgressCard
          monthlyBudget={monthlyBudget}
          currentSpending={currentSpending}
          percentageUsed={percentageUsed}
          remainingBudget={remainingBudget}
          onSetBudget={() => setShowBudgetModal(true)}
        />

        {/* Any two dates: what was used and what it cost. Right under the
            budget, because that is the question it helps answer. */}
        <RangeUsageCard
          range={rangeUsage.range}
          setRange={rangeUsage.setRange}
          summary={rangeUsage.summary}
          status={rangeUsage.status}
          insights={rangeUsage.insights}
          message={rangeUsage.message}
          onRetry={rangeUsage.reload}
          monthlyBudget={monthlyBudget}
          daysInMonth={daysInMonth}
        />

        {/* One overall view of the month: where it is heading, what is safe
            to spend per day, and the last three months. Replaced Alert
            Thresholds, Spending Breakdown, the two stat tiles, Projected
            Analysis and Previous Months (Oct 2026 feedback: keep it simple). */}
        <MonthAtAGlance
          monthlyBudget={monthlyBudget}
          currentSpending={currentSpending}
          currentDay={currentDay}
          daysInMonth={daysInMonth}
          budgetHistory={budgetHistory}
        />
        </>
        )}

        {/* Info Footer */}
        <View style={styles.infoFooter}>
          <Ionicons name="information-circle" size={16} color={COLORS.textLight} />
          <Text style={styles.infoText}>
            Budget tracking helps monitor electricity spending and alerts you when approaching limits
          </Text>
        </View>
      </ScrollView>

      {/* Set Budget Modal */}
      <SetBudgetModal
        visible={showBudgetModal}
        currentBudget={monthlyBudget}
        onClose={() => setShowBudgetModal(false)}
        onSave={handleSetBudget}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 80,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  editButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  offline: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  // Clears the Android navigation bar so the last card is fully reachable.
  scrollContent: {
    paddingBottom: 32,
  },
  // The same pill Monthly Statements and Compare Usage use for a billed month.
  infoFooter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 20,
    borderRadius: 12,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 18,
  },
});

export default BudgetTrackingScreen;