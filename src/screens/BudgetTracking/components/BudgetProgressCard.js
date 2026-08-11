import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { getBudgetStatusColor } from '../utils/budgetHelpers';

const BudgetProgressCard = ({
  monthlyBudget,
  currentSpending,
  percentageUsed,
  remainingBudget,
  onSetBudget,
}) => {
  const statusColor = getBudgetStatusColor(percentageUsed);

  // Circular progress calculation
  const radius = 70;
  const strokeWidth = 12;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentageUsed / 100) * circumference;

  if (monthlyBudget === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.noBudgetContainer}>
          <Ionicons name="wallet-outline" size={64} color={COLORS.border} />
          <Text style={styles.noBudgetTitle}>No Budget Set</Text>
          <Text style={styles.noBudgetText}>
            Set a monthly budget to track your electricity spending
          </Text>
          <TouchableOpacity style={styles.setBudgetButton} onPress={onSetBudget}>
            <Ionicons name="add-circle" size={20} color={COLORS.white} />
            <Text style={styles.setBudgetText}>Set Monthly Budget</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Monthly Budget</Text>
        <Text style={styles.monthLabel}>
          {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
      </View>

      <View style={styles.progressContainer}>
        {/* Circular Progress */}
        <View style={styles.circularProgress}>
          <View style={styles.svgContainer}>
            {/* Background Circle */}
            <View style={styles.backgroundCircle} />
            
            {/* Progress Circle - Using View-based approach */}
            <View
              style={[
                styles.progressCircle,
                {
                  borderColor: statusColor,
                  transform: [{ rotate: `${(percentageUsed * 3.6) - 90}deg` }],
                },
              ]}
            />
          </View>

          <View style={styles.progressText}>
            <Text style={[styles.percentage, { color: statusColor }]}>
              {percentageUsed.toFixed(0)}%
            </Text>
            <Text style={styles.percentageLabel}>Used</Text>
          </View>
        </View>

        {/* Budget Details */}
        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Monthly Budget</Text>
            <Text style={styles.detailValue}>₱{monthlyBudget.toFixed(2)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Current Spending</Text>
            <Text style={[styles.detailValue, { color: statusColor }]}>
              ₱{currentSpending.toFixed(2)}
            </Text>
          </View>

          <View style={styles.separator} />

          {/* The label changes with the sign, not just the colour. Showing an
              absolute value under "Remaining" reads as money still available
              when it is money already overspent - and colour alone is the one
              cue a red-green colour-blind user does not get. */}
          <View style={styles.detailRow}>
            <Text style={styles.remainingLabel}>
              {remainingBudget >= 0 ? 'Remaining' : 'Over budget'}
            </Text>
            <Text style={[styles.remainingValue, { color: remainingBudget >= 0 ? COLORS.success : COLORS.error }]}>
              {remainingBudget >= 0 ? '' : '+'}₱{Math.abs(remainingBudget).toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 20,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  monthLabel: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  circularProgress: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  svgContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundCircle: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 12,
    borderColor: COLORS.border,
  },
  progressCircle: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 12,
    borderColor: COLORS.primary,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  progressText: {
    position: 'absolute',
    alignItems: 'center',
  },
  percentage: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 2,
  },
  percentageLabel: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  detailsContainer: {
    flex: 1,
  },
  // Stacked rather than label-left/value-right: this column sits beside a 140px
  // circle, leaving too little width for both on one line, so they collided.
  detailRow: {
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  remainingLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  remainingValue: {
    fontSize: 19,
    fontWeight: '700',
  },
  noBudgetContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noBudgetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 8,
  },
  noBudgetText: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  setBudgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  setBudgetText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
});

export default BudgetProgressCard;