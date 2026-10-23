import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../../constants/colors';
import { getStatusColor, getWorstStatus } from '../utils/safetyHelpers';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * One metric, carrying its own grade, with its limit beneath it.
 *
 * Each metric is graded individually so the badge is a visible summary of
 * three grades rather than an opaque one - the badge once tracked voltage
 * alone for months and nothing beneath it could contradict it.
 *
 * Only exceptions are coloured. Painting all three green on every healthy
 * reading would make the normal case shout and the exception blend in.
 */
const Metric = ({ label, value, limit, grade, isStale }) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text
      style={[
        styles.metricValue,
        !isStale && grade.label !== 'Normal' && { color: grade.color },
      ]}
      numberOfLines={1}
    >
      {value}
    </Text>
    <Text style={styles.metricLimit} numberOfLines={1}>{limit}</Text>
  </View>
);

/** One outlet's live readings against the limits - compact (Oct 2026). */
const ThresholdCard = ({ outletName, status, thresholds, isStale = false }) => {
  const voltage = toNumber(status?.voltage);
  const current = toNumber(status?.current);
  const power = toNumber(status?.power);

  const voltageStatus = getStatusColor(voltage, thresholds.voltage);
  const currentStatus = getStatusColor(current, thresholds.current);
  const powerStatus = getStatusColor(power, thresholds.power);

  // All three, not just voltage: an outlet at 53.0 W against a 45 W limit once
  // badged "Normal" while the banner above it read "Cut-off Active".
  const outletStatus = getWorstStatus(voltageStatus, currentStatus, powerStatus);

  // Nothing recent enough to grade. 0.0 V sits below every voltage minimum, so
  // grading stale values would call an unplugged Hub Critical.
  const showValue = (formatted) => (isStale ? '--' : formatted);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.outletName}>{outletName}</Text>
        <View style={[styles.statusBadge, { backgroundColor: isStale ? COLORS.border : outletStatus.bg }]}>
          <Text style={[styles.statusText, { color: isStale ? COLORS.textLight : outletStatus.color }]}>
            {isStale ? 'No reading' : outletStatus.label}
          </Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric
          label="Voltage"
          value={showValue(`${voltage.toFixed(0)} V`)}
          limit={`${thresholds.voltage.min}–${thresholds.voltage.max} V`}
          grade={voltageStatus}
          isStale={isStale}
        />
        <View style={styles.divider} />
        <Metric
          label="Current"
          value={showValue(`${current.toFixed(2)} A`)}
          limit={`max ${thresholds.current.max} A`}
          grade={currentStatus}
          isStale={isStale}
        />
        <View style={styles.divider} />
        <Metric
          label="Power"
          value={showValue(`${power.toFixed(1)} W`)}
          limit={`max ${thresholds.power.max} W`}
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
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  outletName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: COLORS.border,
  },
  metricLabel: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginVertical: 1,
  },
  metricLimit: {
    fontSize: 10.5,
    color: COLORS.textLight,
  },
});

export default ThresholdCard;
