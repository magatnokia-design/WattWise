import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { getManilaDateKey } from '../../../utils/liveUsage';
import DagitabCalendar from '../../../components/common/DagitabCalendar';
import { RANGE_PRESETS, buildBudgetTips } from '../../../utils/rangeUsage';

/**
 * "Check your usage" - any dates, or one day: what was used, what it cost,
 * how that compares, and one tip. Simplified Oct 2026 ("too tight, a lot
 * going on"): one date pill instead of From/To fields, two figures, one
 * comparison, the month-at-this-pace line, one tip - the fact list, the
 * per-day line and the footnote were removed. Asked for in the Oct 2026 feedback
 * ("from Oct 8 to today, how much have I used?", "simple words", "tips how to
 * budget").
 *
 * Every insight and tip is worked out from the figures (rangeUsage.js, shared
 * with the web and tested) - nothing here is general advice dressed as a
 * finding. The per-outlet rows were removed on request: the appliance line
 * says the same thing in words people use.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-10-08" -> "Oct 8, 2026", from the key's own digits so no time zone
// can move the day.
const formatKey = (key, withYear = true) => {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return '--';
  return withYear ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`;
};

// The range on one pill: "Oct 8, 2026", "Oct 1 – 22", or "Sep 28 – Oct 5".
const formatRange = ({ startDate, endDate }) => {
  if (startDate === endDate) return formatKey(startDate);
  if (String(startDate).slice(0, 7) === String(endDate).slice(0, 7)) {
    return `${formatKey(startDate, false)} – ${Number(String(endDate).slice(8))}`;
  }
  return `${formatKey(startDate, false)} – ${formatKey(endDate, false)}`;
};

const peso = (value) => `₱${Number(value || 0).toFixed(2)}`;

const RangeUsageCard = ({
  range,
  setRange,
  summary,
  insights,
  status,
  message,
  onRetry,
  monthlyBudget,
  daysInMonth,
}) => {
  // The Dagitab calendar: 'range' for "Pick dates", 'single' for "One day".
  const [calendarMode, setCalendarMode] = useState(null);
  const today = getManilaDateKey();

  const isSingleDay = range.startDate === range.endDate;
  const monthPreset = RANGE_PRESETS.find((preset) => preset.id === 'month');
  const isThisMonth = (() => {
    const resolved = monthPreset?.resolve(today);
    return resolved && resolved.startDate === range.startDate && resolved.endDate === range.endDate;
  })();
  const mode = isThisMonth ? 'month' : isSingleDay ? 'day' : 'range';

  const hasBudget = monthlyBudget > 0;
  const paceOver = hasBudget && summary.monthPaceCost > monthlyBudget;
  // One tip, not a list - the first is the most specific one buildBudgetTips
  // can back with the figures (Oct 2026: "too much going on").
  const tip = status === 'ready'
    ? buildBudgetTips(summary, insights, { monthlyBudget, daysInMonth })[0]
    : null;
  const change = insights?.change || null;

  const MODES = [
    { id: 'month', label: 'This month', onPress: () => monthPreset && setRange(monthPreset.resolve(today)) },
    { id: 'range', label: 'Pick dates', onPress: () => setCalendarMode('range') },
    { id: 'day', label: 'One day', onPress: () => setCalendarMode('single') },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Check your usage</Text>
        <TouchableOpacity
          style={styles.datePill}
          onPress={() => setCalendarMode(isSingleDay ? 'single' : 'range')}
          accessibilityRole="button"
          accessibilityLabel={`Dates: ${formatRange(range)}. Change`}
        >
          <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
          <Text style={styles.datePillText}>{formatRange(range)}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.modes}>
        {MODES.map((item) => {
          const active = mode === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.mode, active && styles.modeActive]}
              onPress={item.onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.modeText, active && styles.modeTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <DagitabCalendar
        visible={calendarMode !== null}
        mode={calendarMode || 'range'}
        title={calendarMode === 'single' ? 'Check one day' : 'Check your usage'}
        startDate={calendarMode === 'single' ? range.endDate : range.startDate}
        endDate={range.endDate}
        maxDate={today}
        onClose={() => setCalendarMode(null)}
        onConfirm={(picked) => {
          setRange({ startDate: picked.startDate, endDate: picked.endDate });
          setCalendarMode(null);
        }}
      />

      {status === 'invalid' ? (
        <Text style={styles.problem}>{message}</Text>
      ) : status === 'offline' ? (
        <View style={styles.offline}>
          <Text style={styles.problem}>These dates could not be loaded.</Text>
          <TouchableOpacity onPress={onRetry} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : status === 'loading' ? (
        <ActivityIndicator style={styles.spinner} color={COLORS.primary} />
      ) : (
        <>
          <View style={styles.result}>
            <View style={styles.resultBlock}>
              <Text style={styles.resultValue}>{Number(summary.totalKwh || 0).toFixed(2)}</Text>
              <Text style={styles.resultLabel}>kWh used</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultBlock}>
              <Text style={[styles.resultValue, styles.resultCost]}>{peso(summary.cost)}</Text>
              <Text style={styles.resultLabel}>cost</Text>
            </View>
          </View>

          {change && change.percent !== 0 ? (
            <View style={[styles.change, change.percent > 0 ? styles.changeUp : styles.changeDown]}>
              <Ionicons
                name={change.percent > 0 ? 'arrow-up' : 'arrow-down'}
                size={14}
                color={change.percent > 0 ? COLORS.error : COLORS.primary}
              />
              <Text style={[styles.changeText, { color: change.percent > 0 ? COLORS.error : COLORS.primary }]}>
                {Math.abs(change.percent)}% {change.percent > 0 ? 'more' : 'less'} than the {summary.days === 1 ? 'day' : 'days'} before
              </Text>
            </View>
          ) : null}

          {summary.days > 0 && summary.totalKwh > 0 ? (
            <View style={styles.paceRow}>
              <Text style={styles.paceLabel}>Full month at this pace</Text>
              <Text style={[styles.paceValue, paceOver && styles.paceValueOver]}>
                {peso(summary.monthPaceCost)}
              </Text>
              {hasBudget ? (
                <View style={[styles.budgetTag, paceOver && styles.budgetTagOver]}>
                  <Text style={[styles.budgetTagText, paceOver && styles.budgetTagTextOver]}>
                    {paceOver ? 'Over budget' : 'Within budget'}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {tip ? (
            <View style={styles.tip}>
              <Ionicons name="bulb" size={16} color="#B45309" />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 0,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#ECF8EF',
  },
  datePillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.primary,
  },
  modes: {
    flexDirection: 'row',
    marginTop: 14,
    padding: 3,
    borderRadius: 10,
    backgroundColor: COLORS.background,
  },
  mode: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeActive: {
    backgroundColor: COLORS.white,
    shadowColor: '#071B2C',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textLight,
  },
  modeTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  spinner: {
    marginVertical: 32,
  },
  problem: {
    fontSize: 13,
    color: COLORS.error,
    marginTop: 16,
  },
  offline: {
    marginTop: 4,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 6,
  },
  resultBlock: {
    flex: 1,
    alignItems: 'center',
  },
  resultDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  resultValue: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
  },
  resultCost: {
    color: COLORS.primary,
  },
  resultLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  changeUp: {
    backgroundColor: '#FEF2F2',
  },
  changeDown: {
    backgroundColor: '#ECF8EF',
  },
  changeText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  paceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  paceLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textLight,
  },
  paceValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  paceValueOver: {
    color: COLORS.error,
  },
  budgetTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#ECF8EF',
  },
  budgetTagOver: {
    backgroundColor: '#FEF2F2',
  },
  budgetTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  budgetTagTextOver: {
    color: COLORS.error,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.text,
  },
});

export default RangeUsageCard;
