import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
const Metric = ({ icon, label, value, limit, grade, isStale, last }) => (
  <View style={[styles.metric, !last && styles.metricDivided]}>
    <View style={styles.metricIcon}>
      <Ionicons name={icon} size={15} color={COLORS.primary} />
    </View>
    <Text style={styles.metricLabel}>{label}</Text>
    <View style={styles.metricRight}>
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

      <View>
        <Metric
          icon="speedometer-outline"
          label="Voltage"
          value={showValue(`${voltage.toFixed(0)} V`)}
          limit={`${thresholds.voltage.min}–${thresholds.voltage.max} V allowed`}
          grade={voltageStatus}
          isStale={isStale}
        />
        <Metric
          icon="pulse-outline"
          label="Current"
          value={showValue(`${current.toFixed(2)} A`)}
          limit={`up to ${thresholds.current.max} A`}
          grade={currentStatus}
          isStale={isStale}
        />
        <Metric
          icon="flash-outline"
          label="Power"
          value={showValue(`${power.toFixed(1)} W`)}
          limit={`up to ${thresholds.power.max} W`}
          grade={powerStatus}
          isStale={isStale}
          last
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  outletName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  metricDivided: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ECF8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  metricRight: {
    alignItems: 'flex-end',
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  metricLimit: {
    fontSize: 11.5,
    color: COLORS.textLight,
    marginTop: 1,
  },
});

export default ThresholdCard;
