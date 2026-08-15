import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { getStatusColor, getWorstStatus } from '../utils/safetyHelpers';

/**
 * One metric, carrying its own grade.
 *
 * These rows used to print a value and a limit with no grading at all, which
 * left the header badge as the only verdict on the card - and a badge that is
 * the sole grade is a surface a wrong answer can hide on. It did: the badge
 * tracked voltage alone for months, and nothing beneath it could contradict it.
 * The web client avoids this by having no summary badge and three per-metric
 * chips instead; this keeps the badge, because with two outlets the at-a-glance
 * verdict is worth having, but makes it a summary of grades that are visible
 * individually rather than an opaque one.
 *
 * Only exceptions are coloured. Painting all three green on every healthy
 * reading would make the normal case shout and the exception blend in.
 */
const MetricRow = ({ label, value, limit, grade, isStale }) => (
  <View style={styles.metricRow}>
    <View style={styles.metricInfo}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[
        styles.metricValue,
        !isStale && grade.label !== 'Normal' && { color: grade.color },
      ]}>
        {value}
      </Text>
    </View>
    <View style={styles.thresholdInfo}>
      <Text style={styles.thresholdLabel}>Limit</Text>
      <Text style={styles.thresholdValue}>{limit}</Text>
    </View>
  </View>
);

const ThresholdCard = ({ outletName, status, thresholds, isStale = false }) => {
  const voltageStatus = getStatusColor(status.voltage, thresholds.voltage);
  const currentStatus = getStatusColor(status.current, thresholds.current);
  const powerStatus = getStatusColor(status.power, thresholds.power);

  // All three, not just voltage. These were each computed and then only the
  // voltage one was rendered, so an outlet at 53.0 W against a 45 W limit
  // badged "Normal" while the banner above it read "Cut-off Active" - the
  // cutoff having fired on that very reading.
  const outletStatus = getWorstStatus(voltageStatus, currentStatus, powerStatus);

  // Nothing recent enough to grade. Showing the last values received would
  // claim the hardware is in a state nobody has confirmed, and grading them
  // is worse still: 0.0 V sits below every voltage minimum, so an unplugged
  // device reads as Critical rather than as absent.
  const showValue = (formatted) => (isStale ? '--' : formatted);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="flash" size={20} color={COLORS.primary} />
          <Text style={styles.outletName}>{outletName}</Text>
        </View>
        <View style={[
          styles.statusBadge,
          { backgroundColor: isStale ? COLORS.border : outletStatus.bg },
        ]}>
          <Text style={[
            styles.statusText,
            { color: isStale ? COLORS.textLight : outletStatus.color },
          ]}>
            {isStale ? 'No reading' : outletStatus.label}
          </Text>
        </View>
      </View>

      <View style={styles.metricsContainer}>
        <MetricRow
          label="Voltage"
          value={showValue(`${status.voltage.toFixed(1)} V`)}
          limit={`${thresholds.voltage.max} V`}
          grade={voltageStatus}
          isStale={isStale}
        />
        <MetricRow
          label="Current"
          value={showValue(`${status.current.toFixed(2)} A`)}
          limit={`${thresholds.current.max} A`}
          grade={currentStatus}
          isStale={isStale}
        />
        <MetricRow
          label="Power"
          value={showValue(`${status.power.toFixed(1)} W`)}
          limit={`${thresholds.power.max} W`}
          grade={powerStatus}
          isStale={isStale}
        />
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