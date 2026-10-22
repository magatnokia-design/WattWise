import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { OfflineState } from '../../../components/common/OfflineNotice';
import { formatCost, formatDayKey } from '../utils/historyHelpers';

const EMPTY_USAGE = [];

const kwh = (value) => `${Number(value || 0).toFixed(2)} kWh`;

/**
 * Daily usage as a compact table (Oct 2026): the date, the day's kWh and
 * what it cost - nothing else. The per-outlet breakdown lives in the Excel
 * export, which stays detailed.
 */
const UsageHistory = ({ usage = EMPTY_USAGE, loading = false, showOfflineState = false, style }) => {
  if (usage.length === 0) {
    if (loading) {
      return (
        <View style={styles.empty}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.emptySub}>Loading usage…</Text>
        </View>
      );
    }
    if (showOfflineState) {
      return (
        <OfflineState
          compact
          body="Your usage is safe — the app just needs a connection to load it."
        />
      );
    }
    return (
      <View style={styles.empty}>
        <Ionicons name="bar-chart-outline" size={28} color={COLORS.textLight} />
        <Text style={styles.emptyTitle}>No usage yet</Text>
        <Text style={styles.emptySub}>
          Today&apos;s usage appears here as soon as an outlet starts drawing power.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, style]}>
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.head, styles.dateCol]}>Date</Text>
        <Text style={[styles.head, styles.numCol]}>Energy</Text>
        <Text style={[styles.head, styles.numCol]}>Cost</Text>
      </View>
      {usage.map((item, index) => (
        <View key={item.date || String(index)} style={[styles.row, index > 0 && styles.rowBorder]}>
          <View style={[styles.dateCol, styles.dateCell]}>
            <Text style={styles.date}>{formatDayKey(item.date)}</Text>
            {/* Today is measured so far, not a closed day. */}
            {item.isLive ? <Text style={styles.liveTag}>So far</Text> : null}
          </View>
          <Text style={[styles.value, styles.numCol]}>{kwh(item.totalKwh)}</Text>
          <Text style={[styles.value, styles.cost, styles.numCol]}>{formatCost(item.totalCost)}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  // Fixed heights so HistoryScreen can size a page to fit (USAGE_ROW_HEIGHT).
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
  },
  headRow: {
    height: 28,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  head: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dateCol: {
    flex: 1.4,
  },
  numCol: {
    flex: 1,
    textAlign: 'right',
  },
  dateCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  date: {
    fontSize: 13.5,
    fontWeight: '600',
    color: COLORS.text,
  },
  liveTag: {
    fontSize: 9.5,
    fontWeight: '700',
    color: COLORS.primaryDark,
    backgroundColor: '#ECF8EF',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  value: {
    fontSize: 13.5,
    color: COLORS.text,
  },
  cost: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});

export default UsageHistory;
