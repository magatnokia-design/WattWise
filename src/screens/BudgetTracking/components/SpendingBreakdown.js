import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const SpendingBreakdown = ({ outlet1Spending, outlet2Spending, totalSpending }) => {
  const outlet1Percentage = totalSpending > 0 ? (outlet1Spending / totalSpending) * 100 : 0;
  const outlet2Percentage = totalSpending > 0 ? (outlet2Spending / totalSpending) * 100 : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Spending Breakdown</Text>

      {/* Bar Chart */}
      <View style={styles.chartContainer}>
        <View style={styles.barContainer}>
          <View style={styles.bar}>
            <View style={[styles.barFill, { 
              width: `${outlet1Percentage}%`,
              backgroundColor: COLORS.primary,
            }]} />
          </View>
          <View style={styles.barLabel}>
            <View style={styles.labelRow}>
              <View style={[styles.colorDot, { backgroundColor: COLORS.primary }]} />
              <Text style={styles.labelText}>Outlet 1</Text>
            </View>
            <Text style={styles.labelValue}>₱{outlet1Spending.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.barContainer}>
          <View style={styles.bar}>
            <View style={[styles.barFill, { 
              width: `${outlet2Percentage}%`,
              backgroundColor: COLORS.primaryLight,
            }]} />
          </View>
          <View style={styles.barLabel}>
            <View style={styles.labelRow}>
              <View style={[styles.colorDot, { backgroundColor: COLORS.primaryLight }]} />
              <Text style={styles.labelText}>Outlet 2</Text>
            </View>
            <Text style={styles.labelValue}>₱{outlet2Spending.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      {/* Percentage Breakdown */}
      <View style={styles.percentageContainer}>
        <View style={styles.percentageItem}>
          <View style={[styles.percentageDot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.percentageLabel}>Outlet 1</Text>
          <Text style={styles.percentageValue}>{outlet1Percentage.toFixed(1)}%</Text>
        </View>

        <View style={styles.percentageItem}>
          <View style={[styles.percentageDot, { backgroundColor: COLORS.primaryLight }]} />
          <Text style={styles.percentageLabel}>Outlet 2</Text>
          <Text style={styles.percentageValue}>{outlet2Percentage.toFixed(1)}%</Text>
        </View>
      </View>

      {/* Total */}
      <View style={styles.totalContainer}>
        <Text style={styles.totalLabel}>Total Spending</Text>
        <Text style={styles.totalValue}>₱{totalSpending.toFixed(2)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  chartContainer: {
    gap: 16,
    marginBottom: 16,
  },
  barContainer: {
    gap: 8,
  },
  bar: {
    height: 32,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 8,
    minWidth: 2,
  },
  barLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  labelText: {
    fontSize: 14,
    color: COLORS.text,
  },
  labelValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  percentageContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  percentageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  percentageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  percentageLabel: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  percentageValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
});

export default SpendingBreakdown;