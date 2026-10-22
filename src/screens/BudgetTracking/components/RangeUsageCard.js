import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { COLORS } from '../../../constants/colors';
import { getManilaDateKey } from '../../../utils/liveUsage';
import { RANGE_PRESETS } from '../../../utils/rangeUsage';

/**
 * "Check your usage" - pick any two dates and see what was used and what it
 * cost, so the monthly budget can be planned from real figures. Asked for in
 * the Oct 2026 feedback: "from Oct 8 to today, how much have I used?"
 *
 * Plain words on purpose (same feedback: "simple words"). The one caveat that
 * matters - this is the cost of the electricity, not the bill - is a single
 * line under the result rather than a paragraph.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-10-08" -> "Oct 8, 2026". Built from the key's own digits, so no time
// zone can move the day.
const formatKey = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : '--';
};

// The picker works in the phone's local time; a date key is a calendar day.
// Local midnight of that day, and back, keeps the picked day the picked day.
const keyToLocalDate = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const localDateToKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const peso = (value) => `₱${Number(value || 0).toFixed(2)}`;
const kwh = (value) => `${Number(value || 0).toFixed(2)} kWh`;

const RangeUsageCard = ({ range, setRange, summary, status, message, onRetry, monthlyBudget }) => {
  // iOS has no imperative dialog; it shows the picker inline for the field
  // being edited. Android uses the system calendar dialog.
  const [iosField, setIosField] = useState(null);
  const today = getManilaDateKey();

  const choose = (field, key) => {
    setRange((current) => ({ ...current, [field]: key }));
  };

  const openPicker = (field) => {
    const value = keyToLocalDate(range[field]);
    const maximumDate = keyToLocalDate(today);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        maximumDate,
        onChange: (event, date) => {
          if (event.type === 'set' && date) choose(field, localDateToKey(date));
        },
      });
    } else {
      setIosField(field);
    }
  };

  const activePreset = RANGE_PRESETS.find((preset) => {
    const resolved = preset.resolve(today);
    return resolved.startDate === range.startDate && resolved.endDate === range.endDate;
  });

  const hasBudget = monthlyBudget > 0;
  const paceOver = hasBudget && summary.monthPaceCost > monthlyBudget;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="calendar" size={22} color={COLORS.primary} />
        <Text style={styles.title}>Check your usage</Text>
      </View>
      <Text style={styles.lead}>Pick any dates to see how much you used and what it cost.</Text>

      <View style={styles.presets}>
        {RANGE_PRESETS.map((preset) => {
          const active = activePreset?.id === preset.id;
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

      {Platform.OS !== 'android' && iosField ? (
        <DateTimePicker
          value={keyToLocalDate(range[iosField])}
          mode="date"
          display="inline"
          maximumDate={keyToLocalDate(today)}
          onChange={(event, date) => {
            if (date) choose(iosField, localDateToKey(date));
            setIosField(null);
          }}
        />
      ) : null}

      {status === 'invalid' ? (
        <Text style={styles.problem}>{message}</Text>
      ) : status === 'offline' ? (
        <View style={styles.offline}>
          <Text style={styles.problem}>
            These dates could not be loaded. Check your connection.
          </Text>
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

          <View style={styles.rows}>
            <Row label="Outlet 1" value={kwh(summary.outlet1Kwh)} />
            <Row label="Outlet 2" value={kwh(summary.outlet2Kwh)} />
            <Row
              label={`Per day (${summary.days} ${summary.days === 1 ? 'day' : 'days'})`}
              value={`${peso(summary.dailyCost)} a day`}
            />
          </View>

          {summary.days > 0 ? (
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

          <Text style={styles.footnote}>
            {summary.includesToday ? 'Today counts what you have used so far. ' : ''}
            This is the cost of the electricity at your rates. Your bill also adds a
            small monthly meter charge.
          </Text>
        </>
      )}
    </View>
  );
};

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
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
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
  rows: {
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLabel: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  pace: {
    marginTop: 4,
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
    marginTop: 12,
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
  },
});

export default RangeUsageCard;
