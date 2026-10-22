import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { getSafetyStageConfig } from '../utils/safetyHelpers';
import useSafetyStatus from '../hooks/useSafetyStatus';
import SafetyPulse from './SafetyPulse';

/**
 * Power safety at a glance, top-left of the Outlets tab (Oct 2026). Same shape
 * as the Timers button beside it; tapping it opens Power Safety. It takes the
 * stage's colour and pulses for Warning, Limit and Cut-off (see SafetyPulse).
 *
 * Until the first read lands it says "Safety" in grey rather than "Safe" - a
 * verdict it has not read is not one to show.
 */
const SafetyStatusPill = ({ onPress }) => {
  const { stage, stale, loaded } = useSafetyStatus();
  const config = loaded
    ? getSafetyStageConfig(stage, stale)
    : { short: 'Safety', icon: 'shield-outline', color: COLORS.textLight, textColor: COLORS.textLight, bgColor: '#F3F4F6', pulseMs: null };

  return (
    <SafetyPulse
      color={config.color}
      pulseMs={config.pulseMs}
      stageKey={loaded ? `${stage}:${stale}` : 'loading'}
      radius={20}
      spread={{ x: 1.12, y: 1.45 }}
    >
      <TouchableOpacity
        style={[styles.pill, { backgroundColor: config.bgColor }]}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Power safety: ${config.short}. Open Power Safety`}
      >
        <Ionicons name={config.icon} size={18} color={config.color} />
        <Text style={[styles.text, { color: config.textColor }]}>{config.short}</Text>
      </TouchableOpacity>
    </SafetyPulse>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  text: {
    fontWeight: '600',
    fontSize: 14,
  },
});

export default SafetyStatusPill;
