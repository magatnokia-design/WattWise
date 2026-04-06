import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const ComparisonCard = ({ title, currentValue, previousValue, unit, icon, changeData }) => {
  const getChangeColor = () => {
    if (changeData.type === 'increase') return COLORS.error;
    if (changeData.type === 'decrease') return COLORS.success;
    return COLORS.textLight;
  };

  const getChangeIcon = () => {
    if (changeData.type === 'increase') return 'trending-up';
    if (changeData.type === 'decrease') return 'trending-down';
    return 'remove';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon} size={24} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>

      <View style={styles.valuesContainer}>
        {/* Current Month */}
        <View style={styles.valueBlock}>
          <Text style={styles.valueLabel}>Current Month</Text>
          <Text style={styles.currentValue}>
            {unit === '₱' ? unit : ''}{currentValue.toFixed(2)}{unit !== '₱' ? ' ' + unit : ''}
          </Text>
        </View>

        {/* VS Divider */}
        <View style={styles.vsDivider}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        {/* Previous Month */}
        <View style={styles.valueBlock}>
          <Text style={styles.valueLabel}>Previous Month</Text>
          <Text style={styles.previousValue}>
            {unit === '₱' ? unit : ''}{previousValue.toFixed(2)}{unit !== '₱' ? ' ' + unit : ''}
          </Text>
        </View>
      </View>

      {/* Change Indicator */}
      <View style={[styles.changeContainer, { backgroundColor: getChangeColor() + '20' }]}>
        <Ionicons name={getChangeIcon()} size={20} color={getChangeColor()} />
        <Text style={[styles.changeText, { color: getChangeColor() }]}>
          {changeData.type === 'same' ? 'No change' : `${changeData.percentage.toFixed(1)}% ${changeData.type}`}
        </Text>
        {changeData.type !== 'same' && (
          <Text style={[styles.changeAmount, { color: getChangeColor() }]}>
            ({unit === '₱' ? unit : ''}{Math.abs(changeData.difference).toFixed(2)}{unit !== '₱' ? ' ' + unit : ''})
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  valuesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  valueBlock: {
    flex: 1,
    alignItems: 'center',
  },
  valueLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    marginBottom: 6,
  },
  currentValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  previousValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  vsDivider: {
    width: 40,
    alignItems: 'center',
  },
  vsText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textLight,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 6,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  changeAmount: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default ComparisonCard;