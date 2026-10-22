import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { summarizeMonth } from '../utils/budgetHelpers';
import { getManilaDateKey } from '../../../utils/liveUsage';

/**
 * "This month at a glance" - the one place the Budget screen says where the
 * month is heading and what is safe to spend. Replaced the Spending Breakdown,
 * Alert Thresholds, the two stat tiles, Projected Analysis and Previous Months
 * (Oct 2026 feedback: simple, one overall view). The figures come from
 * summarizeMonth in budgetHelpers.js, shared with the web and tested.
 */

const STATUS = {
  'on-track': { label: 'On track', icon: 'checkmark-circle', color: COLORS.success, bg: '#ECF8EF' },
  'at-risk': { label: 'Heading over', icon: 'alert-circle', color: '#B45309', bg: '#FFFBEB' },
  over: { label: 'Over budget', icon: 'close-circle', color: COLORS.error, bg: '#FEF2F2' },
  none: { label: 'No budget yet', icon: 'remove-circle', color: COLORS.textLight, bg: COLORS.background },
};

const peso = (value) => `₱${Number(value || 0).toFixed(2)}`;

const MonthAtAGlance = ({ monthlyBudget, currentSpending, currentDay, daysInMonth, budgetHistory = [] }) => {
  const month = summarizeMonth({ monthlyBudget, currentSpending, currentDay, daysInMonth });
  const status = STATUS[month.status];

  const headline = {
    'on-track': `At this pace you will finish the month at ${peso(month.projected)}, ${peso(month.projectedDifference)} under your budget.`,
    'at-risk': `At this pace you will finish at ${peso(month.projected)}, ${peso(month.projectedDifference)} over your budget.`,
    over: `You have spent ${peso(-month.remaining)} more than your ${peso(monthlyBudget)} budget this month.`,
    none: `At this pace the month will cost about ${peso(month.projected)}. Set a budget to track it.`,
  }[month.status];

  // Oldest first, so the bars read left to right as time does.
  const months = [...budgetHistory].reverse();
  const tallest = Math.max(1, ...months.map((m) => Math.max(m.spent, m.budget || 0)));
  // Manila, not UTC: from midnight to 8 AM on the 1st, UTC is still last month.
  const currentKey = getManilaDateKey().slice(0, 7);
  const anyBudget = months.some((m) => m.budget > 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="stats-chart" size={20} color={COLORS.primary} />
        <Text style={styles.title}>This month at a glance</Text>
        <View style={[styles.pill, { backgroundColor: status.bg }]}>
          <Ionicons name={status.icon} size={14} color={status.color} />
          <Text style={[styles.pillText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <Text style={styles.headline}>{headline}</Text>

      <View style={styles.tiles}>
        <Tile label="Daily average" value={peso(month.dailyAverage)} />
        <Tile label="End of month" value={peso(month.projected)} />
        {monthlyBudget > 0 ? (
          <Tile
            label="Safe per day"
            value={peso(month.safeDaily)}
            note={`${month.daysLeft} ${month.daysLeft === 1 ? 'day' : 'days'} left`}
            strong
          />
        ) : (
          <Tile label="Days left" value={String(month.daysLeft)} />
        )}
      </View>

      {months.length > 0 ? (
        <View style={styles.history}>
          <Text style={styles.sectionTitle}>Last {months.length} months</Text>
          {months.map((m) => {
            const isCurrent = m.monthKey === currentKey;
            const over = m.budget > 0 && m.spent > m.budget;
            const color = m.budget > 0 ? (over ? COLORS.error : COLORS.primary) : COLORS.primaryLight;
            return (
              <View key={m.monthKey || m.id} style={styles.barRow}>
                <Text style={styles.barLabel}>{m.month}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(m.spent / tallest) * 100}%`, backgroundColor: color }]} />
                  {m.budget > 0 ? (
                    <View style={[styles.budgetMark, { left: `${(m.budget / tallest) * 100}%` }]} />
                  ) : null}
                </View>
                <Text style={styles.barValue}>
                  {peso(m.spent)}{isCurrent ? ' so far' : ''}
                </Text>
              </View>
            );
          })}
          {anyBudget ? (
            <Text style={styles.legend}>The thin line on a bar is that month's budget.</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.alerts}>
        <Ionicons name="notifications-outline" size={16} color={COLORS.textLight} />
        <Text style={styles.alertsText}>
          {monthlyBudget > 0
            ? "You'll get an alert at 50%, 75%, 90% and 100% of your budget."
            : 'Set a budget to get alerts at 50%, 75%, 90% and 100% of it.'}
        </Text>
      </View>
    </View>
  );
};

const Tile = ({ label, value, note, strong }) => (
  <View style={[styles.tile, strong && styles.tileStrong]}>
    <Text style={styles.tileLabel}>{label}</Text>
    <Text style={[styles.tileValue, strong && styles.tileValueStrong]}>{value}</Text>
    {note ? <Text style={styles.tileNote}>{note}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headline: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textDark,
  },
  tiles: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  tile: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    backgroundColor: COLORS.background,
  },
  tileStrong: {
    backgroundColor: '#ECF8EF',
  },
  tileLabel: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  tileValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  tileValueStrong: {
    color: COLORS.primary,
  },
  tileNote: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.textLight,
  },
  history: {
    marginTop: 18,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barLabel: {
    width: 34,
    fontSize: 13,
    color: COLORS.textLight,
  },
  barTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  budgetMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: COLORS.text,
  },
  barValue: {
    minWidth: 92,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  legend: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  alerts: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  alertsText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textLight,
  },
});

export default MonthAtAGlance;
