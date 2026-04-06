import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const InsightsCard = ({ insights }) => {
  const getInsightIcon = (type) => {
    switch (type) {
      case 'success':
        return { name: 'checkmark-circle', color: COLORS.success };
      case 'warning':
        return { name: 'warning', color: '#F59E0B' };
      case 'info':
        return { name: 'information-circle', color: COLORS.primary };
      default:
        return { name: 'bulb', color: COLORS.primary };
    }
  };

  if (!insights || insights.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="bulb" size={20} color={COLORS.primary} />
        <Text style={styles.title}>Insights & Suggestions</Text>
      </View>

      <View style={styles.insightsList}>
        {insights.map((insight, index) => {
          const icon = getInsightIcon(insight.type);
          return (
            <View key={index} style={styles.insightItem}>
              <View style={[styles.iconContainer, { backgroundColor: icon.color + '20' }]}>
                <Ionicons name={icon.name} size={20} color={icon.color} />
              </View>
              <View style={styles.insightContent}>
                <Text style={styles.insightText}>{insight.message}</Text>
                {insight.tip && (
                  <Text style={styles.insightTip}>💡 {insight.tip}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  insightsList: {
    gap: 12,
  },
  insightItem: {
    flexDirection: 'row',
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightContent: {
    flex: 1,
  },
  insightText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 4,
  },
  insightTip: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});

export default InsightsCard;