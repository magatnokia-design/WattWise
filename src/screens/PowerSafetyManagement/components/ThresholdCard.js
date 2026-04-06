import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { getStatusColor } from '../utils/safetyHelpers';

const ThresholdCard = ({ outletName, status, thresholds }) => {
  const voltageStatus = getStatusColor(status.voltage, thresholds.voltage);
  const currentStatus = getStatusColor(status.current, thresholds.current);
  const powerStatus = getStatusColor(status.power, thresholds.power);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="flash" size={20} color={COLORS.primary} />
          <Text style={styles.outletName}>{outletName}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: voltageStatus.bg }]}>
          <Text style={[styles.statusText, { color: voltageStatus.color }]}>
            {voltageStatus.label}
          </Text>
        </View>
      </View>

      <View style={styles.metricsContainer}>
        {/* Voltage */}
        <View style={styles.metricRow}>
          <View style={styles.metricInfo}>
            <Text style={styles.metricLabel}>Voltage</Text>
            <Text style={styles.metricValue}>
              {status.voltage.toFixed(1)} V
            </Text>
          </View>
          <View style={styles.thresholdInfo}>
            <Text style={styles.thresholdLabel}>Limit</Text>
            <Text style={styles.thresholdValue}>
              {thresholds.voltage.max} V
            </Text>
          </View>
        </View>

        {/* Current */}
        <View style={styles.metricRow}>
          <View style={styles.metricInfo}>
            <Text style={styles.metricLabel}>Current</Text>
            <Text style={styles.metricValue}>
              {status.current.toFixed(2)} A
            </Text>
          </View>
          <View style={styles.thresholdInfo}>
            <Text style={styles.thresholdLabel}>Limit</Text>
            <Text style={styles.thresholdValue}>
              {thresholds.current.max} A
            </Text>
          </View>
        </View>

        {/* Power */}
        <View style={styles.metricRow}>
          <View style={styles.metricInfo}>
            <Text style={styles.metricLabel}>Power</Text>
            <Text style={styles.metricValue}>
              {status.power.toFixed(1)} W
            </Text>
          </View>
          <View style={styles.thresholdInfo}>
            <Text style={styles.thresholdLabel}>Limit</Text>
            <Text style={styles.thresholdValue}>
              {thresholds.power.max} W
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  outletName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricsContainer: {
    gap: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  metricInfo: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  thresholdInfo: {
    alignItems: 'flex-end',
  },
  thresholdLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    marginBottom: 2,
  },
  thresholdValue: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textLight,
  },
});

export default ThresholdCard;