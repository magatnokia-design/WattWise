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
  formatDayKwh,
  laterKey,
  CALENDAR_FIRST_DAY,
} from '../../utils/calendarGrid';

/**
 * The Dagitab calendar (Oct 2026), in place of the phone's own date dialog:
 * a month grid in the app's greens, Monday first. `mode="range"` takes two
 * taps (start, then end) and shades the days between; `mode="single"` takes
 * one. Days after `maxDate` (today, for usage) cannot be picked, and nothing
 * before CALENDAR_FIRST_DAY (April 2026) is offered whatever `minDate` says.
 *
 * `dayValues` puts each day's kWh under its number, so the month reads as a
 * usage map before anything is tapped. `onMonthChange` fires with the month on
 * screen, so the caller can load that month's figures.
 *
 * Two forms. The default export is a Modal of its own - never open it from
 * inside another Modal, this app does not stack them (see CLAUDE.md on
 * Alert.alert). `CalendarPanel` is the same calendar without the Modal, for a
 * sheet that already is one (Export to Excel swaps its body for it).
 *
 * @param {'single'|'range'} mode
 * @param {string} startDate Initial selection (YYYY-MM-DD).
 * @param {string} [endDate] Initial end, range mode.
 * @param {string} [minDate]
 * @param {string} [maxDate]
 * @param {Object<string, number>} [dayValues] kWh by date key.
 * @param {({year, monthIndex}) => void} [onMonthChange]
 * @param {({startDate, endDate}) => void} onConfirm
 */
export const CalendarPanel = ({
  active = true,
  mode = 'range',
  title,
  startDate,
  endDate,
  minDate,
  maxDate,
  dayValues = null,
  onMonthChange,
  onConfirm,
  onClose,
}) => {
  const floor = laterKey(minDate, CALENDAR_FIRST_DAY);
  const [selection, setSelection] = useState({ startDate, endDate: mode === 'range' ? endDate : startDate });
  const [view, setView] = useState(() => {
    const key = endDate || startDate;
    return parseKey(key && key < floor ? floor : key) || parseKey(maxDate);
  });

  useEffect(() => {
    if (!active) return;
    setSelection({ startDate, endDate: mode === 'range' ? endDate : startDate });
    const key = mode === 'range' ? endDate || startDate : startDate;
    const anchor = parseKey(key && key < floor ? floor : key) || parseKey(maxDate);
    if (anchor) setView({ year: anchor.year, monthIndex: anchor.monthIndex });
  }, [active, startDate, endDate, mode, maxDate, floor]);

  useEffect(() => {
    if (active && view && onMonthChange) onMonthChange({ year: view.year, monthIndex: view.monthIndex });
  }, [active, view, onMonthChange]);

  if (!view) return null;
  const showValues = Boolean(dayValues);

  const grid = buildMonthGrid(view.year, view.monthIndex);
  const monthStart = `${view.year}-${String(view.monthIndex + 1).padStart(2, '0')}-01`;
  const nextMonth = shiftMonth(view, 1);
  const nextStart = `${nextMonth.year}-${String(nextMonth.monthIndex + 1).padStart(2, '0')}-01`;
  const canGoBack = monthStart > floor;
  const canGoForward = !maxDate || nextStart <= maxDate;

  const disabled = (key) => key < floor || (maxDate && key > maxDate);

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
    <>
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
          if (!key) return <View key={`blank-${index}`} style={[styles.cell, showValues && styles.cellTall]} />;
          const isStart = key === selection.startDate;
          const isEnd = key === selection.endDate;
          const isEdge = isStart || isEnd;
          const inside = isBetween(key, selection.startDate, selection.endDate);
          const isToday = key === maxDate;
          const off = disabled(key);
          const kwhText = showValues && !off ? formatDayKwh(dayValues[key]) : null;
          // The band behind a range: from the start's middle to the end's.
          const bandLeft = (inside || (isEnd && selection.startDate && !isStart));
          const bandRight = (inside || (isStart && selection.endDate && !isEnd));
          return (
            <Pressable
              key={key}
              style={[styles.cell, showValues && styles.cellTall]}
              onPress={() => !off && handleTap(key)}
              disabled={off}
              accessibilityRole="button"
              accessibilityState={{ selected: isEdge, disabled: off }}
              accessibilityLabel={kwhText ? `${formatKeyShort(key)}, ${kwhText} kWh` : formatKeyShort(key)}
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
              <View
                style={[
                  styles.day,
                  showValues && styles.dayTall,
                  isEdge && styles.dayEdge,
                  isToday && !isEdge && styles.dayToday,
                ]}
              >
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
                {showValues ? (
                  <Text style={[styles.kwhText, isEdge && styles.kwhTextEdge]} numberOfLines={1}>
                    {kwhText || ' '}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {showValues ? <Text style={styles.legend}>kWh used each day</Text> : null}

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
    </>
  );
};

// The calendar in a Modal of its own (see CalendarPanel for the inline form).
const DagitabCalendar = ({ visible, onClose, ...props }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <CalendarPanel {...props} active={visible} onClose={onClose} />
      </View>
    </View>
  </Modal>
);

const CELL = 40;
// Taller with a kWh figure under the number.
const CELL_TALL = 46;

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
  cellTall: {
    height: CELL_TALL,
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
  dayTall: {
    width: '88%',
    height: CELL_TALL - 4,
    borderRadius: 12,
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
  kwhText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: -1,
  },
  kwhTextEdge: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  legend: {
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 6,
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
