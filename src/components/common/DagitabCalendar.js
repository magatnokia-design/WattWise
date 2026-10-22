import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import {
  MONTH_NAMES,
  WEEKDAY_INITIALS,
  buildMonthGrid,
  shiftMonth,
  parseKey,
  applyRangeTap,
  isBetween,
  formatKeyShort,
} from '../../utils/calendarGrid';

/**
 * The Dagitab calendar (Oct 2026), in place of the phone's own date dialog:
 * a month grid in the app's greens, Monday first. `mode="range"` takes two
 * taps (start, then end) and shades the days between; `mode="single"` takes
 * one. Days after `maxDate` (today, for usage) cannot be picked.
 *
 * A Modal of its own. Never open it from inside another Modal - this app does
 * not stack them (see CLAUDE.md on Alert.alert).
 *
 * @param {'single'|'range'} mode
 * @param {string} startDate Initial selection (YYYY-MM-DD).
 * @param {string} [endDate] Initial end, range mode.
 * @param {string} [minDate]
 * @param {string} [maxDate]
 * @param {({startDate, endDate}) => void} onConfirm
 */
const DagitabCalendar = ({
  visible,
  mode = 'range',
  title,
  startDate,
  endDate,
  minDate,
  maxDate,
  onConfirm,
  onClose,
}) => {
  const [selection, setSelection] = useState({ startDate, endDate: mode === 'range' ? endDate : startDate });
  const [view, setView] = useState(() => parseKey(endDate || startDate) || parseKey(maxDate));

  useEffect(() => {
    if (!visible) return;
    setSelection({ startDate, endDate: mode === 'range' ? endDate : startDate });
    const anchor = parseKey(mode === 'range' ? endDate || startDate : startDate) || parseKey(maxDate);
    if (anchor) setView({ year: anchor.year, monthIndex: anchor.monthIndex });
  }, [visible, startDate, endDate, mode, maxDate]);

  if (!view) return null;

  const grid = buildMonthGrid(view.year, view.monthIndex);
  const monthStart = `${view.year}-${String(view.monthIndex + 1).padStart(2, '0')}-01`;
  const nextMonth = shiftMonth(view, 1);
  const nextStart = `${nextMonth.year}-${String(nextMonth.monthIndex + 1).padStart(2, '0')}-01`;
  const canGoBack = !minDate || monthStart > minDate;
  const canGoForward = !maxDate || nextStart <= maxDate;

  const disabled = (key) => (minDate && key < minDate) || (maxDate && key > maxDate);

  const handleTap = (key) => {
    if (mode === 'single') setSelection({ startDate: key, endDate: key });
    else setSelection((current) => applyRangeTap(current, key));
  };

  const complete = Boolean(selection.startDate && selection.endDate);
  const summary = !selection.startDate
    ? 'Pick a date'
    : mode === 'single' || selection.startDate === selection.endDate
      ? formatKeyShort(selection.startDate)
      : selection.endDate
        ? `${formatKeyShort(selection.startDate, false)} – ${formatKeyShort(selection.endDate)}`
        : `${formatKeyShort(selection.startDate, false)} – pick the end`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.top}>
            <Text style={styles.title}>{title || (mode === 'range' ? 'Choose dates' : 'Choose a day')}</Text>
            <Text style={styles.summary}>{summary}</Text>
          </View>

          <View style={styles.monthRow}>
            <TouchableOpacity
              style={[styles.navButton, !canGoBack && styles.navDisabled]}
              onPress={() => canGoBack && setView(shiftMonth(view, -1))}
              disabled={!canGoBack}
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={18} color={canGoBack ? COLORS.primary : COLORS.border} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{MONTH_NAMES[view.monthIndex]} {view.year}</Text>
            <TouchableOpacity
              style={[styles.navButton, !canGoForward && styles.navDisabled]}
              onPress={() => canGoForward && setView(nextMonth)}
              disabled={!canGoForward}
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={18} color={canGoForward ? COLORS.primary : COLORS.border} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_INITIALS.map((day) => (
              <Text key={day} style={styles.weekday}>{day}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((key, index) => {
              if (!key) return <View key={`blank-${index}`} style={styles.cell} />;
              const isStart = key === selection.startDate;
              const isEnd = key === selection.endDate;
              const isEdge = isStart || isEnd;
              const inside = isBetween(key, selection.startDate, selection.endDate);
              const isToday = key === maxDate;
              const off = disabled(key);
              // The band behind a range: from the start's middle to the end's.
              const bandLeft = (inside || (isEnd && selection.startDate && !isStart));
              const bandRight = (inside || (isStart && selection.endDate && !isEnd));
              return (
                <Pressable
                  key={key}
                  style={styles.cell}
                  onPress={() => !off && handleTap(key)}
                  disabled={off}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isEdge, disabled: off }}
                  accessibilityLabel={formatKeyShort(key)}
                >
                  {mode === 'range' && (bandLeft || bandRight) ? (
                    <View
                      style={[
                        styles.band,
                        bandLeft && styles.bandLeft,
                        bandRight && styles.bandRight,
                      ]}
                    />
                  ) : null}
                  <View style={[styles.day, isEdge && styles.dayEdge, isToday && !isEdge && styles.dayToday]}>
                    <Text
                      style={[
                        styles.dayText,
                        inside && styles.dayTextInside,
                        isEdge && styles.dayTextEdge,
                        off && styles.dayTextOff,
                      ]}
                    >
                      {Number(key.slice(8))}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.done, !complete && styles.doneDisabled]}
              onPress={() => complete && onConfirm(selection)}
              disabled={!complete}
              accessibilityRole="button"
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const CELL = 40;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 27, 44, 0.5)',
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    overflow: 'hidden',
  },
  top: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  summary: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.white,
    marginTop: 2,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECF8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: {
    backgroundColor: COLORS.background,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textLight,
    paddingVertical: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
  },
  cell: {
    width: `${100 / 7}%`,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  band: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: '50%',
    right: '50%',
    backgroundColor: '#E1F5E6',
  },
  bandLeft: {
    left: 0,
  },
  bandRight: {
    right: 0,
  },
  day: {
    width: CELL - 6,
    height: CELL - 6,
    borderRadius: (CELL - 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayEdge: {
    backgroundColor: COLORS.primary,
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  dayText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  dayTextInside: {
    color: COLORS.primaryDark,
    fontWeight: '600',
  },
  dayTextEdge: {
    color: COLORS.white,
    fontWeight: '800',
  },
  dayTextOff: {
    color: COLORS.border,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  cancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  done: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  doneDisabled: {
    opacity: 0.45,
  },
  doneText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
});

export default DagitabCalendar;
