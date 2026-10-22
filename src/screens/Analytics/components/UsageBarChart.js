// Daily energy as stacked bars - Outlet 1 under Outlet 2 - for the Weekly and
// Monthly views (Oct 2026, replacing a bar per value with a number printed over
// every bar).
//
// Tap a bar to read it: the line above the chart names the day and its split,
// so no bar needs a label of its own. A dashed line marks the period's daily
// average. With no selection the line reads the latest day (today).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { COLORS, CHART_COLORS } from '../../../constants/colors';

const CHART_HEIGHT = 132;
const AXIS_WIDTH = 34;

// A round ceiling for the axis: 1, 2 or 5 times a power of ten.
export const niceCeiling = (value) => {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= value);
  return step * magnitude;
};

const kwh = (value) => `${Number(value || 0).toFixed(2)} kWh`;

/**
 * @param {Array<{key: string, label: string, shortLabel: string, showLabel: boolean, o1: number, o2: number}>} bars
 */
const UsageBarChart = ({ bars = [] }) => {
  const [selected, setSelected] = useState(null);
  // A new period is a new set of bars; an index into the old one means nothing.
  const firstKey = bars[0]?.key;
  useEffect(() => setSelected(null), [firstKey, bars.length]);

  const totals = useMemo(() => bars.map((bar) => (bar.o1 || 0) + (bar.o2 || 0)), [bars]);
  const max = niceCeiling(Math.max(0, ...totals));
  const average = totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : 0;
  const hasUsage = totals.some((value) => value > 0);

  if (bars.length === 0) return null;

  const active = selected ?? bars.length - 1;
  const activeBar = bars[active];

  return (
    <View>
      <View style={styles.readout}>
        <Text style={styles.readoutDay}>{activeBar.label}</Text>
        <Text style={styles.readoutValue}>{kwh(totals[active])}</Text>
      </View>
      <Text style={styles.readoutSplit}>
        Outlet 1 {Number(activeBar.o1 || 0).toFixed(2)} · Outlet 2 {Number(activeBar.o2 || 0).toFixed(2)} kWh
      </Text>

      <View style={styles.plot}>
        <View style={styles.axis}>
          <Text style={styles.axisLabel}>{max >= 1 ? max.toFixed(0) : max.toFixed(2)}</Text>
          <Text style={styles.axisLabel}>{(max / 2) >= 1 ? (max / 2).toFixed(1) : (max / 2).toFixed(2)}</Text>
          <Text style={styles.axisLabel}>0</Text>
        </View>

        <View style={styles.area}>
          {[0, 0.5, 1].map((fraction) => (
            <View key={fraction} style={[styles.gridLine, { bottom: fraction * CHART_HEIGHT }]} />
          ))}

          {hasUsage && average > 0 ? (
            <View style={[styles.averageLine, { bottom: (average / max) * CHART_HEIGHT }]} />
          ) : null}

          <View style={styles.bars}>
            {bars.map((bar, index) => {
              const o1Height = ((bar.o1 || 0) / max) * CHART_HEIGHT;
              const o2Height = ((bar.o2 || 0) / max) * CHART_HEIGHT;
              const isActive = index === active;
              return (
                <Pressable
                  key={bar.key}
                  style={styles.barSlot}
                  onPress={() => setSelected(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`${bar.label}, ${kwh(totals[index])}`}
                >
                  <View style={[styles.bar, !isActive && selected !== null && styles.barDimmed]}>
                    {o2Height > 0 ? (
                      <View style={[styles.segment, styles.segmentTop, { height: o2Height, backgroundColor: CHART_COLORS.series[1] }]} />
                    ) : null}
                    {o1Height > 0 ? (
                      <View style={[styles.segment, o2Height > 0 ? null : styles.segmentTop, { height: o1Height, backgroundColor: CHART_COLORS.series[0] }]} />
                    ) : null}
                    {o1Height + o2Height === 0 ? <View style={styles.zeroTick} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {!hasUsage ? (
            <View style={styles.emptyOverlay}>
              <Text style={styles.emptyText}>No usage recorded yet</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.labels, { marginLeft: AXIS_WIDTH }]}>
        {bars.map((bar, index) => (
          // A fixed-width label centred on a slot that may be narrower than it
          // (31 days on a phone), so "25" is never clipped to "2".
          <View key={bar.key} style={styles.xSlot}>
            {bar.showLabel ? (
              <Text style={[styles.xLabel, index === active && styles.xLabelActive]} numberOfLines={1}>
                {bar.shortLabel}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.series[0] }]} />
          <Text style={styles.legendText}>Outlet 1</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: CHART_COLORS.series[1] }]} />
          <Text style={styles.legendText}>Outlet 2</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendDash} />
          <Text style={styles.legendText}>Daily average {kwh(average)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  readout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  readoutDay: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  readoutValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
  },
  readoutSplit: {
    fontSize: 11.5,
    color: COLORS.textLight,
    marginTop: 1,
    marginBottom: 10,
  },
  plot: {
    flexDirection: 'row',
    height: CHART_HEIGHT,
  },
  axis: {
    width: AXIS_WIDTH,
    justifyContent: 'space-between',
    paddingRight: 6,
    marginVertical: -6,
  },
  axisLabel: {
    fontSize: 9.5,
    color: COLORS.textLight,
    textAlign: 'right',
  },
  area: {
    flex: 1,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: CHART_COLORS.grid,
  },
  averageLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.textLight,
    zIndex: 2,
  },
  bars: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  barSlot: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '62%',
    maxWidth: 26,
    alignItems: 'stretch',
  },
  barDimmed: {
    opacity: 0.45,
  },
  segment: {
    width: '100%',
  },
  segmentTop: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  zeroTick: {
    height: 2,
    borderRadius: 1,
    backgroundColor: CHART_COLORS.track,
  },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  labels: {
    flexDirection: 'row',
    marginTop: 4,
  },
  xSlot: {
    flex: 1,
    alignItems: 'center',
  },
  xLabel: {
    width: 28,
    fontSize: 9.5,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  xLabelActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendDash: {
    width: 12,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.textLight,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.textLight,
  },
});

export default UsageBarChart;
