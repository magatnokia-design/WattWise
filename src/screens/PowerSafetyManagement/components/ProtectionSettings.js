import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const ProtectionSettings = ({ enabled, onToggle, thresholds, onSaveThresholds }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [voltageMin, setVoltageMin] = useState(String(thresholds?.voltage?.min ?? 200));
  const [voltageMax, setVoltageMax] = useState(String(thresholds?.voltage?.max ?? 250));
  const [currentMax, setCurrentMax] = useState(String(thresholds?.current?.max ?? 10));
  const [powerMax, setPowerMax] = useState(String(thresholds?.power?.max ?? 2000));

  useEffect(() => {
    setVoltageMin(String(thresholds?.voltage?.min ?? 200));
    setVoltageMax(String(thresholds?.voltage?.max ?? 250));
    setCurrentMax(String(thresholds?.current?.max ?? 10));
    setPowerMax(String(thresholds?.power?.max ?? 2000));
  }, [thresholds]);

  const handleSaveThresholds = async () => {
    const nextThresholds = {
      voltage: {
        min: Number(voltageMin),
        max: Number(voltageMax),
      },
      current: {
        max: Number(currentMax),
      },
      power: {
        max: Number(powerMax),
      },
    };

    if (
      Number.isNaN(nextThresholds.voltage.min)
      || Number.isNaN(nextThresholds.voltage.max)
      || Number.isNaN(nextThresholds.current.max)
      || Number.isNaN(nextThresholds.power.max)
    ) {
      Alert.alert('Invalid values', 'Please enter valid numeric thresholds.');
      return;
    }

    if (nextThresholds.voltage.min >= nextThresholds.voltage.max) {
      Alert.alert('Invalid voltage range', 'Voltage min must be less than voltage max.');
      return;
    }

    if (!onSaveThresholds) {
      setIsEditing(false);
      return;
    }

    const result = await onSaveThresholds(nextThresholds);
    if (!result?.success) {
      Alert.alert('Unable to save thresholds', result?.error || 'Please try again.');
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
                <Text style={styles.inputLabel}>Power Max (W)</Text>
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
          </View>
        )}
      </View>
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