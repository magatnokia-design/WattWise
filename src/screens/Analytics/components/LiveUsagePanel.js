// Live readings, compact (Oct 2026): the total draw and its cost per hour on
// one line, then one row per outlet - "Outlet 1" and "Outlet 2", by socket
// rather than by appliance name.
//
// Rows carry their value as text beside the bar, so the lighter series colour
// (under 3:1 against white) never carries identity on its own.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, CHART_COLORS } from '../../../constants/colors';
import { formatCurrency } from '../../BudgetTracking/utils/budgetHelpers';

const formatWatts = (watts) => {
  const value = Number(watts) || 0;
  return value >= 1000 ? `${(value / 1000).toFixed(2)} kW` : `${value.toFixed(1)} W`;
};

const statusOf = (outlet) => {
  if (outlet.isDrawing) return null;
  return outlet.isOn ? 'On · idle' : 'Off';
};

const LiveUsagePanel = ({ appliances = [], totalPowerW = 0, costPerHour = 0, isStale = false }) => {
  const outlets = [...appliances].sort((a, b) => a.outletNumber - b.outletNumber);
  const maxPower = Math.max(...outlets.map((item) => Number(item.powerW) || 0), 1);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Live now</Text>
        {isStale ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>No signal</Text>
          </View>
        ) : (
          <View style={[styles.pill, styles.pillLive]}>
            <View style={styles.liveDot} />
            <Text style={styles.pillLiveText}>Live</Text>
          </View>
        )}
      </View>

      {/* A frozen `power` field reads exactly like a live one, so the last
          values are never shown as "now" once readings stop. */}
      {isStale ? (
        <Text style={styles.stale}>No readings from the Hub right now.</Text>
      ) : (
        <>
          <View style={styles.totalRow}>
            <Text style={styles.totalValue}>{formatWatts(totalPowerW)}</Text>
            <Text style={styles.totalCost}>≈ {formatCurrency(costPerHour)}/hr</Text>
          </View>

          {outlets.map((outlet) => {
            const power = Number(outlet.powerW) || 0;
            const widthPercent = power > 0 ? Math.max(4, (power / maxPower) * 100) : 0;
            const status = statusOf(outlet);
            return (
              <View key={outlet.outletNumber} style={styles.row}>
                <View style={[styles.swatch, { backgroundColor: CHART_COLORS.series[(outlet.outletNumber - 1) % 2] }]} />
                <Text style={styles.outlet}>Outlet {outlet.outletNumber}</Text>
                <View style={styles.track}>
                  {widthPercent > 0 ? (
                    <View
                      style={[
                        styles.fill,
                        {
                          width: `${widthPercent}%`,
                          backgroundColor: CHART_COLORS.series[(outlet.outletNumber - 1) % 2],
                        },
                      ]}
                    />
                  ) : null}
                </View>
                <Text style={[styles.watts, status && styles.wattsMuted]}>
                  {status || formatWatts(power)}
                </Text>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: COLORS.background,
  },
  pillLive: {
    backgroundColor: '#ECF8EF',
  },
  pillText: {
    fontSize: 11,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  pillLiveText: {
    fontSize: 11,
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  stale: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 8,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 6,
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
  },
  totalCost: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  outlet: {
    width: 62,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: CHART_COLORS.grid,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  watts: {
    width: 68,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  wattsMuted: {
    fontWeight: '500',
    color: COLORS.textLight,
  },
});

export default LiveUsagePanel;
