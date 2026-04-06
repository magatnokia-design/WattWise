import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const ProjectedCost = ({
  projectedCost,
  monthlyBudget,
  currentSpending,
  daysInMonth,
  currentDay,
}) => {
  const projectedOverBudget = projectedCost > monthlyBudget;
  const projectedDifference = Math.abs(projectedCost - monthlyBudget);
  const daysRemaining = daysInMonth - currentDay;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="trending-up" size={24} color={COLORS.primary} />
        <Text style={styles.title}>Projected Analysis</Text>
      </View>

      <View style={styles.projectionCard}>
        <Text style={styles.projectionLabel}>Estimated End-of-Month Cost</Text>
        <Text style={[
          styles.projectionValue,
          { color: projectedOverBudget ? COLORS.error : COLORS.success }
        ]}>
          ₱{projectedCost.toFixed(2)}
        </Text>

        <View style={[
          styles.statusBadge,
          { backgroundColor: projectedOverBudget ? '#FEF2F2' : '#ECFDF5' }
        ]}>
          <Ionicons
            name={projectedOverBudget ? 'trending-up' : 'trending-down'}
            size={16}
            color={projectedOverBudget ? COLORS.error : COLORS.success}
          />
          <Text style={[
            styles.statusText,
            { color: projectedOverBudget ? COLORS.error : COLORS.success }
          ]}>
            {projectedOverBudget ? 'Over' : 'Under'} budget by ₱{projectedDifference.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.detailsContainer}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Days Elapsed</Text>
          <Text style={styles.detailValue}>{currentDay} / {daysInMonth}</Text>
        </View>

        <View style={styles.detailDivider} />

        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Days Remaining</Text>
          <Text style={styles.detailValue}>{daysRemaining}</Text>
        </View>

        <View style={styles.detailDivider} />

        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Current Spending</Text>
          <Text style={styles.detailValue}>₱{currentSpending.toFixed(2)}</Text>
        </View>
      </View>

      {projectedOverBudget && (
        <View style={styles.warningContainer}>
          <Ionicons name="alert-circle" size={16} color={COLORS.error} />
          <Text style={styles.warningText}>
            At current usage rate, you will exceed your budget. Consider reducing usage.
          </Text>
        </View>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  projectionCard: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  projectionLabel: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 8,
  },
  projectionValue: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailsContainer: {
    flexDirection: 'row',
    paddingVertical: 16,
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  detailDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.error,
    lineHeight: 18,
  },
});

export default ProjectedCost;