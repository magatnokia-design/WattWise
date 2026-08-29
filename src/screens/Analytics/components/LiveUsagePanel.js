// Real-time per-appliance usage.
//
// The job here is magnitude plus identity across two items, so these are
// horizontal bars with the value written on each row - not a chart with axes.
// Every row is directly labelled, which is also what lets the lighter series
// colour be used at all: it sits under 3:1 against white, so identity never
// rests on the colour alone.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, CHART_COLORS } from '../../../constants/colors';
import { FONTS } from '../../../constants/theme';
import { formatCurrency } from '../../BudgetTracking/utils/budgetHelpers';

const formatWatts = (watts) => {
  const value = Number(watts) || 0;
  return value >= 1000 ? `${(value / 1000).toFixed(2)} kW` : `${value.toFixed(1)} W`;
};

const StatusPill = ({ appliance }) => {
  if (appliance.isDrawing) {
    return (
      <View style={[styles.pill, styles.pillLive]}>
        <View style={styles.liveDot} />
        <Text style={styles.pillLiveText}>Live</Text>
      </View>
    );
  }

  // Status is carried by the label, not by colour on its own.
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{appliance.isOn ? 'On · idle' : 'Off'}</Text>
    </View>
  );
};

const LiveUsagePanel = ({ appliances = [], totalPowerW = 0, costPerHour = 0, isStale = false }) => {
  const maxPower = Math.max(...appliances.map((item) => Number(item.powerW) || 0), 1);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Right now</Text>
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

      {/* A frozen `power` field reads exactly like a live one, so presenting the
          last values under "drawing now" asserted a load that had stopped. The
          web client already gated this panel on freshness and said so in its own
          comment; the phone never got the same fix, and reported 14.1 W drawing
          for an outlet its own Home tab showed as 0.0 W with no reading.

          The numbers were real. Presenting them as current was not. */}
      {isStale ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No readings in the last 12 seconds</Text>
          <Text style={styles.emptyBody}>
            The Hub may still be connected — Settings tracks that separately, because
            checking for commands is silent. This panel fills in while readings are
            actually arriving. Switching an outlet usually starts them again.
          </Text>
        </View>
      ) : (
        <>
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.heroValue}>{formatWatts(totalPowerW)}</Text>
            <Text style={styles.heroLabel}>drawing now</Text>
          </View>
          <View style={styles.heroDivider} />
          <View>
            <Text style={styles.heroValue}>{formatCurrency(costPerHour)}</Text>
            <Text style={styles.heroLabel}>per hour at this rate</Text>
          </View>
        </View>

        {appliances.map((appliance, index) => {
          const power = Number(appliance.powerW) || 0;
          const widthPercent = power > 0 ? Math.max(4, (power / maxPower) * 100) : 0;

          return (
            <View key={appliance.outletNumber} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.applianceName} numberOfLines={1}>
                  {appliance.applianceName}
                </Text>
                <StatusPill appliance={appliance} />
              </View>

              <View style={styles.track}>
                {widthPercent > 0 ? (
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${widthPercent}%`,
                        backgroundColor: CHART_COLORS.series[index % CHART_COLORS.series.length],
                      },
                    ]}
                  />
                ) : null}
              </View>

              <View style={styles.rowFooter}>
                <Text style={styles.rowMetric}>{formatWatts(power)}</Text>
                <Text style={styles.rowMeta}>
                  {appliance.energyKwh.toFixed(3)} kWh today · {formatCurrency(appliance.costToday)}
                </Text>
              </View>
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
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    ...FONTS.h3,
    color: COLORS.textDark,
    fontWeight: '700',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  pillLive: {
    borderColor: COLORS.primary + '55',
    backgroundColor: COLORS.primary + '12',
  },
  pillText: {
    ...FONTS.small,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  pillLiveText: {
    ...FONTS.small,
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  heroValue: {
    ...FONTS.h2,
    color: COLORS.textDark,
    fontWeight: '700',
  },
  heroLabel: {
    ...FONTS.small,
    color: COLORS.textLight,
    marginTop: 2,
  },
  heroDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: COLORS.border,
  },
  row: {
    marginTop: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  applianceName: {
    flex: 1,
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: '600',
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
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
  },
  rowMetric: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: '700',
  },
  rowMeta: {
    flex: 1,
    ...FONTS.small,
    color: COLORS.textLight,
    textAlign: 'right',
  },
  empty: {
    paddingVertical: 18,
    gap: 6,
  },
  emptyTitle: {
    ...FONTS.body,
    color: COLORS.textDark,
    fontWeight: '700',
  },
  emptyBody: {
    ...FONTS.small,
    color: COLORS.textLight,
    lineHeight: 18,
  },
});

export default LiveUsagePanel;
