import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, CHART_COLORS } from '../../../constants/colors';

const MIN_BAR_PERCENT = 4;

/**
 * One metric compared as two proportional bars.
 *
 * Bars rather than numbers alone: the whole question is "which is bigger and by
 * how much", and two lengths answer that faster than two figures. Both bars are
 * scaled against the larger of the pair, so the ratio between them is the
 * actual ratio of the values.
 */
const CompareMetric = ({
  title,
  labelA,
  labelB,
  valueA,
  valueB,
  delta,
  format,
  // Using less energy is good; the caller can flip this where that is not true.
  lowerIsBetter = true,
}) => {
  const max = Math.max(Number(valueA) || 0, Number(valueB) || 0);
  const widthFor = (value) => {
    if (max <= 0) return `${MIN_BAR_PERCENT}%`;
    const percent = ((Number(value) || 0) / max) * 100;
    // A tiny-but-nonzero value still gets a visible stub.
    return `${Math.max(percent, value > 0 ? MIN_BAR_PERCENT : 0)}%`;
  };

  const improving = lowerIsBetter ? delta.direction === 'down' : delta.direction === 'up';
  const deltaColor = delta.direction === 'flat'
    ? COLORS.textLight
    : (improving ? COLORS.success : COLORS.error);

  const arrow = delta.direction === 'flat' ? '→' : (delta.direction === 'down' ? '↓' : '↑');

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.deltaPill, { borderColor: deltaColor }]}>
          <Text style={[styles.deltaText, { color: deltaColor }]}>
            {arrow} {delta.absolutePercent === null
              ? format(delta.absolute)
              : `${delta.absolutePercent.toFixed(1)}%`}
          </Text>
        </View>
      </View>

      <View style={styles.barBlock}>
        <View style={styles.barLabelRow}>
          <Text style={styles.barLabel}>{labelA}</Text>
          <Text style={styles.barValue}>{format(valueA)}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: widthFor(valueA), backgroundColor: CHART_COLORS.series[0] }]} />
        </View>
      </View>

      <View style={styles.barBlock}>
        <View style={styles.barLabelRow}>
          <Text style={styles.barLabelMuted}>{labelB}</Text>
          <Text style={styles.barValueMuted}>{format(valueB)}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: widthFor(valueB), backgroundColor: CHART_COLORS.series[1] }]} />
        </View>
      </View>

      <Text style={styles.summary}>
        {delta.direction === 'flat'
          ? 'No meaningful change.'
          : `${format(delta.absolute)} ${delta.direction === 'down' ? 'less' : 'more'} than ${labelB}.`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  deltaPill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '700',
  },
  barBlock: {
    marginBottom: 12,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 5,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  barLabelMuted: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  barValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  barValueMuted: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: CHART_COLORS.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
  summary: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
});

export default CompareMetric;
