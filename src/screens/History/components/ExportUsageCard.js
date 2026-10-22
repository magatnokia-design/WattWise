import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { COLORS } from '../../../constants/colors';
import { getManilaDateKey } from '../../../utils/liveUsage';
import { addDaysToKey, countDays, MAX_RANGE_DAYS, validateRange } from '../../../utils/rangeUsage';
import { formatDayKey } from '../utils/historyHelpers';

// The picker works in phone-local time; a date key is a calendar day.
const keyToLocalDate = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const localDateToKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const thisMonth = (today) => ({ startDate: `${today.slice(0, 7)}-01`, endDate: today });
const lastMonth = (today) => {
  const end = addDaysToKey(`${today.slice(0, 7)}-01`, -1);
  return { startDate: `${end.slice(0, 7)}-01`, endDate: end };
};
// Everything recorded, back to the oldest day on the account - capped at the
// one-year limit every range read shares.
const everything = (today, firstDate) => {
  const earliest = addDaysToKey(today, -(MAX_RANGE_DAYS - 1));
  const start = firstDate && firstDate > earliest ? firstDate : earliest;
  return { startDate: start, endDate: today };
};

/**
 * Export to Excel (Oct 2026): the user picks the dates. The file stays
 * detailed - each outlet's appliance, energy and cost per day - even though
 * the list on screen now shows only the date, energy and cost.
 *
 * The range is read fresh for the export (fetchRows) rather than taken from the
 * list, so it does not matter which page or how many days are on screen.
 *
 * Written to the cache directory rather than Documents: the file's only job is
 * to reach whatever app the user picks from the share sheet.
 *
 * Problems are shown inside the sheet, not in a dialog over it - this app never
 * stacks one Modal on another (see CLAUDE.md on Alert.alert).
 *
 * @param {(start: string, end: string) => Promise<{success: boolean, rows?: Array, error?: string}>} fetchRows
 * @param {string|null} firstDate Oldest day on record, for "All".
 */
export const ExportUsageCard = ({ fetchRows, firstDate = null }) => {
  const today = getManilaDateKey();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(() => thisMonth(today));
  const [iosField, setIosField] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const presets = [
    { id: 'month', label: 'This month', value: thisMonth(today) },
    { id: 'last', label: 'Last month', value: lastMonth(today) },
    { id: 'all', label: 'All', value: everything(today, firstDate) },
  ];
  const activePreset = presets.find((preset) => (
    preset.value.startDate === range.startDate && preset.value.endDate === range.endDate
  ))?.id;

  const invalid = validateRange(range.startDate, range.endDate, today);
  const dayCount = invalid ? 0 : countDays(range.startDate, range.endDate > today ? today : range.endDate);

  const setField = (field, key) => {
    setProblem(null);
    setRange((current) => ({ ...current, [field]: key }));
  };

  const openPicker = (field) => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: keyToLocalDate(range[field]),
        mode: 'date',
        maximumDate: keyToLocalDate(today),
        onChange: (event, date) => {
          if (event.type === 'set' && date) setField(field, localDateToKey(date));
        },
      });
    } else {
      setIosField(field);
    }
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setIosField(null);
    setProblem(null);
  };

  const handleExport = useCallback(async () => {
    if (busy || invalid) return;
    setBusy(true);
    setProblem(null);

    try {
      const result = await fetchRows(range.startDate, range.endDate);
      if (!result?.success) {
        setProblem(result?.error || 'The usage could not be read. Check your connection and try again.');
        return;
      }
      const rows = (result.rows || []).filter((row) => row?.date);
      if (rows.length === 0) {
        setProblem('Nothing was recorded between these dates.');
        return;
      }

      // Required lazily so the screen still renders on a build where the native
      // module is missing. The workbook builder is deferred for a different
      // reason: it carries a ~400 kB spreadsheet writer most sessions never use.
      const FileSystem = require('expo-file-system/legacy');
      const Sharing = require('expo-sharing');
      const { writeUsageXlsx, buildUsageFilename, XLSX_MIME } =
        require('../../../utils/usageExport');

      if (!(await Sharing.isAvailableAsync())) {
        setProblem('This phone has no share sheet, so the file cannot leave the app.');
        return;
      }

      // xlsx is a zip container, so it has to travel as base64 - writing it as
      // UTF8 text would corrupt the archive and Excel would refuse the file.
      const workbook = writeUsageXlsx(rows, 'base64');
      const fileUri = `${FileSystem.cacheDirectory}${buildUsageFilename(rows)}`;
      await FileSystem.writeAsStringAsync(fileUri, workbook, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setOpen(false);
      await Sharing.shareAsync(fileUri, {
        mimeType: XLSX_MIME,
        dialogTitle: 'Export daily usage',
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
    } catch (error) {
      setProblem(error?.message || 'The file could not be created. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, fetchRows, invalid, range.endDate, range.startDate]);

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => { setProblem(null); setOpen(true); }}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="microsoft-excel" size={18} color={COLORS.primary} />
        <Text style={styles.triggerText}>Export to Excel</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} onPress={close} activeOpacity={1} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <View style={styles.sheetIcon}>
                <MaterialCommunityIcons name="microsoft-excel" size={22} color={COLORS.white} />
              </View>
              <View style={styles.sheetTitles}>
                <Text style={styles.sheetTitle}>Export to Excel</Text>
                <Text style={styles.sheetSub}>Each outlet&apos;s energy and cost, one row per day</Text>
              </View>
              <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>

            <View style={styles.chips}>
              {presets.map((preset) => (
                <TouchableOpacity
                  key={preset.id}
                  style={[styles.chip, activePreset === preset.id && styles.chipActive]}
                  onPress={() => { setProblem(null); setRange(preset.value); }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, activePreset === preset.id && styles.chipTextActive]}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.dates}>
              {[['startDate', 'From'], ['endDate', 'To']].map(([field, label]) => (
                <TouchableOpacity
                  key={field}
                  style={[styles.dateField, iosField === field && styles.dateFieldActive]}
                  onPress={() => openPicker(field)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} date`}
                >
                  <Text style={styles.dateLabel}>{label}</Text>
                  <View style={styles.dateValueRow}>
                    <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
                    <Text style={styles.dateValue}>{formatDayKey(range[field])}, {range[field].slice(0, 4)}</Text>
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
                  if (date) setField(iosField, localDateToKey(date));
                  setIosField(null);
                }}
              />
            ) : null}

            {invalid || problem ? (
              <View style={styles.problem}>
                <Ionicons name="alert-circle" size={15} color="#B91C1C" />
                <Text style={styles.problemText}>{invalid || problem}</Text>
              </View>
            ) : (
              <Text style={styles.summary}>
                {dayCount === 1 ? '1 day' : `${dayCount} days`} · opens in Excel or Google Sheets
              </Text>
            )}

            <TouchableOpacity
              style={[styles.exportButton, (busy || invalid) && styles.exportButtonDisabled]}
              onPress={handleExport}
              disabled={busy || Boolean(invalid)}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="share-outline" size={18} color={COLORS.white} />
                  <Text style={styles.exportText}>Export</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#ECF8EF',
  },
  triggerText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 27, 44, 0.5)',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitles: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  sheetSub: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 1,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  chipTextActive: {
    color: COLORS.white,
  },
  dates: {
    flexDirection: 'row',
    gap: 10,
  },
  dateField: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: COLORS.background,
  },
  dateFieldActive: {
    borderColor: COLORS.primary,
  },
  dateLabel: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  dateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  summary: {
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  problem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 10,
  },
  problemText: {
    flex: 1,
    fontSize: 12.5,
    color: '#B91C1C',
  },
  exportButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportButtonDisabled: {
    opacity: 0.45,
  },
  exportText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});

export default ExportUsageCard;
