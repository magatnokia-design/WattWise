import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { formatMonthLabel } from '../utils/comparisonHelpers';

// Dagitab's first recorded month. Nothing before it can hold readings, so the
// picker does not offer it (Oct 2026).
export const FIRST_MONTH = '2026-04';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The "which month" control: one month, stepped with ‹ › or picked from a
 * month grid (Oct 2026, replacing a plain list). The baseline is always the
 * month before, named in the sentence that reports the change.
 *
 * `monthOptions` comes from the shared hook (newest first); only April 2026
 * onwards is offered here.
 */
const MonthComparePicker = ({ monthOptions, month, onSelect }) => {
  const [open, setOpen] = useState(false);

  // Oldest first, from FIRST_MONTH to the current month.
  const available = useMemo(
    () => monthOptions.map((option) => option.value).filter((value) => value >= FIRST_MONTH).sort(),
    [monthOptions]
  );
  const index = available.indexOf(month);
  const older = index > 0 ? available[index - 1] : null;
  const newer = index >= 0 && index < available.length - 1 ? available[index + 1] : null;

  const years = useMemo(
    () => [...new Set(available.map((value) => Number(value.slice(0, 4))))],
    [available]
  );
  const [year, setYear] = useState(() => Number(String(month).slice(0, 4)));
  useEffect(() => {
    if (open) setYear(Number(String(month).slice(0, 4)));
  }, [open, month]);

  const pick = (value) => {
    onSelect(value);
    setOpen(false);
  };

  const yearIndex = years.indexOf(year);

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <TouchableOpacity
          style={[styles.step, !older && styles.stepDisabled]}
          onPress={() => older && onSelect(older)}
          disabled={!older}
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={20} color={older ? COLORS.primary : COLORS.border} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.current}
          onPress={() => setOpen(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Month: ${formatMonthLabel(month)}. Change`}
        >
          <Ionicons name="calendar" size={18} color={COLORS.primary} />
          <Text style={styles.currentText}>{formatMonthLabel(month)}</Text>
          <Ionicons name="chevron-down" size={16} color={COLORS.textLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.step, !newer && styles.stepDisabled]}
          onPress={() => newer && onSelect(newer)}
          disabled={!newer}
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={20} color={newer ? COLORS.primary : COLORS.border} />
        </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetTop}>
              <Text style={styles.sheetCaption}>Select month</Text>
              <Text style={styles.sheetTitle}>{formatMonthLabel(month)}</Text>
            </View>

            <View style={styles.yearRow}>
              <TouchableOpacity
                style={[styles.yearStep, yearIndex <= 0 && styles.stepDisabled]}
                onPress={() => yearIndex > 0 && setYear(years[yearIndex - 1])}
                disabled={yearIndex <= 0}
                accessibilityLabel="Previous year"
              >
                <Ionicons name="chevron-back" size={18} color={yearIndex > 0 ? COLORS.primary : COLORS.border} />
              </TouchableOpacity>
              <Text style={styles.year}>{year}</Text>
              <TouchableOpacity
                style={[styles.yearStep, yearIndex >= years.length - 1 && styles.stepDisabled]}
                onPress={() => yearIndex < years.length - 1 && setYear(years[yearIndex + 1])}
                disabled={yearIndex >= years.length - 1}
                accessibilityLabel="Next year"
              >
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={yearIndex < years.length - 1 ? COLORS.primary : COLORS.border}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.grid}>
              {SHORT_MONTHS.map((name, monthIndex) => {
                const value = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                const enabled = available.includes(value);
                const selected = value === month;
                const isLatest = value === available[available.length - 1];
                return (
                  <View key={value} style={styles.cellWrap}>
                    <TouchableOpacity
                      style={[styles.cell, selected && styles.cellSelected, !enabled && styles.cellDisabled]}
                      onPress={() => enabled && pick(value)}
                      disabled={!enabled}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: !enabled }}
                    >
                      <Text
                        style={[
                          styles.cellText,
                          selected && styles.cellTextSelected,
                          !enabled && styles.cellTextDisabled,
                        ]}
                      >
                        {name}
                      </Text>
                      {isLatest && !selected ? <View style={styles.nowDot} /> : null}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity style={styles.close} onPress={() => setOpen(false)} accessibilityRole="button">
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  step: {
    width: 44,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDisabled: {
    backgroundColor: COLORS.background,
  },
  current: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currentText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 27, 44, 0.5)',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    overflow: 'hidden',
  },
  sheetTop: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  sheetCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.white,
    marginTop: 2,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  yearStep: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECF8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  year: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  cellWrap: {
    width: '33.333%',
    padding: 4,
  },
  cell: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  cellSelected: {
    backgroundColor: COLORS.primary,
  },
  cellDisabled: {
    backgroundColor: COLORS.white,
  },
  cellText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  cellTextSelected: {
    color: COLORS.white,
    fontWeight: '800',
  },
  cellTextDisabled: {
    color: COLORS.border,
  },
  nowDot: {
    position: 'absolute',
    bottom: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  close: {
    margin: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  closeText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
  },
});

export default MonthComparePicker;
