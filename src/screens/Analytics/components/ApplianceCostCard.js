import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, CHART_COLORS } from '../../../constants/colors';
import { formatCurrency } from '../../BudgetTracking/utils/budgetHelpers';

/**
 * What each appliance cost over the selected period (Oct 2026).
 *
 * Kept to three rows on purpose: per-appliance usage was taken off Analytics
 * once already for making the screen "too tight", and came back on request as
 * a cost card. The full list, cost per hour and the calculator live on the
 * Appliance costs screen behind the link.
 *
 * `rows` arrive priced by `priceByEnergyShare`, the statement's rule, so they
 * add up to the total in the card above rather than disagreeing with it.
 */
const ApplianceCostCard = ({ rows, costLabel, onOpen }) => (
  <View style={styles.card}>
    <Text style={styles.title}>Appliance costs</Text>
    <Text style={styles.caption}>
      The {costLabel} split by each appliance&apos;s share of the energy - the same split your
      statement uses.
    </Text>

    <View style={styles.rows}>
      {rows.map((row, index) => (
        <View key={row.applianceName} style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={styles.name} numberOfLines={1}>{row.applianceName}</Text>
            <Text style={styles.cost}>{formatCurrency(row.cost)}</Text>
          </View>
          <View style={styles.rowBottom}>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.max(3, row.share * 100)}%`,
                    backgroundColor: CHART_COLORS.series[index % CHART_COLORS.series.length],
                  },
                ]}
              />
            </View>
            <Text style={styles.detail}>
              {row.energyKwh.toFixed(2)} kWh · {Math.round(row.share * 100)}%
            </Text>
          </View>
        </View>
      ))}
    </View>

    <TouchableOpacity
      style={styles.link}
      onPress={onOpen}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Open appliance costs: cost per hour and calculator"
    >
      <Ionicons name="calculator-outline" size={16} color={COLORS.primary} />
      <Text style={styles.linkText}>Cost per hour &amp; calculator</Text>
      <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  caption: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  rows: {
    marginTop: 12,
    gap: 12,
  },
  row: {
    gap: 5,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: COLORS.text,
  },
  cost: {
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.text,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: CHART_COLORS.grid,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  detail: {
    fontSize: 11.5,
    color: COLORS.textLight,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
});

export default ApplianceCostCard;
