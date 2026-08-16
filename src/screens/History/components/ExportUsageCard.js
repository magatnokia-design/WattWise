import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import {
  buildUsageCsv,
  buildUsageCsvFilename,
  describeUsageCsv,
} from '../../../utils/usageCsv';

/**
 * Exports the loaded daily usage as a CSV file and hands it to the share sheet.
 *
 * Written to a cache directory rather than Documents on purpose: the file's
 * only job is to reach whatever app the user picks from the share sheet, and
 * once it is in Drive or Gmail a second copy sitting in WattWise's storage is
 * just a stale duplicate the system can never clear.
 *
 * Exports exactly what the screen has loaded, which is why the button says how
 * many days that is. A button that silently exported a different range than the
 * list above it would be worse than no button.
 */
export const ExportUsageCard = ({ usage = [] }) => {
  const [busy, setBusy] = useState(false);

  const rowCount = usage.filter((row) => row?.date).length;
  const hasRows = rowCount > 0;

  const handleExport = useCallback(async () => {
    if (!hasRows || busy) return;

    setBusy(true);

    try {
      // Required lazily so the screen still renders on a build where the native
      // module is missing - the same pattern the QR scanner uses.
      const FileSystem = require('expo-file-system/legacy');
      const Sharing = require('expo-sharing');

      const csv = buildUsageCsv(usage);
      const filename = buildUsageCsvFilename(usage);
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          'Sharing unavailable',
          'This device cannot open a share sheet, so the file cannot be handed anywhere.'
        );
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export daily usage',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      Alert.alert(
        'Export failed',
        error?.message || 'The file could not be created. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }, [busy, hasRows, usage]);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconBadge}>
          <Text style={styles.icon}>📄</Text>
        </View>

        <View style={styles.text}>
          <Text style={styles.title}>Export daily usage</Text>
          <Text style={styles.subtitle}>
            {hasRows
              ? `${describeUsageCsv(usage)} as a spreadsheet file`
              : 'Nothing to export yet'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, !hasRows || busy ? styles.buttonDisabled : null]}
        onPress={handleExport}
        disabled={!hasRows || busy}
        activeOpacity={0.85}
      >
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Text style={styles.buttonText}>Export CSV</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.note}>
        Energy and cost per outlet, one row per day. Opens in Excel or Sheets.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  // Yellow: this is the one action on the screen that takes data out of
  // WattWise, and it should not read as just another green control.
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 18,
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  note: {
    fontSize: 11,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
  },
});

export default ExportUsageCard;
