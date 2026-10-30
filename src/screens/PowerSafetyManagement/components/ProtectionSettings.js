import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import AppDialog from '../../../components/common/AppDialog';
import { SAFETY_LIMITS, findLimitOutOfRange } from '../utils/safetyHelpers';

const MAX_POWER_W = SAFETY_LIMITS.powerMax.max;

const toFields = (thresholds) => ({
  voltageMin: String(thresholds?.voltage?.min ?? 190),
  voltageMax: String(thresholds?.voltage?.max ?? 260),
  currentMax: String(thresholds?.current?.max ?? 10),
  powerMax: String(thresholds?.power?.max ?? MAX_POWER_W),
});

// The allowed range sits under the label, so a limit outside it is never a
// surprise at Save.
const Field = ({ limitKey, value, onChangeText }) => {
  const bound = SAFETY_LIMITS[limitKey];
  return (
  <View style={styles.inputGroup}>
    <Text style={styles.inputLabel}>
      {bound.label} <Text style={styles.inputRange}>{bound.min}–{bound.max} {bound.unit}</Text>
    </Text>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      keyboardType="decimal-pad"
      maxLength={6}
    />
  </View>
  );
};

/**
 * Auto cut-off and the limits, in one compact card (Oct 2026).
 */
const ProtectionSettings = ({ enabled, onToggle, thresholds, onSaveThresholds }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [fields, setFields] = useState(() => toFields(thresholds));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [dialog, setDialog] = useState(null);

  // Only while not editing. The Hub rewrites the safety document every 15 s,
  // and each snapshot hands down a new thresholds object - so syncing
  // unconditionally wiped whatever the user was typing, mid-edit.
  useEffect(() => {
    if (!isEditing) setFields(toFields(thresholds));
  }, [thresholds, isEditing]);

  const setField = (key) => (value) => setFields((prev) => ({ ...prev, [key]: value }));

  // The switch reported nothing before: a failed write left it snapped back
  // with no word as to why, and a queued one looked identical to a sent one.
  const handleToggle = async (value) => {
    if (!onToggle || toggling) return;
    setToggling(true);
    const result = await onToggle(value);
    setToggling(false);

    if (result?.pending) {
      setDialog({
        icon: '📡',
        tone: 'warning',
        title: 'Saved here, not sent yet',
        message: `Auto shut-off will be ${value ? 'on' : 'off'} once you are back online. Keep Dagitab open until then.`,
      });
    } else if (result && !result.success) {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'Auto shut-off did not change',
        message: result.error || 'It kept its previous setting. Please try again.',
      });
    }
  };

  const handleSaveThresholds = async () => {
    if (saving) return;
    const voltageMin = Number(fields.voltageMin);
    const voltageMax = Number(fields.voltageMax);
    const currentMax = Number(fields.currentMax);
    const rawPowerMax = Number(fields.powerMax);
    const values = [voltageMin, voltageMax, currentMax, rawPowerMax];

    if (values.some((value) => !Number.isFinite(value))) {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'Those are not numbers',
        message: 'Every limit has to be a number. Check the fields and try again.',
      });
      return;
    }

    // Number('') is 0, and a 0 A or 0 W ceiling would cut power the moment
    // anything was plugged in. These used to be accepted.
    if (values.some((value) => value <= 0)) {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'Limits must be above zero',
        message: 'A limit of zero would switch an outlet off as soon as anything is plugged in.',
      });
      return;
    }

    if (voltageMin >= voltageMax) {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'That voltage range is inverted',
        message: 'The minimum has to be lower than the maximum. Swap the two values and try again.',
      });
      return;
    }

    const outOfRange = findLimitOutOfRange({ voltageMin, voltageMax, currentMax, powerMax: rawPowerMax });
    if (outOfRange) {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'That limit is out of range',
        message: outOfRange,
      });
      return;
    }

    const nextThresholds = {
      voltage: { min: voltageMin, max: voltageMax },
      current: { max: currentMax },
      power: { max: rawPowerMax },
    };

    if (!onSaveThresholds) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    const result = await onSaveThresholds(nextThresholds);
    setSaving(false);

    // The Hub enforces its own 500 W ceiling in firmware, with no cloud call in
    // the path, so an unsent change never leaves the outlets unprotected - it
    // only leaves them on the *previous* limits.
    if (result?.pending) {
      setDialog({
        icon: '📡',
        tone: 'warning',
        title: 'Saved here, not sent yet',
        message: "The Hub keeps your old limits until you're online. Keep Dagitab open.",
      });
      setIsEditing(false);
      return;
    }

    if (!result?.success) {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'The limits were not saved',
        message: result?.error || 'The previous limits are still in force. Please try again.',
      });
      return;
    }

    setIsEditing(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="shield-checkmark" size={18} color={COLORS.primary} />
        <Text style={styles.rowTitle}>Auto shut-off</Text>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          disabled={toggling}
          trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
          thumbColor={enabled ? COLORS.primary : COLORS.textLight}
        />
      </View>

      <View style={styles.separator} />

      <View style={styles.row}>
        <Ionicons name="speedometer-outline" size={18} color={COLORS.primary} />
        <Text style={styles.rowTitle}>Limits</Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => setIsEditing((value) => !value)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
        >
          <Ionicons name={isEditing ? 'close' : 'create-outline'} size={16} color={COLORS.primary} />
          <Text style={styles.editText}>{isEditing ? 'Cancel' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      {isEditing ? (
        <View style={styles.form}>
          <View style={styles.inputRow}>
            <Field limitKey="voltageMin" value={fields.voltageMin} onChangeText={setField('voltageMin')} />
            <Field limitKey="voltageMax" value={fields.voltageMax} onChangeText={setField('voltageMax')} />
          </View>
          <View style={styles.inputRow}>
            <Field limitKey="currentMax" value={fields.currentMax} onChangeText={setField('currentMax')} />
            <Field limitKey="powerMax" value={fields.powerMax} onChangeText={setField('powerMax')} />
          </View>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonBusy]}
            onPress={handleSaveThresholds}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save limits'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>Voltage</Text>
            <Text style={styles.chipValue}>{thresholds.voltage.min}–{thresholds.voltage.max} V</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>Current</Text>
            <Text style={styles.chipValue}>{thresholds.current.max} A</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>Power</Text>
            <Text style={styles.chipValue}>{thresholds.power.max} W</Text>
          </View>
        </View>
      )}

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
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: COLORS.background,
  },
  chipLabel: {
    fontSize: 10.5,
    color: COLORS.textLight,
  },
  chipValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 1,
  },
  form: {
    gap: 10,
    marginTop: 6,
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  inputRange: {
    color: COLORS.textLight,
    opacity: 0.75,
    fontWeight: '400',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  saveButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonBusy: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
  },
});

export default ProtectionSettings;
