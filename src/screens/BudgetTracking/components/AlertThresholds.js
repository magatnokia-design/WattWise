import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const AlertThresholds = ({ monthlyBudget, currentSpending, percentageUsed }) => {
  const thresholds = [
    { level: 50, label: '50% Alert', color: COLORS.success, icon: 'checkmark-circle' },
    { level: 75, label: '75% Warning', color: '#F59E0B', icon: 'warning' },
    { level: 90, label: '90% Critical', color: '#F97316', icon: 'alert' },
    { level: 100, label: '100% Exceeded', color: COLORS.error, icon: 'close-circle' },
  ];

  const getThresholdStatus = (level) => {
    return percentageUsed >= level;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alert Thresholds</Text>
      
      <View style={styles.thresholdsContainer}>
        {thresholds.map((threshold, index) => {
          const isReached = getThresholdStatus(threshold.level);
          const thresholdAmount = (monthlyBudget * threshold.level) / 100;

          return (
            <View key={index} style={styles.thresholdItem}>
              <View style={[
                styles.iconContainer,
                { backgroundColor: isReached ? threshold.color + '20' : COLORS.background }
              ]}>
                <Ionicons
                  name={threshold.icon}
                  size={20}
                  color={isReached ? threshold.color : COLORS.textLight}
                />
              </View>

              <View style={styles.thresholdContent}>
                <Text style={[
                  styles.thresholdLabel,
                  { color: isReached ? threshold.color : COLORS.text }
                ]}>
                  {threshold.label}
                </Text>
                <Text style={styles.thresholdAmount}>₱{thresholdAmount.toFixed(2)}</Text>
              </View>

              {isReached && (
                <View style={[styles.statusBadge, { backgroundColor: threshold.color }]}>
                  <Text style={styles.statusText}>Reached</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(percentageUsed, 100)}%`,
                backgroundColor:
                  percentageUsed >= 100
                    ? COLORS.error
                    : percentageUsed >= 90
                    ? '#F97316'
                    : percentageUsed >= 75
                    ? '#F59E0B'
                    : COLORS.success,
              },
            ]}
          />
          
          {/* Threshold Markers */}
          {thresholds.map((threshold, index) => (
            <View
              key={index}
              style={[
                styles.marker,
                { left: `${threshold.level}%` }
              ]}
            />
          ))}
        </View>

        <View style={styles.progressLabels}>
          <Text style={styles.progressLabel}>0%</Text>
          <Text style={styles.progressLabel}>50%</Text>
          <Text style={styles.progressLabel}>100%</Text>
        </View>
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
  thresholdsContainer: {
    gap: 12,
    marginBottom: 20,
  },
  thresholdItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thresholdContent: {
    flex: 1,
  },
  thresholdLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  thresholdAmount: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.white,
  },
  progressBarContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.background,
    borderRadius: 4,
    position: 'relative',
    overflow: 'visible',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  marker: {
    position: 'absolute',
    width: 2,
    height: 12,
    backgroundColor: COLORS.textLight,
    top: -2,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressLabel: {
    fontSize: 11,
    color: COLORS.textLight,
  },
});

export default AlertThresholds;