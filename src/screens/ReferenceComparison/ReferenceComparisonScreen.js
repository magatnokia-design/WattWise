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
import MonthSelector from './components/MonthSelector';
import ComparisonCard from './components/ComparisonCard';
import ComparisonChart from './components/ComparisonChart';
import InsightsCard from './components/InsightsCard';
import AddPreviousBillModal from './components/AddPreviousBillModal';
import useReferenceComparison from './hooks/useReferenceComparison';

const ReferenceComparisonScreen = ({ navigation }) => {
  const {
    selectedMonth,
    currentMonthData,
    previousMonthData,
    comparisonData,
    insights,
    loading,
    handleMonthChange,
    handleAddPreviousBill,
    handleRefresh,
  } = useReferenceComparison();

  const [refreshing, setRefreshing] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await handleRefresh();
    setRefreshing(false);
  };

  const hasPreviousData = previousMonthData.kWh > 0 || previousMonthData.cost > 0;

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
        <Text style={styles.headerTitle}>Usage Comparison</Text>
        <TouchableOpacity
          onPress={() => setShowBillModal(true)}
          style={styles.addButton}
        >
          <Ionicons name="add-circle" size={24} color={COLORS.primary} />
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
        {/* Month Selector */}
        <MonthSelector
          selectedMonth={selectedMonth}
          onMonthChange={handleMonthChange}
        />

        {!hasPreviousData ? (
          // No Previous Data - Show Empty State
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={80} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No Previous Data</Text>
            <Text style={styles.emptyText}>
              Add your previous electricity bill to compare usage and costs
            </Text>
            <TouchableOpacity
              style={styles.addBillButton}
              onPress={() => setShowBillModal(true)}
            >
              <Ionicons name="add-circle" size={20} color={COLORS.white} />
              <Text style={styles.addBillText}>Add Previous Bill</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Comparison Cards */}
            <View style={styles.cardsContainer}>
              <ComparisonCard
                title="Energy Usage"
                currentValue={currentMonthData.kWh}
                previousValue={previousMonthData.kWh}
                unit="kWh"
                icon="flash"
                changeData={comparisonData.kWhChange}
              />
              <ComparisonCard
                title="Total Cost"
                currentValue={currentMonthData.cost}
                previousValue={previousMonthData.cost}
                unit="₱"
                icon="wallet"
                changeData={comparisonData.costChange}
              />
            </View>

            {/* Comparison Chart */}
            <ComparisonChart
              currentMonthData={currentMonthData}
              previousMonthData={previousMonthData}
              selectedMonth={selectedMonth}
            />

            {/* Outlet Breakdown Comparison */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Outlet Breakdown</Text>
              <View style={styles.outletComparison}>
                {/* Outlet 1 */}
                <View style={styles.outletCard}>
                  <View style={styles.outletHeader}>
                    <Ionicons name="flash" size={20} color={COLORS.primary} />
                    <Text style={styles.outletName}>Outlet 1</Text>
                  </View>
                  <View style={styles.outletValues}>
                    <View style={styles.outletValueItem}>
                      <Text style={styles.outletLabel}>Current</Text>
                      <Text style={styles.outletValue}>
                        {currentMonthData.outlet1.toFixed(2)} kWh
                      </Text>
                    </View>
                    <View style={styles.outletValueItem}>
                      <Text style={styles.outletLabel}>Previous</Text>
                      <Text style={styles.outletValuePrev}>
                        {previousMonthData.outlet1.toFixed(2)} kWh
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.changeBadge, { 
                    backgroundColor: comparisonData.outlet1Change.type === 'increase' 
                      ? '#FEF2F2' 
                      : comparisonData.outlet1Change.type === 'decrease' 
                      ? '#ECFDF5' 
                      : COLORS.background 
                  }]}>
                    <Ionicons
                      name={
                        comparisonData.outlet1Change.type === 'increase'
                          ? 'trending-up'
                          : comparisonData.outlet1Change.type === 'decrease'
                          ? 'trending-down'
                          : 'remove'
                      }
                      size={14}
                      color={
                        comparisonData.outlet1Change.type === 'increase'
                          ? COLORS.error
                          : comparisonData.outlet1Change.type === 'decrease'
                          ? COLORS.success
                          : COLORS.textLight
                      }
                    />
                    <Text style={[styles.changeText, {
                      color: comparisonData.outlet1Change.type === 'increase'
                        ? COLORS.error
                        : comparisonData.outlet1Change.type === 'decrease'
                        ? COLORS.success
                        : COLORS.textLight
                    }]}>
                      {comparisonData.outlet1Change.percentage.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                {/* Outlet 2 */}
                <View style={styles.outletCard}>
                  <View style={styles.outletHeader}>
                    <Ionicons name="flash" size={20} color={COLORS.primaryLight} />
                    <Text style={styles.outletName}>Outlet 2</Text>
                  </View>
                  <View style={styles.outletValues}>
                    <View style={styles.outletValueItem}>
                      <Text style={styles.outletLabel}>Current</Text>
                      <Text style={styles.outletValue}>
                        {currentMonthData.outlet2.toFixed(2)} kWh
                      </Text>
                    </View>
                    <View style={styles.outletValueItem}>
                      <Text style={styles.outletLabel}>Previous</Text>
                      <Text style={styles.outletValuePrev}>
                        {previousMonthData.outlet2.toFixed(2)} kWh
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.changeBadge, { 
                    backgroundColor: comparisonData.outlet2Change.type === 'increase' 
                      ? '#FEF2F2' 
                      : comparisonData.outlet2Change.type === 'decrease' 
                      ? '#ECFDF5' 
                      : COLORS.background 
                  }]}>
                    <Ionicons
                      name={
                        comparisonData.outlet2Change.type === 'increase'
                          ? 'trending-up'
                          : comparisonData.outlet2Change.type === 'decrease'
                          ? 'trending-down'
                          : 'remove'
                      }
                      size={14}
                      color={
                        comparisonData.outlet2Change.type === 'increase'
                          ? COLORS.error
                          : comparisonData.outlet2Change.type === 'decrease'
                          ? COLORS.success
                          : COLORS.textLight
                      }
                    />
                    <Text style={[styles.changeText, {
                      color: comparisonData.outlet2Change.type === 'increase'
                        ? COLORS.error
                        : comparisonData.outlet2Change.type === 'decrease'
                        ? COLORS.success
                        : COLORS.textLight
                    }]}>
                      {comparisonData.outlet2Change.percentage.toFixed(1)}%
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Insights */}
            <InsightsCard insights={insights} />

            {/* Edit Previous Bill Button */}
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setShowBillModal(true)}
            >
              <Ionicons name="create-outline" size={20} color={COLORS.primary} />
              <Text style={styles.editButtonText}>Edit Previous Bill Data</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Info Footer */}
        <View style={styles.infoFooter}>
          <Ionicons name="information-circle" size={16} color={COLORS.textLight} />
          <Text style={styles.infoText}>
            Compare your current usage with previous months to identify trends and save energy
          </Text>
        </View>
      </ScrollView>

      {/* Add Previous Bill Modal */}
      <AddPreviousBillModal
        visible={showBillModal}
        selectedMonth={selectedMonth}
        previousData={previousMonthData}
        onClose={() => setShowBillModal(false)}
        onSave={handleAddPreviousBill}
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
  addButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 20,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  addBillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  addBillText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  cardsContainer: {
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 20,
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
  outletComparison: {
    gap: 12,
  },
  outletCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  outletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  outletName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  outletValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  outletValueItem: {
    flex: 1,
  },
  outletLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  outletValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  outletValuePrev: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: 8,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
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

export default ReferenceComparisonScreen;