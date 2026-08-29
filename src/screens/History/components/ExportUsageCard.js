import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import AppDialog from '../../../components/common/AppDialog';
import { describeUsageRows } from '../utils/historyHelpers';

/**
 * Exports the loaded daily usage as an Excel workbook and hands it to the share
 * sheet.
 *
 * A workbook rather than CSV because CSV is plain text and cannot carry the
 * theme, the column widths, or a currency format - and the costs here need to
 * *look* like pesos while staying numeric enough to add up, which is the one
 * thing CSV could not do.
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
  const [dialog, setDialog] = useState(null);

  const rowCount = usage.filter((row) => row?.date).length;
  const hasRows = rowCount > 0;

  const handleExport = useCallback(async () => {
    if (!hasRows || busy) return;

    setBusy(true);

    try {
      // Required lazily so the screen still renders on a build where the native
      // module is missing - the same pattern the QR scanner uses. The workbook
      // builder is deferred for a different reason: it carries a ~400 kB
      // spreadsheet writer that most sessions never touch.
      const FileSystem = require('expo-file-system/legacy');
      const Sharing = require('expo-sharing');
      const { writeUsageXlsx, buildUsageFilename, XLSX_MIME } =
        require('../../../utils/usageExport');

      // xlsx is a zip container, so it has to travel as base64 - writing it as
      // UTF8 text would corrupt the archive and Excel would refuse the file.
      const workbook = writeUsageXlsx(usage, 'base64');
      const filename = buildUsageFilename(usage);
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, workbook, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!(await Sharing.isAvailableAsync())) {
        setDialog({
          icon: '📤',
          tone: 'warning',
          title: 'This device cannot share files',
          message: 'The workbook was created, but there is no share sheet to hand it to, so it cannot leave the app.',
        });
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: XLSX_MIME,
        dialogTitle: 'Export daily usage',
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
    } catch (error) {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'The export did not finish',
        message: error?.message || 'The workbook could not be created. Please try again.',
      });
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
              ? `${describeUsageRows(usage)} as an Excel workbook`
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
          <Text style={styles.buttonText}>Export Excel</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.note}>
        Energy and cost per outlet, one row per day. Opens in Excel or Sheets,
        already formatted.
      </Text>

      {dialog ? (
        <AppDialog {...dialog} confirmLabel="Got it" onConfirm={() => setDialog(null)} />
      ) : null}
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
