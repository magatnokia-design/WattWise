import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { getSafetyStageConfig, SAFETY_STAGES } from '../utils/safetyHelpers';
import SafetyPulse from './SafetyPulse';

/**
 * Current status, compact (Oct 2026): the stage on one line and a four-step
 * bar beneath it, each step lit in its own colour - green, amber, orange, red.
 * The icon pulses for Warning, Limit and Cut-off (SafetyPulse).
 */
const SafetyStatusCard = ({ stage, readingsAreStale = false }) => {
  const config = getSafetyStageConfig(stage, readingsAreStale);
  // While readings are stale the stage is not a current fact, so the bar shows
  // no segment rather than lighting the one that was true before the hardware
  // went quiet.
  const gradedStage = config.stale ? null : (stage || 'normal');

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor }]}>
      <View style={styles.content}>
        <SafetyPulse
          color={config.color}
          pulseMs={config.pulseMs}
          stageKey={`${gradedStage}`}
          radius={20}
          spread={{ x: 1.6, y: 1.6 }}
        >
          <View style={[styles.iconContainer, { backgroundColor: config.color }]}>
            <Ionicons name={config.icon} size={22} color={COLORS.white} />
          </View>
        </SafetyPulse>

        <View style={styles.textContainer}>
          <Text style={styles.label}>Current status</Text>
          <Text style={[styles.status, { color: config.textColor }]}>{config.label}</Text>
        </View>
      </View>

      <View style={styles.indicatorBar}>
        {SAFETY_STAGES.map((item) => (
          <View key={item.key} style={styles.step}>
            <View
              style={[
                styles.indicator,
                gradedStage === item.key && { backgroundColor: item.color },
              ]}
            />
            <Text
              style={[
                styles.indicatorLabel,
                gradedStage === item.key && { color: COLORS.text, fontWeight: '700' },
              ]}
            >
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 4,
    padding: 14,
    borderRadius: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  status: {
    fontSize: 19,
    fontWeight: '700',
  },
  indicatorBar: {
    flexDirection: 'row',
    gap: 6,
  },
  step: {
    flex: 1,
    gap: 4,
  },
  indicator: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(7, 27, 44, 0.1)',
  },
  indicatorLabel: {
    fontSize: 10,
    color: COLORS.textLight,
    textAlign: 'center',
  },
});

export default SafetyStatusCard;
