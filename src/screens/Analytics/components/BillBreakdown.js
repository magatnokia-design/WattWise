// The bill for the period, compact (Oct 2026): one bar split by the four
// groups of the PELCO III bill, each group one row with its total. A row
// opens to its individual lines - they used to be printed all at once, about
// fifteen of them, which made this the longest card on the screen.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { formatCurrency } from '../../BudgetTracking/utils/budgetHelpers';

const GROUPS = [
  { key: 'generationTransmission', label: 'Generation & transmission', color: '#00401F' },
  { key: 'distribution', label: 'Distribution', color: '#008D43' },
  { key: 'government', label: 'Government charges', color: '#50D52B' },
  { key: 'otherCharges', totalKey: 'other', label: 'Other charges', color: '#B4E5C2' },
];

const BillBreakdown = ({ bill, rateLabel, rate }) => {
  const [open, setOpen] = useState(null);
  if (!bill?.totals) return null;

  const total = Number(bill.totals.total) || 0;
  const groups = GROUPS
    .map((group) => ({
      ...group,
      amount: Number(bill.totals[group.totalKey || group.key]) || 0,
      items: bill.items?.[group.key] || [],
    }))
    .filter((group) => group.items.length > 0 || group.amount !== 0);
  const positive = groups.reduce((sum, group) => sum + Math.max(0, group.amount), 0);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Bill breakdown</Text>
        <Text style={styles.total}>{formatCurrency(total)}</Text>
      </View>

      {positive > 0 ? (
        <View style={styles.stack}>
          {groups.filter((group) => group.amount > 0).map((group) => (
            <View
              key={group.key}
              style={{ flex: group.amount / positive, backgroundColor: group.color }}
            />
          ))}
        </View>
      ) : null}

      {groups.map((group) => {
        const isOpen = open === group.key;
        return (
          <View key={group.key}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => setOpen(isOpen ? null : group.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <View style={[styles.dot, { backgroundColor: group.color }]} />
              <Text style={styles.rowLabel} numberOfLines={1}>{group.label}</Text>
              <Text style={styles.rowAmount}>{formatCurrency(group.amount)}</Text>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.textLight} />
            </TouchableOpacity>
            {isOpen ? (
              <View style={styles.lines}>
                {group.items.map((item) => (
                  <View key={item.key} style={styles.line}>
                    <Text style={styles.lineLabel} numberOfLines={1}>{item.label}</Text>
                    <Text style={styles.lineAmount}>{formatCurrency(item.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.rate}>
        <Text style={styles.rateLabel}>{rateLabel}</Text>
        <Text style={styles.rateValue}>₱{Number(rate || 0).toFixed(4)} / kWh</Text>
      </View>
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
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  total: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  stack: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 2,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  rowLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
  },
  rowAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  lines: {
    marginLeft: 17,
    marginBottom: 4,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    gap: 8,
  },
  lineLabel: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textLight,
  },
  lineAmount: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  rate: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    marginTop: 4,
  },
  rateLabel: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  rateValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
});

export default BillBreakdown;
