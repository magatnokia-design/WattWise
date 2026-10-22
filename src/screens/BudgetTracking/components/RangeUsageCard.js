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
 * what stands out, and what would help. Asked for in the Oct 2026 feedback
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

const formatHour = (hour) => {
  const h = Number(hour);
  if (!Number.isFinite(h)) return null;
  const suffix = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
};

const peso = (value) => `₱${Number(value || 0).toFixed(2)}`;
const kwh = (value) => `${Number(value || 0).toFixed(2)} kWh`;

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
  // The Dagitab calendar (Oct 2026), replacing the phone's own date dialog:
  // 'range' when From or To is tapped, 'single' for "Pick a day", null closed.
  const [calendarMode, setCalendarMode] = useState(null);
  const today = getManilaDateKey();

  const openPicker = (field) => setCalendarMode(field === 'day' ? 'single' : 'range');

  const isSingleDay = range.startDate === range.endDate;
  const activePreset = isSingleDay
    ? 'day'
    : RANGE_PRESETS.find((preset) => {
      const resolved = preset.resolve(today);
      return resolved.startDate === range.startDate && resolved.endDate === range.endDate;
    })?.id;

  const hasBudget = monthlyBudget > 0;
  const paceOver = hasBudget && summary.monthPaceCost > monthlyBudget;
  const tips = status === 'ready'
    ? buildBudgetTips(summary, insights, { monthlyBudget, daysInMonth })
    : [];

  const periodWord = summary.days === 1 ? 'the day before' : `the ${summary.days} days before`;
  const facts = [];
  if (insights?.change) {
    const { percent, previousCost } = insights.change;
    facts.push({
      icon: percent > 0 ? 'trending-up' : 'trending-down',
      tone: percent > 0 ? 'up' : 'down',
      text: percent === 0
        ? `Same as ${periodWord} (${peso(previousCost)}).`
        : `${Math.abs(percent)}% ${percent > 0 ? 'more' : 'less'} than ${periodWord} (${peso(previousCost)}).`,
    });
  }
  if (insights?.day?.peakPower > 0) {
    const hour = formatHour(insights.day.peakHour);
    facts.push({
      icon: 'flash',
      text: `Highest draw was ${insights.day.peakPower.toFixed(0)} W${hour ? ` around ${hour}` : ''}.`,
    });
  }
  if (insights?.topAppliance) {
    const top = insights.topAppliance;
    facts.push({ icon: 'pie-chart', text: `${top.name} used ${top.share}% of the energy (${peso(top.cost)}).` });
  }
  if (insights?.busiest) {
    facts.push({
      icon: 'arrow-up-circle',
      text: `Busiest day: ${formatKey(insights.busiest.date, false)} — ${peso(insights.busiest.cost)}.`,
    });
  }
  if (insights?.quietest && insights.quietest.date !== insights.busiest?.date) {
    facts.push({
      icon: 'arrow-down-circle',
      text: `Quietest day: ${formatKey(insights.quietest.date, false)} — ${peso(insights.quietest.cost)}.`,
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="calendar" size={22} color={COLORS.primary} />
        <Text style={styles.title}>Check your usage</Text>
      </View>
      <Text style={styles.lead}>Pick dates, or one day, to see what you used and how to save.</Text>

      <View style={styles.presets}>
        {RANGE_PRESETS.map((preset) => {
          const active = activePreset === preset.id;
          return (
            <TouchableOpacity
              key={preset.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setRange(preset.resolve(today))}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.chip, activePreset === 'day' && styles.chipActive]}
          onPress={() => openPicker('day')}
          accessibilityRole="button"
          accessibilityState={{ selected: activePreset === 'day' }}
        >
          <Text style={[styles.chipText, activePreset === 'day' && styles.chipTextActive]}>Pick a day</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.dates}>
        {[['startDate', 'From'], ['endDate', 'To']].map(([field, label]) => (
          <TouchableOpacity
            key={field}
            style={styles.dateButton}
            onPress={() => openPicker(field)}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${formatKey(range[field])}. Change date`}
          >
            <Text style={styles.dateLabel}>{label}</Text>
            <View style={styles.dateValueRow}>
              <Text style={styles.dateValue}>{formatKey(range[field])}</Text>
              <Ionicons name="chevron-down" size={16} color={COLORS.textLight} />
            </View>
          </TouchableOpacity>
        ))}
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
          <Text style={styles.problem}>These dates could not be loaded. Check your connection.</Text>
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
              <Text style={styles.resultLabel}>You used</Text>
              <Text style={styles.resultValue}>{kwh(summary.totalKwh)}</Text>
            </View>
            <View style={styles.resultBlock}>
              <Text style={styles.resultLabel}>It cost about</Text>
              <Text style={[styles.resultValue, styles.resultCost]}>{peso(summary.cost)}</Text>
            </View>
          </View>
          {!isSingleDay && summary.days > 0 ? (
            <Text style={styles.perDay}>
              {peso(summary.dailyCost)} a day over {summary.days} days
            </Text>
          ) : null}

          {facts.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>What stands out</Text>
              {facts.map((fact) => (
                <View key={fact.text} style={styles.fact}>
                  <Ionicons
                    name={fact.icon}
                    size={16}
                    color={fact.tone === 'up' ? COLORS.error : COLORS.primary}
                  />
                  <Text style={styles.factText}>{fact.text}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {summary.days > 0 && summary.totalKwh > 0 ? (
            <View style={[styles.pace, paceOver && styles.paceOver]}>
              <Text style={[styles.paceText, paceOver && styles.paceTextOver]}>
                At this rate, a full month costs about {peso(summary.monthPaceCost)}
                {hasBudget
                  ? paceOver
                    ? ` — more than your ${peso(monthlyBudget)} budget.`
                    : ` — within your ${peso(monthlyBudget)} budget.`
                  : '.'}
              </Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tips to save</Text>
            {tips.map((tip) => (
              <View key={tip} style={styles.fact}>
                <Ionicons name="bulb-outline" size={16} color={COLORS.warning} />
                <Text style={styles.factText}>{tip}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.footnote}>
            {summary.includesToday ? 'Today counts what you have used so far. ' : ''}
            Costs are the electricity at your rates. Your bill also adds a small monthly meter charge.
          </Text>
        </>
      )}
    </View>
  );
};

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
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  lead: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 14,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    color: COLORS.textDark,
    fontWeight: '500',
  },
  chipTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  dates: {
    flexDirection: 'row',
    gap: 10,
  },
  dateButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.background,
  },
  dateLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 2,
  },
  dateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  spinner: {
    marginVertical: 24,
  },
  offline: {
    marginTop: 16,
    alignItems: 'flex-start',
    gap: 8,
  },
  problem: {
    marginTop: 16,
    fontSize: 14,
    color: COLORS.error,
  },
  retry: {
    paddingVertical: 6,
  },
  retryText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  result: {
    flexDirection: 'row',
    marginTop: 18,
  },
  resultBlock: {
    flex: 1,
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  resultValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  resultCost: {
    color: COLORS.primary,
  },
  perDay: {
    textAlign: 'center',
    marginTop: 6,
    fontSize: 13,
    color: COLORS.textLight,
  },
  section: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  factText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textDark,
  },
  pace: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#ECF8EF',
  },
  paceOver: {
    backgroundColor: '#FEF2F2',
  },
  paceText: {
    fontSize: 14,
    color: COLORS.primaryDeep,
    lineHeight: 20,
  },
  paceTextOver: {
    color: '#991B1B',
  },
  footnote: {
    marginTop: 14,
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
  },
});

export default RangeUsageCard;
