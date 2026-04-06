import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import BudgetProgressCard from './components/BudgetProgressCard';
import SpendingBreakdown from './components/SpendingBreakdown';
import AlertThresholds from './components/AlertThresholds';
import ProjectedCost from './components/ProjectedCost';
import SetBudgetModal from './components/SetBudgetModal';
import useBudgetTracking from './hooks/useBudgetTracking';

const BudgetTrackingScreen = ({ navigation }) => {
  const {
    monthlyBudget,
    currentSpending,
    outlet1Spending,
    outlet2Spending,
    dailyAverage,
    projectedCost,
    daysInMonth,
    currentDay,
    budgetHistory,
    loading,
    handleSetBudget,
    handleRefresh,
  } = useBudgetTracking();

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
    <SafeAreaView style={styles.container} edges={['top']}>
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
        {/* Budget Progress */}
        <BudgetProgressCard
          monthlyBudget={monthlyBudget}
          currentSpending={currentSpending}
          percentageUsed={percentageUsed}
          remainingBudget={remainingBudget}
          onSetBudget={() => setShowBudgetModal(true)}
        />

        {/* Alert Thresholds */}
        <AlertThresholds
          monthlyBudget={monthlyBudget}
          currentSpending={currentSpending}
          percentageUsed={percentageUsed}
        />

        {/* Spending Breakdown */}
        <SpendingBreakdown
          outlet1Spending={outlet1Spending}
          outlet2Spending={outlet2Spending}
          totalSpending={currentSpending}
        />

        {/* Daily Average & Projected Cost */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="calendar-outline" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.statLabel}>Daily Average</Text>
            <Text style={styles.statValue}>₱{dailyAverage.toFixed(2)}</Text>
            <Text style={styles.statSubtext}>
              Day {currentDay} of {daysInMonth}
            </Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="trending-up-outline" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.statLabel}>Projected Cost</Text>
            <Text style={styles.statValue}>₱{projectedCost.toFixed(2)}</Text>
            <Text style={styles.statSubtext}>
              End of month estimate
            </Text>
          </View>
        </View>

        {/* Projected Cost Details */}
        <ProjectedCost
          projectedCost={projectedCost}
          monthlyBudget={monthlyBudget}
          currentSpending={currentSpending}
          daysInMonth={daysInMonth}
          currentDay={currentDay}
        />

        {/* Monthly History */}
        {budgetHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Previous Months</Text>
            <View style={styles.historyContainer}>
              {budgetHistory.map((item, index) => (
                <View key={index} style={styles.historyItem}>
                  <View style={styles.historyMonth}>
                    <Text style={styles.monthName}>{item.month}</Text>
                    <Text style={styles.monthYear}>{item.year}</Text>
                  </View>
                  <View style={styles.historyStats}>
                    <Text style={styles.historyAmount}>₱{item.spent.toFixed(2)}</Text>
                    <Text style={[
                      styles.historyStatus,
                      { color: item.spent <= item.budget ? COLORS.success : COLORS.error }
                    ]}>
                      {item.spent <= item.budget ? 'Under budget' : 'Over budget'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
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
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  statSubtext: {
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  historyContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  historyMonth: {
    flex: 1,
  },
  monthName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  monthYear: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  historyStats: {
    alignItems: 'flex-end',
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  historyStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
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