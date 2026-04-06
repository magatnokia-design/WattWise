import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { getSafetyStageConfig } from '../utils/safetyHelpers';

const SafetyStatusCard = ({ stage }) => {
  const config = getSafetyStageConfig(stage);

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor }]}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: config.color }]}>
          <Ionicons name={config.icon} size={32} color={COLORS.white} />
        </View>
        
        <View style={styles.textContainer}>
          <Text style={styles.label}>Current Status</Text>
          <Text style={[styles.status, { color: config.color }]}>
            {config.label}
          </Text>
          <Text style={styles.description}>{config.description}</Text>
        </View>
      </View>

      {/* Status Indicator Bar */}
      <View style={styles.indicatorBar}>
        <View style={[styles.indicator, stage === 'normal' && styles.indicatorActive]} />
        <View style={[styles.indicator, stage === 'warning' && styles.indicatorActive]} />
        <View style={[styles.indicator, stage === 'limit' && styles.indicatorActive]} />
        <View style={[styles.indicator, stage === 'cutoff' && styles.indicatorActive]} />
      </View>
      
      <View style={styles.labelContainer}>
        <Text style={styles.indicatorLabel}>Normal</Text>
        <Text style={styles.indicatorLabel}>Warning</Text>
        <Text style={styles.indicatorLabel}>Limit</Text>
        <Text style={styles.indicatorLabel}>Cut-off</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 20,
    padding: 20,
    borderRadius: 16,
    backgroundColor: COLORS.white,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  status: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 18,
  },
  indicatorBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  indicator: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  indicatorActive: {
    backgroundColor: COLORS.primary,
  },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  indicatorLabel: {
    fontSize: 10,
    color: COLORS.textLight,
  },
});

export default SafetyStatusCard;