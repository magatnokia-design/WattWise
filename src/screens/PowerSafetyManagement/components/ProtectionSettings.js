import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const ProtectionSettings = ({ enabled, onToggle, thresholds }) => {
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
          <TouchableOpacity style={styles.editButton}>
            <Ionicons name="create-outline" size={18} color={COLORS.primary} />
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

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
});

export default ProtectionSettings;