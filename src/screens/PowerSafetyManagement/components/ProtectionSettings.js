import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import AppDialog from '../../../components/common/AppDialog';

const MAX_POWER_W = 500;

const ProtectionSettings = ({ enabled, onToggle, thresholds, onSaveThresholds }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [voltageMin, setVoltageMin] = useState(String(thresholds?.voltage?.min ?? 190));
  const [voltageMax, setVoltageMax] = useState(String(thresholds?.voltage?.max ?? 260));
  const [currentMax, setCurrentMax] = useState(String(thresholds?.current?.max ?? 10));
  const [powerMax, setPowerMax] = useState(String(thresholds?.power?.max ?? 500));
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    setVoltageMin(String(thresholds?.voltage?.min ?? 190));
    setVoltageMax(String(thresholds?.voltage?.max ?? 260));
    setCurrentMax(String(thresholds?.current?.max ?? 10));
    setPowerMax(String(thresholds?.power?.max ?? 500));
  }, [thresholds]);

  const handleSaveThresholds = async () => {
    const rawPowerMax = Number(powerMax);
    const cappedPowerMax = Number.isFinite(rawPowerMax)
      ? Math.min(rawPowerMax, MAX_POWER_W)
      : NaN;

    const nextThresholds = {
      voltage: {
        min: Number(voltageMin),
        max: Number(voltageMax),
      },
      current: {
        max: Number(currentMax),
      },
      power: {
        max: cappedPowerMax,
      },
    };

    if (
      Number.isNaN(nextThresholds.voltage.min)
      || Number.isNaN(nextThresholds.voltage.max)
      || Number.isNaN(nextThresholds.current.max)
      || Number.isNaN(nextThresholds.power.max)
    ) {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'Those are not numbers',
        message: 'Every threshold has to be a number. Check the fields and try again.',
      });
      return;
    }

    if (rawPowerMax > MAX_POWER_W) {
      setDialog({
        icon: '🛡️',
        tone: 'warning',
        title: 'Power limit capped',
        message: `The maximum this hardware will enforce is ${MAX_POWER_W} W per outlet, so that is what was saved.`,
      });
      setPowerMax(String(MAX_POWER_W));
    }

    if (nextThresholds.voltage.min >= nextThresholds.voltage.max) {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'That voltage range is inverted',
        message: 'The minimum has to be lower than the maximum. Swap the two values and try again.',
      });
      return;
    }

    if (!onSaveThresholds) {
      setIsEditing(false);
      return;
    }

    const result = await onSaveThresholds(nextThresholds);

    // The Hub enforces its own 500 W ceiling in firmware, with no cloud call in
    // the path, so an unsent change never leaves the outlets unprotected - it
    // only leaves them on the *previous* limits. Worth saying, because "not
    // saved" on a safety screen reads as "not protected".
    if (result?.pending) {
      setDialog({
        icon: '📡',
        tone: 'warning',
        title: 'Saved here, not sent yet',
        message: 'Your new limits have not reached the server, so the Hub is still enforcing the previous ones. They will sync when you are back online — keep WattWise open, because closing it drops the change.',
      });
      setIsEditing(false);
      return;
    }

    if (!result?.success) {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'The thresholds were not saved',
        message: result?.error || 'The previous limits are still in force. Please try again.',
      });
      return;
    }

    setIsEditing(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Protection Settings</Text>

      {/* Auto Cut-off Toggle */}
      <View style={styles.settingCard}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <View style={styles.iconLabel}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
              <Text style={styles.settingTitle}>Auto Cut-off</Text>
            </View>
            <Text style={styles.settingDescription}>
              Automatically cut power when limits are exceeded
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={onToggle}
            trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
            thumbColor={enabled ? COLORS.primary : COLORS.textLight}
          />
        </View>
      </View>

      {/* Threshold Summary */}
      <View style={styles.settingCard}>
        <View style={styles.thresholdHeader}>
          <Text style={styles.settingTitle}>Safety Thresholds</Text>
          <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing((value) => !value)}>
            <Ionicons name="create-outline" size={18} color={COLORS.primary} />
            <Text style={styles.editText}>{isEditing ? 'Close' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        {isEditing ? (
          <View style={styles.thresholdList}>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Voltage Min (V)</Text>
                <TextInput
                  style={styles.input}
                  value={voltageMin}
                  onChangeText={setVoltageMin}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Voltage Max (V)</Text>
                <TextInput
                  style={styles.input}
                  value={voltageMax}
                  onChangeText={setVoltageMax}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Current Max (A)</Text>
                <TextInput
                  style={styles.input}
                  value={currentMax}
                  onChangeText={setCurrentMax}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Power Max (W, cap 500)</Text>
                <TextInput
                  style={styles.input}
                  value={powerMax}
                  onChangeText={setPowerMax}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSaveThresholds}>
              <Text style={styles.saveButtonText}>Save Thresholds</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.thresholdList}>
            <View style={styles.thresholdItem}>
              <Text style={styles.thresholdName}>Voltage Range</Text>
              <Text style={styles.thresholdRange}>
                {thresholds.voltage.min}V - {thresholds.voltage.max}V
              </Text>
            </View>

            <View style={styles.thresholdItem}>
              <Text style={styles.thresholdName}>Max Current</Text>
              <Text style={styles.thresholdRange}>
                {thresholds.current.max}A
              </Text>
            </View>

            <View style={styles.thresholdItem}>
              <Text style={styles.thresholdName}>Max Power</Text>
              <Text style={styles.thresholdRange}>
                {thresholds.power.max}W
              </Text>
            </View>

            {/* The threshold that binds while both outlets are individually
                legal, and the only one the screen never mentioned. 400 W + 400 W
                trips it with neither outlet anywhere near its own limit, so a
                user reading 500 and 1000 has no way to predict the warning they
                will get. It warns; it does not cut. */}
            <Text style={styles.limitsNote}>
              The firmware enforces 500 W per outlet and 1000 W combined whatever
              is set here. Between those, a combined draw over{' '}
              <Text style={styles.limitsNoteStrong}>800 W</Text> raises a warning
              without cutting power — 400 W on each outlet is enough to reach it,
              with neither one over its own limit.
            </Text>
          </View>
        )}
      </View>

      {dialog ? (
        <AppDialog
          {...dialog}
          confirmLabel={dialog.confirmLabel || 'Got it'}
          onConfirm={() => setDialog(null)}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  settingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  iconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  settingDescription: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 18,
  },
  thresholdHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  thresholdList: {
    gap: 12,
  },
  thresholdItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  thresholdName: {
    fontSize: 14,
    color: COLORS.text,
  },
  thresholdRange: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  limitsNote: {
    marginTop: 12,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.textLight,
  },
  limitsNoteStrong: {
    fontWeight: '700',
    color: COLORS.textDark,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  saveButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '600',
  },
});

export default ProtectionSettings;